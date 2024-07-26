import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import type { Config } from '@wagmi/core';
import { arbitrum, base, mainnet, optimism, polygon } from 'wagmi/chains';

export const wagmiConfig: Config = getDefaultConfig({
  appName: 'MeanFi Bridge',
  projectId: 'YOUR_PROJECT_ID',
  chains: [mainnet, polygon, optimism, arbitrum, base],
});
