import { Market } from "@project-serum/serum";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { ExchangeInfo, SERUM } from "../types";
import { getMarkets } from "./markets";
import { SerumClient as Client } from "./types";

export class SerumClient implements Client {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  public get protocolAddress(): string {
    return SERUM.toBase58();
  }

  public getExchangeInfo = async (
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
    throw new Error("Method not implemented.");
  };

  public getMarketInfo = async (
    from: string,
    to: string
    
  ): Promise<Market | undefined> => {

    

    return undefined;
  };
}