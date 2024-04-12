import type { ReactElement } from 'react';

import {
  RainbowKitProvider,
  cssStringFromTheme,
  darkTheme,
  getDefaultWallets,
  lightTheme,
} from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { mainnet, polygon } from 'viem/chains';
import { WagmiConfig, configureChains, createConfig } from 'wagmi';
// import { alchemyProvider } from "wagmi/providers/alchemy";
import { publicProvider } from 'wagmi/providers/public';

const { chains, publicClient } = configureChains(
  [mainnet, polygon],
  // [alchemyProvider({ apiKey: process.env.ALCHEMY_ID }), publicProvider()]
  [publicProvider()],
);

const { connectors } = getDefaultWallets({
  appName: 'MeanFi Bridge',
  projectId: 'YOUR_PROJECT_ID',
  chains,
});

const wagmiConfig = createConfig({
  autoConnect: false,
  connectors,
  publicClient,
});

type Props = {
  children: React.ReactNode;
};

export function Web3Container({ children }: Props): ReactElement {
  return (
    <WagmiConfig config={wagmiConfig}>
      <RainbowKitProvider chains={chains} theme={null} modalSize='compact' showRecentTransactions={true}>
        <style
          dangerouslySetInnerHTML={{
            __html: `
            :root {
              ${cssStringFromTheme(lightTheme)}
            }

            html[data-theme='dark'] {
              ${cssStringFromTheme(darkTheme, {
                extends: lightTheme,
              })}
            }
          `,
          }}
        />
        {children}
      </RainbowKitProvider>
    </WagmiConfig>
  );
}
