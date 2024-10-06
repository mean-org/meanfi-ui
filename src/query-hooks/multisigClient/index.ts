import { MeanMultisig } from '@mean-dao/mean-multisig-sdk';
import { PublicKey } from '@solana/web3.js';
import { useEffect, useMemo, useState } from 'react';
import { useConnection } from 'src/contexts/connection';
import { useWallet } from 'src/contexts/wallet';
import { appConfig } from 'src/main';
import { failsafeConnectionConfig } from 'src/services/connections-hq';

/**
 * Initializes a Mean Multisig client
 * @returns multisigClient
 */
const useMultisigClient = () => {
  const connection = useConnection();
  const { publicKey } = useWallet();
  const [lastUsedWallet, setLastUsedWallet] = useState<PublicKey>();
  const [multisigClient, setMultisigClient] = useState<MeanMultisig>();

  const multisigProgramAddressPK = useMemo(() => new PublicKey(appConfig.getConfig().multisigProgramAddress), []);

  useEffect(() => {
    if (!connection || !publicKey) return;

    if (!multisigProgramAddressPK || !failsafeConnectionConfig) {
      throw new Error('Missing client set params');
    }

    if (lastUsedWallet?.equals(publicKey)) return;

    setLastUsedWallet(publicKey);
    const client = new MeanMultisig(
      connection.rpcEndpoint,
      publicKey,
      failsafeConnectionConfig,
      multisigProgramAddressPK,
    );
    setMultisigClient(client);
  }, [publicKey, connection, multisigProgramAddressPK, lastUsedWallet]);

  return {
    multisigClient,
    multisigProgramAddressPK,
  };
};

export default useMultisigClient;
