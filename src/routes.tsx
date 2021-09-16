import { BrowserRouter, Redirect, Route, Switch } from "react-router-dom";
import { environment } from "./environments/environment";
import { ConnectionProvider } from "./contexts/connection";
import { AccountsProvider } from "./contexts/accounts";
import { WalletProvider } from "./contexts/wallet";
import AppStateProvider from "./contexts/appstate";
import { AppLayout } from "./components/Layout";
import {
  AccountsView,
  CustodyView,
  FaucetView,
  PayrollView,
  SwapView,
  TransfersView,
  WrapView
} from "./pages";

export function Routes() {
  return (
    <>
      <BrowserRouter basename={"/"}>
        <ConnectionProvider>
          <WalletProvider>
            <AccountsProvider>
                <AppStateProvider>
                  <AppLayout>
                    <Switch>
                      {/* <Route path="/" component={() => <HomeView />} /> */}
                      <Route exact path="/">
                        <Redirect to="/accounts" />
                      </Route>
                      <Route exact path="/accounts" children={<AccountsView />} />
                      <Route exact path="/faucet" children={<FaucetView />} />
                      <Route exact path="/transfers" children={<TransfersView />} />
                      <Route exact path="/payroll" children={<PayrollView />} />
                      <Route exact path="/swap" children={<SwapView />} />
                      <Route exact path="/wrap" children={<WrapView />} />
                      <Route exact path="/custody" children={<CustodyView />} />
                      <Route path="*">
                        {/* TODO: Create a decent 404 page */}
                        <Redirect to="/" />
                      </Route>
                    </Switch>
                  </AppLayout>
                </AppStateProvider>
            </AccountsProvider>
          </WalletProvider>
        </ConnectionProvider>
      </BrowserRouter>
    </>
  );
}
