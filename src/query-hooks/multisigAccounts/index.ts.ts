import { type MultisigInfo, MultisigTransactionStatus } from '@mean-dao/mean-multisig-sdk';
import { PublicKey } from '@solana/web3.js';
import { useQuery } from '@tanstack/react-query';
import { consoleOut } from 'src/middleware/ui';
import { useMultisigClient } from '../multisigClient';

export const getUseGetMultisigAccountsQueryKey = (accountAddress: string | undefined) => [
  'multisig-accounts',
  accountAddress,
];

// export const useGetMultisigAccounts2 = (accountAddress: string | undefined) => {
//   const { connection } = useConnection();
//   const { data: multisigClient } = useMultisigClient();

//   return useQuery({
//     queryKey: getUseGetMultisigAccountsQueryKey(accountAddress),
//     retry: 3,
//     queryFn: async () => {
//       if (!accountAddress || !multisigClient) return;
//       const allInfo = await multisigClient.getMultisigs(new PublicKey(accountAddress));
//       allInfo.sort(
//         (a: MultisigInfo, b: MultisigInfo) => new Date(b.createdOnUtc).getTime() - new Date(a.createdOnUtc).getTime(),
//       );

//       return allInfo;
//     },
//     enabled: !!connection && !!accountAddress && !!multisigClient,
//   });
// };

export const useGetMultisigAccounts = (accountAddress: string | undefined) => {
  const { data: multisigClient } = useMultisigClient();

  return useQuery({
    queryKey: getUseGetMultisigAccountsQueryKey(accountAddress),
    retry: 3,
    queryFn: async () => {
      if (!accountAddress) {
        consoleOut('No account address found!', 'Query not enabled!', 'crimson');
        return;
      }
      if (!multisigClient) {
        consoleOut('No multisig client found!', 'Query not enabled!', 'crimson');
        return;
      }
      const allInfo = await multisigClient.getMultisigs(new PublicKey(accountAddress));
      allInfo.sort(
        (a: MultisigInfo, b: MultisigInfo) => new Date(b.createdOnUtc).getTime() - new Date(a.createdOnUtc).getTime(),
      );

      const multisigWithPendingTxs = allInfo.filter(x => x.pendingTxsAmount > 0);
      if (!multisigWithPendingTxs || multisigWithPendingTxs.length === 0) {
        consoleOut('No safes found with pending Txs to work on!', 'moving on...', 'crimson');
        return allInfo;
      }

      consoleOut('Searching for pending Txs across multisigs...', '', 'crimson');
      const multisigAccountsCopy = [...allInfo];
      const multisigPendingStatus = [
        MultisigTransactionStatus.Active,
        MultisigTransactionStatus.Queued,
        MultisigTransactionStatus.Passed,
      ];
      let anythingChanged = false;
      for await (const multisig of multisigWithPendingTxs) {
        const multisigTransactions = await multisigClient.getMultisigTransactions(
          multisig.id,
          new PublicKey(accountAddress),
        );
        const realPendingTxsAmount = multisigTransactions.filter(tx =>
          multisigPendingStatus.includes(tx.status),
        ).length;
        const itemIndex = multisigAccountsCopy.findIndex(x => x.id.equals(multisig.id));
        if (itemIndex > -1) {
          multisigAccountsCopy[itemIndex].pendingTxsAmount = realPendingTxsAmount;
          anythingChanged = true;
        }
      }
      consoleOut('Pending Txs search completed!', '', 'crimson');

      if (anythingChanged) {
        return multisigAccountsCopy;
      }

      return allInfo;
    },
    enabled: !!accountAddress && !!multisigClient,
  });
};
