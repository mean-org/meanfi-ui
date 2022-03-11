import React, { useCallback, useContext, useMemo } from 'react';
import {
  CheckOutlined,
  CopyOutlined,
  InfoCircleOutlined,
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
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
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

import { Button, Col, Divider, Dropdown, Empty, Menu, Modal, Row, Space, Spin, Tooltip } from 'antd';
import {
  copyText,
  consoleOut,
  getTransactionStatusForLogs,
  getTransactionOperationDescription,
  delay,
  isLocal,
  isDev,
  getReadableDate,
  getShortDate,
  isProd
} from '../../utils/ui';

import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS, VERBOSE_DATE_TIME_FORMAT } from '../../constants';

import { isDesktop } from "react-device-detect";
import useWindowSize from '../../hooks/useWindowResize';
import { OperationType, TransactionStatus } from '../../models/enums';
import { TransactionStatusContext } from '../../contexts/transaction-status';
import { notify } from '../../utils/notifications';
import { IconCaretDown, IconClock, IconDocument, IconEdit, IconExternalLink, IconShieldOutline, IconTrash, IconUpdate, IconUserGroup, IconUsers, IconWallet } from '../../Icons';
import { TransactionFees } from '@mean-dao/money-streaming/lib/types';
import dateFormat from 'dateformat';
import { useNativeAccount } from '../../contexts/accounts';
import { MEAN_MULTISIG, NATIVE_SOL_MINT } from '../../utils/ids';
import { AccountLayout, MintLayout, TOKEN_PROGRAM_ID, u64 } from '@solana/spl-token';
import { useNavigate } from 'react-router-dom';
import { Multisig, MultisigV2, MultisigParticipant, MultisigTransaction, MultisigTransactionStatus, MultisigMint } from '../../models/multisig';
import { MultisigCreateModal } from '../../components/MultisigCreateModal';
import './style.less';

