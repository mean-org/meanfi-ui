import { Market, OpenOrders, _OPEN_ORDERS_LAYOUT_V2 } from '@project-serum/serum/lib/market';
import { TOKENS, getTokenByMintAddress } from './tokens';
import { TokenAmount } from '../utils/safe-math';
import { TOKEN_PROGRAM_ID, SERUM_PROGRAM_ID_V3, WRAPPED_SOL_MINT, NATIVE_SOL_MINT } from './ids';
import { closeAccount } from '@project-serum/serum/lib/token-instructions';
import { AccountLayout, ASSOCIATED_TOKEN_PROGRAM_ID, Token } from '@solana/spl-token';

import { 
  createTokenAccountIfNotExist, 
  mergeTransactions, 
  sendTransaction

} from './utils';

import { 
  Account, 
  Connection, 
  Keypair, 
  LAMPORTS_PER_SOL, 
  PublicKey, 
  Signer, 
  SystemProgram, 
  SYSVAR_RENT_PUBKEY, 
  Transaction, 
  TransactionInstruction 

} from '@solana/web3.js';

import BN from 'bn.js';
import { ACCOUNT_LAYOUT } from './layouts';

const BufferLayout = require('buffer-layout');

export const DEFAULT_SLIPPAGE_PERCENT = 1;

export function getOutAmount(
  market: any,
  asks: any,
  bids: any,
  fromCoinMint: string,
  toCoinMint: string,
  amount: string,
  slippage: number

) {

  const fromAmount = amount ? parseFloat(amount) : 1;
  let fromMint = fromCoinMint;
  let toMint = toCoinMint;

  if (fromMint === NATIVE_SOL_MINT.toBase58()) {
    fromMint = WRAPPED_SOL_MINT.toBase58();
  }
  if (toMint === NATIVE_SOL_MINT.toBase58()) {
    toMint = WRAPPED_SOL_MINT.toBase58()
  }

  if (fromMint === market.quoteMintAddress.toBase58() && toMint === market.baseMintAddress.toBase58()) {
    // buy
    return forecastBuy(market, asks, fromAmount, slippage);
  } else {
    return forecastSell(market, bids, fromAmount, slippage);
  }
}

export function getSwapOutAmount(
  poolInfo: any,
  fromCoinMint: string,
  toCoinMint: string,
  amount: string,
  slippage: number

) {
  const { coin, pc, fees } = poolInfo;
  const { swapFeeNumerator, swapFeeDenominator } = fees;

  if (fromCoinMint === coin.address && toCoinMint === pc.address) {
    // coin2pc
    const fromAmount = new TokenAmount(amount, coin.decimals, false)
    const fromAmountWithFee = fromAmount.wei
      .multipliedBy(swapFeeDenominator - swapFeeNumerator)
      .dividedBy(swapFeeDenominator);

    const denominator = coin.balance.wei.plus(fromAmountWithFee);
    const amountOut = pc.balance.wei.multipliedBy(fromAmountWithFee).dividedBy(denominator);
    const amountOutWithSlippage = amountOut.dividedBy(1 + slippage / 100);
    const outBalance = pc.balance.wei.minus(amountOut);

    const beforePrice = new TokenAmount(
      parseFloat(new TokenAmount(pc.balance.wei, pc.decimals).fixed()) /
        parseFloat(new TokenAmount(coin.balance.wei, coin.decimals).fixed()),
      pc.decimals,
      false
    );

    const afterPrice = new TokenAmount(
      parseFloat(new TokenAmount(outBalance, pc.decimals).fixed()) /
        parseFloat(new TokenAmount(denominator, coin.decimals).fixed()),
      pc.decimals,
      false
    );

    const priceImpact = 
        ((parseFloat(beforePrice.fixed()) - parseFloat(afterPrice.fixed())) / parseFloat(beforePrice.fixed())) * 100;

    return {
      amountIn: fromAmount,
      amountOut: new TokenAmount(amountOut, pc.decimals),
      amountOutWithSlippage: new TokenAmount(amountOutWithSlippage, pc.decimals),
      priceImpact
    };

  } else {
    // pc2coin
    const fromAmount = new TokenAmount(amount, pc.decimals, false);
    const fromAmountWithFee = fromAmount.wei
      .multipliedBy(swapFeeDenominator - swapFeeNumerator)
      .dividedBy(swapFeeDenominator);

    const denominator = pc.balance.wei.plus(fromAmountWithFee);
    const amountOut = coin.balance.wei.multipliedBy(fromAmountWithFee).dividedBy(denominator);
    const amountOutWithSlippage = amountOut.dividedBy(1 + slippage / 100);
    const outBalance = coin.balance.wei.minus(amountOut);

    const beforePrice = new TokenAmount(
      parseFloat(new TokenAmount(pc.balance.wei, pc.decimals).fixed()) /
        parseFloat(new TokenAmount(coin.balance.wei, coin.decimals).fixed()),
      pc.decimals,
      false
    );

    const afterPrice = new TokenAmount(
      parseFloat(new TokenAmount(denominator, pc.decimals).fixed()) /
        parseFloat(new TokenAmount(outBalance, coin.decimals).fixed()),
      pc.decimals,
      false
    );

    const priceImpact =
      ((parseFloat(afterPrice.fixed()) - parseFloat(beforePrice.fixed())) / parseFloat(beforePrice.fixed())) * 100;

    return {
      amountIn: fromAmount,
      amountOut: new TokenAmount(amountOut, coin.decimals),
      amountOutWithSlippage: new TokenAmount(amountOutWithSlippage, coin.decimals),
      priceImpact
    };
  }
}

