import { MeanMultisig } from '@mean-dao/mean-multisig-sdk';
import { useWallet } from '@solana/wallet-adapter-react';
import { useQuery } from '@tanstack/react-query';
import { useConnection } from 'src/contexts/connection';
import { getMultisigProgramId } from 'src/middleware/multisig-helpers';
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
  const connection = useConnection();
  const { publicKey } = useWallet();

  return useQuery({
    queryKey: getUseMultisigClientQueryKey(publicKey?.toBase58(), getMultisigProgramId().toBase58()),
    retry: 1,
    queryFn: () => {
      if (!publicKey) {
        throw new Error('Wallet not connected');
      }

      return new MeanMultisig(connection.rpcEndpoint, publicKey, failsafeConnectionConfig, getMultisigProgramId());
    },
    enabled: !!publicKey,
  });
};
