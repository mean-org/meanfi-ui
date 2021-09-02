import React, { useContext, useReducer } from 'react';
import { CheckCircleOutlined, SyncOutlined } from '@ant-design/icons';
import { ConfirmedSignatureInfo, Connection } from '@solana/web3.js';
import { useCallback, useEffect, useState } from 'react';
import { PreFooter } from '../../components/PreFooter';
import { TransactionItemView } from '../../components/TransactionItemView';
import { useConnectionConfig } from '../../contexts/connection';
import { useWallet } from '../../contexts/wallet';
import { TransactionWithSignature } from '../../utils/transactions';
import {
  ActionTypes, defaultTransactionStats, IncrementTransactionIndexAction,
  ResetStatsAction, MoveTxIndexToEndAction, SetStatsAction, TransactionActions, TransactionStats
} from '../../models/transactions';
import { AppStateContext } from '../../contexts/appstate';

export const AccountsView = () => {
  const connection = useConnectionConfig();
  const { publicKey, connected } = useWallet();
  const [customConnection, setCustomConnection] = useState<Connection>();
  const { previousWalletConnectState } = useContext(AppStateContext);

  // Flow control
  const [shouldGetTxDetails, setShouldGetTxDetails] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [abortSignalReceived, setAbortSignalReceived] = useState(false);

  // Data
  const [signatures, setSignatures] = useState<Array<ConfirmedSignatureInfo>>([]);
  const [transactions, setTransactions] = useState<Array<TransactionWithSignature>>([]);
  const [stats, dispatch] = useReducer((state: TransactionStats, action: TransactionActions) => {
    switch (action.type) {
      case ActionTypes.SET_STATS:
        return {...state, ...action.payload};
      case ActionTypes.RESET_STATS:
        return {...state, ...defaultTransactionStats};
      case ActionTypes.ROLL_INDEX:
        return Object.assign({}, state, { index: signatures.length - 1 });
      case ActionTypes.INCREMENT_INDEX:
        return Object.assign({}, state, { index: state.index + 1 });
      default:
        return state;
    }
  }, defaultTransactionStats);

  // Methods
  const abortSwitch = () => {
    setAbortSignalReceived(abortSignalReceived => !abortSignalReceived);
    setShouldGetTxDetails(false);
    setLoadingTransactions(false);
    dispatch(new MoveTxIndexToEndAction());
  }

  const loadTransactionSignatures = useCallback(() => {

    if (customConnection && publicKey && !loadingTransactions) {
      setLoadingTransactions(true);
      customConnection.getConfirmedSignaturesForAddress2(publicKey)
        .then(sigs => {
          setSignatures(sigs);
          const newStats = new TransactionStats();
          newStats.index = 0;
          newStats.total = sigs.length;
          dispatch(new SetStatsAction(newStats));
          console.log('transSignatures:', signatures);
          console.log('stats:', newStats);
          if (sigs.length > 0) {
            setShouldGetTxDetails(true);
          } else {
            setTransactions([]);
            dispatch(new ResetStatsAction());
            setLoadingTransactions(false);
          }
        })
        .catch(error => {
          console.error(error.message, error);
          setSignatures([]);
          setShouldGetTxDetails(false);
          dispatch(new ResetStatsAction());
          setLoadingTransactions(false);
        });
    }

    // Cleanup
    return () => {
      setLoadingTransactions(false);
      setSignatures([]);
      setTransactions([]);
      dispatch(new ResetStatsAction());
    }
  }, [
    stats,
    customConnection,
    loadingTransactions,
    publicKey
  ]);

  // First load
  useEffect(() => {
    if (!customConnection) {
      setCustomConnection(new Connection(connection.endpoint, 'confirmed'));
    }

    // auto execute if wallet already connected
    if (customConnection && publicKey) {
      setAbortSignalReceived(false);
      loadTransactionSignatures();
    }
  }, [
    connection.endpoint,
    customConnection
  ]);

  // Hook on the wallet connect/disconnect
  useEffect(() => {
    if (previousWalletConnectState !== connected) {
      if (!previousWalletConnectState && connected) {
        console.log('Fetching account stats...');
        if (customConnection) {
          setAbortSignalReceived(false);
          loadTransactionSignatures();
        }
      } else if (previousWalletConnectState && !connected) {
        console.log('Deactivating account stats...');
        setAbortSignalReceived(true);
        setShouldGetTxDetails(false);
        setLoadingTransactions(false);
      }
    }
  }, [
    connected,
    customConnection,
    previousWalletConnectState
  ]);

  // Get transaction detail for each signature if not already loaded
  useEffect(() => {

    if (shouldGetTxDetails && customConnection && publicKey && !abortSignalReceived) {
      setShouldGetTxDetails(false);
      // Process current signature (signatures[stats.index].signature)
      // if its corresponding detail is not loaded into the transactions array
      const currentSignature = signatures[stats.index];
      // console.log('currentSignature:', currentSignature);
      const needFetching = signatures.length > 0 &&
                           (!transactions || transactions.length === 0 ||
                            !transactions.some(tx => tx.signature === currentSignature.signature));
      // console.log('needFetching:', needFetching);
      // console.log('stats.index:', stats.index);
      // console.log('signatures.length:', signatures.length);

      // If no need to fetch the Tx detail and the signature is the last one in the list
      if (!needFetching && stats.index >= (signatures.length - 1)) {
        // Set the state to stop and finish the whole process
        setLoadingTransactions(false);
        // TODO: update stats
        return;
      }

      if (needFetching) {
        customConnection.getConfirmedTransaction(currentSignature.signature)
          .then(confirmedTx => {
            if (confirmedTx) {
              const transWithSignature = new TransactionWithSignature(
                currentSignature.signature,
                confirmedTx
              );
              setTransactions(items => [...items, transWithSignature]);
              // Increment index to select next signature
              dispatch(new IncrementTransactionIndexAction());
              setShouldGetTxDetails(true);
              // TODO: update stats
            }
          })
      } else {
        // Increment index to select next signature
        dispatch(new IncrementTransactionIndexAction());
        // Set state to load next Tx details
        setShouldGetTxDetails(true);
        // TODO: update stats
      }
    }
  }, [
    stats,
    publicKey,
    signatures,
    transactions,
    customConnection,
    shouldGetTxDetails,
    abortSignalReceived,
  ]);

  // Keep stats in sync when transaction's list changes
  useEffect(() => {
    if (publicKey && transactions) {
      const incoming = transactions.filter(tx => tx.confirmedTransaction.transaction.instructions[0].keys[1].pubkey.toBase58() === publicKey.toBase58());
      const outgoing = transactions.filter(tx => tx.confirmedTransaction.transaction.instructions[0].keys[0].pubkey.toBase58() === publicKey.toBase58());
      const newStats = Object.assign({}, stats, {
        incoming: incoming.length,
        outgoing: outgoing.length
      });
      dispatch(new SetStatsAction(newStats));
    }
  }, [
    publicKey,
    transactions
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
          <p>Tx: {stats.total ? stats.index + 1 : 0} of {stats.total} | incoming: {stats.incoming} outgoing: {stats.outgoing}</p>
          <div>{renderTransactions()}</div>
        </div>
      </div>
      <PreFooter />
    </>
  );

};
