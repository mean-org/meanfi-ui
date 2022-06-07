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
  MultisigView,
  StatsView,
  MultisigAssetsView,
  MultisigProgramsView,
  MultisigMintsView,
  MultisigTreasuryStreams,
  StakingRewardsView,
  AccountsNewView,
  SafeView,
} from "./pages";

import { ServiceUnavailableView } from "./pages/service-unavailable";
import TxConfirmationProvider from "./contexts/transaction-status";
import { isLocal, isProd } from "./utils/ui";
import { OnlineStatusProvider } from "./contexts/online-status";
import { IdoLpView } from "./pages/ido-lp";
import { InvestView } from "./pages/invest";

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
                      {/* Accounts detailed deep-linking */}
                      <Route path="/accounts" element={<AccountsNewView />} />
                      <Route path="/accounts/:address" element={<AccountsNewView />} />
                      <Route path="/accounts/:address/assets" element={<AccountsNewView />} />
                      <Route path="/accounts/:address/assets/:asset" element={<AccountsNewView />} />
                      <Route path="/accounts/:address/msigs" element={<AccountsNewView />} />
                      <Route path="/accounts/:address/msigs/:asset" element={<AccountsNewView />} />
                      {/* Streams routes (under refactor) */}
                      <Route path="/accounts/streams" element={<AccountsNewView />} />
                      {/* Exchange */}
                      <Route path="/exchange" element={<SwapView />} />
                      {(isProd() || isLocal()) && (
                        <Route path="/exchange-dcas" element={<ExchangeDcasView />} />
                      )}
                      {/* Deprecated routes (still active) */}
                      <Route path="/transfers" element={<TransfersView />} />
                      <Route path="/faucet" element={<FaucetView />} />
                      {/* IDO */}
                      <Route path="/ido" element={<IdoView />} />
                      <Route path="/ido-live" element={<IdoLiveView />} />
                      <Route path="/ido-blocked" element={<IdoBlockedView />} />
                      <Route path="/ido-lp" element={<IdoLpView />} />
                      {/* All others */}
                      <Route path="/invest" element={<InvestView />} />
                      <Route path="/invest/:investItem" element={<InvestView />} />
                      <Route path="/staking-rewards" element={<StakingRewardsView />} />
                      <Route path="/stats" element={<StatsView />} />
                      <Route path="/custody" element={<CustodyView />} />
                      <Route path="/treasuries" element={<TreasuriesView />} />
                      <Route path="/treasuries/:id/streams" element={<MultisigTreasuryStreams />} />
                      <Route path="/multisig-old" element={<MultisigView />} />
                      <Route path="/multisig" element={<SafeView />} />
                      <Route path="/multisig/:address" element={<SafeView />} />
                      <Route path="/multisig/:address/proposals/:id" element={<SafeView />} />
                      <Route path="/multisig/:address/programs/:id" element={<SafeView />} />
                      <Route path="/multisig-mints" element={<MultisigMintsView />} />
                      <Route path="/multisig-assets" element={<MultisigAssetsView />} />
                      <Route path="/multisig-programs" element={<MultisigProgramsView />} />
                      <Route path="/service-unavailable" element={<ServiceUnavailableView />} />
                      {/* Playgraund route for POC and testing purposes */}
                      {!isProd() && (
                        <Route path="/playground" element={<PlaygroundView />} />
                      )}
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
