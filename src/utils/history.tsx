import React from "react";
import {
  PublicKey,
  ConfirmedSignatureInfo,
  TransactionSignature,
  Connection,
  ParsedConfirmedTransaction,
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

// type State = Cache.State<AccountHistory>;

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

  let history;
  try {
    const fetched = await connection.getConfirmedSignaturesForAddress2(
      pubkey,
      options
    );
    history = {
      fetched,
      foundOldest: fetched.length < options.limit,
    };
  } catch (error) {
    console.error(error);
  }

  let transactionMap;
  if (fetchTransactions && history?.fetched) {
    try {
      const signatures = history.fetched
        .map((signature) => signature.signature)
        .concat(additionalSignatures || []);
      transactionMap = await fetchParsedTransactions(connection, signatures);
    } catch (error) {
        console.error(error);
    }
  }

  return {
    history,
    transactionMap,
    before: options?.before,
  } as HistoryUpdate;
}

/*
function getUnfetchedSignatures(before: Cache.CacheEntry<AccountHistory>) {
  if (!before.data?.transactionMap) {
    return [];
  }

  const existingMap = before.data.transactionMap;
  const allSignatures = before.data.fetched.map(
    (signatureInfo: any) => signatureInfo.signature
  );
  return allSignatures.filter((signature: any) => !existingMap.has(signature));
}
*/

/*
function getConditionally(
    connection: Connection,
    pubkey: PublicKey,
    fetchTransactions?: boolean,
    refresh?: boolean
) {
      const before = state.entries[pubkey.toBase58()];
      if (!refresh && before?.data?.fetched && before.data.fetched.length > 0) {
        if (before.data.foundOldest) return;

        let additionalSignatures: string[] = [];
        if (fetchTransactions) {
          additionalSignatures = getUnfetchedSignatures(before);
        }

        const oldest = before.data.fetched[before.data.fetched.length - 1].signature;
        fetchAccountHistory(
            connection,
            pubkey,
            {
                before: oldest,
                limit: 25,
            },
            fetchTransactions,
            additionalSignatures
        );
      } else {
        fetchAccountHistory(
            connection,
            pubkey,
            { limit: 25 },
            fetchTransactions
        );
      }
}
*/
