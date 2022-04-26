import { useCallback, useState } from "react";
import { ASSOCIATED_TOKEN_PROGRAM_ID, MintInfo, Token } from "@solana/spl-token";
import { TokenAccount } from "./../models";
import {
  Account,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Signer,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionSignature
} from "@solana/web3.js";
import { INPUT_AMOUNT_PATTERN } from "../constants";
import { TokenInfo } from "@solana/spl-token-registry";
import { CUSTOM_USDC, MEAN_TOKEN_LIST } from "../constants/token-list";
import { getFormattedNumberToLocale, maxTrailingZeroes } from "./ui";
import { TransactionFees } from '@mean-dao/money-streaming/lib/types';
import { RENT_PROGRAM_ID, SYSTEM_PROGRAM_ID, TOKEN_PROGRAM_ID } from "./ids";
import { NATIVE_SOL } from './tokens';
import { ACCOUNT_LAYOUT } from './layouts';
import { initializeAccount } from '@project-serum/serum/lib/token-instructions';
import { AccountTokenParsedInfo, TokenAccountInfo } from '../models/token';
import { BigNumber } from "bignumber.js";
import BN from "bn.js";
import { isMobile } from "react-device-detect";

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
  if (!address) { return ""; }
  const numChars = isMobile ? 4 : chars;
  return `${address.slice(0, numChars)}...${address.slice(-numChars)}`;
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

export const STABLE_COINS = new Set(["USDC", "wUSDC", "USDT"]);

export function chunks<T>(array: T[], size: number): T[][] {
  return Array.apply<number, T[], T[][]>(
    0,
    new Array(Math.ceil(array.length / size))
  ).map((_, index) => array.slice(index * size, (index + 1) * size));
}

export const getAmountFromLamports = (amount: number): number => {
  return (amount || 0) / LAMPORTS_PER_SOL;
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
  return INPUT_AMOUNT_PATTERN.test(str);
}

export const getTokenByMintAddress = (address: string, tokenList?: TokenInfo[]): TokenInfo | undefined => {
  const tokenFromTokenList = tokenList
    ? tokenList.find(t => t.address === address)
    : MEAN_TOKEN_LIST.find(t => t.address === address);
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

export const getFormattedRateAmount = (amount: number): string => {
  return `${getFormattedNumberToLocale(formatAmount(amount, 2), 2)}`;
}

export const getAmountWithSymbol = (amount: number, address?: string, onlyValue = false) => {
  let token: TokenInfo | undefined = undefined;
  if (address) {
    if (address === NATIVE_SOL.address) {
      token = NATIVE_SOL as TokenInfo;
    } else {
      token = address ? MEAN_TOKEN_LIST.find(t => t.address === address) : undefined;
    }
  }

  const formatToLocale = (value: any, minDigits = 6) => {
    const converted = parseFloat(value.toString());
    const formatted = new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: minDigits, maximumFractionDigits: minDigits }).format(converted);
    return formatted || '';
  }

  const inputAmount = amount || 0;
  if (token) {
    const formatted = new BigNumber(formatAmount(inputAmount, token.decimals));
    const formatted2 = formatted.toFixed(token.decimals);
    const toLocale = formatToLocale(formatted2, token.decimals);
    if (onlyValue) { return toLocale; }
    return `${toLocale} ${token.symbol}`;
  } else if (address && !token) {
    const formatted = formatToLocale(inputAmount);
    return onlyValue ? formatted : `${formatted} [${shortenAddress(address, 4)}]`;
  }
  return `${formatToLocale(inputAmount)}`;
}

