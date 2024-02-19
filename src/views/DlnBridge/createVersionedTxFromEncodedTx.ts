import { Connection, VersionedTransaction } from '@solana/web3.js';
import { serializeTx } from 'middleware/transactions';

const createVersionedTxFromEncodedTx = async (connection: Connection, txData: string) => {
  if (!txData) return null;

  const transaction = VersionedTransaction.deserialize(Buffer.from(txData.slice(2), 'hex'));
  serializeTx(transaction);
  const blockhash = await connection.getLatestBlockhash('confirmed').then(res => res.blockhash);
  transaction.message.recentBlockhash = blockhash; // Update blockhash!

  return transaction;
};

export default createVersionedTxFromEncodedTx;
