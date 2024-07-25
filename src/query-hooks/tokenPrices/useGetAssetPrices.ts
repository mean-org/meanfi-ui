import { THIRTY_MINUTES_REFRESH_TIMEOUT } from 'app-constants/common';
import { consoleOut } from 'middleware/ui';
import type { TokenPrice } from 'models/TokenPrice';
import { useCallback } from 'react';
import { useGetTokenPrices } from '.';

const useGetAssetPrices = (addressOrSymbolCsv?: string) => {
  const {
    data,
    isFetching: loadingPrices,
    refetch: refetchPrices,
  } = useGetTokenPrices(
    {
      addressOrSymbolCsv,
      includeLPTokens: false,
    },
    {
      query: {
        refetchInterval: THIRTY_MINUTES_REFRESH_TIMEOUT,
        select: useCallback((data: TokenPrice[]) => {
          consoleOut('useGetAssetPrices -> Prices updated:', data, 'blue');

          return data;
        }, []),
      },
    },
  );

  return {
    prices: data ?? [],
    loadingPrices,
    refetchPrices,
  };
};

export default useGetAssetPrices;
