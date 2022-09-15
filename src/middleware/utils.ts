import { useCallback, useState } from "react";
import { ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import { BIGNUMBER_FORMAT, CUSTOM_TOKEN_NAME, INPUT_AMOUNT_PATTERN, INTEGER_INPUT_AMOUNT_PATTERN, UNAUTHENTICATED_ROUTES, WRAPPED_SOL_MINT_ADDRESS } from "../constants";
import { MEAN_TOKEN_LIST } from "../constants/tokens";
import { friendlyDisplayDecimalPlaces, getFormattedNumberToLocale, isProd, maxTrailingZeroes } from "./ui";
import { TOKEN_PROGRAM_ID } from "./ids";
import { NATIVE_SOL } from '../constants/tokens';
import { isMobile } from "react-device-detect";
import { TokenInfo } from "@solana/spl-token-registry";
import { getNetworkIdByEnvironment } from "../contexts/connection";
import { environment } from "../environments/environment";
import { BigNumber } from "bignumber.js";
import BN from "bn.js";

export type KnownTokenMap = Map<string, TokenInfo>;

export const formatPriceNumber = new Intl.NumberFormat("en-US", {
  style: "decimal",
  minimumFractionDigits: 2,
  maximumFractionDigits: 8,
});

export function useLocalStorageState(key: string, defaultState?: string) {
  const [state, setState] = useState(() => {
    // NOTE: Not sure if this is ok
    const storedState = localStorage.getItem(key);
    if (storedState) {
      return JSON.parse(storedState);
    }
    return defaultState;
  });

  const setLocalStorageState = useCallback(
    (newState) => {
      const changed = state !== newState;
      if (!changed) {
        return;
      }
      setState(newState);
      if (newState === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify(newState));
      }
    },
    [state, key]
  );

  return [state, setLocalStorageState];
}

// shorten the checksummed version of the input address to have 4 characters at start and end
export function shortenAddress(address: string | PublicKey, chars = 4): string {
  if (!address) { return ""; }
  let output = '';
  if (typeof address === "string") {
    output = address;
  } else if (address instanceof PublicKey) {
    output = (address as PublicKey).toBase58();
  } else {
    output = `${address}`;
  }
  const numChars = isMobile ? 4 : chars;
  return `${output.slice(0, numChars)}...${output.slice(-numChars)}`;
}

export function getTokenIcon(
  map: KnownTokenMap,
  mintAddress?: string | PublicKey
): string | undefined {
  const address =
    typeof mintAddress === "string" ? mintAddress : mintAddress?.toBase58();
  if (!address) {
    return;
  }

  return map.get(address)?.logoURI;
}

export const isUnauthenticatedRoute = (route: string) => {
  return UNAUTHENTICATED_ROUTES.some(r => r.startsWith(route));
}

export const STABLE_COINS = new Set(['USDT', 'USDC', 'UST', 'TUSD', 'BUSD', 'DAI', 'USDP', 'USDN', 'JST', 'FEI']);

export function chunks<T>(array: T[], size: number): T[][] {
  return Array.apply<number, T[], T[][]>(
    0,
    new Array(Math.ceil(array.length / size))
  ).map((_, index) => array.slice(index * size, (index + 1) * size));
}

export const getAmountFromLamports = (amount = 0): number => {
  return amount / LAMPORTS_PER_SOL;
}

const SI_SYMBOL = ["", "k", "M", "G", "T", "P", "E"];

const abbreviateNumber = (number: number, precision: number) => {
  if (number === undefined) {
    return '--';
  }
  const tier = (Math.log10(number) / 3) | 0;
  let scaled = number;
  const suffix = SI_SYMBOL[tier];
  if (tier !== 0) {
    const scale = Math.pow(10, tier * 3);
    scaled = number / scale;
  }

  return scaled.toFixed(precision) + suffix;
};

export const formatAmount = (
  val: number,
  precision = 6,
  abbr = false
) => {
  if (val) {
    if (abbr) {
      return abbreviateNumber(val, precision);
    } else {
      return val.toFixed(precision);
    }
  }
  return '0';
};

export const formatUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export const formatPercent = (val: number, maxDecimals?: number) => {
  const convertedVlue = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals || 0
  });

  return convertedVlue.format(val);
}

export const isSmallNumber = (val: number) => {
  return val < 0.001 && val > 0;
};

