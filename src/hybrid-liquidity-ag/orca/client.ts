import { 
  AccountMeta,
  Connection, 
  Keypair, 
  LAMPORTS_PER_SOL, 
  PublicKey, 
  Signer, 
  SystemProgram, 
  Transaction

} from "@solana/web3.js";

import { getOrca, Orca, OrcaPoolConfig, OrcaPoolToken, ORCA_TOKEN_SWAP_ID, U64Utils } from "@orca-so/sdk";
import { LPClient, ExchangeInfo, ORCA } from "../types";
import { AccountLayout, ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { AMM_POOLS, PROTOCOLS } from "../data";
import { cloneDeep } from "lodash";
import Decimal from "decimal.js";
import { NATIVE_SOL_MINT, WRAPPED_SOL_MINT } from "../../utils/ids";
import { TokenSwap } from "@solana/spl-token-swap";
import BN from "bn.js";

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

  public get hlaExchangeAccounts(): AccountMeta[] {
    return [];
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

    const fromMint = from === NATIVE_SOL_MINT.toBase58() ? WRAPPED_SOL_MINT : new PublicKey(from);
    const toMint = to === NATIVE_SOL_MINT.toBase58() ? WRAPPED_SOL_MINT : new PublicKey(to);

    let inputToken = poolInfo.getTokenA() as OrcaPoolToken;
    let outputToken = poolInfo.getTokenB() as OrcaPoolToken;
    let tradeToken = cloneDeep(inputToken);

    if (fromMint.equals(outputToken.mint)) {
      tradeToken = cloneDeep(outputToken);
      outputToken = cloneDeep(inputToken);
    }
    
    let tx = new Transaction();
    let sig: Signer[] = [];

    const fromTokenAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      fromMint,
      owner,
      true
    );

    const fromTokenAccountInfo = await this.connection.getAccountInfo(fromTokenAccount);

    if (!fromTokenAccountInfo) {
      tx.add(
        Token.createAssociatedTokenAccountInstruction(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          fromMint,
          fromTokenAccount,
          owner,
          owner
        )
      )
    }

    let fromWrapAccount: Keypair | undefined;
    let toWrapAccount: Keypair | undefined;

    if (fromMint.equals(WRAPPED_SOL_MINT)) {

      fromWrapAccount = Keypair.generate();
      const minimumWrappedAccountBalance = await Token.getMinBalanceRentForExemptAccount(this.connection);

      tx.add(
        SystemProgram.createAccount({
          fromPubkey: owner,
          newAccountPubkey: fromWrapAccount.publicKey,
          lamports: minimumWrappedAccountBalance + amountIn * LAMPORTS_PER_SOL,
          space: AccountLayout.span,
          programId: TOKEN_PROGRAM_ID,
        }),
        Token.createInitAccountInstruction(
          TOKEN_PROGRAM_ID,
          WRAPPED_SOL_MINT,
          fromWrapAccount.publicKey,
          owner
        )
      );

      sig.push(fromWrapAccount);
    }

    const toTokenAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      toMint,
      owner,
      true
    );

    const toTokenAccountInfo = await this.connection.getAccountInfo(toTokenAccount);

    if (!toTokenAccountInfo) {
      tx.add(
        Token.createAssociatedTokenAccountInstruction(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          toMint,
          toTokenAccount,
          owner,
          owner
        )
      )
    }

    if (toMint.equals(WRAPPED_SOL_MINT)) {

      const minimumWrappedAccountBalance = await Token.getMinBalanceRentForExemptAccount(this.connection);
      toWrapAccount = Keypair.generate();

      tx.add(
        SystemProgram.createAccount({
          fromPubkey: owner,
          newAccountPubkey: toWrapAccount.publicKey,
          lamports: minimumWrappedAccountBalance,
          space: AccountLayout.span,
          programId: TOKEN_PROGRAM_ID,
        }),
        Token.createInitAccountInstruction(
          TOKEN_PROGRAM_ID,
          WRAPPED_SOL_MINT,
          toWrapAccount.publicKey,
          owner
        )
      );

      sig.push(toWrapAccount);
    }

    const minimumOutAmount = amountOut * (100 - slippage) / 100;
    const userTransferAuthority = Keypair.generate();

    tx.add(
      Token.createApproveInstruction(
        TOKEN_PROGRAM_ID,
        fromWrapAccount ? fromWrapAccount.publicKey : fromTokenAccount,
        userTransferAuthority.publicKey,
        owner,
        [],
        amountIn * 10 ** tradeToken.scale
      )
    );

    sig.push(userTransferAuthority);

    const [authorityForPoolAddress] = await PublicKey.findProgramAddress(
      [poolInfo.poolParams.address.toBuffer()],
      ORCA_TOKEN_SWAP_ID
    );
  
    tx.add(
      TokenSwap.swapInstruction(
        poolInfo.poolParams.address,
        authorityForPoolAddress,
        userTransferAuthority.publicKey,
        fromWrapAccount ? fromWrapAccount.publicKey : fromTokenAccount,
        tradeToken.addr,
        outputToken.addr,
        toWrapAccount ? toWrapAccount.publicKey : toTokenAccount,
        poolInfo.poolParams.poolTokenMint,
        poolInfo.poolParams.feeAccount,
        null,
        ORCA_TOKEN_SWAP_ID,
        TOKEN_PROGRAM_ID,
        U64Utils.toTokenU64(new Decimal(amountIn), tradeToken, "amountIn"),
        U64Utils.toTokenU64(new Decimal(minimumOutAmount), outputToken, "minimumAmountOut")
      )
    );

    if (fromWrapAccount) {
      tx.add(
        Token.createCloseAccountInstruction(
          TOKEN_PROGRAM_ID,
          fromWrapAccount.publicKey,
          owner,
          owner,
          []
        )
      );
    }

    if (toWrapAccount) {
      tx.add(
        Token.createCloseAccountInstruction(
          TOKEN_PROGRAM_ID,
          toWrapAccount.publicKey,
          owner,
          owner,
          []
        )
      );
    }

    // Transfer fees
    const feeAccount = new PublicKey(feeAddress);
    const feeBnAmount = new BN(parseFloat(feeAmount.toFixed(tradeToken.scale)) * 10 ** tradeToken.scale);

    if (from === NATIVE_SOL_MINT.toBase58()) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: owner,
          toPubkey: feeAccount,
          lamports: feeBnAmount.toNumber()
        })
      );

    } else {

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
    const { blockhash } = await this.connection.getRecentBlockhash(this.connection.commitment);
    tx.recentBlockhash = blockhash;

    if (sig.length) {
      tx.partialSign(...sig);
    }

    return tx;
  };
}
