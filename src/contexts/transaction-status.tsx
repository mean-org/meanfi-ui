import React, { useState, useEffect, useCallback } from "react";
import { TransactionConfirmationStatus } from "@solana/web3.js";
import { useConnection } from "./connection";
import { fetchTransactionStatus } from "../utils/transactions";
import { consoleOut, delay } from "../utils/ui";
import { OperationType } from "../models/enums";

export type TxStatus = "fetching" | "fetched" | "error";

const TRANSACTION_STATUS_RETRY = 3 * 1000;            // Retry fetch transaction status every 3 seconds
const TRANSACTION_STATUS_RETRY_TIMEOUT = 30 * 1000;   // Max timeout for trying fetch

interface TransactionStatusConfig {
  lastSentTxSignature: string;
  lastSentTxStatus: TransactionConfirmationStatus | undefined;
  lastSentTxOperationType: OperationType | undefined;
  fetchTxInfoStatus: TxStatus | undefined;
  startFetchTxSignatureInfo: (
    signature: string,
    finality: TransactionConfirmationStatus,
    type: OperationType
  ) => void;
  clearLastSentTx: () => void;
}

const defaultCtxValues: TransactionStatusConfig = {
  lastSentTxSignature: '',
  lastSentTxStatus: undefined,
  lastSentTxOperationType: undefined,
  fetchTxInfoStatus: undefined,
  startFetchTxSignatureInfo: () => {},
  clearLastSentTx: () => {},
};

export const TransactionStatusContext = React.createContext<TransactionStatusConfig>(defaultCtxValues);

const TransactionStatusProvider: React.FC = ({ children }) => {
  const today = new Date();
  const connection = useConnection();

  // Variables
  const [txTimestampAdded, setTxTimestampAdded] = useState(today.getTime());
  const [lastSentTxSignature, setLastSentTxSignature] = useState<string>(defaultCtxValues.lastSentTxSignature);
  const [lastSentTxStatus, setLastSentTxStatus] = useState<TransactionConfirmationStatus | undefined>(defaultCtxValues.lastSentTxStatus);
  const [lastSentTxOperationType, setLastSentTxOperationType] = useState<OperationType | undefined>(defaultCtxValues.lastSentTxOperationType);
  const [fetchTxInfoStatus, setFetchingTxStatus] = useState<TxStatus | undefined>(defaultCtxValues.fetchTxInfoStatus);
  const [finality, setExpectedFinality] = useState<TransactionConfirmationStatus | undefined>();

  const startFetchTxSignatureInfo = (signature: string, finality: TransactionConfirmationStatus, type: OperationType) => {
    const now = new Date().getTime();
    setTxTimestampAdded(now);
    setLastSentTxSignature(signature);
    setExpectedFinality(finality);
    setLastSentTxStatus(undefined);
    setLastSentTxOperationType(type);
    setFetchingTxStatus(undefined);
  }

  const clearLastSentTx = () => {
    setLastSentTxSignature('');
    setExpectedFinality(undefined);
    setLastSentTxStatus(undefined);
    setLastSentTxOperationType(undefined);
    setFetchingTxStatus(undefined);
  }

  const getTxStatus = useCallback(async () => {
    if (!connection) { return; }

    let lastResult: TransactionConfirmationStatus | undefined = undefined;

    const fetchStatus = async () => {
      try {
        const result = await fetchTransactionStatus(connection, lastSentTxSignature);
        const status = result?.info?.confirmationStatus || 'fetching';
        consoleOut('Transaction status:', status, 'blue');

        // Success with no data, retry
        if (!result || (result && !result.info)) {
          return undefined;
        }

        if (result && result.info && !result.info.err) {
          setLastSentTxStatus(result.info.confirmationStatus);
          return result.info.confirmationStatus;
        }
        return undefined;
      } catch (error) {
        console.error(error);
        return undefined;
      }
    }

    // If we don't get the result we want and there is still time to retry
    // consoleOut('Elapsed:', now - txTimestampAdded, 'blue');
    while (lastResult !== finality && ((new Date().getTime()) - txTimestampAdded) < TRANSACTION_STATUS_RETRY_TIMEOUT) {
      lastResult = await fetchStatus();
      if (lastResult !== finality) {
        await delay(TRANSACTION_STATUS_RETRY);
      }
    }

    return lastResult;

  }, [
    finality,
    connection,
    txTimestampAdded,
    lastSentTxSignature
  ])

  useEffect(() => {
    if (!lastSentTxSignature || lastSentTxStatus === finality || fetchTxInfoStatus !== undefined) { return; }

    setFetchingTxStatus("fetching");

    (async () => {
      consoleOut('Calling getTxStatus()...', '', 'crimson');
      const result = await getTxStatus();
      if (result === finality) {
        setFetchingTxStatus("fetched");
      } else {
        setFetchingTxStatus("error");
      }
      consoleOut('Total confirmation time (s):', ((new Date().getTime()) - txTimestampAdded) / 1000,'blue');
    })();

    return () => { }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    finality,
    lastSentTxStatus,
    fetchTxInfoStatus,
    lastSentTxSignature,
    getTxStatus
  ]);

  return (
    <TransactionStatusContext.Provider
      value={{
        fetchTxInfoStatus,
        lastSentTxSignature,
        lastSentTxStatus,
        lastSentTxOperationType,
        clearLastSentTx,
        startFetchTxSignatureInfo,
      }}>
      {children}
    </TransactionStatusContext.Provider>
  );
};

export default TransactionStatusProvider;
