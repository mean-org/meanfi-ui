import * as assert from "assert";
import React, { useContext, useState, useEffect } from "react";
import { useAsync } from "react-async-hook";
import { PublicKey } from "@solana/web3.js";
import { Token, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Market } from "@project-serum/serum";
import { NATIVE_SOL_MINT, USDC_MINT, USDT_MINT } from "../utils/ids";
import { useFairRoute, useRouteVerbose, useMarketContext } from "./market";
import { useOwnedTokenAccount } from "../contexts/token";
import { useTokenListContext, SPL_REGISTRY_SOLLET_TAG, SPL_REGISTRY_WORM_TAG } from "./tokenList";
import { AppStateContext } from "../contexts/appstate";
import { formatAmount } from "../utils/utils";
import useLocalStorage from "../hooks/useLocalStorage";

export const DEFAULT_SLIPPAGE_PERCENT = 1;

export type SwapContextState = {
  fromMint: PublicKey;
  setFromMint: (m: PublicKey) => void;
  toMint: PublicKey;
  setToMint: (m: PublicKey) => void;
  fromAmount: string;
  setFromAmount: (a: string, d?: number) => void;
  toAmount: string;
  setToAmount: (a: string, d?: number) => void;
  // Function to flip what we consider to be the "to" and "from" mints.
  swapToFromMints: () => void;
  // The amount (in units of percent) a swap can be off from the estimate shown to the user.
  slippage: number;
  setSlippage: (n: number) => void;
  // Null if the user is using fairs directly from DEX prices.
  // Otherwise, a user specified override for the price to use when calculating
  // swap amounts.
  fairOverride: number | null;
  setFairOverride: (n: number | null) => void;
  // The referral *owner* address. Associated token accounts must be created,
  // first, for this to be used.
  referral?: PublicKey;
  // True if all newly created market accounts should be closed in the
  // same user flow (ideally in the same transaction).
  isClosingNewAccounts: boolean;
  // True if the swap exchange rate should be a function of nothing but the
  // from and to tokens, ignoring any quote tokens that may have been
  // accumulated by performing the swap.
  //
  // Always false (for now).
  isStrict: boolean;
  setIsStrict: (isStrict: boolean) => void;
  setIsClosingNewAccounts: (b: boolean) => void;
};

const SwapContext = React.createContext<null | SwapContextState>(null);

export function SwapContextProvider(props: any) {

  const {
    selectedToken,
    fromCoinAmount,
    swapToToken,
    swapToTokenAmount

  } = useContext(AppStateContext);

  // Get them from the localStorage and set defaults if they are not already stored
  const [lastSwapFromMint, setLastSwapFromMint] = useLocalStorage('lastSwapFromMint', selectedToken ? selectedToken.address : USDC_MINT.toBase58());
  const [lastSwapToMint, setLastSwapToMint] = useLocalStorage('lastSwapToMint', swapToToken ? swapToToken.address : NATIVE_SOL_MINT.toBase58());

  // Work with our swap From/To subjects
  const [fromMint, updateFromMint] = useState(new PublicKey(lastSwapFromMint));
  const [toMint, updateToMint] = useState(new PublicKey(lastSwapToMint));

  // Continue normal flow
  const [fromAmount, _setFromAmount] = useState(fromCoinAmount || "");
  const [toAmount, _setToAmount] = useState(swapToTokenAmount || "");
  const [isClosingNewAccounts, setIsClosingNewAccounts] = useState(false);
  const [isStrict, setIsStrict] = useState(false);
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE_PERCENT);
  const [fairOverride, setFairOverride] = useState<number | null>(null);
  const fair = _useSwapFair(fromMint, toMint, fairOverride);
  const referral = props.referral;

  assert.ok(slippage >= 0);

  useEffect(() => {
    if (!fair) { return; }    
    setFromAmount(fromAmount);    
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fair]);

  const setFromMint = (m: PublicKey) => {
    updateFromMint(m);
    setLastSwapFromMint(m.toBase58());
  }

  const setToMint = (m: PublicKey) => {
    updateToMint(m);
    setLastSwapToMint(m.toBase58());
  }

  const swapToFromMints = () => {
    const oldFrom = fromMint;
    const oldTo = toMint;
    const oldToAmount = toAmount;
    setFromMint(oldTo);
    setToMint(oldFrom);
    setFromAmount(oldToAmount);
  };

  const setFromAmount = (amount: string, decimals: number = 6) => {
    // Reflect the typed amount (let them type)
    _setFromAmount(amount);
    // If amount is cleared, also clear the opposite field
    if (amount === '') {
      _setToAmount("");
    }
    // If o or no amount or no fair price, get out
    if (!amount || fair === undefined) { return; }
    // Calculate the corresponding TO amount
    const formattedAmount = formatAmount(parseFloat(amount) / fair, decimals);    
    _setToAmount(formattedAmount);
  };

  const setToAmount = (amount: string, decimals: number = 9) => {
    // Reflect the typed amount (let them type)
    _setToAmount(amount);
    // If amount is cleared, also clear the opposite field
    if (amount === '') {
      _setFromAmount("");
    }
    // If o or no amount or no fair price, get out
    if (!amount || fair === undefined) { return; }
    // Calculate the corresponding FROM amount
    const formattedAmount = formatAmount(parseFloat(amount) * fair, decimals); 
    _setFromAmount(formattedAmount);
  };

  return (
    <SwapContext.Provider
      value={{
        fromMint,
        setFromMint,
        toMint,
        setToMint,
        fromAmount,
        setFromAmount,
        toAmount,
        setToAmount,
        swapToFromMints,
        slippage,
        setSlippage,
        fairOverride,
        setFairOverride,
        isClosingNewAccounts,
        isStrict,
        setIsStrict,
        setIsClosingNewAccounts,
        referral,
      }}>
      {props.children}
    </SwapContext.Provider>
  );
}

