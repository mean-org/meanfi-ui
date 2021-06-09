import { Connection, PublicKey, ConfirmedTransaction, TransactionInstruction } from "@solana/web3.js";
import { MEMO_PROGRAM_ID } from "./ids";

export class TransactionWithSignature {
    constructor(
        public signature: string,
        public confirmedTransaction: ConfirmedTransaction
    ) { }
}

export async function getTransactions(
    connection: Connection,
    address: PublicKey
): Promise<Array<TransactionWithSignature>> {
    const transSignatures = await connection.getConfirmedSignaturesForAddress2(address);

    const transactions = new Array<TransactionWithSignature>();
    for (let i = 0; i < transSignatures.length; i++) {
        const signature = transSignatures[i].signature;
        const confirmedTransaction = await connection.getConfirmedTransaction(
            signature
        );
        if (confirmedTransaction) {
            const transWithSignature = new TransactionWithSignature(
                signature,
                confirmedTransaction
            );
            transactions.push(transWithSignature);
        }
    }
    return transactions;
}

export function memoInstruction(memo: string) {
    return new TransactionInstruction({
        keys: [],
        data: Buffer.from(memo, 'utf-8'),
        programId: MEMO_PROGRAM_ID
    })
}
