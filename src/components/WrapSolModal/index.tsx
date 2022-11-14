import { LoadingOutlined } from '@ant-design/icons';
import {
  MSP_ACTIONS,
  TransactionFees,
} from '@mean-dao/money-streaming/lib/types';
import {
  calculateActionFees,
  wrapSol,
} from '@mean-dao/money-streaming/lib/utils';
import { PublicKey, Transaction } from '@solana/web3.js';
import { Button, Col, Modal, Row } from 'antd';
import { TokenDisplay } from 'components/TokenDisplay';
import {
  MIN_SOL_BALANCE_REQUIRED,
  WRAPPED_SOL_MINT_ADDRESS,
} from 'constants/common';
import { useNativeAccount } from 'contexts/accounts';
import { AppStateContext } from 'contexts/appstate';
import { useConnection } from 'contexts/connection';
import { TxConfirmationContext } from 'contexts/transaction-status';
import { useWallet } from 'contexts/wallet';
import { customLogger } from 'index';
import {
  consoleOut,
  delay,
  getTransactionStatusForLogs,
  toUsCurrency,
} from 'middleware/ui';
import {
  formatThousands,
  getAmountFromLamports,
  getAmountWithSymbol,
  getTxIxResume,
  isValidNumber,
} from 'middleware/utils';
import { OperationType, TransactionStatus } from 'models/enums';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export const WrapSolModal = (props: {
  handleOk: any;
  handleClose: any;
  isVisible: boolean;
}) => {
  const { isVisible, handleClose, handleOk } = props;
  const { t } = useTranslation('common');
  const connection = useConnection();
  const { publicKey, wallet } = useWallet();
  const {
    tokenList,
    loadingPrices,
    transactionStatus,
    getTokenPriceBySymbol,
    setTransactionStatus,
    refreshTokenBalance,
    refreshPrices,
  } = useContext(AppStateContext);
  const { enqueueTransactionConfirmation } = useContext(TxConfirmationContext);
  const [isBusy, setIsBusy] = useState(false);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [wrapAmount, setWrapAmount] = useState<string>('');
  const [wrapFees, setWrapFees] = useState<TransactionFees>({
    blockchainFee: 0,
    mspFlatFee: 0,
    mspPercentFee: 0,
  });

  const { account } = useNativeAccount();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);

  // Get wSOL token info
  const wSol = useMemo(() => {
    return tokenList.find(t => t.address === WRAPPED_SOL_MINT_ADDRESS);
  }, [tokenList]);

  // Keep account balance updated
  useEffect(() => {
    if (account?.lamports !== previousBalance || !nativeBalance) {
      // Refresh token balance
      refreshTokenBalance();
      setNativeBalance(getAmountFromLamports(account?.lamports));
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [account, nativeBalance, previousBalance, refreshTokenBalance]);

  // Get fees
  useEffect(() => {
    const getTransactionFees = async (): Promise<TransactionFees> => {
      return await calculateActionFees(connection, MSP_ACTIONS.wrap);
    };
    if (!wrapFees.blockchainFee) {
      getTransactionFees().then(values => {
        setWrapFees(values);
        consoleOut('wrapFees:', values);
      });
    }
  }, [connection, wrapFees]);

  const getMaxPossibleAmount = () => {
    // const fee = wrapFees.blockchainFee + getTxPercentFeeAmount(wrapFees, nativeBalance);
    const maxPossibleAmount = nativeBalance - MIN_SOL_BALANCE_REQUIRED;
    const converted = parseFloat(maxPossibleAmount.toFixed(wSol?.decimals));
    return converted > 0 ? converted : nativeBalance;
  };

  const isSuccess = useCallback(() => {
    return (
      transactionStatus.currentOperation ===
      TransactionStatus.TransactionFinished
    );
  }, [transactionStatus.currentOperation]);

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle,
    });
  }, [setTransactionStatus]);

  const onTransactionFinished = useCallback(() => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      setWrapAmount('');
    }
    resetTransactionStatus();
    handleOk();
  }, [handleOk, isBusy, isSuccess, resetTransactionStatus]);

  const onTransactionStart = async () => {
    let transaction: Transaction;
    let signature = '';
    let encodedTx: string;
    const transactionLog: any[] = [];

    setTransactionCancelled(false);
    setIsBusy(true);

    const createTx = async (): Promise<boolean> => {
      if (wallet) {
        const amount = parseFloat(wrapAmount as string);

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(
            TransactionStatus.TransactionStart,
          ),
          inputs: `wrapAmount: ${amount}`,
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(
            TransactionStatus.InitTransaction,
          ),
          result: '',
        });

        // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee

        // const myFees = getTxFeeAmount(wrapFees, amount);
        // if (nativeBalance < wrapFees.blockchainFee + myFees) {
        if (nativeBalance < MIN_SOL_BALANCE_REQUIRED) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(
              TransactionStatus.TransactionStartFailure,
            ),
            result: '',
          });
          customLogger.logWarning('Wrap transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }

        return await wrapSol(
          connection, // connection
          publicKey as PublicKey, // from
          amount, // amount
        )
          .then(value => {
            consoleOut('wrapSol returned transaction:', value);
            // Stage 1 completed - The transaction is created and returned
            setTransactionStatus({
              lastOperation: TransactionStatus.InitTransactionSuccess,
              currentOperation: TransactionStatus.SignTransaction,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.InitTransactionSuccess,
              ),
              result: getTxIxResume(value),
            });
            transaction = value;
            return true;
          })
          .catch(error => {
            console.error('wrapSol transaction init error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.InitTransactionFailure,
              ),
              result: `${error}`,
            });
            customLogger.logError('Wrap transaction failed', {
              transcript: transactionLog,
            });
            return false;
          });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('Wrap transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }
    };

    const sendTx = async (): Promise<boolean> => {
      if (connection && wallet && wallet.publicKey && transaction) {
        const {
          context: { slot: minContextSlot },
          value: { blockhash },
        } = await connection.getLatestBlockhashAndContext();

        transaction.feePayer = wallet.publicKey;
        transaction.recentBlockhash = blockhash;

        return wallet
          .sendTransaction(transaction, connection, { minContextSlot })
          .then(sig => {
            consoleOut('sendEncodedTransaction returned a signature:', sig);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction,
            });
            signature = sig;
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.SendTransactionSuccess,
              ),
              result: `signature: ${signature}`,
            });
            return true;
          })
          .catch(error => {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.SendTransactionFailure,
              ),
              result: { error, encodedTx },
            });
            customLogger.logError('Wrap transaction failed', {
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
          result: 'Cannot send transaction! Wallet not found!',
        });
        customLogger.logError('Wrap transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }
    };

    if (wallet && wSol) {
      const create = await createTx();
      consoleOut('created:', create);
      if (create && !transactionCancelled) {
        const sent = await sendTx();
        consoleOut('sent:', sent);
        setWrapAmount('');
        if (sent && !transactionCancelled) {
          enqueueTransactionConfirmation({
            signature: signature,
            operationType: OperationType.Wrap,
            finality: 'confirmed',
            txInfoFetchStatus: 'fetching',
            loadingTitle: 'Confirming transaction',
            loadingMessage: `Wrap ${formatThousands(
              parseFloat(wrapAmount as string),
              wSol.decimals,
            )} ${wSol.symbol}`,
            completedTitle: 'Transaction confirmed',
            completedMessage: `Wrapped ${formatThousands(
              parseFloat(wrapAmount as string),
              wSol.decimals,
            )} ${wSol.symbol}`,
          });
          setTransactionStatus({
            lastOperation: TransactionStatus.SendTransactionSuccess,
            currentOperation: TransactionStatus.TransactionFinished,
          });
          setIsBusy(false);
          await delay(1500);
          onTransactionFinished();
        } else {
          setIsBusy(false);
        }
      } else {
        setIsBusy(false);
      }
    }
  };

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

    if (newValue === null || newValue === undefined || newValue === '') {
      setWrapAmount('');
    } else if (newValue === '.') {
      setWrapAmount('.');
    } else if (isValidNumber(newValue)) {
      setWrapAmount(newValue);
    }
  };

  // Validation

  const isValidInput = (): boolean => {
    return wrapAmount &&
      parseFloat(wrapAmount) > 0 &&
      parseFloat(wrapAmount) > MIN_SOL_BALANCE_REQUIRED &&
      parseFloat(wrapAmount) <= getMaxPossibleAmount()
      ? true
      : false;
  };

  const isWrapValid = () => {
    return publicKey &&
      nativeBalance > 0 &&
      nativeBalance > MIN_SOL_BALANCE_REQUIRED &&
      wrapAmount &&
      parseFloat(wrapAmount) > 0 &&
      parseFloat(wrapAmount) <= getMaxPossibleAmount()
      ? true
      : false;
  };

  const getCtaLabel = () => {
    return !publicKey
      ? t('transactions.validation.not-connected')
      : nativeBalance === 0
      ? t('transactions.validation.no-balance')
      : nativeBalance > 0 && nativeBalance < MIN_SOL_BALANCE_REQUIRED
      ? t('transactions.validation.amount-low')
      : !wrapAmount || parseFloat(wrapAmount) === 0
      ? t('transactions.validation.no-amount')
      : parseFloat(wrapAmount) > getMaxPossibleAmount()
      ? t('transactions.validation.invalid-amount')
      : t('faucet.wrap-sol-cta');
  };

  const infoRow = (caption: string, value: string) => {
    return (
      <Row>
        <Col span={12} className="text-right pr-1">
          {caption}
        </Col>
        <Col span={12} className="text-left pl-1 fg-secondary-70">
          {value}
        </Col>
      </Row>
    );
  };

  return (
    <Modal
      className="mean-modal unpadded-content simple-modal"
      title={<div className="modal-title">Wrap SOL</div>}
      footer={null}
      open={isVisible}
      onOk={handleOk}
      onCancel={handleClose}
      width={400}
    >
      <div className="px-4 pb-3">
        {/* Wrap amount */}
        <div className="form-label">Wrap amount</div>
        <div className="well mb-1">
          <div className="flex-fixed-left">
            <div className="left">
              <span className="add-on">
                {wSol && (
                  <TokenDisplay
                    onClick={() => {}}
                    mintAddress={wSol.address}
                    symbol="SOL"
                    name={wSol.name}
                    showName={false}
                    showCaretDown={false}
                  />
                )}
                {nativeBalance > 0 && (
                  <div
                    className="token-max simplelink"
                    onClick={() => {
                      setWrapAmount(
                        getMaxPossibleAmount().toFixed(wSol?.decimals),
                      );
                    }}
                  >
                    MAX
                  </div>
                )}
              </span>
            </div>
            <div className="right">
              <input
                className="general-text-input text-right"
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
                value={wrapAmount}
              />
            </div>
          </div>
          <div className="flex-fixed-right">
            <div className="left inner-label">
              <span>{t('transactions.send-amount.label-right')}:</span>
              <span>
                {`${
                  nativeBalance && wSol
                    ? getAmountWithSymbol(nativeBalance, wSol.address, true)
                    : '0'
                }`}
              </span>
            </div>
            <div className="right inner-label">
              <span
                className={
                  loadingPrices
                    ? 'click-disabled fg-orange-red pulsate'
                    : 'simplelink'
                }
                onClick={() => refreshPrices()}
              >
                ~
                {wSol
                  ? toUsCurrency(
                      (parseFloat(wrapAmount) || 0) *
                        getTokenPriceBySymbol(wSol.symbol),
                    )
                  : '$0.00'}
              </span>
            </div>
          </div>
        </div>

        <div className="form-field-hint mb-2 pl-3">
          {t('wrap.hint-message')}
        </div>

        <div className="mb-2">
          {isValidInput() &&
            infoRow(
              t('faucet.wrapped-amount') + ':',
              `${
                wrapAmount
                  ? '~' +
                    getAmountWithSymbol(
                      parseFloat(wrapAmount) >=
                        (MIN_SOL_BALANCE_REQUIRED as number)
                        ? parseFloat(wrapAmount)
                        : 0,
                      WRAPPED_SOL_MINT_ADDRESS,
                      false,
                    )
                  : '0'
              }`,
            )}
        </div>

        <Button
          className={`main-cta ${isBusy ? 'inactive' : ''}`}
          block
          type="primary"
          shape="round"
          size="large"
          disabled={!isWrapValid()}
          onClick={onTransactionStart}
        >
          {isBusy && (
            <span className="mr-1">
              <LoadingOutlined style={{ fontSize: '16px' }} />
            </span>
          )}
          {isBusy ? t('transactions.status.tx-wrap-operation') : getCtaLabel()}
        </Button>
      </div>
    </Modal>
  );
};
