import { LoadingOutlined } from '@ant-design/icons';
import { Empty, Spin } from 'antd';
import { TransactionItemView } from 'components/TransactionItemView';
import { MappedTransaction } from 'middleware/history';
import { getChange } from 'middleware/transactions';
import { UserTokenAccount } from 'models/accounts';
import { FetchStatus } from 'models/transactions';
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next';

const loadIndicator = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const AssetActivity = (props: {
  accountTokens: UserTokenAccount[];
  hasItems: boolean;
  isAssetNativeAccount: boolean;
  lastTxSignature: string;
  selectedAccountAddress: string;
  selectedAsset: UserTokenAccount | undefined;
  status: FetchStatus;
  transactions: MappedTransaction[] | undefined;
  onLoadMore: any;
}) => {
  const {
    accountTokens,
    hasItems,
    isAssetNativeAccount,
    lastTxSignature,
    selectedAccountAddress,
    selectedAsset,
    status,
    transactions,
    onLoadMore,
  } = props;

  const { t } = useTranslation('common');

  const hasTransactions = useMemo(() => {
    return transactions && transactions.length > 0 ? true : false;
  }, [transactions]);

  const renderTransactions = () => {
    if (transactions) {
      if (isAssetNativeAccount) {
        // Render only txs that have SOL changes
        const filtered = transactions.filter(tx => {
          const meta =
            tx.parsedTransaction && tx.parsedTransaction.meta
              ? tx.parsedTransaction.meta
              : null;
          if (!meta || meta.err !== null) {
            return false;
          }
          const accounts = tx.parsedTransaction.transaction.message.accountKeys;
          const accIdx = accounts.findIndex(
            acc => acc.pubkey.toBase58() === selectedAccountAddress,
          );
          if (isAssetNativeAccount && accIdx === -1) {
            return false;
          }
          // Get amount change for each tx
          const change = getChange(accIdx, meta);
          return isAssetNativeAccount && change !== 0 ? true : false;
        });
        return filtered?.map((trans: MappedTransaction) => {
          return (
            <TransactionItemView
              key={`${trans.signature}`}
              transaction={trans}
              selectedAsset={selectedAsset as UserTokenAccount}
              accountAddress={selectedAccountAddress}
              tokenAccounts={accountTokens}
            />
          );
        });
      } else {
        // Render the transactions collection
        return transactions.map((trans: MappedTransaction) => {
          if (
            trans.parsedTransaction &&
            trans.parsedTransaction.meta &&
            trans.parsedTransaction.meta.err === null
          ) {
            return (
              <TransactionItemView
                key={`${trans.signature}`}
                transaction={trans}
                selectedAsset={selectedAsset as UserTokenAccount}
                accountAddress={selectedAccountAddress}
                tokenAccounts={accountTokens}
              />
            );
          }
          return null;
        });
      }
    } else return null;
  };

  if (status === FetchStatus.FetchFailed && !hasItems) {
    return (
      <div className="h-100 flex-center">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<p>{t('assets.loading-error')}</p>}
        />
      </div>
    );
  } else if (status === FetchStatus.Fetched && !hasItems) {
    return (
      <div className="h-100 flex-center">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<p>{t('assets.no-transactions')}</p>}
        />
      </div>
    );
  } else if (status === FetchStatus.Fetching && !hasItems) {
    return (
      <div className="flex flex-center">
        <Spin indicator={loadIndicator} />
      </div>
    );
  }

  return (
    <div
      className={`transaction-list-data-wrapper ${(status === FetchStatus.Fetched && !hasTransactions) ||
        status === FetchStatus.FetchFailed
        ? 'h-100'
        : 'vertical-scroll'
        }`}
    >
      <div className="activity-list h-100">
        {hasTransactions ? (
          <div className="item-list-body compact">
            {renderTransactions()}
          </div>
        ) : null}
        {lastTxSignature && (
          <div className="mt-1 text-center">
            <span
              className={
                status === FetchStatus.Fetching
                  ? 'no-pointer'
                  : 'secondary-link underline-on-hover'
              }
              role="link"
              onClick={onLoadMore}
            >
              {status === FetchStatus.Fetching ? (
                <>
                  <span className="mr-1">
                    <LoadingOutlined style={{ fontSize: '16px' }} />
                  </span>
                  <span className="no-pointer fg-orange-red pulsate-fast">
                    {t('general.loading')}
                  </span>
                </>
              ) : (
                t('general.cta-load-more')
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
