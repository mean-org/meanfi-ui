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
import { NATIVE_SOL_MINT, WRAPPED_SOL_MINT } from "../../utils/ids";

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

    const poolConfig = Object.entries(OrcaPoolConfig).filter(c => c[1] === poolInfo.address)[0];
    this.currentPool = this.orcaSwap.getPool(poolConfig[1]);

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
 
    let tokenA = poolInfo.getTokenA() as OrcaPoolToken;
    let tokenB = poolInfo.getTokenB() as OrcaPoolToken;
    let tradeToken = cloneDeep(tokenA);

    if (from === tokenB.mint.toBase58() || to === tokenA.mint.toBase58()) {
      tradeToken = cloneDeep(tokenB);
    }

    const decimalTradeAmount = new Decimal(1);
    const decimalSlippage = new Decimal(slippage / 10);
    const quote = await poolInfo.getQuote(tradeToken, decimalTradeAmount, decimalSlippage);
    const protocol = PROTOCOLS.filter(p => p.address === ORCA.toBase58())[0];

    const exchangeInfo: ExchangeInfo = {
      fromAmm: protocol.name,
      outPrice: quote.getRate().toNumber(),
      priceImpact: quote.getPriceImpact().toNumber(),
      amountIn: amount,
      amountOut: quote.getExpectedOutputAmount().toNumber() * amount,
      minAmountOut: quote.getMinOutputAmount().toNumber() * amount,
      networkFees: quote.getNetworkFees().toNumber() / LAMPORTS_PER_SOL,
      protocolFees: quote.getLPFees().toNumber() * amount
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

    let inputToken = poolInfo.getTokenA() as OrcaPoolToken;
    let outputToken = poolInfo.getTokenB() as OrcaPoolToken;
    let tradeToken = cloneDeep(inputToken);

    if (from === outputToken.mint.toBase58() || to === tradeToken.mint.toBase58()) {
      tradeToken = cloneDeep(outputToken);
      outputToken = cloneDeep(inputToken);
    }

    const minimumOutAmount = amountOut * (100 - slippage) / 100;
    
    let tx = new Transaction();
    let sig: Signer[] = [];

    const fromMint = from === NATIVE_SOL_MINT.toBase58() ? WRAPPED_SOL_MINT : tradeToken.mint;
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
          lamports: minimumWrappedAccountBalance + (amountIn - feeAmount) * LAMPORTS_PER_SOL,
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
          account.publicKey,
          fromTokenAccount,
          owner,
          [],
          (amountIn - feeAmount) * LAMPORTS_PER_SOL
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

    const swapAmount = fromMint === WRAPPED_SOL_MINT ? (amountIn - feeAmount) : amountIn;

    let { transaction, signers } = await poolInfo.swap(
      owner, 
      tradeToken, 
      OrcaU64.fromNumber(swapAmount, tradeToken.scale),
      OrcaU64.fromNumber(minimumOutAmount, outputToken.scale)
    );

    tx.add(transaction);
    sig.push(...signers);

    // Transfer fees
    const feeAccount = new PublicKey(feeAddress);

    if (from === NATIVE_SOL_MINT.toBase58()) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: owner,
          toPubkey: feeAccount,
          lamports: feeAmount * LAMPORTS_PER_SOL
        })
      );

    } else {

      const fromTokenAccount = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        fromMint,
        owner,
        true
      );

      const feeBnAmount = new BN(feeAmount * 10 ** tradeToken.scale);
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
    }

    tx.feePayer = owner;
    const { blockhash } = await this.connection.getRecentBlockhash('recent');
    tx.recentBlockhash = blockhash;

    if (signers.length) {
      tx.partialSign(...sig);
    }

    return tx;
  };
}
