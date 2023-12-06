import { TextInput } from 'components/TextInput';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TokenMap } from './types';
import { AppStateContext } from 'contexts/appstate';
import { UserTokenAccount } from 'models/accounts/UserTokenAccount';
import { useConnection } from 'contexts/connection';
import { useWallet } from 'contexts/wallet';
import { getTokensWithBalances } from 'middleware/accounts';
import { TokenInfo } from 'models/SolanaTokenInfo';
import { consoleOut } from 'middleware/ui';
import { CUSTOM_TOKEN_NAME, MAX_TOKEN_LIST_ITEMS } from 'constants/common';
import { TokenListItem } from 'components/TokenListItem';

interface TokenSelectorProps {
  tokens: TokenMap | undefined;
  selectedToken: string | undefined;
  onClose: () => void;
  onTokenSelected: (t: TokenInfo) => void;
}

const TokenSelector = ({ tokens, selectedToken, onClose, onTokenSelected }: TokenSelectorProps) => {
  const { t } = useTranslation('common');
  const { priceList } = useContext(AppStateContext);
  const connection = useConnection();
  const { connected, publicKey } = useWallet();

  const [tokenFilter, setTokenFilter] = useState('');
  const [userBalances, setUserBalances] = useState<any>();
  const [filteredTokenList, setFilteredTokenList] = useState<TokenInfo[]>([]);
  const [selectedList, setSelectedList] = useState<TokenInfo[]>([]);

  const tokenList = useMemo(() => {
    if (!tokens) {
      return [];
    }

    return Object.keys(tokens).map(key => tokens[key]) as UserTokenAccount[];
  }, [tokens]);

  // Updates the token list everytime is filtered
  const updateTokenListByFilter = useCallback(
    (searchString: string) => {
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

        const showFromList = !searchString ? selectedList : selectedList.filter((t: any) => filter(t));

        setFilteredTokenList(showFromList);
      });

      return () => {
        clearTimeout(timeout);
      };
    },
    [selectedList],
  );

  const autoFocusInput = useCallback(() => {
    const input = document.getElementById('token-search-input');
    if (input) {
      setTimeout(() => {
        input.focus();
      }, 100);
    }
  }, []);

  // Token selection modal close
  const onCloseTokenSelector = useCallback(() => {
    const timeout = setTimeout(() => {
      setTokenFilter('');
      updateTokenListByFilter('');
      onClose();
    });

    return () => {
      clearTimeout(timeout);
    };
  }, [onClose, updateTokenListByFilter]);

  const onInputCleared = useCallback(() => {
    setTokenFilter('');
    updateTokenListByFilter('');
  }, [updateTokenListByFilter]);

  const onTokenSearchInputChange = useCallback(
    (e: any) => {
      const input = e.target.value;
      if (input) {
        setTokenFilter(input);
        updateTokenListByFilter(input);
      } else {
        setTokenFilter('');
        updateTokenListByFilter('');
      }
    },
    [updateTokenListByFilter],
  );

  // Automatically update all token balances and rebuild token list
  useEffect(() => {
    if (!connection) {
      console.error('No connection');
      return;
    }

    if (!publicKey || !tokenList) {
      return;
    }

    const timeout = setTimeout(() => {
      getTokensWithBalances(connection, publicKey.toBase58(), priceList, tokenList, true).then(response => {
        if (response) {
          setSelectedList(response.tokenList);
          setUserBalances(response.balancesMap);
        }
      });
    });

    return () => {
      clearTimeout(timeout);
    };
  }, [publicKey, connection, priceList, tokenList]);

  // Reset results when the filter is cleared
  useEffect(() => {
    if (tokenList?.length && filteredTokenList.length === 0 && !tokenFilter) {
      updateTokenListByFilter(tokenFilter);
    }
  }, [tokenList, tokenFilter, filteredTokenList, updateTokenListByFilter]);

  // Init
  useEffect(() => {
    setTokenFilter('');
    updateTokenListByFilter('');
    autoFocusInput();
  }, [autoFocusInput, updateTokenListByFilter]);

  useEffect(() => console.log('tokenList:', tokenList), [tokenList]);

  const getTokenListItemClass = (item: TokenInfo) => {
    return selectedToken === item.address ? 'selected' : 'simplelink';
  };

  const renderTokenList = () => {
    return filteredTokenList.map((t, index) => {
      const onClick = function () {
        consoleOut('token selected:', t, 'blue');
        onTokenSelected(t);
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
            className={balance ? getTokenListItemClass(t) : 'hidden'}
            onClick={onClick}
            balance={balance}
            showUsdValues={true}
          />
        );
      } else {
        return null;
      }
    });
  };

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
          onInputChange={onTokenSearchInputChange}
        />
      </div>
      <div className="token-list">
        {filteredTokenList.length > 0 ? (
          renderTokenList()
        ) : (
          <p>No tokens found{tokenFilter ? ' for your search' : ''}</p>
        )}
      </div>
    </div>
  );
};

export default TokenSelector;