export function forecastBuy(market: any, orderBook: any, pcIn: any, slippage: number) {
  let coinOut = 0;
  let bestPrice = null;
  let worstPrice = 0;
  let availablePc = pcIn;

  for (const { key, quantity } of orderBook.items(false)) {
    const price = market.priceLotsToNumber(key.ushrn(64)) || 0;
    const size = market.baseSizeLotsToNumber(quantity) || 0;

    if (!bestPrice && price !== 0) {
      bestPrice = price;
    }

    const orderPcVaule = price * size;
    worstPrice = price;

    if (orderPcVaule >= availablePc) {
      coinOut += availablePc / price;
      availablePc = 0;
      break;
    } else {
      coinOut += size;
      availablePc -= orderPcVaule;
    }
  }

  // coinOut = coinOut * 0.993;
  const priceImpact = ((worstPrice - bestPrice) / bestPrice) * 100;
  worstPrice = (worstPrice * (100 + slippage)) / 100;
  const amountOutWithSlippage = (coinOut * (100 - slippage)) / 100;
  // const avgPrice = (pcIn - availablePc) / coinOut;
  const maxInAllow = pcIn - availablePc;

  return {
    side: 'buy',
    maxInAllow,
    amountOut: coinOut,
    amountOutWithSlippage,
    worstPrice,
    priceImpact
  };
}

export function forecastSell(market: any, orderBook: any, coinIn: any, slippage: number) {
  let pcOut = 0;
  let bestPrice = null;
  let worstPrice = 0;
  let availableCoin = coinIn;

  for (const { key, quantity } of orderBook.items(true)) {
    const price = market.priceLotsToNumber(key.ushrn(64));
    const size = market.baseSizeLotsToNumber(quantity);

    if (!bestPrice && price !== 0) {
      bestPrice = price;
    }

    worstPrice = price;

    if (availableCoin < size) {
      pcOut += availableCoin * price;
      availableCoin = coinIn;
      break;
    } else {
      pcOut += price * size;
      availableCoin -= size;
    }
  }

  // pcOut = pcOut * 0.993;
  const priceImpact = ((bestPrice - worstPrice) / bestPrice) * 100;
  worstPrice = (worstPrice * (100 - slippage)) / 100;
  const amountOutWithSlippage = (pcOut * (100 - slippage)) / 100;
  // const avgPrice = pcOut / (coinIn - availableCoin);
  const maxInAllow = coinIn - availableCoin;

  return {
    side: 'sell',
    maxInAllow,
    amountOut: pcOut,
    amountOutWithSlippage,
    worstPrice,
    priceImpact
  };
}

