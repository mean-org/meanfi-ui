import type { MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import { PublicKey } from '@solana/web3.js';
import { useQuery } from '@tanstack/react-query';
import { useConnection } from 'src/contexts/connection';
import useMultisigClient from '../multisigClient';

export const getUseGetMultisigAccountsQueryKey = (accountAddress: string | undefined) => [
  'multisig-accounts',
  accountAddress,
];

export const useGetMultisigAccounts = (accountAddress: string | undefined) => {
  const connection = useConnection();
  const { multisigClient } = useMultisigClient();

  return useQuery({
    queryKey: getUseGetMultisigAccountsQueryKey(accountAddress),
    retry: 3,
    queryFn: async () => {
      if (!accountAddress || !multisigClient) return;
      const allInfo = await multisigClient.getMultisigs(new PublicKey(accountAddress));
      allInfo.sort(
        (a: MultisigInfo, b: MultisigInfo) => new Date(b.createdOnUtc).getTime() - new Date(a.createdOnUtc).getTime(),
      );

      return allInfo;
    },
    enabled: !!connection && !!accountAddress && !!multisigClient,
  });
};
