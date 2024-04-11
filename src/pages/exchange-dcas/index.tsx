import {
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowUpOutlined,
  CheckOutlined,
  LoadingOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  calculateActionFees,
  DdcaAccount,
  DdcaActivity,
  DdcaClient,
  DdcaDetails,
  DDCA_ACTIONS,
  TransactionFees,
} from '@mean-dao/ddca';
import { LAMPORTS_PER_SOL, PublicKey, Transaction } from '@solana/web3.js';
import { Button, Col, Empty, Modal, Row, Spin, Tooltip } from 'antd';
import { DdcaCloseModal } from 'components/DdcaCloseModal';
import { DdcaWithdrawModal } from 'components/DdcaWithdrawModal';
import { Identicon } from 'components/Identicon';
import { openNotification } from 'components/Notifications';
import { PreFooter } from 'components/PreFooter';
import {
  SOLANA_EXPLORER_URI_INSPECT_ADDRESS,
  SOLANA_EXPLORER_URI_INSPECT_TRANSACTION,
  VERBOSE_DATE_FORMAT,
  VERBOSE_DATE_TIME_FORMAT,
} from 'constants/common';
import { MEAN_TOKEN_LIST } from 'constants/tokens';
import { useNativeAccount } from 'contexts/accounts';
import { AppStateContext } from 'contexts/appstate';
import { getSolanaExplorerClusterParam, useConnection, useConnectionConfig } from 'contexts/connection';
import { confirmationEvents, TxConfirmationContext, TxConfirmationInfo } from 'contexts/transaction-status';
import { useWallet } from 'contexts/wallet';
import dateFormat from 'dateformat';
import useWindowSize from 'hooks/useWindowResize';
import { IconClock, IconExchange, IconExternalLink } from 'Icons';
import { customLogger } from 'index';
import { SOL_MINT } from 'middleware/ids';
import { composeTxWithPrioritizationFees, sendTx, serializeTx, signTx } from 'middleware/transactions';
import {
  consoleOut,
  copyText,
  getShortDate,
  getTransactionModalTitle,
  getTransactionOperationDescription,
  getTransactionStatusForLogs,
  isLocal,
} from 'middleware/ui';
import { formatThousands, getAmountFromLamports, getAmountWithSymbol, getTxIxResume } from 'middleware/utils';
import { EventType, OperationType, TransactionStatus } from 'models/enums';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isDesktop } from 'react-device-detect';
import { useTranslation } from 'react-i18next';
import './style.scss';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const ExchangeDcasView = () => {
  const {
    splTokenList,
    recurringBuys,
    transactionStatus,
    loadingRecurringBuys,
    previousWalletConnectState,
    setRecurringBuys,
    setTransactionStatus,
    setLoadingRecurringBuys,
  } = useContext(AppStateContext);
  const { enqueueTransactionConfirmation } = useContext(TxConfirmationContext);
  const { t } = useTranslation('common');
  const connection = useConnection();
  const connectionConfig = useConnectionConfig();
  const { publicKey, wallet, connected } = useWallet();
  const { account } = useNativeAccount();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);
  const { width } = useWindowSize();
  const [isSmallUpScreen, setIsSmallUpScreen] = useState(isDesktop);
  const [selectedDdca, setSelectedDdca] = useState<DdcaAccount | undefined>();
  const [ddcaDetails, setDdcaDetails] = useState<DdcaDetails | undefined>();
  const [loadingDdcaDetails, setLoadingDdcaDetails] = useState<boolean>(false);
  const [firstLoadDone, setFirstLoadDone] = useState<boolean>(false);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [activity, setActivity] = useState<DdcaActivity[]>([]);
  const [canSubscribe, setCanSubscribe] = useState(true);
  const [detailsPanelOpen, setDetailsPanelOpen] = useState(false);

  // Set and cache the DDCA client
  const ddcaClient = useMemo(() => {
    if (connection && wallet && publicKey && connectionConfig.endpoint) {
      return new DdcaClient(connectionConfig.endpoint, wallet, { commitment: 'confirmed' }, isLocal() ? true : false);
    } else {
      return undefined;
    }
  }, [connection, connectionConfig.endpoint, publicKey, wallet]);

  // Keep track of current balance
  useEffect(() => {
    if (account?.lamports !== previousBalance || !nativeBalance) {
      setNativeBalance(getAmountFromLamports(account?.lamports));
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [account, nativeBalance, previousBalance]);

  // Transaction execution (Applies to all transactions)
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [ddcaTxFees, setdDcaTxFees] = useState<TransactionFees>({
    flatFee: 0,
    maxBlockchainFee: 0,
    maxFeePerSwap: 0,
    percentFee: 0,
    totalScheduledSwapsFees: 0,
  });

  const getTransactionFees = useCallback(
    async (action: DDCA_ACTIONS): Promise<TransactionFees> => {
      return calculateActionFees(connection, action, 1);
    },
    [connection],
  );

  const resetTransactionStatus = () => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle,
    });
  };

  const isSuccess = (): boolean => {
    return transactionStatus.currentOperation === TransactionStatus.TransactionFinished;
  };

  const isError = (): boolean => {
    return transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ||
      transactionStatus.currentOperation === TransactionStatus.InitTransactionFailure ||
      transactionStatus.currentOperation === TransactionStatus.SignTransactionFailure ||
      transactionStatus.currentOperation === TransactionStatus.SendTransactionFailure ||
      transactionStatus.currentOperation === TransactionStatus.ConfirmTransactionFailure
      ? true
      : false;
  };

  //////////////////////
  //   Modal preps    //
  //////////////////////

  // Close ddca modal
  const [isCloseDdcaModalVisible, setIsCloseDdcaModalVisibility] = useState(false);
  const showCloseDdcaModal = useCallback(() => {
    getTransactionFees(DDCA_ACTIONS.close).then(value => {
      setdDcaTxFees(value);
      setIsCloseDdcaModalVisibility(true);
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
    setIsBusy(false);
  };

  const onAfterCloseDdcaTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      hideCloseDdcaTransactionModal();
    }
    resetTransactionStatus();
  };

  // Execute close
  const onExecuteCloseDdcaTransaction = async () => {
    let transaction: Transaction | null = null;
    let signature: any;
    let encodedTx: string;
    let transactionLog: any[] = [];

    setTransactionCancelled(false);
    setIsBusy(true);

    const closeDdcaTx = async ({ ddcaAccountAddress }: { ddcaAccountAddress: PublicKey }) => {
      if (!publicKey) {
        throw new Error('publicKey not available');
      }

      if (!ddcaClient) {
        throw new Error('ddcaClient not available');
      }

      const tx = await ddcaClient.createCloseTx(ddcaAccountAddress);

      const transaction = await composeTxWithPrioritizationFees(connection, publicKey, tx.instructions);
      transaction.signatures = tx.signatures;

      return transaction;
    };

    const createTx = async (): Promise<boolean> => {
      if (wallet && ddcaDetails && ddcaClient) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        const ddcaAccountPda = new PublicKey(ddcaDetails.ddcaAccountAddress);
        const data = {
          ddcaAccountPda: ddcaAccountPda.toBase58(), // ddcaAccountPda
        };
        consoleOut('data:', data);

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
        consoleOut('maxBlockchainFee:', ddcaTxFees.maxBlockchainFee, 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');
        if (nativeBalance < ddcaTxFees.maxBlockchainFee) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${getAmountWithSymbol(
              nativeBalance,
              SOL_MINT.toBase58(),
            )}) to pay for network fees (${getAmountWithSymbol(ddcaTxFees.maxBlockchainFee, SOL_MINT.toBase58())})`,
          });
          customLogger.logWarning('Close DDCA transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }

        // Create a transaction
        return closeDdcaTx(
          { ddcaAccountAddress: ddcaAccountPda }, // ddcaAccountAddress
        )
          .then(value => {
            consoleOut('createCloseTx returned transaction:', value);
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
            console.error('createCloseTx error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`,
            });
            customLogger.logError('Close DDCA transaction failed', {
              transcript: transactionLog,
            });
            return false;
          });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('Close DDCA transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }
    };

    const updateCloseDdcaTx = async (signed: Transaction): Promise<boolean> => {
      if (!publicKey) {
        consoleOut('No wallet available while signing the Tx', '', 'red');
        return false;
      }

      if (!ddcaDetails || !ddcaClient) {
        consoleOut('ddca client or ddca details not available while signing the Tx', '', 'red');
        return false;
      }

      try {
        const ddcaAccountPda = new PublicKey(ddcaDetails.ddcaAccountAddress);
        const updatedTx = await ddcaClient.updateCloseTx(ddcaAccountPda, signed);

        encodedTx = serializeTx(updatedTx);
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransactionSuccess,
          currentOperation: TransactionStatus.SendTransaction,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
          result: 'updateCloseTx returned an updated Tx',
        });
        return true;
      } catch (error) {
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.SignTransactionFailure,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
          result: {
            signer: `${publicKey.toBase58()}`,
            error: `${error}`,
          },
        });
        customLogger.logError('Close DDCA transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }
    };

    if (wallet && publicKey) {
      showCloseDdcaTransactionModal();
      const created = await createTx();
      consoleOut('created:', created);
      if (created && !transactionCancelled) {
        const sign = await signTx('Close DDCA', wallet, publicKey, transaction);
        if (sign.encodedTransaction && sign.signedTransaction) {
          transactionLog = transactionLog.concat(sign.log);
          encodedTx = sign.encodedTransaction;
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionSuccess,
          });
          const txUpdated = await updateCloseDdcaTx(sign.signedTransaction as Transaction);
          if (!txUpdated) {
            if (sign.error) {
              consoleOut('Close DDCA transaction update error:', sign.error, 'red');
            }
            setIsBusy(false);
            return;
          }
          // Tx was successfully updated, lets send it!
          const sent = await sendTx('Close DDCA', connection, encodedTx);
          consoleOut('sent:', sent);
          if (sent.signature && !transactionCancelled) {
            signature = sent.signature;
            consoleOut('Send Tx to confirmation queue:', signature);
            enqueueTransactionConfirmation({
              signature,
              operationType: OperationType.DdcaClose,
              finality: 'confirmed',
              txInfoFetchStatus: 'fetching',
              loadingTitle: 'Confirming transaction',
              loadingMessage: 'Close DDCA',
              completedTitle: 'Transaction confirmed',
              completedMessage: `DDCA has been closed!`,
              completedMessageTimeout: 6,
            });
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished,
            });
            onCloseDdcaTransactionFinished();
          } else {
            if (sign.error) {
              consoleOut('Close DDCA transaction sign error:', sign.error, 'red');
            }
            setIsBusy(false);
          }
        } else {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionFailure,
          });
          if (sign.error) {
            consoleOut('Close DDCA transaction sign error:', sign.error, 'red');
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
              result: `${sign.error}`,
            });
            customLogger.logError('Close DDCA transaction failed', {
              transcript: transactionLog,
            });
          }
          setIsBusy(false);
        }
      } else {
        setIsBusy(false);
      }
    }
  };

  const getStreamClosureMessage = () => {
    const message = `Your recurring purchase will be cancelled, and you'll get these back in your wallet:`;

    return <div>{message}</div>;
  };

  // Withdraw modal
  const [isWithdrawModalVisible, setIsWithdrawModalVisibility] = useState(false);
  const showWithdrawModal = useCallback(() => {
    getTransactionFees(DDCA_ACTIONS.withdraw).then(value => {
      setdDcaTxFees(value);
      setIsWithdrawModalVisibility(true);
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
  };

  // Execute withdraw
  const onExecuteWithdrawTransaction = async (withdrawAmount: string) => {
    let transaction: Transaction | null = null;
    let signature: any;
    let encodedTx: string;
    let transactionLog: any[] = [];

    setTransactionCancelled(false);
    setIsBusy(true);

    const ddcaWithdrawTx = async ({
      ddcaAccountAddress,
      withdrawAmount,
    }: {
      ddcaAccountAddress: PublicKey;
      withdrawAmount: number;
    }) => {
      if (!publicKey) {
        throw new Error('publicKey not available');
      }

      if (!ddcaClient) {
        throw new Error('ddcaClient not available');
      }

      const tx = await ddcaClient.createWithdrawTx(ddcaAccountAddress, withdrawAmount);

      const transaction = await composeTxWithPrioritizationFees(connection, publicKey, tx.instructions);
      transaction.signatures = tx.signatures;

      return transaction;
    };

    const createTx = async (): Promise<boolean> => {
      if (wallet && publicKey && ddcaDetails && ddcaClient) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        const ddcaAccountPda = new PublicKey(ddcaDetails.ddcaAccountAddress);
        const amount = parseFloat(withdrawAmount);
        setWithdrawFundsAmount(amount);

        const data = {
          ddcaAccountAddress: ddcaAccountPda.toBase58(), // ddcaAccountPda
          withdrawAmount: amount, // amount
        };
        consoleOut('data:', data);

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
        const lamports = await connection.getBalance(publicKey);
        const balance = lamports / LAMPORTS_PER_SOL || 0;
        setNativeBalance(balance);
        consoleOut('maxBlockchainFee:', ddcaTxFees.maxBlockchainFee, 'blue');
        consoleOut('nativeBalance:', balance, 'blue');
        if (balance < ddcaTxFees.maxBlockchainFee) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${getAmountWithSymbol(
              balance,
              SOL_MINT.toBase58(),
            )}) to pay for network fees (${getAmountWithSymbol(ddcaTxFees.maxBlockchainFee, SOL_MINT.toBase58())})`,
          });
          customLogger.logWarning('DDCA withdraw transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }

        // Create a transaction
        return ddcaWithdrawTx({
          ddcaAccountAddress: ddcaAccountPda, // ddcaAccountAddress
          withdrawAmount: amount, // withdrawAmount
        })
          .then(value => {
            consoleOut('createWithdrawTx returned transaction:', value);
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
            console.error('createWithdrawTx error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`,
            });
            customLogger.logError('DDCA withdraw transaction failed', {
              transcript: transactionLog,
            });
            return false;
          });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('DDCA withdraw transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }
    };

    if (wallet && publicKey) {
      showWithdrawTransactionModal();
      const created = await createTx();
      consoleOut('created:', created);
      if (created && !transactionCancelled) {
        const sign = await signTx('DDCA Withdraw', wallet, publicKey, transaction);
        if (sign.encodedTransaction) {
          encodedTx = sign.encodedTransaction;
          transactionLog = transactionLog.concat(sign.log);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionSuccess,
          });
          const sent = await sendTx('DDCA Withdraw', connection, encodedTx);
          consoleOut('sent:', sent);
          if (sent.signature && !transactionCancelled) {
            signature = sent.signature;
            consoleOut('Send Tx to confirmation queue:', signature);
            enqueueTransactionConfirmation({
              signature,
              operationType: OperationType.DdcaWithdraw,
              finality: 'confirmed',
              txInfoFetchStatus: 'fetching',
              loadingTitle: 'Confirming transaction',
              loadingMessage: 'Withdraw DDCA funds',
              completedTitle: 'Transaction confirmed',
              completedMessage: `DDCA funds successfully withdrawn`,
              completedMessageTimeout: 6,
            });
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished,
            });
            onWithdrawTransactionFinished();
          } else {
            if (sent.error) {
              consoleOut('DDCA Withdraw transaction send error:', sent.error, 'red');
            }
            setIsBusy(false);
          }
        } else {
          if (sign.error) {
            consoleOut('DDCA Withdraw transaction sign error:', sign.error, 'red');
          }
          setIsBusy(false);
        }
      } else {
        setIsBusy(false);
      }
    }
  };

  ///////////////
  // Callbacks //
  ///////////////

  // Load DDCA activity by ddcaAddress
  const reloadDdcaItemActivity = useCallback(
    (ddcaAccountAddress: string) => {
      if (!ddcaClient) {
        return;
      }

      setLoadingActivity(true);
      consoleOut('Loading activity...', '', 'blue');
      const ddcaAddress = new PublicKey(ddcaAccountAddress);
      ddcaClient
        .getActivity(ddcaAddress)
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
    },
    [ddcaClient],
  );

  const reloadDdcaDetail = useCallback(
    (address: string) => {
      if (!ddcaClient) {
        return;
      }

      setLoadingDdcaDetails(true);
      const ddcaAddress = new PublicKey(address);
      ddcaClient
        .getDdca(ddcaAddress)
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
    },
    [ddcaClient, reloadDdcaItemActivity],
  );

  const selectDdcaItem = useCallback(
    (item: DdcaAccount) => {
      setSelectedDdca(item);
      setDetailsPanelOpen(true);
      reloadDdcaDetail(item.ddcaAccountAddress);
    },
    [reloadDdcaDetail, setDetailsPanelOpen],
  );

  // Gets the recurring buys on demmand
  const reloadRecurringBuys = useCallback(() => {
    if (!publicKey || ddcaClient === undefined) {
      return [];
    }

    if (!loadingRecurringBuys && ddcaClient) {
      setLoadingRecurringBuys(true);

      consoleOut('Calling ddcaClient.ListDdcas...', '', 'blue');
      consoleOut('ddcaClient:', ddcaClient.toString(), 'green');

      ddcaClient
        .listDdcas()
        .then(dcas => {
          consoleOut('Recurring buys:', dcas, 'blue');
          let item: DdcaAccount | undefined;
          if (dcas.length) {
            // Try to get current item by its ddcaAccountAddress
            if (selectedDdca) {
              const itemFromServer = dcas.find(i => i.ddcaAccountAddress === selectedDdca.ddcaAccountAddress);
              item = itemFromServer || selectedDdca;
            }
            if (!item) {
              item = Object.assign({}, dcas[0]);
            }
            if (item) {
              setSelectedDdca(item);
              consoleOut('Calling ddcaClient.getDdca...', '', 'blue');
              reloadDdcaDetail(item.ddcaAccountAddress);
            }
          } else {
            setSelectedDdca(undefined);
            setDdcaDetails(undefined);
          }
          setRecurringBuys(dcas);
        })
        .catch(err => {
          console.error(err);
        })
        .finally(() => setLoadingRecurringBuys(false));
    }
  }, [
    publicKey,
    ddcaClient,
    selectedDdca,
    loadingRecurringBuys,
    setLoadingRecurringBuys,
    reloadDdcaDetail,
    setRecurringBuys,
  ]);

  // Event handler for Tx confirmed
  const onTxConfirmed = useCallback(
    (item: TxConfirmationInfo) => {
      if (item.operationType === OperationType.DdcaClose) {
        consoleOut(
          `ExchangeDcasView -> onTxConfirmed event handled for operation ${OperationType[item.operationType]}`,
          item,
          'crimson',
        );
        reloadRecurringBuys();
      } else {
        if (ddcaDetails) {
          reloadDdcaDetail(ddcaDetails.ddcaAccountAddress);
        }
      }
    },
    [ddcaDetails, reloadDdcaDetail, reloadRecurringBuys],
  );

  // Event handler for Tx confirmation error
  const onTxTimedout = useCallback(
    (item: TxConfirmationInfo) => {
      consoleOut(
        `ExchangeDcasView -> onTxTimedout event handled for operation ${OperationType[item.operationType]}`,
        item,
        'crimson',
      );
      reloadRecurringBuys();
    },
    [reloadRecurringBuys],
  );

  /////////////////////
  // Data management //
  /////////////////////

  useEffect(() => {
    if (previousWalletConnectState === connected && !firstLoadDone) {
      setFirstLoadDone(true);
      reloadRecurringBuys();
    }

    return () => {};
  }, [connected, firstLoadDone, previousWalletConnectState, reloadRecurringBuys]);

  // Hook on the wallet connect/disconnect
  useEffect(() => {
    if (previousWalletConnectState !== connected) {
      // User is connecting
      if (!previousWalletConnectState && connected) {
        consoleOut('Loading DDCAs...', '', 'blue');
        reloadRecurringBuys();
      } else if (previousWalletConnectState && !connected) {
        consoleOut('Cleaning DDCAs...', '', 'blue');
        setSelectedDdca(undefined);
        setDdcaDetails(undefined);
        setRecurringBuys([]);
      }
    }
  }, [connected, previousWalletConnectState, reloadRecurringBuys, setRecurringBuys]);

  // Window resize listeners
  useEffect(() => {
    const resizeListener = () => {
      const NUM_CHARS = 4;
      const ellipsisElements = document.querySelectorAll('.overflow-ellipsis-middle');
      for (const element of ellipsisElements) {
        const e = element as HTMLElement;
        if (e.offsetWidth < e.scrollWidth) {
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
    };
  }, []);

  // Keep flag for small screens
  useEffect(() => {
    if (isSmallUpScreen && width < 576) {
      setIsSmallUpScreen(false);
    }
  }, [width, isSmallUpScreen, detailsPanelOpen]);

  // Setup event listeners
  useEffect(() => {
    if (canSubscribe) {
      setCanSubscribe(false);
      consoleOut('Setup event subscriptions -> ExchangeDcasView', '', 'brown');
      confirmationEvents.on(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut('Subscribed to event txConfirmed with:', 'onTxConfirmed', 'brown');
      confirmationEvents.on(EventType.TxConfirmTimeout, onTxTimedout);
      consoleOut('Subscribed to event txTimedout with:', 'onTxTimedout', 'brown');
    }
  }, [canSubscribe, onTxConfirmed, onTxTimedout]);

  // Unsubscribe from events
  useEffect(() => {
    return () => {
      consoleOut('Stop event subscriptions -> ExchangeDcasView', '', 'brown');
      confirmationEvents.off(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut('Unsubscribed from event txConfirmed!', '', 'brown');
      confirmationEvents.off(EventType.TxConfirmTimeout, onTxTimedout);
      consoleOut('Unsubscribed from event onTxTimedout!', '', 'brown');
      setCanSubscribe(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  ////////////////
  //   Events   //
  ////////////////

  const onCopyRecurringBuyAddress = (data: any) => {
    if (copyText(data.toString())) {
      openNotification({
        description: t('notifications.account-address-copied-message'),
        type: 'info',
      });
    } else {
      openNotification({
        description: t('notifications.account-address-not-copied-message'),
        type: 'error',
      });
    }
  };

  ///////////////////
  //   Rendering   //
  ///////////////////

  const getRecurringBuyTitle = (item: DdcaAccount) => {
    const toToken = MEAN_TOKEN_LIST.find(t => t.address === item.toMint);
    return `Buy ${getAmountWithSymbol(item.amountPerSwap, item.fromMint, false, splTokenList)} worth of ${
      toToken?.symbol
    }`;
  };

  const getRecurringBuySubTitle = (item: DdcaAccount) => {
    return `Last purchased ${getShortDate(item.startUtc)}`;
  };

  const getRecurrencePeriod = (item: DdcaAccount | undefined): string => {
    if (!item) {
      return '';
    }
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
  };

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
              <Identicon address={item.fromMint} style={{ width: '30', display: 'inline-flex' }} />
            )}
          </div>
          <div className="token-icon to">
            {toToken && toToken.logoURI ? (
              <img alt={`${toToken.name}`} width={30} height={30} src={toToken.logoURI} />
            ) : (
              <Identicon address={item.toMint} style={{ width: '30', display: 'inline-flex' }} />
            )}
          </div>
        </div>
      </>
    );
  };

  const getReadableDate = (date: string, includeTime = false): string => {
    if (!date) {
      return '';
    }
    const localDate = new Date(date);
    return dateFormat(localDate, includeTime ? VERBOSE_DATE_TIME_FORMAT : VERBOSE_DATE_FORMAT);
  };

  const getToken = (tokenAddress: string) => {
    return MEAN_TOKEN_LIST.find(t => t.address === tokenAddress);
  };

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
          <Identicon address={ddcaDetails.fromMint} style={{ width: '30', display: 'inline-flex' }} />
        )}
      </span>
    );
  };

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
            <Identicon address={ddcaDetails.fromMint} style={{ width: '30', display: 'inline-flex' }} />
          )}
        </span>
        <span className="info-data ml-1">{getAmountWithSymbol(amount, token.address, false, splTokenList)}</span>
      </>
    );
  };

  const getDetailsPanelTitle = (item: DdcaDetails) => {
    const recurrencePeriod = getRecurrencePeriod(item);
    const toToken = MEAN_TOKEN_LIST.find(t => t.address === item.toMint);

    return (
      <span>
        {t('ddcas.exchange-dcas.detail-panel-word-one')}{' '}
        <strong>{getAmountWithSymbol(item.amountPerSwap, item.fromMint, false, splTokenList)}</strong>{' '}
        {t('ddcas.exchange-dcas.detail-panel-word-two')} <strong>{toToken?.symbol}</strong>{' '}
        {t('ddcas.exchange-dcas.detail-panel-word-three')} <span className="text-lowercase">{recurrencePeriod}</span>
      </span>
    );
  };

  const getActivityIcon = (item: DdcaActivity) => {
    switch (item.action) {
      case 'deposited':
        return <ArrowDownOutlined className="mean-svg-icons incoming" />;
      case 'withdrew':
        return <ArrowUpOutlined className="mean-svg-icons outgoing" />;
      case 'exchanged':
        return <IconExchange className="mean-svg-icons" />;
      default:
        return '-';
    }
  };

  const getActivityTitle = (item: DdcaActivity): string => {
    let result = '';
    switch (item.action) {
      case 'deposited':
        result = t('ddcas.activity.action-deposit', {
          fromAmount: getAmountWithSymbol(item.fromAmount || 0, item.fromMint || '', false, splTokenList),
        });
        break;
      case 'withdrew':
        result = t('ddcas.activity.action-withdraw', {
          toAmount: getAmountWithSymbol(item.toAmount || 0, item.toMint || '', false, splTokenList),
        });
        break;
      case 'exchanged':
        result = t('ddcas.activity.action-exchange', {
          fromAmount: getAmountWithSymbol(item.fromAmount || 0, item.fromMint || '', false, splTokenList),
          toAmount: getAmountWithSymbol(item.toAmount || 0, item.toMint || '', false, splTokenList),
        });
        break;
      default:
        result = '-';
        break;
    }
    return result;
  };

  const getOfflineActivityTitle = (item: DdcaDetails): string => {
    const result = `Exchanged ${getAmountWithSymbol(
      item.amountPerSwap,
      item.fromMint,
      false,
      splTokenList,
    )} for ${getAmountWithSymbol(item.toBalance, item.toMint, false, splTokenList)}`;
    return result;
  };

  const isNextRoundScheduled = (item: DdcaDetails): boolean => {
    const now = new Date().toUTCString();
    const nowUtc = new Date(now);
    const nextScheduledDate = new Date(item.nextScheduledSwapUtc);
    if (nextScheduledDate > nowUtc) {
      return true;
    }
    return false;
  };

  const onBackButtonClicked = () => {
    setDetailsPanelOpen(false);
  };

  const renderRecurringBuy = (
    <>
      <div className="transaction-list-data-wrapper vertical-scroll">
        <Spin spinning={loadingDdcaDetails}>
          <div className="stream-fields-container">
            {ddcaDetails && <h2>{getDetailsPanelTitle(ddcaDetails)}</h2>}

            {/* Start date */}
            {ddcaDetails && (
              <div className="mb-3">
                <div className="info-label">{t('streams.stream-detail.label-start-date-started')}</div>
                <div className="transaction-detail-row">
                  <span className="info-icon">
                    <IconClock className="mean-svg-icons" />
                  </span>
                  <span className="info-data">{getReadableDate(ddcaDetails.startUtc)}</span>
                </div>
              </div>
            )}

            {/* Total deposits / Total left */}
            {ddcaDetails && (
              <Row className="mb-3">
                <Col span={11}>
                  <div className="info-label">{t('ddcas.exchange-dcas.total-deposits')}</div>
                  <div className="transaction-detail-row">
                    {getTokenIconAndAmount(ddcaDetails.fromMint, ddcaDetails.totalDepositsAmount)}
                  </div>
                </Col>
                <Col span={13} className="pl-4">
                  <div className="info-label">
                    {t('ddcas.exchange-dcas.total-left')} {getShortDate(ddcaDetails.fromBalanceWillRunOutByUtc)})
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
                  {t('ddcas.exchange-dcas.exchanged-for')} {getToken(ddcaDetails.fromMint)?.symbol} ≈{' '}
                  {getAmountWithSymbol(ddcaDetails.swapAvgRate, ddcaDetails.toMint, false, splTokenList)}
                </div>
                <div className="transaction-detail-row">
                  {getTokenIcon(ddcaDetails.toMint)}
                  <span className="info-data large">
                    {getAmountWithSymbol(ddcaDetails.toBalance, ddcaDetails.toMint, false, splTokenList)}
                  </span>
                </div>
              </div>
            )}

            {/* Next scheduled exchange */}
            {ddcaDetails && (
              <div className="mb-3">
                <div className="info-label">{t('ddcas.exchange-dcas.next-scheduled-exchange')}</div>
                <div className="transaction-detail-row">
                  <span className="info-icon">
                    <IconClock className="mean-svg-icons" />
                  </span>
                  <span className="info-data">{getReadableDate(ddcaDetails.nextScheduledSwapUtc)}</span>
                </div>
              </div>
            )}

            {/* CTAs */}
            <div className="mt-3 mb-3 withdraw-container gap-3">
              <Button
                type="default"
                shape="round"
                size="small"
                onClick={showWithdrawModal}
                disabled={!ddcaDetails?.toBalance}
              >
                {t('ddcas.exchange-dcas.withdraw')}
              </Button>
              <Button type="default" shape="round" size="small" onClick={showCloseDdcaModal}>
                {t('ddcas.exchange-dcas.cancel-withdraw-everything')}
              </Button>
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
                    <div className="std-table-cell responsive-cell">{t('streams.stream-activity.heading')}</div>
                    <div className="std-table-cell fixed-width-150">{t('streams.stream-activity.label-date')}</div>
                  </div>
                </div>
                <div className="item-list-body compact">
                  {ddcaDetails && loadingActivity && (
                    <>
                      {isNextRoundScheduled(ddcaDetails) && (
                        <span className="item-list-row simplelink">
                          <div className="std-table-cell first-cell">
                            <IconExchange className="mean-svg-icons" />
                          </div>
                          <div className="std-table-cell responsive-cell">
                            <span className="align-middle">{getOfflineActivityTitle(ddcaDetails)}</span>
                          </div>
                          <div className="std-table-cell fixed-width-150">
                            <span className="align-middle">{getShortDate(ddcaDetails.startUtc, true)}</span>
                          </div>
                        </span>
                      )}
                      <span className="item-list-row simplelink">
                        <div className="std-table-cell first-cell">
                          <ArrowDownOutlined className="incoming" />
                        </div>
                        <div className="std-table-cell responsive-cell">
                          <span className="align-middle">
                            {t('ddcas.exchange-dcas.deposited')}{' '}
                            {getAmountWithSymbol(
                              ddcaDetails.totalDepositsAmount,
                              ddcaDetails.fromMint,
                              false,
                              splTokenList,
                            )}
                          </span>
                        </div>
                        <div className="std-table-cell fixed-width-150">
                          <span className="align-middle">{getShortDate(ddcaDetails.startUtc, true)}</span>
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
                    <div className="std-table-cell responsive-cell">{t('streams.stream-activity.heading')}</div>
                    <div className="std-table-cell fixed-width-150">{t('streams.stream-activity.label-date')}</div>
                  </div>
                </div>
                <div className="item-list-body compact">
                  {activity.map((item, index) => {
                    return (
                      <a
                        key={`${index}`}
                        className="item-list-row"
                        target="_blank"
                        rel="noopener noreferrer"
                        href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${
                          item.transactionSignature
                        }${getSolanaExplorerClusterParam()}`}
                      >
                        <div className="std-table-cell first-cell">{getActivityIcon(item)}</div>
                        <div className="std-table-cell responsive-cell">
                          <span className="align-middle">{getActivityTitle(item)}</span>
                        </div>
                        <div className="std-table-cell fixed-width-150">
                          <span className="align-middle">{getShortDate(item.dateUtc, true)}</span>
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
          <span className="copy-cta" onClick={() => onCopyRecurringBuyAddress(selectedDdca.ddcaAccountAddress)}>
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
      {publicKey && recurringBuys && recurringBuys.length > 0 ? (
        recurringBuys.map((item, index) => {
          const onBuyClick = () => {
            consoleOut('select buy:', item, 'blue');
            selectDdcaItem(item);
          };
          return (
            <div
              key={`${index + 50}`}
              onClick={onBuyClick}
              className={`transaction-list-row ${
                ddcaDetails && ddcaDetails.ddcaAccountAddress === item.ddcaAccountAddress ? 'selected' : ''
              }`}
            >
              <div className="icon-cell">{getBuyIconPair(item)}</div>
              <div className="description-cell">
                <div className="title">{getRecurringBuyTitle(item)}</div>
                <div className="subtitle text-truncate">{getRecurringBuySubTitle(item)}</div>
              </div>
              <div className="rate-cell">
                <div className="rate-amount">{t('ddcas.exchange-dcas.rate-amount')}</div>
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

  const getCloseVaultTxModalContent = () => {
    if (isBusy) {
      return (
        <>
          <Spin indicator={bigLoadingIcon} className="icon" />
          <h4 className="font-bold mb-1">
            {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
          </h4>
          <h5 className="operation">{t('transactions.status.tx-close-vault-operation')}</h5>
          {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
            <div className="indication">{t('transactions.status.instructions')}</div>
          )}
        </>
      );
    } else if (isSuccess()) {
      return (
        <>
          <CheckOutlined style={{ fontSize: 48 }} className="icon" />
          <h4 className="font-bold mb-1 text-uppercase">
            {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
          </h4>
          <p className="operation">{t('transactions.status.tx-close-vault-operation-success')}</p>
          <Button block type="primary" shape="round" size="middle" onClick={onCloseDdcaTransactionFinished}>
            {t('general.cta-finish')}
          </Button>
        </>
      );
    } else if (isError()) {
      return (
        <>
          <WarningOutlined style={{ fontSize: 48 }} className="icon" />
          {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
            <h4 className="mb-4">
              {t('transactions.status.tx-start-failure', {
                accountBalance: `${getAmountWithSymbol(nativeBalance, SOL_MINT.toBase58(), true)} SOL`,
                feeAmount: `${getAmountWithSymbol(ddcaTxFees.maxBlockchainFee, SOL_MINT.toBase58(), true)} SOL`,
              })}
            </h4>
          ) : (
            <h4 className="font-bold mb-1 text-uppercase">
              {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
            </h4>
          )}
          <Button block type="primary" shape="round" size="middle" onClick={hideCloseDdcaTransactionModal}>
            {t('general.cta-close')}
          </Button>
        </>
      );
    } else {
      return (
        <>
          <Spin indicator={bigLoadingIcon} className="icon" />
          <h4 className="font-bold mb-4 text-uppercase">{t('transactions.status.tx-wait')}...</h4>
        </>
      );
    }
  };

  const getWithdrawFundsTxModalContent = () => {
    if (isBusy) {
      return (
        <>
          <Spin indicator={bigLoadingIcon} className="icon" />
          <h4 className="font-bold mb-1">
            {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
          </h4>
          <h5 className="operation">
            {t('transactions.status.tx-withdraw-operation')}{' '}
            {getAmountWithSymbol(withdrawFundsAmount, ddcaDetails?.toMint as string, false, splTokenList)}
          </h5>
          {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
            <div className="indication">{t('transactions.status.instructions')}</div>
          )}
        </>
      );
    } else if (isSuccess()) {
      return (
        <>
          <CheckOutlined style={{ fontSize: 48 }} className="icon" />
          <h4 className="font-bold mb-1 text-uppercase">
            {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
          </h4>
          <p className="operation">{t('transactions.status.tx-withdraw-operation-success')}</p>
          <Button block type="primary" shape="round" size="middle" onClick={onWithdrawTransactionFinished}>
            {t('general.cta-close')}
          </Button>
        </>
      );
    } else if (isError()) {
      return (
        <>
          <WarningOutlined style={{ fontSize: 48 }} className="icon" />
          {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
            <h4 className="mb-4">
              {t('transactions.status.tx-start-failure', {
                accountBalance: getAmountWithSymbol(nativeBalance, SOL_MINT.toBase58()),
                feeAmount: getAmountWithSymbol(ddcaTxFees.maxBlockchainFee, SOL_MINT.toBase58()),
              })}
            </h4>
          ) : (
            <h4 className="font-bold mb-1 text-uppercase">
              {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
            </h4>
          )}
          <Button block type="primary" shape="round" size="middle" onClick={hideWithdrawTransactionModal}>
            {t('general.cta-close')}
          </Button>
        </>
      );
    } else {
      return (
        <>
          <Spin indicator={bigLoadingIcon} className="icon" />
          <h4 className="font-bold mb-4 text-uppercase">{t('transactions.status.tx-wait')}...</h4>
        </>
      );
    }
  };

  return (
    <>
      {detailsPanelOpen && (
        <Button
          id="back-button"
          type="default"
          shape="circle"
          icon={<ArrowLeftOutlined />}
          onClick={onBackButtonClicked}
        />
      )}
      <div className="container main-container">
        <div className="interaction-area">
          <div className={`meanfi-two-panel-layout ${detailsPanelOpen ? 'details-open' : ''}`}>
            {/* Left / top panel*/}
            <div className="meanfi-two-panel-left">
              <div className="meanfi-panel-heading">
                <span className="title">{t('ddcas.screen-title')}</span>
                <Tooltip placement="bottom" title={t('ddcas.refresh-ddcas')}>
                  <div
                    className={`user-address ${loadingRecurringBuys ? 'click-disabled' : 'simplelink'}`}
                    onClick={() => reloadRecurringBuys()}
                  >
                    <Spin size="small" />
                    <span className="transaction-legend">
                      (<span>{formatThousands(recurringBuys.length || 0)}</span>
                      )
                      <ReloadOutlined className="mean-svg-icons" />
                    </span>
                  </div>
                </Tooltip>
              </div>
              <div className="inner-container">
                <div className="item-block vertical-scroll">
                  <Spin spinning={loadingRecurringBuys}>{renderRecurringBuys}</Spin>
                </div>
              </div>
            </div>

            {/* Right / down panel */}
            <div className="meanfi-two-panel-right">
              <div className="meanfi-panel-heading">
                <span className="title">{t('ddcas.exchange-dcas.exchange-details')}</span>
              </div>
              <div className="inner-container">
                {ddcaDetails ? (
                  renderRecurringBuy
                ) : (
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

      {/* Close vault transaction execution modal */}
      <Modal
        className="mean-modal no-full-screen"
        maskClosable={false}
        afterClose={onAfterCloseDdcaTransactionModalClosed}
        open={isCloseDdcaTransactionModalVisible}
        title={getTransactionModalTitle(transactionStatus, isBusy, t)}
        onCancel={hideCloseDdcaTransactionModal}
        width={330}
        footer={null}
      >
        <div className="transaction-progress">{getCloseVaultTxModalContent()}</div>
      </Modal>

      {/* Withdraw funds transaction execution modal */}
      <Modal
        className="mean-modal no-full-screen"
        maskClosable={false}
        afterClose={onAfterWithdrawTransactionModalClosed}
        open={isWithdrawTransactionModalVisible}
        title={getTransactionModalTitle(transactionStatus, isBusy, t)}
        onCancel={hideWithdrawTransactionModal}
        width={330}
        footer={null}
      >
        <div className="transaction-progress">{getWithdrawFundsTxModalContent()}</div>
      </Modal>

      <PreFooter />
    </>
  );
};
