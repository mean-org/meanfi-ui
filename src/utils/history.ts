import {
  PublicKey,
  ConfirmedSignatureInfo,
  TransactionSignature,
  Connection,
  ParsedConfirmedTransaction

} from "@solana/web3.js";

import { isProd } from "./ui";

const MAX_TRANSACTION_BATCH_SIZE = 4;
 
export class MappedTransaction {
  signature!: string;
  parsedTransaction!: ParsedConfirmedTransaction;
}

export type AccountHistory = {
  fetched: ConfirmedSignatureInfo[];
  transactionMap?: MappedTransaction[];
  foundOldest: boolean;
};

export type HistoryUpdate = {
  history?: AccountHistory;
  transactionMap?: MappedTransaction[];
  before?: TransactionSignature;
};

export async function fetchAccountHistory(
    connection: Connection,
    pubkey: PublicKey,
    options: {
        before?: TransactionSignature;
        limit: number;
    },
    fetchTransactions?: boolean,
    additionalSignatures?: Array<string> | undefined

): Promise<HistoryUpdate> {

  try {

    let transactionMap: MappedTransaction[] = [];

    const fetched = await connection.getConfirmedSignaturesForAddress2(
      pubkey,
      options,
      "confirmed"
    );

    const history = {
      fetched,
      foundOldest: fetched.length < options.limit,
    };

    if (fetchTransactions && history && history.fetched) {
      const signatures = history.fetched
        .map((signature) => signature.signature)
        .concat(additionalSignatures || []);
      transactionMap = await fetchParsedTransactionsAsync(connection, signatures);
    }
  
    return {
      history,
      transactionMap,
      before: options?.before

    } as HistoryUpdate;

  } catch (error) {
    console.log(error);
    throw error;
  }
}

export const fetchParsedTransactionsAsync = async (
  connection: Connection,
  signatures: Array<string>

): Promise<MappedTransaction[]> => {

  const txMap: MappedTransaction[] = [];
  
  try {

    while (signatures.length > 0) {

      const txSignatures = signatures.splice(
        0,
        MAX_TRANSACTION_BATCH_SIZE
      );

      // let result: MappedTransaction[] = [];
      const fetched = await connection.getParsedConfirmedTransactions(txSignatures);
      const result = (fetched.map(tx => {
        return { 
          signature: tx?.transaction.signatures[0], 
          parsedTransaction: tx 
        }
      }) as MappedTransaction[]).filter(tx => tx !== undefined);

      // if (!isProd()) {
      //   // This loop will fetch one parsed Tx after another to avoid multiple parallel requests
      //   // The performance is low but will never run into "Too Many Requests" issues
      //   for await (const sig of txSignatures) {
      //     const parsedTx = await connection.getParsedConfirmedTransaction(sig);
      //     if (parsedTx) {
      //       result.push({
      //         signature: parsedTx?.transaction.signatures[0],
      //         parsedTransaction: parsedTx
      //       });
      //     }
      //   }
      // } else {
      //   // This loop will will batch-fetch a group of parsed Txs at once given by MAX_TRANSACTION_BATCH_SIZE
      //   // The larger the chunk, the better the performance but increases risk of "Too Many Requests" issues
      //   let promises: Promise<ParsedConfirmedTransaction | null>[] = [];
      //   txSignatures.forEach(sig => {
      //     promises.push(
      //       connection.getParsedConfirmedTransaction(sig)
      //     )
      //   });
      //   const fetched = await Promise.all(promises);
      //   result = (fetched.map(tx => {
      //     return { 
      //       signature: tx?.transaction.signatures[0], 
      //       parsedTransaction: tx 
      //     }
      //   }) as MappedTransaction[]).filter(tx => tx !== undefined);
      // }

      txMap.push(...result);
    }

  } catch (_error) {
    console.log(_error);
  }

  return txMap;
}
