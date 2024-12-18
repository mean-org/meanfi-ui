import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { THIRTY_MINUTES_REFRESH_TIMEOUT } from 'src/app-constants';
import { getPrices } from 'src/middleware/api';
import type { TokenPrice } from 'src/models/TokenPrice';

export const getAssetPricesKey = () => ['token-prices'];

const useGetAssetPrices = (addressOrSymbolCsv?: string) => {
  const {
    data,
    isFetching: loadingPrices,
    refetch: refetchPrices,
  } = useQuery({
    queryKey: getAssetPricesKey(),
    queryFn: () => getPrices(addressOrSymbolCsv),
    refetchInterval: THIRTY_MINUTES_REFRESH_TIMEOUT,
    select: useCallback((data: TokenPrice[]) => {
      console.log('useGetAssetPrices -> Prices updated:', data);

      return data;
    }, []),
  });

  return {
    prices: data ?? [],
    loadingPrices,
    refetchPrices,
  };
};

export default useGetAssetPrices;
