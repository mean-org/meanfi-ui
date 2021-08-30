import { BN } from "@project-serum/anchor";
import { SendTxRequest, Wallet } from "@project-serum/anchor/dist/provider";
import { Market, OpenOrders } from "@project-serum/serum";
import { Swap } from "@project-serum/swap";
import { findATokenAddress } from "money-streaming/lib/utils";
import { NATIVE_SOL_MINT, WRAPPED_SOL_MINT } from "./ids";
import { AccountLayout, ASSOCIATED_TOKEN_PROGRAM_ID, MintInfo, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, Signer, SystemProgram, Transaction } from "@solana/web3.js";
import { PublicKeys } from "money-streaming/lib/types";

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
  
  const amount = new BN((fromAmount - fees) * 10 ** fromMintInfo.decimals);
  const swapFees = new BN(fees * 10 ** fromMintInfo.decimals);
  const isSol = fromMint.equals(NATIVE_SOL_MINT) || toMint.equals(NATIVE_SOL_MINT);
  const isWrap = fromMint.equals(NATIVE_SOL_MINT) && toMint.equals(WRAPPED_SOL_MINT);
  const isUnwrap = toMint.equals(NATIVE_SOL_MINT) && fromMint.equals(WRAPPED_SOL_MINT);
  const wrappedAccount = Keypair.generate();
  const fromWallet = await findATokenAddress(wallet.publicKey, fromMint);
  const toWallet = await findATokenAddress(wallet.publicKey, toMint);
  const quoteWallet = await findATokenAddress(wallet.publicKey, quoteMint);
  const quoteWalletInfo = await connection.getAccountInfo(quoteWallet);

  let fromWalletAddr = fromMint.equals(NATIVE_SOL_MINT)
    ? wrappedAccount.publicKey
    : fromWallet;
      
  const toWalletAddr = toMint.equals(NATIVE_SOL_MINT)
    ? wrappedAccount.publicKey
    : toWallet;
    
  const quoteWalletAddr = quoteWalletInfo
    ? quoteWallet
    : undefined;

  let request: SendTxRequest = { 
    tx: new Transaction(), 
    signers: new Array<Signer>() 
  };

  const isFromMint = fromMint.equals(NATIVE_SOL_MINT);
  const { tx: wrapTx, signers: wrapSigners } = await wrapRequest(
    connection,
    wallet,
    wrappedAccount,
    amount.add(swapFees),
    isFromMint,
    isWrap
  );

  const { tx: unwrapTx, signers: unwrapSigners } = await unwrapRequest(
    connection,
    wallet, 
    wrappedAccount,
    amount
  );

  if (isWrap) {
    request.tx.add(wrapTx);
    request.signers.push(...wrapSigners);
  } else if (isUnwrap) {
    request.tx.add(unwrapTx);
    request.signers.push(...unwrapSigners);
  } else {
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
      slippage,
      fair,
      close,
      referral,
      strict
    );

    const tx = new Transaction();

    if (isSol) {
      tx.add(wrapTx);
      request.signers.push(...wrapSigners);
    }

    tx.add(swapTxs.tx);
    request.tx = tx;
  }
   
  if (isWrap) {
    fromWalletAddr = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      WRAPPED_SOL_MINT,
      wallet.publicKey
    );
  }

  // meanfi fees tx 
  const mint = fromMint.equals(NATIVE_SOL_MINT) ? WRAPPED_SOL_MINT : fromMint;
  const { tx: feesTxs, signers: feesSigners } = await feesTxRequest(
    connection,
    wallet.publicKey,
    fromWalletAddr,
    mint,
    swapFees
  );

  request.tx.add(feesTxs);
  request.signers.push(...feesSigners);

  // Finally close the temp wrapped acount if there was a temp wrap Ix
  if (isSol) {
    request.tx.add(
      Token.createCloseAccountInstruction(
        TOKEN_PROGRAM_ID,
        wrappedAccount.publicKey,
        wallet.publicKey,
        wallet.publicKey,
        []
      )
    );
  }

  request.tx.feePayer = wallet.publicKey;
  const { blockhash } = await connection.getRecentBlockhash(client.program.provider.connection.commitment);
  request.tx.recentBlockhash = blockhash;

  if (request.signers.length) {
    request.tx.partialSign(...request.signers as Signer[]);
  }

  return request;
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
  isFromMint: boolean = true,
  isWrap: boolean = false

): Promise<SendTxRequest> => {

  const signers = new Array<Signer>(...[account]);
  const minimumWrappedAccountBalance = await Token.getMinBalanceRentForExemptAccount(connection);

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: account.publicKey,
      lamports: isFromMint ? minimumWrappedAccountBalance + amount.toNumber() : minimumWrappedAccountBalance,
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

  if (isWrap) {
    const atokenKey = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      WRAPPED_SOL_MINT,
      wallet.publicKey
    );

    const atokenAccountInfo = await connection.getAccountInfo(atokenKey);

    if (!atokenAccountInfo) {
      tx.add(
        Token.createAssociatedTokenAccountInstruction(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          WRAPPED_SOL_MINT,
          atokenKey,
          wallet.publicKey,
          wallet.publicKey          
        )
      );
    }

    tx.add(
      Token.createTransferInstruction(
        TOKEN_PROGRAM_ID,
        account.publicKey,
        atokenKey,
        wallet.publicKey,
        [],
        amount.toNumber()
      )
    );
  }

  return { tx, signers };
}

export const unwrapRequest = async(
  connection: Connection,
  wallet: Wallet,
  account: Keypair,
  amount: BN
  
): Promise<SendTxRequest> => {

  const signers = new Array<Signer>(...[account]);
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
    ),
    Token.createCloseAccountInstruction(
      TOKEN_PROGRAM_ID,
      account.publicKey,
      wallet.publicKey,
      wallet.publicKey,
      []
    )
  );

  return { tx, signers };
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
  slippage: number,
  fair: number,
  close: boolean,
  referral?: PublicKey | undefined,
  strict: boolean = false

): Promise<SendTxRequest> => {
  
  if (fromMint.equals(NATIVE_SOL_MINT)) {
    fromMint = WRAPPED_SOL_MINT;
  }

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

const feesTxRequest = async (
  connection: Connection,
  payer: PublicKey,
  from: PublicKey,
  mint: PublicKey,
  amount: BN  

): Promise<SendTxRequest> => {

  let tx = new Transaction();
  const signers = new Array<Signer>();
  const mspOpsKey = PublicKeys.MSP_OPS_KEY['mainnet-beta'];
  const mspOpsTokenKey = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    mint,
    mspOpsKey
  );

  const mspOpsTokenAccountInfo = await connection.getAccountInfo(mspOpsTokenKey);

  if (!mspOpsTokenAccountInfo) {
    tx.add(
      Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        mint,
        mspOpsTokenKey,
        mspOpsKey,
        payer
      )
    );
  }

  tx.add(
    Token.createTransferInstruction(
      TOKEN_PROGRAM_ID,
      from,
      mspOpsTokenKey,
      payer,
      [],
      amount.toNumber()
    )
  )

  return { tx, signers };
}