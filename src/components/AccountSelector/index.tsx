import { useContext, useEffect, useState } from "react";
import { MultisigInfo } from "@mean-dao/mean-multisig-sdk";
import { Spin, Tooltip } from "antd";
import { UserTokenAccount } from "models/accounts";
import { useTranslation } from "react-i18next";
import { AppStateContext } from "../../contexts/appstate";
import { useWallet } from "../../contexts/wallet";
import { IconLoading, IconSafe, IconWallet } from "../../Icons";
import { consoleOut, kFormatter, toUsCurrency } from "../../middleware/ui";
import { shortenAddress } from "../../middleware/utils";
import { Identicon } from "../Identicon";
import "./style.scss";

export const AccountSelector = () => {
  const {
    tokensLoaded,
    loadingPrices,
    multisigAccounts,
    loadingTokenAccounts,
    loadingMultisigAccounts,
    loadingMultisigTxPendingCount,
    setIsSelectingAccount,
    setShouldLoadTokens,
    getAssetsByAccount,
    setAccountAddress,
  } = useContext(AppStateContext);
  // const location = useLocation();
  // const navigate = useNavigate();
  const { publicKey, provider } = useWallet();
  const { t } = useTranslation("common");
  const [accountTokens, setAccountTokens] = useState<UserTokenAccount[] | undefined>(undefined);
  const [totalTokenAccountsValue, setTotalTokenAccountsValue] = useState(0);

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

  // Process userTokensResponse from AppState to get a renderable list of tokens
  useEffect(() => {
    if (!publicKey) { return; }

    if (accountTokens === undefined) {
      consoleOut('Refreshing use account info...', '', 'blue');
      (async () => {
        try {
          // Try fetching tokens manually
          const result = await getAssetsByAccount(publicKey.toBase58());
          if (result) {
            consoleOut('userTokensResponse:', result, 'blue');
            setAccountTokens(result.accountTokens);
          } else {
            // try queueing it to be done automatically by the state
            setShouldLoadTokens(true);
            setAccountAddress(publicKey.toBase58());
          }
        } catch (error) {
          console.error(error);
        }
      })();
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountTokens, publicKey]);

  const onNativeAccountSelected = () => {
    if (publicKey) {
      setAccountAddress(publicKey.toBase58());
    }
    setIsSelectingAccount(false);
  }

  const onMultisigAccountSelected = (item: MultisigInfo) => {
    setAccountAddress(item.authority.toBase58());
    setIsSelectingAccount(false);
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

  return (
    <div className="account-selector">
      <div className="account-group-heading">
        <div className="flex-row justify-content-start align-items-center">
          <IconWallet className="mean-svg-icons" style={{ width: 28, height: 28 }} />
          <span className="ml-2">Wallet Account</span>
        </div>
      </div>
      <div className="accounts-list">
        <div className="transaction-list-row" onClick={onNativeAccountSelected}>
          <div className="icon-cell">
            <span>
              {provider && (
                <img src={provider.icon} alt={provider.name} width="30" className="wallet-provider-icon" />
              )}
            </span>
          </div>
          <div className="description-cell">
            <div className="title text-truncate">
              {publicKey ? shortenAddress(publicKey, 6) : '--'}
            </div>
            <div className="subtitle text-truncate">
              Personal account
            </div>
          </div>
          <div className="rate-cell">
            <div className="rate-amount">
              {loadingPrices || loadingTokenAccounts ? (
                <IconLoading className="mean-svg-icons" style={{ height: "12px", lineHeight: "12px" }} />
              ) : renderAssetsValue()}
            </div>
            <div className="interval">
              balance
            </div>
          </div>
        </div>
      </div>
      <div className="account-group-heading">
        <div className="flex-fixed-right">
          <div className="left flex-row align-items-center">
            <IconSafe className="mean-svg-icons" style={{ width: 24, height: 24 }} />
            <span className="ml-2">Super Safe</span>
          </div>
          <div className="right">
            <span className="secondary-link underlined">Create new safe</span>
          </div>
        </div>
      </div>
      <div className="accounts-list">
        <Spin spinning={loadingMultisigAccounts}>
          {(multisigAccounts && multisigAccounts.length > 0) ? (
            multisigAccounts.map((item, index) => {
              return (
                <div key={`account-${index}`} className={`transaction-list-row${index === 0 ? ' selected' : ''}`} onClick={() => onMultisigAccountSelected(item)}>
                  <div className="icon-cell">
                    {(item.version === 0) ? (
                      <Tooltip placement="rightTop" title="Serum Multisig">
                        <img src="https://assets.website-files.com/6163b94b432ce93a0408c6d2/61ff1e9b7e39c27603439ad2_serum%20NOF.png" alt="Serum" width={30} height={30} />
                      </Tooltip>
                    ) : (item.version === 2) ? (
                      <Tooltip placement="rightTop" title="Meanfi Multisig">
                        <img src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/MEANeD3XDdUmNMsRGjASkSWdC8prLYsoRJ61pPeHctD/logo.svg" alt="Meanfi Multisig" width={30} height={30} />
                      </Tooltip>
                    ) : (
                      <Identicon address={item.id} style={{ width: "30", height: "30", display: "inline-flex" }} />
                    )}
                    {!loadingMultisigTxPendingCount && item.pendingTxsAmount && item.pendingTxsAmount > 0 ? (
                      <span className="status warning bottom-right"></span>
                    ) : null}
                  </div>
                  <div className="description-cell">
                    <div className="title text-truncate">
                      {item.label}
                    </div>
                    <div className="subtitle text-truncate">
                      {shortenAddress(item.authority, 8)}
                    </div>
                  </div>
                  <div className="rate-cell">
                    <div className="rate-amount">
                      {
                        loadingMultisigTxPendingCount ? (
                          <IconLoading className="mean-svg-icons" style={{ height: "15px", lineHeight: "15px" }}/>
                        ) : renderPendingTxCount(item)
                      }
                    </div>
                    {/* <div className="interval">
                      2 nd line
                    </div> */}
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