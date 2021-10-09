import BN from 'bn.js';
import { useCallback, useState } from "react";
import { AccountInfo, AccountLayout, ASSOCIATED_TOKEN_PROGRAM_ID, MintInfo, Token } from "@solana/spl-token";
import { TokenAccount } from "./../models";
import { Account, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Signer, SimulatedTransactionResponse, SystemProgram, Transaction, TransactionInstruction, TransactionSignature } from "@solana/web3.js";
import { NON_NEGATIVE_AMOUNT_PATTERN, POSITIVE_NUMBER_PATTERN, WAD, ZERO } from "../constants";
import { TokenInfo } from "@solana/spl-token-registry";
import { MEAN_TOKEN_LIST } from "../constants/token-list";
import { consoleOut, getFormattedNumberToLocale, maxTrailingZeroes } from "./ui";
import { TransactionFees } from '@mean-dao/money-streaming/lib/types';
import { RENT_PROGRAM_ID, SYSTEM_PROGRAM_ID, TOKEN_PROGRAM_ID } from "./ids";
import { Swap } from '@project-serum/swap';
import { MINT_CACHE } from '../contexts/token';
import { NATIVE_SOL, TOKENS } from './tokens';
import { ACCOUNT_LAYOUT } from './layouts';
import { initializeAccount } from '@project-serum/serum/lib/token-instructions';
import { AccountTokenParsedInfo, TokenAccountInfo } from '../models/token';

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

export const getAmountFromLamports = (amount: number): number => {
  return (amount || 0) / LAMPORTS_PER_SOL;
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
  onlyValue = false
): string => {
  let token: TokenInfo | undefined = undefined;
  if (address) {
    if (address === NATIVE_SOL.address) {
      token = NATIVE_SOL as TokenInfo;
    } else {
      token = address ? MEAN_TOKEN_LIST.find(t => t.address === address) : undefined;
    }
  }
  const inputAmount = amount || 0;
  if (token) {
    let formatted = getFormattedNumberToLocale(formatAmount(inputAmount, token.decimals));
    if (onlyValue) {
      return maxTrailingZeroes(formatted, 2);
    }
    return `${maxTrailingZeroes(formatted, 2)} ${token.symbol}`;
  } else if (address && !token) {
    const formatted = getFormattedNumberToLocale(formatAmount(inputAmount, 4));
    return onlyValue ? maxTrailingZeroes(formatted, 2) : `${maxTrailingZeroes(formatted, 2)} ${shortenAddress(address, 4)}`;
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

export async function fetchAccountTokens(
  pubkey: PublicKey,
  cluster: string,
) {
  let data;
  try {
    const { value } = await new Connection(
      cluster,
      "processed"
    ).getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID });
    data = value.map((accountInfo) => {
      const parsedInfo = accountInfo.account.data.parsed.info as TokenAccountInfo;
      return { parsedInfo, pubkey: accountInfo.pubkey };
    });
    return data as AccountTokenParsedInfo[];
  } catch (error) {
    console.error(error);
  }
}

export async function getOwnedAssociatedTokenAccounts(
  connection: Connection,
  publicKey: PublicKey
) {

  let filters = getOwnedAccountsFilters(publicKey);
  let resp = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
    commitment: connection.commitment,
    filters
  });

  const accs = resp
    .map(({ pubkey, account: { data, executable, owner, lamports }}: any) => ({
      publicKey: pubkey,
      accountInfo: {
        data,
        executable,
        owner,
        lamports,
      }
    }))
    .map(({ publicKey, accountInfo }: any) => {
      return { publicKey, account: parseTokenAccountData(accountInfo.data) };
    });

  return (
    (
      await Promise.all(
        accs
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
    .filter(([ta, ata]: any) => ta.publicKey.equals(ata))
    .map(([ta]) => ta)
  );
}

export function parseTokenAccountData(data: Buffer): AccountInfo {
  
  let { mint, owner, amount } = AccountLayout.decode(data);
  // @ts-ignore
  return {
    address: mint,
    owner,
    amount
  };
}

function getOwnedAccountsFilters(publicKey: PublicKey) {
  return [
    {
      memcmp: {
        offset: AccountLayout.offsetOf("mint"),
        bytes: publicKey.toBase58(),
      },
    },
    {
      dataSize: AccountLayout.span,
    },
  ];
}

export async function getMintInfo(connection: Connection, mint: PublicKey) {

  if (!mint) {
    return undefined;
  }

  if (MINT_CACHE.get(mint.toString())) {
    return MINT_CACHE.get(mint.toString());
  }

  const mintClient = new Token(
    connection,
    mint,
    TOKEN_PROGRAM_ID,
    new Account()
  );

  const mintInfo = await mintClient.getMintInfo();
  MINT_CACHE.set(mint.toString(), mintInfo);

  return mintInfo;
}

export async function parseTxResponse(
  client: Swap,
  resp: SimulatedTransactionResponse,
) {

  consoleOut('simulated Tx resp ->', resp);

  if (resp === undefined || !resp.err || !resp.logs) {
      throw new Error('Unable to simulate swap');
  }

  // Decode the return value.
  let didSwapEvent = resp.logs
      .filter((log: any) => log.startsWith('Program log: 4ZfIrPLY4R'))
      .map((log: any) => {
          const logStr = log.slice('Program log: '.length);
          return client.program.coder.events.decode(logStr)
      })[0];

  if (didSwapEvent && didSwapEvent.data) {
    // consoleOut(didSwapEvent);
    const data: any = didSwapEvent.data;
    const obj = {
      authority: data.authority?.toBase58(),
      fromAmount: data.fromAmount.toNumber(),
      fromMint: data.fromMint?.toBase58(),
      givenAmount: data.givenAmount.toNumber(),
      minExchangeRate: data.minExchangeRate,
      quoteAmount: data.quoteAmount.toNumber(),
      quiteMint: data.quoteMint?.toBase58(),
      spillAmount: data.spillAmount.toNumber(),
      toAmount: data.toAmount.toNumber(),
      toMint: data.toMint.toBase58()
    };

    consoleOut('data => ', obj, 'blue');
  }
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

export async function createAssociatedTokenAccountIfNotExist(
  account: string | undefined | null,
  owner: PublicKey,
  mintAddress: string,
  transaction: Transaction,
  atas: string[] = []

) {

  let publicKey;
  
  if (account) {
    publicKey = new PublicKey(account);
  }

  const mint = new PublicKey(mintAddress);
  const ata = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID, 
    TOKEN_PROGRAM_ID, 
    mint, 
    owner, 
    true
  );

  if (
    (!publicKey || !ata.equals(publicKey)) &&
    mintAddress !== TOKENS.WSOL.mintAddress &&
    !atas.includes(ata.toBase58())
  ) {
    transaction.add(
      Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        mint,
        ata,
        owner,
        owner
      )
    );
    atas.push(ata.toBase58());
  }

  return ata;
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
  const seeds = [new Uint8Array(Buffer.from('amm authority'.replace('\u00A0', ' '), 'utf-8'))];
  const [publicKey, nonce] = await PublicKey.findProgramAddress(seeds, programId);

  return { publicKey, nonce }
}