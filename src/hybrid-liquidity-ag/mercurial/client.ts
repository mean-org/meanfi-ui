import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { ExchangeInfo, LPClient, MERCURIAL } from "../types";
import { AMM_POOLS, PROTOCOLS } from "../data";
import { cloneDeep } from "lodash-es";
import { MercurialPoolInfo } from "./types";
import { MintLayout } from "@solana/spl-token"
import { SIMULATION_USER, StableSwapNPool } from "@mercurial-finance/stable-swap-n-pool";

export class MercurialClient implements LPClient {

    private connection: Connection;
    private currentPool: MercurialPoolInfo | undefined;
  
    constructor(connection: Connection) {
      this.connection = connection;
    }
  
    public get protocolAddress() : string {
      return MERCURIAL.toBase58(); 
    }
    
    public getPoolInfo = async (
      address: string
  
    ) => {
  
      try {

        const poolInfo = AMM_POOLS.filter(info => info.address === address)[0];
  
        if (!poolInfo) {
          throw new Error("Mercurial pool not found.");
        }

        const stablePool = await StableSwapNPool.load(
          this.connection,
          new PublicKey(poolInfo.address),
          SIMULATION_USER 
        );

        const tokenInfos = await this.connection.getMultipleAccountsInfo(
          poolInfo.tokenAddresses.map(t => new PublicKey(t)),
          this.connection.commitment
        );

        let tokens: any = {};
        let index = 0;

        for (let info of tokenInfos) {
          if (info) {
            const decoded = MintLayout.decode(info.data);
            tokens[poolInfo.tokenAddresses[index]] = decoded;
            index ++;
          }
        }

        const mercurialPool: MercurialPoolInfo = {
          name: poolInfo.name,
          stable: stablePool,
          protocol: MERCURIAL,
          simulatioUser: SIMULATION_USER,
          tokens
        };

        this.currentPool = mercurialPool;

        return this.currentPool;

      } catch (_error) {
        throw _error;
      }
    }

    public getExchangeInfo = async (
      from: string,
      to: string,
      amount: number,
      slippage: number
  
    ) => {
  
      const poolInfo = cloneDeep(this.currentPool);
  
      if (!poolInfo) {
        throw new Error("Mercurial pool not found.");
      }
        
      //TODO: Implement

      const fromMint = new PublicKey(from);
      const toMint = new PublicKey(to);
      const inAmount = amount === 0 ? 1 : amount;
      console.log('inAmount', inAmount);
      const { virtualPrice } = await poolInfo.stable.getVirtualPrice();
      const outPrice = virtualPrice / 10 ** 6;
      console.log('outAmount', inAmount * outPrice);      
      const minOutAmount = amount * outPrice * (100 - slippage) / 100;
      // const networkFee = poolInfo.stable.adminFeeNumerator / poolInfo.stable.amplificationCoefficient
      const protocol = PROTOCOLS.filter(p => p.address === MERCURIAL.toBase58())[0];
      
      const exchange: ExchangeInfo = {
        fromAmm: protocol.name,
        outPrice: outPrice,
        priceImpact: 0,
        amountIn: amount,
        amountOut: amount * outPrice,
        minAmountOut: minOutAmount,
        networkFees: 0,  
        protocolFees: 0
      };
  
      return exchange;    
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
      
      try {
  
        const poolInfo = cloneDeep(this.currentPool);
  
        if (!poolInfo) {
          throw new Error("Mercurial pool not found.");
        }
  
        throw new Error('Not implemented');
  
      } catch (_error) {
        throw _error;
      }
  
    };
  
  }