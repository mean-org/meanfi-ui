import {
    PublicKey,
    Connection,
    Transaction,
    SystemProgram,
    TransactionInstruction
} from "@solana/web3.js";
import { WalletAdapter } from "../contexts/wallet";

export class MoneyTransfer {

    public async sendMoney(
        connection: Connection,
        wallet: WalletAdapter,
        destPubkeyStr: string,
        lamports: number
    ) {
        if (!connection) {
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
                const destPubkey = new PublicKey(destPubkeyStr);

                // Sender account info
                const walletAccountInfo = await connection.getAccountInfo(wallet!.publicKey!);
                console.log("wallet data size", walletAccountInfo?.data.length);

                // Beneficiary account info
                const receiverAccountInfo = await connection.getAccountInfo(destPubkey);
                console.log("receiver data size", receiverAccountInfo?.data.length);

                // Prepare the transfer instruction
                const instruction = this.setTransferInstruction(senderPubkey, destPubkey, lamports);

                // Create transaction with transfer instruction
                let trans = await this.setWalletTransaction(connection, wallet, instruction);

                // Sign transaction
                let signedTrans = await this.signTransaction(connection, wallet, trans);
                let signature = await this.sendSignedTransaction(connection, signedTrans);
                let result = await connection.confirmTransaction(signature, "singleGossip");
                console.log("money sent", result);
                return result;
            } catch (e) {
                console.warn("Failed", e);
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
        connection: Connection,
        wallet: WalletAdapter,
        instruction: TransactionInstruction
    ): Promise<Transaction> {
        const transaction = new Transaction();
        transaction.add(instruction);
        transaction.feePayer = wallet!.publicKey!;
        let hash = await connection.getRecentBlockhash();
        console.log("blockhash", hash);
        transaction.recentBlockhash = hash.blockhash;
        return transaction;
    }
    
    public async signTransaction(
        connection: Connection,
        wallet: WalletAdapter,
        transaction: Transaction
    ): Promise<Transaction> {
        let signedTrans = await wallet.signTransaction(transaction);
        console.log("sign transaction");
        return signedTrans;
    }

    public async sendSignedTransaction(
        connection: Connection,
        signedTrans: Transaction
    ): Promise<string> {
        let signature = await connection.sendRawTransaction(signedTrans.serialize());
        console.log("send raw transaction");
        return signature;
    }
}
