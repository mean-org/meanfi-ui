export const getAccountAssetsQueryKey = (accountAddress: string) => ['/user-account-assets', accountAddress];

import { useQuery } from '@tanstack/react-query';
import { AppStateContext } from 'contexts/appstate';
import { useConnection } from 'contexts/connection';
import { getUserAccountTokens } from 'middleware/accounts';
import { useContext } from 'react';

const useAccountAssets = (accountAddress: string) => {
  const connection = useConnection();
  const { priceList, splTokenList } = useContext(AppStateContext);

  const { data, isFetching: loadingUserAssets, refetch: refreshAccountAssets } = useQuery({
    queryKey: getAccountAssetsQueryKey(accountAddress),
    queryFn: () => getUserAccountTokens(connection, accountAddress, priceList, splTokenList),
    enabled: !!accountAddress && splTokenList.length > 0 && !!priceList,
  });

  return {
    userAssets: data ? data : undefined,
    loadingUserAssets,
    refreshAccountAssets,
  };
};

export default useAccountAssets;
