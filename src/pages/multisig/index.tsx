import React, { useCallback, useContext, useMemo } from 'react';
import {
  LoadingOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  ConfirmOptions,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  MemcmpFilter,
  PublicKey,
  SystemProgram,
  Transaction
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

import { Button, Col, Divider, Dropdown, Empty, Menu, Row, Space, Spin, Switch, Tooltip } from 'antd';
import {
  copyText,
  consoleOut,
  getTransactionStatusForLogs,
  isLocal,
  isDev,
  getShortDate,
  isProd
} from '../../utils/ui';

import { SOLANA_EXPLORER_URI_INSPECT_TRANSACTION, VERBOSE_DATE_TIME_FORMAT } from '../../constants';

import { isDesktop } from "react-device-detect";
import useWindowSize from '../../hooks/useWindowResize';
import { OperationType, TransactionStatus } from '../../models/enums';
import { TransactionStatusContext } from '../../contexts/transaction-status';
import { IconCaretDown, IconClock, IconDocument, IconEdit, IconShieldOutline, IconTrash, IconUpdate, IconUserGroup, IconUsers, IconWallet } from '../../Icons';
import dateFormat from 'dateformat';
import { useNativeAccount } from '../../contexts/accounts';
import { MEAN_MULTISIG, NATIVE_SOL_MINT } from '../../utils/ids';
import { AccountLayout, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { useNavigate } from 'react-router-dom';
import {
  Multisig,
  MultisigV2,
  MultisigParticipant,
  MultisigTransaction,
  MultisigTransactionSummary,
  MultisigTransactionStatus,
  MEAN_MULTISIG_OPS,
  listMultisigTransactions,
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
import { BN, Program, Provider } from "@project-serum/anchor";
import MultisigIdl from "../../models/mean-multisig-idl";
import { MultisigOwnersView } from '../../components/MultisigOwnersView';
import { MultisigEditModal } from '../../components/MultisigEditModal';
import { MSP, Treasury } from '@mean-dao/msp';
import { customLogger } from '../..';
import { ProgramAccounts } from '../../utils/accounts';
import { getOperationName } from '../../utils/multisig-helpers';
import { openNotification } from '../../components/Notifications';
import { ProposalSummaryModal } from '../../components/ProposalSummaryModal';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const MultisigView = () => {
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
    clearTransactionStatusContext
  } = useContext(TransactionStatusContext);

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
  const [multisigAccounts, setMultisigAccounts] = useState<(MultisigV2 | Multisig)[]>([]);
  const [selectedMultisig, setSelectedMultisig] = useState<MultisigV2 | Multisig | undefined>(undefined);
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

  const connection = useMemo(() => new Connection(connectionConfig.endpoint, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true
  }), [
    connectionConfig.endpoint
  ]);

  const multisigClient = useMemo(() => {

    const opts: ConfirmOptions = {
      preflightCommitment: "confirmed",
      commitment: "confirmed",
    };

    const provider = new Provider(connection, wallet as any, opts);

    return new Program(
      MultisigIdl,
      MEAN_MULTISIG,
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
      let tokenAccount = AccountLayout.decode(t.account.data);
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

    getFees(multisigClient, MULTISIG_ACTIONS.createMultisig)
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

    clearTransactionStatusContext();
    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createMultisig = async (data: any) => {

      const multisig = Keypair.generate();
      const [, nonce] = await PublicKey.findProgramAddress(
        [multisig.publicKey.toBuffer()],
        multisigClient.programId
      );

      const owners = data.owners.map((p: MultisigParticipant) => {
        return {
          address: new PublicKey(p.address),
          name: p.name
        }
      });

      let tx = multisigClient.transaction.createMultisig(
        owners as any,
        new BN(data.threshold),
        nonce,
        data.label as any,
        {
          accounts: {
            proposer: publicKey as PublicKey,
            multisig: multisig.publicKey,
            multisigOpsAccount: MEAN_MULTISIG_OPS,
            systemProgram: SystemProgram.programId
          },
          signers: [wallet as any, multisig]
        }
      );

      tx.feePayer = publicKey;
      const { blockhash } = await connection.getRecentBlockhash("confirmed");
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
    multisigClient.programId,
    multisigClient.transaction,
    transactionStatus.currentOperation,
    clearTransactionStatusContext,
    startFetchTxSignatureInfo,
    resetTransactionStatus,
    setTransactionStatus,
    onMultisigCreated,
  ]);

  const isApprovingMultisigTx = useCallback((): boolean => {

    return (
      fetchTxInfoStatus === "fetching" && 
      lastSentTxOperationType === OperationType.ApproveTransaction
    );

  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  const isExecutingMultisigTx = useCallback((): boolean => {

    return (
      fetchTxInfoStatus === "fetching" && 
      lastSentTxOperationType === OperationType.ExecuteTransaction
    );

  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
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

  // Copy address to clipboard
  const copyAddressToClipboard = useCallback((address: any) => {

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

  const onEditMultisigClick = useCallback(() => {

    getFees(multisigClient, MULTISIG_ACTIONS.createTransaction)
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

    clearTransactionStatusContext();
    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const editMultisig = async (data: any) => {

      if (!selectedMultisig) {
        throw new Error("No selected multisig");
      }

      const [multisigSigner] = await PublicKey.findProgramAddress(
        [selectedMultisig.id.toBuffer()],
        multisigClient.programId
      );

      const owners = data.owners.map((p: MultisigParticipant) => {
        return {
          address: new PublicKey(p.address),
          name: p.name
        }
      });

      // Edit Multisig
      const ixData = multisigClient.coder.instruction.encode("edit_multisig", {
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

      const transaction = Keypair.generate();
      const txSize = 1200;
      const createIx = await multisigClient.account.transaction.createInstruction(
        transaction,
        txSize
      );

      const [txDetailAddress] = await PublicKey.findProgramAddress(
        [
          selectedMultisig.id.toBuffer(),
          transaction.publicKey.toBuffer()
        ],
        multisigClient.programId
      ); 

      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());
      
      let tx = multisigClient.transaction.createTransaction(
        multisigClient.programId, 
        ixAccounts as any,
        ixData as any,
        OperationType.EditMultisig,
        "Edit Safe",
        "",
        new BN(expirationTime),
        new BN(0),
        new BN(0),
        {
          accounts: {
            multisig: selectedMultisig.id,
            transaction: transaction.publicKey,
            transactionDetail: txDetailAddress,
            proposer: publicKey as PublicKey,
            multisigOpsAccount: MEAN_MULTISIG_OPS,
            systemProgram: SystemProgram.programId
          },
          preInstructions: [createIx],
          signers: [transaction, wallet as any],
        }
      );

      tx.feePayer = publicKey;
      const { blockhash } = await connection.getRecentBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.partialSign(...[transaction]);

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
          customLogger.logWarning('Edit multisig transaction failed', { transcript: transactionLog });
          return false;
        }

        return await editMultisig(data)
          .then(value => {
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
    multisigClient.programId,
    multisigClient.transaction,
    transactionStatus.currentOperation,
    multisigClient.account.transaction,
    multisigClient.coder.instruction,
    clearTransactionStatusContext,
    startFetchTxSignatureInfo,
    resetTransactionStatus,
    setTransactionStatus,
    onMultisigModified
  ]);

  const onAcceptEditMultisig = (data: any) => {
    consoleOut('multisig:', data, 'blue');
    onExecuteEditMultisigTx(data);
  };

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

    clearTransactionStatusContext();
    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const approveTx = async (data: any) => {

      if (!selectedMultisig || !publicKey) { return null; }

      const [txDetailAddress] = await PublicKey.findProgramAddress(
        [
          selectedMultisig.id.toBuffer(),
          data.transaction.id.toBuffer()
        ],
        multisigClient.programId
      ); 
  
      let tx = multisigClient.transaction.approve({
          accounts: {
            multisig: selectedMultisig.id,
            transaction: data.transaction.id,
            transactionDetail: txDetailAddress,
            owner: publicKey,
            systemProgram: SystemProgram.programId
          }
        }
      );
  
      tx.feePayer = publicKey;
      const { blockhash } = await connection.getRecentBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
  
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
    wallet, 
    selectedMultisig, 
    publicKey, 
    multisigClient.programId, 
    multisigClient.transaction, 
    connection, 
    nativeBalance, 
    transactionStatus.currentOperation, 
    transactionCancelled,
    clearTransactionStatusContext, 
    resetTransactionStatus,
    setTransactionStatus,
    startFetchTxSignatureInfo
  ]);

  const onExecuteFinishTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const finishTx = async (data: any) => {

      if (!data.transaction || !publicKey) { return null; }

      const [multisigSigner] = await PublicKey.findProgramAddress(
        [data.transaction.multisig.toBuffer()],
        multisigClient.programId
      );

      const [txDetailAddress] = await PublicKey.findProgramAddress(
        [
          data.transaction.multisig.toBuffer(),
          data.transaction.id.toBuffer()
        ],
        multisigClient.programId
      ); 

      let remainingAccounts = data.transaction.accounts
        // Change the signer status on the vendor signer since it's signed by the program, not the client.
        .map((meta: any) =>
          meta.pubkey.equals(multisigSigner)
            ? { ...meta, isSigner: false }
            : meta
        )
        .concat({
          pubkey: data.transaction.programId,
          isWritable: false,
          isSigner: false,
        });
        
      let tx = multisigClient.transaction.executeTransaction({
          accounts: {
            multisig: data.transaction.multisig,
            multisigSigner: multisigSigner,
            transaction: data.transaction.id,
            transactionDetail: txDetailAddress,
            payer: publicKey,
            systemProgram: SystemProgram.programId
          },
          remainingAccounts: remainingAccounts
        }
      );

      if (data.transaction.operation === OperationType.StreamCreate || 
        data.transaction.operation === OperationType.TreasuryStreamCreate) {

        remainingAccounts = data.transaction.accounts
          // Change the signer status on the vendor signer since it's signed by the program, not the client.
          .map((meta: any) =>
            !meta.pubkey.equals(publicKey)
              ? { ...meta, isSigner: false }
              : meta
          )
          .concat({
            pubkey: data.transaction.programId,
            isWritable: false,
            isSigner: false,
          });

        const streamPda = remainingAccounts[7].pubkey;
          
        tx = multisigClient.transaction.executeTransactionPda(
          new BN(data.transaction.pdaTimestamp),
          new BN(data.transaction.pdaBump),
          {
            accounts: {
              multisig: data.transaction.multisig,
              multisigSigner: multisigSigner,
              pdaAccount: streamPda,
              transaction: data.transaction.id,
              transactionDetail: txDetailAddress,
              payer: publicKey,
              systemProgram: SystemProgram.programId
            },
            remainingAccounts: remainingAccounts
          }
        );    
      }
  
      tx.feePayer = publicKey;
      const { blockhash } = await multisigClient.provider.connection.getRecentBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
  
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

      let result = await connection
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
            let treasury = data.transaction.operation === OperationType.StreamClose
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
    multisigClient.programId,
    multisigClient.transaction,
    multisigClient.provider.connection,
    transactionStatus.currentOperation,
    clearTransactionStatusContext,
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

    clearTransactionStatusContext();
    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const cancelTx = async (data: any) => {

      if (
        !publicKey || 
        !selectedMultisig || 
        !selectedMultisig.id || 
        selectedMultisig.id.toBase58() !== data.transaction.multisig.toBase58() || 
        data.transaction.proposer.toBase58() !== publicKey.toBase58() ||
        data.transaction.ownerSeqNumber === selectedMultisig.ownerSeqNumber ||
        data.transaction.executedOn
      ) {
        console.log('here');
        return null;
      }

      const [txDetailAddress] = await PublicKey.findProgramAddress(
        [
          selectedMultisig.id.toBuffer(),
          data.transaction.id.toBuffer()
        ],
        multisigClient.programId
      );
      
      let tx = multisigClient.transaction.cancelTransaction(
        {
          accounts: {
            multisig: selectedMultisig.id,
            transaction: data.transaction.id,
            transactionDetail: txDetailAddress,
            proposer: publicKey,
            systemProgram: SystemProgram.programId
          }
        }
      );

      tx.feePayer = publicKey;
      const { blockhash } = await connection.getRecentBlockhash("confirmed");
      tx.recentBlockhash = blockhash;

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

      let result = await connection
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
            let treasury = data.transaction.operation === OperationType.StreamClose
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
    multisigClient.transaction,
    multisigClient.programId,
    transactionStatus.currentOperation,
    clearTransactionStatusContext,
    startFetchTxSignatureInfo,
    resetTransactionStatus,
    setTransactionStatus,
    onTxExecuted,
  ]);

  const isMintingToken = useCallback((): boolean => {

    return ( 
      fetchTxInfoStatus === "fetching" && 
      lastSentTxOperationType === OperationType.MintTokens
    );

  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  const isSelectedMultisigV2 = useCallback((): boolean => {
    if (selectedMultisig && selectedMultisig.version && selectedMultisig.version === 2) {
      return true
    }
    return false;
  }, [selectedMultisig]);

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
      if (mtx.didSigned === true) {
        return t("multisig.multisig-transactions.signed");
      } else {
        return t("multisig.multisig-transactions.not-signed");
      }
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

  const isUserTheProposer = useCallback((): boolean => {
    if (!highlightedMultisigTx || !publicKey) { return false; }

    return  publicKey &&
            highlightedMultisigTx.proposer &&
            publicKey.equals(highlightedMultisigTx.proposer)
        ? true
        : false;

  }, [
    publicKey,
    highlightedMultisigTx
  ]);

  const isTreasuryOperation = useCallback(() => {

    if (!highlightedMultisigTx) { return false; }

    return  highlightedMultisigTx.operation === OperationType.TreasuryCreate ||
            highlightedMultisigTx.operation === OperationType.TreasuryClose ||
            highlightedMultisigTx.operation === OperationType.TreasuryAddFunds ||
            highlightedMultisigTx.operation === OperationType.TreasuryStreamCreate ||
            highlightedMultisigTx.operation === OperationType.TreasuryWithdraw ||
            highlightedMultisigTx.operation === OperationType.StreamCreate ||
            highlightedMultisigTx.operation === OperationType.StreamClose ||
            highlightedMultisigTx.operation === OperationType.StreamAddFunds
      ? true
      : false;

  },[highlightedMultisigTx])

  const canShowApproveButton = useCallback(() => {

    if (!highlightedMultisigTx) { return false; }

    let result = (
      highlightedMultisigTx.status === MultisigTransactionStatus.Pending &&
      !highlightedMultisigTx.didSigned
    );

    return result;

  },[highlightedMultisigTx])

  const canShowExecuteButton = useCallback(() => {

    if (!highlightedMultisigTx) { return false; }

    const isPendingForExecution = () => {
      return  highlightedMultisigTx.status === MultisigTransactionStatus.Approved &&
              !highlightedMultisigTx.executedOn
        ? true
        : false;
    }

    if (isPendingForExecution()) {
      if (!isTreasuryOperation() || (isUserTheProposer() && isTreasuryOperation)) {
        return true;
      } else {
        return false;
      }
    } else {
      return false;
    }

  },[
    highlightedMultisigTx,
    isTreasuryOperation,
    isUserTheProposer,
  ])

  const canShowCancelButton = useCallback(() => {

    if (!highlightedMultisigTx || !highlightedMultisigTx.proposer || !publicKey) { return false; }

    let result = (
      highlightedMultisigTx.proposer.toBase58() === publicKey.toBase58() &&
      highlightedMultisigTx.status === MultisigTransactionStatus.Voided
    );

    return result;

  },[
    publicKey, 
    highlightedMultisigTx
  ])

  const readAllMultisigAccounts = useCallback(async (wallet: PublicKey) => {

    let accounts: any[] = [];
    let multisigV2Accs = await multisigClient.account.multisigV2.all();
    let filteredAccs = multisigV2Accs.filter((a: any) => {
      if (a.account.owners.filter((o: any) => o.address.equals(wallet)).length) { return true; }
      return false;
    });

    accounts.push(...filteredAccs);
    let multisigAccs = await multisigClient.account.multisig.all();
    filteredAccs = multisigAccs.filter((a: any) => {
      if (a.account.owners.filter((o: PublicKey) => o.equals(wallet)).length) { return true; }
      return false;
    });

    accounts.push(...filteredAccs);

    return accounts;
    
  }, [
    multisigClient.account.multisig, 
    multisigClient.account.multisigV2
  ]);

  const parseMultisigV2Account = (info: any) => {
    return PublicKey
      .findProgramAddress([info.publicKey.toBuffer()], MEAN_MULTISIG)
      .then(k => {

        let address = k[0];
        let owners: MultisigParticipant[] = [];
        let labelBuffer = Buffer
          .alloc(info.account.label.length, info.account.label)
          .filter(function (elem, index) { return elem !== 0; }
        );

        let filteredOwners = info.account.owners.filter((o: any) => !o.address.equals(PublicKey.default));

        for (let i = 0; i < filteredOwners.length; i ++) {
          owners.push({
            address: filteredOwners[i].address.toBase58(),
            name: filteredOwners[i].name.length > 0 
              ? new TextDecoder().decode(
                  Buffer.from(
                    Uint8Array.of(
                      ...filteredOwners[i].name.filter((b: any) => b !== 0)
                    )
                  )
                )
              : ""
          } as MultisigParticipant);
        }

        return {
          id: info.publicKey,
          version: info.account.version,
          label: new TextDecoder().decode(labelBuffer),
          authority: address,
          nounce: info.account.nonce,
          ownerSeqNumber: info.account.ownerSetSeqno,
          threshold: info.account.threshold.toNumber(),
          pendingTxsAmount: info.account.pendingTxs.toNumber(),
          createdOnUtc: new Date(info.account.createdOn.toNumber() * 1000),
          owners: owners

        } as MultisigV2;
      })
      .catch(err => { 
        consoleOut('error', err, 'red');
        return undefined;
      });
  };

  const parseMultisiAccount = (info: any) => {
    return PublicKey
      .findProgramAddress([info.publicKey.toBuffer()], MEAN_MULTISIG)
      .then(k => {

        let address = k[0];
        let owners: MultisigParticipant[] = [];
        let labelBuffer = Buffer
          .alloc(info.account.label.length, info.account.label)
          .filter(function (elem, index) { return elem !== 0; }
        );

        for (let i = 0; i < info.account.owners.length; i ++) {
          owners.push({
            address: info.account.owners[i].toBase58(),
            name: info.account.ownersNames && info.account.ownersNames.length && info.account.ownersNames[i].length > 0 
              ? new TextDecoder().decode(
                  Buffer.from(
                    Uint8Array.of(
                      ...info.account.ownersNames[i].filter((b: any) => b !== 0)
                    )
                  )
                )
              : ""
          } as MultisigParticipant);
        }

        return {
          id: info.publicKey,
          version: 1,
          label: new TextDecoder().decode(labelBuffer),
          authority: address,
          nounce: info.account.nonce,
          ownerSeqNumber: info.account.ownerSetSeqno,
          threshold: info.account.threshold.toNumber(),
          pendingTxsAmount: info.account.pendingTxs.toNumber(),
          createdOnUtc: new Date(info.account.createdOn.toNumber() * 1000),
          owners: owners

        } as Multisig;
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
    let programs: ProgramAccounts[] = [];
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

  // Refresh the multisig accounts list
  useEffect(() => {

    if (!connection || !connected || !publicKey || !multisigClient || !loadingMultisigAccounts) {
      setLoadingMultisigAccounts(false);
      return;
    }

    const timeout = setTimeout(() => {

      consoleOut('=======================================', '', 'green');
      readAllMultisigAccounts(publicKey)
        .then((allInfo: any) => {
          let multisigInfoArray: (MultisigV2 | Multisig)[] = [];
          for (let info of allInfo) {
            let parsePromise: any;
            if (info.account.version && info.account.version === 2) {
              parsePromise = parseMultisigV2Account;
            } else {
              parsePromise = parseMultisiAccount;
            }
            if (parsePromise) {
              parsePromise(info)
                .then((multisig: any) =>{
                  if (multisig) {
                    multisigInfoArray.push(multisig);
                  }
                })
                .catch((err: any) => {
                  console.error(err);
                  setLoadingMultisigAccounts(false);
                });
            }
          }

          setTimeout(() => {
            multisigInfoArray.sort((a: any, b: any) => b.createdOnUtc.getTime() - a.createdOnUtc.getTime());
            setMultisigAccounts(multisigInfoArray);
            consoleOut('tralla:', multisigInfoArray, 'blue');
            let item: MultisigV2 | Multisig | undefined = undefined;
            if (multisigInfoArray.length > 0) {
              if (highLightableMultisigId) {
                // Select a multisig that was instructed to highlight when entering this feature
                item = multisigInfoArray.find(m => m.id.toBase58() === highLightableMultisigId);
              } else if (selectedMultisig) {
                // Or re-select the one active
                item = selectedMultisig.id ? multisigInfoArray.find(m => m.id.equals(selectedMultisig.id)) : undefined;
              } else {
                item = multisigInfoArray[0];
              }
              // Now make item active
              setSelectedMultisig(item);
              setNeedRefreshTxs(true);
            } else {
              setSelectedMultisig(undefined);
              setMultisigTxs([]);
            }
          });

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
    readAllMultisigAccounts,
  ]);

  // Subscribe to multisig account changes
  useEffect(() => {

    if (!connection || !connected || !selectedMultisig || !selectedMultisig.id) {
      return;
    }

    const timeout = setTimeout(() => {
      multisigClient.account.multisigV2
        .subscribe(selectedMultisig.id)
        .on("change", (account: any) => {

          let address: any;
          let labelBuffer = Buffer
            .alloc(account.label.length, account.label)
            .filter(function (elem, index) { return elem !== 0; }
          );

          let owners: MultisigParticipant[] = [];
          let filteredOwners = account.owners.filter((o: any) => !o.address.equals(PublicKey.default));

          for (let i = 0; i < filteredOwners.length; i ++) {
            owners.push({
              address: filteredOwners[i].address.toBase58(),
              name: filteredOwners[i].name.length > 0 
                ? new TextDecoder().decode(
                    Buffer.from(
                      Uint8Array.of(
                        ...filteredOwners[i].name.filter((b: any) => b !== 0)
                      )
                    )
                  )
                : ""
            } as MultisigParticipant);
          }

          PublicKey
            .findProgramAddress([selectedMultisig.id.toBuffer()], MEAN_MULTISIG)
            .then(k => {
              address = k[0];
              let multisigInfo = {
                // id: account.publicKey,
                id: selectedMultisig.id,
                version: account.version,
                label: new TextDecoder().decode(labelBuffer),
                authority: address,
                // nounce: account.nounce,
                nounce: selectedMultisig.nounce,
                ownerSeqNumber: account.ownerSetSeqno,
                threshold: account.threshold.toNumber(),
                pendingTxsAmount: new BN(account.pendingTxs || 0).toNumber(),
                createdOnUtc: new Date(account.createdOn.toNumber() * 1000),
                owners: owners

              } as MultisigV2;

              setSelectedMultisig(multisigInfo);
            });
          }
        );
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connected, 
    connection, 
    multisigClient, 
    selectedMultisig
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

      listMultisigTransactions(
        multisigClient,
        selectedMultisig,
        publicKey
      )
      .then((txs: MultisigTransaction[]) => {
        consoleOut('selected multisig txs', txs, 'blue');
        if (!isProd()) {
          const debugTable: any[] = [];
          txs.forEach(item => debugTable.push({
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
        clearTransactionStatusContext();
        setLoadingMultisigAccounts(true);
        sethHighlightedMultisigTx(undefined);
        setMultisigTransactionSummary(undefined);
      } else if (fetchTxInfoStatus === "error") {
        clearTransactionStatusContext();
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
    clearTransactionStatusContext
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

  const getTxInitiator = useCallback((mtx: MultisigTransaction): MultisigParticipant | undefined => {
    if (!selectedMultisig) { return undefined; }

    const owners: MultisigParticipant[] = (selectedMultisig as MultisigV2).owners;
    const initiator = owners && owners.length > 0
      ? owners.find(o => o.address === mtx.proposer?.toBase58())
      : undefined;

    return initiator;
  }, [selectedMultisig]);

  const isUserTxInitiator = useCallback(() => {
    if (!highlightedMultisigTx || !publicKey) { return false; }
    const initiator = getTxInitiator(highlightedMultisigTx);
    return initiator && publicKey.toBase58() === initiator.address ? true : false;
  }, [
    publicKey,
    highlightedMultisigTx,
    getTxInitiator,
  ]);

  const getTxSignedCount = useCallback((mtx: MultisigTransaction) => {
    if (mtx && mtx.signers) {
      return mtx.signers.filter((s: boolean) => s === true).length;
    }
    return 0;
  }, []);

  const isTxVoided = useCallback(() => {
    if (highlightedMultisigTx) {
      if (highlightedMultisigTx.status === MultisigTransactionStatus.Voided) {
        return true;
      }
    }
    return false;
  }, [highlightedMultisigTx]);

  const isTxPendingApproval = useCallback(() => {
    if (highlightedMultisigTx) {
      if (highlightedMultisigTx.status === MultisigTransactionStatus.Pending) {
        return true;
      }
    }
    return false;
  }, [highlightedMultisigTx]);

  const isTxPendingExecution = useCallback(() => {
    if (highlightedMultisigTx) {
      if (highlightedMultisigTx.status === MultisigTransactionStatus.Approved) {
        return true;
      }
    }
    return false;
  }, [highlightedMultisigTx]);

  const isTxRejected = useCallback(() => {
    if (highlightedMultisigTx) {
      if (highlightedMultisigTx.status === MultisigTransactionStatus.Rejected) {
        return true;
      }
    }
    return false;
  }, [highlightedMultisigTx]);

  const getTxUserStatusClass = useCallback((mtx: MultisigTransaction) => {

    if (mtx.executedOn) {
      return "";
    } else if (mtx.didSigned === undefined) {
      return "fg-red";
    } else if (mtx.didSigned === false) {
      return theme === 'light' ? "fg-light-orange" : "fg-warning";
    } else {
      return theme === 'light' ? "fg-green" : "fg-success"
    }

  },[theme]);

  const getTxApproveMainCtaLabel = useCallback(() => {

    const busyLabel = isTxPendingExecution()
      ? 'Executing transaction'
      : isTxPendingApproval()
        ? 'Approving transaction'
        : isTxVoided() 
          ? 'Cancelling Transaction' 
          : '';

    const iddleLabel = isTxPendingExecution()
      ? 'Execute transaction'
      : isTxPendingApproval()
        ? 'Approve transaction'
        : isTxVoided() 
          ? 'Cancel Transaction' 
          : '';

    return isBusy
      ? busyLabel
      : transactionStatus.currentOperation === TransactionStatus.Iddle
        ? iddleLabel
        : transactionStatus.currentOperation === TransactionStatus.TransactionFinished
          ? t('general.cta-finish')
          : t('general.refresh');
  }, [
    isBusy,
    transactionStatus.currentOperation,
    isTxPendingExecution,
    isTxPendingApproval,
    isTxVoided,
    t,
  ]);

  const isTxInProgress = useCallback((): boolean => {
    return isBusy || fetchTxInfoStatus === "fetching" ? true : false;
  }, [
    isBusy,
    fetchTxInfoStatus,
  ]);

  // Switch to hide voided transactions
  const switchHandler = () => {
    setSwitchValue(!switchValue);
  }

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
  
    let addressess: MultisigParticipant[] = [];
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

  const renderMultisigMeta = () => {
    return (
      <>
      {selectedMultisig && (
        <div className="stream-fields-container">

          {/* Multisig owners and creation date */}

          <div className="mb-3">
            <Row>
              <Col span={12}>
                <div className="transaction-detail-row">
                  <span className="info-label">
                    {t('multisig.multisig-account-detail.multisig-owners')}
                  </span>
                </div>
                <div className="transaction-detail-row">
                  <span className="info-icon">
                    <IconWallet className="mean-svg-icons" />
                  </span>
                  <div className="info-data flex-row wrap align-items-center">
                    {selectedMultisig.owners ? selectedMultisig.owners.length : 0}
                    <MultisigOwnersView label="view" className="ml-1" participants={selectedMultisig.owners || []} />
                  </div>
                </div>
              </Col>
              <Col span={12}>
                <div className="transaction-detail-row">
                  <span className="info-label">
                    {t('multisig.multisig-account-detail.created-on')}
                  </span>
                </div>
                <div className="transaction-detail-row">
                  <span className="info-icon">
                    <IconClock className="mean-svg-icons" />
                  </span>
                  <div className="info-data flex-row wrap align-items-center">
                    {dateFormat(selectedMultisig.createdOnUtc, VERBOSE_DATE_TIME_FORMAT)}
                  </div>
                </div>
              </Col>
            </Row>
          </div>
          <div className="mb-3">
            <Row>
              <Col span={12}>
                <div className="transaction-detail-row">
                  <span className="info-label">
                    {t('multisig.multisig-account-detail.required-signatures')}
                  </span>
                </div>
                <div className="transaction-detail-row">
                  <span className="info-icon">
                    <IconDocument className="mean-svg-icons" />
                  </span>
                  <div className="info-data flex-row wrap align-items-center">
                    {selectedMultisig.threshold}
                  </div>
                </div>
              </Col>
              <Col span={12}>
                <div className="transaction-detail-row">
                  <span className="info-label">
                    {t('multisig.multisig-account-detail.address')}
                  </span>
                </div>
                <div className="transaction-detail-row">
                  <span className="info-icon">
                    <IconShieldOutline className="mean-svg-icons" />
                  </span>
                  <div onClick={() => copyAddressToClipboard(selectedMultisig.authority)} 
                       className="info-data flex-row wrap align-items-center simplelink underline-on-hover"
                       style={{cursor: 'pointer', fontSize: '1.1rem'}}>
                    {shortenAddress(selectedMultisig.authority.toBase58(), 8)}
                  </div>
                </div>
              </Col>
            </Row>
          </div>
        </div>
      )}
      </>
    );
  };

  const dataOptionsMenu = (
    <Menu>
      {/* Create Account */}
      <Menu.Item
        key="40"
        disabled={true}
        onClick={() => {}}>
        <span className="menu-item-text">Create Account</span>
      </Menu.Item>
      {/* Update Account Data */}
      <Menu.Item
        key="41"
        disabled={true}
        onClick={() => {}}>
        <span className="menu-item-text">Update Account Data</span>
      </Menu.Item>
      <Menu.Divider key="42" />
      {/* Set Owner */}
      <Menu.Item
        key="43"
        disabled={true}
        onClick={() => {}}>
        <span className="menu-item-text">Set Account Owner</span>
      </Menu.Item>
    </Menu>
  );

  const renderCtaRow = () => {
    return (
      <>
        <Space size="middle" wrap>

          {/* Vaults */}
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            disabled={isTxInProgress() || loadingMultisigAccounts}
            onClick={() => {
              if (selectedMultisig) {
                const url = `/multisig-assets?multisig=${selectedMultisig.id.toBase58()}`;
                navigate(url);
              }
            }}>
            {multisigVaults && multisigVaults.length > 0 ? (
              <span>
                {t('multisig.multisig-account-detail.cta-assets', {
                  itemCount: multisigVaults.length
                })}
              </span>
              ) : (
              <span>
                {t('multisig.multisig-account-detail.cta-no-assets')}
              </span>
            )}
          </Button>

          {/* Treasuries */}
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            disabled={isTxInProgress() || loadingMultisigAccounts}
            onClick={() => {
              if (selectedMultisig) {
                const url = `/treasuries?multisig=${selectedMultisig.id.toBase58()}`;
                navigate(url);
              }
            }}>
            {multisigTreasuries && multisigTreasuries.length > 0 ? (
              <span>
                {t('multisig.multisig-account-detail.cta-treasuries', {
                  itemCount: multisigTreasuries.length
                })}
              </span>
              ) : (
              <span>
                {t('multisig.multisig-account-detail.cta-no-treasuries')}
              </span>
            )}
          </Button>

          {/* Programs */}
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            disabled={isTxInProgress() || loadingMultisigAccounts}
            onClick={() => {
              if (selectedMultisig) {
                const url = `/multisig-programs?multisig=${selectedMultisig.id.toBase58()}`;
                navigate(url);
              }
            }}>
            {programs && programs.length > 0 ? (
              <span>
                {t('multisig.multisig-account-detail.cta-programs', {
                  itemCount: programs.length
                })}
              </span>
              ) : (
              <span>
                {t('multisig.multisig-account-detail.cta-no-programs')}
              </span>
            )}
          </Button>

          {/* Mints */}
          {isUnderDevelopment() && (
            <Button
              type="default"
              shape="round"
              size="small"
              className="thin-stroke"
              disabled={isTxInProgress() || loadingMultisigAccounts}
              onClick={() => {
                if (selectedMultisig) {
                  const url = `/multisig-mints?multisig=${selectedMultisig.id.toBase58()}`;
                  navigate(url);
                }
              }}>
              <span>
                {t('multisig.multisig-account-detail.cta-no-mints')}
              </span>
              {/* {multisigMints && multisigMints.length > 0 ? (
                <span>
                  {t('multisig.multisig-account-detail.cta-mints', {
                    itemCount: multisigMints.length
                  })}
                </span>
                ) : (
                <span>
                  {t('multisig.multisig-account-detail.cta-no-mints')}
                </span>
              )} */}
            </Button>
          )}

          {/* Data */}
          {isUnderDevelopment() && (
            <Dropdown overlay={dataOptionsMenu} trigger={["click"]}>
              <Button
                type="default"
                size="middle"
                className="dropdown-like-button"
                disabled={isTxInProgress() || loadingMultisigAccounts}
                onClick={() => {}}>
                <span className="mr-2">Data</span>
                <IconCaretDown className="mean-svg-icons" />
              </Button>
            </Dropdown>
          )}

          {/* Operation indication */}
          {isApprovingMultisigTx() ? (
            <div className="flex-row flex-center">
              <LoadingOutlined />
              <span className="ml-1">{t('multisig.multisig-account-detail.multisig-tx-approve-busy')}</span>
            </div>
          ) : isExecutingMultisigTx() ? (
            <div className="flex-row flex-center">
              <LoadingOutlined />
              <span className="ml-1">{t('multisig.multisig-account-detail.multisig-tx-execute-busy')}</span>
            </div>
          ) : isMintingToken() ? (
            <div className="flex-row flex-center">
              <LoadingOutlined />
              <span className="ml-1">{t('multisig.multisig-account-detail.cta-mint-busy')}</span>
            </div>
          ) : null}
        </Space>
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
              <Identicon address={item.id} style={{ width: "30", height: "30", display: "inline-flex" }} />
            </div>
            <div className="description-cell">
              {item.label ? (
                <div className="title text-truncate">{item.label}</div>
              ) : (
                <div className="title text-truncate">{shortenAddress(item.id.toBase58(), 8)}</div>
              )}
              {
                <div className="subtitle text-truncate">{shortenAddress(item.id.toBase58(), 8)}</div>
              }
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
                <span className="title">{t('multisig.screen-title')}</span>
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
                <div className="bottom-ctas">
                  <div className="create-stream">
                    <Button
                      block
                      type="primary"
                      shape="round"
                      disabled={!connected}
                      onClick={onCreateMultisigClick}>
                      {connected
                        ? t('multisig.create-new-multisig-account-cta')
                        : t('transactions.validation.not-connected')
                      }
                    </Button>
                  </div>
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
                {connected && selectedMultisig ? (
                  <>
                    {/* Top action icons */}
                    <div className="float-top-right">
                      <span className="icon-button-container secondary-button">
                        {isSelectedMultisigV2() && (
                          <>
                            <Tooltip placement="bottom" title={t('multisig.crud-multisig.edit-multisig')}>
                              <Button
                                type="default"
                                shape="circle"
                                size="middle"
                                icon={<IconEdit className="mean-svg-icons" style={{padding: "2px 0 0"}} />}
                                onClick={() => onEditMultisigClick()}
                                disabled={isTxInProgress()}
                              />
                            </Tooltip>
                            {isUnderDevelopment() && (
                              <Tooltip placement="bottom" title={t('multisig.crud-multisig.delete-multisig')}>
                                <Button
                                  type="default"
                                  shape="circle"
                                  size="middle"
                                  icon={<IconTrash className="mean-svg-icons" />}
                                  onClick={() => {}}
                                  disabled={isTxInProgress()}
                                />
                              </Tooltip>
                            )}
                          </>
                        )}
                        {!isSelectedMultisigV2() && (
                          <Tooltip placement="bottom" title={t('multisig.crud-multisig.update-multisig')}>
                            <Button
                              type="default"
                              shape="circle"
                              size="middle"
                              icon={<IconUpdate className="mean-svg-icons" />}
                              onClick={() => {}}
                              disabled={true}
                            />
                          </Tooltip>
                        )}
                      </span>
                    </div>

                    {/* Details area */}
                    <div className="stream-details-data-wrapper vertical-scroll">

                      <Spin spinning={loadingMultisigAccounts || loadingMultisigTxs}>
                        {selectedMultisig && (
                          <>
                            {renderMultisigMeta()}
                            <Divider className="activity-divider" plain></Divider>
                            {isSelectedMultisigV2() && renderCtaRow()}
                            {isSelectedMultisigV2() && (
                              <Divider className="activity-divider" plain></Divider>
                            )}
                            {renderMultisigPendingTxs()}
                          </>
                        )}
                      </Spin>

                      {(!loadingMultisigAccounts && !loadingMultisigTxs) && (
                        <>
                        {(!multisigAccounts || multisigAccounts.length === 0) && !selectedMultisig && (
                          <div className="h-100 flex-center">
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{t('multisig.multisig-account-detail.no-multisig-loaded')}</p>} />
                          </div>
                        )}
                        </>
                      )}
                    </div>


                    {/* Switch handle */}
                    {isUnderDevelopment() && (
                      (parseFloat(multisigTxsToHide) > 0) && (
                        <div className="stream-share-ctas switch-handle">
                          <Switch size="small" checked={switchValue} onClick={() => switchHandler()} />
                          <span className="ml-1 simplelink" onClick={() => switchHandler()}>
                            {t("multisig.multisig-transactions.tx-switch-hide-btn")}
                          </span>
                        </div>
                      )
                    )}

                    {/* Copy address CTA */}
                    {/* <div className="stream-share-ctas">
                      {selectedMultisig && (
                        <>
                          <span
                            className="copy-cta"
                            onClick={() => copyAddressToClipboard(selectedMultisig.id)}>
                              {`${t('multisig.multisig-account-detail.copy-id-title')}: ${selectedMultisig.id}`}
                          </span>
                          <a
                            className="explorer-cta"
                            target="_blank"
                            rel="noopener noreferrer"
                            href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${selectedMultisig.id}${getSolanaExplorerClusterParam()}`}>
                            <IconExternalLink className="mean-svg-icons" />
                          </a>
                        </>
                      )}
                    </div> */}
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

      <PreFooter />
    </>
  );

};
