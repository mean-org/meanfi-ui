import { useCallback, useContext, useMemo } from 'react';
import {
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
  shortenAddress
} from '../../utils/utils';

import { Button, Dropdown, Empty, Menu, Spin, Tooltip } from 'antd';
import {
  consoleOut,
  getTransactionStatusForLogs,
  isLocal,
  isDev,
  getShortDate,
  isProd
} from '../../utils/ui';

import { SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from '../../constants';

import { isDesktop } from "react-device-detect";
import useWindowSize from '../../hooks/useWindowResize';
import { OperationType, TransactionStatus } from '../../models/enums';
import { TxConfirmationContext } from '../../contexts/transaction-status';
import { IconEllipsisVertical, IconSafe, IconUserGroup, IconUsers } from '../../Icons';
import { useNativeAccount } from '../../contexts/accounts';
import { MEAN_MULTISIG, NATIVE_SOL_MINT } from '../../utils/ids';
import { AccountLayout, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { useNavigate } from 'react-router-dom';
import {
  MultisigParticipant,
  MultisigTransaction,
  MultisigTransactionSummary,
  MultisigTransactionStatus,
  MultisigTransactionFees,
  ZERO_FEES,
  MULTISIG_ACTIONS,
  getMultisigTransactionSummary,
  getFees,
  DEFAULT_EXPIRATION_TIME_SECONDS
} from '../../models/multisig';
import { MultisigCreateModal } from '../../components/MultisigCreateModal';
import './style.scss';

// MULTISIG
import { AnchorProvider, BN, Program } from "@project-serum/anchor";
import { MultisigEditModal } from '../../components/MultisigEditModal';
import { MSP, Treasury } from '@mean-dao/msp';
import { customLogger } from '../..';
import { ProgramAccounts } from '../../utils/accounts';
import { getOperationName } from '../../utils/multisig-helpers';
import { openNotification } from '../../components/Notifications';
import { ProposalSummaryModal } from '../../components/ProposalSummaryModal';
import { SafeMeanInfo } from './components/SafeMeanInfo';
import { SafeDetailsView } from './components/SafeDetails';
import { MultisigProposalModal } from '../../components/MultisigProposalModal';
import { ProgramDetailsView } from './components/ProgramDetails';
import SerumIDL from '../../models/serum-multisig-idl';
import { AppsProvider, NETWORK, App } from '@mean-dao/mean-multisig-apps';
import { SafeSerumInfoView } from './components/SafeSerumInfo';
import { MeanMultisig, MEAN_MULTISIG_PROGRAM, MultisigInfo } from '@mean-dao/mean-multisig-sdk';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const SafeView = () => {
  const navigate = useNavigate();
  const connectionConfig = useConnectionConfig();
  const { publicKey, connected, wallet } = useWallet();
  const {
    theme,
    isWhitelisted,
    detailsPanelOpen,
    transactionStatus,
    streamV2ProgramAddress,
    highLightableMultisigId,
    previousWalletConnectState,
    setHighLightableMultisigId,
    setTransactionStatus,
    refreshTokenBalance,
    setDtailsPanelOpen,
  } = useContext(AppStateContext);
  const {
    fetchTxInfoStatus,
    lastSentTxSignature,
    lastSentTxOperationType,
    startFetchTxSignatureInfo,
    clearTxConfirmationContext
  } = useContext(TxConfirmationContext);

  const { t } = useTranslation('common');
  const { account } = useNativeAccount();
  // Misc hooks
  const { width } = useWindowSize();
  const [isSmallUpScreen, setIsSmallUpScreen] = useState(isDesktop);
  // Balance and fees
  const [nativeBalance, setNativeBalance] = useState(0);
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [transactionFees, setTransactionFees] = useState<MultisigTransactionFees>(ZERO_FEES);
  // Multisig accounts
  const [loadingMultisigAccounts, setLoadingMultisigAccounts] = useState(true);
  const [multisigAccounts, setMultisigAccounts] = useState<MultisigInfo[]>([]);
  const [selectedMultisig, setSelectedMultisig] = useState<MultisigInfo | undefined>(undefined);
  // Pending Txs
  const [needRefreshTxs, setNeedRefreshTxs] = useState(true);
  const [loadingMultisigTxs, setLoadingMultisigTxs] = useState(false);
  const [multisigTxs, setMultisigTxs] = useState<MultisigTransaction[]>([]);
  const [highlightedMultisigTx, sethHighlightedMultisigTx] = useState<MultisigTransaction | undefined>();
  const [multisigTransactionSummary, setMultisigTransactionSummary] = useState<MultisigTransactionSummary | undefined>(undefined);
  // Vaults
  const [multisigVaults, setMultisigVaults] = useState<any[]>([]);
  // Programs
  const [loadingPrograms, setLoadingPrograms] = useState(true);
  const [programs, setPrograms] = useState<ProgramAccounts[] | undefined>(undefined);
  // Treasuries
  const [multisigTreasuries, setMultisigTreasuries] = useState<Treasury[]>([]);
  // Mints
  // const [loadingMints, setLoadingMints] = useState(true);
  // const [multisigMints, setMultisigMints] = useState<MultisigMint[]>([]);
  // const [selectedMint, setSelectedMint] = useState<MultisigMint | undefined>(undefined);
  // Tx control
  const [isBusy, setIsBusy] = useState(false);
  const [transactionCancelled, setTransactionCancelled] = useState(false);

  // Modal visibility flags
  const [isCreateMultisigModalVisible, setIsCreateMultisigModalVisible] = useState(false);
  const [isEditMultisigModalVisible, setIsEditMultisigModalVisible] = useState(false);

  // Other
  const [switchValue, setSwitchValue] = useState(true);
  const [multisigTxsToHide, setMultisigTxsToHide] = useState<string>("");
  const [filteredMultisigTxs, setFilteredMultisigTxs] = useState<MultisigTransaction[]>([]);
  const [minRequiredBalance, setMinRequiredBalance] = useState(0);

  const [appsProvider, setAppsProvider] = useState<AppsProvider>();
  const [solanaApps, setSolanaApps] = useState<App[]>([]);
  const [serumAccounts, setSerumAccounts] = useState<MultisigInfo[]>();
  // const [isCreateMeanMultisig, setIsCreateMeanMultisig] = useState<boolean>();
  // const [isCreateSerumMultisig, setIsCreateSerumMultisig] = useState<boolean>();

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
  }, [
    connectionConfig.endpoint,
    publicKey,
    streamV2ProgramAddress
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
        { dataSize: AccountLayout.span }
      ],
    });

    if (!accountInfos || !accountInfos.length) { return []; }

    const results = accountInfos.map((t: any) => {
      const tokenAccount = AccountLayout.decode(t.account.data);
      tokenAccount.address = t.pubkey;
      return tokenAccount;
    });

    consoleOut('multisig assets:', results, 'blue');
    return results;

  },[]);

  const refreshPage = useCallback(() => {
    window.location.reload();
  },[]);

  const resetTransactionStatus = useCallback(() => {

    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });

  }, [
    setTransactionStatus
  ]);

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

      const tx = await multisigClient.createMultisig(
        publicKey, 
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
      if (wallet) {
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
              result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
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
            result: {signer: wallet.publicKey.toBase58()}
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
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logError('Create multisig transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Create multisig transaction failed', { transcript: transactionLog });
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
      const { blockhash } = await connection.getRecentBlockhash(connection.commitment);
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
      if (wallet) {
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
              result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
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
            result: {signer: wallet.publicKey.toBase58()}
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
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logError('Create multisig transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Create multisig transaction failed', { transcript: transactionLog });
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

  // const isApprovingMultisigTx = useCallback((): boolean => {

  //   return (
  //     fetchTxInfoStatus === "fetching" && 
  //     lastSentTxOperationType === OperationType.ApproveTransaction
  //   );

  // }, [
  //   fetchTxInfoStatus,
  //   lastSentTxOperationType,
  // ]);

  // const isExecutingMultisigTx = useCallback((): boolean => {

  //   return (
  //     fetchTxInfoStatus === "fetching" && 
  //     lastSentTxOperationType === OperationType.ExecuteTransaction
  //   );

  // }, [
  //   fetchTxInfoStatus,
  //   lastSentTxOperationType,
  // ]);

  const isCreatingMultisig = useCallback((): boolean => {

    return (
      fetchTxInfoStatus === "fetching" && 
      lastSentTxOperationType === OperationType.CreateMultisig
    );

  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  // const isUnderDevelopment = () => {
  //   return isLocal() || (isDev() && isWhitelisted) ? true : false;
  // }

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
        "Edit Safe",
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
      if (wallet) {
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
              result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
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
            result: {signer: wallet.publicKey.toBase58()}
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
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logError('Edit multisig transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Create multisig transaction failed', { transcript: transactionLog });
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

      // Proposal (TODO: Can use anchor by creating the program instance based on the IDL)
      const createProposalIx = new TransactionInstruction({
        programId: new PublicKey(data.appId),
        keys: [], // TODO: Get accounts from config
        data: Buffer.from("") // ToDO: Get data from config
      });
      
      const tx = await multisigClient.createTransaction(
        publicKey,
        data.title,
        data.description,
        new Date(data.expires),
        OperationType.EditMultisig,
        selectedMultisig.id,
        createProposalIx.programId,
        createProposalIx.keys,
        createProposalIx.data
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
      if (wallet) {
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
              result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
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
            result: {signer: wallet.publicKey.toBase58()}
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
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logError('Edit multisig transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Create multisig transaction failed', { transcript: transactionLog });
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
    multisigClient,
    nativeBalance, 
    selectedMultisig, 
    transactionCancelled, 
    transactionFees.multisigFee, 
    transactionFees.networkFee, 
    transactionFees.rentExempt, 
    transactionStatus.currentOperation, 
    onMultisigModified,
    setTransactionStatus,
    resetTransactionStatus,
    startFetchTxSignatureInfo,
    clearTxConfirmationContext,
  ]);

  const [isMultisigProposalModalVisible, setMultisigProposalModalVisible] = useState(false);

  // Transaction confirm and execution modal launched from each Tx row
  const [isMultisigActionTransactionModalVisible, setMultisigActionTransactionModalVisible] = useState(false);
  const showMultisigActionTransactionModal = useCallback((tx: MultisigTransaction) => {
    resetTransactionStatus();
    sethHighlightedMultisigTx(tx);
    setMultisigTransactionSummary(
      getMultisigTransactionSummary(tx)
    );
    setMultisigActionTransactionModalVisible(true);
  }, [resetTransactionStatus]);

  const onAcceptMultisigActionModal = (item: MultisigTransaction) => {
    consoleOut('onAcceptMultisigActionModal:', item, 'blue');
    if (item.status === MultisigTransactionStatus.Pending) {
      onExecuteApproveTx({ transaction: item });
    } else if (item.status === MultisigTransactionStatus.Approved) {
      onExecuteFinishTx({ transaction: item })
    } else if (item.status === MultisigTransactionStatus.Voided) {
      onExecuteCancelTx({ transaction: item })
    }
  };

  const onCloseMultisigActionModal = () => {
    setMultisigActionTransactionModalVisible(false);
    resetTransactionStatus();
  };

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
      if (wallet) {
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
              result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
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
            result: {signer: wallet.publicKey.toBase58()}
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
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logError('Multisig Approve transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Multisig Approve transaction failed', { transcript: transactionLog });
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
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.ApproveTransaction);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            openNotification({
              description: 'Your signature for the Multisig transaction was successfully recorded.',
              type: "success"
            });
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    clearTxConfirmationContext, 
    connection, 
    multisigClient, 
    nativeBalance, 
    publicKey, 
    resetTransactionStatus, 
    selectedMultisig, 
    setTransactionStatus, 
    startFetchTxSignatureInfo, 
    transactionCancelled, 
    transactionStatus.currentOperation, 
    wallet
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
          customLogger.logWarning('Finish Approoved transaction failed', { transcript: transactionLog });
          return false;
        }

        return await finishTx(payload)
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
      if (wallet) {
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
              result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
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
            result: {signer: wallet.publicKey.toBase58()}
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
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logError('Finish Approoved transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Finish Approoved transaction failed', { transcript: transactionLog });
        return false;
      }
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
          }
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
            consoleOut('Send Tx to confirmation queue:', signature);
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.ExecuteTransaction);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            onTxExecuted();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    wallet,
    publicKey,
    connection,
    nativeBalance,
    transactionCancelled,
    multisigClient,
    transactionStatus.currentOperation,
    clearTxConfirmationContext,
    startFetchTxSignatureInfo,
    resetTransactionStatus,
    setTransactionStatus,
    onTxExecuted
  ]);

  const onExecuteCancelTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTxConfirmationContext();
    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const cancelTx = async (data: any) => {

      if (
        !publicKey || 
        !multisigClient ||
        !selectedMultisig || 
        !selectedMultisig.id || 
        selectedMultisig.id.toBase58() !== data.transaction.multisig.toBase58() || 
        data.transaction.proposer.toBase58() !== publicKey.toBase58() ||
        data.transaction.ownerSeqNumber === selectedMultisig.ownerSeqNumber ||
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
      if (wallet) {
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
              result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
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
            result: {signer: wallet.publicKey.toBase58()}
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
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logError('Finish Cancel transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Finish Cancel transaction failed', { transcript: transactionLog });
        return false;
      }
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
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.CancelTransaction);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            onTxExecuted();
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
    multisigClient,
    transactionStatus.currentOperation,
    clearTxConfirmationContext,
    startFetchTxSignatureInfo,
    resetTransactionStatus,
    setTransactionStatus,
    onTxExecuted,
  ]);

  const getTransactionStatusAction = useCallback((mtx: MultisigTransaction) => {

    if (mtx.status === MultisigTransactionStatus.Pending) {
      return t("multisig.multisig-transactions.tx-pending-approval");
    } 
    
    if (mtx.status === MultisigTransactionStatus.Approved) {
      return t("multisig.multisig-transactions.tx-pending-execution");
    }

    if (mtx.status === MultisigTransactionStatus.Executed) {
      return t("multisig.multisig-transactions.tx-completed");
    }
    
    if (mtx.status === MultisigTransactionStatus.Voided) {
      return t("multisig.multisig-transactions.tx-voided");
    }

    if (mtx.status === MultisigTransactionStatus.Expired) {
      return "Expired";
    }

    return t("multisig.multisig-transactions.tx-rejected");

  },[t]);

  const getTransactionUserStatusAction = useCallback((mtx: MultisigTransaction, longStatus = false) => {

    if (mtx.executedOn) {
      return "";
    } else if (mtx.didSigned === undefined) {
      return longStatus ? t("multisig.multisig-transactions.rejected-tx") : t("multisig.multisig-transactions.rejected");
    } else if (mtx.didSigned === false) {
      return !longStatus
        ? t("multisig.multisig-transactions.not-signed")
        : mtx.status === MultisigTransactionStatus.Approved
          ? t("multisig.multisig-transactions.not-sign-tx")
          : t("multisig.multisig-transactions.not-signed-tx");
    } else {
      return longStatus ? "You have signed this transaction" : t("multisig.multisig-transactions.signed");
    }

  },[t]);

  const getTransactionStatusClass = useCallback((mtx: MultisigTransaction) => {
    
    if(
      mtx.status === MultisigTransactionStatus.Pending || 
      mtx.status === MultisigTransactionStatus.Approved || 
      mtx.status === MultisigTransactionStatus.Voided ||
      mtx.status === MultisigTransactionStatus.Expired
    ) {
      return "error";
    }

    return "darken";

  },[]);

  const getOperationProgram = useCallback((op: OperationType) => {

    if (
      op === OperationType.CreateMint ||
      op === OperationType.MintTokens || 
      op === OperationType.TransferTokens || 
      op === OperationType.SetAssetAuthority
    ) {
      return "SPL Token";
    } else if (op === OperationType.UpgradeProgram || op === OperationType.SetMultisigAuthority) {
      return "BPF Upgradable Loader";
    } else if (op === OperationType.UpgradeIDL) {
      return "Serum IDL";
    } else if (
      op === OperationType.TreasuryCreate || 
      op === OperationType.TreasuryClose || 
      op === OperationType.TreasuryAddFunds ||
      op === OperationType.TreasuryRefreshBalance ||
      op === OperationType.TreasuryWithdraw ||
      op === OperationType.StreamCreate ||
      op === OperationType.StreamPause ||
      op === OperationType.StreamResume ||
      op === OperationType.StreamClose ||
      op === OperationType.StreamAddFunds
    ) {
      return "Mean MSP";
    } else {
      return "Mean Multisig";
    }

  },[]);

  const isUiBusy = useCallback((): boolean => {
    return isBusy || fetchTxInfoStatus === "fetching" || loadingMultisigAccounts || loadingMultisigTxs
            ? true
            : false;
  }, [
    isBusy,
    fetchTxInfoStatus,
    loadingMultisigTxs,
    loadingMultisigAccounts,
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
          ownerSeqNumber: info.account.ownerSetSeqno,
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

  const getMultisigTreasuries = useCallback(async () => {

    if (!connection || !publicKey || !msp || !selectedMultisig) { return []; }

    try {
      const treasuries = await msp.listTreasuries(selectedMultisig.authority);
      return treasuries;
    } catch (error) {
      console.error(error);
      return [];
    }

  }, [
    msp,
    publicKey,
    connection,
    selectedMultisig,
  ]);

  const getProgramsByUpgradeAuthority = useCallback(async (upgradeAuthority: PublicKey): Promise<ProgramAccounts[] | undefined> => {

    if (!connection || !upgradeAuthority) { return undefined; }

    // 1. Fetch executable data account having upgradeAuthority as upgrade authority
    const BPFLoaderUpgradeab1e = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
    const executableDataAccountsFilter: MemcmpFilter = { memcmp: { offset: 13, bytes: upgradeAuthority.toBase58() } }
    const executableDataAccounts = await connection.getProgramAccounts(
      BPFLoaderUpgradeab1e,
      {
        encoding: "base64",
        dataSlice: {
          offset: 0,
          length: 0
        },
        filters: [
          executableDataAccountsFilter
        ]
      });

    // 2. For each executable data account found in the previous step, fetch the corresponding program
    const programs: ProgramAccounts[] = [];
    for (let i = 0; i < executableDataAccounts.length; i++) {
      const executableData = executableDataAccounts[i].pubkey;

      const executableAccountsFilter: MemcmpFilter = { memcmp: { offset: 4, bytes: executableData.toBase58() } }
      const executableAccounts = await connection.getProgramAccounts(
        BPFLoaderUpgradeab1e,
        {
          encoding: "base64",
          dataSlice: {
            offset: 0,
            length: 0
          },
          filters: [
            executableAccountsFilter
          ]
        });

      if (executableAccounts.length === 0) {
        continue;
      }

      if (executableAccounts.length > 1) {
        throw new Error(`More than one program was found for program data account '${executableData}'`);
      }

      const foundProgram = {
        pubkey: executableAccounts[0].pubkey,
        owner: executableAccounts[0].account.owner,
        executable: executableData,
        upgradeAuthority: upgradeAuthority,
        size: executableDataAccounts[i].account.data.byteLength

      } as ProgramAccounts;

      // console.log(`Upgrade Authority: ${upgradeAuthority} --> Executable Data: ${executableData} --> Program: ${foundProgram}`);

      programs.push(foundProgram);

    }

    return programs;

  }, [connection]);

  // SERUM ACCOUNTS
  useEffect(() => {

    if (!publicKey || !multisigSerumClient) { return; }

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
            .catch((err: any) => {
              console.error(err);
            });
        }

        setSerumAccounts(parsedSerumAccs);
      })
      .catch((err: any) => {
        console.error(err);
      });
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    multisigSerumClient, 
    publicKey
  ]);

  // Refresh the multisig accounts list
  useEffect(() => {

    if (!connection || !connected || !publicKey || !multisigClient || !loadingMultisigAccounts || !serumAccounts) {
      setLoadingMultisigAccounts(false);
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
          let item: MultisigInfo | undefined = undefined;
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
          } else {
            setSelectedMultisig(undefined);
            setMultisigTxs([]);
          }    
        })
        .catch(err => {
          console.error(err);
          setMultisigTxs([]);
          consoleOut('multisigPendingTxs:', [], 'blue');
        })
        .finally(() => setLoadingMultisigAccounts(false));
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connected, 
    publicKey, 
    connection, 
    multisigClient, 
    selectedMultisig, 
    highLightableMultisigId, 
    loadingMultisigAccounts,
    serumAccounts
  ]);

  // Get Txs for the selected multisig
  useEffect(() => {

    if (
      !connection || 
      !publicKey || 
      !multisigClient || 
      !selectedMultisig || 
      !selectedMultisig.id || 
      !needRefreshTxs ||
      loadingMultisigTxs
    ) { 
      return;
    }

    const timeout = setTimeout(() => {

      consoleOut('Triggering loadMultisigPendingTxs using setNeedRefreshTxs...', '', 'blue');
      setNeedRefreshTxs(false);
      setLoadingMultisigTxs(true);

      multisigClient
        .getMultisigTransactions(selectedMultisig.id, publicKey)
        .then((txs: any) => {
          consoleOut('selected multisig txs', txs, 'blue');
          if (!isProd()) {
            const debugTable: any[] = [];
            txs.forEach((item: any) => debugTable.push({
              operation: OperationType[item.operation],
              approved: item.didSigned,
              executed: item.executedOn ? true : false,
              proposer: item.proposer ? shortenAddress(item.proposer.toBase58(), 6) : '-',
              status: MultisigTransactionStatus[item.status]
            }));
            console.table(debugTable);
          }
          setMultisigTxs(txs);
        })
        .catch((err: any) => {
          console.error("Error fetching all transactions", err);
          setMultisigTxs([]);
          consoleOut('multisig txs:', [], 'blue');
        })
        .finally(() => setLoadingMultisigTxs(false));      
    });

    return () => {
      clearTimeout(timeout);
    }    

  }, [
    publicKey, 
    selectedMultisig, 
    needRefreshTxs,
    connection, 
    multisigClient, 
    loadingMultisigTxs
  ]);

  // Get multisig treasuries for the selected multisig
  useEffect(() => {

    if (!connection || !publicKey || !selectedMultisig) {
      return;
    }

    const timeout = setTimeout(() => {
      getMultisigTreasuries()
        .then(values => {
          consoleOut('multisigTreasuries:', values, 'blue');
          setMultisigTreasuries(values);
        })
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    publicKey,
    connection,
    selectedMultisig,
    getMultisigTreasuries
  ]);

  // Get Programs
  useEffect(() => {

    if (!connection || !publicKey || !selectedMultisig || !selectedMultisig.authority || !loadingPrograms) {
      return;
    }

    setTimeout(() => {
      setLoadingPrograms(true);
    });

    const timeout = setTimeout(() => {
      getProgramsByUpgradeAuthority(selectedMultisig.authority)
        .then(programs => {
          consoleOut('programs:', programs, 'blue');
          setPrograms(programs);
        })
        .catch(err => console.error(err))
        .finally(() => setLoadingPrograms(false));
    });

    return () => {
      clearTimeout(timeout);
    }

  },[
    publicKey,
    connection,
    loadingPrograms,
    selectedMultisig,
    getProgramsByUpgradeAuthority,
  ]);

  // Load/Unload multisig on wallet connect/disconnect
  useEffect(() => {
    if (previousWalletConnectState !== connected) {
      if (!previousWalletConnectState && connected && publicKey) {
        consoleOut('User is connecting...', publicKey.toBase58(), 'green');
        setLoadingMultisigAccounts(true);
        setLoadingPrograms(true);
        setNeedRefreshTxs(true);
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'green');
        setMultisigAccounts([]);
        setHighLightableMultisigId(undefined);
        sethHighlightedMultisigTx(undefined);
        setMultisigTransactionSummary(undefined);
        setSelectedMultisig(undefined);
        setLoadingMultisigAccounts(false);
      }
    }
  }, [
    connected,
    publicKey,
    previousWalletConnectState,
    setHighLightableMultisigId,
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
        setNeedRefreshTxs(true);          // Trigger reload multisigs
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

  // Get Multisig Vaults
  useEffect(() => {

    if (!multisigClient || !selectedMultisig || !selectedMultisig.id) {
      return;
    }

    const timeout = setTimeout(() => {
      getMultisigVaults(multisigClient.provider.connection, selectedMultisig.id)
        .then(result => {
          setMultisigVaults(result);
        })
        .catch(err => console.error(err));
    });

    return () => {
      clearTimeout(timeout);
    }

  },[
    getMultisigVaults,
    multisigClient, 
    selectedMultisig
  ]);

  // END MULTISIG


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

  /////////////////
  //   Getters   //
  /////////////////

  const isCanvasTight = useCallback(() => {
    return width < 576 || (width >= 768 && width < 960);
  }, [width]);

  // const getTxInitiator = useCallback((mtx: MultisigTransaction): MultisigParticipant | undefined => {
  //   if (!selectedMultisig) { return undefined; }

  //   const owners: MultisigParticipant[] = (selectedMultisig as MultisigV2).owners;
  //   const initiator = owners && owners.length > 0
  //     ? owners.find(o => o.address === mtx.proposer?.toBase58())
  //     : undefined;

  //   return initiator;
  // }, [selectedMultisig]);

  // const isTxVoided = useCallback(() => {
  //   if (highlightedMultisigTx) {
  //     if (highlightedMultisigTx.status === MultisigTransactionStatus.Voided) {
  //       return true;
  //     }
  //   }
  //   return false;
  // }, [highlightedMultisigTx]);

  // const isTxPendingApproval = useCallback(() => {
  //   if (highlightedMultisigTx) {
  //     if (highlightedMultisigTx.status === MultisigTransactionStatus.Pending) {
  //       return true;
  //     }
  //   }
  //   return false;
  // }, [highlightedMultisigTx]);

  // const isTxPendingExecution = useCallback(() => {
  //   if (highlightedMultisigTx) {
  //     if (highlightedMultisigTx.status === MultisigTransactionStatus.Approved) {
  //       return true;
  //     }
  //   }
  //   return false;
  // }, [highlightedMultisigTx]);

  // const isTxRejected = useCallback(() => {
  //   if (highlightedMultisigTx) {
  //     if (highlightedMultisigTx.status === MultisigTransactionStatus.Rejected) {
  //       return true;
  //     }
  //   }
  //   return false;
  // }, [highlightedMultisigTx]);

  // const getTxUserStatusClass = useCallback((mtx: MultisigTransaction) => {

  //   if (mtx.executedOn) {
  //     return "";
  //   } else if (mtx.didSigned === undefined) {
  //     return "fg-red";
  //   } else if (mtx.didSigned === false) {
  //     return theme === 'light' ? "fg-light-orange" : "fg-warning";
  //   } else {
  //     return theme === 'light' ? "fg-green" : "fg-success"
  //   }

  // },[theme]);

  // const getTxApproveMainCtaLabel = useCallback(() => {

  //   const busyLabel = isTxPendingExecution()
  //     ? 'Executing transaction'
  //     : isTxPendingApproval()
  //       ? 'Approving transaction'
  //       : isTxVoided() 
  //         ? 'Cancelling Transaction' 
  //         : '';

  //   const iddleLabel = isTxPendingExecution()
  //     ? 'Execute transaction'
  //     : isTxPendingApproval()
  //       ? 'Approve transaction'
  //       : isTxVoided() 
  //         ? 'Cancel Transaction' 
  //         : '';

  //   return isBusy
  //     ? busyLabel
  //     : transactionStatus.currentOperation === TransactionStatus.Iddle
  //       ? iddleLabel
  //       : transactionStatus.currentOperation === TransactionStatus.TransactionFinished
  //         ? t('general.cta-finish')
  //         : t('general.refresh');
  // }, [
  //   isBusy,
  //   transactionStatus.currentOperation,
  //   isTxPendingExecution,
  //   isTxPendingApproval,
  //   isTxVoided,
  //   t,
  // ]);

  // const isTxInProgress = useCallback((): boolean => {
  //   return isBusy || fetchTxInfoStatus === "fetching" ? true : false;
  // }, [
  //   isBusy,
  //   fetchTxInfoStatus,
  // ]);

  // Switch to hide voided transactions
  // const switchHandler = () => {
  //   setSwitchValue(!switchValue);
  // }

  useEffect(() => {
    const multisigTxsAmountToHide = (multisigTxs.filter((txName) => txName.status === 4).length);

    const multisigTxsToShow = multisigTxs.filter((txName) => txName.status !== 4);

    if (switchValue) {
      setMultisigTxsToHide(multisigTxsAmountToHide.toString());
      setFilteredMultisigTxs(multisigTxsToShow);
    } else {
      setFilteredMultisigTxs(multisigTxs);
    }
  }, [multisigTxs, switchValue]);

  // Scroll to a given multisig is specified as highLightableMultisigId
  useEffect(() => {
    if (loadingMultisigAccounts || !multisigAccounts || multisigAccounts.length === 0 || !highLightableMultisigId || !selectedMultisig) {
      return;
    }

    consoleOut('Try to scroll multisig into view...', '', 'green');
    const timeout = setTimeout(() => {
      const highlightTarget = document.getElementById(highLightableMultisigId);
      if (highlightTarget) {
        consoleOut('Scrolling multisig into view...', '', 'green');
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

  ///////////////
  // Rendering //
  ///////////////

  const txPendingSigners = (mtx: MultisigTransaction) => {
    if (!selectedMultisig || !selectedMultisig.owners || selectedMultisig.owners.length === 0) {
      return null;
    }

    const participants = selectedMultisig.owners as MultisigParticipant[]
    return (
      <>
        {participants.map((item, index) => {
          if (mtx.signers[index]) { return null; }
          return (
            <div key={`${index}`} className="well-group mb-1">
              <div className="flex-fixed-right align-items-center">
                <div className="left text-truncate m-0">
                  <div><span>{item.name || `Owner ${index + 1}`}</span></div>
                  <div className="font-size-75 text-monospace">{item.address}</div>
                </div>
                <div className="right pl-2">
                  <div><span className={theme === 'light' ? "fg-light-orange font-bold" : "fg-warning font-bold"}>{t("multisig.multisig-transactions.not-signed")}</span></div>
                </div>
              </div>
            </div>
          );
        })}
      </>
    );
  };

  const getParticipantsThatApprovedTx = useCallback((mtx: MultisigTransaction) => {

    if (!selectedMultisig || !selectedMultisig.owners || selectedMultisig.owners.length === 0) {
      return [];
    }
  
    const addressess: MultisigParticipant[] = [];
    const participants = selectedMultisig.owners as MultisigParticipant[];
    participants.forEach((participant: MultisigParticipant, index: number) => {
      if (mtx.signers[index]) {
        addressess.push(participant);
      }
    });
  
    return addressess;
  
  }, [selectedMultisig]);

  const renderMultisigPendingTxs = () => {

    if (!selectedMultisig) {
      return null;
    } else if (selectedMultisig && loadingMultisigTxs) {
      return (
        <div className="mb-2">{t('multisig.multisig-transactions.loading-transactions')}</div>
      );
    } else if (selectedMultisig && !loadingMultisigTxs && multisigTxs.length === 0) {
      return (
        <div className="mb-2">{t('multisig.multisig-transactions.no-transactions-multisig')}</div>
      );
    }

    return (
      <>
        <div className="item-list-header compact">
          <div className="header-row" style={{ paddingBottom: 5 }}>
            <div className="std-table-cell responsive-cell">{t('multisig.multisig-transactions.column-operation')}</div>
            <div className="std-table-cell responsive-cell">{t('multisig.multisig-transactions.column-program-id')}</div>
            <div className="std-table-cell fixed-width-110">{t('multisig.multisig-transactions.column-created-on')}</div>
            <div className="std-table-cell fixed-width-90">{t('multisig.multisig-transactions.column-my-status')}</div>
            <div className="std-table-cell fixed-width-34">{t('multisig.multisig-transactions.column-current-signatures')}</div>
            <div className="std-table-cell text-center fixed-width-120">{t('multisig.multisig-transactions.column-pending-signatures')}</div>
          </div>
        </div>
        <div className="activity-list-data-wrapper vertical-scroll">
          <div className="activity-list h-100">
            <div className="item-list-body compact">
              {filteredMultisigTxs.map(item => {
                return (
                  <div
                    key={item.id.toBase58()}
                    style={{padding: '3px 0px'}}
                    className={`item-list-row ${
                      highlightedMultisigTx && highlightedMultisigTx.id.equals(item.id)
                        ? isUiBusy() ? 'selected no-pointer click-disabled' : 'selected'
                        : isUiBusy() ? 'no-pointer click-disabled' : 'simplelink'}`
                    }
                    onClick={() => showMultisigActionTransactionModal(item)}>
                    <div className="std-table-cell responsive-cell">
                      <span className="align-middle">{getOperationName(item.operation)}</span>
                    </div>
                    <div className="std-table-cell responsive-cell">
                      <span className="align-middle">{getOperationProgram(item.operation)}</span>
                    </div>
                    <div className="std-table-cell fixed-width-110">
                      <span className="align-middle">{getShortDate(item.createdOn.toString(), isCanvasTight() ? false : true)}</span>
                    </div>
                    <div className="std-table-cell fixed-width-90">
                      <span className="align-middle">{getTransactionUserStatusAction(item)}</span>
                    </div>
                    <div className="std-table-cell fixed-width-34">
                      <span className="align-middle">{`${item.signers.filter(s => s === true).length}/${selectedMultisig.threshold}`}</span>
                    </div>
                    <div className="std-table-cell text-center fixed-width-120">
                      <span className={`badge small status-badge ${getTransactionStatusClass(item)}`} style={{padding: '3px 5px'}}>{getTransactionStatusAction(item)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </>
    );
  }

  const renderMultisigList = (
    <>
    {multisigAccounts && multisigAccounts.length ? (
      multisigAccounts.map((item, index) => {
        const onMultisigClick = (ev: any) => {
          consoleOut('=======================================', '', 'green');
          consoleOut('selected multisig:', item, 'blue');
          setDtailsPanelOpen(true);
          setSelectedMultisig(item);
          setNeedRefreshTxs(true);
          setLoadingPrograms(true);
        };

        return (
          <div 
            key={`${index + 50}`}
            id={item.id.toBase58()}
            onClick={onMultisigClick}
            className={
              `transaction-list-row ${
                selectedMultisig && selectedMultisig.id && selectedMultisig.id.equals(item.id)
                  ? 'selected'
                  : ''
                }`
              }>

            <div className="icon-cell">
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
              <div className="rate-amount">
                {
                  t('multisig.multisig-accounts.pending-transactions', {
                    txs: item.pendingTxsAmount
                  })
                }
              </div>
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

  const proposals = [
    {
      id: 1,
      logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwh7gt29278eysxa7rb5sl8%3Ftype%3DLOGO&w=3840&q=75",
      title: "My awesome proposal",
      expires: "April 27th 2022, 6:55:49",
      approved: 2,
      rejected: 1,
      status: "active",
      needs: "2",
      description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed ex elit, rutrum id dui eget, malesuada vestibulum felis. Nullam vehicula elementum mi, efficitur facilisis tortor commodo quis. Pellentesque venenatis dapibus magna. Sed in lorem ut magna aenean.",
      proposedBy: "Pavelsan MacKenzie",
      settings: {
        minColOff: "24 hours",
        singleSignerBalanceThreshold: "100"
      },
      instructions: [
        {
          id: 1,
          title: "Money Streaming Program v3: MSP",
          description: "Program: Money Streaming Program [MSPas...mkdk]",
          name: "One time payment",
          sender: "5tr9CDSgZRLYPGdcsm9PztaGSfJtX5CEmqDbEbvCTX3G",
          recipient: "3PdEyhrV3gaUj4ffwjKGXBLo42jF2CQCCBoXenwCRWff",
          amount: "18274.94 USDC"
        },
        {
          id: 2,
          title: "Memo Program v2: Memo",
          description: "Program: Memo Program v2: Memo [Memos...mkdk",
          name: "One time payment",
          sender: "5tr9CDSgZRLYPGdcsm9PztaGSfJtX5CEmqDbEbvCTX3G",
          recipient: "3PdEyhrV3gaUj4ffwjKGXBLo42jF2CQCCBoXenwCRWff",
          amount: "18274.94 USDC"
        }
      ],
      activities: [
        {
          id: 1,
          date: "January 2th 2022, 6:55:49",
          description: "approved",
          address: "ARmgYJkSQfbSifkXc4h7MGDAALznW5FFSHVucJ6j3vd7",
          proposedBy: "Tania"
        },
        {
          id: 2,
          date: "January 5th 2022, 6:55:49",
          description: "rejected",
          address: "F4KjjnrM2hr8MasEDAYoGSBWbn3wzz1rrdGtkRkoaMKc",
          proposedBy: "Yansel"
        },
        {
          id: 3,
          date: "January 7th 2022, 6:55:49",
          description: "created",
          address: "HGb43H86jJNLN4MW1sDWKruUZYrs3rkNQkf3acF8uXiv",
          proposedBy: "Pavelsan"
        },
      ],
      programs: [
        {
          id: 1,
          name: "Program 1"
        },
        {
          id: 2,
          name: "Program 2"
        },
      ]
    },
    {
      id: 2,
      logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwh6su28617eysxuaubvt93%3Ftype%3DLOGO&w=3840&q=75",
      title: "Transfer all the money to me",
      expires: "May 1th 2022, 6:55:49",
      approved: 2,
      rejected: 1,
      status: "active",
      needs: "2",
      description: "Curabitur rhoncus tempor orci, et ornare eros faucibus vitae. Donec vitae eleifend orci. Vestibulum et ex ut ipsum semper ornare nec nec justo. Nunc vitae risus maximus, ornare orci a, tempus dui. Nulla in orci vitae augue dapibus volutpat vitae sed metus..",
      proposedBy: "Yansel Florian",
      settings: {
        minColOff: "24 hours",
        singleSignerBalanceThreshold: "100"
      },
      instructions: [
        {
          id: 1,
          title: "Memo Program v2: Memo",
          description: "Program: Memo Program v2: Memo [Memos...mkdk]",
          name: "One time payment",
          sender: "5tr9CDSgZRLYPGdcsm9PztaGSfJtX5CEmqDbEbvCTX3G",
          recipient: "3PdEyhrV3gaUj4ffwjKGXBLo42jF2CQCCBoXenwCRWff",
          amount: "18274.94 USDC"
        }
      ],
      activities: [
        {
          id: 4,
          date: "January 5th 2022, 6:55:49",
          description: "rejected",
          address: "F4KjjnrM2hr8MasEDAYoGSBWbn3wzz1rrdGtkRkoaMKc",
          proposedBy: "Yansel"
        },
        {
          id: 5,
          date: "January 7th 2022, 6:55:49",
          description: "created",
          address: "HGb43H86jJNLN4MW1sDWKruUZYrs3rkNQkf3acF8uXiv",
          proposedBy: "Pavelsan"
        },
      ],
      programs: [
        {
          id: 3,
          name: "Program 3"
        },
        {
          id: 4,
          name: "Program 4"
        },
        {
          id: 5,
          name: "Program 5"
        },
      ]
    },
    {
      id: 3,
      logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwiiri37677eysxluqnog8e%3Ftype%3DLOGO&w=3840&q=75",
      title: "Send $1m to Ukraine",
      expires: "April 27th 2022, 6:55:49",
      approved: 2,
      rejected: 1,
      status: "passed",
      needs: "2",
      description: "Quisque velit nunc, fringilla sed vehicula quis, pretium ut libero. Quisque id nisl quis risus luctus vestibulum vitae quis lacus. Donec pharetra aliquam turpis et scelerisque. Etiam imperdiet non metus sit amet imperdiet. Nulla viverra luctus ante a quis.",
      proposedBy: "Michel Triana",
      settings: {
        minColOff: "24 hours",
        singleSignerBalanceThreshold: "100"
      },
      instructions: [
        {
          id: 1,
          title: "Money Streaming Program v3: MSP",
          description: "Program: Money Streaming Program [MSPas...mkdk]",
          name: "One time payment",
          sender: "5tr9CDSgZRLYPGdcsm9PztaGSfJtX5CEmqDbEbvCTX3G",
          recipient: "3PdEyhrV3gaUj4ffwjKGXBLo42jF2CQCCBoXenwCRWff",
          amount: "18274.94 USDC"
        }
      ],
      activities: [
        {
          id: 6,
          date: "February 7th 2022, 6:55:49",
          description: "approved",
          address: "ARmgYJkSQfbSifkXc4h7MGDAALznW5FFSHVucJ6j3vd7",
          proposedBy: "Tania"
        },
        {
          id: 7,
          date: "February 8th 2022, 6:55:49",
          description: "rejected",
          address: "F4KjjnrM2hr8MasEDAYoGSBWbn3wzz1rrdGtkRkoaMKc",
          proposedBy: "Yansel"
        },
        {
          id: 8,
          date: "February 12th 2022, 6:55:49",
          description: "created",
          address: "HGb43H86jJNLN4MW1sDWKruUZYrs3rkNQkf3acF8uXiv",
          proposedBy: "Pavelsan"
        },
      ],
      programs: [
        {
          id: 6,
          name: "Program 6"
        },
        {
          id: 7,
          name: "Program 7"
        },
      ]
    },
    {
      id: 4,
      logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwilfd38506eysxniku8quh%3Ftype%3DLOGO&w=3840&q=75",
      title: "Send $1m to Putin",
      expires: "April 27th 2022, 6:55:49",
      approved: 2,
      rejected: 1,
      status: "failed",
      needs: "2",
      description: "Morbi vel elit quis ligula pellentesque rhoncus vitae in ex. Quisque consequat est ante, at sodales est facilisis ac. Sed imperdiet dignissim neque non interdum. Aliquam neque quam, consequat ut tempus a, aliquet a nunc. Nulla eu interdum neque. Ut lectus.",
      proposedBy: "Pavelsan MacKenzie",
      settings: {
        minColOff: "24 hours",
        singleSignerBalanceThreshold: "100"
      },
      instructions: [
        {
          id: 1,
          title: "Money Streaming Program v3: MSP",
          description: "Program: Money Streaming Program [MSPas...mkdk]",
          name: "One time payment",
          sender: "5tr9CDSgZRLYPGdcsm9PztaGSfJtX5CEmqDbEbvCTX3G",
          recipient: "3PdEyhrV3gaUj4ffwjKGXBLo42jF2CQCCBoXenwCRWff",
          amount: "18274.94 USDC"
        },
        {
          id: 2,
          title: "Memo Program v2: Memo",
          description: "Program: Memo Program v2: Memo [Memos...mkdk]",
          name: "One time payment",
          sender: "5tr9CDSgZRLYPGdcsm9PztaGSfJtX5CEmqDbEbvCTX3G",
          recipient: "3PdEyhrV3gaUj4ffwjKGXBLo42jF2CQCCBoXenwCRWff",
          amount: "18274.94 USDC"
        }
      ],
      activities: [
        {
          id: 9,
          date: "February 1th 2022, 6:55:49",
          description: "approved",
          address: "ARmgYJkSQfbSifkXc4h7MGDAALznW5FFSHVucJ6j3vd7",
          proposedBy: "Tania"
        },
        {
          id: 10,
          date: "February 3th 2022, 6:55:49",
          description: "created",
          address: "HGb43H86jJNLN4MW1sDWKruUZYrs3rkNQkf3acF8uXiv",
          proposedBy: "Pavelsan"
        },
      ],
      programs: [
        {
          id: 8,
          name: "Program 8"
        },
        {
          id: 9,
          name: "Program 9"
        },
      ]
    },
    {
      id: 5,
      logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwip3w40063eysxbk0kx2lc%3Ftype%3DLOGO&w=3840&q=75",
      title: "My awesome proposal",
      expires: "April 30th 2022, 6:55:49",
      approved: 2,
      rejected: 1,
      status: "active",
      needs: "2",
      description: "Maecenas varius non risus ac fermentum. Etiam placerat erat sit amet est auctor rhoncus. Mauris varius lobortis sapien, vel consectetur orci dignissim eget. Donec vestibulum nibh metus, in vehicula mi tristique non. Donec id congue lacus, at finibus fusce.",
      proposedBy: "Yansel Florian",
      settings: {
        minColOff: "24 hours",
        singleSignerBalanceThreshold: "100"
      },
      instructions: [
        {
          id: 1,
          title: "Money Streaming Program v3: MSP",
          description: "Program: Money Streaming Program [MSPas...mkdk]",
          name: "One time payment",
          sender: "5tr9CDSgZRLYPGdcsm9PztaGSfJtX5CEmqDbEbvCTX3G",
          recipient: "3PdEyhrV3gaUj4ffwjKGXBLo42jF2CQCCBoXenwCRWff",
          amount: "18274.94 USDC"
        }
      ],
      activities: [
        {
          id: 1,
          date: "March 2th 2022, 6:55:49",
          description: "approved",
          address: "ARmgYJkSQfbSifkXc4h7MGDAALznW5FFSHVucJ6j3vd7",
          proposedBy: "Tania"
        },
        {
          id: 2,
          date: "March 5th 2022, 6:55:49",
          description: "rejected",
          address: "F4KjjnrM2hr8MasEDAYoGSBWbn3wzz1rrdGtkRkoaMKc",
          proposedBy: "Yansel"
        },
        {
          id: 3,
          date: "March 14th 2022, 6:55:49",
          description: "created",
          address: "HGb43H86jJNLN4MW1sDWKruUZYrs3rkNQkf3acF8uXiv",
          proposedBy: "Pavelsan"
        },
      ],
      programs: [
        {
          id: 11,
          name: "Program 10"
        },
        {
          id: 12,
          name: "Program 11"
        },
        {
          id: 13,
          name: "Program 12"
        },
      ]
    },
    {
      id: 6,
      logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwh8w830938eysxhy5e8syg%3Ftype%3DLOGO&w=3840&q=75",
      title: "Transfer all the money to me",
      expires: "April 30th 2022, 6:55:49",
      approved: 2,
      rejected: 1,
      status: "active",
      needs: "2",
      description: "Donec gravida cursus magna, ac molestie leo consectetur et. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Vivamus consequat nisi sed pretium bibendum. Aliquam eros tellus, aliquet vel risus non, finibus porta ante.",
      proposedBy: "Pavelsan MacKenzie",
      settings: {
        minColOff: "24 hours",
        singleSignerBalanceThreshold: "100"
      },
      instructions: [
        {
          id: 1,
          title: "Memo Program v2: Memo",
          description: "Program: Memo Program v2: Memo [Memos...mkdk]",
          name: "One time payment",
          sender: "5tr9CDSgZRLYPGdcsm9PztaGSfJtX5CEmqDbEbvCTX3G",
          recipient: "3PdEyhrV3gaUj4ffwjKGXBLo42jF2CQCCBoXenwCRWff",
          amount: "18274.94 USDC"
        }
      ],
      activities: [
        {
          id: 14,
          date: "March 5th 2022, 6:55:49",
          description: "approved",
          address: "ARmgYJkSQfbSifkXc4h7MGDAALznW5FFSHVucJ6j3vd7",
          proposedBy: "Tania"
        },
        {
          id: 15,
          date: "March 9th 2022, 6:55:49",
          description: "rejected",
          address: "F4KjjnrM2hr8MasEDAYoGSBWbn3wzz1rrdGtkRkoaMKc",
          proposedBy: "Yansel"
        }
      ],
      programs: [
        {
          id: 13,
          name: "Program 13"
        }
      ]
    },
    {
      id: 7,
      logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwilfd38506eysxniku8quh%3Ftype%3DLOGO&w=3840&q=75",
      title: "Send $1m to Ukraine",
      expires: "April 30th 2022, 6:55:49",
      approved: 2,
      rejected: 1,
      status: "active",
      needs: "2",
      description: "Etiam vestibulum finibus augue, quis malesuada sapien eleifend ac. Curabitur tortor lorem, pretium sit amet maximus posuere, viverra in sem. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Curabitur et odio mi.",
      proposedBy: "Michel Triana",
      settings: {
        minColOff: "24 hours",
        singleSignerBalanceThreshold: "100"
      },
      instructions: [
        {
          id: 1,
          title: "Money Streaming Program v3: MSP",
          description: "Program: Money Streaming Program [MSPas...mkdk]",
          name: "One time payment",
          sender: "5tr9CDSgZRLYPGdcsm9PztaGSfJtX5CEmqDbEbvCTX3G",
          recipient: "3PdEyhrV3gaUj4ffwjKGXBLo42jF2CQCCBoXenwCRWff",
          amount: "18274.94 USDC"
        }
      ],
      activities: [
        {
          id: 16,
          date: "February 23th 2022, 6:55:49",
          description: "approved",
          address: "ARmgYJkSQfbSifkXc4h7MGDAALznW5FFSHVucJ6j3vd7",
          proposedBy: "Tania"
        },
        {
          id: 17,
          date: "March 2th 2022, 6:55:49",
          description: "rejected",
          address: "F4KjjnrM2hr8MasEDAYoGSBWbn3wzz1rrdGtkRkoaMKc",
          proposedBy: "Yansel"
        },
        {
          id: 18,
          date: "March 5th 2022, 6:55:49",
          description: "created",
          address: "HGb43H86jJNLN4MW1sDWKruUZYrs3rkNQkf3acF8uXiv",
          proposedBy: "Pavelsan"
        },
      ],
      programs: [
        {
          id: 14,
          name: "Program 14"
        },
        {
          id: 15,
          name: "Program 15"
        },
      ]
    },
    {
      id: 8,
      logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwilfj38513eysxcwypxovh%3Ftype%3DLOGO&w=3840&q=75",
      title: "My awesome proposal",
      expires: "April 30th 2022, 6:55:49",
      approved: 2,
      rejected: 1,
      status: "passed",
      needs: "2",
      description: "Maecenas blandit, massa sed mattis suscipit, neque libero malesuada felis, sed dignissim magna nisl ut ligula. In id hendrerit mi. Maecenas maximus posuere enim, ut feugiat tellus accumsan nec. Praesent feugiat urna consectetur gravida sollicitudin tortor.",
      proposedBy: "Pavelsan MacKenzie",
      settings: {
        minColOff: "24 hours",
        singleSignerBalanceThreshold: "100"
      },
      instructions: [
        {
          id: 1,
          title: "Money Streaming Program v3: MSP",
          description: "Program: Money Streaming Program [MSPas...mkdk]",
          name: "One time payment",
          sender: "5tr9CDSgZRLYPGdcsm9PztaGSfJtX5CEmqDbEbvCTX3G",
          recipient: "3PdEyhrV3gaUj4ffwjKGXBLo42jF2CQCCBoXenwCRWff",
          amount: "18274.94 USDC"
        },
        {
          id: 2,
          title: "Memo Program v2: Memo",
          description: "Program: Memo Program v2: Memo [Memos...mkdk]",
          name: "One time payment",
          sender: "5tr9CDSgZRLYPGdcsm9PztaGSfJtX5CEmqDbEbvCTX3G",
          recipient: "3PdEyhrV3gaUj4ffwjKGXBLo42jF2CQCCBoXenwCRWff",
          amount: "18274.94 USDC"
        }
      ],
      activities: [
        {
          id: 19,
          date: "February 3th 2022, 6:55:49",
          description: "rejected",
          address: "F4KjjnrM2hr8MasEDAYoGSBWbn3wzz1rrdGtkRkoaMKc",
          proposedBy: "Yansel"
        },
        {
          id: 20,
          date: "February 14th 2022, 6:55:49",
          description: "created",
          address: "HGb43H86jJNLN4MW1sDWKruUZYrs3rkNQkf3acF8uXiv",
          proposedBy: "Pavelsan"
        },
      ],
      programs: [
        {
          id: 16,
          name: "Program 16"
        },
        {
          id: 17,
          name: "Program 17"
        },
        {
          id: 18,
          name: "Program 18"
        },
      ]
    },
    {
      id: 9,
      logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwh7gt29278eysxa7rb5sl8%3Ftype%3DLOGO&w=3840&q=75",
      title: "Transfer all the money to me",
      expires: "April 30th 2022, 1:55:49",
      approved: 2,
      rejected: 1,
      status: "failed",
      needs: "2",
      description: "Sed vitae dui hendrerit, consequat nunc vel, euismod nunc. Aliquam dictum felis quis urna luctus gravida. Nam dictum sed est id ultricies. Duis eu leo a metus condimentum viverra. Proin maximus nulla urna, non pellentesque ante ultrices sit amet. Cras vel.",
      proposedBy: "Yansel Florian",
      settings: {
        minColOff: "24 hours",
        singleSignerBalanceThreshold: "100"
      },
      instructions: [
        {
          id: 1,
          title: "Money Streaming Program v3: MSP",
          description: "Program: Money Streaming Program [MSPas...mkdk]",
          name: "One time payment",
          sender: "5tr9CDSgZRLYPGdcsm9PztaGSfJtX5CEmqDbEbvCTX3G",
          recipient: "3PdEyhrV3gaUj4ffwjKGXBLo42jF2CQCCBoXenwCRWff",
          amount: "18274.94 USDC"
        }
      ],
      activities: [
        {
          id: 21,
          date: "February 5th 2022, 6:55:49",
          description: "approved",
          address: "ARmgYJkSQfbSifkXc4h7MGDAALznW5FFSHVucJ6j3vd7",
          proposedBy: "Tania"
        },
        {
          id: 22,
          date: "February 9th 2022, 6:55:49",
          description: "rejected",
          address: "F4KjjnrM2hr8MasEDAYoGSBWbn3wzz1rrdGtkRkoaMKc",
          proposedBy: "Yansel"
        },
        {
          id: 23,
          date: "February 13th 2022, 6:55:49",
          description: "created",
          address: "HGb43H86jJNLN4MW1sDWKruUZYrs3rkNQkf3acF8uXiv",
          proposedBy: "Pavelsan"
        },
      ],
      programs: [
        {
          id: 19,
          name: "Program 19"
        },
        {
          id: 20,
          name: "Program 20"
        },
      ]
    },
    {
      id: 10,
      logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwh8w830938eysxhy5e8syg%3Ftype%3DLOGO&w=3840&q=75",
      title: "Send $1m to Putin",
      expires: "April 30th 2022, 3:55:49",
      approved: 2,
      rejected: 1,
      status: "active",
      needs: "2",
      description: "Sed efficitur fringilla justo, ut luctus odio consectetur vel. Aliquam erat volutpat. Proin ultricies tincidunt felis et dignissim. Curabitur maximus, mi sit amet congue maximus, felis neque facilisis sapien, eget ullamcorper arcu neque non lectus vivamus.",
      proposedBy: "Yamel Amador",
      settings: {
        minColOff: "24 hours",
        singleSignerBalanceThreshold: "100"
      },
      instructions: [
        {
          id: 1,
          title: "Memo Program v2: Memo",
          description: "Program: Memo Program v2: Memo [Memos...mkdk]",
          name: "One time payment",
          sender: "5tr9CDSgZRLYPGdcsm9PztaGSfJtX5CEmqDbEbvCTX3G",
          recipient: "3PdEyhrV3gaUj4ffwjKGXBLo42jF2CQCCBoXenwCRWff",
          amount: "18274.94 USDC"
        }
      ],
      activities: [
        {
          id: 24,
          date: "March 23th 2022, 6:55:49",
          description: "approved",
          address: "ARmgYJkSQfbSifkXc4h7MGDAALznW5FFSHVucJ6j3vd7",
          proposedBy: "Tania"
        },
        {
          id: 25,
          date: "April 3th 2022, 6:55:49",
          description: "created",
          address: "HGb43H86jJNLN4MW1sDWKruUZYrs3rkNQkf3acF8uXiv",
          proposedBy: "Pavelsan"
        },
      ],
      programs: [
        {
          id: 21,
          name: "Program 21"
        },
        {
          id: 22,
          name: "Program 22"
        },
        {
          id: 23,
          name: "Program 23"
        },
      ]
    },
    {
      id: 11,
      logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwiiri37677eysxluqnog8e%3Ftype%3DLOGO&w=3840&q=75",
      title: "Send $1m to Ukraine",
      expires: "April 30th 2022, 6:55:49",
      approved: 2,
      rejected: 1,
      status: "active",
      needs: "2",
      description: "Ut faucibus luctus lacus in lacinia. Donec vitae orci tellus. Nunc efficitur aliquam euismod. Phasellus ornare metus in nunc fringilla vestibulum. Cras a facilisis risus. Integer vehicula eget metus vitae tristique. Duis accumsan blandit metus, quis nulla.",
      proposedBy: "Pavelsan MacKenzie",
      settings: {
        minColOff: "24 hours",
        singleSignerBalanceThreshold: "100"
      },
      instructions: [
        {
          id: 1,
          title: "Money Streaming Program v3: MSP",
          description: "Program: Money Streaming Program [MSPas...mkdk]",
          name: "One time payment",
          sender: "5tr9CDSgZRLYPGdcsm9PztaGSfJtX5CEmqDbEbvCTX3G",
          recipient: "3PdEyhrV3gaUj4ffwjKGXBLo42jF2CQCCBoXenwCRWff",
          amount: "18274.94 USDC"
        }
      ],
      activities: [
        {
          id: 26,
          date: "April 3th 2022, 6:55:49",
          description: "approved",
          address: "ARmgYJkSQfbSifkXc4h7MGDAALznW5FFSHVucJ6j3vd7",
          proposedBy: "Tania"
        },
        {
          id: 27,
          date: "April 17th 2022, 6:55:49",
          description: "rejected",
          address: "F4KjjnrM2hr8MasEDAYoGSBWbn3wzz1rrdGtkRkoaMKc",
          proposedBy: "Yansel"
        }
      ],
      programs: [
        {
          id: 24,
          name: "Program 24"
        },
        {
          id: 25,
          name: "Program 25"
        },
      ]
    },
    {
      id: 12,
      logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwilfd38506eysxniku8quh%3Ftype%3DLOGO&w=3840&q=75",
      title: "My awesome proposal",
      expires: "April 29th 2022, 6:05:49",
      approved: 2,
      rejected: 1,
      status: "active",
      needs: "2",
      description: "Suspendisse ornare massa lorem, vitae tempus ante imperdiet id. Duis nec mi augue. Donec non quam nibh. Praesent ornare lacus ligula, eu scelerisque odio elementum nec. In hac habitasse platea dictumst. Sed a libero arcu. Praesent finibus mollis efficitur.",
      proposedBy: "Yamel Amador",
      settings: {
        minColOff: "24 hours",
        singleSignerBalanceThreshold: "100"
      },
      instructions: [
        {
          id: 1,
          title: "Money Streaming Program v3: MSP",
          description: "Program: Money Streaming Program [MSPas...mkdk]",
          name: "One time payment",
          sender: "5tr9CDSgZRLYPGdcsm9PztaGSfJtX5CEmqDbEbvCTX3G",
          recipient: "3PdEyhrV3gaUj4ffwjKGXBLo42jF2CQCCBoXenwCRWff",
          amount: "18274.94 USDC"
        },
        {
          id: 2,
          title: "Memo Program v2: Memo",
          description: "Program: Memo Program v2: Memo [Memos...mkdk]",
          name: "One time payment",
          sender: "5tr9CDSgZRLYPGdcsm9PztaGSfJtX5CEmqDbEbvCTX3G",
          recipient: "3PdEyhrV3gaUj4ffwjKGXBLo42jF2CQCCBoXenwCRWff",
          amount: "18274.94 USDC"
        }
      ],
      activities: [
        {
          id: 28,
          date: "April 2th 2022, 6:55:49",
          description: "approved",
          address: "ARmgYJkSQfbSifkXc4h7MGDAALznW5FFSHVucJ6j3vd7",
          proposedBy: "Tania"
        },
        {
          id: 29,
          date: "April 7th 2022, 6:55:49",
          description: "rejected",
          address: "F4KjjnrM2hr8MasEDAYoGSBWbn3wzz1rrdGtkRkoaMKc",
          proposedBy: "Yansel"
        },
        {
          id: 30,
          date: "April 18th 2022, 6:55:49",
          description: "created",
          address: "HGb43H86jJNLN4MW1sDWKruUZYrs3rkNQkf3acF8uXiv",
          proposedBy: "Pavelsan"
        },
      ],
      programs: [
        {
          id: 26,
          name: "Program 26"
        },
        {
          id: 27,
          name: "Program 27"
        },
      ]
    },
    {
      id: 13,
      logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwh7gt29278eysxa7rb5sl8%3Ftype%3DLOGO&w=3840&q=75",
      title: "Transfer all the money to me",
      expires: "April 29th 2022, 6:05:49",
      approved: 2,
      rejected: 1,
      status: "passed",
      needs: "2",
      description: "Curabitur rhoncus tempor orci, et ornare eros faucibus vitae. Donec vitae eleifend orci. Vestibulum et ex ut ipsum semper ornare nec nec justo. Nunc vitae risus maximus, ornare orci a, tempus dui. Nulla in orci vitae augue dapibus volutpat vitae sed metus.",
      proposedBy: "Michel Triana",
      settings: {
        minColOff: "24 hours",
        singleSignerBalanceThreshold: "100"
      },
      instructions: [
        {
          id: 1,
          title: "Money Streaming Program v3: MSP",
          description: "Program: Money Streaming Program [MSPas...mkdk]",
          name: "One time payment",
          sender: "5tr9CDSgZRLYPGdcsm9PztaGSfJtX5CEmqDbEbvCTX3G",
          recipient: "3PdEyhrV3gaUj4ffwjKGXBLo42jF2CQCCBoXenwCRWff",
          amount: "18274.94 USDC"
        }
      ],
      activities: [
        {
          id: 31,
          date: "April 3th 2022, 6:55:49",
          description: "rejected",
          address: "F4KjjnrM2hr8MasEDAYoGSBWbn3wzz1rrdGtkRkoaMKc",
          proposedBy: "Yansel"
        },
        {
          id: 32,
          date: "April 4th 2022, 6:55:49",
          description: "created",
          address: "HGb43H86jJNLN4MW1sDWKruUZYrs3rkNQkf3acF8uXiv",
          proposedBy: "Pavelsan"
        },
      ],
      programs: [
        {
          id: 28,
          name: "Program 28"
        },
      ]
    },
    {
      id: 15,
      logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwh67t27981eysx2yzq2dq6%3Ftype%3DLOGO&w=3840&q=75",
      title: "Send $1m to Ukraine",
      expires: "April 29th 2022, 6:05:49",
      approved: 2,
      rejected: 1,
      status: "failed",
      needs: "2",
      description: "Aenean vel sapien imperdiet, consequat orci ac, luctus velit. Donec suscipit sapien eros, nec fringilla nulla viverra eget. Maecenas leo enim, faucibus quis nisl eget, mollis porttitor mauris. Sed est nulla, congue quis blandit sit amet, maximus eu tortor.",
      proposedBy: "Pavelsan MacKenzie",
      settings: {
        minColOff: "24 hours",
        singleSignerBalanceThreshold: "100"
      },
      instructions: [
        {
          id: 1,
          title: "Money Streaming Program v3: MSP",
          description: "Program: Money Streaming Program [MSPas...mkdk]",
          name: "One time payment",
          sender: "5tr9CDSgZRLYPGdcsm9PztaGSfJtX5CEmqDbEbvCTX3G",
          recipient: "3PdEyhrV3gaUj4ffwjKGXBLo42jF2CQCCBoXenwCRWff",
          amount: "18274.94 USDC"
        },
        {
          id: 2,
          title: "Memo Program v2: Memo",
          description: "Program: Memo Program v2: Memo [Memos...mkdk]",
          name: "One time payment",
          sender: "5tr9CDSgZRLYPGdcsm9PztaGSfJtX5CEmqDbEbvCTX3G",
          recipient: "3PdEyhrV3gaUj4ffwjKGXBLo42jF2CQCCBoXenwCRWff",
          amount: "18274.94 USDC"
        }
      ],
      activities: [
        {
          id: 33,
          date: "April 5th 2022, 6:55:49",
          description: "approved",
          address: "ARmgYJkSQfbSifkXc4h7MGDAALznW5FFSHVucJ6j3vd7",
          proposedBy: "Tania"
        },
        {
          id: 34,
          date: "April 13th 2022, 6:55:49",
          description: "rejected",
          address: "F4KjjnrM2hr8MasEDAYoGSBWbn3wzz1rrdGtkRkoaMKc",
          proposedBy: "Yansel"
        },
        {
          id: 35,
          date: "April 18th 2022, 6:55:49",
          description: "created",
          address: "HGb43H86jJNLN4MW1sDWKruUZYrs3rkNQkf3acF8uXiv",
          proposedBy: "Pavelsan"
        },
      ],
      programs: [
        {
          id: 29,
          name: "Program 29"
        },
        {
          id: 30,
          name: "Program 30"
        },
        {
          id: 31,
          name: "Program 31"
        },
      ]
    },
  ];

  const [isSafeDetails, setIsSafeDetails] = useState(false);
  const [isProgramDetails, setIsProgramDetails] = useState(false);
  const [proposalSelected, setProposalSelected] = useState<any>();
  const [programSelected, setProgramSelected] = useState<any>();

  const goToSafeDetailsHandler = (selectedProposal: any) => {
    setIsSafeDetails(true);
    setProposalSelected(selectedProposal);    
  }

  const goToProgramDetailsHandler = (selectedProgram: any) => {
    setIsSafeDetails(false);
    setIsProgramDetails(true);
    setProgramSelected(selectedProgram);
  }

  const returnFromSafeDetailsHandler = () => {
    setIsSafeDetails(false);
  }

  const returnFromProgramDetailsHandler = () => {
    setIsProgramDetails(false);
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
      {isLocal() && (
        <div className="debug-bar">
          <span className="ml-1">isBusy:</span><span className="ml-1 font-bold fg-dark-active">{isBusy ? 'true' : 'false'}</span>
          <span className="ml-1">haveMultisig:</span><span className="ml-1 font-bold fg-dark-active">{selectedMultisig ? 'true' : 'false'}</span>
          <span className="ml-1">multisigId:</span><span className="ml-1 font-bold fg-dark-active">{selectedMultisig ? `${selectedMultisig.id}` : '-'}</span>
        </div>
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
                <Tooltip placement="bottom" title={t('multisig.refresh-tooltip')}>
                  <div className={`transaction-stats user-address ${loadingMultisigAccounts ? 'click-disabled' : 'simplelink'}`}>
                    <Spin size="small" />
                    {!loadingMultisigAccounts && (
                      <span className="incoming-transactions-amout">({formatThousands(multisigAccounts.length)})</span>
                    )}
                    <span className="transaction-legend">
                      <span className="icon-button-container">
                        <Button
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
                  {connected && selectedMultisig ? (
                    <>
                      {(!isSafeDetails && !isProgramDetails) && (
                        selectedMultisig.version === 0 ? (
                          <SafeSerumInfoView
                            isSafeDetails={isSafeDetails}
                            isProgramDetails={isProgramDetails}
                            onDataToSafeView={goToSafeDetailsHandler}
                            onDataToProgramView={goToProgramDetailsHandler}
                            proposals={proposals}
                            selectedMultisig={selectedMultisig}
                            onEditMultisigClick={onEditMultisigClick}
                            onNewProposalMultisigClick={onNewProposalMultisigClick}
                            multisigVaults={multisigVaults}
                          />
                        ) : (
                          <SafeMeanInfo
                            isSafeDetails={isSafeDetails}
                            isProgramDetails={isProgramDetails}
                            onDataToSafeView={goToSafeDetailsHandler}
                            onDataToProgramView={goToProgramDetailsHandler}
                            proposals={proposals}
                            selectedMultisig={selectedMultisig}
                            onEditMultisigClick={onEditMultisigClick}
                            onNewProposalMultisigClick={onNewProposalMultisigClick}
                            multisigVaults={multisigVaults}
                          />
                        )
                      )}
                      {isSafeDetails && (
                        <SafeDetailsView
                          isSafeDetails={isSafeDetails}
                          onDataToSafeView={returnFromSafeDetailsHandler}
                          proposalSelected={proposalSelected}
                        />
                      )}
                      {isProgramDetails && (
                        <ProgramDetailsView
                          isProgramDetails={isProgramDetails}
                          onDataToProgramView={returnFromProgramDetailsHandler}
                          programSelected={programSelected}
                        />
                      )}
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
          appsProvider={appsProvider}
          solanaApps={solanaApps}
          handleOk={onAcceptCreateProposalModal}
        />
      )}

      <PreFooter />
    </>
  );

};
