import { type AccountInfo, type ParsedAccountData, PublicKey } from '@solana/web3.js';
import { Drawer, Modal, Tabs } from 'antd';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CUSTOM_TOKEN_NAME, MAX_TOKEN_LIST_ITEMS } from 'src/app-constants/common';
import { NATIVE_SOL } from 'src/app-constants/tokens';
import { TextInput } from 'src/components/TextInput';
import { TokenListItem } from 'src/components/TokenListItem';
import { AppStateContext } from 'src/contexts/appstate';
import { getNetworkIdByEnvironment, useConnection } from 'src/contexts/connection';
import { useWallet } from 'src/contexts/wallet';
import { useWalletAccount } from 'src/contexts/walletAccount';
import { environment } from 'src/environments/environment';
import { getDecimalsFromAccountInfo } from 'src/middleware/accountInfoGetters';
import { consoleOut, isValidAddress } from 'src/middleware/ui';
import { shortenAddress } from 'src/middleware/utils';
import type { TokenInfo } from 'src/models/SolanaTokenInfo';
import type { UserTokenAccount } from 'src/models/accounts';
import { useGetTokensWithBalances } from 'src/query-hooks/accountTokens';
import type { LooseObject } from 'src/types/LooseObject';
import { OneTimePayment } from 'src/views/OneTimePayment';
import { RepeatingPayment } from 'src/views/RepeatingPayment';

type TransfersTabOption = 'one-time' | 'recurring';

interface Props {
  isVisible: boolean;
  selected?: TransfersTabOption;
  selectedToken: UserTokenAccount | undefined;
  title?: string;
  handleClose: () => void;
}

