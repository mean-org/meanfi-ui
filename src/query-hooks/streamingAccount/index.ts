import type { MoneyStreaming } from '@mean-dao/money-streaming';
import type { Category, PaymentStreaming } from '@mean-dao/payment-streaming';
import type { PublicKey } from '@solana/web3.js';
import { useQuery } from '@tanstack/react-query';
import { useEnableFetchingOldStreams } from '../enableFetchingOldStreams';
import getStreamingAccountList from './getStreamingAccountList';

const getStreamingAccountListQueryKey = (accountAddress?: string) => ['streaming-accounts', accountAddress];

export const useGetStreamingAccounts = ({
  srcAccountPk,
  tokenStreamingV1,
  tokenStreamingV2,
  category,
  isMultisigContext,
}: {
  srcAccountPk: PublicKey | undefined;
  tokenStreamingV1: MoneyStreaming | undefined;
  tokenStreamingV2: PaymentStreaming | undefined;
  category?: Category;
  isMultisigContext?: boolean;
}) => {
  const shouldLoadV1Accounts = useEnableFetchingOldStreams();

  return useQuery({
    queryKey: getStreamingAccountListQueryKey(srcAccountPk?.toBase58()),
    queryFn: () =>
      getStreamingAccountList({
        srcAccountPk,
        tokenStreamingV1,
        tokenStreamingV2,
        category,
        isMultisigContext,
        shouldLoadV1Accounts,
      }),
    enabled: !!(srcAccountPk && tokenStreamingV1 && tokenStreamingV2),
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
};
