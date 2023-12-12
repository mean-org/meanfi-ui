import React, { useState, useCallback } from 'react';
import { TransactionConfirmationStatus } from '@solana/web3.js';
import { getSolanaExplorerClusterParam, useConnection } from './connection';
import { fetchTxStatus } from '../middleware/transactions';
import { consoleOut } from '../middleware/ui';
import { EventType, OperationType } from '../models/enums';
import { SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from '../constants';
import { useTranslation } from 'react-i18next';
import { openNotification } from '../components/Notifications';
import { useAccountsContext } from './accounts';

export type TxStatus = 'fetching' | 'fetched' | 'error';

export interface TxConfirmationInfo {
  signature: string;
  finality: TransactionConfirmationStatus;
  operationType: OperationType;
  txInfoFetchStatus: TxStatus;
  loadingTitle?: string;
  loadingMessage?: string;
  completedTitle: string;
  completedMessage: string;
  completedMessageTimeout?: number;
  timestamp?: number;
  extras?: any;
  timestampCompleted?: number;
  explorerLink?: string;
}

type Listener = (value: any) => void;

type MapListener = Record<string, Listener[]>;

class EventEmitter {
  private mapListener: MapListener = {};

  public on(eventName: string, listener: Listener): void {
    const listeners = this.eventExists(eventName) ? this.mapListener[eventName] : [];

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
  add: (signature: string, data: TxConfirmationInfo, timestamp: number) => {
    if (!signature || !data || !data.signature) {
      return;
    }

    const modifiedData = Object.assign({}, data, {
      timestamp,
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
  update: (signature: string, data: TxConfirmationInfo) => {
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

interface TxConfirmationProviderValues {
  lastVaultCreated: string;
  confirmationHistory: TxConfirmationInfo[];
  addTransactionNotification: (data: TxConfirmationInfo) => void;
  enqueueTransactionConfirmation: (data: TxConfirmationInfo) => void;
  clearConfirmationHistory: () => void;
  setLastVaultCreated: (ddcaAccountPda: string) => void;
}

const defaultCtxValues: TxConfirmationProviderValues = {
  lastVaultCreated: '',
  confirmationHistory: [],
  addTransactionNotification: () => {},
  enqueueTransactionConfirmation: () => {},
  clearConfirmationHistory: () => {},
  setLastVaultCreated: () => {},
};

export const TxConfirmationContext = React.createContext<TxConfirmationProviderValues>(defaultCtxValues);

const TxConfirmationProvider: React.FC = ({ children }) => {
  const connection = useConnection();
  const { refreshAccount } = useAccountsContext();
  const { t } = useTranslation('common');

  // Variables
  const [lastVaultCreated, updatelastVaultCreated] = useState(defaultCtxValues.lastVaultCreated);
  const [confirmationHistory, setConfirmationHistory] = useState<TxConfirmationInfo[]>(
    defaultCtxValues.confirmationHistory,
  );

  const clearConfirmationHistory = useCallback(() => {
    setConfirmationHistory([]);
  }, []);

  const setLastVaultCreated = (ddcaAccountPda: string) => {
    updatelastVaultCreated(ddcaAccountPda);
  };

  const addTransactionNotification = useCallback(async (data: TxConfirmationInfo) => {
    const rebuildHistoryFromCache = () => {
      const history = Array.from(txStatusCache.values());
      setConfirmationHistory([...history].reverse());
      consoleOut('confirmationHistory:', history, 'orange');
    };

    const now = new Date().getTime();
    txConfirmationCache.add(data.signature, data, now);
    openNotification({
      key: data.signature,
      type: 'info',
      title: data.completedTitle,
      duration: data.completedMessageTimeout || 5,
      description: (
        <>
          <span className="mr-1">
            {data.completedMessage ? data.completedMessage : OperationType[data.operationType]}
          </span>
          {data.explorerLink ? (
            <div>
              <a className="secondary-link" href={data.explorerLink} target="_blank" rel="noopener noreferrer">
                View on blockchain explorer&gt;
              </a>
            </div>
          ) : null}
        </>
      ),
    });
    rebuildHistoryFromCache();
  }, []);

  const enqueueTransactionConfirmation = useCallback(
    async (data: TxConfirmationInfo) => {
      const rebuildHistoryFromCache = () => {
        const history = Array.from(txStatusCache.values());
        setConfirmationHistory([...history].reverse());
        consoleOut('confirmationHistory:', history, 'orange');
      };

      const now = new Date().getTime();
      txConfirmationCache.add(data.signature, data, now);
      openNotification({
        key: data.signature,
        type: 'info',
        title: data.loadingTitle ? data.loadingTitle : t('transactions.status.tx-confirm'),
        duration: 0,
        description: (
          <>
            <span className="mr-1">
              {data.loadingMessage
                ? data.loadingMessage
                : `${t('transactions.status.tx-confirmation-status-wait')} (${OperationType[data.operationType]})`}
            </span>
            <div>
              <a
                className="secondary-link"
                href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${data.signature}${getSolanaExplorerClusterParam()}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('notifications.check-transaction-in-explorer')} &gt;
              </a>
            </div>
          </>
        ),
      });
      rebuildHistoryFromCache();
      const result = await fetchTxStatus(connection, data.signature, data.finality);
      if (result === data.finality) {
        txConfirmationCache.update(
          data.signature,
          Object.assign({}, data, {
            txInfoFetchStatus: 'fetched',
            timestampCompleted: new Date().getTime(),
          }),
        );
        openNotification({
          key: data.signature,
          type: 'success',
          title: data.completedTitle,
          duration: data.completedMessageTimeout || 5,
          description: (
            <>
              <span className="mr-1">
                {data.completedMessage ? data.completedMessage : OperationType[data.operationType]}
              </span>
              <div>
                <a
                  className="secondary-link"
                  href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${data.signature}${getSolanaExplorerClusterParam()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('notifications.check-transaction-in-explorer')} &gt;
                </a>
              </div>
            </>
          ),
        });
        consoleOut('Emitting event:', EventType.TxConfirmSuccess, 'orange');
        confirmationEvents.emit(EventType.TxConfirmSuccess, data);
        rebuildHistoryFromCache();
        refreshAccount();
      } else {
        txConfirmationCache.update(
          data.signature,
          Object.assign({}, data, {
            txInfoFetchStatus: 'error',
            timestampCompleted: new Date().getTime(),
          }),
        );
        openNotification({
          key: data.signature,
          type: 'info',
          title: t('transactions.status.tx-confirmation-status-timeout'),
          duration: 5,
          description: (
            <>
              <span className="mr-1">
                {data.loadingMessage
                  ? data.loadingMessage
                  : `${t('transactions.status.tx-confirmation-status-wait')} (${OperationType[data.operationType]})`}
              </span>
              <div>
                <a
                  className="secondary-link"
                  href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${data.signature}${getSolanaExplorerClusterParam()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('notifications.check-transaction-in-explorer')} &gt;
                </a>
              </div>
            </>
          ),
        });
        consoleOut('Emitting event:', EventType.TxConfirmTimeout, 'orange');
        confirmationEvents.emit(EventType.TxConfirmTimeout, data);
        rebuildHistoryFromCache();
        refreshAccount();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connection, t],
  );

  return (
    <TxConfirmationContext.Provider
      value={{
        confirmationHistory,
        lastVaultCreated,
        addTransactionNotification,
        enqueueTransactionConfirmation,
        clearConfirmationHistory,
        setLastVaultCreated,
      }}
    >
      {children}
    </TxConfirmationContext.Provider>
  );
};

export default TxConfirmationProvider;
