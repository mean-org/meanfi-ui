import { Connection, PublicKey } from "@solana/web3.js"
import { MARKETS as SERUM_MARKETS } from '@project-serum/serum/lib/tokens_and_markets'
import { LIQUIDITY_POOLS } from './pools'
import { SERUM_PROGRAM_ID_V3 } from './ids'
import { getMultipleAccounts } from "./accounts";
import { MARKET_STATE_LAYOUT_V2 } from "@project-serum/serum";

export const MARKETS: Array<string> = [];

export function startMarkets() { 

  for (const market of SERUM_MARKETS) {
    const address = market.address.toBase58()
    if (!market.deprecated && !MARKETS.includes(address)) {
      MARKETS.push(address)
    }
  }

  for (const market of LIQUIDITY_POOLS) {
    if (market.serumProgramId === SERUM_PROGRAM_ID_V3 && !MARKETS.includes(market.serumMarket) && market.official) {
      MARKETS.push(market.serumMarket)
    }
  }
}

export async function getMarkets(connection: Connection) {

  startMarkets();

  const markets: any = [];
  const marketInfos = await getMultipleAccounts(
    connection, 
    MARKETS.map(m => new PublicKey(m)), 
    connection.commitment
  );

  marketInfos.forEach((marketInfo) => {
    if (marketInfo) {
      const address = marketInfo.publicKey.toBase58();
      const data = marketInfo.account.data;

      if (address && data) {
        const decoded = MARKET_STATE_LAYOUT_V2.decode(data);
        markets[address] = decoded;
      }
    }
  });

  return markets;
}

