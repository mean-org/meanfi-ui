import { useCallback, useContext, useMemo, useRef } from 'react';
import {
  LoadingOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  Account,
  ConfirmOptions,
  Connection,
  // Keypair,
  LAMPORTS_PER_SOL,
  MemcmpFilter,
  PublicKey,
  SystemProgram,
  // Signer,
  // SystemProgram,
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
  // tabNameFormat
} from '../../utils/utils';

import { Button, Dropdown, Empty, Menu, Spin, Tooltip } from 'antd';
import {
  consoleOut,
  getTransactionStatusForLogs,
  isLocal,
  isDev,
  toUsCurrency
} from '../../utils/ui';

import { SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from '../../constants';
import { isDesktop } from "react-device-detect";
import useWindowSize from '../../hooks/useWindowResize';
import { EventType, OperationType, TransactionStatus } from '../../models/enums';
import { IconEllipsisVertical, IconLoading, IconSafe, IconUserGroup, IconUsers } from '../../Icons';
import { useNativeAccount } from '../../contexts/accounts';
import { MEAN_MULTISIG, NATIVE_SOL_MINT } from '../../utils/ids';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { MultisigCreateModal } from '../../components/MultisigCreateModal';
import './style.scss';

// MULTISIG
import { AnchorProvider, BN, Idl, Program } from "@project-serum/anchor";
import { MultisigEditModal } from '../../components/MultisigEditModal';
// import { TransactionFees } from '@mean-dao/msp';
import { customLogger } from '../..';
import { openNotification } from '../../components/Notifications';
import { ProposalSummaryModal } from '../../components/ProposalSummaryModal';
import { SafeMeanInfo } from './components/SafeMeanInfo';
import { ProposalDetailsView } from './components/ProposalDetails';
import { MultisigProposalModal } from '../../components/MultisigProposalModal';
import { ProgramDetailsView } from './components/ProgramDetails';
import SerumIDL from '../../models/serum-multisig-idl';
import { AppsProvider, NETWORK, App, UiInstruction, AppConfig, UiElement, Arg } from '@mean-dao/mean-multisig-apps';
import { SafeSerumInfoView } from './components/SafeSerumInfo';
import { DEFAULT_EXPIRATION_TIME_SECONDS, getFees, MeanMultisig, MEAN_MULTISIG_PROGRAM, MultisigInfo, MultisigParticipant, MultisigTransaction, MultisigTransactionFees, MultisigTransactionStatus, MultisigTransactionSummary, MULTISIG_ACTIONS } from '@mean-dao/mean-multisig-sdk/';
// import { MultisigCreateAssetModal } from '../../components/MultisigCreateAssetModal';
import { createProgram, getDepositIx, getWithdrawIx, getGatewayToken } from '@mean-dao/mean-multisig-apps/lib/apps/credix/func';
import { NATIVE_SOL } from '../../utils/tokens';
import { UserTokenAccount } from '../../models/transactions';
import { ACCOUNT_LAYOUT } from '../../utils/layouts';
import { MultisigTxResultModal } from '../../components/MultisigTxResultModal';
import { confirmationEvents, TxConfirmationContext, TxConfirmationInfo } from "../../contexts/transaction-status";
import { AppUsageEvent } from '../../utils/segment-service';
import { segmentAnalytics } from "../../App";
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ProgramAccounts } from '../../utils/accounts';
import { MultisigTransactionWithId, NATIVE_LOADER, parseSerializedTx, ZERO_FEES } from '../../models/multisig';

const MEAN_MULTISIG_ACCOUNT_LAMPORTS = 1_000_000;
const CREDIX_PROGRAM = new PublicKey("CRDx2YkdtYtGZXGHZ59wNv1EwKHQndnRc1gT4p8i2vPX");
const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;
const proposalLoadStatusRegister = new Map<string, boolean>();

