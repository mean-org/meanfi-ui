import { MoneyStreaming } from '@mean-dao/money-streaming';
import { PaymentStreaming } from '@mean-dao/payment-streaming';
import { PublicKey } from '@solana/web3.js';
import { useConnection } from 'contexts/connection';
import { appConfig } from 'main';
import { useMemo } from 'react';
import { failsafeConnectionConfig } from 'services/connections-hq';

/**
 * Initializes both Token Streaming clients, V1 and V2
 * @returns V1 and V2 Token Streaming clients
 */
const useStreamingClient = () => {
  const connection = useConnection();

  const streamProgramAddress = useMemo(() => appConfig.getConfig().streamProgramAddress, []);
  const streamV2ProgramAddress = useMemo(() => appConfig.getConfig().streamV2ProgramAddress, []);

  // Use a fallback RPC for Money Streaming Program (v1) instance
  const tokenStreamingV1 = useMemo(
    () => new MoneyStreaming(connection.rpcEndpoint, streamProgramAddress, failsafeConnectionConfig),
    [connection.rpcEndpoint, streamProgramAddress],
  );

  const tokenStreamingV2 = useMemo(() => {
    return new PaymentStreaming(connection, new PublicKey(streamV2ProgramAddress), connection.commitment);
  }, [connection, streamV2ProgramAddress]);

  return {
    tokenStreamingV1,
    tokenStreamingV2,
    streamProgramAddress,
    streamV2ProgramAddress,
  };
};

export default useStreamingClient;
