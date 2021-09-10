import { Connection, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction, TransactionInstruction } from "@solana/web3.js";
import { deserializeAccount, getOrca, Orca, OrcaPoolConfig } from "@orca-so/sdk";
import { Client, ExchangeInfo, ORCA } from "../types";
import { getTokensPools } from "../utils";
import Decimal from "decimal.js";
import { AccountInfo as TokenAccountInfo, ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { BN } from "bn.js";
import { PROTOCOLS } from "../data";

export class OrcaClient implements Client {

  private connection: Connection;
  private orcaSwap: Orca;

  constructor(connection: Connection) {
    this.connection = connection;
    this.orcaSwap = getOrca(this.connection);
  }

  public get protocolAddress() : string {
    return ORCA.toBase58(); 
  }  

  public getExchangeInfo = async (
    from: string,
    to: string,
    amount: number,
    slippage: number

  ): Promise<ExchangeInfo> => {
    
    const pools = getTokensPools(from, to, ORCA.toBase58());

    if (!pools.length) {
      throw new Error("Orca pool not found.");
    }

    const poolConfig = Object.entries(OrcaPoolConfig).filter(c => c[1] === pools[0].address)[0];
    const pool = this.orcaSwap.getPool(poolConfig[1]);
    const tokenA = pool.getTokenA();
    const decimalAmount = new Decimal(parseFloat(amount.toFixed(tokenA.scale)));
    const decimalSlippage = new Decimal(parseFloat(slippage.toFixed(2)));
    const protocol = PROTOCOLS.filter(p => p.address === this.protocolAddress)[0];
    const quote = await pool.getQuote(tokenA, decimalAmount, decimalSlippage);

    const exchangeInfo: ExchangeInfo = {
      ammPool: pools[0].address,
      outPrice: quote.getRate().toNumber(),
      priceImpact: quote.getPriceImpact().toNumber(),
      outAmount: quote.getExpectedOutputAmount().toNumber(),
      outMinimumAmount: quote.getMinOutputAmount().toNumber(),
      networkFees: protocol.networkFee || quote.getNetworkFees().toNumber(),
      protocolFees: protocol.txFee || quote.getLPFees().toNumber()
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

    const pools = getTokensPools(from, to, ORCA.toBase58());

    if (!pools.length) {
      throw new Error("Orca pool not found.");
    }

    const address = pools[0].address;
    const poolConfig = Object.entries(OrcaPoolConfig).filter(c => c[1] === address)[0];
    const pool = this.orcaSwap.getPool(poolConfig[1]);
    const inputToken = pool.getTokenA();
    const outputToken = pool.getTokenB();

    const decimalAmountIn = new Decimal(
      parseFloat(amountIn.toFixed(inputToken.scale))
    );

    const decimalMinimumOutAmount = new Decimal(
      parseFloat((amountOut * (100 - slippage) / 100).toFixed(outputToken.scale))
    );

    const { transaction, signers } = await pool.swap(
      owner, 
      inputToken, 
      decimalAmountIn, 
      decimalMinimumOutAmount
    );

    // Transfer fees
    const feeAccount = new PublicKey(feeAddress);
    const feeAccountToken = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      new PublicKey(from),
      feeAccount,
    );

    const feeAccountTokenInfo = await this.connection.getAccountInfo(feeAccountToken);

    if (!feeAccountTokenInfo) {
      transaction.add(
        new TransactionInstruction({
          keys: [
            { pubkey: owner, isSigner: true, isWritable: true },
            { pubkey: feeAccountToken, isSigner: false, isWritable: true },
            { pubkey: feeAccount, isSigner: false, isWritable: false },
            { pubkey: new PublicKey(from), isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
          ],
          programId: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
      );
    }

    const fee = new BN(feeAmount * 10 ** inputToken.scale);

    transaction.add(
      Token.createTransferInstruction(
        TOKEN_PROGRAM_ID,
        new PublicKey(from),
        feeAccountToken,
        owner,
        [],
        fee.toNumber()
      )
    );

    transaction.feePayer = owner;
    const { blockhash } = await this.connection.getRecentBlockhash(this.connection.commitment);
    transaction.recentBlockhash = blockhash;

    if (signers.length) {
      transaction.partialSign(...signers);
    }

    return transaction;
  };

  private getPoolInfo = async (address: string): Promise<TokenAccountInfo | undefined> => {

    const poolKey = new PublicKey(address);
    const poolInfo = await this.connection.getAccountInfo(poolKey, this.connection.commitment);

    if (!poolInfo) { return undefined; }

    return deserializeAccount(poolInfo.data);
  }
}
