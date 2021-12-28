import { base64 } from "@project-serum/anchor/dist/cjs/utils/bytes";
import { Connection, PublicKey, ConfirmedTransaction, TransactionSignature, Transaction } from "@solana/web3.js";
import { TransactionStatus } from "../models/enums";
import { Confirmations, Timestamp } from "../models/transactions";

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

export async function fetchTransactionStatus(
    connection: Connection,
    signature: TransactionSignature
) {
    let data;
    try {
        const { value } = await connection.getSignatureStatus(signature, { searchTransactionHistory: true });

        let info = null;
        if (value !== null) {
            let confirmations: Confirmations;
            if (typeof value.confirmations === "number") {
                confirmations = value.confirmations;
            } else {
                confirmations = "max";
            }
            let blockTime = null;
            try {
                blockTime = await connection.getBlockTime(value.slot);
            } catch (error) {
                throw new Error(`${error}`);
            }
            let timestamp: Timestamp = blockTime !== null ? blockTime : "unavailable";

            info = {
                slot: value.slot,
                timestamp,
                confirmations,
                confirmationStatus: value.confirmationStatus,
                err: value.err,
            };
        }
        data = { signature, info };
        return data;
    } catch (error) {
        throw (error);
    }
}

export const isSuccess = (operation: TransactionStatus | undefined): boolean => {
    return operation === TransactionStatus.TransactionFinished;
}

export const isError = (operation: TransactionStatus | undefined): boolean => {
    return operation === TransactionStatus.TransactionStartFailure ||
        operation === TransactionStatus.InitTransactionFailure ||
        operation === TransactionStatus.SignTransactionFailure ||
        operation === TransactionStatus.SendTransactionFailure ||
        operation === TransactionStatus.ConfirmTransactionFailure
        ? true
        : false;
}

export const updateCreateStream2Tx = async (
    beneficiary: PublicKey, 
    createStream2Tx: Transaction,
    claimType: number

) => {

    const url = `https://tempo-api.meanops.com/whitelist/${beneficiary}`;
    const tempoHeaders = new Headers();
    tempoHeaders.append('content-type', 'application/json;charset=UTF-8');
    tempoHeaders.append('X-Api-Version', '1.0');
    const encodedTx = createStream2Tx.serialize({ requireAllSignatures: false, verifySignatures: false });

    const sendCreateStream2UpdateReq = async (): Promise<string> => {

        const options: RequestInit = {
            method: "POST",
            headers: tempoHeaders,
            body: JSON.stringify({ 
                base64ClaimTransaction: encodedTx.toString('base64'), 
                claimType: claimType 
            }),
        }
        
        try {
            const response = await fetch(url, options)
            if (response.status !== 200) {
                throw new Error("Unable to update create stream tx");
            }
            const updateCreateStream2TxResponse = (await response.json()) as any;
            return updateCreateStream2TxResponse.base64ClaimTransaction;

        } catch (error) {
            throw (error);
        }
    };

    const createStream2TxSignedResp = await sendCreateStream2UpdateReq();
    const createStreamTxUpdatedBytes = base64.decode(createStream2TxSignedResp);
    const createStreamTxUpdated = Transaction.from(createStreamTxUpdatedBytes);

    return createStreamTxUpdated;
}
