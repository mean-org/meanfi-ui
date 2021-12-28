import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Button } from 'antd';
import { getTokenAmountAndSymbolByTokenAddress, getTxIxResume } from '../../utils/utils';
import { AppStateContext } from '../../contexts/appstate';
import { TransactionStatusContext } from '../../contexts/transaction-status';
import { useTranslation } from 'react-i18next';
import { consoleOut, getRateIntervalInSeconds, getTransactionStatusForLogs } from '../../utils/ui';
import { useWallet } from '../../contexts/wallet';
import { TokenInfo } from '@solana/spl-token-registry';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { OperationType, PaymentRateType, TransactionStatus, WhitelistClaimType } from '../../models/enums';
import { IdoClient, IdoDetails, IdoStatus } from '../../integrations/ido/ido-client';
import { customLogger } from '../..';
import { LoadingOutlined } from '@ant-design/icons';
import { getWhitelistAllocation } from '../../utils/api';
import { Allocation } from '../../models/common-types';
import { MoneyStreaming } from '@mean-dao/money-streaming';
import CountUp from 'react-countup';

export const SolaniumRedeem = (props: {
  connection: Connection;
  idoClient: IdoClient | undefined
  idoStatus: IdoStatus;
  idoDetails: IdoDetails;
  disabled: boolean;
  redeemStarted: boolean;
  moneyStreamingClient: MoneyStreaming;
  selectedToken: TokenInfo | undefined;
}) => {
  const { t } = useTranslation('common');
  const { connected, wallet, publicKey } = useWallet();
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const {
    userTokens,
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
  const [userAllocation, setUserAllocation] = useState<Allocation | null>();

  const meanToken = useMemo(() => {
    const token = userTokens.filter(t => t.symbol === 'MEAN');
    consoleOut('token:', token, 'blue');
    return token[0];
  }, [userTokens]);

  useEffect(() => {
    if (!publicKey) {
      setUserAllocation(null);
      return;
    }

    const getAllocation = async () => {
      try {
        const allocation = await getWhitelistAllocation(publicKey.toBase58(), WhitelistClaimType.Solanium);
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

  // Validation

  const isValidOperation = (): boolean => {
    return !props.disabled && userAllocation && userAllocation.tokenAmount > 0 ? true : false;
  }

  const getTransactionStartButtonLabel = (): string => {
    return !connected
      ? t('transactions.validation.not-connected')
      : !userAllocation || !userAllocation.tokenAmount
        ? 'Nothing to claim'
        : 'Claim your MEAN';
  }

  const onExecuteRedeemTx = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createTx = async (): Promise<boolean> => {
      if (publicKey && userAllocation && selectedToken) {

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const beneficiary = publicKey;
        const associatedToken = new PublicKey(meanToken.address as string);
        const treasury = new PublicKey('6tZLW5PgRQ4Cu64dbFpmE5zXKjduF9tfQtTtWBAxGdd1');
        const fundingAmount = userAllocation.tokenAmount;
        const rateAmount = userAllocation.monthlyRate;
        const streamName = 'Solanium unlocked';
        const now = new Date();

        /**
         * createStream params as of Tue 7 Dec 2021
         * 
         * treasurer: PublicKey,
         * treasury: PublicKey | undefined
         * beneficiary: PublicKey
         * associatedToken: PublicKey
         * rateAmount?: number | undefined
         * rateIntervalInSeconds?: number | undefined
         * startUtc?: Date | undefined
         * streamName?: string | undefined
         * allocation?: number | undefined
         * allocationReserved?: number | undefined
         * rateCliffInSeconds?: number | undefined
         * cliffVestAmount?: number | undefined
         * cliffVestPercent?: number | undefined
         * autoPauseInSeconds?: number | undefined
         */

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
        return await props.moneyStreamingClient.createStream2(
          publicKey,                                                        // treasurer
          treasury,                                                         // treasury
          beneficiary,                                                      // beneficiary
          associatedToken,                                                  // associatedToken
          streamName,                                                       // streamName
          fundingAmount,                                                    // fundingAmount
          fundingAmount,                                                    // allocationReserved
          rateAmount,                                                       // rateAmount
          getRateIntervalInSeconds(PaymentRateType.PerMonth),               // rateIntervalInSeconds
          now                                                               // startUtc
        )
        .then(value => {
          consoleOut('createStream2 returned transaction:', value);
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
          console.error('createStream2 error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Create Solanium Redeem transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Create Solanium Redeem transaction failed', { transcript: transactionLog });
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
            customLogger.logWarning('Create Solanium Redeem transaction failed', { transcript: transactionLog });
            return false;
          }

          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: wallet.publicKey.toBase58()}
          });
          return true;

          // TODO: kandela
          // Send Tx to add treasurer signature
          /*
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
            customLogger.logWarning('Create Solanium Redeem transaction failed', { transcript: transactionLog });
            return false;
          }
          */
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
          customLogger.logWarning('Create Solanium Redeem transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Create Solanium Redeem transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Create Solanium Redeem transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Create Solanium Redeem transaction failed', { transcript: transactionLog });
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
            startFetchTxSignatureInfo(signature, "finalized", OperationType.IdoClaim);
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
      <div className="flex-fill flex-column justify-content-center align-items-center">
        {props.selectedToken && (
          <>
            <div className="px-1 mb-2">
              {idoInfoRow(
                'Final Token Price',
                props.idoStatus.finalMeanPrice
                  ? getTokenAmountAndSymbolByTokenAddress(
                      props.idoStatus.finalMeanPrice,
                      props.selectedToken.address
                    )
                  : '-'
              )}
            </div>
            <div className="text-center font-size-120">Redeemable MEAN</div>
            {meanToken && userAllocation && userAllocation.tokenAmount ? (
              <div className="airdrop-amount">
                <CountUp
                  end={userAllocation.tokenAmount}
                  decimals={meanToken.decimals}
                  separator=','
                  duration={2} />
                <span className="ml-1">{meanToken.symbol}</span>
              </div>
            ) : (
              <div className="airdrop-amount">0.000000 MEAN</div>
            )}
          </>
        )}
      </div>
      <Button
        className={`main-cta ${isBusy ? 'inactive' : ''}`}
        block
        type="primary"
        shape="round"
        size="large"
        disabled={!isValidOperation()}
        onClick={onExecuteRedeemTx}>
        {isBusy && (
          <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
        )}
        {getTransactionStartButtonLabel()}
      </Button>
    </>
  );
};
