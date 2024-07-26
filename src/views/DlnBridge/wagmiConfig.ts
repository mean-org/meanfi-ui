import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http } from 'wagmi';
import { mainnet, polygon } from 'wagmi/chains';

export const wagmiConfig = getDefaultConfig({
  appName: 'MeanFi Bridge',
  projectId: 'YOUR_PROJECT_ID',
  chains: [mainnet, polygon],
  transports: {
    [mainnet.id]: http(),
    [polygon.id]: http(),
  },
});
