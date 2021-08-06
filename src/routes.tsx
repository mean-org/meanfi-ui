import { BrowserRouter, Route, Switch } from "react-router-dom";
import { ConnectionProvider } from "./contexts/connection";
import { AccountsProvider } from "./contexts/accounts";
import { WalletProvider } from "./contexts/wallet";
import { MarketProvider } from "./contexts/market";
import AppStateProvider from "./contexts/appstate";
import { AppLayout } from "./components/Layout";
import { FaucetView, HomeView, StreamsView, TransfersView } from "./views";

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
                      <Route exact path="/streams" children={<StreamsView />} />
                      <Route exact path="/transfers" children={<TransfersView />} />
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
