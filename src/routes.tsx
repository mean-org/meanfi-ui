import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ConnectionProvider } from "./contexts/connection";
import { AccountsProvider } from "./contexts/accounts";
import { WalletProvider } from "./contexts/wallet";
import AppStateProvider from "./contexts/appstate";
import { AppLayout } from "./components/Layout";
import {
  CustodyView,
  ExchangeDcasView,
  FaucetView,
  IdoBlockedView,
  IdoLiveView,
  IdoView,
  NotFoundView,
  PlaygroundView,
  SwapView,
  StatsView,
  StakingRewardsView,
  AccountsView,
  VestingView,
} from "./pages";

import { ServiceUnavailableView } from "./pages/service-unavailable";
import TxConfirmationProvider from "./contexts/transaction-status";
import { isLocal, isProd } from "./middleware/ui";
import { OnlineStatusProvider } from "./contexts/online-status";
import { IdoLpView } from "./pages/ido-lp";
import { StakingView } from "./pages/staking";

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
                      {/* IDO */}
                      <Route path="/ido" element={<IdoView />} />
                      <Route path="/ido-live" element={<IdoLiveView />} />
                      <Route path="/ido-blocked" element={<IdoBlockedView />} />
                      <Route path="/ido-lp" element={<IdoLpView />} />
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
