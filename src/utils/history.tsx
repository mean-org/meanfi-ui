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
    additionalSignatures?: string[]

): Promise<HistoryUpdate> {

  try {

    let transactionMap: any;

    const fetched = await connection.getSignaturesForAddress(
      pubkey,
      options
    );

    let history = {
      fetched,
      foundOldest: fetched.length < options.limit,
    };

    if (fetchTransactions && history?.fetched) {
      const signatures = history.fetched
          .map((signature) => signature.signature)
          .concat(additionalSignatures || []);
          
      transactionMap = await fetchParsedTransactions(connection, signatures);
    }
  
    return {
      history,
      transactionMap,
      before: options?.before

    } as HistoryUpdate;

  } catch (error) {
    throw error;
  }
}

async function fetchParsedTransactions(
  connection: Connection,
  transactionSignatures: string[]
) {
const transactionMap =  Array<MappedTransaction>();

while (transactionSignatures.length > 0) {
  const signatures = transactionSignatures.splice(
    0,
    MAX_TRANSACTION_BATCH_SIZE
  );
  const fetched = await connection.getParsedConfirmedTransactions(signatures);
  fetched.forEach(
    (parsed: ParsedConfirmedTransaction | null, index: number) => {
      if (parsed !== null) {
        transactionMap.push({ signature: signatures[index], parsedTransaction: parsed });
      }
    }
  );
}

return transactionMap;
}

