import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Drawer, Modal, Tabs } from "antd";
import { useTranslation } from "react-i18next";
import { OneTimePayment, RepeatingPayment } from '../../views';
import { TokenInfo } from 'models/SolanaTokenInfo';
import { AccountTokenParsedInfo, UserTokenAccount } from "../../models/accounts";
import { useLocation } from 'react-router-dom';
import { consoleOut, isValidAddress } from 'middleware/ui';
import { getNetworkIdByEnvironment, useConnection } from 'contexts/connection';
import { useWallet } from 'contexts/wallet';
import { AppStateContext } from 'contexts/appstate';
import { fetchAccountTokens } from 'middleware/accounts';
import { NATIVE_SOL } from 'constants/tokens';
import { useNativeAccount } from 'contexts/accounts';
import { getAmountFromLamports, shortenAddress } from 'middleware/utils';
import { MAX_TOKEN_LIST_ITEMS } from 'constants/common';
import { CUSTOM_TOKEN_NAME } from 'constants/common';
import { TokenListItem } from 'components/TokenListItem';
import { TextInput } from 'components/TextInput';
import { AccountInfo, ParsedAccountData, PublicKey } from '@solana/web3.js';
import { environment } from 'environments/environment';

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
    splTokenList,
    getTokenPriceByAddress,
    getTokenPriceBySymbol,
  } = useContext(AppStateContext);
  const connection = useConnection();
  const { connected, publicKey, wallet } = useWallet();
  const { account } = useNativeAccount();
  const location = useLocation();
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

  useEffect(() => {
    if (isVisible && selectedToken) {
      setToken(selectedToken);
    }
  }, [isVisible, selectedToken]);

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

      const balancesMap: any = {};

      fetchAccountTokens(connection, publicKey)
      .then(accTks => {
        if (accTks) {

          const intersectedList = new Array<TokenInfo>();
          const splTokensCopy = JSON.parse(JSON.stringify(splTokenList)) as TokenInfo[];

          intersectedList.push(splTokensCopy[0]);
          balancesMap[NATIVE_SOL.address] = nativeBalance;
          // Create a list containing tokens for the user owned token accounts
          accTks.forEach(item => {
            balancesMap[item.parsedInfo.mint] = item.parsedInfo.tokenAmount.uiAmount || 0;
            const isTokenAccountInTheList = intersectedList.some(t => t.address === item.parsedInfo.mint);
            const tokenFromSplTokensCopy = splTokensCopy.find(t => t.address === item.parsedInfo.mint);
            if (tokenFromSplTokensCopy && !isTokenAccountInTheList) {
              intersectedList.push(tokenFromSplTokensCopy);
            }
          });

          intersectedList.sort((a, b) => {
            if ((balancesMap[a.address] || 0) < (balancesMap[b.address] || 0)) {
              return 1;
            } else if ((balancesMap[a.address] || 0) > (balancesMap[b.address] || 0)) {
              return -1;
            }
            return 0;
          });

          const custom: TokenInfo[] = [];
          // Build a list with all owned token accounts not already in intersectedList as custom tokens
          accTks.forEach((item: AccountTokenParsedInfo, index: number) => {
            if (!intersectedList.some(t => t.address === item.parsedInfo.mint)) {
              const customToken: TokenInfo = {
                address: item.parsedInfo.mint,
                chainId: 0,
                decimals: item.parsedInfo.tokenAmount.decimals,
                name: 'Custom account',
                symbol: shortenAddress(item.parsedInfo.mint),
                tags: undefined,
                logoURI: undefined,
              };
              custom.push(customToken);
            }
          });

          // Sort by token balance
          custom.sort((a, b) => {
            if ((balancesMap[a.address] || 0) < (balancesMap[b.address] || 0)) {
              return 1;
            } else if ((balancesMap[a.address] || 0) > (balancesMap[b.address] || 0)) {
              return -1;
            }
            return 0;
          });

          // Finally add all owned token accounts as custom tokens
          const finalList = intersectedList.concat(custom);

          consoleOut('finalList items:', finalList.length, 'blue');
          setSelectedList(finalList);

        } else {
          for (const t of splTokenList) {
            balancesMap[t.address] = 0;
          }
          // set the list to the userTokens list
          setSelectedList(splTokenList);
        }
      })
      .catch(error => {
        console.error(error);
        for (const t of splTokenList) {
          balancesMap[t.address] = 0;
        }
        setSelectedList(splTokenList);
      })
      .finally(() => setUserBalances(balancesMap));

    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    publicKey,
    splTokenList,
    connection,
    splTokenList,
    nativeBalance,
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


  ///////////////////
  //   Rendering   //
  ///////////////////

  const renderTokenList = (
    <>
      {(filteredTokenList && filteredTokenList.length > 0) && (
        filteredTokenList.map((t, index) => {
          const onClick = function () {
            setToken(t);

            consoleOut("token selected:", t, 'blue');
            const price = getTokenPriceByAddress(t.address) || getTokenPriceBySymbol(t.symbol);
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
                className={balance ? selectedToken && selectedToken.address === t.address ? "selected" : "simplelink" : "hidden"}
                onClick={onClick}
                balance={balance}
              />
            );
          } else {
            return null;
          }
        })
      )}
    </>
  );

  const renderTokenSelectorInner = (
    <div className="token-selector-wrapper">
      <div className="token-search-wrapper">
        <TextInput
          id="token-search-rp"
          value={tokenFilter}
          allowClear={true}
          extraClass="mb-2"
          onInputClear={onInputCleared}
          placeholder={t('token-selector.search-input-placeholder')}
          error={
            tokenFilter && selectedToken && selectedToken.decimals === -1
              ? 'Account not found'
              : tokenFilter && selectedToken && selectedToken.decimals === -2
                ? 'Account is not a token mint'
                : ''
          }
          onInputChange={onTokenSearchInputChange} />
      </div>
      <div className="token-list">
        {filteredTokenList.length > 0 && renderTokenList}
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
              // if (userBalances && userBalances[address]) {
              //   setSelectedTokenBalance(userBalances[address]);
              // }
              consoleOut("token selected:", unknownToken, 'blue');
              // Do not close on errors (-1 or -2)
              if (decimals >= 0) {
                onCloseTokenSelector();
              }
            }}
            balance={connected && userBalances && userBalances[tokenFilter] > 0 ? userBalances[tokenFilter] : 0}
          />
        )}
      </div>
    </div>
  );

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

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{
        title
          ? title
          : selected === "recurring"
            ? t("transfers.create-money-stream-modal-title")
            : t("transfers.send-asset-modal-title")
      }</div>}
      footer={null}
      open={isVisible}
      onOk={handleClose}
      onCancel={handleClose}
      width={480}>
        {selected === "recurring" ? (
          <RepeatingPayment
            transferCompleted={props.handleClose}
            selectedToken={token}
            userBalances={userBalances}
            onOpenTokenSelector={showDrawer}
          />
        ) : selected === "one-time" ? (
          <OneTimePayment
            transferCompleted={props.handleClose}
            selectedToken={token}
            userBalances={userBalances}
            onOpenTokenSelector={showDrawer}
          />
        ) : (
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
          {renderTokenSelectorInner}
        </Drawer>
    </Modal>
  );
};
