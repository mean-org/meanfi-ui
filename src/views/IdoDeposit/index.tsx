import React, { useContext, useState } from 'react';
import { Button } from 'antd';
import { formatAmount, getTokenAmountAndSymbolByTokenAddress, getTxIxResume, isValidNumber, truncateFloat } from '../../utils/utils';
import { AppStateContext } from '../../contexts/appstate';
import { TransactionStatusContext } from '../../contexts/transaction-status';
import { useTranslation } from 'react-i18next';
import { consoleOut, getTransactionStatusForLogs, percentage } from '../../utils/ui';
import { useWallet } from '../../contexts/wallet';
import { TokenDisplay } from '../../components/TokenDisplay';
import { TokenInfo } from '@solana/spl-token-registry';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { OperationType, TransactionStatus } from '../../models/enums';
import { IdoClient, IdoDetails, IdoStatus } from '../../integrations/ido/ido-client';
import { customLogger } from '../..';
import { LoadingOutlined } from '@ant-design/icons';

export const IdoDeposit = (props: {
  connection: Connection;
  idoClient: IdoClient | undefined
  idoStatus: IdoStatus;
  idoDetails: IdoDetails;
  disabled: boolean;
  tokenBalance: number;
  selectedToken: TokenInfo | undefined;
  maxFullyDilutedMarketCapAllowed: number;
}) => {
  const { t } = useTranslation('common');
  const { connected, wallet, publicKey } = useWallet();
  const [depositAmount, setDepositAmount] = useState<string>('');
  const {
    selectedToken,
    transactionStatus,
    setTransactionStatus,
  } = useContext(AppStateContext);
  const {
    startFetchTxSignatureInfo,
    clearTransactionStatusContext,
  } = useContext(TransactionStatusContext);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const handleAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setDepositAmount("");
    } else if (newValue === '.') {
      setDepositAmount(".");
    } else if (isValidNumber(newValue)) {
      setDepositAmount(newValue);
    }
  };

  // Validation

  const isValidInput = (): boolean => {
    const amount = depositAmount ? parseFloat(depositAmount) : 0;
    return props.selectedToken &&
           props.tokenBalance &&
           amount > 0 && amount >= props.idoDetails.usdcPerUserMin &&
           amount <= props.tokenBalance
            ? true
            : false;
  }

  const getTransactionStartButtonLabel = (): string => {
    const amount = depositAmount ? parseFloat(depositAmount) : 0;
    return !connected
      ? t('transactions.validation.not-connected')
      : props.idoStatus.hasUserContributed
        ? 'You already contributed'
        : !props.selectedToken || !props.tokenBalance
          ? t('transactions.validation.no-balance')
          : !amount
            ? t('transactions.validation.no-amount')
            : amount < props.idoDetails.usdcPerUserMin
              ? 'Balance too low'
              : amount > props.tokenBalance
                ? t('transactions.validation.amount-high')
                : t('transactions.validation.valid-approve');
  }

  const onExecuteDepositTx = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createTx = async (): Promise<boolean> => {
      if (publicKey && props.idoClient && props.idoDetails && selectedToken) {

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const meanIdoAddress = new PublicKey(props.idoDetails.idoAddress);
        const amount = parseFloat(depositAmount);
        const data = {
          meanIdoAddress: meanIdoAddress.toBase58(),                  // meanIdoAddress
          amount: amount                                              // amount
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

        // Create a transaction
        return await props.idoClient.createDepositUsdcTx(
          publicKey,                                                // meanIdoAddress
          amount                                                    // amount
        )
        .then(value => {
          consoleOut('createDepositUsdcTx returned transaction:', value);
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
            result: getTxIxResume(value[1])
          });
          transaction = value[1];
          return true;
        })
        .catch(error => {
          console.error('createDepositUsdcTx error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('IDO Deposit USDC transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('IDO Deposit USDC transaction failed', { transcript: transactionLog });
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
            customLogger.logWarning('IDO Deposit USDC transaction failed', { transcript: transactionLog });
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
          customLogger.logWarning('IDO Deposit USDC transaction failed', { transcript: transactionLog });
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
        customLogger.logError('IDO Deposit USDC transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      if (wallet) {
        return await props.connection
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
            customLogger.logError('IDO Deposit USDC transaction failed', { transcript: transactionLog });
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
        customLogger.logError('IDO Deposit USDC transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (publicKey) {
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
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.TreasuryAddFunds);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  const getDisplayAmount = (amount: any, addSymbol = false): string => {
    if (props.selectedToken) {
      const bareAmount = truncateFloat(amount, props.selectedToken.decimals);
      if (addSymbol) {
        return bareAmount + ' ' + props.selectedToken.symbol;
      }
      return bareAmount;
    }

    return '';
  }

  const setPercentualValue = (percentualAmount: number, totalAmount: number) => {
    let newValue = '';
    const cappedAmount = totalAmount <= props.idoStatus.currentMaxUsdcContribution
      ? totalAmount
      : props.idoStatus.currentMaxUsdcContribution;

    if (percentualAmount === 100) {
      newValue = getDisplayAmount(cappedAmount);
    } else {
      const partialAmount = percentage(percentualAmount, cappedAmount);
      newValue = getDisplayAmount(partialAmount);
    }
    setDepositAmount(newValue);
  }

  const infoRow = (caption: string, value: string) => {
    return (
      <div className="flex-fixed-right line-height-180">
        <div className="left inner-label">
          <span>{caption}</span>
        </div>
        <div className="right value-display">
          <span>{value}</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Top up amount */}
      <div className="flex-fixed-right mb-1">
        <div className="left">
          <div className="form-label">Amount</div>
        </div>
        {props.selectedToken && (
          <div className="right token-group">
            <div
              className={`token-max ${connected && !props.idoStatus.hasUserContributed ? 'simplelink' : 'disabled'}`}
              onClick={() => setDepositAmount(
                getTokenAmountAndSymbolByTokenAddress(
                  props.tokenBalance > props.idoDetails.usdcPerUserMin
                    ? props.idoDetails.usdcPerUserMin
                    : props.tokenBalance,
                  props.selectedToken ? props.selectedToken.address : '',
                  true)
              )}>
              MIN
            </div>
            <div
              className={`token-max ${connected && !props.idoStatus.hasUserContributed ? 'simplelink' : 'disabled'}`}
              onClick={() => setPercentualValue(25, props.tokenBalance)}>
              25%
            </div>
            <div
              className={`token-max ${connected && !props.idoStatus.hasUserContributed ? 'simplelink' : 'disabled'}`}
              onClick={() => setPercentualValue(50, props.tokenBalance)}>
              50%
            </div>
            <div
              className={`token-max ${connected && !props.idoStatus.hasUserContributed ? 'simplelink' : 'disabled'}`}
              onClick={() => setPercentualValue(75, props.tokenBalance)}>
              75%
            </div>
            <div
              className={`token-max ${connected && !props.idoStatus.hasUserContributed ? 'simplelink' : 'disabled'}`}
              onClick={() => setDepositAmount(
                getTokenAmountAndSymbolByTokenAddress(
                  props.tokenBalance > props.idoStatus.currentMaxUsdcContribution
                    ? props.idoStatus.currentMaxUsdcContribution
                    : props.tokenBalance,
                  props.selectedToken ? props.selectedToken.address : '',
                  true
                )
              )}>
              100%
            </div>
          </div>
        )}
      </div>
      <div className={`well mb-1 ${!connected && props.idoStatus.hasUserContributed ? 'disabled' : ''}`}>
        <div className="flex-fixed-left">
          <div className="left">
            <span className="add-on">
              {props.selectedToken && (
                <TokenDisplay onClick={() => {}}
                  name={props.selectedToken.name}
                  showName={false}
                  symbol={props.selectedToken.symbol}
                  mintAddress={props.selectedToken.address}
                  icon={<img alt={`${props.selectedToken.name}`} width={20} height={20} src={props.selectedToken.logoURI} />}
                  showCaretDown={false}
                />
              )}
            </span>
          </div>
          <div className="right">
            <input
              id="topup-amount-field"
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
              value={depositAmount}
            />
          </div>
        </div>
        <div className="flex-fixed-right">
          <div className="left inner-label">
            <span>{t('add-funds.label-right')}:</span>
            <span>
              {`${props.tokenBalance && props.selectedToken
                  ? getTokenAmountAndSymbolByTokenAddress(props.tokenBalance, props.selectedToken?.address, true)
                  : "0"
              }`}
            </span>
          </div>
          <div className="right inner-label">&nbsp;</div>
        </div>
      </div>
      <div className="flex-fixed-right mb-2">
        <div className="left form-label">
          <span>Min: {props.idoDetails.usdcPerUserMin} - Max: {formatAmount(props.idoStatus.currentMaxUsdcContribution, 2, true)}</span>
        </div>
        <div className="right inner-label">&nbsp;</div>
      </div>

      {/* Info */}
      {props.selectedToken && (
        <div className="px-1 mb-2">
          {infoRow(
            'USDC Contributed',
            getTokenAmountAndSymbolByTokenAddress(
              props.idoStatus.totalUsdcContributed,
              props.selectedToken.address,
              true
            )
          )}
          {infoRow(
            'Total MEAN for sale',
            getTokenAmountAndSymbolByTokenAddress(
              props.idoDetails.meanTotalMax,
              '', // TODO: Create TokenInfo for MEAN
              true
            )
          )}
          {infoRow(
            'Implied token price',
            getTokenAmountAndSymbolByTokenAddress(
              props.idoStatus.currentImpliedMeanPrice,
              props.selectedToken.address
            )
          )}
          {infoRow(
            'Max Fully Diluted Market Cap Allowed',
            formatAmount(
              props.maxFullyDilutedMarketCapAllowed,
              2,
              true
            )
          )}
        </div>
      )}

      <Button
        className={`main-cta ${isBusy ? 'inactive' : ''}`}
        block
        type="primary"
        shape="round"
        size="large"
        disabled={props.disabled || props.idoStatus.hasUserContributed || !isValidInput()}
        onClick={onExecuteDepositTx}>
        {isBusy && (
          <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
        )}
        {isBusy
          ? 'Depositing...'
          : getTransactionStartButtonLabel()}
      </Button>
    </>
  );
};
