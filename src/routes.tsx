import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PageLoadingView } from 'views';
import { AppLayout } from './components/Layout';
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
} from './pages';
import { ServiceUnavailableView } from './pages/service-unavailable';
import Bridge from 'pages/swap';

const CreateSafeView = React.lazy(() => import('views/CreateSafe'));

export function AppRoutes() {
  return (
    <>
      <AppLayout>
        <Routes>
          <Route index path="/" element={<HomeView />} />
          <Route
            path="/create-safe"
            element={
              <React.Suspense fallback={<PageLoadingView addWrapper={true} />}>
                <CreateSafeView />
              </React.Suspense>
            }
          />
          <Route path="/my-account" element={<HomeView />} />
          {/* <Route path="/exchange" element={<SwapView />} /> */}
          {(isProd() || isLocal()) && <Route path="/exchange-dcas" element={<ExchangeDcasView />} />}
          <Route path="/exchange" element={<Bridge />} />
          <Route path="/stats" element={<StatsView />} />
          <Route path="/faucet" element={<FaucetView />} />
          <Route path="/custody" element={<CustodyView />} />
          <Route path="/playground" element={<PlaygroundView />} />
          <Route path="/staking-rewards" element={<StakingRewardsView />} />
          {/* Assets */}
          <Route path="/assets" element={<HomeView />} />
          <Route path="/assets/:asset" element={<HomeView />} />
          {/* NFTs */}
          <Route path="/nfts/:asset" element={<HomeView />} />
          {/* Well known App routes */}
          <Route path="/vesting" element={<Navigate replace to="/vesting/summary" />} />
          <Route path="/vesting/summary" element={<HomeView />} />
          <Route path="/vesting/contracts" element={<HomeView />} />
          <Route path="/vesting/:vestingContract" element={<HomeView />} />
          <Route path="/vesting/:vestingContract/:activeTab" element={<HomeView />} />
          <Route path="/streaming" element={<HomeView />} />
          <Route path="/streaming/:streamingTab" element={<HomeView />} />
          <Route path="/streaming/:streamingTab/:streamingItemId" element={<HomeView />} />
          <Route path="/super-safe" element={<HomeView />} />
          <Route path="/super-safe/proposals/:id" element={<HomeView />} />
          <Route path="/super-safe/programs/:id" element={<HomeView />} />
          <Route path="/programs/:programId" element={<HomeView />} />
          <Route path="/staking" element={<HomeView />} />
          {/* Apps general route matcher, disabled for now since not really used */}
          {/* <Route path="/:appId" element={<HomeView />} /> */}
          {/* Not found and service unavailable */}
          <Route path="/service-unavailable" element={<ServiceUnavailableView />} />
          <Route path="*" element={<NotFoundView />} />
        </Routes>
      </AppLayout>
    </>
  );
}
