import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { consoleOut } from 'src/middleware/ui';
import type { UserTokenAccount } from 'src/models/accounts/UserTokenAccount';

const tokenListUrl = 'https://tokens.jup.ag/tokens?tags=verified';

export const getTokenListKey = () => ['/token-list'];

const useGetTokenList = () => {
  const { data, isFetching: loadingTokenList } = useQuery({
    queryKey: getTokenListKey(),
    queryFn: async () => {
      consoleOut('useGetTokenList -> Fetching token list...', '', 'blue');
      consoleOut('tokenListUrl:', tokenListUrl, 'blue');
      return await fetch(tokenListUrl,{
        method: 'post',
        redirect: 'follow',
      }).then(response => response.json());
    },
    select: useCallback((data: UserTokenAccount[]) => {
      consoleOut('useGetTokenList -> Token list loaded:', data, 'blue');

      return data;
    }, []),
  });

  const tokens = data ?? [];
  const withDecimals = useMemo(() => tokens.filter(token => token.decimals > 0), [tokens]);

  return {
    tokenList: withDecimals,
    loadingTokenList,
  };
};

export default useGetTokenList;