export async function swap(
  connection: Connection,
  wallet: any,
  poolInfo: any,
  fromCoinMint: PublicKey,
  toCoinMint: PublicKey,
  fromTokenAccount: PublicKey,
  toTokenAccount: PublicKey,
  fromAmount: BN,
  toSwapAmount: BN,
  feeAccount: PublicKey,
  fee: BN

) {

  const tx = new Transaction()
  const signers = new Array<Signer>();
  const from = getTokenByMintAddress(fromCoinMint.toBase58())
  const to = getTokenByMintAddress(toCoinMint.toBase58())

  if (!from || !to) {
    throw new Error('Miss token info')
  }

  let wrappedSolAccount: Keypair | null = null;
  let wrappedSolAccount2: Keypair | null = null;

  if (fromCoinMint.equals(NATIVE_SOL_MINT)) {

    wrappedSolAccount = Keypair.generate();

    tx.add(
      SystemProgram.createAccount({
        fromPubkey: wallet.publicKey,
        newAccountPubkey: wrappedSolAccount.publicKey,
        lamports: fromAmount.sub(fee).toNumber() + 1e7,
        space: ACCOUNT_LAYOUT.span,
        programId: TOKEN_PROGRAM_ID,
      }),
      Token.createInitAccountInstruction(
        TOKEN_PROGRAM_ID,
        WRAPPED_SOL_MINT,
        wrappedSolAccount.publicKey,
        wallet.publicKey
      )
    );

    signers.push(wrappedSolAccount);
  }

  if (toCoinMint.equals(NATIVE_SOL_MINT)) {

    wrappedSolAccount2 = Keypair.generate();

    tx.add(
      SystemProgram.createAccount({
        fromPubkey: wallet.publicKey,
        newAccountPubkey: wrappedSolAccount2.publicKey,
        lamports: 1e7,
        space: ACCOUNT_LAYOUT.span,
        programId: TOKEN_PROGRAM_ID,
      }),
      Token.createInitAccountInstruction(
        TOKEN_PROGRAM_ID,
        WRAPPED_SOL_MINT,
        wrappedSolAccount2.publicKey,
        wallet.publicKey
      )
    );

    signers.push(wrappedSolAccount2);
  }

  const fromMint = fromCoinMint.equals(NATIVE_SOL_MINT) ? WRAPPED_SOL_MINT : fromCoinMint;
  const fromTokenAccountInfo = await connection.getAccountInfo(fromTokenAccount);

  if (!fromTokenAccountInfo) {
    tx.add(
      Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        fromMint,
        fromTokenAccount,
        wallet.publicKey,
        wallet.publicKey
      )
    );
  }

  const toMint = toCoinMint.equals(NATIVE_SOL_MINT) ? WRAPPED_SOL_MINT : toCoinMint;
  const toTokenAccountInfo = await connection.getAccountInfo(toTokenAccount);

  if (!toTokenAccountInfo) {
    tx.add(
      Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        toMint,
        toTokenAccount,
        wallet.publicKey,
        wallet.publicKey
      )
    );
  }

  // Swap ix
  tx.add(
    swapInstruction(
      new PublicKey(poolInfo.programId),
      new PublicKey(poolInfo.ammId),
      new PublicKey(poolInfo.ammAuthority),
      new PublicKey(poolInfo.ammOpenOrders),
      new PublicKey(poolInfo.ammTargetOrders),
      new PublicKey(poolInfo.poolCoinTokenAccount),
      new PublicKey(poolInfo.poolPcTokenAccount),
      new PublicKey(poolInfo.serumProgramId),
      new PublicKey(poolInfo.serumMarket),
      new PublicKey(poolInfo.serumBids),
      new PublicKey(poolInfo.serumAsks),
      new PublicKey(poolInfo.serumEventQueue),
      new PublicKey(poolInfo.serumCoinVaultAccount),
      new PublicKey(poolInfo.serumPcVaultAccount),
      new PublicKey(poolInfo.serumVaultSigner),
      wrappedSolAccount ? wrappedSolAccount.publicKey : fromTokenAccount,
      wrappedSolAccount2 ? wrappedSolAccount2.publicKey : toTokenAccount,
      wallet.publicKey,
      fromAmount.sub(fee).toNumber(),
      toSwapAmount.toNumber()
    )
  )

  // Transfer fees
  const feeAccountToken = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    fromMint,
    feeAccount,
    true
  );

  const feeAccountTokenInfo = await connection.getAccountInfo(feeAccountToken);

  if (!feeAccountTokenInfo) {
    tx.add(
      Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        fromMint,
        feeAccountToken,
        wallet.publicKey,
        wallet.publicKey
      )
    );
  }

  if (wrappedSolAccount) {
    tx.add(
      Token.createTransferInstruction(
        TOKEN_PROGRAM_ID,
        wrappedSolAccount.publicKey,
        feeAccountToken,
        wallet.publicKey,
        [],
        fee.toNumber()
      ),
      Token.createCloseAccountInstruction(
        TOKEN_PROGRAM_ID,
        wrappedSolAccount.publicKey,
        wallet.publicKey,
        wallet.publicKey,
        []
      )
    );
  } else {
    tx.add(
      Token.createTransferInstruction(
        TOKEN_PROGRAM_ID,
        fromTokenAccount,
        feeAccountToken,
        wallet.publicKey,
        [],
        fee.toNumber()
      )
    );
  }

  if (wrappedSolAccount2) {
    tx.add(
      Token.createCloseAccountInstruction(
        TOKEN_PROGRAM_ID,
        wrappedSolAccount2.publicKey,
        wallet.publicKey,
        wallet.publicKey,
        []
      )
    );
  }

  tx.feePayer = wallet.publicKey;
  const { blockhash } = await connection.getRecentBlockhash();
  tx.recentBlockhash = blockhash;

  if (signers.length) {
    tx.partialSign(...signers);
  }

  return tx;
}

