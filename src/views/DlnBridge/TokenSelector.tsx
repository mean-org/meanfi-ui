import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CUSTOM_TOKEN_NAME, MAX_TOKEN_LIST_ITEMS } from 'src/app-constants/common';
import { TextInput } from 'src/components/TextInput';
import { TokenListItem } from 'src/components/TokenListItem';
import { useWallet } from 'src/contexts/wallet';
import { consoleOut } from 'src/middleware/ui';
import type { TokenInfo } from 'src/models/SolanaTokenInfo';
import type { UserTokenAccount } from 'src/models/accounts/UserTokenAccount';
import { useGetTokensWithBalances } from 'src/query-hooks/accountTokens';
import type { LooseObject } from 'src/types/LooseObject';

interface TokenSelectorProps {
  tokens: TokenInfo[] | undefined;
  selectedToken: string | undefined;
  isSolana?: boolean;
  onClose: () => void;
  onTokenSelected: (t: TokenInfo) => void;
}

const TokenSelector = ({ tokens, selectedToken, isSolana, onClose, onTokenSelected }: TokenSelectorProps) => {
  const { t } = useTranslation('common');
  const { connected, publicKey } = useWallet();

  const [tokenFilter, setTokenFilter] = useState('');
  const [userBalances, setUserBalances] = useState<LooseObject>();
  const [filteredTokenList, setFilteredTokenList] = useState<TokenInfo[]>([]);
  const [selectedList, setSelectedList] = useState<TokenInfo[]>([]);

  const tokenList = useMemo(() => (tokens ? (tokens.slice() as UserTokenAccount[]) : []), [tokens]);
  const { data: tokensWithBalances } = useGetTokensWithBalances(publicKey?.toBase58());

  // Updates the token list everytime is filtered
  const updateTokenListByFilter = useCallback(
    (searchString: string) => {
      if (!selectedList) {
        return;
      }

      const timeout = setTimeout(() => {
        const filter = (t: TokenInfo) => {
          return t.name.toLowerCase().includes(searchString.toLowerCase());
        };

        const filteredList = searchString ? selectedList.filter(t => filter(t)) : selectedList;

        setFilteredTokenList(filteredList);
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
    (value: string) => {
      const input = value.trim();
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
    if (!tokensWithBalances) {
      return;
    }

    if (!isSolana) {
      setSelectedList(tokenList);
      setUserBalances({});
      return;
    }

    setSelectedList(tokensWithBalances.tokenList);
    setUserBalances(tokensWithBalances.balancesMap);
  }, [isSolana, tokenList, tokensWithBalances]);

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

  useEffect(() => console.log('filteredTokenList:', filteredTokenList), [filteredTokenList]);

  const getTokenListItemClass = (item: TokenInfo) => {
    return selectedToken === item.address ? 'selected' : 'simplelink';
  };

  const renderTokenList = () => {
    return filteredTokenList.map((t, index) => {
      const onClick = () => {
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
            className={getTokenListItemClass(t)}
            onClick={onClick}
            balance={balance}
            showUsdValues={true}
          />
        );
      }

      return null;
    });
  };

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
          onInputChange={onTokenSearchInputChange}
        />
      </div>
      <div className='token-list'>
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
