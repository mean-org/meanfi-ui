import { Commitment, Connection } from '@solana/web3.js';
import { delay } from './ui';

const isBlockhashExpired = async (connection: Connection, lastValidBlockHeight: number) => {
  const currentBlockHeight = await connection.getBlockHeight('confirmed');

  return currentBlockHeight > lastValidBlockHeight - 150;
};

const confirmOrRetryTx = async (
  connection: Connection,
  txId: string,
  commitment: Commitment,
  lastValidHeight: number,
) => {
  let hashExpired = false;
  let txSuccess = false;
  while (!hashExpired && !txSuccess) {
    const { value: status } = await connection.getSignatureStatus(txId);

    // Break loop if transaction has succeeded
    if (status && (status.confirmationStatus === commitment || status.confirmationStatus === 'finalized')) {
      txSuccess = true;
      break;
    }

    hashExpired = await isBlockhashExpired(connection, lastValidHeight);

    // Break loop if blockhash has expired
    if (hashExpired) {
      // (add your own logic to Fetch a new blockhash and resend the transaction or throw an error)
      // For now is ok to break the loop and we return txSuccess = false
      break;
    }

    // Check again after 2.5 sec
    await delay(2500);
  }

  return txSuccess;
};

export default confirmOrRetryTx;
