import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Client, ExchangeInfo, RAYDIUM } from "../types";
import { getSwapOutAmount, getSwapTx } from "./swap";
import { createAmmAuthority, getLpMintDecimals, getTokenByMintAddress } from "./utils";
import { getTokensPools } from "../utils";
import { PROTOCOLS } from "../data";
import { AMM_INFO_LAYOUT_V4 } from "../../utils/layouts";
import { LIQUIDITY_POOL_PROGRAM_ID_V4, NATIVE_SOL_MINT, SERUM_PROGRAM_ID_V3, WRAPPED_SOL_MINT } from "../../utils/ids";
import { getMarkets } from "../serum/markets";
import { LiquidityPoolInfo } from "./types";
import { BN } from "bn.js";
import { LP_TOKENS, TOKENS } from "../../utils/tokens";

export class RaydiumClient implements Client {
  
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  public get protocolAddress(): string {
    return RAYDIUM.toBase58();
  }

  public getExchangeInfo = async (
    from: string,
    to: string,
    amount: number,
    slippage: number

  ): Promise<ExchangeInfo> => {

    const pool = getTokensPools(from, to, RAYDIUM.toBase58())[0];

    if (!pool) {
      throw new Error('Raydium pool not found');
    }

    const poolInfo = await this.getPoolInfo(pool.address);

    if (!poolInfo) {
      throw new Error('Raydium pool info not found');
    }

    const priceAmount = 1;
    const { 
      amountOut, 
      amountOutWithSlippage, 
      priceImpact

    } = getSwapOutAmount(poolInfo, from, to, priceAmount.toString(), slippage);

    const protocol = PROTOCOLS.filter(p => p.address === pool.protocolAddress)[0];
    const exchangeInfo: ExchangeInfo = {
      ammPool: pool.address,
      outPrice: !amountOut.isNullOrZero() ? amountOut.fixed(): '0',
      priceImpact,
      outAmount: (+amountOut.fixed() * amount).toFixed(amountOut.decimals),
      outMinimumAmount: (+amountOutWithSlippage.fixed() * amount).toFixed(amountOut.decimals),
      networkFees: protocol.networkFee.toFixed(9),
      protocolFees: protocol.txFee
    };

    return exchangeInfo;
  };

  public getTokens = (): Promise<Map<string, any>> => {
    throw new Error("Method not implemented.");
  };

  public getSwap = async (
    owner: PublicKey,
    from: string,
    to: string,
    amountIn: number,
    amountOut: number,
    slippage: number,
    feeAddress: string,
    feeAmount: number

  ): Promise<Transaction> => {

    const pool = getTokensPools(from, to, RAYDIUM.toBase58())[0];

    if (!pool) {
      throw new Error('Raydium pool not found');
    }

    const poolInfo = await this.getPoolInfo(pool.address);

    if (!poolInfo) {
      throw new Error('Raydium pool info not found');
    }

    const fromMintToken = getTokenByMintAddress(from);
    const toMintToken = getTokenByMintAddress(to);
    
    const fromDecimals = fromMintToken ? fromMintToken.decimals : 6;    
    const fromAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      new PublicKey(from),
      owner,
      true
    );