export const getTokenAmountAndSymbolByTokenAddress = (
  amount: number,
  address: string,
  onlyValue = false
): string => {
  let token: TokenInfo | undefined = undefined;
  if (address) {
    if (address === NATIVE_SOL.address) {
      token = NATIVE_SOL as TokenInfo;
    } else if (address === CUSTOM_USDC.address) {
      token = CUSTOM_USDC as TokenInfo;
    } else {
      token = address ? MEAN_TOKEN_LIST.find(t => t.address === address) : undefined;
    }
  }
  const inputAmount = amount || 0;
  if (token) {
    const formatted = new BigNumber(formatAmount(inputAmount, token.decimals));
    const formatted2 = formatted.toFixed(token.decimals);
    const toLocale = getFormattedNumberToLocale(formatted2, 2);
    if (onlyValue) { return toLocale; }
    return `${toLocale} ${token.symbol}`;
  } else if (address && !token) {
    // TODO: Fair assumption but we should be able to work with either an address or a TokenInfo param
    const unkToken: TokenInfo = {
      address: address,
      name: 'Unknown',
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

export const getComputedFees = (fees: TransactionFees): number => {
  return fees.mspFlatFee ? fees.blockchainFee + fees.mspFlatFee : fees.blockchainFee;
}

export async function fetchAccountTokens(
  connection: Connection,
  pubkey: PublicKey
) {
  let data;
  try {
    const { value } = await connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID });
    data = value.map((accountInfo: any) => {
      const parsedInfo = accountInfo.account.data.parsed.info as TokenAccountInfo;
      return { parsedInfo, pubkey: accountInfo.pubkey };
    });
    return data as AccountTokenParsedInfo[];
  } catch (error) {
    console.error(error);
  }
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

// from raydium
export async function signTransaction(
  connection: Connection,
  wallet: any,
  transaction: Transaction,
  signers: Array<Account> = []
) {
  transaction.recentBlockhash = (await connection.getRecentBlockhash()).blockhash
  transaction.setSigners(wallet.publicKey, ...signers.map((s) => s.publicKey))
  if (signers.length > 0) {
    transaction.partialSign(...signers)
  }
  return await wallet.signTransaction(transaction)
}

export async function sendTransaction(
  connection: Connection,
  wallet: any,
  transaction: Transaction,
  signers: Array<Account> = []
  
) {
  
  if (wallet.isProgramWallet) {
    const programWalletTransaction = await covertToProgramWalletTransaction(
      connection, 
      wallet, 
      transaction, signers
    );

    return await wallet.signAndSendTransaction(programWalletTransaction);

  } else {
    const signedTransaction = await signTransaction(
      connection, 
      wallet, 
      transaction, 
      signers
    );

    return await sendSignedTransaction(connection, signedTransaction)
  }
}

export async function sendSignedTransaction(
  connection: Connection, 
  signedTransaction: Transaction
): Promise<string> {

  const rawTransaction = signedTransaction.serialize()

  const txid: TransactionSignature = await connection.sendRawTransaction(rawTransaction, {
    skipPreflight: true,
    preflightCommitment: connection.commitment
  });

  return txid;
}

export function mergeTransactions(transactions: (Transaction | undefined)[]) {
  const transaction = new Transaction();

  transactions
    .filter((t): t is Transaction => t !== undefined)
    .forEach((t) => {
      transaction.add(t)
    });

  return transaction;
}

async function covertToProgramWalletTransaction(
  connection: Connection,
  wallet: any,
  transaction: Transaction,
  signers: Array<Account> = []

) {

  const { blockhash } = await connection.getRecentBlockhash(connection.commitment);

  transaction.recentBlockhash = blockhash;
  transaction.feePayer = wallet.publicKey;

  if (signers.length > 0) {
    transaction = await wallet.convertToProgramWalletTransaction(transaction);
    transaction.partialSign(...signers);
  }

  return transaction;
}

export async function createProgramAccountIfNotExist(
  connection: Connection,
  account: string | undefined | null,
  owner: PublicKey,
  programId: PublicKey,
  lamports: number | null,
  layout: any,
  transaction: Transaction,
  signer: Signer[]

) {

  let publicKey;

  if (account) {
    publicKey = new PublicKey(account);
  } else {
    const newAccount = Keypair.generate();
    publicKey = newAccount.publicKey;

    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: owner,
        newAccountPubkey: publicKey,
        lamports: lamports ?? (await connection.getMinimumBalanceForRentExemption(layout.span)),
        space: layout.span,
        programId
      })
    );

    signer.push(newAccount);
  }

  return publicKey;
}

