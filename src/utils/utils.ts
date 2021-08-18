import BN from 'bn.js';
import { useCallback, useState } from "react";
import { AccountInfo, AccountLayout, ASSOCIATED_TOKEN_PROGRAM_ID, MintInfo, Token } from "@solana/spl-token";
import { TokenAccount } from "./../models";
import { Account, Connection, Keypair, PublicKey, Signer, SystemProgram, Transaction } from "@solana/web3.js";
import { NON_NEGATIVE_AMOUNT_PATTERN, POSITIVE_NUMBER_PATTERN, WAD, ZERO } from "../constants";
import { TokenInfo } from "@solana/spl-token-registry";
import { MEAN_TOKEN_LIST } from "../constants/token-list";
import { getFormattedNumberToLocale, maxTrailingZeroes } from "./ui";
import { TransactionFees } from "money-streaming/lib/types";
import { TOKEN_PROGRAM_ID, WRAPPED_SOL_MINT } from "./ids";
import { Provider } from '@project-serum/anchor';

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
export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function getTokenName(
  map: KnownTokenMap,
  mint?: string | PublicKey,
  shorten = true
): string {
  const mintAddress = typeof mint === "string" ? mint : mint?.toBase58();

  if (!mintAddress) {
    return "N/A";
  }

  const knownSymbol = map.get(mintAddress)?.symbol;
  if (knownSymbol) {
    return knownSymbol;
  }

  return shorten ? `${mintAddress.substring(0, 5)}...` : mintAddress;
}

