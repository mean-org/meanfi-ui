import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import './style.scss';
import { Row, Col, Divider } from "antd";
import { useTranslation } from 'react-i18next';
import { isDesktop } from "react-device-detect";
import { PreFooter } from "../../components/PreFooter";
import { getNetworkIdByCluster, useConnection, useConnectionConfig } from '../../contexts/connection';
import { useWallet } from "../../contexts/wallet";
import { AppStateContext } from "../../contexts/appstate";
import { IconLoading, IconStats } from "../../Icons";
import { IconHelpCircle } from "../../Icons/IconHelpCircle";
import useWindowSize from '../../hooks/useWindowResize';
import { ConfirmOptions, PublicKey } from "@solana/web3.js";
import { Env, StakePoolInfo, StakingClient } from "@mean-dao/staking";
import { StakeTabView } from "../../views/StakeTabView";
import { UnstakeTabView } from "../../views/UnstakeTabView";
import { useAccountsContext, useNativeAccount } from "../../contexts/accounts";
import { TokenInfo } from "models/SolanaTokenInfo";
import { MEAN_TOKEN_LIST } from "../../constants/tokens";
import { InfoIcon } from "../../components/InfoIcon";
import { ONE_MINUTE_REFRESH_TIMEOUT } from "../../constants";
import { consoleOut, isProd } from "../../middleware/ui";
import { findATokenAddress, formatThousands, getAmountFromLamports } from "../../middleware/utils";
import { getTokenAccountBalanceByAddress } from "../../middleware/accounts";

export type StakeOption = "stake" | "unstake" | undefined;

type StakingPair = {
  unstakedToken: TokenInfo | undefined;
  stakedToken: TokenInfo | undefined;
}