export async function findATokenAddress(
  walletAddress: PublicKey,
  tokenMintAddress: PublicKey

): Promise<PublicKey> {

  return (
      await PublicKey.findProgramAddress(
          [
              walletAddress.toBuffer(),
              TOKEN_PROGRAM_ID.toBuffer(),
              tokenMintAddress.toBuffer(),
          ],
          ASSOCIATED_TOKEN_PROGRAM_ID
      )
  )[0];
}

export async function createAssociatedTokenAccount(
  tokenMintAddress: PublicKey,
  owner: PublicKey,
  transaction: Transaction
  
) {

  const associatedTokenAddress = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    owner, 
    tokenMintAddress
  );

  const keys = [
    {
      pubkey: owner,
      isSigner: true,
      isWritable: true
    },
    {
      pubkey: associatedTokenAddress,
      isSigner: false,
      isWritable: true
    },
    {
      pubkey: owner,
      isSigner: false,
      isWritable: false
    },
    {
      pubkey: tokenMintAddress,
      isSigner: false,
      isWritable: false
    },
    {
      pubkey: SYSTEM_PROGRAM_ID,
      isSigner: false,
      isWritable: false
    },
    {
      pubkey: TOKEN_PROGRAM_ID,
      isSigner: false,
      isWritable: false
    },
    {
      pubkey: RENT_PROGRAM_ID,
      isSigner: false,
      isWritable: false
    }
  ]

  transaction.add(
    new TransactionInstruction({
      keys,
      programId: ASSOCIATED_TOKEN_PROGRAM_ID,
      data: Buffer.from([])
    })
  );

  return associatedTokenAddress;
}

export async function createTokenAccountIfNotExist(
  connection: Connection,
  account: string | undefined | null,
  owner: PublicKey,
  mintAddress: string,
  lamports: number | null,
  transaction: Transaction,
  signer: Array<Signer>

) {
  let publicKey;

  if (account) {
    publicKey = new PublicKey(account);
  } else {
    publicKey = await createProgramAccountIfNotExist(
      connection,
      account,
      owner,
      TOKEN_PROGRAM_ID,
      lamports,
      ACCOUNT_LAYOUT,
      transaction,
      signer
    );

    transaction.add(
      initializeAccount({
        account: publicKey,
        mint: new PublicKey(mintAddress),
        owner
      })
    );
  }

  return publicKey;
}

export async function createAmmAuthority(programId: PublicKey) {
  const seeds = [new Uint8Array(Buffer.from('amm authority'.replace('\u00A0', ' '), 'utf-8'))];
  const [publicKey, nonce] = await PublicKey.findProgramAddress(seeds, programId);

  return { publicKey, nonce }
}

export function getStreamedUnitsPerSecond(rateIntervalInSeconds: number, rateAmount: number) {
  if (rateIntervalInSeconds <= 0) { return 0; }
  return rateAmount / rateIntervalInSeconds;
}

export const toUiAmount = (amount: BN, decimals: number) => {
  if (!decimals) { return 0; }
  return amount.toNumber() / (10 ** decimals);
}

export const toTokenAmount = (amount: number, decimals: number) => {
  if (!amount || !decimals) { return 0; }
  return amount * (10 ** decimals);
}

export function cutNumber(amount: number, decimals: number) {
  const str = `${amount}`;

  return str.slice(0, str.indexOf('.') + decimals + 1);
}

// Some could prefer these instead of toUiAmount and toTokenAmount
export const makeDecimal = (bn: BN, decimals: number): number => {
  return bn.toNumber() / Math.pow(10, decimals)
}

export const makeInteger = (num: number, decimals: number): BN => {
  const mul = Math.pow(10, decimals)
  return new BN(num * mul)
}

export const addSeconds = (date: Date, seconds: number) => {
  return new Date(date.getTime() + seconds*1000);
}

export const addDays = (date: Date, days: number) => {
  return new Date(date.getTime() + days*24*60*60*1000);
}
