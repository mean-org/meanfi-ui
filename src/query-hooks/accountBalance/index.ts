import { PublicKey } from '@solana/web3.js';
import { useQuery } from '@tanstack/react-query';
import { useConnection } from 'src/contexts/connection';

export const getUseGetAccountBalanceQueryKey = (accountAddress: PublicKey | string | undefined) => [
  'account-balance',
  accountAddress?.toString(),
];

export const useGetAccountBalance = (accountAddress: PublicKey | string | undefined) => {
  const connection = useConnection();
  return useQuery({
    queryKey: getUseGetAccountBalanceQueryKey(accountAddress),
    queryFn: () => {
      if (!accountAddress) return;
      return connection.getBalance(new PublicKey(accountAddress));
    },
    enabled: !!accountAddress,
    retry: false,
  });
};
