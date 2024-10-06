import { LoadingOutlined } from '@ant-design/icons';
import { MSP_ACTIONS, type TransactionFees } from '@mean-dao/money-streaming/lib/types';
import { calculateActionFees } from '@mean-dao/money-streaming/lib/utils';
import type { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { Button, Col, Modal, Row } from 'antd';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MIN_SOL_BALANCE_REQUIRED, WRAPPED_SOL_MINT_ADDRESS } from 'src/app-constants/common';
import { openNotification } from 'src/components/Notifications';
import { TokenDisplay } from 'src/components/TokenDisplay';
import { useNativeAccount } from 'src/contexts/accounts';
import { AppStateContext } from 'src/contexts/appstate';
import { useConnection } from 'src/contexts/connection';
import { TxConfirmationContext } from 'src/contexts/transaction-status';
import { useWallet } from 'src/contexts/wallet';
import { customLogger } from 'src/main';
import { sendTx, signTx } from 'src/middleware/transactions';
import { consoleOut, delay, getTransactionStatusForLogs, toUsCurrency } from 'src/middleware/ui';
import {
  formatThousands,
  getAmountFromLamports,
  getAmountWithSymbol,
  getTxIxResume,
  isValidNumber,
} from 'src/middleware/utils';
import { wrapSol } from 'src/middleware/wrapSol';
import { OperationType, TransactionStatus } from 'src/models/enums';
import type { LooseObject } from 'src/types/LooseObject';

interface WrapSolModalProps {
  handleOk: () => void;
  handleClose: () => void;
  isVisible: boolean;
}

