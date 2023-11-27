import { AccountInfo, ParsedAccountData, SystemProgram } from "@solana/web3.js";

/**
 * Checks if the accountInfo provided by getParsedAccountInfo corresponds to a system owned account
 * @param parsedAccountInfo Parsed accountInfo. Presumably a wallet account
 * @returns true if the accountInfo indicates that the account belongs to the system program
 */
export const isSystemOwnedAccount = (parsedAccountInfo: AccountInfo<Buffer | ParsedAccountData> | null) => {
  return !!(parsedAccountInfo?.owner && parsedAccountInfo.owner.equals(SystemProgram.programId));
}

/**
 * Checks if the accountInfo provided by getParsedAccountInfo corresponds to a token account
 * @param parsedAccountInfo Parsed accountInfo for a token account
 * @returns true if the accountInfo indicates that the account belongs to the spl-token program and it is a token account
 */
export const isTokenAccount = (parsedAccountInfo: AccountInfo<ParsedAccountData> | null) => {
  return !!(
    parsedAccountInfo?.data &&
    parsedAccountInfo.data.program === 'spl-token' &&
    parsedAccountInfo.data.parsed.type === 'account'
  );
};

/**
 * Checks if the accountInfo provided by getParsedAccountInfo corresponds to a mint account
 * @param parsedAccountInfo Parsed accountInfo for a mint account
 * @returns true if the accountInfo indicates that the account belongs to the spl-token program and it is a mint account
 */
export const isTokenMint = (parsedAccountInfo: AccountInfo<ParsedAccountData> | null) => {
  return !!(
    parsedAccountInfo?.data &&
    parsedAccountInfo.data.program === 'spl-token' &&
    parsedAccountInfo.data.parsed.type === 'mint'
  );
};

/**
 * Gets the decimals of the mint based of the mint account info
 * @param parsedAccountInfo Parsed accountInfo for a mint account
 * @returns number of decimals or 0
 */
export const getMintDecimals = (parsedAccountInfo: AccountInfo<ParsedAccountData> | null) => {
  return parsedAccountInfo?.data && parsedAccountInfo.data.parsed ? parsedAccountInfo.data.parsed.info.decimals : 0;
};

/**
 * Gets the mint address from parsedAccountInfo
 * @param parsedAccountInfo Parsed accountInfo for a token account
 * @returns Mint address or undefined
 */
export const getMintAddress = (parsedAccountInfo: AccountInfo<ParsedAccountData> | null) => {
  return parsedAccountInfo?.data && parsedAccountInfo.data.parsed ? parsedAccountInfo.data.parsed.info.mint as string : undefined;
};

/**
 * Checks if the accountInfo provided by getParsedAccountInfo corresponds to a program account
 * @param parsedAccountInfo Parsed accountInfo for a program account
 * @returns true if the accountInfo indicates that the account belongs to the bpf-upgradeable-loader program and it is a program account
 */
export const isProgramAccount = (parsedAccountInfo: AccountInfo<ParsedAccountData> | null) => {
  return !!(
    parsedAccountInfo?.data &&
    parsedAccountInfo.data.program === 'bpf-upgradeable-loader' &&
    parsedAccountInfo.data.parsed.type === 'program'
  );
};

/**
 * Checks if the accountInfo provided by getParsedAccountInfo corresponds to a program data account
 * @param parsedAccountInfo Parsed accountInfo for a program data account
 * @returns true if the accountInfo indicates that the account belongs to the bpf-upgradeable-loader program and it is a program data account
 */
export const isProgramDataAccount = (parsedAccountInfo: AccountInfo<ParsedAccountData> | null) => {
  return !!(
    parsedAccountInfo?.data &&
    parsedAccountInfo.data.program === 'bpf-upgradeable-loader' &&
    parsedAccountInfo.data.parsed.type === 'programData'
  );
};