export async function place(
  connection: Connection,
  wallet: any,
  market: Market,
  asks: any,
  bids: any,
  fromCoinMint: PublicKey,
  toCoinMint: PublicKey,
  fromTokenAccount: PublicKey,
  toTokenAccount: PublicKey,
  fromAmount: BN,
  slippage: number,
  feeAccount: PublicKey,
  fee: BN

) {

  const tx = new Transaction();
  const signers: Signer[] = [];
  const swapAmount = fromAmount.sub(fee).toNumber() / 10 ** 6;
  
  const forecastConfig = getOutAmount(
    market, 
    asks, 
    bids, 
    fromCoinMint.toBase58(), 
    toCoinMint.toBase58(), 
    swapAmount.toString(), //fromAmount.sub(fee).toNumber().toString(),
    slippage
  );

  const serumProgramId = new PublicKey(SERUM_PROGRAM_ID_V3);
  const openOrdersAccounts = await market.findOpenOrdersAccountsForOwner(connection, wallet.publicKey, 0);
  let openOrdersAddress: PublicKey;

  if (openOrdersAccounts.length > 0) {
    openOrdersAddress = openOrdersAccounts[0].address;
  } else {
    const openOrderNewAccount = new Account();//Keypair.generate();
    openOrdersAddress = openOrderNewAccount.publicKey;

    tx.add(
      SystemProgram.createAccount({
        fromPubkey: wallet.publicKey,
        newAccountPubkey: openOrdersAddress,
        lamports: await connection.getMinimumBalanceForRentExemption(_OPEN_ORDERS_LAYOUT_V2.span),
        space: _OPEN_ORDERS_LAYOUT_V2.span,
        programId: serumProgramId
      })
    );

    signers.push(openOrderNewAccount);
  }

  let wrappedSolAccount: PublicKey | null = null;

  if (fromCoinMint.equals(NATIVE_SOL_MINT)) {
    let lamports;

    if (forecastConfig.side === 'buy') {
      lamports = forecastConfig.worstPrice * parseFloat(forecastConfig.amountOut.toFixed(6)) * 1.01 * LAMPORTS_PER_SOL;
      if (openOrdersAccounts.length > 0) {
        lamports -= openOrdersAccounts[0].baseTokenFree.toNumber();
      }
    } else {
      lamports = parseFloat(forecastConfig.maxInAllow.toFixed(6)) * LAMPORTS_PER_SOL;
      if (openOrdersAccounts.length > 0) {
        lamports -= openOrdersAccounts[0].baseTokenFree.toNumber();
      }
    }

    lamports += (fee.toNumber() + 1e7);

    wrappedSolAccount = await createTokenAccountIfNotExist(
      connection,
      wrappedSolAccount,
      wallet.publicKey,
      WRAPPED_SOL_MINT.toBase58(),
      lamports,
      tx,
      signers
    );
  }

  const sizeAmount = forecastConfig.side === 'buy'
    ? parseFloat(forecastConfig.amountOut.toFixed(6))
    : forecastConfig.maxInAllow
    ? parseFloat(forecastConfig.maxInAllow.toFixed(6))
    : parseFloat(swapAmount.toFixed(6));

  tx.add(
    market.makePlaceOrderInstruction(connection, {
      owner: wallet.publicKey,
      payer: wrappedSolAccount ?? fromTokenAccount,
      side: forecastConfig.side === 'buy' ? 'buy' : 'sell',
      price: forecastConfig.worstPrice,
      size: sizeAmount,

      orderType: 'ioc',
      openOrdersAddressKey: openOrdersAddress,
      programId: serumProgramId,
      selfTradeBehavior: 'decrementTake'
    })
  );

  let fromMint = fromCoinMint
  let toMint = toCoinMint

  if (fromCoinMint.equals(NATIVE_SOL_MINT)) {
    fromMint = WRAPPED_SOL_MINT;
  }

  if (toCoinMint.equals(NATIVE_SOL_MINT)) {
    toMint = WRAPPED_SOL_MINT;
  }

  const fromTokenAccountInfo = await connection.getAccountInfo(fromTokenAccount);

  if (!fromTokenAccountInfo) {
    tx.add(
      new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: fromTokenAccount, isSigner: false, isWritable: true },
          { pubkey: wallet.publicKey, isSigner: false, isWritable: false },
          { pubkey: fromMint, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        ],
        programId: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
    );
  }

  const toTokenAccountInfo = await connection.getAccountInfo(toTokenAccount);

  if (!toTokenAccountInfo) {
    tx.add(
      new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: toTokenAccount, isSigner: false, isWritable: true },
          { pubkey: wallet.publicKey, isSigner: false, isWritable: false },
          { pubkey: toMint, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        ],
        programId: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
    );
  }

  const userAccounts = [fromTokenAccount, toTokenAccount];

  if (market.baseMintAddress.equals(toMint) && market.quoteMintAddress.equals(fromMint)) {
    userAccounts.reverse();
  }

  const baseTokenAccount = userAccounts[0];
  const quoteTokenAccount = userAccounts[1];
  let referrerQuoteWallet: PublicKey | null = null;

  if (market.supportsReferralFees) {
    const quoteToken = getTokenByMintAddress(market.quoteMintAddress.toBase58());

    if (quoteToken?.referrer) {
      referrerQuoteWallet = new PublicKey(quoteToken?.referrer);
    }
  }

  const settleTx = await market.makeSettleFundsTransaction(
    connection,
    new OpenOrders(openOrdersAddress, { owner: wallet.publicKey }, serumProgramId),
    baseTokenAccount,
    quoteTokenAccount,
    referrerQuoteWallet
  );

  signers.push(...settleTx.signers);
  tx.add(settleTx.transaction);

  // Transfer fees
  const feeAccountToken = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    fromMint,
    feeAccount,
  );

  const feeAccountTokenInfo = await connection.getAccountInfo(feeAccountToken);

  if (!feeAccountTokenInfo) {
    tx.add(
      new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: feeAccountToken, isSigner: false, isWritable: true },
          { pubkey: feeAccount, isSigner: false, isWritable: false },
          { pubkey: fromMint, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        ],
        programId: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
    );
  }

  if (wrappedSolAccount) {
    tx.add(
      Token.createTransferInstruction(
        TOKEN_PROGRAM_ID,
        wrappedSolAccount,
        feeAccountToken,
        wallet.publicKey,
        [],
        fee.toNumber()
      ),
      closeAccount({
        source: wrappedSolAccount,
        destination: wallet.publicKey,
        owner: wallet.publicKey
      })
    );
  } else {
    tx.add(
      Token.createTransferInstruction(
        TOKEN_PROGRAM_ID,
        fromTokenAccount,
        feeAccountToken,
        wallet.publicKey,
        [],
        fee.toNumber()
      )
    );
  }

  tx.feePayer = wallet.publicKey;
  const { blockhash } = await connection.getRecentBlockhash();
  tx.recentBlockhash = blockhash;

  if (signers.length) {
    tx.partialSign(...signers);
  }

  return tx;
}

