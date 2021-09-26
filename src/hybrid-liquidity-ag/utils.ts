import { AmmPoolInfo, Client, MERCURIAL, ORCA, RAYDIUM, SABER, SERUM } from "./types";
import { AMM_POOLS } from "./data";
import { WRAPPED_SOL_MINT } from "../utils/ids";
import { Connection, Keypair, PublicKey, Signer, SystemProgram, Transaction } from "@solana/web3.js";
import { RaydiumClient } from "./raydium/client";
import { OrcaClient } from "../hybrid-liquidity-ag/orca/client";
import { SerumClient } from "./serum/client";
import { AccountLayout, ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { SaberClient } from "./saber/client";
import { MercurialClient } from "./mercurial/client";
import BN from "bn.js";

export const getClient = (
  connection: Connection,
  protocolAddress: string

): Client => {

  let client: any = undefined;

  switch (protocolAddress) {
    case RAYDIUM.toBase58(): {
      client = new RaydiumClient(connection);
      break;
    }
    case ORCA.toBase58(): {
      client = new OrcaClient(connection);
      break;
    }
    case SABER.toBase58(): {
      client = new SaberClient(connection);
      break;
    }
    case MERCURIAL.toBase58(): {
      client = new MercurialClient(connection);
      break;
    }
    case SERUM.toBase58(): {
      client = new SerumClient(connection);
      break;
    }
    default: { break; }
  }

  return client;
}

export const getTokensPools = (
  from: string,
  to: string,
  protocolAddres?: string

): AmmPoolInfo[] => {

  return AMM_POOLS.filter((ammPool) => {

    let fromMint = from;
    let toMint = to;

    let include = (
      ammPool.tokenAddresses.includes(fromMint) &&
      ammPool.tokenAddresses.includes(toMint)
    );

    if (protocolAddres !== undefined) {
      include = ammPool.protocolAddress === protocolAddres;
    }

    return include;
  });
}

export const getOptimalPool = (
  pools: AmmPoolInfo[]

): AmmPoolInfo => {

  if (pools.length === 1) {
    return pools[0];
  }

  //TODO: implement get the best pool

  return pools[0];
}

export const getExchangeInfo = async (
  client: Client,
  from: string,
  to: string, 
  amount: number,
  slippage: number

) => {

  return client.getExchangeInfo(
    from,
    to,
    amount,
    slippage
  );
}

export const wrap = async (
  connection: Connection,
  wallet: any,
  account: Keypair,
  amount: BN,
  feeAccount: PublicKey,
  fee: BN

): Promise<Transaction> => {

  const signers: Signer[] = [account];
  const minimumWrappedAccountBalance = await Token.getMinBalanceRentForExemptAccount(connection);
  
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: account.publicKey,
      lamports: minimumWrappedAccountBalance + amount.toNumber(),
      space: AccountLayout.span,
      programId: TOKEN_PROGRAM_ID,
    }),
    Token.createInitAccountInstruction(
      TOKEN_PROGRAM_ID,
      WRAPPED_SOL_MINT,
      account.publicKey,
      wallet.publicKey
    )
  );

  const aTokenKey = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    WRAPPED_SOL_MINT,
    wallet.publicKey,
    true
  );

  const aTokenInfo = await connection.getAccountInfo(aTokenKey);
  
  if (!aTokenInfo) {
    tx.add(
      Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        WRAPPED_SOL_MINT,
        aTokenKey,
        wallet.publicKey,
        wallet.publicKey
      )
    );
  }

  tx.add(
    Token.createTransferInstruction(
      TOKEN_PROGRAM_ID,
      account.publicKey,
      aTokenKey,
      wallet.publicKey,
      [],
      amount.toNumber()
    )
  );

  const feeAccountToken = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    WRAPPED_SOL_MINT,
    feeAccount,
    true
  );

  const feeAccountTokenInfo = await connection.getAccountInfo(feeAccountToken);

  if (!feeAccountTokenInfo) {
    tx.add(
      Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        WRAPPED_SOL_MINT,
        feeAccountToken,
        wallet.publicKey,
        wallet.publicKey
      )
    );
  }
  
  tx.add(
    // Transfer fees
    Token.createTransferInstruction(
      TOKEN_PROGRAM_ID,
      aTokenKey,
      feeAccountToken, // msp ops token account
      wallet.publicKey,
      [],
      fee.toNumber()
    ),
    Token.createCloseAccountInstruction(
      TOKEN_PROGRAM_ID,
      account.publicKey,
      wallet.publicKey,
      wallet.publicKey,
      []
    )
  )

  tx.feePayer = wallet.publicKey;
  const { blockhash } = await connection.getRecentBlockhash(connection.commitment);
  tx.recentBlockhash = blockhash;
  
  if (signers && signers.length) {
    tx.partialSign(...signers as Signer[]);
  }

  return tx;
}

export const unwrap = async(
  connection: Connection,
  wallet: any,
  account: Keypair,
  amount: BN,
  feeAccount: PublicKey,
  fee: BN
  
): Promise<Transaction> => {

  const signers: Signer[] = [account];
  const minimumWrappedAccountBalance = await Token.getMinBalanceRentForExemptAccount(connection);
  const atokenKey = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    WRAPPED_SOL_MINT,
    wallet.publicKey
  );

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: account.publicKey,
      lamports: minimumWrappedAccountBalance,
      space: AccountLayout.span,
      programId: TOKEN_PROGRAM_ID,
    }),
    Token.createInitAccountInstruction(
      TOKEN_PROGRAM_ID,
      WRAPPED_SOL_MINT,
      account.publicKey,
      wallet.publicKey
    ),
    Token.createTransferInstruction(
      TOKEN_PROGRAM_ID,
      atokenKey,
      account.publicKey,
      wallet.publicKey,
      [],
      amount.toNumber()
    )
  );

  const feeAccountToken = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    WRAPPED_SOL_MINT,
    feeAccount,
    true
  );

  const feeAccountTokenInfo = await connection.getAccountInfo(feeAccountToken);

  if (!feeAccountTokenInfo) {
    tx.add(
      Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        WRAPPED_SOL_MINT,
        feeAccountToken,
        wallet.publicKey,
        wallet.publicKey
      )
    );
  }

  tx.add(
    Token.createTransferInstruction(
      TOKEN_PROGRAM_ID,
      atokenKey,
      feeAccountToken,
      wallet.publicKey,
      [],
      fee.toNumber()
    ),
    Token.createCloseAccountInstruction(
      TOKEN_PROGRAM_ID,
      account.publicKey,
      wallet.publicKey,
      wallet.publicKey,
      []
    )
  );

  tx.feePayer = wallet.publicKey;
  const { blockhash } = await connection.getRecentBlockhash(connection.commitment);
  tx.recentBlockhash = blockhash;
  
  if (signers && signers.length) {
    tx.partialSign(...signers as Signer[]);
  }

  return tx;
}