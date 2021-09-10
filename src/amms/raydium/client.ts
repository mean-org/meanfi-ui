import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { AccountInfo as TokenAccountInfo, ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Client, ExchangeInfo, RAYDIUM } from "../types";
import { getSwapTx } from "./swap";
import { BN } from "bn.js";
import { getTokenByMintAddress } from "./utils";
import { getTokensPools } from "../utils";

export class RaydiumClient implements Client {
  
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  public get protocolAddress(): string {
    return RAYDIUM.toBase58();
  }

  public getPoolInfo = (
    address: string
  ): Promise<TokenAccountInfo | undefined> => {
    throw new Error("Method not implemented.");
  };

  public getExchangeInfo = (
    from: string,
    to: string,
    amount: number,
    slippage: number

  ): Promise<ExchangeInfo> => {
    throw new Error("Method not implemented.");
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
      owner
    );

    const toDecimals = toMintToken ? toMintToken.decimals : 6;
    const toAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      new PublicKey(to),
      owner
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
}
