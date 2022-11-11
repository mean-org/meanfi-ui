import { AccountInfo, ParsedAccountData, PublicKey } from '@solana/web3.js';
import { Drawer, Modal, Tabs } from "antd";
import { TextInput } from 'components/TextInput';
import { TokenListItem } from 'components/TokenListItem';
import { CUSTOM_TOKEN_NAME, MAX_TOKEN_LIST_ITEMS } from 'constants/common';
import { useNativeAccount } from 'contexts/accounts';
import { AppStateContext } from 'contexts/appstate';
import { getNetworkIdByEnvironment, useConnection } from 'contexts/connection';
import { useWallet } from 'contexts/wallet';
import { environment } from 'environments/environment';
import { getTokensWithBalances } from 'middleware/accounts';
import { consoleOut, isValidAddress } from 'middleware/ui';
import { getAmountFromLamports, shortenAddress } from 'middleware/utils';
import { UserTokenAccount } from "models/accounts";
import { TokenInfo } from 'models/SolanaTokenInfo';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from "react-i18next";
import { OneTimePayment, RepeatingPayment } from 'views';

type TransfersTabOption = "one-time" | "recurring";

export const SendAssetModal = (props: {
  handleClose: any;
  isVisible: boolean;
  selected?: TransfersTabOption;
  selectedToken: UserTokenAccount | undefined;
  title?: string;
}) => {
  const { selected, isVisible, handleClose, selectedToken, title } = props;
  const {
    priceList,
    splTokenList,
  } = useContext(AppStateContext);
  const connection = useConnection();
  const { connected, publicKey } = useWallet();
  const { account } = useNativeAccount();
  const { t } = useTranslation("common");
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [userBalances, setUserBalances] = useState<any>();
  const [token, setToken] = useState<TokenInfo | undefined>(undefined);
  const [tokenFilter, setTokenFilter] = useState("");
  const [filteredTokenList, setFilteredTokenList] = useState<TokenInfo[]>([]);
  const [selectedList, setSelectedList] = useState<TokenInfo[]>([]);
  const [isTokenSelectorVisible, setIsTokenSelectorVisible] = useState(false);

  const autoFocusInput = useCallback(() => {
    const input = document.getElementById("token-search-rp");
    if (input) {
      setTimeout(() => {
        input.focus();
      }, 100);
    }
  }, []);

  const showDrawer = () => {
    setIsTokenSelectorVisible(true);
    autoFocusInput();
  };

  const hideDrawer = () => {
    setIsTokenSelectorVisible(false);
  };

  const onCloseTokenSelector = useCallback(() => {
    hideDrawer();
    // Reset token on errors (decimals: -1 or -2)
    if (selectedToken && selectedToken.decimals < 0) {
      setToken(undefined);
    }
    if (tokenFilter && !isValidAddress(tokenFilter)) {
      setTokenFilter('');
    }
  }, [selectedToken, tokenFilter]);

  // Updates the token list everytime is filtered
  const updateTokenListByFilter = useCallback((searchString: string) => {

    if (!selectedList) {
      return;
    }

    const timeout = setTimeout(() => {

      const filter = (t: any) => {
        return (
          t.symbol.toLowerCase().includes(searchString.toLowerCase()) ||
          t.name.toLowerCase().includes(searchString.toLowerCase()) ||
          t.address.toLowerCase().includes(searchString.toLowerCase())
        );
      };

      const showFromList = !searchString 
        ? selectedList
        : selectedList.filter((t: any) => filter(t));

      setFilteredTokenList(showFromList);

    });

    return () => { 
      clearTimeout(timeout);
    }

  }, [selectedList]);

  const onInputCleared = useCallback(() => {
    setTokenFilter('');
    updateTokenListByFilter('');
  },[
    updateTokenListByFilter
  ]);

  const onTokenSearchInputChange = useCallback((e: any) => {

    const newValue = e.target.value;
    setTokenFilter(newValue);
    updateTokenListByFilter(newValue);

  },[
    updateTokenListByFilter
  ]);

  /////////////////////
  // Data management //
  /////////////////////

  // Set working local token from component inputs
  useEffect(() => {
    if (isVisible) {
      if (selectedToken) {
        setToken(selectedToken);
      } else if (selectedList) {
        setToken(selectedList[0]);
      }
    }
  }, [isVisible, selectedList, selectedToken]);

  // Keep account balance updated
  useEffect(() => {
    if (account?.lamports !== previousBalance || !nativeBalance) {
      setNativeBalance(getAmountFromLamports(account?.lamports));
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [
    account,
    nativeBalance,
    previousBalance,
  ]);

  //#region Token selector - data management

  // Automatically update all token balances and rebuild token list
  useEffect(() => {

    if (!connection) {
      console.error('No connection');
      return;
    }

    if (!publicKey || !splTokenList) {
      return;
    }

    const timeout = setTimeout(() => {

      getTokensWithBalances(
        connection,
        publicKey.toBase58(),
        priceList,
        splTokenList,
        true
      )
      .then(response => {
        if (response) {
          setSelectedList(response.tokenList);
          setUserBalances(response.balancesMap);
        }
      });

    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    publicKey,
    connection,
    priceList,
    splTokenList,
  ]);

  // Reset results when the filter is cleared
  useEffect(() => {
    if (splTokenList && splTokenList.length && filteredTokenList.length === 0 && !tokenFilter) {
      updateTokenListByFilter(tokenFilter);
    }
  }, [
    splTokenList,
    tokenFilter,
    filteredTokenList,
    updateTokenListByFilter
  ]);

  //#endregion


  ///////////////////
  //   Rendering   //
  ///////////////////

  //#region Token selector - render methods

  const getTokenListItemClass = (item: TokenInfo) => {
    return selectedToken?.address === item.address ? "selected" : "simplelink";
  }

  const renderTokenList = () => {
    return filteredTokenList.map((t, index) => {
      const onClick = function () {
        setToken(t);

        consoleOut("token selected:", t, 'blue');
        onCloseTokenSelector();
      };

      if (index < MAX_TOKEN_LIST_ITEMS) {
        const balance = connected && userBalances && userBalances[t.address] > 0 ? userBalances[t.address] : 0;
        return (
          <TokenListItem
            key={t.address}
            name={t.name || CUSTOM_TOKEN_NAME}
            mintAddress={t.address}
            token={t}
            className={balance ? getTokenListItemClass(t) : "hidden"}
            onClick={onClick}
            balance={balance}
            showUsdValues={true}
          />
        );
      } else {
        return null;
      }
    });
  }

  const getSelectedTokenError = () => {
    if (tokenFilter && selectedToken) {
      if (selectedToken.decimals === -1) {
        return 'Account not found';
      } else if (selectedToken.decimals === -2) {
        return 'Account is not a token mint';
      }
    }
    return undefined;
  }

  const getBalanceForTokenFilter = () => {
    return connected && userBalances && userBalances[tokenFilter] > 0
      ? userBalances[tokenFilter]
      : 0;
  }

  const renderTokenSelectorInner = () => {
    return (
      <div className="token-selector-wrapper">
        <div className="token-search-wrapper">
          <TextInput
            id="token-search-rp"
            value={tokenFilter}
            allowClear={true}
            extraClass="mb-2"
            onInputClear={onInputCleared}
            placeholder={t('token-selector.search-input-placeholder')}
            error={getSelectedTokenError()}
            onInputChange={onTokenSearchInputChange} />
        </div>
        <div className="token-list">
          {filteredTokenList.length > 0 && renderTokenList()}
          {(tokenFilter && isValidAddress(tokenFilter) && filteredTokenList.length === 0) && (
            <TokenListItem
              key={tokenFilter}
              name={CUSTOM_TOKEN_NAME}
              mintAddress={tokenFilter}
              className={selectedToken && selectedToken.address === tokenFilter ? "selected" : "simplelink"}
              onClick={async () => {
                const address = tokenFilter;
                let decimals = -1;
                let accountInfo: AccountInfo<Buffer | ParsedAccountData> | null = null;
                try {
                  accountInfo = (await connection.getParsedAccountInfo(new PublicKey(address))).value;
                  consoleOut('accountInfo:', accountInfo, 'blue');
                } catch (error) {
                  console.error(error);
                }
                if (accountInfo) {
                  if ((accountInfo as any).data["program"] &&
                      (accountInfo as any).data["program"] === "spl-token" &&
                      (accountInfo as any).data["parsed"] &&
                      (accountInfo as any).data["parsed"]["type"] &&
                      (accountInfo as any).data["parsed"]["type"] === "mint") {
                    decimals = (accountInfo as any).data["parsed"]["info"]["decimals"];
                  } else {
                    decimals = -2;
                  }
                }
                const unknownToken: TokenInfo = {
                  address,
                  name: CUSTOM_TOKEN_NAME,
                  chainId: getNetworkIdByEnvironment(environment),
                  decimals,
                  symbol: `[${shortenAddress(address)}]`,
                };
                setToken(unknownToken);
                consoleOut("token selected:", unknownToken, 'blue');
                // Do not close on errors (-1 or -2)
                if (decimals >= 0) {
                  onCloseTokenSelector();
                }
              }}
              balance={getBalanceForTokenFilter()}
            />
          )}
        </div>
      </div>
    );
  }
  //#endregion

  const tabs = [
    {
      key: "one-time",
      label: t('swap.tabset.one-time'),
      children: (
        <OneTimePayment
          transferCompleted={props.handleClose}
          selectedToken={token}
          userBalances={userBalances}
          onOpenTokenSelector={showDrawer}
        />
      )
    },
    {
      key: "recurring",
      label: t('swap.tabset.recurring'),
      children: (
        <RepeatingPayment
          transferCompleted={props.handleClose}
          selectedToken={token}
          userBalances={userBalances}
          onOpenTokenSelector={showDrawer}
        />
      )
    }
  ];

  const getModalTitle = () => {
    if (title) {
      return title;
    } else if (selected === "recurring") {
      return t("transfers.create-money-stream-modal-title");
    } else {
      return t("transfers.send-asset-modal-title");
    }
  }

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{getModalTitle()}</div>}
      footer={null}
      open={isVisible}
      onOk={handleClose}
      onCancel={handleClose}
      width={480}>
        {selected === "recurring" && (
          <RepeatingPayment
            transferCompleted={props.handleClose}
            selectedToken={token}
            userBalances={userBalances}
            onOpenTokenSelector={showDrawer}
          />
        )}
        {selected === "one-time" && (
          <OneTimePayment
            transferCompleted={props.handleClose}
            selectedToken={token}
            userBalances={userBalances}
            onOpenTokenSelector={showDrawer}
          />
        )}
        {!selected && (
          <Tabs
            items={tabs}
            className="shift-up-2"
            defaultActiveKey={selected}
            centered
          />
        )}
        <Drawer
          title={t('token-selector.modal-title')}
          placement="bottom"
          closable={true}
          onClose={onCloseTokenSelector}
          open={isTokenSelectorVisible}
          getContainer={false}
          style={{ position: 'absolute' }}>
          {renderTokenSelectorInner()}
        </Drawer>
    </Modal>
  );
};
