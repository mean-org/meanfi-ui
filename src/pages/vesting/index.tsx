import React, { useEffect, useState, useContext, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from "react-i18next";
import { AppStateContext } from "../../contexts/appstate";
import { IconMoneyTransfer, IconVerticalEllipsis } from "../../Icons";
import { PreFooter } from "../../components/PreFooter";
import { Alert, Button, Dropdown, Menu, notification, Space, Tabs, Tooltip } from 'antd';
import { consoleOut, copyText, delay, getDurationUnitFromSeconds, getReadableDate, getTransactionStatusForLogs, isDev, isLocal, isProd, toTimestamp } from '../../utils/ui';
import { useWallet } from '../../contexts/wallet';
import { useConnectionConfig } from '../../contexts/connection';
import { AccountInfo, ConfirmOptions, Connection, LAMPORTS_PER_SOL, ParsedAccountData, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import {
  calculateActionFees,
  MSP,
  MSP_ACTIONS,
  Stream,
  TransactionFees,
  Treasury,
  Constants as MSPV2Constants,
  StreamTemplate,
  Category,
  TreasuryType,
  VestingTreasuryActivity,
} from '@mean-dao/msp';
import "./style.scss";
import { AnchorProvider, Program } from '@project-serum/anchor';
import SerumIDL from '../../models/serum-multisig-idl';
import { ArrowLeftOutlined, ReloadOutlined, WarningFilled } from '@ant-design/icons';
import { fetchAccountTokens, findATokenAddress, formatThousands, getTokenAmountAndSymbolByTokenAddress, getTxIxResume, makeDecimal, shortenAddress } from '../../utils/utils';
import { openNotification } from '../../components/Notifications';
import { MIN_SOL_BALANCE_REQUIRED, NO_FEES, WRAPPED_SOL_MINT_ADDRESS } from '../../constants';
import { VestingContractList } from './components/VestingContractList';
import { VestingContractDetails } from './components/VestingContractDetails';
import useWindowSize from '../../hooks/useWindowResize';
import { isMobile } from 'react-device-detect';
import { MetaInfoCta } from '../../models/common-types';
import { EventType, MetaInfoCtaAction, OperationType, PaymentRateType, TransactionStatus } from '../../models/enums';
import { VestingContractCreateForm } from './components/VestingContractCreateForm';
import { TokenInfo } from '@solana/spl-token-registry';
import { VestingContractCreateModal } from './components/VestingContractCreateModal';
import { VestingContractOverview } from './components/VestingContractOverview';
import { CreateVestingTreasuryParams, getCategoryLabelByValue, VestingContractCreateOptions, VestingContractEditOptions, VestingContractStreamCreateOptions, VestingContractTopupParams, VestingContractWithdrawOptions, VestingFlowRateInfo, vestingFlowRatesCache } from '../../models/vesting';
import { VestingContractStreamList } from './components/VestingContractStreamList';
import { useNativeAccount } from '../../contexts/accounts';
import { DEFAULT_EXPIRATION_TIME_SECONDS, getFees, MeanMultisig, MEAN_MULTISIG_PROGRAM, MultisigInfo, MultisigParticipant, MultisigTransactionFees, MULTISIG_ACTIONS } from '@mean-dao/mean-multisig-sdk';
import { NATIVE_SOL_MINT, TOKEN_PROGRAM_ID } from '../../utils/ids';
import { appConfig, customLogger } from '../..';
import { InspectedAccountType } from '../accounts';
import { confirmationEvents, TxConfirmationContext, TxConfirmationInfo } from '../../contexts/transaction-status';
import { VestingContractSolBalanceModal } from './components/VestingContractSolBalanceModal';
import { VestingContractAddFundsModal } from './components/VestingContractAddFundsModal';
import { VestingContractCloseModal } from './components/VestingContractCloseModal';
import { segmentAnalytics } from '../../App';
import { AppUsageEvent, SegmentRefreshAccountBalanceData, SegmentStreamAddFundsData, SegmentStreamCreateData, SegmentVestingContractCloseData, SegmentVestingContractCreateData, SegmentVestingContractWithdrawData } from '../../utils/segment-service';
import { ZERO_FEES } from '../../models/multisig';
import { VestingContractCreateStreamModal } from './components/VestingContractCreateStreamModal';
import { VestingContractWithdrawFundsModal } from './components/VestingContractWithdrawFundsModal';
import { VestingContractActivity } from './components/VestingContractActivity';
import { AccountLayout, u64 } from '@solana/spl-token';
import { refreshTreasuryBalanceInstruction } from '@mean-dao/money-streaming';
import { BN } from 'bn.js';
import { PendingProposalsComponent } from './components/PendingProposalsComponent';
import { NATIVE_SOL } from '../../utils/tokens';
import { VestingContractEditModal } from './components/VestingContractEditModal';
import { getTokenAccountBalanceByAddress, readAccountInfo } from '../../utils/accounts';

const { TabPane } = Tabs;
export const VESTING_ROUTE_BASE_PATH = '/vesting';
export type VestingAccountDetailTab = "overview" | "streams" | "activity" | undefined;
let isWorkflowLocked = false;

export const VestingView = () => {
  const {
    userTokens,
    splTokenList,
    isWhitelisted,
    transactionStatus,
    streamV2ProgramAddress,
    pendingMultisigTxCount,
    previousWalletConnectState,
    setHighLightableMultisigId,
    setPendingMultisigTxCount,
    setHighLightableStreamId,
    setIsVerifiedRecipient,
    getTokenPriceByAddress,
    setLockPeriodFrequency,
    getTokenPriceBySymbol,
    getTokenByMintAddress,
    setTransactionStatus,
    setLockPeriodAmount,
    setPaymentStartDate,
    refreshTokenBalance,
    setRecipientAddress,
    setFromCoinAmount,
    setSelectedToken,
  } = useContext(AppStateContext);
  const {
    enqueueTransactionConfirmation
  } = useContext(TxConfirmationContext);
  const location = useLocation();
  const navigate = useNavigate();
  const connectionConfig = useConnectionConfig();
  const [searchParams] = useSearchParams();
  const { address, vestingContract, activeTab } = useParams();
  const { t } = useTranslation('common');
  const { width } = useWindowSize();
  const { publicKey, wallet, connected } = useWallet();
  const { account } = useNativeAccount();
  const [isPageLoaded, setIsPageLoaded] = useState<boolean>(false);
  const [loadingTreasuries, setLoadingTreasuries] = useState(true);
  const [treasuriesLoaded, setTreasuriesLoaded] = useState(false);
  const [treasuryList, setTreasuryList] = useState<Treasury[]>([]);
  const [loadingTreasuryStreams, setLoadingTreasuryStreams] = useState(false);
  const [signalRefreshTreasuryStreams, setSignalRefreshTreasuryStreams] = useState(false);
  const [treasuryStreams, setTreasuryStreams] = useState<(Stream)[]>([]);
  // Path params values
  const [accountAddress, setAccountAddress] = useState('');
  const [vestingContractAddress, setVestingContractAddress] = useState<string>('');
  const [accountDetailTab, setAccountDetailTab] = useState<VestingAccountDetailTab>(undefined);
  const [inspectedAccountType, setInspectedAccountType] = useState<InspectedAccountType>(undefined);
  // Selected vesting contract
  const [selectedVestingContract, setSelectedVestingContract] = useState<Treasury | undefined>(undefined);
  const [streamTemplate, setStreamTemplate] = useState<StreamTemplate | undefined>(undefined);
  const [isXsDevice, setIsXsDevice] = useState<boolean>(isMobile);
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
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [canSubscribe, setCanSubscribe] = useState(true);
  const [transactionFees, setTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [createVestingContractTxFees, setCreateVestingContractTxFees] = useState<TransactionFees>(NO_FEES);
  const [withdrawTransactionFees, setWithdrawTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [multisigTxFees, setMultisigTxFees] = useState<MultisigTransactionFees>(ZERO_FEES);
  const [minRequiredBalance, setMinRequiredBalance] = useState(0);
  const [needReloadMultisigs, setNeedReloadMultisigs] = useState(true);
  const [loadingMultisigAccounts, setLoadingMultisigAccounts] = useState(false);
  const [multisigAccounts, setMultisigAccounts] = useState<MultisigInfo[]>([]);
  const [selectedMultisig, setSelectedMultisig] = useState<MultisigInfo | undefined>(undefined);
  const [vestingContractFlowRate, setVestingContractFlowRate] = useState<VestingFlowRateInfo | undefined>(undefined);
  const [loadingVestingContractFlowRate, setLoadingVestingContractFlowRate] = useState(false);
  const [loadingContractActivity, setLoadingContractActivity] = useState(false);
  const [contractActivity, setContractActivity] = useState<VestingTreasuryActivity[]>([]);
  const [hasMoreContractActivity, setHasMoreContractActivity] = useState<boolean>(true);
  const [availableStreamingBalance, setAvailableStreamingBalance] = useState(0);
  const [associatedTokenBalance, setAssociatedTokenBalance] = useState(0);
  const [associatedTokenDecimals, setAssociatedTokenDecimals] = useState(6);
  const [detailsPanelOpen, setDetailsPanelOpen] = useState(false);
  const [autoOpenDetailsPanel, setAutoOpenDetailsPanel] = useState(false);

  /////////////////////////
  //  Setup & Init code  //
  /////////////////////////

  // Perform premature redirects if no workflow was provided in path
  useEffect(() => {
    if (!publicKey) { return; }

    // /vesting/:address/contracts
    consoleOut('pathname:', location.pathname, 'crimson');
    if (!address) {
      const url = `${VESTING_ROUTE_BASE_PATH}/${publicKey.toBase58()}/contracts`;
      consoleOut('No address, redirecting to:', url, 'orange');
      setAutoOpenDetailsPanel(false);
      setTreasuriesLoaded(false);
      navigate(url);
    }
    // In any case, set the flag isPageLoaded a bit later
    setTimeout(() => {
      setIsPageLoaded(true);
    }, 5);
  }, [address, location.pathname, navigate, publicKey, vestingContract]);

  // Enable deep-linking when isPageLoaded
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

    if (vestingContract) {
      consoleOut('Route param vestingContract:', vestingContract, 'crimson');
      setVestingContractAddress(vestingContract);
    } else {
      setVestingContractAddress('');
    }

    if (activeTab) {
      consoleOut('Route param activeTab:', activeTab, 'crimson');
      setAccountDetailTab(activeTab as VestingAccountDetailTab);
    }

    if (autoOpenDetailsPanel) {
      setDetailsPanelOpen(true);
    }

    let accountTypeInQuery: string | null = null;
    // Get the account-type if passed-in
    if (searchParams) {
      accountTypeInQuery = searchParams.get('account-type');
      if (accountTypeInQuery && accountTypeInQuery === "multisig") {
        consoleOut('account-type:', accountTypeInQuery, 'crimson');
        setInspectedAccountType("multisig");
      } else {
        setInspectedAccountType(undefined);
      }
    } else {
      setInspectedAccountType(undefined);
    }

  }, [accountAddress, activeTab, address, autoOpenDetailsPanel, isPageLoaded, publicKey, searchParams, vestingContract]);

  // Create and cache the connection
  const connection = useMemo(() => new Connection(connectionConfig.endpoint, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true
  }), [
    connectionConfig.endpoint
  ]);

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

  // Create and cache Money Streaming Program V2 instance
  const msp = useMemo(() => {
    if (publicKey) {
      console.log('New MSP from treasuries');
      return new MSP(
        connectionConfig.endpoint,
        streamV2ProgramAddress,
        "confirmed"
      );
    }
    return undefined;
  }, [
    connectionConfig.endpoint,
    publicKey,
    streamV2ProgramAddress
  ]);

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

  const selectedVestingContractRef = useRef(selectedVestingContract);
  useEffect(() => {
    selectedVestingContractRef.current = selectedVestingContract;
  }, [selectedVestingContract]);


  /////////////////
  //  Callbacks  //
  /////////////////

  const isUnderDevelopment = () => {
    return isLocal() || (isDev() && isWhitelisted) ? true : false;
  };

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

  const resetTransactionStatus = useCallback(() => {

    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });

  }, [
    setTransactionStatus
  ]);

  const getTransactionFees = useCallback(async (action: MSP_ACTIONS): Promise<TransactionFees> => {
    return await calculateActionFees(connection, action);
  }, [connection]);

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
        event = success ? AppUsageEvent.VestingContractWithdrawFundsCompleted : AppUsageEvent.VestingContractWithdrawFundsFailed;
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

  // Setup event handler for Tx confirmed
  const onTxConfirmed = useCallback((item: TxConfirmationInfo) => {

    const path = window.location.pathname;
    if (!path.startsWith(VESTING_ROUTE_BASE_PATH)) {
      return;
    }

    const softReloadContracts = () => {
      const contractsRefreshCta = document.getElementById("soft-refresh-contracts-cta");
      if (contractsRefreshCta) {
        contractsRefreshCta.click();
      } else {
        console.log('element not found:', '#soft-refresh-contracts-cta', 'red');
      }
    };

    const hardReloadContracts = () => {
      const contractsRefreshCta = document.getElementById("hard-refresh-contracts-cta");
      if (contractsRefreshCta) {
        contractsRefreshCta.click();
      } else {
        console.log('element not found:', '#hard-refresh-contracts-cta', 'red');
      }
    };

    const turnOffLockWorkflow = () => {
      isWorkflowLocked = false;
    }

    const notifyMultisigVestingContractActionFollowup = async (message1: string, message2: string, item: TxConfirmationInfo) => {
      if (!item || !item.extras || !item.extras.multisigId) {
        turnOffLockWorkflow();
        return;
      }
      openNotification({
        type: "info",
        description: (<span>{message1}</span>),
        duration: 8,
      });
      await delay(8000);
      openNotification({
        type: "info",
        description: (<span>{message2}</span>),
        duration: 8,
      });
      await delay(8000);
      const myNotifyKey = `notify-${Date.now()}`;
      openNotification({
        type: "info",
        key: myNotifyKey,
        description: (
          <>
            <div className="mb-1">The proposal's status can be reviewed in the Multsig Safe's proposal list.</div>
            <Button
              type="primary"
              size="small"
              shape="round"
              className="extra-small"
              onClick={() => {
                const url = `/multisig/${item.extras.multisigId}?v=proposals`;
                setHighLightableMultisigId(item.extras.multisigId);
                navigate(url);
                notification.close(myNotifyKey);
              }}>
              See proposals
            </Button>
          </>
        ),
        duration: 30,
        handleClose: turnOffLockWorkflow
      });
    }

    switch (item.operationType) {
      case OperationType.TreasuryAddFunds:
      case OperationType.TreasuryRefreshBalance:
      case OperationType.StreamClose:
      case OperationType.StreamAddFunds:
      case OperationType.StreamPause:
      case OperationType.StreamResume:
        consoleOut(`onTxConfirmed event handled for operation ${OperationType[item.operationType]}`, item, 'crimson');
        recordTxConfirmation(item.signature, item.operationType, true);
        softReloadContracts();
        break;
      case OperationType.TreasuryClose:
        consoleOut(`onTxConfirmed event handled for operation ${OperationType[item.operationType]}`, item, 'crimson');
        recordTxConfirmation(item.signature, item.operationType, true);
        if (!isWorkflowLocked) {
          isWorkflowLocked = true;
          notifyMultisigVestingContractActionFollowup(
            'To close the vesting contract, the other Multisig owners need to approve the proposal.',
            'After the proposal has been approved and executed, the contract will be closed and all remaining funds will be sent to the treasurer.',
            item
          );
        }
        setTimeout(() => {
          hardReloadContracts();
        }, 20);
        break;
      case OperationType.TreasuryCreate:
        consoleOut(`onTxConfirmed event handled for operation ${OperationType[item.operationType]}`, item, 'crimson');
        recordTxConfirmation(item.signature, item.operationType, true);
        if (!isWorkflowLocked) {
          isWorkflowLocked = true;
          notifyMultisigVestingContractActionFollowup(
            'To complete the vesting contract setup, the other Multisig owners need to approve the proposal.',
            'After the proposal has been approved and executed, you will then be able to create vesting streams within the contract.',
            item
          );
        }
        setTimeout(() => {
          hardReloadContracts();
        }, 20);
        break;
      case OperationType.TreasuryStreamCreate:
        consoleOut(`onTxConfirmed event handled for operation ${OperationType[item.operationType]}`, item, 'crimson');
        recordTxConfirmation(item.signature, item.operationType, true);
        if (!isWorkflowLocked) {
          isWorkflowLocked = true;
          notifyMultisigVestingContractActionFollowup(
            'To complete the vesting stream set up, the other Multisig owners need to approve the proposal.',
            'After the proposal has been approved and executed, the vesting stream will be scheduled.',
            item
          );
        }
        setTimeout(() => {
          softReloadContracts();
        }, 20);
        break;
      case OperationType.TreasuryWithdraw:
        consoleOut(`onTxConfirmed event handled for operation ${OperationType[item.operationType]}`, item, 'crimson');
        recordTxConfirmation(item.signature, item.operationType, true);
        if (!isWorkflowLocked) {
          isWorkflowLocked = true;
          notifyMultisigVestingContractActionFollowup(
            'To complete the unallocated vesting funds withdrawal, the other Multisig owners need to approve the proposal.',
            'After the proposal has been approved and executed, the vesting funds will be sent to the address specified.',
            item
          );
        }
        setTimeout(() => {
          hardReloadContracts();
        }, 20);
        break;
      default:
        break;
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, setHighLightableMultisigId]);

  // Setup event handler for Tx confirmation error
  const onTxTimedout = useCallback((item: TxConfirmationInfo) => {

    const hardReloadContracts = () => {
      const contractsRefreshCta = document.getElementById("hard-refresh-contracts-cta");
      if (contractsRefreshCta) {
        contractsRefreshCta.click();
      }
    };

    if (item) {
      consoleOut("onTxTimedout event executed:", item, 'crimson');
      recordTxConfirmation(item.signature, item.operationType, false);
      if (item.operationType === OperationType.TreasuryCreate) {
        openNotification({
          title: 'Create vesting contract status',
          description: 'The transaction to create the vesting contract was not confirmed within 40 seconds. Solana may be congested right now. This page needs to be reloaded to verify the contract was successfully created.',
          duration: null,
          type: "info",
          handleClose: () => hardReloadContracts()
        });
      }
    }
  }, [
    recordTxConfirmation,
  ]);

  const canPerformAnyAction = useCallback(() => {
    const itsMe = accountAddress && publicKey && publicKey.toBase58() === accountAddress ? true : false;
    return itsMe || isMultisigContext ? true : false;
  }, [accountAddress, isMultisigContext, publicKey]);

  const navigateToVestingContract = useCallback((contractId: string) => {
    if (accountAddress && contractId) {
      let url = `${VESTING_ROUTE_BASE_PATH}/${accountAddress}/contracts/${contractId}`;
      if (accountDetailTab) {
        url += `/${accountDetailTab}`
      }
      const param = getQueryAccountType();
      if (param && param === "multisig") {
        url += '?account-type=multisig';
      }
      navigate(url);
    }
  }, [accountAddress, accountDetailTab, getQueryAccountType, navigate]);

  const getContractFinishDate = useCallback(() => {
    if (streamTemplate) {
      // Payment start date
      const startDate = streamTemplate.startUtc as string;
      const periodUnits = streamTemplate.durationNumberOfUnits;
      const periodAmount = streamTemplate.rateIntervalInSeconds;
      // Start date timestamp
      const sdTimestamp = toTimestamp(startDate);
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
      const startDate = new Date(streamTemplate.startUtc as string);
      const finishDate = getContractFinishDate();
      const hastStarted = now > startDate ? true : false;
      const hasFinished = finishDate && finishDate > now ? true : false;
      return hastStarted && !hasFinished ? true : false;
    }
    return false;
  }, [getContractFinishDate, streamTemplate]);

  const onSelectVestingContract = useCallback((item: Treasury | undefined) => {
    if (accountAddress && item) {
      navigateToVestingContract(item.id.toString());
      setAutoOpenDetailsPanel(true);
    }
  }, [accountAddress, navigateToVestingContract]);

  const getAllUserV2Accounts = useCallback(async (account: string) => {

    if (!msp) { return []; }

    setTimeout(() => {
      setLoadingTreasuries(true);
    });

    const pk = new PublicKey(account);

    return await msp.listTreasuries(pk, true, true, Category.vesting);

  }, [msp]);

  const refreshVestingContracts = useCallback((reset = false) => {

    if (!connection || !publicKey || !msp || !accountAddress) { return; }

    // Before fetching the list of vesting contracts, clear the cache of flow rates
    vestingFlowRatesCache.clear();
    setNeedReloadMultisigs(true);

    getAllUserV2Accounts(accountAddress)
      .then(treasuries => {
        consoleOut('Streaming accounts:', treasuries, 'blue');
        setTreasuryList(treasuries.map(vc => {
          return Object.assign({}, vc, {
            name: vc.name.trim()
          })
        }));
        if (treasuries.length > 0) {
          // /vesting/:address/contracts/:vestingContract
          if (reset) {
            const contractId = treasuries[0].id.toString();
            navigateToVestingContract(contractId);
          } else if (vestingContractAddress) {
            const item = treasuries.find(i => i.id === vestingContractAddress);
            if (item) {
              navigateToVestingContract(item.id.toString());
            }
          }
        }
      })
      .catch(error => {
        console.error(error);
      })
      .finally(() => setLoadingTreasuries(false));

  }, [accountAddress, connection, getAllUserV2Accounts, msp, navigateToVestingContract, publicKey, vestingContractAddress]);

  const getTreasuryStreams = useCallback((treasuryPk: PublicKey) => {
    if (!publicKey || !msp || loadingTreasuryStreams) { return; }

    setTimeout(() => {
      setLoadingTreasuryStreams(true);
    });

    consoleOut('Executing getTreasuryStreams...', '', 'blue');

    msp.listStreams({treasury: treasuryPk })
      .then(streams => {
        consoleOut('treasuryStreams:', streams, 'blue');
        setTreasuryStreams(streams.map(vc => {
          return Object.assign({}, vc, {
            name: vc.name.trim()
          })
        }));
      })
      .catch((err: any) => {
        console.error(err);
        setTreasuryStreams([]);
      })
      .finally(() => {
        setLoadingTreasuryStreams(false);
      });

  }, [
    msp,
    publicKey,
    loadingTreasuryStreams,
  ]);

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

  const isMultisigTreasury = useCallback((treasury?: Treasury) => {

    const treasuryInfo = treasury ?? selectedVestingContract;

    if (!treasuryInfo || treasuryInfo.version < 2 || !treasuryInfo.treasurer || !publicKey) {
      return false;
    }

    const contextAddress = new PublicKey(accountAddress);
    const treasurer = new PublicKey(treasuryInfo.treasurer as string);
    const isMultisigContext = getQueryAccountType() === "multisig" && accountAddress && treasuryInfo.treasurer ? true : false;

    if (isMultisigContext && treasurer.equals(contextAddress) && multisigAccounts && multisigAccounts.findIndex(m => m.authority.equals(treasurer)) !== -1) {
      return true;
    }

    return false;

  }, [accountAddress, getQueryAccountType, multisigAccounts, publicKey, selectedVestingContract]);

  const parseSerumMultisigAccount = useCallback((info: any) => {

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
  }, []);

  const getMultisigIdFromContext = useCallback(() => {

    if (!multisigAccounts || !selectedMultisig || !accountAddress) { return ''; }

    if (getQueryAccountType() === "multisig") {
      const multisig = multisigAccounts.find(t => t.authority.toBase58() === accountAddress);
      if (multisig) {
        return multisig.id.toBase58();
      }
    }

    return '';

  }, [accountAddress, getQueryAccountType, multisigAccounts, selectedMultisig])

  // const getAvailableStreamingBalance = useCallback(() => {
  //   if (!selectedVestingContract) { return 0; }

  //   const token = getTokenByMintAddress(selectedVestingContract.associatedToken as string);

  //   if (token) {
  //     const unallocated = selectedVestingContract.balance - selectedVestingContract.allocationAssigned;
  //     const ub = makeDecimal(new BN(unallocated), token.decimals);
  //     return ub >= 0 ? ub : 0;
  //   }

  //   return 0;
  // }, [getTokenByMintAddress, selectedVestingContract]);

  const getContractActivity = useCallback((streamId: string, clearHistory = false) => {
    if (!streamId || !msp || loadingContractActivity) {
      return;
    }

    consoleOut('Loading stream activity...', '', 'crimson');

    setLoadingContractActivity(true);
    const streamPublicKey = new PublicKey(streamId);

    const before = clearHistory
      ? ''
      : contractActivity && contractActivity.length > 0
        ? contractActivity[contractActivity.length - 1].signature
        : '';
    consoleOut('before:', before, 'crimson');
    msp.listVestingTreasuryActivity(streamPublicKey, before, 5, "confirmed")
      .then(value => {
        consoleOut('VC Activity:', value);
        const activities = clearHistory
          ? []
          : contractActivity && contractActivity.length > 0
            ? JSON.parse(JSON.stringify(contractActivity))
            : [];

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

  }, [loadingContractActivity, msp, contractActivity]);

  const clearFormValues = useCallback(() => {
    setIsVerifiedRecipient(false);
    const today = new Date().toLocaleDateString("en-US");
    setLockPeriodFrequency(PaymentRateType.PerMonth);
    setPaymentStartDate(today);
    setRecipientAddress('');
    setLockPeriodAmount('');
    setFromCoinAmount('');
    setWorkingToken(selectedList[0]);
    setSelectedToken(selectedList[0]);
  }, [
    selectedList,
    setSelectedToken,
    setFromCoinAmount,
    setLockPeriodAmount,
    setPaymentStartDate,
    setRecipientAddress,
    setIsVerifiedRecipient,
    setLockPeriodFrequency,
  ]);

  const refreshMultisigs = useCallback(() => {

    if (!publicKey ||
        !multisigClient ||
        !multisigSerumClient ||
        !accountAddress ||
        loadingMultisigAccounts) {
      return;
    }

    setTimeout(() => {
      setLoadingMultisigAccounts(true);
    });

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
          .finally(() => {
            console.log('multisigClient.getMultisigs finished running');
            setLoadingMultisigAccounts(false);
          });
      })
      .catch((err: any) => {
        console.error(err);
        setPendingMultisigTxCount(undefined);
        setLoadingMultisigAccounts(false);
        console.error('multisigSerumClient.account.multisig.all finished running with failure');
      });

  }, [
    publicKey,
    accountAddress,
    multisigClient,
    multisigSerumClient,
    loadingMultisigAccounts,
    parseSerumMultisigAccount,
    setPendingMultisigTxCount,
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
    if (!publicKey || !selectedVestingContract || !streamTemplate) { return true; }
    return isStartDateGone(streamTemplate.startUtc as string);
  }, [isStartDateGone, publicKey, selectedVestingContract, streamTemplate]);


  //////////////
  //  Modals  //
  //////////////


  // Create vesting contract modal
  const [isVestingContractCreateModalVisible, setIsVestingContractCreateModalVisibility] = useState(false);
  const showVestingContractCreateModal = useCallback(() => setIsVestingContractCreateModalVisibility(true), []);
  const closeVestingContractCreateModal = useCallback(() => setIsVestingContractCreateModalVisibility(false), []);

  const onVestingContractCreated = useCallback(() => {
    closeVestingContractCreateModal();
    refreshTokenBalance();
    clearFormValues();
  }, [clearFormValues, closeVestingContractCreateModal, refreshTokenBalance]);

  const onExecuteCreateVestingContractTransaction = useCallback(async (createOptions: VestingContractCreateOptions) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    let generatedVestingContractId = '';
    const transactionLog: any[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createTreasury = async (data: CreateVestingTreasuryParams) => {

      if (!connection || !msp || !publicKey) { return null; }

      /**
       * payer: PublicKey
       * treasurer: PublicKey
       * label: string
       * type: TreasuryType
       * solFeePayedByTreasury: boolean
       * treasuryAssociatedTokenMint: PublicKey
       * duration: number
       * durationUnit: TimeUnit
       * fundingAmount: number
       * vestingCategory: SubCategory
       * startUtc?: Date | undefined
       * cliffVestPercent?: number | undefined
       * feePayedByTreasurer?: boolean | undefined
       */

      const solFeePayedByTreasury = data.multisig ? true : false;

      if (!data.multisig) {
        consoleOut('received data:', data, 'blue');
        return await msp.createVestingTreasury(
          new PublicKey(data.treasurer),                        // payer
          new PublicKey(data.treasurer),                        // treasurer
          data.label,                                           // label
          data.type,                                            // type
          solFeePayedByTreasury,                                // solFeePayedByTreasury
          new PublicKey(data.associatedTokenAddress),           // treasuryAssociatedTokenMint
          data.duration,                                        // duration
          data.durationUnit,                                    // durationUnit
          data.fundingAmount,                                   // fundingAmount
          data.vestingCategory,                                 // vestingCategory
          data.startUtc,                                        // startUtc
          data.cliffVestPercent,                                // cliffVestPercent
          data.feePayedByTreasurer,                             // feePayedByTreasurer
        );
      }

      if (!multisigClient || !multisigAccounts) { return null; }

      const multisig = multisigAccounts.filter(m => m.id.toBase58() === data.multisig)[0];

      if (!multisig) { return null; }

      // Create Streaming account
      // const createTreasuryTx = await msp.createTreasury(
      //   publicKey,                                        // payer
      //   multisig.authority,                               // treasurer
      //   new PublicKey(data.associatedTokenAddress),       // associatedToken
      //   data.label,                                       // label
      //   data.type,                                        // type
      //   true,                                             // solFeePayedByTreasury = true
      // );

      const treasuryAssociatedTokenMint = new PublicKey(data.associatedTokenAddress);
      const createTreasuryTx = await msp.createVestingTreasury(
        publicKey,                                            // payer
        multisig.authority,                                   // treasurer
        data.label,                                           // label
        data.type,                                            // type
        solFeePayedByTreasury,                                // solFeePayedByTreasury
        treasuryAssociatedTokenMint,                          // treasuryAssociatedTokenMint
        data.duration,                                        // duration
        data.durationUnit,                                    // durationUnit
        data.fundingAmount,                                   // fundingAmount
        data.vestingCategory,                                 // vestingCategory
        data.startUtc,                                        // startUtc
        data.cliffVestPercent,                                // cliffVestPercent
        data.feePayedByTreasurer,                             // feePayedByTreasurer
      );

      const ixData = Buffer.from(createTreasuryTx[0].instructions[0].data);
      const ixAccounts = createTreasuryTx[0].instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      // Add a pre-instruction to create the treasurer ATA if it doesn't exist
      // const createTreasurerAtaIx = await getCreateAtaInstructionIfNotExists(
      //   connection,
      //   multisig.authority,
      //   treasuryAssociatedTokenMint,
      //   publicKey);
      // const preInstructions = createTreasurerAtaIx ? [createTreasurerAtaIx] : undefined;

      const tx = await multisigClient.createTransaction(
        publicKey,
        "Create Vesting Contract",
        "", // description
        new Date(expirationTime * 1_000),
        OperationType.TreasuryCreate,
        multisig.id,
        MSPV2Constants.MSP, // program
        ixAccounts,         // keys o accounts of the Ix
        ixData,             // data of the Ix
        // preInstructions
      );

      if (!tx) { return null; }

      createTreasuryTx[0] = tx;

      return createTreasuryTx;
    }

    const createTx = async () => {

      if (!connection || !wallet || !publicKey || !msp) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Create vesting account transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut("Start transaction for Create vesting account", '', 'blue');
      consoleOut('Wallet address:', publicKey.toBase58());

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      const multisigId = getMultisigIdFromContext();
      const associatedToken = createOptions.token;
      const price = workingToken ? getTokenPriceByAddress(workingToken.address) || getTokenPriceBySymbol(workingToken.symbol) : 0;

      const payload: CreateVestingTreasuryParams = {
        payer: publicKey,                                                       // payer
        treasurer: publicKey,                                                   // treasurer
        label: createOptions.vestingContractName,                               // label
        type: createOptions.vestingContractType,                                // type
        duration: createOptions.duration,                                       // duration
        durationUnit: createOptions.durationUnit,                               // durationUnit
        fundingAmount: createOptions.fundingAmount,                             // fundingAmount
        associatedTokenAddress: associatedToken.address,                        // treasuryAssociatedTokenMint
        cliffVestPercent: createOptions.cliffVestPercent,                       // cliffVestPercent
        vestingCategory: createOptions.vestingCategory,                         // vestingCategory
        startUtc: createOptions.startDate,                                      // startUtc
        multisig: multisigId,                                                   // multisig
        feePayedByTreasurer: createOptions.feePayedByTreasurer                  // feePayedByTreasurer
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
        durationUnit: getDurationUnitFromSeconds(createOptions.durationUnit),
        feePayedByTreasurer: createOptions.feePayedByTreasurer,
        multisig: multisigId,
        startUtc: getReadableDate(createOptions.startDate.toUTCString()),
        type: TreasuryType[createOptions.vestingContractType]
      };
      consoleOut('segment data:', segmentData, 'brown');
      segmentAnalytics.recordEvent(AppUsageEvent.StreamCreateFormButton, segmentData);

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

      const bf = transactionFees.blockchainFee;       // Blockchain fee
      const ff = transactionFees.mspFlatFee;          // Flat fee (protocol)
      const mp = multisigTxFees.networkFee + multisigTxFees.multisigFee + multisigTxFees.rentExempt;  // Multisig proposal
      const minRequired = multisigId ? mp : bf + ff;

      setMinRequiredBalance(minRequired);

      consoleOut('Min balance required:', minRequired, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance < minRequired) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${
            getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
          }) to pay for network fees (${
            getTokenAmountAndSymbolByTokenAddress(minRequired, NATIVE_SOL_MINT.toBase58())
          })`
        });
        customLogger.logWarning('Create vesting account transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut('Starting Create vesting account using MSP V2...', '', 'blue');

      const result = await createTreasury(payload)
        .then(value => {
          // TODO: Log the error
          if (!value) { return false; }
          consoleOut('Create vesting account returned transaction:', value);
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction
          });
          if (value instanceof Transaction) {
            transaction = value;
          } else {
            transaction = value[0];
            generatedVestingContractId = value[1].toBase58();
          }
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
            result: getTxIxResume(transaction)
          });
          return true;
        })
        .catch(error => {
          console.error('Create vesting account error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Create vesting account transaction failed', { transcript: transactionLog });
          return false;
        });

      return result;
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet && publicKey) {
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
              result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logError('Create vesting account transaction failed', { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: publicKey.toBase58()}
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
            result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logError('Create vesting account transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        console.error('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot sign transaction! Wallet not found!'
        });
        customLogger.logError('Create vesting account transaction failed', { transcript: transactionLog });
        return false;
      }
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
            customLogger.logError('Create Treasury transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Create vesting account transaction failed', { transcript: transactionLog });
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
            const extraAmountMessage = createOptions.amount
              ? ` with ${formatThousands(
                  parseFloat(createOptions.amount),
                  createOptions.token.decimals
                )} ${createOptions.token.symbol}`
              : '';
            const loadingMessage = isMultisigContext
              ? `Send proposal to create the vesting contract ${createOptions.vestingContractName}`
              : `Create vesting contract ${createOptions.vestingContractName}${extraAmountMessage}`;
            const completedMessage = isMultisigContext
              ? `Proposal to create the vesting contract ${createOptions.vestingContractName} was submitted for Multisig approval.`
              : `Vesting contract ${createOptions.vestingContractName} created successfully`;
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.TreasuryCreate,
              finality: "confirmed",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage,
              completedTitle: "Transaction confirmed",
              completedMessage,
              extras: {
                vestingContractId: generatedVestingContractId,
                multisigId: createOptions.multisig
              }
            });
            setIsBusy(false);
            resetTransactionStatus();
            onVestingContractCreated();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  },[
    msp,
    wallet,
    publicKey,
    connection,
    workingToken,
    nativeBalance,
    multisigClient,
    multisigAccounts,
    isMultisigContext,
    transactionCancelled,
    multisigTxFees.networkFee,
    multisigTxFees.rentExempt,
    multisigTxFees.multisigFee,
    transactionFees.mspFlatFee,
    transactionFees.blockchainFee,
    transactionStatus.currentOperation,
    enqueueTransactionConfirmation,
    onVestingContractCreated,
    getMultisigIdFromContext,
    getTokenPriceByAddress,
    resetTransactionStatus,
    getTokenPriceBySymbol,
    setTransactionStatus,
  ]);

  const onAcceptCreateVestingContract = useCallback((data: VestingContractCreateOptions) => {
    consoleOut('Create vesting contract options:', data, 'blue');
    onExecuteCreateVestingContractTransaction(data);
  }, [onExecuteCreateVestingContractTransaction]);

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
    getTransactionFees(MSP_ACTIONS.closeTreasury).then(value => {
      setTransactionFees(value);
      consoleOut('transactionFees:', value, 'orange');
    });
    setIsVestingContractCloseModalOpen(true);
  }, [getTransactionFees, resetTransactionStatus]);

  const onAcceptCloseVestingContractModal = () => {
    onExecuteCloseTreasuryTransaction();
  };

  const onCloseTreasuryTransactionFinished = () => {
    hideVestingContractCloseModal();
    refreshTokenBalance();
    resetTransactionStatus();
  };

  const onExecuteCloseTreasuryTransaction = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    setTransactionCancelled(false);
    setIsBusy(true);

    const closeTreasury = async (data: any) => {

      if (!msp) { return null; }

      if (!isMultisigTreasury()) {
        return await msp.closeTreasury(
          new PublicKey(data.treasurer),              // treasurer
          new PublicKey(data.treasurer),              // treasurer
          new PublicKey(data.treasury),               // treasury
          true                                        // TODO: Define if the user can determine this
        );
      }

      if (!selectedVestingContract || !multisigClient || !multisigAccounts || !publicKey) { return null; }

      const treasury = selectedVestingContract as Treasury;
      const multisig = multisigAccounts.filter(m => m.authority.toBase58() === treasury.treasurer)[0];

      if (!multisig) { return null; }

      const closeTreasury = await msp.closeTreasury(
        publicKey,                                  // payer
        multisig.authority,                         // TODO: This should come from the UI        
        new PublicKey(data.treasury),               // treasury
        false
      );

      const ixData = Buffer.from(closeTreasury.instructions[0].data);
      const ixAccounts = closeTreasury.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
        publicKey,
        "Close Vesting Contract",
        "", // description
        new Date(expirationTime * 1_000),
        OperationType.TreasuryClose,
        multisig.id,
        MSPV2Constants.MSP,
        ixAccounts,
        ixData
      );

      return tx;
    }

    const createTx = async (): Promise<boolean> => {
      if (!publicKey || !selectedVestingContract || !msp) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Close Vesting Contract transaction failed', { transcript: transactionLog });
        return false;
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      const treasury = new PublicKey(selectedVestingContract.id as string);
      const data = {
        treasurer: publicKey.toBase58(),                      // treasurer
        treasury: treasury.toBase58()                         // treasury
      }
      consoleOut('data:', data);

      // Report event to Segment analytics
      const segmentData: SegmentVestingContractCloseData = {
        contractName: selectedVestingContract.name,
        subCategory: getCategoryLabelByValue(selectedVestingContract.subCategory),
        type: TreasuryType[selectedVestingContract.treasuryType]
      };
      consoleOut('segment data:', segmentData, 'brown');
      segmentAnalytics.recordEvent(AppUsageEvent.VestingContractCloseFormButton, segmentData);

      // Log input data
      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
        inputs: data
      });

      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
        result: ''
      });

      // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
      // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee

      const bf = transactionFees.blockchainFee;       // Blockchain fee
      const ff = transactionFees.mspFlatFee;          // Flat fee (protocol)
      const mp = multisigTxFees.networkFee + multisigTxFees.multisigFee + multisigTxFees.rentExempt;  // Multisig proposal
      const minRequired = isMultisigTreasury() ? mp : bf + ff;

      setMinRequiredBalance(minRequired);

      consoleOut('Min balance required:', minRequired, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance < minRequired) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${
            getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
          }) to pay for network fees (${
            getTokenAmountAndSymbolByTokenAddress(minRequired, NATIVE_SOL_MINT.toBase58())
          })`
        });
        customLogger.logWarning('Close Vesting Contract transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut('Starting Close Vesting Contract using MSP V2...', '', 'blue');
      // Create a transaction
      const result = closeTreasury(data)
        .then(value => {
          if (!value) { return false; }
          consoleOut('closeTreasury returned transaction:', value);
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
          console.error('closeTreasury error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Close Vesting Contract transaction failed', { transcript: transactionLog });
          return false;
        });

      return result;
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet && publicKey) {
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
              result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logError('Close Vesting Contract transaction failed', { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: publicKey.toBase58()}
          });
          return true;
        })
        .catch(error => {
          console.error('Signing transaction failed!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('Close Vesting Contract transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        console.error('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot sign transaction! Wallet not found!'
        });
        customLogger.logError('Close Vesting Contract transaction failed', { transcript: transactionLog });
        return false;
      }
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
            customLogger.logError('Close Vesting Contract transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Close Vesting Contract transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet && selectedVestingContract) {
      const created = await createTx();
      consoleOut('created:', created, 'blue');
      if (created && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('sign:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.TreasuryClose,
              finality: "finalized",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: `Closing vesting contract: ${selectedVestingContract.name}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `Vesting contract ${selectedVestingContract.name} successfully closed`,
              extras: {
                vestingContractId: selectedVestingContract.id as string,
                multisigId: getMultisigIdFromContext()
              }
            });
            setIsBusy(false);
            onCloseTreasuryTransactionFinished();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  // Add funds modal
  const [isAddFundsModalVisible, setIsAddFundsModalVisibility] = useState(false);
  const showAddFundsModal = useCallback(() => {
    resetTransactionStatus();
    setHighLightableStreamId(undefined);
    if (vestingContract) {
      getTransactionFees(MSP_ACTIONS.addFunds).then(value => {
        setTransactionFees(value);
        consoleOut('transactionFees:', value, 'orange');
      });
      getTransactionFees(MSP_ACTIONS.withdraw).then(value => {
        setWithdrawTransactionFees(value);
        consoleOut('withdrawTransactionFees:', value, 'orange');
      });
      setIsAddFundsModalVisibility(true);
    }
  }, [getTransactionFees, resetTransactionStatus, setHighLightableStreamId, vestingContract]);

  const onAcceptAddFunds = (params: VestingContractTopupParams) => {
    consoleOut('AddFunds params:', params, 'blue');
    onExecuteAddFundsTransaction(params);
  };

  const closeAddFundsModal = useCallback(() => {
    resetTransactionStatus();
    setIsAddFundsModalVisibility(false);
  }, [resetTransactionStatus]);

  const onExecuteAddFundsTransaction = async (params: VestingContractTopupParams) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const addFunds = async (data: any) => {

      if (!msp) { return null; }

      if (!isMultisigTreasury() || !params.fundFromSafe) {
        if (data.stream === '') {
          return await msp.addFunds(
            new PublicKey(data.payer),                    // payer
            new PublicKey(data.contributor),              // contributor
            new PublicKey(data.treasury),                 // treasury
            new PublicKey(data.associatedToken),          // associatedToken
            data.amount,                                  // amount
          );
        }

        return await msp.allocate(
          new PublicKey(data.payer),                   // payer
          new PublicKey(data.contributor),             // treasurer
          new PublicKey(data.treasury),                // treasury
          new PublicKey(data.stream),                  // stream
          data.amount,                                 // amount
        );
      }

      if (!selectedVestingContract || !multisigClient || !multisigAccounts || !publicKey) { return null; }

      const treasury = selectedVestingContract as Treasury;
      const multisig = multisigAccounts.filter(m => m.authority.toBase58() === treasury.treasurer)[0];

      if (!multisig) { return null; }
      let operationType = OperationType.StreamAddFunds;
      let addFundsTx: Transaction;

      if (data.stream) {
        addFundsTx = await msp.allocate(
          new PublicKey(data.payer),                   // payer
          new PublicKey(multisig.authority),           // treasurer
          new PublicKey(data.treasury),                // treasury
          new PublicKey(data.stream),                  // stream
          data.amount,                                 // amount
        );
      } else {
        operationType = OperationType.TreasuryAddFunds;
        addFundsTx = await msp.addFunds(
          new PublicKey(data.payer),                    // payer
          new PublicKey(data.contributor),              // contributor
          new PublicKey(data.treasury),                 // treasury
          new PublicKey(data.associatedToken),          // associatedToken
          data.amount,                                  // amount
        );
      }

      const ixData = Buffer.from(addFundsTx.instructions[0].data);
      const ixAccounts = addFundsTx.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
        publicKey,
        data.proposalTitle || "Add Funds",
        "", // description
        new Date(expirationTime * 1_000),
        operationType,
        multisig.id,
        MSPV2Constants.MSP,
        ixAccounts,
        ixData
      );

      return tx;
    }

    const createTx = async (): Promise<boolean> => {

      if (!publicKey || !selectedVestingContract || !params || !params.associatedToken || !msp) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Treasury Add funds transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut("Start transaction for treasury addFunds", '', 'blue');
      consoleOut('Wallet address:', publicKey.toBase58());

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      const treasury = new PublicKey(selectedVestingContract.id);
      const associatedToken = new PublicKey(params.associatedToken.address);
      const amount = params.tokenAmount.toNumber();
      const token = params.associatedToken;
      const price = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);
      const contributor = params.contributor || publicKey.toBase58();

      const data = {
        proposalTitle: params.proposalTitle,                      // proposalTitle
        payer: publicKey.toBase58(),                              // payer
        contributor: contributor,                                 // contributor
        treasury: treasury.toBase58(),                            // treasury
        associatedToken: associatedToken.toBase58(),              // associatedToken
        stream: params.streamId ? params.streamId : '',           // stream
        amount,                                                   // amount
      }
      consoleOut('data:', data);

      // Report event to Segment analytics
      const segmentData: SegmentStreamAddFundsData = {
        stream: data.stream,
        contributor: data.contributor,
        treasury: data.treasury,
        asset: `${token.symbol} [${token.address}]`,
        assetPrice: price,
        amount: parseFloat(params.amount),
        valueInUsd: price * parseFloat(params.amount)
      };
      consoleOut('segment data:', segmentData, 'brown');
      segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupApproveFormButton, segmentData);


      // Log input data
      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
        inputs: data
      });

      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
        result: ''
      });

      // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
      // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee

      const bf = transactionFees.blockchainFee;       // Blockchain fee
      const ff = transactionFees.mspFlatFee;          // Flat fee (protocol)
      const mp = multisigTxFees.networkFee + multisigTxFees.multisigFee + multisigTxFees.rentExempt;  // Multisig proposal
      const minRequired = isMultisigTreasury() ? mp : bf + ff;

      setMinRequiredBalance(minRequired);

      consoleOut('Min balance required:', minRequired, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance < minRequired) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${
            getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
          }) to pay for network fees (${
            getTokenAmountAndSymbolByTokenAddress(minRequired, NATIVE_SOL_MINT.toBase58())
          })`
        });
        customLogger.logWarning('Treasury Add funds transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut('Starting Add Funds using MSP V2...', '', 'blue');
      // Create a transaction
      const result = await addFunds(data)
        .then((value: Transaction | null) => {
          if (!value) { return false; }
          consoleOut('addFunds returned transaction:', value);
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
          console.error('addFunds error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Treasury Add funds transaction failed', { transcript: transactionLog });
          return false;
        });

      return result;
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet && publicKey) {
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
              result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logError('Treasury Add funds transaction failed', { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: publicKey.toBase58()}
          });
          return true;
        })
        .catch(error => {
          console.error('Signing transaction failed!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('Treasury Add funds transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        console.error('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot sign transaction! Wallet not found!'
        });
        customLogger.logError('Treasury Add funds transaction failed', { transcript: transactionLog });
        return false;
      }
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
            customLogger.logError('Treasury Add funds transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Treasury Add funds transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (publicKey && selectedVestingContract) {
      const created = await createTx();
      consoleOut('created:', created, 'blue');
      if (created && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('sign:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.TreasuryAddFunds,
              finality: "confirmed",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: `${params.streamId ? 'Fund stream with' : 'Fund vesting contract with'} ${formatThousands(
                parseFloat(params.amount),
                params.associatedToken?.decimals
              )} ${params.associatedToken?.symbol}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `${params.streamId ? 'Stream funded with' : 'Vesting contract funded with'} ${formatThousands(
                parseFloat(params.amount),
                params.associatedToken?.decimals
              )} ${params.associatedToken?.symbol}`,
              extras: {
                vestingContractId: selectedVestingContract.id as string,
                multisigId: getMultisigIdFromContext(),
                streamId: params.streamId
              }
            });
            setIsBusy(false);
            closeAddFundsModal();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  // Create stream modal (VestingContractCreateStream)
  const [isCreateStreamModalVisible, setIsCreateStreamModalVisibility] = useState(false);
  const showCreateStreamModal = useCallback(() => {
    resetTransactionStatus();
    if (vestingContract) {
      getTransactionFees(MSP_ACTIONS.createStreamWithFunds).then(value => {
        setTransactionFees(value);
        consoleOut('transactionFees:', value, 'orange');
      });
      getTransactionFees(MSP_ACTIONS.withdraw).then(value => {
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

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    let generatedStremId = '';
    const transactionLog: any[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createVestingStream = async (data: any): Promise<[Transaction, PublicKey] | null> => {

      if (!connection || !msp || !publicKey) { return null; }

      consoleOut('createVestingStream received data:', data, 'blue');

      if (!data.multisig) {
        return await msp.createStreamWithTemplate(
          publicKey,                                                                // payer
          publicKey,                                                                // treasurer
          new PublicKey(data.treasury),                                             // treasury
          new PublicKey(data.beneficiary),                                          // beneficiary
          data.allocationAssigned,                                                  // allocationAssigned
          data.streamName                                                           // streamName
        );
      }

      if (!multisigClient || !multisigAccounts) { return null; }

      const multisig = multisigAccounts.filter(m => m.authority.toBase58() === data.multisig)[0];
      consoleOut('createVestingStream filtered multisig:', multisig.authority.toBase58(), 'blue');

      if (!multisig) { return null; }

      const timestampTostring = (Date.now() / 1000).toString();
      const timeStampCounter = new u64(parseInt(timestampTostring));
      consoleOut('timeStampCounter:', timeStampCounter.toString(), 'blue');
      const [stream, streamBump] = await PublicKey.findProgramAddress(
        [multisig.id.toBuffer(), timeStampCounter.toBuffer()],
        MEAN_MULTISIG_PROGRAM
      );

      consoleOut('data.treasury:', data.treasury, 'blue');
      consoleOut('data.treasuryAssociatedTokenMint:', data.treasuryAssociatedTokenMint, 'blue');
      consoleOut('selectedVestingContract:', selectedVestingContract, 'blue');
      consoleOut('associatedToken == treasuryAssociatedTokenMint?', selectedVestingContract?.associatedToken === data.treasuryAssociatedTokenMint ? 'true' : 'false', 'blue');

      /**
       * payer: PublicKey
       * treasurer: PublicKey
       * treasury: PublicKey
       * stream: PublicKey
       * beneficiary: PublicKey
       * treasuryAssociatedTokenMint: PublicKey
       * allocationAssigned: number
       * streamName?: string | undefined
       */
      const createStreamTx = await msp.createStreamWithTemplateFromPda(
        publicKey,                                                                // payer
        multisig.authority,                                                       // treasurer
        new PublicKey(data.treasury),                                             // treasury
        stream,                                                                   // stream
        new PublicKey(data.beneficiary),                                          // beneficiary
        data.allocationAssigned,                                                  // allocationAssigned
        data.streamName,                                                          // streamName
      );

      const ixData = Buffer.from(createStreamTx.instructions[0].data);
      const ixAccounts = createStreamTx.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createMoneyStreamTransaction(
        publicKey,
        "Create Vesting Stream",
        "", // description
        new Date(expirationTime * 1_000),
        timeStampCounter.toNumber(),
        streamBump,
        OperationType.TreasuryStreamCreate,
        multisig.id,
        MSPV2Constants.MSP, // program
        ixAccounts,         // keys o accounts of the Ix
        ixData,             // data of the Ix
      );

      if (!tx) { return null; }

      return [tx, stream];
    };

    const createTx = async (): Promise<boolean> => {

      if (!publicKey || !msp || !selectedVestingContract || !params.associatedToken) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Create Vesting Stream transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut('Wallet address:', publicKey.toBase58());

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      const associatedToken = params.associatedToken.address === WRAPPED_SOL_MINT_ADDRESS
        ? NATIVE_SOL
        : params.associatedToken;
      consoleOut('associatedToken:', associatedToken.toString(), 'blue');
      const treasury = new PublicKey(selectedVestingContract.id as string);
      // const treasurer = new PublicKey(selectedVestingContract.treasurer as string);
      const treasurer = isMultisigContext && selectedMultisig
        ? selectedMultisig.authority
        : publicKey;
      const price = associatedToken ? getTokenPriceByAddress(associatedToken.address) || getTokenPriceBySymbol(associatedToken.symbol) : 0;
      const amount = makeDecimal(new BN(params.tokenAmount), associatedToken.decimals);

      // Create a transaction
      const data = {
        payer: publicKey.toBase58(),                                    // payer
        treasurer: treasurer.toBase58(),                                // treasurer
        treasury: treasury.toBase58(),                                  // treasury
        beneficiary: params.beneficiaryAddress,                         // beneficiary
        treasuryAssociatedTokenMint: associatedToken.address,           // treasuryAssociatedTokenMint
        allocationAssigned: params.tokenAmount,                         // allocationAssigned
        streamName: params.streamName,                                  // streamName
        multisig: params.multisig                                       // expose multisig if present
      };
      consoleOut('data:', data);

      // Report event to Segment analytics
      const segmentData: SegmentStreamCreateData = {
        asset: associatedToken.symbol,
        assetPrice: price,
        treasury: selectedVestingContract.id as string,
        beneficiary: params.beneficiaryAddress,
        allocation: amount,
        rateAmount: params.rateAmount,
        interval: params.interval,
        category: selectedVestingContract.category,
        feePayedByTreasurer: params.feePayedByTreasurer,
        valueInUsd: amount * price,
      };
      consoleOut('segment data:', segmentData, 'brown');
      segmentAnalytics.recordEvent(AppUsageEvent.StreamCreateFormButton, segmentData);

      // Log input data
      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
        inputs: data
      });

      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
        result: ''
      });

      // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
      // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee

      const minRequired = minRequiredBalance;
      consoleOut('Min balance required:', minRequired, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance < minRequired) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${
            getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
          }) to pay for network fees (${
            getTokenAmountAndSymbolByTokenAddress(minRequired, NATIVE_SOL_MINT.toBase58())
          })`
        });
        customLogger.logWarning('Create Vesting Stream transaction failed', { transcript: transactionLog });
        return false;
      }

      const result = await createVestingStream(data)
        .then(values => {
          if (!values || !values.length) { return false; }
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction
          });
          transaction = values[0];
          generatedStremId = values[1].toBase58();
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
            result: getTxIxResume(values[0])
          });
          return true;
        })
        .catch(error => {
          console.error('createVestingStream error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Create Vesting Stream transaction failed', { transcript: transactionLog });
          return false;
        });

      return result;
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet && publicKey) {
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
              result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logError('Create Vesting Stream transaction failed', { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: publicKey.toBase58()}
          });
          return true;
        })
        .catch(error => {
          console.error('Signing transaction failed!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('Create Vesting Stream transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        console.error('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot sign transaction! Wallet not found!'
        });
        customLogger.logError('Create Vesting Stream transaction failed', { transcript: transactionLog });
        return false;
      }
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
            customLogger.logError('Create Vesting Stream transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Create Vesting Stream transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet && workingToken && selectedVestingContract) {
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
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.TreasuryStreamCreate,
              finality: "confirmed",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: params.txConfirmDescription,
              completedTitle: "Transaction confirmed",
              completedMessage: params.txConfirmedDescription,
              extras: {
                vestingContractId: selectedVestingContract.id as string,
                multisigId: getMultisigIdFromContext(), // params.multisig
                streamId: generatedStremId
              }
            });
            setIsBusy(false);
            closeCreateStreamModal();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  // Transfer funds modal
  const [isVestingContractTransferFundsModalVisible, setIsVestingContractTransferFundsModalVisible] = useState(false);
  const showVestingContractTransferFundsModal = useCallback(() => {
    setIsVestingContractTransferFundsModalVisible(true);
    getTransactionFees(MSP_ACTIONS.treasuryWithdraw).then(value => {
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
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const treasuryWithdraw = async (data: any) => {

      if (!msp) { return null; }

      if (!isMultisigTreasury()) {
        return await msp.treasuryWithdraw(
          new PublicKey(data.payer),              // payer
          new PublicKey(data.destination),        // treasurer
          new PublicKey(data.treasury),           // treasury
          data.amount,                            // amount
          true                                    // TODO: Define if the user can determine this
        );
      }

      if (!selectedVestingContract || !multisigClient || !multisigAccounts || !publicKey) { return null; }

      const treasury = selectedVestingContract as Treasury;
      const multisig = multisigAccounts.filter(m => m.authority.toBase58() === treasury.treasurer)[0];

      if (!multisig) { return null; }

      const msTreasuryWithdraw = await msp.treasuryWithdraw(
        new PublicKey(data.payer),              // payer
        new PublicKey(data.destination),        // treasurer
        new PublicKey(data.treasury),           // treasury
        data.amount,                            // amount
        false
      );

      const ixData = Buffer.from(msTreasuryWithdraw.instructions[0].data);
      const ixAccounts = msTreasuryWithdraw.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
        publicKey,
        "Withdraw Treasury Funds",
        "", // description
        new Date(expirationTime * 1_000),
        OperationType.TreasuryWithdraw,
        multisig.id,
        MSPV2Constants.MSP,
        ixAccounts,
        ixData
      );

      return tx;
    }

    const createTx = async () => {

      if (!connection || !wallet || !publicKey) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Vesting Contract withdraw transaction failed', { transcript: transactionLog });
        return false;
      }

      if (!selectedVestingContract || !msp) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: 'Cannot start transaction! Treasury details or MSP client not found!'
        });
        customLogger.logError('Vesting Contract withdraw transaction failed', { transcript: transactionLog });
        return false;
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      /**
       * payer: PublicKey,
       * destination: PublicKey,
       * treasury: PublicKey,
       * amount: number
       */

      const destinationPk = new PublicKey(params.destinationAccount);
      const treasuryPk = new PublicKey(selectedVestingContract.id);
      const amount = params.tokenAmount;
      const token = params.associatedToken;
      const price = token ? getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol) : 0;

      // Create a transaction
      const payload = {
        payer: publicKey.toBase58(),
        destination: destinationPk.toBase58(),
        treasury: treasuryPk.toBase58(),
        amount: amount.toNumber()
      };
      consoleOut('payload:', payload);

      // Report event to Segment analytics
      const segmentData: SegmentVestingContractWithdrawData = {
        asset: token ? token.symbol : '-',
        assetPrice: price,
        vestingContract: selectedVestingContract.id as string,
        destination: params.destinationAccount,
        amount: parseFloat(params.amount),
        valueInUsd: parseFloat(params.amount) * price
      };
      consoleOut('segment data:', segmentData, 'brown');
      segmentAnalytics.recordEvent(AppUsageEvent.VestingContractWithdrawFundsFormButton, segmentData);

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

      const bf = transactionFees.blockchainFee;       // Blockchain fee
      const ff = transactionFees.mspFlatFee;          // Flat fee (protocol)
      const mp = multisigTxFees.networkFee + multisigTxFees.multisigFee + multisigTxFees.rentExempt;  // Multisig proposal
      const minRequired = isMultisigTreasury() ? mp : bf + ff;

      setMinRequiredBalance(minRequired);

      consoleOut('Min balance required:', minRequired, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance < minRequired) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${
            getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
          }) to pay for network fees (${
            getTokenAmountAndSymbolByTokenAddress(minRequired, NATIVE_SOL_MINT.toBase58())
          })`
        });
        customLogger.logWarning('Vesting Contract withdraw transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut('Starting Treasury Withdraw using MSP V2...', '', 'blue');

      const result = await treasuryWithdraw(payload)
        .then(value => {
          if (!value) { return false; }
          consoleOut('treasuryWithdraw returned transaction:', value);
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
          console.error('treasuryWithdraw error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Vesting Contract withdraw transaction failed', { transcript: transactionLog });
          return false;
        });

      return result;
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet && publicKey) {
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
              result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logError('Vesting Contract withdraw transaction failed', { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: publicKey.toBase58()}
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
            result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logError('Vesting Contract withdraw transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        console.error('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot sign transaction! Wallet not found!'
        });
        customLogger.logError('Vesting Contract withdraw transaction failed', { transcript: transactionLog });
        return false;
      }
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
            customLogger.logError('Vesting Contract withdraw transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Vesting Contract withdraw transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet && params && selectedVestingContract) {
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
            const completedMessage = params.multisig
              ? `Withdrawal of ${formatThousands(
                parseFloat(params.amount),
                params.associatedToken?.decimals
              )} ${params.associatedToken?.symbol} from vesting contract ${selectedVestingContract.name} has been proposed`
              : `Successful withdrawal of ${formatThousands(
                parseFloat(params.amount),
                params.associatedToken?.decimals
              )} ${params.associatedToken?.symbol} from vesting contract ${selectedVestingContract.name}`;
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.TreasuryWithdraw,
              finality: "confirmed",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: `${params.multisig ? 'Proposal to withdraw' : 'Withdraw'} ${formatThousands(
                parseFloat(params.amount),
                params.associatedToken?.decimals
              )} ${params.associatedToken?.symbol} from vesting contract ${selectedVestingContract.name}`,
              completedTitle: "Transaction confirmed",
              completedMessage,
              extras: {
                vestingContractId: selectedVestingContract.id as string,
                multisigId: getMultisigIdFromContext(), // params.multisig
              }
            });
            setIsBusy(false);
            closeVestingContractTransferFundsModal();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  };

  const onRefreshTreasuryBalanceTransactionFinished = useCallback(() => {
    refreshTokenBalance();
    resetTransactionStatus();
  },[refreshTokenBalance, resetTransactionStatus]);

  const onExecuteRefreshVestingContractBalance = useCallback(async() => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const refreshBalance = async (treasury: PublicKey) => {

      if (!connection || !connected || !publicKey || !msp) {
        return false;
      }

      const ixs: TransactionInstruction[] = [];

      const { value } = await connection.getTokenAccountsByOwner(treasury, {
        programId: TOKEN_PROGRAM_ID
      });

      if (!value || !value.length) {
        return false;
      }

      const tokenAddress = value[0].pubkey;
      const tokenAccount = AccountLayout.decode(value[0].account.data);
      const associatedTokenMint = new PublicKey(tokenAccount.mint);
      const mspAddress = new PublicKey(appConfig.getConfig().streamV2ProgramAddress);

      const feeTreasuryAddress: PublicKey = new PublicKey(
        "3TD6SWY9M1mLY2kZWJNavPLhwXvcRsWdnZLRaMzERJBw"
      );

      // TODO: This is imported from SDK V1 ????
      ixs.push(
        await refreshTreasuryBalanceInstruction(
          mspAddress,
          publicKey,
          associatedTokenMint,
          treasury,
          tokenAddress,
          feeTreasuryAddress
        )
      );

      const tx = new Transaction().add(...ixs);
      tx.feePayer = publicKey;
      const { blockhash } = await connection.getLatestBlockhash("recent");
      tx.recentBlockhash = blockhash;

      return tx;
    };

    const refreshTreasuryData = async (data: any) => {

      if (!publicKey || !selectedVestingContract || !msp) { return null; }

      const v2 = selectedVestingContract as Treasury;
      const isNewTreasury = v2.version >= 2 ? true : false;

      if (!isNewTreasury) {
        return await refreshBalance(new PublicKey(data.treasury));
      }

      return await msp.refreshTreasuryData(
        new PublicKey(publicKey),
        new PublicKey(data.treasury)
      );
    }

    const createTx = async (): Promise<boolean> => {

      if (!publicKey || !selectedVestingContract) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Refresh Treasury data transaction failed', { transcript: transactionLog });
        return false;
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      const treasury = new PublicKey(selectedVestingContract.id as string);
      const data = {
        treasurer: publicKey.toBase58(),                      // treasurer
        treasury: treasury.toBase58()                         // treasury
      }
      consoleOut('data:', data);

      // Report event to Segment analytics
      const segmentData: SegmentRefreshAccountBalanceData = {
        treasurer: data.treasurer,
        treasury: data.treasury
      };
      consoleOut('segment data:', segmentData, 'brown');
      segmentAnalytics.recordEvent(AppUsageEvent.RefreshAccountBalanceFormButton, segmentData);

      // Log input data
      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
        inputs: data
      });

      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
        result: ''
      });

      // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
      // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee

      const bf = transactionFees.blockchainFee;       // Blockchain fee
      const ff = transactionFees.mspFlatFee;          // Flat fee (protocol)
      const mp = multisigTxFees.networkFee + multisigTxFees.multisigFee + multisigTxFees.rentExempt;  // Multisig proposal
      const minRequired = isMultisigTreasury() ? mp : bf + ff;

      setMinRequiredBalance(minRequired);

      consoleOut('Min balance required:', minRequired, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance < minRequired) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${
            getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
          }) to pay for network fees (${
            getTokenAmountAndSymbolByTokenAddress(minRequired, NATIVE_SOL_MINT.toBase58())
          })`
        });
        customLogger.logWarning('Refresh Treasury data transaction failed', { transcript: transactionLog });
        return false;
      }

      // Create a transaction
      const result = await refreshTreasuryData(data)
        .then(value => {
          if (!value) { return false; }
          consoleOut('refreshBalance returned transaction:', value);
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
          console.error('refreshBalance error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Refresh Treasury data transaction failed', { transcript: transactionLog });
          return false;
        });

      return result;
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet && publicKey) {
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
              result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logError('Refresh Treasury data transaction failed', { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: publicKey.toBase58()}
          });
          return true;
        })
        .catch(error => {
          console.error('Signing transaction failed!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('Refresh Treasury data transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        console.error('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot sign transaction! Wallet not found!'
        });
        customLogger.logError('Refresh Treasury data transaction failed', { transcript: transactionLog });
        return false;
      }
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
            customLogger.logError('Refresh Treasury data transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Refresh Treasury data transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet && selectedVestingContract) {
      const created = await createTx();
      consoleOut('created:', created);
      if (created && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('sign:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.TreasuryRefreshBalance,
              finality: "confirmed",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: `Refresh balance for vesting contract ${selectedVestingContract.name}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `Refresh balance successful for vesting contract ${selectedVestingContract.name}`,
              extras: {
                vestingContractId: selectedVestingContract.id as string,
                multisigId: ''
              }
            });
            setIsBusy(false);
            onRefreshTreasuryBalanceTransactionFinished();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  },[
    msp,
    wallet,
    connected,
    publicKey,
    connection,
    nativeBalance,
    multisigTxFees,
    selectedVestingContract,
    transactionCancelled,
    transactionFees.mspFlatFee,
    transactionFees.blockchainFee,
    transactionStatus.currentOperation,
    onRefreshTreasuryBalanceTransactionFinished,
    enqueueTransactionConfirmation,
    resetTransactionStatus,
    setTransactionStatus,
    isMultisigTreasury,
  ]);

  // Edit vesting contract settings
  const [isEditContractSettingsModalOpen, setIsEditContractSettingsModalOpen] = useState(false);
  const hideEditContractSettingsModal = useCallback(() => setIsEditContractSettingsModalOpen(false), []);
  const showEditContractSettingsModal = useCallback(() => setIsEditContractSettingsModalOpen(true), []);

  const onAcceptEditContractSettings = (params: VestingContractEditOptions) => {
    consoleOut('params', params, 'blue');
    onExecuteEditContractSettingsTx(params);
  }

  const onExecuteEditContractSettingsTx = (params: VestingContractEditOptions) => {
    // TODO: close a Tx here and adapt as needed
    consoleOut('only missing the Tx...', '', 'blue');
  }

  /////////////////////
  // Data management //
  /////////////////////

  // Detect XS screen
  useEffect(() => {
    if (width < 576) {
      setIsXsDevice(true);
    } else {
      setIsXsDevice(false);
    }
  }, [width]);

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

  // Create Vesting contract fees
  useEffect(() => {
    if (!createVestingContractTxFees.mspFlatFee) {
      getTransactionFees(MSP_ACTIONS.createTreasury).then(value => {
        setCreateVestingContractTxFees(value);
        consoleOut('createVestingContractTxFees:', value, 'orange');
      });
    }
  }, [getTransactionFees, createVestingContractTxFees]);

  // Automatically update all token balances and rebuild token list
  useEffect(() => {

    if (!connection) {
      console.error('No connection');
      return;
    }

    if (!publicKey || !userTokens || !splTokenList) {
      return;
    }

    const meanTokensCopy = new Array<TokenInfo>();
    const userTokensCopy = JSON.parse(JSON.stringify(userTokens)) as TokenInfo[];
    const balancesMap: any = {};
    balancesMap[userTokensCopy[0].address] = nativeBalance;

    const pk = balancesSource
      ? new PublicKey(balancesSource)
      : publicKey;
    fetchAccountTokens(connection, pk)
      .then(accTks => {
        if (accTks) {

          // Build meanTokensCopy including the MeanFi pinned tokens
          userTokensCopy.forEach(item => {
            if (!meanTokensCopy.some(i => i.address === item.address)) {
              meanTokensCopy.push(item);
            }
          });

          // Now add all other items but excluding those in userTokens (only in prod)
          if (isProd()) {
            splTokenList.forEach(item => {
              if (!meanTokensCopy.some(i => i.address === item.address)) {
                meanTokensCopy.push(item);
              }
            });
          }

          // Add owned token accounts to balances map
          // Code to have all tokens sorted by balance
          accTks.forEach(item => {
            balancesMap[item.parsedInfo.mint] = item.parsedInfo.tokenAmount.uiAmount || 0;
          });
          meanTokensCopy.sort((a, b) => {
            if ((balancesMap[a.address] || 0) < (balancesMap[b.address] || 0)) {
              return 1;
            } else if ((balancesMap[a.address] || 0) > (balancesMap[b.address] || 0)) {
              return -1;
            }
            return 0;
          });
          setSelectedList(meanTokensCopy);
          if (!workingToken) {
            setWorkingToken(meanTokensCopy[0]);
            setSelectedToken(meanTokensCopy[0]);
          }

        } else {
          for (const t of userTokensCopy) {
            balancesMap[t.address] = 0;
          }
          // set the list to the userTokens list
          setSelectedList(userTokensCopy);
          if (!workingToken) {
            setWorkingToken(userTokensCopy[0]);
            setSelectedToken(userTokensCopy[0]);
          }
        }
      })
      .catch(error => {
        console.error(error);
        for (const t of userTokensCopy) {
          balancesMap[t.address] = 0;
        }
        setSelectedList(userTokensCopy);
        if (!workingToken) {
          setWorkingToken(userTokensCopy[0]);
          setSelectedToken(userTokensCopy[0]);
        }
      })
      .finally(() => setUserBalances(balancesMap));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    publicKey,
    connection,
    nativeBalance,
    balancesSource,
  ]);

  // Build CTAs
  useEffect(() => {

    // const numMaxCtas = isXsDevice ? 2 : 3;
    const numMaxCtas = 2;
    const actions: MetaInfoCta[] = [];
    let ctaItems = 0;

    // Create Stream
    if (canPerformAnyAction() && !isContractLocked()) {
      actions.push({
        action: MetaInfoCtaAction.VestingContractCreateStreamOnce,
        isVisible: true,
        caption: 'Create stream',
        disabled: availableStreamingBalance === 0,
        uiComponentType: 'button',
        uiComponentId: `button-${MetaInfoCtaAction.VestingContractCreateStreamOnce}`,
        tooltip: '',
        callBack: showCreateStreamModal
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
        callBack: showAddFundsModal
      });
      ctaItems++;
    }

    // Bulk create
    // if (canPerformAnyAction() && !isContractLocked()) {
    //   actions.push({
    //     action: MetaInfoCtaAction.VestingContractCreateStreamBulk,
    //     isVisible: true,
    //     caption: 'Bulk create',
    //     disabled: availableStreamingBalance === 0,
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
      disabled: !canPerformAnyAction() || availableStreamingBalance === 0,
      uiComponentId: `${ctaItems < numMaxCtas ? 'button' : 'menuitem'}-${MetaInfoCtaAction.VestingContractWithdrawFunds}`,
      tooltip: '',
      callBack: showVestingContractTransferFundsModal
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
      callBack: showVestingContractCloseModal
    });
    ctaItems++;

    // View SOL balance
    if (selectedVestingContract && isMultisigTreasury(selectedVestingContract) && !isContractRunning()) {
      actions.push({
        action: MetaInfoCtaAction.VestingContractViewSolBalance,
        caption: 'View SOL balance',
        isVisible: true,
        uiComponentType: ctaItems < numMaxCtas ? 'button' : 'menuitem',
        disabled: !canPerformAnyAction(),
        uiComponentId: `${ctaItems < numMaxCtas ? 'button' : 'menuitem'}-${MetaInfoCtaAction.VestingContractViewSolBalance}`,
        tooltip: '',
        callBack: showVestingContractSolBalanceModal
      });
      ctaItems++;
    }

    // TODO: remove isUnderDevelopment() when releasing
    if (isUnderDevelopment() && canPerformAnyAction() && selectedVestingContract && selectedVestingContract.totalStreams === 0 && !isContractLocked()) {
      actions.push({
        action: MetaInfoCtaAction.VestingContractEditSettings,
        caption: 'Edit contract settings',
        isVisible: true,
        uiComponentType: ctaItems < numMaxCtas ? 'button' : 'menuitem',
        disabled: false,
        uiComponentId: `${ctaItems < numMaxCtas ? 'button' : 'menuitem'}-${MetaInfoCtaAction.VestingContractEditSettings}`,
        tooltip: '',
        callBack: showEditContractSettingsModal
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
      uiComponentId: `${ctaItems < numMaxCtas ? 'button' : 'menuitem'}-${MetaInfoCtaAction.VestingContractRefreshAccount}`,
      tooltip: '',
      callBack: onExecuteRefreshVestingContractBalance
    });
    ctaItems++;

    setAssetCtas(actions);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedVestingContract,
    availableStreamingBalance,
    onExecuteRefreshVestingContractBalance,
    showVestingContractTransferFundsModal,
    showVestingContractSolBalanceModal,
    showEditContractSettingsModal,
    showVestingContractCloseModal,
    showCreateStreamModal,
    canPerformAnyAction,
    isMultisigTreasury,
    isContractRunning,
    showAddFundsModal,
    isContractLocked,
  ]);

  // Load vesting accounts once per page access
  useEffect(() => {

    if (!publicKey || !accountAddress || treasuriesLoaded) { return; }

    consoleOut('Calling refreshTreasuries...', '', 'blue');
    setTreasuriesLoaded(true);
    refreshVestingContracts(true);

  }, [accountAddress, publicKey, refreshVestingContracts, treasuriesLoaded]);

  // Set a vesting contract if passed-in via url if found in list of vesting contracts
  // If not found or not provided, will pick the first one available via redirect
  useEffect(() => {
    const hasNoVestingAccounts = () => treasuriesLoaded && treasuryList && treasuryList.length === 0 ? true : false;

    if (publicKey && accountAddress) {
      if (treasuryList && treasuryList.length > 0) {
        let item: Treasury | undefined = undefined;
        if (vestingContractAddress) {
          item = treasuryList.find(i => i.id === vestingContractAddress);
        }
        if (item) {
          setSelectedVestingContract(item);
          setSignalRefreshTreasuryStreams(true);
          // Clear previous data related to stream activity
          setContractActivity([]);
          setHasMoreContractActivity(true);
          consoleOut('selectedVestingContract:', item, 'blue');
          if (autoOpenDetailsPanel) {
            setDetailsPanelOpen(true);
          }
        } else {
          // /vesting/:address/contracts/:vestingContract
          const contractId = treasuryList[0].id.toString();
          const param = getQueryAccountType();
          let url = `${VESTING_ROUTE_BASE_PATH}/${accountAddress}/contracts/${contractId}`;
          if (param) {
            url += `?account-type=${param}`;
          }
          navigate(url);
        }
      } else if (vestingContractAddress && hasNoVestingAccounts()) {
        const url = `${VESTING_ROUTE_BASE_PATH}/${accountAddress}/contracts`;
        navigate(url);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    publicKey,
    treasuryList,
    accountAddress,
    autoOpenDetailsPanel,
    vestingContractAddress,
  ]);

  // Get the vesting flow rate
  useEffect(() => {
    if (!publicKey || !msp) { return; }

    if (vestingContractAddress && selectedVestingContract &&
        vestingContractAddress === selectedVestingContract.id && workingToken) {
      // First check if there is already a value for this key in the cache
      // Just get the value from cache if already exists and push it to the state
      // Otherwise fetch it, add it to the cache and push it to the state
      const vcFlowRate = vestingFlowRatesCache.get(selectedVestingContract.id);
      if (vcFlowRate) {
        setVestingContractFlowRate(vcFlowRate);
        consoleOut('Set VestingContractFlowRate from cache:', vcFlowRate, 'orange');
        return;
      }

      setLoadingVestingContractFlowRate(true);
      consoleOut('calling getVestingFlowRate:', selectedVestingContract.id as string, 'blue');
      const treasuryPk = new PublicKey(selectedVestingContract.id as string);
      msp.getVestingFlowRate(treasuryPk)
      .then(value => {
        const freshFlowRate: VestingFlowRateInfo = {
          amount: makeDecimal(new BN(value[0]), workingToken.decimals || 6),
          durationUnit: new BN(value[1]).toNumber(),
          streamableAmount: makeDecimal(new BN(value[2]), workingToken.decimals || 6),
        };
        consoleOut('flowRate:', freshFlowRate, 'darkgreen');
        vestingFlowRatesCache.add(selectedVestingContract.id as string, freshFlowRate);
        setVestingContractFlowRate(freshFlowRate);
      })
      .catch(error => console.error('', error))
      .finally(() => setLoadingVestingContractFlowRate(false));
    }
  }, [msp, publicKey, workingToken, selectedVestingContract, vestingContractAddress]);

  // Keep Vesting contract ATA balance
  useEffect(() => {

    const getStreamingAccountAtaBalance = async (address: string, streamingAccountAddress: string) => {

      if (!connection || !publicKey || !address || !streamingAccountAddress) {
        return 0;
      }

      let balance = 0;
      consoleOut('got inside getStreamingAccountAtaBalance:', '', 'blue');

      try {
        consoleOut('address', address, 'blue');
        consoleOut('streamingAccountAddress', streamingAccountAddress, 'blue');
        const tokenPk = new PublicKey(address);
        const saPk = new PublicKey(streamingAccountAddress);
        const saAtaTokenAddress = await findATokenAddress(saPk, tokenPk);
        const ta = await getTokenAccountBalanceByAddress(connection, saAtaTokenAddress);
        consoleOut('getTokenAccountBalanceByAddress ->', ta, 'blue');
        if (ta) {
          balance = new BN(ta.amount).toNumber();
        }
        consoleOut('VC ATA balance:', balance, 'blue');
        return balance;
      } catch (error) {
        return balance;
      }

    }

    if (selectedVestingContract) {
      const tokenAddr = selectedVestingContract.associatedToken as string;
      getStreamingAccountAtaBalance(tokenAddr, selectedVestingContract.id as string)
      .then(value => setAssociatedTokenBalance(value))
      .catch(err => {
        console.error(err);
        setAssociatedTokenBalance(0);
      });

    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, publicKey, selectedVestingContract]);

  // Set a tab if none already set
  useEffect(() => {
    if (publicKey && accountAddress && vestingContractAddress && !accountDetailTab) {
      // /vesting/:address/contracts/:vestingContract/:activeTab
      const param = getQueryAccountType();
      let url = `${VESTING_ROUTE_BASE_PATH}/${accountAddress}/contracts/${vestingContractAddress}/overview`;
      if (param) {
        url += `?account-type=${param}`;
      }
      navigate(url);
    }
  }, [accountAddress, accountDetailTab, getQueryAccountType, navigate, publicKey, vestingContractAddress]);

  // Reload streams whenever the selected vesting contract changes
  useEffect(() => {
    if (!publicKey) { return; }

    if (vestingContractAddress && selectedVestingContract &&
        vestingContractAddress === selectedVestingContract.id &&
        !loadingTreasuryStreams && signalRefreshTreasuryStreams &&
        accountDetailTab === "streams") {
      setSignalRefreshTreasuryStreams(false);
      consoleOut('calling getTreasuryStreams...', '', 'blue');
      const treasuryPk = new PublicKey(selectedVestingContract.id as string);
      getTreasuryStreams(treasuryPk);
    }
  }, [
    publicKey,
    accountDetailTab,
    loadingTreasuryStreams,
    vestingContractAddress,
    selectedVestingContract,
    signalRefreshTreasuryStreams,
    getTreasuryStreams,
  ]);

  // Get the effective balance of the treasury
  useEffect(() => {
    if (!connection || !publicKey) { return; }

    if (vestingContractAddress && selectedVestingContract &&
        vestingContractAddress === selectedVestingContract.id) {
      let balance = 0;
      connection.getBalance(new PublicKey(vestingContractAddress))
      .then(solBalance => {
        balance = solBalance / LAMPORTS_PER_SOL;
        connection.getMinimumBalanceForRentExemption(300)
        .then(value => {
          const re = value / LAMPORTS_PER_SOL;
          const eb = balance - re;
          // consoleOut('treasuryRentExcemption:', re, 'blue');
          // consoleOut('Treasury native balance:', balance, 'blue');
          // consoleOut('Effective account balance:', eb, 'blue');
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

  }, [connection, publicKey, selectedVestingContract, vestingContractAddress]);

  // Get a list of multisig accounts
  useEffect(() => {

    if (!publicKey ||
        !multisigClient ||
        !multisigSerumClient ||
        !accountAddress ||
        !needReloadMultisigs) {
      return;
    }

    if (inspectedAccountType !== "multisig") {
      setPendingMultisigTxCount(undefined);
      return;
    }

    const timeout = setTimeout(() => {
      consoleOut('Loading multisig accounts...', '', 'crimson');
      setNeedReloadMultisigs(false);
      refreshMultisigs();
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
    needReloadMultisigs,
    multisigSerumClient,
    inspectedAccountType,
    pendingMultisigTxCount,
    loadingMultisigAccounts,
    parseSerumMultisigAccount,
    setPendingMultisigTxCount,
    refreshMultisigs,
  ]);

  // Get the Vesting contract settings template
  useEffect(() => {
    if (publicKey && msp && vestingContractAddress) {
      const pk = new PublicKey(vestingContractAddress);
      consoleOut('VC address:', pk.toString(), 'blue');
      msp.getStreamTemplate(pk)
      .then(value => {
        consoleOut('StreamTemplate:', value, 'blue');
        setStreamTemplate(value);
      })
    }
  }, [msp, publicKey, vestingContractAddress]);

  // Get the Vesting contract activity while in "activity" tab
  useEffect(() => {
    if (publicKey && msp && selectedVestingContract && accountDetailTab === "activity" && contractActivity.length < 5) {
      getContractActivity(selectedVestingContract.id as string);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountDetailTab, msp, publicKey, selectedVestingContract]);

  // Get fees for multisig actions
  useEffect(() => {

    if (!multisigClient || !accountAddress || getQueryAccountType() !== "multisig") { return; }

    getFees(multisigClient.getProgram(), MULTISIG_ACTIONS.createTransaction)
    .then(value => {
      setMultisigTxFees(value);
      consoleOut('Multisig transaction fees:', value, 'orange');
    });
  }, [accountAddress, getQueryAccountType, multisigClient]);

  // Get min balance required for multisig actions
  useEffect(() => {
    if (accountAddress && selectedVestingContract) {
      let minRequired = 0;
      if (getQueryAccountType() === "multisig" && isMultisigTreasury(selectedVestingContract) && multisigTxFees) {
        minRequired = multisigTxFees.networkFee + multisigTxFees.multisigFee + multisigTxFees.rentExempt;  // Multisig proposal fees
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
  }, [accountAddress, getQueryAccountType, isMultisigTreasury, multisigTxFees, selectedVestingContract, transactionFees]);

  // Keep the available streaming balance for the current vesting contract updated
  useEffect(() => {
    let streamingBalance = 0;
    let tokenDecimals = 6;

    if (!connection || !selectedVestingContract) {
      setAvailableStreamingBalance(streamingBalance);
      return;
    }

    const token = getTokenByMintAddress(selectedVestingContract.associatedToken as string);
    if (token) {
      const unallocated = selectedVestingContract.balance - selectedVestingContract.allocationAssigned;
      const ub = makeDecimal(new BN(unallocated), token.decimals);
      streamingBalance = ub >= 0 ? ub : 0;
      tokenDecimals = token.decimals;
      consoleOut('Available streaming balance:', streamingBalance, 'blue');
      setAvailableStreamingBalance(streamingBalance);
    } else {
      readAccountInfo(connection, selectedVestingContract.associatedToken as string)
      .then(info => {
        if ((info as any).data["parsed"]) {
          const decimals = (info as AccountInfo<ParsedAccountData>).data.parsed.info.decimals;
          const unallocated = selectedVestingContract.balance - selectedVestingContract.allocationAssigned;
          const ub = makeDecimal(new BN(unallocated), decimals);
          streamingBalance = ub >= 0 ? ub : 0;
          tokenDecimals = decimals;
        }
      })
      .finally(() => {
        consoleOut('Available streaming balance:', streamingBalance, 'blue');
        setAvailableStreamingBalance(streamingBalance);
        setAssociatedTokenDecimals(tokenDecimals);
      });
    }

  }, [connection, getTokenByMintAddress, selectedVestingContract]);

  // Hook on wallet connect/disconnect
  useEffect(() => {

    if (previousWalletConnectState !== connected) {
      if (!previousWalletConnectState && connected && publicKey) {
        consoleOut('User is connecting...', '', 'green');
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'green');
        confirmationEvents.off(EventType.TxConfirmSuccess, onTxConfirmed);
        consoleOut('Unsubscribed from event txConfirmed!', '', 'blue');
        confirmationEvents.off(EventType.TxConfirmTimeout, onTxTimedout);
        consoleOut('Unsubscribed from event onTxTimedout!', '', 'blue');
        setCanSubscribe(true);
        // Cleanup state
        clearFormValues();
        setAccountDetailTab(undefined);
        setInspectedAccountType(undefined);
        setSelectedVestingContract(undefined);
        setStreamTemplate(undefined);
      }
    }

    return () => {
      clearTimeout();
    };

  }, [
    connected,
    publicKey,
    previousWalletConnectState,
    clearFormValues,
    onTxConfirmed,
    onTxTimedout,
  ]);

  // Setup event listeners
  useEffect(() => {
    if (canSubscribe) {
      setCanSubscribe(false);
      confirmationEvents.on(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut('Subscribed to event txConfirmed with:', 'onTxConfirmed', 'blue');
      confirmationEvents.on(EventType.TxConfirmTimeout, onTxTimedout);
      consoleOut('Subscribed to event txTimedout with:', 'onTxTimedout', 'blue');
    }
  }, [
    canSubscribe,
    onTxConfirmed,
    onTxTimedout
  ]);

  // Unsubscribe from events
  useEffect(() => {
    // Do unmounting stuff here
    return () => {
      confirmationEvents.off(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut('Unsubscribed from event txConfirmed!', '', 'blue');
      confirmationEvents.off(EventType.TxConfirmTimeout, onTxTimedout);
      consoleOut('Unsubscribed from event onTxTimedout!', '', 'blue');
      setCanSubscribe(true);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  ////////////////////////////
  //   Events and actions   //
  ////////////////////////////

  const onBackButtonClicked = () => {
    setDetailsPanelOpen(false);
    setAutoOpenDetailsPanel(false);
    navigate(-1);
  }

  const onTabChange = useCallback((activeKey: string) => {
    consoleOut('Selected tab option:', activeKey, 'blue');
    // /vesting/:address/contracts/:vestingContract/:activeTab
    const param = getQueryAccountType();
    let url = `${VESTING_ROUTE_BASE_PATH}/${accountAddress}/contracts/${vestingContractAddress}/${activeKey}`;
    if (param) {
      url += `?account-type=${param}`;
    }
    navigate(url);
  }, [accountAddress, getQueryAccountType, navigate, vestingContractAddress]);

  const loadMoreActivity = () => {
    if (!vestingContractAddress) { return; }
    getContractActivity(vestingContractAddress);
  }

  const reloadVestingContracts = (manual = false) => {
    if (manual) {
      refreshVestingContracts();
    } else {
      refreshVestingContracts(true)
    }
  }


  ///////////////
  // Rendering //
  ///////////////

  const renderMetaInfoMenuItems = () => {
    const items = assetCtas.filter(m => m.isVisible && m.uiComponentType === 'menuitem');
    return (
      <Menu>
        {items.map((item: MetaInfoCta, index: number) => {
          return (
            <Menu.Item
              key={`${index + 44}-${item.uiComponentId}`}
              disabled={item.disabled}
              onClick={item.callBack}>
              <span className="menu-item-text">{item.caption}</span>
            </Menu.Item>
          );
        })}
      </Menu>
    );
  }

  const renderMetaInfoCtaRow = () => {
    const items = assetCtas.filter(m => m.isVisible && m.uiComponentType === 'button');

    return (
      <div className="flex-fixed-right cta-row mb-2">
        <Space className="left" size="middle" wrap>
          {items && items.length > 0 &&
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
                    key={`${index + 22}-${item.uiComponentId}`}
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
          overlay={renderMetaInfoMenuItems()}
          placement="bottomRight"
          trigger={["click"]}>
          <span className="icon-button-container">
            <Button
              type="default"
              shape="circle"
              size="middle"
              icon={<IconVerticalEllipsis className="mean-svg-icons" />}
              onClick={(e) => e.preventDefault()}
            />
          </span>
        </Dropdown>
      </div>
    );
  };

  const renderTabset = () => {
    if (!selectedVestingContract) { return (<span>&nbsp;</span>) }
    return (
      <Tabs activeKey={accountDetailTab} onChange={onTabChange} className="neutral stretch-content">
        <TabPane tab="Overview" key={"overview"}>
          <VestingContractOverview
            associatedTokenDecimals={associatedTokenDecimals}
            isXsDevice={isXsDevice}
            streamTemplate={streamTemplate}
            vestingContract={selectedVestingContract}
            vestingContractFlowRate={vestingContractFlowRate}
          />
        </TabPane>
        <TabPane tab={`Streams (${selectedVestingContract.totalStreams})`} key={"streams"}>
          <VestingContractStreamList
            accountAddress={accountAddress}
            isMultisigTreasury={isMultisigTreasury()}
            loadingTreasuryStreams={loadingTreasuryStreams}
            minRequiredBalance={minRequiredBalance}
            msp={msp}
            selectedMultisig={selectedMultisig}
            multisigAccounts={multisigAccounts}
            multisigClient={multisigClient}
            nativeBalance={nativeBalance}
            streamTemplate={streamTemplate}
            treasuryStreams={treasuryStreams}
            userBalances={userBalances}
            vestingContract={selectedVestingContract}
            onReloadTokenBalances={(option: string) => {
              if (option === "safe") {
                if (selectedMultisig) {
                  setBalancesSource(selectedMultisig.authority.toBase58());
                }
              } else {
                setBalancesSource('');
              }
            }}
          />
        </TabPane>
        <TabPane tab="Activity" key={"activity"}>
          <VestingContractActivity
            contractActivity={contractActivity}
            hasMoreStreamActivity={hasMoreContractActivity}
            loadingStreamActivity={loadingContractActivity}
            onLoadMoreActivities={loadMoreActivity}
            vestingContract={selectedVestingContract}
          />
        </TabPane>
      </Tabs>
    );
  }

  const loader = (
    <>
      <div className="container main-container">
        <div className="loading-screen-container flex-center">
          <div className="flex-column flex-center">
            <div className="loader-container">
              <div className="app-loading">
                <div className="logo" style={{display: 'none'}}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 245 238" fillRule="evenodd" clipRule="evenodd" strokeLinejoin="round" strokeMiterlimit="2">
                    <path d="M238.324 75l-115.818 30.654L6.689 75 0 128.402l47.946 122.08L122.515 313l74.55-62.518L245 128.402 238.324 75zm-21.414 29.042l3.168 25.313-42.121 107.268-26.849 22.511 37.922-120.286-48.471 12.465-8.881 107.524-9.176 24.128-9.174-24.128-8.885-107.524-48.468-12.465 37.922 120.286-26.85-22.511-42.118-107.268 3.167-25.313 94.406 24.998 94.408-24.998z" fill="url(#_Linear1)" transform="translate(0 -64)"/>
                    <defs>
                      <linearGradient id="_Linear1" x1="0" y1="0" x2="1" y2="0" gradientUnits="userSpaceOnUse" gradientTransform="matrix(0 238 -238 0 122.5 75)">
                        <stop offset="0" stopColor="#ff0017"/><stop offset="1" stopColor="#b7001c"/>
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
                <svg className="spinner" viewBox="25 25 50 50">
                  <circle className="path" cx="50" cy="50" r="20" fill="none" strokeWidth="2" strokeMiterlimit="10"/>
                </svg>
              </div>
            </div>
            <p className="loader-message">{t('general.loading')}</p>
          </div>
        </div>
      </div>
    </>
  );

  const renderCreateFirstVestingAccount = useCallback(() => {
    return (
      <>
        {/* {isLocal() && (
          <div className="debug-bar">
            <span className="ml-1">loadingTreasuries:</span><span className="ml-1 font-bold fg-dark-active">{loadingTreasuries ? 'true' : 'false'}</span>
            <span className="ml-1">treasuriesLoaded:</span><span className="ml-1 font-bold fg-dark-active">{treasuriesLoaded ? 'true' : 'false'}</span>
            <span className="ml-1">needReloadMultisigs:</span><span className="ml-1 font-bold fg-dark-active">{needReloadMultisigs ? 'true' : 'false'}</span>
          </div>
        )} */}
        <div className="container main-container">
          <div className="interaction-area">
            <div className="title-and-subtitle mb-2">
              <div className="title">
                <IconMoneyTransfer className="mean-svg-icons" />
                <div>{t('vesting.screen-title')}</div>
              </div>
              <div className="subtitle mt-1">
                {t('vesting.screen-subtitle')}
              </div>
              <h3 className="text-center mb-0">
                {t('vesting.user-instruction-headline')}
              </h3>
            </div>
            <div className="place-transaction-box flat mb-0">
              <>
                <div id="hard-refresh-contracts-cta" onClick={() => refreshVestingContracts(true)}></div>
                <VestingContractCreateForm
                  accountAddress={accountAddress}
                  inModal={false}
                  isBusy={isBusy}
                  isMultisigContext={isMultisigContext}
                  loadingMultisigAccounts={loadingMultisigAccounts || loadingTreasuries}
                  token={workingToken}
                  selectedList={selectedList}
                  selectedMultisig={selectedMultisig}
                  userBalances={userBalances}
                  nativeBalance={nativeBalance}
                  onStartTransaction={(options: VestingContractCreateOptions) => onAcceptCreateVestingContract(options)}
                  transactionFees={createVestingContractTxFees}
                  tokenChanged={(token: TokenInfo | undefined) => {
                    setWorkingToken(token);
                    setSelectedToken(token);
                  }}
                />
              </>
            </div>
          </div>
        </div>
        <PreFooter />
      </>
    );
  }, [
    isBusy,
    selectedList,
    userBalances,
    nativeBalance,
    workingToken,
    accountAddress,
    selectedMultisig,
    isMultisigContext,
    loadingTreasuries,
    loadingMultisigAccounts,
    createVestingContractTxFees,
    onAcceptCreateVestingContract,
    refreshVestingContracts,
    setSelectedToken,
    t,
  ]);

  // Unauthorized access or disconnected access
  if (!publicKey || (publicKey && accountAddress && getQueryAccountType() !== "multisig" && publicKey.toBase58() !== accountAddress)) {
    return (
      <>
        <div className="container main-container">
          <div className="interaction-area">
            <div className={`title-and-subtitle ${isXsDevice ? 'w-100' : 'w-75 h-75'}`}>
              <div className="title">
                <IconMoneyTransfer className="mean-svg-icons" />
                <div>{t('vesting.screen-title')}</div>
              </div>
              <div className="subtitle mt-1">
                {t('vesting.screen-subtitle')}
              </div>
              <h3 className="text-center mb-0">
                {t('vesting.user-instruction-headline')}
              </h3>
              <div className={`text-center flex-column flex-center ${isXsDevice ? 'w-100 h-100 p-2 mt-4' : 'w-50 h-100 p-4'}`}>
                <div className="text-center mb-2">
                  <WarningFilled style={{ fontSize: 48 }} className="icon fg-warning" />
                </div>
                {!publicKey ? (
                  <h3 className="text-center">Please connect your wallet to see your vesting contracts</h3>
                ) : (
                  <div className="text-center">
                    <h3 className="mb-3">You don't have access permission to view the vesting contracts for the wallet address specified.</h3>
                    <p>Please reconnect with the authorized wallet ({shortenAddress(accountAddress)})<br/>or <span className="simplelink underline" onClick={() => {
                      window.location.href = VESTING_ROUTE_BASE_PATH;
                    }}>click here</span> to show the vesting contracts for the connected wallet.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <PreFooter />
      </>
    );
  }

  // Render the On-boarding to Mean Vesting by helping the user on creating
  // the first Vesting Contract if the user has none
  if (treasuriesLoaded && treasuryList && treasuryList.length > 0 && !loadingTreasuries ) {
    // Render normal UI
    return (
      <>
        {/* {isLocal() && (
          <div className="debug-bar">
            <span className="ml-1">loadingTreasuries:</span><span className="ml-1 font-bold fg-dark-active">{loadingTreasuries ? 'true' : 'false'}</span>
            <span className="ml-1">treasuriesLoaded:</span><span className="ml-1 font-bold fg-dark-active">{treasuriesLoaded ? 'true' : 'false'}</span>
            <span className="ml-1">needReloadMultisigs:</span><span className="ml-1 font-bold fg-dark-active">{needReloadMultisigs ? 'true' : 'false'}</span>
            <span className="ml-1">loadingMultisigAccounts:</span><span className="ml-1 font-bold fg-dark-active">{loadingMultisigAccounts ? 'true' : 'false'}</span>
          </div>
        )} */}

        {detailsPanelOpen && (
          <Button
            id="back-button"
            type="default"
            shape="circle"
            icon={<ArrowLeftOutlined />}
            onClick={onBackButtonClicked}/>
        )}
        <div className="container main-container">
          {publicKey ? (
            <div className="interaction-area">

              <div className={`meanfi-two-panel-layout ${detailsPanelOpen ? 'details-open' : ''}`}>

                {/* Left / top panel */}
                <div className="meanfi-two-panel-left">
  
                  <div className="meanfi-panel-heading">
                    {isMultisigContext ? (
                      <div className="back-button">
                        <span className="icon-button-container">
                          <Tooltip placement="bottom" title={t('multisig.multisig-assets.back-to-multisig-accounts-cta')}>
                            <Button
                              type="default"
                              shape="circle"
                              size="middle"
                              icon={<ArrowLeftOutlined />}
                              onClick={() => {
                                if (selectedMultisig) {
                                  const multisig = selectedMultisig.authority.toBase58();
                                  const url = `/multisig/${multisig}?v=proposals`;
                                  setHighLightableMultisigId(multisig);
                                  navigate(url);
                                }
                              }}
                            />
                          </Tooltip>
                        </span>
                      </div>
                    ) : null}
                    <span className="title">{t('vesting.screen-title')} ({treasuryList.length})</span>

                    <div className="user-address">
                      <span className="fg-secondary">
                        (<Tooltip placement="bottom" title={t('assets.account-address-copy-cta')}>
                          <span className="simplelink underline-on-hover" onClick={() => copyAddressToClipboard(accountAddress)}>
                            {shortenAddress(accountAddress, 5)}
                          </span>
                        </Tooltip>)
                      </span>
                      <Tooltip placement="bottom" title={t('vesting.refresh-tooltip')}>
                        <span className="icon-button-container simplelink" onClick={() => reloadVestingContracts(true)}>
                          <Button
                            type="default"
                            shape="circle"
                            size="small"
                            icon={<ReloadOutlined />}
                            onClick={() => {}}
                          />
                        </span>
                      </Tooltip>
                      <div id="hard-refresh-contracts-cta" onClick={() => refreshVestingContracts(true)}></div>
                      <div id="soft-refresh-contracts-cta" onClick={() => refreshVestingContracts(false)}></div>
                    </div>
                  </div>

                  <div className="inner-container">
                    {isMultisigContext && (
                      <PendingProposalsComponent
                        accountAddress={accountAddress}
                        extraClasses="no-pointer shift-up-1"
                        pendingMultisigTxCount={pendingMultisigTxCount}
                      />
                    )}
                    <div className="item-block vertical-scroll">

                      <div className="asset-category flex-column">
                        <VestingContractList
                          msp={msp}
                          streamingAccounts={treasuryList}
                          selectedAccount={selectedVestingContract}
                          loadingVestingAccounts={loadingTreasuries}
                          onAccountSelected={(item: Treasury | undefined) => onSelectVestingContract(item)}
                        />
                      </div>

                    </div>

                    {/* Bottom CTA */}
                    <div className="bottom-ctas">
                      <div className="primary-action">
                        <Button
                          block
                          className="flex-center"
                          type="primary"
                          shape="round"
                          onClick={showVestingContractCreateModal}>
                          <span className="ml-1">Create vesting contract</span>
                        </Button>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Right / down panel */}
                <div className="meanfi-two-panel-right">
                  <div className="meanfi-panel-heading"><span className="title">{t('vesting.vesting-account-details.panel-title')}</span></div>
                  <div className="inner-container">
                    <div className="flexible-column-bottom">
                      <div className="top">
                        <VestingContractDetails
                          isXsDevice={isXsDevice}
                          loadingVestingContractFlowRate={loadingVestingContractFlowRate}
                          streamTemplate={streamTemplate}
                          vestingContract={selectedVestingContract}
                          vestingContractFlowRate={vestingContractFlowRate}
                        />
                        {/* Render CTAs row here */}
                        {renderMetaInfoCtaRow()}

                        {/* Alert to offer refresh vesting contract */}
                        {selectedVestingContract && associatedTokenBalance !== selectedVestingContract.balance && (
                          <div className="alert-info-message mb-2">
                            <Alert message={(
                                <>
                                  <span>This vesting contract received an incoming funds transfer.&nbsp;</span>
                                  <span className="simplelink underline" onClick={() => onExecuteRefreshVestingContractBalance()}>Refresh the account data</span>
                                  <span>&nbsp;to update the account balance.</span>
                                </>
                              )}
                              type="info"
                              showIcon
                            />
                          </div>
                        )}

                      </div>
                      <div className="bottom">
                        {renderTabset()}
                      </div>
                    </div>
                  </div>
                </div>

              </div>

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
        <PreFooter />

        {isVestingContractCreateModalVisible && (
          <VestingContractCreateModal
            accountAddress={accountAddress}
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
            associatedToken={selectedVestingContract ? selectedVestingContract.associatedToken as string : ''}
            handleClose={closeAddFundsModal}
            handleOk={(params: VestingContractTopupParams) => onAcceptAddFunds(params)}
            isBusy={isBusy}
            isVisible={isAddFundsModalVisible}
            nativeBalance={nativeBalance}
            minRequiredBalance={minRequiredBalance}
            selectedMultisig={selectedMultisig}
            streamTemplate={streamTemplate}
            transactionFees={transactionFees}
            treasuryStreams={treasuryStreams}
            userBalances={userBalances}
            vestingContract={selectedVestingContract}
            withdrawTransactionFees={withdrawTransactionFees}
            onReloadTokenBalances={(option: string) => {
              if (option === "safe") {
                if (selectedMultisig) {
                  setBalancesSource(selectedMultisig.authority.toBase58());
                }
              } else {
                setBalancesSource('');
              }
            }}
          />
        )}

        {isEditContractSettingsModalOpen && vestingContractAddress && (
          <VestingContractEditModal
            accountAddress={vestingContractAddress || ''}
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

        {isVestingContractSolBalanceModalOpen && vestingContractAddress && (
          <VestingContractSolBalanceModal
            address={vestingContractAddress || ''}
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
            isMultisigTreasury={isMultisigTreasury()}
            isVisible={isCreateStreamModalVisible}
            isXsDevice={isXsDevice}
            minRequiredBalance={minRequiredBalance}
            nativeBalance={nativeBalance}
            selectedMultisig={selectedMultisig}
            streamTemplate={streamTemplate}
            transactionFees={transactionFees}
            vestingContract={selectedVestingContract}
            withdrawTransactionFees={withdrawTransactionFees}
          />
        )}

        {isVestingContractCloseModalOpen && selectedVestingContract && (
          <VestingContractCloseModal
            handleClose={hideVestingContractCloseModal}
            handleOk={onAcceptCloseVestingContractModal}
            isBusy={isBusy}
            isVisible={isVestingContractCloseModalOpen}
            nativeBalance={nativeBalance}
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
            isMultisigTreasury={isMultisigTreasury()}
            isVisible={isVestingContractTransferFundsModalVisible}
            minRequiredBalance={minRequiredBalance}
            multisigAccounts={multisigAccounts}
            nativeBalance={nativeBalance}
            selectedMultisig={selectedMultisig}
            transactionFees={transactionFees}
            vestingContract={selectedVestingContract}
          />
        )}

      </>
    );
  } else if (treasuriesLoaded && treasuryList.length === 0 && !loadingTreasuries) {
    return renderCreateFirstVestingAccount();
  } else {
    return loader;
  }

};
