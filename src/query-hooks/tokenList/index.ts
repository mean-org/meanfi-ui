import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { consoleOut } from 'src/middleware/ui';
import type { UserTokenAccount } from 'src/models/accounts/UserTokenAccount';

// const tokenListUrl = 'https://tokens.jup.ag/tokens?tags=verified';
const tokenListUrl = 'https://token-list-api.solana.cloud/v1/list';

export const getTokenListKey = () => ['/token-list'];

const useGetTokenList = () => {
  return useQuery({
    queryKey: getTokenListKey(),
    retry: 3,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours stale time
    queryFn: async () => {
      consoleOut('useGetTokenList -> Fetching token list...', '', 'blue');
      consoleOut('tokenListUrl:', tokenListUrl, 'blue');
      return await fetch(tokenListUrl, {
        method: 'GET',
        redirect: 'follow',
      }).then(response => response.json());
    },
    select: useCallback((data: { content: UserTokenAccount[] }) => {
      const tokens: UserTokenAccount[] = data?.content ?? [];
      consoleOut('useGetTokenList -> Token list loaded:', tokens, 'blue');

      return tokens.filter(token => token.decimals > 0);
    }, []),
  });
};

export default useGetTokenList;
