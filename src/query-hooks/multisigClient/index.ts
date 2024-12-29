import { MeanMultisig } from '@mean-dao/mean-multisig-sdk';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { appConfig } from 'src/main';
import { failsafeConnectionConfig } from 'src/services/connections-hq';

export const getUseMultisigClientQueryKey = (accountAddress: string | undefined, programAddress: string) => [
  'multisig-client',
  accountAddress,
  programAddress,
];

/**
 * Initializes a Mean Multisig client
 * @returns multisigClient
 */
export const useMultisigClient = () => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const multisigAddressPK = useMemo(() => new PublicKey(appConfig.getConfig().multisigProgramAddress), []);

  return useQuery({
    queryKey: getUseMultisigClientQueryKey(publicKey?.toBase58(), multisigAddressPK.toBase58()),
    retry: 1,
    queryFn: () => {
      if (!connection || !publicKey) {
        throw new Error('Connection or public key is missing');
      }

      return new MeanMultisig(connection.rpcEndpoint, publicKey, failsafeConnectionConfig, multisigAddressPK);
    },
    enabled: !!connection && !!publicKey,
  });
};
