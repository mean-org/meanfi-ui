import { RainbowKitProvider, darkTheme, lightTheme } from '@rainbow-me/rainbowkit';
import { AppStateContext } from 'contexts/appstate';
import { type ReactElement, useContext } from 'react';
import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from './wagmiConfig';

type Props = {
  children: React.ReactNode;
};

export function Web3Container({ children }: Props): ReactElement {
  const { theme } = useContext(AppStateContext);

  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider
        theme={theme === 'light' ? lightTheme() : darkTheme()}
        modalSize='compact'
        showRecentTransactions={true}
      >
        {/* <style
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
        /> */}
        {children}
      </RainbowKitProvider>
    </WagmiProvider>
  );
}