export const StakingView = () => {
  const {
    coinPrices,
    setIsVerifiedRecipient,
    getTokenPriceBySymbol,
    setFromCoinAmount,
  } = useContext(AppStateContext);
  const connection = useConnection();
  const connectionConfig = useConnectionConfig();
  const { cluster, endpoint } = useConnectionConfig();
  const { publicKey } = useWallet();
  const [searchParams, setSearchParams] = useSearchParams();
  const { account } = useNativeAccount();
  const accounts = useAccountsContext();
  const { t } = useTranslation('common');
  const { width } = useWindowSize();
  const [isSmallUpScreen, setIsSmallUpScreen] = useState(isDesktop);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [meanPrice, setMeanPrice] = useState<number>(0);
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [currentTab, setCurrentTab] = useState<StakeOption>(undefined);
  const [pageInitialized, setPageInitialized] = useState<boolean>(false);
  const [stakePoolInfo, setStakePoolInfo] = useState<StakePoolInfo>();
  const [shouldRefreshStakePoolInfo, setShouldRefreshStakePoolInfo] = useState(true);
  const [refreshingStakePoolInfo, setRefreshingStakePoolInfo] = useState(false);
  const [meanAddresses, setMeanAddresses] = useState<Env>();
  const [stakingPair, setStakingPair] = useState<StakingPair | undefined>(undefined);
  const [sMeanBalance, setSmeanBalance] = useState<number>(0);
  const [meanBalance, setMeanBalance] = useState<number>(0);
  const [lastTimestamp, setLastTimestamp] = useState(Date.now());

  //////////////////
  // Init clients //
  //////////////////

  // Create and cache Staking client instance
  const stakeClient = useMemo(() => {

    const opts: ConfirmOptions = {
      preflightCommitment: "confirmed",
      commitment: "confirmed",
    };

    return new StakingClient(
      cluster,
      endpoint,
      publicKey,
      opts,
      isProd() ? false : true
    )

  }, [
    cluster,
    endpoint,
    publicKey
  ]);


  /////////////////
  //  Callbacks  //
  /////////////////

  const refreshMeanBalance = useCallback(async () => {

    if (!publicKey || !accounts || !accounts.tokenAccounts || !accounts.tokenAccounts.length) {
      return;
    }

    let balance = 0;

    if (!stakingPair || !stakingPair.unstakedToken) {
      setMeanBalance(balance);
      return;
    }

    try {
      const meanTokenPk = new PublicKey(stakingPair.unstakedToken.address);
      const meanTokenAddress = await findATokenAddress(publicKey, meanTokenPk);
      const result = await getTokenAccountBalanceByAddress(connection, meanTokenAddress);
      if (result) {
        balance = result.uiAmount || 0;
      }
      consoleOut('MEAN balance:', balance, 'blue');
      setMeanBalance(balance);
    } catch (error) {
      setMeanBalance(balance);
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    accounts,
    publicKey,
    stakingPair,
  ]);

  const refreshStakedMeanBalance = useCallback(async () => {

    if (!publicKey || !accounts || !accounts.tokenAccounts || !accounts.tokenAccounts.length) {
      return;
    }

    let balance = 0;

    if (!stakingPair || !stakingPair.stakedToken) {
      setSmeanBalance(balance);
      return;
    }

    const sMeanTokenPk = new PublicKey(stakingPair.stakedToken.address);
    const smeanTokenAddress = await findATokenAddress(publicKey, sMeanTokenPk);
    const result = await getTokenAccountBalanceByAddress(connection, smeanTokenAddress);
    if (result) {
      balance = result.uiAmount || 0;
    }
    consoleOut('sMEAN balance:', balance, 'blue');
    setSmeanBalance(balance);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    accounts,
    publicKey,
    stakingPair,
  ]);

  const refreshStakePoolInfo = useCallback((price: number) => {

    if (stakeClient && price) {
      setTimeout(() => {
        setRefreshingStakePoolInfo(true);
      });
      consoleOut('calling getStakePoolInfo...', '', 'blue');
      stakeClient.getStakePoolInfo(price)
      .then((value) => {
        consoleOut('stakePoolInfo:', value, 'crimson');
        setStakePoolInfo(value);
      })
      .catch((error) => {
        console.error('getStakePoolInfo error:', error);
      })
      .finally(() => setRefreshingStakePoolInfo(false));
    }

  }, [stakeClient]);

  const onTabChange = useCallback((option: StakeOption) => {
    setFromCoinAmount('');
    setIsVerifiedRecipient(false);
    setSearchParams({option: (option as string) || ''});
  }, [setFromCoinAmount, setIsVerifiedRecipient, setSearchParams]);


  /////////////////////
  // Data management //
  /////////////////////


  // Enable deep-linking
  useEffect(() => {
    if (!publicKey) { return; }

    // Get the option if passed-in
    let optionInQuery: string | null = null;
    if (searchParams) {
      optionInQuery = searchParams.get('option');
      consoleOut('searchParams:', searchParams.toString(), 'crimson');
      consoleOut('option:', searchParams.get('option'), 'crimson');
    }

    // Pre-select an option
    switch (optionInQuery as StakeOption) {
      case "stake":
        setCurrentTab("stake");
        break;
      case "unstake":
        setCurrentTab("unstake");
        break;
      default:
        setCurrentTab("stake");
        setSearchParams({option: "stake"});
        break;
    }

  }, [publicKey, searchParams, setSearchParams]);

  // Get token addresses from staking client and save tokens
  useEffect(() => {
    if (!publicKey || !stakeClient) { return; }

    if (!pageInitialized) {
      setPageInitialized(true);
      const meanAddress = stakeClient.getMintAddresses();

      setMeanAddresses(meanAddress);

      const tokenList = MEAN_TOKEN_LIST.filter(t => t.chainId === getNetworkIdByCluster(connectionConfig.cluster))
      const unstakedToken = tokenList.find(t => t.address === meanAddress.mean.toBase58());
      const stakedToken = tokenList.find(t => t.address === meanAddress.sMean.toBase58());

      consoleOut('unstakedToken', unstakedToken, 'blue');
      consoleOut('stakedToken', stakedToken, 'blue');

      setStakingPair({
        unstakedToken,
        stakedToken
      });

    }
  }, [
    publicKey,
    stakeClient,
    pageInitialized,
    connectionConfig.cluster
  ]);

  // Keep account balance updated
  useEffect(() => {
    if (account?.lamports !== previousBalance || !nativeBalance) {
      // Refresh token balances
      setNativeBalance(getAmountFromLamports(account?.lamports));
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [
    account,
    nativeBalance,
    previousBalance,
  ]);

  // Keep MEAN price updated
  useEffect(() => {

    if (coinPrices && stakingPair && stakingPair.unstakedToken) {
      const price = getTokenPriceBySymbol(stakingPair.unstakedToken.symbol);
      consoleOut('meanPrice:', price, 'crimson');
      setMeanPrice(price);
    }

  }, [coinPrices, getTokenPriceBySymbol, stakingPair]);

  // Keep MEAN balance updated
  useEffect(() => {
    if (!publicKey || !accounts || !accounts.tokenAccounts || !accounts.tokenAccounts.length) {
      setMeanBalance(0);
      return;
    }

    if (stakingPair && stakingPair.unstakedToken) {
      refreshMeanBalance();
    }

  }, [
    accounts,
    publicKey,
    stakingPair,
    refreshMeanBalance,
  ]);

  // Keep sMEAN balance updated
  useEffect(() => {
    if (!publicKey || !accounts || !accounts.tokenAccounts || !accounts.tokenAccounts.length) {
      return;
    }

    if (stakingPair && stakingPair.stakedToken) {
      refreshStakedMeanBalance();
    }

  }, [
    accounts,
    publicKey,
    stakingPair,
    refreshStakedMeanBalance,
  ]);

  // Get staking pool info from staking client
  useEffect(() => {

    if (!stakeClient) { return; }

    if (shouldRefreshStakePoolInfo && meanPrice) {
      setTimeout(() => {
        setShouldRefreshStakePoolInfo(false);
      });
      refreshStakePoolInfo(meanPrice);
    }

  }, [stakeClient, refreshStakePoolInfo, meanPrice, shouldRefreshStakePoolInfo]);

  // Refresh pool info timeout
  useEffect(() => {

    const interval = setInterval(() => {
      const now = Date.now();
      setLastTimestamp(now);
      setShouldRefreshStakePoolInfo(true);
      consoleOut('Autorefresh stake pool info after:', `${(now - lastTimestamp) / 1000}s`);
    }, ONE_MINUTE_REFRESH_TIMEOUT);

    return () => {
      clearInterval(interval);
    };
  }, [lastTimestamp]);

  // Detect when entering small screen mode
  useEffect(() => {
    if (isSmallUpScreen && width < 576) {
      setIsSmallUpScreen(false);
    }
  }, [
    width,
    isSmallUpScreen,
  ]);

  return (
    <>
      <div className="container main-container">
        <div className="interaction-area">
          <div className="container-max-width-640">
            <div className="title-and-subtitle">
              <div className="title">
                <IconStats className="mean-svg-icons" />
                <div>{t('staking.title')}</div>
              </div>
              <div className="subtitle text-center">
                {t('staking.subtitle')}
              </div>
            </div>
            <div id="refresh-stake-pool-info" onClick={() => refreshStakePoolInfo(meanPrice)}></div>
            {meanAddresses && (
              <>
                {/* Staking paragraphs */}
                <h2>{t("staking.panel-right.title")}</h2>
                <p>{t("staking.panel-right.first-text")}</p>
                <p className="pb-1">{t("staking.panel-right.second-text")}</p>

                <Divider />

                <div className="px-4 pb-4">
                  {/* Staking Stats */}
                  <div className="invest-fields-container pt-2">
                    <div className="mb-3">
                      <Row>
                        <Col span={8}>
                          <div className="info-label icon-label justify-content-center align-items-center">
                            <span>{t("staking.panel-right.stats.staking-apy")}</span>
                            <InfoIcon content={t("staking.panel-right.stats.staking-apy-tooltip")} placement="top">
                              <IconHelpCircle className="mean-svg-icons" />
                            </InfoIcon>
                          </div>
                          <div className="transaction-detail-row">
                            {refreshingStakePoolInfo || (!stakePoolInfo || stakePoolInfo.apr === 0) ? (
                              <IconLoading className="mean-svg-icons"/>
                            ) : (
                              <span>{(stakePoolInfo.apr * 100).toFixed(2)}%</span>
                            )}
                          </div>
                        </Col>
                        <Col span={8}>
                          <div className="info-label icon-label justify-content-center align-items-center">
                            {t("staking.panel-right.stats.total-value-locked")}
                          </div>
                          <div className="transaction-detail-row">
                            {refreshingStakePoolInfo || (!stakePoolInfo || stakePoolInfo.tvl === 0) ? (
                              <IconLoading className="mean-svg-icons"/>
                            ) : (
                              <span>${formatThousands(stakePoolInfo.tvl, 2)}</span>
                            )}
                          </div>
                        </Col>
                        <Col span={8}>
                          <div className="info-label icon-label justify-content-center align-items-center">
                            {t("staking.panel-right.stats.total-mean-rewards")}
                          </div>
                          <div className="transaction-detail-row">
                            {refreshingStakePoolInfo || (!stakePoolInfo || stakePoolInfo.totalMeanAmount.uiAmount === 0) ? (
                              <IconLoading className="mean-svg-icons"/>
                            ) : (
                              <span>{formatThousands(stakePoolInfo.totalMeanAmount.uiAmount || 0, 0)}</span>
                            )}
                          </div>
                        </Col>
                      </Row>
                    </div>
                  </div>

                  <div className="flex flex-center">
                    <div className="place-transaction-box mb-3">
                      <div className="button-tabset-container">
                        <div className={`tab-button ${currentTab === "stake" ? 'active' : ''}`} onClick={() => onTabChange("stake")}>
                          {t('staking.panel-right.tabset.stake.name')}
                        </div>
                        <div className={`tab-button ${currentTab === "unstake" ? 'active' : ''}`} onClick={() => onTabChange("unstake")}>
                          {t('staking.panel-right.tabset.unstake.name')}
                        </div>
                      </div>

                      {/* Tab Stake */}
                      {currentTab === "stake" && (
                        <StakeTabView
                          stakeClient={stakeClient}
                          selectedToken={stakingPair?.unstakedToken}
                          meanBalance={meanBalance}
                          smeanBalance={sMeanBalance}
                          onTxFinished={refreshMeanBalance}
                        />
                      )}

                      {/* Tab unstake */}
                      {currentTab === "unstake" && (
                        <UnstakeTabView
                          stakeClient={stakeClient}
                          selectedToken={stakingPair?.stakedToken}
                          unstakedToken={stakingPair?.unstakedToken}
                          tokenBalance={sMeanBalance}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <PreFooter />
    </>
  );
};
