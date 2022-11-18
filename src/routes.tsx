import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { PageLoadingView } from 'views';
import { AppLayout } from './components/Layout';
import { AccountsProvider } from './contexts/accounts';
import AppStateProvider from './contexts/appstate';
import { ConnectionProvider } from './contexts/connection';
import { OnlineStatusProvider } from './contexts/online-status';
import TxConfirmationProvider from './contexts/transaction-status';
import { WalletProvider } from './contexts/wallet';
import { isLocal, isProd } from './middleware/ui';
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
} from './pages';
import { ServiceUnavailableView } from './pages/service-unavailable';

const CreateSafeView = React.lazy(() => import('views/CreateSafe'));

export function AppRoutes() {
  return (
    <>
      <OnlineStatusProvider>
        <BrowserRouter basename={'/'}>
          <ConnectionProvider>
            <WalletProvider>
              <AccountsProvider>
                <TxConfirmationProvider>
                  <AppStateProvider>
                    <AppLayout>
                      <Routes>
                        <Route index path="/" element={<AccountsView />} />
                        <Route
                          path="/create-safe"
                          element={
                            <React.Suspense
                              fallback={<PageLoadingView addWrapper={true} />}
                            >
                              <CreateSafeView />
                            </React.Suspense>
                          }
                        />
                        <Route path="/my-account" element={<AccountsView />} />
                        <Route path="/exchange" element={<SwapView />} />
                        {(isProd() || isLocal()) && (
                          <Route
                            path="/exchange-dcas"
                            element={<ExchangeDcasView />}
                          />
                        )}
                        <Route path="/stats" element={<StatsView />} />
                        <Route path="/faucet" element={<FaucetView />} />
                        <Route path="/custody" element={<CustodyView />} />
                        <Route
                          path="/playground"
                          element={<PlaygroundView />}
                        />
                        <Route
                          path="/staking-rewards"
                          element={<StakingRewardsView />}
                        />
                        {/* Assets and NFTs */}
                        <Route path="/assets" element={<AccountsView />} />
                        <Route
                          path="/assets/:asset"
                          element={<AccountsView />}
                        />
                        {/* Well known App routes */}
                        <Route
                          path="/vesting"
                          element={<Navigate replace to="/vesting/summary" />}
                        />
                        <Route
                          path="/vesting/summary"
                          element={<AccountsView />}
                        />
                        <Route
                          path="/vesting/contracts"
                          element={<AccountsView />}
                        />
                        <Route
                          path="/vesting/:vestingContract"
                          element={<AccountsView />}
                        />
                        <Route
                          path="/vesting/:vestingContract/:activeTab"
                          element={<AccountsView />}
                        />
                        <Route path="/streaming" element={<AccountsView />} />
                        <Route
                          path="/streaming/:streamingTab"
                          element={<AccountsView />}
                        />
                        <Route
                          path="/streaming/:streamingTab/:streamingItemId"
                          element={<AccountsView />}
                        />
                        <Route path="/super-safe" element={<AccountsView />} />
                        <Route
                          path="/super-safe/proposals/:id"
                          element={<AccountsView />}
                        />
                        <Route
                          path="/super-safe/programs/:id"
                          element={<AccountsView />}
                        />
                        <Route
                          path="/programs/:programId"
                          element={<AccountsView />}
                        />
                        <Route path="/staking" element={<AccountsView />} />
                        {/* Apps general route matcher */}
                        <Route path="/:appId" element={<AccountsView />} />
                        {/* Not found and service unavailable */}
                        <Route
                          path="/service-unavailable"
                          element={<ServiceUnavailableView />}
                        />
                        <Route path="*" element={<NotFoundView />} />
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
