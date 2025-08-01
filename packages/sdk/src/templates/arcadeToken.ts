import { Token } from '../issuance';
import type {
  Rpc,
  Address,
  SolanaRpcApi,
  FullTransaction,
  TransactionMessageWithFeePayer,
  TransactionVersion,
  TransactionSigner,
  TransactionWithBlockhashLifetime,
} from 'gill';
import { createNoopSigner, createTransaction } from 'gill';
import { getCreateConfigInstructions } from '../ebalts/createConfig';
import { ABL_PROGRAM_ID } from '../abl/utils';
import { getSetGatingProgramInstructions } from '../ebalts/setGatingProgram';
import { getEnablePermissionlessThawInstructions } from '../ebalts/enablePermissionlessThaw';
import { getCreateListInstructions } from '../abl/list';
import { getSetExtraMetasInstructions } from '../abl/setExtraMetas';
import { Mode } from '@mosaic/abl';

/**
 * Creates a transaction to initialize a new arcade token mint on Solana with common arcade token features.
 *
 * This function configures the mint with metadata, pausable functionality, default account state,
 * confidential balances, and a permanent delegate. It returns a transaction ready to be signed and sent to the network.
 * Arcade tokens are close loop tokens that have an explicit allowlist.
 *
 * @param rpc - The Solana RPC client instance.
 * @param name - The name of the arcade token.
 * @param symbol - The symbol of the arcade token.
 * @param decimals - The number of decimals for the arcade token.
 * @param uri - The URI pointing to the arcade token's metadata.
 * @param mintAuthority - The address with authority over the mint.
 * @param mint - The address of the mint account to initialize.
 * @param feePayer - The address that will pay the transaction fees.
 * @param metadataAuthority - The address with authority over the metadata.
 * @param pausableAuthority - The address with authority over the pausable functionality.
 * @param confidentialBalancesAuthority - The address with authority over the confidential balances extension.
 * @param permanentDelegateAuthority - The address with authority over the permanent delegate.
 * @returns A promise that resolves to a FullTransaction object for initializing the arcade token mint.
 */
export const createArcadeTokenInitTransaction = async (
  rpc: Rpc<SolanaRpcApi>,
  name: string,
  symbol: string,
  decimals: number,
  uri: string,
  mintAuthority: Address,
  mint: Address | TransactionSigner<string>,
  feePayer: Address | TransactionSigner<string>,
  metadataAuthority?: Address,
  pausableAuthority?: Address,
  confidentialBalancesAuthority?: Address,
  permanentDelegateAuthority?: Address
): Promise<
  FullTransaction<
    TransactionVersion,
    TransactionMessageWithFeePayer,
    TransactionWithBlockhashLifetime
  >
> => {
  const mintSigner = typeof mint === 'string' ? createNoopSigner(mint) : mint;
  const feePayerSigner =
    typeof feePayer === 'string' ? createNoopSigner(feePayer) : feePayer;
  const instructions = await new Token()
    .withMetadata({
      mintAddress: mintSigner.address,
      authority: metadataAuthority || mintAuthority,
      metadata: {
        name,
        symbol,
        uri,
      },
      // TODO: add additional metadata
      additionalMetadata: new Map(),
    })
    .withPausable(pausableAuthority || mintAuthority)
    .withDefaultAccountState(false)
    .withConfidentialBalances(confidentialBalancesAuthority || mintAuthority)
    .withPermanentDelegate(permanentDelegateAuthority || mintAuthority)
    .buildInstructions({
      rpc,
      decimals,
      authority: mintAuthority,
      mint: mintSigner,
      feePayer: feePayerSigner,
    });

  // 2. create mintConfig (ebalts)
  if (mintAuthority !== feePayerSigner.address) {
    // Get latest blockhash for transaction
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    return createTransaction({
      feePayer,
      version: 'legacy',
      latestBlockhash,
      instructions,
    });
  }

  const { instructions: createConfigInstructions } =
    await getCreateConfigInstructions({
      authority: feePayerSigner,
      mint: mintSigner.address,
      gatingProgram: ABL_PROGRAM_ID,
    });

  // 3. set gating program to ABL (ebalts)
  const setGatingProgramInstructions = await getSetGatingProgramInstructions({
    authority: feePayerSigner,
    mint: mintSigner.address,
    gatingProgram: ABL_PROGRAM_ID,
  });

  // 4. enable permissionless thaw (Ebalts)
  const enablePermissionlessThawInstructions =
    await getEnablePermissionlessThawInstructions({
      authority: feePayerSigner,
      mint: mintSigner.address,
    });

  // 5. create list (abl)
  const { instructions: createListInstructions, listConfig } =
    await getCreateListInstructions({
      authority: feePayerSigner,
      mint: mintSigner.address,
      mode: Mode.Allow,
    });

  // 6. set extra metas (abl): this is how we can change the list associated with a given mint
  const setExtraMetasInstructions = await getSetExtraMetasInstructions({
    authority: feePayerSigner,
    mint: mintSigner.address,
    list: listConfig,
  });

  instructions.push(...createConfigInstructions);
  instructions.push(...setGatingProgramInstructions);
  instructions.push(...enablePermissionlessThawInstructions);
  instructions.push(...createListInstructions);
  instructions.push(...setExtraMetasInstructions);

  // Get latest blockhash for transaction
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  return createTransaction({
    feePayer,
    version: 'legacy',
    latestBlockhash,
    instructions,
  });
};
