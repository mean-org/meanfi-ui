import { PublicKey } from '@solana/web3.js';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useConnection } from 'src/contexts/connection';
import { appConfig } from 'src/main';
import { getMultisigVaults } from './getMultisigVaults';

export const getUseMultisigVaultsQueryKey = () => ['multisig-vaults'];

const useMultisigVaults = (multisigId: PublicKey | undefined) => {
  const connection = useConnection();
  const multisigAddressPK = useMemo(() => new PublicKey(appConfig.getConfig().multisigProgramAddress), []);

  return useQuery({
    queryKey: getUseMultisigVaultsQueryKey(),
    queryFn: async () => {
      if (!connection || !multisigId) {
        return;
      }

      return await getMultisigVaults(connection, multisigId, multisigAddressPK);
    },
    enabled: !!connection && !!multisigId,
  });
};

export default useMultisigVaults;
