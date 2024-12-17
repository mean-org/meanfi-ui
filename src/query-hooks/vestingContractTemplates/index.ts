import type { PaymentStreaming, PaymentStreamingAccount } from '@mean-dao/payment-streaming';
import type { PublicKey } from '@solana/web3.js';
import { useQuery } from '@tanstack/react-query';
import getStreamTemplates from './getStreamTemplates';

const getStreamTemplatesQueryKey = (accountAddress?: string) => [
  `/vesting-contracts/${accountAddress}/stream-templates`,
];

export const useGetStreamTemplates = ({
  srcAccountPk,
  tokenStreamingV2,
  vestingContracts,
}: {
  srcAccountPk: PublicKey | undefined;
  tokenStreamingV2: PaymentStreaming | undefined;
  vestingContracts: PaymentStreamingAccount[] | undefined;
}) => {
  const { data, isFetching, refetch } = useQuery({
    queryKey: getStreamTemplatesQueryKey(srcAccountPk?.toBase58()),
    queryFn: () =>
      getStreamTemplates({
        tokenStreamingV2,
        vestingContracts,
      }),
    enabled: !!(srcAccountPk && tokenStreamingV2),
  });

  return {
    refetch,
    vcTemplates: data ?? {},
    loadingTemplates: isFetching,
  };
};
