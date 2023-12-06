import { TokenInfo } from "models/SolanaTokenInfo";

export interface DlnSupportedChain {
  chainName: string;
  chainIcon: string;
  chainId: number;
  networkFeeToken: string;
}

export interface FeeRecipient extends DlnSupportedChain {
  feeRecipient: string;
}

export type GetDlnSupportedChainsResponse = { chains: number[] };

export interface TokenMap {
  [key: string]: TokenInfo;
}

export type GetDlnChainTokenListResponse = { tokens: TokenMap }

export interface SrcChainTokenIn {
  name: string;
  symbol: string;
  chainId: number;
  address: string;
  decimals: number;
  amount: string;
  approximateOperatingExpense: string;
  mutatedWithOperatingExpense: boolean;
}

export interface DstChainTokenOut {
  address: string;
  chainId: number;
  decimals: number;
  name: string;
  symbol: string;
  amount: string;
  recommendedAmount: string;
  maxTheoreticalAmount: string;
  withoutAdditionalTakerRewardsAmount: string;
}

export interface Payload {
  feeAmount: string;
  feeBps: string;
}

export interface CostsDetail {
  chain: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  type: string;
  payload: Payload;
}

export interface Estimation {
  srcChainTokenIn: SrcChainTokenIn;
  dstChainTokenOut: DstChainTokenOut;
  costsDetails: CostsDetail[];
  recommendedSlippage: number;
}

export interface Order {
  approximateFulfillmentDelay: number;
}

export interface DlnOrderQuoteResponse {
  estimation: Estimation;
  prependedOperatingExpenseCost: string;
  order: Order;
  fixFee: string;
}
