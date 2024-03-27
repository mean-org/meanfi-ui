import { ReloadOutlined } from '@ant-design/icons';
import {
  DEFAULT_EXPIRATION_TIME_SECONDS,
  getFees,
  MeanMultisig,
  MultisigTransactionFees,
  MULTISIG_ACTIONS,
} from '@mean-dao/mean-multisig-sdk';
import {
  calculateFeesForAction,
  Category,
  PaymentStreaming,
  ACTION_CODES,
  Stream,
  StreamTemplate,
  TransactionFees,
  PaymentStreamingAccount,
  AccountType,
  AccountActivity,
  CreateVestingAccountTransactionAccounts,
  CloseAccountTransactionAccounts,
  AddFundsToAccountTransactionAccounts,
  AllocateFundsToStreamTransactionAccounts,
  CreateVestingStreamTransactionAccounts,
  WithdrawFromAccountTransactionAccounts,
  RefreshAccountDataTransactionAccounts,
  UpdateVestingTemplateTransactionAccounts,
  NATIVE_SOL_MINT,
} from '@mean-dao/payment-streaming';
import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { Alert, Button, Dropdown, notification, Space, Tabs, Tooltip } from 'antd';
import { ItemType } from 'antd/lib/menu/hooks/useItems';
import { segmentAnalytics } from 'App';
import BigNumber from 'bignumber.js';
import { AddressDisplay } from 'components/AddressDisplay';
import { AppSocialLinks } from 'components/AppSocialLinks';
import { openNotification } from 'components/Notifications';
import {
  HALF_MINUTE_REFRESH_TIMEOUT,
  MEANFI_DOCS_URL,
  MIN_SOL_BALANCE_REQUIRED,
  MULTISIG_ROUTE_BASE_PATH,
  NO_FEES,
  SOLANA_EXPLORER_URI_INSPECT_ADDRESS,
  VESTING_ROUTE_BASE_PATH,
  WRAPPED_SOL_MINT_ADDRESS,
} from 'constants/common';
import { NATIVE_SOL } from 'constants/tokens';
import { useNativeAccount } from 'contexts/accounts';
import { AppStateContext } from 'contexts/appstate';
import { getSolanaExplorerClusterParam, useConnectionConfig } from 'contexts/connection';
import { confirmationEvents, TxConfirmationContext, TxConfirmationInfo } from 'contexts/transaction-status';
import { useWallet } from 'contexts/wallet';
import useTransaction from 'hooks/useTransaction';
import useWindowSize from 'hooks/useWindowResize';
import { IconArrowBack, IconLoading, IconVerticalEllipsis } from 'Icons';
import { appConfig, customLogger } from 'index';
import { getTokenAccountBalanceByAddress, getTokensWithBalances } from 'middleware/accounts';
import { saveAppData } from 'middleware/appPersistedData';
import { SOL_MINT } from 'middleware/ids';
import {
  AppUsageEvent,
  SegmentRefreshAccountBalanceData,
  SegmentStreamAddFundsData,
  SegmentStreamCreateData,
  SegmentVestingContractCloseData,
  SegmentVestingContractCreateData,
  SegmentVestingContractWithdrawData,
} from 'middleware/segment-service';
import {
  ComputeBudgetConfig,
  DEFAULT_BUDGET_CONFIG,
  composeTxWithPrioritizationFees,
  getProposalWithPrioritizationFees,
  sendTx,
  signTx,
} from 'middleware/transactions';
import {
  consoleOut,
  delay,
  getDurationUnitFromSeconds,
  getReadableDate,
  getTransactionStatusForLogs,
  isValidAddress,
  toTimestamp,
  toUsCurrency,
} from 'middleware/ui';
import {
  findATokenAddress,
  formatThousands,
  getAmountFromLamports,
  getAmountWithSymbol,
  getTokenOrCustomToken,
  getTxIxResume,
  toUiAmount,
} from 'middleware/utils';
import { MetaInfoCtaAction, SocialMediaEntry } from 'models/accounts/AccountsPageUi';
import { MetaInfoCta } from 'models/common-types';
import { EventType, OperationType, PaymentRateType, TransactionStatus } from 'models/enums';
import { ZERO_FEES } from 'models/multisig';
import { TokenInfo } from 'models/SolanaTokenInfo';
import { TreasuryWithdrawParams, UserTreasuriesSummary } from 'models/treasuries';
import {
  AddFundsParams,
  CreateVestingStreamParams,
  CreateVestingTreasuryParams,
  getCategoryLabelByValue,
  VestingContractCreateOptions,
  VestingContractEditOptions,
  VestingContractEditParams,
  VestingContractStreamCreateOptions,
  VestingContractTopupParams,
  VestingContractWithdrawOptions,
  VestingFlowRateInfo,
  vestingFlowRatesCache,
} from 'models/vesting';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { isMobile } from 'react-device-detect';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { VestingContractActivity } from './components/VestingContractActivity';
import { VestingContractAddFundsModal } from './components/VestingContractAddFundsModal';
import { VestingContractCloseModal } from './components/VestingContractCloseModal';
import { VestingContractCreateModal } from './components/VestingContractCreateModal';
import { VestingContractCreateStreamModal } from './components/VestingContractCreateStreamModal';
import { VestingContractDetails } from './components/VestingContractDetails';
import { VestingContractEditModal } from './components/VestingContractEditModal';
import { VestingContractList } from './components/VestingContractList';
import { VestingContractOverview } from './components/VestingContractOverview';
import { VestingContractSolBalanceModal } from './components/VestingContractSolBalanceModal';
import { VestingContractStreamList } from './components/VestingContractStreamList';
import { VestingContractWithdrawFundsModal } from './components/VestingContractWithdrawFundsModal';
import './style.scss';
import { objectToJson } from 'services/logger';
import { BN } from '@project-serum/anchor';
import useLocalStorage from 'hooks/useLocalStorage';

export type VestingAccountDetailTab = 'overview' | 'streams' | 'activity' | undefined;
let isWorkflowLocked = false;
const notificationKey = 'updatable';

