import type { TokenPrice } from 'src/models/TokenPrice';

/**
 * Gets the price of a token given its mint address if the price is available or the first match by symbol.
 * @param {TokenPrice[]} prices The list of prices from the API
 * @param {string} address The mint address to get the price for
 * @param {string} symbol Optionally the token symbol as a fallback if the mint address did not make a match (useful in clusters other than mainnet)
 * @returns {number} The price as number. If no price could be resolved it will return 0
 */
const getPriceByAddressOrSymbol = (prices: TokenPrice[] | null, address: string, symbol = ''): number => {
  if (!prices || prices.length === 0) {
    return 0;
  }

  let item: TokenPrice | undefined;
  item = prices.find(i => i.address === address);
  if (!item && symbol) {
    item = prices.find(i => i.symbol === symbol);
  }

  return item ? item.price ?? 0 : 0;
};

export default getPriceByAddressOrSymbol;
