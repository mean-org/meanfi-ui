import { PublicKey } from '@solana/web3.js';
import { useQuery } from '@tanstack/react-query';
import { useContext } from 'react';
import { ONE_MINUTE_REFRESH_TIMEOUT } from 'src/app-constants';
import { AppStateContext } from 'src/contexts/appstate';
import { useConnection } from 'src/contexts/connection';
import { fetchAccountTokens, getTokensWithBalances, getUserAccountTokens } from 'src/middleware/accounts';
import { useGetAccountBalance } from '../accountBalance';

export const getUseAccountAssetsQueryKey = (accountAddress: string | undefined) => [
  '/user-account-assets',
  accountAddress,
];

export const getUseFetchAccountTokensQueryKey = (accountAddress: string | undefined) => [
  '/fetch-account-tokens',
  accountAddress,
];

export const getUseGetTokensWithBalancesQueryKey = (accountAddress: string | undefined) => [
  '/tokens-with-balances',
  accountAddress,
];

export const useAccountAssets = (accountAddress: string | undefined) => {
  const { priceList, splTokenList } = useContext(AppStateContext);
  const { data: balance } = useGetAccountBalance(accountAddress);
  const { data: parsedTokens } = useFetchAccountTokens(accountAddress);

  const {
    data,
    isFetching: loadingUserAssets,
    refetch: refreshAccountAssets,
  } = useQuery({
    queryKey: getUseAccountAssetsQueryKey(accountAddress),
    queryFn: () => {
      if (!accountAddress || !parsedTokens) return;
      return getUserAccountTokens({
        accountAddress,
        accTks: parsedTokens,
        accountBalance: balance ?? 0,
        coinPrices: priceList,
        splTokenList,
      });
    },
    enabled: !!accountAddress && !!parsedTokens,
    retry: false,
  });

  return {
    userAssets: data ? data : undefined,
    loadingUserAssets,
    refreshAccountAssets,
  };
};

export const useGetTokensWithBalances = (accountAddress: string | undefined, onlyAccountAssets?: boolean) => {
  const { priceList, splTokenList } = useContext(AppStateContext);
  const { data: balance } = useGetAccountBalance(accountAddress);
  const { data: parsedTokens } = useFetchAccountTokens(accountAddress);

  return useQuery({
    queryKey: getUseGetTokensWithBalancesQueryKey(accountAddress),
    queryFn: () => {
      if (!accountAddress || !parsedTokens) return;
      return getTokensWithBalances({
        accountAddress,
        accTks: parsedTokens,
        accountBalance: balance ?? 0,
        coinPrices: priceList,
        splTokenList,
        onlyAccountAssets: onlyAccountAssets ?? true,
      });
    },
    enabled: !!accountAddress && !!parsedTokens,
    retry: false,
  });
};

export const useFetchAccountTokens = (accountAddress: string | undefined) => {
  const connection = useConnection();

  return useQuery({
    queryKey: getUseFetchAccountTokensQueryKey(accountAddress),
    staleTime: ONE_MINUTE_REFRESH_TIMEOUT,
    queryFn: async () => {
      if (!accountAddress) return;
      return await fetchAccountTokens(connection, new PublicKey(accountAddress));
    },
    enabled: !!accountAddress,
    retry: false,
  });
};
