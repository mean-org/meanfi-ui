import type { MoneyStreaming, StreamInfo } from '@mean-dao/money-streaming';
import type { PaymentStreaming, Stream } from '@mean-dao/payment-streaming';
import type { PublicKey } from '@solana/web3.js';
import { useQuery } from '@tanstack/react-query';
import {
  FIFTY_SECONDS_REFRESH_TIMEOUT,
  FIVE_MINUTES_REFRESH_TIMEOUT,
  FORTY_SECONDS_REFRESH_TIMEOUT,
  ONE_MINUTE_REFRESH_TIMEOUT,
  PERFORMANCE_THRESHOLD,
  SEVENTY_SECONDS_REFRESH_TIMEOUT,
} from 'app-constants/common';
import { consoleOut, isProd } from 'middleware/ui';
import { useCallback, useMemo, useState } from 'react';
import useGetPerformanceSamples from '../performanceSamples';
import getStreamList from './getStreamList';

export const getStreamListQueryKey = (accountAddress: string | undefined) => ['/streams', accountAddress];

export const useGetStreamList = ({
  srcAccountPk,
  tokenStreamingV1,
  tokenStreamingV2,
}: {
  srcAccountPk: PublicKey | undefined;
  tokenStreamingV1: MoneyStreaming | undefined;
  tokenStreamingV2: PaymentStreaming | undefined;
}) => {
  const { tpsAvg } = useGetPerformanceSamples();

  const isDowngradedPerformance = useMemo(() => {
    return !!(isProd() && (!tpsAvg || tpsAvg < PERFORMANCE_THRESHOLD));
  }, [tpsAvg]);

  const [lastStreamsAmount, setLastStreamsAmount] = useState<number>(0);

  /**
   * Auto reload timeout breakdown
   *
   * #s <= 5 30s * 2
   * #s > 5 & <= 25 40s * 2
   * #s > 25 & <= 60 50s * 2
   * #s > 60 & <= 100 70s * 2
   * #s > 100 5min is ok
   */
  const refreshInterval = useMemo(() => {
    if (lastStreamsAmount <= 5) {
      return ONE_MINUTE_REFRESH_TIMEOUT;
    }
    if (lastStreamsAmount <= 25) {
      return FORTY_SECONDS_REFRESH_TIMEOUT * 2;
    }
    if (lastStreamsAmount <= 60) {
      return FIFTY_SECONDS_REFRESH_TIMEOUT * 2;
    }
    if (lastStreamsAmount <= 100) {
      return SEVENTY_SECONDS_REFRESH_TIMEOUT * 2;
    }

    return FIVE_MINUTES_REFRESH_TIMEOUT;
  }, [lastStreamsAmount]);

  const { data, isFetching, refetch } = useQuery({
    queryKey: getStreamListQueryKey(srcAccountPk?.toBase58()),
    queryFn: () =>
      getStreamList({
        srcAccountPk,
        tokenStreamingV1,
        tokenStreamingV2,
      }),
    select: useCallback((data: (Stream | StreamInfo)[]) => {
      setLastStreamsAmount(data.length);
      consoleOut('useGetStreamList -> items returned:', data.length, 'blue');

      return data;
    }, []),
    enabled: !!(srcAccountPk && tokenStreamingV1 && tokenStreamingV2),
    refetchInterval: isDowngradedPerformance ? false : refreshInterval, // Turned OFF if network is congested
    refetchOnWindowFocus: false,
  });

  return {
    streamList: data ?? [],
    isFetching,
    refetch,
  };
};
