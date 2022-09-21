import "./style.scss";
import { IconLoading, IconSafe, IconWallet } from "../../Icons";
import { useWallet } from "../../contexts/wallet";
import { useContext, useEffect, useState } from "react";
import { AppStateContext } from "../../contexts/appstate";
import { Spin } from "antd";
import { useTranslation } from "react-i18next";
// import { useLocation, useNavigate } from "react-router-dom";
import { MultisigInfo } from "@mean-dao/mean-multisig-sdk";
import { consoleOut, toUsCurrency } from "../../middleware/ui";
import { UserTokenAccount } from "../../models/transactions";
import { shortenAddress } from "../../middleware/utils";

export const AccountSelector = () => {
  const {
    tokensLoaded,
    loadingPrices,
    multisigAccounts,
    loadingTokenAccounts,
    loadingMultisigAccounts,
    // getTokenPriceByAddress,
    // getTokenPriceBySymbol,
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
        <div className="flex-row justify-content-start align-items-center">
          <IconSafe className="mean-svg-icons" style={{ width: 24, height: 24 }} />
          <span className="ml-2">Super Safe</span>
        </div>
      </div>
      <div className="accounts-list">
        <Spin spinning={loadingMultisigAccounts}>
          {(multisigAccounts && multisigAccounts.length > 0) ? (
            multisigAccounts.map((item, index) => {
              return (
                <div key={`account-${index}`} className="transaction-list-row" onClick={() => onMultisigAccountSelected(item)}>
                  <div className="icon-cell">
                    <span>xOx</span>
                  </div>
                  <div className="description-cell">
                    <div className="title text-truncate">
                      Title
                    </div>
                    <div className="subtitle text-truncate">
                      Subtitle
                    </div>
                  </div>
                  <div className="rate-cell">
                    <div className="rate-amount">
                      1 st line
                    </div>
                    <div className="interval">
                      2 nd line
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <>
              {loadingMultisigAccounts ? (
                <p>{t('streams.stream-activity.loading-activity')}</p>
              ) : (
                <>
                  <p>{t('streams.stream-activity.no-activity')}</p>
                </>
              )}
            </>
          )}
        </Spin>
      </div>
    </div>
  )
}