export const SendAssetModal = ({ selected, isVisible, handleClose, selectedToken, title }: Props) => {
  const { splTokenList } = useContext(AppStateContext);
  const connection = useConnection();
  const { connected } = useWallet();
  const { t } = useTranslation('common');
  const [userBalances, setUserBalances] = useState<LooseObject>({});
  const [token, setToken] = useState<TokenInfo | undefined>(undefined);
  const [tokenFilter, setTokenFilter] = useState('');
  const [filteredTokenList, setFilteredTokenList] = useState<TokenInfo[]>([]);
  const [selectedList, setSelectedList] = useState<TokenInfo[]>([]);
  const [isTokenSelectorVisible, setIsTokenSelectorVisible] = useState(false);
  const { selectedAccount } = useWalletAccount();

  const { data: tokensWithBalances } = useGetTokensWithBalances(selectedAccount.address);

  const autoFocusInput = useCallback(() => {
    const input = document.getElementById('token-search-rp');
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

  const onCloseTokenSelector = useCallback(() => {
    setIsTokenSelectorVisible(false);
    // Reset token on errors (decimals: -1 or -2)
    if (selectedToken && selectedToken.decimals < 0) {
      setToken(undefined);
    }
    if (tokenFilter && !isValidAddress(tokenFilter)) {
      setTokenFilter('');
    }
  }, [selectedToken, tokenFilter]);

  // Updates the token list everytime is filtered
  const updateTokenListByFilter = useCallback(
    (searchString: string) => {
      if (!selectedList) {
        return;
      }

      const timeout = setTimeout(() => {
        const filter = (t: TokenInfo) => {
          return (
            t.symbol.toLowerCase().includes(searchString.toLowerCase()) ||
            t.name.toLowerCase().includes(searchString.toLowerCase()) ||
            t.address.toLowerCase().includes(searchString.toLowerCase())
          );
        };

        const preFilterSol = selectedList.filter(t => t.address !== NATIVE_SOL.address);
        const showFromList = !searchString ? preFilterSol : preFilterSol.filter(t => filter(t));

        setFilteredTokenList(showFromList);
      });

      return () => {
        clearTimeout(timeout);
      };
    },
    [selectedList],
  );

  const onInputCleared = useCallback(() => {
    setTokenFilter('');
    updateTokenListByFilter('');
  }, [updateTokenListByFilter]);

  const onTokenSearchInputChange = useCallback(
    (value: string) => {
      const newValue = value.trim();
      setTokenFilter(newValue);
      updateTokenListByFilter(newValue);
    },
    [updateTokenListByFilter],
  );

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

  //#region Token selector - data management

  // Automatically update all token balances and rebuild token list
  useEffect(() => {
    if (!tokensWithBalances) {
      return;
    }

    setSelectedList(tokensWithBalances.tokenList);
    setUserBalances(tokensWithBalances.balancesMap);
  }, [tokensWithBalances]);

  // Reset results when the filter is cleared
  useEffect(() => {
    if (splTokenList?.length && filteredTokenList.length === 0 && !tokenFilter) {
      updateTokenListByFilter(tokenFilter);
    }
  }, [splTokenList, tokenFilter, filteredTokenList, updateTokenListByFilter]);

  //#endregion

  ///////////////////
  //   Rendering   //
  ///////////////////

  //#region Token selector - render methods

  const getTokenListItemClass = (item: TokenInfo) => {
    return selectedToken?.address === item.address ? 'selected' : 'simplelink';
  };

  const renderTokenList = () => {
    return filteredTokenList.map((t, index) => {
      const onClick = () => {
        setToken(t);

        consoleOut('token selected:', t, 'blue');
        onCloseTokenSelector();
      };

      if (index < MAX_TOKEN_LIST_ITEMS) {
        const balance = userBalances ? (userBalances[t.address] as number) : 0;
        return (
          <TokenListItem
            key={t.address}
            name={t.name || CUSTOM_TOKEN_NAME}
            mintAddress={t.address}
            token={t}
            className={balance ? getTokenListItemClass(t) : 'hidden'}
            onClick={onClick}
            balance={balance}
            showUsdValues={true}
          />
        );
      }

      return null;
    });
  };

  const getSelectedTokenError = () => {
    if (tokenFilter && selectedToken) {
      if (selectedToken.decimals === -1) {
        return 'Account not found';
      }
      if (selectedToken.decimals === -2) {
        return 'Account is not a token mint';
      }
    }

    return undefined;
  };

  const getBalanceForTokenFilter = () => {
    return connected && userBalances && userBalances[tokenFilter] > 0 ? userBalances[tokenFilter] : 0;
  };

  const renderTokenSelectorInner = () => {
    return (
      <div className='token-selector-wrapper'>
        <div className='token-search-wrapper'>
          <TextInput
            id='token-search-rp'
            value={tokenFilter}
            allowClear={true}
            extraClass='mb-2'
            onInputClear={onInputCleared}
            placeholder={t('token-selector.search-input-placeholder')}
            error={getSelectedTokenError()}
            onInputChange={onTokenSearchInputChange}
          />
        </div>
        <div className='token-list'>
          {filteredTokenList.length > 0 && renderTokenList()}
          {tokenFilter && isValidAddress(tokenFilter) && filteredTokenList.length === 0 && (
            <TokenListItem
              key={tokenFilter}
              name={CUSTOM_TOKEN_NAME}
              mintAddress={tokenFilter}
              className={selectedToken && selectedToken.address === tokenFilter ? 'selected' : 'simplelink'}
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
                decimals = getDecimalsFromAccountInfo(accountInfo, -1);
                const unknownToken: TokenInfo = {
                  address,
                  name: CUSTOM_TOKEN_NAME,
                  chainId: getNetworkIdByEnvironment(environment),
                  decimals,
                  symbol: `[${shortenAddress(address)}]`,
                };
                setToken(unknownToken);
                consoleOut('token selected:', unknownToken, 'blue');
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
  };
  //#endregion

  const tabs = [
    {
      key: 'one-time',
      label: t('swap.tabset.one-time'),
      children: (
        <OneTimePayment
          transferCompleted={handleClose}
          selectedToken={token}
          userBalances={userBalances}
          onOpenTokenSelector={showDrawer}
        />
      ),
    },
    {
      key: 'recurring',
      label: t('swap.tabset.recurring'),
      children: (
        <RepeatingPayment
          transferCompleted={handleClose}
          selectedToken={token}
          userBalances={userBalances}
          onOpenTokenSelector={showDrawer}
        />
      ),
    },
  ];

  const getModalTitle = () => {
    if (title) {
      return title;
    }
    if (selected === 'recurring') {
      return t('transfers.create-money-stream-modal-title');
    }

    return t('transfers.send-asset-modal-title');
  };

  return (
    <Modal
      className='mean-modal simple-modal'
      title={<div className='modal-title'>{getModalTitle()}</div>}
      footer={null}
      open={isVisible}
      onOk={handleClose}
      onCancel={handleClose}
      width={480}
    >
      {selected === 'recurring' && (
        <RepeatingPayment
          transferCompleted={handleClose}
          selectedToken={token}
          userBalances={userBalances}
          onOpenTokenSelector={showDrawer}
        />
      )}
      {selected === 'one-time' && (
        <OneTimePayment
          transferCompleted={handleClose}
          selectedToken={token}
          userBalances={userBalances}
          onOpenTokenSelector={showDrawer}
        />
      )}
      {!selected && <Tabs items={tabs} className='shift-up-2' defaultActiveKey={selected} centered />}
      <Drawer
        title={t('token-selector.modal-title')}
        placement='bottom'
        closable={true}
        onClose={onCloseTokenSelector}
        open={isTokenSelectorVisible}
        getContainer={false}
      >
        {renderTokenSelectorInner()}
      </Drawer>
    </Modal>
  );
};
