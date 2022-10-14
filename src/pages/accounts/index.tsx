import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  LoadingOutlined,
  ReloadOutlined,
  SyncOutlined,
  WarningFilled
} from '@ant-design/icons';
import {
  DEFAULT_EXPIRATION_TIME_SECONDS,
  getFees,
  MeanMultisig,
  MultisigTransaction,
  MultisigTransactionFees,
  MultisigTransactionStatus,
  MULTISIG_ACTIONS
} from '@mean-dao/mean-multisig-sdk';
import { MoneyStreaming, StreamInfo, STREAM_STATE, TreasuryInfo } from '@mean-dao/money-streaming';
import { Category, MSP, Stream, STREAM_STATUS, TransactionFees, Treasury, TreasuryType } from '@mean-dao/msp';
import { AccountLayout, ASSOCIATED_TOKEN_PROGRAM_ID, MintLayout, Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  ParsedTransactionMeta,
  PublicKey,
  Signer,
  SystemProgram,
  Transaction,
  TransactionInstruction
} from '@solana/web3.js';
import { Alert, Button, Col, Dropdown, Empty, Menu, Row, Space, Spin, Tooltip } from 'antd';
import { ItemType } from 'antd/lib/menu/hooks/useItems';
import notification from 'antd/lib/notification';
import { segmentAnalytics } from 'App';
import BigNumber from 'bignumber.js';
import { BN } from 'bn.js';
import { AccountsCloseAssetModal } from 'components/AccountsCloseAssetModal';
import { AccountsInitAtaModal } from 'components/AccountsInitAtaModal';
import { AccountsMergeModal } from 'components/AccountsMergeModal';
import { AccountsSuggestAssetModal } from 'components/AccountsSuggestAssetModal';
import { AddressDisplay } from 'components/AddressDisplay';
import { Identicon } from 'components/Identicon';
import { MultisigAddAssetModal } from 'components/MultisigAddAssetModal';
import { MultisigTransferTokensModal } from 'components/MultisigTransferTokensModal';
import { MultisigVaultDeleteModal } from 'components/MultisigVaultDeleteModal';
import { MultisigVaultTransferAuthorityModal } from 'components/MultisigVaultTransferAuthorityModal';
import { openNotification } from 'components/Notifications';
import { PreFooter } from 'components/PreFooter';
import { ReceiveSplOrSolModal } from 'components/ReceiveSplOrSolModal';
import { SendAssetModal } from 'components/SendAssetModal';
import { SolBalanceModal } from 'components/SolBalanceModal';
import { TransactionItemView } from 'components/TransactionItemView';
import { UnwrapSolModal } from 'components/UnwrapSolModal';
import { WrapSolModal } from 'components/WrapSolModal';
import {
  ACCOUNTS_LOW_BALANCE_LIMIT,
  FALLBACK_COIN_IMAGE,
  MEAN_MULTISIG_ACCOUNT_LAMPORTS,
  MIN_SOL_BALANCE_REQUIRED,
  NO_FEES,
  ONE_MINUTE_REFRESH_TIMEOUT,
  SOLANA_EXPLORER_URI_INSPECT_ADDRESS,
  TRANSACTIONS_PER_PAGE,
  WRAPPED_SOL_MINT_ADDRESS
} from 'constants/common';
import { EMOJIS } from 'constants/emojis';
import { NATIVE_SOL } from 'constants/tokens';
import { useNativeAccount } from 'contexts/accounts';
import { AppStateContext } from 'contexts/appstate';
import { getSolanaExplorerClusterParam, useConnectionConfig } from 'contexts/connection';
import { confirmationEvents, TxConfirmationContext, TxConfirmationInfo } from 'contexts/transaction-status';
import { useWallet } from 'contexts/wallet';
import useLocalStorage from 'hooks/useLocalStorage';
import useWindowSize from 'hooks/useWindowResize';
import { IconAdd, IconExternalLink, IconEyeOff, IconEyeOn, IconLightBulb, IconLoading, IconVerticalEllipsis } from 'Icons';
import { appConfig, customLogger } from 'index';
import { closeTokenAccount } from 'middleware/accounts';
import { fetchAccountHistory, MappedTransaction } from 'middleware/history';
import { NATIVE_SOL_MINT } from 'middleware/ids';
import { AppUsageEvent } from 'middleware/segment-service';
import { consoleOut, copyText, getTransactionStatusForLogs, kFormatter, toUsCurrency } from 'middleware/ui';
import {
  formatThousands,
  getAmountFromLamports, getAmountWithSymbol, getSdkValue, getTxIxResume,
  openLinkInNewTab,
  shortenAddress,
  toUiAmount
} from 'middleware/utils';
import { AccountTokenParsedInfo, UserTokenAccount } from "models/accounts";
import { MetaInfoCta } from 'models/common-types';
import { EventType, MetaInfoCtaAction, OperationType, TransactionStatus } from 'models/enums';
import { ZERO_FEES } from 'models/multisig';
import { TokenInfo } from "models/SolanaTokenInfo";
import { initialSummary, StreamsSummary } from 'models/streams';
import { FetchStatus } from 'models/transactions';
import { INITIAL_TREASURIES_SUMMARY, UserTreasuriesSummary } from 'models/treasuries';
import { STAKING_ROUTE_BASE_PATH } from 'pages/staking';
import { QRCodeSVG } from 'qrcode.react';
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { isMobile } from 'react-device-detect';
import { Helmet } from "react-helmet";
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MoneyStreamsIncomingView } from 'views/MoneyStreamsIncoming';
import { MoneyStreamsInfoView } from 'views/MoneyStreamsInfo';
import { MoneyStreamsOutgoingView } from 'views/MoneyStreamsOutgoing';
import { StreamingAccountView } from 'views/StreamingAccount';
import "./style.scss";

const antIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;
export type InspectedAccountType = "wallet" | "multisig" | undefined;
export type CategoryOption = "networth" | "assets" | "streaming" | "other-assets";
export const ACCOUNTS_ROUTE_BASE_PATH = '/accounts';
let isWorkflowLocked = false;
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