export const WrapSolModal = ({ isVisible, handleClose, handleOk }: WrapSolModalProps) => {
  const { t } = useTranslation('common');
  const connection = useConnection();
  const { publicKey, wallet } = useWallet();
  const {
    tokenList,
    loadingPrices,
    transactionStatus,
    getTokenPriceByAddress,
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
    const converted = Number.parseFloat(maxPossibleAmount.toFixed(wSol?.decimals));
    return converted > 0 ? converted : nativeBalance;
  };

  const isSuccess = useCallback(() => {
    return transactionStatus.currentOperation === TransactionStatus.TransactionFinished;
  }, [transactionStatus.currentOperation]);

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Idle,
      currentOperation: TransactionStatus.Idle,
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

  const onStartTransaction = async () => {
    let transaction: Transaction | null = null;
    let signature: string;
    let encodedTx: string;
    let transactionLog: LooseObject[] = [];

    setTransactionCancelled(false);
    setIsBusy(true);

    const wrapSolPrioritized = async ({
      connection,
      from,
      amount,
    }: {
      connection: Connection;
      from: PublicKey;
      amount: number;
    }) => await wrapSol(connection, from, amount);

    const createTx = async (): Promise<boolean> => {
      if (wallet) {
        const amount = Number.parseFloat(wrapAmount as string);

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: `wrapAmount: ${amount}`,
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: '',
        });

        // Abort transaction if not enough balance to pay for gas fees
        if (nativeBalance < MIN_SOL_BALANCE_REQUIRED) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: '',
          });
          customLogger.logWarning('Wrap transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }

        return await wrapSolPrioritized({
          connection, // connection
          from: publicKey as PublicKey, // from
          amount, // amount
        })
          .then(value => {
            consoleOut('wrapSol returned transaction:', value);
            // Stage 1 completed - The transaction is created and returned
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
            console.error('wrapSol transaction init error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`,
            });
            customLogger.logError('Wrap transaction failed', {
              transcript: transactionLog,
            });
            return false;
          });
      }

      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
        result: 'Cannot start transaction! Wallet not found!',
      });
      customLogger.logError('Wrap transaction failed', {
        transcript: transactionLog,
      });
      return false;
    };

    if (wallet && publicKey && wSol) {
      const created = await createTx();
      consoleOut('created:', created);
      if (created && !transactionCancelled) {
        const sign = await signTx('Wrap SOL', wallet.adapter, publicKey, transaction);
        if (sign.encodedTransaction) {
          encodedTx = sign.encodedTransaction;
          transactionLog = transactionLog.concat(sign.log);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionSuccess,
          });
          const sent = await sendTx('Wrap SOL', connection, encodedTx);
          consoleOut('sent:', sent);
          if (sent.signature) {
            signature = sent.signature;
            consoleOut('Send Tx to confirmation queue:', signature);
            enqueueTransactionConfirmation({
              signature,
              operationType: OperationType.Wrap,
              finality: 'confirmed',
              txInfoFetchStatus: 'fetching',
              loadingTitle: 'Confirming transaction',
              loadingMessage: `Wrap ${formatThousands(Number.parseFloat(wrapAmount), wSol.decimals)} ${wSol.symbol}`,
              completedTitle: 'Transaction confirmed',
              completedMessage: `Wrapped ${formatThousands(Number.parseFloat(wrapAmount), wSol.decimals)} ${
                wSol.symbol
              }`,
            });
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.TransactionFinished,
            });
            setIsBusy(false);
            await delay(1500);
            onTransactionFinished();
          } else {
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.SendTransactionFailure,
            });
            openNotification({
              title: t('notifications.error-title'),
              description: t('notifications.error-sending-transaction'),
              type: 'error',
            });
            setIsBusy(false);
          }
        } else {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionFailure,
          });
          setIsBusy(false);
        }
      } else {
        setIsBusy(false);
      }
    }
  };

  const handleAmountChange = (e: string) => {
    let newValue = e;
    const splitted = newValue.toString().split('.');
    const left = splitted[0];

    if (wSol && splitted[1]) {
      if (splitted[1].length > wSol.decimals) {
        splitted[1] = splitted[1].slice(0, -1);
        newValue = splitted.join('.');
      }
    } else if (left.length > 1) {
      const number = +splitted[0] - 0;
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
    return !!(
      wrapAmount &&
      Number.parseFloat(wrapAmount) > 0 &&
      Number.parseFloat(wrapAmount) > MIN_SOL_BALANCE_REQUIRED &&
      Number.parseFloat(wrapAmount) <= getMaxPossibleAmount()
    );
  };

  const isWrapValid = () => {
    return !!(
      publicKey &&
      nativeBalance > 0 &&
      nativeBalance > MIN_SOL_BALANCE_REQUIRED &&
      wrapAmount &&
      Number.parseFloat(wrapAmount) > 0 &&
      Number.parseFloat(wrapAmount) <= getMaxPossibleAmount()
    );
  };

  const getCtaLabel = () => {
    return !publicKey
      ? t('transactions.validation.not-connected')
      : nativeBalance === 0
        ? t('transactions.validation.no-balance')
        : nativeBalance > 0 && nativeBalance < MIN_SOL_BALANCE_REQUIRED
          ? t('transactions.validation.amount-low')
          : !wrapAmount || Number.parseFloat(wrapAmount) === 0
            ? t('transactions.validation.no-amount')
            : Number.parseFloat(wrapAmount) > getMaxPossibleAmount()
              ? t('transactions.validation.invalid-amount')
              : t('faucet.wrap-sol-cta');
  };

  const infoRow = (caption: string, value: string) => {
    return (
      <Row>
        <Col span={12} className='text-right pr-1'>
          {caption}
        </Col>
        <Col span={12} className='text-left pl-1 fg-secondary-70'>
          {value}
        </Col>
      </Row>
    );
  };

  return (
    <Modal
      className='mean-modal unpadded-content simple-modal'
      title={<div className='modal-title'>Wrap SOL</div>}
      footer={null}
      open={isVisible}
      onOk={handleOk}
      onCancel={handleClose}
      width={400}
    >
      <div className='px-4 pb-3'>
        {/* Wrap amount */}
        <div className='form-label'>Wrap amount</div>
        <div className='well mb-1'>
          <div className='flex-fixed-left'>
            <div className='left'>
              <span className='add-on'>
                {wSol && (
                  <TokenDisplay
                    onClick={() => {}}
                    mintAddress={wSol.address}
                    symbol='SOL'
                    name={wSol.name}
                    showName={false}
                    showCaretDown={false}
                  />
                )}
                {nativeBalance > 0 && (
                  <div
                    className='token-max simplelink'
                    onKeyDown={() => {}}
                    onClick={() => {
                      setWrapAmount(getMaxPossibleAmount().toFixed(wSol?.decimals));
                    }}
                  >
                    MAX
                  </div>
                )}
              </span>
            </div>
            <div className='right'>
              <input
                className='general-text-input text-right'
                inputMode='decimal'
                autoComplete='off'
                autoCorrect='off'
                type='text'
                onChange={e => handleAmountChange(e.target.value)}
                pattern='^[0-9]*[.,]?[0-9]*$'
                placeholder='0.0'
                minLength={1}
                maxLength={79}
                spellCheck='false'
                value={wrapAmount}
              />
            </div>
          </div>
          <div className='flex-fixed-right'>
            <div className='left inner-label'>
              <span>{t('transactions.send-amount.label-right')}:</span>
              <span>{`${nativeBalance && wSol ? getAmountWithSymbol(nativeBalance, wSol.address, true) : '0'}`}</span>
            </div>
            <div className='right inner-label'>
              <span
                className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'}
                onKeyDown={() => {}}
                onClick={() => refreshPrices()}
              >
                ~
                {wSol
                  ? toUsCurrency(
                      (Number.parseFloat(wrapAmount) || 0) * getTokenPriceByAddress(wSol.address, wSol.symbol),
                    )
                  : '$0.00'}
              </span>
            </div>
          </div>
        </div>

        <div className='form-field-hint mb-2 pl-3'>{t('wrap.hint-message')}</div>

        <div className='mb-2'>
          {isValidInput() &&
            infoRow(
              t('faucet.wrapped-amount') + ':',
              `${
                wrapAmount
                  ? '~' +
                    getAmountWithSymbol(
                      Number.parseFloat(wrapAmount) >= (MIN_SOL_BALANCE_REQUIRED as number)
                        ? Number.parseFloat(wrapAmount)
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
          type='primary'
          shape='round'
          size='large'
          disabled={!isWrapValid()}
          onClick={onStartTransaction}
        >
          {isBusy && (
            <span className='mr-1'>
              <LoadingOutlined style={{ fontSize: '16px' }} />
            </span>
          )}
          {isBusy ? t('transactions.status.tx-wrap-operation') : getCtaLabel()}
        </Button>
      </div>
    </Modal>
  );
};
