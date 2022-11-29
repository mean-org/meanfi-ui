import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { PageLoadingView } from 'views';
import { AppLayout } from './components/Layout';
import { AccountsProvider } from './contexts/accounts';
import AppStateProvider from './contexts/appstate';
import { ConnectionProvider } from './contexts/connection';
import { OnlineStatusProvider } from './contexts/online-status';
import TxConfirmationProvider from './contexts/transaction-status';
import { MeanFiWalletProvider } from './contexts/wallet';
import { isLocal, isProd } from './middleware/ui';
import {
  CustodyView,
  ExchangeDcasView,
  FaucetView,
  HomeView,
  NotFoundView,
  PlaygroundView,
  StakingRewardsView,
  StatsView,
  SwapView
} from './pages';
import { ServiceUnavailableView } from './pages/service-unavailable';

const CreateSafeView = React.lazy(() => import('views/CreateSafe'));

export function AppRoutes() {
  return (
    <>
      <OnlineStatusProvider>
        <BrowserRouter basename={'/'}>
          <ConnectionProvider>
            <MeanFiWalletProvider>
              <AccountsProvider>
                <TxConfirmationProvider>
                  <AppStateProvider>
                    <AppLayout>
                      <Routes>
                        <Route index path="/" element={<HomeView />} />
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
                        <Route path="/my-account" element={<HomeView />} />
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
                        <Route path="/assets" element={<HomeView />} />
                        <Route
                          path="/assets/:asset"
                          element={<HomeView />}
                        />
                        {/* Well known App routes */}
                        <Route
                          path="/vesting"
                          element={<Navigate replace to="/vesting/summary" />}
                        />
                        <Route
                          path="/vesting/summary"
                          element={<HomeView />}
                        />
                        <Route
                          path="/vesting/contracts"
                          element={<HomeView />}
                        />
                        <Route
                          path="/vesting/:vestingContract"
                          element={<HomeView />}
                        />
                        <Route
                          path="/vesting/:vestingContract/:activeTab"
                          element={<HomeView />}
                        />
                        <Route path="/streaming" element={<HomeView />} />
                        <Route
                          path="/streaming/:streamingTab"
                          element={<HomeView />}
                        />
                        <Route
                          path="/streaming/:streamingTab/:streamingItemId"
                          element={<HomeView />}
                        />
                        <Route path="/super-safe" element={<HomeView />} />
                        <Route
                          path="/super-safe/proposals/:id"
                          element={<HomeView />}
                        />
                        <Route
                          path="/super-safe/programs/:id"
                          element={<HomeView />}
                        />
                        <Route
                          path="/programs/:programId"
                          element={<HomeView />}
                        />
                        <Route path="/staking" element={<HomeView />} />
                        {/* Apps general route matcher */}
                        <Route path="/:appId" element={<HomeView />} />
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
            </MeanFiWalletProvider>
          </ConnectionProvider>
        </BrowserRouter>
      </OnlineStatusProvider>
    </>
  );
}
