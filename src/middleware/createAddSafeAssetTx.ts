import type { MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import { ASSOCIATED_TOKEN_PROGRAM_ID, AccountLayout, TOKEN_PROGRAM_ID, Token } from '@solana/spl-token';
import {
  type Connection,
  Keypair,
  PublicKey,
  type Signer,
  SystemProgram,
  type TransactionInstruction,
} from '@solana/web3.js';
import { appConfig } from 'main';
import type { TokenInfo } from 'models/SolanaTokenInfo';
import { composeTxWithPrioritizationFees, serializeTx } from './transactions';

export type CreateSafeAssetTxParams = {
  token: TokenInfo | undefined;
};

export const createAddSafeAssetTx = async (
  connection: Connection,
  feePayer: PublicKey,
  selectedMultisig: MultisigInfo | undefined,
  data: CreateSafeAssetTxParams,
  createAta = true,
) => {
  if (!selectedMultisig || !data.token) {
    return null;
  }

  const multisigAddressPK = new PublicKey(appConfig.getConfig().multisigProgramAddress);

  const [multisigSigner] = PublicKey.findProgramAddressSync([selectedMultisig.id.toBuffer()], multisigAddressPK);

  const mintAddress = new PublicKey(data.token.address);

  const signers: Signer[] = [];
  const ixs: TransactionInstruction[] = [];

  let tokenAccount = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    mintAddress,
    multisigSigner,
    true,
  );

  const tokenAccountInfo = await connection.getAccountInfo(tokenAccount);

  if (!tokenAccountInfo && createAta) {
    ixs.push(
      Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        mintAddress,
        tokenAccount,
        multisigSigner,
        feePayer,
      ),
    );
  } else {
    const tokenKeypair = Keypair.generate();
    tokenAccount = tokenKeypair.publicKey;

    ixs.push(
      SystemProgram.createAccount({
        fromPubkey: feePayer,
        newAccountPubkey: tokenAccount,
        programId: TOKEN_PROGRAM_ID,
        lamports: await Token.getMinBalanceRentForExemptAccount(connection),
        space: AccountLayout.span,
      }),
      Token.createInitAccountInstruction(TOKEN_PROGRAM_ID, mintAddress, tokenAccount, multisigSigner),
    );

    signers.push(tokenKeypair);
  }

  const transaction = await composeTxWithPrioritizationFees(connection, feePayer, ixs, signers);

  serializeTx(transaction);

  return transaction;
};
