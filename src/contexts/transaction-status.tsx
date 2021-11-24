import React, { useState, useEffect, useCallback } from "react";
import { TransactionConfirmationStatus } from "@solana/web3.js";
import { useConnection } from "./connection";
import { fetchTransactionStatus } from "../utils/transactions";
import { consoleOut, delay } from "../utils/ui";
import { OperationType } from "../models/enums";
import { SOLANA_EXPLORER_URI_INSPECT_TRANSACTION, TRANSACTION_STATUS_RETRY, TRANSACTION_STATUS_RETRY_TIMEOUT } from "../constants";
import { message } from "antd";
import { useTranslation } from "react-i18next";
import { shortenAddress } from "../utils/utils";

export type TxStatus = "fetching" | "fetched" | "error";
const key = 'updatable';

interface TransactionStatusConfig {
  lastSentTxSignature: string;
  lastSentTxStatus: TransactionConfirmationStatus | undefined;
  lastSentTxOperationType: OperationType | undefined;
  fetchTxInfoStatus: TxStatus | undefined;
  recentlyCreatedVault: string;
  startFetchTxSignatureInfo: (
    signature: string,
    finality: TransactionConfirmationStatus,
    type: OperationType
  ) => void;
  setRecentlyCreatedVault: (ddcaAccountPda: string) => void;
  clearTransactionStatusContext: () => void;
}

const defaultCtxValues: TransactionStatusConfig = {
  lastSentTxSignature: '',
  lastSentTxStatus: undefined,
  lastSentTxOperationType: undefined,
  fetchTxInfoStatus: undefined,
  recentlyCreatedVault: '',
  startFetchTxSignatureInfo: () => {},
  setRecentlyCreatedVault: () => {},
  clearTransactionStatusContext: () => {},
};

export const TransactionStatusContext = React.createContext<TransactionStatusConfig>(defaultCtxValues);

const TransactionStatusProvider: React.FC = ({ children }) => {
  const today = new Date();
  const connection = useConnection();
  const { t } = useTranslation('common');

  // Variables
  const [txTimestampAdded, setTxTimestampAdded] = useState(today.getTime());
  const [lastSentTxSignature, setLastSentTxSignature] = useState<string>(defaultCtxValues.lastSentTxSignature);
  const [lastSentTxStatus, setLastSentTxStatus] = useState<TransactionConfirmationStatus | undefined>(defaultCtxValues.lastSentTxStatus);
  const [lastSentTxOperationType, setLastSentTxOperationType] = useState<OperationType | undefined>(defaultCtxValues.lastSentTxOperationType);
  const [fetchTxInfoStatus, setFetchingTxStatus] = useState<TxStatus | undefined>(defaultCtxValues.fetchTxInfoStatus);
  const [finality, setExpectedFinality] = useState<TransactionConfirmationStatus | undefined>();
  const [recentlyCreatedVault, updateRecentlyCreatedVault] = useState(defaultCtxValues.recentlyCreatedVault);

  const setRecentlyCreatedVault = (ddcaAccountPda: string) => {
    updateRecentlyCreatedVault(ddcaAccountPda);
  }

  const startFetchTxSignatureInfo = (signature: string, finality: TransactionConfirmationStatus, type: OperationType) => {
    const now = new Date().getTime();
    setTxTimestampAdded(now);
    setLastSentTxSignature(signature);
    setExpectedFinality(finality);
    setLastSentTxStatus(undefined);
    setLastSentTxOperationType(type);
    setFetchingTxStatus(undefined);
    message.loading({ content: t('transactions.status.tx-confirmation-status-wait'), key, duration: 0, className: 'custom-message' });
  }

  const clearTransactionStatusContext = () => {
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

  const warningMessage = (
    <>
    <span>
      {t(
        'transactions.status.tx-confirmation-status-timeout',
        {timeout: `${TRANSACTION_STATUS_RETRY_TIMEOUT / 1000}${t('general.seconds')}`}
      )}. {t('transactions.status.tx-confirm-failure-check')}.
    </span>
    <div>
      <a className="secondary-link"
          href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${lastSentTxSignature}`}
          target="_blank"
          rel="noopener noreferrer">
          {shortenAddress(lastSentTxSignature, 8)}
      </a>
    </div>
    </>
  );

  useEffect(() => {
    if (!lastSentTxSignature || lastSentTxStatus === finality || fetchTxInfoStatus !== undefined) { return; }

    setFetchingTxStatus("fetching");

    (async () => {
      consoleOut('Calling getTxStatus()...', '', 'crimson');
      const result = await getTxStatus();
      if (result === finality) {
        setFetchingTxStatus("fetched");
        message.success({ content: t('transactions.status.tx-confirmation-status-confirmed'), key, duration: 3, className: 'custom-message' });
      } else {
        setFetchingTxStatus("error");
        message.warning({ content: warningMessage, key, duration: 5, className: 'custom-message' });
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
        recentlyCreatedVault,
        clearTransactionStatusContext,
        startFetchTxSignatureInfo,
        setRecentlyCreatedVault
      }}>
      {children}
    </TransactionStatusContext.Provider>
  );
};

export default TransactionStatusProvider;