export function useSwapContext(): SwapContextState {
  const ctx = useContext(SwapContext);
  
  if (ctx === null) {
    throw new Error("Context not available");
  }
  
  return ctx;
}

export function useSwapFair(): number | undefined {  
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { fromMint, toMint, fairOverride } = useSwapContext();
  return _useSwapFair(fromMint, toMint, fairOverride);
}

// Returns true if the user can swap with the current context.
export function useCanSwap(): boolean {  
  const { fromMint, toMint, fromAmount, toAmount } = useSwapContext();
  const { swapClient } = useMarketContext();
  const { wormholeMap, solletMap } = useTokenListContext();
  const fromWallet = useOwnedTokenAccount(fromMint);
  const fair = useSwapFair();
  const route = useRouteVerbose(fromMint, toMint);
  
  if (route === null) {
    return false;
  }

  return (
    // From wallet exists.
    fromWallet !== undefined &&
    fromWallet !== null &&
    // Fair price is defined.
    fair !== undefined &&
    fair > 0 &&
    // Mints are distinct.
    !fromMint.equals(toMint) &&
    // Wallet is connected.
    swapClient.program.provider.wallet.publicKey !== null &&
    // Trade amounts greater than zero.
    parseFloat(fromAmount) > 0 &&
    parseFloat(toAmount) > 0 &&
    // Trade route exists.
    route !== null &&
    // Wormhole <-> native markets must have the wormhole token as the
    // *from* address since they're one-sided markets.
    (route.kind !== "wormhole-native" ||
      wormholeMap
        .get(fromMint.toBase58())
        ?.tags?.includes(SPL_REGISTRY_WORM_TAG) !== undefined) &&
    // Wormhole <-> sollet markets must have the sollet token as the
    // *from* address since they're one sided markets.
    (route.kind !== "wormhole-sollet" ||
      solletMap
        .get(toMint.toBase58())
        ?.tags?.includes(SPL_REGISTRY_SOLLET_TAG) !== undefined)
  );
}

export function useReferral(fromMarket?: Market): PublicKey | undefined {
  const { referral } = useSwapContext();
  const asyncReferral = useAsync(async () => {
    if (!referral) {
      return undefined;
    }
    
    if (!fromMarket) {
      return undefined;
    }
    
    if (
      !fromMarket.quoteMintAddress.equals(USDC_MINT) &&
      !fromMarket.quoteMintAddress.equals(USDT_MINT)
    ) {
      return undefined;
    }

    return Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      fromMarket.quoteMintAddress,
      referral
    );
    
  }, [fromMarket]);

  if (!asyncReferral.result) {
    return undefined;
  }

  return asyncReferral.result;
}

function _useSwapFair(
  fromMint: PublicKey,
  toMint: PublicKey,
  fairOverride: number | null
  
): number | undefined {

  const fairRoute = useFairRoute(fromMint, toMint);
  const fair = fairOverride === null ? fairRoute : fairOverride;
  
  return fair;
}
