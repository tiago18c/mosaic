'use client';
import { type ClusterUrl, devnet } from 'gill';
import { createContext } from 'react';

export type ChainContextType = Readonly<{
  chain: `solana:${string}`;
  displayName: string;
  setChain?(chain: `solana:${string}`): void;
  solanaExplorerClusterName: 'devnet' | 'mainnet-beta' | 'testnet';
  solanaRpcSubscriptionsUrl: ClusterUrl;
  solanaRpcUrl: ClusterUrl;
}>;

export const DEFAULT_CHAIN_CONFIG = Object.freeze({
  chain: 'solana:devnet',
  displayName: 'Devnet',
  solanaExplorerClusterName: 'devnet',
  solanaRpcSubscriptionsUrl: devnet('wss://api.devnet.solana.com'),
  solanaRpcUrl: devnet('https://api.devnet.solana.com'),
});

export const ChainContext =
  createContext<ChainContextType>(DEFAULT_CHAIN_CONFIG);
