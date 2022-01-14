import React, { useCallback, useContext, useMemo } from 'react';
import { useEffect, useState } from 'react';
import { PreFooter } from '../../components/PreFooter';
import { AppStateContext } from '../../contexts/appstate';
import { useTranslation } from 'react-i18next';
import { isDesktop } from "react-device-detect";
import useWindowSize from '../../hooks/useWindowResize';
import { useWallet } from '../../contexts/wallet';
import { getSolanaExplorerClusterParam } from '../../contexts/connection';
import {
  consoleOut,
  copyText,
  delay,
  getTransactionModalTitle,
  getTransactionOperationDescription,
  getTransactionStatusForLogs,
  isLocal
} from '../../utils/ui';
import { Button, Col, Dropdown, Empty, Menu, Modal, Row, Spin, Tooltip } from 'antd';
import { MEAN_TOKEN_LIST } from '../../constants/token-list';
import { Identicon } from '../../components/Identicon';
import "./style.less";
import { formatThousands, getTokenAmountAndSymbolByTokenAddress, getTxIxResume, shortenAddress, useLocalStorageState } from '../../utils/utils';
import {
  SIMPLE_DATE_FORMAT,
  SIMPLE_DATE_TIME_FORMAT,
  SOLANA_EXPLORER_URI_INSPECT_ADDRESS,
  SOLANA_EXPLORER_URI_INSPECT_TRANSACTION,
  VERBOSE_DATE_FORMAT,
  VERBOSE_DATE_TIME_FORMAT
} from '../../constants';
import { IconClock, IconExchange, IconExternalLink, IconRefresh } from '../../Icons';
import { ArrowDownOutlined, ArrowUpOutlined, CheckOutlined, EllipsisOutlined, LoadingOutlined, WarningOutlined } from '@ant-design/icons';
import { notify } from '../../utils/notifications';
import { calculateActionFees, DdcaAccount, DdcaActivity, DdcaClient, DdcaDetails, DDCA_ACTIONS, TransactionFees } from '@mean-dao/ddca';
import { Connection, LAMPORTS_PER_SOL, PublicKey, Transaction } from '@solana/web3.js';
import { getLiveRpc, RpcConfig } from '../../models/connections-hq';
import { useNavigate } from 'react-router-dom';
import { OperationType, TransactionStatus } from '../../models/enums';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import dateFormat from "dateformat";
import { customLogger } from '../..';
import { DdcaCloseModal } from '../../components/DdcaCloseModal';
import { TransactionStatusContext } from '../../contexts/transaction-status';
import { DdcaWithdrawModal } from '../../components/DdcaWithdrawModal';
import { DdcaAddFundsModal } from '../../components/DdcaAddFundsModal';
import { useNativeAccount } from '../../contexts/accounts';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const ExchangeDcasView = () => {
  const {
    recurringBuys,
    detailsPanelOpen,
    transactionStatus,
    loadingRecurringBuys,
    previousWalletConnectState,
    setRecurringBuys,
    setDtailsPanelOpen,
    setTransactionStatus,
    setLoadingRecurringBuys,
  } = useContext(AppStateContext);
  const {
    lastSentTxStatus,
    fetchTxInfoStatus,
    lastSentTxSignature,
    lastSentTxOperationType,
    recentlyCreatedVault,
    setRecentlyCreatedVault,
    startFetchTxSignatureInfo,
    clearTransactionStatusContext,
  } = useContext(TransactionStatusContext);
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const { publicKey, wallet, connected } = useWallet();
  const { account } = useNativeAccount();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);

  // Connection management
  const [cachedRpcJson] = useLocalStorageState("cachedRpc");
  const [mainnetRpc, setMainnetRpc] = useState<RpcConfig | null>(null);
  const cachedRpc = (cachedRpcJson as RpcConfig);
  const endpoint = mainnetRpc ? mainnetRpc.httpProvider : cachedRpc.httpProvider;

  const { width } = useWindowSize();
  const [isSmallUpScreen, setIsSmallUpScreen] = useState(isDesktop);
  const [selectedDdca, setSelectedDdca] = useState<DdcaAccount | undefined>();
  const [ddcaDetails, setDdcaDetails] = useState<DdcaDetails | undefined>();
  const [loadingDdcaDetails, setLoadingDdcaDetails] = useState<boolean>(false);
  const [firstLoadDone, setFirstLoadDone] = useState<boolean>(false);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [activity, setActivity] = useState<DdcaActivity[]>([]);

  // Select, Connect to and test the network
  useEffect(() => {
    (async () => {
      if (cachedRpc.networkId !== 101) {
        const mainnetRpc = await getLiveRpc(101);
        if (!mainnetRpc) {
          navigate('/service-unavailable');
        }
        setMainnetRpc(mainnetRpc);
      } else {
        setMainnetRpc(null);
      }
    })();
    return () => { }
  }, [
    cachedRpc.networkId,
    navigate
  ]);

  // Set and cache connection
  const connection = useMemo(() => new Connection(endpoint, "confirmed"), [endpoint]);

  // Set and cache the DDCA client
  const ddcaClient = useMemo(() => {
    if (connection && wallet && publicKey && endpoint) {
      return new DdcaClient(endpoint, wallet, { commitment: "confirmed" }, isLocal() ? true : false);
    } else {
      return undefined;
    }
  }, [
    wallet,
    endpoint,
    publicKey,
    connection
  ]);

  // Keep track of current balance
  useEffect(() => {

    const getAccountBalance = (): number => {
      return (account?.lamports || 0) / LAMPORTS_PER_SOL;
    }

    if (account?.lamports !== previousBalance || !nativeBalance) {
      setNativeBalance(getAccountBalance());
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [
    account,
    nativeBalance,
    previousBalance
  ]);

  // Transaction execution (Applies to all transactions)
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [ddcaTxFees, setdDcaTxFees] = useState<TransactionFees>({
    flatFee: 0, maxBlockchainFee: 0, maxFeePerSwap: 0, percentFee: 0, totalScheduledSwapsFees: 0
  });

  const getTransactionFees = useCallback(async (action: DDCA_ACTIONS): Promise<TransactionFees> => {
    return await calculateActionFees(connection, action, 1);
  }, [connection]);

  const resetTransactionStatus = () => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }

  const isSuccess = (): boolean => {
    return transactionStatus.currentOperation === TransactionStatus.TransactionFinished;
  }

  const isError = (): boolean => {
    return  transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ||
            transactionStatus.currentOperation === TransactionStatus.InitTransactionFailure ||
            transactionStatus.currentOperation === TransactionStatus.SignTransactionFailure ||
            transactionStatus.currentOperation === TransactionStatus.SendTransactionFailure ||
            transactionStatus.currentOperation === TransactionStatus.ConfirmTransactionFailure
            ? true
            : false;
  }

  //////////////////////
  //   Modal preps    //
  //////////////////////

  // Close ddca modal
  const [isCloseDdcaModalVisible, setIsCloseDdcaModalVisibility] = useState(false);
  const showCloseDdcaModal = useCallback(() => {
    getTransactionFees(DDCA_ACTIONS.close).then(value => {
      setdDcaTxFees(value);
      setIsCloseDdcaModalVisibility(true)
      consoleOut('transactionFees:', value, 'orange');
    });
  }, [getTransactionFees]);
  const hideCloseDdcaModal = useCallback(() => setIsCloseDdcaModalVisibility(false), []);
  const onAcceptCloseDdca = () => {
    hideCloseDdcaModal();
    onExecuteCloseDdcaTransaction();
  };

  // Close vault Transaction execution modal
  const [isCloseDdcaTransactionModalVisible, setCloseDdcaTransactionModalVisibility] = useState(false);
  const showCloseDdcaTransactionModal = useCallback(() => setCloseDdcaTransactionModalVisibility(true), []);
  const hideCloseDdcaTransactionModal = useCallback(() => setCloseDdcaTransactionModalVisibility(false), []);

  const onCloseDdcaTransactionFinished = () => {
    hideCloseDdcaTransactionModal();
  };

  const onAfterCloseDdcaTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      hideCloseDdcaTransactionModal();
    }
    resetTransactionStatus();
  }

  // Execute close
  const onExecuteCloseDdcaTransaction = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createTx = async (): Promise<boolean> => {
      if (wallet && ddcaDetails && ddcaClient) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const ddcaAccountPda = new PublicKey(ddcaDetails.ddcaAccountAddress);
        const data = {
          ddcaAccountPda: ddcaAccountPda.toBase58(),              // ddcaAccountPda
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
        consoleOut('maxBlockchainFee:', ddcaTxFees.maxBlockchainFee, 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');
        if (nativeBalance < ddcaTxFees.maxBlockchainFee) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${
              getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getTokenAmountAndSymbolByTokenAddress(ddcaTxFees.maxBlockchainFee, NATIVE_SOL_MINT.toBase58())
            })`
          });
          customLogger.logError('Close DDCA transaction failed', { transcript: transactionLog });
          return false;
        }

        // Create a transaction
        return await ddcaClient.createCloseTx(
          ddcaAccountPda,                                   // ddcaAccountAddress
        )
        .then(value => {
          consoleOut('createCloseTx returned transaction:', value);
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
          console.error('createCloseTx error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Close DDCA transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Close DDCA transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet && ddcaDetails && ddcaClient) {
        consoleOut('Signing transaction...');
        return await wallet.signTransaction(transaction)
        .then(async (signed: Transaction) => {
          consoleOut('signTransaction returned a signed transaction:', signed);
          signedTransaction = signed;
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: wallet.publicKey.toBase58()}
          });
          const ddcaAccountPda = new PublicKey(ddcaDetails.ddcaAccountAddress);
          try {
            const updatedTx = await ddcaClient.updateCloseTx(ddcaAccountPda, signed);
            signedTransaction = updatedTx;
            encodedTx = signedTransaction.serialize().toString('base64');
            consoleOut('encodedTx:', encodedTx, 'orange');
            setTransactionStatus({
              lastOperation: TransactionStatus.SignTransactionSuccess,
              currentOperation: TransactionStatus.SendTransaction
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
              result: 'updateCloseTx returned an updated Tx'
            });
            return true;
          } catch (error) {
            setTransactionStatus({
              lastOperation: TransactionStatus.SignTransaction,
              currentOperation: TransactionStatus.SignTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
              result: { signer: `${wallet.publicKey.toBase58()}`, error: `${error}` }
            });
            customLogger.logWarning('Close DDCA transaction failed', { transcript: transactionLog });
            return false;
          }
        })
        .catch(error => {
          console.error('Signing transaction failed!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('Close DDCA transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Close DDCA transaction failed', { transcript: transactionLog });
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
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.SendTransactionSuccess
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
            customLogger.logError('Close DDCA transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Close DDCA transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet) {
      showCloseDdcaTransactionModal();
      const create = await createTx();
      consoleOut('create:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('sign:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            startFetchTxSignatureInfo(signature, "finalized", OperationType.DdcaClose);
            setIsBusy(false);
            // Give time for several renders so startFetchTxSignatureInfo can update TransactionStatusContext
            await delay(250);
            onCloseDdcaTransactionFinished();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  const getStreamClosureMessage = () => {
    let message = `Your recurring purchase will be cancelled, and you'll get these back in your wallet:`;

    return (
      <div>{message}</div>
    );
  }

  // Withdraw modal
  const [isWithdrawModalVisible, setIsWithdrawModalVisibility] = useState(false);
  const showWithdrawModal = useCallback(() => {
    getTransactionFees(DDCA_ACTIONS.withdraw).then(value => {
      setdDcaTxFees(value);
      setIsWithdrawModalVisibility(true)
      consoleOut('transactionFees:', value, 'orange');
    });
  }, [getTransactionFees]);
  const hideWithdrawModal = useCallback(() => setIsWithdrawModalVisibility(false), []);
  const onAcceptWithdraw = (amount: any) => {
    hideWithdrawModal();
    consoleOut('Withdraw amount:', parseFloat(amount));
    onExecuteWithdrawTransaction(amount);
  };

  // Withdraw Transaction execution modal
  const [isWithdrawTransactionModalVisible, setWithdrawTransactionModalVisibility] = useState(false);
  const showWithdrawTransactionModal = useCallback(() => setWithdrawTransactionModalVisibility(true), []);
  const hideWithdrawTransactionModal = useCallback(() => setWithdrawTransactionModalVisibility(false), []);
  const [withdrawFundsAmount, setWithdrawFundsAmount] = useState<number>(0);

  const onWithdrawTransactionFinished = () => {
    hideWithdrawTransactionModal();
  };

  const onAfterWithdrawTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      hideWithdrawTransactionModal();
    }
    resetTransactionStatus();
  }

  // Execute withdraw
  const onExecuteWithdrawTransaction = async (withdrawAmount: string) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createTx = async (): Promise<boolean> => {
      if (wallet && ddcaDetails && ddcaClient) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const ddcaAccountPda = new PublicKey(ddcaDetails.ddcaAccountAddress);
        const amount = parseFloat(withdrawAmount);
        setWithdrawFundsAmount(amount);

        const data = {
          ddcaAccountAddress: ddcaAccountPda.toBase58(),              // ddcaAccountPda
          withdrawAmount: amount                                      // amount
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
        const lamports = await connection.getBalance(wallet.publicKey);
        const balance = (lamports / LAMPORTS_PER_SOL) || 0;
        setNativeBalance(balance);
        consoleOut('maxBlockchainFee:', ddcaTxFees.maxBlockchainFee, 'blue');
        consoleOut('nativeBalance:', balance, 'blue');
        if (balance < ddcaTxFees.maxBlockchainFee) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${
              getTokenAmountAndSymbolByTokenAddress(balance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getTokenAmountAndSymbolByTokenAddress(ddcaTxFees.maxBlockchainFee, NATIVE_SOL_MINT.toBase58())
            })`
          });
          customLogger.logError('DDCA withdraw transaction failed', { transcript: transactionLog });
          return false;
        }

        // Create a transaction
        return await ddcaClient.createWithdrawTx(
          ddcaAccountPda,                                   // ddcaAccountAddress
          amount                                            // withdrawAmount
        )
        .then(value => {
          consoleOut('createWithdrawTx returned transaction:', value);
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
          console.error('createWithdrawTx error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('DDCA withdraw transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('DDCA withdraw transaction failed', { transcript: transactionLog });
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
            customLogger.logWarning('DDCA withdraw transaction failed', { transcript: transactionLog });
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
          console.error('Signing transaction failed!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('DDCA withdraw transaction failed', { transcript: transactionLog });
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
        customLogger.logError('DDCA withdraw transaction failed', { transcript: transactionLog });
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
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.SendTransactionSuccess
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
            customLogger.logError('DDCA withdraw transaction failed', { transcript: transactionLog });
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
        customLogger.logError('DDCA withdraw transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet) {
      showWithdrawTransactionModal();
      const create = await createTx();
      consoleOut('create:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('sign:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            startFetchTxSignatureInfo(signature, "finalized", OperationType.DdcaWithdraw);
            setIsBusy(false);
            // Give time for several renders so startFetchTxSignatureInfo can update TransactionStatusContext
            await delay(250);
            onWithdrawTransactionFinished();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  // AddFunds modal
  const [isAddFundsModalVisible, setIsAddFundsModalVisibility] = useState(false);
  const showAddFundsModal = useCallback(() => {
    getTransactionFees(DDCA_ACTIONS.addFunds).then(value => {
      setdDcaTxFees(value);
      consoleOut('transactionFees:', value, 'orange');
      setIsAddFundsModalVisibility(true)
    });
  }, [getTransactionFees]);
  const hideAddFundsModal = useCallback(() => setIsAddFundsModalVisibility(false), []);

  //////////////////////
  //   Data Related   //
  //////////////////////

  // Load DDCA activity by ddcaAddress
  const reloadDdcaItemActivity = useCallback((ddcaAccountAddress: string) => {
    if (!ddcaClient) { return; }

    setLoadingActivity(true);
    consoleOut('Loading activity...', '', 'blue');
    const ddcaAddress = new PublicKey(ddcaAccountAddress as string);
    ddcaClient.getActivity(ddcaAddress)
      .then(activity => {
        if (activity) {
          setActivity(activity);
          consoleOut('Ddca activity:', activity, 'blue');
        } else {
          setActivity([]);
        }
        setLoadingActivity(false);
      })
      .catch(error => {
        console.error(error);
        setActivity([]);
        setLoadingActivity(false);
      });
  }, [
    ddcaClient
  ]);

  const reloadDdcaDetail = useCallback((address: string) => {
    if (!ddcaClient) { return; }

    setLoadingDdcaDetails(true);
    const ddcaAddress = new PublicKey(address as string);
    ddcaClient.getDdca(ddcaAddress)
      .then(ddca => {
        if (ddca) {
          setDdcaDetails(ddca);
          consoleOut('ddcaDetails:', ddca, 'blue');
          reloadDdcaItemActivity(ddca.ddcaAccountAddress);
        } else {
          setActivity([]);
        }
      })
      .catch(error => {
        console.error(error);
        setActivity([]);
      })
      .finally(() => setLoadingDdcaDetails(false));
  }, [
    ddcaClient,
    reloadDdcaItemActivity
  ]);

  const selectDdcaItem = useCallback((item: DdcaAccount) => {
    setSelectedDdca(item);
    setDtailsPanelOpen(true);
    reloadDdcaDetail(item.ddcaAccountAddress);
  }, [
    reloadDdcaDetail,
    setDtailsPanelOpen
  ]);

  // Gets the recurring buys on demmand
  const reloadRecurringBuys = useCallback((reset = false) => {
    if (!publicKey || ddcaClient === undefined) {
      return [];
    }

    if (!loadingRecurringBuys && ddcaClient) {
      setLoadingRecurringBuys(true);

      consoleOut('Calling ddcaClient.ListDdcas...', '', 'brown');
      consoleOut('ddcaClient:', ddcaClient.toString(), 'green');

      ddcaClient.listDdcas()
        .then(dcas => {
          consoleOut('recentlyCreatedVault:', recentlyCreatedVault, 'blue');
          consoleOut('Recurring buys:', dcas, 'blue');
          let item: DdcaAccount | undefined;
          if (dcas.length) {
            if (reset) {
              if (recentlyCreatedVault) {
                item = dcas.find(d => d.ddcaAccountAddress === recentlyCreatedVault);
              }
            } else {
              // Try to get current item by its ddcaAccountAddress
              if (recentlyCreatedVault) {
                item = dcas.find(i => i.ddcaAccountAddress === recentlyCreatedVault);
              } else if (selectedDdca) {
                const itemFromServer = dcas.find(i => i.ddcaAccountAddress === selectedDdca.ddcaAccountAddress);
                item = itemFromServer || selectedDdca;
              }
            }
            if (!item) {
              item = JSON.parse(JSON.stringify(dcas[0]));
            }
            if (item) {
              setSelectedDdca(item);
              setRecentlyCreatedVault('');
              consoleOut('Calling ddcaClient.getDdca...', '', 'brown');
              reloadDdcaDetail(item.ddcaAccountAddress);
            }
          } else {
            setSelectedDdca(undefined);
            setDdcaDetails(undefined);
          }
          setRecurringBuys(dcas);
        }).catch(err => {
          console.error(err);
        }).finally(() => setLoadingRecurringBuys(false));
    }
  }, [
    publicKey,
    ddcaClient,
    selectedDdca,
    loadingRecurringBuys,
    recentlyCreatedVault,
    setRecentlyCreatedVault,
    setLoadingRecurringBuys,
    reloadDdcaDetail,
    setRecurringBuys
  ]);

  // Load recurring buys once on enter or reload if the wallet is connected
  // It means that it will be triggered if going from disconnected to connected
  useEffect(() => {

    if (previousWalletConnectState === connected && !firstLoadDone) {
      setFirstLoadDone(true);
      reloadRecurringBuys(true);
    }

    return () => {};
  }, [
    connected,
    firstLoadDone,
    previousWalletConnectState,
    reloadRecurringBuys
  ]);

  // Hook on the wallet connect/disconnect
  useEffect(() => {
    if (previousWalletConnectState !== connected) {
      // User is connecting
      if (!previousWalletConnectState && connected) {
        consoleOut('Loading DDCAs...', '', 'blue');
        reloadRecurringBuys(true);
      } else if (previousWalletConnectState && !connected) {
        consoleOut('Cleaning DDCAs...', '', 'blue');
        setSelectedDdca(undefined);
        setDdcaDetails(undefined);
        setRecurringBuys([]);
      }
    }
  }, [
    connected,
    previousWalletConnectState,
    reloadRecurringBuys,
    setRecurringBuys
  ]);

  ////////////////////
  //   UI Related   //
  ////////////////////

  // Window resize listeners
  useEffect(() => {
    const resizeListener = () => {
      const NUM_CHARS = 4;
      const ellipsisElements = document.querySelectorAll(".overflow-ellipsis-middle");
      for (let i = 0; i < ellipsisElements.length; ++i){
        const e = ellipsisElements[i] as HTMLElement;
        if (e.offsetWidth < e.scrollWidth){
          const text = e.textContent;
          e.dataset.tail = text?.slice(text.length - NUM_CHARS);
        }
      }
    };
    // Call it a first time
    resizeListener();

    // set resize listener
    window.addEventListener('resize', resizeListener);

    // clean up function
    return () => {
      // remove resize listener
      window.removeEventListener('resize', resizeListener);
    }
  }, []);

  // Keep flag for small screens
  useEffect(() => {
    if (isSmallUpScreen && width < 576) {
      setIsSmallUpScreen(false);
    }
  }, [
    width,
    isSmallUpScreen,
    detailsPanelOpen,
    setDtailsPanelOpen
  ]);

  // Handle what to do when pending Tx confirmation reaches finality or on error
  useEffect(() => {
    if (!ddcaClient || !ddcaDetails) { return; }

    if (lastSentTxSignature && (fetchTxInfoStatus === "fetched" || fetchTxInfoStatus === "error")) {
      if (lastSentTxOperationType === OperationType.DdcaClose) {
        clearTransactionStatusContext();
        reloadRecurringBuys();
      } else {
        clearTransactionStatusContext();
        reloadDdcaDetail(ddcaDetails.ddcaAccountAddress);
      }
    }
  }, [
    ddcaClient,
    ddcaDetails,
    fetchTxInfoStatus,
    lastSentTxSignature,
    lastSentTxOperationType,
    reloadRecurringBuys,
    reloadDdcaDetail,
    clearTransactionStatusContext,
  ]);

  ////////////////
  //   Events   //
  ////////////////

  const onCopyRecurringBuyAddress = (data: any) => {
    if (copyText(data.toString())) {
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
  }

  ///////////////////
  //   Rendering   //
  ///////////////////

  const getShortDate = (date: string, includeTime = false): string => {
    if (!date) { return ''; }
    const localDate = new Date(date);
    return dateFormat(
      localDate,
      includeTime ? SIMPLE_DATE_TIME_FORMAT : SIMPLE_DATE_FORMAT
    );
  }

  const getRecurringBuyTitle = (item: DdcaAccount) => {
    const toToken = MEAN_TOKEN_LIST.find(t => t.address === item.toMint);
    return `Buy ${getTokenAmountAndSymbolByTokenAddress(item.amountPerSwap, item.fromMint)} worth of ${toToken?.symbol}`;
  }

  const getRecurringBuySubTitle = (item: DdcaAccount) => {
    return `Last purchased ${getShortDate(item.startUtc as string)}`;
  }

  const getRecurrencePeriod = (item: DdcaAccount | undefined): string => {
    if (!item) { return ''; }
    switch (item.intervalInSeconds) {
      case 86400:
        return 'Day';
      case 604800:
        return 'Week';
      case 1209600:
        return '2 Weeks';
      case 2629750:
        return 'Month';
      default:
        return '';
    }
  }

  const getBuyIconPair = (item: DdcaAccount) => {
    const fromToken = MEAN_TOKEN_LIST.find(t => t.address === item.fromMint);
    const toToken = MEAN_TOKEN_LIST.find(t => t.address === item.toMint);
    return (
      <>
        <div className="overlapped-tokens">
          <div className="token-icon from">
            {fromToken && fromToken.logoURI ? (
              <img alt={`${fromToken.name}`} width={30} height={30} src={fromToken.logoURI} />
            ) : (
              <Identicon address={item.fromMint} style={{ width: "30", display: "inline-flex" }} />
            )}
          </div>
          <div className="token-icon to">
            {toToken && toToken.logoURI ? (
              <img alt={`${toToken.name}`} width={30} height={30} src={toToken.logoURI} />
            ) : (
              <Identicon address={item.toMint} style={{ width: "30", display: "inline-flex" }} />
            )}
          </div>
        </div>
      </>
    );
  }

  const getReadableDate = (date: string, includeTime = false): string => {
    if (!date) { return ''; }
    const localDate = new Date(date);
    return dateFormat(
      localDate,
      includeTime ? VERBOSE_DATE_TIME_FORMAT : VERBOSE_DATE_FORMAT
    );
  }

  const getToken = (tokenAddress: string) => {
    return MEAN_TOKEN_LIST.find(t => t.address === tokenAddress);
  }

  const getTokenIcon = (tokenAddress: string) => {
    const token = MEAN_TOKEN_LIST.find(t => t.address === tokenAddress);
    if (!token || !ddcaDetails) {
      return null;
    }
    return (
      <span className="info-icon token-icon">
        {token.logoURI ? (
          <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} />
        ) : (
          <Identicon address={ddcaDetails.fromMint} style={{ width: "30", display: "inline-flex" }} />
        )}
      </span>
    );
  }

  const getTokenIconAndAmount = (tokenAddress: string, amount: number) => {
    const token = MEAN_TOKEN_LIST.find(t => t.address === tokenAddress);
    if (!token || !ddcaDetails) {
      return null;
    }
    return (
      <>
        <span className="info-icon token-icon">
          {token.logoURI ? (
            <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} />
          ) : (
            <Identicon address={ddcaDetails.fromMint} style={{ width: "30", display: "inline-flex" }} />
          )}
        </span>
        <span className="info-data ml-1">{getTokenAmountAndSymbolByTokenAddress(amount, token.address)}</span>
      </>
    );
  }

  const getDetailsPanelTitle = (item: DdcaDetails) => {
    const recurrencePeriod = getRecurrencePeriod(item);
    const toToken = MEAN_TOKEN_LIST.find(t => t.address === item.toMint);

    return (
      <span>Buying <strong>{getTokenAmountAndSymbolByTokenAddress(
          item.amountPerSwap,
          item.fromMint)}</strong> worth of <strong>{toToken?.symbol}</strong> every <span className="text-lowercase">{recurrencePeriod}</span>
      </span>
    );
  }

  const getActivityIcon = (item: DdcaActivity) => {
    switch (item.action) {
      case "deposited":
        return (
          <ArrowDownOutlined className="mean-svg-icons incoming" />
        );
      case "withdrew":
        return (
          <ArrowUpOutlined className="mean-svg-icons outgoing" />
        );
      case "exchanged":
        return (
          <IconExchange className="mean-svg-icons" />
        );
      default:
        return '-';
    }

  }

  const getActivityTitle = (item: DdcaActivity): string => {
    let result = '';
    switch (item.action) {
      case "deposited":
        result = t('ddcas.activity.action-deposit', {
          fromAmount: getTokenAmountAndSymbolByTokenAddress(item.fromAmount || 0, item.fromMint || '')
        });
        break;
      case "withdrew":
        result = t('ddcas.activity.action-withdraw', {
          toAmount: getTokenAmountAndSymbolByTokenAddress(item.toAmount || 0, item.toMint || '')
        });
        break;
      case "exchanged":
        result = t('ddcas.activity.action-exchange', {
          fromAmount: getTokenAmountAndSymbolByTokenAddress(item.fromAmount || 0, item.fromMint || ''),
          toAmount: getTokenAmountAndSymbolByTokenAddress(item.toAmount || 0, item.toMint || '')
        });
        break;
      default:
        result = '-';
        break;
    }
    return result;
  }

  const getOfflineActivityTitle = (item: DdcaDetails): string => {
    const result = `Exchanged ${
      getTokenAmountAndSymbolByTokenAddress(item.amountPerSwap, item.fromMint)
    } for ${
      getTokenAmountAndSymbolByTokenAddress(item.toBalance, item.toMint)
    }`;
    return result;
  }

  const isCreating = (): boolean => {
    return fetchTxInfoStatus === "fetching" && lastSentTxOperationType === OperationType.DdcaCreate
            ? true
            : false;
  }

  const isClosing = (): boolean => {
    return fetchTxInfoStatus === "fetching" && lastSentTxOperationType === OperationType.DdcaClose
            ? true
            : false;
  }

  const isWithdrawing = (): boolean => {
    return fetchTxInfoStatus === "fetching" && lastSentTxOperationType === OperationType.DdcaWithdraw
            ? true
            : false;
  }

  const isAddingFunds = (): boolean => {
    return fetchTxInfoStatus === "fetching" && lastSentTxOperationType === OperationType.DdcaAddFunds
            ? true
            : false;
  }

  const isNextRoundScheduled = (item: DdcaDetails): boolean => {
    const now = new Date().toUTCString();
    const nowUtc = new Date(now);
    const nextScheduledDate = new Date(item.nextScheduledSwapUtc as string);
    if (nextScheduledDate > nowUtc) {
      return true;
    }
    return false;
  }

  const menu = (
    <Menu>
      {/*
        *     If exchangeFor is > 0 -> Withdraw is visible
      */}
      {(ddcaDetails && ddcaDetails.toBalance > 0) && (
        <Menu.Item key="1" onClick={showWithdrawModal}>
          <span className="menu-item-text">Withdraw</span>
        </Menu.Item>
      )}
      <Menu.Item key="2" onClick={showCloseDdcaModal}>
        <span className="menu-item-text">Cancel and withdraw everything</span>
      </Menu.Item>
    </Menu>
  );

  const renderRecurringBuy = (
    <>
      <div className="transaction-list-data-wrapper vertical-scroll">

        <Spin spinning={loadingDdcaDetails}>
          <div className="stream-fields-container">
            {ddcaDetails && (
              <h2>{getDetailsPanelTitle(ddcaDetails)}</h2>
            )}

            {/* Start date */}
            {ddcaDetails && (
              <div className="mb-3">
                <div className="info-label">
                  {t('streams.stream-detail.label-start-date-started')}
                </div>
                <div className="transaction-detail-row">
                  <span className="info-icon">
                    <IconClock className="mean-svg-icons" />
                  </span>
                  <span className="info-data">
                    {getReadableDate(ddcaDetails.startUtc as string)}
                  </span>
                </div>
              </div>
            )}

            {/* Total deposits / Total left */}
            {ddcaDetails && (
              <Row className="mb-3">
                <Col span={11}>
                  <div className="info-label">Total deposits</div>
                  <div className="transaction-detail-row">
                    {getTokenIconAndAmount(
                      ddcaDetails.fromMint,
                      ddcaDetails.totalDepositsAmount
                    )}
                  </div>
                </Col>
                <Col span={13} className="pl-4">
                  <div className="info-label">
                    Total left (will run out by {getShortDate(ddcaDetails.fromBalanceWillRunOutByUtc)})
                  </div>
                  <div className="transaction-detail-row">
                    {getTokenIconAndAmount(ddcaDetails.fromMint, ddcaDetails.fromBalance)}
                  </div>
                </Col>
              </Row>
            )}

            {/* Exchanged for */}
            {ddcaDetails && (
              <div className="mb-3">
                <div className="info-label">
                  Exchanged for (avg rate 1 {getToken(ddcaDetails.fromMint)?.symbol} ≈ {getTokenAmountAndSymbolByTokenAddress(
                      ddcaDetails.swapAvgRate,
                      ddcaDetails.toMint
                    )})
                </div>
                <div className="transaction-detail-row">
                  {getTokenIcon(ddcaDetails.toMint)}
                  <span className="info-data large">
                    {getTokenAmountAndSymbolByTokenAddress(
                      ddcaDetails.toBalance,
                      ddcaDetails.toMint
                    )}
                  </span>
                </div>
              </div>
            )}

            {/* Next schaduled exchange */}
            {ddcaDetails && (
              <div className="mb-3">
                <div className="info-label">Next scheduled exchange</div>
                <div className="transaction-detail-row">
                  <span className="info-icon">
                    <IconClock className="mean-svg-icons" />
                  </span>
                  <span className="info-data">
                    {getReadableDate(ddcaDetails.nextScheduledSwapUtc as string)}
                  </span>
                </div>
              </div>
            )}

            {/* Top up (add funds) button */}
            {/*
              * Top up will always be there
              * [...]
              *  Visibe If exchangeFor > 0 || totalLeft is > 0
              *  {
              *     If exchangeFor is > 0 -> Withdraw is visible
              *  }
            */}
            <div className="mt-3 mb-3 withdraw-container">
              <Button
                block
                className="withdraw-cta"
                type="text"
                shape="round"
                size="small"
                disabled={fetchTxInfoStatus === "fetching"}
                onClick={showAddFundsModal}>
                {fetchTxInfoStatus === "fetching" && (<LoadingOutlined />)}
                {isCreating()
                  ? t('ddcas.add-funds-cta-disabled-executing-swap')
                  : isClosing()
                    ? t('ddcas.add-funds-cta-disabled-closing')
                    : isAddingFunds()
                      ? t('ddcas.add-funds-cta-disabled-funding')
                      : isWithdrawing()
                        ? t('ddcas.add-funds-cta-disabled-withdrawing')
                        : t('streams.stream-detail.add-funds-cta')
                }
              </Button>
              {(ddcaDetails && (ddcaDetails.toBalance > 0 || ddcaDetails.fromBalance > 0) && fetchTxInfoStatus !== "fetching") && (
                <Dropdown overlay={menu} trigger={["click"]}>
                  <Button
                    shape="round"
                    type="text"
                    size="small"
                    className="ant-btn-shaded"
                    onClick={(e) => e.preventDefault()}
                    icon={<EllipsisOutlined />}
                  ></Button>
                </Dropdown>
              )}
            </div>
          </div>
        </Spin>

        {/* Activity list */}
        <div className="activity-list">
          <>
            {!activity || activity.length === 0 ? (
              <>
                <div className="item-list-header compact">
                  <div className="header-row">
                    <div className="std-table-cell first-cell">&nbsp;</div>
                    <div className="std-table-cell responsive-cell">
                      {t('streams.stream-activity.heading')}
                    </div>
                    <div className="std-table-cell fixed-width-150">
                      {t('streams.stream-activity.label-date')}
                    </div>
                  </div>
                </div>
                <div className="item-list-body compact">
                  {(ddcaDetails && loadingActivity) && (
                    <>
                      {isNextRoundScheduled(ddcaDetails) && (
                        <span className="item-list-row simplelink">
                          <div className="std-table-cell first-cell">
                            <IconExchange className="mean-svg-icons"/>
                          </div>
                          <div className="std-table-cell responsive-cell">
                            <span className="align-middle">{getOfflineActivityTitle(ddcaDetails)}</span>
                          </div>
                          <div className="std-table-cell fixed-width-150">
                            <span className="align-middle">{getShortDate(ddcaDetails.startUtc as string, true)}</span>
                          </div>
                        </span>
                      )}
                      <span className="item-list-row simplelink">
                        <div className="std-table-cell first-cell">
                          <ArrowDownOutlined className="incoming"/>
                        </div>
                        <div className="std-table-cell responsive-cell">
                          <span className="align-middle">Deposited {getTokenAmountAndSymbolByTokenAddress(ddcaDetails.totalDepositsAmount, ddcaDetails.fromMint)}</span>
                        </div>
                        <div className="std-table-cell fixed-width-150">
                          <span className="align-middle">{getShortDate(ddcaDetails.startUtc as string, true)}</span>
                        </div>
                      </span>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
              <div className="item-list-header compact">
                <div className="header-row">
                  <div className="std-table-cell first-cell">&nbsp;</div>
                  <div className="std-table-cell responsive-cell">
                    {t('streams.stream-activity.heading')}
                  </div>
                  <div className="std-table-cell fixed-width-150">
                    {t('streams.stream-activity.label-date')}
                  </div>
                </div>
              </div>
              <div className="item-list-body compact">
                {activity.map((item, index) => {
                  return (
                    <a key={`${index}`} className="item-list-row" target="_blank" rel="noopener noreferrer"
                        href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${item.transactionSignature}${getSolanaExplorerClusterParam()}`}>
                      <div className="std-table-cell first-cell">{getActivityIcon(item)}</div>
                      <div className="std-table-cell responsive-cell">
                        <span className="align-middle">{getActivityTitle(item)}</span>
                      </div>
                      <div className="std-table-cell fixed-width-150" >
                        <span className="align-middle">{getShortDate(item.dateUtc as string, true)}</span>
                      </div>
                    </a>
                  );
                })}
              </div>
              </>
            )}
          </>
        </div>

      </div>
      {selectedDdca && (
        <div className="stream-share-ctas">
          <span
            className="copy-cta"
            onClick={() => onCopyRecurringBuyAddress(selectedDdca.ddcaAccountAddress)}
          >
            {selectedDdca.ddcaAccountAddress}
          </span>
          <a
            className="explorer-cta"
            target="_blank"
            rel="noopener noreferrer"
            href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${
              selectedDdca.ddcaAccountAddress
            }${getSolanaExplorerClusterParam()}`}
          >
            <IconExternalLink className="mean-svg-icons" />
          </a>
        </div>
      )}
    </>
  );

  const renderRecurringBuys = (
    <>
    {(publicKey && recurringBuys && recurringBuys.length > 0) ? (
      recurringBuys.map((item, index) => {
        const onBuyClick = () => {
          consoleOut('select buy:', item, 'blue');
          selectDdcaItem(item);
        };
        return (
          <div key={`${index + 50}`} onClick={onBuyClick}
               className={`transaction-list-row ${ddcaDetails && ddcaDetails.ddcaAccountAddress === item.ddcaAccountAddress ? 'selected' : ''}`}>
            <div className="icon-cell">
              {getBuyIconPair(item)}
            </div>
            <div className="description-cell">
              <div className="title">
                {getRecurringBuyTitle(item)}
              </div>
              <div className="subtitle text-truncate">
              {getRecurringBuySubTitle(item)}
              </div>
            </div>
            <div className="rate-cell">
              <div className="rate-amount">Every</div>
              <div className="interval">{getRecurrencePeriod(item)}</div>
            </div>
          </div>
        );
      })
    ) : (
      <div className="h-75 flex-center">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    )}
    </>
  );

  return (
    <>
      <div className="container main-container">

        {isLocal() && (
          <div className="debug-bar">
            <span className="secondary-link" onClick={() => clearTransactionStatusContext()}>[STOP]</span>
            <span className="ml-1">proggress:</span><span className="ml-1 font-bold fg-dark-active">{fetchTxInfoStatus || '-'}</span>
            <span className="ml-1">status:</span><span className="ml-1 font-bold fg-dark-active">{lastSentTxStatus || '-'}</span>
            <span className="ml-1">recentlyCreatedVault:</span><span className="ml-1 font-bold fg-dark-active">{recentlyCreatedVault ? shortenAddress(recentlyCreatedVault, 8) : '-'}</span>
            <span className="ml-1">lastSentTxSignature:</span><span className="ml-1 font-bold fg-dark-active">{lastSentTxSignature ? shortenAddress(lastSentTxSignature, 8) : '-'}</span>
          </div>
        )}

        <div className="interaction-area">

          <div className={`meanfi-two-panel-layout ${detailsPanelOpen ? 'details-open' : ''}`}>

            {/* Left / top panel*/}
            <div className="meanfi-two-panel-left">
              <div className="meanfi-panel-heading">
                <span className="title">{t('ddcas.screen-title')}</span>
                <Tooltip placement="bottom" title="Reload">
                  <div className={`user-address ${loadingRecurringBuys ? 'click-disabled' : 'simplelink'}`}
                       onClick={() => reloadRecurringBuys(true)}>
                    <Spin size="small" />
                    <span className="transaction-legend">
                      (<span>{formatThousands(recurringBuys.length || 0)}</span>)
                      <IconRefresh className="mean-svg-icons"/>
                    </span>
                  </div>
                </Tooltip>
              </div>
              <div className="inner-container">
                <div className="item-block vertical-scroll">
                  <Spin spinning={loadingRecurringBuys}>
                    {renderRecurringBuys}
                  </Spin>
                </div>
              </div>
            </div>

            {/* Right / down panel */}
            <div className="meanfi-two-panel-right">
              <div className="meanfi-panel-heading"><span className="title">Exchange details</span></div>
              <div className="inner-container">
                {ddcaDetails ? renderRecurringBuy : (
                  <div className="h-75 flex-center">
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>

      </div>

      <DdcaCloseModal
        isVisible={isCloseDdcaModalVisible}
        transactionFees={ddcaTxFees}
        handleOk={onAcceptCloseDdca}
        handleClose={hideCloseDdcaModal}
        content={getStreamClosureMessage()}
        ddcaDetails={ddcaDetails}
      />

      <DdcaWithdrawModal
        isVisible={isWithdrawModalVisible}
        handleOk={onAcceptWithdraw}
        handleClose={hideWithdrawModal}
        ddcaDetails={ddcaDetails}
        transactionFees={ddcaTxFees}
      />

      {isAddFundsModalVisible && (
        <DdcaAddFundsModal
          endpoint={endpoint}
          connection={connection}
          ddcaDetails={ddcaDetails}
          isVisible={isAddFundsModalVisible}
          ddcaTxFees={ddcaTxFees}
          handleOk={hideAddFundsModal}
          handleClose={hideAddFundsModal}
          userBalance={nativeBalance}
        />
      )}

      {/* Close vault transaction execution modal */}
      <Modal
        className="mean-modal no-full-screen"
        maskClosable={false}
        afterClose={onAfterCloseDdcaTransactionModalClosed}
        visible={isCloseDdcaTransactionModalVisible}
        title={getTransactionModalTitle(transactionStatus, isBusy, t)}
        onCancel={hideCloseDdcaTransactionModal}
        width={330}
        footer={null}>
        <div className="transaction-progress">
          {isBusy ? (
            <>
              <Spin indicator={bigLoadingIcon} className="icon" />
              <h4 className="font-bold mb-1">{getTransactionOperationDescription(transactionStatus.currentOperation, t)}</h4>
              <h5 className="operation">{t('transactions.status.tx-close-vault-operation')}</h5>
              {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
                <div className="indication">{t('transactions.status.instructions')}</div>
              )}
            </>
          ) : isSuccess() ? (
            <>
              <CheckOutlined style={{ fontSize: 48 }} className="icon" />
              <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus.currentOperation, t)}</h4>
              <p className="operation">{t('transactions.status.tx-close-vault-operation-success')}</p>
              <Button
                block
                type="primary"
                shape="round"
                size="middle"
                onClick={onCloseDdcaTransactionFinished}>
                {t('general.cta-finish')}
              </Button>
            </>
          ) : isError() ? (
            <>
              <WarningOutlined style={{ fontSize: 48 }} className="icon" />
              {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                <h4 className="mb-4">
                  {t('transactions.status.tx-start-failure', {
                    accountBalance: `${getTokenAmountAndSymbolByTokenAddress(
                      nativeBalance,
                      NATIVE_SOL_MINT.toBase58(),
                      true
                    )} SOL`,
                    feeAmount: `${getTokenAmountAndSymbolByTokenAddress(
                      ddcaTxFees.maxBlockchainFee,
                      NATIVE_SOL_MINT.toBase58(),
                      true
                    )} SOL`})
                  }
                </h4>
              ) : (
                <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus.currentOperation, t)}</h4>
              )}
              <Button
                block
                type="primary"
                shape="round"
                size="middle"
                onClick={hideCloseDdcaTransactionModal}>
                {t('general.cta-close')}
              </Button>
            </>
          ) : (
            <>
              <Spin indicator={bigLoadingIcon} className="icon" />
              <h4 className="font-bold mb-4 text-uppercase">{t('transactions.status.tx-wait')}...</h4>
            </>
          )}
        </div>
      </Modal>

      {/* Withdraw funds transaction execution modal */}
      <Modal
        className="mean-modal no-full-screen"
        maskClosable={false}
        afterClose={onAfterWithdrawTransactionModalClosed}
        visible={isWithdrawTransactionModalVisible}
        title={getTransactionModalTitle(transactionStatus, isBusy, t)}
        onCancel={hideWithdrawTransactionModal}
        width={330}
        footer={null}>
        <div className="transaction-progress">
          {isBusy ? (
            <>
              <Spin indicator={bigLoadingIcon} className="icon" />
              <h4 className="font-bold mb-1">{getTransactionOperationDescription(transactionStatus.currentOperation, t)}</h4>
              <h5 className="operation">{t('transactions.status.tx-withdraw-operation')} {getTokenAmountAndSymbolByTokenAddress(withdrawFundsAmount, ddcaDetails?.toMint as string)}</h5>
              {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
                <div className="indication">{t('transactions.status.instructions')}</div>
              )}
            </>
          ) : isSuccess() ? (
            <>
              <CheckOutlined style={{ fontSize: 48 }} className="icon" />
              <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus.currentOperation, t)}</h4>
              <p className="operation">{t('transactions.status.tx-withdraw-operation-success')}</p>
              <Button
                block
                type="primary"
                shape="round"
                size="middle"
                onClick={onWithdrawTransactionFinished}>
                {t('general.cta-close')}
              </Button>
            </>
          ) : isError() ? (
            <>
              <WarningOutlined style={{ fontSize: 48 }} className="icon" />
              {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                <h4 className="mb-4">
                  {t('transactions.status.tx-start-failure', {
                      accountBalance: getTokenAmountAndSymbolByTokenAddress(
                        nativeBalance,
                        NATIVE_SOL_MINT.toBase58()
                      ),
                      feeAmount: getTokenAmountAndSymbolByTokenAddress(
                        ddcaTxFees.maxBlockchainFee,
                        NATIVE_SOL_MINT.toBase58()
                      )
                    })
                  }
                </h4>
              ) : (
                <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus.currentOperation, t)}</h4>
              )}
              <Button
                block
                type="primary"
                shape="round"
                size="middle"
                onClick={hideWithdrawTransactionModal}>
                {t('general.cta-close')}
              </Button>
            </>
          ) : (
            <>
              <Spin indicator={bigLoadingIcon} className="icon" />
              <h4 className="font-bold mb-4 text-uppercase">{t('transactions.status.tx-wait')}...</h4>
            </>
          )}
        </div>
      </Modal>

      <PreFooter />
    </>
  );

};
