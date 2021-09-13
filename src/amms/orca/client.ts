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

import { getOrca, Orca, OrcaPoolConfig } from "@orca-so/sdk";
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
    const decimalSlippage = new Decimal(slippage);
    const quote = await pool.getQuote(tradeToken, decimalTradeAmount, decimalSlippage);
    const protocol = PROTOCOLS.filter(p => p.address === ORCA.toBase58())[0];

    const exchangeInfo: ExchangeInfo = {
      origin: protocol.name,
      outPrice: quote.getRate().toNumber(),
      priceImpact: quote.getPriceImpact().toNumber(),
      outAmount: quote.getExpectedOutputAmount().toNumber(),
      outMinimumAmount: quote.getMinOutputAmount().toNumber(),
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

    const pools = getTokensPools(from, to, ORCA.toBase58());

    if (!pools.length) {
      throw new Error("Orca pool not found.");
    }

    const address = pools[0].address;
    const poolConfig = Object.entries(OrcaPoolConfig).filter(c => c[1] === address)[0];
    const pool = this.orcaSwap.getPool(poolConfig[1]);
    const inputToken = pool.getTokenA();
    const decimalAmountIn = new Decimal(amountIn);
    const decimalMinimumOutAmount = new Decimal(amountOut * (100 - slippage) / 100);

    let swapTx = new Transaction();
    const { transaction, signers } = await pool.swap(
      owner, 
      inputToken, 
      decimalAmountIn, 
      decimalMinimumOutAmount
    );

    const fromMint = from === NATIVE_SOL_MINT.toBase58() ? WRAPPED_SOL_MINT : new PublicKey(from);
    let fromAccountToken: any;
    let wrappedAccount: Keypair | null = null;
    const fee = new BN(feeAmount * 10 ** inputToken.scale);

    if (fromMint.equals(NATIVE_SOL_MINT)) {

      console.log('wrapped');
      wrappedAccount = Keypair.generate();

      swapTx.add(
        SystemProgram.createAccount({
          fromPubkey: owner,
          newAccountPubkey: wrappedAccount.publicKey,
          lamports: fee.toNumber() + 1e7,
          space: ACCOUNT_LAYOUT.span,
          programId: TOKEN_PROGRAM_ID,
        }),
        Token.createInitAccountInstruction(
          TOKEN_PROGRAM_ID,
          WRAPPED_SOL_MINT,
          wrappedAccount.publicKey,
          owner
        )
      );

      signers.push(wrappedAccount);
      swapTx.add(transaction);

    } else {

      fromAccountToken = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        fromMint,
        owner,
        true
      );
    }

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
      swapTx.add(
        Token.createAssociatedTokenAccountInstruction(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          fromMint,
          feeAccountToken,
          feeAccount,
          owner
        ),
        Token.createTransferInstruction(
          TOKEN_PROGRAM_ID,
          wrappedAccount ? wrappedAccount.publicKey : fromAccountToken,
          feeAccountToken,
          owner,
          [],
          fee.toNumber()
        )
      );
    }

    if (fromMint.equals(NATIVE_SOL_MINT) && wrappedAccount) {
      swapTx.add(
        Token.createCloseAccountInstruction(
          TOKEN_PROGRAM_ID,
          wrappedAccount.publicKey,
          owner,
          owner,
          []
        )
      );
    }

    swapTx.feePayer = owner;
    const { blockhash } = await this.connection.getRecentBlockhash(this.connection.commitment);
    swapTx.recentBlockhash = blockhash;

    if (signers.length) {
      // swapTx.partialSign(...signers);
    }

    console.log('swapTx', swapTx);

    return swapTx;
  };
}
