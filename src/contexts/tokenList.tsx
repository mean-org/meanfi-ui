import React, { useContext, useEffect, useMemo, useState } from "react";
// import { TokenInfo, TokenListContainer, TokenListProvider } from "@solana/spl-token-registry";
// import { NATIVE_SOL, TOKENS } from "../utils/tokens";
// import { cloneDeep } from "lodash-es";

// type TokenListContextState = {
//   container: TokenListContainer | undefined;
//   tokenMap: Map<string, TokenInfo>;
//   wormholeMap: Map<string, TokenInfo>;
//   solletMap: Map<string, TokenInfo>;
//   swappableTokens: TokenInfo[];
//   swappableTokensSollet: TokenInfo[];
//   swappableTokensWormhole: TokenInfo[];
// };

// export const TokenListContext = React.createContext<null | TokenListContextState>(null);
// export const SPL_REGISTRY_WORM_TAG = "wormhole";
// export const SPL_REGISTRY_SOLLET_TAG = "wrapped-sollet";

// // Token List Context Provider
// export function TokenListContextProvider(props: any) {

//   const [container, setContainer] = useState<TokenListContainer>();

//   useEffect(() => {

//     new TokenListProvider()
//       .resolve()
//       .then(setContainer);
    
//   }, [setContainer]);

//   const tokenList = useMemo(() => {
//     let list = [];
//     const symbols = Object.keys(TOKENS);
    
//     for (let key of symbols) {
//       let token = cloneDeep(TOKENS[key]);
//       list.push(token);
//     }
    
//     list.push(NATIVE_SOL);
    
//     return list;
    
//   }, []);

//   // Token map for quick lookup.
//   const tokenMap = useMemo(() => {
//     const tokenMap = new Map();
//     tokenList.forEach((t: TokenInfo) => {
//       tokenMap.set(t.address, t);
//     });
    
//     return tokenMap;
    
//   }, [tokenList]);

//   // Tokens with USD(x) quoted markets.
//   const swappableTokens = useMemo(() => {
//     const tokens = tokenList.filter((t: TokenInfo) => {
//       const isUsdxQuoted = t.extensions?.serumV3Usdt || t.extensions?.serumV3Usdc;
//       return isUsdxQuoted;
//     });
    
//     tokens.sort((a: TokenInfo, b: TokenInfo) =>
//       a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0
//     );
    
//     return tokens;
    
//   }, [tokenList]);
    
//   // Wormhole wrapped tokens.
//   const [swappableTokensWormhole, wormholeMap] = useMemo(() => {
//     const tokens = tokenList.filter((t: TokenInfo) => {
//       const isSollet = t.tags?.includes(SPL_REGISTRY_WORM_TAG);
//       return isSollet;
//     });
    
//     tokens.sort((a: TokenInfo, b: TokenInfo) =>
//       a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0
//     );
    
//     return [
//       tokens,
//       new Map<string, TokenInfo>(tokens.map((t: TokenInfo) => [t.address, t])),
//     ];
    
//   }, [tokenList]);

//   // Sollet wrapped tokens.
//   const [swappableTokensSollet, solletMap] = useMemo(() => {
//     const tokens = tokenList.filter((t: TokenInfo) => {
//       const isSollet = t.tags?.includes(SPL_REGISTRY_SOLLET_TAG);
//       return isSollet;
//     });
    
//     tokens.sort((a: TokenInfo, b: TokenInfo) =>
//       a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0
//     );
    
//     return [
//       tokens,
//       new Map<string, TokenInfo>(tokens.map((t: TokenInfo) => [t.address, t])),
//     ];
    
//   }, [tokenList]);

//   return (
//     <TokenListContext.Provider
//       value={{
//         container,
//         tokenMap,
//         wormholeMap,
//         solletMap,
//         swappableTokens,
//         swappableTokensWormhole,
//         swappableTokensSollet,
//       }}
//     >
//       {props.children}
//     </TokenListContext.Provider>
//   );
// }

// export function useTokenListContext(): TokenListContextState {
//   const ctx = useContext(TokenListContext);
  
//   if (ctx === null) {
//     throw new Error("Context not available");
//   }
  
//   return ctx;
// }

// export function useTokenListcontainer() : TokenListContainer | undefined {
//   let { container } = useTokenListContext();
//   return container;
// }

// export function useTokenMap(): Map<string, TokenInfo> {
//   const { tokenMap } = useTokenListContext();
//   return tokenMap;
// }

// export function useSwappableTokens() {
//   const { 
//     swappableTokens,
//     swappableTokensWormhole,
//     swappableTokensSollet
    
//   } = useTokenListContext();
  
//   return { 
//     swappableTokens, 
//     swappableTokensWormhole, 
//     swappableTokensSollet 
//   };
// }