const VestingView = (props: { appSocialLinks?: SocialMediaEntry[] }) => {
  const { appSocialLinks } = props;
  const {
    priceList,
    splTokenList,
    loadingStreams,
    selectedAccount,
    selectedMultisig,
    multisigAccounts,
    transactionStatus,
    loadingMultisigAccounts,
    previousWalletConnectState,
    setPendingMultisigTxCount,
    setHighLightableStreamId,
    setIsVerifiedRecipient,
    getTokenPriceByAddress,
    setLockPeriodFrequency,
    getTokenByMintAddress,
    setTransactionStatus,
    setLockPeriodAmount,
    setPaymentStartDate,
    refreshTokenBalance,
    setRecipientAddress,
    setSelectedMultisig,
    setFromCoinAmount,
    setSelectedToken,
  } = useContext(AppStateContext);
  const { enqueueTransactionConfirmation } = useContext(TxConfirmationContext);
  const location = useLocation();
  const navigate = useNavigate();
  const connectionConfig = useConnectionConfig();
  const { vestingContract, activeTab } = useParams();
  const { t } = useTranslation('common');
  const { width } = useWindowSize();
  const { publicKey, wallet, connected } = useWallet();
  const { account } = useNativeAccount();
  const [mainFeatureTab, setMainFeatureTab] = useState('summary');
  const [loadingTreasuries, setLoadingTreasuries] = useState(true);
  const [treasuriesLoaded, setTreasuriesLoaded] = useState(false);
  const [treasuryList, setTreasuryList] = useState<PaymentStreamingAccount[]>([]);
  const [loadingTreasuryStreams, setLoadingTreasuryStreams] = useState(false);
  const [signalRefreshTreasuryStreams, setSignalRefreshTreasuryStreams] = useState(false);
  const [treasuryStreams, setTreasuryStreams] = useState<Stream[]>([]);
  // Selected vesting contract
  const [selectedVestingContract, setSelectedVestingContract] = useState<PaymentStreamingAccount | undefined>(
    undefined,
  );
  const [streamTemplate, setStreamTemplate] = useState<StreamTemplate | undefined>(undefined);
  const [isXsDevice, setIsXsDevice] = useState<boolean>(isMobile);
  const [isLgDevice, setIsLgDevice] = useState<boolean>(isMobile);
  const [assetCtas, setAssetCtas] = useState<MetaInfoCta[]>([]);
  // Source token list
  const [selectedList, setSelectedList] = useState<TokenInfo[]>([]);
  const [workingToken, setWorkingToken] = useState<TokenInfo | undefined>(undefined);
  // Balances
  const [nativeBalance, setNativeBalance] = useState(0);
  const [userBalances, setUserBalances] = useState<any>();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [treasuryEffectiveBalance, setTreasuryEffectiveBalance] = useState(0);
  const [balancesSource, setBalancesSource] = useState<string>('');
  // Transactions
  const [isBusy, setIsBusy] = useState(false);
  const [canSubscribe, setCanSubscribe] = useState(true);
  const [transactionFees, setTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [createVestingContractTxFees, setCreateVestingContractTxFees] = useState<TransactionFees>(NO_FEES);
  const [withdrawTransactionFees, setWithdrawTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [multisigTxFees, setMultisigTxFees] = useState<MultisigTransactionFees>(ZERO_FEES);
  const [minRequiredBalance, setMinRequiredBalance] = useState(0);
  const [vestingContractFlowRate, setVestingContractFlowRate] = useState<VestingFlowRateInfo | undefined>(undefined);
  const [loadingVestingContractFlowRate, setLoadingVestingContractFlowRate] = useState(false);
  const [loadingContractActivity, setLoadingContractActivity] = useState(false);
  const [contractActivity, setContractActivity] = useState<AccountActivity[]>([]);
  const [hasMoreContractActivity, setHasMoreContractActivity] = useState<boolean>(true);
  const [availableStreamingBalance, setAvailableStreamingBalance] = useState(new BN(0));
  const [associatedTokenBalance, setAssociatedTokenBalance] = useState(new BN(0));
  const [associatedTokenDecimals, setAssociatedTokenDecimals] = useState(6);
  const [detailsPanelOpen, setDetailsPanelOpen] = useState(false);
  // Stats
  const [streamingAccountsSummary, setStreamingAccountsSummary] = useState<UserTreasuriesSummary | undefined>(
    undefined,
  );
  const [canDisplayMyTvl, setCanDisplayMyTvl] = useState(false);
  const [unallocatedBalance, setUnallocatedBalance] = useState(0);

  /////////////////////////
  //  Setup & Init code  //
  /////////////////////////

  const [transactionPriorityOptions] = useLocalStorage<ComputeBudgetConfig>(
    'transactionPriority',
    DEFAULT_BUDGET_CONFIG,
  );

  const mspV2AddressPK = useMemo(() => new PublicKey(appConfig.getConfig().streamV2ProgramAddress), []);
  const multisigAddressPK = useMemo(() => new PublicKey(appConfig.getConfig().multisigProgramAddress), []);

  // Create and cache the connection
  const connection = useMemo(
    () =>
      new Connection(connectionConfig.endpoint, {
        commitment: 'confirmed',
        disableRetryOnRateLimit: true,
      }),
    [connectionConfig.endpoint],
  );

  const multisigClient = useMemo(() => {
    if (!connection || !publicKey || !connectionConfig.endpoint) {
      return null;
    }

    return new MeanMultisig(connectionConfig.endpoint, publicKey, 'confirmed', multisigAddressPK);
  }, [connection, publicKey, multisigAddressPK, connectionConfig.endpoint]);

  // Create and cache Payment Streaming instance
  const paymentStreaming = useMemo(() => {
    if (publicKey) {
      console.log('New MSP from treasuries');
      return new PaymentStreaming(connection, mspV2AddressPK, 'confirmed');
    }
    return undefined;
  }, [connection, mspV2AddressPK, publicKey]);

  const isMultisigContext = useMemo(() => {
    return !!(publicKey && selectedAccount.isMultisig);
  }, [publicKey, selectedAccount]);

  const selectedVestingContractRef = useRef(selectedVestingContract);
  useEffect(() => {
    selectedVestingContractRef.current = selectedVestingContract;
  }, [selectedVestingContract]);

  /////////////////
  //  Callbacks  //
  /////////////////

  const hasBalanceChanged = () => {
    if (!selectedVestingContract) {
      return false;
    }
    return !associatedTokenBalance.eq(new BN(selectedVestingContract.balance));
  };

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

  const setSuccessStatus = useCallback(() => {
    setIsBusy(false);
    resetTransactionStatus();
  }, [resetTransactionStatus]);

  const getTransactionFees = useCallback(async (action: ACTION_CODES): Promise<TransactionFees> => {
    return calculateFeesForAction(action);
  }, []);

  const logEventHandling = useCallback((item: TxConfirmationInfo) => {
    consoleOut(
      `VestingView -> onTxConfirmed event handled for operation ${OperationType[item.operationType]}`,
      item,
      'crimson',
    );
  }, []);

  const recordTxConfirmation = useCallback((signature: string, operation: OperationType, success = true) => {
    let event: any;
    switch (operation) {
      case OperationType.TreasuryClose:
        event = success ? AppUsageEvent.VestingContractCloseCompleted : AppUsageEvent.VestingContractCloseFailed;
        segmentAnalytics.recordEvent(event, { signature: signature });
        break;
      case OperationType.TreasuryAddFunds:
        event = success ? AppUsageEvent.VestingContractTopupCompleted : AppUsageEvent.VestingContractTopupFailed;
        segmentAnalytics.recordEvent(event, { signature: signature });
        break;
      case OperationType.TreasuryCreate:
        event = success ? AppUsageEvent.VestingContractCreateCompleted : AppUsageEvent.VestingContractCreateFailed;
        segmentAnalytics.recordEvent(event, { signature: signature });
        break;
      case OperationType.TreasuryEdit:
        event = success ? AppUsageEvent.VestingContractEditCompleted : AppUsageEvent.VestingContractEditFailed;
        segmentAnalytics.recordEvent(event, { signature: signature });
        break;
      case OperationType.TreasuryStreamCreate:
        event = success ? AppUsageEvent.StreamCreateCompleted : AppUsageEvent.StreamCreateFailed;
        segmentAnalytics.recordEvent(event, { signature: signature });
        break;
      case OperationType.StreamPause:
      case OperationType.StreamResume:
        event = success ? AppUsageEvent.StreamStatusChangeCompleted : AppUsageEvent.StreamStatusChangeFailed;
        segmentAnalytics.recordEvent(event, { signature: signature });
        break;
      case OperationType.TreasuryWithdraw:
        event = success
          ? AppUsageEvent.VestingContractWithdrawFundsCompleted
          : AppUsageEvent.VestingContractWithdrawFundsFailed;
        segmentAnalytics.recordEvent(event, { signature: signature });
        break;
      case OperationType.TreasuryRefreshBalance:
        event = success ? AppUsageEvent.RefreshAccountBalanceCompleted : AppUsageEvent.RefreshAccountBalanceFailed;
        segmentAnalytics.recordEvent(event, { signature: signature });
        break;
      case OperationType.StreamClose:
        event = success ? AppUsageEvent.StreamCloseCompleted : AppUsageEvent.StreamCloseFailed;
        segmentAnalytics.recordEvent(event, { signature: signature });
        break;
      default:
        break;
    }
  }, []);

  const notifyMultisigVestingContractActionFollowup = useCallback(
    async (message1: string, message2: string, item: TxConfirmationInfo) => {
      if (!item?.extras?.multisigId) {
        isWorkflowLocked = false;
        return;
      }

      const openFinalNotification = () => {
        const btn = (
          <Button
            type="primary"
            size="small"
            shape="round"
            className="extra-small"
            onClick={() => {
              notification.close(notificationKey);
              isWorkflowLocked = false;
              const url = `${MULTISIG_ROUTE_BASE_PATH}?v=proposals`;
              navigate(url);
            }}
          >
            See proposals
          </Button>
        );
        notification.open({
          type: 'info',
          message: <span></span>,
          description: (
            <div className="mb-1">The proposal's status can be reviewed in the Multsig Safe's proposal list.</div>
          ),
          btn,
          key: notificationKey,
          duration: 20,
          placement: 'topRight',
          top: 110,
          onClose: () => (isWorkflowLocked = false),
        });
      };

      await delay(item.completedMessageTimeout ? item.completedMessageTimeout * 1000 : 5000);
      notification.open({
        type: 'info',
        message: <span></span>,
        description: <span>{message1}</span>,
        key: notificationKey,
        duration: 8,
        placement: 'topRight',
        top: 110,
        onClose: () => {
          notification.open({
            type: 'info',
            message: <span></span>,
            description: <span>{message2}</span>,
            key: notificationKey,
            duration: 8,
            placement: 'topRight',
            top: 110,
            onClose: openFinalNotification,
          });
        },
      });
    },
    [navigate],
  );

  // Setup event handler for Tx confirmed
  const onTxConfirmed = useCallback(
    (item: TxConfirmationInfo) => {
      const path = window.location.pathname;
      if (!path.startsWith(VESTING_ROUTE_BASE_PATH)) {
        return;
      }

      const softReloadContracts = () => {
        const contractsRefreshCta = document.getElementById('soft-refresh-contracts-cta');
        if (contractsRefreshCta) {
          contractsRefreshCta.click();
        } else {
          console.log('element not found:', '#soft-refresh-contracts-cta', 'red');
        }
      };

      const hardReloadContracts = () => {
        const contractsRefreshCta = document.getElementById('hard-refresh-contracts-cta');
        if (contractsRefreshCta) {
          contractsRefreshCta.click();
        } else {
          console.log('element not found:', '#hard-refresh-contracts-cta', 'red');
        }
      };

      switch (item.operationType) {
        case OperationType.TreasuryAddFunds:
          logEventHandling(item);
          recordTxConfirmation(item.signature, item.operationType, true);
          if (!isWorkflowLocked) {
            isWorkflowLocked = true;
            notifyMultisigVestingContractActionFollowup(
              'To complete the funding, the other Multisig owners need to approve the proposal.',
              'After the proposal has been approved and executed, the streaming account will be funded.',
              item,
            );
          }
          setTimeout(() => {
            hardReloadContracts();
          }, 20);
          break;
        case OperationType.TreasuryRefreshBalance:
        case OperationType.StreamAddFunds:
        case OperationType.StreamPause:
        case OperationType.StreamResume:
          logEventHandling(item);
          recordTxConfirmation(item.signature, item.operationType, true);
          softReloadContracts();
          break;
        case OperationType.TreasuryClose:
          logEventHandling(item);
          recordTxConfirmation(item.signature, item.operationType, true);
          if (!isWorkflowLocked) {
            isWorkflowLocked = true;
            notifyMultisigVestingContractActionFollowup(
              'To close the vesting contract, the other Multisig owners need to approve the proposal.',
              'After the proposal has been approved and executed, the contract will be closed and all remaining funds will be sent to the treasurer.',
              item,
            );
          }
          setTimeout(() => {
            hardReloadContracts();
          }, 20);
          break;
        case OperationType.TreasuryCreate:
          logEventHandling(item);
          recordTxConfirmation(item.signature, item.operationType, true);
          if (!isWorkflowLocked) {
            isWorkflowLocked = true;
            notifyMultisigVestingContractActionFollowup(
              'To complete the vesting contract setup, the other Multisig owners need to approve the proposal.',
              'After the proposal has been approved and executed, you will then be able to create vesting streams within the contract.',
              item,
            );
          }
          setTimeout(() => {
            hardReloadContracts();
          }, 20);
          break;
        case OperationType.TreasuryEdit:
          logEventHandling(item);
          recordTxConfirmation(item.signature, item.operationType, true);
          if (!isWorkflowLocked) {
            isWorkflowLocked = true;
            notifyMultisigVestingContractActionFollowup(
              'To complete the vesting contract update, the other Multisig owners need to approve the proposal.',
              'After the proposal has been approved and executed, the vesting contract will be updated.',
              item,
            );
          }
          setTimeout(() => {
            hardReloadContracts();
          }, 20);
          break;
        case OperationType.StreamClose:
          logEventHandling(item);
          recordTxConfirmation(item.signature, item.operationType, true);
          if (!isWorkflowLocked) {
            isWorkflowLocked = true;
            notifyMultisigVestingContractActionFollowup(
              'To close the vesting stream, the other Multisig owners need to approve the proposal.',
              'After the proposal has been approved and executed, the vesting stream will be closed.',
              item,
            );
          }
          setTimeout(() => {
            softReloadContracts();
          }, 20);
          break;
        case OperationType.TreasuryStreamCreate:
          logEventHandling(item);
          recordTxConfirmation(item.signature, item.operationType, true);
          if (!isWorkflowLocked) {
            isWorkflowLocked = true;
            notifyMultisigVestingContractActionFollowup(
              'To complete the vesting stream set up, the other Multisig owners need to approve the proposal.',
              'After the proposal has been approved and executed, the vesting stream will be scheduled.',
              item,
            );
          }
          setTimeout(() => {
            softReloadContracts();
          }, 20);
          break;
        case OperationType.TreasuryWithdraw:
          logEventHandling(item);
          recordTxConfirmation(item.signature, item.operationType, true);
          if (!isWorkflowLocked) {
            isWorkflowLocked = true;
            notifyMultisigVestingContractActionFollowup(
              'To complete the unallocated vesting funds withdrawal, the other Multisig owners need to approve the proposal.',
              'After the proposal has been approved and executed, the vesting funds will be sent to the address specified.',
              item,
            );
          }
          setTimeout(() => {
            hardReloadContracts();
          }, 20);
          break;
        default:
          break;
      }
    },
    [logEventHandling, notifyMultisigVestingContractActionFollowup, recordTxConfirmation],
  );

  // Setup event handler for Tx confirmation error
  const onTxTimedout = useCallback(
    (item: TxConfirmationInfo) => {
      const hardReloadContracts = () => {
        const contractsRefreshCta = document.getElementById('hard-refresh-contracts-cta');
        if (contractsRefreshCta) {
          contractsRefreshCta.click();
        }
      };

      if (item) {
        consoleOut('onTxTimedout event executed:', item, 'crimson');
        recordTxConfirmation(item.signature, item.operationType, false);
        if (item.operationType === OperationType.TreasuryCreate) {
          openNotification({
            title: 'Create vesting contract status',
            description:
              'The transaction to create the vesting contract was not confirmed within 40 seconds. Solana may be congested right now. This page needs to be reloaded to verify the contract was successfully created.',
            duration: null,
            type: 'info',
            handleClose: () => hardReloadContracts(),
          });
        }
        if (item.operationType === OperationType.TreasuryEdit) {
          openNotification({
            title: 'Update vesting contract status',
            description:
              'The transaction to update the vesting contract was not confirmed within 40 seconds. Solana may be congested right now. This page needs to be reloaded to verify the contract was successfully updated.',
            duration: null,
            type: 'info',
            handleClose: () => hardReloadContracts(),
          });
        }
      }
    },
    [recordTxConfirmation],
  );

  const canPerformAnyAction = useCallback(() => {
    const itsMe = !!(selectedAccount && publicKey && publicKey.toBase58() === selectedAccount.address);
    return !!(itsMe || isMultisigContext);
  }, [selectedAccount, isMultisigContext, publicKey]);

  const navigateToContracts = useCallback(() => {
    setDetailsPanelOpen(false);
    const url = `${VESTING_ROUTE_BASE_PATH}/contracts`;
    navigate(url);
  }, [navigate]);

  const navigateToVestingContract = useCallback(
    (contractId: string) => {
      if (contractId) {
        let url = `${VESTING_ROUTE_BASE_PATH}/${contractId}`;
        if (activeTab) {
          url += `/${activeTab}`;
        }
        consoleOut('Navigating to contract:', url, 'orange');
        // /vesting/:vestingContract/:activeTab
        navigate(url);
      }
    },
    [activeTab, navigate],
  );

  const getContractFinishDate = useCallback(() => {
    if (streamTemplate) {
      // Payment start date
      const startDate = streamTemplate.startUtc;
      const periodUnits = streamTemplate.durationNumberOfUnits;
      const periodAmount = streamTemplate.rateIntervalInSeconds;
      // Start date timestamp
      const sdTimestamp = toTimestamp(startDate.toString());
      // Total length of vesting period in seconds
      const lockPeriod = periodAmount * periodUnits;
      // Final date = Start date + lockPeriod
      const finishDate = new Date((sdTimestamp + lockPeriod) * 1000);
      return finishDate;
    }
    return null;
  }, [streamTemplate]);

  const isContractRunning = useCallback((): boolean => {
    if (streamTemplate) {
      const now = new Date();
      const startDate = new Date(streamTemplate.startUtc);
      const finishDate = getContractFinishDate();
      const hastStarted = now > startDate;
      const hasFinished = !!(finishDate && finishDate > now);

      return !!(hastStarted && !hasFinished);
    }
    return false;
  }, [getContractFinishDate, streamTemplate]);

  const onSelectVestingContract = useCallback(
    (item: PaymentStreamingAccount | undefined) => {
      if (selectedAccount.address && item) {
        navigateToVestingContract(item.id.toString());
      }
    },
    [selectedAccount.address, navigateToVestingContract],
  );

  const getAllUserV2Accounts = useCallback(
    async (account: string) => {
      if (!paymentStreaming) {
        return [];
      }

      setTimeout(() => {
        setLoadingTreasuries(true);
      });

      const pk = new PublicKey(account);

      return paymentStreaming.listAccounts(pk, true, Category.vesting);
    },
    [paymentStreaming],
  );

  const refreshVestingContracts = useCallback(
    (reset = false) => {
      if (!connection || !publicKey || !paymentStreaming || !selectedAccount.address) {
        return;
      }

      // Before fetching the list of vesting contracts, clear the cache of flow rates
      vestingFlowRatesCache.clear();

      getAllUserV2Accounts(selectedAccount.address)
        .then(contracts => {
          consoleOut('Vesting contracts:', contracts, 'blue');
          setTreasuryList(
            contracts.map(vc => {
              return { ...vc, name: vc.name.trim() };
            }),
          );
        })
        .catch(error => {
          console.error(error);
        })
        .finally(() => {
          setLoadingTreasuries(false);
          setTreasuriesLoaded(true);
        });
    },
    [selectedAccount.address, connection, getAllUserV2Accounts, paymentStreaming, publicKey],
  );

  const getTreasuryStreams = useCallback(
    (treasuryPk: PublicKey) => {
      if (!publicKey || !paymentStreaming || loadingTreasuryStreams) {
        return;
      }

      setTimeout(() => {
        setLoadingTreasuryStreams(true);
      });

      consoleOut('Executing getTreasuryStreams...', '', 'blue');

      paymentStreaming
        .listStreams({ psAccount: treasuryPk })
        .then(streams => {
          consoleOut('treasuryStreams:', streams, 'blue');
          setTreasuryStreams(
            streams.map(vc => {
              return { ...vc, name: vc.name.trim() };
            }),
          );
        })
        .catch((err: any) => {
          console.error(err);
          setTreasuryStreams([]);
        })
        .finally(() => {
          setLoadingTreasuryStreams(false);
        });
    },
    [paymentStreaming, publicKey, loadingTreasuryStreams],
  );

  const getMultisigIdFromContext = useCallback(() => {
    if (!multisigAccounts || !selectedMultisig || !selectedAccount.address) {
      return '';
    }

    if (isMultisigContext) {
      const multisig = multisigAccounts.find(t => t.authority.toBase58() === selectedAccount.address);
      if (multisig) {
        return multisig.authority.toBase58();
      }
    }

    return '';
  }, [selectedAccount.address, isMultisigContext, multisigAccounts, selectedMultisig]);

  const getContractActivity = useCallback(
    (streamId: string, clearHistory = false) => {
      if (!streamId || !paymentStreaming || loadingContractActivity) {
        return;
      }

      consoleOut('Loading stream activity...', '', 'crimson');

      setLoadingContractActivity(true);
      const streamPublicKey = new PublicKey(streamId);
      const lastActivity = contractActivity.length > 0 ? contractActivity[contractActivity.length - 1].signature : '';
      const before = clearHistory ? '' : lastActivity;
      consoleOut('before:', before, 'crimson');
      paymentStreaming
        .listAccountActivity(streamPublicKey, before, 5, 'confirmed')
        .then(value => {
          consoleOut('VC Activity:', value);
          const currentActivity = contractActivity.length > 0 ? JSON.parse(JSON.stringify(contractActivity)) : [];
          const activities = clearHistory ? [] : currentActivity;

          if (value && value.length > 0) {
            activities.push(...value);
            setHasMoreContractActivity(true);
          } else {
            setHasMoreContractActivity(false);
          }
          setContractActivity(activities);
        })
        .catch(err => {
          console.error(err);
          setContractActivity([]);
          setHasMoreContractActivity(false);
        })
        .finally(() => setLoadingContractActivity(false));
    },
    [loadingContractActivity, paymentStreaming, contractActivity],
  );

  const clearFormValues = useCallback(() => {
    setIsVerifiedRecipient(false);
    const today = new Date().toLocaleDateString('en-US');
    setLockPeriodFrequency(PaymentRateType.PerMonth);
    setPaymentStartDate(today);
    setRecipientAddress('');
    setLockPeriodAmount('');
    setFromCoinAmount('');
  }, [
    setFromCoinAmount,
    setLockPeriodAmount,
    setPaymentStartDate,
    setRecipientAddress,
    setIsVerifiedRecipient,
    setLockPeriodFrequency,
  ]);

  const isStartDateGone = useCallback((date: string): boolean => {
    const now = new Date().toUTCString();
    const nowUtc = new Date(now);
    const comparedDate = new Date(date);
    if (comparedDate < nowUtc) {
      return true;
    }
    return false;
  }, []);

  const isContractLocked = useCallback(() => {
    if (!publicKey || !selectedVestingContract || !streamTemplate) {
      return true;
    }
    return isStartDateGone(streamTemplate.startUtc.toString());
  }, [isStartDateGone, publicKey, selectedVestingContract, streamTemplate]);

  const getUnallocatedBalance = useCallback((details: PaymentStreamingAccount) => {
    const balance = new BN(details.balance);
    const allocationAssigned = new BN(details.allocationAssigned);
    return balance.sub(allocationAssigned);
  }, []);

  const getTreasuryUnallocatedBalance = useCallback(
    (tsry: PaymentStreamingAccount, assToken: TokenInfo | undefined) => {
      if (tsry) {
        const decimals = assToken ? assToken.decimals : 9;
        const unallocated = getUnallocatedBalance(tsry);
        const ub = new BigNumber(toUiAmount(unallocated, decimals)).toNumber();
        return ub;
      }
      return 0;
    },
    [getUnallocatedBalance],
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
      const associatedToken = treasury.mint.toBase58();
      resume['lockedAmount'] += 1;
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

    return resume;
  }, [treasuryList, getTokenByMintAddress, getTokenPriceByAddress, getTreasuryUnallocatedBalance]);

  //////////////
  //  Modals  //
  //////////////

  // Create vesting contract modal
  const [isVestingContractCreateModalVisible, setIsVestingContractCreateModalVisibility] = useState(false);
  const showVestingContractCreateModal = useCallback(() => {
    if (!workingToken) {
      setWorkingToken(selectedList[0]);
    }
    setIsVestingContractCreateModalVisibility(true);
  }, [selectedList, workingToken]);
  const closeVestingContractCreateModal = useCallback(() => setIsVestingContractCreateModalVisibility(false), []);

  // Edit vesting contract settings
  const [isEditContractSettingsModalOpen, setIsEditContractSettingsModalOpen] = useState(false);
  const hideEditContractSettingsModal = useCallback(() => setIsEditContractSettingsModalOpen(false), []);
  const showEditContractSettingsModal = useCallback(() => setIsEditContractSettingsModalOpen(true), []);

  const onVestingContractCreatedOrUpdated = useCallback(() => {
    closeVestingContractCreateModal();
    hideEditContractSettingsModal();
    refreshTokenBalance();
    clearFormValues();
  }, [clearFormValues, hideEditContractSettingsModal, closeVestingContractCreateModal, refreshTokenBalance]);

  const onExecuteCreateVestingContractTransaction = useCallback(
    async (createOptions: VestingContractCreateOptions) => {
      let transaction: VersionedTransaction | Transaction | null = null;
      let signature: any;
      let encodedTx: string;
      let transactionLog: any[] = [];
      let generatedVestingContractId = '';

      resetTransactionStatus();
      setIsBusy(true);

      const createTreasury = async (data: CreateVestingTreasuryParams) => {
        if (!connection || !paymentStreaming || !publicKey) {
          return null;
        }

        const solFeePayedByTreasury = !!data.multisig;

        if (!data.multisig) {
          consoleOut('received data:', data, 'blue');
          const accounts: CreateVestingAccountTransactionAccounts = {
            feePayer: new PublicKey(data.treasurer), // payer
            owner: new PublicKey(data.treasurer), // treasurer
            mint: new PublicKey(data.associatedTokenAddress), // mint
          };
          const { transaction, template, vestingAccount } = await paymentStreaming.buildCreateVestingAccountTransaction(
            accounts, // accounts
            data.label, // label
            data.type, // type
            solFeePayedByTreasury, // solFeePayedByTreasury
            data.duration, // numberOfIntervals
            data.durationUnit, // intervalUnit
            data.fundingAmount, // fundingAmount
            data.vestingCategory, // vestingCategory
            data.startUtc, // startUtc
            data.cliffVestPercent, // cliffVestPercent
            data.tokenFeePayedFromAccount, // tokenFeePayedFromAccount
          );

          const prioritizedTx = await composeTxWithPrioritizationFees(connection, publicKey, transaction.instructions);

          return { transaction: prioritizedTx, template, vestingAccount };
        }

        if (!multisigClient || !multisigAccounts) {
          return null;
        }

        const multisig = multisigAccounts.find(m => m.authority.toBase58() === data.multisig);

        if (!multisig) {
          return null;
        }

        const treasuryAssociatedTokenMint = new PublicKey(data.associatedTokenAddress);
        const accounts: CreateVestingAccountTransactionAccounts = {
          feePayer: multisig.authority, // payer
          owner: multisig.authority, // treasurer
          mint: treasuryAssociatedTokenMint, // mint
        };
        const createVestingContractTx = await paymentStreaming.buildCreateVestingAccountTransaction(
          accounts, // accounts
          data.label, // label
          data.type, // type
          solFeePayedByTreasury, // solFeePayedByTreasury
          data.duration, // numberOfIntervals
          data.durationUnit, // intervalUnit
          data.fundingAmount, // fundingAmount
          data.vestingCategory, // vestingCategory
          data.startUtc, // startUtc
          data.cliffVestPercent, // cliffVestPercent
          data.tokenFeePayedFromAccount, // tokenFeePayedFromAccount
        );

        const ixData = Buffer.from(createVestingContractTx.transaction.instructions[0].data);
        const ixAccounts = createVestingContractTx.transaction.instructions[0].keys;
        const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());
        const titleProposal = createOptions.vestingContractTitle;

        const tx = await getProposalWithPrioritizationFees(
          {
            multisigClient,
            connection,
            transactionPriorityOptions,
          },
          publicKey,
          titleProposal === '' ? 'Create Vesting Contract' : titleProposal,
          '', // description
          new Date(expirationTime * 1_000),
          OperationType.TreasuryCreate,
          multisig.id,
          mspV2AddressPK, // program
          ixAccounts, // keys o accounts of the Ix
          ixData,
        );

        if (!tx) {
          return null;
        }

        return {
          transaction: tx.transaction,
          vestingAccount: createVestingContractTx.vestingAccount,
        };
      };

      const createTx = async () => {
        if (!connection || !wallet || !publicKey || !paymentStreaming) {
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
            result: 'Cannot start transaction! Wallet not found!',
          });
          customLogger.logError('Create vesting account transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }

        consoleOut('Start transaction for Create vesting account', '', 'blue');
        consoleOut('Wallet address:', publicKey.toBase58());

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        const multisigAuthority = getMultisigIdFromContext();
        const associatedToken = createOptions.token;
        const price = workingToken ? getTokenPriceByAddress(workingToken.address, workingToken.symbol) : 0;

        consoleOut('workingToken:', workingToken, 'blue');

        const payload: CreateVestingTreasuryParams = {
          payer: publicKey, // payer
          treasurer: publicKey, // treasurer
          label: createOptions.vestingContractName, // label
          type: createOptions.vestingContractType, // type
          duration: createOptions.duration, // duration
          durationUnit: createOptions.durationUnit, // durationUnit
          fundingAmount: createOptions.fundingAmount, // fundingAmount
          associatedTokenAddress: associatedToken.address, // treasuryAssociatedTokenMint
          cliffVestPercent: createOptions.cliffVestPercent, // cliffVestPercent
          vestingCategory: createOptions.vestingCategory, // vestingCategory
          startUtc: createOptions.startDate, // startUtc
          multisig: multisigAuthority, // multisig
          tokenFeePayedFromAccount: createOptions.feePayedByTreasurer, // feePayedByTreasurer
        };
        consoleOut('payload:', payload);

        // Report event to Segment analytics
        const segmentData: SegmentVestingContractCreateData = {
          asset: associatedToken.address,
          assetPrice: price,
          valueInUsd: parseFloat(createOptions.amount) * price,
          fundingAmount: parseFloat(createOptions.amount),
          contractName: createOptions.vestingContractName,
          subCategory: getCategoryLabelByValue(createOptions.vestingCategory),
          cliffVestPercent: createOptions.cliffVestPercent,
          duration: createOptions.duration,
          durationUnit: getDurationUnitFromSeconds(createOptions.durationUnit, t),
          feePayedByTreasurer: createOptions.feePayedByTreasurer,
          multisig: multisigAuthority,
          startUtc: getReadableDate(createOptions.startDate.toUTCString()),
          type: AccountType[createOptions.vestingContractType],
        };
        consoleOut('segment data:', segmentData, 'blue');
        segmentAnalytics.recordEvent(AppUsageEvent.StreamCreateFormButton, segmentData);

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

        const bf = transactionFees.blockchainFee; // Blockchain fee
        const ff = transactionFees.mspFlatFee; // Flat fee (protocol)
        const mp = multisigTxFees.networkFee + multisigTxFees.multisigFee + multisigTxFees.rentExempt; // Multisig proposal
        const minRequired = multisigAuthority ? mp : bf + ff;

        setMinRequiredBalance(minRequired);

        consoleOut('Min balance required:', minRequired, 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');

        if (nativeBalance < minRequired) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${getAmountWithSymbol(
              nativeBalance,
              SOL_MINT.toBase58(),
            )}) to pay for network fees (${getAmountWithSymbol(minRequired, SOL_MINT.toBase58())})`,
          });
          customLogger.logError('Create vesting account transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }

        consoleOut('Starting Create vesting account using MSP V2...', '', 'blue');

        const result = await createTreasury(payload)
          .then(value => {
            // TODO: Log the error
            if (!value) {
              return false;
            }
            consoleOut('Create vesting account returned transaction:', value);
            setTransactionStatus({
              lastOperation: TransactionStatus.InitTransactionSuccess,
              currentOperation: TransactionStatus.SignTransaction,
            });
            transaction = value.transaction;
            generatedVestingContractId = value.vestingAccount.toBase58();
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
              result: getTxIxResume(transaction),
            });
            return true;
          })
          .catch(error => {
            console.error('Create vesting account error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`,
            });
            customLogger.logError('Create vesting account transaction failed', {
              transcript: transactionLog,
            });
            return false;
          });

        return result;
      };

      if (wallet && publicKey) {
        const created = await createTx();
        consoleOut('created:', created, 'blue');
        if (created) {
          const sign = await signTx('Create Vesting Contract', wallet, publicKey, transaction);
          if (sign.encodedTransaction) {
            encodedTx = sign.encodedTransaction;
            transactionLog = transactionLog.concat(sign.log);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.SignTransactionSuccess,
            });
            const sent = await sendTx('Create Vesting Contract', connection, encodedTx);
            consoleOut('sent:', sent);
            if (sent.signature) {
              signature = sent.signature;
              consoleOut('Send Tx to confirmation queue:', signature);
              const extraAmountMessage = createOptions.amount
                ? ` with ${formatThousands(parseFloat(createOptions.amount), createOptions.token.decimals)} ${
                    createOptions.token.symbol
                  }`
                : '';
              const loadingMessage = isMultisigContext
                ? `Send proposal to create the vesting contract ${createOptions.vestingContractName}`
                : `Create vesting contract ${createOptions.vestingContractName}${extraAmountMessage}`;
              const completedMessage = isMultisigContext
                ? `Proposal to create the vesting contract ${createOptions.vestingContractName} was submitted for Multisig approval.`
                : `Vesting contract ${createOptions.vestingContractName} created successfully`;
              enqueueTransactionConfirmation({
                signature,
                operationType: OperationType.TreasuryCreate,
                finality: 'confirmed',
                txInfoFetchStatus: 'fetching',
                loadingTitle: 'Confirming transaction',
                loadingMessage,
                completedTitle: 'Transaction confirmed',
                completedMessage,
                completedMessageTimeout: isMultisigContext ? 8 : 5,
                extras: {
                  vestingContractId: generatedVestingContractId,
                  multisigId: createOptions.multisig,
                },
              });
              setSuccessStatus();
              onVestingContractCreatedOrUpdated();
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
      workingToken,
      nativeBalance,
      multisigTxFees,
      multisigClient,
      mspV2AddressPK,
      paymentStreaming,
      multisigAccounts,
      isMultisigContext,
      transactionPriorityOptions,
      transactionFees.mspFlatFee,
      transactionFees.blockchainFee,
      transactionStatus.currentOperation,
      enqueueTransactionConfirmation,
      onVestingContractCreatedOrUpdated,
      setFailureStatusAndNotify,
      getMultisigIdFromContext,
      getTokenPriceByAddress,
      resetTransactionStatus,
      setTransactionStatus,
      setSuccessStatus,
      t,
    ],
  );

  const onAcceptCreateVestingContract = useCallback(
    (data: VestingContractCreateOptions) => {
      consoleOut('Create vesting contract options:', data, 'blue');
      onExecuteCreateVestingContractTransaction(data);
    },
    [onExecuteCreateVestingContractTransaction],
  );

  // Vesting contract SOL balance modal
  const [isVestingContractSolBalanceModalOpen, setIsVestingContractSolBalanceModalOpen] = useState(false);
  const hideVestingContractSolBalanceModal = useCallback(() => setIsVestingContractSolBalanceModalOpen(false), []);
  const showVestingContractSolBalanceModal = useCallback(() => setIsVestingContractSolBalanceModalOpen(true), []);

  // Vesting contract close modal
  const [isVestingContractCloseModalOpen, setIsVestingContractCloseModalOpen] = useState(false);
  const hideVestingContractCloseModal = useCallback(() => setIsVestingContractCloseModalOpen(false), []);
  const showVestingContractCloseModal = useCallback(() => {
    setIsBusy(false);
    resetTransactionStatus();
    getTransactionFees(ACTION_CODES.CloseAccount).then(value => {
      setTransactionFees(value);
      consoleOut('transactionFees:', value, 'orange');
    });
    setIsVestingContractCloseModalOpen(true);
  }, [getTransactionFees, resetTransactionStatus]);

  const onAcceptCloseVestingContractModal = (title: string) => {
    consoleOut('proposalTitle:', title, 'orange');
    onExecuteCloseTreasuryTransaction(title);
  };

  const onCloseTreasuryTransactionFinished = () => {
    hideVestingContractCloseModal();
    refreshTokenBalance();
  };

  const onExecuteCloseTreasuryTransaction = async (proposalTitle: string) => {
    let transaction: VersionedTransaction | Transaction | null = null;
    let signature: any;
    let encodedTx: string;
    let multisigAuthority = '';
    let transactionLog: any[] = [];

    resetTransactionStatus();
    setIsBusy(true);

    const closeTreasury = async (data: any) => {
      if (!publicKey || !paymentStreaming) {
        return null;
      }

      if (!isMultisigContext) {
        const accounts: CloseAccountTransactionAccounts = {
          feePayer: new PublicKey(data.treasurer), // feePayer
          destination: new PublicKey(data.treasurer), // destination
          psAccount: new PublicKey(data.treasury), // psAccount
        };
        const { transaction } = await paymentStreaming.buildCloseAccountTransaction(
          accounts, // accounts
          false, // autoWSol
        );

        return await composeTxWithPrioritizationFees(connection, publicKey, transaction.instructions);
      }

      if (!selectedVestingContract || !multisigClient || !multisigAccounts || !publicKey) {
        return null;
      }

      const treasury = selectedVestingContract;
      const multisig = multisigAccounts.find(m => m.authority.equals(treasury.owner));

      if (!multisig) {
        return null;
      }

      multisigAuthority = multisig.authority.toBase58();

      const accounts: CloseAccountTransactionAccounts = {
        feePayer: multisig.authority, // feePayer
        destination: multisig.authority, // destination
        psAccount: new PublicKey(data.treasury), // psAccount
      };
      const { transaction } = await paymentStreaming.buildCloseAccountTransaction(
        accounts, // accounts
        false, // autoWSol
      );

      const ixData = Buffer.from(transaction.instructions[0].data);
      const ixAccounts = transaction.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await getProposalWithPrioritizationFees(
        {
          multisigClient,
          connection,
          transactionPriorityOptions,
        },
        publicKey,
        data.proposalTitle || 'Close Vesting Contract',
        '', // description
        new Date(expirationTime * 1_000),
        OperationType.TreasuryClose,
        multisig.id,
        mspV2AddressPK,
        ixAccounts,
        ixData,
      );

      return tx?.transaction ?? null;
    };

    const createTx = async (): Promise<boolean> => {
      if (!publicKey || !selectedVestingContract || !paymentStreaming) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('Close Vesting Contract transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction,
      });

      const treasury = selectedVestingContract.id;
      const data = {
        proposalTitle, // proposalTitle
        treasurer: selectedAccount.address, // treasurer
        treasury: treasury.toBase58(), // treasury
      };
      consoleOut('data:', data);

      // Report event to Segment analytics
      const segmentData: SegmentVestingContractCloseData = {
        contractName: selectedVestingContract.name,
        subCategory: getCategoryLabelByValue(selectedVestingContract.subCategory),
        type: AccountType[selectedVestingContract.accountType],
      };
      consoleOut('segment data:', segmentData, 'blue');
      segmentAnalytics.recordEvent(AppUsageEvent.VestingContractCloseFormButton, segmentData);

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

      const bf = transactionFees.blockchainFee; // Blockchain fee
      const ff = transactionFees.mspFlatFee; // Flat fee (protocol)
      const mp = multisigTxFees.networkFee + multisigTxFees.multisigFee + multisigTxFees.rentExempt; // Multisig proposal
      const minRequired = isMultisigContext ? mp : bf + ff;

      setMinRequiredBalance(minRequired);

      consoleOut('Min balance required:', minRequired, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance < minRequired) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${getAmountWithSymbol(
            nativeBalance,
            SOL_MINT.toBase58(),
          )}) to pay for network fees (${getAmountWithSymbol(minRequired, SOL_MINT.toBase58())})`,
        });
        customLogger.logError('Close Vesting Contract transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }

      consoleOut('Starting Close Vesting Contract using MSP V2...', '', 'blue');
      // Create a transaction
      const result = closeTreasury(data)
        .then(value => {
          if (!value) {
            return false;
          }
          consoleOut('closeTreasury returned transaction:', value);
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
          console.error('closeTreasury error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`,
          });
          customLogger.logError('Close Vesting Contract transaction failed', {
            transcript: transactionLog,
          });
          return false;
        });

      return result;
    };

    if (wallet && publicKey && selectedVestingContract) {
      const created = await createTx();
      consoleOut('created:', created, 'blue');
      if (created) {
        const sign = await signTx('Close Vesting Contract', wallet, publicKey, transaction);
        if (sign.encodedTransaction) {
          encodedTx = sign.encodedTransaction;
          transactionLog = transactionLog.concat(sign.log);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionSuccess,
          });
          const sent = await sendTx('Close Vesting Contract', connection, encodedTx);
          consoleOut('sent:', sent);
          if (sent.signature) {
            signature = sent.signature;
            consoleOut('Send Tx to confirmation queue:', signature);
            const loadingMessage = multisigAuthority
              ? `Create proposal to close the vesting contract: ${selectedVestingContract.name}`
              : `Closing vesting contract: ${selectedVestingContract.name}`;
            const completedMessage = multisigAuthority
              ? `Proposal to close the vesting contract ${selectedVestingContract.name} was submitted for Multisig approval.`
              : `Vesting contract ${selectedVestingContract.name} successfully closed`;
            enqueueTransactionConfirmation({
              signature,
              operationType: OperationType.TreasuryClose,
              finality: 'confirmed',
              txInfoFetchStatus: 'fetching',
              loadingTitle: 'Confirming transaction',
              loadingMessage,
              completedTitle: 'Transaction confirmed',
              completedMessage,
              completedMessageTimeout: isMultisigContext ? 8 : 5,
              extras: {
                vestingContractId: selectedVestingContract.id.toBase58(),
                multisigId: multisigAuthority,
              },
            });
            setSuccessStatus();
            onCloseTreasuryTransactionFinished();
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
  };

  // Add funds modal
  const [isAddFundsModalVisible, setIsAddFundsModalVisibility] = useState(false);
  const showAddFundsModal = useCallback(() => {
    resetTransactionStatus();
    setHighLightableStreamId(undefined);
    if (isMultisigContext && selectedMultisig) {
      setBalancesSource(selectedMultisig.authority.toBase58());
    } else {
      setBalancesSource('');
    }
    if (vestingContract) {
      getTransactionFees(ACTION_CODES.AddFundsToAccount).then(value => {
        setTransactionFees(value);
        consoleOut('transactionFees:', value, 'orange');
      });
      getTransactionFees(ACTION_CODES.WithdrawFromStream).then(value => {
        setWithdrawTransactionFees(value);
        consoleOut('withdrawTransactionFees:', value, 'orange');
      });
      setIsAddFundsModalVisibility(true);
    }
  }, [
    getTransactionFees,
    isMultisigContext,
    resetTransactionStatus,
    selectedMultisig,
    setHighLightableStreamId,
    vestingContract,
  ]);

  const onAcceptAddFunds = (params: VestingContractTopupParams) => {
    consoleOut('AddFunds params:', params, 'blue');
    onExecuteAddFundsTransaction(params);
  };

  const closeAddFundsModal = useCallback(() => {
    resetTransactionStatus();
    setIsAddFundsModalVisibility(false);
  }, [resetTransactionStatus]);

  const onExecuteAddFundsTransaction = async (params: VestingContractTopupParams) => {
    let transaction: VersionedTransaction | Transaction | null = null;
    let signature: any;
    let encodedTx: string;
    let multisigAuthority = '';
    let transactionLog: any[] = [];

    resetTransactionStatus();
    setIsBusy(true);

    const addFunds = async (data: AddFundsParams) => {
      if (!publicKey || !paymentStreaming) {
        return null;
      }

      if (!isMultisigContext || !params.fundFromSafe) {
        if (data.stream === '') {
          const accounts: AddFundsToAccountTransactionAccounts = {
            feePayer: new PublicKey(data.payer), // feePayer
            contributor: new PublicKey(data.contributor), // contributor
            psAccount: new PublicKey(data.treasury), // psAccount
            psAccountMint: new PublicKey(data.associatedToken), // psAccountMint
          };
          const { transaction } = await paymentStreaming.buildAddFundsToAccountTransaction(
            accounts, // accounts
            data.amount, // amount
          );

          return await composeTxWithPrioritizationFees(connection, publicKey, transaction.instructions);
        }

        const accounts: AllocateFundsToStreamTransactionAccounts = {
          feePayer: new PublicKey(data.payer), // payer
          psAccount: new PublicKey(data.treasury), // psAccount
          owner: new PublicKey(data.contributor), // owner
          stream: new PublicKey(data.stream), // stream
        };
        const { transaction } = await paymentStreaming.buildAllocateFundsToStreamTransaction(
          accounts, // accounts
          data.amount, // amount
        );

        return await composeTxWithPrioritizationFees(connection, publicKey, transaction.instructions);
      }

      if (!selectedVestingContract || !multisigClient || !multisigAccounts || !publicKey) {
        return null;
      }

      const treasury = selectedVestingContract;
      const multisig = multisigAccounts.find(m => m.authority.equals(treasury.owner));

      if (!multisig) {
        return null;
      }
      multisigAuthority = multisig.authority.toBase58();
      let operationType = OperationType.StreamAddFunds;
      let addFundsTx: Transaction;

      if (data.stream) {
        const accounts: AllocateFundsToStreamTransactionAccounts = {
          feePayer: new PublicKey(data.payer), // payer
          psAccount: new PublicKey(data.treasury), // psAccount
          owner: new PublicKey(multisig.authority), // owner
          stream: new PublicKey(data.stream), // stream
        };
        const { transaction } = await paymentStreaming.buildAllocateFundsToStreamTransaction(
          accounts, // accounts
          data.amount, // amount
        );
        addFundsTx = transaction;
      } else {
        operationType = OperationType.TreasuryAddFunds;
        const accounts: AddFundsToAccountTransactionAccounts = {
          feePayer: new PublicKey(data.payer), // feePayer
          contributor: new PublicKey(data.contributor), // contributor
          psAccount: new PublicKey(data.treasury), // psAccount
          psAccountMint: new PublicKey(data.associatedToken), // psAccountMint
        };
        const { transaction } = await paymentStreaming.buildAddFundsToAccountTransaction(
          accounts, // accounts
          data.amount, // amount
        );
        addFundsTx = transaction;
      }

      consoleOut('Returned multisig Tx:', addFundsTx, 'blue');
      const ixData = Buffer.from(addFundsTx.instructions[0].data);
      const ixAccounts = addFundsTx.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await getProposalWithPrioritizationFees(
        {
          multisigClient,
          connection,
          transactionPriorityOptions,
        },
        publicKey,
        data.proposalTitle ?? 'Add Funds',
        '', // description
        new Date(expirationTime * 1_000),
        operationType,
        multisig.id,
        mspV2AddressPK,
        ixAccounts,
        ixData,
      );

      return tx?.transaction ?? null;
    };

    const createTx = async (): Promise<boolean> => {
      if (!publicKey || !selectedVestingContract || !params || !params.associatedToken || !paymentStreaming) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('PaymentStreamingAccount Add Funds transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }

      consoleOut('Start transaction for treasury addFunds', '', 'blue');
      consoleOut('Wallet address:', publicKey.toBase58());

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction,
      });

      const treasury = selectedVestingContract.id;
      const associatedToken =
        params.associatedToken.address === SOL_MINT.toBase58()
          ? NATIVE_SOL_MINT // imported from SDK
          : new PublicKey(params.associatedToken.address);
      const amount = params.tokenAmount.toString();
      const token = params.associatedToken;
      const price = getTokenPriceByAddress(token.address, token.symbol);
      const contributor = params.contributor ?? publicKey.toBase58();

      const data: AddFundsParams = {
        proposalTitle: params.proposalTitle, // proposalTitle
        payer: contributor, // payer
        contributor, // contributor
        treasury: treasury.toBase58(), // treasury
        associatedToken: associatedToken.toBase58(), // associatedToken
        stream: params.streamId ? params.streamId : '', // stream
        amount, // amount
      };
      consoleOut('data:', data);

      // Report event to Segment analytics
      const segmentData: SegmentStreamAddFundsData = {
        stream: data.stream,
        contributor,
        treasury: data.treasury,
        asset: `${token.symbol} [${token.address}]`,
        assetPrice: price,
        amount: parseFloat(params.amount),
        valueInUsd: price * parseFloat(params.amount),
      };
      consoleOut('segment data:', segmentData, 'blue');
      segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupApproveFormButton, segmentData);

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

      const bf = transactionFees.blockchainFee; // Blockchain fee
      const ff = transactionFees.mspFlatFee; // Flat fee (protocol)
      const mp = multisigTxFees.networkFee + multisigTxFees.multisigFee + multisigTxFees.rentExempt; // Multisig proposal
      const minRequired = isMultisigContext ? mp : bf + ff;

      setMinRequiredBalance(minRequired);

      consoleOut('Min balance required:', minRequired, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance < minRequired) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${getAmountWithSymbol(
            nativeBalance,
            SOL_MINT.toBase58(),
          )}) to pay for network fees (${getAmountWithSymbol(minRequired, SOL_MINT.toBase58())})`,
        });
        customLogger.logError('PaymentStreamingAccount Add Funds transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }

      consoleOut('Starting Add Funds using MSP V2...', '', 'blue');
      // Create a transaction
      const result = await addFunds(data)
        .then(value => {
          if (!value) {
            return false;
          }
          consoleOut('addFunds returned transaction:', value);
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
          console.error('addFunds error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`,
          });
          customLogger.logError('PaymentStreamingAccount Add Funds transaction failed', {
            transcript: transactionLog,
          });
          return false;
        });

      return result;
    };

    if (wallet && publicKey && selectedVestingContract) {
      const created = await createTx();
      consoleOut('created:', created, 'blue');
      if (created) {
        const sign = await signTx('PaymentStreamingAccount Add Funds', wallet, publicKey, transaction);
        if (sign.encodedTransaction) {
          encodedTx = sign.encodedTransaction;
          transactionLog = transactionLog.concat(sign.log);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionSuccess,
          });
          const sent = await sendTx('PaymentStreamingAccount Add Funds', connection, encodedTx);
          consoleOut('sent:', sent);
          if (sent.signature) {
            signature = sent.signature;
            consoleOut('Send Tx to confirmation queue:', signature);
            const fundTargetMultisig = params.streamId ? 'fund stream with' : 'fund vesting contract with';
            const fundTargetSingleSigner = params.streamId ? 'Fund stream with' : 'Fund vesting contract with';
            const targetFundedSingleSigner = params.streamId ? 'Stream funded with' : 'Vesting contract funded with';
            const loadingMessage = multisigAuthority
              ? `Create proposal to ${fundTargetMultisig} ${formatThousands(
                  parseFloat(params.amount),
                  params.associatedToken?.decimals,
                )} ${params.associatedToken?.symbol}`
              : `${fundTargetSingleSigner} ${formatThousands(
                  parseFloat(params.amount),
                  params.associatedToken?.decimals,
                )} ${params.associatedToken?.symbol}`;
            const completedMessage = multisigAuthority
              ? `Proposal to ${fundTargetMultisig} ${formatThousands(
                  parseFloat(params.amount),
                  params.associatedToken?.decimals,
                )} ${params.associatedToken?.symbol} was submitted for Multisig approval.`
              : `${targetFundedSingleSigner} ${formatThousands(
                  parseFloat(params.amount),
                  params.associatedToken?.decimals,
                )} ${params.associatedToken?.symbol}`;
            enqueueTransactionConfirmation({
              signature,
              operationType: OperationType.TreasuryAddFunds,
              finality: 'confirmed',
              txInfoFetchStatus: 'fetching',
              loadingTitle: 'Confirming transaction',
              loadingMessage,
              completedTitle: 'Transaction confirmed',
              completedMessage,
              completedMessageTimeout: isMultisigContext ? 8 : 5,
              extras: {
                vestingContractId: selectedVestingContract.id.toBase58(),
                multisigId: multisigAuthority,
                streamId: params.streamId,
              },
            });
            setSuccessStatus();
            closeAddFundsModal();
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
  };

  // Create stream modal (VestingContractCreateStream)
  const [isCreateStreamModalVisible, setIsCreateStreamModalVisibility] = useState(false);
  const showCreateStreamModal = useCallback(() => {
    resetTransactionStatus();
    if (vestingContract) {
      getTransactionFees(ACTION_CODES.CreateStreamWithFunds).then(value => {
        setTransactionFees(value);
        consoleOut('transactionFees:', value, 'orange');
      });
      getTransactionFees(ACTION_CODES.WithdrawFromStream).then(value => {
        setWithdrawTransactionFees(value);
        consoleOut('withdrawTransactionFees:', value, 'orange');
      });
      setIsCreateStreamModalVisibility(true);
    }
  }, [getTransactionFees, resetTransactionStatus, vestingContract]);

  const onAcceptCreateStream = (params: VestingContractStreamCreateOptions) => {
    consoleOut('Create stream params:', params, 'blue');
    onExecuteCreateStreamTransaction(params);
  };

  const closeCreateStreamModal = useCallback(() => {
    resetTransactionStatus();
    setIsCreateStreamModalVisibility(false);
    clearFormValues();
  }, [clearFormValues, resetTransactionStatus]);

  const onExecuteCreateStreamTransaction = async (params: VestingContractStreamCreateOptions) => {
    let transaction: VersionedTransaction | Transaction | null = null;
    let signature: any;
    let encodedTx: string;
    let generatedStremId: string;
    let transactionLog: any[] = [];

    resetTransactionStatus();
    setIsBusy(true);

    const createVestingStream = async (data: CreateVestingStreamParams) => {
      if (!connection || !paymentStreaming || !publicKey) {
        return null;
      }

      consoleOut('createVestingStream received data:', data, 'blue');

      const treasury = new PublicKey(data.treasury);
      const beneficiary = new PublicKey(data.beneficiary);

      if (!data.multisig) {
        const accounts: CreateVestingStreamTransactionAccounts = {
          feePayer: publicKey, // feePayer
          beneficiary, // beneficiary
          owner: publicKey, // treasurer
          vestingAccount: treasury, // vestingAccount
        };
        const { transaction, template, stream } = await paymentStreaming.buildCreateVestingStreamTransaction(
          accounts, // accounts
          data.allocationAssigned, // allocationAssigned
          data.streamName, // streamName
          true,
        );

        const prioritizedTx = await composeTxWithPrioritizationFees(connection, publicKey, transaction.instructions);

        return { transaction: prioritizedTx, stream, template };
      }

      if (!multisigClient || !multisigAccounts) {
        return null;
      }

      const multisig = multisigAccounts.find(m => m.authority.toBase58() === data.multisig);
      consoleOut('createVestingStream filtered multisig:', multisig?.authority.toBase58(), 'blue');

      if (!multisig) {
        return null;
      }

      consoleOut('data.treasury:', data.treasury, 'blue');
      consoleOut('data.treasuryAssociatedTokenMint:', data.treasuryAssociatedTokenMint, 'blue');
      consoleOut('selectedVestingContract:', selectedVestingContract, 'blue');
      consoleOut(
        'associatedToken == treasuryAssociatedTokenMint?',
        selectedVestingContract?.mint.toBase58() === data.treasuryAssociatedTokenMint ? 'true' : 'false',
        'blue',
      );

      const accounts: CreateVestingStreamTransactionAccounts = {
        feePayer: multisig.authority, // feePayer
        owner: multisig.authority, // treasurer
        vestingAccount: treasury, // vestingAccount
        beneficiary, // beneficiary
      };
      const { transaction, stream } = await paymentStreaming.buildCreateVestingStreamTransaction(
        accounts, // accounts
        data.allocationAssigned, // allocationAssigned
        data.streamName, // streamName
        true,
      );

      const ixData = Buffer.from(transaction.instructions[0].data);
      const ixAccounts = transaction.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await getProposalWithPrioritizationFees(
        {
          multisigClient,
          connection,
          transactionPriorityOptions,
        },
        publicKey,
        data.proposalTitle ?? 'Create Vesting Stream',
        '', // description
        new Date(expirationTime * 1_000),
        OperationType.TreasuryStreamCreate,
        multisig.id,
        mspV2AddressPK, // program
        ixAccounts, // keys o accounts of the Ix
        ixData,
      );

      if (!tx) {
        return null;
      }

      return { transaction: tx.transaction, stream };
    };

    const createTx = async (): Promise<boolean> => {
      if (!publicKey || !paymentStreaming || !selectedVestingContract || !params.associatedToken) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('Create Vesting Stream transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }

      consoleOut('Wallet address:', publicKey.toBase58());

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction,
      });

      const associatedToken =
        params.associatedToken.address === WRAPPED_SOL_MINT_ADDRESS ? NATIVE_SOL : params.associatedToken;
      consoleOut('associatedToken:', objectToJson(associatedToken), 'blue');
      const treasury = selectedVestingContract.id;
      // const treasurer = new PublicKey(selectedVestingContract.treasurer as string);
      const treasurer = isMultisigContext && selectedMultisig ? selectedMultisig.authority : publicKey;
      const price = associatedToken ? getTokenPriceByAddress(associatedToken.address, associatedToken.symbol) : 0;
      const segmentAmount = toUiAmount(params.tokenAmount, associatedToken.decimals);

      // Create a transaction
      const data: CreateVestingStreamParams = {
        proposalTitle: params.proposalTitle, // proposal title
        payer: publicKey.toBase58(), // payer
        treasurer: treasurer.toBase58(), // treasurer
        treasury: treasury.toBase58(), // treasury
        beneficiary: params.beneficiaryAddress, // beneficiary
        treasuryAssociatedTokenMint: associatedToken.address, // treasuryAssociatedTokenMint
        allocationAssigned: params.tokenAmount.toString(), // allocationAssigned
        streamName: params.streamName, // streamName
        multisig: params.multisig, // expose multisig if present
      };
      consoleOut('data:', data);

      // Report event to Segment analytics
      const segmentData: SegmentStreamCreateData = {
        asset: associatedToken.symbol,
        assetPrice: price,
        treasury: selectedVestingContract.id.toBase58(),
        beneficiary: params.beneficiaryAddress,
        allocation: segmentAmount,
        rateAmount: params.rateAmount,
        interval: params.interval,
        category: selectedVestingContract.category,
        feePayedByTreasurer: params.feePayedByTreasurer,
        valueInUsd: params.tokenAmount.muln(price).toString(),
      };
      consoleOut('segment data:', segmentData, 'blue');
      segmentAnalytics.recordEvent(AppUsageEvent.StreamCreateFormButton, segmentData);

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

      const minRequired = minRequiredBalance;
      consoleOut('Min balance required:', minRequired, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance < minRequired) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${getAmountWithSymbol(
            nativeBalance,
            SOL_MINT.toBase58(),
          )}) to pay for network fees (${getAmountWithSymbol(minRequired, SOL_MINT.toBase58())})`,
        });
        customLogger.logError('Create Vesting Stream transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }

      const result = await createVestingStream(data)
        .then(value => {
          if (!value) {
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction,
          });
          transaction = value.transaction;
          generatedStremId = value.stream.toBase58();
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
            result: getTxIxResume(value.transaction),
          });
          return true;
        })
        .catch(error => {
          console.error('createVestingStream error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`,
          });
          customLogger.logError('Create Vesting Stream transaction failed', {
            transcript: transactionLog,
          });
          return false;
        });

      return result;
    };

    if (wallet && publicKey && workingToken && selectedVestingContract) {
      generatedStremId = '';
      const created = await createTx();
      consoleOut('created:', created, 'blue');
      if (created) {
        const sign = await signTx('Create Stream', wallet, publicKey, transaction);
        if (sign.encodedTransaction) {
          encodedTx = sign.encodedTransaction;
          transactionLog = transactionLog.concat(sign.log);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionSuccess,
          });
          const sent = await sendTx('Create Stream', connection, encodedTx);
          consoleOut('sent:', sent);
          if (sent.signature) {
            signature = sent.signature;
            consoleOut('Send Tx to confirmation queue:', signature);
            consoleOut('pending confirm msg:', params.txConfirmDescription, 'blue');
            consoleOut('confirmed msg:', params.txConfirmedDescription, 'blue');
            enqueueTransactionConfirmation({
              signature,
              operationType: OperationType.TreasuryStreamCreate,
              finality: 'confirmed',
              txInfoFetchStatus: 'fetching',
              loadingTitle: 'Confirming transaction',
              loadingMessage: params.txConfirmDescription,
              completedTitle: 'Transaction confirmed',
              completedMessage: params.txConfirmedDescription,
              completedMessageTimeout: isMultisigContext ? 8 : 5,
              extras: {
                vestingContractId: selectedVestingContract.id.toBase58(),
                multisigId: params.multisig,
                streamId: generatedStremId,
              },
            });
            setIsBusy(false);
            closeCreateStreamModal();
          } else {
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.SendTransactionFailure,
            });
            setIsBusy(false);
          }
        } else {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionFailure,
          });
          setIsBusy(false);
        }
      } else {
        setIsBusy(false);
      }
    }
  };

  // Transfer funds modal
  const [isVestingContractTransferFundsModalVisible, setIsVestingContractTransferFundsModalVisible] = useState(false);
  const showVestingContractTransferFundsModal = useCallback(() => {
    setIsVestingContractTransferFundsModalVisible(true);
    getTransactionFees(ACTION_CODES.WithdrawFromAccount).then(value => {
      setTransactionFees(value);
      consoleOut('transactionFees:', value, 'orange');
    });
    resetTransactionStatus();
  }, [getTransactionFees, resetTransactionStatus]);

  const onAcceptVestingContractTransferFunds = (params: VestingContractWithdrawOptions) => {
    consoleOut('params', params, 'blue');
    onExecuteVestingContractTransferFundsTx(params);
  };

  const closeVestingContractTransferFundsModal = () => {
    setIsVestingContractTransferFundsModalVisible(false);
    resetTransactionStatus();
    clearFormValues();
  };

  const onExecuteVestingContractTransferFundsTx = async (params: VestingContractWithdrawOptions) => {
    let transaction: VersionedTransaction | Transaction | null = null;
    let signature: any;
    let encodedTx: string;
    let multisigAuthority = '';
    let transactionLog: any[] = [];

    resetTransactionStatus();
    setIsBusy(true);

    const treasuryWithdraw = async (data: TreasuryWithdrawParams) => {
      if (!publicKey || !paymentStreaming) {
        return null;
      }

      if (!isMultisigContext) {
        const accounts: WithdrawFromAccountTransactionAccounts = {
          feePayer: new PublicKey(data.payer), // payer
          destination: new PublicKey(data.destination), // destination
          psAccount: new PublicKey(data.treasury), // psAccount
        };
        const { transaction } = await paymentStreaming.buildWithdrawFromAccountTransaction(
          accounts, // accounts
          data.amount, // amount
          false, // autoWsol
        );

        return await composeTxWithPrioritizationFees(connection, publicKey, transaction.instructions);
      }

      if (!selectedVestingContract || !multisigClient || !multisigAccounts || !publicKey) {
        return null;
      }

      const treasury = selectedVestingContract;
      const multisig = multisigAccounts.find(m => m.authority.equals(treasury.owner));

      if (!multisig) {
        return null;
      }
      multisigAuthority = multisig.authority.toBase58();

      const accounts: WithdrawFromAccountTransactionAccounts = {
        feePayer: new PublicKey(multisig.authority), // payer
        destination: new PublicKey(data.destination), // destination
        psAccount: new PublicKey(data.treasury), // psAccount
      };
      const { transaction } = await paymentStreaming.buildWithdrawFromAccountTransaction(
        accounts, // accounts
        data.amount, // amount
        false, // autoWsol
      );

      const ixData = Buffer.from(transaction.instructions[0].data);
      const ixAccounts = transaction.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());
      const proposalTitle = data.proposalTitle;

      const tx = await getProposalWithPrioritizationFees(
        {
          multisigClient,
          connection,
          transactionPriorityOptions,
        },
        publicKey,
        proposalTitle,
        '', // description
        new Date(expirationTime * 1_000),
        OperationType.TreasuryWithdraw,
        multisig.id,
        mspV2AddressPK,
        ixAccounts,
        ixData,
      );

      return tx?.transaction ?? null;
    };

    const createTx = async () => {
      if (!connection || !wallet || !publicKey) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('Vesting Contract withdraw transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }

      if (!selectedVestingContract || !paymentStreaming) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: 'Cannot start transaction! PaymentStreamingAccount details or MSP client not found!',
        });
        customLogger.logError('Vesting Contract withdraw transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction,
      });

      const destinationPk = new PublicKey(params.destinationAccount);
      const treasury = selectedVestingContract.id;
      const amount = params.tokenAmount;
      const token = params.associatedToken;
      const price = token ? getTokenPriceByAddress(token.address, token.symbol) : 0;

      // Create a transaction
      const payload: TreasuryWithdrawParams = {
        proposalTitle: params.proposalTitle,
        payer: selectedAccount.address,
        destination: destinationPk.toBase58(),
        treasury: treasury.toBase58(),
        amount: amount.toString(),
      };
      consoleOut('payload:', payload);

      // Report event to Segment analytics
      const segmentData: SegmentVestingContractWithdrawData = {
        asset: token ? token.symbol : '-',
        assetPrice: price,
        vestingContract: selectedVestingContract.id.toBase58(),
        destination: params.destinationAccount,
        amount: parseFloat(params.amount),
        valueInUsd: parseFloat(params.amount) * price,
      };
      consoleOut('segment data:', segmentData, 'blue');
      segmentAnalytics.recordEvent(AppUsageEvent.VestingContractWithdrawFundsFormButton, segmentData);

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

      const bf = transactionFees.blockchainFee; // Blockchain fee
      const ff = transactionFees.mspFlatFee; // Flat fee (protocol)
      const mp = multisigTxFees.networkFee + multisigTxFees.multisigFee + multisigTxFees.rentExempt; // Multisig proposal
      const minRequired = isMultisigContext ? mp : bf + ff;

      setMinRequiredBalance(minRequired);

      consoleOut('Min balance required:', minRequired, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance < minRequired) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${getAmountWithSymbol(
            nativeBalance,
            SOL_MINT.toBase58(),
          )}) to pay for network fees (${getAmountWithSymbol(minRequired, SOL_MINT.toBase58())})`,
        });
        customLogger.logError('Vesting Contract withdraw transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut('Starting PaymentStreamingAccount Withdraw using MSP V2...', '', 'blue');

      const result = await treasuryWithdraw(payload)
        .then(value => {
          if (!value) {
            return false;
          }
          consoleOut('treasuryWithdraw returned transaction:', value);
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
          console.error('treasuryWithdraw error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`,
          });
          customLogger.logError('Vesting Contract withdraw transaction failed', { transcript: transactionLog });
          return false;
        });

      return result;
    };

    if (wallet && publicKey && params && selectedVestingContract) {
      const created = await createTx();
      consoleOut('created:', created, 'blue');
      if (created) {
        const sign = await signTx('Vesting Contract withdraw', wallet, publicKey, transaction);
        if (sign.encodedTransaction) {
          encodedTx = sign.encodedTransaction;
          transactionLog = transactionLog.concat(sign.log);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionSuccess,
          });
          const sent = await sendTx('Vesting Contract withdraw', connection, encodedTx);
          consoleOut('sent:', sent);
          if (sent.signature) {
            signature = sent.signature;
            consoleOut('Send Tx to confirmation queue:', signature);
            const completedMessage = params.multisig
              ? `Withdrawal of ${formatThousands(parseFloat(params.amount), params.associatedToken?.decimals)} ${
                  params.associatedToken?.symbol
                } from vesting contract ${selectedVestingContract.name} has been proposed`
              : `Successful withdrawal of ${formatThousands(
                  parseFloat(params.amount),
                  params.associatedToken?.decimals,
                )} ${params.associatedToken?.symbol} from vesting contract ${selectedVestingContract.name}`;
            enqueueTransactionConfirmation({
              signature,
              operationType: OperationType.TreasuryWithdraw,
              finality: 'confirmed',
              txInfoFetchStatus: 'fetching',
              loadingTitle: 'Confirming transaction',
              loadingMessage: `${params.multisig ? 'Proposal to withdraw' : 'Withdraw'} ${formatThousands(
                parseFloat(params.amount),
                params.associatedToken?.decimals,
              )} ${params.associatedToken?.symbol} from vesting contract ${selectedVestingContract.name}`,
              completedTitle: 'Transaction confirmed',
              completedMessage,
              completedMessageTimeout: isMultisigContext ? 8 : 5,
              extras: {
                vestingContractId: selectedVestingContract.id.toBase58(),
                multisigId: multisigAuthority, // params.multisig
              },
            });
            setSuccessStatus();
            closeVestingContractTransferFundsModal();
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
  };

  const onRefreshTreasuryBalanceTransactionFinished = useCallback(() => {
    refreshTokenBalance();
    resetTransactionStatus();
  }, [refreshTokenBalance, resetTransactionStatus]);

  const onExecuteRefreshVestingContractBalance = useCallback(async () => {
    let transaction: VersionedTransaction | Transaction | null = null;
    let signature: any;
    let encodedTx: string;
    let transactionLog: any[] = [];

    resetTransactionStatus();
    setIsBusy(true);

    const createTx = async (): Promise<boolean> => {
      if (!publicKey || !selectedVestingContract || !paymentStreaming) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('Refresh PaymentStreamingAccount data transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction,
      });

      const treasury = selectedVestingContract.id;
      const data = {
        treasurer: publicKey.toBase58(), // treasurer
        treasury: treasury.toBase58(), // treasury
      };
      consoleOut('data:', data);

      // Report event to Segment analytics
      const segmentData: SegmentRefreshAccountBalanceData = {
        treasurer: data.treasurer,
        treasury: data.treasury,
      };
      consoleOut('segment data:', segmentData, 'blue');
      segmentAnalytics.recordEvent(AppUsageEvent.RefreshAccountBalanceFormButton, segmentData);

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

      const minRequired = 0.000005;
      setMinRequiredBalance(minRequired);
      consoleOut('Min balance required:', minRequired, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance < minRequired) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${getAmountWithSymbol(
            nativeBalance,
            SOL_MINT.toBase58(),
          )}) to pay for network fees (${getAmountWithSymbol(minRequired, SOL_MINT.toBase58())})`,
        });
        customLogger.logError('Refresh PaymentStreamingAccount data transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }

      // Create a transaction
      const accounts: RefreshAccountDataTransactionAccounts = {
        feePayer: publicKey, // feePayer
        psAccount: new PublicKey(data.treasury), // psAccount
      };
      const result = await paymentStreaming
        .buildRefreshAccountDataTransaction(accounts)
        .then(value => {
          if (!value) {
            return false;
          }
          consoleOut('refreshBalance returned transaction:', value);
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
            result: getTxIxResume(value.transaction),
          });
          transaction = value.transaction;
          return true;
        })
        .catch(error => {
          console.error('refreshBalance error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`,
          });
          customLogger.logError('Refresh PaymentStreamingAccount data transaction failed', {
            transcript: transactionLog,
          });
          return false;
        });

      return result;
    };

    if (wallet && publicKey && selectedVestingContract) {
      const created = await createTx();
      consoleOut('created:', created);
      if (created) {
        const sign = await signTx('Refresh Account Balance', wallet, publicKey, transaction);
        if (sign.encodedTransaction) {
          encodedTx = sign.encodedTransaction;
          transactionLog = transactionLog.concat(sign.log);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionSuccess,
          });
          const sent = await sendTx('Refresh Account Balance', connection, encodedTx);
          consoleOut('sent:', sent);
          if (sent.signature) {
            signature = sent.signature;
            consoleOut('Send Tx to confirmation queue:', signature);
            enqueueTransactionConfirmation({
              signature,
              operationType: OperationType.TreasuryRefreshBalance,
              finality: 'confirmed',
              txInfoFetchStatus: 'fetching',
              loadingTitle: 'Confirming transaction',
              loadingMessage: `Refresh balance for vesting contract ${selectedVestingContract.name}`,
              completedTitle: 'Transaction confirmed',
              completedMessage: `Refresh balance successful for vesting contract ${selectedVestingContract.name}`,
              completedMessageTimeout: isMultisigContext ? 8 : 5,
              extras: {
                vestingContractId: selectedVestingContract.id.toBase58(),
                multisigId: '',
              },
            });
            setIsBusy(false);
            onRefreshTreasuryBalanceTransactionFinished();
          } else {
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.SendTransactionFailure,
            });
            openNotification({
              title: t('notifications.error-title'),
              description: t('notifications.error-sending-transaction'),
              type: 'error',
            });
            setIsBusy(false);
          }
        } else {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionFailure,
          });
          setIsBusy(false);
        }
      } else {
        setIsBusy(false);
      }
    }
  }, [
    paymentStreaming,
    wallet,
    publicKey,
    connection,
    nativeBalance,
    isMultisigContext,
    selectedVestingContract,
    transactionStatus.currentOperation,
    onRefreshTreasuryBalanceTransactionFinished,
    enqueueTransactionConfirmation,
    resetTransactionStatus,
    setTransactionStatus,
    t,
  ]);

  const onAcceptEditContractSettings = (params: VestingContractEditOptions) => {
    consoleOut('params', params, 'blue');
    onExecuteEditContractSettingsTx(params);
  };

  const { onExecute } = useTransaction();

  const onExecuteEditContractSettingsTx = async (editOptions: VestingContractEditOptions) => {
    const vestingContract = selectedVestingContract;
    const vestingContractName = vestingContract?.name ?? '';

    const multisigAuthority = getMultisigIdFromContext();
    const payload = () => {
      if (!vestingContract || !publicKey) return;

      return {
        multisig: multisigAuthority, // multisig
        treasurer: publicKey, // treasurer
        duration: editOptions.duration, // duration
        durationUnit: editOptions.durationUnit, // durationUnit
        startUtc: editOptions.startDate, // startUtc
        cliffVestPercent: editOptions.cliffVestPercent, // cliffVestPercent
        feePayedByTreasurer: editOptions.feePayedByTreasurer, // feePayedByTreasurer
        vestingTreasury: new PublicKey(vestingContract.id),
        proposalTitle: editOptions.proposalTitle,
      } as VestingContractEditParams;
    };
    const loadingMessage = () =>
      isMultisigContext
        ? `Send proposal to edit the vesting contract ${vestingContractName}`
        : `Edit vesting contract ${vestingContractName}`;
    const completedMessage = () =>
      isMultisigContext
        ? `Proposal to update the vesting contract ${vestingContractName} was submitted for Multisig approval.`
        : `Vesting contract ${vestingContractName} updated successfully`;

    const bf = transactionFees.blockchainFee; // Blockchain fee
    const ff = transactionFees.mspFlatFee; // Flat fee (protocol)
    const mp = multisigTxFees.networkFee + multisigTxFees.multisigFee + multisigTxFees.rentExempt; // Multisig proposal
    const minRequired = isMultisigContext ? mp : bf + ff;

    setMinRequiredBalance(minRequired);

    await onExecute({
      name: 'Edit Vesting Contract',
      operationType: OperationType.TreasuryEdit,
      payload,
      loadingMessage,
      completedMessage,
      extras: () => ({
        vestingContractId: vestingContract?.id,
        multisigId: multisigAuthority,
      }),
      proposalTitle: editOptions.proposalTitle,
      multisig: multisigAuthority,
      setIsBusy,
      nativeBalance,
      minRequired,

      generateTransaction: async ({ multisig, data }) => {
        if (!paymentStreaming || !publicKey) return;
        const accounts: UpdateVestingTemplateTransactionAccounts = {
          feePayer: new PublicKey(data.treasurer), // feePayer
          owner: new PublicKey(data.treasurer), // owner
          vestingAccount: new PublicKey(data.vestingTreasury), // vestingAccount
        };
        const { transaction } = await paymentStreaming.buildUpdateVestingTemplateTransaction(
          accounts, // accounts
          data.duration, // numberOfIntervals
          data.durationUnit, // intervalUnit
          data.startUtc, // startUtc
          data.cliffVestPercent, // cliffVestPercent
          data.feePayedByTreasurer, // tokenFeePayedFromAccount
        );

        const prioritizedTx = composeTxWithPrioritizationFees(connection, publicKey, transaction.instructions);

        return prioritizedTx;
      },

      generateMultisigArgs: async ({ multisig, data }) => {
        if (!paymentStreaming || !multisig) return null;

        const accounts: UpdateVestingTemplateTransactionAccounts = {
          feePayer: multisig.authority, // feePayer
          owner: multisig.authority, // owner
          vestingAccount: new PublicKey(data.vestingTreasury), // vestingAccount
        };
        const { transaction } = await paymentStreaming.buildUpdateVestingTemplateTransaction(
          accounts, // accounts
          data.duration, // numberOfIntervals
          data.durationUnit, // intervalUnit
          data.startUtc, // startUtc
          data.cliffVestPercent, // cliffVestPercent
          data.feePayedByTreasurer, // tokenFeePayedFromAccount
        );

        const programId = mspV2AddressPK;
        const ixData = Buffer.from(transaction.instructions[0].data);
        const ixAccounts = transaction.instructions[0].keys;

        return {
          programId, // program
          ixAccounts, // keys o accounts of the Ix
          ixData, // data of the Ix
        };
      },
    });
    onVestingContractCreatedOrUpdated();
  };

  /////////////////////
  // Data management //
  /////////////////////

  useEffect(() => {
    // setMainFeatureTab
    if (location.pathname === `${VESTING_ROUTE_BASE_PATH}/summary`) {
      setMainFeatureTab('summary');
    } else if (location.pathname === `${VESTING_ROUTE_BASE_PATH}/contracts`) {
      setMainFeatureTab('contracts');
    }
  }, [location.pathname]);

  // Detect XS screen
  useEffect(() => {
    if (width < 576) {
      setIsXsDevice(true);
      setIsLgDevice(false);
    } else if (width >= 1200) {
      setIsXsDevice(false);
      setIsLgDevice(true);
    } else {
      setIsXsDevice(false);
      setIsLgDevice(false);
    }
  }, [width]);

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

  // Create Vesting contract fees
  useEffect(() => {
    if (!createVestingContractTxFees.mspFlatFee) {
      getTransactionFees(ACTION_CODES.CreateAccount).then(value => {
        setCreateVestingContractTxFees(value);
        consoleOut('createVestingContractTxFees:', value, 'orange');
      });
    }
  }, [getTransactionFees, createVestingContractTxFees]);

  // Set a default token if we have a list but none already set
  useEffect(() => {
    if (selectedList && !workingToken) {
      consoleOut('Setting default token:', selectedList[0], 'blue');
      setWorkingToken(selectedList[0]);
    }
  }, [selectedList, workingToken]);

  // Automatically update all token balances and rebuild token list
  useEffect(() => {
    if (!connection) {
      console.error('No connection');
      return;
    }

    if (!selectedAccount.address || !splTokenList) {
      return;
    }

    const pk = balancesSource || selectedAccount.address;

    const timeout = setTimeout(() => {
      getTokensWithBalances(connection, pk, priceList, splTokenList, false).then(response => {
        if (response) {
          setSelectedList(response.tokenList);
          setUserBalances(response.balancesMap);
        }
      });
    });

    return () => {
      clearTimeout(timeout);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceList, priceList, connection, splTokenList, balancesSource, selectedAccount.address]);

  // Build CTAs
  useEffect(() => {
    const numMaxCtas = 2;
    const actions: MetaInfoCta[] = [];
    let ctaItems = 0;

    // Create Stream
    if (canPerformAnyAction() && !isContractLocked()) {
      actions.push({
        action: MetaInfoCtaAction.VestingContractCreateStreamOnce,
        isVisible: true,
        caption: 'Create stream',
        disabled: availableStreamingBalance.eqn(0),
        uiComponentType: 'button',
        uiComponentId: `button-${MetaInfoCtaAction.VestingContractCreateStreamOnce}`,
        tooltip: '',
        callBack: showCreateStreamModal,
      });
      ctaItems++;
    }

    // Add funds
    if (canPerformAnyAction() && !isContractLocked()) {
      actions.push({
        action: MetaInfoCtaAction.VestingContractAddFunds,
        caption: 'Add funds',
        isVisible: true,
        uiComponentType: ctaItems < numMaxCtas ? 'button' : 'menuitem',
        disabled: false,
        uiComponentId: `${ctaItems < numMaxCtas ? 'button' : 'menuitem'}-${MetaInfoCtaAction.VestingContractAddFunds}`,
        tooltip: '',
        callBack: showAddFundsModal,
      });
      ctaItems++;
    }

    // Bulk create
    // if (canPerformAnyAction() && !isContractLocked()) {
    //   actions.push({
    //     action: MetaInfoCtaAction.VestingContractCreateStreamBulk,
    //     isVisible: true,
    //     caption: 'Bulk create',
    //     disabled: availableStreamingBalance.eqn(0),
    //     uiComponentType: 'button',
    //     uiComponentId: `button-${MetaInfoCtaAction.VestingContractCreateStreamBulk}`,
    //     tooltip: '',
    //     callBack: () => { }
    //   });
    //   ctaItems++;
    // }

    // Withdraw funds
    actions.push({
      action: MetaInfoCtaAction.VestingContractWithdrawFunds,
      caption: 'Claim unallocated tokens',
      isVisible: true,
      uiComponentType: ctaItems < numMaxCtas ? 'button' : 'menuitem',
      disabled: !canPerformAnyAction() || availableStreamingBalance.eqn(0),
      uiComponentId: `${ctaItems < numMaxCtas ? 'button' : 'menuitem'}-${
        MetaInfoCtaAction.VestingContractWithdrawFunds
      }`,
      tooltip: '',
      callBack: showVestingContractTransferFundsModal,
    });
    ctaItems++;

    // Close Contract
    actions.push({
      action: MetaInfoCtaAction.VestingContractClose,
      caption: 'Close contract',
      isVisible: true,
      uiComponentType: ctaItems < numMaxCtas ? 'button' : 'menuitem',
      disabled: !canPerformAnyAction(),
      uiComponentId: `${ctaItems < numMaxCtas ? 'button' : 'menuitem'}-${MetaInfoCtaAction.VestingContractClose}`,
      tooltip: '',
      callBack: showVestingContractCloseModal,
    });
    ctaItems++;

    // View SOL balance
    if (selectedVestingContract && isMultisigContext && !isContractRunning()) {
      actions.push({
        action: MetaInfoCtaAction.VestingContractViewSolBalance,
        caption: 'View SOL balance',
        isVisible: true,
        uiComponentType: ctaItems < numMaxCtas ? 'button' : 'menuitem',
        disabled: !canPerformAnyAction(),
        uiComponentId: `${ctaItems < numMaxCtas ? 'button' : 'menuitem'}-${
          MetaInfoCtaAction.VestingContractViewSolBalance
        }`,
        tooltip: '',
        callBack: showVestingContractSolBalanceModal,
      });
      ctaItems++;
    }

    if (canPerformAnyAction() && !isContractLocked()) {
      const disabled = !(selectedVestingContract && selectedVestingContract.totalStreams === 0);
      actions.push({
        action: MetaInfoCtaAction.VestingContractEditSettings,
        caption: 'Edit contract settings',
        isVisible: true,
        uiComponentType: ctaItems < numMaxCtas ? 'button' : 'menuitem',
        disabled,
        uiComponentId: `${ctaItems < numMaxCtas ? 'button' : 'menuitem'}-${
          MetaInfoCtaAction.VestingContractEditSettings
        }`,
        tooltip: '',
        callBack: disabled ? () => {} : showEditContractSettingsModal,
      });
      ctaItems++;
    }

    // Refresh Account Data
    actions.push({
      action: MetaInfoCtaAction.VestingContractRefreshAccount,
      caption: 'Refresh account data',
      isVisible: true,
      uiComponentType: ctaItems < numMaxCtas ? 'button' : 'menuitem',
      disabled: !canPerformAnyAction(),
      uiComponentId: `${ctaItems < numMaxCtas ? 'button' : 'menuitem'}-${
        MetaInfoCtaAction.VestingContractRefreshAccount
      }`,
      tooltip: '',
      callBack: onExecuteRefreshVestingContractBalance,
    });
    ctaItems++;

    setAssetCtas(actions);
  }, [
    isMultisigContext,
    selectedVestingContract,
    availableStreamingBalance,
    onExecuteRefreshVestingContractBalance,
    showVestingContractTransferFundsModal,
    showVestingContractSolBalanceModal,
    showEditContractSettingsModal,
    showVestingContractCloseModal,
    showCreateStreamModal,
    canPerformAnyAction,
    isContractRunning,
    showAddFundsModal,
    isContractLocked,
  ]);

  // Reset summaries and canDisplay flags when all dependencies start to load
  useEffect(() => {
    if (loadingTreasuries) {
      setStreamingAccountsSummary(undefined);
      setCanDisplayMyTvl(false);
    }
  }, [loadingStreams, loadingTreasuries]);

  // Load vesting accounts once per page access
  useEffect(() => {
    if (!publicKey || !selectedAccount.address || treasuriesLoaded) {
      return;
    }

    consoleOut('Calling refreshVestingContracts...', '', 'blue');
    refreshVestingContracts(false);
  }, [selectedAccount.address, publicKey, refreshVestingContracts, treasuriesLoaded]);

  // Set a vesting contract if passed-in via url if found in list of vesting contracts
  // If not found or not provided, will pick the first one available via redirect
  useEffect(() => {
    if (!treasuriesLoaded || !publicKey) {
      return;
    }

    const hasNoVestingAccounts = () => !!(treasuriesLoaded && treasuryList && treasuryList.length === 0);

    if (vestingContract && treasuryList && treasuryList.length > 0) {
      const item = treasuryList.find(i => i.id.toBase58() === vestingContract);
      if (item) {
        setSelectedVestingContract(item);
        setSignalRefreshTreasuryStreams(true);
        // Clear previous data related to stream activity
        setContractActivity([]);
        setHasMoreContractActivity(true);
        consoleOut('selectedVestingContract:', item, 'blue');
        setDetailsPanelOpen(true);
      } else {
        navigateToVestingContract(treasuryList[0].id.toBase58());
      }
    } else if (vestingContract && hasNoVestingAccounts()) {
      const url = `${VESTING_ROUTE_BASE_PATH}`;
      consoleOut('Contract provided but not items found:', url, 'orange');
      navigate(url);
    }
  }, [publicKey, treasuryList, vestingContract, treasuriesLoaded, navigateToVestingContract, navigate]);

  // Set selected token with the vesting contract associated token as soon as the VC is available
  useEffect(() => {
    if (!publicKey) {
      return;
    }
    if (selectedVestingContract?.mint) {
      const associatedToken = selectedVestingContract.mint.toBase58();
      getTokenOrCustomToken(connection, associatedToken, getTokenByMintAddress).then(token => {
        consoleOut('getTokenOrCustomToken (VestingView) ->', token, 'blue');
        setWorkingToken(token);
      });
    }
  }, [connection, getTokenByMintAddress, publicKey, selectedVestingContract?.mint]);

  // Get the vesting flow rate
  useEffect(() => {
    if (!publicKey || !paymentStreaming || !selectedVestingContract || !associatedTokenDecimals) {
      return;
    }

    if (vestingContract && selectedVestingContract && vestingContract === selectedVestingContract.id.toBase58()) {
      // First check if there is already a value for this key in the cache
      // Just get the value from cache if already exists and push it to the state
      // Otherwise fetch it, add it to the cache and push it to the state
      const vcFlowRate = vestingFlowRatesCache.get(selectedVestingContract.id.toBase58());
      if (vcFlowRate) {
        setVestingContractFlowRate(vcFlowRate);
        consoleOut('Set VestingContractFlowRate from cache:', vcFlowRate, 'orange');
        return;
      }

      setLoadingVestingContractFlowRate(true);
      consoleOut('calling getVestingFlowRate:', selectedVestingContract.id.toBase58(), 'blue');
      const treasury = selectedVestingContract.id;
      paymentStreaming
        .getVestingAccountFlowRate(treasury)
        .then(value => {
          if (!vestingFlowRatesCache.get(selectedVestingContract.id.toBase58())) {
            consoleOut('getVestingFlowRate value:', value, 'darkgreen');
            const freshFlowRate: VestingFlowRateInfo = {
              amountBn: value.rateAmount,
              durationUnit: value.intervalUnit,
              streamableAmountBn: value.totalAllocation,
            };
            vestingFlowRatesCache.add(selectedVestingContract.id.toBase58(), freshFlowRate);
            setVestingContractFlowRate(freshFlowRate);
            consoleOut('flowRate:', freshFlowRate, 'darkgreen');
          }
        })
        .catch(error => console.error('', error))
        .finally(() => setLoadingVestingContractFlowRate(false));
    }
  }, [associatedTokenDecimals, paymentStreaming, publicKey, selectedVestingContract, vestingContract]);

  // Keep Vesting contract ATA balance
  useEffect(() => {
    const getStreamingAccountAtaBalance = async (address: string, streamingAccountAddress: string) => {
      if (!connection || !publicKey || !address || !streamingAccountAddress) {
        return new BN(0);
      }

      let balance = new BN(0);
      let decimals = 0;

      try {
        consoleOut('address', address, 'blue');
        consoleOut('streamingAccountAddress', streamingAccountAddress, 'blue');
        const tokenPk = new PublicKey(address);
        const saPk = new PublicKey(streamingAccountAddress);
        const saAtaTokenAddress = findATokenAddress(saPk, tokenPk);
        const ta = await getTokenAccountBalanceByAddress(connection, saAtaTokenAddress);
        consoleOut('getTokenAccountBalanceByAddress ->', ta, 'blue');
        if (ta) {
          balance = new BN(ta.amount);
          decimals = ta.decimals;
        }
        consoleOut('VC ATA balance:', toUiAmount(balance, decimals), 'blue');
        consoleOut('VC ATA balance (BN):', balance.toString(), 'blue');
        return balance;
      } catch (error) {
        return balance;
      }
    };

    if (selectedVestingContract) {
      const tokenAddr = selectedVestingContract.mint.toBase58();
      getStreamingAccountAtaBalance(tokenAddr, selectedVestingContract.id.toBase58())
        .then(value => setAssociatedTokenBalance(value))
        .catch(err => {
          console.error(err);
          setAssociatedTokenBalance(new BN(0));
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, publicKey, selectedVestingContract]);

  // Set a tab if none already set
  useEffect(() => {
    if (publicKey && selectedAccount.address && vestingContract && !activeTab) {
      // /vesting/:vestingContract/:activeTab
      const url = `${VESTING_ROUTE_BASE_PATH}/${vestingContract}/overview`;
      navigate(url);
    }
  }, [selectedAccount.address, activeTab, navigate, publicKey, vestingContract]);

  // Reload streams whenever the selected vesting contract changes
  useEffect(() => {
    if (!publicKey) {
      return;
    }

    if (
      vestingContract &&
      selectedVestingContract &&
      vestingContract === selectedVestingContract.id.toBase58() &&
      !loadingTreasuryStreams &&
      signalRefreshTreasuryStreams &&
      activeTab === 'streams'
    ) {
      setSignalRefreshTreasuryStreams(false);
      consoleOut('calling getTreasuryStreams...', '', 'blue');
      getTreasuryStreams(selectedVestingContract.id);
    }
  }, [
    publicKey,
    activeTab,
    loadingTreasuryStreams,
    vestingContract,
    selectedVestingContract,
    signalRefreshTreasuryStreams,
    getTreasuryStreams,
  ]);

  // Get the effective balance of the treasury
  useEffect(() => {
    if (!connection || !publicKey) {
      return;
    }

    if (vestingContract && selectedVestingContract && vestingContract === selectedVestingContract.id.toBase58()) {
      let balance = 0;
      connection
        .getBalance(new PublicKey(vestingContract))
        .then(solBalance => {
          balance = getAmountFromLamports(solBalance);
          connection
            .getMinimumBalanceForRentExemption(300)
            .then(value => {
              const re = getAmountFromLamports(value);
              const eb = balance - re;
              setTreasuryEffectiveBalance(eb);
            })
            .catch(error => {
              console.error('Failure fetching minimum balance for rent exemption', error);
            });
        })
        .catch(error => {
          console.error('Failure fetching native account balance for Streaming Account', error);
        });
    }
  }, [connection, publicKey, selectedVestingContract, vestingContract]);

  // Get the Vesting contract settings template
  useEffect(() => {
    if (publicKey && paymentStreaming && vestingContract && isValidAddress(vestingContract)) {
      consoleOut('Get template for:', vestingContract, 'blue');
      const pk = new PublicKey(vestingContract);
      paymentStreaming.getStreamTemplate(pk).then(value => {
        consoleOut('StreamTemplate:', value, 'blue');
        setStreamTemplate(value);
      });
    }
  }, [paymentStreaming, publicKey, vestingContract, selectedVestingContract]);

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

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount.address, isMultisigContext, multisigAccounts]);

  // Get the Vesting contract activity while in "activity" tab
  useEffect(() => {
    if (
      publicKey &&
      paymentStreaming &&
      selectedVestingContract &&
      activeTab === 'activity' &&
      contractActivity.length < 5
    ) {
      getContractActivity(selectedVestingContract.id.toBase58());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, paymentStreaming, publicKey, selectedVestingContract]);

  // Get fees for multisig actions
  useEffect(() => {
    if (!multisigClient || !selectedAccount.address || !isMultisigContext) {
      return;
    }

    getFees(multisigClient.getProgram(), MULTISIG_ACTIONS.createTransaction).then(value => {
      setMultisigTxFees(value);
      consoleOut('Multisig transaction fees:', value, 'orange');
    });
  }, [selectedAccount.address, isMultisigContext, multisigClient]);

  // Get min balance required for multisig actions
  useEffect(() => {
    if (selectedAccount.address && selectedVestingContract) {
      let minRequired = 0;
      if (isMultisigContext && multisigTxFees) {
        minRequired = multisigTxFees.networkFee + multisigTxFees.multisigFee + multisigTxFees.rentExempt; // Multisig proposal fees
      } else if (transactionFees) {
        minRequired = transactionFees.blockchainFee + transactionFees.mspFlatFee;
      }

      if (minRequired > MIN_SOL_BALANCE_REQUIRED) {
        setMinRequiredBalance(minRequired);
        consoleOut('Min balance required:', minRequired, 'blue');
      } else {
        setMinRequiredBalance(MIN_SOL_BALANCE_REQUIRED);
        consoleOut('Min balance required:', MIN_SOL_BALANCE_REQUIRED, 'blue');
      }
    }
  }, [multisigTxFees, transactionFees, isMultisigContext, selectedAccount.address, selectedVestingContract]);

  // Keep the available streaming balance for the current vesting contract updated
  useEffect(() => {
    let streamingBalance = new BN(0);

    if (!selectedVestingContract) {
      setAvailableStreamingBalance(streamingBalance);
      return;
    }

    if (
      selectedVestingContract.mint &&
      workingToken &&
      workingToken.address === selectedVestingContract.mint.toBase58()
    ) {
      streamingBalance = getUnallocatedBalance(selectedVestingContract);
      consoleOut('Available streaming balance:', toUiAmount(streamingBalance, workingToken.decimals), 'blue');
      consoleOut('Available streaming balance (BN):', streamingBalance.toString(), 'blue');
      setAvailableStreamingBalance(streamingBalance);
      setAssociatedTokenDecimals(workingToken.decimals);
    }
  }, [getUnallocatedBalance, selectedVestingContract, workingToken]);

  // Hook on wallet connect/disconnect
  useEffect(() => {
    if (previousWalletConnectState !== connected) {
      if (!previousWalletConnectState && connected && publicKey) {
        consoleOut('User is connecting...', '', 'green');
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'green');
        // Cleanup state
        clearFormValues();
        setSelectedVestingContract(undefined);
        setStreamTemplate(undefined);
      }
    }
  }, [connected, publicKey, previousWalletConnectState, clearFormValues, onTxConfirmed, onTxTimedout]);

  // Live data calculation
  useEffect(() => {
    if (!publicKey || !treasuryList) {
      return;
    }

    const saveTvl = (tvl: number) => {
      const cacheEntryKey = 'vestingTvl';
      saveAppData(cacheEntryKey, tvl.toString(), selectedAccount.address);
    };

    if (!streamingAccountsSummary) {
      refreshTreasuriesSummary().then(value => {
        if (value) {
          setStreamingAccountsSummary(value);
          setUnallocatedBalance(value.totalNet);
          saveTvl(value.totalNet);
        }
        setCanDisplayMyTvl(true);
      });
    }

    const timeout = setTimeout(() => {
      refreshTreasuriesSummary().then(value => {
        if (value) {
          setStreamingAccountsSummary(value);
          setUnallocatedBalance(value.totalNet);
          saveTvl(value.totalNet);
        }
        setCanDisplayMyTvl(true);
      });
    }, HALF_MINUTE_REFRESH_TIMEOUT);

    return () => {
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey, streamingAccountsSummary, treasuryList]);

  // Setup event listeners
  useEffect(() => {
    if (canSubscribe) {
      setCanSubscribe(false);
      consoleOut('Setup event subscriptions -> VestingView', '', 'brown');
      confirmationEvents.on(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut('Subscribed to event txConfirmed with:', 'onTxConfirmed', 'brown');
      confirmationEvents.on(EventType.TxConfirmTimeout, onTxTimedout);
      consoleOut('Subscribed to event txTimedout with:', 'onTxTimedout', 'brown');
    }
  }, [canSubscribe, onTxConfirmed, onTxTimedout]);

  // Unsubscribe from events
  useEffect(() => {
    return () => {
      consoleOut('Stop event subscriptions -> VestingView', '', 'brown');
      confirmationEvents.off(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut('Unsubscribed from event txConfirmed!', '', 'brown');
      confirmationEvents.off(EventType.TxConfirmTimeout, onTxTimedout);
      consoleOut('Unsubscribed from event onTxTimedout!', '', 'brown');
      setCanSubscribe(true);
      setWorkingToken(undefined);
      setSelectedToken(undefined);
      setCanDisplayMyTvl(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  ////////////////////////////
  //   Events and actions   //
  ////////////////////////////

  const onVestingContractDetailTabChange = useCallback(
    (activeKey: string) => {
      consoleOut('Selected tab option:', activeKey, 'blue');
      // /vesting/:vestingContract/:activeTab
      const url = `${VESTING_ROUTE_BASE_PATH}/${vestingContract}/${activeKey}`;
      navigate(url);
    },
    [navigate, vestingContract],
  );

  const onMainFeatureTabChange = useCallback(
    (newKey: string) => {
      consoleOut('Selected tab option:', newKey, 'blue');

      const url = `${VESTING_ROUTE_BASE_PATH}/${newKey}`;
      navigate(url);
    },
    [navigate],
  );

  const loadMoreActivity = useCallback(() => {
    if (!vestingContract) {
      return;
    }
    getContractActivity(vestingContract);
  }, [getContractActivity, vestingContract]);

  const reloadVestingContracts = useCallback(
    (manual = false) => {
      if (manual) {
        refreshVestingContracts();
      } else {
        refreshVestingContracts(true);
      }
    },
    [refreshVestingContracts],
  );

  ///////////////
  // Rendering //
  ///////////////

  //#region Vesting contract feature
  const listOfBadges = ['DeFi', 'Vesting', 'Payment Streaming'];

  const renderBalanceContracts = (
    <a
      href={`${MEANFI_DOCS_URL}products/developers/smart-contracts`}
      target="_blank"
      rel="noopener noreferrer"
      className="simplelink underline-on-hover"
    >
      Tracking 1 smart contract
    </a>
  );

  const renderProtocol = () => {
    const programAddress = appConfig.getConfig().streamV2ProgramAddress;
    return (
      <AddressDisplay
        address={programAddress}
        maxChars={isLgDevice ? 12 : 6}
        linkText="Token Vesting"
        iconStyles={{ width: '15', height: '15' }}
        newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${programAddress}${getSolanaExplorerClusterParam()}`}
      />
    );
  };

  const renderBalance = () => {
    return (
      <>
        {loadingStreams || loadingTreasuries || !canDisplayMyTvl ? (
          <IconLoading className="mean-svg-icons" style={{ height: '12px', lineHeight: '12px' }} />
        ) : (
          <>
            {unallocatedBalance && unallocatedBalance > 0 ? (
              <span>{toUsCurrency(unallocatedBalance)}</span>
            ) : (
              <span>$0.0</span>
            )}
          </>
        )}
      </>
    );
  };

  const renderVestingProtocolHeader = () => {
    return (
      <div className="two-column-layout mb-2 right-info-container">
        <div className="left right-info-group">
          <span className="info-label">Protocol</span>
          <span className="info-value">{renderProtocol()}</span>
          <div className="info-content">
            {listOfBadges.map((badge, index) => (
              <span key={`${badge}+${index}`} className="badge darken medium mr-1">
                {badge}
              </span>
            ))}
          </div>
        </div>
        <div className="right right-info-group">
          <span className="info-label">Balance (My TVL)</span>
          <span className="info-value">{renderBalance()}</span>
          <span className="info-content">{renderBalanceContracts}</span>
        </div>
      </div>
    );
  };

  const renderFeatureCtaRow = () => {
    return (
      <div className="flex-fixed-right cta-row mb-2 pl-1">
        <Space className="left" size="middle" wrap>
          <Button
            type="default"
            shape="round"
            size="small"
            key="button-item-01"
            className="thin-stroke"
            disabled={isBusy}
            onClick={showVestingContractCreateModal}
          >
            <span>Create vesting contract</span>
          </Button>
        </Space>
      </div>
    );
  };

  const renderFeatureSummary = () => {
    return (
      <div className="tab-inner-content-wrapper vertical-scroll">
        <p>
          Token vesting allows teams and companies to release locked tokens over time according to a pre-determined
          contract release rate. Locked vesting contracts are perfect for investors and token locks as they can not be
          paused or cancelled.
        </p>
        <p>
          Investors and recipients of the token vesting contracts will be able to redeem their tokens using MeanFi's
          Payment Streaming App under their accounts.
        </p>
        <div className="mb-1">Links and Socials</div>
        <AppSocialLinks appSocialLinks={appSocialLinks} />
      </div>
    );
  };

  const renderListOfContracts = () => {
    return (
      <div className="tab-inner-content-wrapper vertical-scroll">
        <VestingContractList
          msp={paymentStreaming}
          streamingAccounts={treasuryList}
          selectedAccount={selectedVestingContract}
          loadingVestingAccounts={loadingTreasuries}
          onAccountSelected={(item: PaymentStreamingAccount | undefined) => onSelectVestingContract(item)}
        />
      </div>
    );
  };

  const renderFeatureTabset = () => {
    const tabs = [
      {
        key: 'summary',
        label: 'Summary',
        children: renderFeatureSummary(),
      },
      {
        key: 'contracts',
        label: `Contracts ${
          !loadingTreasuries && !loadingStreams && treasuryList.length > 0 ? `(${treasuryList.length})` : ''
        }`,
        children: renderListOfContracts(),
      },
    ];

    return (
      <Tabs
        items={tabs}
        activeKey={mainFeatureTab}
        onChange={onMainFeatureTabChange}
        className="neutral stretch-content"
      />
    );
  };

  //#endregion

  //#region Vesting contract details

  const renderVestingContractDetailMenuItems = () => {
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

  const renderVestingContractDetailCtaRow = () => {
    const items = assetCtas.filter(m => m.isVisible && m.uiComponentType === 'button');

    return (
      <div className="flex-fixed-right cta-row mb-2 pl-1">
        <Space className="left" size="middle" wrap>
          {items &&
            items.length > 0 &&
            items.map((item: MetaInfoCta, index: number) => {
              if (item.tooltip) {
                return (
                  <Tooltip placement="bottom" title={item.tooltip} key={`${index + 11}-${item.uiComponentId}`}>
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
                    key={`${index + 22}-${item.uiComponentId}`}
                    className="thin-stroke"
                    disabled={item.disabled}
                    onClick={item.callBack}
                  >
                    <span>{item.caption}</span>
                  </Button>
                );
              }
            })}
        </Space>
        <Dropdown menu={renderVestingContractDetailMenuItems()} placement="bottomRight" trigger={['click']}>
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

  const renderVestingContractDetailTabset = useCallback(() => {
    if (!selectedVestingContract) {
      return <span>&nbsp;</span>;
    }

    const items = [];
    items.push({
      key: 'overview',
      label: 'Overview',
      children: (
        <VestingContractOverview
          availableStreamingBalance={availableStreamingBalance}
          isXsDevice={isXsDevice}
          selectedToken={workingToken}
          streamTemplate={streamTemplate}
          vestingContract={selectedVestingContract}
          vestingContractFlowRate={vestingContractFlowRate}
        />
      ),
    });
    items.push({
      key: 'streams',
      label: selectedVestingContract.totalStreams > 0 ? `Streams (${selectedVestingContract.totalStreams})` : 'Streams',
      children: (
        <VestingContractStreamList
          accountAddress={selectedAccount.address}
          isMultisigTreasury={isMultisigContext}
          loadingTreasuryStreams={loadingTreasuryStreams}
          minRequiredBalance={minRequiredBalance}
          msp={paymentStreaming}
          selectedMultisig={selectedMultisig}
          selectedToken={workingToken}
          multisigAccounts={multisigAccounts}
          multisigClient={multisigClient}
          nativeBalance={nativeBalance}
          streamTemplate={streamTemplate}
          treasuryStreams={treasuryStreams}
          userBalances={userBalances}
          vestingContract={selectedVestingContract}
        />
      ),
    });
    items.push({
      key: 'activity',
      label: 'Activity',
      children: (
        <VestingContractActivity
          contractActivity={contractActivity}
          hasMoreStreamActivity={hasMoreContractActivity}
          loadingStreamActivity={loadingContractActivity}
          onLoadMoreActivities={loadMoreActivity}
          selectedToken={workingToken}
          vestingContract={selectedVestingContract}
        />
      ),
    });

    return (
      <Tabs
        items={items}
        activeKey={activeTab}
        onChange={onVestingContractDetailTabChange}
        className="neutral stretch-content"
      />
    );
  }, [
    activeTab,
    isXsDevice,
    workingToken,
    userBalances,
    nativeBalance,
    streamTemplate,
    multisigClient,
    treasuryStreams,
    paymentStreaming,
    contractActivity,
    selectedMultisig,
    multisigAccounts,
    isMultisigContext,
    minRequiredBalance,
    loadingTreasuryStreams,
    selectedAccount.address,
    hasMoreContractActivity,
    loadingContractActivity,
    selectedVestingContract,
    vestingContractFlowRate,
    availableStreamingBalance,
    onVestingContractDetailTabChange,
    loadMoreActivity,
  ]);

  //#endregion

  //#region Other rendering areas

  const renderRefreshCta = useCallback(() => {
    return (
      <div className="float-top-right mr-1 mt-1">
        <span className="icon-button-container secondary-button">
          <Tooltip placement="bottom" title={t('vesting.refresh-tooltip')}>
            <Button
              type="default"
              shape="circle"
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => reloadVestingContracts(true)}
            />
          </Tooltip>
          <div id="hard-refresh-contracts-cta" onClick={() => refreshVestingContracts(true)}></div>
          <div id="soft-refresh-contracts-cta" onClick={() => refreshVestingContracts(false)}></div>
        </span>
      </div>
    );
  }, [refreshVestingContracts, reloadVestingContracts, t]);

  //#endregion

  // Render normal UI
  return (
    <>
      {/* Refresh cta */}
      {renderRefreshCta()}

      {/* Vesting contract details */}
      {detailsPanelOpen ? (
        <div className="flexible-column-bottom">
          <div className="top">
            <div className="mb-2">
              <div onClick={navigateToContracts} className="back-button icon-button-container">
                <IconArrowBack className="mean-svg-icons" />
                <span className="ml-1">See all contracts</span>
              </div>
            </div>
            <VestingContractDetails
              isXsDevice={isXsDevice}
              loadingVestingContractFlowRate={loadingVestingContractFlowRate}
              selectedToken={workingToken}
              streamTemplate={streamTemplate}
              vestingContract={selectedVestingContract}
              vestingContractFlowRate={vestingContractFlowRate}
            />
            {/* Render CTAs row here */}
            {renderVestingContractDetailCtaRow()}

            {/* Alert to offer refresh vesting contract */}
            {selectedVestingContract && hasBalanceChanged() && (
              <div className="alert-info-message mb-2">
                <Alert
                  message={
                    <>
                      <span>This vesting contract received an incoming funds transfer.&nbsp;</span>
                      <span className="simplelink underline" onClick={() => onExecuteRefreshVestingContractBalance()}>
                        Refresh the account data
                      </span>
                      <span>&nbsp;to update the account balance.</span>
                    </>
                  }
                  type="info"
                  showIcon
                />
              </div>
            )}
          </div>
          <div className="bottom">{renderVestingContractDetailTabset()}</div>
        </div>
      ) : (
        <div className="flexible-column-bottom">
          <div className="top">
            {renderVestingProtocolHeader()}
            {renderFeatureCtaRow()}
          </div>
          <div className="bottom">{renderFeatureTabset()}</div>
        </div>
      )}

      {isVestingContractCreateModalVisible && (
        <VestingContractCreateModal
          accountAddress={selectedAccount.address}
          handleClose={closeVestingContractCreateModal}
          handleOk={(options: VestingContractCreateOptions) => onAcceptCreateVestingContract(options)}
          isBusy={isBusy}
          isMultisigContext={isMultisigContext}
          isVisible={isVestingContractCreateModalVisible}
          loadingMultisigAccounts={loadingMultisigAccounts}
          nativeBalance={nativeBalance}
          selectedList={selectedList}
          selectedMultisig={selectedMultisig}
          selectedToken={workingToken}
          transactionFees={createVestingContractTxFees}
          userBalances={userBalances}
        />
      )}

      {isAddFundsModalVisible && (
        <VestingContractAddFundsModal
          handleClose={closeAddFundsModal}
          handleOk={(params: VestingContractTopupParams) => onAcceptAddFunds(params)}
          isBusy={isBusy}
          isVisible={isAddFundsModalVisible}
          nativeBalance={nativeBalance}
          minRequiredBalance={minRequiredBalance}
          selectedMultisig={selectedMultisig}
          selectedToken={workingToken}
          streamTemplate={streamTemplate}
          transactionFees={transactionFees}
          treasuryStreams={treasuryStreams}
          userBalances={userBalances}
          vestingContract={selectedVestingContract}
          withdrawTransactionFees={withdrawTransactionFees}
        />
      )}

      {isEditContractSettingsModalOpen && vestingContract && (
        <VestingContractEditModal
          accountAddress={vestingContract || ''}
          handleClose={hideEditContractSettingsModal}
          isBusy={isBusy}
          isMultisigContext={isMultisigContext}
          isVisible={isEditContractSettingsModalOpen}
          loadingMultisigAccounts={loadingMultisigAccounts}
          nativeBalance={nativeBalance}
          onTransactionStarted={(options: VestingContractEditOptions) => onAcceptEditContractSettings(options)}
          selectedMultisig={selectedMultisig}
          selectedToken={workingToken}
          streamTemplate={streamTemplate}
          transactionFees={transactionFees}
          vestingContract={selectedVestingContract}
        />
      )}

      {isVestingContractSolBalanceModalOpen && vestingContract && (
        <VestingContractSolBalanceModal
          address={vestingContract || ''}
          isVisible={isVestingContractSolBalanceModalOpen}
          handleClose={hideVestingContractSolBalanceModal}
          treasuryBalance={treasuryEffectiveBalance}
        />
      )}

      {isCreateStreamModalVisible && selectedVestingContract && (
        <VestingContractCreateStreamModal
          handleClose={closeCreateStreamModal}
          handleOk={(options: VestingContractStreamCreateOptions) => onAcceptCreateStream(options)}
          isBusy={isBusy}
          isMultisigTreasury={isMultisigContext}
          isVisible={isCreateStreamModalVisible}
          isXsDevice={isXsDevice}
          minRequiredBalance={minRequiredBalance}
          nativeBalance={nativeBalance}
          selectedMultisig={selectedMultisig}
          selectedToken={workingToken}
          streamTemplate={streamTemplate}
          transactionFees={transactionFees}
          vestingContract={selectedVestingContract}
          withdrawTransactionFees={withdrawTransactionFees}
        />
      )}

      {isVestingContractCloseModalOpen && selectedVestingContract && (
        <VestingContractCloseModal
          handleClose={hideVestingContractCloseModal}
          handleOk={(title: string) => onAcceptCloseVestingContractModal(title)}
          isBusy={isBusy}
          isVisible={isVestingContractCloseModalOpen}
          nativeBalance={nativeBalance}
          selectedMultisig={isMultisigContext ? selectedMultisig : undefined}
          transactionFees={transactionFees}
          treasuryBalance={treasuryEffectiveBalance}
          vestingContract={selectedVestingContract}
        />
      )}

      {isVestingContractTransferFundsModalVisible && (
        <VestingContractWithdrawFundsModal
          handleClose={closeVestingContractTransferFundsModal}
          handleOk={(options: VestingContractWithdrawOptions) => onAcceptVestingContractTransferFunds(options)}
          isBusy={isBusy}
          isMultisigTreasury={isMultisigContext}
          isVisible={isVestingContractTransferFundsModalVisible}
          minRequiredBalance={minRequiredBalance}
          nativeBalance={nativeBalance}
          selectedMultisig={selectedMultisig}
          transactionFees={transactionFees}
          vestingContract={selectedVestingContract}
        />
      )}
    </>
  );
};

export default VestingView;
