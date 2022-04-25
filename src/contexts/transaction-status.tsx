import React, { useState, useEffect, useCallback } from "react";
import { TransactionConfirmationStatus } from "@solana/web3.js";
import { getSolanaExplorerClusterParam, useConnection } from "./connection";
import { fetchTransactionStatus } from "../utils/transactions";
import { consoleOut, delay } from "../utils/ui";
import { EventType, OperationType } from "../models/enums";
import {
  SOLANA_EXPLORER_URI_INSPECT_TRANSACTION,
  TRANSACTION_STATUS_RETRY,
  TRANSACTION_STATUS_RETRY_TIMEOUT
} from "../constants";
import { useTranslation } from "react-i18next";
import { shortenAddress } from "../utils/utils";
import { openNotification } from "../components/Notifications";
import { notification } from "antd";

export type TxStatus = "fetching" | "fetched" | "error";
const key = 'updatable';

export interface TxConfirmationInfo {
  signature: string;
  finality: TransactionConfirmationStatus;
  operationType: OperationType;
  txInfoFetchStatus: TxStatus;
  loadingTitle?: string;
  loadingMessage?: string;
  completedTitle: string;
  completedMessage: string;
  timestamp?: number;
  extras?: any;
  timestampCompleted?: number;
}

type Listener = (value: any) => void;

type MapListener = Record<string, Listener[]>;

class EventEmitter {

  private mapListener: MapListener = {};

   public on(eventName: string, listener: Listener): void {
      const listeners = this.eventExists(eventName)
         ? this.mapListener[eventName]
         : [];

      this.mapListener[eventName] = [...listeners, listener];
   }

   public emit(eventName: string, value: any): void {
      if (this.eventExists(eventName)) {
         const listeners = this.mapListener[eventName];
         listeners.forEach(listener => listener(value));
      }
   }

   public off(eventName: string, listener: Listener): void {
      if (this.eventExists(eventName)) {
         const listeners = this.mapListener[eventName];
         this.mapListener[eventName] = listeners.filter(l => l !== listener);
      }
   }

   private eventExists(eventName: string): boolean {
      return eventName in this.mapListener;
   }
}

export const confirmationEvents = new EventEmitter();

const txStatusCache = new Map<string, TxConfirmationInfo>();

export const txConfirmationCache = {
  add: (
    signature: string,
    data: TxConfirmationInfo,
    timestamp: number,
  ) => {
      if (!signature || !data || !data.signature) { return; }

      const modifiedData = Object.assign({}, data, {
        timestamp
      });
      const isNew = !txStatusCache.has(signature);
      if (isNew) {
          txStatusCache.set(signature, modifiedData);
      }
      return modifiedData;
  },
  get: (signature: string) => {
      return txStatusCache.get(signature);
  },
  delete: (signature: string) => {
      if (txStatusCache.get(signature)) {
          txStatusCache.delete(signature);
          return true;
      }
      return false;
  },
  update: (
    signature: string,
    data: TxConfirmationInfo,
  ) => {
      if (txStatusCache.get(signature)) {
          txStatusCache.set(signature, data);
          return true;
      }
      return false;
  },
  clear: () => {
      txStatusCache.clear();
  },
};

interface TxConfirmationState {
  lastSentTxSignature: string;
  lastSentTxStatus: TransactionConfirmationStatus | undefined;
  lastSentTxOperationType: OperationType | undefined;
  fetchTxInfoStatus: TxStatus | undefined;
  recentlyCreatedVault: string;
  confirmationHistory: TxConfirmationInfo[];
  enqueueTransactionConfirmation: (data: TxConfirmationInfo) => void;
  clearConfirmationHistory: () => void;
  startFetchTxSignatureInfo: (
    signature: string,
    finality: TransactionConfirmationStatus,
    type: OperationType
  ) => void;
  setRecentlyCreatedVault: (ddcaAccountPda: string) => void;
  clearTxConfirmationContext: () => void;
}

const defaultCtxValues: TxConfirmationState = {
  lastSentTxSignature: '',
  lastSentTxStatus: undefined,
  lastSentTxOperationType: undefined,
  fetchTxInfoStatus: undefined,
  recentlyCreatedVault: '',
  confirmationHistory: [],
  enqueueTransactionConfirmation: () => {},
  clearConfirmationHistory: () => {},
  startFetchTxSignatureInfo: () => {},
  setRecentlyCreatedVault: () => {},
  clearTxConfirmationContext: () => {},
};

export const TxConfirmationContext = React.createContext<TxConfirmationState>(defaultCtxValues);

