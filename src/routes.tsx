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
  TransfersView,
  TreasuriesView,
  WrapView,
  MultisigView,
  StatsView,
  MultisigAssetsView,
  MultisigProgramsView,
  MultisigMintsView,
  MultisigTreasuryStreams,
  StakingRewardsView,
  AccountsNewView,
} from "./pages";

import { ServiceUnavailableView } from "./pages/service-unavailable";
import TxConfirmationProvider from "./contexts/transaction-status";
import { isLocal, isProd } from "./utils/ui";
import { OnlineStatusProvider } from "./contexts/online-status";
import { IdoLpView } from "./pages/ido-lp";
// import { StakingView } from "./pages/staking";
// import { PolBondsView } from "./pages/pol-bonds";
import { InvestView } from "./pages/invest";
import { UnwrapView } from "./pages/unwrap";

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
                      <Route path='/' element={<Navigate replace to='/accounts' />} />
                      <Route path="/accounts" element={<AccountsNewView />} />
                      <Route path="/accounts/streams" element={<AccountsNewView />} />
                      <Route path="/faucet" element={<FaucetView />} />
                      <Route path="/transfers" element={<TransfersView />} />
                      <Route path="/exchange" element={<SwapView />} />
                      {(isProd() || isLocal()) && (
                        <Route path="/exchange-dcas" element={<ExchangeDcasView />} />
                      )}
                      <Route path="/wrap" element={<WrapView />} />
                      <Route path="/unwrap" element={<UnwrapView />} />
                      {isLocal() && (
                        <Route path="/playground" element={<PlaygroundView />} />
                      )}
                      <Route path="/ido" element={<IdoView />} />
                      <Route path="/ido-live" element={<IdoLiveView />} />
                      <Route path="/ido-blocked" element={<IdoBlockedView />} />
                      <Route path="/ido-lp" element={<IdoLpView />} />
                      <Route path="/invest" element={<InvestView />} />
                      {/* <Route path="/pol-bonds" element={<PolBondsView />} /> */}
                      {/* <Route path="/staking" element={<StakingView />} /> */}
                      <Route path="/staking-rewards" element={<StakingRewardsView />} />
                      <Route path="/stats" element={<StatsView />} />
                      <Route path="/custody" element={<CustodyView />} />
                      <Route path="/treasuries" element={<TreasuriesView />} />
                      <Route path="/treasuries/:id/streams" element={<MultisigTreasuryStreams />} />
                      <Route path="/multisig" element={<MultisigView />} />
                      <Route path="/multisig-mints" element={<MultisigMintsView />} />
                      <Route path="/multisig-assets" element={<MultisigAssetsView />} />
                      <Route path="/multisig-programs" element={<MultisigProgramsView />} />
                      <Route path="/service-unavailable" element={<ServiceUnavailableView />} />
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
