import type { MoneyStreaming, StreamInfo } from '@mean-dao/money-streaming';
import type { PaymentStreaming, Stream } from '@mean-dao/payment-streaming';
import type { PublicKey } from '@solana/web3.js';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import {
  FIVE_MINUTES_REFRESH_TIMEOUT,
  PERFORMANCE_THRESHOLD,
  THREE_MINUTES_REFRESH_TIMEOUT
} from 'src/app-constants/common';
import { isProd } from 'src/middleware/ui';
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

  const refreshInterval = useMemo(() => {
    if (lastStreamsAmount <= 5) {
      return THREE_MINUTES_REFRESH_TIMEOUT;
    }
    if (lastStreamsAmount <= 25) {
      return FIVE_MINUTES_REFRESH_TIMEOUT;
    }

    return false;
  }, [lastStreamsAmount]);

  return useQuery({
    queryKey: getStreamListQueryKey(srcAccountPk?.toBase58()),
    queryFn: () =>
      getStreamList({
        srcAccountPk,
        tokenStreamingV1,
        tokenStreamingV2,
      }),
    select: useCallback((data: (Stream | StreamInfo)[]) => {
      setLastStreamsAmount(data.length);

      return data;
    }, []),
    enabled: !!(srcAccountPk && tokenStreamingV1 && tokenStreamingV2),
    refetchInterval: isDowngradedPerformance ? false : refreshInterval, // Turned OFF if network is congested
    refetchOnWindowFocus: false,
    refetchOnMount: false
  });
};
