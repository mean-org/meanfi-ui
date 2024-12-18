import { useQuery } from '@tanstack/react-query';
import { useConnection } from 'src/contexts/connection';
import { useWallet } from 'src/contexts/wallet';
import { useWalletAccount } from 'src/contexts/walletAccount';
import { getProgramsByUpgradeAuthority } from 'src/middleware/getProgramsByUpgradeAuthority';

export const getAccountProgramsQueryKey = (accountAddress: string) => ['programs', accountAddress];

const useGetAccountPrograms = () => {
  const connection = useConnection();
  const { publicKey } = useWallet();
  const { selectedAccount } = useWalletAccount();

  const { data, isFetching: loadingPrograms } = useQuery({
    queryKey: getAccountProgramsQueryKey(selectedAccount.address),
    queryFn: () => getProgramsByUpgradeAuthority(connection, selectedAccount.address),
    enabled: !!publicKey && !!selectedAccount.address,
    retry: false,
  });

  return {
    programs: data ?? [],
    loadingPrograms,
  };
};

export default useGetAccountPrograms;