export const formatThousands = (val: number, maxDecimals?: number, minDecimals = 0) => {
  let convertedVlue: Intl.NumberFormat;

  if (maxDecimals) {
    convertedVlue = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: minDecimals,
      maximumFractionDigits: maxDecimals
    });
  } else {
    convertedVlue = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: minDecimals,
      maximumFractionDigits: 0
    });
  }

  return convertedVlue.format(val);
}

export function isValidNumber(str: string): boolean {
  if (str === null || str === undefined ) { return false; }
  return INPUT_AMOUNT_PATTERN.test(str);
}

export function isValidInteger(str: string): boolean {
  if (str === null || str === undefined ) { return false; }
  return INTEGER_INPUT_AMOUNT_PATTERN.test(str);
}

export const getTokenBySymbol = (symbol: string, tokenList?: TokenInfo[]): TokenInfo | undefined => {
  const tokenFromTokenList = tokenList && isProd()
    ? tokenList.find(t => t.symbol === symbol)
    : MEAN_TOKEN_LIST.find(t => t.symbol === symbol && t.chainId === getNetworkIdByEnvironment(environment));
  if (tokenFromTokenList) {
    return tokenFromTokenList;
  }
  return undefined;
}

export const getTokenSymbol = (address: string): string => {
  const tokenFromTokenList = MEAN_TOKEN_LIST.find(t => t.address === address);
  if (tokenFromTokenList) {
    return tokenFromTokenList.symbol;
  }
  return '';
}

export const getTokenDecimals = (address: string): number => {
  const tokenFromTokenList = MEAN_TOKEN_LIST.find(t => t.address === address);
  if (tokenFromTokenList) {
    return tokenFromTokenList.decimals;
  }
  return 0;
}

export const getAmountWithSymbol = (
  amount: number | string | BN,
  address: string,
  onlyValue = false,
  tokenList?: TokenInfo[],
  tokenDecimals?: number,
  friendlyDecimals = true
) => {

  let token: TokenInfo | undefined = undefined;
  if (address) {
    if (address === NATIVE_SOL.address) {
      token = NATIVE_SOL as TokenInfo;
    } else {
      token = tokenList && isProd()
        ? tokenList.find(t => t.address === address)
        : MEAN_TOKEN_LIST.find(t => t.address === address);

      if (token && token.address === WRAPPED_SOL_MINT_ADDRESS) {
        token = Object.assign({}, token, {
          symbol: 'SOL'
        }) as TokenInfo;
      }
    }
  }

  if (tokenDecimals && !token) {
    const unknownToken: TokenInfo = {
      address: address,
      name: CUSTOM_TOKEN_NAME,
      chainId: 101,
      decimals: tokenDecimals,
      symbol: `[${shortenAddress(address)}]`,
    };
    token = unknownToken;
  }

  if (typeof amount === "number") {
    const inputAmount = amount || 0;
    if (token) {
      const decimals = STABLE_COINS.has(token.symbol) ? 5 : token.decimals;
      const formatted = new BigNumber(formatAmount(inputAmount, token.decimals));
      const formatted2 = formatted.toFixed(token.decimals);
      const toLocale = formatThousands(parseFloat(formatted2), decimals, decimals);
      if (onlyValue) { return toLocale; }
      return `${toLocale} ${token.symbol}`;
    } else if (address && !token) {
      const formatted = formatThousands(inputAmount, 5, 5);
      return onlyValue ? formatted : `${formatted} [${shortenAddress(address, 4)}]`;
    }
    return `${formatThousands(inputAmount, 5, 5)}`;
  } else {
    const decimals = token ? token.decimals : 6;
    BigNumber.config({
      CRYPTO: true,
      FORMAT: BIGNUMBER_FORMAT,
      DECIMAL_PLACES: decimals
    });
    const bigNumberAmount = typeof amount === "string"
      ? new BigNumber(amount) : new BigNumber((amount as BN).toString());
    const inputAmount = bigNumberAmount.toFormat(
      friendlyDecimals
        ? friendlyDisplayDecimalPlaces(bigNumberAmount.toString(), decimals)
        : decimals
    );
    if (token) {
      return onlyValue ? inputAmount : `${inputAmount} ${token.symbol}`;
    } else {
      return onlyValue ? inputAmount : `${inputAmount} [${shortenAddress(address, 4)}]`;
    }
  }
}

