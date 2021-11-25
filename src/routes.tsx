import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
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
import { ServiceUnavailableView } from "./pages/service-unavailable";
import TransactionStatusProvider from "./contexts/transaction-status";
import { isLocal, isProd } from "./utils/ui";
import { OnlineStatusProvider } from "./contexts/online-status";

export function AppRoutes() {

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
                    <Routes>
                      <Route path='/' element={<Navigate replace to='/accounts' />} />
                      <Route path="/accounts" element={<AccountsView />} />
                      <Route path="/accounts/streams" element={<AccountsView />} />
                      <Route path="/faucet" element={<FaucetView />} />
                      <Route path="/transfers" element={<TransfersView />} />
                      <Route path="/payroll" element={<PayrollView />} />
                      <Route path="/exchange" element={<SwapView />} />
                      {(isProd() || isLocal()) && (
                        <Route path="/exchange-dcas" element={<ExchangeDcasView />} />
                      )}
                      <Route path="/wrap" element={<WrapView />} />
                      {isLocal() && (
                        <Route path="/playground" element={<PlaygroundView />} />
                      )}
                      <Route path="/ido" element={<IdoView />} />
                      <Route path="/custody" element={<CustodyView />} />
                      <Route path="/service-unavailable" element={<ServiceUnavailableView />} />
                      <Route path='*' element={<NotFoundView />} />
                    </Routes>
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
