import {
  PublicKey,
  ConfirmedSignatureInfo,
  TransactionSignature,
  Connection,
  ParsedTransactionWithMeta,
} from '@solana/web3.js';

const MAX_TRANSACTION_BATCH_SIZE = 4;

export class MappedTransaction {
  signature!: string;
  parsedTransaction!: ParsedTransactionWithMeta;
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
  additionalSignatures?: Array<string> | undefined,
): Promise<HistoryUpdate> {
  try {
    let transactionMap: MappedTransaction[] = [];

    const fetched = await connection.getConfirmedSignaturesForAddress2(
      pubkey,
      options,
      'confirmed',
    );

    const history = {
      fetched,
      foundOldest: fetched.length < options.limit,
    };

    if (fetchTransactions && history && history.fetched) {
      const signatures = history.fetched
        .map(signature => signature.signature)
        .concat(additionalSignatures || []);
      transactionMap = await fetchParsedTransactionsAsync(
        connection,
        signatures,
      );
    }

    return {
      history,
      transactionMap,
      before: options?.before,
    } as HistoryUpdate;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export const fetchParsedTransactionsAsync = async (
  connection: Connection,
  signatures: Array<string>,
): Promise<MappedTransaction[]> => {
  const txMap: MappedTransaction[] = [];

  try {
    while (signatures.length > 0) {
      const txSignatures = signatures.splice(0, MAX_TRANSACTION_BATCH_SIZE);

      const fetched = await connection.getParsedTransactions(txSignatures);
      const result = (
        fetched.map(tx => {
          return {
            signature: tx?.transaction.signatures[0],
            parsedTransaction: tx,
          };
        }) as MappedTransaction[]
      ).filter(tx => tx !== undefined);

      txMap.push(...result);
    }
  } catch (_error) {
    console.error(_error);
  }

  return txMap;
};
