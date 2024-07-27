import { useQuery } from '@tanstack/react-query';
import { getSolFlareTokenList } from 'middleware/api';
import type { UserTokenAccount } from 'models/accounts';
import { useCallback, useMemo } from 'react';

export const getTokenListKey = () => ['/token-list'];

const useGetTokenList = () => {
  const { data, isFetching: loadingTokenList } = useQuery({
    queryKey: getTokenListKey(),
    queryFn: () => getSolFlareTokenList(),
    select: useCallback((data: UserTokenAccount[]) => {
      console.log('useGetTokenList -> Token list loaded:', data);

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
