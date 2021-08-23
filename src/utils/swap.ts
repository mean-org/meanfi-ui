import { BN } from "@project-serum/anchor";
import { SendTxRequest, Wallet } from "@project-serum/anchor/dist/provider";
import { Market, OpenOrders } from "@project-serum/serum";
import { Swap } from "@project-serum/swap";
import { findATokenAddress } from "money-streaming/lib/utils";
import { NATIVE_SOL_MINT, WRAPPED_SOL_MINT } from "./ids";
import { AccountLayout, MintInfo, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, Signer, SystemProgram, Transaction } from "@solana/web3.js";

export const swap = async(
  client: Swap,
  fromMint: PublicKey,
  fromMintInfo: MintInfo,
  fromMarket: Market | undefined,
  fromAmount: number,
  toMint: PublicKey,
  toMintInfo: MintInfo,
  toMarket: Market | undefined,
  quoteMint: PublicKey,
  quoteMintInfo: MintInfo,
  openOrders: Map<string, OpenOrders[]>,
  fees: number,
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
    fromMarket,
    fromAmount,
    toMint,
    toMintInfo,
    toMarket,
    quoteMint,
    quoteMintInfo,
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
  fromMintInfo: MintInfo,
  fromMarket: Market | undefined,
  fromAmount: number,
  toMint: PublicKey,
  toMintInfo: MintInfo,
  toMarket: Market | undefined,
  quoteMint: PublicKey,
  quoteMintInfo: MintInfo,
  openOrders: Map<string, OpenOrders[]>,
  fees: number,
  slippage: number,
  fair: number,
  close: boolean,
  referral?: PublicKey | undefined,
  strict: boolean = false
  
): Promise<SendTxRequest> => {

  const { connection, wallet } = {
    connection: client.program.provider.connection,
    wallet: client.program.provider.wallet    
  };
  
  const amount = new BN(fromAmount * 10 ** fromMintInfo.decimals);
  const swapFees = new BN(fees * 10 ** fromMintInfo.decimals);
  const isSol = fromMint.equals(NATIVE_SOL_MINT) || toMint.equals(NATIVE_SOL_MINT);
  const wrappedAccount = Keypair.generate();
  const fromWallet = await findATokenAddress(wallet.publicKey, fromMint);
  const toWallet = await findATokenAddress(wallet.publicKey, toMint);
  const quoteWallet = await findATokenAddress(wallet.publicKey, quoteMint);
  const quoteWalletInfo = await connection.getAccountInfo(quoteWallet);

  const fromWalletAddr = fromMint.equals(NATIVE_SOL_MINT)
    ? wrappedAccount.publicKey
    : fromWallet;
      
  const toWalletAddr = toMint.equals(NATIVE_SOL_MINT)
    ? wrappedAccount.publicKey
    : toWallet;
    
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
    toMintInfo,
    toMarket,
    quoteMint,
    quoteMintInfo,
    quoteWalletAddr,
    fromWalletAddr,
    toWalletAddr,
    openOrders,
    swapFees,
    slippage,
    fair,
    close,
    referral,
    strict
  );

  if (isSol) {
    const isFromMint = fromMint.equals(NATIVE_SOL_MINT);
    const { tx: wrapTx, signers: wrapSigners } = await wrapRequest(
      connection,
      wallet,
      wrappedAccount,
      amount,
      isFromMint
    );

    const unwrapTx = await unwrap(wallet.publicKey, wrappedAccount.publicKey);
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
  connection: Connection,
  wallet: Wallet,
  account: Keypair,
  amount: BN,
  temp: boolean = true

): Promise<Transaction> => {

  let { tx, signers } = await wrapRequest(
    connection,
    wallet,
    account,
    amount,
    temp
  );
  
  if (signers && signers.length) {
    tx.partialSign(...signers as Signer[]);
  }

  return tx;
}

export const wrapRequest = async (
  connection: Connection,
  wallet: Wallet,
  account: Keypair,
  amount: BN,
  isFromMint: boolean = true

): Promise<SendTxRequest> => {

  const signers = new Array<Signer>(...[account]);
  const minimumWrappedAccountBalance = await Token.getMinBalanceRentForExemptAccount(connection);
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: account.publicKey,
      lamports: isFromMint ? (minimumWrappedAccountBalance + amount.toNumber()) : minimumWrappedAccountBalance,
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
  fromMintInfo: MintInfo,
  fromMarket: Market | undefined,
  amount: BN,
  toMint: PublicKey,
  toMintInfo: MintInfo,
  toMarket: Market | undefined,
  quoteMint: PublicKey,
  quoteMintInfo: MintInfo,
  quoteWallet: PublicKey | undefined,
  fromWallet: PublicKey | undefined,
  toWallet: PublicKey | undefined,
  openOrders: Map<string, OpenOrders[]>,
  fees: BN,
  slippage: number,
  fair: number,
  close: boolean,
  referral?: PublicKey | undefined,
  strict: boolean = false

): Promise<SendTxRequest> => {
  
  if (fromMint.equals(NATIVE_SOL_MINT)) {
    fromMint = WRAPPED_SOL_MINT;
  }

  const fromAmount = amount.sub(fees);
  const minExchangeRate = {
    rate: new BN(10 ** toMintInfo.decimals / fair)
      .muln(100 - slippage)
      .divn(100),
    fromDecimals: fromMintInfo.decimals,
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
    amount: fromAmount,
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