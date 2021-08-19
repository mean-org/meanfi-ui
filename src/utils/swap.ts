import { BN, Provider } from "@project-serum/anchor";
import { SendTxRequest } from "@project-serum/anchor/dist/provider";
import { Market, OpenOrders } from "@project-serum/serum";
import { Swap } from "@project-serum/swap";
import { createATokenAccountInstruction } from "money-streaming/lib/instructions";
import { TransactionFees } from "money-streaming/lib/types";
import { findATokenAddress } from "money-streaming/lib/utils";
import { NATIVE_SOL_MINT, WRAPPED_SOL_MINT } from "./ids";
import {
    AccountInfo,
    AccountLayout,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    MintInfo,
    Token,
    TOKEN_PROGRAM_ID,
    u64

} from "@solana/spl-token";

import {
    Commitment,
    Connection,
    Keypair,
    LAMPORTS_PER_SOL,
    PublicKey,
    Signer,
    SystemProgram,
    Transaction,
    TransactionInstruction

} from "@solana/web3.js";

export const swap = async(
  client: Swap,
  fromMint: PublicKey,
  fromMintInfo: MintInfo | undefined,
//   fromWallet: { publicKey: PublicKey, account: AccountInfo } | null | undefined,
  fromMarket: Market | undefined,
  fromAmount: number,
  toMint: PublicKey,
//   toWallet: { publicKey: PublicKey, account: AccountInfo } | null | undefined,
  toMarket: Market | undefined,
  quoteMint: PublicKey,
  quoteMintInfo: MintInfo,
//   quoteWallet: { publicKey: PublicKey, account: AccountInfo } | null | undefined,
  openOrders: Map<string, OpenOrders[]>,
  fees: TransactionFees,
  slippage: number,
  fair: number,
  close: boolean,
  referral?: PublicKey | undefined,
  strict: boolean = false
  
): Promise<Transaction> => {
  
  let { tx, signers } = await swapRequest(
    client,
    fromMint,
    fromMintInfo,
    // fromWallet,
    fromMarket,
    fromAmount,
    toMint,
    // toWallet,
    toMarket,
    quoteMint,
    quoteMintInfo,
    // quoteWallet,
    openOrders,
    fees,
    slippage,
    fair,
    close,
    referral,
    strict
  );
  
  if (signers && signers.length) {
    tx.partialSign(...signers as Signer[]);
  }

  return tx; 
}

export const swapRequest = async(
  client: Swap,
  fromMint: PublicKey,
  fromMintInfo: MintInfo | undefined,
//   fromWallet: { publicKey: PublicKey, account: AccountInfo } | null | undefined, 
  fromMarket: Market | undefined,
  fromAmount: number,
  toMint: PublicKey,
//   toWallet: { publicKey: PublicKey, account: AccountInfo } | null | undefined,
  toMarket: Market | undefined,
  quoteMint: PublicKey,
  quoteMintInfo: MintInfo,
//   quoteWallet: { publicKey: PublicKey, account: AccountInfo } | null | undefined,  
  openOrders: Map<string, OpenOrders[]>,
  fees: TransactionFees,
  slippage: number,
  fair: number,
  close: boolean,
  referral?: PublicKey | undefined,
  strict: boolean = false
  
): Promise<SendTxRequest> => {

  const { provider, connection, wallet } = {
    provider: client.program.provider,
    connection: client.program.provider.connection,
    wallet: client.program.provider.wallet    
  };
  
  const amount = new BN(fromAmount * 10 ** (fromMintInfo?.decimals || 6));  
  const isSol = fromMint.equals(NATIVE_SOL_MINT) || toMint.equals(NATIVE_SOL_MINT);
  const wrappedAccount = Keypair.generate();
  const fromWallet = await findATokenAddress(wallet.publicKey, fromMint);
  const toWallet = await findATokenAddress(wallet.publicKey, toMint);
  const quoteWallet = await findATokenAddress(wallet.publicKey, quoteMint);
  const fromWalletInfo = await connection.getAccountInfo(fromWallet);
  const toWalletInfo = await connection.getAccountInfo(toWallet);
  const quoteWalletInfo = await connection.getAccountInfo(quoteWallet);

  const fromWalletAddr = fromMint.equals(NATIVE_SOL_MINT)
    ? wrappedAccount.publicKey
    : fromWalletInfo
    ? fromWallet
    : undefined;
      
  const toWalletAddr = toMint.equals(NATIVE_SOL_MINT)
    ? wrappedAccount.publicKey
    : toWalletInfo
    ? toWallet
    : undefined;
    
  const quoteWalletAddr = quoteWalletInfo
    ? quoteWallet
    : undefined;
  
  let swapTxs = await swapTxRequest(
    client,
    fromMint,
    fromMintInfo,
    fromMarket,
    amount,
    toMint,
    toMarket,
    quoteMint,
    quoteMintInfo,
    quoteWalletAddr,
    fromWalletAddr,
    toWalletAddr,
    openOrders,
    fees,
    slippage,
    fair,
    close,
    referral,
    strict
  );

  if (isSol) {
    const { tx: wrapTx, signers: wrapSigners } = await wrapRequest(provider, fromAmount);
    const unwrapTx = await unwrap(wallet.publicKey, wrappedAccount!.publicKey);
    const tx = new Transaction().add(
      wrapTx,
      swapTxs.tx,
      unwrapTx
    );

    swapTxs.tx = tx;
    swapTxs.signers.push(...wrapSigners);
  }

  swapTxs.tx.feePayer = wallet.publicKey;
  const { blockhash } = await connection.getRecentBlockhash(client.program.provider.connection.commitment);
  swapTxs.tx.recentBlockhash = blockhash;

  if (swapTxs.signers.length) {
    swapTxs.tx.partialSign(...swapTxs.signers as Signer[]);
  }

  return swapTxs;
}

