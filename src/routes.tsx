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
  ExchangeDcasView,
  FaucetView,
  NotFoundView,
  PayrollView,
  PlaygroundView,
  SwapView,
  TransfersView,
  WrapView
} from "./pages";
import { ProcessReferals } from "./guards";
import { ServiceUnavailableView } from "./pages/service-unavailable";

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
                      <Route exact path="/exchange" children={<SwapView />} />
                      <Route exact path="/exchange-dcas" children={<ExchangeDcasView />} />
                      <Route exact path="/wrap" children={<WrapView />} />
                      {environment === 'local' && (
                        <Route exact path="/playground" children={<PlaygroundView />} />
                      )}
                      <Route exact path="/custody" children={<CustodyView />} />
                      <Route exact path="/referrals">
                        <Redirect to="/accounts" />
                      </Route>
                      <Route exact path="/referrals/:address" component={ProcessReferals} />
                      <Route exact path="/service-unavailable" component={ServiceUnavailableView} />
                      <Route component={NotFoundView} />
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