const TxConfirmationProvider: React.FC = ({ children }) => {
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
  const [confirmationHistory, setConfirmationHistory] = useState<TxConfirmationInfo[]>(defaultCtxValues.confirmationHistory);

  const clearConfirmationHistory = useCallback(() => {
    setConfirmationHistory([]);
  }, []);

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
    openNotification({
      key,
      type: "info",
      title: t('transactions.status.tx-confirm'),
      duration: 0,
      description: t('transactions.status.tx-confirmation-status-wait')
    });
  }

  const clearTxConfirmationContext = () => {
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
  ]);

  useEffect(() => {
    if (!lastSentTxSignature || lastSentTxStatus === finality || fetchTxInfoStatus !== undefined) { return; }

    setFetchingTxStatus("fetching");

    (async () => {
      const result = await getTxStatus();
      if (result === finality) {
        setFetchingTxStatus("fetched");
        openNotification({
          key,
          type: "success",
          title: t('transactions.status.tx-confirmation-status-confirmed'),
          duration: 4,
          description: (
            <>
              <span className="mr-1">{t('notifications.check-transaction-in-explorer')}</span>
              <a className="secondary-link"
                  href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${lastSentTxSignature}`}
                  target="_blank"
                  rel="noopener noreferrer">
                  {shortenAddress(lastSentTxSignature, 8)}
              </a>
            </>
          )
        });
      } else {
        setFetchingTxStatus("error");
        notification.close(key);
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

  // New - Experimental queue/cache

  const rebuildHistoryFromCache = useCallback(() => {
    const history = Array.from(txStatusCache.values());
    setConfirmationHistory(history.reverse());
    consoleOut('confirmationHistory:', history, 'orange');
  }, []);

  const fetchTxStatus = useCallback(async (
    signature: string,
    targetFinality: TransactionConfirmationStatus,
    timestampAdded: number
  ) => {
    if (!connection) { return; }

    let lastResult: TransactionConfirmationStatus | undefined = undefined;

    const fetchStatus = async () => {
      try {
        const result = await fetchTransactionStatus(connection, signature);

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

    while (lastResult !== targetFinality && ((new Date().getTime()) - timestampAdded) < TRANSACTION_STATUS_RETRY_TIMEOUT) {
      lastResult = await fetchStatus();
      if (lastResult !== targetFinality) {
        await delay(TRANSACTION_STATUS_RETRY);
      }
    }

    return lastResult;

  }, [connection]);

  const enqueueTransactionConfirmation = useCallback(async (data: TxConfirmationInfo) => {
    const now = new Date().getTime();
    txConfirmationCache.add(data.signature, data, now);
    openNotification({
      key: data.signature,
      type: "info",
      title: data.loadingTitle ? data.loadingTitle : t('transactions.status.tx-confirm'),
      duration: 0,
      description: (
        <>
          <span className="mr-1">
            {
              data.loadingMessage
                ? data.loadingMessage
                : `${t('transactions.status.tx-confirmation-status-wait')} (${OperationType[data.operationType]})`
            }
          </span>
          <div>
            <span className="mr-1">{t('notifications.check-transaction-in-explorer')}</span>
            <a className="secondary-link"
                href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${data.signature}${getSolanaExplorerClusterParam()}`}
                target="_blank"
                rel="noopener noreferrer">
                {shortenAddress(data.signature, 8)}
            </a>
          </div>
        </>
      )
    });
    rebuildHistoryFromCache();
    const result = await fetchTxStatus(data.signature, data.finality, now);
    if (result === data.finality) {
      txConfirmationCache.update(
        data.signature,
        Object.assign({}, data, {
          txInfoFetchStatus: "fetched",
          timestampCompleted: new Date().getTime()
        })
      );
      openNotification({
        key: data.signature,
        type: "success",
        title: data.completedTitle,
        duration: 4,
        description: (
          <>
            <span className="mr-1">
              {
                data.completedMessage
                  ? data.completedMessage
                  : OperationType[data.operationType]
              }
            </span>
            <div>
              <span className="mr-1">{t('notifications.check-transaction-in-explorer')}</span>
              <a className="secondary-link"
                  href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${data.signature}${getSolanaExplorerClusterParam()}`}
                  target="_blank"
                  rel="noopener noreferrer">
                  {shortenAddress(data.signature, 8)}
              </a>
            </div>
          </>
        )
      });
      confirmationEvents.emit(EventType.TxConfirmSuccess, data);
      rebuildHistoryFromCache();
    } else {
      txConfirmationCache.update(
        data.signature,
        Object.assign({}, data, {
          txInfoFetchStatus: "error",
          timestampCompleted: new Date().getTime()
        })
      );
      notification.close(data.signature);
      // TODO: Add and Info notification if it is asked for
      confirmationEvents.emit(EventType.TxConfirmTimeout, data);
      rebuildHistoryFromCache();
    }
  }, [
    t,
    fetchTxStatus,
    rebuildHistoryFromCache
  ]);

  return (
    <TxConfirmationContext.Provider
      value={{
        lastSentTxStatus,
        fetchTxInfoStatus,
        confirmationHistory,
        lastSentTxSignature,
        recentlyCreatedVault,
        lastSentTxOperationType,
        enqueueTransactionConfirmation,
        clearTxConfirmationContext,
        startFetchTxSignatureInfo,
        clearConfirmationHistory,
        setRecentlyCreatedVault,
      }}>
      {children}
    </TxConfirmationContext.Provider>
  );
};

export default TxConfirmationProvider;
