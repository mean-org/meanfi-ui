import { BrowserRouter, Route, Switch } from "react-router-dom";
import { WalletProvider } from "./contexts/wallet";
import { ConnectionProvider } from "./contexts/connection";
import { AccountsProvider } from "./contexts/accounts";
import { MarketProvider } from "./contexts/market";
import { AppLayout } from "./components/Layout";
import { FaucetView, HomeView } from "./views";
import AppStateProvider from "./contexts/appstate";

export function Routes() {
  return (
    <>
      <BrowserRouter basename={"/"}>
        <ConnectionProvider>
          <WalletProvider>
            <AccountsProvider>
              <MarketProvider>
                <AppStateProvider>
                  <AppLayout>
                      <Switch>
                        <Route exact path="/" component={() => <HomeView />} />
                        <Route exact path="/faucet" children={<FaucetView />} />
                      </Switch>
                  </AppLayout>
                </AppStateProvider>
              </MarketProvider>
            </AccountsProvider>
          </WalletProvider>
        </ConnectionProvider>
      </BrowserRouter>
    </>
  );
}
