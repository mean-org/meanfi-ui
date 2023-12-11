import { ReactElement, useEffect } from 'react';

import { configureChains, createConfig, WagmiConfig } from 'wagmi';
// import { alchemyProvider } from "wagmi/providers/alchemy";
import { publicProvider } from 'wagmi/providers/public';
import {
  RainbowKitProvider,
  lightTheme,
  darkTheme,
  cssStringFromTheme,
  getDefaultWallets,
} from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { arbitrum, avalanche, base, mainnet, optimism, polygon, zora } from 'viem/chains';

const { chains, publicClient } = configureChains(
  [polygon, mainnet, optimism, avalanche, arbitrum, base, zora],
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
  useEffect(() => console.log('chains:', chains), []);

  return (
    <WagmiConfig config={wagmiConfig}>
      <RainbowKitProvider chains={chains} theme={null} modalSize="compact" showRecentTransactions={true}>
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
