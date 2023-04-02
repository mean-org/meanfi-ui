import { DEFAULT_SLIPPAGE_PERCENT } from 'constants/common';

export interface SwapSettings {
  slippage: number;
  versionedTxs: boolean;
  onlyDirectRoutes: boolean;
}

export const defaultExchangeValues: SwapSettings = {
  slippage: DEFAULT_SLIPPAGE_PERCENT,
  onlyDirectRoutes: false,
  versionedTxs: true,
};
