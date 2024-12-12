import type { PaymentStreaming } from '@mean-dao/payment-streaming';
import type { PublicKey } from '@solana/web3.js';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { FIVE_MINUTES_REFRESH_TIMEOUT, PERFORMANCE_THRESHOLD } from 'src/app-constants';
import { isProd } from 'src/middleware/ui';
import useGetPerformanceSamples from '../performanceSamples';
import getVestingContract from './getVestingContract';
import getVestingContracts from './getVestingContracts';

const getVestingContractsQueryKey = (accountAddress?: string) => ['/vesting-contracts', accountAddress];

export const useGetVestingContracts = ({
  srcAccountPk,
  tokenStreamingV2,
}: {
  srcAccountPk: PublicKey | undefined;
  tokenStreamingV2: PaymentStreaming | undefined;
}) => {
  const { tpsAvg } = useGetPerformanceSamples();

  const isDowngradedPerformance = useMemo(() => {
    return !!(isProd() && (!tpsAvg || tpsAvg < PERFORMANCE_THRESHOLD));
  }, [tpsAvg]);

  const { data, isFetching, refetch } = useQuery({
    queryKey: getVestingContractsQueryKey(srcAccountPk?.toBase58()),
    queryFn: () =>
      getVestingContracts({
        srcAccountPk,
        tokenStreamingV2,
      }),
    enabled: !!(srcAccountPk && tokenStreamingV2),
    refetchInterval: isDowngradedPerformance ? false : FIVE_MINUTES_REFRESH_TIMEOUT, // Turned OFF if network is congested
    refetchOnWindowFocus: false,
  });

  return {
    refetch,
    vestingContracts: data ?? [],
    loadingVestingContracts: isFetching,
  };
};

const getVestingContractQueryKey = (treasuryId?: string) => ['/vesting-contract', treasuryId];

export const useGetVestingContract = ({
  vestingAccountId,
  tokenStreamingV2,
}: {
  vestingAccountId: string | undefined;
  tokenStreamingV2: PaymentStreaming | undefined;
}) => {
  const { data, isFetching, refetch } = useQuery({
    queryKey: getVestingContractQueryKey(vestingAccountId),
    queryFn: () =>
      getVestingContract({
        vestingAccountId,
        tokenStreamingV2,
      }),
    enabled: !!(vestingAccountId && tokenStreamingV2),
    refetchOnWindowFocus: false,
  });

  return {
    refetch,
    vestingContract: data,
    loadingVestingContract: isFetching,
  };
};
