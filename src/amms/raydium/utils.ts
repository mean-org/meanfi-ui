import {
  Connection,
  Keypair,
  PublicKey,
  Signer,
  SystemProgram,
  Transaction,

} from "@solana/web3.js";

import { initializeAccount } from "@project-serum/serum/lib/token-instructions";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { cloneDeep } from "lodash-es";
import { ACCOUNT_LAYOUT, MINT_LAYOUT } from "../../utils/layouts";
import { NATIVE_SOL, TOKENS } from "./tokens";
import { TokenInfo } from "./types";
import { AMM_POOLS } from "../data";
import { LIQUIDITY_POOLS } from "./pools";
import { MARKET_STATE_LAYOUT_V2 } from "@project-serum/serum";
import { SERUM_PROGRAM_ID_V3 } from "../../utils/ids";
import { getMultipleAccounts } from "../../utils/accounts";
import { MARKETS } from '@project-serum/serum/lib/tokens_and_markets';

export const getTokenByMintAddress = (address: string): TokenInfo | null => {

  if (address === NATIVE_SOL.address) {
    return cloneDeep(NATIVE_SOL);
  }

  let token = null;

  for (const symbol of Object.keys(TOKENS)) {
    const info = cloneDeep(TOKENS[symbol]);

    if (info.address === address) {
      token = info;
    }
  }

  return token;
}

export const createTokenAccountIfNotExist = async (
  connection: Connection,
  account: string | undefined | null,
  owner: PublicKey,
  mintAddress: string,
  lamports: number | null,
  transaction: Transaction,
  signer: Array<Signer>

) => {

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
        owner,
      })
    );
  }

  return publicKey;
}

export const createProgramAccountIfNotExist = async (
  connection: Connection,
  account: string | undefined | null,
  owner: PublicKey,
  programId: PublicKey,
  lamports: number | null,
  layout: any,
  transaction: Transaction,
  signer: Signer[]

) => {

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
        lamports:
          lamports ??
          (await connection.getMinimumBalanceForRentExemption(layout.span)),
        space: layout.span,
        programId,
      })
    );

    signer.push(newAccount);
  }

  return publicKey;
}

export const getLpMintDecimals = async (
  connection: any,
  mintAddress: string

): Promise<number> => {

  let decimals = 0;
  let ammPoolInfo = Object.values(AMM_POOLS).find(
    (itemLpToken) => itemLpToken.address === mintAddress
  );

  if (!ammPoolInfo) {
    const mintAccountInfo = await connection.getAccountInfo(mintAddress);
    const mintLayoutData = MINT_LAYOUT.decode(
      Buffer.from(mintAccountInfo.account.data)
    );
    decimals = mintLayoutData.decimals;
  }

  return decimals;
};

export const createAmmAuthority = async (programId: PublicKey) => {

  const seeds = [
    new Uint8Array(
      Buffer.from("amm authority".replace("\u00A0", " "), "utf-8")
    ),
  ];

  const [publicKey, nonce] = await PublicKey.findProgramAddress(
    seeds,
    programId
  );

  return { publicKey, nonce };
}

const SERUM_MARKETS: any[] = [];

export function startMarkets() {

  for (const pool of LIQUIDITY_POOLS) {
    if (
      pool.serumProgramId === SERUM_PROGRAM_ID_V3 &&
      !SERUM_MARKETS.includes(pool.serumMarket) &&
      pool.official
    ) {
      SERUM_MARKETS.push(pool.serumMarket);
    }
  }
}

export const getMarkets = async (connection: Connection) => {

  startMarkets();

  let markets: any = [];
  const marketInfos = await getMultipleAccounts(
    connection, 
    MARKETS.map(m => new PublicKey(m)), 
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