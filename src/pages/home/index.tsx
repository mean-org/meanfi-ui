import { ArrowLeftOutlined, LoadingOutlined, ReloadOutlined, SyncOutlined } from '@ant-design/icons';
import { App, AppConfig, AppsProvider, Arg, NETWORK, UiElement, UiInstruction } from '@mean-dao/mean-multisig-apps';

// Credix imports
import * as credixMainnet from '@mean-dao/mean-multisig-apps/lib/apps/credix/func';
import * as credixDevnet from '@mean-dao/mean-multisig-apps/lib/apps/credix-devnet/func';

import {
  DEFAULT_EXPIRATION_TIME_SECONDS,
  getFees,
  MeanMultisig,
  MultisigTransactionFees,
  MULTISIG_ACTIONS,
} from '@mean-dao/mean-multisig-sdk';
import { MoneyStreaming, StreamInfo, STREAM_STATE, TreasuryInfo } from '@mean-dao/money-streaming';
import {
  Category,
  PaymentStreaming,
  Stream,
  STREAM_STATUS_CODE,
  TransactionFees,
  PaymentStreamingAccount,
  TransferTransactionAccounts,
} from '@mean-dao/payment-streaming';
import { AnchorProvider, BN, Idl, Program } from '@project-serum/anchor';
import { Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';
import { Alert, Button, Col, Divider, Dropdown, Empty, Row, Segmented, Space, Spin, Tooltip } from 'antd';
import { ItemType } from 'antd/lib/menu/hooks/useItems';
import notification from 'antd/lib/notification';
import { SegmentedLabeledOption } from 'antd/lib/segmented';
import { segmentAnalytics } from 'App';
import BigNumber from 'bignumber.js';
import { AccountsCloseAssetModal } from 'components/AccountsCloseAssetModal';
import { AccountsInitAtaModal } from 'components/AccountsInitAtaModal';
import { AccountsMergeModal } from 'components/AccountsMergeModal';
import { AccountsSuggestAssetModal } from 'components/AccountsSuggestAssetModal';
import { AddressDisplay } from 'components/AddressDisplay';
import { MultisigAddAssetModal } from 'components/MultisigAddAssetModal';
import { MultisigProposalModal } from 'components/MultisigProposalModal';
import { MultisigTransferTokensModal } from 'components/MultisigTransferTokensModal';
import { MultisigVaultDeleteModal } from 'components/MultisigVaultDeleteModal';
import { MultisigVaultTransferAuthorityModal } from 'components/MultisigVaultTransferAuthorityModal';
import { openNotification } from 'components/Notifications';
import { PreFooter } from 'components/PreFooter';
import { ReceiveSplOrSolModal } from 'components/ReceiveSplOrSolModal';
import { SendAssetModal } from 'components/SendAssetModal';
import { SolBalanceModal } from 'components/SolBalanceModal';
import { WrapSolModal } from 'components/WrapSolModal';
import {
  ACCOUNTS_LOW_BALANCE_LIMIT,
  MEAN_MULTISIG_ACCOUNT_LAMPORTS,
  MIN_SOL_BALANCE_REQUIRED,
  MULTISIG_ROUTE_BASE_PATH,
  NO_FEES,
  ONE_MINUTE_REFRESH_TIMEOUT,
  SOLANA_EXPLORER_URI_INSPECT_ADDRESS,
  STAKING_ROUTE_BASE_PATH,
  TRANSACTIONS_PER_PAGE,
  WRAPPED_SOL_MINT_ADDRESS,
} from 'constants/common';
import { NATIVE_SOL } from 'constants/tokens';
import { useNativeAccount } from 'contexts/accounts';
import { AppStateContext, TransactionStatusInfo } from 'contexts/appstate';
import { getSolanaExplorerClusterParam, useConnectionConfig } from 'contexts/connection';
import { confirmationEvents, TxConfirmationContext, TxConfirmationInfo } from 'contexts/transaction-status';
import { useWallet } from 'contexts/wallet';
import useLocalStorage from 'hooks/useLocalStorage';
import useTransaction from 'hooks/useTransaction';
import useWindowSize from 'hooks/useWindowResize';
import { IconAdd, IconEyeOff, IconEyeOn, IconLightBulb, IconLoading, IconSafe, IconVerticalEllipsis } from 'Icons';
import { appConfig, customLogger } from 'index';
import { resolveParsedAccountInfo } from 'middleware/accounts';
import { createAddSafeAssetTx, CreateSafeAssetTxParams } from 'middleware/createAddSafeAssetTx';
import { getStreamAssociatedMint } from 'middleware/getStreamAssociatedMint';
import { fetchAccountHistory, MappedTransaction } from 'middleware/history';
import { SOL_MINT } from 'middleware/ids';
import { AppUsageEvent } from 'middleware/segment-service';
import {
  ComputeBudgetConfig,
  DEFAULT_BUDGET_CONFIG,
  getChange,
  getProposalWithPrioritizationFees,
  sendTx,
  signTx,
} from 'middleware/transactions';
import { consoleOut, copyText, getTransactionStatusForLogs, isDev, kFormatter, toUsCurrency } from 'middleware/ui';
import {
  formatThousands,
  getAmountFromLamports,
  getAmountWithSymbol,
  getSdkValue,
  getTxIxResume,
  shortenAddress,
  toUiAmount,
} from 'middleware/utils';
import {
  AccountTokenParsedInfo,
  AssetCta,
  AssetGroups,
  KnownAppMetadata,
  KNOWN_APPS,
  MetaInfoCtaAction,
  ProgramAccounts,
  RegisteredAppPaths,
  UserTokenAccount,
} from 'models/accounts';
import { MeanNft } from 'models/accounts/NftTypes';
import { MetaInfoCta } from 'models/common-types';
import { EventType, OperationType, TransactionStatus } from 'models/enums';
import {
  CreateNewProposalParams,
  isCredixFinance,
  NATIVE_LOADER,
  parseSerializedTx,
  SetAssetAuthPayload,
  TransferTokensTxParams,
  ZERO_FEES,
} from 'models/multisig';
import { TokenInfo } from 'models/SolanaTokenInfo';
import { initialSummary, StreamsSummary } from 'models/streams';
import { FetchStatus } from 'models/transactions';
import { INITIAL_TREASURIES_SUMMARY, UserTreasuriesSummary } from 'models/treasuries';
import React, { Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { isMobile } from 'react-device-detect';
import { Helmet } from 'react-helmet';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AppsList, AssetActivity, NftDetails, NftPaginatedList, OtherAssetsList } from 'views';
import AssetList from 'views/AssetList';
import { getBuyOptionsCta } from './asset-ctas/buyOptionsCta';
import { getCloseAccountCta } from './asset-ctas/closeAccountCta';
import { getDepositOptionsCta } from './asset-ctas/depositOptionsCta';
import { getExchangeAssetCta } from './asset-ctas/exchangeAssetCta';
import { getInvestAssetCta } from './asset-ctas/investAssetCta';
import { getMergeAccountsCta } from './asset-ctas/mergeAccountsCta';
import { getUnwrapSolCta } from './asset-ctas/unwrapSolCta';
import { getWrapSolCta } from './asset-ctas/wrapSolCta';
import getNftMint from './getNftMint';
import './style.scss';
import useAccountPrograms from './useAccountPrograms';
import useAppNavigation from './useAppNavigation';
import { createCloseTokenAccountTx } from 'middleware/createCloseTokenAccountTx';
import createTokenTransferTx from 'middleware/createTokenTransferTx';
import { createV0InitAtaAccountTx } from 'middleware/createV0InitAtaAccountTx';

const SafeDetails = React.lazy(() => import('../safe/index'));
const PaymentStreamingComponent = React.lazy(() => import('../payment-streaming/index'));
const StakingComponent = React.lazy(() => import('../staking/index'));
const VestingComponent = React.lazy(() => import('../vesting/index'));
const ProgramDetailsComponent = React.lazy(() => import('../../views/ProgramDetails/index'));
const PersonalAccountSummary = React.lazy(() => import('../../views/WalletAccountSummary/index'));

const loadIndicator = <LoadingOutlined style={{ fontSize: 48 }} spin />;
let isWorkflowLocked = false;

export const HomeView = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { asset, streamingItemId, programId } = useParams();
  const { endpoint } = useConnectionConfig();
  const { publicKey, connected, wallet } = useWallet();
  const connectionConfig = useConnectionConfig();
  const {
    programs,
    streamList,
    accountNfts,
    tokensLoaded,
    streamListv1,
    streamListv2,
    streamDetail,
    transactions,
    splTokenList,
    isWhitelisted,
    selectedAsset,
    previousRoute,
    loadingStreams,
    selectedAccount,
    lastTxSignature,
    selectedMultisig,
    multisigAccounts,
    transactionStatus,
    userTokensResponse,
    loadingTokenAccounts,
    streamProgramAddress,
    streamV2ProgramAddress,
    previousWalletConnectState,
    setPendingMultisigTxCount,
    setPaymentStreamingStats,
    showDepositOptionsModal,
    getTokenPriceByAddress,
    setIsVerifiedRecipient,
    getTokenByMintAddress,
    setTransactionStatus,
    refreshTokenBalance,
    setShouldLoadTokens,
    setSelectedMultisig,
    resetContractValues,
    appendHistoryItems,
    refreshStreamList,
    setStreamsSummary,
    refreshMultisigs,
    setPreviousRoute,
    setSelectedToken,
    setSelectedAsset,
    setStreamDetail,
    clearStreams,
  } = useContext(AppStateContext);
  const { confirmationHistory, enqueueTransactionConfirmation } = useContext(TxConfirmationContext);
  const { t } = useTranslation('common');
  const { width } = useWindowSize();
  const { account } = useNativeAccount();
  const [accountTokens, setAccountTokens] = useState<UserTokenAccount[]>([]);
  const [solAccountItems, setSolAccountItems] = useState(0);
  const [tokenAccountGroups, setTokenAccountGroups] = useState<Map<string, AccountTokenParsedInfo[]>>();
  const [userOwnedTokenAccounts, setUserOwnedTokenAccounts] = useState<AccountTokenParsedInfo[]>();
  const [selectedTokenMergeGroup, setSelectedTokenMergeGroup] = useState<AccountTokenParsedInfo[]>();
  const [wSolBalance, setWsolBalance] = useState(0);
  const [refreshingBalance, setRefreshingBalance] = useState(false);
  const { onExecute } = useTransaction();
  const [selectedApp, setSelectedApp] = useState<KnownAppMetadata>();
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
  const [isBusy, setIsBusy] = useState(false);
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [loadingTreasuries, setLoadingTreasuries] = useState(false);
  const [treasuryList, setTreasuryList] = useState<(PaymentStreamingAccount | TreasuryInfo)[]>([]);

  const {
    selectedCategory,
    selectedAssetsGroup,
    setSelectedAssetsGroup,
    detailsPanelOpen,
    turnOffRightPanel,
    turnOnRightPanel,
  } = useAppNavigation({
    asset,
    selectedAccount,
  });

  const [incomingStreamList, setIncomingStreamList] = useState<Array<Stream | StreamInfo> | undefined>();
  const [outgoingStreamList, setOutgoingStreamList] = useState<Array<Stream | StreamInfo> | undefined>();
  // Balances and USD values
  const [totalAccountBalance, setTotalAccountBalance] = useState(0);
  const [incomingStreamsSummary, setIncomingStreamsSummary] = useState<StreamsSummary>(initialSummary);
  const [outgoingStreamsSummary, setOutgoingStreamsSummary] = useState<StreamsSummary>(initialSummary);
  const [incomingAmount, setIncomingAmount] = useState(0);
  const [outgoingAmount, setOutgoingAmount] = useState(0);
  const [totalStreamsAmount, setTotalStreamsAmount] = useState<number | undefined>(undefined);
  const [streamingAccountsSummary, setStreamingAccountsSummary] =
    useState<UserTreasuriesSummary>(INITIAL_TREASURIES_SUMMARY);
  const [multisigSolBalance, setMultisigSolBalance] = useState<number | undefined>(undefined);
  const [totalTokenAccountsValue, setTotalTokenAccountsValue] = useState(0);
  const [netWorth, setNetWorth] = useState(0);
  const [canShowStreamingAccountBalance, setCanShowStreamingAccountBalance] = useState(false);
  const [multisigTransactionFees, setMultisigTransactionFees] = useState<MultisigTransactionFees>(ZERO_FEES);
  const [, setMinRequiredBalance] = useState(0);
  const [selectedNft, setSelectedNft] = useState<MeanNft | undefined>(undefined);
  // Multisig Apps
  const [appsProvider, setAppsProvider] = useState<AppsProvider>();
  const [solanaApps, setSolanaApps] = useState<App[]>([]);
  const { loadingPrograms } = useAccountPrograms();
  const [selectedProgram, setSelectedProgram] = useState<ProgramAccounts | undefined>(undefined);

  // SOL Balance Modal
  const [isSolBalanceModalOpen, setIsSolBalanceModalOpen] = useState(false);
  const hideSolBalanceModal = useCallback(() => setIsSolBalanceModalOpen(false), []);
  const showSolBalanceModal = useCallback(() => setIsSolBalanceModalOpen(true), []);

  const [transactionPriorityOptions] = useLocalStorage<ComputeBudgetConfig>(
    'transactionPriority',
    DEFAULT_BUDGET_CONFIG,
  );

  const multisigAddressPK = useMemo(() => new PublicKey(appConfig.getConfig().multisigProgramAddress), []);

  const connection = useMemo(
    () =>
      new Connection(endpoint, {
        commitment: 'confirmed',
        disableRetryOnRateLimit: true,
      }),
    [endpoint],
  );

  /////////////////
  //  Init code  //
  /////////////////

  const multisigClient = useMemo(() => {
    if (!connection || !publicKey || !connectionConfig.endpoint) {
      return null;
    }
    return new MeanMultisig(connectionConfig.endpoint, publicKey, 'confirmed', multisigAddressPK);
  }, [publicKey, connection, multisigAddressPK, connectionConfig.endpoint]);

  // Create and cache Money Streaming Program instance
  const ms = useMemo(
    () => new MoneyStreaming(endpoint, streamProgramAddress, 'confirmed'),
    [endpoint, streamProgramAddress],
  );

  const paymentStreaming = useMemo(() => {
    return new PaymentStreaming(connection, new PublicKey(streamV2ProgramAddress), 'confirmed');
  }, [connection, streamV2ProgramAddress]);

  const isCustomAsset = useMemo(() => !!(selectedAsset && selectedAsset.name === 'Custom account'), [selectedAsset]);

  const selectedMultisigRef = useRef(selectedMultisig);
  useEffect(() => {
    selectedMultisigRef.current = selectedMultisig;
  }, [selectedMultisig]);

  const accountAddressRef = useRef(selectedAccount.address);
  useEffect(() => {
    accountAddressRef.current = selectedAccount.address;
  }, [selectedAccount.address]);

  const isMultisigContext = useMemo(() => {
    return !!(publicKey && selectedAccount.isMultisig);
  }, [publicKey, selectedAccount]);

  ////////////////////////////
  //   Events and actions   //
  ////////////////////////////

  const isAnyTxPendingConfirmation = useCallback(
    (operation?: OperationType) => {
      if (confirmationHistory && confirmationHistory.length > 0) {
        if (operation !== undefined) {
          return confirmationHistory.some(h => h.operationType === operation && h.txInfoFetchStatus === 'fetching');
        } else {
          return confirmationHistory.some(h => h.txInfoFetchStatus === 'fetching');
        }
      }
      return false;
    },
    [confirmationHistory],
  );

  const isUnwrapping = useMemo(() => {
    if (!isBusy) {
      return false;
    }
    return isAnyTxPendingConfirmation(OperationType.Unwrap);
  }, [isAnyTxPendingConfirmation, isBusy]);

  const isInboundStream = useCallback(
    (item: Stream | StreamInfo): boolean => {
      if (item && publicKey && selectedAccount.address) {
        const v1 = item as StreamInfo;
        const v2 = item as Stream;
        let beneficiary = '';
        if (item.version < 2) {
          beneficiary =
            typeof v1.beneficiaryAddress === 'string'
              ? v1.beneficiaryAddress
              : (v1.beneficiaryAddress as PublicKey).toBase58();
        } else {
          beneficiary = typeof v2.beneficiary === 'string' ? v2.beneficiary : v2.beneficiary.toBase58();
        }
        return beneficiary === selectedAccount.address;
      }
      return false;
    },
    [selectedAccount.address, publicKey],
  );

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle,
    });
  }, [setTransactionStatus]);

  const setFailureStatusAndNotify = useCallback(
    (txStep: 'sign' | 'send') => {
      const operation =
        txStep === 'sign' ? TransactionStatus.SignTransactionFailure : TransactionStatus.SendTransactionFailure;
      setTransactionStatus({
        lastOperation: transactionStatus.currentOperation,
        currentOperation: operation,
      });
      openNotification({
        title: t('notifications.error-title'),
        description: t('notifications.error-sending-transaction'),
        type: 'error',
      });
      setIsBusy(false);
    },
    [setTransactionStatus, t, transactionStatus.currentOperation],
  );

  // Token Merger Modal
  const hideTokenMergerModal = useCallback(() => setTokenMergerModalVisibility(false), []);
  const showTokenMergerModal = useCallback(() => setTokenMergerModalVisibility(true), []);
  const [isTokenMergerModalVisible, setTokenMergerModalVisibility] = useState(false);
  const onCloseTokenMergeModal = useCallback(() => {
    resetTransactionStatus();
    hideTokenMergerModal();
  }, [hideTokenMergerModal, resetTransactionStatus]);

  const onFinishedTokenMerge = useCallback(() => {
    hideTokenMergerModal();
    resetTransactionStatus();
    setShouldLoadTokens(true);
  }, [setShouldLoadTokens, hideTokenMergerModal, resetTransactionStatus]);

  const getMultisigTxProposalFees = useCallback(() => {
    if (!multisigClient) {
      return;
    }

    getFees(multisigClient.getProgram(), MULTISIG_ACTIONS.createTransaction).then(value => {
      setMultisigTransactionFees(value);
      consoleOut('multisigTransactionFees:', value, 'orange');
      consoleOut('nativeBalance:', nativeBalance, 'blue');
      consoleOut('networkFee:', value.networkFee, 'blue');
      consoleOut('rentExempt:', value.rentExempt, 'blue');
      const totalMultisigFee = value.multisigFee + MEAN_MULTISIG_ACCOUNT_LAMPORTS / LAMPORTS_PER_SOL;
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

  // New Proposal modal
  const [isMultisigProposalModalVisible, setMultisigProposalModalVisible] = useState(false);
  const onNewProposalClicked = useCallback(() => {
    if (!multisigClient) {
      return;
    }

    getFees(multisigClient.getProgram(), MULTISIG_ACTIONS.createTransaction).then(value => {
      setMultisigTransactionFees(value);
      consoleOut('transactionFees:', value, 'orange');
    });

    resetTransactionStatus();
    setMultisigProposalModalVisible(true);
  }, [multisigClient, resetTransactionStatus]);

  const onAcceptCreateProposalModal = (data: CreateNewProposalParams) => {
    onExecuteCreateTransactionProposal(data);
  };

  const onAfterWrap = () => {
    hideWrapSolModal();
  };

  const isInspectedAccountTheConnectedWallet = useCallback(() => {
    return !!(publicKey && publicKey.toBase58() === selectedAccount.address);
  }, [selectedAccount.address, publicKey]);

  const isSelectedAssetNativeAccount = useCallback(
    (asset?: UserTokenAccount) => {
      if (asset) {
        return selectedAccount.address === asset.publicAddress;
      }
      return !!(selectedAsset && selectedAccount.address === selectedAsset.publicAddress);
    },
    [selectedAsset, selectedAccount.address],
  );

  const isSelectedAssetWsol = useCallback(() => {
    return !!(selectedAsset && selectedAsset.address === WRAPPED_SOL_MINT_ADDRESS);
  }, [selectedAsset]);

  const goToExchangeWithPresetAsset = useCallback(() => {
    const queryParams = `${selectedAsset ? '?from=' + selectedAsset.symbol : ''}`;
    if (queryParams) {
      navigate(`/exchange${queryParams}`);
    } else {
      navigate('/exchange');
    }
  }, [navigate, selectedAsset]);

  const investButtonEnabled = useCallback(() => {
    if (!selectedAsset || !isInspectedAccountTheConnectedWallet()) {
      return false;
    }

    const investPageUsedAssets = ['MEAN', 'sMEAN'];
    return investPageUsedAssets.includes(selectedAsset.symbol);
  }, [isInspectedAccountTheConnectedWallet, selectedAsset]);

  const handleGoToInvestClick = useCallback(() => {
    let url = STAKING_ROUTE_BASE_PATH;

    if (selectedAsset) {
      switch (selectedAsset.symbol) {
        case 'MEAN':
          url += '?option=stake';
          break;
        case 'sMEAN':
          url += '?option=unstake';
          break;
        default:
          break;
      }
    }

    navigate(url);
  }, [navigate, selectedAsset]);

  const onExchangeAsset = useCallback(() => {
    if (!selectedAsset) {
      return;
    }

    goToExchangeWithPresetAsset();
  }, [goToExchangeWithPresetAsset, selectedAsset]);

  const onSendAsset = useCallback(() => {
    if (!selectedAsset) {
      return;
    }

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
  const copyAddressToClipboard = useCallback(
    (address: any) => {
      if (!address) {
        return;
      }

      if (copyText(address.toString())) {
        openNotification({
          description: t('notifications.account-address-copied-message'),
          type: 'info',
        });
      } else {
        openNotification({
          description: t('notifications.account-address-not-copied-message'),
          type: 'error',
        });
      }
    },
    [t],
  );

  const hasTransactions = useCallback(() => {
    return !!(transactions && transactions.length > 0);
  }, [transactions]);

  const getScanAddress = useCallback(
    (asset: UserTokenAccount): PublicKey | null => {
      if (asset.publicAddress) {
        return asset.publicAddress !== SOL_MINT.toBase58()
          ? new PublicKey(asset.publicAddress)
          : new PublicKey(selectedAccount.address);
      }
      return null;
    },
    [selectedAccount.address],
  );

  const canActivateMergeTokenAccounts = (): boolean => {
    if (publicKey && selectedAsset && tokenAccountGroups) {
      const acc = tokenAccountGroups.has(selectedAsset.address);
      if (acc) {
        const item = tokenAccountGroups.get(selectedAsset.address);
        return !!(item && item.length > 1);
      }
    }
    return false;
  };

  const refreshAssetBalance = useCallback(() => {
    if (!connection || !selectedAccount.address || !selectedAsset || refreshingBalance || !accountTokens) {
      return;
    }

    setRefreshingBalance(true);

    const tokensCopy = JSON.parse(JSON.stringify(accountTokens)) as UserTokenAccount[];

    if (isSelectedAssetNativeAccount()) {
      const pk = new PublicKey(selectedAccount.address);
      // Fetch SOL balance.
      connection
        .getBalance(pk)
        .then(solBalance => {
          let itemIndex = -1;
          itemIndex = tokensCopy.findIndex(t => t.publicAddress === selectedAsset.publicAddress);
          if (itemIndex !== -1) {
            tokensCopy[itemIndex].balance = getAmountFromLamports(solBalance);
            tokensCopy[itemIndex].valueInUsd =
              getAmountFromLamports(solBalance) *
              getTokenPriceByAddress(tokensCopy[itemIndex].address, tokensCopy[itemIndex].symbol);
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
      connection
        .getTokenAccountBalance(pk)
        .then(tokenAmount => {
          const balance = tokenAmount.value.uiAmount;
          consoleOut('balance:', balance, 'blue');
          const price = getTokenPriceByAddress(selectedAsset.address, selectedAsset.symbol);
          const valueInUSD = (balance ?? 0) * price;
          consoleOut('valueInUSD:', valueInUSD, 'blue');
          // Find the token and update it if found
          itemIndex = tokensCopy.findIndex(t => t.publicAddress === selectedAsset.publicAddress);
          if (itemIndex !== -1) {
            tokensCopy[itemIndex].balance = balance ?? 0;
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
    selectedAccount.address,
    refreshingBalance,
    isSelectedAssetNativeAccount,
    getTokenPriceByAddress,
    setSelectedAsset,
  ]);

  const startSwitch = useCallback(() => {
    setStatus(FetchStatus.Fetching);
    setShouldLoadTransactions(true);
  }, []);

  const reloadSwitch = useCallback(() => {
    refreshAssetBalance();
    setSolAccountItems(0);
    appendHistoryItems(undefined);
    startSwitch();
  }, [startSwitch, appendHistoryItems, refreshAssetBalance]);

  const getAssetPath = useCallback(
    (asset: UserTokenAccount) => {
      const isAccountNative = isSelectedAssetNativeAccount(asset);
      let url = '';
      if (isAccountNative) {
        url = `/assets`;
      } else {
        url = `/assets/${asset.publicAddress}`;
      }
      return url;
    },
    [isSelectedAssetNativeAccount],
  );

  const navigateToAsset = useCallback(
    (asset: UserTokenAccount) => {
      const url = getAssetPath(asset);
      consoleOut('Asset selected, redirecting to:', url, 'orange');
      navigate(url);
    },
    [getAssetPath, navigate],
  );

  const reloadTokensAndActivity = useCallback(() => {
    consoleOut('Calling reloadTokensAndActivity...', '', 'orangered');
    setShouldLoadTokens(true);
    reloadSwitch();
  }, [reloadSwitch, setShouldLoadTokens]);

  const navigateToSafe = useCallback(() => {
    consoleOut('calling navigateToSafe()', '...', 'crimson');
    const url = `/${RegisteredAppPaths.SuperSafe}?v=proposals`;
    navigate(url);
  }, [navigate]);

  const navigateToNft = useCallback(
    (address: string) => {
      consoleOut('calling navigateToNft()', '...', 'crimson');
      const url = `/nfts/${address}`;
      navigate(url);
    },
    [navigate],
  );

  const navigateToStreaming = useCallback(() => {
    const url = `/${RegisteredAppPaths.PaymentStreaming}/summary`;
    navigate(url);
  }, [navigate]);

  const selectAsset = useCallback(
    (asset: UserTokenAccount, clearTxList = true) => {
      setStatus(FetchStatus.Fetching);
      if (clearTxList) {
        setSolAccountItems(0);
        appendHistoryItems(undefined);
      }
      setSelectedAsset(asset);
      setTimeout(() => {
        startSwitch();
      }, 10);
    },
    [startSwitch, appendHistoryItems, setSelectedAsset],
  );

  const shouldHideAsset = useCallback(
    (asset: UserTokenAccount) => {
      const tokenPrice = getTokenPriceByAddress(asset.address, asset.symbol);
      return !!(tokenPrice > 0 && (!asset.valueInUsd || asset.valueInUsd < ACCOUNTS_LOW_BALANCE_LIMIT));
    },
    [getTokenPriceByAddress],
  );

  const toggleHideLowBalances = useCallback(
    (setting: boolean) => {
      if (selectedAsset && shouldHideAsset(selectedAsset) && setting) {
        selectAsset(accountTokens[0]);
        navigateToAsset(accountTokens[0]);
      }
      setHideLowBalances(setting);
    },
    [accountTokens, navigateToAsset, selectAsset, selectedAsset, setHideLowBalances, shouldHideAsset],
  );

  const logEventHandling = useCallback((item: TxConfirmationInfo) => {
    consoleOut(
      `HomeView -> onTxConfirmed event handled for operation ${OperationType[item.operationType]}`,
      item,
      'crimson',
    );
  }, []);

  const recordTxConfirmationSuccess = useCallback((item: TxConfirmationInfo) => {
    let event: any = undefined;

    switch (item.operationType) {
      case OperationType.Wrap:
        event = AppUsageEvent.WrapSolCompleted;
        break;
      case OperationType.Unwrap:
        event = AppUsageEvent.UnwrapSolCompleted;
        break;
      case OperationType.StreamCreate:
        event = AppUsageEvent.StreamCreateCompleted;
        break;
      case OperationType.Transfer:
        event = AppUsageEvent.TransferOTPCompleted;
        break;
      case OperationType.CreateAsset:
        event = AppUsageEvent.CreateAssetCompleted;
        break;
      case OperationType.CloseTokenAccount:
        event = AppUsageEvent.CloseTokenAccountCompleted;
        break;
      case OperationType.SetAssetAuthority:
        event = AppUsageEvent.SetAssetAutorityCompleted;
        break;
      case OperationType.DeleteAsset:
        event = AppUsageEvent.DeleteAssetCompleted;
        break;
      case OperationType.TransferTokens:
        event = AppUsageEvent.TransferTokensCompleted;
        break;
      case OperationType.CreateTransaction:
        event = AppUsageEvent.CreateProposalCompleted;
        break;
      default:
        break;
    }
    if (event) {
      segmentAnalytics.recordEvent(event, { signature: item.signature });
    }
  }, []);

  const recordTxConfirmationFailure = useCallback((item: TxConfirmationInfo) => {
    let event: any = undefined;

    switch (item.operationType) {
      case OperationType.Wrap:
        event = AppUsageEvent.WrapSolFailed;
        break;
      case OperationType.Unwrap:
        event = AppUsageEvent.UnwrapSolFailed;
        break;
      case OperationType.StreamCreate:
        event = AppUsageEvent.StreamCreateFailed;
        break;
      case OperationType.Transfer:
        event = AppUsageEvent.TransferOTPFailed;
        break;
      case OperationType.CreateAsset:
        event = AppUsageEvent.CreateAssetFailed;
        break;
      case OperationType.CloseTokenAccount:
        event = AppUsageEvent.CloseTokenAccountFailed;
        break;
      case OperationType.SetAssetAuthority:
        event = AppUsageEvent.SetAssetAutorityFailed;
        break;
      case OperationType.DeleteAsset:
        event = AppUsageEvent.DeleteAssetFailed;
        break;
      case OperationType.TransferTokens:
        event = AppUsageEvent.TransferTokensFailed;
        break;
      case OperationType.CreateTransaction:
        event = AppUsageEvent.CreateProposalFailed;
        break;
      default:
        break;
    }
    if (event) {
      segmentAnalytics.recordEvent(event, { signature: item.signature });
    }
  }, []);

  const accountRefresh = () => {
    const fullRefreshCta = document.getElementById('account-refresh-cta');
    if (fullRefreshCta) {
      fullRefreshCta.click();
    }
  };

  // Setup event handler for Tx confirmed
  const onTxConfirmed = useCallback(
    (item: TxConfirmationInfo) => {
      const turnOffLockWorkflow = () => {
        isWorkflowLocked = false;
      };

      const notifyMultisigActionFollowup = (item: TxConfirmationInfo) => {
        if (!item?.extras?.multisigAuthority) {
          turnOffLockWorkflow();
          return;
        }

        const myNotifyKey = `notify-${Date.now()}`;
        openNotification({
          type: 'info',
          key: myNotifyKey,
          title: 'Review proposal',
          duration: 20,
          description: (
            <>
              <div className="mb-2">The proposal's status can be reviewed in the Safe's proposal list.</div>
              <Button
                type="primary"
                shape="round"
                size="small"
                className="extra-small d-flex align-items-center pb-1"
                onClick={() => {
                  const url = `${MULTISIG_ROUTE_BASE_PATH}?v=proposals`;
                  navigate(url);
                  notification.close(myNotifyKey);
                }}
              >
                Review proposal
              </Button>
            </>
          ),
          handleClose: turnOffLockWorkflow,
        });
      };

      if (item) {
        if (isWorkflowLocked) {
          return;
        }

        // Lock the workflow
        if (item?.extras?.multisigAuthority) {
          isWorkflowLocked = true;
        }

        recordTxConfirmationSuccess(item);
        switch (item.operationType) {
          case OperationType.CreateMultisig:
          case OperationType.CreateTransaction:
            logEventHandling(item);
            refreshMultisigs();
            break;
          case OperationType.Wrap:
          case OperationType.Unwrap:
          case OperationType.Transfer:
            logEventHandling(item);
            setIsBusy(false);
            accountRefresh();
            break;
          case OperationType.CreateAsset:
          case OperationType.StreamCreate:
          case OperationType.CloseTokenAccount:
            logEventHandling(item);
            accountRefresh();
            break;
          case OperationType.DeleteAsset:
          case OperationType.SetAssetAuthority:
          case OperationType.TransferTokens:
            logEventHandling(item);
            if (item?.extras?.multisigAuthority) {
              refreshMultisigs();
              notifyMultisigActionFollowup(item);
            }
            break;
          default:
            break;
        }
      }
    },
    [logEventHandling, navigate, recordTxConfirmationSuccess, refreshMultisigs],
  );

  // Setup event handler for Tx confirmation error
  const onTxTimedout = useCallback(
    (item: TxConfirmationInfo) => {
      if (item) {
        consoleOut('onTxTimedout event executed:', item, 'crimson');
        recordTxConfirmationFailure(item);
        if (item.operationType === OperationType.Unwrap || item.operationType === OperationType.TransferTokens) {
          setIsBusy(false);
        }
        accountRefresh();
      }
      resetTransactionStatus();
    },
    [recordTxConfirmationFailure, resetTransactionStatus],
  );

  // Filter only useful Txs for the SOL account and return count
  const getSolAccountItems = useCallback(
    (txs: MappedTransaction[]): number => {
      // Show only txs that have SOL changes
      const filtered = txs.filter(tx => {
        const meta = tx.parsedTransaction?.meta ? tx.parsedTransaction.meta : null;
        if (!meta || meta.err !== null) {
          return false;
        }
        const accounts = tx.parsedTransaction.transaction.message.accountKeys;
        const accIdx = accounts.findIndex(acc => acc.pubkey.toBase58() === selectedAccount.address);
        if (isSelectedAssetNativeAccount() && accIdx === -1) {
          return false;
        }
        const change = getChange(accIdx, meta);
        return !!(isSelectedAssetNativeAccount() && change !== 0);
      });

      consoleOut(`${filtered.length} useful Txs`);
      return filtered.length || 0;
    },
    [selectedAccount.address, isSelectedAssetNativeAccount],
  );

  // Lets consider there are items to render if there are transactions for selected asset (NOT SOL)
  // or if there are transactions with balance changes for the selected asset (SOL)
  const hasItemsToRender = useCallback((): boolean => {
    return !!(
      (!isSelectedAssetNativeAccount() && hasTransactions()) ||
      (isSelectedAssetNativeAccount() && hasTransactions() && solAccountItems > 0)
    );
  }, [hasTransactions, isSelectedAssetNativeAccount, solAccountItems]);

  //////////////////////
  //    Executions    //
  //////////////////////

  const setSuccessStatus = useCallback(() => {
    setIsBusy(false);
    resetTransactionStatus();
  }, [resetTransactionStatus]);

  const onAfterEveryModalClose = useCallback(() => {
    consoleOut('onAfterEveryModalClose called!', '', 'crimson');
    resetTransactionStatus();
  }, [resetTransactionStatus]);

  // Create asset modal
  const [isCreateAssetModalVisible, setIsCreateAssetModalVisible] = useState(false);
  const onShowCreateAssetModal = useCallback(() => {
    setIsCreateAssetModalVisible(true);
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.00001,
      mspPercentFee: 0,
    };
    resetTransactionStatus();
    setTransactionAssetFees(fees);
  }, [resetTransactionStatus]);

  const closeCreateAssetModal = useCallback(
    (refresh = false) => {
      resetTransactionStatus();
      setIsBusy(false);
      setIsCreateAssetModalVisible(false);
      if (refresh) {
        setShouldLoadTokens(true);
      }
    },
    [resetTransactionStatus, setShouldLoadTokens],
  );

  const onExecuteCreateAssetTx = useCallback(
    async (params: CreateSafeAssetTxParams, createAta = true) => {
      const payload = () => {
        if (!publicKey) return;
        return {
          token: params.token,
        } as CreateSafeAssetTxParams;
      };
      const loadingMessage = () => `Create asset ${params.token?.symbol}`;
      const completedMessage = () => `Asset ${params.token?.symbol} successfully created`;
      const bf = transactionAssetFees.blockchainFee; // Blockchain fee
      const ff = transactionAssetFees.mspFlatFee; // Flat fee (protocol)
      const minRequired = bf + ff;
      setMinRequiredBalance(minRequired);

      await onExecute({
        name: 'Create Safe Asset',
        operationType: OperationType.CreateAsset,
        payload,
        loadingMessage,
        completedMessage,
        setIsBusy,
        nativeBalance,
        minRequired,
        generateTransaction: async ({ multisig, data }) => {
          if (!publicKey || !data.token) return;

          if (isMultisigContext) {
            return createAddSafeAssetTx(connection, publicKey, selectedMultisig, data, createAta);
          } else {
            return createV0InitAtaAccountTx(connection, new PublicKey(data.token.address), publicKey, createAta);
          }
        },
      });
      closeCreateAssetModal(true);
    },
    [
      publicKey,
      connection,
      nativeBalance,
      selectedMultisig,
      isMultisigContext,
      transactionAssetFees.mspFlatFee,
      transactionAssetFees.blockchainFee,
      closeCreateAssetModal,
      onExecute,
    ],
  );

  const onAcceptCreateVault = useCallback(
    (params: CreateSafeAssetTxParams) => {
      consoleOut('Create asset payload:', params);
      onExecuteCreateAssetTx(params);
    },
    [onExecuteCreateAssetTx],
  );

  const onCreateSafeNonAta = useCallback(
    (token: UserTokenAccount) => {
      onExecuteCreateAssetTx({ token }, false);
    },
    [onExecuteCreateAssetTx],
  );

  // Transfer token modal
  const [isTransferTokenModalVisible, setIsTransferTokenModalVisible] = useState(false);
  const showTransferTokenModal = useCallback(() => {
    setIsTransferTokenModalVisible(true);
    getMultisigTxProposalFees();
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.00001,
      mspPercentFee: 0,
    };
    resetTransactionStatus();
    setTransactionFees(fees);
  }, [resetTransactionStatus, getMultisigTxProposalFees]);

  const onAcceptTransferToken = (params: TransferTokensTxParams) => {
    onExecuteTransferTokensTx(params);
  };

  const onExecuteTransferTokensTx = useCallback(
    async (params: TransferTokensTxParams) => {
      const multisigAuthority = selectedMultisig ? selectedMultisig.authority.toBase58() : '';
      const payload = () => {
        if (!publicKey || !params || !multisigAuthority) return;
        return params;
      };
      const loadingMessage = () =>
        `Create proposal to transfer ${formatThousands(params.amount, selectedAsset?.decimals)} ${
          selectedAsset?.symbol
        } to ${shortenAddress(params.to)}`;
      const completedMessage = () =>
        `Proposal to transfer ${formatThousands(params.amount, selectedAsset?.decimals)} ${
          selectedAsset?.symbol
        } to ${shortenAddress(params.to)} was submitted for Multisig approval.`;

      const isNative = params.from === NATIVE_SOL.address;

      const bf = transactionAssetFees.blockchainFee; // Blockchain fee
      const ff = transactionAssetFees.mspFlatFee; // Flat fee (protocol)
      const minRequired = bf + ff;
      setMinRequiredBalance(minRequired);

      await onExecute({
        name: 'Transfer Tokens',
        operationType: isNative ? OperationType.Transfer : OperationType.TransferTokens,
        payload,
        loadingMessage,
        completedMessage,
        setIsBusy,
        extras: () => ({
          multisigAuthority: multisigAuthority,
        }),
        proposalTitle: params.proposalTitle,
        multisig: multisigAuthority,
        nativeBalance,
        minRequired,
        generateMultisigArgs: async ({ multisig, data }) => {
          consoleOut('multisig:', multisig, 'purple');
          consoleOut('data:', data, 'purple');
          if (!publicKey || !multisig || !data) return null;

          const accounts: TransferTransactionAccounts = {
            feePayer: publicKey,
            sender: multisig.authority,
            beneficiary: new PublicKey(data.to),
            mint: new PublicKey(data.fromMint),
          };

          const transaction = await createTokenTransferTx(
            connection,
            new PublicKey(data.from),
            accounts,
            data.tokenAmount,
          );

          const ix = transaction.instructions[0];
          const programId = ix.programId;
          const ixData = Buffer.from(ix.data);
          const ixAccounts = ix.keys;

          return {
            programId, // program
            ixAccounts, // keys o accounts of the Ix
            ixData, // data of the Ix
          };
        },
      });
      setSuccessStatus();
      setIsTransferTokenModalVisible(false);
    },
    [
      publicKey,
      connection,
      nativeBalance,
      selectedMultisig,
      selectedAsset?.symbol,
      selectedAsset?.decimals,
      transactionAssetFees.mspFlatFee,
      transactionAssetFees.blockchainFee,
      setSuccessStatus,
      onExecute,
    ],
  );

  // Transfer asset authority modal
  const [isTransferVaultAuthorityModalVisible, setIsTransferVaultAuthorityModalVisible] = useState(false);
  const showTransferVaultAuthorityModal = useCallback(() => {
    setIsTransferVaultAuthorityModalVisible(true);
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.00001,
      mspPercentFee: 0,
    };
    setTransactionFees(fees);
  }, []);

  const onAcceptTransferVaultAuthority = (params: SetAssetAuthPayload) => {
    consoleOut('transferVaultAuthority params:', params, 'blue');
    onExecuteTransferOwnershipTx(params);
  };

  const onExecuteTransferOwnershipTx = useCallback(
    async (data: SetAssetAuthPayload) => {
      let transaction: VersionedTransaction | Transaction | null = null;
      let signature: any;
      let encodedTx: string;
      let transactionLog: any[] = [];

      resetTransactionStatus();
      setIsBusy(true);

      const createTransferOwnershipTx = async (data: SetAssetAuthPayload) => {
        if (!publicKey || !selectedAsset || !selectedMultisig || !multisigClient) {
          return null;
        }

        const setAuthIx = Token.createSetAuthorityInstruction(
          TOKEN_PROGRAM_ID,
          new PublicKey(selectedAsset.publicAddress as string),
          new PublicKey(data.selectedAuthority),
          'AccountOwner',
          selectedMultisig.authority,
          [],
        );

        const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

        const tx = await getProposalWithPrioritizationFees(
          {
            multisigClient,
            connection,
            transactionPriorityOptions,
          },
          publicKey,
          data.proposalTitle === '' ? 'Change asset ownership' : data.proposalTitle,
          '', // description
          new Date(expirationTime * 1_000),
          OperationType.SetAssetAuthority,
          selectedMultisig.id,
          setAuthIx.programId,
          setAuthIx.keys,
          setAuthIx.data,
        );

        return tx?.transaction ?? null;
      };

      const createTx = async (): Promise<boolean> => {
        if (!publicKey || !data) {
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
            result: 'Cannot start transaction! Wallet not found!',
          });
          customLogger.logError('Transfer Token Ownership transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: data,
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: '',
        });

        // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
        consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');

        if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${getAmountWithSymbol(
              nativeBalance,
              SOL_MINT.toBase58(),
            )}) to pay for network fees (${getAmountWithSymbol(
              transactionFees.blockchainFee + transactionFees.mspFlatFee,
              SOL_MINT.toBase58(),
            )})`,
          });
          customLogger.logWarning('Transfer tokens transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }

        const result = await createTransferOwnershipTx(data)
          .then(value => {
            if (!value) {
              return false;
            }
            consoleOut('createTransferVaultAuthorityTx returned transaction:', value);
            setTransactionStatus({
              lastOperation: TransactionStatus.InitTransactionSuccess,
              currentOperation: TransactionStatus.SignTransaction,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
              result: getTxIxResume(value),
            });
            transaction = value;
            return true;
          })
          .catch(error => {
            console.error('createTransferVaultAuthorityTx error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`,
            });
            customLogger.logError('Transfer Token Ownership transaction failed', { transcript: transactionLog });
            return false;
          });

        return result;
      };

      if (wallet && publicKey && selectedAsset) {
        const created = await createTx();
        consoleOut('created:', created);
        if (created) {
          const sign = await signTx('Transfer Token Ownership', wallet, publicKey, transaction);
          if (sign.encodedTransaction) {
            encodedTx = sign.encodedTransaction;
            transactionLog = transactionLog.concat(sign.log);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.SignTransactionSuccess,
            });
            const sent = await sendTx('Transfer Token Ownership', connection, encodedTx);
            consoleOut('sent:', sent);
            if (sent.signature) {
              signature = sent.signature;
              consoleOut('Send Tx to confirmation queue:', signature);
              enqueueTransactionConfirmation({
                signature,
                operationType: OperationType.SetAssetAuthority,
                finality: 'confirmed',
                txInfoFetchStatus: 'fetching',
                loadingTitle: 'Confirming transaction',
                loadingMessage: 'Transferring ownership',
                completedTitle: 'Transaction confirmed',
                completedMessage: `Asset ${selectedAsset.name} successfully transferred to ${shortenAddress(
                  data.selectedAuthority,
                )}`,
                completedMessageTimeout: isMultisigContext ? 8 : 5,
                extras: {
                  multisigAuthority: selectedMultisig ? selectedMultisig.authority.toBase58() : '',
                },
              });
              setSuccessStatus();
              setIsTransferVaultAuthorityModalVisible(false);
            } else {
              setFailureStatusAndNotify('send');
            }
          } else {
            setFailureStatusAndNotify('sign');
          }
        } else {
          setIsBusy(false);
        }
      }
    },
    [
      wallet,
      publicKey,
      connection,
      selectedAsset,
      nativeBalance,
      multisigClient,
      selectedMultisig,
      isMultisigContext,
      transactionPriorityOptions,
      transactionFees.mspFlatFee,
      transactionFees.blockchainFee,
      transactionStatus.currentOperation,
      enqueueTransactionConfirmation,
      setFailureStatusAndNotify,
      resetTransactionStatus,
      setTransactionStatus,
      setSuccessStatus,
    ],
  );

  const [isDeleteVaultModalVisible, setIsDeleteVaultModalVisible] = useState(false);
  const showDeleteVaultModal = useCallback(() => {
    setIsDeleteVaultModalVisible(true);
  }, []);

  const onAcceptDeleteVault = (data: any) => {
    consoleOut('deleteVault data:', data, 'blue');
    onExecuteCloseAssetTx(data);
  };

  const onExecuteCloseAssetTx = useCallback(
    async (data: any) => {
      let transaction: VersionedTransaction | Transaction | null = null;
      let signature: any;
      let encodedTx: string;
      let multisigAuth = '';
      let transactionLog: any[] = [];

      resetTransactionStatus();
      setIsBusy(true);

      const closeAssetTx = async (inputAsset: UserTokenAccount, data: any) => {
        if (!publicKey || !inputAsset || !selectedMultisig || !multisigClient || !inputAsset.publicAddress) {
          console.error('I do not have anything, review');
          return null;
        }

        if (!inputAsset.owner || !selectedMultisig.authority.equals(new PublicKey(inputAsset.owner))) {
          throw Error('Invalid asset owner');
        }

        multisigAuth = selectedMultisig.authority.toBase58();

        const closeIx = Token.createCloseAccountInstruction(
          TOKEN_PROGRAM_ID,
          new PublicKey(inputAsset.publicAddress),
          publicKey,
          new PublicKey(inputAsset.owner),
          [],
        );

        const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

        const tx = await getProposalWithPrioritizationFees(
          {
            multisigClient,
            connection,
            transactionPriorityOptions,
          },
          publicKey,
          data.title === '' ? 'Close asset' : data.title,
          '', // description
          new Date(expirationTime * 1_000),
          OperationType.DeleteAsset,
          selectedMultisig.id,
          closeIx.programId,
          closeIx.keys,
          closeIx.data,
        );

        return tx?.transaction ?? null;
      };

      const createTx = async (): Promise<boolean> => {
        if (!publicKey || !selectedAsset || !selectedMultisig) {
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
            result: 'Cannot start transaction! Wallet not found!',
          });
          customLogger.logError('Close Token Account transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
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
          inputs: payload,
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: '',
        });

        // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
        consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');

        if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${getAmountWithSymbol(
              nativeBalance,
              SOL_MINT.toBase58(),
            )}) to pay for network fees (${getAmountWithSymbol(
              transactionFees.blockchainFee + transactionFees.mspFlatFee,
              SOL_MINT.toBase58(),
            )})`,
          });
          customLogger.logWarning('Transfer tokens transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }

        const result = await closeAssetTx(selectedAsset, data)
          .then(value => {
            if (!value) {
              return false;
            }
            consoleOut('closeAssetTx returned transaction:', value, 'blue');
            setTransactionStatus({
              lastOperation: TransactionStatus.InitTransactionSuccess,
              currentOperation: TransactionStatus.SignTransaction,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
              result: getTxIxResume(value),
            });
            transaction = value;
            return true;
          })
          .catch(error => {
            console.error('deleteVaultTx error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`,
            });
            customLogger.logError('Close Token Account transaction failed', {
              transcript: transactionLog,
            });
            return false;
          });

        return result;
      };

      if (wallet && publicKey && data) {
        const created = await createTx();
        consoleOut('created:', created);
        if (created) {
          const sign = await signTx('Close Token Account', wallet, publicKey, transaction);
          if (sign.encodedTransaction) {
            encodedTx = sign.encodedTransaction;
            transactionLog = transactionLog.concat(sign.log);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.SignTransactionSuccess,
            });
            const sent = await sendTx('Close Token Account', connection, encodedTx);
            consoleOut('sent:', sent);
            if (sent.signature) {
              signature = sent.signature;
              consoleOut('Send Tx to confirmation queue:', signature);
              enqueueTransactionConfirmation({
                signature,
                operationType: OperationType.DeleteAsset,
                finality: 'confirmed',
                txInfoFetchStatus: 'fetching',
                loadingTitle: 'Confirming transaction',
                loadingMessage: 'Closing Token Account',
                completedTitle: 'Transaction confirmed',
                completedMessage: 'Token Account successfully closed',
                completedMessageTimeout: isMultisigContext ? 8 : 5,
                extras: {
                  multisigAuthority: multisigAuth,
                },
              });
              setSuccessStatus();
              setIsDeleteVaultModalVisible(false);
            } else {
              setFailureStatusAndNotify('send');
            }
          } else {
            setFailureStatusAndNotify('sign');
          }
        } else {
          setIsBusy(false);
        }
      }
    },
    [
      wallet,
      publicKey,
      connection,
      nativeBalance,
      selectedAsset,
      multisigClient,
      selectedMultisig,
      isMultisigContext,
      transactionPriorityOptions,
      transactionFees.mspFlatFee,
      transactionFees.blockchainFee,
      transactionStatus.currentOperation,
      enqueueTransactionConfirmation,
      setFailureStatusAndNotify,
      resetTransactionStatus,
      setTransactionStatus,
      setSuccessStatus,
    ],
  );

  const getAllUserV2Treasuries = useCallback(
    async (addr?: string) => {
      if (!paymentStreaming) {
        return [];
      }

      if (addr || selectedAccount.address) {
        const pk = new PublicKey(addr ?? selectedAccount.address);

        consoleOut('Fetching treasuries for:', addr ?? selectedAccount.address, 'orange');
        const allTreasuries = await paymentStreaming.listAccounts(pk, true);

        const treasuries = allTreasuries.filter(t => t.category === Category.default);
        consoleOut('getAllUserV2Treasuries -> Category.default:', treasuries, 'orange');

        return treasuries;
      }

      return [];
    },
    [paymentStreaming, selectedAccount.address],
  );

  const refreshTreasuries = useCallback(
    (reset = false) => {
      if (!publicKey || !selectedAccount.address || !ms || !paymentStreaming) {
        return;
      }

      const pk = new PublicKey(selectedAccount.address);

      setTimeout(() => {
        setLoadingTreasuries(true);
      });

      const treasuryAccumulator: (PaymentStreamingAccount | TreasuryInfo)[] = [];
      let treasuriesv1: TreasuryInfo[] = [];
      getAllUserV2Treasuries()
        .then(async treasuriesv2 => {
          treasuryAccumulator.push(...treasuriesv2);
          if (!isMultisigContext) {
            try {
              treasuriesv1 = await ms.listTreasuries(pk);
            } catch (error) {
              console.error(error);
            }
            treasuryAccumulator.push(...treasuriesv1);
          }

          const streamingAccounts = treasuryAccumulator.filter(t => !t.autoClose);

          const sortedStreamingAccountList = streamingAccounts
            .map(streaming => streaming)
            .sort((a, b) => {
              const vA1 = a as TreasuryInfo;
              const vA2 = a as PaymentStreamingAccount;
              const vB1 = b as TreasuryInfo;
              const vB2 = b as PaymentStreamingAccount;

              const isNewTreasury = !!(vA2.version && vA2.version >= 2 && vB2.version && vB2.version >= 2);

              if (isNewTreasury) {
                return +getSdkValue(vB2.totalStreams) - +getSdkValue(vA2.totalStreams);
              }
              return vB1.streamsAmount - vA1.streamsAmount;
            });

          setTreasuryList(sortedStreamingAccountList);

          consoleOut('treasuryList:', sortedStreamingAccountList, 'blue');
        })
        .catch(error => {
          console.error(error);
        })
        .finally(() => setLoadingTreasuries(false));
    },
    [ms, paymentStreaming, publicKey, selectedAccount.address, isMultisigContext, getAllUserV2Treasuries],
  );

  const getTreasuryUnallocatedBalance = useCallback(
    (tsry: PaymentStreamingAccount | TreasuryInfo, assToken: TokenInfo | undefined) => {
      const getUnallocatedBalance = (details: PaymentStreamingAccount | TreasuryInfo) => {
        const balance = new BN(details.balance);
        const allocationAssigned = new BN(details.allocationAssigned);
        return balance.sub(allocationAssigned);
      };

      if (tsry) {
        const decimals = assToken ? assToken.decimals : 9;
        const unallocated = getUnallocatedBalance(tsry);
        const isNewTreasury = !!(
          (tsry as PaymentStreamingAccount).version && (tsry as PaymentStreamingAccount).version >= 2
        );
        const ub = isNewTreasury
          ? new BigNumber(toUiAmount(unallocated, decimals)).toNumber()
          : new BigNumber(unallocated.toString()).toNumber();
        return ub;
      }
      return 0;
    },
    [],
  );

  const refreshTreasuriesSummary = useCallback(async () => {
    if (!treasuryList) {
      return;
    }

    const resume: UserTreasuriesSummary = {
      totalAmount: 0,
      openAmount: 0,
      lockedAmount: 0,
      totalNet: 0,
    };

    for (const treasury of treasuryList) {
      const isNew = !!(
        (treasury as PaymentStreamingAccount).version && (treasury as PaymentStreamingAccount).version >= 2
      );

      const treasuryType = isNew
        ? +(treasury as PaymentStreamingAccount).accountType
        : +(treasury as TreasuryInfo).type;

      const associatedToken = isNew
        ? (treasury as PaymentStreamingAccount).mint.toBase58()
        : ((treasury as TreasuryInfo).associatedTokenAddress as string);

      if (treasuryType === 0) {
        resume['openAmount'] += 1;
      } else {
        resume['lockedAmount'] += 1;
      }

      let amountChange = 0;

      const token = getTokenByMintAddress(associatedToken);

      if (token) {
        const tokenPrice = getTokenPriceByAddress(token.address, token.symbol);
        const amount = getTreasuryUnallocatedBalance(treasury, token);
        amountChange = amount * tokenPrice;
      }

      resume['totalNet'] += amountChange;
    }

    resume['totalAmount'] += treasuryList.length;

    // Update state
    setStreamingAccountsSummary(resume);
  }, [treasuryList, getTreasuryUnallocatedBalance, getTokenPriceByAddress, getTokenByMintAddress]);

  const getV1VestedValue = useCallback(
    async (updatedStreamsv1: StreamInfo[], treasurer: PublicKey) => {
      if (!ms) return 0;

      let vestedValue = 0;
      for await (const stream of updatedStreamsv1) {
        const isIncoming = !!(stream.beneficiaryAddress && stream.beneficiaryAddress === treasurer.toBase58());

        // Get refreshed data
        const freshStream = await ms.refreshStream(stream);
        if (!freshStream || freshStream.state !== STREAM_STATE.Running) {
          continue;
        }

        const token = getTokenByMintAddress(freshStream.associatedToken as string);

        if (token) {
          const tokenPrice = getTokenPriceByAddress(token.address, token.symbol);

          if (isIncoming) {
            vestedValue = vestedValue + (freshStream.escrowVestedAmount || 0) * tokenPrice;
          }
        }
      }
      return vestedValue;
    },
    [getTokenByMintAddress, getTokenPriceByAddress, ms],
  );

  const getV1UnvestedValue = useCallback(
    async (updatedStreamsv1: StreamInfo[], treasurer: PublicKey) => {
      if (!ms) return 0;

      let unvestedValue = 0;
      for await (const stream of updatedStreamsv1) {
        const isIncoming = !!(stream.beneficiaryAddress && stream.beneficiaryAddress === treasurer.toBase58());

        // Get refreshed data
        const freshStream = await ms.refreshStream(stream, undefined, false);
        if (!freshStream || freshStream.state !== STREAM_STATE.Running) {
          continue;
        }

        const token = getTokenByMintAddress(freshStream.associatedToken as string);

        if (token) {
          const tokenPrice = getTokenPriceByAddress(token.address, token.symbol);

          if (!isIncoming) {
            unvestedValue = unvestedValue + (freshStream.escrowUnvestedAmount || 0) * tokenPrice;
          }
        }
      }
      return unvestedValue;
    },
    [getTokenByMintAddress, getTokenPriceByAddress, ms],
  );

  const getV2FundsLeftValue = useCallback(
    async (updatedStreamsv2: Stream[], treasurer: PublicKey) => {
      if (!paymentStreaming) return 0;

      let fundsLeftValue = 0;
      for await (const stream of updatedStreamsv2) {
        const isIncoming = !!stream.beneficiary?.equals(treasurer);

        // Get refreshed data
        const freshStream = (await paymentStreaming.refreshStream(stream)) as Stream;
        if (!freshStream || freshStream.statusCode !== STREAM_STATUS_CODE.Running) {
          continue;
        }

        const associatedToken = getStreamAssociatedMint(freshStream);
        const token = getTokenByMintAddress(associatedToken);

        if (token) {
          const tokenPrice = getTokenPriceByAddress(token.address, token.symbol);
          const decimals = token.decimals || 9;
          const amount = new BigNumber(freshStream.fundsLeftInStream.toString()).toNumber();
          const amountChange = parseFloat((amount / 10 ** decimals).toFixed(decimals)) * tokenPrice;

          if (!isIncoming) {
            fundsLeftValue += amountChange;
          }
        }
      }
      return fundsLeftValue;
    },
    [getTokenByMintAddress, getTokenPriceByAddress, paymentStreaming],
  );

  const getV2WithdrawableValue = useCallback(
    async (updatedStreamsv2: Stream[], treasurer: PublicKey) => {
      if (!paymentStreaming) return 0;

      let withdrawableValue = 0;
      for await (const stream of updatedStreamsv2) {
        const isIncoming = !!stream.beneficiary?.equals(treasurer);

        // Get refreshed data
        const freshStream = (await paymentStreaming.refreshStream(stream)) as Stream;
        if (!freshStream || freshStream.statusCode !== STREAM_STATUS_CODE.Running) {
          continue;
        }

        const associatedToken = getStreamAssociatedMint(freshStream);
        const token = getTokenByMintAddress(associatedToken);

        if (token) {
          const tokenPrice = getTokenPriceByAddress(token.address, token.symbol);
          const decimals = token.decimals || 9;
          const amount = new BigNumber(freshStream.withdrawableAmount.toString()).toNumber();
          const amountChange = parseFloat((amount / 10 ** decimals).toFixed(decimals)) * tokenPrice;

          if (isIncoming) {
            withdrawableValue += amountChange;
          }
        }
      }
      return withdrawableValue;
    },
    [getTokenByMintAddress, getTokenPriceByAddress, paymentStreaming],
  );

  const refreshIncomingStreamSummary = useCallback(async () => {
    if (!ms || !paymentStreaming || !publicKey || (!streamListv1 && !streamListv2)) {
      return;
    }

    const resume: StreamsSummary = {
      totalNet: 0,
      incomingAmount: 0,
      outgoingAmount: 0,
      totalAmount: 0,
    };

    const treasurer = selectedAccount.address ? new PublicKey(selectedAccount.address) : publicKey;

    const updatedStreamsv1 = await ms.refreshStreams(streamListv1 ?? [], treasurer);
    const updatedStreamsv2 = await paymentStreaming.refreshStreams(streamListv2 ?? [], treasurer);

    const vested = await getV1VestedValue(updatedStreamsv1, treasurer);
    resume['totalNet'] = vested;
    resume['totalAmount'] = updatedStreamsv1.length;

    const withdrawableValue = await getV2WithdrawableValue(updatedStreamsv2, treasurer);
    resume['totalNet'] += withdrawableValue;
    resume['totalAmount'] += updatedStreamsv2.length;

    // Update state
    setIncomingStreamsSummary(resume);
  }, [
    ms,
    paymentStreaming,
    publicKey,
    streamListv1,
    streamListv2,
    selectedAccount.address,
    getV2WithdrawableValue,
    getV1VestedValue,
  ]);

  const refreshOutgoingStreamSummary = useCallback(async () => {
    if (!ms || !paymentStreaming || !publicKey || (!streamListv1 && !streamListv2)) {
      return;
    }

    const resume: StreamsSummary = {
      totalNet: 0,
      incomingAmount: 0,
      outgoingAmount: 0,
      totalAmount: 0,
    };

    const treasurer = selectedAccount.address ? new PublicKey(selectedAccount.address) : publicKey;

    const updatedStreamsv1 = await ms.refreshStreams(streamListv1 ?? [], treasurer);
    const updatedStreamsv2 = await paymentStreaming.refreshStreams(streamListv2 ?? [], treasurer);

    const unvested = await getV1UnvestedValue(updatedStreamsv1, treasurer);
    resume['totalNet'] = unvested;
    resume['totalAmount'] = updatedStreamsv1.length;

    const fundsLeft = await getV2FundsLeftValue(updatedStreamsv2, treasurer);
    resume['totalNet'] += fundsLeft;
    resume['totalAmount'] += updatedStreamsv2.length;

    // Update state
    setOutgoingStreamsSummary(resume);
  }, [
    ms,
    paymentStreaming,
    publicKey,
    streamListv1,
    streamListv2,
    selectedAccount.address,
    getV2FundsLeftValue,
    getV1UnvestedValue,
  ]);

  const clearStateData = useCallback(() => {
    clearStreams();
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

  // New proposal

  const createProposalIx = useCallback(
    async (
      programId: PublicKey,
      uiConfig: AppConfig,
      uiInstruction: UiInstruction,
    ): Promise<TransactionInstruction | null> => {
      if (!connection || !connectionConfig || !publicKey) {
        return null;
      }

      const createAnchorProgram = (): Program<Idl> => {
        const opts = AnchorProvider.defaultOptions();
        const anchorWallet = {
          publicKey: publicKey,
          signAllTransactions: async (txs: any) => txs,
          signTransaction: async (tx: any) => tx,
        };

        const provider = new AnchorProvider(connection, anchorWallet, opts);

        return new Program(uiConfig.definition as Idl, programId, provider);
      };

      const program = createAnchorProgram();
      const method = program.methods[uiInstruction.name];
      // ACCS
      const accElements = uiInstruction.uiElements.filter(
        (elem: UiElement) => elem.dataElement && 'isSigner' in elem.dataElement,
      );
      const accounts: any = {};
      accElements.sort((a: any, b: any) => {
        return a.index - b.index;
      });
      for (const accItem of accElements) {
        const accElement = accItem.dataElement as any;
        accounts[accItem.name] = accElement.dataValue;
      }
      // ARGS
      const argElements = uiInstruction.uiElements.filter(
        (elem: UiElement) => elem.dataElement && !('isSigner' in elem.dataElement),
      );
      const args = argElements.map((elem: UiElement) => {
        const argElement = elem.dataElement as Arg;
        return argElement.dataValue;
      });
      args.sort((a: any, b: any) => {
        return a.index - b.index;
      });
      const ix = await method(...args)
        .accounts(accounts)
        .instruction();

      return ix;
    },
    [connection, connectionConfig, publicKey],
  );

  const getCredixProgram = useCallback(async (connection: Connection, investor: PublicKey) => {
    let program;
    if (isDev()) {
      program = credixDevnet.createProgram(connection, 'confirmed');
    } else {
      program = credixMainnet.createProgram(connection, 'confirmed');
    }
    consoleOut('getCredixProgram => investor:', investor.toBase58());
    consoleOut('getCredixProgram => programId:', program.programId.toBase58());
    return program;
  }, []);

  const createCredixDepositIx = useCallback(
    async (investor: PublicKey, amount: number, marketplace: string) => {
      if (!connection || !connectionConfig) {
        return null;
      }

      try {
        const program = await getCredixProgram(connection, investor);

        if (isDev()) {
          return credixDevnet.getDepositIx(program, investor, amount, marketplace);
        } else {
          return credixMainnet.getDepositIx(program, investor, amount, marketplace);
        }
      } catch (error) {
        console.error(error);

        return null;
      }
    },
    [connection, connectionConfig, getCredixProgram],
  );

  const createCredixDepositTrancheIx = useCallback(
    async (investor: PublicKey, deal: PublicKey, amount: number, trancheIndex: number, marketplace: string) => {
      if (!connection || !connectionConfig) {
        return null;
      }

      const program = await getCredixProgram(connection, investor);

      if (isDev()) {
        return credixDevnet.getTrancheDepositIx(program, investor, deal, amount, trancheIndex, marketplace);
      } else {
        return credixMainnet.getTrancheDepositIx(program, investor, deal, amount, trancheIndex, marketplace);
      }
    },
    [connection, connectionConfig, getCredixProgram],
  );

  const createCredixWithdrawIx = useCallback(
    async (investor: PublicKey, amount: number, marketplace: string) => {
      if (!connection || !connectionConfig) {
        return null;
      }

      const program = await getCredixProgram(connection, investor);
      if (isDev()) {
        return credixDevnet.getCreateWithdrawRequestIx(program, investor, amount, marketplace);
      } else {
        return credixMainnet.getCreateWithdrawRequestIx(program, investor, amount, marketplace);
      }
    },
    [connection, connectionConfig, getCredixProgram],
  );

  const createCredixRedeemRequestIx = useCallback(
    async (investor: PublicKey, amount: number, marketplace: string) => {
      if (!connection || !connectionConfig) {
        return null;
      }

      const program = await getCredixProgram(connection, investor);
      if (isDev()) {
        return credixDevnet.getRedeemWithdrawRequestIx(program, investor, amount, marketplace);
      } else {
        return credixMainnet.getRedeemWithdrawRequestIx(program, investor, amount, marketplace);
      }
    },
    [connection, connectionConfig, getCredixProgram],
  );

  const createCredixWithdrawTrancheIx = useCallback(
    async (investor: PublicKey, deal: PublicKey, trancheIndex: number, marketplace: string) => {
      if (!connection || !connectionConfig) {
        return null;
      }

      const program = await getCredixProgram(connection, investor);
      if (isDev()) {
        return credixDevnet.getTrancheWithdrawIx(program, investor, deal, trancheIndex, marketplace);
      } else {
        return credixMainnet.getTrancheWithdrawIx(program, investor, deal, trancheIndex, marketplace);
      }
    },
    [connection, connectionConfig, getCredixProgram],
  );

  const onExecuteCreateTransactionProposal = useCallback(
    async (params: CreateNewProposalParams) => {
      let transaction: Transaction | null = null;
      let signature: any;
      let encodedTx: string;
      let transactionLog: any[] = [];

      resetTransactionStatus();
      setIsBusy(true);

      const createTransactionProposal = async (data: any) => {
        if (!publicKey || !selectedMultisig || !multisigClient) {
          throw new Error('No selected multisig');
        }

        let operation = 0;
        let proposalIx: TransactionInstruction | null = null;

        if (data.appId === NATIVE_LOADER.toBase58()) {
          const tx = await parseSerializedTx(connection, data.instruction.uiElements[0].value);
          if (!tx) {
            return null;
          }
          operation = OperationType.Custom;
          proposalIx = tx.instructions[0];
        } else if (isCredixFinance(data.appId)) {
          const investorPK = new PublicKey(data.instruction.uiElements.find((x: any) => x.name === 'investor').value);
          const marketPlaceVal = String(data.instruction.uiElements.find((x: any) => x.name === 'marketName').value);
          let amountVal = 0;
          consoleOut('instruction name:', data.instruction.name, 'orange');
          switch (data.instruction.name) {
            case 'depositFunds':
              operation = OperationType.CredixDepositFunds;
              amountVal = parseFloat(data.instruction.uiElements.find((x: any) => x.name === 'amount').value);
              consoleOut('**** common inputs: ', {
                investorPK: investorPK.toString(),
                marketPlaceVal,
                amountVal,
              });
              proposalIx = await createCredixDepositIx(investorPK, amountVal, marketPlaceVal);
              break;

            case 'createWithdrawRequest':
              operation = OperationType.CredixWithdrawFunds;
              amountVal = parseFloat(
                data.instruction.uiElements.find((x: any) => x.name === 'baseWithdrawalAmount').value,
              );
              consoleOut('**** common inputs: ', {
                investorPK: investorPK.toString(),
                marketPlaceVal,
                amountVal,
              });
              proposalIx = await createCredixWithdrawIx(investorPK, amountVal, marketPlaceVal);
              break;

            case 'redeemWithdrawRequest':
              operation = OperationType.CredixRedeemWithdrawRequest;
              amountVal = parseFloat(
                data.instruction.uiElements.find((x: any) => x.name === 'baseWithdrawalAmount').value,
              );
              consoleOut('**** common inputs: ', {
                investorPK: investorPK.toString(),
                marketPlaceVal,
                amountVal,
              });
              proposalIx = await createCredixRedeemRequestIx(investorPK, amountVal, marketPlaceVal);
              break;

            case 'depositTranche':
              operation = OperationType.CredixDepositTranche;
              amountVal = parseFloat(data.instruction.uiElements.find((x: any) => x.name === 'amount').value);
              consoleOut('**** common inputs: ', {
                investorPK: investorPK.toString(),
                marketPlaceVal,
                amountVal,
              });
              proposalIx = await createCredixDepositTrancheIx(
                investorPK,
                new PublicKey(data.instruction.uiElements.find((x: any) => x.name === 'deal').value),
                amountVal,
                parseInt(data.instruction.uiElements.find((x: any) => x.name === 'trancheIndex').value),
                marketPlaceVal,
              );
              break;

            case 'withdrawTranche':
              operation = OperationType.CredixWithdrawTranche;
              consoleOut('**** common inputs: ', {
                investorPK: investorPK.toString(),
                marketPlaceVal,
                amountVal,
              });
              proposalIx = await createCredixWithdrawTrancheIx(
                investorPK,
                new PublicKey(data.instruction.uiElements.find((x: any) => x.name === 'deal').value),
                parseInt(data.instruction.uiElements.find((x: any) => x.name === 'trancheIndex').value),
                marketPlaceVal,
              );
              break;
          }
        } else {
          proposalIx = await createProposalIx(new PublicKey(data.appId), data.config, data.instruction);
        }

        if (!proposalIx) {
          throw new Error('Invalid proposal instruction.');
        }

        const expirationTimeInSeconds = Date.now() / 1_000 + data.expires;
        const expirationDate = data.expires === 0 ? undefined : new Date(expirationTimeInSeconds * 1_000);

        const tx = await getProposalWithPrioritizationFees(
          {
            multisigClient,
            connection,
            transactionPriorityOptions,
          },
          publicKey,
          data.title,
          data.description,
          expirationDate,
          operation,
          selectedMultisig.id,
          proposalIx.programId,
          proposalIx.keys,
          proposalIx.data,
        );

        return tx?.transaction ?? null;
      };

      const createTx = async (): Promise<boolean> => {
        if (!publicKey || !params || !multisigClient) {
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
            result: 'Cannot start transaction! Wallet not found!',
          });
          customLogger.logError('Create Multisig Proposal transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }

        consoleOut('Start transaction for create multisig', '', 'blue');
        consoleOut('Wallet address:', publicKey.toBase58());

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        // Data
        consoleOut('Proposal data:', params);

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: params,
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: '',
        });

        // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
        consoleOut('nativeBalance:', nativeBalance, 'blue');
        consoleOut('networkFee:', multisigTransactionFees.networkFee, 'blue');
        consoleOut('rentExempt:', multisigTransactionFees.rentExempt, 'blue');
        consoleOut('multisigFee:', multisigTransactionFees.multisigFee, 'blue');
        const minRequired =
          multisigTransactionFees.multisigFee + multisigTransactionFees.rentExempt + multisigTransactionFees.networkFee;
        consoleOut('Min required balance:', minRequired, 'blue');

        if (nativeBalance < minRequired) {
          const txStatusMsg = `Not enough balance ${getAmountWithSymbol(
            nativeBalance,
            SOL_MINT.toBase58(),
          )} to pay for network fees ${getAmountWithSymbol(minRequired, SOL_MINT.toBase58())}`;
          const txStatus = {
            customError: txStatusMsg,
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure,
          } as TransactionStatusInfo;
          setTransactionStatus(txStatus);
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: txStatusMsg,
          });
          customLogger.logWarning('Create Transaction Proposal failed', {
            transcript: transactionLog,
          });
          return false;
        }

        const result = await createTransactionProposal(params)
          .then((value: any) => {
            consoleOut('createTransactionProposal returned transaction:', value);
            setTransactionStatus({
              lastOperation: TransactionStatus.InitTransactionSuccess,
              currentOperation: TransactionStatus.SignTransaction,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
              result: getTxIxResume(value),
            });
            transaction = value;
            return true;
          })
          .catch((error: any) => {
            console.error('createTransactionProposal error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`,
            });
            customLogger.logError('Create Multisig Proposal transaction failed', {
              transcript: transactionLog,
            });
            return false;
          });

        return result;
      };

      if (wallet && publicKey) {
        const created = await createTx();
        consoleOut('created:', created);
        if (created) {
          const sign = await signTx('Create Multisig Proposal', wallet, publicKey, transaction);
          if (sign.encodedTransaction) {
            encodedTx = sign.encodedTransaction;
            transactionLog = transactionLog.concat(sign.log);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.SignTransactionSuccess,
            });
            const sent = await sendTx('Create Multisig Proposal', connection, encodedTx);
            consoleOut('sent:', sent);
            if (sent.signature) {
              signature = sent.signature;
              consoleOut('Send Tx to confirmation queue:', signature);
              enqueueTransactionConfirmation({
                signature,
                operationType: OperationType.CreateTransaction,
                finality: 'confirmed',
                txInfoFetchStatus: 'fetching',
                loadingTitle: 'Confirming transaction',
                loadingMessage: `Create proposal: ${params.title}`,
                completedTitle: 'Transaction confirmed',
                completedMessage: `Successfully created proposal: ${params.title}`,
                completedMessageTimeout: isMultisigContext ? 8 : 5,
                extras: {
                  multisigAuthority: params.multisigId,
                },
              });
              setSuccessStatus();
              setMultisigProposalModalVisible(false);
            } else {
              setFailureStatusAndNotify('send');
            }
          } else {
            setFailureStatusAndNotify('sign');
          }
        } else {
          setIsBusy(false);
        }
      }
    },
    [
      wallet,
      publicKey,
      connection,
      nativeBalance,
      multisigClient,
      selectedMultisig,
      isMultisigContext,
      transactionPriorityOptions,
      multisigTransactionFees.multisigFee,
      multisigTransactionFees.networkFee,
      multisigTransactionFees.rentExempt,
      transactionStatus.currentOperation,
      enqueueTransactionConfirmation,
      createCredixWithdrawTrancheIx,
      createCredixDepositTrancheIx,
      createCredixRedeemRequestIx,
      setFailureStatusAndNotify,
      resetTransactionStatus,
      createCredixWithdrawIx,
      createCredixDepositIx,
      setTransactionStatus,
      createProposalIx,
      setSuccessStatus,
    ],
  );

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
  }, [account, nativeBalance, previousBalance, refreshTokenBalance]);

  // Load treasuries when account address changes
  useEffect(() => {
    if (publicKey && selectedAccount.address) {
      consoleOut('Loading treasuries...', 'selectedAccount changed!', 'purple');
      refreshTreasuries(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey, selectedAccount.address]);

  // PaymentStreamingAccount list refresh timeout
  useEffect(() => {
    let timer: any;

    if (publicKey) {
      timer = setInterval(() => {
        consoleOut(`Refreshing treasuries past ${ONE_MINUTE_REFRESH_TIMEOUT / 60 / 1000}min...`);
        refreshTreasuries(false);
      }, ONE_MINUTE_REFRESH_TIMEOUT);
    }

    return () => clearInterval(timer);
  }, [publicKey, loadingTreasuries, refreshTreasuries]);

  // Detect XS screen
  useEffect(() => {
    if (width < 576) {
      setIsXsDevice(true);
    } else {
      setIsXsDevice(false);
    }
  }, [width]);

  // Set an App based of current category and asset group
  useEffect(() => {
    if (selectedCategory === 'apps' || selectedCategory === 'account-summary') {
      const app = KNOWN_APPS.find(a => location.pathname.startsWith(`/${a.slug}`));
      setSelectedApp(app);
      setSelectedNft(undefined);
      setSelectedAsset(undefined);
    } else {
      setSelectedApp(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, selectedCategory]);

  // Load streams on entering page
  useEffect(() => {
    if (!publicKey || !selectedAccount.address) {
      return;
    }

    consoleOut('Loading streams...', '', 'orange');
    refreshStreamList();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount.address, publicKey]);

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

  // Load asset transactions when signaled
  useEffect(() => {
    if (!connection || !publicKey || !selectedAsset || !shouldLoadTransactions || loadingTransactions) {
      return;
    }

    if (selectedAccount.address) {
      setShouldLoadTransactions(value => !value);
      setLoadingTransactions(value => !value);

      // Get the address to scan and ensure there is one
      const pk = getScanAddress(selectedAsset);
      consoleOut('Load transactions for pk:', pk ? pk.toBase58() : 'NONE', 'blue');
      if (!pk) {
        consoleOut('Asset has no public address, aborting...', '', 'goldenrod');
        appendHistoryItems(undefined);
        setStatus(FetchStatus.Fetched);
        return;
      }

      let options = {
        limit: TRANSACTIONS_PER_PAGE,
      };

      if (lastTxSignature) {
        options = Object.assign(options, {
          before: lastTxSignature,
        });
      }

      fetchAccountHistory(connection, pk, options, true)
        .then(history => {
          appendHistoryItems(history.transactionMap, true);
          setStatus(FetchStatus.Fetched);
          if (
            history.transactionMap &&
            history.transactionMap.length > 0 &&
            pk.toBase58() === selectedAccount.address
          ) {
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

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    publicKey,
    connection,
    selectedAsset?.publicAddress,
    selectedAccount.address,
    lastTxSignature,
    solAccountItems,
    loadingTransactions,
    shouldLoadTransactions,
  ]);

  // Set a multisig based on address in context
  useEffect(() => {
    if (!isMultisigContext || !multisigAccounts || !selectedAccount.address) {
      return;
    }

    const item = multisigAccounts.find(m => m.authority.toBase58() === selectedAccount.address);
    if (item) {
      setSelectedMultisig(item);
      setPendingMultisigTxCount(item.pendingTxsAmount);
      consoleOut('selectedMultisig:', item, 'blue');
      consoleOut('pendingMultisigTxCount:', item.pendingTxsAmount, 'blue');
    } else {
      setSelectedMultisig(undefined);
    }
  }, [selectedAccount.address, isMultisigContext, multisigAccounts, setPendingMultisigTxCount, setSelectedMultisig]);

  // Hook on the wallet connect/disconnect
  useEffect(() => {
    if (previousWalletConnectState !== connected) {
      // User is connecting
      if (!previousWalletConnectState && connected && publicKey) {
        consoleOut('Connecting while in accounts...', publicKey.toBase58(), 'green');
      } else if (previousWalletConnectState && !connected) {
        if (streamDetail) {
          setStreamDetail(undefined);
        }
      }
    }
  }, [publicKey, connected, streamDetail, previousWalletConnectState, setStreamDetail]);

  // Get Multisig Apps
  useEffect(() => {
    if (!connectionConfig.cluster) {
      return;
    }

    let network: NETWORK;
    switch (connectionConfig.cluster) {
      case 'mainnet-beta':
        network = NETWORK.MainnetBeta;
        break;
      case 'testnet':
        network = NETWORK.Testnet;
        break;
      case 'devnet':
      default:
        network = NETWORK.Devnet;
        break;
    }

    const provider = new AppsProvider(network);
    setAppsProvider(provider);
    provider.getApps().then((apps: App[]) => {
      setSolanaApps(apps);
    });
  }, [connectionConfig.cluster]);

  // Set program specified in the path as programId from the list of programs
  useEffect(() => {
    if (!connection || !publicKey) {
      return;
    }

    const logIt = (p: ProgramAccounts) => {
      consoleOut(
        'selectedProgram details:',
        {
          pubkey: p.pubkey.toBase58(),
          owner: p.owner.toBase58(),
          upgradeAuthority: p.upgradeAuthority ? p.upgradeAuthority.toBase58() : '',
          executable: p.executable.toBase58(),
          size: formatThousands(p.size),
        },
        'orange',
      );
    };

    if (programs && programId) {
      const filteredProgram = programs.find(program => program.pubkey.toBase58() === programId);

      if (filteredProgram) {
        const programData = filteredProgram.executable.toBase58();
        let updatedProgramData: ProgramAccounts | undefined = undefined;
        resolveParsedAccountInfo(connection, programData)
          .then(accountInfo => {
            const authority = accountInfo.data.parsed.info.authority as string | null;
            updatedProgramData = Object.assign({}, filteredProgram, {
              upgradeAuthority: authority ? new PublicKey(authority) : null,
            }) as ProgramAccounts;
            setSelectedProgram(updatedProgramData);

            logIt(updatedProgramData);
          })
          .catch(error => {
            console.error(error);
            setSelectedProgram(filteredProgram);
            logIt(filteredProgram);
          });
      } else {
        setSelectedProgram(undefined);
      }
    }
  }, [connection, isMultisigContext, location.pathname, programId, programs, publicKey]);

  // Preset token based on url param asset
  useEffect(() => {
    if (asset && accountTokens && accountTokens.length > 0) {
      consoleOut('Presetting token based on url...', asset, 'crimson');
      const inferredAsset = accountTokens.find(t => t.publicAddress === asset);
      if (inferredAsset) {
        consoleOut('selected:', inferredAsset.symbol, 'crimson');
        selectAsset(inferredAsset);
      } else {
        selectAsset(accountTokens[0]);
        consoleOut('selected:', accountTokens[0].symbol, 'crimson');
      }
    } else if (!asset && accountTokens && accountTokens.length > 0) {
      if (location.pathname.startsWith('/assets')) {
        consoleOut('No token in url, try selecting native account...', '', 'crimson');
        const inferredAsset = accountTokens.find(t => t.publicAddress === selectedAccount.address);
        if (inferredAsset) {
          consoleOut('selected:', inferredAsset.symbol, 'crimson');
          selectAsset(inferredAsset);
        } else {
          consoleOut('WTF 1 ?', '', 'crimson');
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountTokens, location.pathname, asset, selectedAccount.address]);

  // Build CTAs
  useEffect(() => {
    if (!selectedAsset) {
      return;
    }

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
      callBack: onSendAsset,
    });
    ctaItems++;

    // UnwrapSol
    const unwrapSolCta = getUnwrapSolCta(
      'Unwrap',
      isInspectedAccountTheConnectedWallet(),
      isSelectedAssetWsol(),
      wSolBalance,
      onStartUnwrapTx,
    );
    if (unwrapSolCta.length > 0) ctaItems++;
    actions.push(...unwrapSolCta);

    // Buy
    const buyOptionsCta = getBuyOptionsCta(
      'Buy',
      ctaItems,
      numMaxCtas,
      isInspectedAccountTheConnectedWallet(),
      isSelectedAssetWsol(),
      isCustomAsset,
      showDepositOptionsModal,
    );
    if (buyOptionsCta.length > 0) ctaItems++;
    actions.push(...buyOptionsCta);

    // Deposit
    actions.push(getDepositOptionsCta('Deposit', ctaItems, numMaxCtas, showReceiveSplOrSolModal));
    ctaItems++;

    // Swap
    const exchangeAssetCta = getExchangeAssetCta(
      t('ui-menus.main-menu.exchange'),
      ctaItems,
      numMaxCtas,
      isInspectedAccountTheConnectedWallet(),
      isSelectedAssetWsol(),
      isCustomAsset,
      onExchangeAsset,
    );
    if (exchangeAssetCta.length > 0) ctaItems++;
    actions.push(...exchangeAssetCta);

    // Invest
    const investAssetCta = getInvestAssetCta(
      ctaItems,
      numMaxCtas,
      investButtonEnabled(),
      selectedAsset,
      handleGoToInvestClick,
    );
    if (investAssetCta.length > 0) ctaItems++;
    actions.push(...investAssetCta);

    // Wrap
    const wrapSolCta = getWrapSolCta(
      'Wrap',
      ctaItems,
      numMaxCtas,
      isInspectedAccountTheConnectedWallet(),
      isSelectedAssetNativeAccount(),
      isWhitelisted,
      showWrapSolModal,
    );
    if (wrapSolCta.length > 0) ctaItems++;
    actions.push(...wrapSolCta);

    // Copy asset mint address
    if (selectedAsset.address !== NATIVE_SOL.address) {
      actions.push({
        caption: 'Copy mint address',
        action: MetaInfoCtaAction.CopyAssetMintAddress,
        isVisible: true,
        uiComponentType: 'menuitem',
        disabled: false,
        uiComponentId: `menuitem-${MetaInfoCtaAction.CopyAssetMintAddress}`,
        tooltip: '',
        callBack: () => copyAddressToClipboard(selectedAsset.address),
      });
      actions.push({
        caption: 'Create non-ATA',
        action: MetaInfoCtaAction.CreateNonAta,
        isVisible: true,
        uiComponentType: 'menuitem',
        disabled: false,
        uiComponentId: `menuitem-${MetaInfoCtaAction.CreateNonAta}`,
        tooltip: '',
        callBack: () => onCreateSafeNonAta(selectedAsset),
      });
    }

    // Refresh asset
    actions.push({
      caption: 'Refresh asset',
      action: MetaInfoCtaAction.Refresh,
      isVisible: true,
      uiComponentType: 'menuitem',
      disabled: false,
      uiComponentId: `menuitem-${MetaInfoCtaAction.Refresh}`,
      tooltip: '',
      callBack: reloadSwitch,
    });

    // Merge token accounts
    const mergeAccountsCta = getMergeAccountsCta(
      t('assets.merge-accounts-cta'),
      isInspectedAccountTheConnectedWallet(),
      canActivateMergeTokenAccounts(),
      activateTokenMerge,
    );
    actions.push(...mergeAccountsCta);

    // Close asset
    const closeAccountCtaMultisigCallback =
      isMultisigContext && isDeleteAssetValid() ? showDeleteVaultModal : undefined;
    const closeAccountCta = getCloseAccountCta(
      isMultisigContext,
      isInspectedAccountTheConnectedWallet(),
      isAnyTxPendingConfirmation(),
      isDeleteAssetValid(),
      !isMultisigContext ? showCloseAssetModal : closeAccountCtaMultisigCallback,
    );
    actions.push(...closeAccountCta);

    setAssetCtas(actions);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isXsDevice,
    wSolBalance,
    selectedAsset,
    isMultisigContext,
    isInspectedAccountTheConnectedWallet,
    isSelectedAssetNativeAccount,
    isSelectedAssetWsol,
    investButtonEnabled,
  ]);

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
  }, [publicKey, streamList, connection, isInboundStream]);

  // Incoming amount
  useEffect(() => {
    if (!incomingStreamList) {
      return;
    }

    setIncomingAmount(incomingStreamList.length);
  }, [incomingStreamList]);

  // Outgoing amount
  useEffect(() => {
    if (!outgoingStreamList) {
      return;
    }

    setOutgoingAmount(outgoingStreamList.length);
  }, [outgoingStreamList]);

  // Total streams amount
  useEffect(() => {
    setTotalStreamsAmount(incomingAmount + outgoingAmount);
  }, [incomingAmount, outgoingAmount]);

  // Live data calculation
  useEffect(() => {
    if (!publicKey || !streamList || (!streamListv1 && !streamListv2)) {
      return;
    }

    const timeout = setTimeout(() => {
      refreshIncomingStreamSummary();
      refreshOutgoingStreamSummary();
    }, 1000);

    return () => {
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey, streamList, streamListv1, streamListv2]);

  // Get treasuries summary
  useEffect(() => {
    if (!publicKey || !treasuryList) {
      return;
    }

    const timeout = setTimeout(() => {
      refreshTreasuriesSummary();
    }, 1000);

    return () => {
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey, treasuryList]);

  // Having the treasuriesSummary and stream stats, lets publish combined stats
  useEffect(() => {
    let totalStreamingAccounts = 0;
    if (streamingAccountsSummary) {
      totalStreamingAccounts = streamingAccountsSummary.totalAmount;
    }
    const paymentStreamingResume = {
      totalStreamingAccounts,
      incomingAmount,
      outgoingAmount,
    };
    setPaymentStreamingStats(paymentStreamingResume);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingAmount, outgoingAmount, streamingAccountsSummary]);

  // Update total account balance
  useEffect(() => {
    if (loadingStreams) {
      return;
    }

    const wdb = new BigNumber(incomingStreamsSummary.totalNet.toFixed(2)).toNumber();

    const unallocatedTotalAmount = outgoingStreamsSummary.totalNet + streamingAccountsSummary.totalNet;
    const ub = new BigNumber(unallocatedTotalAmount.toFixed(2)).toNumber();

    setTotalAccountBalance(wdb + ub);
    setCanShowStreamingAccountBalance(true);
  }, [loadingStreams, incomingStreamsSummary, outgoingStreamsSummary, streamingAccountsSummary]);

  // Live data calculation - NetWorth
  useEffect(() => {
    if (tokensLoaded && accountTokens) {
      // Total USD value
      const totalTokensValue = accountTokens.reduce((accumulator, item) => {
        const tokenPrice = getTokenPriceByAddress(item.address, item.symbol);
        const value = tokenPrice * (item.balance ?? 0);
        return accumulator + value;
      }, 0);
      setTotalTokenAccountsValue(totalTokensValue);

      // Net Worth
      const total = totalTokensValue + totalAccountBalance;
      setNetWorth(total);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountTokens, tokensLoaded, totalAccountBalance]);

  // Setup event listeners
  useEffect(() => {
    if (canSubscribe) {
      setCanSubscribe(false);
      consoleOut('Setup event subscriptions -> HomeView', '', 'brown');
      confirmationEvents.on(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut('Subscribed to event txConfirmed with:', 'onTxConfirmed', 'brown');
      confirmationEvents.on(EventType.TxConfirmTimeout, onTxTimedout);
      consoleOut('Subscribed to event txTimedout with:', 'onTxTimedout', 'brown');
    }
  }, [canSubscribe, onTxConfirmed, onTxTimedout]);

  // Unsubscribe from events
  useEffect(() => {
    return () => {
      consoleOut('Stop event subscriptions -> HomeView', '', 'brown');
      confirmationEvents.off(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut('Unsubscribed from event txConfirmed!', '', 'brown');
      confirmationEvents.off(EventType.TxConfirmTimeout, onTxTimedout);
      consoleOut('Unsubscribed from event onTxTimedout!', '', 'brown');
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

  const onStartUnwrapTx = useCallback(async () => {
    const payload = () => {
      return { wSolBalance };
    };
    const loadingMessage = () => `Unwrap ${formatThousands(wSolBalance, NATIVE_SOL.decimals)} SOL`;
    const completedMessage = () => `Successfully unwrapped ${formatThousands(wSolBalance, NATIVE_SOL.decimals)} SOL`;
    const bf = transactionAssetFees.blockchainFee; // Blockchain fee
    const ff = transactionAssetFees.mspFlatFee; // Flat fee (protocol)
    const minRequired = bf + ff;
    setMinRequiredBalance(minRequired);

    const wSol = accountTokens.find(t => t.address === WRAPPED_SOL_MINT_ADDRESS);
    consoleOut('unwrapAmount:', wSolBalance, 'blue');

    if (!wSol?.publicAddress) {
      openNotification({
        title: 'Cannot unwrap SOL',
        description: `Wrapped SOL token account not found for the currently connected wallet account`,
        type: 'info',
      });
      return;
    }

    const wSolPubKey = new PublicKey(wSol.publicAddress);

    await onExecute({
      name: 'Unwrap SOL',
      operationType: OperationType.Unwrap,
      payload,
      loadingMessage,
      completedMessage,
      setIsBusy,
      nativeBalance,
      minRequired,
      generateTransaction: async ({ multisig, data }) => {
        if (!publicKey) return;

        return await createCloseTokenAccountTx(connection, wSolPubKey, publicKey);
      },
    });
    closeCreateAssetModal(true);
  }, [
    publicKey,
    connection,
    wSolBalance,
    accountTokens,
    nativeBalance,
    transactionAssetFees.mspFlatFee,
    transactionAssetFees.blockchainFee,
    closeCreateAssetModal,
    onExecute,
  ]);

  //////////////
  //  Events  //
  //////////////

  const onRefreshStreamsNoReset = () => {
    refreshStreamList(false);
    refreshTreasuries(false);
  };

  const onRefreshStreamsReset = () => {
    refreshStreamList(true);
    refreshTreasuries(false);
  };

  const getReturnPathForStreaming = () => {
    if (previousRoute) {
      setPreviousRoute('');
      return previousRoute;
    }
    if (location.pathname === `/${RegisteredAppPaths.PaymentStreaming}/incoming/${streamingItemId}`) {
      return `/${RegisteredAppPaths.PaymentStreaming}/incoming`;
    } else if (location.pathname.startsWith(`/${RegisteredAppPaths.PaymentStreaming}/outgoing`)) {
      return `/${RegisteredAppPaths.PaymentStreaming}/outgoing`;
    } else if (location.pathname === `/${RegisteredAppPaths.PaymentStreaming}/streaming-accounts/${streamingItemId}`) {
      return `/${RegisteredAppPaths.PaymentStreaming}/streaming-accounts`;
    } else {
      turnOffRightPanel();
      return '';
    }
  };

  const onBackButtonClicked = () => {
    let url = '';

    if (location.pathname === '/my-account') {
      turnOffRightPanel();
      return;
    } else if (location.pathname.indexOf('/assets') !== -1) {
      turnOffRightPanel();
      if (selectedAsset) {
        url = getAssetPath(selectedAsset);
      } else {
        url = `/assets`;
      }
    } else if (location.pathname.indexOf('/super-safe') !== -1) {
      turnOffRightPanel();
      url = `/super-safe?v=proposals`;
    } else if (location.pathname.startsWith(`/${RegisteredAppPaths.PaymentStreaming}`)) {
      url = getReturnPathForStreaming();
    } else {
      turnOffRightPanel();
    }

    consoleOut('Return path for streaming:', url, 'crimson');
    if (url) {
      navigate(url);
    }
  };

  ////////////////
  // Validators //
  ////////////////

  const isDeleteAssetValid = () => {
    if (selectedAsset) {
      const isSol = selectedAsset.address === SOL_MINT.toBase58();

      if (!isSol && (selectedAsset.balance as number) === 0) {
        return true;
      } else {
        return false;
      }
    }
    return false;
  };

  const isSendFundsValid = () => {
    if (selectedAsset && (selectedAsset.balance as number) > 0) {
      return true;
    } else {
      return false;
    }
  };

  const isTransferOwnershipValid = () => {
    if (selectedAsset) {
      const isSol = selectedAsset.address === SOL_MINT.toBase58();

      if (!isSol) {
        return true;
      } else {
        return false;
      }
    }
  };

  const getLeftPanelOptions = () => {
    const items: ItemType[] = [];
    if (isMultisigContext) {
      items.push({
        key: '01-create-asset',
        label: (
          <div onClick={onShowCreateAssetModal}>
            <IconAdd className="mean-svg-icons" />
            <span className="menu-item-text">Create an asset</span>
          </div>
        ),
      });
    }
    items.push({
      key: '02-suggest-asset',
      label: (
        <div onClick={showSuggestAssetModal}>
          <IconLightBulb className="mean-svg-icons" />
          <span className="menu-item-text">Suggest an asset</span>
        </div>
      ),
    });
    if (accountTokens && accountTokens.length > 0) {
      if (hideLowBalances) {
        items.push({
          key: '03-show-low-balances',
          label: (
            <div onClick={() => toggleHideLowBalances(false)}>
              <IconEyeOn className="mean-svg-icons" />
              <span className="menu-item-text">Show low balances</span>
            </div>
          ),
        });
      } else {
        items.push({
          key: '04-hide-low-balances',
          label: (
            <div onClick={() => toggleHideLowBalances(true)}>
              <IconEyeOff className="mean-svg-icons" />
              <span className="menu-item-text">Hide low balances</span>
            </div>
          ),
        });
      }
    }
    return { items };
  };

  const getAssetsGroupOptions = () => {
    const nftCount = accountNfts ? accountNfts.length : 0;
    const visibleApps = KNOWN_APPS.filter(a => a.visible).length;
    const options: SegmentedLabeledOption[] = [
      {
        label: `Tokens (${accountTokens.length})`,
        value: AssetGroups.Tokens,
      },
      {
        // Learn how to differentiate NFTs from token accounts and apply knowledge here
        label: `NFTs (${nftCount > 99 ? '99+' : nftCount})`,
        value: AssetGroups.Nfts,
      },
      {
        label: `Apps (${visibleApps})`,
        value: AssetGroups.Apps,
      },
      {
        label: `Other Assets (${programs ? programs.length : 0})`,
        value: AssetGroups.OtherAssets,
      },
    ];
    return options;
  };

  ///////////////
  // Rendering //
  ///////////////

  const renderNetworth = () => {
    if (netWorth) {
      return toUsCurrency(netWorth);
    } else {
      return '$0.00';
    }
  };

  const renderSelectedAccountSummaryInner = () => {
    return (
      <>
        <div className="left">
          <div className="font-bold font-size-110 line-height-110">{selectedAccount.name}</div>
          <div className="font-regular font-size-80 line-height-110 fg-secondary-50">
            {shortenAddress(selectedAccount.address, 8)}
          </div>
        </div>
        <div className="font-bold font-size-110 right">
          {loadingStreams || !canShowStreamingAccountBalance ? (
            <IconLoading className="mean-svg-icons" style={{ height: '12px', lineHeight: '12px' }} />
          ) : (
            renderNetworth()
          )}
        </div>
      </>
    );
  };

  const renderSelectedAccountSummary = (type: string) => {
    return (
      <div className="networth-list-item-wrapper" key="account-summary-category">
        <div
          onClick={() => {
            turnOnRightPanel();
            setSelectedNft(undefined);
            setSelectedAsset(undefined);
            if (type === 'my-account') {
              navigate('/my-account');
            } else {
              navigateToSafe();
            }
          }}
          className={`networth-list-item flex-fixed-right ${selectedCategory === 'account-summary' ? 'selected' : ''}`}
        >
          {renderSelectedAccountSummaryInner()}
        </div>
        <Divider className="networth-separator" />
      </div>
    );
  };

  const renderMoneyStreamsSummary = () => {
    const renderValues = () => {
      if (totalStreamsAmount === 0) {
        return <div className="subtitle">{t('account-area.no-money-streams')}</div>;
      } else {
        return (
          <div className="subtitle">
            {incomingAmount} {t('streams.stream-stats-incoming')}, {outgoingAmount} {t('streams.stream-stats-outgoing')}
          </div>
        );
      }
    };

    return (
      <>
        {
          <div
            key="streams-category"
            onClick={() => {
              setSelectedNft(undefined);
              navigateToStreaming();
            }}
            className={`transaction-list-row ${
              selectedCategory === 'apps' && selectedApp?.slug === RegisteredAppPaths.PaymentStreaming ? 'selected' : ''
            }`}
          >
            <div className="icon-cell">
              {loadingStreams ? (
                <div className="token-icon animate-border-loading">
                  <div
                    className="streams-count simplelink"
                    onClick={e => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <span className="font-bold text-shadow">
                      <SyncOutlined spin />
                    </span>
                  </div>
                </div>
              ) : (
                <div className={totalStreamsAmount !== 0 ? 'token-icon animate-border' : 'token-icon'}>
                  <div
                    className="streams-count simplelink"
                    onClick={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      refreshStreamList(false);
                    }}
                  >
                    <span className="font-size-75 font-bold text-shadow">
                      {kFormatter(totalStreamsAmount ?? 0, 1) || 0}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div className="description-cell">
              <div className="title">{t('account-area.money-streams')}</div>
              {loadingStreams ? (
                <div className="subtitle">
                  <IconLoading className="mean-svg-icons" style={{ height: '12px', lineHeight: '12px' }} />
                </div>
              ) : (
                renderValues()
              )}
            </div>
            <div className="rate-cell">
              {loadingStreams || !canShowStreamingAccountBalance ? (
                <div className="rate-amount">
                  <IconLoading className="mean-svg-icons" style={{ height: '12px', lineHeight: '12px' }} />
                </div>
              ) : (
                <>
                  {totalAccountBalance > 0 ? (
                    <>
                      <div className="rate-amount">{toUsCurrency(totalAccountBalance)}</div>
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
  };

  const renderLoadingOrNoTokensMessage = () => {
    if (loadingTokenAccounts) {
      return (
        <div className="flex flex-center">
          <Spin indicator={loadIndicator} />
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
  };

  const renderAssetsList = () => {
    return (
      <div
        key="asset-category-token-items"
        className={`asset-category flex-column${!accountTokens || accountTokens.length === 0 ? ' h-75' : ''}`}
      >
        {accountTokens && accountTokens.length > 0 ? (
          <>
            {isInspectedAccountTheConnectedWallet() && wSolBalance > 0 && (
              <div className="utility-box">
                <div className="well mb-1">
                  <div className="flex-fixed-right align-items-center">
                    <div className="left">
                      You have {formatThousands(wSolBalance, NATIVE_SOL.decimals, NATIVE_SOL.decimals)}{' '}
                      <strong>wrapped SOL</strong> in your wallet. Click to unwrap to native SOL.
                    </div>
                    <div className="right">
                      <Button
                        type="primary"
                        shape="round"
                        disabled={isUnwrapping}
                        onClick={onStartUnwrapTx}
                        size="small"
                      >
                        {isUnwrapping ? 'Unwrapping SOL' : 'Unwrap SOL'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* Render user token accounts */}
            <AssetList
              accountTokens={accountTokens}
              hideLowBalances={hideLowBalances}
              onTokenAccountClick={(asset: UserTokenAccount) => {
                consoleOut('clicked on asset:', asset.publicAddress, 'blue');
                navigateToAsset(asset);
                setSelectedNft(undefined);
              }}
              selectedAsset={selectedAsset}
              selectedCategory={selectedCategory}
            />
          </>
        ) : (
          renderLoadingOrNoTokensMessage()
        )}
      </div>
    );
  };

  const renderNftList = () => {
    const onNftItemClick = (item: MeanNft) => {
      consoleOut('clicked on NFT item:', item, 'blue');
      setSelectedNft(item);
      setSelectedApp(undefined);
      setTimeout(() => {
        navigateToNft(item.address.toBase58());
      }, 50);
    };

    const nftMint = asset ? getNftMint(asset, accountTokens, accountNfts) : undefined;

    return (
      <NftPaginatedList
        connection={connection}
        loadingTokenAccounts={loadingTokenAccounts}
        nftList={accountNfts}
        onNftItemClick={(nft: MeanNft) => onNftItemClick(nft)}
        presetNftMint={selectedNft ? undefined : nftMint}
        selectedNft={selectedNft}
        tokensLoaded={tokensLoaded}
      />
    );
  };

  const renderAppsList = () => {
    const onAppClick = (app: KnownAppMetadata) => {
      // Don't do anything if the current path starts with the selected App slug
      const isTargetAppAlreadyOpen = location.pathname.startsWith(`/${app.slug}`);
      if (isTargetAppAlreadyOpen) {
        return;
      }

      setSelectedApp(undefined);
      setSelectedAsset(undefined);
      // The reason for the timeout is to avoid the navigation to happen before the componentUnmount
      setTimeout(() => {
        navigate(app.defaultPath);
      }, 50);
    };

    return (
      <AppsList
        isMultisigContext={isMultisigContext}
        selectedApp={selectedApp}
        onAppClick={(selection: KnownAppMetadata) => onAppClick(selection)}
      />
    );
  };

  const renderOtherAssetsList = () => {
    const onProgramSelected = (item: ProgramAccounts) => {
      setSelectedApp(undefined);
      setSelectedAsset(undefined);

      // Activate panels and navigate
      const url = `/programs/${item.pubkey.toBase58()}?v=transactions`;
      setTimeout(() => {
        navigate(url);
      }, 10);
    };

    return (
      <OtherAssetsList
        loadingPrograms={loadingPrograms}
        onProgramSelected={(item: ProgramAccounts) => onProgramSelected(item)}
        programs={programs}
        selectedProgram={selectedProgram}
      />
    );
  };

  const renderEstimatedValueByCategory = () => {
    switch (selectedAssetsGroup) {
      case AssetGroups.Tokens:
        return <span>Estimated value of tokens: {toUsCurrency(totalTokenAccountsValue)}</span>;
      case AssetGroups.Nfts:
        return <span>Enjoy your collections of NFTs</span>;
      case AssetGroups.Apps:
        return <span>Explore supported Apps</span>;
      case AssetGroups.OtherAssets:
        return <span>Mints, Smart Contracts and other assets</span>;
      default:
        return <span>&nbsp;</span>;
    }
  };

  const renderActivityList = () => {
    return (
      <AssetActivity
        accountTokens={accountTokens}
        hasItems={hasItemsToRender()}
        isAssetNativeAccount={isSelectedAssetNativeAccount()}
        lastTxSignature={lastTxSignature}
        selectedAccountAddress={selectedAccount.address}
        selectedAsset={selectedAsset}
        status={status}
        transactions={transactions}
        onLoadMore={() => startSwitch()}
      />
    );
  };

  const renderUserAccountAssetMenu = () => {
    const ctas = assetCtas.filter(m => m.isVisible && m.uiComponentType === 'menuitem');
    const items: ItemType[] = ctas.map((item: MetaInfoCta, index: number) => {
      return {
        key: `${index + 44}-${item.uiComponentId}`,
        label: (
          <span className="menu-item-text" onClick={item.callBack}>
            {item.caption}
          </span>
        ),
        disabled: item.disabled,
      };
    });
    return { items };
  };

  const renderUserAccountAssetCtaRow = () => {
    if (!selectedAsset) {
      return null;
    }
    const items = assetCtas.filter(m => m.isVisible && m.uiComponentType === 'button');

    return (
      <div className="flex-fixed-right cta-row">
        <Space className="left" size="middle" wrap>
          {isMultisigContext ? (
            <>
              <Button
                type="default"
                shape="round"
                size="small"
                className="thin-stroke asset-btn"
                onClick={showReceiveSplOrSolModal}
              >
                <div className="btn-content">{t('multisig.multisig-assets.cta-deposit')}</div>
              </Button>
              <Button
                type="default"
                shape="round"
                size="small"
                className="thin-stroke asset-btn"
                disabled={isAnyTxPendingConfirmation() || !isSendFundsValid()}
                onClick={showTransferTokenModal}
              >
                <div className="btn-content">{t('multisig.multisig-assets.cta-transfer')}</div>
              </Button>
              <Button
                type="default"
                shape="round"
                size="small"
                className="thin-stroke asset-btn"
                disabled={isAnyTxPendingConfirmation() || !isTransferOwnershipValid()}
                onClick={showTransferVaultAuthorityModal}
              >
                <div className="btn-content">{t('multisig.multisig-assets.cta-change-multisig-authority')}</div>
              </Button>
            </>
          ) : (
            items.map(item => {
              // Draw the Asset CTAs here
              if (item.tooltip) {
                return (
                  <Tooltip placement="bottom" title={item.tooltip} key={item.uiComponentId}>
                    <Button
                      type="default"
                      shape="round"
                      size="small"
                      className="thin-stroke"
                      disabled={item.disabled}
                      onClick={item.callBack}
                    >
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
                    onClick={item.callBack}
                  >
                    <span>{item.caption}</span>
                  </Button>
                );
              }
            })
          )}
        </Space>
        <Dropdown menu={renderUserAccountAssetMenu()} placement="bottomRight" trigger={['click']}>
          <span className="icon-button-container">
            <Button
              type="default"
              shape="circle"
              size="middle"
              icon={<IconVerticalEllipsis className="mean-svg-icons" />}
              onClick={e => e.preventDefault()}
            />
          </span>
        </Dropdown>
      </div>
    );
  };

  const renderUserAccountAssetMeta = () => {
    if (!selectedAsset) {
      return null;
    }

    const renderBalance = () => {
      if (tokenPrice > 0) {
        return selectedAsset.balance ? toUsCurrency((selectedAsset.balance || 0) * tokenPrice) : '$0.00';
      } else {
        return '$0.00';
      }
    };
    const tokenPrice = getTokenPriceByAddress(selectedAsset.address, selectedAsset.symbol);

    return (
      <div className="accounts-category-meta">
        <div className="mb-2">
          <Row>
            <Col span={14}>
              <div className="info-label">Balance</div>
              <div className="transaction-detail-row">
                <div className="info-data">
                  {getAmountWithSymbol(
                    selectedAsset.balance ?? 0,
                    selectedAsset.address,
                    false,
                    splTokenList,
                    selectedAsset.decimals,
                  )}
                </div>
              </div>
              <div className="info-extra font-size-85">
                <AddressDisplay
                  address={selectedAsset.publicAddress as string}
                  iconStyles={{ width: '16', height: '16' }}
                  newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${
                    selectedAsset.publicAddress
                  }${getSolanaExplorerClusterParam()}`}
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
    );
  };

  const renderSpinner = () => {
    return (
      <div className="h-100 flex-center">
        <Spin spinning={true} />
      </div>
    );
  };

  return (
    <>
      {detailsPanelOpen && (
        <Button
          id="back-button"
          type="default"
          shape="circle"
          icon={<ArrowLeftOutlined />}
          onClick={onBackButtonClicked}
        />
      )}

      <div className="container main-container accounts">
        {/* SEO tags overrides */}
        <Helmet>
          <title>Accounts - Mean Finance</title>
          <link rel="canonical" href="/" />
          <meta name="description" content="Accounts. Keep track of your assets and transactions" />
          <meta name="google-site-verification" content="u-gc96PrpV7y_DAaA0uoo4tc2ffcgi_1r6hqSViM-F8" />
          <meta name="keywords" content="assets, transactions" />
        </Helmet>
        {/* This is a SEO mandatory h1 but it is not visible */}
        <h1 className="mandatory-h1">Keep track of your assets and transactions</h1>

        {publicKey && (
          <div className="interaction-area">
            {selectedAccount.address && (
              <div className={`meanfi-two-panel-layout ${detailsPanelOpen ? 'details-open' : ''}`}>
                {/* Left / top panel */}
                <div className="meanfi-two-panel-left">
                  <div id="streams-refresh-noreset-cta" onClick={onRefreshStreamsNoReset}></div>
                  <div id="streams-refresh-reset-cta" onClick={onRefreshStreamsReset}></div>

                  <div className="inner-container">
                    {/* Account summary (sticky) */}
                    {isMultisigContext
                      ? renderSelectedAccountSummary('super-safe')
                      : renderSelectedAccountSummary('my-account')}

                    {/* Middle area (vertically flexible block of items) */}
                    <div className={`item-block${!isXsDevice ? ' vertical-scroll vertical-scroll-always' : ''}`}>
                      {/* Pinned Apps or Favorites */}
                      <div key="payment-streams-summary" className="asset-category">
                        {renderMoneyStreamsSummary()}
                      </div>

                      {/* Assets tabset */}
                      <div key="asset-category-title" className="asset-category-title text-center pt-1 pb-1">
                        <Segmented
                          size="small"
                          defaultValue={AssetGroups.Tokens}
                          value={selectedAssetsGroup}
                          options={getAssetsGroupOptions()}
                          onChange={value => setSelectedAssetsGroup(value as AssetGroups)}
                        />
                        <div className="asset-category-estimated">{renderEstimatedValueByCategory()}</div>
                      </div>

                      {selectedAssetsGroup === AssetGroups.Tokens ? renderAssetsList() : null}

                      {selectedAssetsGroup === AssetGroups.Nfts ? renderNftList() : null}

                      {selectedAssetsGroup === AssetGroups.Apps ? renderAppsList() : null}

                      {selectedAssetsGroup === AssetGroups.OtherAssets ? renderOtherAssetsList() : null}
                    </div>

                    {/* Bottom CTAs */}
                    <div className="bottom-ctas">
                      <div className="primary-action">
                        {isMultisigContext ? (
                          <Button
                            block
                            className="flex-center"
                            type="primary"
                            shape="round"
                            onClick={onNewProposalClicked}
                          >
                            <IconSafe className="mean-svg-icons" style={{ width: 24, height: 24 }} />
                            <span className="ml-1">New proposal</span>
                          </Button>
                        ) : (
                          <Button block className="flex-center" type="primary" shape="round" onClick={showInitAtaModal}>
                            <IconAdd className="mean-svg-icons" />
                            <span className="ml-1">Add asset</span>
                          </Button>
                        )}
                      </div>
                      <Dropdown
                        className="options-dropdown"
                        menu={getLeftPanelOptions()}
                        placement="bottomRight"
                        trigger={['click']}
                      >
                        <span className="icon-button-container">
                          <Button
                            type="default"
                            shape="circle"
                            size="middle"
                            icon={<IconVerticalEllipsis className="mean-svg-icons" />}
                            onClick={e => e.preventDefault()}
                          />
                        </span>
                      </Dropdown>
                    </div>
                  </div>
                </div>

                {/* Right / down panel */}
                <div className="meanfi-two-panel-right">
                  <div className="meanfi-panel-heading">
                    <span className="title">{t('assets.history-panel-title')}</span>
                  </div>

                  <div className="inner-container">
                    {selectedApp?.slug === RegisteredAppPaths.PaymentStreaming ? (
                      <>
                        {/* Refresh cta */}
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
                        <Suspense fallback={renderSpinner()}>
                          <PaymentStreamingComponent
                            loadingTreasuries={loadingTreasuries}
                            treasuryList={treasuryList}
                            onBackButtonClicked={onBackButtonClicked}
                          />
                        </Suspense>
                      </>
                    ) : null}

                    {selectedApp?.slug === RegisteredAppPaths.SuperSafe ? (
                      <Suspense fallback={renderSpinner()}>
                        <SafeDetails
                          appsProvider={appsProvider}
                          safeBalance={netWorth}
                          solanaApps={solanaApps}
                          onNewProposalClicked={onNewProposalClicked}
                          onProposalExecuted={() => {
                            consoleOut('Triggering onRefreshStreamsReset...');
                            onRefreshStreamsReset();
                          }}
                        />
                      </Suspense>
                    ) : null}

                    {selectedApp?.slug === RegisteredAppPaths.Staking &&
                    location.pathname.startsWith(`/${RegisteredAppPaths.Staking}`) ? (
                      <Suspense fallback={renderSpinner()}>
                        <StakingComponent />
                      </Suspense>
                    ) : null}

                    {selectedApp?.slug === RegisteredAppPaths.Vesting &&
                    location.pathname.startsWith(`/${RegisteredAppPaths.Vesting}`) ? (
                      <Suspense fallback={renderSpinner()}>
                        <VestingComponent appSocialLinks={selectedApp.socials} />
                      </Suspense>
                    ) : null}

                    {location.pathname.startsWith('/programs/') ? (
                      <div className="safe-details-component scroll-wrapper vertical-scroll">
                        {selectedProgram ? (
                          <Suspense fallback={renderSpinner()}>
                            <ProgramDetailsComponent programSelected={selectedProgram} />
                          </Suspense>
                        ) : (
                          renderSpinner()
                        )}
                      </div>
                    ) : null}

                    {selectedCategory === 'account-summary' && location.pathname === '/my-account' ? (
                      <Suspense fallback={renderSpinner()}>
                        <PersonalAccountSummary accountBalance={netWorth} />
                      </Suspense>
                    ) : null}

                    {location.pathname.startsWith('/assets') ? (
                      <>
                        {/* Refresh cta */}
                        <div className="float-top-right mr-1 mt-1">
                          <span className="icon-button-container secondary-button">
                            <Tooltip placement="bottom" title="Refresh assets and activity">
                              <Button
                                id="account-refresh-cta"
                                type="default"
                                shape="circle"
                                size="middle"
                                icon={<ReloadOutlined className="mean-svg-icons" />}
                                onClick={reloadTokensAndActivity}
                              />
                            </Tooltip>
                          </span>
                        </div>
                        <div className="flexible-column-bottom">
                          <div className="top">
                            {renderUserAccountAssetMeta()}
                            {renderUserAccountAssetCtaRow()}
                          </div>
                          {!isInspectedAccountTheConnectedWallet() &&
                            isMultisigContext &&
                            selectedMultisig &&
                            (multisigSolBalance !== undefined && multisigSolBalance <= MIN_SOL_BALANCE_REQUIRED ? (
                              <Row gutter={[8, 8]}>
                                <Col
                                  span={24}
                                  className={`alert-info-message pr-2 ${
                                    selectedMultisig ? 'simplelink' : 'disable-pointer'
                                  }`}
                                  onClick={showSolBalanceModal}
                                >
                                  <Alert
                                    message="SOL account balance is very low in the safe. Click here to add more SOL."
                                    type="info"
                                    showIcon
                                  />
                                </Col>
                              </Row>
                            ) : null)}
                          <div className={`bottom ${!hasItemsToRender() ? 'h-100 flex-column' : ''}`}>
                            {/* Activity table heading */}
                            {hasItemsToRender() && (
                              <div className="stats-row">
                                <div className="item-list-header compact">
                                  <div className="header-row">
                                    <div className="std-table-cell first-cell">&nbsp;</div>
                                    <div className="std-table-cell responsive-cell">
                                      {t('assets.history-table-activity')}
                                    </div>
                                    <div className="std-table-cell responsive-cell pr-2 text-right">
                                      {t('assets.history-table-amount')}
                                    </div>
                                    <div className="std-table-cell responsive-cell pr-2 text-right">
                                      {t('assets.history-table-postbalance')}
                                    </div>
                                    <div className="std-table-cell responsive-cell pl-2">
                                      {t('assets.history-table-date')}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                            {/* Activity table content */}
                            {renderActivityList()}
                          </div>
                        </div>
                      </>
                    ) : null}
                    {location.pathname.startsWith('/nfts') && selectedNft ? (
                      <NftDetails selectedNft={selectedNft} />
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {connection && selectedTokenMergeGroup && isTokenMergerModalVisible && (
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
          address={selectedAsset.publicAddress ?? ''}
          accountAddress={selectedAccount.address}
          multisigAddress={selectedAccount.address}
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
        <WrapSolModal isVisible={isWrapSolModalOpen} handleOk={onAfterWrap} handleClose={hideWrapSolModal} />
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
          selectedMultisig={selectedMultisig ?? undefined}
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
          handleOk={(params: SetAssetAuthPayload) => onAcceptTransferVaultAuthority(params)}
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
          selectedMultisig={selectedMultisig ?? undefined}
        />
      )}

      {isCreateAssetModalVisible && (
        <MultisigAddAssetModal
          connection={connection}
          handleOk={(item: CreateSafeAssetTxParams) => onAcceptCreateVault(item)}
          handleClose={closeCreateAssetModal}
          isVisible={isCreateAssetModalVisible}
          ownedTokenAccounts={userOwnedTokenAccounts}
          isBusy={isBusy}
          selectedMultisig={selectedMultisig}
        />
      )}

      {isSolBalanceModalOpen && selectedMultisig && (
        <SolBalanceModal
          address={NATIVE_SOL.address || ''}
          accountAddress={selectedAccount.address}
          multisigAddress={selectedMultisig.authority.toBase58()}
          isVisible={isSolBalanceModalOpen}
          handleClose={hideSolBalanceModal}
          tokenSymbol={NATIVE_SOL.symbol}
          nativeBalance={selectedMultisig.balance}
          selectedMultisig={selectedMultisig}
          isStreamingAccount={false}
        />
      )}

      {isMultisigProposalModalVisible && (
        <MultisigProposalModal
          isVisible={isMultisigProposalModalVisible}
          handleClose={() => setMultisigProposalModalVisible(false)}
          isBusy={isBusy}
          proposer={publicKey ? publicKey.toBase58() : ''}
          appsProvider={appsProvider}
          solanaApps={solanaApps.filter(app => app.active)}
          handleOk={(params: CreateNewProposalParams) => onAcceptCreateProposalModal(params)}
          selectedMultisig={selectedMultisig}
        />
      )}

      <PreFooter />
    </>
  );
};
