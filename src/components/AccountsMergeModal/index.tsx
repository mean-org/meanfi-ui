import { CheckOutlined, CloseCircleOutlined, LoadingOutlined, WarningOutlined } from '@ant-design/icons';
import { type Connection, PublicKey, type VersionedTransaction } from '@solana/web3.js';
import { Button, Modal, Spin } from 'antd';
import { openNotification } from 'components/Notifications';
import { TokenDisplay } from 'components/TokenDisplay';
import { AppStateContext } from 'contexts/appstate';
import { TxConfirmationContext } from 'contexts/transaction-status';
import { useWallet } from 'contexts/wallet';
import { customLogger } from 'index';
import { createV0TokenMergeTx } from 'middleware/createV0TokenMergeTx';
import { sendTx, signTx } from 'middleware/transactions';
import {
  consoleOut,
  friendlyDisplayDecimalPlaces,
  getTransactionOperationDescription,
  getTransactionStatusForLogs,
} from 'middleware/ui';
import { formatThousands, getVersionedTxIxResume, shortenAddress } from 'middleware/utils';
import type { AccountTokenParsedInfo, UserTokenAccount } from 'models/accounts';
import { OperationType, TransactionStatus } from 'models/enums';
import { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
  const { connection, handleClose, handleOk, isVisible, tokenMint, tokenGroup, accountTokens } = props;
  const { t } = useTranslation('common');
  const { publicKey, wallet } = useWallet();
  const { transactionStatus, setTransactionStatus } = useContext(AppStateContext);
  const { enqueueTransactionConfirmation } = useContext(TxConfirmationContext);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const onFinishedMergeAccountsTx = () => {
    setIsBusy(false);
    handleOk();
  };

  const onExecuteMergeAccountsTx = async () => {
    let transaction: VersionedTransaction | null = null;
    let signature: any;
    let encodedTx: string;
    let transactionLog: any[] = [];

    setTransactionCancelled(false);
    setIsBusy(true);

    const createTx = async (): Promise<boolean> => {
      if (publicKey && tokenGroup) {
        consoleOut('Wallet address:', publicKey?.toBase58());

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        const mintPubkey = new PublicKey(tokenMint);

        // Tx input data
        const data = {
          connection: connection.commitment,
          mint: tokenMint,
          owner: publicKey.toBase58(),
          mergeGroup: tokenGroup,
        };
        consoleOut('data:', data, 'blue');

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: data,
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: '',
        });

        return createV0TokenMergeTx(connection, mintPubkey, publicKey, tokenGroup)
          .then(value => {
            consoleOut('createTokenMergeTx returned transaction:', value);
            setTransactionStatus({
              lastOperation: TransactionStatus.InitTransactionSuccess,
              currentOperation: TransactionStatus.SignTransaction,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
              result: getVersionedTxIxResume(value),
            });
            transaction = value;
            return true;
          })
          .catch(error => {
            console.error('createTokenMergeTx error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`,
            });
            customLogger.logError('Token accounts merge transaction failed', {
              transcript: transactionLog,
            });
            return false;
          });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('Token accounts merge transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }
    };

    if (wallet && publicKey) {
      const created = await createTx();
      consoleOut('created:', created);
      if (created && !transactionCancelled && transaction) {
        const sign = await signTx('Merge Token Accounts', wallet, publicKey, transaction);
        if (sign.encodedTransaction) {
          encodedTx = sign.encodedTransaction;
          transactionLog = transactionLog.concat(sign.log);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionSuccess,
          });
          const sent = await sendTx('Merge Token Accounts', connection, encodedTx);
          consoleOut('sent:', sent);
          if (sent.signature && !transactionCancelled) {
            signature = sent.signature;
            consoleOut('Send Tx to confirmation queue:', signature);
            const loadingMessage = `Merge ${tokenGroup ? tokenGroup.length : ''} token accounts`;
            const completedMessage = `Successfully merged ${tokenGroup ? tokenGroup.length : ''} token accounts`;
            enqueueTransactionConfirmation({
              signature,
              operationType: OperationType.MergeTokenAccounts,
              finality: 'confirmed',
              txInfoFetchStatus: 'fetching',
              loadingTitle: 'Confirming transaction',
              loadingMessage,
              completedTitle: 'Transaction confirmed',
              completedMessage,
            });
            setIsBusy(false);
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

  const getMainCtaLabel = () => {
    if (isBusy) {
      return 'Merging accounts';
    } else if (transactionStatus.currentOperation === TransactionStatus.Iddle) {
      return 'Start merge';
    } else if (transactionStatus.currentOperation === TransactionStatus.TransactionFinished) {
      return 'Completed';
    } else {
      return 'Try again';
    }
  };

  return (
    <Modal
      className='mean-modal simple-modal'
      title={<div className='modal-title'>{t('assets.merge-accounts-link')}</div>}
      footer={null}
      open={isVisible}
      onCancel={handleClose}
      width={400}
    >
      <div className={!isBusy ? 'panel1 show' : 'panel1 hide'}>
        {transactionStatus.currentOperation === TransactionStatus.Iddle && (
          <>
            <div className='transaction-progress'>
              <WarningOutlined style={{ fontSize: 48 }} className='icon mt-0' />
              <h4 className='font-bold'>Token accounts that will be merged</h4>
            </div>
            {/* List of token accounts that will be merged */}
            {tokenGroup && tokenGroup.length > 0 && (
              <div className='well merged-token-list'>
                {tokenGroup.map((item: AccountTokenParsedInfo, index: number) => {
                  if (index > 3) {
                    return null;
                  }
                  const token = accountTokens.find(t => t.publicAddress === item.pubkey.toBase58());
                  return (
                    <div key={`${index}`} className='flex-fixed-right align-items-center merged-token-item'>
                      <div className='left flex-column'>
                        <span className='add-on'>
                          {token && (
                            <TokenDisplay
                              onClick={() => {}}
                              mintAddress={token.address}
                              name={token.name}
                              showName={true}
                              showCaretDown={false}
                            />
                          )}
                        </span>
                        <div className='public-address'>{shortenAddress(item.pubkey, 10)}</div>
                      </div>
                      <div className='right'>
                        {formatThousands(
                          item.parsedInfo.tokenAmount.uiAmount || 0,
                          friendlyDisplayDecimalPlaces(
                            item.parsedInfo.tokenAmount.uiAmount || 0,
                            item.parsedInfo.tokenAmount.decimals,
                          ),
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className='text-center'>
              <p>
                <strong>WARNING</strong>: This action may break apps that depend on your existing token accounts.
              </p>
              {tokenGroup && tokenGroup.length > 4 && (
                <p>
                  Up to 4 token accounts can be merged at once. Please review your remaining tokens after the merge and
                  run merge again as needed.
                </p>
              )}
              <p>
                Merging your {tokenGroup && tokenGroup[0].description} token accounts will send funds to the{' '}
                <strong>Associated Token Account</strong>.
              </p>
            </div>
          </>
        )}
        {transactionStatus.currentOperation === TransactionStatus.TransactionFinished && (
          <div className='transaction-progress'>
            <CheckOutlined style={{ fontSize: 48 }} className='icon mt-0' />
            <h4 className='font-bold'>
              Your tokens have been merged into the <strong>Associated Token Account</strong>!
            </h4>
          </div>
        )}
        {transactionStatus.currentOperation !== TransactionStatus.Iddle &&
          transactionStatus.currentOperation !== TransactionStatus.TransactionFinished && (
            <div className='transaction-progress'>
              <CloseCircleOutlined style={{ fontSize: 48 }} className='icon mt-0' />
              <h4 className='font-bold'>Merge token accounts failed</h4>
              <div className='operation'>
                {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
              </div>
            </div>
          )}
      </div>

      <div
        className={
          isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle ? 'panel2 show' : 'panel2 hide'
        }
      >
        {isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle && (
          <div className='transaction-progress'>
            <Spin indicator={bigLoadingIcon} className='icon mt-0' />
            <h4 className='font-bold'>Merging token accounts...</h4>
            <div className='operation'>{getTransactionOperationDescription(transactionStatus.currentOperation, t)}</div>
          </div>
        )}
      </div>

      <Button
        className={`main-cta mt-3 ${isBusy ? 'inactive' : ''}`}
        block
        type='primary'
        shape='round'
        size='large'
        onClick={() => {
          if (transactionStatus.currentOperation === TransactionStatus.TransactionFinished) {
            onFinishedMergeAccountsTx();
          } else {
            onExecuteMergeAccountsTx();
          }
        }}
      >
        {getMainCtaLabel()}
      </Button>
    </Modal>
  );
};
