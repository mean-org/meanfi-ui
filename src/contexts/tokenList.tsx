import React, { useContext, useMemo } from "react";
import { TokenInfo, TokenListContainer } from "@solana/spl-token-registry";
import { NATIVE_SOL } from "../utils/tokens";

type TokenListContextState = {
  container: TokenListContainer;
  tokenMap: Map<string, TokenInfo>;
  wormholeMap: Map<string, TokenInfo>;
  solletMap: Map<string, TokenInfo>;
  swappableTokens: TokenInfo[];
  swappableTokensSollet: TokenInfo[];
  swappableTokensWormhole: TokenInfo[];
};

export const TokenListContext = React.createContext<null | TokenListContextState>(null);
export const SPL_REGISTRY_WORM_TAG = "wormhole";
export const SPL_REGISTRY_SOLLET_TAG = "wrapped-sollet";

// Token List Context Provider
export function TokenListContextProvider(props: any) {

  const tokenList = useMemo(() => {
    const list = props.container.filterByClusterSlug("mainnet-beta").getList();
    
    for (let token of list) {
      if (token.symbol === 'SOL') {
        token.symbol = 'wSOL';
        break;
      }
    }
    
    list.push(NATIVE_SOL);
    
    return list;
    
  }, [props.container]);

  // Token map for quick lookup.
  const tokenMap = useMemo(() => {
    const tokenMap = new Map();
    tokenList.forEach((t: TokenInfo) => {
      tokenMap.set(t.address, t);
    });
    
    return tokenMap;
    
  }, [tokenList]);

  // Tokens with USD(x) quoted markets.
  const swappableTokens = useMemo(() => {
    const tokens = tokenList.filter((t: TokenInfo) => {
      const isUsdxQuoted = t.extensions?.serumV3Usdt || t.extensions?.serumV3Usdc;
      return isUsdxQuoted;
    });
    
    tokens.sort((a: TokenInfo, b: TokenInfo) =>
      a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0
    );
    
    return tokens;
    
  }, [tokenList]);
    
  // Wormhole wrapped tokens.
  const [swappableTokensWormhole, wormholeMap] = useMemo(() => {
    const tokens = tokenList.filter((t: TokenInfo) => {
      const isSollet = t.tags?.includes(SPL_REGISTRY_WORM_TAG);
      return isSollet;
    });
    
    tokens.sort((a: TokenInfo, b: TokenInfo) =>
      a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0
    );
    
    return [
      tokens,
      new Map<string, TokenInfo>(tokens.map((t: TokenInfo) => [t.address, t])),
    ];
    
  }, [tokenList]);

  // Sollet wrapped tokens.
  const [swappableTokensSollet, solletMap] = useMemo(() => {
    const tokens = tokenList.filter((t: TokenInfo) => {
      const isSollet = t.tags?.includes(SPL_REGISTRY_SOLLET_TAG);
      return isSollet;
    });
    
    tokens.sort((a: TokenInfo, b: TokenInfo) =>
      a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0
    );
    
    return [
      tokens,
      new Map<string, TokenInfo>(tokens.map((t: TokenInfo) => [t.address, t])),
    ];
    
  }, [tokenList]);

  return (
    <TokenListContext.Provider
      value={{
        container: props.container,
        tokenMap,
        wormholeMap,
        solletMap,
        swappableTokens,
        swappableTokensWormhole,
        swappableTokensSollet,
      }}
    >
      {props.children}
    </TokenListContext.Provider>
  );
}

export function useTokenListContext(): TokenListContextState {
  const ctx = useContext(TokenListContext);
  
  if (ctx === null) {
    throw new Error("Context not available");
  }
  
  return ctx;
}

export function useTokenListcontainer() : TokenListContainer {
  let { container } = useTokenListContext();
  return container;
}

export function useTokenMap(): Map<string, TokenInfo> {
  const { tokenMap } = useTokenListContext();
  return tokenMap;
}

export function useSwappableTokens() {
  const { 
    swappableTokens,
    swappableTokensWormhole,
    swappableTokensSollet
    
  } = useTokenListContext();
  
  return { 
    swappableTokens, 
    swappableTokensWormhole, 
    swappableTokensSollet 
  };
}

