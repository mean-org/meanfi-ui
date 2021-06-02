import {
    PublicKey,
    Connection,
    Transaction,
    SystemProgram,
    TransactionInstruction
} from "@solana/web3.js";
import { WalletAdapter } from "../contexts/wallet";

export class MoneyTransfer {

    private connection: Connection;

    constructor(public currentCluster: string) {
        this.connection = new Connection(currentCluster, "confirmed");
    }

    /**
     * Sends a money transfer in lamports from the connected wallet account
     * to the given beneficiary account by its address creating a transaction
     * on the given connection.
     * @param {WalletAdapter} wallet  The user connected wallet adapter
     * @param {string} beneficiaryAddress  The address of the beneficiary
     * @param {number} lamports The amount of money in lamports to transfer
     * @returns {Promise<any>}
     */
    public async sendMoney(
        wallet: WalletAdapter | undefined,
        beneficiaryAddress: string,
        lamports: number,
    ): Promise<any> {
        if (!this.connection) {
            throw new Error("No valid connection");
        } else if (!wallet || !wallet.publicKey) {
            throw new Error("No wallet adapter supplied or wallet not connected");
        } else if (!lamports) {
            throw new Error("No lamports to send");
        } else {
            // Try sending
            try {
                console.log("starting sendMoney");
                // Set sender and beneficiary keys
                const senderPubkey = wallet.publicKey;
                const destPubkey = new PublicKey(beneficiaryAddress);

                // Prepare the transfer instruction
                const instruction = this.setTransferInstruction(senderPubkey, destPubkey, lamports);

                // Create transaction with transfer instruction
                let trans = await this.setWalletTransaction(wallet, instruction);

                // Sign transaction
                let signedTrans = await this.signTransaction(wallet, trans);
                let signature = await this.sendSignedTransaction(signedTrans);
                let result = await this.connection.confirmTransaction(signature, "singleGossip");
                console.log("money sent", result);
                return result;
            } catch (error) {
                console.warn("Failed", error);
                throw error;
            }
        }
    }

    public setTransferInstruction(
        senderPubkey: PublicKey,
        destPubkey: PublicKey,
        lamports: number
    ): TransactionInstruction {
        return SystemProgram.transfer({
            fromPubkey: senderPubkey,
            toPubkey: destPubkey,
            lamports,
        });
    }

    public async setWalletTransaction(
        wallet: WalletAdapter,
        instruction: TransactionInstruction
    ): Promise<Transaction> {
        try {
            const transaction = new Transaction();
            transaction.add(instruction);
            transaction.feePayer = wallet!.publicKey!;
            let hash = await this.connection.getRecentBlockhash('confirmed');
            console.log("blockhash", hash);
            transaction.recentBlockhash = hash.blockhash;
            return transaction;
        } catch (error) {
            throw error;
        }
    }

    public async signTransaction(
        wallet: WalletAdapter,
        transaction: Transaction
    ): Promise<Transaction> {
        try {
            let signedTrans = await wallet.signTransaction(transaction);
            console.log("sign transaction");
            return signedTrans;
        } catch (error) {
            throw error;
        }
    }

    public async sendSignedTransaction(signedTrans: Transaction): Promise<string> {
        try {
            let signature = await this.connection.sendRawTransaction(signedTrans.serialize());
            console.log("send raw transaction");
            return signature;
        } catch (error) {
            throw error;
        }
    }
}
