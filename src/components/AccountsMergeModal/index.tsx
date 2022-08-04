import React, { useContext, useState } from 'react';
import { Button, Modal, Spin } from "antd";
import { useTranslation } from 'react-i18next';
import { useWallet } from '../../contexts/wallet';
import { AppStateContext } from '../../contexts/appstate';
import { TransactionStatus } from '../../models/enums';
import { consoleOut, getTransactionOperationDescription, getTransactionStatusForLogs } from '../../utils/ui';
import { CheckOutlined, CloseCircleOutlined, LoadingOutlined, WarningOutlined } from '@ant-design/icons';
import { AccountTokenParsedInfo } from '../../models/token';
import { getTokenAmountAndSymbolByTokenAddress, getTxIxResume, shortenAddress } from '../../utils/utils';
import { createTokenMergeTx } from '../../utils/accounts';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { customLogger } from '../..';
import { UserTokenAccount } from '../../models/transactions';
import { TokenDisplay } from '../TokenDisplay';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const AccountsMergeModal = (props: {
    connection: Connection;
    handleClose: any;
    handleOk: any;
    isVisible: boolean;
    tokenMint: string;
    tokenGroup: AccountTokenParsedInfo[] | undefined;
    accountTokens: UserTokenAccount[];
}) => {
    const { t } = useTranslation('common');
    const { publicKey, wallet } = useWallet();
    const {
      transactionStatus,
      setTransactionStatus,
    } = useContext(AppStateContext);
    const [transactionCancelled, setTransactionCancelled] = useState(false);
    const [isBusy, setIsBusy] = useState(false);

    const onFinishedMergeAccountsTx = () => {
        setIsBusy(false);
        props.handleOk();
    }

    const onExecuteMergeAccountsTx = async () => {
        let transaction: Transaction;
        let signedTransaction: Transaction;
        let signature: any;
        let encodedTx: string;
        const transactionLog: any[] = [];

        setTransactionCancelled(false);
        setIsBusy(true);

        const createTx = async (): Promise<boolean> => {
          if (publicKey && props.tokenGroup) {
            consoleOut('Wallet address:', publicKey?.toBase58());

            setTransactionStatus({
              lastOperation: TransactionStatus.TransactionStart,
              currentOperation: TransactionStatus.InitTransaction
            });

            const mintPubkey = new PublicKey(props.tokenMint);

            // Tx input data
            const data = {
                connection: props.connection.commitment,
                mint: props.tokenMint,
                owner: publicKey.toBase58(),
                mergeGroup: props.tokenGroup
            };
            consoleOut('data:', data, 'blue');

            // Log input data
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
              inputs: data
            });

            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
              result: ''
            });

            return await createTokenMergeTx(
                props.connection,
                mintPubkey,
                publicKey,
                props.tokenGroup
            )
            .then(value => {
              consoleOut('createTokenMergeTx returned transaction:', value);
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
              console.error('createTokenMergeTx error:', error);
              setTransactionStatus({
                lastOperation: transactionStatus.currentOperation,
                currentOperation: TransactionStatus.InitTransactionFailure
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
                result: `${error}`
              });
              customLogger.logError('Token accounts merge transaction failed', { transcript: transactionLog });
              return false;
            });
          } else {
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
              result: 'Cannot start transaction! Wallet not found!'
            });
            customLogger.logError('Token accounts merge transaction failed', { transcript: transactionLog });
            return false;
          }
        }

        const signTx = async (): Promise<boolean> => {
          if (wallet && publicKey) {
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
                  result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
                });
                customLogger.logError('Token accounts merge transaction failed', { transcript: transactionLog });
                return false;
              }
              setTransactionStatus({
                lastOperation: TransactionStatus.SignTransactionSuccess,
                currentOperation: TransactionStatus.SendTransaction
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
                result: {signer: publicKey.toBase58()}
              });
              return true;
            })
            .catch(error => {
              console.error(error);
              setTransactionStatus({
                lastOperation: TransactionStatus.SignTransaction,
                currentOperation: TransactionStatus.SignTransactionFailure
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
                result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
              });
              customLogger.logError('Token accounts merge transaction failed', { transcript: transactionLog });
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
              result: 'Cannot sign transaction! Wallet not found!'
            });
            customLogger.logError('Token accounts merge transaction failed', { transcript: transactionLog });
            return false;
          }
        }

        const sendTx = async (): Promise<boolean> => {
          if (wallet) {
            return await props.connection
              .sendEncodedTransaction(encodedTx, { preflightCommitment: "confirmed" })
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
                  currentOperation: TransactionStatus.SendTransactionFailure,
                });
                transactionLog.push({
                  action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
                  result: { error, encodedTx }
                });
                customLogger.logError('Token accounts merge transaction failed', { transcript: transactionLog });
                return false;
              });
          } else {
            console.error('Cannot send transaction! Wallet not found!');
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.WalletNotFound,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
              result: 'Cannot send transaction! Wallet not found!'
            });
            customLogger.logError('Token accounts merge transaction failed', { transcript: transactionLog });
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
                customLogger.logError('Token accounts merge transaction failed', { transcript: transactionLog });
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
              customLogger.logError('Token accounts merge transaction failed', { transcript: transactionLog });
              return false;
            });
        }

        if (wallet) {
          const create = await createTx();
          consoleOut('created:', create);
          if (create && !transactionCancelled) {
            const sign = await signTx();
            consoleOut('signed:', sign);
            if (sign && !transactionCancelled) {
              const sent = await sendTx();
              consoleOut('sent:', sent);
              if (sent && !transactionCancelled) {
                const confirmed = await confirmTx();
                consoleOut('confirmed:', confirmed);
                if (confirmed) {
                  setIsBusy(false);
                } else { setIsBusy(false); }
              } else { setIsBusy(false); }
            } else { setIsBusy(false); }
          } else { setIsBusy(false); }
        }

    };

    return (
        <Modal
            className="mean-modal simple-modal"
            title={<div className="modal-title">{t('assets.merge-accounts-link')}</div>}
            footer={null}
            visible={props.isVisible}
            onCancel={props.handleClose}
            width={360}>

            <div className={!isBusy ? "panel1 show" : "panel1 hide"}>
                {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
                  <>
                    <div className="transaction-progress">
                      <WarningOutlined style={{ fontSize: 48 }} className="icon mt-0" />
                      <h4 className="font-bold">Token accounts that will be merged</h4>
                    </div>
                    {/* List of token accounts that will be merged */}
                    {props.tokenGroup && props.tokenGroup.length > 0 && (
                        <div className="well merged-token-list">
                        {props.tokenGroup.map((item: AccountTokenParsedInfo, index: number) => {
                            const token = props.accountTokens.find(t => t.publicAddress === item.pubkey.toBase58());
                            return (
                                <div key={`${index}`} className="flex-fixed-right align-items-center merged-token-item">
                                    <div className="left flex-column">
                                        <span className="add-on">
                                          {token && (
                                            <TokenDisplay onClick={() => {}}
                                              mintAddress={token.address}
                                              name={token.name}
                                              showName={true}
                                              showCaretDown={false}
                                            />
                                          )}
                                        </span>
                                        <div className="public-address">{shortenAddress(item.pubkey.toBase58(), 10)}</div>
                                    </div>
                                    <div className="right">
                                    {`${item.parsedInfo.mint
                                        ? getTokenAmountAndSymbolByTokenAddress(
                                                item.parsedInfo.tokenAmount.uiAmount || 0,
                                                item.parsedInfo.mint,
                                                true
                                            )
                                        : "0"
                                    }`}
                                    </div>
                                </div>
                            );
                        })}
                        </div>
                    )}
                    <div className="text-center">
                      <p><strong>WARNING</strong>: This action may break apps that depend on your existing token accounts.</p>
                      {props.tokenGroup && props.tokenGroup.length > 4 && (
                        <p>Up to 4 token accounts can be merged at once. Please review your remaining tokens after the merge and run merge again as needed.</p>
                      )}
                      <p>Merging your {props.tokenGroup && props.tokenGroup[0].description} token accounts will send funds to the <strong>Associated Token Account</strong>.</p>
                    </div>
                  </>
                ) : transactionStatus.currentOperation === TransactionStatus.TransactionFinished ? (
                <div className="transaction-progress">
                    <CheckOutlined style={{ fontSize: 48 }} className="icon mt-0" />
                    <h4 className="font-bold">Your tokens have been merged into the <strong>Associated Token Account</strong>!</h4>
                </div>
                ) : (
                <div className="transaction-progress">
                  <CloseCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
                    <h4 className="font-bold">Merge token accounts failed</h4>
                    <div className="operation">{getTransactionOperationDescription(transactionStatus.currentOperation, t)}</div>
                </div>
                )}
            </div>

            <div className={isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle ? "panel2 show" : "panel2 hide"}>
                {isBusy && transactionStatus !== TransactionStatus.Iddle && (
                <div className="transaction-progress">
                    <Spin indicator={bigLoadingIcon} className="icon mt-0" />
                    <h4 className="font-bold">Merging token accounts...</h4>
                    <div className="operation">{getTransactionOperationDescription(transactionStatus.currentOperation, t)}</div>
                </div>
                )}
            </div>

            <Button
                className={`main-cta mt-3 ${isBusy ? 'inactive' : ''}`}
                block
                type="primary"
                shape="round"
                size="large"
                onClick={() => {
                    if (transactionStatus.currentOperation === TransactionStatus.TransactionFinished) {
                        onFinishedMergeAccountsTx();
                    } else {
                        onExecuteMergeAccountsTx()
                    }
                }}>
                {isBusy
                    ? 'Merging accounts'
                    : transactionStatus.currentOperation === TransactionStatus.Iddle
                        ? 'Start merge'
                        : transactionStatus.currentOperation === TransactionStatus.TransactionFinished
                            ? 'Completed'
                            : 'Try again'
                }
            </Button>
        </Modal>
    );
};
