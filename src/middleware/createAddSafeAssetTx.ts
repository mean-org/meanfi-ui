import { MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import { AccountLayout, ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  Connection,
  Keypair,
  PublicKey,
  Signer,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { appConfig } from 'index';
import { TokenInfo } from 'models/SolanaTokenInfo';
import { DEFAULT_BUDGET_CONFIG, getComputeBudgetIx } from './transactions';
import { readLocalStorageKey } from './utils';

export type CreateSafeAssetTxParams = {
  token: TokenInfo | undefined;
};

export const createAddSafeAssetTx = async (
  connection?: Connection,
  publicKey?: PublicKey,
  selectedMultisig?: MultisigInfo,
  data?: CreateSafeAssetTxParams,
) => {
  if (!connection || !selectedMultisig || !publicKey || !data || !data.token) {
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

  if (!tokenAccountInfo) {
    ixs.push(
      Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        mintAddress,
        tokenAccount,
        multisigSigner,
        publicKey,
      ),
    );
  } else {
    const tokenKeypair = Keypair.generate();
    tokenAccount = tokenKeypair.publicKey;

    ixs.push(
      SystemProgram.createAccount({
        fromPubkey: publicKey,
        newAccountPubkey: tokenAccount,
        programId: TOKEN_PROGRAM_ID,
        lamports: await Token.getMinBalanceRentForExemptAccount(connection),
        space: AccountLayout.span,
      }),
      Token.createInitAccountInstruction(TOKEN_PROGRAM_ID, mintAddress, tokenAccount, multisigSigner),
    );

    signers.push(tokenKeypair);
  }

  const config = readLocalStorageKey('transactionPriority');
  const priorityFeesIx = getComputeBudgetIx(config ?? DEFAULT_BUDGET_CONFIG) ?? [];
  const tx = new Transaction().add(...priorityFeesIx, ...ixs);
  tx.feePayer = publicKey;
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;

  if (signers.length) {
    tx.partialSign(...signers);
  }

  return tx;
};