// MULTISIG
import { BN, Program, Provider } from "@project-serum/anchor";
import MultisigIdl from "../../models/mean-multisig-idl";
import { MultisigUpgradeProgramModal } from '../../components/MultisigUpgradeProgramModal';
import { MultisigUpgradeIDLModal } from '../../components/MultisigUpgradeIDL';
import { encodeInstruction } from '../../models/idl';
import { MultisigSetProgramAuthModal } from '../../components/MultisigSetProgramAuthModal';
import { MultisigOwnersView } from '../../components/MultisigOwnersView';
import { MultisigEditModal } from '../../components/MultisigEditModal';
import { MSP, Treasury } from '@mean-dao/msp';
import { customLogger } from '../..';
import { isError } from '../../utils/transactions';
import { ProgramAccounts } from '../../utils/accounts';

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
  const [transactionFees, setTransactionFees] = useState<TransactionFees>({
    blockchainFee: 0, mspFlatFee: 0, mspPercentFee: 0
  });
  // Multisig accounts
  const [loadingMultisigAccounts, setLoadingMultisigAccounts] = useState(true);
  const [multisigAccounts, setMultisigAccounts] = useState<(MultisigV2 | Multisig)[]>([]);
  const [selectedMultisig, setSelectedMultisig] = useState<any>(undefined);
  // Pending Txs
  const [needRefreshTxs, setNeedRefreshTxs] = useState(true);
  const [loadingMultisigTxs, setLoadingMultisigTxs] = useState(false);
  const [multisigTxs, setMultisigTxs] = useState<MultisigTransaction[]>([]);
  const [highlightedMultisigTx, sethHighlightedMultisigTx] = useState<MultisigTransaction | undefined>();
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
  const [ongoingOperation, setOngoingOperation] = useState<OperationType | undefined>(undefined);
  const [retryOperationPayload, setRetryOperationPayload] = useState<any>(undefined);

  // Modal visibility flags
  const [isCreateMultisigModalVisible, setIsCreateMultisigModalVisible] = useState(false);
  const [isEditMultisigModalVisible, setIsEditMultisigModalVisible] = useState(false);
  const [isUpgradeProgramModalVisible, setIsUpgradeProgramModalVisible] = useState(false);
  const [isUpgradeIDLModalVisible, setIsUpgradeIDLModalVisible] = useState(false);
  const [isSetProgramAuthModalVisible, setIsSetProgramAuthModalVisible] = useState(false);

  const connection = useMemo(() => new Connection(connectionConfig.endpoint, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true
  }), [
    connectionConfig.endpoint
  ]);

  const multisigClient = useMemo(() => {

    const opts: ConfirmOptions = {
      preflightCommitment: "finalized",
      commitment: "finalized",
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
        "finalized"
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

    consoleOut('multisig vaults:', results, 'blue');
    return results;

  },[]);

  const refreshPage = useCallback(() => {
    window.location.reload();
  },[])

  const resetTransactionStatus = useCallback(() => {

    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });

  }, [
    setTransactionStatus
  ]);

  const onAcceptCreateMultisig = (data: any) => {
    consoleOut('multisig:', data, 'blue');
    onExecuteCreateMultisigTx(data);
  };

  const onMultisigCreated = useCallback(() => {

    setIsCreateMultisigModalVisible(false);
    resetTransactionStatus();
    notify({
      description: t('multisig.create-multisig.success-message'),
      type: "success"
    });

  },[
    t,
    resetTransactionStatus
  ])

  const onMultisigModified = useCallback(() => {

    setIsEditMultisigModalVisible(false);
    resetTransactionStatus();
    notify({
      description: t('multisig.update-multisig.success-message'),
      type: "success"
    });

  },[
    t,
    resetTransactionStatus
  ])

  const onTokensMinted = useCallback(() => {

    resetTransactionStatus();

  },[
    resetTransactionStatus
  ]);

  const onTxExecuted = useCallback(() => {
  
  },[]);

  const onProgramUpgraded = useCallback(() => {

  },[]);

  const onIDLUpgraded = useCallback(() => {

  },[]);

  const onProgramAuthSet = useCallback(() => {

  },[]);

  const onExecuteCreateMultisigTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.CreateMultisig);
    setRetryOperationPayload(data);
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
            systemProgram: SystemProgram.programId
          },
          signers: [wallet as any, multisig]
        }
      );

      tx.feePayer = publicKey;
      const { blockhash } = await connection.getRecentBlockhash("finalized");
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
              getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getTokenAmountAndSymbolByTokenAddress(
                transactionFees.blockchainFee + transactionFees.mspFlatFee, 
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
            startFetchTxSignatureInfo(signature, "finalized", OperationType.CreateMultisig);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            onMultisigCreated();
            setOngoingOperation(undefined);
            setIsCreateMultisigModalVisible(false);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    clearTransactionStatusContext, 
    connection, 
    multisigClient.programId, 
    multisigClient.transaction, 
    nativeBalance, 
    onMultisigCreated, 
    publicKey, 
    setTransactionStatus, 
    startFetchTxSignatureInfo, 
    transactionCancelled, 
    transactionFees.blockchainFee, 
    transactionFees.mspFlatFee, 
    transactionStatus.currentOperation, 
    wallet
  ]);

  const onCreateMultisigClick = useCallback(() => {

    resetTransactionStatus();
    setIsCreateMultisigModalVisible(true);

  },[
    resetTransactionStatus
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
      notify({
        description: t('notifications.account-address-copied-message'),
        type: "info"
      });
    } else {
      notify({
        description: t('notifications.account-address-not-copied-message'),
        type: "error"
      });
    }

  },[t])

  const onEditMultisigClick = useCallback(() => {

    resetTransactionStatus();
    setIsEditMultisigModalVisible(true);

  },[
    resetTransactionStatus
  ]);

  const onExecuteEditMultisigTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.CreateMultisig);
    setRetryOperationPayload(data);
    setIsBusy(true);

    const editMultisig = async (data: any) => {

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

      const pid = multisigClient.programId;
      const operation = OperationType.EditMultisig;
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
      const txSize = 1000;
      const createIx = await multisigClient.account.transaction.createInstruction(
        transaction,
        txSize
      );
      
      let tx = multisigClient.transaction.createTransaction(
        pid, 
        operation,
        ixAccounts as any,
        ixData as any,
        new BN(0),
        new BN(0),
        {
          accounts: {
            multisig: selectedMultisig.id,
            transaction: transaction.publicKey,
            proposer: publicKey as PublicKey,
          },
          preInstructions: [createIx],
          signers: [transaction, wallet as any],
        }
      );

      tx.feePayer = publicKey;
      const { blockhash } = await connection.getRecentBlockhash("finalized");
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
              getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getTokenAmountAndSymbolByTokenAddress(
                transactionFees.blockchainFee + transactionFees.mspFlatFee, 
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
            startFetchTxSignatureInfo(signature, "finalized", OperationType.EditMultisig);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            onMultisigModified();
            setOngoingOperation(undefined);
            setIsEditMultisigModalVisible(false);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    selectedMultisig,
    clearTransactionStatusContext,
    connection,
    multisigClient.account.transaction,
    multisigClient.coder.instruction,
    multisigClient.programId,
    multisigClient.transaction,
    nativeBalance,
    onMultisigModified,
    publicKey,
    setTransactionStatus,
    startFetchTxSignatureInfo,
    transactionCancelled,
    transactionFees.blockchainFee,
    transactionFees.mspFlatFee,
    transactionStatus.currentOperation,
    wallet
  ]);

  const onAcceptEditMultisig = (data: any) => {
    consoleOut('multisig:', data, 'blue');
    onExecuteEditMultisigTx(data);
  };

  // Transaction confirm and execution modal launched from each Tx row
  const [isMultisigActionTransactionModalVisible, setMultisigActionTransactionModalVisible] = useState(false);
  const showMultisigActionTransactionModal = useCallback((tx: MultisigTransaction) => {
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.000010,
      mspPercentFee: 0
    };
    setTransactionFees(fees);
    sethHighlightedMultisigTx(tx);
    setMultisigActionTransactionModalVisible(true);
  }, []);

  const onAcceptMultisigActionModal = (item: MultisigTransaction) => {
    consoleOut('onAcceptMultisigActionModal:', item, 'blue');
    if (item.status === MultisigTransactionStatus.Pending) {
      onExecuteApproveTx({ transaction: item });
    } if (item.status === MultisigTransactionStatus.Approved) {
      onExecuteFinishTx({ transaction: item })
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
    setTransactionCancelled(false);
    setRetryOperationPayload(data);
    setIsBusy(true);

    const approveTx = async (data: any) => {

      if (!selectedMultisig || !publicKey) { return null; }
  
      let tx = multisigClient.transaction.approve({
          accounts: {
            multisig: selectedMultisig.id,
            transaction: data.transaction.id,
            owner: publicKey,
          }
        }
      );
  
      tx.feePayer = publicKey;
      const { blockhash } = await connection.getRecentBlockhash("finalized");
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
              getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getTokenAmountAndSymbolByTokenAddress(
                transactionFees.blockchainFee + transactionFees.mspFlatFee, 
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
            startFetchTxSignatureInfo(signature, "finalized", OperationType.ApproveTransaction);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            // TODO: Translate
            notify({
              description: 'Your signature for the Multisig transaction was successfully recorded.',
              type: "success"
            });
            setOngoingOperation(undefined);
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
    transactionFees.mspFlatFee,
    transactionFees.blockchainFee,
    transactionStatus.currentOperation,
    clearTransactionStatusContext,
    startFetchTxSignatureInfo,
    setTransactionStatus,
  ]);

  const onExecuteFinishTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setRetryOperationPayload(data);
    setIsBusy(true);

    const finishTx = async (data: any) => {

      if (!data.transaction || !publicKey) { return null; }

      const [multisigSigner] = await PublicKey.findProgramAddress(
        [data.transaction.multisig.toBuffer()],
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
            },
            remainingAccounts: remainingAccounts
          }
        );    
      }
  
      tx.feePayer = publicKey;
      const { blockhash } = await multisigClient.provider.connection.getRecentBlockhash("finalized");
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
              getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getTokenAmountAndSymbolByTokenAddress(
                transactionFees.blockchainFee + transactionFees.mspFlatFee, 
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
            startFetchTxSignatureInfo(signature, "finalized", OperationType.ExecuteTransaction);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            onTxExecuted();
            setOngoingOperation(undefined);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    wallet,
    publicKey,
    connection,
    nativeBalance,
    multisigClient.programId,
    multisigClient.transaction,
    multisigClient.provider.connection,
    transactionCancelled,
    transactionFees.blockchainFee,
    transactionFees.mspFlatFee,
    transactionStatus.currentOperation,
    startFetchTxSignatureInfo,
    clearTransactionStatusContext,
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

  // Upgrade program modal
  const showUpgradeProgramModal = useCallback(() => {
    setIsUpgradeProgramModalVisible(true);
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.000010,
      mspPercentFee: 0
    };
    setTransactionFees(fees);
  }, []);

  const onAcceptUpgradeProgram = (params: any) => {
    consoleOut('params', params, 'blue');
    onExecuteUpgradeProgramsTx(params);
  };

  const onExecuteUpgradeProgramsTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.UpgradeProgram);
    setRetryOperationPayload(data);
    setIsBusy(true);

    const upgradeProgram = async (data: any) => {

      if (!multisigClient || !selectedMultisig || !publicKey) { return null; }

      const [multisigSigner] = await PublicKey.findProgramAddress(
        [selectedMultisig.id.toBuffer()],
        multisigClient.programId
      );

      const dataBuffer = Buffer.from([3, 0, 0, 0]);
      const spill = multisigClient.provider.wallet.publicKey;
      const ixAccounts = [
        {
          pubkey: new PublicKey(data.programDataAddress),
          isWritable: true,
          isSigner: false,
        },
        { pubkey: new PublicKey(data.programAddress), isWritable: true, isSigner: false },
        { pubkey: new PublicKey(data.bufferAddress), isWritable: true, isSigner: false },
        { pubkey: spill, isWritable: true, isSigner: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isWritable: false, isSigner: false },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isWritable: false, isSigner: false },
        { pubkey: multisigSigner, isWritable: false, isSigner: false },
      ];

      const BPF_LOADER_UPGRADEABLE_PID = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
      const txSize = 1000; // TODO: tighter bound.
      const transaction = Keypair.generate();
      const createIx = await multisigClient.account.transaction.createInstruction(
        transaction,
        txSize
      );

      const tx = multisigClient.transaction.createTransaction(
        BPF_LOADER_UPGRADEABLE_PID,
        OperationType.UpgradeProgram,
        ixAccounts,
        dataBuffer,
        new BN(0),
        new BN(0),
        {
          accounts: {
            multisig: selectedMultisig.id,
            transaction: transaction.publicKey,
            proposer: publicKey
          },
          preInstructions: [createIx],
          signers: [transaction],
        }
      );

      tx.feePayer = publicKey;
      const { blockhash } = await connection.getRecentBlockhash("recent");
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
          programAddress: data.programAddress,
          programDataAddress: data.programDataAddress,
          bufferAddress: data.bufferAddress
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
              getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getTokenAmountAndSymbolByTokenAddress(
                transactionFees.blockchainFee + transactionFees.mspFlatFee, 
                NATIVE_SOL_MINT.toBase58()
              )
            })`
          });
          customLogger.logWarning('Upgrade Program transaction failed', { transcript: transactionLog });
          return false;
        }

        return await upgradeProgram(data)
          .then(value => {
            if (!value) { return false; }
            consoleOut('createTreasury returned transaction:', value);
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
            console.error('createTreasury error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`
            });
            customLogger.logError('Upgrade Program transaction failed', { transcript: transactionLog });
            return false;
          });

      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Upgrade Program transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Upgrade Program transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Upgrade Program transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Upgrade Program transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Upgrade Program transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Upgrade Program transaction failed', { transcript: transactionLog });
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
            startFetchTxSignatureInfo(signature, "finalized", OperationType.UpgradeProgram);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            await delay(1000);
            onProgramUpgraded();
            setOngoingOperation(undefined);
            setIsUpgradeProgramModalVisible(false);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    clearTransactionStatusContext, 
    connection, 
    multisigClient, 
    nativeBalance, 
    onProgramUpgraded, 
    publicKey, 
    selectedMultisig, 
    setTransactionStatus, 
    startFetchTxSignatureInfo, 
    transactionCancelled, 
    transactionFees.blockchainFee, 
    transactionFees.mspFlatFee, 
    transactionStatus.currentOperation, 
    wallet
  ]);

  const isUpgradingProgram = useCallback((): boolean => {

    return ( 
      fetchTxInfoStatus === "fetching" && 
      lastSentTxOperationType === OperationType.UpgradeProgram
    );

  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  // Showw upgrade IDL modal
  const onAcceptUpgradeIDL = (params: any) => {
    consoleOut('params', params, 'blue');
    onExecuteUpgradeIDLTx(params);
  };

  const onExecuteUpgradeIDLTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.UpgradeIDL);
    setRetryOperationPayload(data);
    setIsBusy(true);

    const upgradeIDL = async (data: any) => {

      if (!multisigClient || !selectedMultisig || !publicKey) { return null; }

      const [multisigSigner] = await PublicKey.findProgramAddress(
        [selectedMultisig.id.toBuffer()],
        multisigClient.programId
      );

      const programAddr = new PublicKey(data.programAddress);
      const bufferAddr = new PublicKey(data.idlBufferAddress);
      const idlAddr = new PublicKey(data.programIDLAddress);
      const dataBuffer = encodeInstruction({ setBuffer: {} })

      const ixAccounts = [
        {
          pubkey: bufferAddr,
          isWritable: true,
          isSigner: false,
        },
        { pubkey: idlAddr, isWritable: true, isSigner: false },
        { pubkey: multisigSigner, isWritable: true, isSigner: false },
      ];

      const txSize = 1000; // TODO: tighter bound.
      const transaction = Keypair.generate();
      const upgradeIdlTx = await multisigClient.account.transaction.createInstruction(
        transaction,
        txSize
      );

      const tx = multisigClient.transaction.createTransaction(
        programAddr,
        OperationType.UpgradeIDL,
        ixAccounts,
        dataBuffer,
        new BN(0),
        new BN(0),
        {
          accounts: {
            multisig: selectedMultisig.id,
            transaction: transaction.publicKey,
            proposer: publicKey
          },          
          preInstructions: [upgradeIdlTx],
          signers: [transaction],
        }
      );

      tx.feePayer = publicKey;
      const { blockhash } = await connection.getRecentBlockhash("finalized");
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
          programAddress: data.programAddress,
          programDataAddress: data.programDataAddress,
          idlBufferAddress: data.idlBufferAddress
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
              getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getTokenAmountAndSymbolByTokenAddress(
                transactionFees.blockchainFee + transactionFees.mspFlatFee, 
                NATIVE_SOL_MINT.toBase58()
              )
            })`
          });
          customLogger.logWarning('Upgrade IDL transaction failed', { transcript: transactionLog });
          return false;
        }

        return await upgradeIDL(data)
          .then(value => {
            if (!value) { return false; }
            consoleOut('createTreasury returned transaction:', value);
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
            console.error('createTreasury error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`
            });
            customLogger.logError('Upgrade IDL transaction failed', { transcript: transactionLog });
            return false;
          });

      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Upgrade IDL transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Upgrade IDL transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Upgrade IDL transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Upgrade IDL transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Upgrade IDL transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Upgrade IDL transaction failed', { transcript: transactionLog });
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
            startFetchTxSignatureInfo(signature, "finalized", OperationType.UpgradeIDL);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            await delay(1000);
            onIDLUpgraded();
            setOngoingOperation(undefined);
            setIsUpgradeProgramModalVisible(false);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    clearTransactionStatusContext, 
    connection, 
    multisigClient, 
    nativeBalance, 
    onIDLUpgraded, 
    publicKey, 
    selectedMultisig, 
    setTransactionStatus, 
    startFetchTxSignatureInfo, 
    transactionCancelled, 
    transactionFees.blockchainFee, 
    transactionFees.mspFlatFee, 
    transactionStatus.currentOperation, 
    wallet
  ]);

  const showUpgradeIDLModal = useCallback(() => {
    setIsUpgradeIDLModalVisible(true);
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.000010,
      mspPercentFee: 0
    };
    setTransactionFees(fees);
  }, []);

  const isUpgradingIDL = useCallback((): boolean => {

    return ( 
      fetchTxInfoStatus === "fetching" && 
      lastSentTxOperationType === OperationType.UpgradeIDL
    );

  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  // Set program authority modal
  const showSetProgramAuthModal = useCallback(() => {
    setIsSetProgramAuthModalVisible(true);
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.000010,
      mspPercentFee: 0
    };
    setTransactionFees(fees);
  }, []);

  const onAcceptSetProgramAuth = (params: any) => {
    consoleOut('params', params, 'blue');
    onExecuteSetProgramAuthTx(params);
  };

  const onExecuteSetProgramAuthTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.SetMultisigAuthority);
    setRetryOperationPayload(data);
    setIsBusy(true);

    const setProgramAuth = async (data: any) => {

      if (!multisigClient || !selectedMultisig || !publicKey) { return null; }

      const [multisigSigner] = await PublicKey.findProgramAddress(
        [selectedMultisig.id.toBuffer()],
        multisigClient.programId
      );

      const ixData = Buffer.from([4, 0, 0, 0]);
      const ixAccounts = [
        {
          pubkey: new PublicKey(data.programDataAddress),
          isWritable: true,
          isSigner: false,
        },
        { pubkey: multisigSigner, isWritable: false, isSigner: true },
        { pubkey: new PublicKey(data.newAuthAddress), isWritable: false, isSigner: false },
      ];

      const BPF_LOADER_UPGRADEABLE_PID = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
      const txSize = 1000;
      const transaction = Keypair.generate();
      const createIx = await multisigClient.account.transaction.createInstruction(
        transaction,
        txSize
      );

      const tx = multisigClient.transaction.createTransaction(
        BPF_LOADER_UPGRADEABLE_PID,
        OperationType.SetMultisigAuthority,
        ixAccounts,
        ixData,
        new BN(0),
        new BN(0),
        {
          accounts: {
            multisig: selectedMultisig.id,
            transaction: transaction.publicKey,
            proposer: publicKey
          },
          preInstructions: [createIx],
          signers: [transaction]
        }
      );

      tx.feePayer = publicKey;
      const { blockhash } = await connection.getRecentBlockhash("finalized");
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
          programAddress: data.programAddress,
          programDataAddress: data.programDataAddress,
          newAuthAddress: data.newAuthAddress
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
              getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getTokenAmountAndSymbolByTokenAddress(
                transactionFees.blockchainFee + transactionFees.mspFlatFee, 
                NATIVE_SOL_MINT.toBase58()
              )
            })`
          });
          customLogger.logWarning('Set program authority transaction failed', { transcript: transactionLog });
          return false;
        }

        return await setProgramAuth(data)
          .then(value => {
            if (!value) { return false; }
            consoleOut('createTreasury returned transaction:', value);
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
            console.error('createTreasury error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`
            });
            customLogger.logError('Set program authority transaction failed', { transcript: transactionLog });
            return false;
          });

      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Set program authority transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Set program authority transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Set program authority transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Set program authority transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Set program authority transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Set program authority transaction failed', { transcript: transactionLog });
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
            startFetchTxSignatureInfo(signature, "finalized", OperationType.SetMultisigAuthority);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            await delay(1000);
            onProgramAuthSet();
            setOngoingOperation(undefined);
            setIsSetProgramAuthModalVisible(false);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    clearTransactionStatusContext, 
    connection, 
    multisigClient, 
    nativeBalance, 
    onProgramAuthSet, 
    publicKey, 
    selectedMultisig, 
    setTransactionStatus, 
    startFetchTxSignatureInfo, 
    transactionCancelled, 
    transactionFees.blockchainFee, 
    transactionFees.mspFlatFee, 
    transactionStatus.currentOperation, 
    wallet
  ]);

  const isSelectedMultisigV2 = useCallback((): boolean => {
    if (selectedMultisig && selectedMultisig.version && selectedMultisig.version === 2) {
      return true
    }
    return false;
  }, [selectedMultisig]);

  const isMultisigV2 = useCallback((myMultisig: MultisigV2 | Multisig): boolean => {
    if (myMultisig.version && myMultisig.version === 2) {
      return true
    }
    return false;
  }, []);

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

  const getOperationName = useCallback((op: OperationType) => {

    switch (op) {
      case OperationType.CreateMint:
        return "Create Mint";
      case OperationType.MintTokens:
        return "Mint token";
      case OperationType.TransferTokens:
        return "Transfer tokens";
      case OperationType.UpgradeProgram:
        return "Upgrade program";
      case OperationType.UpgradeIDL:
        return "Upgrade IDL";
      case OperationType.SetMultisigAuthority:
        return "Set Multisig Authority";
      case OperationType.EditMultisig:
        return "Edit Multisig";
      case OperationType.TreasuryCreate:
        return "Create Treasury";
      case OperationType.TreasuryClose:
        return "Close Treasury";
      case OperationType.TreasuryRefreshBalance:
        return "Refresh Treasury Data";
      case OperationType.TreasuryWithdraw:
        return "Withdraw Treasury Funds";
      case OperationType.DeleteVault:
        return "Close Vault";
      case OperationType.CreateVault:
        return "Create Vault";
      case OperationType.SetVaultAuthority:
        return "Change Vault Authority";
      case OperationType.StreamCreate:
        return "Create Stream";
      case OperationType.StreamClose:
        return "Close Stream";
      case OperationType.StreamAddFunds:
        return "Top Up Stream";
      case OperationType.StreamPause:
        return "Pause Stream";
      case OperationType.StreamResume:
        return "Resume Stream";
      default:
        return '';
    }

    // if (op === OperationType.TreasuryAddFunds) {
    //   return "Add Funds to Treasury";
    // }

  },[]);

  const getTransactionStatusAction = useCallback((mtx: MultisigTransaction) => {

    if (mtx.status === MultisigTransactionStatus.Pending) {
      return "Pending Approval";
    } 
    
    if (mtx.status === MultisigTransactionStatus.Approved) {
      return "Pending for Execution";
    }

    if (mtx.status === MultisigTransactionStatus.Executed) {
      return "Completed";
    }
    
    if (mtx.status === MultisigTransactionStatus.Voided) {
      return "Voided";
    }

    return "Rejected";

  },[]);

  const getTransactionUserStatusAction = useCallback((mtx: MultisigTransaction, longStatus = false) => {

    if (mtx.executedOn) {
      return "";
    } else if (mtx.didSigned === undefined) {
      return longStatus ? "You have rejected this transaction" : "Rejected";
    } else if (mtx.didSigned === false) {
      return !longStatus
        ? "Not Signed"
        : mtx.status === MultisigTransactionStatus.Approved
          ? "You did NOT sign this transaction"
          : "You have NOT signed this transaction";
    } else {
      return longStatus ? "You have signed this transaction" : "Signed";
    }

  },[]);

  const getTransactionUserStatusActionClass = useCallback((mtx: MultisigTransaction) => {

    if (mtx.executedOn) {
      return "";
    } else if (mtx.didSigned === undefined) {
      return "fg-red";
    } else if (mtx.didSigned === false) {
      return theme === 'light' ? "fg-light-orange font-bold" : "fg-yellow font-bold";
    } else {
      return theme === 'light' ? "fg-green" : "fg-success"
    }

  },[theme]);

  const getTransactionStatusClass = useCallback((mtx: MultisigTransaction) => {

    const approvals = mtx.signers.filter((s: boolean) => s === true).length;

    if (approvals === 0) {
      return "warning";
    } 
    
    if (mtx.status === MultisigTransactionStatus.Pending) {
      return "info";
    } 
    
    if(mtx.status === MultisigTransactionStatus.Approved || mtx.status === MultisigTransactionStatus.Voided) {
      return "error";
    }

    return "darken";

  },[]);

  const getOperationProgram = useCallback((op: OperationType) => {

    if (
      op === OperationType.CreateMint ||
      op === OperationType.MintTokens || 
      op === OperationType.TransferTokens || 
      op === OperationType.SetVaultAuthority
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

  const getTransactionStatus = useCallback((account: any) => {

    if (account.executedOn > 0) {
      return MultisigTransactionStatus.Executed;
    } 

    let status = MultisigTransactionStatus.Pending;
    let approvals = account.signers.filter((s: boolean) => s === true).length;

    if (selectedMultisig && selectedMultisig.threshold === approvals) {
      status = MultisigTransactionStatus.Approved;
    }

    if (selectedMultisig && selectedMultisig.ownerSeqNumber !== account.ownerSetSeqno) {
      status = MultisigTransactionStatus.Voided;
    }

    return status;

  },[
    selectedMultisig
  ]);

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

  const onAfterEveryModalClose = useCallback(() => resetTransactionStatus(),[resetTransactionStatus]);

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

  const loadMultisigTxs = useCallback(() => {
    
    if (!connection || !publicKey || !multisigClient || !selectedMultisig || !selectedMultisig.id || loadingMultisigTxs) { 
      return;
    }

    setLoadingMultisigTxs(true);
    let transactions: MultisigTransaction[] = [];

    multisigClient.account.transaction
      .all(selectedMultisig.id.toBuffer())
      .then((txs) => {
        for (let tx of txs) {
          // console.log('tx account', tx.account);
          let currentOwnerIndex = selectedMultisig.owners.findIndex((o: any) => o.address === publicKey.toBase58());
          let txInfo = Object.assign({}, {
            id: tx.publicKey,
            multisig: tx.account.multisig,
            programId: tx.account.programId,
            signers: tx.account.signers,
            ownerSeqNumber: tx.account.ownerSetSeqno,
            createdOn: new Date(tx.account.createdOn.toNumber() * 1000),
            executedOn: tx.account.executedOn > 0 && tx.account.executedOn.byteLength <= 53
              ? new Date(tx.account.executedOn.toNumber() * 1000) 
              : undefined,
            status: getTransactionStatus(tx.account),
            operation: parseInt(Object.keys(OperationType).filter(k => k === tx.account.operation.toString())[0]),
            accounts: tx.account.accounts,
            didSigned: tx.account.signers[currentOwnerIndex],
            proposer: tx.account.proposer,
            pdaTimestamp: tx.account.pdaTimestamp ? tx.account.pdaTimestamp.toNumber() : undefined,
            pdaBump: tx.account.pdaBump,
            data: tx.account.data,
            keypairs: []

          } as MultisigTransaction);
          
          transactions.push(txInfo);
        }
        const sortedTxs = transactions.sort((a, b) => b.createdOn.getTime() - a.createdOn.getTime());
        consoleOut('selected multisig txs', sortedTxs, 'blue');
        if (!isProd()) {
          const debugTable: any[] = [];
          sortedTxs.forEach(item => debugTable.push({
            operation: OperationType[item.operation],
            approved: item.didSigned,
            executed: item.executedOn ? true : false,
            proposer: item.proposer ? shortenAddress(item.proposer.toBase58(), 6) : '-',
            status: MultisigTransactionStatus[item.status]
          }));
          console.table(debugTable);
        }
        setMultisigTxs(sortedTxs);
        setLoadingMultisigTxs(false);
      })
      .catch(err => {
        console.error(err);
        setMultisigTxs([]);
        setLoadingMultisigTxs(false);
        consoleOut('multisig txs:', [], 'blue');
      });

  }, [
    connection, 
    publicKey, 
    multisigClient,
    selectedMultisig, 
    loadingMultisigTxs,
    getTransactionStatus
  ]);

  // Get multisig mint accounts on demmand
  // const getMultisigMints = useCallback(async (
  //   connection: Connection,
  //   multisig: PublicKey

  // ) => {

  //   const [multisigSigner] = await PublicKey.findProgramAddress(
  //     [multisig.toBuffer()],
  //     MEAN_MULTISIG
  //   );

  //   const mintInfos = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
  //     filters: [
  //       {
  //         memcmp: { offset: 4, bytes: multisigSigner.toBase58() },
  //       }, 
  //       {
  //         dataSize: MintLayout.span
  //       }
  //     ],
  //   });

  //   if (!mintInfos || !mintInfos.length) { return []; }

  //   const results = mintInfos.map((t: any) => {
  //     let mintAccount = MintLayout.decode(t.account.data);
  //     mintAccount.address = t.pubkey;
  //     return {
  //       address: mintAccount.address,
  //       isInitialized: mintAccount.isInitialized === 1 ? true : false,
  //       decimals: mintAccount.decimals,
  //       supply: new BN(mintAccount.supply).toNumber(),
  //       mintAuthority: mintAccount.freezeAuthority ? new PublicKey(mintAccount.freezeAuthority) : null,
  //       freezeAuthority: mintAccount.freezeAuthority ? new PublicKey(mintAccount.freezeAuthority) : null
        
  //     } as MultisigMint;
  //   });

  //   consoleOut('multisig mints:', results, 'blue');
  //   return results;

  // },[]);

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
              }
              // Now make item active
              if (item) {
                setSelectedMultisig(item);
              } else {
                setSelectedMultisig(multisigInfoArray[0]);
              }
              setTimeout(() => {
                loadMultisigTxs();
              }, 100);
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
    loadMultisigTxs,
  ]);

  // Subscribe to multisig account changes
  useEffect(() => {

    if (!connection || !connected || !selectedMultisig || !selectedMultisig.id) {
      return;
    }

    const timeout = setTimeout(() => {
      multisigClient.account.multisigV2
        .subscribe(selectedMultisig.id)
        .on("change", (account) => {

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

              consoleOut('account:', account, 'blue');
              consoleOut('multisigInfo:', multisigInfo, 'blue');

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

    if (!publicKey || !selectedMultisig || !needRefreshTxs) { 
      return;
    }

    consoleOut('Triggering loadMultisigPendingTxs using setNeedRefreshTxs...', '', 'blue');
    setNeedRefreshTxs(false);
    loadMultisigTxs();

  }, [
    publicKey,
    selectedMultisig,
    needRefreshTxs,
    loadMultisigTxs
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

  // Get Multisig Mint accounts
  // useEffect(() => {

  //   if (!connection || !publicKey || !multisigClient || !selectedMultisig || !loadingMints) {
  //     return;
  //   }

  //   const timeout = setTimeout(() => {
  //     getMultisigMints(connection, selectedMultisig.address)
  //     .then((result: MultisigMint[]) => {
  //       setMultisigMints(result);
  //       consoleOut('Mints:', result, 'blue');
  //     })
  //     .catch(err => console.error(err))
  //     .finally(() => setLoadingMints(false));
  //   });

  //   return () => {
  //     clearTimeout(timeout);
  //   }

  // },[
  //   publicKey,
  //   connection,
  //   loadingMints,
  //   multisigClient,
  //   selectedMultisig,
  //   getMultisigMints,
  // ]);

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
    if (!publicKey) { return; }

    if (lastSentTxSignature && (fetchTxInfoStatus === "fetched" || fetchTxInfoStatus === "error")) {
      clearTransactionStatusContext();
      setLoadingMultisigAccounts(true);
      sethHighlightedMultisigTx(undefined);
      loadMultisigTxs();
    }
  }, [
    publicKey,
    fetchTxInfoStatus,
    lastSentTxSignature,
    lastSentTxOperationType,
    clearTransactionStatusContext,
    loadMultisigTxs
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

  const isTxPendingApprovalOrExecution = useCallback(() => {
    if (highlightedMultisigTx) {
      if (highlightedMultisigTx.status === MultisigTransactionStatus.Pending ||
          highlightedMultisigTx.status === MultisigTransactionStatus.Approved) {
        return true;
      }
    }
    return false;
  }, [highlightedMultisigTx]);

  const isUserInputNeeded = useCallback(() => {
    if (highlightedMultisigTx) {
      if (highlightedMultisigTx.executedOn) { // Executed
        return false;
      } else if (highlightedMultisigTx.didSigned === undefined) { // Rejected
        return false;
      } else if (highlightedMultisigTx.didSigned === false) { // Not yet signed
        return true;
      } else {
        return isTxPendingExecution() // Signed but
          ? true    // Tx still needs signing or execution
          : false;  // Tx completed, nothing to do
      }
    }

    return false;

  }, [highlightedMultisigTx, isTxPendingExecution]);

  const getTxUserStatusClass = useCallback((mtx: MultisigTransaction) => {

    if (mtx.executedOn) {
      return "";
    } else if (mtx.didSigned === undefined) {
      return "fg-red";
    } else if (mtx.didSigned === false) {
      return theme === 'light' ? "fg-light-orange" : "fg-yellow";
    } else {
      return theme === 'light' ? "fg-green" : "fg-success"
    }

  },[theme]);

  const getTxApproveMainCtaLabel = useCallback(() => {

    const busyLabel = isTxPendingExecution()
      ? 'Executing transaction'
      : isTxPendingApproval()
        ? 'Approving transaction'
        : '';

    const iddleLabel = isTxPendingExecution()
      ? 'Execute transaction'
      : isTxPendingApproval()
        ? 'Approve transaction'
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
    t,
  ]);

  const isTxInProgress = useCallback((): boolean => {
    return isBusy || fetchTxInfoStatus === "fetching" ? true : false;
  }, [
    isBusy,
    fetchTxInfoStatus,
  ]);

  const isSuccess = (): boolean => {
    return transactionStatus.currentOperation === TransactionStatus.TransactionFinished;
  }

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
                  <div><span className={theme === 'light' ? "fg-light-orange font-bold" : "fg-yellow font-bold"}>Not Signed</span></div>
                </div>
              </div>
            </div>
          );
        })}
      </>
    );
  };

  const renderMultisigPendingTxs = () => {

    if (!selectedMultisig) {
      return null;
    } else if (selectedMultisig && loadingMultisigTxs) {
      return (
        <div className="mb-2">{t('multisig.multisig-transactions.loading-transactions')}</div>
      );
    } else if (selectedMultisig && !loadingMultisigTxs && multisigTxs.length === 0) {
      return (
        <div className="mb-2">{t('multisig.multisig-transactions.no-transactions')}</div>
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
              {multisigTxs.map(item => {
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
                      <span className={`align-middle ${getTransactionUserStatusActionClass(item)}`}>{getTransactionUserStatusAction(item)}</span>
                    </div>
                    <div className="std-table-cell fixed-width-34">
                      {
                        item.status !== MultisigTransactionStatus.Executed ? (
                          <span className="align-middle">{`${item.signers.filter(s => s === true).length}/${selectedMultisig.threshold}`}</span>
                        ) : (
                          <span className="align-middle">&nbsp;</span>
                        )
                      }
                    </div>
                    <div className="std-table-cell text-center fixed-width-120">
                      <span className={`badge small ${getTransactionStatusClass(item)}`} style={{padding: '3px 5px'}}>{getTransactionStatusAction(item)}</span>
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
                    {t('multisig.multisig-account-detail.authority')}
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
                const url = `/multisig-vaults?multisig=${selectedMultisig.id.toBase58()}`;
                navigate(url);
              }
            }}>
            {multisigVaults && multisigVaults.length > 0 ? (
              <span>
                {t('multisig.multisig-account-detail.cta-vaults', {
                  itemCount: multisigVaults.length
                })}
              </span>
              ) : (
              <span>
                {t('multisig.multisig-account-detail.cta-no-vaults')}
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
          ) : isUpgradingProgram() ? (
            <div className="flex-row flex-center">
              <LoadingOutlined />
              <span className="ml-1">{t('multisig.multisig-account-detail.cta-upgrade-program-busy')}</span>
            </div>
          ) : isUpgradingIDL() ? (
            <div className="flex-row flex-center">
              <LoadingOutlined />
              <span className="ml-1">Upgrading IDL</span>
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
            onClick={onMultisigClick}
            className={
              `transaction-list-row ${
                selectedMultisig && selectedMultisig.id && selectedMultisig.id.equals(item.id) 
                  ? 'selected' 
                  : ''
                }`
              }>

            <div className="icon-cell">
              <Identicon address={item.id} style={{ width: "30", display: "inline-flex" }} />
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

                    {/* Copy address CTA */}
                    <div className="stream-share-ctas">
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
                    </div>
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

      {isUpgradeProgramModalVisible && (
        <MultisigUpgradeProgramModal
          isVisible={isUpgradeProgramModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          handleOk={onAcceptUpgradeProgram}
          handleClose={() => setIsUpgradeProgramModalVisible(false)}
          isBusy={isBusy}
        />
      )}

      {isUpgradeIDLModalVisible && (
        <MultisigUpgradeIDLModal
          isVisible={isUpgradeIDLModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          handleOk={onAcceptUpgradeIDL}
          handleClose={() => setIsUpgradeIDLModalVisible(false)}
          isBusy={isBusy}
        />
      )}

      {isSetProgramAuthModalVisible && (
        <MultisigSetProgramAuthModal
          isVisible={isSetProgramAuthModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          handleOk={onAcceptSetProgramAuth}
          handleClose={() => setIsSetProgramAuthModalVisible(false)}
          isBusy={isBusy}
        />
      )}

      {/* Transaction confirm and execution modal launched from each Tx row */}
      {(isMultisigActionTransactionModalVisible && highlightedMultisigTx && selectedMultisig) && (
        <Modal
          className="mean-modal simple-modal"
          title={<div className="modal-title">{t('multisig.multisig-transactions.modal-title')}</div>}
          maskClosable={false}
          visible={isMultisigActionTransactionModalVisible}
          closable={true}
          onOk={onCloseMultisigActionModal}
          onCancel={onCloseMultisigActionModal}
          width={isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 400 : 480}
          footer={null}>

          {/* A Cross-fading panel shown when NOT busy */}
          <div className={!isBusy ? "panel1 show" : "panel1 hide"}>

            {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
              <>
                {/* Normal stuff - YOUR USER INPUTS / INFO AND ACTIONS */}
                {isTxPendingExecution() ? (
                  <>
                    {/* Custom execution-ready message */}
                    {isTreasuryOperation() && !isUserTheProposer() ? (
                      <h3 className="text-center">A transaction on this Multisig is now ready for execution. Please tell the person who initiated this transaction to execute it.</h3>
                    ) : (
                      <h3 className="text-center">A Transaction on this Multisig is ready for {isUserTheProposer() ? 'your execution' : 'execution'}.</h3>
                    )}
                    <Divider className="mt-2" />
                    <div className="mb-2">Proposed Action: {getOperationName(highlightedMultisigTx.operation)}</div>
                    <div className="mb-2">Submitted on: {getReadableDate(highlightedMultisigTx.createdOn.toString(), true)}</div>
                    <div className="mb-2">Initiator: This transaction was submitted by {getTxInitiator(highlightedMultisigTx)?.name}<br/>Address: <code>{getTxInitiator(highlightedMultisigTx)?.address}</code></div>
                    <div className="mb-2">This transaction required {selectedMultisig.threshold}/{selectedMultisig.owners.length} signers to approve it in order to be executed. {getTxSignedCount(highlightedMultisigTx)} Signed.</div>
                    <div className="mb-2">
                      <span className="mr-1">Your Status:</span>
                      <span className={`font-bold ${getTxUserStatusClass(highlightedMultisigTx)}`}>{getTransactionUserStatusAction(highlightedMultisigTx, true)}</span>
                    </div>
                  </>
                ) : isTxPendingApproval() ? (
                  <>
                    <h3 className="text-center">A Transaction on this Multisig is awaiting {getTransactionUserStatusAction(highlightedMultisigTx) === "Signed" ? 'for' : 'your'} approval.</h3>
                    <Divider className="mt-2" />
                    <div className="mb-2">Proposed Action: {getOperationName(highlightedMultisigTx.operation)}</div>
                    {
                      highlightedMultisigTx.operation === OperationType.TreasuryClose && (
                        <div className="mb-2 fg-yellow">
                          When a treasury is closed, all funds left over will be deposited to the initiator's wallet. Please confirm this is acceptable before you sign.
                        </div>
                      )
                    }
                    <div className="mb-2">Submitted on: {getReadableDate(highlightedMultisigTx.createdOn.toString(), true)}</div>
                    <div className="mb-2">Initiator: This transaction was submitted by {getTxInitiator(highlightedMultisigTx)?.name}<br/>Address: <code>{getTxInitiator(highlightedMultisigTx)?.address}</code></div>
                    <div className="mb-2">This transaction requires {selectedMultisig.threshold}/{selectedMultisig.owners.length} signers to approve it in order to be executed. {getTxSignedCount(highlightedMultisigTx)} Signed so far.</div>
                    <div className="mb-2">
                      <span className="mr-1">Your Status:</span>
                      <span className={`font-bold ${getTxUserStatusClass(highlightedMultisigTx)}`}>{getTransactionUserStatusAction(highlightedMultisigTx, true)}</span>
                    </div>
                    {getTransactionUserStatusAction(highlightedMultisigTx) === "Signed" && (
                      <div className="mb1">
                        {txPendingSigners(highlightedMultisigTx)}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <h3 className="text-center">This transaction has {isTxRejected() ? 'been rejected' : 'already been executed'}.</h3>
                    <Divider className="mt-2" />
                    <div className="mb-2">Proposed Action: {getOperationName(highlightedMultisigTx.operation)}</div>
                    <div className="mb-2">Submitted on: {getReadableDate(highlightedMultisigTx.createdOn.toString(), true)}</div>
                    <div className="mb-2">Initiator: This transaction was submitted by {getTxInitiator(highlightedMultisigTx)?.name}<br/>Address: <code>{getTxInitiator(highlightedMultisigTx)?.address}</code></div>
                    <div className="mb-2">This transaction required {selectedMultisig.threshold}/{selectedMultisig.owners.length} signers to approve it in order to be executed. {getTxSignedCount(highlightedMultisigTx)} Signed.</div>
                  </>
                )}
              </>
            ) : transactionStatus.currentOperation === TransactionStatus.TransactionFinished ? (
              <>
                {/* When succeeded - BEWARE OF THE SUCCESS MESSAGE */}
                <div className="transaction-progress">
                  <CheckOutlined style={{ fontSize: 48 }} className="icon mt-0" />
                  <h4 className="font-bold">
                    {
                      t('multisig.multisig-transactions.tx-operation-success', {
                        operation: getOperationName(highlightedMultisigTx.operation)
                      })
                    }
                  </h4>
                </div>
                {/* If I am the last approval needed to reach threshold show instructions for exec */}
                {getTxSignedCount(highlightedMultisigTx) === selectedMultisig.threshold - 1 && (
                  <>
                    <h3 className="text-center mt-3">This transaction is now ready for execution. Please tell the person who initiated this transaction to execute it.</h3>
                    <Divider className="mt-2" />
                    <div className="mb-2">Initiator: {getTxInitiator(highlightedMultisigTx)?.name}<br/>Address: <code>{getTxInitiator(highlightedMultisigTx)?.address}</code></div>
                  </>
                )}
              </>
            ) : (
              <>
                <div className="transaction-progress">
                  <InfoCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
                  {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                    <>
                      {/* Pre Tx execution failures here */}
                      <h4 className="font-bold mb-3">{t('multisig.multisig-transactions.tx-operation-failure')}</h4>
                      <h4 className="mb-3">Explain failure condition if specific</h4>
                    </>
                  ) : (
                    <>
                      {/* All other error conditions then - A getter could offer a basic explanation of what happened */}
                      <h4 className="font-bold mb-3">{t('multisig.multisig-transactions.tx-operation-failure', {
                        operation: getOperationName(highlightedMultisigTx.operation)
                      })}</h4>
                      <h4 className="mb-3">
                      {!transactionStatus.customError
                        ? getTransactionOperationDescription(transactionStatus.currentOperation, t)
                        : (
                          <>
                            <span>{transactionStatus.customError.message}</span>
                            <span className="ml-1">[{shortenAddress(transactionStatus.customError.data.toBase58(), 8)}]</span>
                            <div className="icon-button-container">
                              <Button
                                type="default"
                                shape="circle"
                                size="middle"
                                icon={<CopyOutlined />}
                                onClick={() => copyAddressToClipboard(transactionStatus.customError.data)}
                              />
                            </div>
                          </>
                        )}
                      </h4>
                    </>
                  )}
                </div>
              </>
            )}

          </div>

          {/* A Crross-fading panel shown when busy */}
          <div className={isBusy ? "panel2 show"  : "panel2 hide"}>          
            {transactionStatus.currentOperation !== TransactionStatus.Iddle && (
              <div className="transaction-progress">
                <Spin indicator={bigLoadingIcon} className="icon mt-0" />
                <h4 className="font-bold mb-1">
                  {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
                </h4>
                {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
                  <div className="indication">{t('transactions.status.instructions')}</div>
                )}
              </div>
            )}
          </div>

          {/* CTAs shown always - IF DIFFERENT CTAS ARE BEST FOR EACH STAGE, MOVE THEM INSIDE THE PANELS */}
          <div className="transaction-progress mt-3">
            <Space size="middle" wrap>
              <Button
                type="text"
                shape="round"
                size="middle"
                className={isBusy ? 'inactive' : ''}
                onClick={() => isError(transactionStatus.currentOperation)
                  ? onAcceptMultisigActionModal(highlightedMultisigTx)
                  : onCloseMultisigActionModal()}>
                {isError(transactionStatus.currentOperation)
                  ? t('general.retry')
                  : t('general.cta-close')
                }
              </Button>
              {
                (canShowExecuteButton() || canShowApproveButton())
                &&
                (
                  <Button
                    className={isBusy ? 'inactive' : ''}
                    type="primary"
                    shape="round"
                    size="middle"
                    onClick={() => {
                      if (transactionStatus.currentOperation === TransactionStatus.Iddle) {
                        onAcceptMultisigActionModal(highlightedMultisigTx);
                      } else if (transactionStatus.currentOperation === TransactionStatus.TransactionFinished) {
                        onCloseMultisigActionModal();
                      } else {
                        refreshPage();
                      }
                    }}>
                    {getTxApproveMainCtaLabel()}
                  </Button>
                )
              }
            </Space>
          </div>

        </Modal>
      )}

      <PreFooter />
    </>
  );

};
