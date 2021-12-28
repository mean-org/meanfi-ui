import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Button } from 'antd';
import { getTxIxResume } from '../../utils/utils';
import { AppStateContext } from '../../contexts/appstate';
import { TransactionStatusContext } from '../../contexts/transaction-status';
import { useTranslation } from 'react-i18next';
import { consoleOut, getRateIntervalInSeconds, getTransactionStatusForLogs } from '../../utils/ui';
import { useWallet } from '../../contexts/wallet';
import { TokenInfo } from '@solana/spl-token-registry';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { OperationType, PaymentRateType, TransactionStatus, WhitelistClaimType } from '../../models/enums';
import { IdoClient, IdoDetails, IdoStatus } from '../../integrations/ido/ido-client';
import { appConfig, customLogger } from '../..';
import { LoadingOutlined } from '@ant-design/icons';
import { getWhitelistAllocation } from '../../utils/api';
import { Allocation } from '../../models/common-types';
import CountUp from 'react-countup';
import { MoneyStreaming } from '@mean-dao/money-streaming';
import { updateCreateStream2Tx } from '../../utils/transactions';

export const AirdropRedeem = (props: {
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

  const treasuryAddress = useMemo(() => appConfig.getConfig().idoDistributionTreasuryAddress, []);
  const treasurerAddress = useMemo(() => appConfig.getConfig().idoDistributionTreasurerAddress, []);

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
        const allocation = await getWhitelistAllocation(publicKey.toBase58(), WhitelistClaimType.Airdrop);
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
        : 'Arriving soon';
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
        const treasurer = new PublicKey(treasurerAddress);
        const treasury = new PublicKey(treasuryAddress);
        const associatedToken = new PublicKey(meanToken.address as string);
        const allocation = userAllocation.tokenAmount;
        const rateAmount = userAllocation.monthlyRate;
        const streamName = 'Solanium unlocked';
        const now = new Date();
        const cliffVestPercent = userAllocation.cliffPercent * 100;

        const data = {
          treasurer: treasurer.toBase58(),
          treasury: treasury.toBase58(),
          beneficiary: publicKey.toBase58(),
          associatedToken: associatedToken.toBase58(),
          rateAmount: rateAmount,
          rateIntervalInSeconds: getRateIntervalInSeconds(PaymentRateType.PerMonth),
          startUtc: now.toUTCString(),
          streamName: streamName,
          allocation: allocation,
          allocationReserved: allocation,
          rateCliffInSeconds: undefined,
          cliffVestAmount: undefined,
          cliffVestPercent: cliffVestPercent,
          autoPauseInSeconds: undefined
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
          treasurer,                                                        // treasurer
          treasury,                                                         // treasury
          beneficiary,                                                      // beneficiary
          associatedToken,                                                  // associatedToken
          streamName,                                                       // streamName
          allocation,                                                       // allocationAssigned
          allocation,                                                       // allocationReserved
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
          customLogger.logError('Create Airdrop Redeem transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Create Airdrop Redeem transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet && publicKey) {
        consoleOut('Signing transaction...');
        return await wallet.signTransaction(transaction)
        .then(async (signed: Transaction) => {
          consoleOut('signTransaction returned a signed transaction:', signed);
          signedTransaction = signed;
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: wallet.publicKey.toBase58()}
          });

          // Send Tx to add treasurer signature
          try {
            encodedTx = signed.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
            consoleOut('encodedTx before updating:', encodedTx, 'orange');
            const updatedTx = await updateCreateStream2Tx(publicKey, signed, WhitelistClaimType.Airdrop, appConfig.getConfig().apiUrl);
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
            customLogger.logWarning('Create Airdrop Redeem transaction failed', { transcript: transactionLog });
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
          customLogger.logWarning('Create Airdrop Redeem transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Create Airdrop Redeem transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Create Airdrop Redeem transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Create Airdrop Redeem transaction failed', { transcript: transactionLog });
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

  return (
    <>
      <div className="flex-fill flex-column justify-content-center align-items-center">
        {props.selectedToken && (
          <>
            <div className="airdrop-title">Your Airdrop Allocation</div>
            {meanToken && userAllocation && userAllocation.tokenAmount ? (
              <>
                <div className="airdrop-amount">
                  <CountUp
                    end={userAllocation.tokenAmount}
                    decimals={meanToken.decimals}
                    separator=','
                    duration={2} />
                  <span className="ml-1">{meanToken.symbol}</span>
                </div>
                <div className="font-size-100 mb-3 text-center fg-orange-red">The airdrop is slightly delayed, please follow the official channels. New date to be announced.</div>
              </>
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
        disabled={true}
        onClick={() => {}}>
        {isBusy && (
          <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
        )}
        {getTransactionStartButtonLabel()}
      </Button>
    </>
  );
};
