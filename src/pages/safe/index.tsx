import { useCallback, useContext, useMemo } from 'react';
import {
  LoadingOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  Account,
  ConfirmOptions,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Signer,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
  TransactionInstructionCtorFields
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
  isDev
} from '../../utils/ui';

import { NO_FEES, SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from '../../constants';

import { isDesktop } from "react-device-detect";
import useWindowSize from '../../hooks/useWindowResize';
import { OperationType, TransactionStatus } from '../../models/enums';
import { TxConfirmationContext } from '../../contexts/transaction-status';
import { IconEllipsisVertical, IconSafe, IconUserGroup, IconUsers } from '../../Icons';
import { useNativeAccount } from '../../contexts/accounts';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { AccountLayout, ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
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
  DEFAULT_EXPIRATION_TIME_SECONDS,
  MultisigVault,
  parseSerializedTx,
  getMultisigInstructionSummary
} from '../../models/multisig';
import { MultisigCreateModal } from '../../components/MultisigCreateModal';
import './style.scss';

// MULTISIG
import { AnchorProvider, BN, Idl, Program } from "@project-serum/anchor";
import { MultisigEditModal } from '../../components/MultisigEditModal';
import { MSP, TransactionFees } from '@mean-dao/msp';
import { customLogger } from '../..';
import { openNotification } from '../../components/Notifications';
import { ProposalSummaryModal } from '../../components/ProposalSummaryModal';
import { SafeMeanInfo } from './components/SafeMeanInfo';
import { SafeDetailsView } from './components/SafeDetails';
import { MultisigProposalModal } from '../../components/MultisigProposalModal';
import { ProgramDetailsView } from './components/ProgramDetails';
import SerumIDL from '../../models/serum-multisig-idl';
import { AppsProvider, NETWORK, App, UiInstruction, AppConfig, UiElement, Arg } from '@mean-dao/mean-multisig-apps';
import { SafeSerumInfoView } from './components/SafeSerumInfo';
import { MeanMultisig, MEAN_MULTISIG_PROGRAM, MultisigInfo, parseMultisigTransaction } from '@mean-dao/mean-multisig-sdk';
import { MethodsBuilder } from '@project-serum/anchor/dist/cjs/program/namespace/methods';
import { AssetDetailsView } from './components/AssetDetails';
import { ACCOUNT_LAYOUT } from '../../utils/layouts';
import { MultisigCreateAssetModal } from '../../components/MultisigCreateAssetModal';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const SafeView = () => {
  const connectionConfig = useConnectionConfig();
  const { publicKey, connected, wallet } = useWallet();
  const {
    isWhitelisted,
    detailsPanelOpen,
    transactionStatus,
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
  const [transactionAssetFees, setTransactionAssetFees] = useState<TransactionFees>(NO_FEES);
  // Multisig accounts
  const [loadingMultisigAccounts, setLoadingMultisigAccounts] = useState(true);
  const [multisigAccounts, setMultisigAccounts] = useState<MultisigInfo[]>([]);
  const [selectedMultisig, setSelectedMultisig] = useState<MultisigInfo | undefined>(undefined);
  // Pending Txs
  const [needRefreshTxs, setNeedRefreshTxs] = useState(true);
  const [highlightedMultisigTx, sethHighlightedMultisigTx] = useState<MultisigTransaction | undefined>();
  const [multisigTransactionSummary, setMultisigTransactionSummary] = useState<MultisigTransactionSummary | undefined>(undefined);
  // Vaults
  const [multisigVaults, setMultisigVaults] = useState<MultisigVault[]>([]);
  // Tx control
  const [isBusy, setIsBusy] = useState(false);
  const [transactionCancelled, setTransactionCancelled] = useState(false);

  // Modal visibility flags
  const [isCreateMultisigModalVisible, setIsCreateMultisigModalVisible] = useState(false);
  const [isEditMultisigModalVisible, setIsEditMultisigModalVisible] = useState(false);
  // Other
  const [minRequiredBalance, setMinRequiredBalance] = useState(0);
  const [appsProvider, setAppsProvider] = useState<AppsProvider>();
  const [solanaApps, setSolanaApps] = useState<App[]>([]);
  const [serumAccounts, setSerumAccounts] = useState<MultisigInfo[]>([]);
  const [serumMultisigTxs, setSerumMultisigTxs] = useState<MultisigTransaction[]>([]);

  const [isSafeDetails, setIsSafeDetails] = useState(false);
  const [proposalSelected, setProposalSelected] = useState<MultisigTransaction | undefined>();
  const [isProgramDetails, setIsProgramDetails] = useState(false);
  const [programSelected, setProgramSelected] = useState<any>();
  const [isAssetDetails, setIsAssetDetails] = useState(false);
  const [assetSelected, setAssetSelected] = useState<any>();
  const [selectedTab, setSelectedTab] = useState<number>();
  
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

  const onAssetCreated = useCallback(() => {
    resetTransactionStatus();
    openNotification({
      description: t('multisig.create-asset.success-message'),
      type: "success"
    });
  },[
    t,
    resetTransactionStatus
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
      const { blockhash } = await connection.getRecentBlockhash("confirmed");
      tx.recentBlockhash = blockhash;

      if (signers.length) {
        tx.partialSign(...signers);
      }

      return tx;
    };

    const createTx = async (): Promise<boolean> => {

      if (publicKey && data) {
        consoleOut("Start transaction for create asset", '', 'blue');
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
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            onAssetCreated();
            setIsCreateAssetModalVisible(false);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    clearTxConfirmationContext, 
    resetTransactionStatus, 
    wallet, 
    connection, 
    selectedMultisig, 
    publicKey, 
    setTransactionStatus, 
    transactionAssetFees.blockchainFee, 
    transactionAssetFees.mspFlatFee, 
    nativeBalance, 
    transactionStatus.currentOperation, 
    transactionCancelled, 
    startFetchTxSignatureInfo, 
    onAssetCreated
  ]);

  const onAcceptCreateVault = useCallback((params: any) => {
    onExecuteCreateAssetTx(params);
  },[
    onExecuteCreateAssetTx
  ]);

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

  const onTxProposalCreated = useCallback(() => {
    setMultisigProposalModalVisible(false);
    resetTransactionStatus();
    openNotification({
      description: t('notifications.tx-proposal-created'),
      type: "success"
    });
  },[
    t,
    resetTransactionStatus
  ])

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

      let proposalIx: TransactionInstruction | null = null;

      // // TEST

      // const testSysTransfer = new Transaction().add(
      //   SystemProgram.transfer({
      //     fromPubkey: publicKey,
      //     toPubkey: publicKey,
      //     lamports: 100_000_000
      //   })
      // );

      // const testUiIx = {
      //   id: await PublicKey.findProgramAddress([
      //     SystemProgram.programId.toBuffer(), 
      //     Buffer.from("custom_proposal")
      //   ], MEAN_MULTISIG_PROGRAM),
      //   name: "custom_proposal",
      //   help: "",
      //   label: "Custom Transaction Proposal",
      //   uiElements: [
      //     {
      //       name: "custom_tx_proposal",
      //       help: "",
      //       label: "Custom Transaction Proposal",
      //       value: txBase64,
      //       type: "inputTextArea",
      //       visibility: "show",
      //       dataElement: undefined
  
      //     } as UiElement
      //   ]
      // };

      // //

      if (data.appId === MEAN_MULTISIG_PROGRAM.toBase58()) {
        const tx = await parseSerializedTx(connection, data.instruction.uiElements[0].value);
        if (!tx) { return null; }
        proposalIx = tx?.instructions[0];
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

      // console.log('proposal program ID', proposalIx.programId.toBase58());
      // console.log('proposal account metas', proposalIx.keys.map(k => k.pubkey.toBase58()));
      // console.log('proposal data', proposalIx.data);
      
      // const coder = new BorshInstructionCoder(data.config.definition as Idl);
      // const decodedIx = coder.decode(proposalIx.data, "base58");
      // console.log('proposal data', decodedIx);
      // if (!decodedIx) { return null; }
      // const propData = {
      //   tag: data.config.uiInstructions.indexOf((uiIx: any) => decodedIx && uiIx.name === decodedIx.name),
      //   amount: (decodedIx.data as any).value
      // }

      // if (!decodedIx) { return null; }

      // const ixTag = data.config.definition.instructions.indexOf((uiIx: any) => uiIx.name === decodedIx.name) as number;
      // const tagBuffer = Buffer.from(Uint8Array.of(...[ixTag]));
      // const bytesBufffer = Object.entries(decodedIx.data).map((o: any) => Buffer.from(o['key']))
      // const dataBuffer = [...[tagBuffer], ...bytesBufffer];
      // console.log('data buffer', dataBuffer);
      
      const expirationTimeInSeconds = Date.now() / 1_000 + data.expires;
      const expirationDate = data.expires === 0 ? undefined : new Date(expirationTimeInSeconds * 1_000);
      const tx = await multisigClient.createTransaction(
        publicKey,
        data.title,
        data.description,
        expirationDate,
        0,
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
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.EditMultisig);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            onTxProposalCreated();
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
    createProposalIx, 
    setTransactionStatus, 
    nativeBalance, 
    transactionFees.networkFee, 
    transactionFees.rentExempt, 
    transactionFees.multisigFee, 
    transactionStatus.currentOperation, 
    connection, 
    transactionCancelled, 
    startFetchTxSignatureInfo, 
    onTxProposalCreated
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
        } else { 
          setIsBusy(false);
          onExecuteApproveTxCancelled();
        }
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
    wallet,
    onExecuteApproveTxCancelled
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
        } else { 
          setIsBusy(false);
          onExecuteFinishTxCancelled();
        }
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
    onTxExecuted,
    onExecuteFinishTxCancelled
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

  //
  useEffect(() => {

    if (
      !connection || 
      !publicKey || 
      !multisigClient || 
      !selectedMultisig || 
      !proposalSelected || 
      !loadingMultisigAccounts
    ) {
      return;
    }

    const timeout = setTimeout(() => {
      multisigClient.getMultisigTransaction(
        selectedMultisig.id,
        proposalSelected.id,
        publicKey
      )
      .then((tx: any) => setProposalSelected(tx))
      .catch(err => console.error(err));
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connection, 
    multisigClient, 
    proposalSelected, 
    publicKey, 
    selectedMultisig,
    loadingMultisigAccounts
  ]);

  // Refresh the multisig accounts list
  useEffect(() => {

    if (!connection || !publicKey || !multisigClient || !loadingMultisigAccounts) {
      return;
    }

    // TESTTT
    // const txBase64 = "Au5cyRspuXCowCT/+ilRl3IFM0+zyDg+xNoeX/il97L14rz25oRnV3TZQwiS7FQT/1dYpvdgFysdPXt1hPp/hgMJED7e2nTO7mtM1glLdyMvIyXdS4FzvlRPENhkAHwk105UAarPcuViKIttmW9r0PoYDLazcLLDq+jmAcPm6JEBAgACB9Ddi5QinaLbOwGnnixxndnvOnhxKxEs0bv2shUrFl9vFE2R6SqfHaa9rkiof+5OWJ5+S5iWxCt7rPaXW647aNokbiY9zPQJhwiSbzvZD7xSMWUNO9Oe25oftdQtY06VjmURFoGn/CqhuB3Rl7o7VEj72j+1YLmIB4AYam9IPfJziAle07Jj8d3CiaatZ+fwwumiiGwRm+uxuHj6UyK5/TwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAANOhD6HP8Q/RVRbUn2Jvbitb2UnXaECZYigdvUqYSEi2gsVgZtO0GJyyQVtYG63AUEsOvlWqRh6zCq+eHtfr86ACBQIAATQAAAAAAAmNAAAAAACwBAAAAAAAANOhD6HP8Q/RVRbUn2Jvbitb2UnXaECZYigdvUqYSEi2BgYEAQMAAgWPAuPBNe83fnBp06EPoc/xD9FVFtSfYm9uK1vZSddoQJliKB29SphISLYCAAAAiAle07Jj8d3CiaatZ+fwwumiiGwRm+uxuHj6UyK5/TwAAZL8UfGDFvpMfNzng0XWzTDIXl3cdVU9LM9MeLJqt2UFAQB4AAAA/2X4c8ZfIvcCAAAA0N2LlCKdots7AaeeLHGd2e86eHErESzRu/ayFSsWX28GAAAAWWFuc2VseELOLC0rIwNPS2wK2QPcKcaiKdzI7aAqCQktQSBg/l4HAAAAT3duZXIgMgIAAAAAAAAACwAAAE1TIE1heSAjMS4yHwkAAABFZGl0IFNhZmUAAAAATOmPYgAAAAAAAAAAAAAAAAA=";
    // parseSerializedTx(connection, txBase64)
    //   .then(tx => {
    //     if (tx) {
    //       const ix = {
    //         programId: tx.instructions[1].programId,
    //         keys: tx.instructions[1].keys,
    //         data: tx.instructions[1].data
    //       } as TransactionInstruction;
    //       console.log('ix', ix);
    //       const summary = getMultisigInstructionSummary(ix);
    //       console.log('ix summary', summary);
    //     }
    //   });

    //

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
          } else {
            setSelectedMultisig(undefined);
            // setMultisigTxs([]);
          }    
        })
        .catch((err: any) => {
          console.error(err);
          // setMultisigTxs([]);
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
    loadingMultisigAccounts
    // serumAccounts
  ]);

  // Load/Unload multisig on wallet connect/disconnect
  useEffect(() => {
    if (previousWalletConnectState !== connected) {
      if (!previousWalletConnectState && connected && publicKey) {
        consoleOut('User is connecting...', publicKey.toBase58(), 'green');
        setLoadingMultisigAccounts(true);
        // setLoadingPrograms(true);
        // setNeedRefreshTxs(true);
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
    setHighLightableMultisigId
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



  // END MULTISIG

  // Keep account balance updated
  useEffect(() => {

    if (!account) { return; }

    const timeout = setTimeout(() => {

      const getAccountBalance = (): number => {
        return (account.lamports || 0) / LAMPORTS_PER_SOL;
      }

      // Refresh token balance
      refreshTokenBalance();
      setNativeBalance(getAccountBalance());
      // Update previous balance
      setPreviousBalance(account.lamports);
    });

    return () => {
      clearTimeout(timeout);
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

  // Scroll to a given multisig is specified as highLightableMultisigId
  useEffect(() => {

    if (loadingMultisigAccounts || multisigAccounts.length === 0 || !highLightableMultisigId || !selectedMultisig) {
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

  const renderMultisigList = (
    <>
      {multisigAccounts.length ? (
        multisigAccounts.map((item, index) => {
          const onMultisigClick = (ev: any) => {
            consoleOut('=======================================', '', 'green');
            consoleOut('selected multisig:', item, 'blue');
            setDtailsPanelOpen(true);
            setSelectedMultisig(item);
            setNeedRefreshTxs(true);
            setIsSafeDetails(false);
            setIsProgramDetails(false);
            setIsAssetDetails(false);
          };

          return (
            <div 
              key={`${index + 50}`}
              id={item.id.toBase58()}
              onClick={onMultisigClick}
              className={
                `transaction-list-row transparent-left-border ${
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

  // useEffect(() => {

  //   if (
  //     !connection || 
  //     !publicKey || 
  //     !multisigClient || 
  //     !selectedMultisig
  //   ) { 
  //     return;
  //   }

  //   const timeout = setTimeout(() => {

  //     console.log("AQUIII");

  //     multisigClient
  //       .getMultisigTransactions(selectedMultisig.id, publicKey)
  //       .then((txs: any[]) => {
  //         if (proposalSelected) {
  //           const selected = txs.filter(tx => tx.id.equals(proposalSelected.id))[0];
  //           setProposalSelected(selected);
  //         }
  //       })
  //       .catch((err: any) => {
  //         console.error("Error fetching all transactions", err);
  //       });
  //   });

  //   return () => {
  //     clearTimeout(timeout);
  //   }

  // }, [
  //   publicKey, 
  //   connection, 
  //   multisigClient, 
  //   selectedMultisig, 
  //   proposalSelected
  // ]);

  const goToSafeDetailsHandler = (selectedProposal: any) => {    
    setIsSafeDetails(true);
    setIsProgramDetails(false);
    setIsAssetDetails(false);
    setProposalSelected(selectedProposal);
  }

  const goToAssetDetailsHandler = (selectedAsset: any) => {
    setIsSafeDetails(false);
    setIsProgramDetails(false);
    setIsAssetDetails(true);
    setAssetSelected(selectedAsset);
  }

  const goToProgramDetailsHandler = (selectedProgram: any) => {
    setIsSafeDetails(false);
    setIsAssetDetails(false);
    setIsProgramDetails(true);
    setProgramSelected(selectedProgram);
  }

  const returnFromSafeDetailsHandler = () => {
    setIsSafeDetails(false);
    setSelectedTab(0);
  }

  const returnFromAssetDetailsHandler = () => {
    setIsAssetDetails(false);
    setSelectedTab(1);
  }

  const returnFromProgramDetailsHandler = () => {
    setIsProgramDetails(false);
    setSelectedTab(2);
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
                        {(!isSafeDetails && !isProgramDetails && !isAssetDetails) && (
                          selectedMultisig.version === 0 ? (
                            <SafeSerumInfoView
                              connection={connection}
                              isSafeDetails={isSafeDetails}
                              isProgramDetails={isProgramDetails}
                              isAssetDetails={isAssetDetails}
                              onDataToSafeView={goToSafeDetailsHandler}
                              onDataToProgramView={goToProgramDetailsHandler}
                              onDataToAssetView={goToAssetDetailsHandler}
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
                              isSafeDetails={isSafeDetails}
                              isProgramDetails={isProgramDetails}
                              isAssetDetails={isAssetDetails}
                              onDataToSafeView={goToSafeDetailsHandler}
                              onDataToProgramView={goToProgramDetailsHandler}
                              onDataToAssetView={goToAssetDetailsHandler}
                              selectedMultisig={selectedMultisig}
                              onEditMultisigClick={onEditMultisigClick}
                              onNewCreateAssetClick={onShowCreateAssetModal}
                              onNewProposalMultisigClick={onNewProposalMultisigClick}
                              multisigClient={multisigClient}
                              selectedTab={selectedTab}
                              proposalSelected={proposalSelected}
                            />
                          )
                        )}
                        {isSafeDetails && (
                          <SafeDetailsView
                            isSafeDetails={isSafeDetails}
                            onDataToSafeView={returnFromSafeDetailsHandler}
                            proposalSelected={proposalSelected}
                            selectedMultisig={selectedMultisig}
                            onProposalApprove={onExecuteApproveTx}
                            onProposalExecute={onExecuteFinishTx}
                          />
                        )}
                        {isProgramDetails && (
                          <ProgramDetailsView
                            isProgramDetails={isProgramDetails}
                            onDataToProgramView={returnFromProgramDetailsHandler}
                            programSelected={programSelected}
                            selectedMultisig={selectedMultisig}
                          />
                        )}
                        {isAssetDetails && (
                          <AssetDetailsView
                            isAssetDetails={isAssetDetails}
                            onDataToAssetView={returnFromAssetDetailsHandler}
                            assetSelected={assetSelected}
                            selectedMultisig={selectedMultisig}
                            multisigVaults={multisigVaults}
                          />
                        )}
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
          solanaApps={solanaApps}
          handleOk={onAcceptCreateProposalModal}
          selectedMultisig={selectedMultisig}
        />
      )}

      <MultisigCreateAssetModal
        handleOk={onAcceptCreateVault}
        handleClose={() => setIsCreateAssetModalVisible(false)}
        isVisible={isCreateAssetModalVisible}
        nativeBalance={nativeBalance}
        transactionFees={transactionAssetFees}
        isBusy={isBusy}
      />

      <PreFooter />
    </>
  );

};
