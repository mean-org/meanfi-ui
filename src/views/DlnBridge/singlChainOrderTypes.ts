interface Tx {
  data: string;
}

interface TokenIn {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  amount: string;
}

interface TokenOut {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  minAmount: string;
  amount: string;
}

interface Estimation {
  tokenIn: TokenIn;
  tokenOut: TokenOut;
}

export interface SwapEstimationResponse {
  estimation: Estimation;
}

export interface SwapCreateTxResponse extends Estimation {
  tx: Tx;
}
