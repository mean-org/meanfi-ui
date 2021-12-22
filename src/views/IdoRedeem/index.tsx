import React, { useContext, useState } from 'react';
import { Button } from 'antd';
import { formatAmount, getTokenAmountAndSymbolByTokenAddress, getTxIxResume, isValidNumber } from '../../utils/utils';
import { AppStateContext } from '../../contexts/appstate';
import { TransactionStatusContext } from '../../contexts/transaction-status';
import { useTranslation } from 'react-i18next';
import { consoleOut, getFormattedNumberToLocale, getTransactionStatusForLogs } from '../../utils/ui';
import { useWallet } from '../../contexts/wallet';
import { TokenDisplay } from '../../components/TokenDisplay';
import { TokenInfo } from '@solana/spl-token-registry';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { OperationType, TransactionStatus } from '../../models/enums';
import { IdoClient, IdoDetails, IdoStatus } from '../../integrations/ido/ido-client';
import { customLogger } from '../..';
import { LoadingOutlined } from '@ant-design/icons';

export const IdoRedeem = (props: {
  connection: Connection;
  idoClient: IdoClient | undefined
  idoStatus: IdoStatus;
  idoDetails: IdoDetails;
  disabled: boolean;
  redeemStarted: boolean;
  selectedToken: TokenInfo | undefined;
}) => {
  const { t } = useTranslation('common');
  const { connected, wallet, publicKey } = useWallet();
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
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
      setWithdrawAmount("");
    } else if (isValidNumber(newValue)) {
      setWithdrawAmount(newValue);
    }
  };

  const isUserInGa = () => {
    return props.idoStatus && props.idoStatus.userHasContributed && props.idoStatus.userIsInGa
      ? true
      : false;
  }

  // Validation

  const isValidInput = (): boolean => {
    const amount = withdrawAmount ? parseFloat(withdrawAmount) : 0;
    const amountLeft = props.idoStatus.userUsdcContributedAmount - amount;
    return amount &&
           props.idoStatus.userUsdcContributedAmount &&
           ((amountLeft >= props.idoDetails.usdcPerUserMin && amount < props.idoStatus.userUsdcContributedAmount) ||
             amount === props.idoStatus.userUsdcContributedAmount)
      ? true
      : false;
  }

  const getTransactionStartButtonLabel = (): string => {
    const amount = withdrawAmount ? parseFloat(withdrawAmount) : 0;
    return !connected
      ? t('transactions.validation.not-connected')
      : !props.selectedToken || !props.idoStatus.userUsdcContributedAmount
        ? 'No contribution to withdraw'
        : !amount
          ? t('transactions.validation.no-amount')
          : amount > props.idoStatus.userUsdcContributedAmount
            ? `Max is ${formatAmount(props.idoStatus.userUsdcContributedAmount, 2, true)}`
            : isUserInGa()
              ? 'Redeem &amp; Start Vesting'
              : t('transactions.validation.valid-approve');
  }

  const onExecuteWithdrawTx = async () => {
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
        const amount = parseFloat(withdrawAmount);
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
        return await props.idoClient.createWithdrawUsdcTx(
          meanIdoAddress,                                           // meanIdoAddress
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
          customLogger.logError('IDO Withdraw USDC transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('IDO Withdraw USDC transaction failed', { transcript: transactionLog });
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
            customLogger.logWarning('IDO Withdraw USDC transaction failed', { transcript: transactionLog });
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
          customLogger.logWarning('IDO Withdraw USDC transaction failed', { transcript: transactionLog });
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
        customLogger.logError('IDO Withdraw USDC transaction failed', { transcript: transactionLog });
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
            customLogger.logError('IDO Withdraw USDC transaction failed', { transcript: transactionLog });
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
        customLogger.logError('IDO Withdraw USDC transaction failed', { transcript: transactionLog });
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
            startFetchTxSignatureInfo(signature, "finalized", OperationType.IdoWithdraw);
            setWithdrawAmount("");
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

  const idoInfoRow = (caption: string, value: string, spaceBelow = true) => {
    return (
      <div className={`flex-fixed-right ${spaceBelow ? 'mb-1' : ''}`}>
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
      {/* withdraw amount */}
      <div className="flex-fixed-right mb-1">
        <div className="left"><div className="form-label">Amount</div></div>
        {props.selectedToken && (
          <div className="right token-group">
            <div
              className={`token-max ${connected && props.idoStatus.userHasContributed && !isBusy && !props.disabled ? 'simplelink' : 'disabled'}`}
              onClick={() => setWithdrawAmount(
                formatAmount(
                  props.idoStatus.userUsdcContributedAmount - props.idoDetails.usdcPerUserMin,
                  props.selectedToken ? props.selectedToken.decimals : 2
                )
              )}>
              Min: {getFormattedNumberToLocale(formatAmount(props.idoStatus.userUsdcContributedAmount - props.idoDetails.usdcPerUserMin, 2))}
            </div>
            <div
              className={`token-max ${connected && props.idoStatus.userHasContributed && !isBusy && !props.disabled ? 'simplelink' : 'disabled'}`}
              onClick={() => setWithdrawAmount(
                formatAmount(
                  props.idoStatus.userUsdcContributedAmount,
                  props.selectedToken ? props.selectedToken.decimals : 2
                )
              )}>
              Max: {getFormattedNumberToLocale(formatAmount(Math.floor(props.idoStatus.userUsdcContributedAmount), 2))}
            </div>
          </div>
        )}
      </div>
      <div className={`well mb-2 ${!connected || isBusy || props.disabled ? 'disabled' : ''}`}>
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
              id="withdraw-amount-field"
              className="general-text-input text-right"
              inputMode="decimal"
              autoComplete="off"
              autoCorrect="off"
              type="text"
              onChange={handleAmountChange}
              pattern="^[0-9]*$"
              placeholder="0"
              minLength={1}
              maxLength={79}
              spellCheck="false"
              value={withdrawAmount}
            />
          </div>
        </div>
        <div className="flex-fixed-right">
          <div className="left inner-label">
            <span>Max withdraw:</span>
            <span>
              {`${props.idoStatus.userUsdcContributedAmount && props.selectedToken
                  ? getTokenAmountAndSymbolByTokenAddress(
                      props.idoStatus.userUsdcContributedAmount,
                      props.selectedToken.address,
                      true
                    )
                  : "0"
              }`}
            </span>
          </div>
          <div className="right inner-label">&nbsp;</div>
        </div>
      </div>

      {props.selectedToken && (
        <>
          <div className="px-1 mb-2">
            {idoInfoRow(
              'Your USDC Contribution',
              getTokenAmountAndSymbolByTokenAddress(
                props.idoStatus.userUsdcContributedAmount,
                props.selectedToken.address,
                true
              ),
              false
            )}
          </div>
          <div className="px-1 mb-2">
            {idoInfoRow(
              'Final Token Price',
              props.idoStatus.currentImpliedMeanPrice
                ? getTokenAmountAndSymbolByTokenAddress(
                    props.idoStatus.currentImpliedMeanPrice,
                    props.selectedToken.address
                  )
                : '-'
            )}
          </div>
          <div className="px-1 mb-2">
            {idoInfoRow(
              'Redeemable MEAN',
              getTokenAmountAndSymbolByTokenAddress(
                props.idoStatus.userMeanImpliedAmount,
                '',
                true
              ),
              false
            )}
          </div>

          {isUserInGa() ? (
            <>
            {!props.redeemStarted && (
              <div className="px-1 mb-2 text-center">
                <span>Come back when redemption opens to claim your allocation</span>
              </div>
            )}
            </>
          ) : (
            <>
            {!props.redeemStarted && (
              <div className="px-1 mb-2 text-center">
                <span>You didn't make it. Withdraw your USDC now</span>
              </div>
            )}
            </>
          )}
        </>
      )}

      <Button
        className={`main-cta ${isBusy ? 'inactive' : ''}`}
        block
        type="primary"
        shape="round"
        size="large"
        disabled={!publicKey || props.disabled || !isValidInput()}
        onClick={onExecuteWithdrawTx}>
        {isBusy && (
          <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
        )}
        {isBusy
          ? 'Withdrawing...'
          : getTransactionStartButtonLabel()}
      </Button>
    </>
  );
};