export function swapInstruction(
  programId: PublicKey,
  // tokenProgramId: PublicKey,
  // amm
  ammId: PublicKey,
  ammAuthority: PublicKey,
  ammOpenOrders: PublicKey,
  ammTargetOrders: PublicKey,
  poolCoinTokenAccount: PublicKey,
  poolPcTokenAccount: PublicKey,
  // serum
  serumProgramId: PublicKey,
  serumMarket: PublicKey,
  serumBids: PublicKey,
  serumAsks: PublicKey,
  serumEventQueue: PublicKey,
  serumCoinVaultAccount: PublicKey,
  serumPcVaultAccount: PublicKey,
  serumVaultSigner: PublicKey,
  // user
  userSourceTokenAccount: PublicKey,
  userDestTokenAccount: PublicKey,
  userOwner: PublicKey,
  amountIn: number,
  minAmountOut: number

): TransactionInstruction {

  const dataLayout = BufferLayout.struct([
    BufferLayout.u8('instruction'), 
    BufferLayout.nu64('amountIn'), 
    BufferLayout.nu64('minAmountOut')
  ]);

  const keys = [
    // spl token
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: true },
    // amm
    { pubkey: ammId, isSigner: false, isWritable: true },
    { pubkey: ammAuthority, isSigner: false, isWritable: true },
    { pubkey: ammOpenOrders, isSigner: false, isWritable: true },
    { pubkey: ammTargetOrders, isSigner: false, isWritable: true },
    { pubkey: poolCoinTokenAccount, isSigner: false, isWritable: true },
    { pubkey: poolPcTokenAccount, isSigner: false, isWritable: true },
    // serum
    { pubkey: serumProgramId, isSigner: false, isWritable: true },
    { pubkey: serumMarket, isSigner: false, isWritable: true },
    { pubkey: serumBids, isSigner: false, isWritable: true },
    { pubkey: serumAsks, isSigner: false, isWritable: true },
    { pubkey: serumEventQueue, isSigner: false, isWritable: true },
    { pubkey: serumCoinVaultAccount, isSigner: false, isWritable: true },
    { pubkey: serumPcVaultAccount, isSigner: false, isWritable: true },
    { pubkey: serumVaultSigner, isSigner: false, isWritable: true },
    { pubkey: userSourceTokenAccount, isSigner: false, isWritable: true },
    { pubkey: userDestTokenAccount, isSigner: false, isWritable: true },
    { pubkey: userOwner, isSigner: true, isWritable: true }
  ];

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      instruction: 9,
      amountIn,
      minAmountOut
    },
    data
  );

  return new TransactionInstruction({
    keys,
    programId,
    data
  });
}

