import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { PageLoadingView } from "views";
import { AppLayout } from "./components/Layout";
import { AccountsProvider } from "./contexts/accounts";
import AppStateProvider from "./contexts/appstate";
import { ConnectionProvider } from "./contexts/connection";
import { OnlineStatusProvider } from "./contexts/online-status";
import TxConfirmationProvider from "./contexts/transaction-status";
import { WalletProvider } from "./contexts/wallet";
import { isLocal, isProd } from "./middleware/ui";
import {
  AccountsView,
  CustodyView,
  ExchangeDcasView,
  FaucetView,
  NotFoundView,
  PlaygroundView,
  StakingRewardsView,
  StatsView,
  SwapView,
  VestingView
} from "./pages";
import { ServiceUnavailableView } from "./pages/service-unavailable";
import { StakingView } from "./pages/staking";

const CreateSafeView = React.lazy(() => import('views/CreateSafe'));

export function AppRoutes() {

  return (
    <>
      <OnlineStatusProvider>
        <BrowserRouter basename={"/"}>
          <ConnectionProvider>
            <WalletProvider>
              <AccountsProvider>
                <TxConfirmationProvider>
                  <AppStateProvider>
                    <AppLayout>
                      <Routes>
                        <Route path="/" element={<Navigate replace to='/accounts' />} />
                        {/* CreateSafeView */}
                        <Route
                          path="/create-safe"
                          element={
                            <React.Suspense fallback={<PageLoadingView addWrapper={true} />}>
                              <CreateSafeView />
                            </React.Suspense>
                          }
                        />
                        {/* Accounts routes */}
                        <Route path="/accounts" element={<AccountsView />} />
                        <Route path="/accounts/assets" element={<AccountsView />} />
                        <Route path="/accounts/assets/:asset" element={<AccountsView />} />
                        <Route path="/accounts/streaming" element={<AccountsView />} />
                        <Route path="/accounts/streaming/:streamingTab" element={<AccountsView />} />
                        <Route path="/accounts/streaming/:streamingTab/:streamingItemId" element={<AccountsView />} />
                        <Route path="/accounts/super-safe" element={<AccountsView />} />
                        <Route path="/accounts/super-safe/proposals/:id" element={<AccountsView />} />
                        <Route path="/accounts/super-safe/programs/:id" element={<AccountsView />} />
                        {/* Vesting routes */}
                        <Route path="/vesting" element={<VestingView />} />
                        <Route path="/vesting/:vestingContract" element={<VestingView />} />
                        <Route path="/vesting/:vestingContract/:activeTab" element={<VestingView />} />
                        {/* Exchange */}
                        <Route path="/exchange" element={<SwapView />} />
                        {(isProd() || isLocal()) && (
                          <Route path="/exchange-dcas" element={<ExchangeDcasView />} />
                        )}
                        {/* All others */}
                        <Route path="/staking" element={<StakingView />} />
                        <Route path="/staking-rewards" element={<StakingRewardsView />} />
                        <Route path="/stats" element={<StatsView />} />
                        <Route path="/custody" element={<CustodyView />} />
                        <Route path="/faucet" element={<FaucetView />} />
                        <Route path="/service-unavailable" element={<ServiceUnavailableView />} />
                        <Route path="/playground" element={<PlaygroundView />} />
                        <Route path='*' element={<NotFoundView />} />
                      </Routes>
                    </AppLayout>
                  </AppStateProvider>
                </TxConfirmationProvider>
              </AccountsProvider>
            </WalletProvider>
          </ConnectionProvider>
        </BrowserRouter>
      </OnlineStatusProvider>
    </>
  );
}
