import React, { useCallback, useContext, useMemo, useRef } from 'react';
import "./style.scss";
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  EditOutlined,
  LoadingOutlined,
  SyncOutlined,
  WarningFilled
} from '@ant-design/icons';
import { ConfirmOptions, Connection, Keypair, LAMPORTS_PER_SOL, ParsedTransactionMeta, PublicKey, Signer, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { useEffect, useState } from 'react';
import { PreFooter } from '../../components/PreFooter';
import { TransactionItemView } from '../../components/TransactionItemView';
import { getSolanaExplorerClusterParam, useConnectionConfig } from '../../contexts/connection';
import { useWallet } from '../../contexts/wallet';
import { FetchStatus, UserTokenAccount } from '../../models/transactions';
import { AppStateContext } from '../../contexts/appstate';
import { useTranslation } from 'react-i18next';
import { Identicon } from '../../components/Identicon';
import {
  fetchAccountTokens,
  findATokenAddress,
  formatThousands,
  getAmountFromLamports,
  getTokenAmountAndSymbolByTokenAddress,
  getTxIxResume,
  makeDecimal,
  openLinkInNewTab,
  shortenAddress,
  tabNameFormat
} from '../../utils/utils';
import { Alert, Button, Col, Dropdown, Empty, Menu, Row, Space, Spin, Tooltip } from 'antd';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import {
  SOLANA_EXPLORER_URI_INSPECT_ADDRESS,
  EMOJIS,
  TRANSACTIONS_PER_PAGE,
  FALLBACK_COIN_IMAGE,
  WRAPPED_SOL_MINT_ADDRESS,
  ACCOUNTS_LOW_BALANCE_LIMIT,
  NO_FEES,
  ONE_MINUTE_REFRESH_TIMEOUT
} from '../../constants';
import { Helmet } from "react-helmet";
import { IconAdd, IconExternalLink, IconEyeOff, IconEyeOn, IconLightBulb, IconLoading, IconVerticalEllipsis } from '../../Icons';
import { fetchAccountHistory, MappedTransaction } from '../../utils/history';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import useLocalStorage from '../../hooks/useLocalStorage';
import { AccountTokenParsedInfo } from '../../models/token';
import { TokenInfo } from "@solana/spl-token-registry";
import { AccountsMergeModal } from '../../components/AccountsMergeModal';
import { initialSummary, StreamsSummary } from '../../models/streams';
import { Category, MSP, Stream, STREAM_STATUS, TransactionFees, Treasury, TreasuryType } from '@mean-dao/msp';
import { StreamInfo, STREAM_STATE, MoneyStreaming, TreasuryInfo } from '@mean-dao/money-streaming';
import { openNotification } from '../../components/Notifications';
import { AddressDisplay } from '../../components/AddressDisplay';
import { ReceiveSplOrSolModal } from '../../components/ReceiveSplOrSolModal';
import { SendAssetModal } from '../../components/SendAssetModal';
import { EventType, InvestItemPaths, MetaInfoCtaAction, OperationType, TransactionStatus } from '../../models/enums';
import { consoleOut, copyText, delay, getTransactionStatusForLogs, isLocal, isValidAddress, kFormatter, toUsCurrency } from '../../utils/ui';
import { WrapSolModal } from '../../components/WrapSolModal';
import { UnwrapSolModal } from '../../components/UnwrapSolModal';
import { confirmationEvents, TxConfirmationContext, TxConfirmationInfo } from '../../contexts/transaction-status';
import { AppUsageEvent } from '../../utils/segment-service';
import { segmentAnalytics } from '../../App';
import { AccountsSuggestAssetModal } from '../../components/AccountsSuggestAssetModal';
import { QRCodeSVG } from 'qrcode.react';
import { NATIVE_SOL } from '../../utils/tokens';
import { customLogger } from '../..';
import { AccountsInitAtaModal } from '../../components/AccountsInitAtaModal';
import { AccountsCloseAssetModal } from '../../components/AccountsCloseAssetModal';
import { INVEST_ROUTE_BASE_PATH } from '../invest';
import { isMobile } from 'react-device-detect';
import useWindowSize from '../../hooks/useWindowResize';
import { closeTokenAccount } from '../../utils/accounts';
import { MultisigTransferTokensModal } from '../../components/MultisigTransferTokensModal';
import { AccountLayout, ASSOCIATED_TOKEN_PROGRAM_ID, MintLayout, Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { DEFAULT_EXPIRATION_TIME_SECONDS, MeanMultisig, MEAN_MULTISIG_PROGRAM, MultisigInfo, MultisigTransaction, MultisigTransactionStatus } from '@mean-dao/mean-multisig-sdk';
import { BN } from 'bn.js';
import { AnchorProvider, Program } from '@project-serum/anchor';
import SerumIDL from '../../models/serum-multisig-idl';
import { MultisigParticipant } from '../../models/multisig';
import { MultisigVaultTransferAuthorityModal } from '../../components/MultisigVaultTransferAuthorityModal';
import { MultisigVaultDeleteModal } from '../../components/MultisigVaultDeleteModal';
import { useNativeAccount } from '../../contexts/accounts';
import { MoneyStreamsInfoView } from '../../views/MoneyStreamsInfo';
import { MoneyStreamsIncomingView } from '../../views/MoneyStreamsIncoming';
import { MoneyStreamsOutgoingView } from '../../views/MoneyStreamsOutgoing';
import { StreamingAccountView } from '../../views/StreamingAccount';
import { MultisigAddAssetModal } from '../../components/MultisigAddAssetModal';
import { INITIAL_TREASURIES_SUMMARY, UserTreasuriesSummary } from '../../models/treasuries';
import notification, { IconType } from 'antd/lib/notification';

const antIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;
export type InspectedAccountType = "wallet" | "multisig" | undefined;
export type CategoryOption = "networth" | "assets" | "streaming" | "other-assets";
export type OtherAssetsOption = "msp-streams" | "msp-treasuries" | "orca" | "solend" | "friktion" | undefined;
export const ACCOUNTS_ROUTE_BASE_PATH = '/accounts';

interface AssetCta {
  action: MetaInfoCtaAction;
  isVisible: boolean;
  disabled: boolean;
  caption: string;
  uiComponentType: "button" | "menuitem";
  uiComponentId: string;
  tooltip: string;
  callBack?: any;
}

type CombinedStreamingAccounts = {
  treasury: Treasury | Treasury;
  streams: Array<Stream | StreamInfo> | undefined;
};

export const AccountsNewView = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { address, asset, streamingTab, streamId, treasuryId } = useParams();
  const { endpoint } = useConnectionConfig();
  const { publicKey, connected, wallet } = useWallet();
  const connectionConfig = useConnectionConfig();
  const {
    theme,
    activeTab,
    coinPrices,
    userTokens,
    streamList,
    pinnedTokens,
    splTokenList,
    streamListv1,
    streamListv2,
    streamDetail,
    transactions,
    previousRoute,
    isWhitelisted,
    selectedAsset,
    accountAddress,
    loadingStreams,
    lastTxSignature,
    shouldLoadTokens,
    transactionStatus,
    streamProgramAddress,
    streamV2ProgramAddress,
    pendingMultisigTxCount,
    previousWalletConnectState,
    setHighLightableMultisigId,
    setPendingMultisigTxCount,
    showDepositOptionsModal,
    setAddAccountPanelOpen,
    getTokenPriceByAddress,
    getTokenPriceBySymbol,
    getTokenByMintAddress,
    setTransactionStatus,
    refreshTokenBalance,
    setShouldLoadTokens,
    refreshStreamList,
    setStreamsSummary,
    setAccountAddress,
    setSelectedToken,
    setSelectedAsset,
    setActiveStream,
    setStreamDetail,
    setTransactions,
    clearStreams,
  } = useContext(AppStateContext);
  const {
    fetchTxInfoStatus,
    startFetchTxSignatureInfo,
    clearTxConfirmationContext,
  } = useContext(TxConfirmationContext);
  const { enqueueTransactionConfirmation } = useContext(TxConfirmationContext);
  const { t } = useTranslation('common');
  const { width } = useWindowSize();
  const { account } = useNativeAccount();
  const [isPageLoaded, setIsPageLoaded] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [accountAddressInput, setAccountAddressInput] = useState<string>('');
  const [tokensLoaded, setTokensLoaded] = useState(false);
  const [accountTokens, setAccountTokens] = useState<UserTokenAccount[]>([]);
  const [solAccountItems, setSolAccountItems] = useState(0);
  const [tokenAccountGroups, setTokenAccountGroups] = useState<Map<string, AccountTokenParsedInfo[]>>();
  const [userOwnedTokenAccounts, setUserOwnedTokenAccounts] = useState<AccountTokenParsedInfo[]>();
  const [selectedTokenMergeGroup, setSelectedTokenMergeGroup] = useState<AccountTokenParsedInfo[]>();
  const [wSolBalance, setWsolBalance] = useState(0);
  const [refreshingBalance, setRefreshingBalance] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategoryOption>("assets");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [selectedOtherAssetsOption, setSelectedOtherAssetsOption] = useState<OtherAssetsOption>(undefined);
  const [inspectedAccountType, setInspectedAccountType] = useState<InspectedAccountType>(undefined);
  const [isUnwrapping, setIsUnwrapping] = useState(false);
  const [pathParamAsset, setPathParamAsset] = useState('');
  const [pathParamStreamId, setPathParamStreamId] = useState('');
  const [pathParamTreasuryId, setPathParamTreasuryId] = useState('');
  const [pathParamStreamingTab, setPathParamStreamingTab] = useState('');
  const [assetCtas, setAssetCtas] = useState<AssetCta[]>([]);

  // Flow control
  const [status, setStatus] = useState<FetchStatus>(FetchStatus.Iddle);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [shouldLoadTransactions, setShouldLoadTransactions] = useState(false);
  const [hideLowBalances, setHideLowBalances] = useLocalStorage('hideLowBalances', true);
  const [canSubscribe, setCanSubscribe] = useState(true);
  const [isXsDevice, setIsXsDevice] = useState<boolean>(isMobile);

  // QR scan modal
  // const [isQrScannerModalVisible, setIsQrScannerModalVisibility] = useState(false);
  // const showQrScannerModal = useCallback(() => setIsQrScannerModalVisibility(true), []);
  // const closeQrScannerModal = useCallback(() => setIsQrScannerModalVisibility(false), []);
  // const onAcceptQrScannerModal = (value: string) => {
  //   setAccountAddressInput(value);
  //   triggerWindowResize();
  //   closeQrScannerModal();
  // };

  const [nativeBalance, setNativeBalance] = useState(0);
  const [transactionFees, setTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [transactionAssetFees, setTransactionAssetFees] = useState<TransactionFees>(NO_FEES);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [multisigAccounts, setMultisigAccounts] = useState<MultisigInfo[]>([]);
  const [selectedMultisig, setSelectedMultisig] = useState<MultisigInfo | undefined>(undefined);
  const [loadingMultisigAccounts, setLoadingMultisigAccounts] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [multisigPendingTxs, setMultisigPendingTxs] = useState<MultisigTransaction[]>([]);
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);

  const [loadingTreasuries, setLoadingTreasuries] = useState(false);
  const [autocloseTreasuries, setAutocloseTreasuries] = useState<(Treasury | TreasuryInfo)[]>([]);
  const [treasuriesLoaded, setTreasuriesLoaded] = useState(false);
  const [customStreamDocked, setCustomStreamDocked] = useState(false);
  const [treasuryList, setTreasuryList] = useState<(Treasury | TreasuryInfo)[]>([]);

  const [detailsPanelOpen, setDetailsPanelOpen] = useState(false);
  const [autoOpenDetailsPanel, setAutoOpenDetailsPanel] = useState(false);

  // Streaming account
  const [treasuryDetail, setTreasuryDetail] = useState<Treasury | TreasuryInfo | undefined>();
  const [incomingStreamList, setIncomingStreamList] = useState<Array<Stream | StreamInfo> | undefined>();
  const [outgoingStreamList, setOutgoingStreamList] = useState<Array<Stream | StreamInfo> | undefined>();
  const [loadingCombinedStreamingList, setLoadingCombinedStreamingList] = useState(true);
  const [streamingAccountCombinedList, setStreamingAccountCombinedList] = useState<CombinedStreamingAccounts[] | undefined>();
  // Balances and USD values
  const [totalAccountBalance, setTotalAccountBalance] = useState(0);
  const [incomingStreamsSummary, setIncomingStreamsSummary] = useState<StreamsSummary>(initialSummary);
  const [outgoingStreamsSummary, setOutgoingStreamsSummary] = useState<StreamsSummary>(initialSummary);
  const [incomingAmount, setIncomingAmount] = useState(0);
  const [outgoingAmount, setOutgoingAmount] = useState(0);
  const [totalStreamsAmount, setTotalStreamsAmount] = useState<number | undefined>(undefined);
  const [streamingAccountsSummary, setStreamingAccountsSummary] = useState<UserTreasuriesSummary>(INITIAL_TREASURIES_SUMMARY);
  const [multisigSolBalance, setMultisigSolBalance] = useState<number | undefined>(undefined);
  const [totalTokenAccountsValue, setTotalTokenAccountsValue] = useState(0);
  const [netWorth, setNetWorth] = useState(0);
  const [canShowStreamingAccountBalance, setCanShowStreamingAccountBalance] = useState(false);


  // Perform premature redirect here if no address was provided in path
  // to the current wallet address if the user is connected
  useEffect(() => {
    if (!publicKey) { return; }

    consoleOut('pathname:', location.pathname, 'crimson');
    if (location.pathname.endsWith('/streams')) {
      return;
      // Ensure path: /accounts/:address/assets if nothing provided
    } else if (!address && publicKey) {
      const url = `${ACCOUNTS_ROUTE_BASE_PATH}/${publicKey.toBase58()}/assets`;
      consoleOut('No account address, redirecting to:', url, 'orange');
      setAutoOpenDetailsPanel(false);
      setTimeout(() => {
        setIsPageLoaded(true);
      }, 5);
      navigate(url, { replace: true });
      // Ensure path: /accounts/:address/assets if address provided but not /assets or /streaming
    } else if (address && location.pathname.indexOf('/assets') === -1 && location.pathname.indexOf('/streaming') === -1) {
      const url = `${ACCOUNTS_ROUTE_BASE_PATH}/${address}/assets`;
      consoleOut('Address found, redirecting to:', url, 'orange');
      setAutoOpenDetailsPanel(false);
      setTimeout(() => {
        setIsPageLoaded(true);
      }, 5);
      navigate(url, { replace: true });
    } else {
      // If an asset is specified or user goes inside any tab of the streaming category, enable it
      if (asset || streamingTab) {
        setAutoOpenDetailsPanel(true);
      }
      setTimeout(() => {
        setIsPageLoaded(true);
      }, 5);
    }
  }, [address, asset, location.pathname, navigate, publicKey, streamId, streamingTab, treasuryId]);

  const connection = useMemo(() => new Connection(endpoint, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true
  }), [
    endpoint
  ]);

  // Create and cache Money Streaming Program instance
  const ms = useMemo(() => new MoneyStreaming(
    endpoint,
    streamProgramAddress,
    "confirmed"
  ), [
    endpoint,
    streamProgramAddress
  ]);

  const msp = useMemo(() => {
    return new MSP(
      endpoint,
      streamV2ProgramAddress,
      "confirmed"
    );
  }, [
    endpoint,
    streamV2ProgramAddress
  ]);

  const selectedMultisigRef = useRef(selectedMultisig);
  useEffect(() => {
    selectedMultisigRef.current = selectedMultisig;
  }, [selectedMultisig]);

  ////////////////////////////
  //   Events and actions   //
  ////////////////////////////

  const isTxInProgress = useCallback((): boolean => {
    return isBusy || fetchTxInfoStatus === "fetching" ? true : false;
  }, [
    isBusy,
    fetchTxInfoStatus,
  ]);

  const isInboundStream = useCallback((item: Stream | StreamInfo): boolean => {
    if (item && publicKey && accountAddress) {
      const v1 = item as StreamInfo;
      const v2 = item as Stream;
      if (v1.version < 2) {
        return v1.beneficiaryAddress === accountAddress ? true : false;
      } else {
        return v2.beneficiary === accountAddress ? true : false;
      }
    }
    return false;
  }, [accountAddress, publicKey]);

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }, [setTransactionStatus]);

  const getQueryAccountType = useCallback(() => {
    let accountTypeInQuery: string | null = null;
    if (searchParams) {
      accountTypeInQuery = searchParams.get('account-type');
      if (accountTypeInQuery) {
        return accountTypeInQuery;
      }
    }
    return undefined;
  }, [searchParams]);

  // Token Merger Modal
  const hideTokenMergerModal = useCallback(() => setTokenMergerModalVisibility(false), []);
  const showTokenMergerModal = useCallback(() => setTokenMergerModalVisibility(true), []);
  const [isTokenMergerModalVisible, setTokenMergerModalVisibility] = useState(false);
  const onCloseTokenMergeModal = useCallback(() => {
    resetTransactionStatus();
    hideTokenMergerModal();
  }, [
    hideTokenMergerModal,
    resetTransactionStatus,
  ]);

  const onFinishedTokenMerge = useCallback(() => {
    hideTokenMergerModal();
    resetTransactionStatus();
    setShouldLoadTokens(true);
  }, [
    setShouldLoadTokens,
    hideTokenMergerModal,
    resetTransactionStatus,
  ]);

  // Deposit SPL or SOL modal
  const [isReceiveSplOrSolModalOpen, setIsReceiveSplOrSolModalOpen] = useState(false);
  const hideReceiveSplOrSolModal = useCallback(() => setIsReceiveSplOrSolModalOpen(false), []);
  const showReceiveSplOrSolModal = useCallback(() => setIsReceiveSplOrSolModalOpen(true), []);

  // Send selected token modal
  const [isSendAssetModalOpen, setIsSendAssetModalOpen] = useState(false);
  const hideSendAssetModal = useCallback(() => setIsSendAssetModalOpen(false), []);
  const showSendAssetModal = useCallback(() => setIsSendAssetModalOpen(true), []);

  // Wrap SOL token modal
  const [isWrapSolModalOpen, setIsWrapSolModalOpen] = useState(false);
  const hideWrapSolModal = useCallback(() => setIsWrapSolModalOpen(false), []);
  const showWrapSolModal = useCallback(() => setIsWrapSolModalOpen(true), []);

  // Unwrap SOL token modal
  const [isUnwrapSolModalOpen, setIsUnwrapSolModalOpen] = useState(false);
  const hideUnwrapSolModal = useCallback(() => setIsUnwrapSolModalOpen(false), []);
  const showUnwrapSolModal = useCallback(() => setIsUnwrapSolModalOpen(true), []);

  // Suggest an Asset modal
  const [isSuggestAssetModalOpen, setIsSuggestAssetModalOpen] = useState(false);
  const hideSuggestAssetModal = useCallback(() => setIsSuggestAssetModalOpen(false), []);
  const showSuggestAssetModal = useCallback(() => setIsSuggestAssetModalOpen(true), []);

  // Add Asset (Init ATA) modal
  const [isInitAtaModalOpen, setIsInitAtaModalOpen] = useState(false);
  const hideInitAtaModal = useCallback(() => setIsInitAtaModalOpen(false), []);
  const showInitAtaModal = useCallback(() => setIsInitAtaModalOpen(true), []);

  // Close Asset modal
  const [isCloseAssetModalOpen, setIsCloseAssetModalOpen] = useState(false);
  const hideCloseAssetModal = useCallback(() => setIsCloseAssetModalOpen(false), []);
  const showCloseAssetModal = useCallback(() => setIsCloseAssetModalOpen(true), []);

  // Exchange selected token
  // const [isExchangeAssetModalOpen, setIsExchangeAssetModalOpen] = useState(false);
  // const hideExchangeAssetModal = useCallback(() => setIsExchangeAssetModalOpen(false), []);
  // const showExchangeAssetModal = useCallback(() => setIsExchangeAssetModalOpen(true), []);

  const onAfterWrap = () => {
    hideWrapSolModal();
  }

  const onAfterUnwrap = () => {
    hideUnwrapSolModal();
  }

  const handleScanAnotherAddressButtonClick = () => {
    setAddAccountPanelOpen(true);
  }

  const isInspectedAccountTheConnectedWallet = useCallback(() => {
    return accountAddress && publicKey && publicKey.toBase58() === accountAddress
      ? true
      : false
  }, [accountAddress, publicKey]);

  const isSelectedAssetNativeAccount = useCallback((asset?: UserTokenAccount) => {
    if (asset) {
      return accountAddress && accountAddress === asset.publicAddress ? true : false;
    }
    return accountAddress && selectedAsset && accountAddress === selectedAsset.publicAddress ? true : false;
  }, [
    selectedAsset,
    accountAddress,
  ]);

  const isSelectedAssetWsol = useCallback(() => {
    return selectedAsset && selectedAsset.address === WRAPPED_SOL_MINT_ADDRESS ? true : false;
  }, [selectedAsset]);

  // const userHasAccess = useCallback (() => {
  //   if (!publicKey || !accountAddress) { return false; }
  //   const isUserWallet = isInspectedAccountTheConnectedWallet();
  //   if (isUserWallet) { return true; }
  //   // TODO: We should validate here if the user is part of the multisig
  //   const param = getQueryAccountType();
  //   if (param && param === "multisig") {
  //     return true;
  //   }
  //   return false;
  // }, [accountAddress, getQueryAccountType, isInspectedAccountTheConnectedWallet, publicKey]);

  // const isAssetPurchasable = useCallback(() => {
  //   if (!selectedAsset) { return false; }

  //   const purchasableItems = ['SOL', 'USDT', 'USDC'];
  //   return purchasableItems.includes(selectedAsset.symbol);

  // }, [selectedAsset]);

  const goToExchangeWithPresetAsset = useCallback(() => {
    const queryParams = `${selectedAsset ? '?from=' + selectedAsset.symbol : ''}`;
    setDetailsPanelOpen(false);
    if (queryParams) {
      navigate(`/exchange${queryParams}`);
    } else {
      navigate('/exchange');
    }
  }, [navigate, selectedAsset, setDetailsPanelOpen]);

  const handleGoToExchangeClick = useCallback(() => {
    const queryParams = `${selectedAsset ? '?to=' + selectedAsset.symbol : ''}`;
    setDetailsPanelOpen(false);
    if (queryParams) {
      navigate(`/exchange${queryParams}`);
    } else {
      navigate('/exchange');
    }
  }, [navigate, selectedAsset, setDetailsPanelOpen]);

  const investButtonEnabled = useCallback(() => {
    if (!selectedAsset || !isInspectedAccountTheConnectedWallet()) { return false; }

    const investPageUsedAssets = ['SOL', 'MEAN', 'sMEAN', 'RAY', 'USDC'];
    return investPageUsedAssets.includes(selectedAsset.symbol);
  }, [isInspectedAccountTheConnectedWallet, selectedAsset]);

  const handleGoToInvestClick = useCallback(() => {
    setDetailsPanelOpen(false);
    let url = INVEST_ROUTE_BASE_PATH;

    if (selectedAsset) {
      switch (selectedAsset.symbol) {
        case "SOL":
          url += `/${InvestItemPaths.StakeSol}`;
          break;
        case "MEAN":
          url += `/${InvestItemPaths.StakeMean}?option=stake`;
          break;
        case "sMEAN":
          url += `/${InvestItemPaths.StakeMean}?option=unstake`;
          break;
        case "RAY":
        case "USDC":
          url += `/${InvestItemPaths.MeanLiquidityPools}`;
          break;
        default:
          break;
      }
    }

    navigate(url);

  }, [navigate, selectedAsset, setDetailsPanelOpen]);

  const onExchangeAsset = useCallback(() => {
    if (!selectedAsset) { return; }

    goToExchangeWithPresetAsset();

    // let token: TokenInfo | null;
    // if (isSelectedAssetNativeAccount()) {
    //   token = getTokenByMintAddress(WRAPPED_SOL_MINT_ADDRESS);
    // } else {
    //   token = getTokenByMintAddress(selectedAsset.address);
    // }
    // if (token) {
    //   setSelectedToken(token as TokenInfo);
    // }
    // showExchangeAssetModal();

  }, [goToExchangeWithPresetAsset, selectedAsset]);

  const onSendAsset = useCallback(() => {
    if (!selectedAsset) { return; }

    let token: TokenInfo | undefined;
    if (isSelectedAssetNativeAccount()) {
      token = getTokenByMintAddress(WRAPPED_SOL_MINT_ADDRESS);
    } else {
      token = getTokenByMintAddress(selectedAsset.address);
    }
    if (token) {
      setSelectedToken(token);
    }
    showSendAssetModal();

  }, [getTokenByMintAddress, isSelectedAssetNativeAccount, selectedAsset, setSelectedToken, showSendAssetModal]);

  const activateTokenMerge = useCallback(() => {
    if (selectedAsset && tokenAccountGroups) {
      const acc = tokenAccountGroups.has(selectedAsset.address);
      if (acc) {
        const item = tokenAccountGroups.get(selectedAsset.address);
        if (item) {
          setSelectedTokenMergeGroup(item);
          resetTransactionStatus();
          showTokenMergerModal();
        }
      }
    }
  }, [resetTransactionStatus, selectedAsset, showTokenMergerModal, tokenAccountGroups]);

  // Copy address to clipboard
  const copyAddressToClipboard = useCallback((address: any) => {

    if (!address) { return; }

    if (copyText(address.toString())) {
      openNotification({
        description: t('notifications.account-address-copied-message'),
        type: "info"
      });
    } else {
      openNotification({
        description: t('notifications.account-address-not-copied-message'),
        type: "error"
      });
    }

  },[t])

  // Call only if you have control over every loop
  const getStreamingAccountStreams = useCallback(async (treasuryPk: PublicKey, isNewTreasury: boolean) => {
    if (!publicKey || !ms || !msp || !treasuryPk || !streamList) { return undefined; }

    if (isNewTreasury) {
      return streamList.filter((item: any) => item.treasury === treasuryPk.toBase58());
    } else {
      return  streamList.filter((item: any) => item.treasuryAddress === treasuryPk.toBase58());
    }

  }, [ms, msp, publicKey, streamList]);

  const hasTransactions = useCallback(() => {
    return transactions && transactions.length > 0 ? true : false;
  }, [transactions]);

  // const getNativeAccountAsset = useCallback(() => {
  //   if (!accountAddress || !accountTokens) { return undefined; }
  //   return accountTokens.find(a => a.publicAddress === accountAddress);
  // }, [accountAddress, accountTokens]);

  const getScanAddress = useCallback((asset: UserTokenAccount): PublicKey | null => {
    /**
     * If asset.ataAddress
     *    If asset.ataAddress equals the SOL mint address
     *      Use accountAddress
     *    Else
     *      Use asset.ataAddress 
     * Else
     *    Reflect no transactions
     */
    return asset?.publicAddress
            ? asset.publicAddress !== NATIVE_SOL_MINT.toBase58()
              ? new PublicKey(asset.publicAddress)
              : new PublicKey(accountAddress)
            : null;
  },[accountAddress]);

  const canActivateMergeTokenAccounts = (): boolean => {
    if (publicKey && selectedAsset && tokenAccountGroups) {
      const acc = tokenAccountGroups.has(selectedAsset.address);
      if (acc) {
        const item = tokenAccountGroups.get(selectedAsset.address);
        return item && item.length > 1 ? true : false;
      }
    }
    return false;
  }

  const updateAtaFlag = useCallback(async (token: UserTokenAccount): Promise<boolean> => {
    const ata = await findATokenAddress(new PublicKey(accountAddress), new PublicKey(token.address));
    return ata && token.publicAddress && ata.toBase58() === token.publicAddress ? true : false;
  }, [accountAddress]);

  const refreshAssetBalance = useCallback(() => {
    if (!connection || !accountAddress || !selectedAsset || refreshingBalance || !accountTokens) { return; }

    setRefreshingBalance(true);

    const tokensCopy = JSON.parse(JSON.stringify(accountTokens)) as UserTokenAccount[];

    if (isSelectedAssetNativeAccount()) {
      const pk = new PublicKey(accountAddress);
      // Fetch SOL balance.
      connection.getBalance(pk)
        .then(solBalance => {
          let itemIndex = -1;
          itemIndex = tokensCopy.findIndex(t => t.publicAddress === selectedAsset.publicAddress);
          if (itemIndex !== -1) {
            tokensCopy[itemIndex].balance = solBalance / LAMPORTS_PER_SOL;
            tokensCopy[itemIndex].valueInUsd = (solBalance / LAMPORTS_PER_SOL) * getTokenPriceBySymbol(tokensCopy[itemIndex].symbol);
            consoleOut('solBalance:', solBalance / LAMPORTS_PER_SOL, 'blue');
            setAccountTokens(tokensCopy);
            setSelectedAsset(tokensCopy[itemIndex]);
          }
        })
        .catch(error => {
          console.error(error);
        })
        .finally(() => setRefreshingBalance(false));
    } else if (selectedAsset.publicAddress) {
      let itemIndex = -1;
      const pk = new PublicKey(selectedAsset.publicAddress);
      // Fetch token account balance.
      connection.getTokenAccountBalance(pk)
        .then(tokenAmount => {
          const balance = tokenAmount.value.uiAmount;
          consoleOut('balance:', balance, 'blue');
          const price = getTokenPriceByAddress(selectedAsset.address) || getTokenPriceBySymbol(selectedAsset.symbol)
          const valueInUSD = (balance || 0) * price;
          consoleOut('valueInUSD:', valueInUSD, 'blue');
          // Find the token and update it if found
          itemIndex = tokensCopy.findIndex(t => t.publicAddress === selectedAsset.publicAddress);
          if (itemIndex !== -1) {
            tokensCopy[itemIndex].balance = (balance || 0);
            tokensCopy[itemIndex].valueInUsd = valueInUSD;
            setAccountTokens(tokensCopy);
            setSelectedAsset(tokensCopy[itemIndex]);
          }
        })
        .catch(error => {
          console.error(error);
        })
        .finally(() => setRefreshingBalance(false));
    }
  }, [
    connection,
    accountTokens,
    selectedAsset,
    accountAddress,
    refreshingBalance,
    isSelectedAssetNativeAccount,
    getTokenPriceByAddress,
    getTokenPriceBySymbol,
    setSelectedAsset,
  ]);

  const startSwitch = useCallback(() => {
    setStatus(FetchStatus.Fetching);
    setLoadingTransactions(false);
    setShouldLoadTransactions(true);
  }, [])

  const reloadSwitch = useCallback(() => {
    refreshAssetBalance();
    setSolAccountItems(0);
    setTransactions(undefined);
    startSwitch();
  }, [
    startSwitch,
    setTransactions,
    refreshAssetBalance,
  ]);

  const navigateToAsset = useCallback((asset: UserTokenAccount) => {
    const isMyWallet = isInspectedAccountTheConnectedWallet();
    const isAccountNative = isSelectedAssetNativeAccount(asset);
    let url = '';

    if (isMyWallet && isAccountNative) {
      url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/assets`;
    } else {
      url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/assets/${asset.publicAddress}`;
      const param = getQueryAccountType();
      if (param) {
        url += `?account-type=${param}`;
      }
    }
    consoleOut('Asset selected, redirecting to:', url, 'orange');
    navigate(url);
  }, [accountAddress, getQueryAccountType, isInspectedAccountTheConnectedWallet, isSelectedAssetNativeAccount, navigate])

  const navigateToStreaming = useCallback(() => {
    let url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming/summary`;

    const param = getQueryAccountType();
    if (param) {
      url += `?account-type=${param}`;
    }

    navigate(url);
  }, [accountAddress, getQueryAccountType, navigate]);

  const selectAsset = useCallback((
    asset: UserTokenAccount,
    clearTxList = true,
    openDetails = false
  ) => {
    setStatus(FetchStatus.Fetching);
    if (clearTxList) {
      setSolAccountItems(0);
      setTransactions(undefined);
    }
    setSelectedAsset(asset);
    if (openDetails) {
      setDetailsPanelOpen(true);
    }
    setTimeout(() => {
      startSwitch();
    }, 10);
  }, [
    startSwitch,
    setTransactions,
    setSelectedAsset,
    setDetailsPanelOpen,
  ]);

  const shouldHideAsset = useCallback((asset: UserTokenAccount) => {
    const priceByAddress = getTokenPriceByAddress(asset.address);
    const tokenPrice = priceByAddress || getTokenPriceBySymbol(asset.symbol);
    return tokenPrice > 0 && (!asset.valueInUsd || asset.valueInUsd < ACCOUNTS_LOW_BALANCE_LIMIT)
      ? true
      : false;
  }, [getTokenPriceByAddress, getTokenPriceBySymbol]);

  const toggleHideLowBalances = useCallback((setting: boolean) => {
    if (selectedAsset && shouldHideAsset(selectedAsset) && setting) {
      selectAsset(accountTokens[0]);
      navigateToAsset(accountTokens[0]);
    }
    setHideLowBalances(setting);
  }, [accountTokens, navigateToAsset, selectAsset, selectedAsset, setHideLowBalances, shouldHideAsset]);

  const showNotificationByType = useCallback(async (type: IconType) => {
    await delay(1500);
    const myNotifyKey = `notify-${Date.now()}`;
    openNotification({
      type,
      key: myNotifyKey,
      title: 'Review proposal',
      duration: 20,
      description: (
        <>
          <div className="mb-2">The proposal's status can be reviewed in the Multisig Safe's proposal list.</div>
          <Button
            type="primary"
            shape="round"
            size="small"
            className="extra-small"
            onClick={() => {
              const multisigAuthority = selectedMultisigRef && selectedMultisigRef.current ? selectedMultisigRef.current.authority.toBase58() : '';
              if (multisigAuthority) {
                setHighLightableMultisigId(multisigAuthority);
              }
              navigate(`/multisig/${multisigAuthority}?v=proposals`);
              notification.close(myNotifyKey);
            }}
          >
              Review proposal
          </Button>
        </>
      ),
    });
  }, [navigate, setHighLightableMultisigId]);

  const recordTxConfirmation = useCallback((item: TxConfirmationInfo, success = true) => {
    let event: any;

    if (item && item.operationType === OperationType.Wrap) {
      event = success ? AppUsageEvent.WrapSolCompleted : AppUsageEvent.WrapSolFailed;
    } else if (item && item.operationType === OperationType.Unwrap) {
      event = success ? AppUsageEvent.UnwrapSolCompleted : AppUsageEvent.UnwrapSolFailed;
    }

    segmentAnalytics.recordEvent(event, { signature: item.signature });
  }, []);

  // Setup event handler for Tx confirmed
  const onTxConfirmed = useCallback((item: TxConfirmationInfo) => {

    const path = window.location.pathname;
    if (!path.startsWith(ACCOUNTS_ROUTE_BASE_PATH)) {
      return;
    }

    const softReloadStreams = () => {
      const streamsRefreshCta = document.getElementById("streams-refresh-noreset-cta");
      if (streamsRefreshCta) {
        streamsRefreshCta.click();
      }
    };

    const hardReloadStreams = () => {
      const streamsRefreshCta = document.getElementById("streams-refresh-reset-cta");
      if (streamsRefreshCta) {
        streamsRefreshCta.click();
      }
    };

    consoleOut(`onTxConfirmed event handled for operation ${OperationType[item.operationType]}`, item, 'crimson');
    if (item) {
      if (item.operationType === OperationType.Wrap) {
        recordTxConfirmation(item, true);
        setShouldLoadTokens(true);
        reloadSwitch();
      } else if (item.operationType === OperationType.Unwrap) {
        setIsUnwrapping(false);
        recordTxConfirmation(item, true);
        setShouldLoadTokens(true);
        reloadSwitch();
      } else if (item.operationType === OperationType.Transfer && item.extras !== 'scheduled') {
        recordTxConfirmation(item, true);
        setShouldLoadTokens(true);
        reloadSwitch();
      } else if (item.operationType === OperationType.CreateAsset) {
        recordTxConfirmation(item, true);
        setShouldLoadTokens(true);
        if (isSelectedAssetNativeAccount()) {
          reloadSwitch();
        }
      } else if (item.operationType === OperationType.CloseTokenAccount) {
        recordTxConfirmation(item, true);
        setShouldLoadTokens(true);
        reloadSwitch();
      } else if (item.operationType === OperationType.SetAssetAuthority) {
        recordTxConfirmation(item, true);
      } else if (item.operationType === OperationType.TransferTokens) {
        recordTxConfirmation(item, true);
        // const multisigAuthority = selectedMultisigRef && selectedMultisigRef.current ? selectedMultisigRef.current.authority.toBase58() : '';
        // if (multisigAuthority) {
        //   setHighLightableMultisigId(multisigAuthority);
        // }
        // navigate(`/multisig/${multisigAuthority}?v=proposals`);
      } else if (item.operationType === OperationType.DeleteAsset) {
        if (item.extras) {
          showNotificationByType("info");
        }
      } else if (item.operationType === OperationType.StreamAddFunds) {
        if (item.extras) {
          showNotificationByType("info");
        }
        softReloadStreams();
      } else if (item.operationType === OperationType.StreamPause) {
        softReloadStreams();
      } else if (item.operationType === OperationType.StreamResume) {
        softReloadStreams();
      } else if (item.operationType === OperationType.StreamCreate) {
        softReloadStreams();
      } else if (item.operationType === OperationType.StreamClose) {
        hardReloadStreams();
        const url = `${ACCOUNTS_ROUTE_BASE_PATH}/${address}/streaming/outgoing`;
        navigate(url);
      } else if (item.operationType === OperationType.StreamWithdraw) {
        if (item.extras) {
          showNotificationByType("info");
        }
        softReloadStreams();
      } else if (item.operationType === OperationType.StreamTransferBeneficiary) {
        if (item.extras) {
          showNotificationByType("info");
        }
        hardReloadStreams();
        const url = `${ACCOUNTS_ROUTE_BASE_PATH}/${address}/streaming/incoming`;
        navigate(url);
      } else if (item.operationType === OperationType.TreasuryAddFunds) {
        softReloadStreams();
      } else if (item.operationType === OperationType.TreasuryWithdraw) {
        if (item.extras) {
          showNotificationByType("info");
        }
        softReloadStreams();
      } else if (item.operationType === OperationType.TreasuryStreamCreate) {
        if (item.extras) {
          showNotificationByType("info");
        }
        softReloadStreams();
      } else if (item.operationType === OperationType.TreasuryCreate) {
        if (item.extras) {
          showNotificationByType("info");
        }
        softReloadStreams();
      } else if (item.operationType === OperationType.TreasuryClose) {
        if (item.extras) {
          showNotificationByType("info");
        } else {
          const url = `${ACCOUNTS_ROUTE_BASE_PATH}/${address}/streaming/outgoing`;
          navigate(url);
        }
        hardReloadStreams();
      } else if (item.operationType === OperationType.TreasuryRefreshBalance) {
        if (item.extras) {
          showNotificationByType("info");
        }
        softReloadStreams();
      } else if (item.operationType === OperationType.Transfer) {
        softReloadStreams();
      }
    }
    resetTransactionStatus();
  }, [
    address,
    isSelectedAssetNativeAccount,
    showNotificationByType,
    resetTransactionStatus,
    recordTxConfirmation,
    setShouldLoadTokens,
    getQueryAccountType,
    reloadSwitch,
    navigate,
  ]);

  // Setup event handler for Tx confirmation error
  const onTxTimedout = useCallback((item: TxConfirmationInfo) => {
    consoleOut('onTxTimedout event executed:', item, 'crimson');
    if (item) {
      if (item.operationType === OperationType.Unwrap) {
        setIsUnwrapping(false);
      } else if (item.operationType === OperationType.TransferTokens) {
        setIsBusy(false);
      }
    }
    recordTxConfirmation(item, false);
    resetTransactionStatus();
  }, [recordTxConfirmation, resetTransactionStatus]);

  // Filter only useful Txs for the SOL account and return count
  const getSolAccountItems = useCallback((txs: MappedTransaction[]): number => {

    const getChange = (accountIndex: number, meta: ParsedTransactionMeta | null): number => {
      if (meta !== null && accountIndex !== -1) {
        const prevBalance = meta.preBalances[accountIndex] || 0;
        const postbalance = meta.postBalances[accountIndex] || 0;
        const change = getAmountFromLamports(postbalance) - getAmountFromLamports(prevBalance);
        return change;
      }
      return 0;
    }

    if (txs && txs.length) {

      // Show only txs that have SOL changes
      const filtered = txs.filter(tx => {
        const meta = tx.parsedTransaction && tx.parsedTransaction.meta
          ? tx.parsedTransaction.meta
          : null;
        if (!meta || meta.err !== null) { return false; }
        const accounts = tx.parsedTransaction.transaction.message.accountKeys;
        const accIdx = accounts.findIndex(acc => acc.pubkey.toBase58() === accountAddress);
        if (isSelectedAssetNativeAccount() && accIdx === -1) { return false; }
        const change = getChange(accIdx, meta);
        return isSelectedAssetNativeAccount() && change !== 0 ? true : false;
      });

      consoleOut(`${filtered.length} useful Txs`);
      return filtered.length || 0;
    } else {
      return 0;
    }
  }, [
    accountAddress,
    isSelectedAssetNativeAccount
  ]);

  // Lets consider there are items to render if there are transactions for selected asset (NOT SOL)
  // or if there are transactions with balance changes for the selected asset (SOL)
  const hasItemsToRender = useCallback((): boolean => {
    return ((!isSelectedAssetNativeAccount() && hasTransactions()) ||
            (isSelectedAssetNativeAccount() && hasTransactions() && solAccountItems > 0))
      ? true
      : false;
  }, [hasTransactions, isSelectedAssetNativeAccount, solAccountItems]);

  const canShowBuyOptions = useCallback(() => {
    if (!selectedAsset) { return false; }
    return !selectedAsset.publicAddress ? true : false;
  }, [selectedAsset]);

  /////////////////
  //  Init code  //
  /////////////////

  const multisigClient = useMemo(() => {
    if (!connection || !publicKey || !connectionConfig.endpoint) { return null; }
    return new MeanMultisig(
      connectionConfig.endpoint,
      publicKey,
      "confirmed"
    );
  }, [
    connection,
    publicKey,
    connectionConfig.endpoint,
  ]);

  const multisigSerumClient = useMemo(() => {

    const opts: ConfirmOptions = {
      preflightCommitment: "confirmed",
      commitment: "confirmed",
      skipPreflight: true,
      maxRetries: 3
    };

    const provider = new AnchorProvider(connection, wallet as any, opts);

    return new Program(
      SerumIDL,
      "msigmtwzgXJHj2ext4XJjCDmpbcMuufFb5cHuwg6Xdt",
      provider
    );

  }, [
    connection, 
    wallet
  ]);

  const parseSerumMultisigAccount = (info: any) => {

    return PublicKey
      .findProgramAddress([info.publicKey.toBuffer()], new PublicKey("msigmtwzgXJHj2ext4XJjCDmpbcMuufFb5cHuwg6Xdt"))
      .then(k => {

        const address = k[0];
        const owners: MultisigParticipant[] = [];
        const filteredOwners = info.account.owners.filter((o: any) => !o.equals(PublicKey.default));

        for (let i = 0; i < filteredOwners.length; i ++) {
          owners.push({
            address: filteredOwners[i].toBase58(),
            name: "owner " + (i + 1),
          } as MultisigParticipant);
        }

        return {
          id: info.publicKey,
          version: 0,
          label: "",
          authority: address,
          nounce: info.account.nonce,
          ownerSetSeqno: info.account.ownerSetSeqno,
          threshold: info.account.threshold.toNumber(),
          pendingTxsAmount: 0,
          createdOnUtc: new Date(),
          owners: owners

        } as MultisigInfo;
      })
      .catch(err => { 
        consoleOut('error', err, 'red');
        return undefined;
      });
  };

  // Gets multisig pending Txs count
  useEffect(() => {

    if (!publicKey ||
        !multisigClient ||
        !multisigSerumClient ||
        !accountAddress ||
        !loadingMultisigAccounts) {
      return;
    }

    if (inspectedAccountType !== "multisig") {
      setPendingMultisigTxCount(undefined);
      return;
    }

    const timeout = setTimeout(() => {

      multisigSerumClient
      .account
      .multisig
      .all()
      .then((accs: any) => {
        const filteredSerumAccs = accs.filter((a: any) => {
          if (a.account.owners.filter((o: PublicKey) => o.equals(publicKey)).length) {
            return true;
          }
          return false;
        });

        const parsedSerumAccs: MultisigInfo[] = [];

        for (const acc of filteredSerumAccs) {
          parseSerumMultisigAccount(acc)
            .then((parsed: any) => {
              if (parsed) {
                parsedSerumAccs.push(parsed);
              }
            })
            .catch((err: any) => console.error(err));
        }

        multisigClient
        .getMultisigs(publicKey)
        .then((allInfo: MultisigInfo[]) => {
          allInfo.sort((a: any, b: any) => b.createdOnUtc.getTime() - a.createdOnUtc.getTime());
          const allAccounts = [...allInfo, ...parsedSerumAccs];
          consoleOut('multisigAccounts:', allAccounts, 'crimson');
          setMultisigAccounts(allAccounts);
          const item = allInfo.find(m => m.authority.equals(new PublicKey(accountAddress)));
          if (item) {
            consoleOut('selectedMultisig:', item, 'crimson');
            setSelectedMultisig(item);
            setPendingMultisigTxCount(item.pendingTxsAmount);
          } else {
            setSelectedMultisig(undefined);
            setPendingMultisigTxCount(undefined);
          }
        })
        .catch((err: any) => {
          console.error(err);
          setPendingMultisigTxCount(undefined);
        })
        .finally(() => setLoadingMultisigAccounts(false));
      })
      .catch((err: any) => {
        console.error(err);
        setPendingMultisigTxCount(undefined);
      })
      .finally(() => setLoadingMultisigAccounts(false));
    });

    return () => {
      clearTimeout(timeout);
      if (pendingMultisigTxCount) {
        setPendingMultisigTxCount(undefined);
      }
    }

  }, [
    publicKey,
    accountAddress,
    multisigClient,
    multisigSerumClient,
    inspectedAccountType,
    pendingMultisigTxCount,
    loadingMultisigAccounts,
    setPendingMultisigTxCount,
  ]);

  //////////////////////
  //    Executions    //
  //////////////////////

  const onAfterEveryModalClose = useCallback(() => {
    consoleOut('onAfterEveryModalClose called!', '', 'crimson');
    resetTransactionStatus();
  },[resetTransactionStatus]);

  // Create asset modal
  const [isCreateAssetModalVisible, setIsCreateAssetModalVisible] = useState(false);
  const onShowCreateAssetModal = useCallback(() => {
    setIsCreateAssetModalVisible(true);
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.000010,
      mspPercentFee: 0
    };
    resetTransactionStatus();
    setTransactionAssetFees(fees);
  },[resetTransactionStatus]);

  const closeCreateAssetModal = useCallback((refresh = false) => {
    resetTransactionStatus();
    setIsCreateAssetModalVisible(false);
    if (refresh) {
      setShouldLoadTokens(true); 
    }
  }, [resetTransactionStatus, setShouldLoadTokens]);

  const onAssetCreated = useCallback(() => {
    openNotification({
      description: t('multisig.create-asset.success-message'),
      type: "success"
    });
  },[
    t
  ]);

  const onExecuteCreateAssetTx = useCallback(async (data: any) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTxConfirmationContext();
    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createAsset = async (data: any) => {

      if (!connection || !selectedMultisig || !publicKey || !data || !data.token) { return null; }

      const [multisigSigner] = await PublicKey.findProgramAddress(
        [selectedMultisig.id.toBuffer()],
        MEAN_MULTISIG_PROGRAM
      );

      const mintAddress = new PublicKey(data.token.address);

      const signers: Signer[] = [];
      const ixs: TransactionInstruction[] = [];
      let tokenAccount = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        mintAddress,
        multisigSigner,
        true
      );

      const tokenAccountInfo = await connection.getAccountInfo(tokenAccount);

      if (!tokenAccountInfo) {
        ixs.push(
          Token.createAssociatedTokenAccountInstruction(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            mintAddress,
            tokenAccount,
            multisigSigner,
            publicKey
          )
        );
      } else {

        const tokenKeypair = Keypair.generate();
        tokenAccount = tokenKeypair.publicKey;

        ixs.push(
          SystemProgram.createAccount({
            fromPubkey: publicKey,
            newAccountPubkey: tokenAccount,
            programId: TOKEN_PROGRAM_ID,
            lamports: await Token.getMinBalanceRentForExemptAccount(connection),
            space: AccountLayout.span
          }),
          Token.createInitAccountInstruction(
            TOKEN_PROGRAM_ID,
            mintAddress,
            tokenAccount,
            multisigSigner
          )
        );

        signers.push(tokenKeypair);
      }

      const tx = new Transaction().add(...ixs);
      tx.feePayer = publicKey;
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;

      if (signers.length) {
        tx.partialSign(...signers);
      }

      return tx;
    };

    const createTx = async (): Promise<boolean> => {

      if (publicKey && data) {
        consoleOut('Start transaction for create asset', '', 'blue');
        consoleOut('Wallet address:', publicKey.toBase58());

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        // Create a transaction
        const payload = { token: data.token }; 
        consoleOut('data:', payload);

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: payload
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: ''
        });

        // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
        consoleOut('blockchainFee:', transactionAssetFees.blockchainFee + transactionAssetFees.mspFlatFee, 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');

        if (nativeBalance < transactionAssetFees.blockchainFee + transactionAssetFees.mspFlatFee) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${
              getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getTokenAmountAndSymbolByTokenAddress(
                transactionAssetFees.blockchainFee + transactionAssetFees.mspFlatFee, 
                NATIVE_SOL_MINT.toBase58()
              )
            })`
          });
          customLogger.logWarning('Multisig Create Vault transaction failed', { transcript: transactionLog });
          return false;
        }

        return await createAsset(data)
          .then(value => {
            if (!value) { return false; }
            consoleOut('createVault returned transaction:', value);
            setTransactionStatus({
              lastOperation: TransactionStatus.InitTransactionSuccess,
              currentOperation: TransactionStatus.SignTransaction
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
              result: getTxIxResume(value)
            });
            transaction = value;
            return true;
          })
          .catch(error => {
            console.error('createVault error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`
            });
            customLogger.logError('Multisig Create Vault transaction failed', { transcript: transactionLog });
            return false;
          });

      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Multisig Create Vault transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const signTx = async (): Promise<boolean> => {
      if (!wallet || !wallet.publicKey) {
        console.error('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot sign transaction! Wallet not found!'
        });
        customLogger.logError('Multisig Create Vault transaction failed', { transcript: transactionLog });
        return false;
      }
      const signedPublicKey = wallet.publicKey;
      consoleOut('Signing transaction...');
      return await wallet.signTransaction(transaction)
        .then((signed: Transaction) => {
          consoleOut('signTransaction returned a signed transaction:', signed);
          signedTransaction = signed;
          // Try signature verification by serializing the transaction
          try {
            encodedTx = signedTransaction.serialize().toString('base64');
            consoleOut('encodedTx:', encodedTx, 'orange');
          } catch (error) {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SignTransaction,
              currentOperation: TransactionStatus.SignTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
              result: {signer: `${signedPublicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logError('Multisig Create Vault transaction failed', { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: signedPublicKey.toBase58()}
          });
          return true;
        })
        .catch((error: any) => {
          console.error(error);
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${signedPublicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logError('Multisig Create Vault transaction failed', { transcript: transactionLog });
          return false;
        });
    }

    const sendTx = async (): Promise<boolean> => {
      if (wallet) {
        return await connection
          .sendEncodedTransaction(encodedTx)
          .then(sig => {
            consoleOut('sendEncodedTransaction returned a signature:', sig);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction
            });
            signature = sig;
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionSuccess),
              result: `signature: ${signature}`
            });
            return true;
          })
          .catch(error => {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
              result: { error, encodedTx }
            });
            customLogger.logError('Multisig Create Vault transaction failed', { transcript: transactionLog });
            return false;
          });
      } else {
        console.error('Cannot send transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot send transaction! Wallet not found!'
        });
        customLogger.logError('Multisig Create Vault transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet) {
      const create = await createTx();
      consoleOut('created:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('signed:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.CreateAsset);
            setIsBusy(false);
            onAssetCreated();
            closeCreateAssetModal(true);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    wallet,
    publicKey,
    connection,
    nativeBalance,
    selectedMultisig,
    transactionCancelled,
    transactionAssetFees.mspFlatFee,
    transactionAssetFees.blockchainFee,
    transactionStatus.currentOperation,
    clearTxConfirmationContext,
    startFetchTxSignatureInfo,
    resetTransactionStatus,
    closeCreateAssetModal,
    setTransactionStatus,
    onAssetCreated,
  ]);

  const onAcceptCreateVault = useCallback((params: any) => {
    consoleOut('Create asset payload:', params);
    onExecuteCreateAssetTx(params);
  },[
    onExecuteCreateAssetTx
  ]);

  // Transfer token modal
  const [isTransferTokenModalVisible, setIsTransferTokenModalVisible] = useState(false);
  const showTransferTokenModal = useCallback(() => {
    setIsTransferTokenModalVisible(true);
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.000010,
      mspPercentFee: 0
    };
    resetTransactionStatus();
    setTransactionFees(fees);
  }, [resetTransactionStatus]);

  const onAcceptTransferToken = (params: any) => {
    consoleOut('params', params, 'blue');
    onExecuteTransferTokensTx(params);
  };

  const onExecuteTransferTokensTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTxConfirmationContext();
    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const transferTokens = async (data: any) => {

      if (!publicKey || !selectedMultisig || !multisigClient) { 
        throw Error("Invalid transaction data");
      }

      const fromAddress = new PublicKey(data.from);
      const fromAccountInfo = await connection.getAccountInfo(fromAddress);

      if (!fromAccountInfo) { 
        throw Error("Invalid from token account");
      }

      const fromAccount = fromAccountInfo.owner.equals(SystemProgram.programId) 
        ? fromAccountInfo
        : AccountLayout.decode(Buffer.from(fromAccountInfo.data));

      const fromMintAddress = fromAccountInfo.owner.equals(SystemProgram.programId) 
        ? NATIVE_SOL_MINT 
        : new PublicKey(fromAccount.mint);

      let toAddress = new PublicKey(data.to);
      // const programId = MEAN_MULTISIG_PROGRAM;
      //
      let transferIx = SystemProgram.transfer({
        fromPubkey: fromAddress,
        toPubkey: toAddress,
        lamports: new BN(data.amount * LAMPORTS_PER_SOL).toNumber()
      });
      
      const ixs: TransactionInstruction[] = [];

      if (!fromMintAddress.equals(NATIVE_SOL_MINT)) {

        // programId = TOKEN_PROGRAM_ID;
        const mintInfo = await connection.getAccountInfo(fromMintAddress);

        if (!mintInfo) { 
          throw Error("Invalid token mint account");
        }

        const mint = MintLayout.decode(Buffer.from(mintInfo.data));
        const toAccountInfo = await connection.getAccountInfo(toAddress);

        if (!toAccountInfo || !toAccountInfo.owner.equals(TOKEN_PROGRAM_ID)) {

          const toAccountATA = await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            fromMintAddress,
            toAddress,
            true
          );

          const toAccountATAInfo = await connection.getAccountInfo(toAccountATA);

          if (!toAccountATAInfo) {
            ixs.push(
              Token.createAssociatedTokenAccountInstruction(
                ASSOCIATED_TOKEN_PROGRAM_ID,
                TOKEN_PROGRAM_ID,
                fromMintAddress,
                toAccountATA,
                toAddress,
                publicKey
              )
            );
          }

          toAddress = toAccountATA;
        }

        transferIx = Token.createTransferInstruction(
          TOKEN_PROGRAM_ID,
          fromAddress,
          toAddress,
          selectedMultisig.authority,
          [],
          new BN(data.amount * 10 ** mint.decimals).toNumber()
        );
      }

      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
        publicKey,
        data.title === "" ? "Propose funds transfer" : data.title,
        "", // description
        new Date(expirationTime * 1_000),
        (fromMintAddress.equals(NATIVE_SOL_MINT) ? OperationType.Transfer : OperationType.TransferTokens),
        selectedMultisig.id,
        transferIx.programId,
        transferIx.keys,
        transferIx.data,
        ixs
      );

      return tx;
    };

    const createTx = async (): Promise<boolean> => {

      if (publicKey && selectedAsset && data) {

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        // Create a transaction
        const payload = {
          title: data.title,
          from: data.from,
          to: data.to,
          amount: data.amount
        };
        
        consoleOut('token:', selectedAsset, 'blue');
        consoleOut('data:', payload);

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: payload
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: ''
        });

        // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
        consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');

        if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${
              getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getTokenAmountAndSymbolByTokenAddress(
                transactionFees.blockchainFee + transactionFees.mspFlatFee, 
                NATIVE_SOL_MINT.toBase58()
              )
            })`
          });
          customLogger.logWarning('Transfer tokens transaction failed', { transcript: transactionLog });
          return false;
        }

        return await transferTokens(data)
          .then(value => {
            if (!value) { return false; }
            consoleOut('transferTokens returned transaction:', value);
            setTransactionStatus({
              lastOperation: TransactionStatus.InitTransactionSuccess,
              currentOperation: TransactionStatus.SignTransaction
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
              result: getTxIxResume(value)
            });
            transaction = value;
            return true;
          })
          .catch(error => {
            console.error('transferTokens error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`
            });
            customLogger.logError('Transfer tokens transaction failed', { transcript: transactionLog });
            return false;
          });
          
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Transfer tokens transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const signTx = async (): Promise<boolean> => {
      if (!wallet || !wallet.publicKey) {
        console.error('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot sign transaction! Wallet not found!'
        });
        customLogger.logError('Transfer tokens transaction failed', { transcript: transactionLog });
        return false;
      }
      const signedPublicKey = wallet.publicKey;
      consoleOut('Signing transaction...');
      return await wallet.signTransaction(transaction)
        .then((signed: Transaction) => {
          consoleOut('signTransaction returned a signed transaction:', signed);
          signedTransaction = signed;
          // Try signature verification by serializing the transaction
          try {
            encodedTx = signedTransaction.serialize().toString('base64');
            consoleOut('encodedTx:', encodedTx, 'orange');
          } catch (error) {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SignTransaction,
              currentOperation: TransactionStatus.SignTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
              result: {signer: `${signedPublicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logError('Transfer tokens transaction failed', { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: signedPublicKey.toBase58()}
          });
          return true;
        })
        .catch(error => {
          console.error(error);
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${signedPublicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logError('Transfer tokens transaction failed', { transcript: transactionLog });
          return false;
        });
    }

    const sendTx = async (): Promise<boolean> => {
      if (wallet) {
        return await connection
          .sendEncodedTransaction(encodedTx)
          .then(sig => {
            consoleOut('sendEncodedTransaction returned a signature:', sig);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction
            });
            signature = sig;
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionSuccess),
              result: `signature: ${signature}`
            });
            return true;
          })
          .catch(error => {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
              result: { error, encodedTx }
            });
            customLogger.logError('Transfer tokens transaction failed', { transcript: transactionLog });
            return false;
          });
      } else {
        console.error('Cannot send transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot send transaction! Wallet not found!'
        });
        customLogger.logError('Transfer tokens transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet && selectedAsset) {
      const param = getQueryAccountType();
      const create = await createTx();
      consoleOut('created:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('signed:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent) {
            consoleOut('Send Tx to confirmation queue:', signature);
            if (sent) {
              enqueueTransactionConfirmation({
                signature: signature,
                operationType: OperationType.TransferTokens,
                finality: "confirmed",
                txInfoFetchStatus: "fetching",
                loadingTitle: 'Confirming transaction',
                loadingMessage: `Transferring ${formatThousands(data.amount, selectedAsset.decimals)} ${selectedAsset.symbol} to ${shortenAddress(data.to)}`,
                completedTitle: 'Transaction confirmed',
                completedMessage: `Asset funds (${formatThousands(data.amount, selectedAsset.decimals)} ${selectedAsset.symbol}) successfully transferred to ${shortenAddress(data.to)}`
              });
              setTransactionStatus({
                lastOperation: transactionStatus.currentOperation,
                currentOperation: TransactionStatus.TransactionFinished
              });
              setIsTransferTokenModalVisible(false);
              param === "multisig" && showNotificationByType("info");
            } else {
              openNotification({
                title: t('notifications.error-title'),
                description: t('notifications.error-sending-transaction'),
                type: "error"
              });
            }
            resetTransactionStatus();
            setIsBusy(false);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    wallet,
    publicKey,
    connection,
    selectedAsset,
    nativeBalance,
    multisigClient,
    selectedMultisig,
    transactionCancelled,
    transactionFees.mspFlatFee,
    transactionFees.blockchainFee,
    transactionStatus.currentOperation,
    enqueueTransactionConfirmation,
    clearTxConfirmationContext,
    showNotificationByType,
    resetTransactionStatus,
    setTransactionStatus,
    getQueryAccountType,
    t
  ]);

  // Transfer asset authority modal
  const [isTransferVaultAuthorityModalVisible, setIsTransferVaultAuthorityModalVisible] = useState(false);
  const showTransferVaultAuthorityModal = useCallback(() => {
    setIsTransferVaultAuthorityModalVisible(true);
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.000010,
      mspPercentFee: 0
    };
    setTransactionFees(fees);
  }, []);

  const onAcceptTransferVaultAuthority = (selectedAuthority: string) => {
    consoleOut('selectedAuthority', selectedAuthority, 'blue');
    onExecuteTransferOwnershipTx (selectedAuthority);
  };

  const onExecuteTransferOwnershipTx  = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTxConfirmationContext();
    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createTransferOwnershipTx = async (data: any) => {

      if (!publicKey || !selectedAsset || !selectedMultisig || !multisigClient) { 
        return null;
      }

      const setAuthIx = Token.createSetAuthorityInstruction(
        TOKEN_PROGRAM_ID,
        new PublicKey(selectedAsset.publicAddress as string),
        new PublicKey(data.selectedAuthority),
        'AccountOwner',
        selectedMultisig.authority,
        []
      );

      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
        publicKey,
        data.title === "" ? "Change asset ownership" : data.title,
        "", // description
        new Date(expirationTime * 1_000),
        OperationType.SetAssetAuthority,
        selectedMultisig.id,
        setAuthIx.programId,
        setAuthIx.keys,
        setAuthIx.data
      );

      return tx;
    }

    const createTx = async (): Promise<boolean> => {

      if (!publicKey || !data) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Transfer Vault Authority transaction failed', { transcript: transactionLog });
        return false;
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      // Create transaction payload for debugging
      const payload = {
        title: data.title as string,
        selectedAuthority: data.selectedAuthority,
      };

      consoleOut('data:', payload);

      // Log input data
      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
        inputs: payload
      });

      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
        result: ''
      });

      // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
      // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
      consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${
            getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
          }) to pay for network fees (${
            getTokenAmountAndSymbolByTokenAddress(
              transactionFees.blockchainFee + transactionFees.mspFlatFee, 
              NATIVE_SOL_MINT.toBase58()
            )
          })`
        });
        customLogger.logWarning('Transfer tokens transaction failed', { transcript: transactionLog });
        return false;
      }

      const result =  await createTransferOwnershipTx(data)
        .then(value => {
          if (!value) { return false; }
          consoleOut('createTransferVaultAuthorityTx returned transaction:', value);
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
            result: getTxIxResume(value)
          });
          transaction = value;
          return true;
        })
        .catch(error => {
          console.error('createTransferVaultAuthorityTx error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Transfer Vault Authority transaction failed', { transcript: transactionLog });
          return false;
        });

      return result;
    }

    const signTx = async (): Promise<boolean> => {
      if (!wallet || !wallet.publicKey) {
        console.error('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot sign transaction! Wallet not found!'
        });
        customLogger.logError('Transfer Vault Authority transaction failed', { transcript: transactionLog });
        return false;
      }
      const signedPublicKey = wallet.publicKey;
      consoleOut('Signing transaction...');
      return await wallet.signTransaction(transaction)
        .then((signed: Transaction) => {
          consoleOut('signTransaction returned a signed transaction:', signed);
          signedTransaction = signed;
          // Try signature verification by serializing the transaction
          try {
            encodedTx = signedTransaction.serialize().toString('base64');
            consoleOut('encodedTx:', encodedTx, 'orange');
          } catch (error) {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SignTransaction,
              currentOperation: TransactionStatus.SignTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
              result: {signer: `${signedPublicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logError('Transfer Vault Authority transaction failed', { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: signedPublicKey.toBase58()}
          });
          return true;
        })
        .catch(error => {
          console.error(error);
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${signedPublicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logError('Transfer Vault Authority transaction failed', { transcript: transactionLog });
          return false;
        });
    }

    const sendTx = async (): Promise<boolean> => {
      if (wallet) {
        return await connection
          .sendEncodedTransaction(encodedTx)
          .then(sig => {
            consoleOut('sendEncodedTransaction returned a signature:', sig);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction
            });
            signature = sig;
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionSuccess),
              result: `signature: ${signature}`
            });
            return true;
          })
          .catch(error => {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
              result: { error, encodedTx }
            });
            customLogger.logError('Transfer Vault Authority transaction failed', { transcript: transactionLog });
            return false;
          });
      } else {
        console.error('Cannot send transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot send transaction! Wallet not found!'
        });
        customLogger.logError('Transfer Vault Authority transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet && selectedAsset) {
      const param = getQueryAccountType();
      const created = await createTx();
      consoleOut('created:', created);
      if (created && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('signed:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            if (sent) {
              enqueueTransactionConfirmation({
                signature: signature,
                operationType: OperationType.SetAssetAuthority,
                finality: "confirmed",
                txInfoFetchStatus: "fetching",
                loadingTitle: 'Confirming transaction',
                loadingMessage: "Transferring ownership",
                completedTitle: 'Transaction confirmed',
                completedMessage: `Asset ${selectedAsset.name} successfully transferred to ${shortenAddress(data.selectedAuthority)}`
              });
              setTransactionStatus({
                lastOperation: transactionStatus.currentOperation,
                currentOperation: TransactionStatus.TransactionFinished
              });
              setIsTransferVaultAuthorityModalVisible(false);
              param === "multisig" && showNotificationByType("info");
            } else {
              openNotification({
                title: t('notifications.error-title'),
                description: t('notifications.error-sending-transaction'),
                type: "error"
              });
            }
            resetTransactionStatus();
            setIsBusy(false);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    wallet,
    publicKey,
    connection,
    selectedAsset,
    nativeBalance,
    multisigClient,
    selectedMultisig,
    transactionCancelled,
    transactionFees.mspFlatFee,
    transactionFees.blockchainFee,
    transactionStatus.currentOperation,
    enqueueTransactionConfirmation,
    clearTxConfirmationContext,
    resetTransactionStatus,
    showNotificationByType,
    setTransactionStatus,
    getQueryAccountType,
    t
  ]);

  // Delete asset modal
  const canDeleteVault = useCallback((): boolean => {
    
    const isTxPendingApproval = (tx: MultisigTransaction) => {
      if (tx) {
        if (tx.status === MultisigTransactionStatus.Active) {
          return true;
        }
      }
      return false;
    };

    const isTxPendingExecution = (tx: MultisigTransaction) => {
      if (tx) {
        if (tx.status === MultisigTransactionStatus.Passed) {
          return true;
        }
      }
      return false;
    };

    if (selectedAsset && (!multisigPendingTxs || multisigPendingTxs.length === 0)) {
      return true;
    }
    
    const found = multisigPendingTxs.find(tx => tx.operation === OperationType.DeleteAsset && (isTxPendingApproval(tx) || isTxPendingExecution(tx)));

    return found ? false : true;

  }, [selectedAsset, multisigPendingTxs]);

  const [isDeleteVaultModalVisible, setIsDeleteVaultModalVisible] = useState(false);
  const showDeleteVaultModal = useCallback(() => {
    setIsDeleteVaultModalVisible(true);
  }, []);

  const onAcceptDeleteVault = (data: any) => {
    consoleOut('deleteVault data:', data, 'blue');
    onExecuteCloseAssetTx(data);
  };

  const onExecuteCloseAssetTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    let multisigAuth = '';
    const transactionLog: any[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const closeAssetTx = async (inputAsset: UserTokenAccount, data: any) => {

      if (!publicKey || !inputAsset || !selectedMultisig || !multisigClient || !inputAsset.publicAddress) { 
        console.error("I do not have anything, review");
        return null;
      }

      if (!inputAsset.owner || !selectedMultisig.authority.equals(new PublicKey(inputAsset.owner))) {
        throw Error("Invalid asset owner");
      }

      multisigAuth = selectedMultisig.authority.toBase58();

      const closeIx = Token.createCloseAccountInstruction(
        TOKEN_PROGRAM_ID,
        new PublicKey(inputAsset.publicAddress as string),
        publicKey,
        new PublicKey(inputAsset.owner as string),
        []
      );

      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
        publicKey,
        data.title === "" ? "Close asset" : data.title,
        "", // description
        new Date(expirationTime * 1_000),
        OperationType.DeleteAsset,
        selectedMultisig.id,
        closeIx.programId,
        closeIx.keys,
        closeIx.data
      );

      return tx;
    }

    const createTx = async (): Promise<boolean> => {

      if (!publicKey || !selectedAsset || !selectedMultisig) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Delete Vault transaction failed', { transcript: transactionLog });
        return false;
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      // Create transaction payload for debugging
      const payload = {
        title: data.title,
        asset: selectedAsset,
      };

      consoleOut('data:', payload);
      // Log input data
      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
        inputs: payload
      });

      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
        result: ''
      });

      // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
      // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
      consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${
            getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
          }) to pay for network fees (${
            getTokenAmountAndSymbolByTokenAddress(
              transactionFees.blockchainFee + transactionFees.mspFlatFee, 
              NATIVE_SOL_MINT.toBase58()
            )
          })`
        });
        customLogger.logWarning('Transfer tokens transaction failed', { transcript: transactionLog });
        return false;
      }

      const result =  await closeAssetTx(selectedAsset, data)
        .then((value: any) => {
          if (!value) { return false; }
          consoleOut('deleteVaultTx returned transaction:', value);
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
            result: getTxIxResume(value)
          });
          transaction = value;
          return true;
        })
        .catch(error => {
          console.error('deleteVaultTx error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Delete Vault transaction failed', { transcript: transactionLog });
          return false;
        });

      return result;
    }

    const signTx = async (): Promise<boolean> => {
      if (!wallet || !wallet.publicKey) {
        console.error('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot sign transaction! Wallet not found!'
        });
        customLogger.logError('Delete Vault transaction failed', { transcript: transactionLog });
        return false;
      }
      const signedPublicKey = wallet.publicKey;
      consoleOut('Signing transaction...');
      return await wallet.signTransaction(transaction)
        .then((signed: Transaction) => {
          consoleOut('signTransaction returned a signed transaction:', signed);
          signedTransaction = signed;
          // Try signature verification by serializing the transaction
          try {
            encodedTx = signedTransaction.serialize().toString('base64');
            consoleOut('encodedTx:', encodedTx, 'orange');
          } catch (error) {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SignTransaction,
              currentOperation: TransactionStatus.SignTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
              result: {signer: `${signedPublicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logError('Delete Vault transaction failed', { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: signedPublicKey.toBase58()}
          });
          return true;
        })
        .catch(error => {
          console.error(error);
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${signedPublicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logError('Delete Vault transaction failed', { transcript: transactionLog });
          return false;
        });
    }

    const sendTx = async (): Promise<boolean> => {
      if (wallet) {
        return await connection
          .sendEncodedTransaction(encodedTx)
          .then(sig => {
            consoleOut('sendEncodedTransaction returned a signature:', sig);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction
            });
            signature = sig;
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionSuccess),
              result: `signature: ${signature}`
            });
            return true;
          })
          .catch(error => {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
              result: { error, encodedTx }
            });
            customLogger.logError('Delete Vault transaction failed', { transcript: transactionLog });
            return false;
          });
      } else {
        console.error('Cannot send transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot send transaction! Wallet not found!'
        });
        customLogger.logError('Delete Vault transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet && data) {
      const created = await createTx();
      consoleOut('created:', created);
      if (created && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('signed:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            if (sent) {
              setTransactionStatus({
                lastOperation: transactionStatus.currentOperation,
                currentOperation: TransactionStatus.TransactionFinished
              });
              enqueueTransactionConfirmation({
                signature: signature,
                operationType: OperationType.DeleteAsset,
                finality: "confirmed",
                txInfoFetchStatus: "fetching",
                loadingTitle: 'Confirming transaction',
                loadingMessage: "Deleting asset",
                completedTitle: 'Transaction confirmed',
                completedMessage: 'Asset successfully deleted',
                extras: multisigAuth
              });
              setIsDeleteVaultModalVisible(false);
            } else {
              openNotification({
                title: t('notifications.error-title'),
                description: t('notifications.error-sending-transaction'),
                type: "error"
              });
            }
            resetTransactionStatus();
            setIsBusy(false);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    wallet,
    publicKey,
    connection,
    nativeBalance,
    selectedAsset,
    multisigClient,
    selectedMultisig,
    transactionCancelled,
    transactionFees.mspFlatFee,
    transactionFees.blockchainFee,
    transactionStatus.currentOperation,
    enqueueTransactionConfirmation,
    resetTransactionStatus,
    setTransactionStatus,
    t
  ]);

  const getAllUserV2Treasuries = useCallback(async () => {

    if (!accountAddress || loadingTreasuries || !msp) { return []; }

    const pk = new PublicKey(accountAddress);

    consoleOut('Fetching treasuries for address:', accountAddress, 'orange');
    const treasuries = await msp.listTreasuries(pk, true, false, Category.default);
    consoleOut('getAllUserV2Treasuries ->', treasuries, 'orange');

    return treasuries;

  }, [
    msp,
    loadingTreasuries,
    accountAddress
  ]);

  const refreshTreasuries = useCallback((reset = false) => {

    if (!publicKey || loadingTreasuries) { return; }

    if (msp && ms) {

      setTimeout(() => {
        setLoadingTreasuries(true);
      });

      const treasuryAccumulator: (Treasury | TreasuryInfo)[] = [];
      let treasuriesv1: TreasuryInfo[] = [];
      getAllUserV2Treasuries()
        .then(async (treasuriesv2) => {
          treasuryAccumulator.push(...treasuriesv2);
          const param = getQueryAccountType();
          if (!param || param !== "multisig") {
            try {
              treasuriesv1 = await ms.listTreasuries(publicKey);
            } catch (error) {
              console.error(error);
            }
            treasuryAccumulator.push(...treasuriesv1);
          }

          const autoclosables = treasuryAccumulator.filter(t => t.autoClose);

          setAutocloseTreasuries(autoclosables);

          const streamingAccounts = treasuryAccumulator.filter(t => !t.autoClose);
      
          setTreasuryList(streamingAccounts);
          consoleOut('treasuryList:', streamingAccounts, 'blue');
        })
        .catch(error => {
          console.error(error);
        })
        .finally(() => setLoadingTreasuries(false));
    }

  }, [
    ms,
    msp,
    publicKey,
    loadingTreasuries,
    getAllUserV2Treasuries,
    getQueryAccountType,
  ]);

  const getTreasuryUnallocatedBalance = useCallback((tsry: Treasury | TreasuryInfo, assToken: TokenInfo | undefined) => {
    if (tsry) {
        const decimals = assToken ? assToken.decimals : 9;
        const unallocated = tsry.balance - tsry.allocationAssigned;
        const isNewTreasury = (tsry as Treasury).version && (tsry as Treasury).version >= 2 ? true : false;
        const ub = isNewTreasury
            ? makeDecimal(new BN(unallocated), decimals)
            : unallocated;
        return ub;
    }
    return 0;
  }, []);

  const refreshTreasuriesSummary = useCallback(async () => {

    if (!treasuryList) { return; }

    const resume: UserTreasuriesSummary = {
        totalAmount: 0,
        openAmount: 0,
        lockedAmount: 0,
        totalNet: 0
    };

    for (const treasury of treasuryList) {

        const isNew = (treasury as Treasury).version && (treasury as Treasury).version >= 2
            ? true
            : false;

        const treasuryType = isNew
            ? (treasury as Treasury).treasuryType
            : (treasury as TreasuryInfo).type as TreasuryType;

        const associatedToken = isNew
            ? (treasury as Treasury).associatedToken as string
            : (treasury as TreasuryInfo).associatedTokenAddress as string;

        if (treasuryType === TreasuryType.Open) {
            resume['openAmount'] += 1;
        } else {
            resume['lockedAmount'] += 1;
        }

        let amountChange = 0;

        const token = getTokenByMintAddress(associatedToken as string);

        if (token) {
          const tokenPrice = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);
          const amount = getTreasuryUnallocatedBalance(treasury, token);
          amountChange = amount * tokenPrice;
        }

        resume['totalNet'] += amountChange;
    }

    resume['totalAmount'] += treasuryList.length;

    // Update state
    consoleOut('streamingAccountsSummary:', resume, 'teal');
    setStreamingAccountsSummary(resume);

  }, [
    treasuryList,
    getTreasuryUnallocatedBalance,
    getTokenPriceByAddress,
    getTokenPriceBySymbol,
    getTokenByMintAddress,
  ]);

  const refreshIncomingStreamSummary = useCallback(async () => {

    if (!ms || !msp || !publicKey || (!streamListv1 && !streamListv2)) {
      return;
    }

    const resume: StreamsSummary = {
      totalNet: 0,
      incomingAmount: 0,
      outgoingAmount: 0,
      totalAmount: 0
    };

    const treasurer = accountAddress
      ? new PublicKey(accountAddress)
      : publicKey;

    const updatedStreamsv1 = await ms.refreshStreams(streamListv1 || [], treasurer);
    const updatedStreamsv2 = await msp.refreshStreams(streamListv2 || [], treasurer);

    for (const stream of updatedStreamsv1) {

      const isIncoming = stream.beneficiaryAddress && stream.beneficiaryAddress === treasurer.toBase58()
        ? true
        : false;

      // Get refreshed data
      const freshStream = await ms.refreshStream(stream) as StreamInfo;
      if (!freshStream || freshStream.state !== STREAM_STATE.Running) { continue; }

      const token = getTokenByMintAddress(freshStream.associatedToken as string);

      if (token) {
        const tokenPrice = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);

        if (isIncoming) {
          resume['totalNet'] = resume['totalNet'] + ((freshStream.escrowVestedAmount || 0) * tokenPrice);
        }
      }
    }

    resume['totalAmount'] = updatedStreamsv1.length;

    for (const stream of updatedStreamsv2) {

      const isIncoming = stream.beneficiary && stream.beneficiary === treasurer.toBase58()
        ? true
        : false;

      // Get refreshed data
      const freshStream = await msp.refreshStream(stream) as Stream;
      if (!freshStream || freshStream.status !== STREAM_STATUS.Running) { continue; }

      const token = getTokenByMintAddress(freshStream.associatedToken as string);

      if (token) {
        const tokenPrice = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);
        const decimals = token.decimals || 6;
        const amount = freshStream.withdrawableAmount;
        const amountChange = parseFloat((amount / 10 ** decimals).toFixed(decimals)) * tokenPrice;

        if (isIncoming) {
          resume['totalNet'] += amountChange;
        }
      }
    }

    resume['totalAmount'] += updatedStreamsv2.length;

    // Update state
    setIncomingStreamsSummary(resume);

  }, [
    ms,
    msp,
    publicKey,
    streamListv1,
    streamListv2,
    accountAddress,
    getTokenPriceByAddress,
    getTokenByMintAddress,
    getTokenPriceBySymbol,
  ]);

  const refreshOutgoingStreamSummary = useCallback(async () => {

    if (!ms || !msp || !publicKey || (!streamListv1 && !streamListv2)) {
      return;
    }

    const resume: StreamsSummary = {
      totalNet: 0,
      incomingAmount: 0,
      outgoingAmount: 0,
      totalAmount: 0
    };

    const treasurer = accountAddress
      ? new PublicKey(accountAddress)
      : publicKey;

    const updatedStreamsv1 = await ms.refreshStreams(streamListv1 || [], treasurer);
    const updatedStreamsv2 = await msp.refreshStreams(streamListv2 || [], treasurer);

    for (const stream of updatedStreamsv1) {

      const isIncoming = stream.beneficiaryAddress && stream.beneficiaryAddress === treasurer.toBase58()
        ? true
        : false;

      // Get refreshed data
      const freshStream = await ms.refreshStream(stream) as StreamInfo;
      if (!freshStream || freshStream.state !== STREAM_STATE.Running) { continue; }

      const token = getTokenByMintAddress(freshStream.associatedToken as string);

      if (token) {
        const tokenPrice = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);

        if (!isIncoming) {
          resume['totalNet'] = resume['totalNet'] + ((freshStream.escrowUnvestedAmount || 0) * tokenPrice);
        }
      }
    }

    resume['totalAmount'] = updatedStreamsv1.length;

    for (const stream of updatedStreamsv2) {

      const isIncoming = stream.beneficiary && stream.beneficiary === treasurer.toBase58()
        ? true
        : false;

      // Get refreshed data
      const freshStream = await msp.refreshStream(stream) as Stream;
      if (!freshStream || freshStream.status !== STREAM_STATUS.Running) { continue; }

      const token = getTokenByMintAddress(freshStream.associatedToken as string);

      if (token) {
        const tokenPrice = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);
        const decimals = token.decimals || 6;
        const amount = freshStream.fundsLeftInStream;
        const amountChange = parseFloat((amount / 10 ** decimals).toFixed(decimals)) * tokenPrice;

        if (!isIncoming) {
          resume['totalNet'] += amountChange;
        }
      }
    }

    resume['totalAmount'] += updatedStreamsv2.length;

    // Update state
    setOutgoingStreamsSummary(resume);
  }, [
    ms,
    msp,
    publicKey,
    streamListv1,
    streamListv2,
    accountAddress,
    getTokenPriceByAddress,
    getTokenPriceBySymbol,
    getTokenByMintAddress,
  ]);

  const clearStateData = useCallback(() => {
    clearStreams();
    setPathParamAsset('');
    setPathParamStreamId('');
    setPathParamTreasuryId('');
    setPathParamStreamingTab('');
    setAccountTokens([]);
    setTreasuryList([]);
    setAutocloseTreasuries([]);
    setIncomingStreamList([]);
    setOutgoingStreamList([]);
    setStreamingAccountCombinedList([]);
    setStreamingAccountsSummary(INITIAL_TREASURIES_SUMMARY);
    setIncomingAmount(0);
    setOutgoingAmount(0);
    setTotalStreamsAmount(0);
    setTotalAccountBalance(0);
    setIncomingStreamsSummary(initialSummary);
    setOutgoingStreamsSummary(initialSummary);
    setTotalTokenAccountsValue(0);
    setStreamsSummary(initialSummary);
    setCanShowStreamingAccountBalance(false);
  }, [clearStreams, setStreamsSummary]);

  /////////////////////
  // Data management //
  /////////////////////

  // Keep account balance updated
  useEffect(() => {

    const getAccountBalance = (): number => {
      return (account?.lamports || 0) / LAMPORTS_PER_SOL;
    }

    if (account?.lamports !== previousBalance || !nativeBalance) {
      // Refresh token balance
      refreshTokenBalance();
      setNativeBalance(getAccountBalance());
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [
    account,
    nativeBalance,
    previousBalance,
    refreshTokenBalance
  ]);

  // Load treasuries when account address changes
  useEffect(() => {
    if (publicKey && accountAddress && address && !treasuriesLoaded && accountAddress === address) {

      setTreasuriesLoaded(true);

      if (!previousRoute.startsWith('/accounts')) {
        clearStateData();
      }
      consoleOut('Loading treasuries...', 'accountAddress changed!', 'purple');
      refreshTreasuries(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountAddress, address, previousRoute, publicKey, treasuriesLoaded]);

  // Treasury list refresh timeout
  useEffect(() => {
    let timer: any;

    if (publicKey && treasuriesLoaded && !customStreamDocked) {
      timer = setInterval(() => {
        consoleOut(`Refreshing treasuries past ${ONE_MINUTE_REFRESH_TIMEOUT / 60 / 1000}min...`);
        refreshTreasuries(false);
      }, ONE_MINUTE_REFRESH_TIMEOUT);
    }

    return () => clearInterval(timer);
  }, [
    publicKey,
    accountAddress,
    treasuriesLoaded,
    loadingTreasuries,
    customStreamDocked,
    refreshTreasuries
  ]);

  // Detect XS screen
  useEffect(() => {
    if (width < 576) {
      setIsXsDevice(true);
    } else {
      setIsXsDevice(false);
    }
  }, [width]);

  // Build CTAs
  useEffect(() => {
    if (!selectedAsset) { return; }

    const numMaxCtas = isXsDevice ? 2 : 5;
    const isCustomAsset = selectedAsset.name === 'Custom account' ? true : false;
    const actions: AssetCta[] = [];
    let ctaItems = 0;

    // Send
    actions.push({
      action: MetaInfoCtaAction.Send,
      isVisible: isCustomAsset ? false : true,
      caption: 'Send',
      disabled: !isInspectedAccountTheConnectedWallet(),
      uiComponentType: 'button',
      uiComponentId: `button-${MetaInfoCtaAction.Send}`,
      tooltip: '',
      callBack: onSendAsset
    });
    ctaItems++;

    // UnwrapSol
    if (isInspectedAccountTheConnectedWallet() && isSelectedAssetWsol() && wSolBalance > 0) {
      actions.push({
        action: MetaInfoCtaAction.UnwrapSol,
        caption: 'Unwrap',
        isVisible: isInspectedAccountTheConnectedWallet() && isSelectedAssetWsol(),
        uiComponentType: 'button',
        disabled: false,
        uiComponentId: `button-${MetaInfoCtaAction.UnwrapSol}`,
        tooltip: '',
        callBack: showUnwrapSolModal
      });
      ctaItems++;
    }

    // Buy
    actions.push({
      action: MetaInfoCtaAction.Buy,
      caption: 'Buy',
      isVisible: !isSelectedAssetWsol(),
      uiComponentType: ctaItems < numMaxCtas ? 'button' : 'menuitem',
      disabled: false,
      uiComponentId: `${ctaItems < numMaxCtas ? 'button' : 'menuitem'}-${MetaInfoCtaAction.Buy}`,
      tooltip: '',
      callBack: showDepositOptionsModal
    });
    ctaItems++;

    // Deposit
    actions.push({
      action: MetaInfoCtaAction.Deposit,
      caption: 'Deposit',
      isVisible: true,
      uiComponentType: ctaItems < numMaxCtas ? 'button' : 'menuitem',
      disabled: false,
      uiComponentId: `${ctaItems < numMaxCtas ? 'button' : 'menuitem'}-${MetaInfoCtaAction.Deposit}`,
      tooltip: '',
      callBack: showReceiveSplOrSolModal
    });
    ctaItems++;

    // Exchange
    actions.push({
      action: MetaInfoCtaAction.Exchange,
      caption: 'Exchange',
      isVisible: isInspectedAccountTheConnectedWallet() && !isSelectedAssetWsol(),
      uiComponentType: ctaItems < numMaxCtas ? 'button' : 'menuitem',
      disabled: false,
      uiComponentId: `${ctaItems < numMaxCtas ? 'button' : 'menuitem'}-${MetaInfoCtaAction.Exchange}`,
      tooltip: '',
      callBack: onExchangeAsset
    });
    ctaItems++;

    // Invest
    actions.push({
      action: MetaInfoCtaAction.Invest,
      caption: 'Invest',
      isVisible: investButtonEnabled() && !isSelectedAssetWsol(),
      uiComponentType: ctaItems < numMaxCtas ? 'button' : 'menuitem',
      disabled: false,
      uiComponentId: `${ctaItems < numMaxCtas ? 'button' : 'menuitem'}-${MetaInfoCtaAction.Invest}`,
      tooltip: '',
      callBack: handleGoToInvestClick
    });
    ctaItems++;

    // Wrap
    if (isInspectedAccountTheConnectedWallet() && isSelectedAssetNativeAccount() && isWhitelisted) {
      actions.push({
        action: MetaInfoCtaAction.WrapSol,
        caption: 'Wrap',
        isVisible: true,
        uiComponentType: ctaItems < numMaxCtas ? 'button' : 'menuitem',
        disabled: false,
        uiComponentId: `${ctaItems < numMaxCtas ? 'button' : 'menuitem'}-${MetaInfoCtaAction.WrapSol}`,
        tooltip: '',
        callBack: showWrapSolModal
      });
      ctaItems++;
    }

    // Refresh asset
    actions.push({
      action: MetaInfoCtaAction.Refresh,
      caption: 'Refresh asset',
      isVisible: true,
      uiComponentType: 'menuitem',
      disabled: false,
      uiComponentId: `menuitem-${MetaInfoCtaAction.Refresh}`,
      tooltip: '',
      callBack: reloadSwitch
    });

    // Merge token accounts
    if (isInspectedAccountTheConnectedWallet() && canActivateMergeTokenAccounts()) {
      actions.push({
        action: MetaInfoCtaAction.MergeAccounts,
        caption: t('assets.merge-accounts-cta'),
        isVisible: true,
        uiComponentType: 'menuitem',
        disabled: false,
        uiComponentId: `menuitem-${MetaInfoCtaAction.MergeAccounts}`,
        tooltip: '',
        callBack: activateTokenMerge
      });
    }

    // Close asset
    // if (inspectedAccountType && inspectedAccountType === "multisig") {
    //   actions.push({
    //     action: MetaInfoCtaAction.Close,
    //     caption: 'Close asset',
    //     isVisible: true,
    //     uiComponentType: 'menuitem',
    //     disabled: isTxInProgress() || !canDeleteVault() || !isDeleteAssetValid(),
    //     uiComponentId: `menuitem-${MetaInfoCtaAction.Close}`,
    //     tooltip: '',
    //     callBack: showDeleteVaultModal
    //   });
    // }

    // Close account
    actions.push({
      action: (inspectedAccountType && inspectedAccountType === "multisig") ? MetaInfoCtaAction.Close : MetaInfoCtaAction.CloseAccount,
      caption: 'Close account',
      isVisible: true,
      uiComponentType: 'menuitem',
      disabled: ((inspectedAccountType === "multisig") && (isTxInProgress() || !canDeleteVault() || !isDeleteAssetValid())),
      uiComponentId: (inspectedAccountType && inspectedAccountType === "multisig") ? `menuitem-${MetaInfoCtaAction.Close}` : `menuitem-${MetaInfoCtaAction.CloseAccount}`,
      tooltip: '',
      callBack: (inspectedAccountType && inspectedAccountType === "multisig") ? showDeleteVaultModal : showCloseAssetModal
    });

    setAssetCtas(actions);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isXsDevice,
    wSolBalance,
    selectedAsset,
    isInspectedAccountTheConnectedWallet,
    isSelectedAssetNativeAccount,
    isSelectedAssetWsol,
    investButtonEnabled,
  ]);  

  // Enable deep-linking when isPageLoaded - Parse and save query params as needed
  useEffect(() => {
    if (!isPageLoaded || !publicKey) { return; }

    if (address) {
      consoleOut('Route param address:', address, 'crimson');
      setAccountAddress(address);
    } else {
      if (accountAddress) {
        setAccountAddress(publicKey.toBase58());
      }
    }

    if (asset) {
      consoleOut('Route param asset:', asset, 'crimson');
      setPathParamAsset(asset);
    }

    if (streamingTab) {
      consoleOut('Route param streamingTab:', streamingTab, 'crimson');
      setPathParamStreamingTab(streamingTab);
    }

    if (streamId) {
      consoleOut('Route param streamId:', streamId, 'crimson');
      setPathParamStreamId(streamId);
    }

    if (treasuryId) {
      consoleOut('Route param treasuryId:', treasuryId, 'crimson');
      setPathParamTreasuryId(treasuryId);
    } else {
      setPathParamTreasuryId("");
    }

    // The category is inferred from the route path
    if (location.pathname.indexOf('/assets') !== -1) {
      consoleOut('Setting category:', 'assets', 'crimson');
      setSelectedCategory("assets");
      if (!asset) {
        setPathParamAsset('');
      }
      if (autoOpenDetailsPanel) {
        setDetailsPanelOpen(true);
      }
    } else if (location.pathname.indexOf('/streaming') !== -1) {
      consoleOut('Setting category:', 'streaming', 'crimson');
      setSelectedCategory("streaming");
      if (!streamId) {
        setPathParamStreamId('');
      }
      if (autoOpenDetailsPanel) {
        setDetailsPanelOpen(true);
      }
    } else {
      setSelectedCategory("other-assets");
    }

    let accountTypeInQuery: string | null = null;
    // Get the account-type if passed-in
    if (searchParams) {
      accountTypeInQuery = searchParams.get('account-type');
      if (accountTypeInQuery) {
        consoleOut('account-type:', searchParams.get('account-type'), 'crimson');
      }
    }

    switch (accountTypeInQuery as InspectedAccountType) {
      case "multisig":
        setInspectedAccountType("multisig");
        break;
      case "wallet":
        setInspectedAccountType("wallet");
        break;
      default:
        setInspectedAccountType("wallet");
        break;
    }

  }, [
    asset,
    address,
    streamId,
    publicKey,
    treasuryId,
    isPageLoaded,
    streamingTab,
    searchParams,
    accountAddress,
    detailsPanelOpen,
    location.pathname,
    autoOpenDetailsPanel,
    setDetailsPanelOpen,
    setAccountAddress,
  ]);

  // Load streams on entering /accounts
  useEffect(() => {
    if (!publicKey || !accountAddress) { return; }

    if (address && accountAddress === address) {
      consoleOut('Loading streams...', '', 'orange');
      refreshStreamList();
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountAddress, address, publicKey]);

  // Ensure tokens Load on entering /accounts
  useEffect(() => {
    if (!isPageLoaded || !publicKey || !accountAddress) { return; }

    setIsPageLoaded(false);
    setTransactions([]);

    setTimeout(() => {
      if (!shouldLoadTokens) {
        setShouldLoadTokens(true);
      }
    }, 1000);
  }, [
    publicKey,
    isPageLoaded,
    accountAddress,
    shouldLoadTokens,
    setShouldLoadTokens,
    setTransactions,
  ]);

  // Fetch all the owned token accounts on demmand via setShouldLoadTokens(true)
  // Also, do this after any Tx is completed in places where token balances were indeed changed)
  useEffect(() => {

    if (!connection ||
        !publicKey ||
        !accountAddress ||
        !shouldLoadTokens ||
        !userTokens ||
        userTokens.length === 0 ||
        !splTokenList ||
        splTokenList.length === 0 ||
        !coinPrices ||
        (selectedCategory !== "assets" && accountTokens && accountTokens.length > 0) ||
        isPageLoaded
    ) {
      return;
    }

    const timeout = setTimeout(() => {
      setShouldLoadTokens(false);
      setTokensLoaded(false);

      const meanTokensCopy = new Array<UserTokenAccount>();
      const intersectedList = new Array<UserTokenAccount>();

      const userTokensCopy = JSON.parse(JSON.stringify(userTokens)) as UserTokenAccount[];
      const splTokensCopy = JSON.parse(JSON.stringify(splTokenList)) as UserTokenAccount[];
      const pk = new PublicKey(accountAddress);

      // Fetch SOL balance.
      connection.getBalance(pk)
        .then(solBalance => {

          const sol: UserTokenAccount = {
            address: NATIVE_SOL.address,
            balance: solBalance / LAMPORTS_PER_SOL,
            chainId: 0,
            decimals: NATIVE_SOL.decimals,
            name: NATIVE_SOL.name,
            symbol: NATIVE_SOL.symbol,
            publicAddress: accountAddress,
            tags: NATIVE_SOL.tags,
            logoURI: NATIVE_SOL.logoURI,
            valueInUsd: (solBalance / LAMPORTS_PER_SOL) * getTokenPriceBySymbol('SOL')
          };

          setMultisigSolBalance(solBalance / LAMPORTS_PER_SOL);

          fetchAccountTokens(connection, pk)
            .then(accTks => {
              if (accTks) {

                consoleOut('fetched accountTokens:', accTks.map(i => {
                  return {
                    pubAddress: i.pubkey.toBase58(),
                    mintAddress: i.parsedInfo.mint,
                    balance: i.parsedInfo.tokenAmount.uiAmount || 0
                  };
                }), 'blue');

                setUserOwnedTokenAccounts(accTks);

                // Group the token accounts by mint.
                const groupedTokenAccounts = new Map<string, AccountTokenParsedInfo[]>();
                const tokenGroups = new Map<string, AccountTokenParsedInfo[]>();
                accTks.forEach((ta) => {
                  const key = ta.parsedInfo.mint;
                  const info = getTokenByMintAddress(key);
                  const updatedTa = Object.assign({}, ta, {
                    description: info ? `${info.name} (${info.symbol})` : ''
                  });
                  if (groupedTokenAccounts.has(key)) {
                    const current = groupedTokenAccounts.get(key) as AccountTokenParsedInfo[];
                    current.push(updatedTa);
                  } else {
                    groupedTokenAccounts.set(key, [updatedTa]);
                  }
                });

                // Keep only groups with more than 1 item
                groupedTokenAccounts.forEach((item, key) => {
                  if (item.length > 1) {
                    tokenGroups.set(key, item);
                  }
                });

                // Save groups for possible further merging
                if (tokenGroups.size > 0) {
                  consoleOut('This account owns duplicated tokens...', '', 'blue');
                  consoleOut('tokenGroups:', tokenGroups, 'blue');
                  setTokenAccountGroups(tokenGroups);
                } else {
                  setTokenAccountGroups(undefined);
                }

                // Build meanTokensCopy including the MeanFi pinned tokens
                userTokensCopy.forEach(item => {
                  meanTokensCopy.push(item);
                });
                // Now add all other items but excluding those in userTokens
                splTokensCopy.forEach(item => {
                  if (!userTokens.includes(item)) {
                    meanTokensCopy.push(item);
                  }
                });

                // Create a list containing tokens for the user owned token accounts
                // Intersected output list
                accTks.forEach(item => {
                  // Loop through the user token accounts and add the token account to the list: intersectedList
                  // If it is not already on the list (diferentiate token accounts of the same mint)

                  const isTokenAccountInTheList = intersectedList.some(t => t.address === item.parsedInfo.mint);
                  const tokenFromMeanTokensCopy = meanTokensCopy.find(t => t.address === item.parsedInfo.mint);

                  if (tokenFromMeanTokensCopy && !isTokenAccountInTheList) {
                    tokenFromMeanTokensCopy.owner = item.parsedInfo.owner;
                    intersectedList.push(tokenFromMeanTokensCopy);
                  }
                });

                intersectedList.unshift(sol);

                // Update balances in the mean token list
                accTks.forEach(item => {
                  // Locate the token in intersectedList
                  const tokenIndex = intersectedList.findIndex(i => i.address === item.parsedInfo.mint);
                  if (tokenIndex !== -1) {
                    const price = getTokenPriceByAddress(intersectedList[tokenIndex].address) || getTokenPriceBySymbol(intersectedList[tokenIndex].symbol);
                    const balance = item.parsedInfo.tokenAmount.uiAmount || 0;
                    const valueInUSD = balance * price;
                    // If we didn't already filled info for this associated token address
                    if (!intersectedList[tokenIndex].publicAddress) {
                      // Add it
                      intersectedList[tokenIndex].publicAddress = item.pubkey.toBase58();
                      intersectedList[tokenIndex].balance = item.parsedInfo.tokenAmount.uiAmount || 0;
                      intersectedList[tokenIndex].valueInUsd = valueInUSD;
                    } else if (intersectedList[tokenIndex].publicAddress !== item.pubkey.toBase58()) {
                      // If we did and the publicAddress is different/new then duplicate this item with the new info
                      const newItem = Object.assign({}, intersectedList[tokenIndex]) as UserTokenAccount;
                      newItem.publicAddress = item.pubkey.toBase58();
                      newItem.balance = item.parsedInfo.tokenAmount.uiAmount || 0;
                      newItem.valueInUsd = valueInUSD;
                      intersectedList.splice(tokenIndex + 1, 0, newItem);
                    }
                  }
                });

                // Update displayIndex and isAta flag
                intersectedList.forEach(async (item: UserTokenAccount, index: number) => {
                  item.displayIndex = index;
                  item.isAta = await updateAtaFlag(item);
                });

                // Sort by valueInUsd and then by token balance and then by token name
                intersectedList.sort((a, b) => {
                  if((a.valueInUsd || 0) > (b.valueInUsd || 0)){
                     return -1;
                  } else if((a.valueInUsd || 0) < (b.valueInUsd || 0)){
                     return 1;
                  } else {
                    return (b.balance || 0) < (a.balance || 0) ? -1 : 1;
                  }
                });

                const custom: UserTokenAccount[] = [];
                // Build a list with all owned token accounts not already in intersectedList as custom tokens
                accTks.forEach((item: AccountTokenParsedInfo, index: number) => {
                  if (!intersectedList.some(t => t.address === item.parsedInfo.mint)) {
                    const balance = item.parsedInfo.tokenAmount.uiAmount || 0;
                    const price = getTokenPriceByAddress(item.parsedInfo.mint);
                    const valueInUsd = balance * price;
                    const customToken: UserTokenAccount = {
                      address: item.parsedInfo.mint,
                      balance,
                      chainId: 0,
                      displayIndex: intersectedList.length + 1 + index,
                      decimals: item.parsedInfo.tokenAmount.decimals,
                      name: 'Custom account',
                      symbol: shortenAddress(item.parsedInfo.mint),
                      publicAddress: item.pubkey.toBase58(),
                      tags: undefined,
                      logoURI: undefined,
                      valueInUsd
                    };
                    custom.push(customToken);
                  }
                });

                // Sort by valueInUsd and then by token balance
                custom.sort((a, b) => {
                  if((a.valueInUsd || 0) > (b.valueInUsd || 0)){
                     return -1;
                  } else if((a.valueInUsd || 0) < (b.valueInUsd || 0)){
                     return 1;
                  } else {
                    return (b.balance || 0) < (a.balance || 0) ? -1 : 1;
                  }
                });

                // Finally add all owned token accounts as custom tokens
                const finalList = intersectedList.concat(custom);

                // Report in the console for debugging
                // if (isLocal()) {
                //   const tokenTable: any[] = [];
                //   finalList.forEach((item: UserTokenAccount, index: number) => tokenTable.push({
                //       pubAddress: item.publicAddress ? shortenAddress(item.publicAddress, 6) : null,
                //       mintAddress: shortenAddress(item.address),
                //       symbol: item.symbol,
                //       decimals: item.decimals,
                //       balance: formatThousands(item.balance || 0, item.decimals, item.decimals),
                //       price: getTokenPriceBySymbol(item.symbol),
                //       valueInUSD: toUsCurrency(item.valueInUsd) || "$0.00"
                //     })
                //   );
                //   console.table(tokenTable);
                // }

                // Update the state
                setAccountTokens(finalList);
                setTokensLoaded(true);

              } else {
                pinnedTokens.forEach((item, index) => {
                  item.valueInUsd = 0;
                });
                setAccountTokens(pinnedTokens);
                selectAsset(pinnedTokens[0]);
                setTokensLoaded(true);
                consoleOut('No tokens found in account!', '', 'red');

              }
            })
            .catch(error => {
              console.error(error);
              setAccountTokens(pinnedTokens);
              setTokensLoaded(true);
              selectAsset(pinnedTokens[0], true);
            });
        })
        .catch(error => {
          console.error(error);
        });
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    publicKey,
    connection,
    coinPrices,
    userTokens,
    isPageLoaded,
    pinnedTokens,
    splTokenList,
    pathParamAsset,
    selectedAsset,
    accountTokens,
    accountAddress,
    shouldLoadTokens,
    selectedCategory,
    getTokenPriceByAddress,
    getTokenByMintAddress,
    getTokenPriceBySymbol,
    setShouldLoadTokens,
    navigateToAsset,
    updateAtaFlag,
    selectAsset,
  ]);

  // Load the transactions when signaled
  useEffect(() => {

    if (!connection || !publicKey || !selectedAsset || !tokensLoaded || !shouldLoadTransactions || selectedCategory !== "assets") { return; }

    if (!loadingTransactions && accountAddress) {

      setShouldLoadTransactions(false);
      setLoadingTransactions(true);

      // Get the address to scan and ensure there is one
      const pk = getScanAddress(selectedAsset as UserTokenAccount);
      consoleOut('pk:', pk ? pk.toBase58() : 'NONE', 'blue');
      if (!pk) {
        consoleOut('Asset has no public address, aborting...', '', 'goldenrod');
        setTransactions(undefined);
        setStatus(FetchStatus.Fetched);
        return;
      }

      let options = {
        limit: TRANSACTIONS_PER_PAGE
      }

      if (lastTxSignature) {
        options = Object.assign(options, {
          before: lastTxSignature
        });
      }

      fetchAccountHistory(
        connection,
        pk,
        options,
        true
      )
      .then(history => {
        consoleOut('history:', history, 'blue');
        setTransactions(history.transactionMap, true);
        setStatus(FetchStatus.Fetched);

        if (history.transactionMap && history.transactionMap.length && pk.toBase58() === accountAddress) {
          const validItems = getSolAccountItems(history.transactionMap);
          const nativeAccountTxItems = solAccountItems + validItems;
          setSolAccountItems(nativeAccountTxItems);
          // If the valid items are less than 10, get more (only once after the first fetch)
          // Only for the native account where some Txs might have no balance changes
          // if (!history.before && nativeAccountTxItems < 10) {
          //   setTimeout(() => {
          //     consoleOut('Few items, loading more...', '', 'green');
          //     startSwitch();
          //   }, 100);
          // }
        }

      })
      .catch(error => {
        console.error(error);
        setStatus(FetchStatus.FetchFailed);
      })
      .finally(() => setLoadingTransactions(false));
    }

  }, [
    publicKey,
    connection,
    transactions,
    tokensLoaded,
    selectedAsset,
    accountAddress,
    lastTxSignature,
    solAccountItems,
    selectedCategory,
    loadingTransactions,
    shouldLoadTransactions,
    getSolAccountItems,
    setTransactions,
    getScanAddress,
    startSwitch
  ]);

  // Keep track of wSOL balance
  useEffect(() => {
    if (tokensLoaded && accountTokens && accountTokens.length > 0) {
      const wSol = accountTokens.find(t => t.address === WRAPPED_SOL_MINT_ADDRESS);
      if (wSol) {
        setWsolBalance(wSol.balance || 0);
      }
    }
  }, [accountTokens, tokensLoaded]);

  // Hook on the wallet connect/disconnect
  useEffect(() => {

    if (previousWalletConnectState !== connected) {
      // User is connecting
      if (!previousWalletConnectState && connected && publicKey) {
        consoleOut('Preset account address...', publicKey.toBase58(), 'green');
        setAddAccountPanelOpen(false);
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'blue');
        confirmationEvents.off(EventType.TxConfirmSuccess, onTxConfirmed);
        consoleOut('Unsubscribed from event txConfirmed!', '', 'blue');
        confirmationEvents.off(EventType.TxConfirmTimeout, onTxTimedout);
        consoleOut('Unsubscribed from event onTxTimedout!', '', 'blue');
        setCanSubscribe(true);
        if (streamDetail) {
          setStreamDetail(undefined);
        }
        setAddAccountPanelOpen(false);
      }
    }

  }, [
    publicKey,
    connected,
    streamDetail,
    previousWalletConnectState,
    setAddAccountPanelOpen,
    setStreamsSummary,
    setStreamDetail,
    onTxConfirmed,
    onTxTimedout,
  ]);

  // Preset token based on url param asset
  useEffect(() => {
    if (asset && accountTokens && accountTokens.length > 0) {
      if (!selectedAsset || (selectedAsset && selectedAsset.publicAddress !== asset)) {
        consoleOut('Presetting token based on url...', '', 'crimson');
        const inferredAsset = accountTokens.find(t => t.publicAddress === asset);
        if (inferredAsset) {
          selectAsset(inferredAsset);
        }
      }
    } else if (!asset && accountTokens && accountTokens.length > 0) {
      if (!selectedAsset) {
        consoleOut('Presetting first token in the list...', '', 'crimson');
        selectAsset(accountTokens[0]);
      } else {
        const inferredAsset = accountTokens.find(t => t.publicAddress === accountAddress);
        if (inferredAsset) {
          selectAsset(inferredAsset);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountAddress, accountTokens, asset]);

  // Preset the selected streaming account from the list if provided in path param (treasuryId)
  useEffect(() => {
    if (!publicKey || !treasuryList || treasuryList.length === 0) {
      setTreasuryDetail(undefined);
    }

    if (pathParamTreasuryId && treasuryId && pathParamTreasuryId === treasuryId) {
      const item = treasuryList.find(s => s.id as string === pathParamTreasuryId);
      consoleOut('treasuryDetail:', item, 'darkgreen');
      if (item) {
        setTreasuryDetail(item);
      }
    }
  }, [pathParamTreasuryId, publicKey, treasuryDetail, treasuryId, treasuryList]);

  // Preset the selected stream from the list if provided in path param (streamId)
  useEffect(() => {
    if (publicKey && streamList && streamList.length > 0 && pathParamStreamId && (!streamDetail || streamDetail.id !== pathParamStreamId)) {
      const item = streamList.find(s => s.id as string === pathParamStreamId);
      consoleOut('streamList:', streamList, 'darkgreen');
      consoleOut('item:', item, 'darkgreen');
      if (item) {
        setStreamDetail(item);
        setActiveStream(item);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathParamStreamId, publicKey, streamDetail, streamList]);

  // Create a combined list of streaming accounts with its 
  useEffect(() => {
    if (!treasuryList || !streamList || !treasuriesLoaded) { return; }

    const getFinalList = async (list: (Treasury | TreasuryInfo)[]) => {
      const finalList: CombinedStreamingAccounts[] = [];

      if (list.length === 0) {
        return finalList;
      }

      for (const item of list) {
        const treasuryPk = new PublicKey(item.id as string);
        const isNewTreasury = (item as Treasury).version && (item as Treasury).version >= 2
          ? true
          : false;

        const itemList = await getStreamingAccountStreams(treasuryPk, isNewTreasury);
        if (itemList) {
          const listItem: CombinedStreamingAccounts = {
            streams: itemList,
            treasury: item as any
          };
          finalList.push(listItem);
        }
      }

      return finalList;
    }

    setLoadingCombinedStreamingList(true);

    const sortedStreamingAccountList = treasuryList.map((streaming) => streaming).sort((a, b) => {
      const vA1 = a as TreasuryInfo;
      const vA2 = a as Treasury;
      const vB1 = b as TreasuryInfo;
      const vB2 = b as Treasury;

      const isNewTreasury = ((vA2.version && vA2.version >= 2) && (vB2.version && vB2.version >= 2))
        ? true
        : false;

      if (isNewTreasury) {
        return vB2.totalStreams - vA2.totalStreams;
      } else {
        return vB1.streamsAmount - vA1.streamsAmount;
      }
    });

    getFinalList(sortedStreamingAccountList)
      .then(items => {
        consoleOut('streamingAccountCombinedList:', items, "blue");

        setStreamingAccountCombinedList(items);
      })
      .catch((error) => {
        console.log(error);
        setStreamingAccountCombinedList([]);
        consoleOut('streamingAccountCombinedList:', [], "blue");
      })
      .finally(() => setLoadingCombinedStreamingList(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamList, treasuriesLoaded, treasuryList]);

  // Set the list of incoming and outgoing streams
  useEffect(() => {
    if (!connection || !publicKey || !streamList || !autocloseTreasuries) {
      setIncomingStreamList(undefined);
      setOutgoingStreamList(undefined);

      return;
    }

    setIncomingStreamList(streamList.filter((stream: Stream | StreamInfo) => isInboundStream(stream)));

    setOutgoingStreamList(streamList.filter((stream: Stream | StreamInfo) => !isInboundStream(stream) && autocloseTreasuries.some(ac => ac.id as string === (stream as Stream).treasury || ac.id as string === (stream as StreamInfo).treasuryAddress)));
  }, [
    publicKey,
    streamList,
    connection,
    autocloseTreasuries,
    getQueryAccountType,
    isInboundStream,
  ]);

  // Incoming amount
  useEffect(() => {
    if (!incomingStreamList) { return; }

    setIncomingAmount(incomingStreamList.length);
  }, [
    incomingStreamList
  ]);

  // Outgoing amount
  useEffect(() => {
    if (!outgoingStreamList || !streamingAccountCombinedList) { return; }

    const sumStreamingStreams = streamingAccountCombinedList.reduce((accumulator, streaming: any) => {
      return accumulator + streaming.streams?.length;
    }, 0);

    setOutgoingAmount(outgoingStreamList.length + sumStreamingStreams);
  }, [
    outgoingStreamList,
    streamingAccountCombinedList
  ]);

  // Total streams amount
  useEffect(() => {
    if (!incomingAmount && !outgoingAmount) { return; }

    setTotalStreamsAmount((incomingAmount + outgoingAmount) as number);
  }, [incomingAmount, outgoingAmount])

  // Live data calculation
  useEffect(() => {
    if (!publicKey || !streamList || (!streamListv1 && !streamListv2) || !address) { return; }

    const timeout = setTimeout(() => {
      refreshIncomingStreamSummary();
      refreshOutgoingStreamSummary();
    }, 1000);

    return () => {
      clearTimeout(timeout);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    address,
    publicKey,
    streamList,
    streamListv1,
    streamListv2,
  ]);

  useEffect(() => {
    if (!publicKey || !treasuryList || !treasuriesLoaded) { return; }

    const timeout = setTimeout(() => {
      refreshTreasuriesSummary();
    }, 1000);

    return () => {
      clearTimeout(timeout);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey, treasuryList, treasuriesLoaded]);

  // Update total account balance
  useEffect(() => {
    if (loadingStreams || loadingCombinedStreamingList) {
      return;
    }

    const wdb = parseFloat(incomingStreamsSummary.totalNet.toFixed(2));
    const ub = parseFloat(outgoingStreamsSummary.totalNet.toFixed(2)) + parseFloat(streamingAccountsSummary.totalNet.toFixed(2));

    setTotalAccountBalance(wdb + ub);
    setCanShowStreamingAccountBalance(true);
  }, [
    loadingStreams,
    incomingStreamsSummary,
    outgoingStreamsSummary,
    streamingAccountsSummary,
    loadingCombinedStreamingList,
  ]);

  // Live data calculation - NetWorth
  useEffect(() => {

    if (tokensLoaded && accountTokens) {
      // Total USD value
      let sumMeanTokens = 0;
      accountTokens.forEach((asset: UserTokenAccount, index: number) => {
        const tokenPrice = getTokenPriceBySymbol(asset.symbol);
        if (asset.balance && tokenPrice) {
          sumMeanTokens += asset.balance * tokenPrice;
        }
      });
      setTotalTokenAccountsValue(sumMeanTokens);

      // Net Worth
      const total = sumMeanTokens + totalAccountBalance;
      setNetWorth(total);
    } else {
      setNetWorth(0);
    }

  }, [accountTokens, getTokenPriceBySymbol, tokensLoaded, totalAccountBalance]);

  // Window resize listeners
  useEffect(() => {
    const resizeListener = () => {
      const NUM_CHARS = 4;
      const ellipsisElements = document.querySelectorAll(".overflow-ellipsis-middle");
      if (isValidAddress(accountAddressInput)) {
        for (let i = 0; i < ellipsisElements.length; ++i){
          const e = ellipsisElements[i] as HTMLElement;
          if (e.offsetWidth < e.scrollWidth){
            const text = e.textContent;
            e.dataset.tail = text?.slice(text.length - NUM_CHARS);
          }
        }
      } else {
        if (ellipsisElements?.length) {
          const e = ellipsisElements[0] as HTMLElement;
          e.dataset.tail = '';
        }
      }
    };
    // Call it a first time
    resizeListener();

    // set resize listener
    window.addEventListener('resize', resizeListener);

    // clean up function
    return () => {
      // remove resize listener
      window.removeEventListener('resize', resizeListener);
    }
  }, [accountAddressInput]);

  // Setup event listeners
  useEffect(() => {
    if (canSubscribe && !isPageLoaded) {
      setCanSubscribe(false);
      confirmationEvents.on(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut('Subscribed to event txConfirmed with:', 'onTxConfirmed', 'blue');
      confirmationEvents.on(EventType.TxConfirmTimeout, onTxTimedout);
      consoleOut('Subscribed to event txTimedout with:', 'onTxTimedout', 'blue');
    }
  }, [canSubscribe, isPageLoaded, onTxConfirmed, onTxTimedout]);

  // Unsubscribe from events
  useEffect(() => {
    // Do unmounting stuff here
    return () => {
      confirmationEvents.off(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut('Unsubscribed from event txConfirmed!', '', 'blue');
      confirmationEvents.off(EventType.TxConfirmTimeout, onTxTimedout);
      consoleOut('Unsubscribed from event onTxTimedout!', '', 'blue');
      consoleOut('Clearing accounts state...', '', 'purple');
      clearStateData();
      setSelectedAsset(undefined);
      setTreasuriesLoaded(false);
      setTokensLoaded(false);
      setCanSubscribe(true);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  //////////////////
  // Transactions //
  //////////////////

  const onStartUnwrapTx = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    const createTx = async (): Promise<boolean> => {
      if (wallet && publicKey) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        const wSol = accountTokens.find(t => t.address === WRAPPED_SOL_MINT_ADDRESS);
        consoleOut('unwrapAmount:', wSolBalance, 'blue')

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: `unwrapAmount: ${wSolBalance}`
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: ''
        });

        if (!wSol || !wSol.publicAddress) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Wrapped SOL token account not found for the currently connected wallet account`
          });
          customLogger.logWarning('Unwrap transaction failed', { transcript: transactionLog });
          openNotification({
            title: 'Cannot unwrap SOL',
            description: `Wrapped SOL token account not found for the currently connected wallet account`,
            type: 'info'
          });
          return false;
        }

        const wSolPubKey = new PublicKey(wSol.publicAddress);

        return await closeTokenAccount(
          connection,                       // connection
          wSolPubKey,                       // tokenPubkey
          publicKey as PublicKey            // owner
        )
          .then((value: Transaction | null) => {
            if (value !== null) {
              consoleOut('closeTokenAccount returned transaction:', value);
              // Stage 1 completed - The transaction is created and returned
              setTransactionStatus({
                lastOperation: TransactionStatus.InitTransactionSuccess,
                currentOperation: TransactionStatus.SignTransaction,
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
                result: getTxIxResume(value)
              });
              transaction = value;
              return true;
            } else {
              // Stage 1 failed - The transaction was not created
              setTransactionStatus({
                lastOperation: transactionStatus.currentOperation,
                currentOperation: TransactionStatus.InitTransactionFailure,
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
                result: 'No transaction created'
              });
              return false;
            }
          })
          .catch((error) => {
            console.error("closeTokenAccount transaction init error:", error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`
            });
            customLogger.logError('Unwrap transaction failed', { transcript: transactionLog });
            return false;
          });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Unwrap transaction failed', { transcript: transactionLog });
        return false;
      }
    };

    const signTx = async (): Promise<boolean> => {
      if (wallet && publicKey) {
        consoleOut('Signing transaction...');
        return await wallet
          .signTransaction(transaction)
          .then((signed: Transaction) => {
            consoleOut('signTransaction returned a signed transaction:', signed);
            signedTransaction = signed;
            // Try signature verification by serializing the transaction
            try {
              encodedTx = signedTransaction.serialize().toString('base64');
              consoleOut('encodedTx:', encodedTx, 'orange');
            } catch (error) {
              console.error(error);
              setTransactionStatus({
                lastOperation: TransactionStatus.SignTransaction,
                currentOperation: TransactionStatus.SignTransactionFailure
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
                result: { signer: `${publicKey.toBase58()}`, error: `${error}` }
              });
              customLogger.logError('Unwrap transaction failed', { transcript: transactionLog });
              return false;
            }
            setTransactionStatus({
              lastOperation: TransactionStatus.SignTransactionSuccess,
              currentOperation: TransactionStatus.SendTransaction,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
              result: { signer: publicKey.toBase58() }
            });
            return true;
          })
          .catch(error => {
            console.error("Signing transaction failed!");
            setTransactionStatus({
              lastOperation: TransactionStatus.SignTransaction,
              currentOperation: TransactionStatus.SignTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
              result: { signer: `${publicKey.toBase58()}`, error: `${error}` }
            });
            customLogger.logError('Unwrap transaction failed', { transcript: transactionLog });
            return false;
          });
      } else {
        console.error("Cannot sign transaction! Wallet not found!");
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot sign transaction! Wallet not found!'
        });
        customLogger.logError('Unwrap transaction failed', { transcript: transactionLog });
        return false;
      }
    };

    const sendTx = async (): Promise<boolean> => {
      if (wallet) {
        return await connection
          .sendEncodedTransaction(encodedTx)
          .then((sig) => {
            consoleOut('sendEncodedTransaction returned a signature:', sig);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction,
            });
            signature = sig;
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionSuccess),
              result: `signature: ${signature}`
            });
            return true;
          })
          .catch((error) => {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
              result: { error, encodedTx }
            });
            customLogger.logError('Unwrap transaction failed', { transcript: transactionLog });
            return false;
          });
      } else {
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.WalletNotFound,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot send transaction! Wallet not found!'
        });
        customLogger.logError('Unwrap transaction failed', { transcript: transactionLog });
        return false;
      }
    };

    if (wallet) {
      setIsUnwrapping(true);
      const create = await createTx();
      consoleOut('created:', create);
      if (create) {
        const sign = await signTx();
        consoleOut('signed:', sign);
        if (sign) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent) {
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.Unwrap,
              finality: "confirmed",
              txInfoFetchStatus: "fetching",
              loadingTitle: 'Confirming transaction',
              loadingMessage: `Unwrap ${formatThousands(wSolBalance, NATIVE_SOL.decimals)} SOL`,
              completedTitle: 'Transaction confirmed',
              completedMessage: `Successfully unwrapped ${formatThousands(wSolBalance, NATIVE_SOL.decimals)} SOL`
            });
          } else {
            openNotification({
              title: t('notifications.error-title'),
              description: t('notifications.error-sending-transaction'),
              type: "error"
            });
            setIsUnwrapping(false);
          }
        } else { setIsUnwrapping(false); }
      } else { setIsUnwrapping(false); }
    }
  }

  const onRefreshStreamsNoReset = () => {
    refreshStreamList(false);
    refreshTreasuries(false);
  };

  const onRefreshStreamsReset = () => {
    refreshStreamList(true);
    refreshTreasuries(false);
  };

  //////////////
  //  Events  //
  //////////////

  const onBackButtonClicked = () => {
    setDetailsPanelOpen(false);
    setAutoOpenDetailsPanel(false);
    const url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming`;
    navigate(url);
  }

  ///////////////
  // Rendering //
  ///////////////

  const renderMultisigPendinTxNotification = () => {
    if (pendingMultisigTxCount && pendingMultisigTxCount > 0) {
      return (
        <div key="pending-proposals" className="transaction-list-row no-pointer shift-up-1">
          <div className="flex-row align-items-center fg-warning simplelink underline-on-hover" onClick={() => {
              let url = '/multisig';
              if (accountAddress) {
                setHighLightableMultisigId(accountAddress);
                if (activeTab) {
                  url += `/${accountAddress}?v=${tabNameFormat(activeTab)}`;
                } else {
                  url += `/${accountAddress}?v=proposals`;
                }
              }
              navigate(url);
            }}>
            <div className="font-bold">There are pending proposals on this account</div>
            <span className="icon-button-container ml-1">
              <Tooltip placement="bottom" title="Go to safe account">
                <Button
                  type="default"
                  shape="circle"
                  size="middle"
                  icon={<ArrowRightOutlined />}
                  className="fg-warning"
                />
              </Tooltip>
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  const renderNetworth = () => {
    return (
      <div className={`networth-list-item flex-fixed-right no-pointer ${selectedCategory === "networth" ? 'selected' : ''}`} onClick={() => {
        // setSelectedCategory("networth");
        // setSelectedAsset(undefined);
      }}>
        <div className="font-bold font-size-110 left">{!isInspectedAccountTheConnectedWallet() ? "Treasury Balance" : "Net Worth"}</div>
        <div className="font-bold font-size-110 right">
          {
            loadingStreams || loadingCombinedStreamingList || !canShowStreamingAccountBalance? (
              <IconLoading className="mean-svg-icons" style={{ height: "12px", lineHeight: "12px" }} />
            ) : netWorth
              ? toUsCurrency(netWorth)
              : '$0.00'
          }
        </div>
      </div>
    );
  };

  const renderMoneyStreamsSummary = (
    <>
      {/* <Tooltip title={isInspectedAccountTheConnectedWallet()
          ? "See your Money Streams"
          : "To see your Money Streams you need to connect your wallet"}> */}
        <div key="streams" onClick={() => {
          navigateToStreaming();
          setAutoOpenDetailsPanel(true);
        }} className={`transaction-list-row ${selectedCategory === "streaming" ? 'selected' : ''}`}>
          <div className="icon-cell">
            {loadingStreams ? (
              <div className="token-icon animate-border-loading">
                <div className="streams-count simplelink" onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}>
                  <span className="font-bold text-shadow"><SyncOutlined spin /></span>
                </div>
              </div>
            ) : (
              <div className={totalStreamsAmount !== 0 ? 'token-icon animate-border' : 'token-icon'}>
                <div className="streams-count simplelink" onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    refreshStreamList(false);
                  }}>
                  <span className="font-size-75 font-bold text-shadow">{kFormatter(totalStreamsAmount as number) || 0}</span>
                </div>
              </div>
            )}
          </div>
          <div className="description-cell">
            <div className="title">{t('account-area.money-streams')}</div>
            {loadingStreams ? (
              <div className="subtitle"><IconLoading className="mean-svg-icons" style={{ height: "12px", lineHeight: "12px" }}/></div>
            ) : (totalStreamsAmount === 0) ? (
              <div className="subtitle">{t('account-area.no-money-streams')}</div>
            ) : (
              <div className="subtitle">{incomingAmount} {t('streams.stream-stats-incoming')}, {outgoingAmount} {t('streams.stream-stats-outgoing')}</div>
            )}
          </div>
          <div className="rate-cell">
            {loadingStreams || loadingCombinedStreamingList || !canShowStreamingAccountBalance ? (
              <div className="rate-amount">
                <IconLoading className="mean-svg-icons" style={{ height: "12px", lineHeight: "12px" }} />
              </div>
            ) : (
              <>
                {totalAccountBalance > 0 ? (
                  <>
                    <div className="rate-amount">
                      {toUsCurrency(totalAccountBalance)}
                    </div>
                    <div className="interval">{t('streams.streaming-balance')}</div>
                  </>
                ) : (
                  <span className="rate-amount">$0.00</span>
                )}
              </>
            )}
          </div>
        </div>
      {/* </Tooltip> */}
    </>
  );

  const renderAsset = useCallback((asset: UserTokenAccount, index: number) => {
    const onTokenAccountClick = () => {
      setSelectedCategory("assets");
      if (selectedAsset && selectedAsset.publicAddress === asset.publicAddress) {
        reloadSwitch();
      }
      navigateToAsset(asset);
      selectAsset(asset, true, true);
    }
    const priceByAddress = getTokenPriceByAddress(asset.address);
    const tokenPrice = priceByAddress || getTokenPriceBySymbol(asset.symbol);
    const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
      event.currentTarget.src = FALLBACK_COIN_IMAGE;
      event.currentTarget.className = "error";
    };
    const isSelectedToken = (): boolean => {
      return selectedAsset && asset && selectedAsset.displayIndex === asset.displayIndex
        ? true
        : false;
    }

    return (
      <div key={`${index}`} onClick={onTokenAccountClick}
          className={`transaction-list-row ${isSelectedToken() && selectedCategory === "assets"
            ? 'selected'
            : hideLowBalances && (shouldHideAsset(asset) || !asset.balance)
              ? 'hidden'
              : ''
          }`
        }>
        <div className="icon-cell">
          <div className="token-icon">
            {asset.logoURI ? (
              <img alt={`${asset.name}`} width={30} height={30} src={asset.logoURI} onError={imageOnErrorHandler} />
            ) : (
              <Identicon address={asset.address} style={{ width: "30", display: "inline-flex" }} />
            )}
          </div>
        </div>
        <div className="description-cell">
          <div className="title">
            {asset.symbol}
            {tokenPrice > 0 ? (
              <span className={`badge small ml-1 ${theme === 'light' ? 'golden fg-dark' : 'darken'}`}>
                {toUsCurrency(tokenPrice)}
              </span>
            ) : (null)}
          </div>
          <div className="subtitle text-truncate">{asset.address === WRAPPED_SOL_MINT_ADDRESS ? 'Wrapped SOL' : asset.name}</div>
        </div>
        <div className="rate-cell">
          <div className="rate-amount">
            {
              tokenPrice > 0
                ? !asset.valueInUsd
                  ? '$0.00'
                  : asset.valueInUsd > 0 && asset.valueInUsd < ACCOUNTS_LOW_BALANCE_LIMIT
                    ? '< $0.01'
                    : toUsCurrency(asset.valueInUsd || 0)
                : '—'
            }
          </div>
          <div className="interval">
              {(asset.balance || 0) > 0 ? formatThousands(asset.balance || 0, asset.decimals, asset.decimals) : '0'}
          </div>
        </div>
      </div>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    theme,
    selectedAsset,
    hideLowBalances,
    selectedCategory,
    setDetailsPanelOpen,
    shouldHideAsset,
  ]);

  const renderAssetsList = (
    <>
      {accountTokens && accountTokens.length > 0 ? (
        <>
          {isInspectedAccountTheConnectedWallet() && wSolBalance > 0 && (
              <div className="utility-box">
                  <div className="well mb-1">
                      <div className="flex-fixed-right align-items-center">
                          <div className="left">You have {formatThousands(wSolBalance, NATIVE_SOL.decimals, NATIVE_SOL.decimals)} <strong>wrapped SOL</strong> in your wallet. Click to unwrap to native SOL.</div>
                          <div className="right">
                              <Button
                                  type="primary"
                                  shape="round"
                                  disabled={isUnwrapping}
                                  onClick={onStartUnwrapTx}
                                  size="small">
                                  {isUnwrapping ? 'Unwrapping SOL' : 'Unwrap SOL'}
                              </Button>
                          </div>
                      </div>
                  </div>
              </div>
          )}
          {/* Render user token accounts */}
          {accountTokens.map((asset, index) => renderAsset(asset, index))}
        </>
      ) : tokensLoaded ? (
        <div className="flex flex-center">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      ) : (
        <div className="flex flex-center">
          <Spin indicator={antIcon} />
        </div>
      )}
    </>
  );

  const renderActivityList = () => {
    const hasItems = hasItemsToRender();

    if (status === FetchStatus.Fetching && !hasItems) {
      return (
        <div className="flex flex-center">
          <Spin indicator={antIcon} />
        </div>
      );
    }

    return (
      <>
        {/* Activity list */}
        <div className={`transaction-list-data-wrapper ${
          (status === FetchStatus.Fetched && !hasTransactions()) ||
           status === FetchStatus.FetchFailed
            ? 'h-100'
            : 'vertical-scroll'
           }`
          }>
          <div className="activity-list h-100">
            {
              hasTransactions() ? (
                <div className="item-list-body compact">
                  {renderTransactions()}
                </div>
              ) : status === FetchStatus.Fetched && !hasTransactions() ? (
                <div className="h-100 flex-center">
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{t('assets.no-transactions')}</p>} />
                </div>
              ) : status === FetchStatus.FetchFailed && (
                <div className="h-100 flex-center">
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{t('assets.loading-error')}</p>} />
                </div>
              )
            }
            {lastTxSignature && (
                <div className="mt-1 text-center">
                    <span className={status === FetchStatus.Fetching ? 'no-pointer' : 'secondary-link underline-on-hover'}
                      role="link"
                      onClick={() => startSwitch()}>
                    {status === FetchStatus.Fetching ? (
                      <>
                        <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
                        <span className="no-pointer fg-orange-red pulsate-fast">{t('general.loading')}</span>
                      </>
                    ) : t('general.cta-load-more')}
                    </span>
                </div>
            )}
          </div>
        </div>
      </>
    );
  };

  // const renderSolanaIcon = (
  //   <img className="token-icon" src="/solana-logo.png" alt="Solana logo" />
  // );

  const renderTransactions = () => {
    if (transactions) {
      if (isSelectedAssetNativeAccount()) {
        // Get amount change for each tx
        const getChange = (accountIndex: number, meta: ParsedTransactionMeta | null): number => {
          if (meta !== null && accountIndex !== -1) {
            const prevBalance = meta.preBalances[accountIndex] || 0;
            const postbalance = meta.postBalances[accountIndex] || 0;
            const change = getAmountFromLamports(postbalance) - getAmountFromLamports(prevBalance);
            return change;
          }
          return 0;
        }
        // Render only txs that have SOL changes
        const filtered = transactions.filter(tx => {
          const meta = tx.parsedTransaction && tx.parsedTransaction.meta
            ? tx.parsedTransaction.meta
            : null;
          if (!meta || meta.err !== null) { return false; }
          const accounts = tx.parsedTransaction.transaction.message.accountKeys;
          const accIdx = accounts.findIndex(acc => acc.pubkey.toBase58() === accountAddress);
          if (isSelectedAssetNativeAccount() && accIdx === -1) { return false; }
          const change = getChange(accIdx, meta);
          return isSelectedAssetNativeAccount() && change !== 0 ? true : false;
        });
        return filtered?.map((trans: MappedTransaction, index: number) => {
          return <TransactionItemView
                    key={`${index}`}
                    transaction={trans}
                    selectedAsset={selectedAsset as UserTokenAccount}
                    accountAddress={accountAddress}
                    tokenAccounts={accountTokens} />;
        });
      } else {
        // Render the transactions collection
        return transactions?.map((trans: MappedTransaction, index: number) => {
          if (trans.parsedTransaction && trans.parsedTransaction.meta && trans.parsedTransaction.meta.err === null) {
            return <TransactionItemView
                      key={`${index}`}
                      transaction={trans}
                      selectedAsset={selectedAsset as UserTokenAccount}
                      accountAddress={accountAddress}
                      tokenAccounts={accountTokens} />;
          }
          return null;
        });
      }
    } else return null;
  };

  const assetListOptions = (
    <Menu>
      <Menu.Item key="10" onClick={showSuggestAssetModal}>
        <IconLightBulb className="mean-svg-icons" />
        <span className="menu-item-text">Suggest an asset</span>
      </Menu.Item>
      {(accountTokens && accountTokens.length > 0) && (
        <>
          {hideLowBalances ? (
            <Menu.Item key="11" onClick={() => toggleHideLowBalances(false)}>
              <IconEyeOn className="mean-svg-icons" />
              <span className="menu-item-text">Show low balances</span>
            </Menu.Item>
          ) : (
            <Menu.Item key="12" onClick={() => toggleHideLowBalances(true)}>
              <IconEyeOff className="mean-svg-icons" />
              <span className="menu-item-text">Hide low balances</span>
            </Menu.Item>
          )}
        </>
      )}
    </Menu>
  );

  const renderUserAccountAssetMenu = () => {
    const items = assetCtas.filter(m => m.isVisible && m.uiComponentType === 'menuitem');
    return (
      <Menu>
        {items.map(item => {
          return (
            <Menu.Item
              key={item.uiComponentId}
              disabled={item.disabled}
              onClick={item.callBack}>
              <span className="menu-item-text">{item.caption}</span>
            </Menu.Item>
          );
        })}
      </Menu>
    );
  }

  const isDeleteAssetValid = () => {
    if (selectedAsset) {
      const isSol = selectedAsset.address === NATIVE_SOL_MINT.toBase58() ? true : false;

      if (!isSol && selectedAsset.balance as number === 0) {
        return true;
      } else {
        return false;
      }
    }
  }

  const isSendFundsValid = () => {
    if (selectedAsset && selectedAsset.balance as number > 0) {
      return true;
    } else {
      return false;
    }
  }

  const isTransferOwnershipValid = () => {
    if (selectedAsset) {
      const isSol = selectedAsset.address === NATIVE_SOL_MINT.toBase58() ? true : false;
      
      if (!isSol) {
        return true;
      } else {
        return false;
      }
    }
  }

  const renderUserAccountAssetCtaRow = () => {
    if (!selectedAsset) { return null; }
    const items = assetCtas.filter(m => m.isVisible && m.uiComponentType === 'button');

    return (
      <div className="flex-fixed-right cta-row">
        <Space className="left" size="middle" wrap>
          {inspectedAccountType && inspectedAccountType === "multisig" ? (
            <Row gutter={[8, 8]} className="safe-btns-container mb-1">
              <Col xs={24} sm={24} md={24} lg={24} className="asset-btn-group btn-group">
                <Button
                  type="default"
                  shape="round"
                  size="small"
                  className="thin-stroke asset-btn"
                  onClick={showReceiveSplOrSolModal}>
                    <div className="btn-content">
                      Deposit
                    </div>
                </Button>
                <Button
                  type="default"
                  shape="round"
                  size="small"
                  className="thin-stroke asset-btn"
                  disabled={isTxInProgress() || !isSendFundsValid()}
                  onClick={showTransferTokenModal}>
                    <div className="btn-content">
                      Propose funds transfer
                    </div>
                </Button>
                <Button
                  type="default"
                  shape="round"
                  size="small"
                  className="thin-stroke asset-btn"
                  disabled={isTxInProgress() || !isTransferOwnershipValid()}
                  onClick={showTransferVaultAuthorityModal}>
                    <div className="btn-content">
                      Change asset ownership
                    </div>
                </Button>
              </Col>
            </Row>

          ) : selectedAsset.name === 'Custom account' ? (
            <h4 className="mb-0">The token for this Custom account was not found in the Solana token list</h4>
          ) : items.map(item => { // Draw the Asset CTAs here
              if (item.tooltip) {
                return (
                  <Tooltip placement="bottom" title={item.tooltip} key={item.uiComponentId}>
                    <Button
                      type="default"
                      shape="round"
                      size="small"
                      className="thin-stroke"
                      disabled={item.disabled}
                      onClick={item.callBack}>
                      <span>{item.caption}</span>
                    </Button>
                  </Tooltip>
                );
              } else {
                return (
                  <Button
                    type="default"
                    shape="round"
                    size="small"
                    key={item.uiComponentId}
                    className="thin-stroke"
                    disabled={item.disabled}
                    onClick={item.callBack}>
                    <span>{item.caption}</span>
                  </Button>
                );
              }
            })
          }
        </Space>
        <Dropdown
          overlay={renderUserAccountAssetMenu()}
          placement="bottomRight"
          trigger={["click"]}>
          <span className="icon-button-container">
            <Button
              type="default"
              shape="circle"
              size="middle"
              icon={<IconVerticalEllipsis className="mean-svg-icons"/>}
              onClick={(e) => e.preventDefault()}
            />
          </span>
        </Dropdown>
      </div>
    );
  };

  const renderUserAccountAssetMeta = () => {
    if (!selectedAsset) { return null; }

    const priceByAddress = getTokenPriceByAddress(selectedAsset.address);
    const tokenPrice = priceByAddress || getTokenPriceBySymbol(selectedAsset.symbol);
    return (
      <>
        <div className="accounts-category-meta">
          <div className="mb-2">
            <Row>
              <Col span={14}>
                <div className="info-label">
                  Balance
                </div>
                <div className="transaction-detail-row">
                  <div className="info-data">
                    {
                      `${formatThousands(
                        selectedAsset.balance || 0,
                        selectedAsset.decimals,
                        selectedAsset.decimals
                      )} ${selectedAsset.symbol}`
                    }
                  </div>
                </div>
                <div className="info-extra font-size-85">
                  <AddressDisplay
                    address={selectedAsset.publicAddress as string}
                    iconStyles={{ width: "16", height: "16" }}
                    newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${selectedAsset.publicAddress}${getSolanaExplorerClusterParam()}`}
                  />
                </div>
              </Col>
              <Col span={10}>
                <div className="info-label">
                  Value
                </div>
                <div className="transaction-detail-row">
                  <span className="info-data">
                    {
                      tokenPrice > 0
                        ? selectedAsset.balance
                          ? toUsCurrency((selectedAsset.balance || 0) * tokenPrice)
                          : '$0.00'
                        : '$0.00'
                    }
                  </span>
                </div>
              </Col>
            </Row>
          </div>
        </div>
      </>
    );
  };

  const renderCategoryMeta = () => {
    switch (selectedCategory) {
      case "networth":
        break;
      case "assets":
        return renderUserAccountAssetMeta();
      case "other-assets":
        break;
      default:
        break;
    }
  };

  const getRandomEmoji = useCallback(() => {
    const totalEmojis = EMOJIS.length;
    if (totalEmojis) {
      const randomIndex = Math.floor(Math.random() * totalEmojis);
      return (
        <span className="emoji" aria-label={EMOJIS[randomIndex]} role="img">{EMOJIS[randomIndex]}</span>
      );
    }
    return null;
  }, []);

  const renderQrCodeAndAddress = (
    <div className="text-center mt-3">
      <h3 className="mb-3">{t('assets.no-balance.line3')}</h3>
      <div className={theme === 'light' ? 'qr-container bg-white' : 'qr-container bg-black'}>
        <QRCodeSVG
          value={accountAddress}
          size={200}
        />
      </div>
      <div className="flex-center font-size-70 mb-2">
        <AddressDisplay
          address={accountAddress}
          showFullAddress={true}
          iconStyles={{ width: "15", height: "15" }}
          newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${publicKey?.toBase58()}${getSolanaExplorerClusterParam()}`}
        />
      </div>
      <div className="font-light font-size-75 px-4">{t('assets.no-balance.line4')}</div>
      <div className="font-light font-size-75 px-4">{t('assets.no-balance.line5')}</div>
    </div>
  );

  const renderTokenBuyOptions = () => {
    return (
      <div className="buy-token-options">
        <h3 className="text-center mb-3">{t('assets.no-balance.line1', { tokenSymbol: selectedAsset?.symbol })} {getRandomEmoji()}</h3>
        <h3 className="text-center mb-2">{t('assets.no-balance.line2')}</h3>
        <Space size={[16, 16]} wrap>
          {isSelectedAssetNativeAccount() && (
            <Button shape="round" type="ghost"
                    onClick={showDepositOptionsModal}>{t('assets.no-balance.cta1', { tokenSymbol: selectedAsset?.symbol })}</Button>
          )}
          {/* For SOL the first option is ok, any other token, we can use the exchange */}
          {selectedAsset?.publicAddress !== accountAddress && (
            <Button shape="round" type="ghost"
                    onClick={handleGoToExchangeClick}>{t('assets.no-balance.cta2')}</Button>
          )}
        </Space>
        {renderQrCodeAndAddress}
      </div>
    );
  };

  const goToStreamIncomingDetailsHandler = (stream: any) => {
    let url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming/incoming/${stream.id as string}`;

    if (inspectedAccountType && inspectedAccountType === "multisig") {
      url += `?account-type=multisig&v=details`;
    } else {
      url += `?v=details`;
    }

    navigate(url);
  }

  const goToStreamOutgoingDetailsHandler = (stream: any) => {
    let url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming/outgoing/${stream.id as string}`;

    if (inspectedAccountType && inspectedAccountType === "multisig") {
      url += `?account-type=multisig&v=details`;
    } else {
      url += `?v=details`;
    }

    navigate(url);
  }

  const goToStreamingAccountDetailsHandler = (streamingTreasury: Treasury | TreasuryInfo | undefined) => {
    if (streamingTreasury) {
      let url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming/outgoing/treasury/${streamingTreasury.id as string}`;

      if (inspectedAccountType && inspectedAccountType === "multisig") {
        url += `?account-type=multisig&v=streams`;
      } else {
        url += `?v=streams`;
      }
  
      navigate(url);
    }
  }

  const goToStreamingAccountStreamOutgoingDetailsHandler = (stream: any, streamingTreasury: Treasury | TreasuryInfo | undefined) => {
    if (streamingTreasury) {
      let url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming/outgoing/treasury/${streamingTreasury.id as string}/${stream.id as string}`;

      if (inspectedAccountType && inspectedAccountType === "multisig") {
        url += `?account-type=multisig&v=details`;
      } else {
        url += `?v=details`;
      }
  
      navigate(url);
    }
  }

  const returnFromIncomingStreamDetailsHandler = () => {
    let url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming/incoming`;

    if (inspectedAccountType && inspectedAccountType === "multisig") {
      url += `?account-type=multisig`;
    }

    navigate(url);
  }

  const returnFromOutgoingStreamDetailsHandler = () => {
    let url;
    if (treasuryId !== undefined) {
      url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming/outgoing/treasury/${treasuryId as string}`;
    } else {
      url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming/outgoing`;
    }

    if (inspectedAccountType && inspectedAccountType === "multisig") {
      url += `?account-type=multisig`;
    }

    navigate(url);
  }

  const returnFromStreamingAccountDetailsHandler = () => {

    let url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming/outgoing`;

    if (inspectedAccountType && inspectedAccountType === "multisig") {
      url += `?account-type=multisig`;
    }

    navigate(url);
  }

  return (
    <>
      {isLocal() && (
        <div className="debug-bar">
          <span className="ml-1">streamList:</span><span className="ml-1 font-bold fg-dark-active">{streamList ? `[${streamList.length}]` : '-'}</span>
          <span className="ml-1">streamListv1:</span><span className="ml-1 font-bold fg-dark-active">{streamListv1 ? `[${streamListv1.length}]` : '-'}</span>
          <span className="ml-1">streamListv2:</span><span className="ml-1 font-bold fg-dark-active">{streamListv2 ? `[${streamListv2.length}]` : '-'}</span>
          <span className="ml-1">treasuryList:</span><span className="ml-1 font-bold fg-dark-active">{treasuryList ? `[${treasuryList.length}]` : '-'}</span>
          <span className="ml-1">accountBalance:</span><span className="ml-1 font-bold fg-dark-active">{totalAccountBalance || 0}</span>
          <span className="ml-1">tokenAccountsValue:</span><span className="ml-1 font-bold fg-dark-active">{totalTokenAccountsValue || 0}</span>
          <span className="ml-1">netWorth:</span><span className="ml-1 font-bold fg-dark-active">{netWorth || 0}</span>
        </div>
      )}

      {detailsPanelOpen && (
        <Button
          id="back-button"
          type="default"
          shape="circle"
          icon={<ArrowLeftOutlined />}
          onClick={onBackButtonClicked}/>
      )}

      <div className="container main-container accounts">

        {/* SEO tags overrides */}
        <Helmet>
          <title>Accounts - Mean Finance</title>
          <link rel="canonical" href="/accounts" />
          <meta name="description" content="Accounts. Keep track of your assets and transactions" />
          <meta name="google-site-verification" content="u-gc96PrpV7y_DAaA0uoo4tc2ffcgi_1r6hqSViM-F8" />
          <meta name="keywords" content="assets, token accounts, transactions" />
        </Helmet>
        {/* This is a SEO mandatory h1 but it is not visible */}
        <h1 className="mandatory-h1">Keep track of your assets and transactions</h1>

        {publicKey ? (
          <div className="interaction-area">

            {accountAddress && (
              <div className={`meanfi-two-panel-layout ${detailsPanelOpen ? 'details-open' : ''}`}>

                {/* Left / top panel */}
                <div className="meanfi-two-panel-left">
                  <div className="meanfi-panel-heading">
                    {!isInspectedAccountTheConnectedWallet() && inspectedAccountType === "multisig" ? (
                      <>
                        <div className="back-button mb-0">
                          <span className="icon-button-container">
                            <Tooltip placement="bottom" title="Back to safes">
                              <Button
                                type="default"
                                shape="circle"
                                size="middle"
                                icon={<ArrowLeftOutlined />}
                                onClick={() => {
                                  if (selectedMultisig) {
                                    setHighLightableMultisigId(selectedMultisig.id.toBase58());
                                  }
                                  navigate(`/multisig/${address}?v=${tabNameFormat(activeTab)}`)
                                }}
                              />
                            </Tooltip>
                          </span>
                        </div>
                        <span className="title ml-2">Multisig safe</span>
                      </>
                    ) : (
                      <span className="title">{t('assets.screen-title')}</span>
                    )}
                    <div className="user-address">
                      <span className="fg-secondary">
                        (<span className="simplelink underline-on-hover" onClick={() => copyAddressToClipboard(accountAddress)}>
                          {shortenAddress(accountAddress, 5)}
                        </span>)
                      </span>
                      {!connected && (
                        <span className="icon-button-container">
                          <Tooltip placement="bottom" title={t('assets.account-address-change-cta')}>
                            <Button
                              type="default"
                              shape="circle"
                              size="middle"
                              icon={<EditOutlined />}
                              onClick={handleScanAnotherAddressButtonClick}
                            />
                          </Tooltip>
                        </span>
                      )}
                      <span className="icon-button-container">
                        <Tooltip placement="top" title={t('assets.account-address-copy-cta')}>
                          <Button
                            type="default"
                            shape="circle"
                            size="middle"
                            icon={<IconExternalLink className="mean-svg-icons" style={{width: "18", height: "18"}} />}
                            onClick={() => openLinkInNewTab(`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${accountAddress}${getSolanaExplorerClusterParam()}`)}
                          />
                        </Tooltip>
                      </span>
                    </div>
                  </div>
                  <div className="inner-container">

                    {/* Pending Multisig proposals notification */}
                    {inspectedAccountType === "multisig" && renderMultisigPendinTxNotification()}

                    {/* Net Worth header (sticky) */}
                    {renderNetworth()}

                    {/* Middle area (vertically flexible block of items) */}
                    <div className="item-block vertical-scroll">

                      <div className="asset-category-title flex-fixed-right">
                        <div className="title">Streaming Assets</div>
                        <div className="amount">{
                          loadingStreams || loadingCombinedStreamingList || !canShowStreamingAccountBalance ? (
                            <IconLoading className="mean-svg-icons" style={{ height: "12px", lineHeight: "12px" }} />
                          ) : totalAccountBalance > 0
                            ? toUsCurrency(totalAccountBalance)
                            : "$0.00"
                          }
                        </div>
                      </div>
                      <div className="asset-category">
                        {renderMoneyStreamsSummary}
                      </div>

                      <div className="asset-category-title flex-fixed-right">
                        <div className="title">Tokens ({accountTokens.length})</div>
                        <div className="amount">{toUsCurrency(totalTokenAccountsValue)}</div>
                      </div>
                      <div className="asset-category flex-column">
                        {renderAssetsList}
                      </div>

                    </div>

                    {/* Bottom CTAs */}
                    <div className="bottom-ctas">
                      <div className="primary-action">
                        {isInspectedAccountTheConnectedWallet() ? (
                          <Button
                            block
                            className="flex-center"
                            type="primary"
                            shape="round"
                            onClick={showInitAtaModal}>
                            <IconAdd className="mean-svg-icons" />
                            <span className="ml-1">Add asset</span>
                          </Button>
                        ) : (
                          <Tooltip placement="bottom" title={
                            !accountAddress || inspectedAccountType !== "multisig"
                              ? "You can only add assets to your connected account"
                              : "Add asset to your multisig safe account"
                            }>
                            <Button
                              block
                              className="flex-center"
                              type="primary"
                              shape="round"
                              disabled={!accountAddress || inspectedAccountType !== "multisig"}
                              onClick={onShowCreateAssetModal}>
                              <IconAdd className="mean-svg-icons" />
                              <span className="ml-1">Create an asset</span>
                            </Button>
                          </Tooltip>
                        )}
                      </div>
                      <Dropdown className="options-dropdown"
                        overlay={assetListOptions}
                        placement="bottomRight"
                        trigger={["click"]}>
                        <span className="icon-button-container">
                          <Button
                            type="default"
                            shape="circle"
                            size="middle"
                            icon={<IconVerticalEllipsis className="mean-svg-icons"/>}
                            onClick={(e) => e.preventDefault()}
                          />
                        </span>
                      </Dropdown>
                    </div>

                  </div>
                </div>

                {/* Right / down panel */}
                <div className="meanfi-two-panel-right">
                  <div className="meanfi-panel-heading"><span className="title">{t('assets.history-panel-title')}</span></div>
                  <div className="inner-container">
                    {selectedCategory === "assets" ? (
                      <>
                        {canShowBuyOptions() ? renderTokenBuyOptions() : (
                          <div className="flexible-column-bottom">
                            <div className="top">
                              {renderCategoryMeta()}
                              {selectedCategory === "assets" && renderUserAccountAssetCtaRow()}
                            </div>
                            {!isInspectedAccountTheConnectedWallet() && inspectedAccountType === "multisig" && (
                              (multisigSolBalance !== undefined && multisigSolBalance <= 0.005) ? (
                                <Row gutter={[8, 8]}>
                                  <Col span={24} className="alert-info-message pr-2">
                                    <Alert message="SOL balance is very low in this safe. You'll need some if you want to make proposals." type="info" showIcon closable />
                                  </Col>
                                </Row>
                              ) : null
                            )}
                            <div className={`bottom ${!hasItemsToRender() ? 'h-100 flex-column' : ''}`}>
                              {/* Activity table heading */}
                              {hasItemsToRender() && (
                                <div className="stats-row">
                                  <div className="item-list-header compact">
                                    <div className="header-row">
                                      <div className="std-table-cell first-cell">&nbsp;</div>
                                      <div className="std-table-cell responsive-cell">{t('assets.history-table-activity')}</div>
                                      <div className="std-table-cell responsive-cell pr-2 text-right">{t('assets.history-table-amount')}</div>
                                      <div className="std-table-cell responsive-cell pr-2 text-right">{t('assets.history-table-postbalance')}</div>
                                      <div className="std-table-cell responsive-cell pl-2">{t('assets.history-table-date')}</div>
                                    </div>
                                  </div>
                                </div>
                              )}
                              {/* Activity table content */}
                              {selectedCategory === "assets" && renderActivityList()}
                            </div>
                          </div>
                        )}
                      </>
                    ) : selectedCategory === "streaming" ? (
                      <div className="scroll-wrapper vertical-scroll">
                        <div id="streams-refresh-noreset-cta" onClick={onRefreshStreamsNoReset}></div>
                        <div id="streams-refresh-reset-cta" onClick={onRefreshStreamsReset}></div>
                        {!pathParamStreamId && !pathParamTreasuryId ? (
                          <MoneyStreamsInfoView
                            accountAddress={accountAddress}
                            autocloseTreasuries={autocloseTreasuries}
                            loadingCombinedStreamingList={loadingCombinedStreamingList}
                            loadingStreams={loadingStreams}
                            multisigAccounts={multisigAccounts}
                            onSendFromIncomingStreamInfo={goToStreamIncomingDetailsHandler}
                            onSendFromOutgoingStreamInfo={goToStreamOutgoingDetailsHandler}
                            onSendFromStreamingAccountDetails={goToStreamingAccountDetailsHandler}
                            onSendFromStreamingAccountOutgoingStreamInfo={goToStreamingAccountStreamOutgoingDetailsHandler}
                            selectedMultisig={selectedMultisig}
                            selectedTab={pathParamStreamingTab}
                            showNotificationByType={() => showNotificationByType("info")}
                            streamList={streamList}
                            streamingAccountCombinedList={streamingAccountCombinedList}
                            treasuryList={treasuryList}
                          />
                        ) : pathParamStreamId && pathParamStreamingTab === "incoming" ? (
                          <MoneyStreamsIncomingView
                            streamSelected={streamDetail}
                            accountAddress={accountAddress}
                            multisigAccounts={multisigAccounts}
                            onSendFromIncomingStreamDetails={returnFromIncomingStreamDetailsHandler}
                            showNotificationByType={() => showNotificationByType("info")}
                          />
                        ) : pathParamStreamId && pathParamStreamingTab === "outgoing" ? (
                          <MoneyStreamsOutgoingView
                            streamSelected={streamDetail}
                            streamList={streamList}
                            multisigAccounts={multisigAccounts}
                            onSendFromOutgoingStreamDetails={returnFromOutgoingStreamDetailsHandler}
                            showNotificationByType={() => showNotificationByType("info")}
                          />
                        ) : pathParamTreasuryId && pathParamStreamingTab === "outgoing" ? (
                          <StreamingAccountView
                            streamSelected={streamDetail}
                            treasuryList={treasuryList}
                            multisigAccounts={multisigAccounts}
                            selectedMultisig={selectedMultisig}
                            streamingAccountSelected={treasuryDetail}
                            onSendFromStreamingAccountDetails={returnFromStreamingAccountDetailsHandler}
                            onSendFromStreamingAccountOutgoingStreamInfo={goToStreamingAccountStreamOutgoingDetailsHandler}
                            showNotificationByType={() => showNotificationByType("info")}
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

          </div>
        ) : (
          <div className="interaction-area">
            <div className="w-75 h-100 p-5 text-center flex-column flex-center">
              <div className="text-center mb-2">
                <WarningFilled style={{ fontSize: 48 }} className="icon fg-warning" />
              </div>
              <h3>{t('wallet-selector.connect-to-begin')}</h3>
            </div>
          </div>
        )}

      </div>

      {(connection && selectedTokenMergeGroup && isTokenMergerModalVisible) && (
        <AccountsMergeModal
          connection={connection}
          isVisible={isTokenMergerModalVisible}
          handleOk={onFinishedTokenMerge}
          handleClose={onCloseTokenMergeModal}
          tokenMint={selectedTokenMergeGroup[0].parsedInfo.mint}
          tokenGroup={selectedTokenMergeGroup}
          accountTokens={accountTokens}
        />
      )}

      {isReceiveSplOrSolModalOpen && selectedAsset && (
        <ReceiveSplOrSolModal
          address={selectedAsset.publicAddress || ''}
          accountAddress={accountAddress}
          multisigAddress={address as string}
          isVisible={isReceiveSplOrSolModalOpen}
          handleClose={hideReceiveSplOrSolModal}
          tokenSymbol={selectedAsset.symbol}
        />
      )}

      {isSendAssetModalOpen && selectedAsset && (
        <SendAssetModal
          selectedToken={selectedAsset}
          isVisible={isSendAssetModalOpen}
          handleClose={hideSendAssetModal}
          selected={"one-time"}
        />
      )}

      {isWrapSolModalOpen && (
        <WrapSolModal
          isVisible={isWrapSolModalOpen}
          handleOk={onAfterWrap}
          handleClose={hideWrapSolModal}
        />
      )}

      {isUnwrapSolModalOpen && (
        <UnwrapSolModal
          isVisible={isUnwrapSolModalOpen}
          handleOk={onAfterUnwrap}
          handleClose={hideUnwrapSolModal}
        />
      )}

      {/* {isExchangeAssetModalOpen && publicKey && selectedAsset && (
        <ExchangeAssetModal
          isVisible={isExchangeAssetModalOpen}
          handleClose={hideExchangeAssetModal}
          tokenSymbol={selectedAsset.symbol}
        />
      )} */}

      {isSuggestAssetModalOpen && (
        <AccountsSuggestAssetModal
          handleOk={hideSuggestAssetModal}
          handleClose={hideSuggestAssetModal}
          isVisible={isSuggestAssetModalOpen}
        />
      )}

      {isInitAtaModalOpen && (
        <AccountsInitAtaModal
          connection={connection}
          handleOk={hideInitAtaModal}
          handleClose={hideInitAtaModal}
          isVisible={isInitAtaModalOpen}
          ownedTokenAccounts={userOwnedTokenAccounts}
        />
      )}

      {isCloseAssetModalOpen && selectedAsset && (
        <AccountsCloseAssetModal
          connection={connection}
          handleOk={hideCloseAssetModal}
          handleClose={hideCloseAssetModal}
          isVisible={isCloseAssetModalOpen}
          asset={selectedAsset}
        />
      )}

      {isTransferTokenModalVisible && (
        <MultisigTransferTokensModal
          isVisible={isTransferTokenModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          handleOk={onAcceptTransferToken}
          handleClose={() => {
            onAfterEveryModalClose();
            setIsTransferTokenModalVisible(false);
          }}
          selectedVault={selectedAsset}
          isBusy={isBusy}
          assets={accountTokens}
        />
      )}

      {isTransferVaultAuthorityModalVisible && (
        <MultisigVaultTransferAuthorityModal
          isVisible={isTransferVaultAuthorityModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          handleOk={onAcceptTransferVaultAuthority}
          handleAfterClose={onAfterEveryModalClose}
          handleClose={() => {
            onAfterEveryModalClose();
            setIsTransferVaultAuthorityModalVisible(false);
          }}
          isBusy={isBusy}
          selectedMultisig={selectedMultisig}
          multisigAccounts={multisigAccounts}
          selectedVault={selectedAsset}
          assets={accountTokens}
        />
      )}

      {isDeleteVaultModalVisible && (
        <MultisigVaultDeleteModal
          isVisible={isDeleteVaultModalVisible}
          handleOk={onAcceptDeleteVault}
          handleAfterClose={onAfterEveryModalClose}
          handleClose={() => {
            onAfterEveryModalClose();
            setIsDeleteVaultModalVisible(false);
          }}
          isBusy={isBusy}
          selectedVault={selectedAsset}
        />
      )}

      {isCreateAssetModalVisible && (
        <MultisigAddAssetModal
          connection={connection}
          handleOk={(item: TokenInfo) => onAcceptCreateVault(item)}
          handleClose={closeCreateAssetModal}
          isVisible={isCreateAssetModalVisible}
          ownedTokenAccounts={userOwnedTokenAccounts}
          isBusy={isBusy}
          selectedMultisig={selectedMultisig}
        />
      )}

      <PreFooter />
    </>
  );

};