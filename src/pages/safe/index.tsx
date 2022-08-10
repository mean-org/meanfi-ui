import { useCallback, useContext, useMemo, useRef } from 'react';
import {
  ArrowLeftOutlined,
  LoadingOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  Account,
  ConfirmOptions,
  Connection,
  LAMPORTS_PER_SOL,
  MemcmpFilter,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction
} from '@solana/web3.js';
import { useEffect, useState } from 'react';
import { PreFooter } from '../../components/PreFooter';
import { getSolanaExplorerClusterParam, useConnectionConfig } from '../../contexts/connection';
import { useWallet } from '../../contexts/wallet';
import { AppStateContext, TransactionStatusInfo } from '../../contexts/appstate';
import { useTranslation } from 'react-i18next';
import { Identicon } from '../../components/Identicon';
import {
  formatThousands,
  getTokenAmountAndSymbolByTokenAddress,
  getTxIxResume,
  shortenAddress,
} from '../../utils/utils';

import { Button, Dropdown, Empty, Menu, Spin, Tooltip } from 'antd';
import {
  consoleOut,
  getTransactionStatusForLogs,
  isLocal,
  isDev,
  toUsCurrency,
  delay
} from '../../utils/ui';

import { MEAN_MULTISIG_ACCOUNT_LAMPORTS, SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from '../../constants';
import { isDesktop } from "react-device-detect";
import useWindowSize from '../../hooks/useWindowResize';
import { EventType, OperationType, TransactionStatus } from '../../models/enums';
import { IconEllipsisVertical, IconLoading, IconSafe, IconUserGroup, IconUsers } from '../../Icons';
import { useNativeAccount } from '../../contexts/accounts';
import { MEAN_MULTISIG, NATIVE_SOL_MINT } from '../../utils/ids';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import './style.scss';

// MULTISIG
import { AnchorProvider, BN, Idl, Program } from "@project-serum/anchor";
import { MultisigEditModal } from '../../components/MultisigEditModal';
import { customLogger } from '../..';
import { openNotification } from '../../components/Notifications';
import { SafeMeanInfo } from './components/SafeMeanInfo';
import { ProposalDetailsView } from './components/ProposalDetails';
import { MultisigProposalModal } from '../../components/MultisigProposalModal';
import { ProgramDetailsView } from './components/ProgramDetails';
import SerumIDL from '../../models/serum-multisig-idl';
import { AppsProvider, NETWORK, App, UiInstruction, AppConfig, UiElement, Arg } from '@mean-dao/mean-multisig-apps';
import { SafeSerumInfoView } from './components/SafeSerumInfo';
import {
  DEFAULT_EXPIRATION_TIME_SECONDS,
  getFees,
  MeanMultisig,
  MEAN_MULTISIG_PROGRAM,
  MultisigInfo,
  MultisigParticipant,
  MultisigTransaction,
  MultisigTransactionFees,
  MultisigTransactionSummary,
  MULTISIG_ACTIONS
} from '@mean-dao/mean-multisig-sdk/';
import { createProgram, getDepositIx, getWithdrawIx, getGatewayToken } from '@mean-dao/mean-multisig-apps/lib/apps/credix/func';
import { NATIVE_SOL } from '../../utils/tokens';
import { UserTokenAccount } from '../../models/transactions';
import { ACCOUNT_LAYOUT } from '../../utils/layouts';
import { confirmationEvents, TxConfirmationContext, TxConfirmationInfo } from "../../contexts/transaction-status";
import { AppUsageEvent } from '../../utils/segment-service';
import { segmentAnalytics } from "../../App";
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ProgramAccounts } from '../../utils/accounts';
import { CreateNewProposalParams, CreateNewSafeParams, MultisigProposalsWithAuthority, NATIVE_LOADER, parseSerializedTx, ZERO_FEES } from '../../models/multisig';
import { Category, MSP, Treasury } from '@mean-dao/msp';
import { ErrorReportModal } from '../../components/ErrorReportModal';
import { MultisigCreateModal } from '../../components/MultisigCreateModal';

export const MULTISIG_ROUTE_BASE_PATH = '/multisig';
const CREDIX_PROGRAM = new PublicKey("CRDx2YkdtYtGZXGHZ59wNv1EwKHQndnRc1gT4p8i2vPX");
const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;
const proposalLoadStatusRegister = new Map<string, boolean>();

