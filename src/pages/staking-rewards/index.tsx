import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { WarningFilled } from "@ant-design/icons";
import { useTranslation } from 'react-i18next';
import { isDesktop } from "react-device-detect";
import { PreFooter } from "../../components/PreFooter";
import { getNetworkIdByCluster, useConnection, useConnectionConfig } from '../../contexts/connection';
import { useWallet } from "../../contexts/wallet";
import { AppStateContext } from "../../contexts/appstate";
import { findATokenAddress } from "../../utils/utils";
import { IconStats } from "../../Icons";
import useWindowSize from '../../hooks/useWindowResize';
import { consoleOut, isDev, isLocal, isProd } from "../../utils/ui";
import { useNavigate } from "react-router-dom";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { StakePoolInfo } from "@mean-dao/staking";
import { useAccountsContext, useNativeAccount } from "../../contexts/accounts";
import { MEAN_TOKEN_LIST } from "../../constants/token-list";
import { TokenInfo } from "@solana/spl-token-registry";
import { appConfig } from "../..";

export const StakingRewardsView = () => {
  const {
    coinPrices,
    stakedAmount,
    isWhitelisted,
    fromCoinAmount,
    detailsPanelOpen,
    isInBetaTestingProgram,
    setIsVerifiedRecipient,
    setDtailsPanelOpen,
    setFromCoinAmount,
  } = useContext(AppStateContext);
  const navigate = useNavigate();
  const connection = useConnection();
  const connectionConfig = useConnectionConfig();
  const { cluster, endpoint } = useConnectionConfig();
  const { connected, publicKey } = useWallet();
  const { account } = useNativeAccount();
  const accounts = useAccountsContext();
  const { t } = useTranslation('common');
  const { width } = useWindowSize();
  const [isSmallUpScreen, setIsSmallUpScreen] = useState(isDesktop);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [meanPrice, setMeanPrice] = useState<number>(0);
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [stakingRewards, setStakingRewards] = useState<number>(0);
  const [raydiumInfo, setRaydiumInfo] = useState<any>([]);
  const [orcaInfo, setOrcaInfo] = useState<any>([]);
  const [maxRadiumAprValue, setMaxRadiumAprValue] = useState<number>(0);
  const [maxOrcaAprValue, setMaxOrcaAprValue] = useState<number>(0);
  const [maxAprValue, setMaxAprValue] = useState<number>(0);
  const [pageInitialized, setPageInitialized] = useState<boolean>(false);
  const [stakePoolInfo, setStakePoolInfo] = useState<StakePoolInfo>();
  const [shouldRefreshLpData, setShouldRefreshLpData] = useState(true);
  const [refreshingPoolInfo, setRefreshingPoolInfo] = useState(false);
  const annualPercentageYield = 5;

  // Tokens and balances
  const [meanToken, setMeanToken] = useState<TokenInfo>();
  const [meanBalance, setMeanBalance] = useState<number>(0);

  // Access rights
  const userHasAccess = useMemo(() => {

    if (!publicKey) { return false; }

    const isUserAllowed = () => {
      const acl = appConfig.getConfig().stakingRewardsAcl;
      if (acl && acl.length > 0) {
        return acl.some(a => a === publicKey.toBase58());
      } else {
        return true;
      }
    }

    if (isProd()) {
      return isUserAllowed();
    }

    return true;

  }, [publicKey]);

  const getTokenAccountBalanceByAddress = useCallback(async (tokenMintAddress: PublicKey | undefined | null): Promise<number> => {
    if (!connection || !tokenMintAddress) return 0;
    try {
      const tokenAmount = (await connection.getTokenAccountBalance(tokenMintAddress)).value;
      return tokenAmount.uiAmount || 0;
    } catch (error) {
      console.error(error);
      throw(error);
    }
  }, [connection]);

  const refreshMeanBalance = useCallback(async () => {

    if (!connection || !publicKey || !accounts || !accounts.tokenAccounts || !accounts.tokenAccounts.length) {
      return;
    }

    let balance = 0;

    if (!meanToken) {
      setMeanBalance(balance);
      return;
    }

    const meanTokenPk = new PublicKey(meanToken.address);
    const meanTokenAddress = await findATokenAddress(publicKey, meanTokenPk);
    balance = await getTokenAccountBalanceByAddress(meanTokenAddress);
    setMeanBalance(balance);

  }, [
    accounts,
    meanToken,
    publicKey,
    connection,
    getTokenAccountBalanceByAddress
  ]);

  // Preset MEAN token
  useEffect(() => {
    if (!connection) { return; }

    if (!pageInitialized) {
      const tokenList = MEAN_TOKEN_LIST.filter(t => t.chainId === getNetworkIdByCluster(connectionConfig.cluster))
      const token = tokenList.find(t => t.symbol === 'MEAN');

      consoleOut('MEAN token', token, 'blue');
      setMeanToken(token)

    }
  }, [
    connection,
    pageInitialized,
    connectionConfig.cluster
  ]);

  // Keep account balance updated
  useEffect(() => {

    const getAccountBalance = (): number => {
      return (account?.lamports || 0) / LAMPORTS_PER_SOL;
    }

    if (account?.lamports !== previousBalance || !nativeBalance) {
      // Refresh token balances
      setNativeBalance(getAccountBalance());
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

    if (coinPrices && meanToken) {
      const symbol = meanToken.symbol.toUpperCase();
      const price = coinPrices && coinPrices[symbol] ? coinPrices[symbol] : 0;
      setMeanPrice(price);
    } else {
      setMeanPrice(0);
    }

  }, [coinPrices, meanToken]);

  // Keep MEAN balance updated
  useEffect(() => {
    if (!publicKey || !accounts || !accounts.tokenAccounts || !accounts.tokenAccounts.length) {
      return;
    }

    if (meanToken) {
      refreshMeanBalance();
    }

  }, [
    accounts,
    publicKey,
    meanToken,
    refreshMeanBalance,
  ]);

  // Set when a page is initialized
  useEffect(() => {
    if (!pageInitialized && meanToken) {
      setPageInitialized(true);
    }
  }, [
    meanToken,
    pageInitialized,
  ]);

  if (!userHasAccess) {
    return (
      <>
        <div className="container main-container">
          <div className="interaction-area">
            <div className="title-and-subtitle w-75 h-100">
              <div className="title">
                <IconStats className="mean-svg-icons" />
                <div>{t('invest.title')}</div>
              </div>
              <div className="subtitle text-center">
                {t('invest.subtitle')}
              </div>
              <div className="w-50 h-100 p-5 text-center flex-column flex-center">
                <div className="text-center mb-2">
                  <WarningFilled style={{ fontSize: 48 }} className="icon fg-warning" />
                </div>
                {publicKey ? (
                  <h3>Please connect your wallet to setup rewards</h3>
                ) : (
                  <h3>The content you are accessing is not available at this time or you don't have access permission</h3>
                )}
              </div>
            </div>
          </div>
        </div>
        <PreFooter />
      </>
    );
  }

  return (
    <>
      <div className="container main-container">
        <div className="interaction-area">
          <div className="title-and-subtitle">
            <div className="title">
              <IconStats className="mean-svg-icons" />
              <div>{t('invest.title')}</div>
            </div>
            <div className="subtitle text-center">
              Staking Rewards &amp; History
            </div>
          </div>
          <div className="place-transaction-box mb-3">
            Content goes here
          </div>
          <div className="mb-3">
            History table here
          </div>
        </div>
      </div>
      <PreFooter />
    </>
  );
};
