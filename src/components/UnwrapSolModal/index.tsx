import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Button, Modal } from "antd";
import { useTranslation } from "react-i18next";
import { useConnection } from '../../contexts/connection';
import { useWallet } from '../../contexts/wallet';
import { AppStateContext } from '../../contexts/appstate';
import { confirmationEvents, TxConfirmationContext, TxConfirmationInfo } from '../../contexts/transaction-status';
import { calculateActionFees } from '@mean-dao/money-streaming/lib/utils';
import { MSP_ACTIONS, TransactionFees } from '@mean-dao/money-streaming/lib/types';
import { useNativeAccount, useUserAccounts } from '../../contexts/accounts';
import { NO_FEES, WRAPPED_SOL_MINT_ADDRESS } from '../../constants';
import { Keypair, LAMPORTS_PER_SOL, Transaction } from '@solana/web3.js';
import { consoleOut, getTransactionStatusForLogs, percentage } from '../../utils/ui';
import { EventType, OperationType, TransactionStatus } from '../../models/enums';
import { customLogger } from '../..';
import { cutNumber, formatThousands, getTxIxResume, isValidNumber, toUiAmount } from '../../utils/utils';
import { LoadingOutlined } from '@ant-design/icons';
import BN from 'bn.js';
import { openNotification } from '../Notifications';
import { unwrapSol } from '@mean-dao/hybrid-liquidity-ag';

