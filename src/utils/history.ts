import {
  PublicKey,
  ConfirmedSignatureInfo,
  TransactionSignature,
  Connection,
  ParsedConfirmedTransaction

} from "@solana/web3.js";

const MAX_TRANSACTION_BATCH_SIZE = 10;
 
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
      "finalized"
    );

    let history = {
      fetched,
      foundOldest: fetched.length < options.limit,
    };

    if (fetchTransactions && history && history.fetched) {
      let signatures = history.fetched
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

  let txMap: MappedTransaction[] = [];
  
  try {

    let txSignatures = signatures.splice(
      0,
      MAX_TRANSACTION_BATCH_SIZE
    );

    let promises: Promise<ParsedConfirmedTransaction | null>[] = [];

    txSignatures.forEach(sig => {
      promises.push(
        connection.getParsedConfirmedTransaction(sig)
      )
    });
  
    const fetched = await Promise.all(promises);
  
    let result = (fetched.map(tx => {
      return { 
        signature: tx?.transaction.signatures[0], 
        parsedTransaction: tx 
      }
    }) as MappedTransaction[]).filter(tx => tx !== undefined);
  
    txMap.push(...result);
  
    if (signatures.length === 0) {
      return txMap as MappedTransaction[];
    }
  
    result = (await fetchParsedTransactionsAsync(
      connection,
      signatures
    ) as MappedTransaction[]).filter(tx => tx !== undefined);
  
    txMap.push(...result);

  } catch (_error) {
    console.log(_error);
  }

  return txMap;
}

// async function fetchParsedTransactions(
//   connection: Connection,
//   transactionSignatures: string[]
// ) {
// const transactionMap =  Array<MappedTransaction>();

// while (transactionSignatures.length > 0) {
//   const signatures = transactionSignatures.splice(
//     0,
//     MAX_TRANSACTION_BATCH_SIZE
//   );
//   const fetched = await connection.getParsedConfirmedTransactions(signatures);
//   fetched.forEach(
//     (parsed: ParsedConfirmedTransaction | null, index: number) => {
//       if (parsed !== null) {
//         transactionMap.push({ signature: signatures[index], parsedTransaction: parsed });
//       }
//     }
//   );
// }

// return transactionMap;
// }

