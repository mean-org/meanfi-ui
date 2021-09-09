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
  name: string,
  fee: number
}

export type AmmPoolInfo = {
  chainId: number,
  name: string,
  address: string,
  protocolAddress: string,
  ammAddress: string,
  tokenAddresses: string[]  
}

export enum ProtocolAddress {
  Raydium = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  Orca = '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP'
}

export type ExchangeInfo = {
  outAmount: number,
  outMinimumAmount: number, // including the slippage
  outPrice: number,
  priceImpact: number,
  ammPool: string,
  route: string[]
}