export function getTokenByName(tokenMap: KnownTokenMap, name: string) {
  let token: TokenInfo | null = null;
  for (const val of tokenMap.values()) {
    if (val.symbol === name) {
      token = val;
      break;
    }
  }
  return token;
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

export function isKnownMint(map: KnownTokenMap, mintAddress: string) {
  return !!map.get(mintAddress);
}

export const STABLE_COINS = new Set(["USDC", "wUSDC", "USDT"]);

export function chunks<T>(array: T[], size: number): T[][] {
  return Array.apply<number, T[], T[][]>(
    0,
    new Array(Math.ceil(array.length / size))
  ).map((_, index) => array.slice(index * size, (index + 1) * size));
}

export function toLamports(
  account?: TokenAccount | number,
  mint?: MintInfo
): number {
  if (!account) {
    return 0;
  }

  const amount =
    typeof account === "number" ? account : account.info.amount?.toNumber();

  const precision = Math.pow(10, mint?.decimals || 0);
  return Math.floor(amount * precision);
}

export function wadToLamports(amount?: BN): BN {
  return amount?.div(WAD) || ZERO;
}

export function fromLamports(
  account?: TokenAccount | number | BN,
  mint?: MintInfo,
  rate: number = 1.0
): number {
  if (!account) {
    return 0;
  }

  const amount = Math.floor(
    typeof account === "number"
      ? account
      : BN.isBN(account)
      ? account.toNumber()
      : account.info.amount.toNumber()
  );

  const precision = Math.pow(10, mint?.decimals || 0);
  return (amount / precision) * rate;
}

var SI_SYMBOL = ["", "k", "M", "G", "T", "P", "E"];

const abbreviateNumber = (number: number, precision: number) => {
  if (number === undefined) {
    return '--';
  }
  let tier = (Math.log10(number) / 3) | 0;
  let scaled = number;
  let suffix = SI_SYMBOL[tier];
  if (tier !== 0) {
    let scale = Math.pow(10, tier * 3);
    scaled = number / scale;
  }

  return scaled.toFixed(precision) + suffix;
};

export const formatAmount = (
  val: number,
  precision: number = 6,
  abbr: boolean = false
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

export function formatTokenAmount(
  account?: TokenAccount,
  mint?: MintInfo,
  rate: number = 1.0,
  prefix = "",
  suffix = "",
  precision = 6,
  abbr = false
): string {
  if (!account) {
    return "";
  }

  return `${[prefix]}${formatAmount(
    fromLamports(account, mint, rate),
    precision,
    abbr
  )}${suffix}`;
}

export const formatUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export const numberFormatter = new Intl.NumberFormat("en-US", {
  style: "decimal",
  minimumFractionDigits: 4,
  maximumFractionDigits: 9,
});

export const isSmallNumber = (val: number) => {
  return val < 0.001 && val > 0;
};

export const formatNumber = {
  format: (val?: number, useSmall?: boolean) => {
    if (!val) {
      return "--";
    }
    if (useSmall && isSmallNumber(val)) {
      return 0.001;
    }

    return numberFormatter.format(val);
  },
};

export const feeFormatter = new Intl.NumberFormat("en-US", {
  style: "decimal",
  minimumFractionDigits: 2,
  maximumFractionDigits: 9,
});

export const formatPct = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function convert(
  account?: TokenAccount | number,
  mint?: MintInfo,
  rate: number = 1.0
): number {
  if (!account) {
    return 0;
  }

  const amount =
    typeof account === "number" ? account : account.info.amount?.toNumber();

  const precision = Math.pow(10, mint?.decimals || 0);
  let result = (amount / precision) * rate;

  return result;
}

export function isValidNumber(str: string): boolean {
  if (str === null || str === undefined ) { return false; }
  return NON_NEGATIVE_AMOUNT_PATTERN.test(str);
}

export function isPositiveNumber(str: string): boolean {
  if (str === null || str === undefined ) { return false; }
  return POSITIVE_NUMBER_PATTERN.test(str);
}

export const getTokenByMintAddress = (address: string): TokenInfo | undefined => {
  const tokenFromTokenList = MEAN_TOKEN_LIST.find(t => t.address === address);
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

export const getTokenAmountAndSymbolByTokenAddress = (
  amount: number,
  address: string,
  onlyValue = false,
  truncateInsteadRound = false
): string => {
  const tokenFromTokenList = address ? MEAN_TOKEN_LIST.find(t => t.address === address) : undefined;
  const inputAmount = amount || 0;
  if (tokenFromTokenList) {
    const formatted = truncateInsteadRound
      ? truncateFloat(inputAmount, tokenFromTokenList.decimals)
      : `${getFormattedNumberToLocale(formatAmount(inputAmount, tokenFromTokenList.decimals))}`;
    if (onlyValue) {
      return maxTrailingZeroes(formatted, 2);
    }
    return `${maxTrailingZeroes(formatted, 2)} ${tokenFromTokenList.symbol}`;
  }
  return `${maxTrailingZeroes(getFormattedNumberToLocale(inputAmount), 2)}`;
}

export const truncateFloat = (value: any, decimals = 2): string => {
  const numericString = value.toString();
  const splitted = numericString.split('.');

  if (splitted.length === 1 || splitted[1].length <= decimals) {
    return numericString;
  }

  const reshapedDecimals = splitted[1].slice(0, decimals);
  splitted[1] = reshapedDecimals;
  return splitted.join('.');
}

export const getComputedFees = (fees: TransactionFees): number => {
  return fees.mspFlatFee ? fees.blockchainFee + fees.mspFlatFee : fees.blockchainFee;
}

export async function getOwnedAssociatedTokenAccounts(
  connection: Connection,
  publicKey: PublicKey
) {
  let filters = getOwnedAccountsFilters(publicKey);
  // @ts-ignore
  let resp = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
    commitment: connection.commitment,
    filters,
  });

  const accs = resp
    .map(({ pubkey, account: { data, executable, owner, lamports } }: any) => ({
      publicKey: new PublicKey(pubkey),
      accountInfo: {
        data,
        executable,
        owner: new PublicKey(owner),
        lamports,
      },
    }))
    .map(({ publicKey, accountInfo }: any) => {
      console.log('public-key => ', publicKey);
      console.log('accountInfo => ', accountInfo);
      return { publicKey, account: parseTokenAccountData(accountInfo.data) };
    });

  return (
    (
      await Promise.all(
        accs
          // @ts-ignore
          .map(async (ta) => {
            const ata = await Token.getAssociatedTokenAddress(
              ASSOCIATED_TOKEN_PROGRAM_ID,
              TOKEN_PROGRAM_ID,
              ta.account.mint,
              publicKey
            );
            return [ta, ata];
          })
      )
    )
      // @ts-ignore
      .filter(([ta, ata]) => ta.publicKey.equals(ata))
      // @ts-ignore
      .map(([ta]) => ta)
  );
}

export function parseTokenAccountData(data: Buffer): AccountInfo {
  // @ts-ignore
  let { mint, owner, amount } = AccountLayout.decode(data);
  // @ts-ignore
  return {
    address: new PublicKey(mint),
    owner: new PublicKey(owner),
    amount: new BN(amount),
  };
}

function getOwnedAccountsFilters(publicKey: PublicKey) {
  return [
    {
      memcmp: {
        // @ts-ignore
        offset: AccountLayout.offsetOf("mint"),
        bytes: publicKey.toBase58(),
      },
    },
    {
      dataSize: AccountLayout.span,
    },
  ];
}

// export async function getCreateATokenTx(

// );

export async function getWrapTxAndSigners(
  provider: Provider,
  account: Keypair,
  amount: number
  
): Promise<{ tx: Transaction; signers: Array<Signer | undefined> }> {
  
  const signers = [account];

  let tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey: account.publicKey,
      lamports: await Token.getMinBalanceRentForExemptAccount(provider.connection),
      space: 165,
      programId: TOKEN_PROGRAM_ID,
    }),
    SystemProgram.transfer({
      fromPubkey: provider.wallet.publicKey,
      toPubkey: account.publicKey,
      lamports: amount,
    }),
    Token.createInitAccountInstruction(
      TOKEN_PROGRAM_ID,
      WRAPPED_SOL_MINT,
      account.publicKey,
      provider.wallet.publicKey
    )
  );

  return { tx, signers };
}