export const displayAmountWithSymbol = (
  amount: number | string | BN,
  address: string,
  tokenDecimals?: number,
  tokenList?: TokenInfo[],
  friendlyDecimals = true
) => {

  let token: TokenInfo | undefined = undefined;
  if (address) {
    if (address === NATIVE_SOL.address) {
      token = NATIVE_SOL as TokenInfo;
    } else {
      token = tokenList && isProd()
        ? tokenList.find(t => t.address === address)
        : MEAN_TOKEN_LIST.find(t => t.address === address);

      if (token && token.address === WRAPPED_SOL_MINT_ADDRESS) {
        token = Object.assign({}, token, {
          symbol: 'SOL'
        }) as TokenInfo;
      }
    }
  }

  if (tokenDecimals && !token) {
    const unknownToken: TokenInfo = {
      address: address,
      name: CUSTOM_TOKEN_NAME,
      chainId: 101,
      decimals: tokenDecimals,
      symbol: `[${shortenAddress(address)}]`,
    };
    token = unknownToken;
  }

  if (typeof amount === "number") {
    const inputAmount = amount || 0;
    if (token) {
      const decimals = STABLE_COINS.has(token.symbol) ? 5 : token.decimals;
      const formatted = new BigNumber(formatAmount(inputAmount, token.decimals));
      const formatted2 = formatted.toFixed(token.decimals);
      const toLocale = formatThousands(parseFloat(formatted2), decimals, decimals);
      return `${toLocale} ${token.symbol}`;
    } else if (address && !token) {
      const formatted = formatThousands(inputAmount, 5, 5);
      return `${formatted} [${shortenAddress(address, 4)}]`;
    }
    return `${formatThousands(inputAmount, 5, 5)}`;
  } else {
    const decimals = token ? token.decimals : 6;
    BigNumber.config({
      CRYPTO: true,
      FORMAT: BIGNUMBER_FORMAT,
      DECIMAL_PLACES: decimals
    });
    const baseConvert = new BigNumber(10 ** decimals);
    const bigNumberAmount = typeof amount === "string"
      ? new BigNumber(amount) : new BigNumber((amount as BN).toString());
    const value = bigNumberAmount.div(baseConvert);
    const inputAmount = value.toFormat(
      friendlyDecimals
        ? friendlyDisplayDecimalPlaces(value.toString(), decimals)
        : decimals
    );
    if (token) {
      return `${inputAmount} ${token.symbol}`;
    } else {
      return `${inputAmount} [${shortenAddress(address, 4)}]`;
    }
  }
}

export const getTokenAmountAndSymbolByTokenAddress = (
  amount: number,
  address: string,
  onlyValue = false,
  tokenList?: TokenInfo[]
): string => {
  let token: TokenInfo | undefined = undefined;
  if (address) {
    if (address === NATIVE_SOL.address) {
      token = NATIVE_SOL as TokenInfo;
    } else {
      token = tokenList && isProd()
        ? tokenList.find(t => t.address === address)
        : MEAN_TOKEN_LIST.find(t => t.address === address);
    }
  }
  const inputAmount = amount || 0;
  if (token) {
    const decimals = STABLE_COINS.has(token.symbol) ? 5 : token.decimals;
    const formatted = new BigNumber(formatAmount(inputAmount, token.decimals));
    const formatted2 = formatted.toFixed(token.decimals);
    const toLocale = formatThousands(parseFloat(formatted2), decimals, decimals);
    if (onlyValue) { return toLocale; }
    return `${toLocale} ${token.symbol}`;
  } else if (address && !token) {
    // TODO: Fair assumption but we should be able to work with either an address or a TokenInfo param
    const unkToken: TokenInfo = {
      address: address,
      name: CUSTOM_TOKEN_NAME,
      chainId: 101,
      decimals: 6,
      symbol: shortenAddress(address),
    };
    const formatted = getFormattedNumberToLocale(formatAmount(inputAmount, unkToken.decimals));
    return onlyValue
      ? maxTrailingZeroes(formatted, 2)
      : `${maxTrailingZeroes(formatted, 2)} [${shortenAddress(address, 4)}]`;
  }
  return `${maxTrailingZeroes(getFormattedNumberToLocale(inputAmount), 2)}`;
}