export const UnwrapSolModal = (props: {
  handleOk: any;
  handleClose: any;
  isVisible: boolean;
}) => {
  const { isVisible, handleClose, handleOk } = props;
  const { t } = useTranslation("common");
  const connection = useConnection();
  const { publicKey, wallet } = useWallet();
  const {
    tokenList,
    transactionStatus,
    setTransactionStatus,
    refreshTokenBalance,
  } = useContext(AppStateContext);
  const { enqueueTransactionConfirmation } = useContext(TxConfirmationContext);
  const [isUnwrapping, setIsUnwrapping] = useState(false);
  const [unwrapAmount, setUnwrapAmount] = useState<string>("");

  const { account } = useNativeAccount();
  const { tokenAccounts } = useUserAccounts();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [wSolBalance, setWsolBalance] = useState(0);

  const [feeAmount, setFeeAmount] = useState<number | null>(null);
  const [transactionFees, setTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [pageInitialized, setPageInitialized] = useState<boolean>(false);

  // Get wSOL token info
  const wSol = useMemo(() => {
    return tokenList.find(t => t.address === WRAPPED_SOL_MINT_ADDRESS);
  }, [tokenList]);

  // Callback methods

  const getFeeAmount = useCallback((fees: TransactionFees, amount?: any): number => {
    let fee = 0;
    const inputAmount = amount ? parseFloat(amount) : 0;
    if (fees) {
      if (fees.mspPercentFee) {
        fee = inputAmount ? percentage(fees.mspPercentFee, inputAmount) : 0;
      } else if (fees.mspFlatFee) {
        fee = fees.mspFlatFee;
      }
    }
    return fee;
  }, []);

  const getDisplayAmount = useCallback((amount: number, addSymbol = false): string => {
    if (wSol) {
      const bareAmount = cutNumber(amount, wSol.decimals);
      if (addSymbol) {
        return wSol.name === 'Unknown' ? `${bareAmount} [${wSol.symbol}]` : `${bareAmount} ${wSol.symbol}`;
      }
      return bareAmount;
    }

    return '';
  }, [wSol]);

  const setPercentualValue = useCallback((value: number) => {
    let newValue = '';
    let fee = 0;
    if (value === 100) {
      fee = getFeeAmount(transactionFees, wSolBalance)
      newValue = getDisplayAmount(wSolBalance);
    } else {
      const partialAmount = percentage(value, wSolBalance);
      fee = getFeeAmount(transactionFees, partialAmount)
      newValue = getDisplayAmount(partialAmount);
    }
    setUnwrapAmount(newValue);
    setFeeAmount(fee);
  }, [getDisplayAmount, getFeeAmount, wSolBalance, transactionFees]);

  const resetTransactionStatus = useCallback(() => {

    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });

  }, [setTransactionStatus]);

  const onUnwrapConfirmed = useCallback((item: TxConfirmationInfo) => {
    consoleOut("onUnwrapConfirmed event executed!", '', 'crimson');
    if (item && item.operationType === OperationType.Unwrap) {
      setIsUnwrapping(false);
      resetTransactionStatus();
      setTimeout(() => {
        refreshTokenBalance();
      });
    }
  }, [refreshTokenBalance, resetTransactionStatus]);

  // Effects

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

  // Keep wSOL balance updated
  useEffect(() => {
    if (!publicKey) {
      return;
    }

    let balance = 0;

    if (tokenAccounts && tokenAccounts.length > 0 && tokenList) {
      const wSol = tokenAccounts.findIndex((t) => {
        const mint = t.info.mint.toBase58();
        return !t.pubkey.equals(publicKey) &&
          mint === WRAPPED_SOL_MINT_ADDRESS
          ? true
          : false;
      });
      if (wSol !== -1) {
        const wSolInfo = tokenAccounts[wSol].info;
        const mint = wSolInfo.mint.toBase58();
        const amount = wSolInfo.amount.toNumber();
        const token = tokenList.find((t) => t.address === mint);
        balance = token ? toUiAmount(new BN(amount), token.decimals) : 0;
      }
    }

    setWsolBalance(balance);
  }, [publicKey, tokenList, tokenAccounts]);

  // Set fee amount once
  useEffect(() => {
    if (!feeAmount && transactionFees) {
      setFeeAmount(getFeeAmount(transactionFees));
    }
  }, [
    feeAmount,
    transactionFees,
    getFeeAmount
  ]);

  // Get fees
  useEffect(() => {
    const getTransactionFees = async (): Promise<TransactionFees> => {
      return await calculateActionFees(connection, MSP_ACTIONS.wrap);
    };

    if (transactionFees.blockchainFee === 0) {
      getTransactionFees().then((values) => {
        setTransactionFees(values);
        consoleOut("unwrapFees:", values);
      });
    }
  }, [connection, transactionFees]);

  // Setup event listeners
  useEffect(() => {
    if (connection && publicKey && !pageInitialized) {
      confirmationEvents.on(EventType.TxConfirmSuccess, onUnwrapConfirmed);
      consoleOut('Subscribed to event txConfirmed with:', 'onUnwrapConfirmed', 'blue');
    }
  }, [
    publicKey,
    connection,
    pageInitialized,
    onUnwrapConfirmed,
  ]);

  // Set when a page is initialized
  useEffect(() => {
    if (connection && publicKey && !pageInitialized) {
      setPageInitialized(true);
    }
  }, [connection, pageInitialized, publicKey]);

  // Events and actions

  const isSuccess = useCallback(() => {

    return (
      transactionStatus.currentOperation ===
      TransactionStatus.TransactionFinished
    );

  },[
    transactionStatus.currentOperation
  ]);

  const onTransactionFinished = useCallback(() => {
    if (isSuccess()) {
      setUnwrapAmount("");
    }
    resetTransactionStatus();
    handleOk();
  }, [handleOk, isSuccess, resetTransactionStatus]);

  const handleAmountChange = (e: any) => {
    let newValue = e.target.value;
    const splitted = newValue.toString().split('.');
    const left = splitted[0];

    if (wSol && splitted[1]) {
      if (splitted[1].length > wSol.decimals) {
        splitted[1] = splitted[1].slice(0, -1);
        newValue = splitted.join('.');
      }
    } else if (left.length > 1) {
      const number = splitted[0] - 0;
      splitted[0] = `${number}`;
      newValue = splitted.join('.');
    }

    if (newValue === null || newValue === undefined || newValue === "") {
      setUnwrapAmount("");
    } else if (newValue === '.') {
      setUnwrapAmount(".");
    } else if (isValidNumber(newValue)) {
      setUnwrapAmount(newValue);
      setFeeAmount(getFeeAmount(transactionFees, newValue));
    }
  };

  const onStartUnwrapTx = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    const createTx = async (): Promise<boolean> => {
      if (wallet) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        const amount = parseFloat(unwrapAmount)
        consoleOut("unwrapAmount:", amount, "blue");

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(
            TransactionStatus.TransactionStart
          ),
          inputs: `unwrapAmount: ${amount}`,
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(
            TransactionStatus.InitTransaction
          ),
          result: "",
        });

        return await unwrapSol(
          connection, // connection
          wallet, // wallet
          Keypair.generate(),
          amount // amount
        )
          .then((value) => {
            consoleOut("unwrapSol returned transaction:", value);
            // Stage 1 completed - The transaction is created and returned
            setTransactionStatus({
              lastOperation: TransactionStatus.InitTransactionSuccess,
              currentOperation: TransactionStatus.SignTransaction,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.InitTransactionSuccess
              ),
              result: getTxIxResume(value),
            });
            transaction = value;
            return true;
          })
          .catch((error) => {
            console.error("unwrapSol transaction init error:", error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.InitTransactionFailure
              ),
              result: `${error}`,
            });
            customLogger.logError("Unwrap transaction failed", {
              transcript: transactionLog,
            });
            return false;
          });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: "Cannot start transaction! Wallet not found!",
        });
        customLogger.logError("Unwrap transaction failed", {
          transcript: transactionLog,
        });
        return false;
      }
    };

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
        consoleOut("Signing transaction...");
        return await wallet
          .signTransaction(transaction)
          .then((signed: Transaction) => {
            consoleOut(
              "signTransaction returned a signed transaction:",
              signed
            );
            signedTransaction = signed;
            // Try signature verification by serializing the transaction
            try {
              encodedTx = signedTransaction.serialize().toString("base64");
              consoleOut("encodedTx:", encodedTx, "orange");
            } catch (error) {
              console.error(error);
              setTransactionStatus({
                lastOperation: TransactionStatus.SignTransaction,
                currentOperation: TransactionStatus.SignTransactionFailure,
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(
                  TransactionStatus.SignTransactionFailure
                ),
                result: {
                  signer: `${wallet.publicKey.toBase58()}`,
                  error: `${error}`,
                },
              });
              customLogger.logError("Unwrap transaction failed", {
                transcript: transactionLog,
              });
              return false;
            }
            setTransactionStatus({
              lastOperation: TransactionStatus.SignTransactionSuccess,
              currentOperation: TransactionStatus.SendTransaction,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.SignTransactionSuccess
              ),
              result: { signer: wallet.publicKey.toBase58() },
            });
            return true;
          })
          .catch((error) => {
            console.error("Signing transaction failed!");
            setTransactionStatus({
              lastOperation: TransactionStatus.SignTransaction,
              currentOperation: TransactionStatus.SignTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.SignTransactionFailure
              ),
              result: {
                signer: `${wallet.publicKey.toBase58()}`,
                error: `${error}`,
              },
            });
            customLogger.logError("Unwrap transaction failed", {
              transcript: transactionLog,
            });
            return false;
          });
      } else {
        console.error("Cannot sign transaction! Wallet not found!");
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: "Cannot sign transaction! Wallet not found!",
        });
        customLogger.logError("Unwrap transaction failed", {
          transcript: transactionLog,
        });
        return false;
      }
    };

    const sendTx = async (): Promise<boolean> => {
      if (wallet) {
        return await connection
          .sendEncodedTransaction(encodedTx)
          .then((sig) => {
            consoleOut("sendEncodedTransaction returned a signature:", sig);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction,
            });
            signature = sig;
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.SendTransactionSuccess
              ),
              result: `signature: ${signature}`,
            });
            return true;
          })
          .catch((error) => {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.SendTransactionFailure
              ),
              result: { error, encodedTx },
            });
            customLogger.logError("Unwrap transaction failed", {
              transcript: transactionLog,
            });
            return false;
          });
      } else {
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.WalletNotFound,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: "Cannot send transaction! Wallet not found!",
        });
        customLogger.logError("Unwrap transaction failed", {
          transcript: transactionLog,
        });
        return false;
      }
    };

    if (wallet && wSol) {
      setIsUnwrapping(true);
      const create = await createTx();
      consoleOut("created:", create);
      if (create) {
        const sign = await signTx();
        consoleOut("signed:", sign);
        if (sign) {
          const sent = await sendTx();
          consoleOut("sent:", sent);
          if (sent) {
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.Unwrap,
              finality: "confirmed",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: `Unwrap ${formatThousands(
                parseFloat(unwrapAmount),
                wSol.decimals
              )} ${wSol.symbol}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `Successfully unwrapped ${formatThousands(
                parseFloat(unwrapAmount),
                wSol.decimals
              )} ${wSol.symbol}`,
            });
            onTransactionFinished();
          } else {
            openNotification({
              title: t("notifications.error-title"),
              description: t("notifications.error-sending-transaction"),
              type: "error",
            });
            setIsUnwrapping(false);
          }
        } else {
          setIsUnwrapping(false);
        }
      } else {
        setIsUnwrapping(false);
      }
    }
  };

  // Validation

  const isUnwrapValid = (): boolean => {
    return unwrapAmount &&
      nativeBalance &&
      nativeBalance > (feeAmount || 0.005) &&
      parseFloat(unwrapAmount) > 0 &&
      parseFloat(unwrapAmount) <= wSolBalance
      ? true
      : false;
  };

  const getCtaLabel = () => {
    return !publicKey
      ? t('transactions.validation.not-connected')
      : nativeBalance === 0
        ? t('transactions.validation.amount-sol-low')
        : nativeBalance < (feeAmount || 0.005)
          ? t('transactions.validation.amount-sol-low')
          : !unwrapAmount || parseFloat(unwrapAmount) === 0
            ? t('transactions.validation.no-amount')
            : parseFloat(unwrapAmount) > wSolBalance
              ? t('transactions.validation.invalid-amount')
              : 'Unwrap SOL';
  }

  return (
    <Modal
      className="mean-modal unpadded-content simple-modal"
      title={<div className="modal-title">Unwrap SOL</div>}
      footer={null}
      visible={isVisible}
      onOk={handleOk}
      onCancel={handleClose}
      width={400}>

      <div className="px-4 pb-3">

        <div className="well disabled">
          <div className="flex-fixed-right">
            <div className="left inner-label">{t('unwrap.current-wsol-balance')}:</div>
            <div className="right">&nbsp;</div>
          </div>
          <div className="flex-fixed-right">
            <div className="left static-data-field">
              {
                formatThousands(wSolBalance, wSol?.decimals || 9, wSol?.decimals || 9)
              }
            </div>
            <div className="right">&nbsp;</div>
          </div>
        </div>

        {/* Unwrap amount */}
        <div className={`well ${isUnwrapping ? 'disabled' : ''}`}>
          <div className="flex-fixed-right">
            <div className="left inner-label">{t('unwrap.label-input-amount')}</div>
            <div className="right">
              <div className="addon">
                <div className="token-group">
                  <div
                    className="token-max simplelink"
                    onClick={() => setPercentualValue(25)}>
                    25%
                  </div>
                  <div
                    className="token-max simplelink"
                    onClick={() => setPercentualValue(50)}>
                    50%
                  </div>
                  <div
                    className="token-max simplelink"
                    onClick={() => setPercentualValue(75)}>
                    75%
                  </div>
                  <div
                    className="token-max simplelink"
                    onClick={() => setPercentualValue(100)}>
                    100%
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex-fixed-right">
            <div className="left">
              <input
                className="general-text-input"
                inputMode="decimal"
                autoComplete="off"
                autoCorrect="off"
                type="text"
                onChange={handleAmountChange}
                pattern="^[0-9]*[.,]?[0-9]*$"
                placeholder="0.0"
                minLength={1}
                maxLength={79}
                spellCheck="false"
                value={unwrapAmount}
              />
            </div>
            <div className="right">&nbsp;</div>
          </div>
          {parseFloat(unwrapAmount) > wSolBalance ? (
            <span className="form-field-error">Unwrap amount exceeds available balance</span>
          ) : (null)}
        </div>

        <Button
          className={`main-cta ${isUnwrapping ? 'inactive' : ''}`}
          block
          type="primary"
          shape="round"
          size="large"
          disabled={!isUnwrapValid() || isUnwrapping}
          onClick={onStartUnwrapTx}>
          {isUnwrapping && (
              <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
          )}
          {isUnwrapping
            ? 'Unwrapping SOL'
            : getCtaLabel()
          }
        </Button>

      </div>

    </Modal>
  );
};
