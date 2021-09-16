import { 
  Connection, 
  Keypair, 
  LAMPORTS_PER_SOL, 
  PublicKey, 
  Signer, 
  SystemProgram, 
  SYSVAR_RENT_PUBKEY, 
  Transaction, 
  TransactionInstruction

} from "@solana/web3.js";

import { getOrca, Orca, OrcaPoolConfig, OrcaU64, ORCA_TOKEN_SWAP_ID, resolveOrCreateAssociatedTokenAddress, U64Utils } from "@orca-so/sdk";
import { LPClient, ExchangeInfo, ORCA } from "../types";
import { getTokensPools } from "../utils";
import { ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { AMM_POOLS, PROTOCOLS } from "../data";
import { OrcaPoolToken } from "@orca-so/sdk/dist/model/orca/pool/pool-types";
import { cloneDeep } from "lodash";
import { BN } from "bn.js";
import Decimal from "decimal.js";
import { NATIVE_SOL_MINT, WRAPPED_SOL_MINT } from "../../utils/ids";
import { ACCOUNT_LAYOUT } from "../../utils/layouts";
import { TokenSwap } from "@solana/spl-token-swap";
import { orcaPoolConfigs } from "@orca-so/sdk/dist/constants/pools";

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

    const decimalTradeAmount = new Decimal(amount);
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

    let { transaction, signers } = await pool.swap(
      owner, 
      tradeToken, 
      OrcaU64.fromNumber(amountIn, tradeToken.scale),
      OrcaU64.fromNumber(minimumOutAmount, outputToken.scale)
    );

    const fromMint = from === NATIVE_SOL_MINT.toBase58() ? WRAPPED_SOL_MINT : tradeToken.mint;
    const feeBnAmount = new BN(feeAmount * 10 ** tradeToken.scale);
    let wrappedSolAccount: Keypair | null = null;

    if (from === NATIVE_SOL_MINT.toBase58()) {

      wrappedSolAccount = Keypair.generate();

      transaction.add(
        SystemProgram.createAccount({
          fromPubkey: owner,
          newAccountPubkey: wrappedSolAccount.publicKey,
          lamports: feeBnAmount.toNumber() + 1e7,
          space: ACCOUNT_LAYOUT.span,
          programId: TOKEN_PROGRAM_ID,
        }),
        Token.createInitAccountInstruction(
          TOKEN_PROGRAM_ID,
          WRAPPED_SOL_MINT,
          wrappedSolAccount.publicKey,
          owner
        )
      );

      signers.push(wrappedSolAccount);
    }

    const fromTokenAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      fromMint,
      owner,
      true
    );

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
      transaction.add(
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

    if (wrappedSolAccount) {
      transaction.add(
        Token.createTransferInstruction(
          TOKEN_PROGRAM_ID,
          wrappedSolAccount.publicKey,
          feeAccountToken,
          owner,
          [],
          feeBnAmount.toNumber()
        ),
        Token.createCloseAccountInstruction(
          TOKEN_PROGRAM_ID,
          wrappedSolAccount.publicKey,
          owner,
          owner,
          []
        )
      );
    } else {
      transaction.add(
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

    transaction.feePayer = owner;
    const { blockhash } = await this.connection.getRecentBlockhash(this.connection.commitment);
    transaction.recentBlockhash = blockhash;

    if (signers.length) {
      transaction.partialSign(...signers);
    }

    return transaction;
  };
}
