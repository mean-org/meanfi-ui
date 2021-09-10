import { Connection, PublicKey } from "@solana/web3.js";
import { MARKETS as SERUM_MARKETS } from "@project-serum/serum/lib/tokens_and_markets";
import { getMultipleAccounts } from "../../utils/accounts";
import { Market, MARKET_STATE_LAYOUT_V2 } from "@project-serum/serum";
import { cloneDeep } from "lodash";
import { NATIVE_SOL_MINT, SERUM_PROGRAM_ID_V3, WRAPPED_SOL_MINT } from "../../utils/ids";

export const MARKETS: Array<string> = [];

export function startMarkets() {
  for (const market of SERUM_MARKETS) {
    const address = market.address.toBase58();
    if (!market.deprecated && !MARKETS.includes(address)) {
      MARKETS.push(address);
    }
  }
}

export async function getMarkets(connection: Connection) {
  startMarkets();

  let markets: any = [];
  const marketInfos = await getMultipleAccounts(
    connection,
    MARKETS.map((m) => new PublicKey(m)),
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

export const getMarket = async (
  connection: Connection,
  from: string,
  to: string
): Promise<any> => {

  const allMarkets = await getMarkets(connection);

  for (let address of allMarkets) {
    let newMarketKey;
    const allMarkets = await getMarkets(connection);

    let info = cloneDeep(allMarkets[address]);
    let fromAddress = from;
    let toAddress = to;

    if (fromAddress === NATIVE_SOL_MINT.toBase58()) {
      fromAddress = WRAPPED_SOL_MINT.toBase58();
    }

    if (toAddress === NATIVE_SOL_MINT.toBase58()) {
      toAddress = WRAPPED_SOL_MINT.toBase58();
    }

    if (
      (info.baseMint.toBase58() === fromAddress &&
        info.quoteMint.toBase58() === toAddress) ||
      (info.quoteMint.toBase58() === fromAddress &&
        info.baseMint.toBase58() === toAddress)
    ) {
      newMarketKey = new PublicKey(address);
    }

    if (!newMarketKey) {
      return undefined;
    }

    const serumProgramKey = new PublicKey(SERUM_PROGRAM_ID_V3);
    const marketInfo = await Market.load(
      connection, 
      newMarketKey, 
      { }, 
      serumProgramKey
    );

    
  }
};
