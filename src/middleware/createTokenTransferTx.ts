import type { TransferTransactionAccounts } from '@mean-dao/payment-streaming';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, Token, u64 } from '@solana/spl-token';
import {
  type Connection,
  Keypair,
  type PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from '@solana/web3.js';
import { SOL_MINT } from './ids';

export interface TransactionWithPreinstructions {
  tx: Transaction
  preInstructions: TransactionInstruction[]
}

const createTokenTransferTx = async (
  connection: Connection,
  selectedToken: PublicKey,
  { sender, feePayer, beneficiary, mint }: TransferTransactionAccounts,
  amount: string | number, // Allow both types for compatibility
): Promise<TransactionWithPreinstructions> => {
  let transferIx: TransactionInstruction;
  const preIxs: TransactionInstruction[] = [];
  const txFeePayer = feePayer || sender;

  if (mint.equals(SOL_MINT)) {
    transferIx = SystemProgram.transfer({
      fromPubkey: sender,
      toPubkey: beneficiary,
      lamports: BigInt(amount),
    });
  } else {
    // Create a Token program client
    const tokenClient: Token = new Token(connection, mint, TOKEN_PROGRAM_ID, Keypair.generate());

    try {
      const selectedTokenAccountInfo = await tokenClient.getAccountInfo(selectedToken);
      console.info('selectedTokenAccountInfo:', selectedTokenAccountInfo);
      if (!selectedTokenAccountInfo) throw Error('Sender is not a token account');
    } catch (error) {
      throw Error('Sender is not a token account');
    }

    const senderToken = selectedToken;
    let beneficiaryToken = beneficiary;
    const beneficiaryAccountInfo = await connection.getAccountInfo(beneficiary);

    if (!beneficiaryAccountInfo || !beneficiaryAccountInfo.owner.equals(TOKEN_PROGRAM_ID)) {
      beneficiaryToken = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        mint,
        beneficiary,
        true,
      );

      const beneficiaryTokenAccountInfo = await connection.getAccountInfo(beneficiaryToken);

      if (!beneficiaryTokenAccountInfo) {
        preIxs.push(
          Token.createAssociatedTokenAccountInstruction(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            mint,
            beneficiaryToken,
            beneficiary,
            sender,
          ),
        );
      }
    } else {
      // At this point the beneficiaryToken is either a mint or a token account
      // Let's make sure it is a token account of the passed mint
      try {
        const beneficiaryTokenInfo = await tokenClient.getAccountInfo(beneficiaryToken);
        if (!beneficiaryTokenInfo) throw Error('Reciever is not a token account');
      } catch (error) {
        throw Error('Reciever is not a token account');
      }
    }

    transferIx = Token.createTransferInstruction(TOKEN_PROGRAM_ID, senderToken, beneficiaryToken, sender, [], new u64(amount))
  }

  const transaction = new Transaction().add(transferIx);
  transaction.feePayer = txFeePayer;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;

  return { tx: transaction, preInstructions: preIxs} as TransactionWithPreinstructions;
};

export default createTokenTransferTx;
