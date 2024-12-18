import type { PublicKey } from '@solana/web3.js';
import { useQuery } from '@tanstack/react-query';
import { useConnection } from 'src/contexts/connection';
import useMultisigClient from '../multisigClient';
import { getMultisigVaults } from './getMultisigVaults';

export const getUseMultisigVaultsQueryKey = () => ['multisig-vaults'];

const useMultisigVaults = (multisigId: PublicKey | undefined) => {
  const connection = useConnection();
  const { multisigProgramAddressPK } = useMultisigClient();

  return useQuery({
    queryKey: getUseMultisigVaultsQueryKey(),
    queryFn: async () => {
      if (!connection || !multisigId || !multisigProgramAddressPK) {
        return;
      }

      return await getMultisigVaults(connection, multisigId, multisigProgramAddressPK);
    },
    enabled: !!connection && !!multisigId,
  });
};

export default useMultisigVaults;
