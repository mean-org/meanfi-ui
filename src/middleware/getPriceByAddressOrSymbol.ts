import { TokenPrice } from "models/TokenPrice";

const getPriceByAddressOrSymbol = (prices: TokenPrice[] | null, address: string, symbol = ''): number => {
  if (!address || !prices || prices.length === 0) {
    return 0;
  }

  let item: TokenPrice | undefined;
  item = prices.find(i => i.address === address);
  if (!item && symbol) {
    item = prices.find(i => i.symbol === symbol);
  }

  return item ? item.price || 0 : 0;
};

export default getPriceByAddressOrSymbol