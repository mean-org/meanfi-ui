import { LoadingOutlined } from '@ant-design/icons';
import { MoneyStreaming } from '@mean-dao/money-streaming';
import { SignerWalletAdapter } from '@solana/wallet-adapter-base';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { Button } from 'antd';
import { AppStateContext } from 'contexts/appstate';
import { TxConfirmationContext } from 'contexts/transaction-status';
import { useWallet } from 'contexts/wallet';
import { customLogger } from 'index';
import { IdoClient, IdoDetails, IdoStatus } from 'integrations/ido/ido-client';
import { getWhitelistAllocation } from 'middleware/api';
import { isError } from 'middleware/transactions';
import { consoleOut, getTransactionStatusForLogs } from 'middleware/ui';
import { getAmountWithSymbol, getTxIxResume } from 'middleware/utils';
import { Allocation } from 'models/common-types';
import { OperationType, TransactionStatus, WhitelistClaimType } from 'models/enums';
import { TokenInfo } from 'models/SolanaTokenInfo';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import CountUp from 'react-countup';
import { useTranslation } from 'react-i18next';

export const IdoRedeem = (props: {
  connection: Connection;
  idoClient: IdoClient | undefined
  idoStatus: IdoStatus;
  idoDetails: IdoDetails;
  disabled: boolean;
  idoFinished: boolean;
  redeemStarted: boolean;
  moneyStreamingClient: MoneyStreaming;
  selectedToken: TokenInfo | undefined;
}) => {
  const { t } = useTranslation('common');
  const { connected, wallet, publicKey } = useWallet();
  const {
    tokenList,
    transactionStatus,
    setTransactionStatus,
  } = useContext(AppStateContext);
  const {
    startFetchTxSignatureInfo,
    clearTxConfirmationContext,
  } = useContext(TxConfirmationContext);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [userAllocation, setUserAllocation] = useState<Allocation | null>();

  const meanToken = useMemo(() => {
    const token = tokenList.filter(t => t.symbol === 'MEAN');
    consoleOut('token:', token, 'blue');
    return token[0];
  }, [tokenList]);

  useEffect(() => {
    if (!publicKey) {
      setUserAllocation(null);
      return;
    }

    const getAllocation = async () => {
      try {
        const allocation = await getWhitelistAllocation(publicKey.toBase58(), WhitelistClaimType.IDO);
        consoleOut('allocation data:', allocation, 'blue');
        setUserAllocation(allocation);
      } catch (error) {
        console.error(error);
      } finally  {
        setIsBusy(false);
      }
    }

    if (!userAllocation) {
      getAllocation();
    }

  }, [
    publicKey,
    userAllocation
  ]);

  const isUserInGa = useCallback(() => {
    return publicKey && props.idoStatus && props.idoStatus.userIsInGa
      ? true
      : false;
  }, [
    props.idoStatus,
    publicKey
  ]);

  const hasUserContributedNotInGa = useCallback(() => {
    return publicKey && props.idoStatus && !props.idoStatus.userIsInGa && props.idoStatus.userUsdcContributedAmount > 0
      ? true
      : false;
  }, [
    props.idoStatus,
    publicKey
  ]);

  const resetTransactionStatus = useCallback(() => {

    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });

  }, [
    setTransactionStatus
  ]);

  // Validation

  const isValidOperation = (): boolean => {
    return (props.idoFinished && hasUserContributedNotInGa()) || (props.redeemStarted && isUserInGa())
      ? true
      : false;
  }

  const getTransactionStartButtonLabel = (): string => {
    return !connected
      ? t('transactions.validation.not-connected')
      : isError(transactionStatus.currentOperation)
        ? 'Retry'
        : isBusy
          ? props.idoStatus.userHasContributed && !props.idoStatus.userIsInGa
            ? 'Withdrawing contribution'
            : 'Claiming your MEAN'
          : !props.idoStatus.userHasContributed && !props.idoStatus.userIsInGa
            ? 'No contribution to withdraw'
            : props.idoStatus.userHasContributed && !props.idoStatus.userIsInGa
              ? 'Withdraw your contribution'
              : 'Redeem';
  }

  const onExecuteRedeemTx = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTxConfirmationContext();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createTx = async (): Promise<boolean> => {
      if (publicKey && props.idoDetails && props.idoClient) {

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const idoAddress = new PublicKey(props.idoDetails.idoAddress);

        const data = {
          idoAddress: idoAddress.toBase58(),
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
        return await props.idoClient.createReddemTx(
          idoAddress
        )
        .then(value => {
          consoleOut('createReddemTx returned transaction:', value);
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
          console.error('createReddemTx error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Create IDO Redeem transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Create IDO Redeem transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet && publicKey) {
        consoleOut('Signing transaction...');
        return (wallet as SignerWalletAdapter).signTransaction(transaction)
        .then(async (signed: Transaction) => {
          consoleOut('signTransaction returned a signed transaction:', signed);
          signedTransaction = signed;
          // Signature validation
          try {
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
              result: { signer: `${publicKey.toBase58()}`, error: `${error}` }
            });
            customLogger.logError('Create IDO Redeem transaction failed', { transcript: transactionLog });
            return false;
          }
        })
        .catch((error: any) => {
          console.error('Signing transaction failed!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('Create IDO Redeem transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Create IDO Redeem transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Create IDO Redeem transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Create IDO Redeem transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (publicKey) {
      resetTransactionStatus();
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
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.IdoClaim);
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
      <div className="flex-fill flex-column justify-content-center">
        {props.selectedToken && (
          <>
            <div className="px-1 mb-2">
              {idoInfoRow(
                'Your USDC Contribution',
                getAmountWithSymbol(
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
                props.idoStatus.finalMeanPrice
                  ? getAmountWithSymbol(
                      props.idoStatus.finalMeanPrice,
                      props.selectedToken.address
                    )
                  : '-'
              )}
            </div>
            <div className="flex-fixed-right mb-2">
              <div className="left inner-label">
                <span>Redeemable MEAN</span>
              </div>
              <div className="right value-display">
                {meanToken && props.idoStatus.userMeanImpliedAmount ? (
                  <CountUp
                    end={props.idoStatus.userMeanImpliedAmount}
                    decimals={meanToken.decimals}
                    separator=','
                    duration={2} />
                ) : (
                  <span>0</span>
                )}
              </div>
            </div>

            {isUserInGa() ? (
              <>
              {props.idoFinished && (
                <div className="px-1 mb-2 text-center">
                  <span>Congrats, you made it! 🎉<br/>Thank you for contributing to the MEAN IDO!
                    {!props.redeemStarted && <span>You'll be able to redeem your tokens when the claim period begins.</span>}</span>
                </div>
              )}
              </>
            ) : hasUserContributedNotInGa() ? (
              <>
              {props.idoFinished && (
                <div className="px-1 mb-2 text-center">
                  <span>😥 You didn't make it.<br/>Withdraw your USDC now</span>
                </div>
              )}
              </>
            ) : null}
          </>
        )}
      </div>
      <Button
        className={`main-cta ${isBusy ? 'inactive' : ''}`}
        block
        type="primary"
        shape="round"
        size="large"
        disabled={props.disabled || !isValidOperation()}
        onClick={onExecuteRedeemTx}>
        {isBusy && (
          <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
        )}
        {getTransactionStartButtonLabel()}
      </Button>
    </>
  );
};