    const toDecimals = toMintToken ? toMintToken.decimals : 6;
    const toAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      new PublicKey(to),
      owner,
      true
    );

    const toSwapAmount = amountOut * (100 - slippage) / 100;
    
    let { transaction, signers } = await getSwapTx(
      this.connection,
      owner,
      poolInfo, // poolInfo,
      new PublicKey(from),
      new PublicKey(to),
      fromAccount,
      toAccount,
      new BN(amountIn * 10 ** fromDecimals),
      new BN(toSwapAmount * 10 ** toDecimals),
      new PublicKey(feeAddress),
      new BN(feeAmount * 10 ** fromDecimals)
    );

    transaction.feePayer = owner;
    const { blockhash } = await this.connection.getRecentBlockhash(this.connection.commitment);
    transaction.recentBlockhash = blockhash;

    if (signers.length) {
      transaction.partialSign(...signers);
    }

    return transaction;
  };

  private getPoolInfo = async (
    address: string
  ): Promise<LiquidityPoolInfo | undefined> => {

    const poolKey = new PublicKey(address);
    const poolInfo = await this.connection.getAccountInfo(poolKey);

    if (!poolInfo) { return undefined; }

    const marketToLayout = await getMarkets(this.connection);
    const ammLayout = AMM_INFO_LAYOUT_V4.decode(Buffer.from(poolInfo.data));

    if (
      ammLayout.pcMintAddress.toString() === ammLayout.serumMarket.toString() ||
      ammLayout.lpMintAddress.toString() === NATIVE_SOL_MINT.toString()
    ) {
      return undefined;
    }

    const lpMintDecimals = await getLpMintDecimals(
      this.connection, 
      ammLayout.lpMintAddress.toString()
    );

    const fromCoin = ammLayout.coinMintAddress.equals(WRAPPED_SOL_MINT)
      ? NATIVE_SOL_MINT.toBase58()
      : ammLayout.coinMintAddress.toString();
      
    const toCoin = ammLayout.pcMintAddress.equals(WRAPPED_SOL_MINT)
      ? NATIVE_SOL_MINT.toBase58()
      : ammLayout.pcMintAddress.toString();
    
    let coin = Object
      .values(TOKENS)
      .filter((item) => item.address === fromCoin)[0];

    let pc = Object
      .values(TOKENS)
      .filter((item) => item.address === toCoin)[0];

    if (coin.address === WRAPPED_SOL_MINT.toBase58()) {
      coin.symbol = 'SOL'
      coin.name = 'SOL'
      coin.address = NATIVE_SOL_MINT.toBase58()
    }

    if (pc.address === WRAPPED_SOL_MINT.toBase58()) {
      pc.symbol = 'SOL'
      pc.name = 'SOL'
      pc.address = NATIVE_SOL_MINT.toBase58()
    }
    
    const lp = Object.values(LP_TOKENS).find((item) => item.address === ammLayout.lpMintAddress) ?? {
      symbol: `${coin.symbol}-${pc.symbol}`,
      name: `${coin.symbol}-${pc.symbol}`,
      coin,
      pc,
      address: ammLayout.lpMintAddress.toString(),
      decimals: lpMintDecimals
    };

    const { publicKey } = await createAmmAuthority(new PublicKey(LIQUIDITY_POOL_PROGRAM_ID_V4));
    const market = marketToLayout[ammLayout.serumMarket];

    const serumVaultSigner = await PublicKey.createProgramAddress(
      [ammLayout.serumMarket.toBuffer(), market.vaultSignerNonce.toArrayLike(Buffer, 'le', 8)],
      new PublicKey(SERUM_PROGRAM_ID_V3)
    );

    const liquidityPool: LiquidityPoolInfo = {
      name: `${coin.symbol}-${pc.symbol}`,
      coin,
      pc,
      lp,
      version: 4,
      programId: LIQUIDITY_POOL_PROGRAM_ID_V4,
      ammId: ammLayout.publicKey.toString(),
      ammAuthority: publicKey.toString(),
      ammOpenOrders: ammLayout.ammOpenOrders.toString(),
      ammTargetOrders: ammLayout.ammTargetOrders.toString(),
      ammQuantities: NATIVE_SOL_MINT.toBase58(),
      poolCoinTokenAccount: ammLayout.poolCoinTokenAccount.toString(),
      poolPcTokenAccount: ammLayout.poolPcTokenAccount.toString(),
      poolWithdrawQueue: ammLayout.poolWithdrawQueue.toString(),
      poolTempLpTokenAccount: ammLayout.poolTempLpTokenAccount.toString(),
      serumProgramId: SERUM_PROGRAM_ID_V3,
      serumMarket: ammLayout.serumMarket.toString(),
      serumBids: market.bids.toString(),
      serumAsks: market.asks.toString(),
      serumEventQueue: market.eventQueue.toString(),
      serumCoinVaultAccount: market.baseVault.toString(),
      serumPcVaultAccount: market.quoteVault.toString(),
      serumVaultSigner: serumVaultSigner.toString(),
      official: false
    };
    
    return liquidityPool;
  };
}
