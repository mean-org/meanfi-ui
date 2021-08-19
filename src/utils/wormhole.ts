import { Market, Orderbook as OrderbookSide } from "@project-serum/serum";
import { TokenInfo } from "@solana/spl-token-registry";
import { Connection, PublicKey } from "@solana/web3.js";
import { fetchSolletInfo, requestWormholeSwapMarketIfNeeded } from "../contexts/sollet";
import {
  DEX_PROGRAM_ID,
  USDC_MINT,
  USDT_MINT,
  WORM_MARKET_BASE,
  WORM_USDC_MARKET,
  WORM_USDC_MINT,
  WORM_USDT_MARKET,
  WORM_USDT_MINT

} from "./ids";

export const ORDERBOOK_CACHE = new Map<string, Orderbook>();
export const MARKET_CACHE = new Map<string, Market>();

export type RouteKind = "wormhole-native" | "wormhole-sollet" | "usdx";
export type Orderbook = {
  bids: OrderbookSide;
  asks: OrderbookSide;
};

export type Bbo = {
  bestBid?: number;
  bestOffer?: number;
  mid?: number;
};

// Maps fromMint || toMint (in sort order) to swap market public key.
// All markets for wormhole<->native tokens should be here, e.g.
// USDC <-> wUSDC.
export const WORMHOLE_NATIVE_MAP = new Map<string, PublicKey>([
  [wormKey(WORM_USDC_MINT, USDC_MINT), WORM_USDC_MARKET],
  [wormKey(WORM_USDT_MINT, USDT_MINT), WORM_USDT_MARKET],
]);

function wormKey(fromMint: PublicKey, toMint: PublicKey): string {
  const [first, second] =
    fromMint < toMint ? [fromMint, toMint] : [toMint, fromMint];
  return first.toString() + second.toString();
}

export async function wormholeSwapMarket(
  conn: Connection,
  fromMint: PublicKey,
  toMint: PublicKey,
  wormholeMap: Map<string, TokenInfo>,
  solletMap: Map<string, TokenInfo>
  
): Promise<[PublicKey, RouteKind] | null> {

  let market = wormholeNativeMarket(fromMint, toMint);

  if (market !== null) {
    return [market, "wormhole-native"];
  }

  market = await wormholeSolletMarket(
    conn,
    fromMint,
    toMint,
    wormholeMap,
    solletMap
  );

  if (market === null) {
    return null;
  }

  return [market, "wormhole-sollet"];
}

export function wormholeNativeMarket(
  fromMint: PublicKey,
  toMint: PublicKey

): PublicKey | null {
  return WORMHOLE_NATIVE_MAP.get(wormKey(fromMint, toMint)) ?? null;
}

// Returns the market address of the 1-1 sollet<->wormhole swap market if it
// exists. Otherwise, returns null.
export async function wormholeSolletMarket(
  conn: Connection,
  fromMint: PublicKey,
  toMint: PublicKey,
  wormholeMap: Map<string, TokenInfo>,
  solletMap: Map<string, TokenInfo>
  
): Promise<PublicKey | null> {

  const fromWormhole = wormholeMap.get(fromMint.toString());
  const isFromWormhole = fromWormhole !== undefined;
  const toWormhole = wormholeMap.get(toMint.toString());
  const isToWormhole = toWormhole !== undefined;
  const fromSollet = solletMap.get(fromMint.toString());
  const isFromSollet = fromSollet !== undefined;
  const toSollet = solletMap.get(toMint.toString());
  const isToSollet = toSollet !== undefined;

  if ((isFromWormhole || isToWormhole) && isFromWormhole !== isToWormhole) {
    if ((isFromSollet || isToSollet) && isFromSollet !== isToSollet) {
      const base = isFromSollet ? fromMint : toMint;
      const [quote, wormholeInfo] = isFromWormhole
        ? [fromMint, fromWormhole]
        : [toMint, toWormhole];

      const solletInfo = await fetchSolletInfo(base);

      if (solletInfo.erc20Contract !== wormholeInfo!.extensions?.address) {
        return null;
      }

      const market = await deriveWormholeMarket(base, quote);
      if (market === null) {
        return null;
      }

      const marketExists = await requestWormholeSwapMarketIfNeeded(
        conn,
        base,
        quote,
        market,
        solletInfo
      );

      if (!marketExists) {
        return null;
      }

      return market;
    }
  }

  return null;
}

// Calculates the deterministic address for the sollet<->wormhole 1-1 swap
// market.
export async function deriveWormholeMarket(
  baseMint: PublicKey,
  quoteMint: PublicKey,
  version = 0

): Promise<PublicKey | null> {

  if (version > 99) {
    console.log("Swap market version cannot be greater than 99");
    return null;
  }

  if (version < 0) {
    console.log("Version cannot be less than zero");
    return null;
  }

  const padToTwo = (n: number) => (n <= 99 ? `0${n}`.slice(-2) : n);
  const seed =
    baseMint.toString().slice(0, 15) +
    quoteMint.toString().slice(0, 15) +
    padToTwo(version);
  
  return await PublicKey.createWithSeed(WORM_MARKET_BASE, seed, DEX_PROGRAM_ID);
}