export const wrap = async (
  provider: Provider,
  amount: number,
  temp: boolean = true

): Promise<Transaction> => {

  let { tx, signers } = await wrapRequest(
    provider,
    amount,
    temp
  );
  
  if (signers && signers.length) {
    tx.partialSign(...signers as Signer[]);
  }

  return tx;
}

export const wrapRequest = async (
  provider: Provider,
  amount: number,
  temp: boolean = false

): Promise<SendTxRequest> => {

  let ixs = new Array<TransactionInstruction>();
  let signers = new Array<Signer>();
  let { connection, owner } = {
    connection: provider.connection,
    owner: provider.wallet.publicKey
  };
    
  if (!temp) {
    let aTokenKey = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      WRAPPED_SOL_MINT,
      provider.wallet.publicKey
    );

    let accountInfo = await connection.getAccountInfo(aTokenKey);

    if (!accountInfo) {
      const account = Keypair.generate();  
      signers.push(account);
      aTokenKey = account.publicKey;
    }

    ixs = await wrapIxs(owner, aTokenKey, amount, !accountInfo);
    
  } else {
    const account = Keypair.generate();  
    signers.push(account);    
    ixs = await wrapTempIxs(
      connection,
      owner,
      account.publicKey,
      amount
    );
  }
  
  let tx = new Transaction().add(...ixs);
  tx.feePayer = owner;
  let hash = await connection.getRecentBlockhash(connection.commitment as Commitment);
  tx.recentBlockhash = hash.blockhash;
  
  if (temp && signers.length) {
    tx.partialSign(...signers);
  }

  return { tx, signers };
}

export const unwrap = async(
  from: PublicKey,
  key: PublicKey
  
): Promise<Transaction> => {

  return new Transaction().add(
    Token.createCloseAccountInstruction(
      TOKEN_PROGRAM_ID,
      key,
      from,
      from,
      []
    )
  );
}

const swapTxRequest = async (
  client: Swap,
  fromMint: PublicKey,
  fromMintInfo: MintInfo | undefined,
  fromMarket: Market | undefined,
  amount: BN,
  toMint: PublicKey,
  toMarket: Market | undefined,
  quoteMint: PublicKey,
  quoteMintInfo: MintInfo,
  quoteWallet: PublicKey | undefined,
  fromWallet: PublicKey | undefined,
  toWallet: PublicKey | undefined,
  openOrders: Map<string, OpenOrders[]>,
  fees: TransactionFees,
  slippage: number,
  fair: number,
  close: boolean,
  referral?: PublicKey | undefined,
  strict: boolean = false

): Promise<SendTxRequest> => {
    
  const swapFee = amount.muln(fees.mspPercentFee).divn(100).toNumber();
  const minExchangeRate = {
    rate: new BN((10 ** (fromMintInfo?.decimals || 6) * swapFee) / fair).muln(100 - slippage).divn(100),
    fromDecimals: (fromMintInfo?.decimals || 6),
    quoteDecimals: quoteMintInfo.decimals,
    strict,
  };

  const fromOpenOrders = fromMarket && openOrders.has(fromMarket?.address.toBase58())
    ? openOrders.get(fromMarket?.address.toBase58())
    : undefined;

  const toOpenOrders = toMarket
    ? openOrders.get(toMarket?.address.toBase58())
    : undefined;
        
  const swapParams = {
    fromMint,
    toMint,
    quoteMint,
    amount,
    minExchangeRate,
    referral,
    fromMarket: fromMarket as Market,
    toMarket,
    fromOpenOrders: fromOpenOrders ? fromOpenOrders[0].address : undefined,
    toOpenOrders: toOpenOrders ? toOpenOrders[0].address : undefined,
    fromWallet,
    toWallet,
    quoteWallet: quoteWallet ? quoteWallet : undefined,
    close
  };

  return (await client.swapTxs(swapParams))[0];
}

const wrapIxs = async (
  from: PublicKey,
  key: PublicKey,
  amount: number,
  isNew: boolean = false

): Promise<TransactionInstruction[]> => {

  let ixs = new Array<TransactionInstruction>();
    
  if (isNew) {
    ixs.push(
      Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        WRAPPED_SOL_MINT,
        key,
        from,
        from
      )
    );
  }

  ixs.push(
    Token.createTransferInstruction(
      TOKEN_PROGRAM_ID,
      from,
      key,
      from,
      [],
      (amount * LAMPORTS_PER_SOL)
    )
  );
  
  return ixs;
}

const wrapTempIxs = async (
  connection: Connection,
  from: PublicKey,
  key: PublicKey,
  amount: number

): Promise<TransactionInstruction[]> => {

  const minimumWrappedAccountBalance = await connection.getMinimumBalanceForRentExemption(AccountLayout.span);
  
  return new Array<TransactionInstruction>(
    SystemProgram.createAccount({
      fromPubkey: from,
      newAccountPubkey: key,
      programId: TOKEN_PROGRAM_ID,
      lamports: minimumWrappedAccountBalance,
      space: AccountLayout.span
    }),
    SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: key,
      lamports: amount * LAMPORTS_PER_SOL,
    }),
    Token.createInitAccountInstruction(
      TOKEN_PROGRAM_ID,
      WRAPPED_SOL_MINT,
      key,
      from
    )
  )
}