export async function checkUnsettledInfo(connection: Connection, wallet: any, market: Market) {

  if (!wallet) return;
  const owner = wallet.publicKey;
  if (!owner) return;
  const openOrderss = await market?.findOpenOrdersAccountsForOwner(connection, owner, 1000);
  if (!openOrderss?.length) return;
  const baseTotalAmount = market.baseSplSizeToNumber(openOrderss[0].baseTokenTotal);
  const quoteTotalAmount = market.quoteSplSizeToNumber(openOrderss[0].quoteTokenTotal);
  const baseUnsettledAmount = market.baseSplSizeToNumber(openOrderss[0].baseTokenFree);
  const quoteUnsettledAmount = market.quoteSplSizeToNumber(openOrderss[0].quoteTokenFree);

  return {
    baseSymbol: getTokenByMintAddress(market.baseMintAddress.toString())?.symbol,
    quoteSymbol: getTokenByMintAddress(market.quoteMintAddress.toString())?.symbol,
    baseTotalAmount,
    quoteTotalAmount,
    baseUnsettledAmount,
    quoteUnsettledAmount,
    openOrders: openOrderss[0]
  };
}

export async function settleFund(
  connection: Connection,
  market: Market,
  openOrders: OpenOrders,
  wallet: any,
  baseMint: string,
  quoteMint: string,
  baseWallet: string,
  quoteWallet: string

) {
  const tx = new Transaction();
  const signs: Account[] = [];
  const owner = wallet.publicKey;
  let wrappedBaseAccount;
  let wrappedQuoteAccount;

  if (baseMint === TOKENS.WSOL.address) {
    wrappedBaseAccount = await createTokenAccountIfNotExist(
      connection,
      wrappedBaseAccount,
      owner,
      TOKENS.WSOL.address,
      1e7,
      tx,
      signs
    );
  }

  if (quoteMint === TOKENS.WSOL.address) {
    wrappedQuoteAccount = await createTokenAccountIfNotExist(
      connection,
      wrappedQuoteAccount,
      owner,
      TOKENS.WSOL.address,
      1e7,
      tx,
      signs
    );
  }

  const quoteToken = getTokenByMintAddress(quoteMint);

  const { transaction, signers } = await market.makeSettleFundsTransaction(
    connection,
    openOrders,
    wrappedBaseAccount ?? new PublicKey(baseWallet),
    wrappedQuoteAccount ?? new PublicKey(quoteWallet),
    quoteToken && quoteToken.referrer ? new PublicKey(quoteToken.referrer) : null
  );

  if (wrappedBaseAccount) {
    transaction.add(
      closeAccount({
        source: wrappedBaseAccount,
        destination: owner,
        owner
      })
    );
  }

  if (wrappedQuoteAccount) {
    transaction.add(
      closeAccount({
        source: wrappedQuoteAccount,
        destination: owner,
        owner
      })
    );
  }

  return await sendTransaction(connection, wallet, mergeTransactions([tx, transaction]), [...signs, ...signers]);
}
