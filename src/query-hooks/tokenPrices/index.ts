import {
  type QueryFunction,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
  useQuery,
} from '@tanstack/react-query';
import type { TokenPrice } from 'models/TokenPrice';
import { type ErrorType, fetcher } from '../fetcher';

type GetTokenPricesParams = {
  addressOrSymbolCsv?: string;
  includeLPTokens?: boolean;
};

/**
 * @summary Gets the latest pricing quotes for a list of assets
 */
export const getTokenPrices = (params?: GetTokenPricesParams, signal?: AbortSignal) => {
  return fetcher<TokenPrice[]>({
    url: '/token-prices',
    method: 'GET',
    params,
    signal,
  });
};

export const getGetTokenPricesQueryKey = (params?: GetTokenPricesParams) => {
  return ['/token-prices', ...(params ? [params] : [])] as const;
};

export const getGetTokenPricesQueryOptions = <
  TData = Awaited<ReturnType<typeof getTokenPrices>>,
  TError = ErrorType<unknown>,
>(
  params?: GetTokenPricesParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof getTokenPrices>>, TError, TData>>;
  },
) => {
  const { query: queryOptions } = options ?? {};

  const queryKey = queryOptions?.queryKey ?? getGetTokenPricesQueryKey(params);

  const queryFn: QueryFunction<Awaited<ReturnType<typeof getTokenPrices>>> = ({ signal }) =>
    getTokenPrices(params, signal);

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof getTokenPrices>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export type GetTokenPricesQueryResult = NonNullable<Awaited<ReturnType<typeof getTokenPrices>>>;

export type GetTokenPricesQueryError = ErrorType<unknown>;

/**
 * @summary Gets the latest pricing quotes for a list of assets
 */
export const useGetTokenPrices = <TData = Awaited<ReturnType<typeof getTokenPrices>>, TError = ErrorType<unknown>>(
  params?: GetTokenPricesParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof getTokenPrices>>, TError, TData>>;
  },
): UseQueryResult<TData, TError> & { queryKey: QueryKey } => {
  const queryOptions = getGetTokenPricesQueryOptions(params, options);

  const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
  };

  query.queryKey = queryOptions.queryKey;

  return query;
};
