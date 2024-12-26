import type { MoneyStreaming, StreamInfo } from '@mean-dao/money-streaming';
import type { PaymentStreaming, Stream } from '@mean-dao/payment-streaming';
import type { PublicKey } from '@solana/web3.js';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import {
  PERFORMANCE_THRESHOLD,
  TEN_MINUTES_REFRESH_TIMEOUT,
  THIRTY_MINUTES_REFRESH_TIMEOUT,
} from 'src/app-constants/common';
import { isProd } from 'src/middleware/ui';
import { useEnableFetchingOldStreams } from '../enableFetchingOldStreams';
import useGetPerformanceSamples from '../performanceSamples';
import getStreamList from './getStreamList';

export const getUseGetStreamListQueryKey = (accountAddress: string | undefined, shouldLoadV1Streams: boolean) => ['streams', accountAddress, shouldLoadV1Streams ? 'all' : 'v2-only'];

export const useGetStreamList = ({
  srcAccountPk,
  tokenStreamingV1,
  tokenStreamingV2,
}: {
  srcAccountPk: PublicKey | undefined;
  tokenStreamingV1: MoneyStreaming | undefined;
  tokenStreamingV2: PaymentStreaming | undefined;
}) => {
  const { data: tpsAvg } = useGetPerformanceSamples();
  const shouldLoadV1Streams = useEnableFetchingOldStreams();

  const isDowngradedPerformance = useMemo(() => {
    return !!(isProd() && (!tpsAvg || tpsAvg < PERFORMANCE_THRESHOLD));
  }, [tpsAvg]);

  const [lastStreamsAmount, setLastStreamsAmount] = useState<number>(0);

  const refreshInterval = useMemo(() => {
    if (lastStreamsAmount <= 5) {
      return TEN_MINUTES_REFRESH_TIMEOUT;
    }
    if (lastStreamsAmount <= 25) {
      return THIRTY_MINUTES_REFRESH_TIMEOUT;
    }

    return false;
  }, [lastStreamsAmount]);

  return useQuery({
    queryKey: getUseGetStreamListQueryKey(srcAccountPk?.toBase58(), shouldLoadV1Streams),
    queryFn: () =>
      getStreamList({
        srcAccountPk,
        tokenStreamingV1,
        tokenStreamingV2,
        shouldLoadV1Streams,
      }),
    select: useCallback((data: (Stream | StreamInfo)[]) => {
      setLastStreamsAmount(data.length);

      return data;
    }, []),
    enabled: !!(srcAccountPk && tokenStreamingV1 && tokenStreamingV2),
    refetchInterval: isDowngradedPerformance ? false : refreshInterval, // Turned OFF if network is congested
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
};
