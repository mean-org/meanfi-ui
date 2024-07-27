import { useQuery } from '@tanstack/react-query';
import { THIRTY_MINUTES_REFRESH_TIMEOUT } from 'app-constants';
import { getPrices } from 'middleware/api';
import type { TokenPrice } from 'models/TokenPrice';
import { useCallback } from 'react';

export const getAssetPricesKey = () => ['/token-prices'];

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
