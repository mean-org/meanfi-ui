import { 
  Connection, 
  Keypair, 
  LAMPORTS_PER_SOL, 
  PublicKey, 
  Signer, 
  SystemProgram, 
  Transaction

} from "@solana/web3.js";

import { getOrca, Orca, OrcaPoolConfig, OrcaPoolToken, OrcaU64 } from "@orca-so/sdk";
import { LPClient, ExchangeInfo, ORCA } from "../types";
import { AccountLayout, ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { AMM_POOLS, PROTOCOLS } from "../data";
import { cloneDeep } from "lodash";
import { BN } from "bn.js";
import Decimal from "decimal.js";
import { WRAPPED_SOL_MINT } from "../../utils/ids";

export class OrcaClient implements LPClient {

  private connection: Connection;
  private orcaSwap: Orca;
  private currentPool: any;

  constructor(connection: Connection) {
    this.connection = connection;
    this.orcaSwap = getOrca(this.connection);
  }

  public get protocolAddress() : string {
    return ORCA.toBase58(); 
  }

  public getPoolInfo = async (
    address: string

  ) => {

    const poolInfo = AMM_POOLS.filter(info => info.address === address)[0];

    if (!poolInfo) {
      throw new Error("Orca pool not found.");
    }

    this.currentPool = poolInfo;

    return this.currentPool;
  }

  public getExchangeInfo = async (
    from: string,
    to: string,
    amount: number,
    slippage: number

  ): Promise<ExchangeInfo> => {
    
    const poolInfo = cloneDeep(this.currentPool);

    if (!poolInfo) {
      throw new Error("Orca pool not found.");
    }

    const poolConfig = Object.entries(OrcaPoolConfig).filter(c => c[1] === poolInfo.address)[0];
    const pool = this.orcaSwap.getPool(poolConfig[1]);    
    let tokenA = pool.getTokenA() as OrcaPoolToken;
    let tokenB = pool.getTokenB() as OrcaPoolToken;
    let tradeToken = cloneDeep(tokenA);

    if (from === tokenB.mint.toBase58() || to === tokenA.mint.toBase58()) {
      tradeToken = cloneDeep(tokenB);
    }

    const decimalTradeAmount = new Decimal(amount === 0 ? 1 : amount);
    const decimalSlippage = new Decimal(slippage / 10);
    const quote = await pool.getQuote(tradeToken, decimalTradeAmount, decimalSlippage);
    const protocol = PROTOCOLS.filter(p => p.address === ORCA.toBase58())[0];

    const exchangeInfo: ExchangeInfo = {
      fromAmm: protocol.name,
      outPrice: quote.getRate().toNumber(),
      priceImpact: quote.getPriceImpact().toNumber(),
      amountIn: amount,
      amountOut: quote.getExpectedOutputAmount().toNumber(),
      minAmountOut: quote.getMinOutputAmount().toNumber(),
      networkFees: quote.getNetworkFees().toNumber() / LAMPORTS_PER_SOL,
      protocolFees: quote.getLPFees().toNumber()
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

    const poolInfo = cloneDeep(this.currentPool);

    if (!poolInfo) {
      throw new Error("Orca pool not found.");
    }

    const poolConfig = Object.entries(OrcaPoolConfig).filter(c => c[1] === poolInfo.address)[0];
    const pool = this.orcaSwap.getPool(poolConfig[1]);
    let inputToken = pool.getTokenA() as OrcaPoolToken;
    let outputToken = pool.getTokenB() as OrcaPoolToken;
    let tradeToken = cloneDeep(inputToken);

    if (from === outputToken.mint.toBase58() || to === inputToken.mint.toBase58()) {
      tradeToken = outputToken;
      outputToken = inputToken;
    }

    const minimumOutAmount = amountOut * (100 - slippage) / 100;
    
    let tx = new Transaction();
    let sig: Signer[] = [];

    const fromMint = from === WRAPPED_SOL_MINT.toBase58() ? WRAPPED_SOL_MINT : tradeToken.mint;
    const fromTokenAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      fromMint,
      owner,
      true
    );

    if (fromMint.equals(WRAPPED_SOL_MINT)) {

      const minimumWrappedAccountBalance = await Token.getMinBalanceRentForExemptAccount(this.connection);
      const account = Keypair.generate();

      tx.add(
        SystemProgram.createAccount({
          fromPubkey: owner,
          newAccountPubkey: account.publicKey,
          lamports: minimumWrappedAccountBalance,
          space: AccountLayout.span,
          programId: TOKEN_PROGRAM_ID,
        }),
        Token.createInitAccountInstruction(
          TOKEN_PROGRAM_ID,
          WRAPPED_SOL_MINT,
          account.publicKey,
          owner
        ),
        Token.createTransferInstruction(
          TOKEN_PROGRAM_ID,
          fromTokenAccount,
          account.publicKey,
          owner,
          [],
          amountIn * LAMPORTS_PER_SOL
        ),
        Token.createCloseAccountInstruction(
          TOKEN_PROGRAM_ID,
          account.publicKey,
          owner,
          owner,
          []
        )
      );

      sig.push(account);
    }

    let { transaction, signers } = await pool.swap(
      owner, 
      tradeToken, 
      OrcaU64.fromNumber(amountIn, tradeToken.scale),
      OrcaU64.fromNumber(minimumOutAmount, outputToken.scale)
    );

    tx.add(transaction);
    sig.push(...signers);

    const feeBnAmount = new BN(feeAmount * 10 ** tradeToken.scale);
    // Transfer fees
    const feeAccount = new PublicKey(feeAddress);
    const feeAccountToken = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      fromMint,
      feeAccount,
      true
    );

    const feeAccountTokenInfo = await this.connection.getAccountInfo(feeAccountToken);

    if (!feeAccountTokenInfo) {
      tx.add(
        Token.createAssociatedTokenAccountInstruction(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          fromMint,
          feeAccountToken,
          feeAccount,
          owner
        )
      );
    }

    tx.add(
      Token.createTransferInstruction(
        TOKEN_PROGRAM_ID,
        fromTokenAccount,
        feeAccountToken,
        owner,
        [],
        feeBnAmount.toNumber()
      )
    );

    tx.feePayer = owner;
    const { blockhash } = await this.connection.getRecentBlockhash(this.connection.commitment);
    tx.recentBlockhash = blockhash;

    if (signers.length) {
      tx.partialSign(...sig);
    }

    return tx;
  };
}
