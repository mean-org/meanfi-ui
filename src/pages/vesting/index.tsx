import React, { useEffect, useState, useContext, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from "react-i18next";
import { AppStateContext } from "../../contexts/appstate";
import { IconExternalLink, IconMoneyTransfer, IconVerticalEllipsis } from "../../Icons";
import { PreFooter } from "../../components/PreFooter";
import { Button, Dropdown, Menu, Space, Tabs, Tooltip } from 'antd';
import { consoleOut, copyText, getTransactionStatusForLogs } from '../../utils/ui';
import { useWallet } from '../../contexts/wallet';
import { getSolanaExplorerClusterParam, useConnectionConfig } from '../../contexts/connection';
import { ConfirmOptions, Connection, LAMPORTS_PER_SOL, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import {
  calculateActionFees,
  MSP,
  MSP_ACTIONS,
  Stream,
  TransactionFees,
  Treasury,
  Constants as MSPV2Constants,
  StreamTemplate
} from '@mean-dao/msp';
import "./style.scss";
import { AnchorProvider, Program } from '@project-serum/anchor';
import SerumIDL from '../../models/serum-multisig-idl';
import { ArrowLeftOutlined, WarningFilled } from '@ant-design/icons';
import { fetchAccountTokens, formatThousands, getTokenAmountAndSymbolByTokenAddress, getTxIxResume, makeDecimal, openLinkInNewTab, shortenAddress } from '../../utils/utils';
import { openNotification } from '../../components/Notifications';
import { NO_FEES, SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from '../../constants';
import { VestingContractList } from './components/VestingContractList';
import { VestingContractDetails } from './components/VestingContractDetails';
import useWindowSize from '../../hooks/useWindowResize';
import { isMobile } from 'react-device-detect';
import { MetaInfoCta, TreasuryTopupParams } from '../../models/common-types';
import { EventType, MetaInfoCtaAction, OperationType, TransactionStatus } from '../../models/enums';
import { VestingContractCreateForm } from './components/VestingContractCreateForm';
import { TokenInfo } from '@solana/spl-token-registry';
import { VestingContractCreateModal } from './components/VestingContractCreateModal';
import { VestingContractOverview } from './components/VestingContractOverview';
import { CreateVestingTreasuryParams, VestingContractCreateOptions, VestingContractStreamCreateOptions, VestingContractWithdrawOptions, VESTING_CATEGORIES } from '../../models/vesting';
import { VestingContractStreamList } from './components/VestingContractStreamList';
import { useAccountsContext, useNativeAccount } from '../../contexts/accounts';
import { DEFAULT_EXPIRATION_TIME_SECONDS, MeanMultisig, MultisigInfo, MultisigParticipant, MultisigTransactionFees } from '@mean-dao/mean-multisig-sdk';
import { NATIVE_SOL_MINT, TOKEN_PROGRAM_ID } from '../../utils/ids';
import { appConfig, customLogger } from '../..';
import { InspectedAccountType } from '../accounts';
import { confirmationEvents, TxConfirmationContext, TxConfirmationInfo } from '../../contexts/transaction-status';
import { VestingContractSolBalanceModal } from './components/VestingContractSolBalanceModal';
import { VestingContractAddFundsModal } from './components/TreasuryAddFundsModal';
import { VestingContractCloseModal } from './components/VestingContractCloseModal';
import { segmentAnalytics } from '../../App';
import { AppUsageEvent, SegmentVestingContractStreamCreateData, SegmentVestingContractWithdrawData } from '../../utils/segment-service';
import { ZERO_FEES } from '../../models/multisig';
import { VestingContractCreateStreamModal } from './components/VestingContractCreateStreamModal';
import { VestingContractWithdrawFundsModal } from './components/VestingContractWithdrawFundsModal';
import { VestingContractActivity } from './components/VestingContractActivity';
import { AccountLayout } from '@solana/spl-token';
import { refreshTreasuryBalanceInstruction } from '@mean-dao/money-streaming';
import { BN } from 'bn.js';

const { TabPane } = Tabs;
export const VESTING_ROUTE_BASE_PATH = '/vesting';
export type VestingAccountDetailTab = "overview" | "streams" | "activity" | undefined;

export const VestingView = () => {
  const {
    tokenList,
    userTokens,
    splTokenList,
    selectedToken,
    detailsPanelOpen,
    transactionStatus,
    streamV2ProgramAddress,
    pendingMultisigTxCount,
    previousWalletConnectState,
    setPendingMultisigTxCount,
    setIsVerifiedRecipient,
    getTokenPriceByAddress,
    getTokenPriceBySymbol,
    getTokenByMintAddress,
    setTransactionStatus,
    refreshTokenBalance,
    setRecipientAddress,
    setDtailsPanelOpen,
    setFromCoinAmount,
    setSelectedToken,
  } = useContext(AppStateContext);
  const {
    confirmationHistory,
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
  const accounts = useAccountsContext();
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
  // const [loadingselectedVestingContract, setLoadingselectedVestingContract] = useState(false);
  const [streamTemplate, setStreamTemplate] = useState<StreamTemplate | undefined>(undefined);
  const [autoOpenDetailsPanel, setAutoOpenDetailsPanel] = useState(true);
  const [isXsDevice, setIsXsDevice] = useState<boolean>(isMobile);
  const [assetCtas, setAssetCtas] = useState<MetaInfoCta[]>([]);
  // Source token list
  const [selectedList, setSelectedList] = useState<TokenInfo[]>([]);
  // Balances
  const [nativeBalance, setNativeBalance] = useState(0);
  const [userBalances, setUserBalances] = useState<any>();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [treasuryEffectiveBalance, setTreasuryEffectiveBalance] = useState(0);
  // Transactions
  const [isBusy, setIsBusy] = useState(false);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [canSubscribe, setCanSubscribe] = useState(true);
  const [transactionFees, setTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [createVestingContractTxFees, setCreateVestingContractTxFees] = useState<TransactionFees>(NO_FEES);
  const [withdrawTransactionFees, setWithdrawTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [multisigTxFees, setMultisigTxFees] = useState<MultisigTransactionFees>(ZERO_FEES);
  const [minRequiredBalance, setMinRequiredBalance] = useState(0);
  const [needReloadMultisig, setNeedReloadMultisig] = useState(true);
  const [ongoingOperation, setOngoingOperation] = useState<OperationType | undefined>(undefined);
  const [retryOperationPayload, setRetryOperationPayload] = useState<any>(undefined);
  const [multisigAccounts, setMultisigAccounts] = useState<MultisigInfo[]>([]);
  const [selectedMultisig, setSelectedMultisig] = useState<MultisigInfo | undefined>(undefined);
  const [loadingMultisigAccounts, setLoadingMultisigAccounts] = useState(true);

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
      navigate(url, { replace: true });
    }
    // In any case, set the flag isPageLoaded a bit later
    setTimeout(() => {
      setIsPageLoaded(true);
    }, 5);
  }, [address, location.pathname, navigate, publicKey]);

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
    }

    if (activeTab) {
      consoleOut('Route param activeTab:', activeTab, 'crimson');
      setAccountDetailTab(activeTab as VestingAccountDetailTab);
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
    }

  }, [accountAddress, activeTab, address, isPageLoaded, publicKey, searchParams, vestingContract]);

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

  const selectedVestingContractRef = useRef(selectedVestingContract);
  useEffect(() => {
    selectedVestingContractRef.current = selectedVestingContract;
  }, [selectedVestingContract]);


  /////////////////
  //  Callbacks  //
  /////////////////

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
      default:
        break;
    }
  }, []);

  // Setup event handler for Tx confirmed
  const onTxConfirmed = useCallback((item: TxConfirmationInfo) => {

    const softReloadContracts = () => {
      const contractsRefreshCta = document.getElementById("soft-refresh-contracts-cta");
      if (contractsRefreshCta) {
        contractsRefreshCta.click();
      }
    };

    const hardReloadContracts = () => {
      const contractsRefreshCta = document.getElementById("hard-refresh-contracts-cta");
      if (contractsRefreshCta) {
        contractsRefreshCta.click();
      }
    };

    consoleOut("onTxConfirmed event handled:", item, 'crimson');
    recordTxConfirmation(item.signature, item.operationType, true);

    switch (item.operationType) {
      case OperationType.StreamClose:
      case OperationType.TreasuryAddFunds:
      case OperationType.StreamAddFunds:
      case OperationType.TreasuryStreamCreate:
        softReloadContracts();
        break;
      case OperationType.TreasuryClose:
      case OperationType.TreasuryCreate:
      case OperationType.TreasuryRefreshBalance:
      case OperationType.TreasuryWithdraw:
        hardReloadContracts();
        break;
      default:
        break;
    }

  }, [recordTxConfirmation]);

  // Setup event handler for Tx confirmation error
  const onTxTimedout = useCallback((item: TxConfirmationInfo) => {
    if (item) {
      consoleOut("onTxTimedout event executed:", item, 'crimson');
      recordTxConfirmation(item.signature, item.operationType, false);
    }
  }, [
    recordTxConfirmation,
  ]);

  const isInspectedAccountTheConnectedWallet = useCallback(() => {
    return accountAddress && publicKey && publicKey.toBase58() === accountAddress
      ? true
      : false
  }, [accountAddress, publicKey]);

  const navigateToVestingContract = useCallback((contractId: string) => {
    if (accountAddress && contractId) {
      let url = `${VESTING_ROUTE_BASE_PATH}/${accountAddress}/contracts/${contractId}`;
      const param = getQueryAccountType();
      if (param && param === "multisig") {
        url += '?account-type=multisig';
      }
      navigate(url);
    }
  }, [accountAddress, getQueryAccountType, navigate]);

  const onSelectVestingContract = useCallback((item: Treasury | undefined) => {
    if (accountAddress && item) {
      navigateToVestingContract(item.id.toString());
      setAutoOpenDetailsPanel(true);
    }
  }, [accountAddress, navigateToVestingContract]);

  const getAllUserV2Accounts = useCallback(async () => {

    if (!connection || !publicKey || !msp) { return []; }

    setTimeout(() => {
      setLoadingTreasuries(true);
    });

    const treasuries = await msp.listTreasuries(publicKey);

    // TODO: listTreasuries should already return a list without autoClose treasuries and include category 1
    // probably it would be better to create a new method only for listing vesting contracts for when
    // the additional category comes
    return treasuries.filter(t => !t.autoClose && t.data.category === 1);

  }, [connection, msp, publicKey]);

  const refreshVestingContracts = useCallback((reset = false) => {

    if (!connection || !publicKey || !msp) { return; }

    setTimeout(() => {
      setLoadingTreasuries(true);
    });

    getAllUserV2Accounts()
      .then(treasuries => {
        consoleOut('Streaming accounts:', treasuries, 'blue');
        setTreasuryList(treasuries);
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
      })
      .catch(error => {
        console.error(error);
      })
      .finally(() => setLoadingTreasuries(false));

  }, [connection, getAllUserV2Accounts, msp, navigateToVestingContract, publicKey, vestingContractAddress]);

  const getTreasuryStreams = useCallback((treasuryPk: PublicKey) => {
    if (!publicKey || !msp || loadingTreasuryStreams) { return; }

    setTimeout(() => {
      setLoadingTreasuryStreams(true);
    });

    consoleOut('Executing getTreasuryStreams...', '', 'blue');

    msp.listStreams({treasury: treasuryPk })
      .then((streams: any) => {
        consoleOut('treasuryStreams:', streams, 'blue');
        setTreasuryStreams(streams);
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

  const isMultisigTreasury = useCallback((treasury?: any) => {

    const treasuryInfo: any = treasury ?? selectedVestingContract;

    if (!treasuryInfo || treasuryInfo.version < 2 || !treasuryInfo.treasurer || !publicKey) {
      return false;
    }

    const treasurer = new PublicKey(treasuryInfo.treasurer as string);

    if (!treasurer.equals(publicKey) && multisigAccounts && multisigAccounts.findIndex(m => m.authority.equals(treasurer)) !== -1) {
      return true;
    }

    return false;

  }, [
    multisigAccounts, 
    publicKey, 
    selectedVestingContract
  ]);

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

    if (!multisigAccounts || !selectedMultisig || !selectedVestingContract) { return ''; }

    if (accountAddress && getQueryAccountType() === "multisig") {
      const multisig = multisigAccounts.find(t => t.authority.toBase58() === accountAddress);
      if (multisig) {
        return multisig.id.toBase58();
      }
    }

    return '';

  }, [accountAddress, getQueryAccountType, multisigAccounts, selectedMultisig, selectedVestingContract])

  const getSelectedTreasuryMultisigId = useCallback(() => {

    if (!multisigAccounts || !selectedVestingContract) { return ''; }

    const treasurer = new PublicKey(selectedVestingContract.treasurer as string);

    if (accountAddress && getQueryAccountType() === "multisig") {
      const multisig = multisigAccounts.find(t => t.authority.equals(treasurer));
      if (multisig) {
        return multisig.id;
      }
    }

    return '';

  }, [accountAddress, getQueryAccountType, multisigAccounts, selectedVestingContract])

  const getAvailableStreamingBalance = useCallback(() => {
    if (!selectedVestingContract) { return 0; }

    const token = getTokenByMintAddress(selectedVestingContract.associatedToken as string);

    if (token) {
      const unallocated = selectedVestingContract.balance - selectedVestingContract.allocationAssigned;
      const ub = makeDecimal(new BN(unallocated), token.decimals);
      return ub >= 0 ? ub : 0;
    }

    return 0;
  }, [getTokenByMintAddress, selectedVestingContract]);


  //////////////
  //  Modals  //
  //////////////

  // Create vesting contract modal
  const [isVestingContractCreateModalVisible, setIsVestingContractCreateModalVisibility] = useState(false);
  const showVestingContractCreateModal = useCallback(() => setIsVestingContractCreateModalVisibility(true), []);
  const closeVestingContractCreateModal = useCallback(() => setIsVestingContractCreateModalVisibility(false), []);

  const onVestingContractCreated = useCallback(() => {
    closeVestingContractCreateModal();
    setOngoingOperation(undefined);
    refreshTokenBalance();
  }, [closeVestingContractCreateModal, refreshTokenBalance]);

  const onExecuteCreateVestingContractTransaction = useCallback(async (createOptions: VestingContractCreateOptions) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.TreasuryCreate);
    setRetryOperationPayload(createOptions);
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
       * startUtc?: Date | undefined
       * cliffVestPercent?: number | undefined
       * feePayedByTreasurer?: boolean | undefined
       */

      const solFeePayedByTreasury = data.multisig ? true : false;

      if (!data.multisig) {
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
          data.startUtc,                                        // startUtc
          data.cliffVestPercent,                                // cliffVestPercent
          data.feePayedByTreasurer,                             // feePayedByTreasurer
        );
      }

      if (!multisigClient || !multisigAccounts) { return null; }

      const multisig = multisigAccounts.filter(m => m.id.toBase58() === data.multisig)[0];

      if (!multisig) { return null; }

      // Create Streaming account
      const createTreasuryTx = await msp.createTreasury(
        publicKey,                                        // payer
        multisig.authority,                               // treasurer
        new PublicKey(data.associatedTokenAddress),       // associatedToken
        data.label,                                       // label
        data.type,                                        // type
        true,                                             // solFeePayedByTreasury = true
      );

      const ixData = Buffer.from(createTreasuryTx.instructions[0].data);
      const ixAccounts = createTreasuryTx.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      // TODO: I believe this would be changed to "Create vesting account"
      const tx = await multisigClient.createTransaction(
        publicKey,
        "Create streaming account",
        "", // description
        new Date(expirationTime * 1_000),
        OperationType.TreasuryCreate,
        multisig.id,
        MSPV2Constants.MSP,
        ixAccounts,
        ixData
      );

      return tx;
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

      // Create a transaction
      const associatedToken = createOptions.token;
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
        startUtc: createOptions.startDate,                                      // startUtc
        multisig: multisigId,                                                   // multisig
        feePayedByTreasurer: createOptions.feePayedByTreasurer                  // feePayedByTreasurer
      };

      consoleOut('payload:', payload);
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
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.TreasuryCreate,
              finality: "confirmed",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: `Create vesting contract ${createOptions.vestingContractName} with ${formatThousands(
                parseFloat(createOptions.amount),
                createOptions.token.decimals
              )} ${createOptions.token.symbol}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `Vesting contract ${createOptions.vestingContractName} created successfully`,
              extras: createOptions
            });
            setIsBusy(false);
            resetTransactionStatus();
            onVestingContractCreated();
            setNeedReloadMultisig(true);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  },[
    msp,
    wallet,
    publicKey,
    connection,
    nativeBalance,
    multisigClient,
    multisigAccounts,
    transactionCancelled,
    multisigTxFees.networkFee,
    multisigTxFees.rentExempt,
    multisigTxFees.multisigFee,
    transactionFees.mspFlatFee,
    transactionFees.blockchainFee,
    transactionStatus.currentOperation,
    enqueueTransactionConfirmation,
    getMultisigIdFromContext,
    onVestingContractCreated,
    resetTransactionStatus,
    setTransactionStatus,
  ]);

  const onAcceptCreateVestingContract = useCallback((data: VestingContractCreateOptions) => {
    consoleOut('Create vesting contract options:', data, 'blue');
    onExecuteCreateVestingContractTransaction(data);
    setRetryOperationPayload(data);
  }, [onExecuteCreateVestingContractTransaction]);

  // Vesting contract SOL balance modal
  const [isVestingContractSolBalanceModalOpen, setIsVestingContractSolBalanceModalOpen] = useState(false);
  const hideVestingContractSolBalanceModal = useCallback(() => setIsVestingContractSolBalanceModalOpen(false), []);
  const showVestingContractSolBalanceModal = useCallback(() => setIsVestingContractSolBalanceModalOpen(true), []);

  // Vesting contract close modal
  const [isVestingContractCloseModalOpen, setIsVestingContractCloseModalOpen] = useState(false);
  const hideVestingContractCloseModal = useCallback(() => setIsVestingContractCloseModalOpen(false), []);
  const showVestingContractCloseModal = useCallback(() => {
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

    resetTransactionStatus();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.TreasuryClose);
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
              extras: selectedVestingContract.id as string
            });
            setIsBusy(false);
            setNeedReloadMultisig(true);
            setOngoingOperation(undefined);
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
  }, [getTransactionFees, resetTransactionStatus, vestingContract]);

  const onAcceptAddFunds = (params: TreasuryTopupParams) => {
    consoleOut('AddFunds params:', params, 'blue');
    onExecuteAddFundsTransaction(params);
  };

  const closeAddFundsModal = useCallback(() => {
    resetTransactionStatus();
    setIsAddFundsModalVisibility(false);
    setOngoingOperation(undefined);
  }, [resetTransactionStatus]);

  const onExecuteAddFundsTransaction = async (params: TreasuryTopupParams) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.TreasuryAddFunds);
    setRetryOperationPayload(params);
    setIsBusy(true);

    const addFunds = async (data: any) => {

      if (!msp) { return null; }

      if (data.stream === '') {
        return await msp.addFunds(
          new PublicKey(data.payer),                    // payer
          new PublicKey(data.contributor),              // contributor
          new PublicKey(data.treasury),                 // treasury
          new PublicKey(data.associatedToken),          // associatedToken
          data.amount,                                  // amount
        );
      }

      if (!isMultisigTreasury()) {
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

      const allocateTx = await msp.allocate(
        new PublicKey(data.payer),                   // payer
        new PublicKey(multisig.authority),           // treasurer
        new PublicKey(data.treasury),                // treasury
        new PublicKey(data.stream),                  // stream
        data.amount,                                 // amount
      );

      const ixData = Buffer.from(allocateTx.instructions[0].data);
      const ixAccounts = allocateTx.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
        publicKey,
        "Add Funds",
        "", // description
        new Date(expirationTime * 1_000),
        OperationType.StreamAddFunds,
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
      const associatedToken = new PublicKey(params.associatedToken);
      const amount = params.tokenAmount.toNumber();
      const data = {
        payer: publicKey.toBase58(),                              // payer
        contributor: publicKey.toBase58(),                        // contributor
        treasury: treasury.toBase58(),                            // treasury
        associatedToken: associatedToken.toBase58(),              // associatedToken
        stream: params.streamId ? params.streamId : '',
        amount,                                                   // amount
      }

      consoleOut('data:', data);

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
      const token = getTokenByMintAddress(params.associatedToken);
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
              loadingMessage: `${params.streamId ? 'Fund stream with' : 'Fund vesting account with'} ${formatThousands(
                parseFloat(params.amount),
                token?.decimals
              )} ${token?.symbol}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `${params.streamId ? 'Stream funded with' : 'Vesting account funded with'} ${formatThousands(
                parseFloat(params.amount),
                token?.decimals
              )} ${token?.symbol}`,
              extras: params.streamId
            });
            setIsBusy(false);
            closeAddFundsModal();
            setNeedReloadMultisig(true);
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

  const closeCreateStreamModal = useCallback((reset = false) => {
    resetTransactionStatus();
    setIsCreateStreamModalVisibility(false);
    if (reset) {
      setIsVerifiedRecipient(false);
      setRecipientAddress('');
      setFromCoinAmount('');
    }
  }, [resetTransactionStatus, setFromCoinAmount, setIsVerifiedRecipient, setRecipientAddress]);

  const onExecuteCreateStreamTransaction = async (params: VestingContractStreamCreateOptions) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    setTransactionCancelled(false);
    setIsBusy(true);

    const createTx = async (): Promise<boolean> => {

      if (!publicKey || !msp || !selectedVestingContract || !selectedToken) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('CreateStreams for a treasury transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut('Wallet address:', publicKey.toBase58());

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      const associatedToken = new PublicKey(selectedToken?.address as string);
      const treasury = new PublicKey(selectedVestingContract.id as string);
      const price = selectedToken ? getTokenPriceByAddress(selectedToken.address) || getTokenPriceBySymbol(selectedToken.symbol) : 0;
      const amount = makeDecimal(new BN(params.tokenAmount), selectedToken.decimals);

      // Create a transaction
      const data = {
        payer: publicKey.toBase58(),                                    // payer
        treasurer: publicKey.toBase58(),                                // treasurer
        treasury: treasury.toBase58(),                                  // treasury
        beneficiary: params.beneficiaryAddress,                         // beneficiary
        treasuryAssociatedTokenMint: associatedToken,                   // treasuryAssociatedTokenMint
        allocationAssigned: params.tokenAmount,                         // allocationAssigned
        streamName: params.streamName                                   // streamName
      };
      consoleOut('data:', data);

      // Report event to Segment analytics
      const segmentData: SegmentVestingContractStreamCreateData = {
        asset: selectedToken.symbol,
        assetPrice: price,
        vestingContract: selectedVestingContract.id as string,
        beneficiary: params.beneficiaryAddress,
        allocation: amount,
        feePayedByTreasurer: params.feePayedByTreasurer,
        valueInUsd: amount * price,
        rateAmount: params.rateAmount,
        interval: params.interval,
      };
      consoleOut('segment data:', segmentData, 'brown');
      segmentAnalytics.recordEvent(AppUsageEvent.VestingContractStreamCreateFormButton, segmentData);

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
        customLogger.logWarning('CreateStreams for a treasury transaction failed', { transcript: transactionLog });
        return false;
      }

      const result = await msp.createStreamWithTemplate(
        publicKey,                                // payer
        publicKey,                                // treasurer
        treasury,                                 // treasury
        new PublicKey(params.beneficiaryAddress), // beneficiary
        associatedToken,                          // treasuryAssociatedTokenMint
        params.tokenAmount,                       // allocationAssigned
        params.streamName                         // streamName
      )
        .then(values => {
          if (!values || !values.length) { return false; }
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction
          });
          transaction = values[0];
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
            result: getTxIxResume(values[0])
          });
          return true;
        })
        .catch(error => {
          console.error('createStream error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('CreateStream for a treasury transaction failed', { transcript: transactionLog });
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

    if (wallet && selectedToken && selectedVestingContract) {
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
              loadingMessage: `Create stream to send ${params.sendRate} on vesting contract ${selectedVestingContract.name}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `Stream to send ${params.sendRate} has been created.`,
              extras: params
            });
            setIsBusy(false);
            closeCreateStreamModal(true);
            setNeedReloadMultisig(true);
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
    setOngoingOperation(undefined);
    resetTransactionStatus();
  };

  const onExecuteVestingContractTransferFundsTx = async (params: VestingContractWithdrawOptions) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.TreasuryCreate);
    setRetryOperationPayload(params);
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
      const price = selectedToken ? getTokenPriceByAddress(selectedToken.address) || getTokenPriceBySymbol(selectedToken.symbol) : 0;

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
        asset: selectedToken ? selectedToken.symbol : '-',
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

    if (wallet && selectedToken && selectedVestingContract) {
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
              operationType: OperationType.TreasuryWithdraw,
              finality: "confirmed",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: `Withdraw ${formatThousands(
                parseFloat(params.amount),
                selectedToken.decimals
              )} ${selectedToken.symbol} from vesting contract ${selectedVestingContract.name}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `Successful withdrawal of ${formatThousands(
                parseFloat(params.amount),
                selectedToken.decimals
              )} ${selectedToken.symbol} from vesting contract ${selectedVestingContract.name}`,
              extras: params
            });
            setIsBusy(false);
            closeVestingContractTransferFundsModal();
            setNeedReloadMultisig(true);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  };

  const onRefreshTreasuryBalanceTransactionFinished = useCallback(() => {
    refreshTokenBalance();
    setOngoingOperation(undefined);
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
    setOngoingOperation(OperationType.TreasuryRefreshBalance);
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

      if (!isMultisigTreasury()) {
        return await msp.refreshTreasuryData(
          new PublicKey(publicKey),
          new PublicKey(data.treasurer),
          new PublicKey(data.treasury)
        );
      }

      if (!selectedVestingContract || !multisigClient || !multisigAccounts || !publicKey) { return null; }

      const treasury = selectedVestingContract as Treasury;
      const multisig = multisigAccounts.filter(m => m.authority.toBase58() === treasury.treasurer)[0];

      if (!multisig) { return null; }

      const refreshTreasury = await msp.refreshTreasuryData(
        new PublicKey(publicKey),
        multisig.authority,
        new PublicKey(data.treasury)
      );

      const ixData = Buffer.from(refreshTreasury.instructions[0].data);
      const ixAccounts = refreshTreasury.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
        publicKey,
        "Refresh Treasury Data",
        "", // description
        new Date(expirationTime * 1_000),
        OperationType.TreasuryRefreshBalance,
        multisig.id,
        MSPV2Constants.MSP,
        ixAccounts,
        ixData
      );

      return tx;
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
              extras: selectedVestingContract.id as string
            });
            setIsBusy(false);
            onRefreshTreasuryBalanceTransactionFinished();
            setNeedReloadMultisig(true);
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
    multisigClient,
    selectedVestingContract,
    multisigAccounts,
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

    if (!publicKey || !userTokens || !tokenList || !splTokenList || accounts.tokenAccounts.length === 0) {
      return;
    }

    const balancesMap: any = {};

    fetchAccountTokens(connection, publicKey)
      .then(accTks => {
        if (accTks) {

          const meanTokensCopy = new Array<TokenInfo>();
          const intersectedList = new Array<TokenInfo>();
          const userTokensCopy = JSON.parse(JSON.stringify(userTokens)) as TokenInfo[];

          // Build meanTokensCopy including the MeanFi pinned tokens
          userTokensCopy.forEach(item => {
            meanTokensCopy.push(item);
          });

          // Now add all other items but excluding those in userTokens
          splTokenList.forEach(item => {
            if (!userTokens.includes(item)) {
              meanTokensCopy.push(item);
            }
          });

          // Create a list containing tokens for the user owned token accounts
          accTks.forEach(item => {
            balancesMap[item.parsedInfo.mint] = item.parsedInfo.tokenAmount.uiAmount || 0;
            const isTokenAccountInTheList = intersectedList.some(t => t.address === item.parsedInfo.mint);
            const tokenFromMeanTokensCopy = meanTokensCopy.find(t => t.address === item.parsedInfo.mint);
            if (tokenFromMeanTokensCopy && !isTokenAccountInTheList) {
              intersectedList.push(tokenFromMeanTokensCopy);
            }
          });

          intersectedList.unshift(userTokensCopy[0]);
          balancesMap[userTokensCopy[0].address] = nativeBalance;
          intersectedList.sort((a, b) => {
            if ((balancesMap[a.address] || 0) < (balancesMap[b.address] || 0)) {
              return 1;
            } else if ((balancesMap[a.address] || 0) > (balancesMap[b.address] || 0)) {
              return -1;
            }
            return 0;
          });

          setSelectedList(intersectedList);
          if (!selectedToken) { setSelectedToken(intersectedList[0]); }

        } else {
          for (const t of tokenList) {
            balancesMap[t.address] = 0;
          }
          // set the list to the userTokens list
          setSelectedList(tokenList);
          if (!selectedToken) { setSelectedToken(tokenList[0]); }
        }
      })
      .catch(error => {
        console.error(error);
        for (const t of tokenList) {
          balancesMap[t.address] = 0;
        }
        setSelectedList(tokenList);
        if (!selectedToken) { setSelectedToken(tokenList[0]); }
      })
      .finally(() => setUserBalances(balancesMap));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    publicKey,
    tokenList,
    connection,
    userTokens,
    splTokenList,
    nativeBalance,
    selectedToken,
    accounts.tokenAccounts,
  ]);

  // Build CTAs
  useEffect(() => {

    const numMaxCtas = isXsDevice ? 2 : 5;
    const actions: MetaInfoCta[] = [];
    let ctaItems = 0;

    // Create Stream
    actions.push({
      action: MetaInfoCtaAction.VestingContractCreateStreamOnce,
      isVisible: true,
      caption: 'Create stream',
      disabled: !isInspectedAccountTheConnectedWallet() || !getAvailableStreamingBalance(),
      uiComponentType: 'button',
      uiComponentId: `button-${MetaInfoCtaAction.VestingContractCreateStreamOnce}`,
      tooltip: '',
      callBack: showCreateStreamModal
    });
    ctaItems++;

    // Bulk create
    // actions.push({
    //   action: MetaInfoCtaAction.VestingContractCreateStreamBulk,
    //   isVisible: true,
    //   caption: 'Bulk create',
    //   disabled: !isInspectedAccountTheConnectedWallet(),
    //   uiComponentType: 'button',
    //   uiComponentId: `button-${MetaInfoCtaAction.VestingContractCreateStreamBulk}`,
    //   tooltip: '',
    //   callBack: () => { }
    // });
    // ctaItems++;

    // Add funds
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
    ctaItems++;   // Last increment. It seems all other items will go inside the vellipsis menu anyways

    // View SOL Balance
    actions.push({
      action: MetaInfoCtaAction.VestingContractViewSolBalance,
      caption: 'View SOL Balance',
      isVisible: true,
      uiComponentType: 'menuitem',
      disabled: !isInspectedAccountTheConnectedWallet(),
      uiComponentId: `menuitem-${ctaItems}-${MetaInfoCtaAction.VestingContractViewSolBalance}`,
      tooltip: '',
      callBack: showVestingContractSolBalanceModal
    });
    ctaItems++;

    // Refresh Account Data
    actions.push({
      action: MetaInfoCtaAction.VestingContractRefreshAccount,
      caption: 'Refresh account data',
      isVisible: true,
      uiComponentType: 'menuitem',
      disabled: !isInspectedAccountTheConnectedWallet(),
      uiComponentId: `menuitem-${ctaItems}-${MetaInfoCtaAction.VestingContractRefreshAccount}`,
      tooltip: '',
      callBack: onExecuteRefreshVestingContractBalance
    });
    ctaItems++;

    // Withdraw funds
    actions.push({
      action: MetaInfoCtaAction.VestingContractWithdrawFunds,
      caption: 'Withdraw funds',
      isVisible: true,
      uiComponentType: 'menuitem',
      disabled: !isInspectedAccountTheConnectedWallet(),
      uiComponentId: `menuitem-${ctaItems}-${MetaInfoCtaAction.VestingContractWithdrawFunds}`,
      tooltip: '',
      callBack: showVestingContractTransferFundsModal
    });
    ctaItems++;

    // Close Contract
    actions.push({
      action: MetaInfoCtaAction.VestingContractClose,
      caption: 'Close Contract',
      isVisible: true,
      uiComponentType: 'menuitem',
      disabled: !isInspectedAccountTheConnectedWallet(),
      uiComponentId: `menuitem-${ctaItems}-${MetaInfoCtaAction.VestingContractClose}`,
      tooltip: '',
      callBack: showVestingContractCloseModal
    });
    ctaItems++;

    setAssetCtas(actions);

  }, [
    isXsDevice,
    showAddFundsModal,
    showCreateStreamModal,
    getAvailableStreamingBalance,
    showVestingContractCloseModal,
    showVestingContractSolBalanceModal,
    isInspectedAccountTheConnectedWallet,
    showVestingContractTransferFundsModal,
    onExecuteRefreshVestingContractBalance,
  ]);

  // Load treasuries once per page access
  useEffect(() => {

    if (!publicKey || treasuriesLoaded) { return; }

    consoleOut('Calling refreshTreasuries...', '', 'blue');
    setTreasuriesLoaded(true);
    refreshVestingContracts(true);

  }, [publicKey, refreshVestingContracts, treasuriesLoaded]);

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
          consoleOut('selectedVestingContract:', item, 'blue');
          if (autoOpenDetailsPanel) {
            setDtailsPanelOpen(true);
          }
        } else {
          // /vesting/:address/contracts/:vestingContract
          const contractId = treasuryList[0].id.toString();
          const url = `${VESTING_ROUTE_BASE_PATH}/${accountAddress}/contracts/${contractId}`;
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

  // Set a tab if none already set
  useEffect(() => {
    if (publicKey && accountAddress && vestingContractAddress && !accountDetailTab) {
      // /vesting/:address/contracts/:vestingContract/:activeTab
      const url = `${VESTING_ROUTE_BASE_PATH}/${accountAddress}/contracts/${vestingContractAddress}/overview`;
      navigate(url);
    }
  }, [accountAddress, accountDetailTab, navigate, publicKey, vestingContractAddress]);

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
    parseSerumMultisigAccount,
    setPendingMultisigTxCount,
  ]);

  // Get the Vesting contract settings template
  useEffect(() => {
    if (publicKey && msp && selectedVestingContract) {
      const pk = new PublicKey(selectedVestingContract.id as string);
      consoleOut('VC address:', pk.toString(), 'blue');
      msp.getStreamTemplate(pk)
      .then(value => {
        consoleOut('StreamTemplate:', value, 'blue');
        setStreamTemplate(value);
      })
    }
  }, [msp, publicKey, selectedVestingContract]);

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
      }
    }

    return () => {
      clearTimeout();
    };

  }, [
    connected,
    publicKey,
    previousWalletConnectState,
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

  ////////////////////////////
  //   Events and actions   //
  ////////////////////////////

  const onBackButtonClicked = () => {
    setDtailsPanelOpen(false);
    setAutoOpenDetailsPanel(false);
  }

  const onTabChange = useCallback((activeKey: string) => {
    consoleOut('Selected tab option:', activeKey, 'blue');
    // /vesting/:address/contracts/:vestingContract/:activeTab
    const url = `${VESTING_ROUTE_BASE_PATH}/${accountAddress}/contracts/${vestingContractAddress}/${activeKey}`;
    navigate(url);
  }, [accountAddress, navigate, vestingContractAddress]);


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
            vestingContract={selectedVestingContract}
            streamTemplate={streamTemplate}
          />
        </TabPane>
        <TabPane tab={`Streams (${selectedVestingContract.totalStreams})`} key={"streams"}>
          <VestingContractStreamList
            msp={msp}
            vestingContract={selectedVestingContract}
            accountAddress={accountAddress}
            loadingTreasuryStreams={loadingTreasuryStreams}
            treasuryStreams={treasuryStreams}
            nativeBalance={nativeBalance}
            userBalances={userBalances}
          />
        </TabPane>
        <TabPane tab="Activity" key={"activity"}>
          <VestingContractActivity
            param1="list item 1"
            param2="list item 2"
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
      <div className="container main-container">
        <div className="interaction-area">
          <div className="title-and-subtitle mb-2">
            <div className="title">
              <IconMoneyTransfer className="mean-svg-icons" />
              <div>{t('vesting.screen-title')}</div>
            </div>
            <div className="subtitle mb-3">
              {t('vesting.screen-subtitle')}
            </div>
            <div className="subtitle">
              {t('vesting.screen-subtitle2')}
            </div>
            <h3 className="user-instruction-headline">{t('vesting.user-instruction-headline')}</h3>
          </div>
          <div className="place-transaction-box flat mb-0">
            <VestingContractCreateForm
              inModal={false}
              isBusy={isBusy}
              token={selectedToken}
              selectedList={selectedList}
              userBalances={userBalances}
              nativeBalance={nativeBalance}
              onStartTransaction={(options: VestingContractCreateOptions) => onAcceptCreateVestingContract(options)}
              transactionFees={createVestingContractTxFees}
              tokenChanged={(token: TokenInfo | undefined) => setSelectedToken(token)}
            />
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
    selectedToken,
    createVestingContractTxFees,
    onAcceptCreateVestingContract,
    setSelectedToken,
    t,
  ]);

  // Unauthorized access or disconnected access
  if (!publicKey || (publicKey && accountAddress && getQueryAccountType() !== "multisig" && publicKey.toBase58() !== accountAddress)) {
    return (
      <>
        <div className="container main-container">
          <div className="interaction-area">
            <div className="title-and-subtitle w-75 h-75">
              <div className="title">
                <IconMoneyTransfer className="mean-svg-icons" />
                <div>{t('vesting.screen-title')}</div>
              </div>
              <div className="subtitle mb-3">
                {t('vesting.screen-subtitle')}
              </div>
              <div className="subtitle">
                {t('vesting.screen-subtitle2')}
              </div>
              <div className="w-50 h-100 p-5 text-center flex-column flex-center">
                <div className="text-center mb-2">
                  <WarningFilled style={{ fontSize: 48 }} className="icon fg-warning" />
                </div>
                {!publicKey ? (
                  <h3>Please connect your wallet to see your vesting contracts</h3>
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

  // Render the On-boarding to Mean Vesting by helping the user on creating
  // the first Vesting Contract if the user has none
  if (treasuriesLoaded && treasuryList && treasuryList.length > 0 && !loadingTreasuries ) {
    // Render normal UI
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
        <div className="container main-container">
          {publicKey ? (
            <div className="interaction-area">

              <div className={`meanfi-two-panel-layout ${detailsPanelOpen ? 'details-open' : ''}`}>

                {/* Left / top panel */}
                <div className="meanfi-two-panel-left">
  
                  <div className="meanfi-panel-heading">
                    <span className="title">{t('vesting.screen-title')} ({treasuryList.length})</span>
                    <div className="user-address">
                      <span className="fg-secondary">
                        (<Tooltip placement="bottom" title={t('assets.account-address-copy-cta')}>
                          <span className="simplelink underline-on-hover" onClick={() => copyAddressToClipboard(accountAddress)}>
                            {shortenAddress(accountAddress, 5)}
                          </span>
                        </Tooltip>)
                      </span>
                      <span className="icon-button-container">
                        <Button
                          type="default"
                          shape="circle"
                          size="middle"
                          icon={<IconExternalLink className="mean-svg-icons" style={{width: "18", height: "18"}} />}
                          onClick={() => openLinkInNewTab(`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${accountAddress}${getSolanaExplorerClusterParam()}`)}
                        />
                      </span>
                      <div id="soft-refresh-contracts-cta" onClick={() => refreshVestingContracts(false)}></div>
                      <div id="hard-refresh-contracts-cta" onClick={() => refreshVestingContracts(true)}></div>
                    </div>
                  </div>

                  <div className="inner-container">
                    <div className="item-block vertical-scroll">
  
                      <div className="asset-category flex-column">
                        <VestingContractList
                          streamingAccounts={treasuryList}
                          selectedAccount={selectedVestingContract}
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
                        <VestingContractDetails vestingContract={selectedVestingContract} />
                        {/* Render CTAs row here */}
                        {renderMetaInfoCtaRow()}
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
            isBusy={isBusy}
            isVisible={isVestingContractCreateModalVisible}
            handleOk={(options: VestingContractCreateOptions) => onAcceptCreateVestingContract(options)}
            transactionFees={createVestingContractTxFees}
            handleClose={closeVestingContractCreateModal}
            selectedToken={selectedToken}
            nativeBalance={nativeBalance}
            userBalances={userBalances}
            selectedList={selectedList}
          />
        )}

        {isAddFundsModalVisible && (
          <VestingContractAddFundsModal
            handleOk={(params: TreasuryTopupParams) => onAcceptAddFunds(params)}
            handleClose={closeAddFundsModal}
            nativeBalance={nativeBalance}
            transactionFees={transactionFees}
            withdrawTransactionFees={withdrawTransactionFees}
            vestingContract={selectedVestingContract}
            isVisible={isAddFundsModalVisible}
            userBalances={userBalances}
            treasuryStreams={treasuryStreams}
            associatedToken={selectedVestingContract ? selectedVestingContract.associatedToken as string : ''}
            isBusy={isBusy}
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
            isVisible={isCreateStreamModalVisible}
            nativeBalance={nativeBalance}
            minRequiredBalance={minRequiredBalance}
            isMultisigTreasury={isMultisigTreasury()}
            streamTemplate={streamTemplate}
            transactionFees={transactionFees}
            vestingContract={selectedVestingContract}
            withdrawTransactionFees={withdrawTransactionFees}
            isBusy={isBusy}
            isXsDevice={isXsDevice}
          />
        )}

        {isVestingContractCloseModalOpen && selectedVestingContract && (
          <VestingContractCloseModal
            handleClose={hideVestingContractCloseModal}
            handleOk={onAcceptCloseVestingContractModal}
            nativeBalance={nativeBalance}
            treasuryBalance={treasuryEffectiveBalance}
            vestingContract={selectedVestingContract}
            isVisible={isVestingContractCloseModalOpen}
            transactionFees={transactionFees}
            isBusy={isBusy}
          />
        )}

        {isVestingContractTransferFundsModalVisible && (
          <VestingContractWithdrawFundsModal
            isVisible={isVestingContractTransferFundsModalVisible}
            nativeBalance={nativeBalance}
            transactionFees={transactionFees}
            treasuryDetails={selectedVestingContract}
            isMultisigTreasury={isMultisigTreasury()}
            multisigAccounts={multisigAccounts}
            minRequiredBalance={minRequiredBalance}
            handleOk={(options: VestingContractWithdrawOptions) => onAcceptVestingContractTransferFunds(options)}
            handleClose={closeVestingContractTransferFundsModal}
            isBusy={isBusy}
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