export const AccountsNewView = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { address, asset, streamingTab, streamingItemId } = useParams();
  const { endpoint } = useConnectionConfig();
  const { publicKey, connected, wallet } = useWallet();
  const connectionConfig = useConnectionConfig();
  const {
    theme,
    streamList,
    tokensLoaded,
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
    selectedMultisig,
    multisigAccounts,
    shouldLoadTokens,
    transactionStatus,
    userTokensResponse,
    loadingTokenAccounts,
    streamProgramAddress,
    streamV2ProgramAddress,
    pendingMultisigTxCount,
    previousWalletConnectState,
    loadingMultisigTxPendingCount,
    setHighLightableMultisigId,
    setPendingMultisigTxCount,
    showDepositOptionsModal,
    setAddAccountPanelOpen,
    getTokenPriceByAddress,
    setIsVerifiedRecipient,
    getTokenPriceBySymbol,
    getTokenByMintAddress,
    setTransactionStatus,
    refreshTokenBalance,
    setShouldLoadTokens,
    setSelectedMultisig,
    resetContractValues,
    refreshStreamList,
    setStreamsSummary,
    setAccountAddress,
    refreshMultisigs,
    setSelectedToken,
    setSelectedAsset,
    setActiveStream,
    setStreamDetail,
    setTransactions,
    clearStreams,
  } = useContext(AppStateContext);
  const {
    confirmationHistory,
    enqueueTransactionConfirmation,
  } = useContext(TxConfirmationContext);
  const { t } = useTranslation('common');
  const { width } = useWindowSize();
  const { account } = useNativeAccount();
  const [isPageLoaded, setIsPageLoaded] = useState(true);
  const [accountTokens, setAccountTokens] = useState<UserTokenAccount[]>([]);
  const [solAccountItems, setSolAccountItems] = useState(0);
  const [tokenAccountGroups, setTokenAccountGroups] = useState<Map<string, AccountTokenParsedInfo[]>>();
  const [userOwnedTokenAccounts, setUserOwnedTokenAccounts] = useState<AccountTokenParsedInfo[]>();
  const [selectedTokenMergeGroup, setSelectedTokenMergeGroup] = useState<AccountTokenParsedInfo[]>();
  const [wSolBalance, setWsolBalance] = useState(0);
  const [refreshingBalance, setRefreshingBalance] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategoryOption>("assets");
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
  const [nativeBalance, setNativeBalance] = useState(0);
  const [transactionFees, setTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [transactionAssetFees, setTransactionAssetFees] = useState<TransactionFees>(NO_FEES);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [multisigPendingTxs, setMultisigPendingTxs] = useState<MultisigTransaction[]>([]);
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [loadingTreasuries, setLoadingTreasuries] = useState(false);
  const [treasuryList, setTreasuryList] = useState<(Treasury | TreasuryInfo)[]>([]);
  const [detailsPanelOpen, setDetailsPanelOpen] = useState(false);
  const [autoOpenDetailsPanel, setAutoOpenDetailsPanel] = useState(false);
  // Streaming account
  const [treasuryDetail, setTreasuryDetail] = useState<Treasury | TreasuryInfo | undefined>();
  const [incomingStreamList, setIncomingStreamList] = useState<Array<Stream | StreamInfo> | undefined>();
  const [outgoingStreamList, setOutgoingStreamList] = useState<Array<Stream | StreamInfo> | undefined>();
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
  const [multisigTransactionFees, setMultisigTransactionFees] = useState<MultisigTransactionFees>(ZERO_FEES);
  const [minRequiredBalance, setMinRequiredBalance] = useState(0);

  // SOL Balance Modal
  const [isSolBalanceModalOpen, setIsSolBalanceModalOpen] = useState(false);
  const hideSolBalanceModal = useCallback(() => setIsSolBalanceModalOpen(false), []);
  const showSolBalanceModal = useCallback(() => setIsSolBalanceModalOpen(true), []);

  const multisigAddressPK = useMemo(() => new PublicKey(appConfig.getConfig().multisigProgramAddress), []);

  // Perform premature redirect here if no address was provided in path
  // to the current wallet address if the user is connected
  useEffect(() => {
    if (!publicKey) { return; }

    consoleOut('pathname:', location.pathname, 'crimson');
    if (!address && publicKey) {
      const url = `${ACCOUNTS_ROUTE_BASE_PATH}/${publicKey.toBase58()}/assets`;
      consoleOut('No account address, redirecting to:', url, 'orange');
      setAutoOpenDetailsPanel(false);
      setTimeout(() => {
        setIsPageLoaded(true);
      });
      navigate(url, { replace: true });
      // Ensure path: /accounts/:address/assets if address provided but not /assets or /streaming
    } else if (address && location.pathname.indexOf('/assets') === -1 && location.pathname.indexOf('/streaming') === -1) {
      const url = `${ACCOUNTS_ROUTE_BASE_PATH}/${address}/assets`;
      consoleOut('Address found, redirecting to:', url, 'orange');
      setAutoOpenDetailsPanel(false);
      setTimeout(() => {
        setIsPageLoaded(true);
      });
      navigate(url, { replace: true });
    } else {
      // If an asset is specified or user goes inside any tab of the streaming category, enable it
      if (streamingTab) {
        setAutoOpenDetailsPanel(true);
      }
      setTimeout(() => {
        setIsPageLoaded(true);
      });
    }
  }, [address, asset, location.pathname, navigate, publicKey, streamingItemId, streamingTab]);

  const connection = useMemo(() => new Connection(endpoint, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true
  }), [
    endpoint
  ]);

  /////////////////
  //  Init code  //
  /////////////////
  
  const multisigClient = useMemo(() => {
    if (!connection || !publicKey || !connectionConfig.endpoint) { return null; }
    return new MeanMultisig(
      connectionConfig.endpoint,
      publicKey,
      "confirmed",
      multisigAddressPK
    );
  }, [
    publicKey,
    connection,
    multisigAddressPK,
    connectionConfig.endpoint,
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

  const isCustomAsset = useMemo(() => selectedAsset && selectedAsset.name === 'Custom account' ? true : false, [selectedAsset]);

  const selectedMultisigRef = useRef(selectedMultisig);
  useEffect(() => {
    selectedMultisigRef.current = selectedMultisig;
  }, [selectedMultisig]);

  const accountAddressRef = useRef(accountAddress);
  useEffect(() => {
    accountAddressRef.current = accountAddress;
  }, [accountAddress]);

  const isMultisigContext = useMemo(() => {
    let accountTypeInQuery: string | null = null;
    if (address && searchParams) {
      accountTypeInQuery = searchParams.get('account-type');
      if (accountTypeInQuery && accountTypeInQuery === "multisig") {
        return true;
      }
    }
    return false;
  }, [address, searchParams]);


  ////////////////////////////
  //   Events and actions   //
  ////////////////////////////

  const isAnyTxPendingConfirmation = useCallback((operation?: OperationType) => {
    if (confirmationHistory && confirmationHistory.length > 0) {
      if (operation !== undefined) {
        return confirmationHistory.some(h => h.operationType === OperationType.ExecuteTransaction && h.txInfoFetchStatus === "fetching");
      } else {
        return confirmationHistory.some(h => h.txInfoFetchStatus === "fetching");
      }
    }
    return false;
  }, [confirmationHistory]);

  const isInboundStream = useCallback((item: Stream | StreamInfo): boolean => {
    if (item && publicKey && accountAddress) {
      const v1 = item as StreamInfo;
      const v2 = item as Stream;
      let beneficiary = '';
      if (item.version < 2) {
        beneficiary = typeof v1.beneficiaryAddress === "string"
          ? v1.beneficiaryAddress
          : (v1.beneficiaryAddress as PublicKey).toBase58();
      } else {
        beneficiary = typeof v2.beneficiary === "string"
          ? v2.beneficiary
          : v2.beneficiary.toBase58();
      }
      return beneficiary === accountAddress ? true : false
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

  const getMultisigTxProposalFees = useCallback(() => {

    if (!multisigClient) { return; }

    getFees(multisigClient.getProgram(), MULTISIG_ACTIONS.createTransaction)
      .then(value => {
        setMultisigTransactionFees(value);
        consoleOut('multisigTransactionFees:', value, 'orange');
        consoleOut('nativeBalance:', nativeBalance, 'blue');
        consoleOut('networkFee:', value.networkFee, 'blue');
        consoleOut('rentExempt:', value.rentExempt, 'blue');
        const totalMultisigFee = value.multisigFee + (MEAN_MULTISIG_ACCOUNT_LAMPORTS / LAMPORTS_PER_SOL);
        consoleOut('multisigFee:', totalMultisigFee, 'blue');
        const minRequired = totalMultisigFee + value.rentExempt + value.networkFee;
        consoleOut('Min required balance:', minRequired, 'blue');
        setMinRequiredBalance(minRequired);
      });

    resetTransactionStatus();

  }, [multisigClient, nativeBalance, resetTransactionStatus]);

  // Deposit SPL or SOL modal
  const [isReceiveSplOrSolModalOpen, setIsReceiveSplOrSolModalOpen] = useState(false);
  const hideReceiveSplOrSolModal = useCallback(() => setIsReceiveSplOrSolModalOpen(false), []);
  const showReceiveSplOrSolModal = useCallback(() => setIsReceiveSplOrSolModalOpen(true), []);

  // Send selected token modal
  const [isSendAssetModalOpen, setIsSendAssetModalOpen] = useState(false);
  const showSendAssetModal = useCallback(() => setIsSendAssetModalOpen(true), []);
  const hideSendAssetModal = useCallback(() => {
    setIsSendAssetModalOpen(false);
    resetContractValues();
    setIsVerifiedRecipient(false);
  }, [resetContractValues, setIsVerifiedRecipient]);

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

  const onAfterWrap = () => {
    hideWrapSolModal();
  }

  const onAfterUnwrap = () => {
    hideUnwrapSolModal();
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

    const investPageUsedAssets = ['MEAN', 'sMEAN'];
    return investPageUsedAssets.includes(selectedAsset.symbol);
  }, [isInspectedAccountTheConnectedWallet, selectedAsset]);

  const handleGoToInvestClick = useCallback(() => {
    setDetailsPanelOpen(false);
    let url = STAKING_ROUTE_BASE_PATH;

    if (selectedAsset) {
      switch (selectedAsset.symbol) {
        case "MEAN":
          url += '?option=stake';
          break;
        case "sMEAN":
          url += '?option=unstake';
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

  const hasTransactions = useCallback(() => {
    return transactions && transactions.length > 0 ? true : false;
  }, [transactions]);

  const getScanAddress = useCallback((asset: UserTokenAccount): PublicKey | null => {
    if (asset && asset.publicAddress) {
      return asset.publicAddress !== NATIVE_SOL_MINT.toBase58()
        ? new PublicKey(asset.publicAddress)
        : new PublicKey(accountAddress);
    }
    return null;
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
            tokensCopy[itemIndex].balance = getAmountFromLamports(solBalance);
            tokensCopy[itemIndex].valueInUsd = (getAmountFromLamports(solBalance)) * getTokenPriceBySymbol(tokensCopy[itemIndex].symbol);
            consoleOut('solBalance:', getAmountFromLamports(solBalance), 'blue');
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

    consoleOut('navigateToAsset received asset:', asset.publicAddress, 'blue');
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

  const reloadTokensAndActivity = useCallback(() => {
    consoleOut('Calling reloadTokensAndActivity...', '', 'orangered');
    setShouldLoadTokens(true);
    setDetailsPanelOpen(false);
    setAutoOpenDetailsPanel(true);
    reloadSwitch();
  }, [reloadSwitch, setShouldLoadTokens]);

  const hardReloadTokensAndActivity = useCallback(() => {
    consoleOut('Calling hardReloadTokensAndActivity...', '', 'orangered');
    setShouldLoadTokens(true);
    setDetailsPanelOpen(false);
    setSelectedAsset(accountTokens[0]);
    navigateToAsset(accountTokens[0]);
  }, [accountTokens, navigateToAsset, setSelectedAsset, setShouldLoadTokens]);

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
  ) => {
    setStatus(FetchStatus.Fetching);
    if (clearTxList) {
      setSolAccountItems(0);
      setTransactions(undefined);
    }
    setSelectedAsset(asset);
    setTimeout(() => {
      startSwitch();
    }, 10);
  }, [
    startSwitch,
    setTransactions,
    setSelectedAsset,
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

  const recordTxConfirmation = useCallback((item: TxConfirmationInfo, success = true) => {
    let event: any = undefined;

    if (item) {
      switch (item.operationType) {
        case OperationType.Wrap:
            event = success ? AppUsageEvent.WrapSolCompleted : AppUsageEvent.WrapSolFailed;
            break;
        case OperationType.Unwrap:
            event = success ? AppUsageEvent.UnwrapSolCompleted : AppUsageEvent.UnwrapSolFailed;
            break;
        case OperationType.Transfer:
            event = success ? AppUsageEvent.TransferOTPCompleted : AppUsageEvent.TransferOTPFailed;
            break;
        case OperationType.CreateAsset:
            event = success ? AppUsageEvent.CreateAssetCompleted : AppUsageEvent.CreateAssetFailed;
            break;
        case OperationType.CloseTokenAccount:
            event = success ? AppUsageEvent.CloseTokenAccountCompleted : AppUsageEvent.CloseTokenAccountFailed;
            break;
        case OperationType.SetAssetAuthority:
            event = success ? AppUsageEvent.SetAssetAutorityCompleted : AppUsageEvent.SetAssetAutorityFailed;
            break;
        case OperationType.DeleteAsset:
            event = success ? AppUsageEvent.DeleteAssetCompleted : AppUsageEvent.DeleteAssetFailed;
            break;
        case OperationType.TransferTokens:
            event = success ? AppUsageEvent.StreamTransferCompleted : AppUsageEvent.StreamTransferFailed;
            break;
        case OperationType.StreamAddFunds:
            event = success ? AppUsageEvent.StreamTopupCompleted : AppUsageEvent.StreamTopupFailed;
            break;
        case OperationType.StreamPause:
            event = success ? AppUsageEvent.StreamPauseCompleted : AppUsageEvent.StreamPauseFailed;
            break;
        case OperationType.StreamResume:
            event = success ? AppUsageEvent.StreamResumeCompleted : AppUsageEvent.StreamResumeFailed;
            break;
        case OperationType.StreamCreate:
            event = success ? AppUsageEvent.StreamCreateCompleted : AppUsageEvent.StreamCreateFailed;
            break;
        case OperationType.StreamClose:
            event = success ? AppUsageEvent.StreamCloseCompleted : AppUsageEvent.StreamCloseFailed;
            break;
        case OperationType.StreamWithdraw:
            event = success ? AppUsageEvent.StreamWithdrawalCompleted : AppUsageEvent.StreamWithdrawalFailed;
            break;
        case OperationType.StreamTransferBeneficiary:
            event = success ? AppUsageEvent.StreamTransferCompleted : AppUsageEvent.StreamTransferFailed;
            break;
        case OperationType.TreasuryAddFunds:
            event = success ? AppUsageEvent.AddFundsStreamingAccountCompleted : AppUsageEvent.AddFundsStreamingAccountFailed;
            break;
        case OperationType.TreasuryWithdraw:
            event = success ? AppUsageEvent.WithdrawFundsStreamingAccountCompleted : AppUsageEvent.WithdrawFundsStreamingAccountFailed;
            break;
        case OperationType.TreasuryStreamCreate:
            event = success ? AppUsageEvent.CreateStreamStreamingAccountCompleted : AppUsageEvent.CreateStreamStreamingAccountFailed;
            break;
        case OperationType.TreasuryCreate:
            event = success ? AppUsageEvent.CreateStreamingAccountCompleted : AppUsageEvent.CreateStreamingAccountFailed;
            break;
        case OperationType.TreasuryClose:
            event = success ? AppUsageEvent.CloseStreamingAccountCompleted : AppUsageEvent.CloseStreamingAccountFailed;
            break;
        case OperationType.TreasuryRefreshBalance:
            event = success ? AppUsageEvent.RefreshAccountBalanceCompleted : AppUsageEvent.RefreshAccountBalanceFailed;
            break;
        default:
            break;
      }
      if (event) {
        segmentAnalytics.recordEvent(event, { signature: item.signature });
      }
    }
  }, []);

  const fullAccountRefresh = () => {
    const fullRefreshCta = document.getElementById("account-refresh-cta");
    if (fullRefreshCta) {
      fullRefreshCta.click();
    }
  };

  const reloadAssets = () => {
    const tokensRefreshCta = document.getElementById("account-assets-hard-refresh-cta");
    if (tokensRefreshCta) {
      tokensRefreshCta.click();
    }
  };

  // Setup event handler for Tx confirmed
  const onTxConfirmed = useCallback((item: TxConfirmationInfo) => {

    const path = window.location.pathname;
    if (!path.startsWith(ACCOUNTS_ROUTE_BASE_PATH)) {
      return;
    }

    const softReloadAssets = () => {
      const tokensRefreshCta = document.getElementById("account-assets-refresh-cta");
      if (tokensRefreshCta) {
        tokensRefreshCta.click();
      }
    };

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

    const turnOffLockWorkflow = () => {
      isWorkflowLocked = false;
    }

    const notifyMultisigActionFollowup = (item: TxConfirmationInfo) => {
      if (!item || !item.extras || !item.extras.multisigAuthority) {
        turnOffLockWorkflow();
        return;
      }

      const myNotifyKey = `notify-${Date.now()}`;
      openNotification({
        type: "info",
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
              className="extra-small d-flex align-items-center pb-1"
              onClick={() => {
                const url = `/multisig/${item.extras.multisigAuthority}?v=proposals`;
                setHighLightableMultisigId(item.extras.multisigAuthority);
                navigate(url);
                notification.close(myNotifyKey);
              }}>
              Review proposal
            </Button>
          </>
        ),
        handleClose: turnOffLockWorkflow
      });
    }

    if (item) {
      if (isWorkflowLocked) {
        return;
      }

      // Lock the workflow
      if (item.extras && item.extras.multisigAuthority) {
        isWorkflowLocked = true;
      }

      switch (item.operationType) {
        case OperationType.Wrap:
        case OperationType.Unwrap:
        case OperationType.Transfer:
          consoleOut(`onTxConfirmed event handled for operation ${OperationType[item.operationType]}`, item, 'crimson');
          recordTxConfirmation(item, true);
          setIsUnwrapping(false);
          softReloadAssets();
          break;
        case OperationType.CreateAsset:
        case OperationType.CloseTokenAccount:
          consoleOut(`onTxConfirmed event handled for operation ${OperationType[item.operationType]}`, item, 'crimson');
          recordTxConfirmation(item, true);
          reloadAssets();
          break;
        case OperationType.DeleteAsset:
        case OperationType.SetAssetAuthority:
        case OperationType.TransferTokens:
          consoleOut(`onTxConfirmed event handled for operation ${OperationType[item.operationType]}`, item, 'crimson');
          recordTxConfirmation(item, true);
          if (item.extras && item.extras.multisigAuthority) {
            refreshMultisigs(false);
            notifyMultisigActionFollowup(item);
          }
          break;
        case OperationType.StreamCreate:
          setTimeout(() => {
            softReloadAssets();
            hardReloadStreams();
          }, 20);
          break;
        case OperationType.StreamPause:
        case OperationType.StreamResume:
        case OperationType.StreamAddFunds:
        case OperationType.TreasuryStreamCreate:
        case OperationType.TreasuryRefreshBalance:
        case OperationType.TreasuryAddFunds:
        case OperationType.TreasuryWithdraw:
          consoleOut(`onTxConfirmed event handled for operation ${OperationType[item.operationType]}`, item, 'crimson');
          recordTxConfirmation(item, true);
          if (item.extras && item.extras.multisigAuthority) {
            refreshMultisigs(false);
            notifyMultisigActionFollowup(item);
          }
          softReloadStreams();
          break;
        case OperationType.TreasuryCreate:
        case OperationType.StreamWithdraw:
          consoleOut(`onTxConfirmed event handled for operation ${OperationType[item.operationType]}`, item, 'crimson');
          recordTxConfirmation(item, true);
          if (item.extras && item.extras.multisigAuthority) {
            refreshMultisigs(false);
            notifyMultisigActionFollowup(item);
          }
          softReloadAssets();
          softReloadStreams();
          break;
        case OperationType.StreamClose:
        case OperationType.TreasuryClose:
          consoleOut(`onTxConfirmed event handled for operation ${OperationType[item.operationType]}`, item, 'crimson');
          recordTxConfirmation(item, true);
          if (item.extras && item.extras.multisigAuthority) {
            refreshMultisigs(false);
            notifyMultisigActionFollowup(item);
          } else {
            const url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddressRef.current}/streaming/outgoing`;
            navigate(url);
          }
          setTimeout(() => {
            hardReloadStreams();
          }, 20);
          break;
        case OperationType.StreamTransferBeneficiary:
          consoleOut(`onTxConfirmed event handled for operation ${OperationType[item.operationType]}`, item, 'crimson');
          recordTxConfirmation(item, true);
          if (item.extras && item.extras.multisigAuthority) {
            refreshMultisigs(false);
            notifyMultisigActionFollowup(item);
          } else {
            const url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddressRef.current}/streaming/incoming`;
            navigate(url);
          }
          setTimeout(() => {
            hardReloadStreams();
          }, 20);
          break;
        default:
          break;
      }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Setup event handler for Tx confirmation error
  const onTxTimedout = useCallback((item: TxConfirmationInfo) => {
    if (item) {
      consoleOut('onTxTimedout event executed:', item, 'crimson');
      recordTxConfirmation(item, false);
      if (item.operationType === OperationType.Unwrap) {
        setIsUnwrapping(false);
      } else if (item.operationType === OperationType.TransferTokens) {
        setIsBusy(false);
      }
      fullAccountRefresh();
      fullAccountRefresh();
    }
    resetTransactionStatus();
  }, [recordTxConfirmation, resetTransactionStatus]);

  const getChange = useCallback((accountIndex: number, meta: ParsedTransactionMeta | null): number => {
    if (meta !== null && accountIndex !== -1) {
      const prevBalance = meta.preBalances[accountIndex] || 0;
      const postbalance = meta.postBalances[accountIndex] || 0;
      const change = getAmountFromLamports(postbalance) - getAmountFromLamports(prevBalance);
      return change;
    }
    return 0;
  }, []);

  // Filter only useful Txs for the SOL account and return count
  const getSolAccountItems = useCallback((txs: MappedTransaction[]): number => {
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
    isSelectedAssetNativeAccount,
    getChange,
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
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createAsset = async (data: any) => {

      if (!connection || !selectedMultisig || !publicKey || !data || !data.token) { return null; }

      const [multisigSigner] = await PublicKey.findProgramAddress(
        [selectedMultisig.id.toBuffer()],
        multisigAddressPK
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
              getAmountWithSymbol(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getAmountWithSymbol(
                transactionAssetFees.blockchainFee + transactionAssetFees.mspFlatFee, 
                NATIVE_SOL_MINT.toBase58()
              )
            })`
          });
          customLogger.logWarning('Multisig Create Vault transaction failed', { transcript: transactionLog });
          return false;
        }

        return createAsset(data)
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

    const sendTx = async (): Promise<boolean> => {
      if (connection && wallet && wallet.publicKey && transaction) {
        const {
          context: { slot: minContextSlot },
          value: { blockhash, lastValidBlockHeight },
        } = await connection.getLatestBlockhashAndContext();

        transaction.feePayer = wallet.publicKey;
        transaction.recentBlockhash = blockhash;

        return wallet.sendTransaction(transaction, connection, { minContextSlot })
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
        const sent = await sendTx();
        consoleOut('sent:', sent);
        if (sent && !transactionCancelled) {
          consoleOut('Send Tx to confirmation queue:', signature);
          enqueueTransactionConfirmation({
            signature: signature,
            operationType: OperationType.CreateAsset,
            finality: "confirmed",
            txInfoFetchStatus: "fetching",
            loadingTitle: 'Confirming transaction',
            loadingMessage: `Create asset ${data.token.symbol}`,
            completedTitle: 'Transaction confirmed',
            completedMessage: `Asset ${data.token.symbol} successfully created`,
          });
          setIsBusy(false);
          onAssetCreated();
          closeCreateAssetModal(true);
        } else {
          openNotification({
            title: t('notifications.error-title'),
            description: t('notifications.error-sending-transaction'),
            type: "error"
          });
          setIsBusy(false);
        }
      } else { setIsBusy(false); }
    }

  }, [
    wallet,
    publicKey,
    connection,
    nativeBalance,
    selectedMultisig,
    multisigAddressPK,
    transactionCancelled,
    transactionAssetFees,
    transactionStatus.currentOperation,
    enqueueTransactionConfirmation,
    resetTransactionStatus,
    closeCreateAssetModal,
    setTransactionStatus,
    onAssetCreated,
    t,
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
    getMultisigTxProposalFees();
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.000010,
      mspPercentFee: 0
    };
    resetTransactionStatus();
    setTransactionFees(fees);
  }, [resetTransactionStatus, getMultisigTxProposalFees]);

  const onAcceptTransferToken = (params: any) => {
    consoleOut('params', params, 'blue');
    onExecuteTransferTokensTx(params);
  };

  const onExecuteTransferTokensTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

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
      let transferIx = SystemProgram.transfer({
        fromPubkey: fromAddress,
        toPubkey: toAddress,
        lamports: new BN(data.amount * LAMPORTS_PER_SOL).toNumber()
      });

      const ixs: TransactionInstruction[] = [];

      if (!fromMintAddress.equals(NATIVE_SOL_MINT)) {

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

        if (nativeBalance < minRequiredBalance) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${
              getAmountWithSymbol(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getAmountWithSymbol(
                minRequiredBalance, 
                NATIVE_SOL_MINT.toBase58()
              )
            })`
          });
          customLogger.logWarning('Create multisig transaction failed', { transcript: transactionLog });
          return false;
        }

        return transferTokens(data)
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

    const sendTx = async (): Promise<boolean> => {
      if (connection && wallet && wallet.publicKey && transaction) {
        const {
          context: { slot: minContextSlot },
          value: { blockhash, lastValidBlockHeight },
        } = await connection.getLatestBlockhashAndContext();

        transaction.feePayer = wallet.publicKey;
        transaction.recentBlockhash = blockhash;

        return wallet.sendTransaction(transaction, connection, { minContextSlot })
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
      const create = await createTx();
      consoleOut('created:', create);
      if (create && !transactionCancelled) {
        const sent = await sendTx();
        consoleOut('sent:', sent);
        if (sent) {
          consoleOut('Send Tx to confirmation queue:', signature);
          enqueueTransactionConfirmation({
            signature: signature,
            operationType: OperationType.TransferTokens,
            finality: "confirmed",
            txInfoFetchStatus: "fetching",
            loadingTitle: 'Confirming transaction',
            loadingMessage: `Transferring ${formatThousands(data.amount, selectedAsset.decimals)} ${selectedAsset.symbol} to ${shortenAddress(data.to)}`,
            completedTitle: 'Transaction confirmed',
            completedMessage: `Asset funds (${formatThousands(data.amount, selectedAsset.decimals)} ${selectedAsset.symbol}) successfully transferred to ${shortenAddress(data.to)}`,
            extras: {
              multisigAuthority: selectedMultisig ? selectedMultisig.authority.toBase58() : ''
            }
          });
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionFinished
          });
          setIsTransferTokenModalVisible(false);
          resetTransactionStatus();
          setIsBusy(false);
        } else {
          openNotification({
            title: t('notifications.error-title'),
            description: t('notifications.error-sending-transaction'),
            type: "error"
          });
          setIsBusy(false);
        }
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
    minRequiredBalance,
    transactionCancelled,
    transactionStatus.currentOperation,
    enqueueTransactionConfirmation,
    resetTransactionStatus,
    setTransactionStatus,
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
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

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
            getAmountWithSymbol(nativeBalance, NATIVE_SOL_MINT.toBase58())
          }) to pay for network fees (${
            getAmountWithSymbol(
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

    const sendTx = async (): Promise<boolean> => {
      if (connection && wallet && wallet.publicKey && transaction) {
        const {
          context: { slot: minContextSlot },
          value: { blockhash, lastValidBlockHeight },
        } = await connection.getLatestBlockhashAndContext();

        transaction.feePayer = wallet.publicKey;
        transaction.recentBlockhash = blockhash;

        return wallet.sendTransaction(transaction, connection, { minContextSlot })
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
      const created = await createTx();
      consoleOut('created:', created);
      if (created && !transactionCancelled) {
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
              completedMessage: `Asset ${selectedAsset.name} successfully transferred to ${shortenAddress(data.selectedAuthority)}`,
              extras: {
                multisigAuthority: selectedMultisig ? selectedMultisig.authority.toBase58() : ''
              }
            });
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            setIsTransferVaultAuthorityModalVisible(false);
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
    resetTransactionStatus,
    setTransactionStatus,
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
        new PublicKey(inputAsset.publicAddress),
        publicKey,
        new PublicKey(inputAsset.owner),
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
            getAmountWithSymbol(nativeBalance, NATIVE_SOL_MINT.toBase58())
          }) to pay for network fees (${
            getAmountWithSymbol(
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

    const sendTx = async (): Promise<boolean> => {
      if (connection && wallet && wallet.publicKey && transaction) {
        const {
          context: { slot: minContextSlot },
          value: { blockhash, lastValidBlockHeight },
        } = await connection.getLatestBlockhashAndContext();

        transaction.feePayer = wallet.publicKey;
        transaction.recentBlockhash = blockhash;

        return wallet.sendTransaction(transaction, connection, { minContextSlot })
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
              extras: {
                multisigAuthority: multisigAuth
              }
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

  const getAllUserV2Treasuries = useCallback(async (addr?: string) => {

    if (!msp) { return []; }

    if (addr || (accountAddress && address && accountAddress === address)) {
      const pk = new PublicKey(addr || accountAddress);

      consoleOut('Fetching treasuries for:', addr || accountAddress, 'orange');
      const treasuries = await msp.listTreasuries(pk, true, Category.default);
      consoleOut('getAllUserV2Treasuries ->', treasuries, 'orange');

      return treasuries;
    }

    return [];

  }, [
    msp,
    address,
    accountAddress
  ]);

  const refreshTreasuries = useCallback((reset = false) => {

    if (!publicKey || !accountAddress) { return; }

    const pk = new PublicKey(accountAddress);

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
              treasuriesv1 = await ms.listTreasuries(pk);
            } catch (error) {
              console.error(error);
            }
            treasuryAccumulator.push(...treasuriesv1);
          }

          const streamingAccounts = treasuryAccumulator.filter(t => !t.autoClose);

          const sortedStreamingAccountList = streamingAccounts.map((streaming) => streaming).sort((a, b) => {
            const vA1 = a as TreasuryInfo;
            const vA2 = a as Treasury;
            const vB1 = b as TreasuryInfo;
            const vB2 = b as Treasury;
          
            const isNewTreasury = ((vA2.version && vA2.version >= 2) && (vB2.version && vB2.version >= 2))
              ? true
              : false;
          
            if (isNewTreasury) {
              return +getSdkValue(vB2.totalStreams) - +getSdkValue(vA2.totalStreams);
            } else {
              return vB1.streamsAmount - vA1.streamsAmount;
            }
          });

          setTreasuryList(sortedStreamingAccountList);
          consoleOut('treasuryList:', sortedStreamingAccountList, 'blue');
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
    accountAddress,
    getAllUserV2Treasuries,
    getQueryAccountType,
  ]);

  const getTreasuryUnallocatedBalance = useCallback((tsry: Treasury | TreasuryInfo, assToken: TokenInfo | undefined) => {

    const getUnallocatedBalance = (details: Treasury | TreasuryInfo) => {
      const balance = new BN(details.balance);
      const allocationAssigned = new BN(details.allocationAssigned);
      return balance.sub(allocationAssigned);
    }

    if (tsry) {
        const decimals = assToken ? assToken.decimals : 9;
        const unallocated = getUnallocatedBalance(tsry);
        const isNewTreasury = (tsry as Treasury).version && (tsry as Treasury).version >= 2 ? true : false;
        const ub = isNewTreasury
          ? new BigNumber(toUiAmount(unallocated, decimals)).toNumber()
          : new BigNumber(unallocated.toString()).toNumber();
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

        const token = getTokenByMintAddress(associatedToken);

        if (token) {
          const tokenPrice = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);
          const amount = getTreasuryUnallocatedBalance(treasury, token);
          amountChange = amount * tokenPrice;
        }

        resume['totalNet'] += amountChange;
    }

    resume['totalAmount'] += treasuryList.length;

    // Update state
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
      const freshStream = await ms.refreshStream(stream);
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

      const isIncoming = stream.beneficiary && stream.beneficiary.equals(treasurer)
        ? true
        : false;

      // Get refreshed data
      const freshStream = await msp.refreshStream(stream) as Stream;
      if (!freshStream || freshStream.status !== STREAM_STATUS.Running) { continue; }

      const token = getTokenByMintAddress(freshStream.associatedToken.toBase58());

      if (token) {
        const tokenPrice = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);
        const decimals = token.decimals || 9;
        const amount = new BigNumber(freshStream.withdrawableAmount.toString()).toNumber();
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
      const freshStream = await ms.refreshStream(stream, undefined, false);
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

      const isIncoming = stream.beneficiary && stream.beneficiary.equals(treasurer)
        ? true
        : false;

      // Get refreshed data
      const freshStream = await msp.refreshStream(stream) as Stream;
      if (!freshStream || freshStream.status !== STREAM_STATUS.Running) { continue; }

      const token = getTokenByMintAddress(freshStream.associatedToken.toBase58());

      if (token) {
        const tokenPrice = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);
        const decimals = token.decimals || 9;
        const amount = new BigNumber(freshStream.fundsLeftInStream.toString()).toNumber();
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
    setPathParamStreamId('');
    setPathParamTreasuryId('');
    setPathParamStreamingTab('');
    setAccountTokens([]);
    setTreasuryList([]);
    setIncomingStreamList([]);
    setOutgoingStreamList([]);
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
    if (account?.lamports !== previousBalance || !nativeBalance) {
      // Refresh token balance
      refreshTokenBalance();
      setNativeBalance(getAmountFromLamports(account?.lamports));
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
    if (publicKey && accountAddress && address && accountAddress === address) {

      if (!previousRoute.startsWith('/accounts')) {
        clearStateData();
      }
      consoleOut('Loading treasuries...', 'accountAddress changed!', 'purple');
      refreshTreasuries(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountAddress, address, previousRoute, publicKey]);

  // Treasury list refresh timeout
  useEffect(() => {
    let timer: any;

    if (publicKey) {
      timer = setInterval(() => {
        consoleOut(`Refreshing treasuries past ${ONE_MINUTE_REFRESH_TIMEOUT / 60 / 1000}min...`);
        refreshTreasuries(false);
      }, ONE_MINUTE_REFRESH_TIMEOUT);
    }

    return () => clearInterval(timer);
  }, [
    publicKey,
    accountAddress,
    loadingTreasuries,
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
      switch (streamingTab) {
        case "streaming-accounts":
          if (streamingItemId) {
            consoleOut('Route param streamingItemId:', streamingItemId, 'crimson');
            setPathParamTreasuryId(streamingItemId);
          } else {
            setPathParamTreasuryId("");
          }
          break;
        case "incoming":
        case "outgoing":
          if (streamingItemId) {
            consoleOut('Route param streamingItemId:', streamingItemId, 'crimson');
            setPathParamStreamId(streamingItemId);
          } else {
            setPathParamStreamId("");
          }
          break;
        default:
          break;
      }
    }

    // The category is inferred from the route path
    if (location.pathname.indexOf('/assets') !== -1) {
      consoleOut('Setting category:', 'assets', 'crimson');
      setSelectedCategory("assets");
      if (!asset) {
        setPathParamAsset('');
      } else if (autoOpenDetailsPanel) {
        setDetailsPanelOpen(true);
      }
    } else if (location.pathname.indexOf('/streaming') !== -1) {
      consoleOut('Setting category:', 'streaming', 'crimson');
      setSelectedCategory("streaming");
      if (!streamingItemId) {
        setPathParamTreasuryId('');
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
    }

    let accType: InspectedAccountType;
    switch (accountTypeInQuery as InspectedAccountType) {
      case "multisig":
        accType = "multisig";
        break;
      case "wallet":
        accType = "wallet";
        break;
      default:
        accType = "wallet";
        break;
    }
    setInspectedAccountType(accType);

  }, [
    asset,
    address,
    publicKey,
    isPageLoaded,
    streamingTab,
    searchParams,
    accountAddress,
    streamingItemId,
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

  // Process userTokensResponse from AppState to get a renderable list of tokens
  useEffect(() => {

    if (userTokensResponse) {
      consoleOut('Processing userTokensResponse:', userTokensResponse, 'blue');
      setMultisigSolBalance(userTokensResponse.nativeBalance);
      setWsolBalance(userTokensResponse.wSolBalance);
      setAccountTokens(userTokensResponse.accountTokens);
      setUserOwnedTokenAccounts(userTokensResponse.userTokenAccouns);
      setTokenAccountGroups(userTokensResponse.tokenAccountGroups);
      if (userTokensResponse.selectedAsset) {
        selectAsset(userTokensResponse.selectedAsset);
      }
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userTokensResponse, setAccountTokens]);

  // Load the transactions when signaled
  useEffect(() => {

    if (!connection || !publicKey || !selectedAsset || !tokensLoaded || !shouldLoadTransactions || selectedCategory !== "assets") { return; }

    if (!loadingTransactions && accountAddress) {

      setShouldLoadTransactions(false);
      setLoadingTransactions(true);

      // Get the address to scan and ensure there is one
      const pk = getScanAddress(selectedAsset);
      consoleOut('Load transactions for pk:', pk ? pk.toBase58() : 'NONE', 'blue');
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

  // Set a multisig based on address in context
  useEffect(() => {
    if (!isMultisigContext || !multisigAccounts || !accountAddress) {
      return;
    }

    const item = multisigAccounts.find(m => m.authority.toBase58() === accountAddress);
    if (item) {
      setSelectedMultisig(item);
      setPendingMultisigTxCount(item.pendingTxsAmount);
      consoleOut('selectedMultisig:', item, 'blue');
      consoleOut('pendingMultisigTxCount:', item.pendingTxsAmount, 'blue');
    } else {
      setSelectedMultisig(undefined);
    }

  }, [accountAddress, isMultisigContext, multisigAccounts, setPendingMultisigTxCount, setSelectedMultisig]);

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
    if (pathParamAsset && accountTokens && accountTokens.length > 0) {
      consoleOut('Presetting token based on url...', pathParamAsset, 'crimson');
      const inferredAsset = accountTokens.find(t => t.publicAddress === pathParamAsset);
      if (inferredAsset) {
        selectAsset(inferredAsset);
      } else {
        selectAsset(accountTokens[0]);
      }
    } else if (!pathParamAsset && accountTokens && accountTokens.length > 0) {
      const inferredAsset = accountTokens.find(t => t.publicAddress === accountAddress);
      if (inferredAsset) {
        selectAsset(inferredAsset);
      }
    } else {
      reloadTokensAndActivity();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountAddress, accountTokens, pathParamAsset]);

  // Build CTAs
  useEffect(() => {
    if (!selectedAsset) { return; }

    const numMaxCtas = isXsDevice ? 2 : 5;
    const actions: AssetCta[] = [];
    let ctaItems = 0;

    // Send
    actions.push({
      action: MetaInfoCtaAction.Send,
      isVisible: true,
      caption: 'Send',
      disabled: !isInspectedAccountTheConnectedWallet(),
      uiComponentType: 'button',
      uiComponentId: `button-${MetaInfoCtaAction.Send}`,
      tooltip: isInspectedAccountTheConnectedWallet() ? '' : 'You can only send assets from your connected account',
      callBack: onSendAsset
    });
    ctaItems++;

    // UnwrapSol
    if (isInspectedAccountTheConnectedWallet() && isSelectedAssetWsol() && wSolBalance > 0) {
      actions.push({
        action: MetaInfoCtaAction.UnwrapSol,
        caption: 'Unwrap',
        isVisible: true,
        uiComponentType: 'button',
        disabled: false,
        uiComponentId: `button-${MetaInfoCtaAction.UnwrapSol}`,
        tooltip: '',
        callBack: showUnwrapSolModal
      });
      ctaItems++;
    }

    // Buy
    if (isInspectedAccountTheConnectedWallet() && !isSelectedAssetWsol() && !isCustomAsset) {
      actions.push({
        action: MetaInfoCtaAction.Buy,
        caption: 'Buy',
        isVisible: true,
        uiComponentType: ctaItems < numMaxCtas ? 'button' : 'menuitem',
        disabled: false,
        uiComponentId: `${ctaItems < numMaxCtas ? 'button' : 'menuitem'}-${MetaInfoCtaAction.Buy}`,
        tooltip: '',
        callBack: showDepositOptionsModal
      });
      ctaItems++;
    }

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
    if (isInspectedAccountTheConnectedWallet() && !isSelectedAssetWsol() && !isCustomAsset) {
      actions.push({
        action: MetaInfoCtaAction.Exchange,
        caption: 'Exchange',
        isVisible: true,
        uiComponentType: ctaItems < numMaxCtas ? 'button' : 'menuitem',
        disabled: false,
        uiComponentId: `${ctaItems < numMaxCtas ? 'button' : 'menuitem'}-${MetaInfoCtaAction.Exchange}`,
        tooltip: '',
        callBack: onExchangeAsset
      });
      ctaItems++;
    }

    // Invest
    if (investButtonEnabled()) {
      actions.push({
        action: MetaInfoCtaAction.Invest,
        caption: selectedAsset.symbol === 'sMEAN' ? 'Unstake' : 'Stake',
        isVisible: true,
        uiComponentType: ctaItems < numMaxCtas ? 'button' : 'menuitem',
        disabled: false,
        uiComponentId: `${ctaItems < numMaxCtas ? 'button' : 'menuitem'}-${MetaInfoCtaAction.Invest}`,
        tooltip: '',
        callBack: handleGoToInvestClick
      });
      ctaItems++;
    }

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

    // Copy asset mint address
    if (selectedAsset.address !== NATIVE_SOL.address) {
      actions.push({
        action: MetaInfoCtaAction.CopyAssetMintAddress,
        caption: 'Copy mint address',
        isVisible: true,
        uiComponentType: 'menuitem',
        disabled: false,
        uiComponentId: `menuitem-${MetaInfoCtaAction.CopyAssetMintAddress}`,
        tooltip: '',
        callBack: () => copyAddressToClipboard(selectedAsset.address)
      });
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
    if (inspectedAccountType && inspectedAccountType === "multisig") {
      actions.push({
        action: MetaInfoCtaAction.Close,
        caption: 'Close account',
        isVisible: true,
        uiComponentType: 'menuitem',
        disabled: isAnyTxPendingConfirmation() || !canDeleteVault() || !isDeleteAssetValid(),
        uiComponentId: `menuitem-${MetaInfoCtaAction.Close}`,
        tooltip: '',
        callBack: showDeleteVaultModal
      });
    } else if (isInspectedAccountTheConnectedWallet()) {
      actions.push({
        action: MetaInfoCtaAction.CloseAccount,
        caption: 'Close account',
        isVisible: true,
        uiComponentType: 'menuitem',
        disabled: isAnyTxPendingConfirmation(),
        uiComponentId: `menuitem-${MetaInfoCtaAction.CloseAccount}`,
        tooltip: '',
        callBack: showCloseAssetModal
      });
    }

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

  // Preset the selected streaming account from the list if provided in path param (streamingItemId)
  useEffect(() => {
    if (!publicKey || !treasuryList || treasuryList.length === 0) {
      setTreasuryDetail(undefined);
    }

    if (pathParamTreasuryId && streamingItemId && pathParamTreasuryId === streamingItemId) {
      const item = treasuryList.find(s => s.id as string === pathParamTreasuryId);
      consoleOut('treasuryDetail:', item, 'darkgreen');
      if (item) {
        setTreasuryDetail(item);
      }
    }
  }, [pathParamTreasuryId, publicKey, streamingItemId, treasuryList]);

  // Preset the selected stream from the list if provided in path param (streamId)
  useEffect(() => {
    const inPath = (item: Stream | StreamInfo, param: string) => {
      if (!item.id) {
        return false;
      }
      const isNew = item.version >= 2 ? true : false;
      if (isNew) {
        return (item as Stream).id.toBase58() === param;
      } else {
        return (item as StreamInfo).id as string === param;
      }
    }

    if (publicKey && streamList && streamList.length > 0 &&
        pathParamStreamId && (!streamDetail || !inPath(streamDetail, pathParamStreamId))) {
      const item = streamList.find(s => s.id && (s.id as PublicKey).toString() === pathParamStreamId);
      if (item) {
        setStreamDetail(item);
        setActiveStream(item);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathParamStreamId, publicKey, streamDetail, streamList]);

  // Set the list of incoming and outgoing streams
  useEffect(() => {
    if (!connection || !publicKey || !streamList) {
      setIncomingStreamList(undefined);
      setOutgoingStreamList(undefined);
      return;
    }

    setIncomingStreamList(streamList.filter((stream: Stream | StreamInfo) => isInboundStream(stream)));

    const onlyOuts = streamList.filter(item => !isInboundStream(item) && (item as any).category === 0);
    setOutgoingStreamList(onlyOuts);
  }, [
    publicKey,
    streamList,
    connection,
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
    if (!outgoingStreamList) { return; }

    setOutgoingAmount(outgoingStreamList.length);
  }, [outgoingStreamList]);

  // Total streams amount
  useEffect(() => {
    if (!incomingAmount && !outgoingAmount) { return; }

    setTotalStreamsAmount(incomingAmount + outgoingAmount);
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

  // Get treasuries summary
  useEffect(() => {
    if (!publicKey || !treasuryList) { return; }

    const timeout = setTimeout(() => {
      refreshTreasuriesSummary();
    }, 1000);

    return () => {
      clearTimeout(timeout);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey, treasuryList]);

  // Update total account balance
  useEffect(() => {
    if (loadingStreams) { return; }

    const wdb = new BigNumber(incomingStreamsSummary.totalNet.toFixed(2)).toNumber();

    const unallocatedTotalAmount = outgoingStreamsSummary.totalNet + streamingAccountsSummary.totalNet;
    const ub = new BigNumber(unallocatedTotalAmount.toFixed(2)).toNumber();

    setTotalAccountBalance(wdb + ub);
    setCanShowStreamingAccountBalance(true);
  }, [
    loadingStreams,
    incomingStreamsSummary,
    outgoingStreamsSummary,
    streamingAccountsSummary,
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
    }

  }, [accountTokens, getTokenPriceBySymbol, tokensLoaded, totalAccountBalance]);

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

  // Set page loaded on entering /accounts
  useEffect(() => {
    if (!isPageLoaded || !publicKey || !accountAddress) { return; }

    setIsPageLoaded(false);
    setTransactions([]);

  }, [
    publicKey,
    isPageLoaded,
    accountAddress,
    shouldLoadTokens,
    setTransactions,
  ]);

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
      setCanSubscribe(true);
      isWorkflowLocked = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  //////////////////
  // Transactions //
  //////////////////

  const onStartUnwrapTx = async () => {
    let transaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];
    setIsUnwrapping(true);

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

        return closeTokenAccount(
          connection,                       // connection
          wSolPubKey,                       // tokenPubkey
          publicKey                         // owner
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

    const sendTx = async (): Promise<boolean> => {
      if (connection && wallet && wallet.publicKey && transaction) {
        const {
          context: { slot: minContextSlot },
          value: { blockhash, lastValidBlockHeight },
        } = await connection.getLatestBlockhashAndContext();

        transaction.feePayer = wallet.publicKey;
        transaction.recentBlockhash = blockhash;

        return wallet.sendTransaction(transaction, connection, { minContextSlot })
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
      const create = await createTx();
      consoleOut('created:', create);
      if (create) {
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
    let url = '';

    if (location.pathname.indexOf('/assets') !== -1) {
      setDetailsPanelOpen(false);
      setAutoOpenDetailsPanel(false);
    } else if (location.pathname === `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming/incoming/${streamingItemId}`) {
      url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming/incoming`;
    } else if (location.pathname === `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming/outgoing/${streamingItemId}`) {
      url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming/outgoing`;
      setStreamDetail(undefined);
    } else if (location.pathname === `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming/streaming-accounts/${streamingItemId}`) {
      url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming/streaming-accounts`;
    } else {
      setDetailsPanelOpen(false);
      setAutoOpenDetailsPanel(false);
      url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming`;
    }
    // Navigate if needed but first append multisig param if exists
    if (url) {
      if (inspectedAccountType && inspectedAccountType === "multisig") {
        url += `?account-type=multisig`;
      }
      navigate(url);
    }
  }

  ///////////////
  // Rendering //
  ///////////////

  const renderMultisigPendinTxNotification = () => {
    if (!loadingMultisigTxPendingCount && pendingMultisigTxCount && pendingMultisigTxCount > 0) {
      return (
        <div key="pending-proposals" className="transaction-list-row no-pointer shift-up-1">
          <div className="flex-row align-items-center fg-warning simplelink underline-on-hover" onClick={() => {
              let url = '/multisig';
              if (accountAddress) {
                setHighLightableMultisigId(accountAddress);
                url += `/${accountAddress}?v=proposals`;
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

    const renderValues = () => {
      if (netWorth) {
        return toUsCurrency(netWorth);
      } else {
        return '$0.00';
      }
    }

    return (
      <div className={`networth-list-item flex-fixed-right no-pointer ${selectedCategory === "networth" ? 'selected' : ''}`}>
        <div className="font-bold font-size-110 left">{!isInspectedAccountTheConnectedWallet() ? "Treasury Balance" : "Net Worth"}</div>
        <div className="font-bold font-size-110 right">
          {loadingStreams || !canShowStreamingAccountBalance ? (
              <IconLoading className="mean-svg-icons" style={{ height: "12px", lineHeight: "12px" }} />
          ) : renderValues()}
        </div>
      </div>
    );
  };

  const renderMoneyStreamsSummary = () => {

    const renderValues = () => {
      if (totalStreamsAmount === 0) {
        return (<div className="subtitle">{t('account-area.no-money-streams')}</div>);
      } else {
        return (<div className="subtitle">{incomingAmount} {t('streams.stream-stats-incoming')}, {outgoingAmount} {t('streams.stream-stats-outgoing')}</div>);
      }
    }

    return  (
      <>
        {
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
                    <span className="font-size-75 font-bold text-shadow">{kFormatter(totalStreamsAmount || 0, 1) || 0}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="description-cell">
              <div className="title">{t('account-area.money-streams')}</div>
              {loadingStreams ? (
                <div className="subtitle"><IconLoading className="mean-svg-icons" style={{ height: "12px", lineHeight: "12px" }}/></div>
              ) : renderValues()}
            </div>
            <div className="rate-cell">
              {loadingStreams || !canShowStreamingAccountBalance ? (
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
        }
      </>
    );
  }

  const renderAsset = useCallback((asset: UserTokenAccount) => {
    const onTokenAccountClick = () => {
      setSelectedCategory("assets");
      consoleOut('clicked on asset:', asset.publicAddress, 'blue');
      setDetailsPanelOpen(true);
      setAutoOpenDetailsPanel(true);
      navigateToAsset(asset);
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

    const getRowSelectionClass = (): string => {
      if (isSelectedToken() && selectedCategory === "assets") {
        return 'selected';
      } else {
        if (hideLowBalances && (shouldHideAsset(asset) || !asset.balance)) {
          return 'hidden';
        }
      }
      return '';
    }

    const getRateAmountDisplay = (): string => {
      if (tokenPrice > 0) {
        if (!asset.valueInUsd) { return '$0.00'; }
        return asset.valueInUsd > 0 && asset.valueInUsd < ACCOUNTS_LOW_BALANCE_LIMIT
          ? '< $0.01'
          : toUsCurrency(asset.valueInUsd || 0);
      }
      return '—';
    }

    return (
      <div key={`${asset.displayIndex}`}
            onClick={onTokenAccountClick}
            id={asset.publicAddress}
            className={`transaction-list-row ${getRowSelectionClass()}`
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
            {getRateAmountDisplay()}
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

  const renderAssetsList = () => {

    const renderMessages = () => {
      if (loadingTokenAccounts) {
        return (
          <div className="flex flex-center">
            <Spin indicator={antIcon} />
          </div>
        );
      } else if (tokensLoaded) {
        return (
          <div className="flex flex-center">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        );
      } else {
        return null;
      }
    }

    return (
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
            {accountTokens.map(asset => renderAsset(asset))}
          </>
        ) : renderMessages()}
      </>
    );
  }

  const renderActivityList = () => {
    const hasItems = hasItemsToRender();

    if (status === FetchStatus.Fetching && !hasItems) {
      return (
        <div className="flex flex-center">
          <Spin indicator={antIcon} />
        </div>
      );
    }

    const renderMessages = () => {
      if (status === FetchStatus.Fetched && !hasTransactions()) {
        return (
          <div className="h-100 flex-center">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{t('assets.no-transactions')}</p>} />
          </div>
        );
      } else if (status === FetchStatus.FetchFailed) {
        return (
          <div className="h-100 flex-center">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{t('assets.loading-error')}</p>} />
          </div>
        );
      } else {
        return null;
      }
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
              ) : renderMessages()
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

  const renderTransactions = () => {
    if (transactions) {
      if (isSelectedAssetNativeAccount()) {
        // Render only txs that have SOL changes
        const filtered = transactions.filter(tx => {
          const meta = tx.parsedTransaction && tx.parsedTransaction.meta
          ? tx.parsedTransaction.meta
          : null;
          if (!meta || meta.err !== null) { return false; }
          const accounts = tx.parsedTransaction.transaction.message.accountKeys;
          const accIdx = accounts.findIndex(acc => acc.pubkey.toBase58() === accountAddress);
          if (isSelectedAssetNativeAccount() && accIdx === -1) { return false; }
          // Get amount change for each tx
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
        return transactions.map((trans: MappedTransaction, index: number) => {
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

  const getAssetListOptions = () => {
    const items: ItemType[] = [];
    items.push({
      key: '01-suggest-asset',
      label: (
        <div onClick={showSuggestAssetModal}>
          <IconLightBulb className="mean-svg-icons" />
          <span className="menu-item-text">Suggest an asset</span>
        </div>
      )
    });
    if (accountTokens && accountTokens.length > 0) {
      if (hideLowBalances) {
        items.push({
          key: '02-show-low-balances',
          label: (
            <div onClick={() => toggleHideLowBalances(false)}>
              <IconEyeOn className="mean-svg-icons" />
              <span className="menu-item-text">Show low balances</span>
            </div>
          )
        });
      } else {
        items.push({
          key: '03-hide-low-balances',
          label: (
            <div onClick={() => toggleHideLowBalances(true)}>
              <IconEyeOff className="mean-svg-icons" />
              <span className="menu-item-text">Hide low balances</span>
            </div>
          )
        });
      }
    }
    return <Menu items={items} />;
  }

  const renderUserAccountAssetMenu = () => {
    const ctas = assetCtas.filter(m => m.isVisible && m.uiComponentType === 'menuitem');
    const items: ItemType[] = ctas.map((item: MetaInfoCta, index: number) => {
      return {
        key: `${index + 44}-${item.uiComponentId}`,
        label: (
          <span className="menu-item-text" onClick={item.callBack}>{item.caption}</span>
        ),
        disabled: item.disabled
      }
    });
    return <Menu items={items} />;
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
    return false;
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
                  disabled={isAnyTxPendingConfirmation() || !isSendFundsValid()}
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
                  disabled={isAnyTxPendingConfirmation() || !isTransferOwnershipValid()}
                  onClick={showTransferVaultAuthorityModal}>
                    <div className="btn-content">
                      Change asset ownership
                    </div>
                </Button>
              </Col>
            </Row>
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
          })}
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

    const renderBalance = () => {
      if (tokenPrice > 0) {
        return selectedAsset.balance ? toUsCurrency((selectedAsset.balance || 0) * tokenPrice) : '$0.00';
      } else {
        return '$0.00';
      }
    }
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
                <div className="info-label">Value</div>
                <div className="transaction-detail-row">
                  <span className="info-data">{renderBalance()}</span>
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
      <div className="qr-container bg-white">
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
      let url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming/streaming-accounts/${streamingTreasury.id as string}`;

      if (inspectedAccountType && inspectedAccountType === "multisig") {
        url += `?account-type=multisig&v=streams`;
      } else {
        url += `?v=streams`;
      }
  
      navigate(url);
    }
  }

  const goToStreamingAccountStreamDetailsHandler = (stream: any) => {
    let url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming/outgoing/${stream.id as string}`;

    if (inspectedAccountType && inspectedAccountType === "multisig") {
      url += `?account-type=multisig&v=details`;
    } else {
      url += `?v=details`;
    }

    navigate(url);
  }

  const returnFromIncomingStreamDetailsHandler = () => {
    let url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming/incoming`;

    if (inspectedAccountType && inspectedAccountType === "multisig") {
      url += `?account-type=multisig`;
    }

    setTimeout(() => {
      setStreamDetail(undefined);
    }, 100);
    setTimeout(() => {
      setStreamDetail(undefined);
    }, 100);
    navigate(url);
  }

  const returnFromStreamingAccountDetailsHandler = () => {

    let url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming/streaming-accounts`;

    if (inspectedAccountType && inspectedAccountType === "multisig") {
      url += `?account-type=multisig`;
    }

    navigate(url);
  }

  const renderTotalAccountBalance = () => {
    return totalAccountBalance > 0 ? toUsCurrency(totalAccountBalance) : "$0.00";
  }

  return (
    <>
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
                  <div id="streams-refresh-noreset-cta" onClick={onRefreshStreamsNoReset}></div>
                  <div id="streams-refresh-reset-cta" onClick={onRefreshStreamsReset}></div>
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
                                    setHighLightableMultisigId(selectedMultisig.authority.toBase58());
                                  }
                                  navigate(`/multisig/${address}?v=proposals`);
                                }}
                              />
                            </Tooltip>
                          </span>
                        </div>
                        {selectedMultisig ? (
                          <span className="title ml-2">{selectedMultisig.label}</span>
                        ) : (
                          <span className="title ml-2">Multisig safe</span>
                        )}
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
                      <span className="icon-button-container">
                        <Tooltip placement="bottom" title={t('account-area.explorer-link')}>
                          <Button
                            type="default"
                            shape="circle"
                            size="middle"
                            icon={<IconExternalLink className="mean-svg-icons" style={{width: "16", height: "16"}} />}
                            onClick={() => openLinkInNewTab(`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${accountAddress}${getSolanaExplorerClusterParam()}`)}
                          />
                        </Tooltip>
                      </span>
                      <span className="icon-button-container hidden-sm simplelink">
                        <Tooltip placement="bottom" title="Refresh payment streams">
                          <Button
                            type="default"
                            shape="circle"
                            size="middle"
                            icon={<ReloadOutlined />}
                            onClick={() => {
                              reloadTokensAndActivity();
                              onRefreshStreamsNoReset();
                            }}
                          />
                        </Tooltip>
                      </span>
                      <div id="account-assets-refresh-cta" onClick={reloadTokensAndActivity}></div>
                      <div id="account-assets-hard-refresh-cta" onClick={hardReloadTokensAndActivity}></div>
                    </div>
                  </div>
                  <div className="inner-container">

                    {/* Pending Multisig proposals notification */}
                    {inspectedAccountType === "multisig" && renderMultisigPendinTxNotification()}

                    {/* Net Worth header (sticky) */}
                    {renderNetworth()}

                    {/* Middle area (vertically flexible block of items) */}
                    <div className={`item-block${!isXsDevice ? ' vertical-scroll' : ''}`}>

                      <div className="asset-category-title flex-fixed-right">
                        <div className="title">Streaming Assets</div>
                        <div className="amount">{
                          loadingStreams || !canShowStreamingAccountBalance ? (
                            <IconLoading className="mean-svg-icons" style={{ height: "12px", lineHeight: "12px" }} />
                          ) : renderTotalAccountBalance()}
                        </div>
                      </div>
                      <div className="asset-category">
                        {renderMoneyStreamsSummary()}
                      </div>

                      <div className="asset-category-title flex-fixed-right">
                        <div className="title">Tokens ({accountTokens.length})</div>
                        <div className="amount">{toUsCurrency(totalTokenAccountsValue)}</div>
                      </div>
                      <div className="asset-category flex-column">
                        {renderAssetsList()}
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
                        overlay={getAssetListOptions()}
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

                    <div className="float-top-right mr-1 mt-1">
                      <span className="icon-button-container secondary-button">
                        <Tooltip placement="bottom" title="Refresh payment streams">
                          <Button
                            id="account-refresh-cta"
                            type="default"
                            shape="circle"
                            size="middle"
                            icon={<ReloadOutlined className="mean-svg-icons" />}
                            onClick={() => {
                              reloadTokensAndActivity();
                              onRefreshStreamsNoReset();
                            }}
                          />
                        </Tooltip>
                      </span>
                    </div>

                    {selectedCategory === "assets" ? (
                      <>
                        {canShowBuyOptions() ? renderTokenBuyOptions() : (
                          <div className="flexible-column-bottom">
                            <div className="top">                              
                              {renderCategoryMeta()}
                              {selectedCategory === "assets" && renderUserAccountAssetCtaRow()}
                            </div>
                            {!isInspectedAccountTheConnectedWallet() && inspectedAccountType === "multisig" && selectedMultisig && (
                              (multisigSolBalance !== undefined && multisigSolBalance <= MIN_SOL_BALANCE_REQUIRED) ? (
                                <Row gutter={[8, 8]}>
                                  <Col span={24} className={`alert-info-message pr-2 ${selectedMultisig ? "simplelink" : "disable-pointer"}`} onClick={showSolBalanceModal}>
                                    <Alert message="SOL account balance is very low in the safe. Click here to add more SOL." type="info" showIcon />
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
                        {!pathParamStreamId && !pathParamTreasuryId ? (
                          <MoneyStreamsInfoView
                            accountAddress={accountAddress}
                            loadingStreams={loadingStreams}
                            loadingTreasuries={loadingTreasuries}
                            multisigAccounts={multisigAccounts}
                            onSendFromIncomingStreamInfo={goToStreamIncomingDetailsHandler}
                            onSendFromOutgoingStreamInfo={goToStreamOutgoingDetailsHandler}
                            onSendFromStreamingAccountInfo={goToStreamingAccountDetailsHandler}
                            selectedMultisig={selectedMultisig}
                            selectedTab={pathParamStreamingTab}
                            streamList={streamList}
                            treasuryList={treasuryList}
                          />
                        ) : pathParamStreamId && pathParamStreamingTab === "incoming" ? (
                          <MoneyStreamsIncomingView
                            accountAddress={accountAddress}
                            loadingStreams={loadingStreams}
                            streamSelected={streamDetail}
                            multisigAccounts={multisigAccounts}
                            onSendFromIncomingStreamDetails={returnFromIncomingStreamDetailsHandler}
                          />
                        ) : pathParamStreamId && pathParamStreamingTab === "outgoing" ? (
                          <MoneyStreamsOutgoingView
                            loadingStreams={loadingStreams}
                            accountAddress={accountAddress}
                            streamSelected={streamDetail}
                            streamList={streamList}
                            multisigAccounts={multisigAccounts}
                            onSendFromOutgoingStreamDetails={onBackButtonClicked}
                          />
                        ) : pathParamTreasuryId && pathParamStreamingTab === "streaming-accounts" && treasuryDetail && treasuryDetail.id === pathParamTreasuryId ? (
                          <StreamingAccountView
                            treasuryList={treasuryList}
                            multisigAccounts={multisigAccounts}
                            selectedMultisig={selectedMultisig}
                            streamingAccountSelected={treasuryDetail}
                            onSendFromStreamingAccountDetails={returnFromStreamingAccountDetailsHandler}
                            onSendFromStreamingAccountStreamInfo={goToStreamingAccountStreamDetailsHandler}
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
          transactionFees={multisigTransactionFees}
          handleOk={onAcceptTransferToken}
          handleClose={() => {
            onAfterEveryModalClose();
            setIsTransferTokenModalVisible(false);
          }}
          selectedMultisig={selectedMultisig || undefined}
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
          selectedMultisig={selectedMultisig || undefined}
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

      {(isSolBalanceModalOpen && selectedMultisig) && (
        <SolBalanceModal
          address={NATIVE_SOL.address || ''}
          accountAddress={accountAddress}
          multisigAddress={address as string}
          isVisible={isSolBalanceModalOpen}
          handleClose={hideSolBalanceModal}
          tokenSymbol={NATIVE_SOL.symbol}
          nativeBalance={selectedMultisig.balance}
          selectedMultisig={selectedMultisig}
          isStreamingAccount={false}
        />
      )}

      <PreFooter />
    </>
  );

};