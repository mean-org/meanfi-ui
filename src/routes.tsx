import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { NotFoundView } from 'src/pages/404';
import { CustodyView } from 'src/pages/custody';
import { ExchangeDcasView } from 'src/pages/exchange-dcas';
import { FaucetView } from 'src/pages/faucet';
import { HomeView } from 'src/pages/home';
import { PlaygroundView } from 'src/pages/playground';
import { ServiceUnavailableView } from 'src/pages/service-unavailable';
import { StakingRewardsView } from 'src/pages/staking-rewards';
import { StatsView } from 'src/pages/stats';
import Bridge from 'src/pages/swap';
import { PageLoadingView } from 'src/views/PageLoading';
import { AppLayout } from './components/Layout';

const CreateSafeView = React.lazy(() => import('src/views/CreateSafe'));

export function AppRoutes() {
  return (
    <AppLayout>
      <Routes>
        <Route index path='/' element={<HomeView />} />
        <Route
          path='/create-safe'
          element={
            <React.Suspense fallback={<PageLoadingView addWrapper={true} />}>
              <CreateSafeView />
            </React.Suspense>
          }
        />
        <Route path='/my-account' element={<HomeView />} />
        <Route path='/exchange' element={<Bridge />} />
        <Route path='/exchange-dcas' element={<ExchangeDcasView />} />
        <Route path='/stats' element={<StatsView />} />
        <Route path='/faucet' element={<FaucetView />} />
        <Route path='/custody' element={<CustodyView />} />
        <Route path='/playground' element={<PlaygroundView />} />
        <Route path='/staking-rewards' element={<StakingRewardsView />} />
        <Route path='/assets' element={<HomeView />} />
        <Route path='/assets/:asset' element={<HomeView />} />
        <Route path='/vesting' element={<Navigate replace to='/vesting/summary' />} />
        <Route path='/vesting/summary' element={<HomeView />} />
        <Route path='/vesting/contracts' element={<HomeView />} />
        <Route path='/vesting/:vestingContract' element={<HomeView />} />
        <Route path='/vesting/:vestingContract/:activeTab' element={<HomeView />} />
        <Route path='/streaming' element={<HomeView />} />
        <Route path='/streaming/:streamingTab' element={<HomeView />} />
        <Route path='/streaming/:streamingTab/:streamingItemId' element={<HomeView />} />
        <Route path='/super-safe' element={<HomeView />} />
        <Route path='/super-safe/proposals/:id' element={<HomeView />} />
        <Route path='/super-safe/programs/:id' element={<HomeView />} />
        <Route path='/programs/:programId' element={<HomeView />} />
        <Route path='/staking' element={<HomeView />} />
        <Route path='/service-unavailable' element={<ServiceUnavailableView />} />
        <Route path='*' element={<NotFoundView />} />
      </Routes>
    </AppLayout>
  );
}
