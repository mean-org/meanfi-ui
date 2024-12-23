import type { MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import { Button, Dropdown, type MenuProps, Spin, Tooltip } from 'antd';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconCheck, IconCopy, IconLoading, IconVerticalEllipsis } from 'src/Icons';
import { openNotification } from 'src/components/Notifications';
import { AppStateContext } from 'src/contexts/appstate';
import { useWallet } from 'src/contexts/wallet';
import { useWalletAccount } from 'src/contexts/walletAccount';
import { consoleOut, copyText, kFormatter, toUsCurrency } from 'src/middleware/ui';
import { shortenAddress } from 'src/middleware/utils';
import type { AccountContext } from 'src/models/accounts';
import { useAccountAssets, useFetchAccountTokens } from 'src/query-hooks/accountTokens';
import './style.scss';

export const AccountSelector = (props: {
  isFullWorkflowEnabled?: boolean;
  onAccountSelected: (account: string) => void;
  onCreateSafeClick: () => void;
  onDisconnectWallet?: () => void;
}) => {
  const { isFullWorkflowEnabled, onAccountSelected, onCreateSafeClick, onDisconnectWallet } = props;
  const { multisigAccounts, loadingMultisigAccounts, loadingMultisigTxPendingCount, setNeedReloadMultisigAccounts } =
    useContext(AppStateContext);
  const { selectedAccount, setSelectedAccount } = useWalletAccount();
  const { t } = useTranslation('common');
  const { publicKey, wallet } = useWallet();
  const [totalTokenAccountsValue, setTotalTokenAccountsValue] = useState(0);

  const { refetch: refreshAccountAssets } = useFetchAccountTokens(publicKey?.toBase58() ?? '');
  const { userAssets, loadingUserAssets } = useAccountAssets(publicKey?.toBase58() ?? '');

  const accountTokens = useMemo(() => {
    if (loadingUserAssets || !userAssets) return undefined;

    return userAssets.accountTokens;
  }, [loadingUserAssets, userAssets]);

  const refreshPendingTxs = useCallback(() => {
    if (!publicKey) {
      return;
    }

    setNeedReloadMultisigAccounts(true);
  }, [publicKey, setNeedReloadMultisigAccounts]);

  // Calculates total value of assets
  useEffect(() => {
    if (!accountTokens) {
      return;
    }

    let sumTokenValues = 0;
    for (const asset of accountTokens) {
      sumTokenValues += asset.valueInUsd || 0;
    }
    setTotalTokenAccountsValue(sumTokenValues);
  }, [accountTokens]);

  const onCopyAddress = (address: string) => {
    if (copyText(address)) {
      openNotification({
        description: t('notifications.account-address-copied-message'),
        type: 'info',
      });
    } else {
      openNotification({
        description: t('notifications.account-address-not-copied-message'),
        type: 'error',
      });
    }
  };

  const onNativeAccountSelected = () => {
    onAccountSelected('personal');
  };

  const onMultisigAccountSelected = (item: MultisigInfo) => {
    onAccountSelected(item.authority.toBase58());
  };

  const onCreateSafe = () => {
    if (publicKey) {
      const account: AccountContext = {
        name: 'Personal account',
        address: publicKey.toBase58(),
        isMultisig: false,
      };
      consoleOut('Setting native account onCreateSafe:', account, 'crimson');
      setSelectedAccount(account);
    }
    onCreateSafeClick();
  };

  const renderAssetsValue = () => {
    return totalTokenAccountsValue ? toUsCurrency(totalTokenAccountsValue) : '$0.00';
  };

  const renderPendingTxCount = (item: MultisigInfo) => {
    if (!item || !item.pendingTxsAmount) {
      return <span className='dimmed'>0 queued</span>;
    }

    return <span className='dimmed'>{kFormatter(item.pendingTxsAmount)} queued</span>;
  };

  const renderNativeAccountOptions = () => {
    const items: MenuProps['items'] = [
      {
        key: '01-refresh-balance-native',
        label: (
          <div
            onKeyDown={e => {
              e.preventDefault();
              refreshAccountAssets();
            }}
            onClick={e => {
              e.preventDefault();
              refreshAccountAssets();
            }}
          >
            <span className='menu-item-text'>Refresh balances</span>
          </div>
        ),
      },
    ];

    return (
      <Dropdown menu={{ items }} placement='bottomRight' trigger={['click']}>
        <span className='icon-button-container'>
          <Button
            type='default'
            shape='circle'
            size='middle'
            icon={<IconVerticalEllipsis className='mean-svg-icons fg-secondary-50' />}
            onClick={() => {}}
          />
        </span>
      </Dropdown>
    );
  };

  const renderMultisigAccountOptions = (item: MultisigInfo) => {
    const items: MenuProps['items'] = [
      {
        key: `01-refresh-balance-${item.createdOnUtc.getTime()}`,
        label: (
          <div
            onKeyDown={e => {
              e.preventDefault();
              refreshPendingTxs();
            }}
            onClick={e => {
              e.preventDefault();
              refreshPendingTxs();
            }}
          >
            <span className='menu-item-text'>Refresh pending Txs</span>
          </div>
        ),
      },
    ];

    return (
      <Dropdown menu={{ items }} placement='bottomRight' trigger={['click']}>
        <span className='icon-button-container'>
          <Button
            type='default'
            shape='circle'
            size='middle'
            icon={<IconVerticalEllipsis className='mean-svg-icons fg-secondary-50' />}
            onClick={() => {}}
          />
        </span>
      </Dropdown>
    );
  };

  return (
    <div className='account-selector'>
      <div className='account-group-heading'>
        <div className='flex-fixed-right'>
          <div className='left flex-row align-items-center'>
            <span className='text-uppercase'>Wallets</span>
          </div>
          {!isFullWorkflowEnabled && (
            <div className='right'>
              <span className='secondary-link underlined' onKeyDown={onDisconnectWallet} onClick={onDisconnectWallet}>
                Disconnect
              </span>
            </div>
          )}
        </div>
      </div>
      <div className='accounts-list'>
        <div
          className={`transaction-list-row${
            publicKey && selectedAccount.address === publicKey.toBase58() ? ' selected' : ''
          }`}
        >
          <div className='check-cell' onKeyDown={onNativeAccountSelected} onClick={onNativeAccountSelected}>
            {publicKey && selectedAccount.address === publicKey.toBase58() ? (
              <IconCheck className='mean-svg-icons' />
            ) : (
              <span>&nbsp;</span>
            )}
          </div>
          <div className='icon-cell' onKeyDown={onNativeAccountSelected} onClick={onNativeAccountSelected}>
            <span>
              {wallet && (
                <img src={wallet.adapter.icon} alt={wallet.adapter.name} width='30' className='wallet-provider-icon' />
              )}
            </span>
          </div>
          <div className='description-cell' onKeyDown={onNativeAccountSelected} onClick={onNativeAccountSelected}>
            <div className='title'>
              <span className='chunk1'>Personal account</span>
              <span className='chunk2'>({publicKey ? shortenAddress(publicKey, 6) : '--'})</span>
            </div>
            <div className='subtitle'>
              {loadingUserAssets ? (
                <IconLoading className='mean-svg-icons' style={{ height: '12px', lineHeight: '12px' }} />
              ) : (
                renderAssetsValue()
              )}
            </div>
          </div>
          <div className='rate-cell'>
            {publicKey ? (
              <Tooltip placement='bottom' title={t('assets.account-address-copy-cta')}>
                <span
                  className='icon-button-container simplelink'
                  onKeyDown={() => {}}
                  onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    onCopyAddress(publicKey.toBase58());
                  }}
                >
                  <Button
                    type='default'
                    shape='circle'
                    size='small'
                    icon={<IconCopy className='mean-svg-icons fg-secondary-50' />}
                    onClick={() => {}}
                  />
                </span>
              </Tooltip>
            ) : null}
            {renderNativeAccountOptions()}
          </div>
        </div>
      </div>
      <div className='account-group-heading'>
        <div className='flex-fixed-right'>
          <div className='left flex-row align-items-center'>
            <span className='text-uppercase'>Super Safes</span>
          </div>
          <div className='right'>
            <span className='secondary-link underlined' onKeyDown={() => {}} onClick={onCreateSafe}>
              Create new safe
            </span>
          </div>
        </div>
      </div>
      <div className='accounts-list'>
        <Spin spinning={loadingMultisigAccounts}>
          {multisigAccounts && multisigAccounts.length > 0 ? (
            multisigAccounts.map(item => {
              return (
                <div
                  key={item.authority.toBase58()}
                  className={`transaction-list-row${
                    selectedAccount.address === item.authority.toBase58() ? ' selected' : ''
                  }`}
                >
                  <div className='check-cell' onKeyDown={() => {}} onClick={() => onMultisigAccountSelected(item)}>
                    {selectedAccount.address === item.authority.toBase58() ? (
                      <IconCheck className='mean-svg-icons' />
                    ) : (
                      <span>&nbsp;</span>
                    )}
                  </div>
                  <div className='icon-cell' onKeyDown={() => {}} onClick={() => onMultisigAccountSelected(item)}>
                    <Tooltip placement='rightTop' title='Meanfi Multisig'>
                      <img
                        src='https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/MEANeD3XDdUmNMsRGjASkSWdC8prLYsoRJ61pPeHctD/logo.svg'
                        alt='Meanfi Multisig'
                        width={30}
                        height={30}
                      />
                    </Tooltip>
                    {!loadingMultisigTxPendingCount && item.pendingTxsAmount && item.pendingTxsAmount > 0 ? (
                      <span className='status warning bottom-right' />
                    ) : null}
                  </div>
                  <div
                    className='description-cell'
                    onKeyDown={() => {}}
                    onClick={() => onMultisigAccountSelected(item)}
                  >
                    <div className='title'>
                      <span className='chunk1'>{item.label}</span>
                      <span className='chunk2'>({shortenAddress(item.authority, 4)})</span>
                    </div>
                    <div className='subtitle'>
                      {loadingMultisigTxPendingCount ? (
                        <IconLoading className='mean-svg-icons' style={{ height: '15px', lineHeight: '15px' }} />
                      ) : (
                        renderPendingTxCount(item)
                      )}
                    </div>
                  </div>
                  <div className='rate-cell'>
                    <Tooltip placement='bottom' title={t('assets.account-address-copy-cta')}>
                      <span
                        className='icon-button-container simplelink'
                        onKeyDown={() => {}}
                        onClick={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          onCopyAddress(item.authority.toBase58());
                        }}
                      >
                        <Button
                          type='default'
                          shape='circle'
                          size='small'
                          icon={<IconCopy className='mean-svg-icons fg-secondary-50' />}
                          onClick={() => {}}
                        />
                      </span>
                    </Tooltip>
                    {renderMultisigAccountOptions(item)}
                  </div>
                </div>
              );
            })
          ) : (
            <>{loadingMultisigAccounts ? <p>Loading safes</p> : <p>No safes detected</p>}</>
          )}
        </Spin>
      </div>
    </div>
  );
};
