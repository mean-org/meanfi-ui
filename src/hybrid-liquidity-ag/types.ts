import { PublicKey, Transaction } from "@solana/web3.js"

export const MSP_OPS = new PublicKey(
  'CLazQV1BhSrxfgRHko4sC8GYBU3DoHcX4xxRZd12Kohr'
)

export const RAYDIUM = new PublicKey(
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'
);

export const ORCA = new PublicKey(
  '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP'
);

export const SABER = new PublicKey(
  'SSwpkEEcbUqx4vtoEByFjSkhKdCT862DNVb52nZg1UZ'
);

export const MERCURIAL = new PublicKey(
  'MERLuDFBMmsHnsBPZw2sDQZHvXFMwp8EdjudcU2HKky'
);

export const SERUM = new PublicKey(
  '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'
);


export type ChainInfo = {
  id: number;
  name: string;
}

export type TokenInfo = {
  chainId: number,
  address: string,
  name: string,
  symbol: string,
  decimals: number,
  logoURI: string
}

export type ProtocolInfo = {
  address: string,
  name: string
}

export type AmmPoolInfo = {
  chainId: number,
  name: string,
  address: string,
  protocolAddress: string,
  ammAddress: string,
  tokenAddresses: string[]  
}

export type ExchangeInfo = {
  fromAmm: string | undefined,
  amountIn: number | undefined,
  amountOut: number | undefined,
  minAmountOut: number | undefined,
  outPrice: number | undefined,
  priceImpact: number | undefined
  protocolFees: number,
  networkFees: number
}

export type FeesInfo = {
  protocol: number,
  network: number,
  aggregator: number,
  total: number
}

export type HlaInfo = {
  exchangeRate: number,
  protocolFees: number,
  aggregatorPercentFees: number,
  remainingAccounts: PublicKey[]
}

export interface Client {

  protocolAddress: string;

  getExchangeInfo: (
    from: string,
    to: string,
    amount: number,
    slippage: number

  ) => Promise<ExchangeInfo>

  getSwap(
    owner: PublicKey,
    from: string, 
    to: string, 
    amountIn: number,
    amountOut: number,
    slippage: number,
    feeAddress: string,
    feeAmount: number

  ): Promise<Transaction>
}

export interface LPClient extends Client {

  getPoolInfo(address: string): Promise<any | undefined>

  hlaExchangeAccounts: PublicKey[]

}