export const SafeView = () => {
  const connectionConfig = useConnectionConfig();
  const { publicKey, connected, wallet } = useWallet();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [searchParams, setSearchParams] = useSearchParams();
  const { address, id } = useParams();
  const {
    programs,
    coinPrices,
    multisigTxs,
    isWhitelisted,
    detailsPanelOpen,
    transactionStatus,
    highLightableMultisigId,
    previousWalletConnectState,
    setHighLightableMultisigId,
    getTokenPriceByAddress,
    getTokenByMintAddress,
    setMultisigSolBalance,
    getTokenPriceBySymbol,
    setTransactionStatus,
    setTotalSafeBalance,
    refreshTokenBalance,
    setDtailsPanelOpen,
    setMultisigTxs,
    setPrograms,
  } = useContext(AppStateContext);
  const {
    fetchTxInfoStatus,
    confirmationHistory,
    lastSentTxSignature,
    lastSentTxOperationType,
    startFetchTxSignatureInfo,
    clearTxConfirmationContext,
    enqueueTransactionConfirmation
  } = useContext(TxConfirmationContext);

  const { t } = useTranslation('common');
  const { account } = useNativeAccount();
  const navigate = useNavigate();
  // Misc hooks
  const { width } = useWindowSize();
  const [isSmallUpScreen, setIsSmallUpScreen] = useState(isDesktop);
  // Balance and fees
  const [nativeBalance, setNativeBalance] = useState(0);
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [transactionFees, setTransactionFees] = useState<MultisigTransactionFees>(ZERO_FEES);
  // const [transactionAssetFees, setTransactionAssetFees] = useState<TransactionFees>(NO_FEES);
  // Multisig accounts
  const [loadingMultisigAccounts, setLoadingMultisigAccounts] = useState(true);
  const [multisigAccounts, setMultisigAccounts] = useState<MultisigInfo[]>([]);
  const [selectedMultisig, setSelectedMultisig] = useState<MultisigInfo | undefined>(undefined);
  // Active Txs
  const [needRefreshTxs, setNeedRefreshTxs] = useState(false);
  const [highlightedMultisigTx, sethHighlightedMultisigTx] = useState<MultisigTransaction | undefined>();
  const [multisigTransactionSummary, setMultisigTransactionSummary] = useState<MultisigTransactionSummary | undefined>(undefined);
  // Vaults
  // const [multisigVaults, setMultisigVaults] = useState<MultisigVault[]>([]);
  // Tx control
  const [isBusy, setIsBusy] = useState(false);
  const [transactionCancelled, setTransactionCancelled] = useState(false);

  // Modal visibility flags
  const [isCreateMultisigModalVisible, setIsCreateMultisigModalVisible] = useState(false);
  const [isEditMultisigModalVisible, setIsEditMultisigModalVisible] = useState(false);

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
  const [isProposalDetails, setIsProposalDetails] = useState(false);
  const [proposalSelected, setProposalSelected] = useState<MultisigTransaction | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isAssetDetails, setIsAssetDetails] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [assetSelected, setAssetSelected] = useState<any>();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [selectedTab, setSelectedTab] = useState<number>();
  const [multisigUsdValues, setMultisigUsdValues] = useState<Map<string, number> | undefined>();
  const [canSubscribe, setCanSubscribe] = useState(true);
  
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

  // Live reference to the selected multisig
  const selectedMultisigRef = useRef(selectedMultisig);
  useEffect(() => {
    selectedMultisigRef.current = selectedMultisig;
  }, [selectedMultisig]);

  const resetTransactionStatus = useCallback(() => {

    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });

  }, [
    setTransactionStatus
  ]);

  const setProposalsLoading = useCallback((loading: boolean) => {
    const multisigId = selectedMultisigRef && selectedMultisigRef.current ? selectedMultisigRef.current.id.toBase58() : '';
    if (multisigId) {
      if (loading) {
        proposalLoadStatusRegister.set(multisigId, loading);
      } else {
        if (proposalLoadStatusRegister.has(multisigId)) {
          proposalLoadStatusRegister.delete(multisigId);
        }
      }
    }
  }, []);

  const getProposalsLoadingStatus = useCallback(() => {
    const multisigId = selectedMultisigRef && selectedMultisigRef.current ? selectedMultisigRef.current.id.toBase58() : '';
    if (multisigId && proposalLoadStatusRegister.has(multisigId)) {
      return proposalLoadStatusRegister.get(multisigId) || true;
    }
    return false;
  }, []);

  // Search for pending proposal in confirmation history
  const hasMultisigPendingProposal = useCallback(() => {
    if (!selectedMultisigRef || !selectedMultisigRef.current) { return false; }

    if (confirmationHistory && confirmationHistory.length > 0) {

      const item = confirmationHistory.find(h => h.extras && h.extras.multisigId && h.extras.multisigId.toBase58() === selectedMultisigRef.current?.id.toBase58() && h.txInfoFetchStatus === "fetching");

      if (item) {
        return true;
      }
    }

    return false;
  }, [confirmationHistory]);

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

  const onAcceptCreateMultisig = (data: any) => {
    consoleOut('multisig:', data, 'blue');
    onExecuteCreateMultisigTx(data);
  };

  const onAcceptCreateSerumMultisig = (data: any) => {
    consoleOut('serum multisig:', data, 'blue');
    onExecuteCreateSerumMultisigTx(data);
  };

  const onMultisigCreated = useCallback(() => {

    setIsCreateMultisigModalVisible(false);
    resetTransactionStatus();
    openNotification({
      description: t('multisig.create-multisig.success-message'),
      type: "success"
    });
    setTransactionFees(ZERO_FEES);

  },[
    t,
    resetTransactionStatus
  ])

  const onMultisigModified = useCallback(() => {

    setIsEditMultisigModalVisible(false);
    resetTransactionStatus();
    openNotification({
      description: t('multisig.update-multisig.success-message'),
      type: "success"
    });

  },[
    t,
    resetTransactionStatus
  ])

  const onTxExecuted = useCallback(() => {
    
  },[]);

  const onExecuteCreateMultisigTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTxConfirmationContext();
    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createMultisig = async (data: any) => {

      if (!multisigClient || !publicKey) { return; }

      const owners = data.owners.map((p: MultisigParticipant) => {
        return {
          address: new PublicKey(p.address),
          name: p.name
        }
      });

      const tx = await multisigClient.createFundedMultisig(
        publicKey,
        MEAN_MULTISIG_ACCOUNT_LAMPORTS,
        data.label, 
        data.threshold, 
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
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.CreateMultisig);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            onMultisigCreated();
            setIsCreateMultisigModalVisible(false);
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
    multisigClient,
    transactionStatus.currentOperation,
    clearTxConfirmationContext,
    startFetchTxSignatureInfo,
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

    clearTxConfirmationContext();
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
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.CreateMultisig);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            onMultisigCreated();
            setIsCreateMultisigModalVisible(false);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    clearTxConfirmationContext, 
    connection, 
    multisigSerumClient.account.multisig, 
    multisigSerumClient.programId, 
    multisigSerumClient.transaction, 
    nativeBalance, 
    onMultisigCreated, 
    publicKey, 
    resetTransactionStatus, 
    setTransactionStatus, 
    startFetchTxSignatureInfo, 
    transactionCancelled, 
    transactionFees.multisigFee, 
    transactionFees.networkFee, 
    transactionFees.rentExempt, 
    transactionStatus.currentOperation, 
    wallet
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

  // New Proposal
  const onNewProposalMultisigClick = useCallback(() => {
    resetTransactionStatus();
    setMultisigProposalModalVisible(true);
  }, [resetTransactionStatus]);

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

    clearTxConfirmationContext();
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
        label: data.label as any
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
        "Edit safe",
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
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.EditMultisig);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            onMultisigModified();
            setIsEditMultisigModalVisible(false);
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
    selectedMultisig,
    transactionCancelled,
    multisigClient,
    transactionStatus.currentOperation,
    clearTxConfirmationContext,
    startFetchTxSignatureInfo,
    resetTransactionStatus,
    setTransactionStatus,
    onMultisigModified
  ]);

  const onAcceptEditMultisig = (data: any) => {
    consoleOut('multisig:', data, 'blue');
    onExecuteEditMultisigTx(data);
  };

  const onAcceptCreateProposalModal = (data: any) => {
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

  const onExecuteCreateTransactionProposal = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTxConfirmationContext();
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
        proposalIx = tx?.instructions[0];
      } else if (data.appId === CREDIX_PROGRAM.toBase58()) { //
        if (data.instruction.name === "depositFunds") {
          operation = 110;
          proposalIx = await createCredixDepositIx(
            new PublicKey(data.instruction.uiElements[0].value),
            parseFloat(data.instruction.uiElements[1].value)
          );
        } else if (data.instruction.name === "withdrawFunds") {
          operation = 111;
          console.log('WITHDRAW');
          proposalIx = await createCredixWithdrawIx(
            new PublicKey(data.instruction.uiElements[0].value),
            parseFloat(data.instruction.uiElements[1].value)
          );
        }
      } else {
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

      if (publicKey && data) {
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

        return await createTransactionProposal(data)
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

      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('createTransactionProposal failed', { transcript: transactionLog });
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
            // startFetchTxSignatureInfo(signature, "confirmed", OperationType.CreateTransaction);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            // onTxProposalCreated();
            setMultisigProposalModalVisible(false);
            resetTransactionStatus();
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.CreateTransaction,
              finality: "confirmed",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: `Create proposal: ${data.title}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `Successfully created proposal: ${data.title}`,
              extras: data.multisigId
            });
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  }, [
    clearTxConfirmationContext, 
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
    // startFetchTxSignatureInfo, 
    enqueueTransactionConfirmation
  ]);

  const [isMultisigTxResultModalVisible, setIsMultisigTxResultModalVisible] = useState(false);
  const showMultisigTxResultModal = useCallback(() => setIsMultisigTxResultModalVisible(true), []);
  const closeMultisigTxResultModal = useCallback(() => {
    setIsMultisigTxResultModalVisible(false);
    resetTransactionStatus();
  }, [resetTransactionStatus]);

  const [isMultisigProposalModalVisible, setMultisigProposalModalVisible] = useState(false);

  // Transaction confirm and execution modal launched from each Tx row
  const [isMultisigActionTransactionModalVisible, setMultisigActionTransactionModalVisible] = useState(false);
  // const showMultisigActionTransactionModal = useCallback((tx: MultisigTransaction) => {
  //   resetTransactionStatus();
  //   sethHighlightedMultisigTx(tx);
  //   setMultisigTransactionSummary(
  //     getMultisigTransactionSummary(tx)
  //   );
  //   setMultisigActionTransactionModalVisible(true);
  // }, [resetTransactionStatus]);


  const saveOperationPayloadOnStart = (payload: any) => {
    setOperationPayload(payload);
  };

  const onAcceptMultisigActionModal = (item: MultisigTransaction) => {
    consoleOut('onAcceptMultisigActionModal:', item, 'blue');
    if (item.status === MultisigTransactionStatus.Active) {
      onExecuteApproveTx({ transaction: item });
    } else if (item.status === MultisigTransactionStatus.Passed) {
      onExecuteFinishTx({ transaction: item })
    } else if (item.status === MultisigTransactionStatus.Voided) {
      onExecuteCancelTx({ transaction: item })
    }
    setMultisigActionTransactionModalVisible(false);
  };

  const onCloseMultisigActionModal = () => {
    setMultisigActionTransactionModalVisible(false);
    resetTransactionStatus();
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

    clearTxConfirmationContext();
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
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.ApproveTransaction,
              finality: "confirmed",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: `Approve proposal: ${data.transaction.details.title}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `Successfully approved proposal: ${data.transaction.details.title}`,
              extras: {
                multisigId: data.transaction.multisig,
                transactionId: data.transaction.id
              }
            });
          } else { setIsBusy(false); }
        } else { 
          setIsBusy(false);
          onExecuteApproveTxCancelled();
        }
      } else { setIsBusy(false); }
    }

  }, [
    clearTxConfirmationContext, 
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

    clearTxConfirmationContext();
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
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
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
                multisigId: data.transaction.multisig,
                transactionId: data.transaction.id
              }
            });
          } else { setIsBusy(false); }
        } else { 
          setIsBusy(false);
          onExecuteRejectTxCancelled();
        }
      } else { setIsBusy(false); }
    }

  }, [
    clearTxConfirmationContext, 
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
    onExecuteRejectTxCancelled
  ]);

  const onExecuteFinishTxCancelled = useCallback(() => {
    resetTransactionStatus();
    openNotification({
      type: "info",
      duration: 5,
      description: t('notifications.tx-not-executed')
    });
  },[
    t,
    resetTransactionStatus
  ]);

  const onExecuteFinishTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTxConfirmationContext();
    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const finishTx = async (data: any) => {

      if (!data.transaction || !publicKey || !multisigClient) { return null; }

      let tx = await multisigClient.executeTransaction(publicKey, data.transaction.id);

      if (data.transaction.operation === OperationType.StreamCreate || 
        data.transaction.operation === OperationType.TreasuryStreamCreate
      ) {
        tx = await multisigClient.executeCreateMoneyStreamTransaction(publicKey, data.transaction.id);  
      }
  
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
          const txStatus = {
            customError: undefined,
            lastOperation: TransactionStatus.SendTransaction,
            currentOperation: TransactionStatus.SendTransactionFailure
          } as TransactionStatusInfo;
          if (error.toString().indexOf('0x1794') !== -1) {
            const treasury = data.transaction.operation === OperationType.StreamClose
              ? data.transaction.accounts[5].pubkey.toBase58()
              : data.transaction.accounts[3].pubkey.toBase58();
            txStatus.customError = {
              message: 'Your transaction failed to submit due to there not being enough SOL to cover the fees. Please fund the treasury with at least 0.00002 SOL and then retry this operation.\n\nTreasury ID: ',
              data: treasury
            };
          } else if (error.toString().indexOf('0x1797') !== -1) {
            const treasury = data.transaction.operation === OperationType.TreasuryStreamCreate
              ? data.transaction.accounts[2].pubkey.toBase58()
              : data.transaction.operation === OperationType.TreasuryWithdraw
              ? data.transaction.accounts[5].pubkey.toBase58()
              : data.transaction.accounts[3].pubkey.toBase58();
            txStatus.customError = {
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
            const asset = data.transaction.operation === OperationType.TransferTokens
              ? data.transaction.accounts[0].pubkey.toBase58()
              : data.transaction.accounts[3].pubkey.toBase58();
            txStatus.customError = {
              message: 'Your transaction failed to submit due to insufficient balance in the asset. Please add funds to the asset and then retry this operation.\n\nAsset ID: ',
              data: asset
            };
          }
          //TODO: Yamel (AUI HAY QUE LEVANTAR EL MODAL)
          setTransactionStatus(txStatus);
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
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.ExecuteTransaction,
              finality: "confirmed",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: `Execute proposal: ${data.transaction.details.title}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `Successfully executed proposal: ${data.transaction.details.title}`,
              extras: {
                multisigId: data.transaction.multisig,
                transactionId: data.transaction.id
              }
            });
          } else {
            showMultisigTxResultModal();
            setIsBusy(false);
          }
        } else { 
          setIsBusy(false);
          onExecuteFinishTxCancelled();
        }
      } else {
        showMultisigTxResultModal();
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
    enqueueTransactionConfirmation, 
    transactionStatus.currentOperation,
    clearTxConfirmationContext,
    onExecuteFinishTxCancelled,
    showMultisigTxResultModal,
    resetTransactionStatus,
    setTransactionStatus,
  ]);

  const onExecuteCancelTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

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
            const treasury = data.transaction.operation === OperationType.StreamClose
              ? data.transaction.accounts[5].pubkey.toBase58()
              : data.transaction.accounts[3].pubkey.toBase58();
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
                multisigId: data.transaction.multisig,
                transactionId: data.transaction.id
              }
            });
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

  // // confirmationHistory
  // const hasStreamPendingTx = useCallback(() => {

  //   if (!proposalSelected) { return false; }

  //   if (confirmationHistory && confirmationHistory.length > 0) {
  //     return confirmationHistory.some(h => h.extras === proposalSelected.id.toBase58() && h.txInfoFetchStatus === "fetching");
  //   }

  //   return false;

  // }, [confirmationHistory, proposalSelected]);

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

    const reloadMultisigs = () => {
      const refreshCta = document.getElementById("multisig-refresh-cta");
      if (refreshCta) {
        refreshCta.click();
      }
    };
    
    const refreshSelectedProposal = (extras: any) => {
      if (multisigClient && publicKey && extras && extras.multisigId && extras.transactionId) {
        multisigClient
          .getMultisigTransaction(extras.multisigId, extras.transactionId, publicKey)
          .then((tx: any) => setProposalSelected(tx))
          .catch((err: any) => console.error(err));
      }
    };

    const goToProposals = () => {
      const backCta = document.querySelector("div.back-button") as HTMLElement;
      if (backCta) {
        backCta.click();
      }
    }

    consoleOut("onTxConfirmed event handled:", item, 'crimson');
    recordTxConfirmation(item.signature, item.operationType, true);

    switch (item.operationType) {
      case OperationType.CreateTransaction:
        reloadMultisigs();
        break;
      case OperationType.ApproveTransaction:
        refreshSelectedProposal(item.extras as any);
        break;
      case OperationType.RejectTransaction:
        refreshSelectedProposal(item.extras as any);
        break;
      case OperationType.ExecuteTransaction:
        reloadMultisigs();
        break;
      case OperationType.CancelTransaction:
        goToProposals();
        break;  
      default:
        break;
    }

  }, [
    multisigClient, 
    publicKey, 
    recordTxConfirmation
  ]);

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

  // useEffect(() => {

  //   if (
  //     !connection || 
  //     !publicKey || 
  //     !multisigClient || 
  //     !selectedMultisig || 
  //     !proposalSelected ||
  //     !loadingMultisigAccounts
  //   ) {
  //     return;
  //   }

  //   const timeout = setTimeout(() => {
  //     multisigClient.getMultisigTransaction(
  //       selectedMultisig.id,
  //       proposalSelected.id,
  //       publicKey
  //     )
  //     .then((tx: any) => setProposalSelected(tx))
  //     .catch((err: any) => console.error(err));
  //   });

  //   return () => {
  //     clearTimeout(timeout);
  //   }

  // }, [
  //   connection, 
  //   multisigClient, 
  //   proposalSelected, 
  //   publicKey, 
  //   selectedMultisig,
  //   loadingMultisigAccounts
  // ]);

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

  const getQueryParamV = useCallback(() => {
    let optionInQuery: string | null = null;
    // Get the option if passed-in
    if (searchParams) {
      optionInQuery = searchParams.get('v');
    }

    return optionInQuery;
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
  
  useEffect(() => {
  
    if (!connection || !publicKey || !multisigClient || !loadingMultisigAccounts) {
      return;
    }
  
    const timeout = setTimeout(() => {
  
      consoleOut('=======================================', '', 'green');
      multisigClient
        .getMultisigs(publicKey)
        .then((allInfo: MultisigInfo[]) => {

          allInfo.sort((a: any, b: any) => b.createdOnUtc.getTime() - a.createdOnUtc.getTime());
          const allAccounts = [...allInfo, ...serumAccounts];   
          setMultisigAccounts(allAccounts);
          consoleOut('tralla:', allAccounts, 'blue');
          let item: any = {};
  
          if (allInfo.length > 0) {
  
            if (highLightableMultisigId) {
              // Select a multisig that was instructed to highlight when entering this feature
              item = allInfo.find(m => m.id.toBase58() === highLightableMultisigId);
            } else if (selectedMultisig) {
              // Or re-select the one active
              item = selectedMultisig.id ? allInfo.find(m => m.id.equals(selectedMultisig.id)) : undefined;
            } else {
              item = allInfo[0];
            }
            // Now make item active
            setSelectedMultisig(item);
            setNeedRefreshTxs(true);
            setNeedReloadPrograms(true);
          } else {
            setSelectedMultisig(undefined);
          }    
        })
        .catch((err: any) => {
          console.error(err);
          consoleOut('multisigPendingTxs:', [], 'blue');
        })
        .finally(() => setLoadingMultisigAccounts(false));
    });
  
    return () => {
      clearTimeout(timeout);
    }
  
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    publicKey,
    connection,
    multisigClient,
    selectedMultisig,
    highLightableMultisigId,
    loadingMultisigAccounts,
    // serumAccounts
  ]);

  // Load/Unload multisig on wallet connect/disconnect
  useEffect(() => {
    if (previousWalletConnectState !== connected) {
      if (!previousWalletConnectState && connected && publicKey) {
        consoleOut('User is connecting...', publicKey.toBase58(), 'green');
        setLoadingMultisigAccounts(true);
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'green');
        setMultisigAccounts([]);
        setHighLightableMultisigId(undefined);
        sethHighlightedMultisigTx(undefined);
        setMultisigTransactionSummary(undefined);
        setSelectedMultisig(undefined);
        setLoadingMultisigAccounts(false);
        consoleOut('User is disconnecting...', '', 'green');
        setCanSubscribe(true);
      }
    }
  }, [
    connected, 
    publicKey, 
    previousWalletConnectState, 
    setHighLightableMultisigId, 
    setCanSubscribe, 
    onTxConfirmed, 
    onTxTimedout
  ]);

  // Detect when entering small screen mode
  useEffect(() => {
    if (isSmallUpScreen && width < 576) {
      setIsSmallUpScreen(false);
    }
  }, [
    width,
    isSmallUpScreen,
    detailsPanelOpen,
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
        setLoadingMultisigAccounts(true);
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
    t,
    publicKey, 
    fetchTxInfoStatus, 
    lastSentTxSignature, 
    lastSentTxOperationType, 
    multisigClient, 
    selectedMultisig,
    clearTxConfirmationContext
  ]);

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

  const getActiveMultisigIdByReference = useCallback(() => {
    if (!selectedMultisigRef || !selectedMultisigRef.current) { return ''; }
    return selectedMultisigRef.current.id.toBase58();
  }, []);

  const getMultisigProposals = useCallback(async (msigId: PublicKey) => {

    if (
      !connection || 
      !publicKey || 
      !multisigClient || 
      !msigId
    ) { 
      return {
        multisigId: msigId.toBase58(),
        transactions: []
      } as MultisigTransactionWithId;
    }

    const txs = await multisigClient.getMultisigTransactions(
      msigId,
      publicKey
    );

    const response = {
      multisigId: msigId.toBase58(),
      transactions: txs
    } as MultisigTransactionWithId;

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
      !connection || 
      !publicKey || 
      !multisigClient || 
      !selectedMultisig ||
      !needRefreshTxs
    ) { 
      return;
    }

    setNeedRefreshTxs(false);
    setProposalsLoading(true);
    setMultisigTxs([]);

    consoleOut('Triggering loadMultisigPendingTxs ...', '', 'blue');
    const msigId = selectedMultisig.id;
    getMultisigProposals(msigId)
      .then((response: MultisigTransactionWithId) => {
        consoleOut('response:', response, 'orange');
        const currentlyActiveMultisigId = getActiveMultisigIdByReference();
        consoleOut('currentlyActiveMultisigId:', currentlyActiveMultisigId, 'orange');
        if (response.multisigId === currentlyActiveMultisigId) {
          consoleOut('setMultisigTxs value assigned!:', '', 'green');
          setMultisigTxs(response.transactions);
        }
      })
      .catch((err: any) => console.error("Error fetching all transactions", err))
      .finally(() => setProposalsLoading(false));

  }, [
    publicKey,
    connection,
    multisigClient,
    needRefreshTxs,
    selectedMultisig,
    getActiveMultisigIdByReference,
    getMultisigProposals,
    setProposalsLoading,
    setMultisigTxs,
  ]);

  /////////////////
  //   Getters   //
  /////////////////

  // Scroll to a given multisig is specified as highLightableMultisigId
  useEffect(() => {

    if (loadingMultisigAccounts || multisigAccounts.length === 0 || !highLightableMultisigId || !selectedMultisig) {
      return;
    }

    // consoleOut('Try to scroll multisig into view...', '', 'green');
    const timeout = setTimeout(() => {
      const highlightTarget = document.getElementById(highLightableMultisigId);
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

  // Redirect to first selected multisig if none provided
  useEffect(() => {
    if (!publicKey) { return; }

    if (!address && multisigAccounts && multisigAccounts.length > 0) {
      const firstMultisig = multisigAccounts[0].authority.toBase58();
      const url = `/multisig/${firstMultisig}?v=proposals`;
      navigate(url);
    } else if (address && multisigAccounts && multisigAccounts.length > 0 && id) {
      const param = getQueryParamV();
      const isProposalsFork = param === "proposals" || param === "instruction" || param === "activity" ? true : false;
      const isProgramsFork = param === "programs" || param === "transactions" || param === "anchor-idl" ? true : false;
      const isValidParam = isProposalsFork || isProgramsFork ? true : false;
      if (!isValidParam) {
        const url = `/multisig`;
        navigate(url, { replace: true });
      }
    }
  }, [id, address, multisigAccounts, navigate, publicKey, getQueryParamV]);

  // Actually selects a multisig base on url
  useEffect(() => {
    if (address && multisigAccounts) {
      setSelectedMultisig(multisigAccounts.find((multisig) => multisig.authority.toBase58() === address));
      setHighLightableMultisigId(address);
      setNeedRefreshTxs(true);
      setNeedReloadPrograms(true);
    } 
  }, [address, multisigAccounts, setHighLightableMultisigId]);

  // Process route params and select values in consequence
  useEffect(() => {

    if (!publicKey || !multisigClient || !selectedMultisig || multisigTxs === undefined || programs === undefined) {
      return;
    }

    const getProposal = async (proposal: any) => {

      if (!publicKey || !multisigClient || !selectedMultisig) {
        return null;
      }

      try {
        consoleOut('getProposal -> Starting...');
        return await multisigClient.getMultisigTransaction(
          selectedMultisig.id,
          proposal.id,
          publicKey
        );
      } catch (error) {
        console.error(error);
        return null;
      }
    }

    if (address && id) {
      const param = getQueryParamV();
      const isProposalsFork = param === "proposals" || param === "instruction" || param === "activity" ? true : false;
      const isProgramsFork = param === "programs" || param === "transactions" || param === "anchor-idl" ? true : false;
      const isValidParam = isProposalsFork || isProgramsFork ? true : false;

      if (isValidParam) {
        if (isProposalsFork) {
          const filteredMultisigTx = multisigTxs.filter(tx => tx.id.toBase58() === id)[0];
          if (filteredMultisigTx) {
            consoleOut('filteredMultisigTx:', filteredMultisigTx, 'orange');
            getProposal(filteredMultisigTx)
              .then(tx => {
                consoleOut('getProposal -> finished...');
                consoleOut('getProposal -> tx:', tx, 'orange');
                setProposalSelected(tx);
                setIsProposalDetails(true);
                setIsProgramDetails(false);
              })
              .catch((err: any) => console.error(err));
          }
        } else {
          const filteredProgram = programs.filter(program => program.pubkey.toBase58() === id)[0];
          setProgramSelected(filteredProgram);
          setIsProposalDetails(false);
          setIsProgramDetails(true);
        }
      }
    }

    // return () => {
    //   proposalLoadStatusRegister.clear();
    // }

  }, [id, address, multisigTxs, programs, getQueryParamV, selectedMultisig, publicKey, multisigClient]);

  ///////////////
  // Rendering //
  ///////////////

  const renderMultisigList = (
    <>
      {multisigAccounts.length > 0 ? (
        multisigAccounts.map((item, index) => {
          const onMultisigClick = (ev: any) => {
            consoleOut('=======================================', '', 'green');
            consoleOut('selected multisig:', item, 'blue');
            setDtailsPanelOpen(true);
            setIsProposalDetails(false);
            setIsProgramDetails(false);
            setMultisigSolBalance(undefined);
            setTotalSafeBalance(undefined);

            // Need refresh Txs happens inmediately after selecting a multisig
            const url = `/multisig/${item.authority.toBase58()}?v=proposals`;
            navigate(url);
          };

          return (
            <div 
              key={`${index + 50}`}
              id={item.id.toBase58()}
              onClick={onMultisigClick}
              className={
                `transaction-list-row transparent-left-border simplelink ${
                  selectedMultisig && selectedMultisig.id && selectedMultisig.id.equals(item.id)
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

  const onRefresLevel1Tabs = () => {
    setNeedRefreshTxs(true);
    setNeedReloadPrograms(true);
  }

  const goToProposalDetailsHandler = (selectedProposal: any) => {
    const url = `/multisig/${address}/proposals/${selectedProposal.id.toBase58()}?v=instruction`;
    navigate(url);
  }

  // const goToAssetDetailsHandler = (selectedAsset: any) => {
  //   setAssetSelected(selectedAsset);
  // }

  const goToProgramDetailsHandler = (selectedProgram: any) => {
    const url = `/multisig/${address}/programs/${selectedProgram.pubkey.toBase58()}?v=transactions`;
    navigate(url);
  }

  const returnFromProposalDetailsHandler = () => {
    setIsProposalDetails(false);
    if (selectedMultisig) {
      setHighLightableMultisigId(selectedMultisig.id.toBase58());
    }
    setNeedRefreshTxs(true);
    const url = `/multisig/${address}?v=proposals`;
    navigate(url);
  }

  const returnFromProgramDetailsHandler = () => {
    setIsProgramDetails(false);
    if (selectedMultisig) {
      setHighLightableMultisigId(selectedMultisig.id.toBase58());
    }
    const url = `/multisig/${address}?v=programs`;
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
      {/* {isLocal() && (
        <div className="debug-bar">
          <span className="ml-1">multisigTxs:</span><span className="ml-1 font-bold fg-dark-active">{multisigTxs ? multisigTxs.length : '-'}</span>
          <span className="ml-1">proposalLoadStatusRegister:</span><span className="ml-1 font-bold fg-dark-active">{proposalLoadStatusRegister.size}</span>
        </div>
      )} */}

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
                <Tooltip placement="bottom" title={t('multisig.refresh-tooltip')}>
                  <div className={`transaction-stats user-address ${loadingMultisigAccounts ? 'click-disabled' : 'simplelink'}`}>
                    <Spin size="small" />
                    {!loadingMultisigAccounts && (
                      <span className="incoming-transactions-amout">({formatThousands(multisigAccounts.length)})</span>
                    )}
                    <span className="transaction-legend">
                      <span className="icon-button-container">
                        <Button
                          id="multisig-refresh-cta"
                          type="default"
                          shape="circle"
                          size="small"
                          icon={<ReloadOutlined />}
                          onClick={() => {
                            setLoadingMultisigAccounts(true);
                          }}
                        />
                      </span>
                    </span>
                  </div>
                </Tooltip>
              </div>

              <div className="inner-container">
                <div className="item-block vertical-scroll">
                  <Spin spinning={loadingMultisigAccounts}>
                    {renderMultisigList}
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
                <div className="scroll-wrapper vertical-scroll">
                  {connected && multisigClient && selectedMultisig ? (
                    <>
                      <Spin spinning={loadingMultisigAccounts}>
                        {(!isProposalDetails && !isProgramDetails) ? (
                          selectedMultisig.version === 0 ? (
                            <SafeSerumInfoView
                              connection={connection}
                              isProposalDetails={isProposalDetails}
                              isProgramDetails={isProgramDetails}
                              isAssetDetails={isAssetDetails}
                              onDataToSafeView={goToProposalDetailsHandler}
                              onDataToProgramView={goToProgramDetailsHandler}
                              selectedMultisig={selectedMultisig}
                              onEditMultisigClick={onEditMultisigClick}
                              onNewProposalMultisigClick={onNewProposalMultisigClick}
                              multisigClient={multisigSerumClient}
                              multisigTxs={serumMultisigTxs}
                            />
                          ) : (
                            <SafeMeanInfo
                              connection={connection}
                              publicKey={publicKey}
                              isProposalDetails={isProposalDetails}
                              isProgramDetails={isProgramDetails}
                              isAssetDetails={isAssetDetails}
                              loadingProposals={getProposalsLoadingStatus()}
                              loadingPrograms={loadingPrograms}
                              onDataToSafeView={goToProposalDetailsHandler}
                              onDataToProgramView={goToProgramDetailsHandler}
                              selectedMultisig={selectedMultisig}
                              onEditMultisigClick={onEditMultisigClick}
                              onNewProposalMultisigClick={onNewProposalMultisigClick}
                              onRefreshRequested={onRefresLevel1Tabs}
                              multisigClient={multisigClient}
                              selectedTab={selectedTab}
                              proposalSelected={proposalSelected}
                              assetSelected={assetSelected}
                            />
                          )
                        ) : isProposalDetails ? (
                          <ProposalDetailsView
                            onDataToSafeView={returnFromProposalDetailsHandler}
                            proposalSelected={proposalSelected}
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
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{connected
                        ? t('multisig.multisig-account-detail.no-multisig-loaded')
                        : t('multisig.multisig-accounts.not-connected')}</p>} />
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
          handleOk={onAcceptCreateMultisig}
          handleClose={() => setIsCreateMultisigModalVisible(false)}
          isBusy={isBusy}
        />
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

      {/* Transaction confirm and execution modal launched from each Tx row */}
      {(isMultisigActionTransactionModalVisible && highlightedMultisigTx && selectedMultisig) && (
        <ProposalSummaryModal
          isVisible={isMultisigActionTransactionModalVisible}
          handleOk={onAcceptMultisigActionModal}
          handleClose={onCloseMultisigActionModal}
          isBusy={isBusy}
          nativeBalance={nativeBalance}
          highlightedMultisigTx={highlightedMultisigTx}
          multisigTransactionSummary={multisigTransactionSummary}
          selectedMultisig={selectedMultisig}
          minRequiredBalance={minRequiredBalance}
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
          handleOk={onAcceptCreateProposalModal}
          selectedMultisig={selectedMultisig}
        />
      )}

      {isMultisigTxResultModalVisible && (
        <MultisigTxResultModal
          handleOk={() => {
            resetTransactionStatus();
            closeMultisigTxResultModal();
            if (operationPayload) {
              if (operationPayload.operation === OperationType.ExecuteTransaction) {
                onExecuteFinishTx(operationPayload);
              } else if (operationPayload.operation === OperationType.ApproveTransaction) {
                onExecuteApproveTx(operationPayload);
              } else if (operationPayload.operation === OperationType.RejectTransaction) {
                onExecuteRejectTx(operationPayload);
              }
            }
          }}
          handleClose={closeMultisigTxResultModal}
          isBusy={isBusy}
          highlightedMultisigTx={highlightedMultisigTx}
          isVisible={isMultisigTxResultModalVisible}
        />
      )}

      <PreFooter />
    </>
  );

};
