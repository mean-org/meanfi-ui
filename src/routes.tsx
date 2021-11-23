import { BrowserRouter, Redirect, Route, Switch } from "react-router-dom";
import { ProtectedRoute, ProtectedRouteProps } from "./guards/ProtectedRoute";
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
  IdoView,
  NotFoundView,
  PayrollView,
  PlaygroundView,
  SwapView,
  TransfersView,
  WrapView
} from "./pages";
import { ProcessReferals } from "./guards";
import { ServiceUnavailableView } from "./pages/service-unavailable";
import TransactionStatusProvider from "./contexts/transaction-status";
import { isLocal, isProd } from "./utils/ui";
import { OnlineStatusProvider } from "./contexts/online-status";

export function Routes() {

  const defaultProtectedRouteProps: ProtectedRouteProps = {
    authenticationPath: '/',
  };

  return (
    <>
    <OnlineStatusProvider>
      <BrowserRouter basename={"/"}>
        <ConnectionProvider>
          <WalletProvider>
            <AccountsProvider>
              <TransactionStatusProvider>
                <AppStateProvider>
                  <AppLayout>
                    <Switch>
                      <Route exact path="/">
                        <Redirect to="/accounts" />
                      </Route>
                      <Route exact path="/accounts" children={<AccountsView />} />
                      <Route exact path="/accounts/streams" children={<AccountsView />} />
                      <Route exact path="/faucet" children={<FaucetView />} />
                      <Route exact path="/transfers" children={<TransfersView />} />
                      <Route exact path="/payroll" children={<PayrollView />} />
                      <Route exact path="/exchange" children={<SwapView />} />
                      {(isProd() || isLocal()) && (
                        <Route exact path="/exchange-dcas" children={<ExchangeDcasView />} />
                      )}
                      <Route exact path="/wrap" children={<WrapView />} />
                      {isLocal() && (
                        <Route exact path="/playground" children={<PlaygroundView />} />
                      )}
                      <Route exact path="/custody" children={<CustodyView />} />
                      <Route exact path="/referrals">
                        <Redirect to="/accounts" />
                      </Route>
                      <Route exact path="/referrals/:address" component={ProcessReferals} />
                      <Route exact path="/service-unavailable" component={ServiceUnavailableView} />
                      <ProtectedRoute {...defaultProtectedRouteProps} path='/ido' component={IdoView} />
                      <Route component={NotFoundView} />
                    </Switch>
                  </AppLayout>
                </AppStateProvider>
              </TransactionStatusProvider>
            </AccountsProvider>
          </WalletProvider>
        </ConnectionProvider>
      </BrowserRouter>
    </OnlineStatusProvider>
    </>
  );
}