export const SafeView = () => {
  const connectionConfig = useConnectionConfig();
  const { publicKey, connected, wallet } = useWallet();
  const [searchParams] = useSearchParams();
  const { address, id } = useParams();
  const {
    programs,
    coinPrices,
    multisigTxs,
    isWhitelisted,
    multisigAccounts,
    selectedMultisig,
    transactionStatus,
    streamV2ProgramAddress,
    loadingMultisigAccounts,
    highLightableMultisigId,
    previousWalletConnectState,
    setNeedReloadMultisigAccounts,
    setHighLightableMultisigId,
    getTokenPriceByAddress,
    getTokenByMintAddress,
    setMultisigSolBalance,
    getTokenPriceBySymbol,
    setTransactionStatus,
    setTotalSafeBalance,
    refreshTokenBalance,
    setMultisigAccounts,
    setSelectedMultisig,
    refreshMultisigs,
    setMultisigTxs,
    setPrograms,
  } = useContext(AppStateContext);
  const {
    fetchTxInfoStatus,
    confirmationHistory,
    lastSentTxSignature,
    lastSentTxOperationType,
    clearTxConfirmationContext,
    enqueueTransactionConfirmation
  } = useContext(TxConfirmationContext);

  const { t } = useTranslation('common');
  const { account } = useNativeAccount();
  const location = useLocation();
  const navigate = useNavigate();
  // Misc hooks
  const { width } = useWindowSize();
  const [isSmallUpScreen, setIsSmallUpScreen] = useState(isDesktop);
  // Balance and fees
  const [nativeBalance, setNativeBalance] = useState(0);
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [transactionFees, setTransactionFees] = useState<MultisigTransactionFees>(ZERO_FEES);
  // Active Txs
  const [needRefreshTxs, setNeedRefreshTxs] = useState(false);
  const [loadingProposals, setLoadingProposals] = useState(false);
  const [isProposalDetails, setIsProposalDetails] = useState(false);
  const [highlightedMultisigTx, sethHighlightedMultisigTx] = useState<MultisigTransaction | undefined>();
  const [multisigTransactionSummary, setMultisigTransactionSummary] = useState<MultisigTransactionSummary | undefined>(undefined);
  // Tx control
  const [isBusy, setIsBusy] = useState(false);
  const [transactionCancelled, setTransactionCancelled] = useState(false);

  // Programs
  const [programSelected, setProgramSelected] = useState<any>();
  const [needReloadPrograms, setNeedReloadPrograms] = useState(false);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [isProgramDetails, setIsProgramDetails] = useState(false);

  // Other
  const [minRequiredBalance, setMinRequiredBalance] = useState(0);
  const [appsProvider, setAppsProvider] = useState<AppsProvider>();
  const [solanaApps, setSolanaApps] = useState<App[]>([]);
  const [serumAccounts, setSerumAccounts] = useState<MultisigInfo[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [serumMultisigTxs, setSerumMultisigTxs] = useState<MultisigTransaction[]>([]);
  const [operationPayload, setOperationPayload] = useState<any>(undefined);
  const [loadingProposalDetails, setLoadingProposalDetails] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<MultisigTransaction | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isAssetDetails, setIsAssetDetails] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [assetSelected, setAssetSelected] = useState<any>();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [selectedTab, setSelectedTab] = useState<number>();
  const [multisigUsdValues, setMultisigUsdValues] = useState<Map<string, number> | undefined>();
  const [canSubscribe, setCanSubscribe] = useState(true);
  // Vesting contracts
  const [loadingTreasuries, setLoadingTreasuries] = useState(true);
  const [treasuryList, setTreasuryList] = useState<Treasury[]>([]);

  const [detailsPanelOpen, setDetailsPanelOpen] = useState(false);
  const [autoOpenDetailsPanel, setAutoOpenDetailsPanel] = useState(false);
  const [queryParamV, setQueryParamV] = useState<string | null>(null);
  const [lastError, setLastError] = useState<TransactionStatusInfo | undefined>(undefined);

  const connection = useMemo(() => new Connection(connectionConfig.endpoint, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true
  }), [
    connectionConfig.endpoint
  ]);

  useEffect(() => {

    if (!connectionConfig.cluster) { return; }

    const network = connectionConfig.cluster === "mainnet-beta"
      ? NETWORK.MainnetBeta
      : connectionConfig.cluster === "testnet"
      ? NETWORK.Testnet
      : NETWORK.Devnet;
    const provider = new AppsProvider(network);
    setAppsProvider(provider);
    provider
      .getApps()
      .then((apps: App[]) => {
        setSolanaApps(apps);
      });

  }, [
    connectionConfig.cluster
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
      console.log('New MSP from safes');
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

  // Live reference to the selected multisig
  const selectedMultisigRef = useRef(selectedMultisig);
  useEffect(() => {
    selectedMultisigRef.current = selectedMultisig;
  }, [selectedMultisig]);

  // Live reference to the selected proposal
  const selectedProposalRef = useRef(selectedProposal);
  useEffect(() => {
    selectedProposalRef.current = selectedProposal;
  }, [selectedProposal]);

  // Live reference to the last reflected error
  const lastErrorRef = useRef(lastError);
  useEffect(() => {
    lastErrorRef.current = lastError;
  }, [lastError]);

  const resetTransactionStatus = useCallback(() => {

    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }, [
    setTransactionStatus
  ]);

  const getAllUserV2Accounts = useCallback(async (account: string) => {

    if (!msp) { return []; }

    setTimeout(() => {
      setLoadingTreasuries(true);
    });

    const pk = new PublicKey(account);

    return await msp.listTreasuries(pk, true, true, Category.vesting);

  }, [msp]);

  const refreshVestingContracts = useCallback((address: string) => {

    if (!publicKey || !msp || !address) { return; }

    getAllUserV2Accounts(address)
      .then(treasuries => {
        consoleOut('Vesting contracts:', treasuries, 'blue');
        setTreasuryList(treasuries.map(vc => {
          return Object.assign({}, vc, {
            name: vc.name.trim()
          })
        }));
      })
      .catch(error => {
        console.error(error);
      })
      .finally(() => setLoadingTreasuries(false));

  }, [getAllUserV2Accounts, msp, publicKey]);

  const setProposalsLoading = useCallback((loading: boolean) => {
    if (!selectedMultisig) {
      consoleOut('unable to do setProposalsLoading!', 'selectedMultisig not available yet', 'red');
      return;
    }
    const multisigAuth = selectedMultisig.authority.toBase58();
    consoleOut(`setProposalsLoading for ${multisigAuth} with:`, loading, 'orange');
    if (loading) {
      proposalLoadStatusRegister.set(multisigAuth, loading);
      setLoadingProposals(true);
    } else {
      if (proposalLoadStatusRegister.has(multisigAuth)) {
        proposalLoadStatusRegister.delete(multisigAuth);
      } else {
        proposalLoadStatusRegister.set(multisigAuth, loading);
      }
    }
  }, [selectedMultisig]);

  // Search for pending proposal in confirmation history
  const hasMultisigPendingProposal = useCallback(() => {
    if (!selectedMultisigRef || !selectedMultisigRef.current) { return false; }
    const isTheReference = (item: TxConfirmationInfo) => {
      if ((item && item.extras && item.extras.multisigAuthority && item.extras.multisigAuthority === selectedMultisigRef.current?.authority.toBase58()) ||
          (item && item.extras && item.extras.multisigId && item.extras.multisigId === selectedMultisigRef.current?.authority.toBase58())) {
        return true;
      }
      return false;
    }

    if (confirmationHistory && confirmationHistory.length > 0) {

      const item = confirmationHistory.find(h => isTheReference(h) && h.txInfoFetchStatus === "fetching");

      if (item) {
        return true;
      }
    }

    return false;
  }, [confirmationHistory]);

  const onOpenMultisigModalClick = useCallback(() => {
    resetTransactionStatus();
    setIsMultisigCreateSafeModalVisible(true);
  },[resetTransactionStatus]);

  const onCreateMultisigClick = useCallback(() => {

    if (!multisigClient) { return; }

    getFees(multisigClient.getProgram(), MULTISIG_ACTIONS.createMultisig)
      .then(value => {
        setTransactionFees(value);
        consoleOut('transactionFees:', value, 'orange');
      });

    resetTransactionStatus();
    setIsCreateMultisigModalVisible(true);

  },[multisigClient, resetTransactionStatus]);

  const onAcceptCreateMultisig = (data: CreateNewSafeParams) => {
    consoleOut('multisig:', data, 'blue');
    onExecuteCreateMultisigTx(data);
  };

  const onAcceptCreateSerumMultisig = (data: any) => {
    consoleOut('serum multisig:', data, 'blue');
    onExecuteCreateSerumMultisigTx(data);
  };

  const onMultisigCreated = useCallback(() => {

    setIsCreateMultisigModalVisible(false);
    setIsMultisigCreateSafeModalVisible(false);
    resetTransactionStatus();
    setIsBusy(false);
    setTransactionFees(ZERO_FEES);

  },[resetTransactionStatus])

  const onMultisigModified = useCallback(() => {
    setIsBusy(false);
    setIsEditMultisigModalVisible(false);
    resetTransactionStatus();

    // openNotification({
    //   description: t('multisig.update-multisig.success-message'),
    //   duration: 10,
    //   type: "success"
    // });
    // await delay(150);
    // openNotification({
    //   description: "The proposal's status can be reviewed in the Multisig Safe's proposal list.",
    //   duration: 15,
    //   type: "success"
    // });
    openNotification({
      description: "The proposal can be reviewed in the Multisig's proposal list for other owners to approve.",
      duration: 10,
      type: "success"
    });
  },[
    resetTransactionStatus
  ]);

  const onExecuteCreateMultisigTx = useCallback(async (data: CreateNewSafeParams) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createMultisig = async (createParams: any) => {

      if (!multisigClient || !publicKey) { return; }

      const owners = createParams.owners.map((p: MultisigParticipant) => {
        return {
          address: new PublicKey(p.address),
          name: p.name
        }
      });

      // TODO: add parameter to accept isAllowedRejectProposal (Irshad)
      const tx = await multisigClient.createFundedMultisig(
        publicKey,
        MEAN_MULTISIG_ACCOUNT_LAMPORTS,
        createParams.label, 
        createParams.threshold, 
        owners
      );

      return tx;
    };

    const createTx = async (): Promise<boolean> => {

      if (publicKey && data) {
        consoleOut("Start transaction for create multisig", '', 'blue');
        consoleOut('Wallet address:', publicKey.toBase58());

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        // Create a transaction
        const payload = {
          wallet: publicKey.toBase58(),                               // wallet
          label: data.label,                                          // multisig label
          threshold: data.threshold,
          owners: data.owners,
          isAllowRejectProposal: data.isAllowToRejectProposal
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
        consoleOut('nativeBalance:', nativeBalance, 'blue');
        consoleOut('networkFee:', transactionFees.networkFee, 'blue');
        consoleOut('rentExempt:', transactionFees.rentExempt, 'blue');
        const totalMultisigFee = transactionFees.multisigFee + (MEAN_MULTISIG_ACCOUNT_LAMPORTS / LAMPORTS_PER_SOL);
        consoleOut('multisigFee:', totalMultisigFee, 'blue');
        const minRequired = totalMultisigFee + transactionFees.rentExempt + transactionFees.networkFee;
        consoleOut('Min required balance:', minRequired, 'blue');

        setMinRequiredBalance(minRequired);

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
              getTokenAmountAndSymbolByTokenAddress(
                minRequired, 
                NATIVE_SOL_MINT.toBase58()
              )
            })`
          });
          customLogger.logWarning('Create multisig transaction failed', { transcript: transactionLog });
          return false;
        }

        return await createMultisig(payload)
          .then(value => {
            if (!value) { return false; }
            consoleOut('createMultisig returned transaction:', value);
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
            console.error('createMultisig error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`
            });
            customLogger.logError('Create multisig transaction failed', { transcript: transactionLog });
            return false;
          });

      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Create multisig transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Create multisig transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Create multisig transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Create multisig transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Create multisig transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Create multisig transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet && data) {
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
              operationType: OperationType.CreateMultisig,
              finality: "confirmed",
              txInfoFetchStatus: "fetching",
              loadingTitle: 'Confirming transaction',
              loadingMessage: `Creating safe ${data.label}`,
              completedTitle: 'Transaction confirmed',
              completedMessage: `Safe ${data.label} successfully created`
            });
            onMultisigCreated();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    wallet,
    publicKey,
    connection,
    nativeBalance,
    multisigClient,
    transactionFees,
    transactionCancelled,
    transactionStatus.currentOperation,
    enqueueTransactionConfirmation,
    resetTransactionStatus,
    setTransactionStatus,
    onMultisigCreated,
  ]);

  const onExecuteCreateSerumMultisigTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createMultisig = async (data: any) => {

      if (!publicKey) { return null; }

      const multisig = new Account();
      // Disc. + threshold + nonce.
      const baseSize = 8 + 8 + 1 + 4;
      // Add enough for 2 more participants, in case the user changes one's
      /// mind later.
      const fudge = 64;
      // Can only grow the participant set by 2x the initialized value.
      const ownerSize = 10 * 32 + 8;
      const multisigSize = baseSize + ownerSize + fudge;
      const [, nonce] = await PublicKey.findProgramAddress(
        [multisig.publicKey.toBuffer()],
        multisigSerumClient.programId
      );

      const owners = [
        new PublicKey("ARmgYJkSQfbSifkXc4h7MGDAALznW5FFSHVucJ6j3vd7"),
        new PublicKey("HvPJ1eSqAnUtoC1dfKCAaDDFaWviHkbfBWoYJmP1BUDa"),
        new PublicKey("4BTx2qPnoxfXDKNyYzDTYXUGKGu9uTW3Cmbtfb2JY8AN"),
        new PublicKey("9TKa7AoHtpDnZLMkkCkL7nqvrweCairodoD3DcK3WShZ"),
        new PublicKey("qu32XN2Tys4zXT9AyBjUyKsUR4aAkaXJ4q6CrWMqcot"),
      ];

      const tx = multisigSerumClient.transaction.createMultisig(
        owners,
        new BN(1),
        nonce,
        {
          accounts: {
            multisig: multisig.publicKey,
            rent: SYSVAR_RENT_PUBKEY,
          },
          signers: [multisig],
          instructions: [
            await multisigSerumClient.account.multisig.createInstruction(
              multisig,
              multisigSize
            ),
          ],
        }
      )

      tx.feePayer = publicKey;
      const { blockhash } = await connection.getLatestBlockhash(connection.commitment);
      tx.recentBlockhash = blockhash;
      tx.partialSign(...[multisig]);

      return tx;
    };

    const createTx = async (): Promise<boolean> => {

      if (publicKey && data) {
        consoleOut("Start transaction for create multisig", '', 'blue');
        consoleOut('Wallet address:', publicKey.toBase58());

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        // Create a transaction
        const payload = {
          wallet: publicKey.toBase58(),    // wallet
          label: data.label,               // multisig label
          threshold: data.threshold,
          owners: data.owners
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
        consoleOut('nativeBalance:', nativeBalance, 'blue');
        consoleOut('networkFee:', transactionFees.networkFee, 'blue');
        consoleOut('rentExempt:', transactionFees.rentExempt, 'blue');
        consoleOut('multisigFee:', transactionFees.multisigFee, 'blue');
        const minRequired = transactionFees.multisigFee + transactionFees.rentExempt + transactionFees.networkFee;
        consoleOut('Min required balance:', minRequired, 'blue');

        setMinRequiredBalance(minRequired);

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
              getTokenAmountAndSymbolByTokenAddress(
                minRequired, 
                NATIVE_SOL_MINT.toBase58()
              )
            })`
          });
          customLogger.logWarning('Create multisig transaction failed', { transcript: transactionLog });
          return false;
        }

        return await createMultisig(data)
          .then(value => {
            if (!value) { return false; }
            consoleOut('createMultisig returned transaction:', value);
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
            console.error('createMultisig error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`
            });
            customLogger.logError('Create multisig transaction failed', { transcript: transactionLog });
            return false;
          });

      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Create multisig transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Create multisig transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Create multisig transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Create multisig transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Create multisig transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Create multisig transaction failed', { transcript: transactionLog });
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
              operationType: OperationType.CreateMultisig,
              finality: "confirmed",
              txInfoFetchStatus: "fetching",
              loadingTitle: 'Confirming transaction',
              loadingMessage: `Creating safe ${data.label}`,
              completedTitle: 'Transaction confirmed',
              completedMessage: `Safe ${data.label} successfully created`
            });
            onMultisigCreated();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    wallet,
    publicKey,
    connection,
    nativeBalance,
    transactionFees,
    transactionCancelled,
    multisigSerumClient.programId,
    multisigSerumClient.transaction,
    transactionStatus.currentOperation,
    multisigSerumClient.account.multisig,
    enqueueTransactionConfirmation,
    resetTransactionStatus,
    setTransactionStatus,
    onMultisigCreated,
  ]);

  const isCreatingMultisig = useCallback((): boolean => {

    return (
      fetchTxInfoStatus === "fetching" && 
      lastSentTxOperationType === OperationType.CreateMultisig
    );

  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  const isUnderDevelopment = () => {
    return isLocal() || (isDev() && isWhitelisted) ? true : false;
  }

  // Modal visibility flags
  const [isMultisigCreateSafeModalVisible, setIsMultisigCreateSafeModalVisible] = useState(false);
  const [isCreateMultisigModalVisible, setIsCreateMultisigModalVisible] = useState(false);
  const [isEditMultisigModalVisible, setIsEditMultisigModalVisible] = useState(false);
  const [isErrorReportingModalVisible, setIsErrorReportingModalVisible] = useState(false);
  const [isMultisigProposalModalVisible, setMultisigProposalModalVisible] = useState(false);
  const showErrorReportingModal = useCallback(() => setIsErrorReportingModalVisible(true), []);
  const closeErrorReportingModal = useCallback(() => {
    setIsErrorReportingModalVisible(false);
    resetTransactionStatus();
  }, [resetTransactionStatus]);

  // New Proposal
  const onNewProposalMultisigClick = useCallback(() => {

    if (!multisigClient) { return; }

    getFees(multisigClient.getProgram(), MULTISIG_ACTIONS.createTransaction)
      .then(value => {
        setTransactionFees(value);
        consoleOut('transactionFees:', value, 'orange');
      });

    resetTransactionStatus();
    setMultisigProposalModalVisible(true);

  }, [multisigClient, resetTransactionStatus]);

  const onEditMultisigClick = useCallback(() => {

    if (!multisigClient) { return; }

    getFees(multisigClient.getProgram(), MULTISIG_ACTIONS.createTransaction)
      .then(value => {
        setTransactionFees(value);
        consoleOut('transactionFees:', value, 'orange');
      });

    resetTransactionStatus();
    setIsEditMultisigModalVisible(true);

  },[multisigClient, resetTransactionStatus]);

  const onExecuteEditMultisigTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const editMultisig = async (data: any) => {

      if (!selectedMultisig || !multisigClient || !publicKey) {
        throw new Error("No selected multisig");
      }

      const [multisigSigner] = await PublicKey.findProgramAddress(
        [selectedMultisig.id.toBuffer()],
        MEAN_MULTISIG_PROGRAM
      );

      const owners = data.owners.map((p: MultisigParticipant) => {
        return {
          address: new PublicKey(p.address),
          name: p.name
        }
      });

      const program = multisigClient.getProgram();
      // Edit Multisig
      const ixData = program.coder.instruction.encode("edit_multisig", {
        owners: owners,
        threshold: new BN(data.threshold),
        label: data.label as any,
        title: data.title
      });

      const ixAccounts = [
        {
          pubkey: selectedMultisig.id,
          isWritable: true,
          isSigner: false,
        },
        {
          pubkey: multisigSigner,
          isWritable: false,
          isSigner: true,
        },
      ];

      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
        publicKey,
        data.title === "" ? "Edit safe" : data.title,
        "", // description
        new Date(expirationTime * 1_000),
        OperationType.EditMultisig,
        selectedMultisig.id,
        program.programId,
        ixAccounts,
        ixData
      );

      return tx;
    };

    const createTx = async (): Promise<boolean> => {

      if (publicKey && data) {
        consoleOut("Start transaction for create multisig", '', 'blue');
        consoleOut('Wallet address:', publicKey.toBase58());

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        // Create a transaction
        const payload = {
          wallet: publicKey.toBase58(),     // wallet
          title: data.title,
          label: data.label,                // multisig label
          threshold: data.threshold,
          owners: data.owners
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
        consoleOut('nativeBalance:', nativeBalance, 'blue');
        consoleOut('networkFee:', transactionFees.networkFee, 'blue');
        consoleOut('rentExempt:', transactionFees.rentExempt, 'blue');
        consoleOut('multisigFee:', transactionFees.multisigFee, 'blue');
        const minRequired = transactionFees.multisigFee + transactionFees.rentExempt + transactionFees.networkFee;
        consoleOut('Min required balance:', minRequired, 'blue');

        setMinRequiredBalance(minRequired);

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
              getTokenAmountAndSymbolByTokenAddress(
                minRequired, 
                NATIVE_SOL_MINT.toBase58()
              )
            })`
          });
          customLogger.logWarning('Edit multisig transaction failed', { transcript: transactionLog });
          return false;
        }

        return await editMultisig(data)
          .then(value => {
            if (!value) { return false; }
            consoleOut('editMultisig returned transaction:', value);
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
            console.error('editMultisig error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`
            });
            customLogger.logError('Edit multisig transaction failed', { transcript: transactionLog });
            return false;
          });

      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Edit multisig transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Create multisig transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Edit multisig transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Edit multisig transaction failed', { transcript: transactionLog });
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
          .catch((error: any) => {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
              result: { error, encodedTx }
            });
            customLogger.logError('Edit multisig transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Edit multisig transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet && selectedMultisig) {
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
              operationType: OperationType.EditMultisig,
              finality: "confirmed",
              txInfoFetchStatus: "fetching",
              loadingTitle: 'Confirming transaction',
              loadingMessage: `Editing the safe ${selectedMultisig.label}`,
              completedTitle: 'Transaction confirmed',
              completedMessage: `The changes to the ${selectedMultisig.label} Multisig Safe have been submitted for approval.`,
              extras: {
                multisigAuthority: selectedMultisig ? selectedMultisig.authority.toBase58() : ''
              }
            });
            await delay(500);
            onMultisigModified();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    wallet,
    publicKey,
    connection,
    nativeBalance,
    multisigClient,
    transactionFees,
    selectedMultisig,
    transactionCancelled,
    transactionStatus.currentOperation,
    enqueueTransactionConfirmation,
    resetTransactionStatus,
    setTransactionStatus,
    onMultisigModified
  ]);

  const onAcceptEditMultisig = (data: any) => {
    consoleOut('multisig:', data, 'blue');
    onExecuteEditMultisigTx(data);
  };

  const onAcceptCreateProposalModal = (data: CreateNewProposalParams) => {
    consoleOut('proposal data: ', data, 'blue');
    onExecuteCreateTransactionProposal(data);
  };

  const createProposalIx = useCallback(async (
    programId: PublicKey,
    uiConfig: AppConfig,
    uiInstruction: UiInstruction

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
    }

    const program = createAnchorProgram();
    const method = program.methods[uiInstruction.name];
    // ACCS
    const accElements = uiInstruction.uiElements
      .filter((elem: UiElement) => elem.dataElement && "isSigner" in elem.dataElement);
    const accounts: any = {};
    accElements.sort((a: any, b: any) => { return (a.index - b.index) });
    for (const accItem of accElements) {
      const accElement = accItem.dataElement as any;
      accounts[accItem.name] = accElement.dataValue;
    }
    // ARGS
    const argElements = uiInstruction.uiElements
      .filter((elem: UiElement) => elem.dataElement && !("isSigner" in elem.dataElement));
    const args = argElements.map((elem: UiElement) => {
      const argElement = elem.dataElement as Arg;
      return argElement.dataValue;
    });
    args.sort((a: any, b: any) => { return (a.index - b.index); });
    // console.log('args', args);
    // const me = method(...args);
    // console.log('me', me);
    const ix = await method(...args)
      .accounts(accounts)
      .instruction();

    return ix;    
  },[
    connection, 
    connectionConfig, 
    publicKey
  ]);

  const createCredixDepositIx = useCallback(async (investor: PublicKey, amount: number) => {

    if (!connection || !connectionConfig) { return null; }

    const program = createProgram(connection, "confirmed");
    console.log("data => ", investor.toBase58(), amount);

    const gatewayToken = await getGatewayToken(
      investor,
      new PublicKey("tniC2HX5yg2yDjMQEcUo1bHa44x9YdZVSqyKox21SDz")
    ); 

    console.log("gatewayToken => ", gatewayToken.toBase58());

    return await getDepositIx(program, investor, amount);

  }, [
    connection, 
    connectionConfig
  ]);

  const createCredixWithdrawIx = useCallback(async (investor: PublicKey, amount: number) => {

    if (!connection || !connectionConfig) { return null; }

    const program = createProgram(connection, "confirmed");
    console.log("data => ", investor.toBase58(), amount);

    const gatewayToken = await getGatewayToken(
      investor,
      new PublicKey("tniC2HX5yg2yDjMQEcUo1bHa44x9YdZVSqyKox21SDz")
    ); 

    console.log("gatewayToken => ", gatewayToken.toBase58());

    return await getWithdrawIx(program, investor, amount);

  }, [
    connection, 
    connectionConfig
  ]);

  const onExecuteCreateTransactionProposal = useCallback(async (data: CreateNewProposalParams) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createTransactionProposal = async (data: any) => {

      if (!publicKey || !selectedMultisig || !multisigClient) {
        throw new Error("No selected multisig");
      }

      let operation = 0;
      let proposalIx: TransactionInstruction | null = null;

      if (data.appId === NATIVE_LOADER.toBase58()) {
        const tx = await parseSerializedTx(connection, data.instruction.uiElements[0].value);
        if (!tx) { return null; }
        operation = OperationType.Custom;
        // TODO: Implement GetOperationFromProposal
        // operation = getProposalOperation(data);
        proposalIx = tx.instructions[0];
      } else if (data.appId === CREDIX_PROGRAM.toBase58()) { //
        if (data.instruction.name === "depositFunds") {
          operation = OperationType.CredixDepositFunds;
          proposalIx = await createCredixDepositIx(
            new PublicKey(data.instruction.uiElements[0].value),
            parseFloat(data.instruction.uiElements[1].value)
          );
        } else if (data.instruction.name === "withdrawFunds") {
          operation = OperationType.CredixWithdrawFunds;
          proposalIx = await createCredixWithdrawIx(
            new PublicKey(data.instruction.uiElements[0].value),
            parseFloat(data.instruction.uiElements[1].value)
          );
        }
      } else { // TODO: Implement GetOperationFromProposal
        // operation = getProposalOperation(data);
        proposalIx = await createProposalIx(
          new PublicKey(data.appId),
          data.config,
          data.instruction
        );
      }

      if (!proposalIx) {
        throw new Error("Invalid proposal instruction.");
      }
      
      const expirationTimeInSeconds = Date.now() / 1_000 + data.expires;
      const expirationDate = data.expires === 0 ? undefined : new Date(expirationTimeInSeconds * 1_000);
      const tx = await multisigClient.createTransaction(
        publicKey,
        data.title,
        data.description,
        expirationDate,
        operation,
        selectedMultisig.id,
        proposalIx.programId,
        proposalIx.keys,
        proposalIx.data // Buffer.from(dataBuffer.toString())
      );

      return tx;
    };

    const createTx = async (): Promise<boolean> => {

      if (!publicKey || !data || !multisigClient) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('createTransactionProposal failed', { transcript: transactionLog });
        return false;
      }

      consoleOut("Start transaction for create multisig", '', 'blue');
      consoleOut('Wallet address:', publicKey.toBase58());

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      // Data
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
      consoleOut('nativeBalance:', nativeBalance, 'blue');
      consoleOut('networkFee:', transactionFees.networkFee, 'blue');
      consoleOut('rentExempt:', transactionFees.rentExempt, 'blue');
      consoleOut('multisigFee:', transactionFees.multisigFee, 'blue');
      const minRequired = transactionFees.multisigFee + transactionFees.rentExempt + transactionFees.networkFee;
      consoleOut('Min required balance:', minRequired, 'blue');
      setMinRequiredBalance(minRequired);

      if (nativeBalance < minRequired) {
        const txStatusMsg = `Not enough balance ${
          getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
        } to pay for network fees ${
          getTokenAmountAndSymbolByTokenAddress(
            minRequired, 
            NATIVE_SOL_MINT.toBase58()
          )
        }`;
        const txStatus = {
          customError: txStatusMsg,
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure
        } as TransactionStatusInfo;
        setTransactionStatus(txStatus);
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: txStatusMsg
        });
        customLogger.logWarning('Create Transaction Proposal failed', { transcript: transactionLog });
        return false;
      }

      const result = await createTransactionProposal(data)
        .then((value: any) => {
          consoleOut('createTransactionProposal returned transaction:', value);
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
        .catch((error: any) => {
          console.error('createTransactionProposal error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('createTransactionProposal failed', { transcript: transactionLog });
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
        customLogger.logError('Create multisig transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Edit multisig transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Edit multisig transaction failed', { transcript: transactionLog });
          return false;
        });
    }

    const sendTx = async (): Promise<boolean> => {
      if (!wallet) {
        console.error('Cannot send transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot send transaction! Wallet not found!'
        });
        customLogger.logError('Edit multisig transaction failed', { transcript: transactionLog });
        return false;
      }

      const result = await connection
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
          customLogger.logError('Edit multisig transaction failed', { transcript: transactionLog });
          return false;
        });

      return result;
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
              operationType: OperationType.CreateTransaction,
              finality: "confirmed",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: `Create proposal: ${data.title}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `Successfully created proposal: ${data.title}`,
              extras: {
                multisigAuthority: data.multisigId
              }
            });
            setIsBusy(false);
            setMultisigProposalModalVisible(false);
            resetTransactionStatus();
          } else {
            setIsBusy(false); 
          }
        } else {
          setIsBusy(false); 
        }
      } else {
        setIsBusy(false); 
      }
    }
  }, [
    resetTransactionStatus, 
    wallet, 
    publicKey, 
    selectedMultisig, 
    multisigClient, 
    connection, 
    createCredixDepositIx, 
    createCredixWithdrawIx, 
    createProposalIx, 
    setTransactionStatus, 
    nativeBalance, 
    transactionFees.networkFee, 
    transactionFees.rentExempt, 
    transactionFees.multisigFee, 
    transactionStatus.currentOperation, 
    transactionCancelled, 
    enqueueTransactionConfirmation
  ]);

  const saveOperationPayloadOnStart = (payload: any) => {
    setOperationPayload(payload);
  };

  const onExecuteApproveTxCancelled = useCallback(() => {
    resetTransactionStatus();
    openNotification({
      type: "info",
      duration: 5,
      description: t('notifications.tx-not-approved')
    });
  },[
    t,
    resetTransactionStatus
  ]);

  const onExecuteApproveTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const approveTx = async (data: any) => {

      if (!selectedMultisig || !multisigClient || !publicKey) { return null; }

      const tx = await multisigClient.approveTransaction(publicKey, data.transaction.id);
  
      return tx;
    };

    const createTx = async (): Promise<boolean> => {

      if (publicKey && data) {

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        // Create a transaction
        const payload = { transaction: data.transaction };        
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
        const minRequired = 0.000005;
        consoleOut('nativeBalance:', nativeBalance, 'blue');
        consoleOut('Min required balance:', minRequired, 'blue');
        setMinRequiredBalance(minRequired);

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
              getTokenAmountAndSymbolByTokenAddress(
                minRequired, 
                NATIVE_SOL_MINT.toBase58()
              )
            })`
          });
          customLogger.logWarning('Multisig Approve transaction failed', { transcript: transactionLog });
          openNotification({
            description: t('transactions.status.tx-start-failure', {
              accountBalance: getTokenAmountAndSymbolByTokenAddress(
                nativeBalance,
                NATIVE_SOL_MINT.toBase58()
              ),
              feeAmount: getTokenAmountAndSymbolByTokenAddress(
                minRequired,
                NATIVE_SOL_MINT.toBase58()
              )}),
            type: "info"
          });
          return false;
        }

        return await approveTx(payload)
          .then(value => {
            if (!value) { return false; }
            consoleOut('approveTx returned transaction:', value);
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
            console.error('mint tokens error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`
            });
            customLogger.logError('Multisig Approve transaction failed', { transcript: transactionLog });
            return false;
          });

      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Multisig Approve transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Multisig Approve transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Multisig Approve transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Multisig Approve transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Multisig Approve transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Multisig Approve transaction failed', { transcript: transactionLog });
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
              operationType: OperationType.ApproveTransaction,
              finality: "finalized",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: `Approve proposal: ${data.transaction.details.title}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `Successfully approved proposal: ${data.transaction.details.title}`,
              extras: {
                multisigAuthority: data.transaction.multisig.toBase58(),
                transactionId: data.transaction.id
              }
            });
            resetTransactionStatus();
          } else { setIsBusy(false); }
        } else { 
          setIsBusy(false);
          onExecuteApproveTxCancelled();
        }
      } else { setIsBusy(false); }
    }

  }, [
    resetTransactionStatus, 
    wallet, 
    selectedMultisig, 
    multisigClient, 
    publicKey, 
    setTransactionStatus, 
    nativeBalance, 
    transactionStatus.currentOperation, 
    t, 
    connection, 
    transactionCancelled, 
    enqueueTransactionConfirmation, 
    onExecuteApproveTxCancelled
  ]);

  const onExecuteRejectTxCancelled = useCallback(() => {
    resetTransactionStatus();
    openNotification({
      type: "info",
      duration: 5,
      description: t('notifications.tx-not-approved')
    });
  },[
    t,
    resetTransactionStatus
  ]);

  const onExecuteRejectTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const rejectTx = async (data: any) => {

      if (!selectedMultisig || !multisigClient || !publicKey) { return null; }

      const tx = await multisigClient.rejectTransaction(publicKey, data.transaction.id);
  
      return tx;
    };

    const createTx = async (): Promise<boolean> => {

      if (publicKey && data) {

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        // Create a transaction
        const payload = { transaction: data.transaction };        
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
        const minRequired = 0.000005;
        consoleOut('nativeBalance:', nativeBalance, 'blue');
        consoleOut('Min required balance:', minRequired, 'blue');
        setMinRequiredBalance(minRequired);

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
              getTokenAmountAndSymbolByTokenAddress(
                minRequired, 
                NATIVE_SOL_MINT.toBase58()
              )
            })`
          });
          customLogger.logWarning('Multisig Reject transaction failed', { transcript: transactionLog });
          openNotification({
            description: t('transactions.status.tx-start-failure', {
              accountBalance: getTokenAmountAndSymbolByTokenAddress(
                nativeBalance,
                NATIVE_SOL_MINT.toBase58()
              ),
              feeAmount: getTokenAmountAndSymbolByTokenAddress(
                minRequired,
                NATIVE_SOL_MINT.toBase58()
              )}),
            type: "info"
          });
          return false;
        }

        return await rejectTx(payload)
          .then(value => {
            if (!value) { return false; }
            consoleOut('approveTx returned transaction:', value);
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
            console.error('mint tokens error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`
            });
            customLogger.logError('Multisig Reject transaction failed', { transcript: transactionLog });
            return false;
          });

      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Multisig Reject transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Multisig Approve transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Multisig Reject transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Multisig Reject transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Multisig Reject transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Multisig Reject transaction failed', { transcript: transactionLog });
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
              operationType: OperationType.RejectTransaction,
              finality: "confirmed",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: `Reject proposal: ${data.transaction.details.title}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `Successfully rejected proposal: ${data.transaction.details.title}`,
              extras: {
                multisigAuthority: data.transaction.multisig.toBase58(),
                transactionId: data.transaction.id
              }
            });
            resetTransactionStatus();
          } else { setIsBusy(false); }
        } else { 
          setIsBusy(false);
          onExecuteRejectTxCancelled();
        }
      } else { setIsBusy(false); }
    }

  }, [
    wallet,
    publicKey,
    connection,
    nativeBalance,
    multisigClient,
    selectedMultisig,
    transactionCancelled,
    transactionStatus.currentOperation,
    enqueueTransactionConfirmation,
    onExecuteRejectTxCancelled,
    resetTransactionStatus,
    setTransactionStatus,
    t,
  ]);

  const onExecuteFinishTxCancelled = useCallback(() => {
    openNotification({
      type: "info",
      duration: 5,
      description: t('notifications.tx-not-executed')
    });
    consoleOut('lastError:', lastErrorRef.current, 'blue');
    if (lastErrorRef.current && lastErrorRef.current.customError) {
      // Show the error reporting modal
      setTransactionStatus(lastErrorRef.current);
      showErrorReportingModal();
    } else {
      resetTransactionStatus();
    }
  },[
    showErrorReportingModal,
    resetTransactionStatus,
    setTransactionStatus,
    t,
  ]);

  const onExecuteFinishTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const finishTx = async (data: any) => {

      if (!data.transaction || !publicKey || !multisigClient) { return null; }

      let tx = await multisigClient.executeTransaction(publicKey, data.transaction.id);

      if (data.transaction.operation === OperationType.StreamCreate ||
          data.transaction.operation === OperationType.TreasuryStreamCreate ||
          data.transaction.operation === OperationType.StreamCreateWithTemplate
      ) {
        tx = await multisigClient.executeCreateMoneyStreamTransaction(publicKey, data.transaction.id);
      }

      return tx;
    };

    const createTx = async (): Promise<boolean> => {

      if (publicKey && data) {
        consoleOut("Start Multisig ExecuteTransaction Tx", '', 'blue');
        consoleOut('Wallet address:', publicKey.toBase58());

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        // Create a transaction
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
        const minRequired = 0.000005;
        consoleOut('nativeBalance:', nativeBalance, 'blue');
        consoleOut('Min required balance:', minRequired, 'blue');
        setMinRequiredBalance(minRequired);

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
              getTokenAmountAndSymbolByTokenAddress(
                minRequired, 
                NATIVE_SOL_MINT.toBase58()
              )
            })`
          });
          customLogger.logWarning('Finish Approoved transaction failed', { transcript: transactionLog });
          const notifContent = t('transactions.status.tx-start-failure', {
            accountBalance: getTokenAmountAndSymbolByTokenAddress(
              nativeBalance,
              NATIVE_SOL_MINT.toBase58()
            ),
            feeAmount: getTokenAmountAndSymbolByTokenAddress(
              minRequired,
              NATIVE_SOL_MINT.toBase58()
            )});
          openNotification({
            description: notifContent,
            type: "info"
          });

          const txStatus = {
            customError: notifContent,
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure
          } as TransactionStatusInfo;
          setTransactionStatus(txStatus);

          return false;
        }

        return await finishTx(data)
          .then(value => {
            if (!value) { return false; }
            consoleOut('multisig returned transaction:', value);
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
            console.error('create stream error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`
            });
            customLogger.logError('Finish Approoved transaction failed', { transcript: transactionLog });
            return false;
          });

      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Finish Approoved transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Finish Approoved transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Finish Approoved transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Finish Approoved transaction failed', { transcript: transactionLog });
          return false;
        });
    }

    const sendTx = async (): Promise<boolean> => {

      if (!wallet) {
        console.error('Cannot send transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot send transaction! Wallet not found!'
        });
        customLogger.logError('Finish Approoved transaction failed', { transcript: transactionLog });
        return false;
      }

      const result = await connection
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
        .catch((error: any) => {
          consoleOut('operation:', OperationType[data.transaction.operation], 'orange');
          const txStatus = {
            customError: undefined,
            lastOperation: TransactionStatus.SendTransaction,
            currentOperation: TransactionStatus.SendTransactionFailure
          } as TransactionStatusInfo;
          if (error.toString().indexOf('0x1794') !== -1) {
            const accountIndex = data.transaction.operation === OperationType.StreamClose
              ? 5
              : data.transaction.operation === OperationType.TreasuryStreamCreate ||
                data.transaction.operation === OperationType.StreamCreate ||
                data.transaction.operation === OperationType.StreamCreateWithTemplate
                ? 2
                : 3;
            consoleOut('accounts:', data.transaction.accounts.map((a: any) => a.pubkey.toBase58()), 'orange');
            const treasury = data.transaction.accounts[accountIndex]
              ? data.transaction.accounts[accountIndex].pubkey.toBase58()
              : '-';
            consoleOut(`Selected account for index [${accountIndex}]`, treasury, 'orange');
            txStatus.customError = {
              title: 'Insufficient balance',
              message: 'Your transaction failed to submit due to there not being enough SOL to cover the fees. Please fund the treasury with at least 0.00002 SOL and then retry this operation.\n\nTreasury ID: ',
              data: treasury
            };
          } else if (error.toString().indexOf('0x1797') !== -1) {
            const accountIndex =  data.transaction.operation === OperationType.StreamCreate ||
                                  data.transaction.operation === OperationType.TreasuryStreamCreate ||
                                  data.transaction.operation === OperationType.StreamCreateWithTemplate
              ? 2
              : data.transaction.operation === OperationType.TreasuryWithdraw
                ? 5
                : 3;
            consoleOut('accounts:', data.transaction.accounts.map((a: any) => a.pubkey.toBase58()), 'orange');
            const treasury = data.transaction.accounts[accountIndex]
              ? data.transaction.accounts[accountIndex].pubkey.toBase58()
              : '-';
            consoleOut(`Selected account for index [${accountIndex}]`, treasury, 'orange');
            txStatus.customError = {
              title: 'Insufficient balance',
              message: 'Your transaction failed to submit due to insufficient balance in the treasury. Please add funds to the treasury and then retry this operation.\n\nTreasury ID: ',
              data: treasury
            };
          } else if (error.toString().indexOf('0x1786') !== -1) {
            txStatus.customError = {
              message: 'Your transaction failed to submit due to Invalid Gateway Token. Please activate the Gateway Token and retry this operation.',
              data: undefined
            };
          } else if (error.toString().indexOf('0xbc4') !== -1) {
            txStatus.customError = {
              message: 'Your transaction failed to submit due to Account Not Initialized. Please initialize and fund the Token and LP Token Accounts of the Investor.\n',
              data: selectedMultisig?.authority.toBase58()
            }; 
          } else if (error.toString().indexOf('0x1') !== -1) {
            const accountIndex = data.transaction.operation === OperationType.TransferTokens || data.transaction.operation === OperationType.Transfer
              ? 0
              : 3;
            consoleOut('accounts:', data.transaction.accounts.map((a: any) => a.pubkey.toBase58()), 'orange');
            const asset = data.transaction.accounts[accountIndex] ? data.transaction.accounts[accountIndex].pubkey.toBase58() : '-';
            consoleOut(`Selected account for index [${accountIndex}]`, asset, 'orange');
            txStatus.customError = {
              title: 'Insufficient balance',
              // message: 'Your transaction failed to submit due to insufficient balance in the asset. Please add funds to the asset and then retry this operation.\n\nAsset ID: ',
              message: 'Your transaction failed to submit due to insufficient balance. Please add SOL to the safe and then retry this operation.\n\nSafe: ',
              data: selectedMultisig?.authority.toBase58()
            };
          }
          consoleOut('setLastError ->', txStatus, 'blue');
          lastErrorRef.current = txStatus;
          setLastError(txStatus);
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
            result: { error, encodedTx }
          });
          customLogger.logError('Finish Approoved transaction failed', { transcript: transactionLog });
          return false;
        });

      return result;
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
            consoleOut('Send Tx to confirmation queue:', signature, 'blue');
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.ExecuteTransaction,
              finality: "finalized",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: `Execute proposal: ${data.transaction.details.title}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `Successfully executed proposal: ${data.transaction.details.title}`,
              extras: {
                multisigAuthority: data.transaction.multisig.toBase58(),
                transactionId: data.transaction.id
              }
            });
            setIsBusy(false);
            resetTransactionStatus();
          } else {
            setTimeout(() => {
              onExecuteFinishTxCancelled();
            }, 30);
            setIsBusy(false);
          }
        } else { 
          setIsBusy(false);
          onExecuteFinishTxCancelled();
        }
      } else {
        onExecuteFinishTxCancelled();
        setIsBusy(false);
      }
    }

  }, [
    t,
    wallet, 
    publicKey, 
    nativeBalance, 
    connection, 
    multisigClient,
    selectedMultisig,
    transactionCancelled,
    transactionStatus.currentOperation,
    enqueueTransactionConfirmation, 
    onExecuteFinishTxCancelled,
    resetTransactionStatus,
    setTransactionStatus,
  ]);

  const onExecuteCancelTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    setTransactionCancelled(false);
    setIsBusy(true);
    resetTransactionStatus();

    const cancelTx = async (data: any) => {

      if (
        !publicKey || 
        !multisigClient ||
        !selectedMultisig || 
        selectedMultisig.id.toBase58() !== data.transaction.multisig.toBase58() || 
        data.transaction.proposer.toBase58() !== publicKey.toBase58() ||
        data.transaction.executedOn
      ) {
        return null;
      }


      const tx = await multisigClient.cancelTransaction(publicKey, data.transaction.id);

      return tx;
    };

    const createTx = async (): Promise<boolean> => {

      if (publicKey && data) {
        consoleOut("Start transaction for create stream", '', 'blue');
        consoleOut('Wallet address:', publicKey.toBase58());

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        // Create a transaction
        const payload = { transaction: data.transaction };  
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
        const minRequired = 0.000005;
        consoleOut('nativeBalance:', nativeBalance, 'blue');
        consoleOut('Min required balance:', minRequired, 'blue');
        setMinRequiredBalance(minRequired);

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
              getTokenAmountAndSymbolByTokenAddress(
                minRequired, 
                NATIVE_SOL_MINT.toBase58()
              )
            })`
          });
          customLogger.logWarning('Finish Cancel transaction failed', { transcript: transactionLog });
          return false;
        }

        return await cancelTx(payload)
          .then(value => {
            if (!value) { return false; }
            consoleOut('Returned transaction:', value);
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
            console.error('cancel tx error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`
            });
            customLogger.logError('Finish Cancel transaction failed', { transcript: transactionLog });
            return false;
          });

      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Finish Cancel transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Finish Cancel transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Finish Cancel transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Finish Cancel transaction failed', { transcript: transactionLog });
          return false;
        });
    }

    const sendTx = async (): Promise<boolean> => {

      if (!wallet) {
        console.error('Cannot send transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot send transaction! Wallet not found!'
        });
        customLogger.logError('Finish Cancel transaction failed', { transcript: transactionLog });
        return false;
      }

      const result = await connection
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
        .catch((error: any) => {
          console.error(error);
          const txStatus = {
            customError: undefined,
            lastOperation: TransactionStatus.SendTransaction,
            currentOperation: TransactionStatus.SendTransactionFailure
          } as TransactionStatusInfo;
          if (error.toString().indexOf('0x1794') !== -1) {
            const accountIndex = data.transaction.operation === OperationType.StreamClose ? 5 : 3;
            consoleOut('accounts:', data.transaction.accounts.map((a: any) => a.pubkey.toBase58()), 'orange');
            const treasury = data.transaction.accounts[accountIndex]
              ? data.transaction.accounts[accountIndex].pubkey.toBase58()
              : '-';
            consoleOut(`Selected account for index [${accountIndex}]`, treasury, 'orange');
            txStatus.customError = {
              message: 'Your transaction failed to submit due to there not being enough SOL to cover the fees. Please fund the treasury with at least 0.00002 SOL and then retry this operation.\n\nTreasury ID: ',
              data: treasury
            };
          }
          setTransactionStatus(txStatus);
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
            result: { error, encodedTx }
          });
          customLogger.logError('Finish Cancel transaction failed', { transcript: transactionLog });
          return false;
        });

      return result;
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
              operationType: OperationType.CancelTransaction,
              finality: "confirmed",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: `Cancel proposal: ${data.transaction.details.title}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `Successfully cancelled proposal: ${data.transaction.details.title}`,
              extras: {
                multisigAuthority: data.transaction.multisig.toBase58(),
                transactionId: data.transaction.id
              }
            });
            setIsBusy(false);
            resetTransactionStatus();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    wallet,
    publicKey,
    connection,
    nativeBalance,
    multisigClient,
    selectedMultisig,
    transactionCancelled,
    transactionStatus.currentOperation,
    enqueueTransactionConfirmation,
    resetTransactionStatus,
    setTransactionStatus,
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

  const refreshSelectedProposal = useCallback(() => {
    consoleOut('running refreshSelectedProposal...', '', 'brown');
    if (publicKey && multisigClient && selectedMultisigRef.current && selectedProposalRef.current) {
      consoleOut('fetching proposal details...', '', 'brown');
      consoleOut('selectedMultisigRef:', selectedMultisigRef.current.id.toBase58(), 'brown');
      consoleOut('selectedProposalRef:', selectedProposalRef.current.id.toBase58(), 'brown');
      setLoadingProposalDetails(true);
      multisigClient
        .getMultisigTransaction(selectedMultisigRef.current.id, selectedProposalRef.current.id, publicKey)
        .then((tx: any) => {
          consoleOut('proposal refreshed!', tx, 'brown');
          setSelectedProposal(tx);
        })
        .catch((err: any) => console.error(err))
        .finally(() => setLoadingProposalDetails(false));
    }
  }, [multisigClient, publicKey]);

  const recordTxConfirmation = useCallback((signature: string, operation: OperationType, success = true) => {
    let event: any;
    switch (operation) {
      case OperationType.CreateTransaction:
        event = success ? AppUsageEvent.CreateProposalCompleted : AppUsageEvent.CreateProposalFailed;
        segmentAnalytics.recordEvent(event, { signature: signature });
        break;
      case OperationType.ApproveTransaction:
        event = success ? AppUsageEvent.ApproveProposalCompleted : AppUsageEvent.ApproveProposalFailed;
        segmentAnalytics.recordEvent(event, { signature: signature });
        break;
      case OperationType.RejectTransaction:
        event = success ? AppUsageEvent.RejectProposalCompleted : AppUsageEvent.RejectProposalFailed;
        segmentAnalytics.recordEvent(event, { signature: signature });
        break;
      case OperationType.ExecuteTransaction:
        event = success ? AppUsageEvent.ExecuteProposalCompleted : AppUsageEvent.ExecuteProposalFailed;
        segmentAnalytics.recordEvent(event, { signature: signature });
        break;
      case OperationType.CancelTransaction:
        event = success ? AppUsageEvent.CancelProposalCompleted : AppUsageEvent.CancelProposalFailed;
        segmentAnalytics.recordEvent(event, { signature: signature });
        break;
      default:
        break;
    }
  }, []);

  // Setup event handler for Tx confirmed
  const onTxConfirmed = useCallback((item: TxConfirmationInfo) => {

    const path = window.location.pathname;
    if (!path.startsWith(MULTISIG_ROUTE_BASE_PATH)) {
      return;
    }

    console.log("onTxConfirmed event handled:", item);
    recordTxConfirmation(item.signature, item.operationType, true);

    switch (item.operationType) {
      case OperationType.CreateTransaction:
        reloadMultisigs();
        break;
      case OperationType.ApproveTransaction:
        setIsBusy(false);
        reloadSelectedProposal();
        break;
      case OperationType.RejectTransaction:
        setIsBusy(false);
        reloadMultisigs();
        reloadSelectedProposal();
        break;
      case OperationType.ExecuteTransaction:
        setIsBusy(false);
        reloadMultisigs();
        reloadSelectedProposal();
        break;
      case OperationType.CancelTransaction:
        goToProposals();
        break;  
      case OperationType.CreateMultisig:
        hardReloadMultisigs();
        break;  
      default:
        break;
    }

  }, [recordTxConfirmation]);

  // Setup event handler for Tx confirmation error
  const onTxTimedout = useCallback((item: TxConfirmationInfo) => {

    const reloadMultisigs = () => {
      const refreshCta = document.getElementById("multisig-refresh-cta");
      if (refreshCta) {
        refreshCta.click();
      }
    };

    consoleOut("onTxTimedout event executed:", item, 'crimson');
    reloadMultisigs();
    // If we have the item, record failure and remove it from the list
    if (item) {
      recordTxConfirmation(item.signature, item.operationType, false);
    }
  }, [
    recordTxConfirmation
  ]);

  const reloadMultisigs = () => {
    const refreshCta = document.getElementById("multisig-refresh-cta");
    if (refreshCta) {
      refreshCta.click();
    }
  };

  const hardReloadMultisigs = () => {
    const streamsRefreshCta = document.getElementById("multisig-hard-refresh-cta");
    if (streamsRefreshCta) {
      streamsRefreshCta.click();
    }
  };

  const reloadSelectedProposal = () => {
    const proposalRefreshCta = document.getElementById("refresh-selected-proposal-cta");
    if (proposalRefreshCta) {
      proposalRefreshCta.click();
    }
  };

  const goToProposals = () => {
    const backCta = document.querySelector("div.back-button") as HTMLElement;
    if (backCta) {
      backCta.click();
    }
  }

  const refreshSafeDetails = useCallback((reset = false) => {
    reloadMultisigs();
    if (isProposalDetails) {
      reloadSelectedProposal();
    }
  }, [isProposalDetails]);

  // SERUM ACCOUNTS
  useEffect(() => {

    if (!connection || !publicKey || !multisigSerumClient) { return; }

    const timeout = setTimeout(() => {
      multisigSerumClient
      .account
      .multisig
      .all()
      .then(accs => {
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

        setSerumAccounts(parsedSerumAccs);
      })
      .catch((err: any) => console.error(err));
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connection,
    multisigSerumClient, 
    publicKey
  ]);

  const getMultisigVaults = useCallback(async (
    connection: Connection,
    multisig: PublicKey

  ) => {

    const [multisigSigner] = await PublicKey.findProgramAddress(
      [multisig.toBuffer()],
      MEAN_MULTISIG
    );

    const accountInfos = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 32, bytes: multisigSigner.toBase58() } }, 
        { dataSize: ACCOUNT_LAYOUT.span }
      ],
    });

    if (!accountInfos || !accountInfos.length) { return []; }

    const results = accountInfos.map((t: any) => {
      const tokenAccount = ACCOUNT_LAYOUT.decode(t.account.data);
      tokenAccount.address = t.pubkey;
      return tokenAccount;
    });

    return results;

  },[]);

  const getPricePerToken = useCallback((token: UserTokenAccount): number => {
    if (!token || !coinPrices) { return 0; }

    return coinPrices && coinPrices[token.symbol]
      ? coinPrices[token.symbol]
      : 0;

  }, [coinPrices]);

  useEffect(() => {
    let optionInQuery: string | null = null;
    if (searchParams) {
      optionInQuery = searchParams.get('v');
    }
    setQueryParamV(optionInQuery);
  }, [searchParams]);

  // Calculates the USD value of the Multisig accounts assets
  useEffect(() => {

    if (!connection || !publicKey || !multisigAccounts.length) {
      return;
    }

    const timeout = setTimeout(() => {

      const allUsdValueMap = new Map();
  
      multisigAccounts.forEach(async(account) => {
        
        let usdValue = 0;
        const solPrice = getPricePerToken(NATIVE_SOL);
        const solBalance = account.balance / LAMPORTS_PER_SOL;
        const nativeSolUsdValue = solBalance * solPrice;  
        const assets = await getMultisigVaults(connection, account.id);

        assets.forEach(asset => {
          const token = getTokenByMintAddress(asset.mint.toBase58());
          
          if (token) {
            const tokenAddress = getTokenPriceByAddress(token.address);
            const tokenSymbol = getTokenPriceBySymbol(token.symbol);
            const tokenPrice = tokenAddress || tokenSymbol;
            const tokenBalance = asset.amount.toNumber() / 10 ** token.decimals;
            usdValue += (tokenBalance * tokenPrice);
          }
        });
        usdValue += nativeSolUsdValue;  
        allUsdValueMap.set(account.authority.toBase58(), usdValue);  
      });
      
      setMultisigUsdValues(allUsdValueMap);
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    publicKey,
    connection,
    multisigAccounts,
    getMultisigVaults, 
    getPricePerToken, 
    getTokenByMintAddress, 
    getTokenPriceByAddress, 
    getTokenPriceBySymbol
  ])

  const getMultisigList = useCallback((reset = false) => {

    if (!publicKey) {
      return;
    }

    refreshMultisigs(reset)
    .then(item => {
      if (item) {
        if (reset) {
          navigate(`${MULTISIG_ROUTE_BASE_PATH}/${item.authority.toBase58()}?v=proposals`);
        } else {
          proposalLoadStatusRegister.clear();
          setNeedRefreshTxs(true);
          setSelectedMultisig(item);
        }
      }
    })

  }, [navigate, publicKey, refreshMultisigs, setSelectedMultisig]);

  // Load/Unload multisig on wallet connect/disconnect
  useEffect(() => {
    if (previousWalletConnectState !== connected) {
      if (!previousWalletConnectState && connected && publicKey) {
        consoleOut('User is connecting...', publicKey.toBase58(), 'green');
        setNeedReloadMultisigAccounts(true);
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'green');
        setMultisigAccounts([]);
        setHighLightableMultisigId(undefined);
        sethHighlightedMultisigTx(undefined);
        setMultisigTransactionSummary(undefined);
        setSelectedMultisig(undefined);
        setNeedReloadMultisigAccounts(false);
        consoleOut('User is disconnecting...', '', 'green');
        setCanSubscribe(true);
      }
    }
  }, [
    connected,
    publicKey,
    previousWalletConnectState,
    setNeedReloadMultisigAccounts,
    setHighLightableMultisigId,
    setMultisigAccounts,
    setSelectedMultisig,
    setCanSubscribe,
    onTxConfirmed,
    onTxTimedout,
  ]);

  // Detect when entering small screen mode
  useEffect(() => {
    if (isSmallUpScreen && width < 576) {
      setIsSmallUpScreen(false);
    }
  }, [
    width,
    isSmallUpScreen,
  ]);

  // Handle what to do when pending Tx confirmation reaches finality or on error
  useEffect(() => {

    if (!publicKey || !multisigClient || !selectedMultisig || fetchTxInfoStatus === "fetching") { return; }

    if (lastSentTxOperationType) {
      if (fetchTxInfoStatus === "fetched") {
        if (lastSentTxOperationType === OperationType.CreateMultisig) {
          setSelectedMultisig(undefined);   // Deselects the current multisig if creating a new one
        }
        setNeedRefreshTxs(true);
        setNeedReloadPrograms(true);
        clearTxConfirmationContext();
        setNeedReloadMultisigAccounts(true);
        sethHighlightedMultisigTx(undefined);
        setMultisigTransactionSummary(undefined);
      } else if (fetchTxInfoStatus === "error") {
        clearTxConfirmationContext();
        openNotification({
          type: "info",
          duration: 5,
          description: (
            <>
              <span className="mr-1">
                {t('notifications.tx-not-confirmed')}
              </span>
              <div>
                <span className="mr-1">{t('notifications.check-transaction-in-explorer')}</span>
                <a className="secondary-link"
                    href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${lastSentTxSignature}${getSolanaExplorerClusterParam()}`}
                    target="_blank"
                    rel="noopener noreferrer">
                    {shortenAddress(lastSentTxSignature, 8)}
                </a>
              </div>
            </>
          )
        });
      }
    }
  }, [
    publicKey,
    multisigClient,
    selectedMultisig,
    fetchTxInfoStatus,
    lastSentTxSignature,
    lastSentTxOperationType,
    setNeedReloadMultisigAccounts,
    clearTxConfirmationContext,
    setSelectedMultisig,
    t,
  ]);

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

  const getProgramsByUpgradeAuthority = useCallback(async (): Promise<ProgramAccounts[]> => {

    if (!connection || !selectedMultisig || !selectedMultisig.authority) { return []; }

    const BPFLoaderUpgradeab1e = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
    const execDataAccountsFilter: MemcmpFilter = { 
      memcmp: { offset: 13, bytes: selectedMultisig.authority.toBase58() } 
    };

    const execDataAccounts = await connection.getProgramAccounts(
      BPFLoaderUpgradeab1e, {
        filters: [execDataAccountsFilter]
      }
    );

    if (execDataAccounts.length === 0) { return []; }

    const programs: ProgramAccounts[] = [];
    const group = (size: number, data: any) => {
      const result = [];
      for (let i = 0; i < data.length; i += size) {
        result.push(data.slice(i, i + size));
      }
      return result;
    };

    const sleep = (ms: number, log = true) => {
      if (log) { consoleOut("Sleeping for", ms / 1000, "seconds"); }
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    const getProgramAccountsPromise = async (execDataAccount: any) => {

      const execAccountsFilter: MemcmpFilter = { 
        memcmp: { offset: 4, bytes: execDataAccount.pubkey.toBase58() } 
      };

      const execAccounts = await connection.getProgramAccounts(
        BPFLoaderUpgradeab1e, {
          dataSlice: { offset: 0, length: 0 },
          filters: [execAccountsFilter]
        }
      );

      if (execAccounts.length === 0) { return; }

      if (execAccounts.length > 1) {
        throw new Error(`More than one program was found for program data account '${execDataAccount.pubkey.toBase58()}'`);
      }

      programs.push({
          pubkey: execAccounts[0].pubkey,
          owner: execAccounts[0].account.owner,
          executable: execDataAccount.pubkey,
          upgradeAuthority: selectedMultisig.authority,
          size: execDataAccount.account.data.byteLength
        } as ProgramAccounts
      );
    }

    const execDataAccountsGroups = group(8, execDataAccounts);

    for (const groupItem of execDataAccountsGroups) {
      const promises: Promise<any>[] = [];
      for (const dataAcc of groupItem) {
        promises.push(
          getProgramAccountsPromise(dataAcc)
        );
      }
      await Promise.all(promises);
      sleep(1_000, false);
    }

    return programs;

  },[
    connection, 
    selectedMultisig
  ]);

  const getActiveMultisigAuthorityByReference = useCallback(() => {
    if (!selectedMultisigRef || !selectedMultisigRef.current) { return ''; }
    return selectedMultisigRef.current.authority.toBase58();
  }, []);

  const getMultisigProposals = useCallback(async (multisig: MultisigInfo) => {

    if (
      !connection || 
      !publicKey || 
      !multisigClient || 
      !multisig
    ) { 
      return {
        multisigAuth: multisig.authority.toBase58(),
        transactions: []
      } as MultisigProposalsWithAuthority;
    }

    const txs = await multisigClient.getMultisigTransactions(
      multisig.id,
      publicKey
    );

    const response = {
      multisigAuth: multisig.authority.toBase58(),
      transactions: txs
    } as MultisigProposalsWithAuthority;

    return response;

  }, [
    connection, 
    multisigClient, 
    publicKey, 
  ]);

  // Get Programs
  useEffect(() => {
    if (!connection || !selectedMultisig || !needReloadPrograms) {
      return;
    }

    setTimeout(() => {
      setNeedReloadPrograms(false);
      setLoadingPrograms(true);
    },);

    setPrograms([]);
    getProgramsByUpgradeAuthority()
      .then(progs => {
        setPrograms(progs);
        consoleOut('programs:', progs);
      })
      .catch(error => console.error(error))
      .finally(() => setLoadingPrograms(false));
  }, [
    connection,
    needReloadPrograms,
    selectedMultisig,
    getProgramsByUpgradeAuthority,
    setPrograms
  ]);

  // Get MultisigTxs (proposals)
  useEffect(() => {

    if (
      !publicKey || 
      !multisigClient || 
      !needRefreshTxs ||
      !selectedMultisig
    ) { 
      return;
    }

    consoleOut('Triggered load proposals...', '', 'blue');

    setNeedRefreshTxs(false);
    setProposalsLoading(true);
    setMultisigTxs(undefined);

    getMultisigProposals(selectedMultisig)
      .then((response: MultisigProposalsWithAuthority) => {
        consoleOut('response:', response, 'orange');
        const currentlyActiveMultisig = getActiveMultisigAuthorityByReference();
        if (response.multisigAuth === currentlyActiveMultisig) {
          consoleOut('proposals assigned to:', currentlyActiveMultisig, 'green');
          setMultisigTxs(response.transactions);
          setLoadingProposals(false);
        } else {
          setMultisigTxs([]);
        }
      })
      .catch((err: any) => {
        setMultisigTxs([]);
        console.error("Error fetching all transactions", err);
      })
      .finally(() => setProposalsLoading(false));

  }, [
    publicKey,
    multisigClient,
    needRefreshTxs,
    selectedMultisig,
    getActiveMultisigAuthorityByReference,
    getMultisigProposals,
    setProposalsLoading,
    setMultisigTxs,
  ]);

  // Actually selects a multisig base on url
  useEffect(() => {

    if (multisigAccounts) {
      let item: MultisigInfo | undefined = undefined;

      if (address) {
        // Re-select the one active
        if (multisigAccounts && multisigAccounts.length > 0) {
          item = multisigAccounts.find(m => m.authority.toBase58() === address);
          if (item) {
            if (selectedMultisigRef.current && selectedMultisigRef.current.authority.equals(item.authority)) {
              consoleOut('Multisig is already selected!', 'skipping...', 'blue');
              return;
            }
            consoleOut('selected via address in route:', item, 'purple');
            consoleOut('Making multisig active:', item, 'blue');
            setSelectedMultisig(item);
            setNeedRefreshTxs(true);
            setNeedReloadPrograms(true);
          }
        }
      } else {
        if (multisigAccounts.length > 0) {
          consoleOut('No multisig to select!', '', 'red');
          item = multisigAccounts[0];
          const url = `${MULTISIG_ROUTE_BASE_PATH}/${item.authority.toBase58()}?v=proposals`;
          consoleOut('Redirecting to:', url, 'blue');
          navigate(url);
        }
      }

      if (address && location.pathname.indexOf('/proposals') !== -1 && location.pathname.indexOf('/programs') !== -1 && !id) {
        const isProposalsFork = queryParamV === "proposals" || queryParamV === "instruction" || queryParamV === "activity" ? true : false;
        const isProgramsFork = queryParamV === "programs" || queryParamV === "transactions" || queryParamV === "anchor-idl" ? true : false;
        const isValidParam = isProposalsFork || isProgramsFork ? true : false;
        if (!isValidParam) {
          const url = MULTISIG_ROUTE_BASE_PATH;
          navigate(url);
        }
      }
    }

  }, [address, id, location.pathname, multisigAccounts, navigate, queryParamV, setSelectedMultisig]);

  // Scroll to a given multisig is specified as highLightableMultisigId
  useEffect(() => {

    if (loadingMultisigAccounts || multisigAccounts.length === 0 || !highLightableMultisigId || !selectedMultisig) {
      return;
    }

    // consoleOut('Try to scroll multisig into view...', '', 'green');
    const timeout = setTimeout(() => {
      const highlightTarget = document.getElementById(selectedMultisig.authority.toBase58());
      if (highlightTarget) {
        highlightTarget.scrollIntoView({ behavior: 'smooth' });
      }
      setHighLightableMultisigId(undefined);
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    selectedMultisig,
    multisigAccounts,
    loadingMultisigAccounts,
    highLightableMultisigId,
    setHighLightableMultisigId,
  ]);

  // Process route params and set item (proposal) specified in the url by id
  useEffect(() => {

    if (!publicKey || !selectedMultisig || multisigTxs === undefined || !address || !id) {
      return;
    }

    const isProposalsFork = queryParamV === "proposals" || queryParamV === "instruction" || queryParamV === "activity" ? true : false;
    if (isProposalsFork) {
      consoleOut('id:', id, 'purple');
      consoleOut('queryParamV:', queryParamV, 'purple');
      consoleOut('selectedMultisig:', selectedMultisig.authority.toBase58(), 'purple');
      const filteredMultisigTx = multisigTxs.find(tx => tx.id.toBase58() === id);
      if (filteredMultisigTx) {
        setSelectedProposal(filteredMultisigTx);
        setIsProposalDetails(true);
        setIsProgramDetails(false);
        consoleOut('filteredMultisigTx:', filteredMultisigTx, 'orange');
      }
    }

  }, [address, id, selectedMultisig, publicKey, queryParamV, multisigTxs]);

  // Process route params and set item (program) specified in the url by id
  useEffect(() => {

    if (!publicKey || !selectedMultisig || programs === undefined || !address || !id) {
      return;
    }

    const isProgramsFork = queryParamV === "programs" || queryParamV === "transactions" || queryParamV === "anchor-idl" ? true : false;

    if (isProgramsFork) {
      consoleOut('id:', id, 'purple');
      consoleOut('queryParamV:', queryParamV, 'purple');
      consoleOut('selectedMultisig:', selectedMultisig.authority.toBase58(), 'purple');
      const filteredProgram = programs.filter(program => program.pubkey.toBase58() === id)[0];
      if (filteredProgram) {
        setProgramSelected(filteredProgram);
        setIsProposalDetails(false);
        setIsProgramDetails(true);
      }
    }

  }, [address, id, programs, publicKey, queryParamV, selectedMultisig]);

  // Load vesting contracs based on selected multisig
  useEffect(() => {

    if (!publicKey || !selectedMultisig || !msp || !address) { return; }

    if (selectedMultisig.authority.toBase58() === address) {
      consoleOut('Calling refreshTreasuries...', '', 'blue');
      refreshVestingContracts(address);
    }

  }, [address, msp, publicKey, refreshVestingContracts, selectedMultisig]);

  // Setup event listeners
  useEffect(() => {

    if (!canSubscribe) { return; }

    const timeout = setTimeout(() => {
      setCanSubscribe(false);
      confirmationEvents.on(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut('Subscribed to event txConfirmed with:', 'onTxConfirmed', 'blue');
      confirmationEvents.on(EventType.TxConfirmTimeout, onTxTimedout);
      consoleOut('Subscribed to event txTimedout with:', 'onTxTimedout', 'blue');
    });

    return () => {
      clearTimeout(timeout);
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
      proposalLoadStatusRegister.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onBackButtonClicked = () => {
    setDetailsPanelOpen(false);
    setAutoOpenDetailsPanel(false);
    // navigate(-1);
  }

  const onNavigateAway = () => {
    setDetailsPanelOpen(false);
    setAutoOpenDetailsPanel(false);
  }

  ///////////////
  // Rendering //
  ///////////////

  const renderMultisigList = useCallback(() => {
    return (
      <>
        {multisigAccounts.length > 0 ? (
          multisigAccounts.map((item, index) => {
            const onMultisigClick = (ev: any) => {
              consoleOut('=======================================', '', 'green');
              consoleOut('selected multisig:', item, 'blue');
              setDetailsPanelOpen(true);
              setIsProposalDetails(false);
              setIsProgramDetails(false);
              setMultisigSolBalance(undefined);
              setTotalSafeBalance(undefined);
  
              const url = `${MULTISIG_ROUTE_BASE_PATH}/${item.authority.toBase58()}?v=proposals`;
              navigate(url);
            };
  
            return (
              <div 
                key={`${index + 50}`}
                id={item.authority.toBase58()}
                onClick={onMultisigClick}
                className={
                  `transaction-list-row transparent-left-border simplelink ${
                    selectedMultisig && selectedMultisig.authority && selectedMultisig.authority.equals(item.authority)
                      ? 'selected selected-left-border'
                      : ''
                    }`
                  }>
  
                <div className="icon-cell pl-1">
                  {(item.version === 0) ? (
                    <Tooltip placement="rightTop" title="Serum Multisig">
                      <img src="https://assets.website-files.com/6163b94b432ce93a0408c6d2/61ff1e9b7e39c27603439ad2_serum%20NOF.png" alt="Serum" width={30} height={30} />
                    </Tooltip>
                  ) : (item.version === 2) ? (
                    <Tooltip placement="rightTop" title="Meanfi Multisig">
                      <img src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/MEANeD3XDdUmNMsRGjASkSWdC8prLYsoRJ61pPeHctD/logo.svg" alt="Meanfi Multisig" width={30} height={30} />
                    </Tooltip>
                  ) : (
                    <Identicon address={item.id} style={{ width: "30", height: "30", display: "inline-flex" }} />
                  )}
                  {item.pendingTxsAmount && item.pendingTxsAmount > 0 ? (
                    <span className="status warning bottom-right"></span>
                  ) : null}
                </div>
                <div className="description-cell">
                  <div>
                    {item.label ? (
                      <div className="title text-truncate">
                        <span>{item.label}</span>
                      </div>
                    ) : (
                      <div className="title text-truncate">{`${shortenAddress(item.id.toBase58(), 4)} ${item.version === 0 && "(Serum)"}`}</div>
                    )}
                    {
                      <div className="subtitle text-truncate">{shortenAddress(item.id.toBase58(), 8)}</div>
                    }
                  </div>
                </div>
                <div className="rate-cell">
                  {(multisigUsdValues && multisigUsdValues !== undefined) && (
                    multisigUsdValues.get(item.authority.toBase58()) === 0 ? (
                      <>
                        <div className="rate-amount">$0.00</div>
                        <div className="interval">safe balance</div>
                      </>
                    ) : (multisigUsdValues.get(item.authority.toBase58()) as number > 0) ? (
                      <>
                        <div className="rate-amount">
                          {toUsCurrency(multisigUsdValues.get(item.authority.toBase58()))}
                        </div>
                        <div className="interval">safe balance</div>
                      </>
                    ) : (
                      <>
                        <div className="rate-amount">
                          <IconLoading className="mean-svg-icons" style={{ height: "15px", lineHeight: "15px" }}/>
                        </div>
                        <div className="interval">safe balance</div>
                      </>
                    )
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <>
          {isCreatingMultisig() ? (
            <div className="h-100 flex-center">
              <Spin indicator={bigLoadingIcon} />
            </div>
          ) : (
            <div className="h-100 flex-center">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{connected
              ? t('multisig.multisig-accounts.no-accounts')
              : t('multisig.multisig-accounts.not-connected')}</p>} />
            </div>
          )}
          </>
        )}
      </>
    );
  }, [connected, isCreatingMultisig, multisigAccounts, multisigUsdValues, navigate, selectedMultisig, setMultisigSolBalance, setTotalSafeBalance, t]);

  const onRefresLevel1Tabs = () => {
    setNeedRefreshTxs(true);
    setNeedReloadPrograms(true);
  }

  const goToProposalDetailsHandler = (selectedProposal: any) => {
    const url = `${MULTISIG_ROUTE_BASE_PATH}/${address}/proposals/${selectedProposal.id.toBase58()}?v=instruction`;
    navigate(url);
  }

  // const goToAssetDetailsHandler = (selectedAsset: any) => {
  //   setAssetSelected(selectedAsset);
  // }

  const goToProgramDetailsHandler = (selectedProgram: any) => {
    const url = `${MULTISIG_ROUTE_BASE_PATH}/${address}/programs/${selectedProgram.pubkey.toBase58()}?v=transactions`;
    navigate(url);
  }

  const returnFromProposalDetailsHandler = () => {
    setIsProposalDetails(false);
    setNeedRefreshTxs(true);
    const url = `${MULTISIG_ROUTE_BASE_PATH}/${address}?v=proposals`;
    navigate(url);
  }

  const returnFromProgramDetailsHandler = () => {
    setIsProgramDetails(false);
    if (selectedMultisig) {
      setHighLightableMultisigId(selectedMultisig.authority.toBase58());
    }
    const url = `${MULTISIG_ROUTE_BASE_PATH}/${address}?v=programs`;
    navigate(url);
  }

  // Dropdown (three dots button)
  const menu = (
    <Menu>
      <Menu.Item key="0" onClick={onAcceptCreateSerumMultisig}>
        <span className="menu-item-text">Create Serum safe</span>
      </Menu.Item>
    </Menu>
  );

  return (
    <>
      {isUnderDevelopment() && (
        <div className="debug-bar">
          <span className="mr-1 align-middle">loadingProposals</span>
          <span className={`status position-relative align-middle ${loadingProposals ? 'error' : 'success'}`}></span>
          <span className="mx-1 align-middle">loadingPrograms</span>
          <span className={`status position-relative align-middle ${loadingPrograms ? 'error' : 'success'}`}></span>
          <span className="ml-1">proposals:</span><span className="ml-1 font-bold fg-dark-active">{multisigTxs ? multisigTxs.length : '-'}</span>
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

      <div className="container main-container">

        <div className="interaction-area">

          <div className={`meanfi-two-panel-layout ${detailsPanelOpen ? 'details-open' : ''}`}>

            <div className="meanfi-two-panel-left">

              <div className="meanfi-panel-heading">
                {isWhitelisted ? (
                  <IconUserGroup className="mean-svg-icons mr-1" />
                  ) : (
                  <IconUsers className="mean-svg-icons mr-1" />
                )}
                <span className="title">Multisig Safes</span>
                <div className="transaction-stats user-address">
                  <Spin size="small" />
                  {!loadingMultisigAccounts && (
                    <span className="incoming-transactions-amout">({formatThousands(multisigAccounts.length)})</span>
                  )}
                  <span className={`transaction-legend hidden-sm ${loadingMultisigAccounts ? 'click-disabled' : 'simplelink'}`}>
                    <Tooltip placement="bottom" title={t('multisig.refresh-tooltip')}>
                      <span className="icon-button-container">
                        <Button
                          id="multisig-refresh-cta"
                          type="default"
                          shape="circle"
                          size="small"
                          icon={<ReloadOutlined />}
                          onClick={() => getMultisigList(false)}
                        />
                      </span>
                    </Tooltip>
                    <span id="multisig-hard-refresh-cta" onClick={() => getMultisigList(true)}></span>
                  </span>
                </div>
              </div>

              <div className="inner-container">
                <div className="item-block vertical-scroll">
                  <Spin spinning={loadingMultisigAccounts}>
                    {renderMultisigList()}
                  </Spin>
                </div>

                {/* Bottom CTAs */}
                <div className="bottom-ctas">
                  <div className="primary-action create-safe">
                    <Button
                      block
                      type="primary"
                      shape="round"
                      disabled={!connected}
                      className="flex-center mr-1"
                      onClick={onCreateMultisigClick}>
                      {/* onClick={onOpenMultisigModalClick}> */}
                        <IconSafe className="mean-svg-icons" />
                        {connected
                          ? t('multisig.create-new-multisig-account-cta')
                          : t('transactions.validation.not-connected')
                        }
                    </Button>
                  </div>
                  {isUnderDevelopment() && (
                    <Dropdown className="options-dropdown"
                      overlay={menu}
                      placement="bottomRight"
                      trigger={["click"]}>
                      <span className="icon-button-container ml-1">
                        <Button
                          type="default"
                          shape="circle"
                          size="middle"
                          icon={<IconEllipsisVertical className="mean-svg-icons"/>}
                          onClick={(e) => e.preventDefault()}
                        />
                      </span>
                    </Dropdown>
                  )}
                </div>
              </div>
            </div>

            <div className="meanfi-two-panel-right">
              <div className="meanfi-panel-heading">
                <span className="title">
                  {t('multisig.multisig-detail-heading')}
                </span>
              </div>

              <div className="inner-container">
                <span id="refresh-selected-proposal-cta" onClick={() => refreshSelectedProposal()}></span>
                <div className="float-top-right mr-1 mt-1">
                  <span className="icon-button-container secondary-button">
                    <Tooltip placement="bottom" title="Refresh safes">
                      <Button
                        type="default"
                        shape="circle"
                        size="middle"
                        icon={<ReloadOutlined className="mean-svg-icons" />}
                        onClick={() => refreshSafeDetails(true)}
                      />
                    </Tooltip>
                  </span>
                </div>

                <div className="scroll-wrapper vertical-scroll">
                  {connected && multisigClient && selectedMultisig ? (
                    <>
                      <Spin spinning={loadingMultisigAccounts}>
                        {(!isProposalDetails && !isProgramDetails) ? (
                          selectedMultisig.version === 0 ? (
                            <SafeSerumInfoView
                              connection={connection}
                              isAssetDetails={isAssetDetails}
                              isProgramDetails={isProgramDetails}
                              isProposalDetails={isProposalDetails}
                              multisigClient={multisigSerumClient}
                              multisigTxs={serumMultisigTxs}
                              onDataToProgramView={goToProgramDetailsHandler}
                              onDataToSafeView={goToProposalDetailsHandler}
                              onEditMultisigClick={onEditMultisigClick}
                              onNavigateAway={onNavigateAway}
                              onNewProposalMultisigClick={onNewProposalMultisigClick}
                              selectedMultisig={selectedMultisig}
                              vestingAccountsCount={treasuryList ? treasuryList.length : 0}
                            />
                          ) : (
                            <SafeMeanInfo
                              assetSelected={assetSelected}
                              connection={connection}
                              isAssetDetails={isAssetDetails}
                              isProgramDetails={isProgramDetails}
                              isProposalDetails={isProposalDetails}
                              loadingPrograms={loadingPrograms}
                              loadingProposals={loadingProposals}
                              multisigClient={multisigClient}
                              onDataToProgramView={goToProgramDetailsHandler}
                              onDataToSafeView={goToProposalDetailsHandler}
                              onEditMultisigClick={onEditMultisigClick}
                              onNavigateAway={onNavigateAway}
                              onNewProposalMultisigClick={onNewProposalMultisigClick}
                              onRefreshRequested={onRefresLevel1Tabs}
                              proposalSelected={selectedProposal}
                              publicKey={publicKey}
                              selectedMultisig={selectedMultisig}
                              selectedTab={selectedTab}
                              vestingAccountsCount={treasuryList ? treasuryList.length : 0}
                            />
                          )
                        ) : isProposalDetails ? (
                          <ProposalDetailsView
                            onDataToSafeView={returnFromProposalDetailsHandler}
                            proposalSelected={selectedProposal}
                            selectedMultisig={selectedMultisig}
                            onProposalApprove={onExecuteApproveTx}
                            onProposalReject={onExecuteRejectTx}
                            onProposalExecute={onExecuteFinishTx}
                            onProposalCancel={onExecuteCancelTx}
                            onOperationStarted={saveOperationPayloadOnStart}
                            connection={connection}
                            solanaApps={solanaApps}
                            appsProvider={appsProvider}
                            multisigClient={multisigClient}
                            hasMultisigPendingProposal={hasMultisigPendingProposal()}
                            isBusy={isBusy}
                            loadingData={loadingMultisigAccounts || loadingProposals || loadingProposalDetails}
                          />
                        ) : isProgramDetails ? (
                          <ProgramDetailsView
                            isProgramDetails={isProgramDetails}
                            onDataToProgramView={returnFromProgramDetailsHandler}
                            programSelected={programSelected}
                            selectedMultisig={selectedMultisig}
                          />
                        ) : null}
                      </Spin>
                    </>
                  ) : (
                    <div className="h-100 flex-center">
                      <Spin spinning={loadingMultisigAccounts}>
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>
                          {!connected
                            ? t('multisig.multisig-accounts.not-connected')
                            : loadingMultisigAccounts
                              ? t('multisig.multisig-accounts.loading-multisig-accounts')
                              : t('multisig.multisig-account-detail.no-multisig-loaded')
                          }
                          </p>}
                        />
                      </Spin>
                    </div>
                  )}
                </div>
              </div>

            </div>

          </div>

        </div>

      </div>

      {isCreateMultisigModalVisible && (
        <MultisigCreateModal
          isVisible={isCreateMultisigModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          multisigAccounts={multisigAccounts}
          // handleOk={onAcceptCreateMultisig}
          handleOk={(params: CreateNewSafeParams) => onAcceptCreateMultisig(params)}
          handleClose={() => setIsCreateMultisigModalVisible(false)}
          isBusy={isBusy}
        />

        // <MultisigCreateSafeModal
        //   isVisible={isMultisigCreateSafeModalVisible}
        //   nativeBalance={nativeBalance}
        //   transactionFees={transactionFees}
        //   multisigAccounts={multisigAccounts}
        //   handleOk={(params: CreateNewSafeParams) => onAcceptCreateMultisig(params)}
        //   handleClose={() => setIsMultisigCreateSafeModalVisible(false)}
        //   isBusy={isBusy}
        // />
      )}

      {(isEditMultisigModalVisible && selectedMultisig) && (
        <MultisigEditModal
          isVisible={isEditMultisigModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          handleOk={onAcceptEditMultisig}
          multisigName={selectedMultisig.label}
          multisigThreshold={selectedMultisig.threshold}
          multisigParticipants={selectedMultisig.owners}
          multisigAccounts={multisigAccounts}
          multisigPendingTxsAmount={selectedMultisig.pendingTxsAmount}
          handleClose={() => setIsEditMultisigModalVisible(false)}
          isBusy={isBusy}
        />
      )}

      {isErrorReportingModalVisible && (
        <ErrorReportModal
          handleClose={closeErrorReportingModal}
          isVisible={isErrorReportingModalVisible}
          title={transactionStatus.customError.title || 'Error submitting transaction'}
        />
      )}

      {isMultisigProposalModalVisible && (
        <MultisigProposalModal
          isVisible={isMultisigProposalModalVisible}
          handleClose={() => setMultisigProposalModalVisible(false)}
          isBusy={isBusy}
          proposer={publicKey ? publicKey.toBase58() : ""}
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