export function getTxIxResume(tx: Transaction) {
  const programIds: string[] = [];
  tx.instructions.forEach(t => {
    const programId = t.programId.toBase58();
    if (!programIds.includes(programId)) {
      programIds.push(programId);
    }
  });
  return {numIxs: tx.instructions.length, programIds: programIds};
}

export async function findATokenAddress(
  walletAddress: PublicKey,
  tokenMintAddress: PublicKey

): Promise<PublicKey> {

  return (await PublicKey.findProgramAddress(
      [
        walletAddress.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        tokenMintAddress.toBuffer(),
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID
  ))[0];
}

export const getSdkValue = (amount: number | string, asString = false) => {
  if (!amount) {
    return asString ? '0' : new BN(0);
  }

  const value = new BN(amount);
  return asString ? value.toString() : value;
}

export const toUiAmount = (amount: number | BN, decimals: number) => {
  if (!amount || !decimals) { return '0'; }
  if (typeof amount === "number") {
    const value = amount / (10 ** decimals);
    return value.toFixed(decimals);
  } else {
    const baseConvert = new BigNumber(10 ** decimals);
    const bigNumberAmount = new BigNumber((amount as BN).toString());
    const value = bigNumberAmount.dividedBy(baseConvert);
    return value.toFixed(decimals);
  }
}

export const toUiAmountBn = (amount: number | BN, decimals: number, asBn = false) => {
  if (!amount || !decimals) { return '0'; }
  if (typeof amount === "number") {
    const value = amount / (10 ** decimals);
    return asBn ? new BN(value) : value.toFixed(decimals);
  } else {
    const baseConvert = new BigNumber(10 ** decimals);
    const bigNumberAmount = new BigNumber((amount as BN).toString());
    const value = bigNumberAmount.dividedBy(baseConvert);
    return asBn ? new BN(value.toString()) : value.toFixed(decimals);
  }
}

export const toTokenAmount = (amount: number | string, decimals: number, asString = false) => {
  if (!amount || !decimals) {
    return asString ? '0' : new BigNumber(0);
  }

  const multiplier = new BigNumber(10 ** decimals);
  const value = new BigNumber(amount);
  if (asString) {
    const result = value.multipliedBy(multiplier).integerValue();
    return result.toNumber().toLocaleString('fullwide', {useGrouping:false});
  }
  return value.multipliedBy(multiplier);
}

export const toTokenAmountBn = (amount: number | string, decimals: number) => {
  if (!amount || !decimals) {
    return new BN(0);
  }

  const multiplier = new BigNumber(10 ** decimals);
  const value = new BigNumber(amount);
  const result = value.multipliedBy(multiplier).integerValue();
  const toFixed = result.toFixed(0);
  return new BN(toFixed);
}

export function cutNumber(amount: number, decimals: number) {
  const str = `${amount}`;

  return str.slice(0, str.indexOf('.') + decimals + 1);
}

export const makeDecimal = (bn: BN, decimals: number): number => {
  return bn.toNumber() / Math.pow(10, decimals)
}

export const makeInteger = (amount: number, decimals: number): BN => {
  if (!amount || !decimals) { return new BN(0); }
  return new BN(amount * (10 ** decimals))
}

export const addSeconds = (date: Date, seconds: number) => {
  return new Date(date.getTime() + seconds*1000);
}

export const addDays = (date: Date, days: number) => {
  return new Date(date.getTime() + days*24*60*60*1000);
}

export const openLinkInNewTab = (address: string) => {
  window.open(address, '_blank','noreferrer');
}

export const tabNameFormat = (str: string) => {
  return str.toLowerCase().split(' ').join('_');
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    // eslint-disable-next-line no-useless-escape
    .replace(/[\~\!\@\#\$\%\^\&\*\(\)\-\_\=\+\]\[\}\{\'\"\;\\\:\?\/\>\<\.\,]+/g, '-')
    .replace(/ +/g, '-');
}

/**
 * Flatten a multidimensional object
 *
 * For example:
 *   flattenObject{ a: 1, b: { c: 2 } }
 * Returns:
 *   { a: 1, c: 2}
 */
 export const flattenObject = (obj: any) => {
  const flattened: any = {};

  Object.keys(obj).forEach((key) => {
    const value = obj[key];

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(flattened, flattenObject(value));
    } else {
      flattened[key] = value;
    }
  })

  return flattened
}
