import { MultisigInfo } from "@mean-dao/mean-multisig-sdk";
import { Button, Dropdown, Menu, Spin, Tooltip } from "antd";
import { Identicon } from "components/Identicon";
import { openNotification } from "components/Notifications";
import { AppStateContext } from "contexts/appstate";
import { useWallet } from "contexts/wallet";
import { IconCheck, IconCopy, IconLoading, IconVerticalEllipsis } from "Icons";
import { isInXnftWallet } from "integrations/xnft/xnft-wallet-adapter";
import { SYSTEM_PROGRAM_ID } from "middleware/ids";
import { consoleOut, copyText, kFormatter, toUsCurrency } from "middleware/ui";
import { shortenAddress } from "middleware/utils";
import { AccountContext, UserTokenAccount } from "models/accounts";
import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import "./style.scss";

export const AccountSelector = (props: {
  isFullWorkflowEnabled?: boolean;
  onAccountSelected?: any;
  onCreateSafeClick: any;
  onDisconnectWallet?: any;
}) => {
  const {
    isFullWorkflowEnabled,
    onAccountSelected,
    onCreateSafeClick,
    onDisconnectWallet,
  } = props;
  const {
    tokensLoaded,
    loadingPrices,
    selectedAccount,
    multisigAccounts,
    loadingTokenAccounts,
    loadingMultisigAccounts,
    loadingMultisigTxPendingCount,
    setNeedReloadMultisigAccounts,
    setIsSelectingAccount,
    getAssetsByAccount,
    setSelectedAccount,
  } = useContext(AppStateContext);
  const { t } = useTranslation("common");
  const { publicKey, provider } = useWallet();
  const [accountTokens, setAccountTokens] = useState<UserTokenAccount[] | undefined>(undefined);
  const [totalTokenAccountsValue, setTotalTokenAccountsValue] = useState(0);

  const refreshAssetValues = useCallback((account?: string) => {
    if (!publicKey) { return; }

    consoleOut('Refreshing use account info...', '', 'blue');
    (async () => {
      try {
        const scannedAccount = account || publicKey.toBase58();
        const result = await getAssetsByAccount(scannedAccount);
        if (result) {
          consoleOut('userTokensResponse:', result, 'blue');
          setAccountTokens(result.accountTokens);
        }
      } catch (error) {
        console.error(error);
      }
    })();
  },[publicKey, getAssetsByAccount]);

  const refreshPendingTxs = useCallback(() => {
    if (!publicKey) { return; }

    setNeedReloadMultisigAccounts(true);
  }, [publicKey, setNeedReloadMultisigAccounts]);

  // Process userTokensResponse from AppState to get a renderable list of tokens
  useEffect(() => {
    if (!publicKey) { return; }

    if (accountTokens === undefined) {
      refreshAssetValues();
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountTokens, publicKey]);

  // Calculates total value of assets
  useEffect(() => {
    if (tokensLoaded && accountTokens) {
      let sumMeanTokens = 0;
      accountTokens.forEach((asset: UserTokenAccount, index: number) => {
        sumMeanTokens += asset.valueInUsd || 0;
      });
      setTotalTokenAccountsValue(sumMeanTokens);
    }
  }, [accountTokens, tokensLoaded]);

  const onCopyAddress = (address: string) => {
    if (copyText(address)) {
      openNotification({
        description: t('notifications.account-address-copied-message'),
        type: "info"
      });
    } else {
      openNotification({
        description: t('notifications.account-address-not-copied-message'),
        type: "error"
      });
    }
  }

  const onNativeAccountSelected = () => {
    if (publicKey) {
      const account: AccountContext = {
        name: 'Personal account',
        address: publicKey.toBase58(),
        isMultisig: false,
        owner: SYSTEM_PROGRAM_ID.toBase58()
      };
      consoleOut('Setting selectedAccount onNativeAccountSelected:', account, 'crimson');
      setSelectedAccount(account, true);
    }
    setIsSelectingAccount(false);
    if (onAccountSelected) {
      onAccountSelected();
    }
  }

  const onMultisigAccountSelected = (item: MultisigInfo) => {
    if (publicKey) {
      const account: AccountContext = {
        name: item.label,
        address: item.authority.toBase58(),
        isMultisig: true,
        owner: publicKey.toBase58()
      };
      consoleOut('Setting selectedAccount onMultisigAccountSelected:', account, 'crimson');
      setSelectedAccount(account, true);
    }
    setIsSelectingAccount(false);
    if (onAccountSelected) {
      onAccountSelected();
    }
  }

  const onCreateSafe = () => {
    if (publicKey) {
      const account: AccountContext = {
        name: 'Personal account',
        address: publicKey.toBase58(),
        isMultisig: false,
        owner: SYSTEM_PROGRAM_ID.toBase58()
      };
      consoleOut('Setting native account onCreateSafe:', account, 'crimson');
      setSelectedAccount(account, true);
    }
    onCreateSafeClick();
  }

  const renderAssetsValue = () => {
    return totalTokenAccountsValue
      ? toUsCurrency(totalTokenAccountsValue)
      : '$0.00';
  }

  const renderPendingTxCount = (item: MultisigInfo) => {
    if (!item || !item.pendingTxsAmount) {
      return (<span className="dimmed">0 queued</span>);
    }

    return (<span className="dimmed">{kFormatter(item.pendingTxsAmount)} queued</span>);
  }

  const renderMultisigIcon = (item: MultisigInfo) => {
    if (item.version === 0) {
      return (
        <Tooltip placement="rightTop" title="Serum Multisig">
          <img src="https://assets.website-files.com/6163b94b432ce93a0408c6d2/61ff1e9b7e39c27603439ad2_serum%20NOF.png" alt="Serum" width={30} height={30} />
        </Tooltip>
      );
    } else if (item.version === 2) {
      return (
        <Tooltip placement="rightTop" title="Meanfi Multisig">
          <img src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/MEANeD3XDdUmNMsRGjASkSWdC8prLYsoRJ61pPeHctD/logo.svg" alt="Meanfi Multisig" width={30} height={30} />
        </Tooltip>
      );
    } else {
      return (<Identicon address={item.id} style={{ width: "30", height: "30", display: "inline-flex" }} />);
    }
  }

  const renderNativeAccountOptions = () => {
    const menu = (
      <Menu items={[
        {
          key: '01-refresh-balance-native',
          label: (
            <div onClick={(e) => {
              e.preventDefault();
              refreshAssetValues();
            }}>
              <span className="menu-item-text">Refresh balances</span>
            </div>
          ),
        }
      ]}
      />
    );

    return <Dropdown
      overlay={menu}
      placement="bottomRight"
      trigger={["click"]}>
      <span className="icon-button-container">
        <Button
          type="default"
          shape="circle"
          size="middle"
          icon={<IconVerticalEllipsis className="mean-svg-icons fg-secondary-50" />}
          onClick={() => {}}
        />
      </span>
    </Dropdown>;
  }

  const renderMultisigAccountOptions = (item: MultisigInfo) => {
    const menu = (
      <Menu items={[
        {
          key: `01-refresh-balance-${item.createdOnUtc.getTime()}`,
          label: (
            <div onClick={(e) => {
              e.preventDefault();
              refreshPendingTxs();
            }}>
              <span className="menu-item-text">Refresh pending Txs</span>
            </div>
          ),
        }
      ]}
      />
    );

    return <Dropdown
      overlay={menu}
      placement="bottomRight"
      trigger={["click"]}>
      <span className="icon-button-container">
        <Button
          type="default"
          shape="circle"
          size="middle"
          icon={<IconVerticalEllipsis className="mean-svg-icons fg-secondary-50" />}
          onClick={() => {}}
        />
      </span>
    </Dropdown>;
  }

  return (
    <div className="account-selector">
      <div className="account-group-heading">
        <div className="flex-fixed-right">
          <div className="left flex-row align-items-center">
            <span className="text-uppercase">Wallets</span>
          </div>
          {!isInXnftWallet() && !isFullWorkflowEnabled && (
            <div className="right">
              <span className="secondary-link underlined" onClick={onDisconnectWallet}>Disconnect</span>
            </div>
          )}
        </div>
      </div>
      <div className="accounts-list">
        <div
          className={`transaction-list-row${publicKey && selectedAccount.address === publicKey.toBase58() ? ' selected' : ''}`}>
          <div className="check-cell" onClick={onNativeAccountSelected}>
            {publicKey && selectedAccount.address === publicKey.toBase58() ? (
              <IconCheck className="mean-svg-icons" />
            ) : (
              <span>&nbsp;</span>
            )}
          </div>
          <div className="icon-cell" onClick={onNativeAccountSelected}>
            <span>
              {provider && (
                <img src={provider.icon} alt={provider.name} width="30" className="wallet-provider-icon" />
              )}
            </span>
          </div>
          <div className="description-cell" onClick={onNativeAccountSelected}>
            <div className="title">
              <span className="chunk1">Personal account</span>
              <span className="chunk2">({publicKey ? shortenAddress(publicKey, 6) : '--'})</span>
            </div>
            <div className="subtitle">
              {loadingPrices || loadingTokenAccounts ? (
                <IconLoading className="mean-svg-icons" style={{ height: "12px", lineHeight: "12px" }} />
              ) : renderAssetsValue()}
            </div>
          </div>
          <div className="rate-cell">
            {publicKey ? (
              <Tooltip placement="bottom" title={t('assets.account-address-copy-cta')}>
                <span className="icon-button-container simplelink" onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onCopyAddress(publicKey.toBase58());
                }}>
                  <Button
                    type="default"
                    shape="circle"
                    size="small"
                    icon={<IconCopy className="mean-svg-icons fg-secondary-50" />}
                    onClick={() => {}}
                  />
                </span>
              </Tooltip>
            ) : null}
            {renderNativeAccountOptions()}
          </div>
        </div>
      </div>
      <div className="account-group-heading">
        <div className="flex-fixed-right">
          <div className="left flex-row align-items-center">
            <span className="text-uppercase">Super Safes</span>
          </div>
          <div className="right">
            <span className="secondary-link underlined" onClick={onCreateSafe}>Create new safe</span>
          </div>
        </div>
      </div>
      <div className="accounts-list">
        <Spin spinning={loadingMultisigAccounts}>
          {(multisigAccounts && multisigAccounts.length > 0) ? (
            multisigAccounts.map((item, index) => {
              return (
                <div
                  key={`account-${index}`}
                  className={`transaction-list-row${selectedAccount.address === item.authority.toBase58() ? ' selected' : ''}`}>
                  <div className="check-cell" onClick={() => onMultisigAccountSelected(item)}>
                    {selectedAccount.address === item.authority.toBase58() ? (
                      <IconCheck className="mean-svg-icons" />
                    ) : (
                      <span>&nbsp;</span>
                    )}
                  </div>
                  <div className="icon-cell" onClick={() => onMultisigAccountSelected(item)}>
                    {renderMultisigIcon(item)}
                    {!loadingMultisigTxPendingCount && item.pendingTxsAmount && item.pendingTxsAmount > 0 ? (
                      <span className="status warning bottom-right"></span>
                    ) : null}
                  </div>
                  <div className="description-cell" onClick={() => onMultisigAccountSelected(item)}>
                    <div className="title">
                      <span className="chunk1">{item.label}</span>
                      <span className="chunk2">({shortenAddress(item.authority, 4)})</span>
                    </div>
                    <div className="subtitle">
                      {
                        loadingMultisigTxPendingCount ? (
                          <IconLoading className="mean-svg-icons" style={{ height: "15px", lineHeight: "15px" }}/>
                        ) : renderPendingTxCount(item)
                      }
                    </div>
                  </div>
                  <div className="rate-cell">
                    <Tooltip placement="bottom" title={t('assets.account-address-copy-cta')}>
                      <span className="icon-button-container simplelink" onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onCopyAddress(item.authority.toBase58());
                      }}>
                        <Button
                          type="default"
                          shape="circle"
                          size="small"
                          icon={<IconCopy className="mean-svg-icons fg-secondary-50" />}
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
            <>
              {loadingMultisigAccounts ? (
                <p>Loading safes</p>
              ) : (
                <>
                  <p>No safes detected</p>
                </>
              )}
            </>
          )}
        </Spin>
      </div>
    </div>
  )
}
