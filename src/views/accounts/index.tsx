import React from 'react';
import { CheckCircleOutlined, SyncOutlined } from '@ant-design/icons';
import { Connection } from '@solana/web3.js';
import { useCallback, useEffect, useState } from 'react';
import { PreFooter } from '../../components/PreFooter';
import { TransactionItemView } from '../../components/TransactionItemView';
import { useConnectionConfig } from '../../contexts/connection';
import { useWallet } from '../../contexts/wallet';
import { TransactionWithSignature } from '../../utils/transactions';

export const AccountsView = () => {
  const connection = useConnectionConfig();
  const { publicKey } = useWallet();
  const [customConnection, setCustomConnection] = useState<Connection>();
  const [shouldLoadTxs, setShouldLoadTxs] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [abortSignalReceived, setAbortSignalReceived] = useState(false);
  const [transactions, setTransactions] = useState<Array<TransactionWithSignature>>([]);

  const abortSwitch = () => setAbortSignalReceived(abortSignalReceived => !abortSignalReceived);

  const loadTransactions = useCallback(async () => {

    if (!shouldLoadTxs) { return; }

    if (customConnection && publicKey && !loadingTransactions) {
      setLoadingTransactions(true);
      const transSignatures = await customConnection.getConfirmedSignaturesForAddress2(publicKey);
      console.log('transSignatures:', transSignatures);

      const transactions = new Array<TransactionWithSignature>();

      for (const item of transSignatures) {
        console.log('abortSignalReceived:', abortSignalReceived);
        if (abortSignalReceived) {
          setLoadingTransactions(false);
          return;
        } else {
          const signature = item.signature;
          const confirmedTransaction = await customConnection.getConfirmedTransaction(signature);
          if (confirmedTransaction) {
            const transWithSignature = new TransactionWithSignature(
              signature,
              confirmedTransaction
            );
            transactions.push(transWithSignature);
            setTransactions(transactions => [...transactions, transWithSignature]);
          }
        }
      }
      setLoadingTransactions(false);
    }
  }, [
    abortSignalReceived,
    shouldLoadTxs,
    customConnection,
    loadingTransactions,
    publicKey
  ]);

  // First load
  useEffect(() => {
    if (!customConnection) {
      setCustomConnection(new Connection(connection.endpoint, 'confirmed'));
    }

    if (shouldLoadTxs && customConnection && publicKey) {
      setAbortSignalReceived(false);
      setShouldLoadTxs(false);
      loadTransactions();
    }
  }, [
    connection.endpoint,
    customConnection,
    publicKey
  ]);

  const renderTransactions = () => {
    return transactions?.map((trans) => {
      return <TransactionItemView key={trans.signature} transaction={trans} />;
    });
  };

  return (
    <>
      <div className="container main-container">
        <div className="interaction-area">
          <p>Activity:&nbsp;{loadingTransactions ? (
            <>
              <SyncOutlined spin />
              &nbsp;<span role="link" className="secondary-link" onClick={abortSwitch}>Stop</span>
            </>
          ) : (
            <CheckCircleOutlined className="fg-success" />
          )}
          </p>
          <p>Abort signal received: {abortSignalReceived ? 'true' : 'false'}</p>
          <div>{renderTransactions()}</div>
        </div>
      </div>
      <PreFooter />
    </>
  );

};
