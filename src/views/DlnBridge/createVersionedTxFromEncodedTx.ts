import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";

const createVersionedTxFromEncodedTx = async (connection: Connection, feePayer: PublicKey, txData: string) => {
  const transaction = VersionedTransaction.deserialize(Buffer.from(txData.slice(2), "hex"));
  const blockhash = await connection.getLatestBlockhash('confirmed').then(res => res.blockhash);
  transaction.message.recentBlockhash = blockhash; // Update blockhash!

  return transaction;
}

export default createVersionedTxFromEncodedTx