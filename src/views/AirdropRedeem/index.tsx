import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Button } from 'antd';
import { getTxIxResume, toTokenAmount } from '../../utils/utils';
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
import { getWhitelistAllocation, sendRecordClaimTxRequest, sendSignClaimTxRequest } from '../../utils/api';
import { Allocation } from '../../models/common-types';
import CountUp from 'react-countup';
import { isError, updateCreateStream2Tx } from '../../utils/transactions';
import { MSP } from '@mean-dao/msp';
import { useConnectionConfig } from '../../contexts/connection';
import { useNavigate } from 'react-router-dom';

export const AirdropRedeem = (props: {
  connection: Connection;
  idoClient: IdoClient | undefined
  idoStatus: IdoStatus;
  idoDetails: IdoDetails;
  disabled: boolean;
  redeemStarted: boolean;
  selectedToken: TokenInfo | undefined;
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const { endpoint } = useConnectionConfig();
  const { connected, wallet, publicKey } = useWallet();
  const {
    userTokens,
    selectedToken,
    transactionStatus,
    streamV2ProgramAddress,
    setTransactionStatus,
  } = useContext(AppStateContext);
  const {
    startFetchTxSignatureInfo,
    clearTransactionStatusContext,
  } = useContext(TransactionStatusContext);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [userAllocation, setUserAllocation] = useState<Allocation | null>(null);

  const meanToken = useMemo(() => {
    const token = userTokens.filter(t => t.symbol === 'MEAN');
    consoleOut('token:', token, 'blue');
    return token[0];
  }, [userTokens]);

  const treasuryAddress = useMemo(() => appConfig.getConfig().idoAirdropTreasuryAddress, []);
  const treasurerAddress = useMemo(() => appConfig.getConfig().idoAirdropTreasurerAddress, []);

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
    return  userAllocation &&
            userAllocation.tokenAmount > 0 &&
            userAllocation.cliffPercent > 0 &&
            userAllocation.cliffPercent < 1 &&
            userAllocation.monthlyRate > 0 &&
            !userAllocation.isAirdropCompleted
      ? true : false;
  }

  const getTransactionStartButtonLabel = (): string => {
    return !connected
      ? t('transactions.validation.not-connected')
      : !userAllocation || !userAllocation.tokenAmount
        ? 'Nothing to claim'
        : userAllocation.isAirdropCompleted
          ? 'Airdrop has completed'
          : isError(transactionStatus.currentOperation)
            ? 'Retry operation'
            : 'Claim now'
  }

  const onExecuteAirdropTx = async () => {
    let transaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setIsBusy(true);

    const screamOut = (message: any) => {
      setTransactionStatus({
        lastOperation: TransactionStatus.SignTransaction,
        currentOperation: TransactionStatus.SignTransactionFailure
      });
      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
        result: message
      });
      customLogger.logWarning('Create Airdrop Redeem transaction failed', { transcript: transactionLog });
    }

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
        const allocation = toTokenAmount(userAllocation.tokenAmount, meanToken.decimals);
        const rateAmount = toTokenAmount(userAllocation.monthlyRate, meanToken.decimals);
        const streamName = 'MEAN Airdrop';
        const now = new Date();
        const cliffAmount = 0;
        const cliffVestPercent = userAllocation.cliffPercent * 100;

        const data = {
          treasurer: treasurer.toBase58(),
          treasury: treasury.toBase58(),
          beneficiary: publicKey.toBase58(),
          associatedToken: associatedToken.toBase58(),
          streamName: streamName,
          allocationAssigned: allocation,
          allocationReserved: allocation,
          rateAmount: rateAmount,
          rateIntervalInSeconds: getRateIntervalInSeconds(PaymentRateType.PerMonth),
          startUtc: now.toUTCString(),
          cliffVestAmount: cliffAmount,
          cliffVestPercent: cliffVestPercent,
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

        const msp = new MSP(endpoint, streamV2ProgramAddress, "confirmed");

        consoleOut('Starting withdraw using MSP V2...', '', 'blue');
        // Create a transaction
        return await msp.createStream(
          beneficiary,                                                      // initializer
          treasurer,                                                        // treasurer
          treasury,                                                         // treasury
          beneficiary,                                                      // beneficiary
          associatedToken,                                                  // associatedToken
          streamName,                                                       // streamName
          allocation,                                                       // allocationAssigned
          allocation,                                                       // allocationReserved
          rateAmount,                                                       // rateAmount
          getRateIntervalInSeconds(PaymentRateType.PerMonth),               // rateIntervalInSeconds
          now,                                                              // startUtc
          cliffAmount,
          cliffVestPercent
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
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
              result: {signer: wallet.publicKey.toBase58()}
            });

            // Send Tx to add treasurer signature
            try {
              encodedTx = signed.serialize({ requireAllSignatures: false, verifySignatures: true }).toString('base64');
              consoleOut('encodedTx before updating:', encodedTx, 'orange');
              const response = await sendSignClaimTxRequest(publicKey.toBase58(), encodedTx);
              consoleOut('sendSignClaimTxRequest response:', response, 'blue');
              consoleOut('Felipe');
              if (!response || !response.base64SignedClaimTransaction) {
                consoleOut('There was no allocation', '', 'red');
                screamOut('There was no allocation');
                return false;
              }
              encodedTx = response.base64SignedClaimTransaction;
              consoleOut('encodedTx:', encodedTx, 'orange');
              setTransactionStatus({
                lastOperation: TransactionStatus.SignTransactionSuccess,
                currentOperation: TransactionStatus.SendTransaction
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
                result: 'sendSignClaimTxRequest returned an updated Tx'
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

    const confirmTx = async (): Promise<boolean> => {
      return await props.connection
        .confirmTransaction(signature, "confirmed")
        .then(result => {
          consoleOut('confirmTransaction result:', result);
          if (result && result.value && !result.value.err) {
            setTransactionStatus({
              lastOperation: TransactionStatus.ConfirmTransactionSuccess,
              currentOperation: TransactionStatus.TransactionFinished
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.TransactionFinished),
              result: ''
            });
            return true;
          } else {
            setTransactionStatus({
              lastOperation: TransactionStatus.ConfirmTransaction,
              currentOperation: TransactionStatus.ConfirmTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.ConfirmTransactionFailure),
              result: signature
            });
            customLogger.logError('One-Time Payment transaction failed', { transcript: transactionLog });
            throw(result?.value?.err || new Error("Could not confirm transaction"));
          }
        })
        .catch(e => {
          setTransactionStatus({
            lastOperation: TransactionStatus.ConfirmTransaction,
            currentOperation: TransactionStatus.ConfirmTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.ConfirmTransactionFailure),
            result: signature
          });
          customLogger.logError('One-Time Payment transaction failed', { transcript: transactionLog });
          return false;
        });
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
              const confirmed = await confirmTx();
              consoleOut("confirmed:", confirmed);
              if (confirmed) {
                await sendRecordClaimTxRequest(publicKey.toBase58(), signature);
                setIsBusy(false);
                navigate('/accounts/streams');
              } else { setIsBusy(false); }
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
                    decimals={2}
                    separator=','
                    duration={2} />
                  <span className="ml-1">{meanToken.symbol}</span>
                </div>
              </>
            ) : (
              <div className="airdrop-amount">0.00 MEAN</div>
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
        disabled={props.disabled || !isValidOperation()}
        onClick={onExecuteAirdropTx}>
        {isBusy && (
          <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
        )}
        {getTransactionStartButtonLabel()}
      </Button>
    </>
  );
};
