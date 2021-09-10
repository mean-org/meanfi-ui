import { closeAccount } from "@project-serum/serum/lib/token-instructions";
import { Token } from "@solana/spl-token";
import { Connection, PublicKey, Signer, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction, TransactionInstruction } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, NATIVE_SOL_MINT, TOKEN_PROGRAM_ID, WRAPPED_SOL_MINT } from "../../utils/ids";
import { createTokenAccountIfNotExist, getTokenByMintAddress } from "./utils";
import BN from "bn.js";
import { TokenAmount } from "../../utils/safe-math";

const BufferLayout = require('buffer-layout');

export const getSwapTx = async (
  connection: Connection,
  owner: PublicKey,
  poolInfo: any,
  fromCoinMint: PublicKey,
  toCoinMint: PublicKey,
  fromTokenAccount: PublicKey,
  toTokenAccount: PublicKey,
  fromAmount: BN,
  toSwapAmount: BN,
  feeAccount: PublicKey,
  fee: BN

): Promise<{ transaction: Transaction, signers: Signer[] }> => {

  const tx = new Transaction()
  const signers = new Array<Signer>();
  const from = getTokenByMintAddress(fromCoinMint.toBase58());
  const to = getTokenByMintAddress(toCoinMint.toBase58());

  if (!from || !to) {
    throw new Error('Miss token info')
  }

  let wrappedSolAccount: PublicKey | null = null
  let wrappedSolAccount2: PublicKey | null = null

  if (fromCoinMint.equals(NATIVE_SOL_MINT)) {
    wrappedSolAccount = await createTokenAccountIfNotExist(
      connection,
      wrappedSolAccount,
      owner,
      WRAPPED_SOL_MINT.toBase58(),
      fromAmount.toNumber() + 1e7,
      tx,
      signers
    );
  }

  if (toCoinMint.equals(NATIVE_SOL_MINT)) {
    wrappedSolAccount2 = await createTokenAccountIfNotExist(
      connection,
      wrappedSolAccount2,
      owner,
      WRAPPED_SOL_MINT.toBase58(),
      1e7,
      tx,
      signers
    );
  }

  const fromMint = fromCoinMint.equals(NATIVE_SOL_MINT) ? WRAPPED_SOL_MINT : fromCoinMint;
  const toMint = toCoinMint.equals(NATIVE_SOL_MINT) ? WRAPPED_SOL_MINT : toCoinMint;
  const fromAccountTokenInfo = await connection.getAccountInfo(fromTokenAccount);

  if (!fromAccountTokenInfo) {
    tx.add(
      new TransactionInstruction({
        keys: [
          { pubkey: owner, isSigner: true, isWritable: true },
          { pubkey: fromTokenAccount, isSigner: false, isWritable: true },
          { pubkey: owner, isSigner: false, isWritable: false },
          { pubkey: fromMint, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        ],
        programId: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
    );
  }

  const toAccountTokenInfo = await connection.getAccountInfo(toTokenAccount);

  if (!toAccountTokenInfo) {
    tx.add(
      new TransactionInstruction({
        keys: [
          { pubkey: owner, isSigner: true, isWritable: true },
          { pubkey: fromTokenAccount, isSigner: false, isWritable: true },
          { pubkey: owner, isSigner: false, isWritable: false },
          { pubkey: toMint, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        ],
        programId: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
    );
  }

  tx.add(
    getSwapIx(
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
      wrappedSolAccount ?? fromTokenAccount,
      wrappedSolAccount2 ?? toTokenAccount,
      owner,
      fromAmount.toNumber(),
      toSwapAmount.toNumber()
    )
  )

  // Transfer fees
  const feeAccountMint = fromCoinMint.equals(NATIVE_SOL_MINT) ? WRAPPED_SOL_MINT : fromCoinMint;
  const feeAccountToken = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    feeAccountMint,
    feeAccount,
  );

  const feeAccountTokenInfo = await connection.getAccountInfo(feeAccountToken);

  if (!feeAccountTokenInfo) {
    tx.add(
      new TransactionInstruction({
        keys: [
          { pubkey: owner, isSigner: true, isWritable: true },
          { pubkey: feeAccountToken, isSigner: false, isWritable: true },
          { pubkey: feeAccount, isSigner: false, isWritable: false },
          { pubkey: feeAccountMint, isSigner: false, isWritable: false },
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
        owner,
        [],
        fee.toNumber()
      ),
      closeAccount({
        source: wrappedSolAccount,
        destination: owner,
        owner: owner
      })
    );
  } else {
    tx.add(
      Token.createTransferInstruction(
        TOKEN_PROGRAM_ID,
        fromTokenAccount,
        feeAccountToken,
        owner,
        [],
        fee.toNumber()
      )
    );
  }

  if (wrappedSolAccount2) {
    tx.add(
      closeAccount({
        source: wrappedSolAccount2,
        destination: owner,
        owner: owner
      })
    );
  }

  return { transaction: tx, signers };
}

export function getSwapIx(
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
  console.log('amountIn', amountIn);
  console.log('minAmountOut', minAmountOut);
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