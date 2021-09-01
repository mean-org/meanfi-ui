import { PublicKey } from "@solana/web3.js";

export const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111')
export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
export const MEMO_PROGRAM_ID = new PublicKey('Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo')
export const RENT_PROGRAM_ID = new PublicKey('SysvarRent111111111111111111111111111111111')
export const CLOCK_PROGRAM_ID = new PublicKey('SysvarC1ock11111111111111111111111111111111')
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')

export const SERUM_PROGRAM_ID_V2 = 'EUqojwWA2rd19FZrzeBncJsm38Jm1hEhE3zsmX3bRc2o'
export const SERUM_PROGRAM_ID_V3 = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'

export const LIQUIDITY_POOL_PROGRAM_ID_V2 = 'RVKd61ztZW9GUwhRbbLoYVRE5Xf1B2tVscKqwZqXgEr'
export const LIQUIDITY_POOL_PROGRAM_ID_V3 = '27haf8L6oxUeXrHrgEgsexjSY5hbVUWEmvv9Nyxg8vQv'
export const LIQUIDITY_POOL_PROGRAM_ID_V4 = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'

export const STAKE_PROGRAM_ID = 'EhhTKczWMGQt46ynNeRX1WfeagwwJd7ufHvCDjRxjo5Q'
export const STAKE_PROGRAM_ID_V4 = 'CBuCnLe26faBpcBP2fktp4rp8abpcAnTWft6ZrP5Q4T'
export const STAKE_PROGRAM_ID_V5 = '9KEPoZmtHUrBbhWN1v1KWLMkkvwY6WLtAVUCPRtRjP4z'

export const IDO_PROGRAM_ID = '6FJon3QE27qgPVggARueB22hLvoh22VzJpXv4rBEoSLF'
export const IDO_PROGRAM_ID_V2 = 'CC12se5To1CdEuw7fDS27B7Geo5jJyL7t5UK2B44NgiH'

export const AUTHORITY_AMM = 'amm authority'
export const AMM_ASSOCIATED_SEED = 'amm_associated_seed'
export const TARGET_ASSOCIATED_SEED = 'target_associated_seed'
export const WITHDRAW_ASSOCIATED_SEED = 'withdraw_associated_seed'
export const OPEN_ORDER_ASSOCIATED_SEED = 'open_order_associated_seed'
export const COIN_VAULT_ASSOCIATED_SEED = 'coin_vault_associated_seed'
export const PC_VAULT_ASSOCIATED_SEED = 'pc_vault_associated_seed'
export const LP_MINT_ASSOCIATED_SEED = 'lp_mint_associated_seed'
export const TEMP_LP_TOKEN_ASSOCIATED_SEED = 'temp_lp_token_associated_seed'

export const LENDING_PROGRAM_ID = new PublicKey(
  "TokenLending1111111111111111111111111111111"
);

export const SWAP_PROGRAM_ID = new PublicKey(
  "SwaPpA9LAaLfeLi3a68M4DjnLqgtticKg6CnyNwgAC8"
);

export const DEX_PROGRAM_ID = new PublicKey(
  "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"
);

export const NATIVE_SOL_MINT = new PublicKey(
  "11111111111111111111111111111111"
);

export const WRAPPED_SOL_MINT = new PublicKey(
  "So11111111111111111111111111111111111111112"
);

export const SRM_MINT = new PublicKey(
  "SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt"
);

export const USDC_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);

export const USDT_MINT = new PublicKey(
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"
);

// Arbitrary mint to represent SOL (not wrapped SOL).
export const SOL_MINT = new PublicKey(
  "Ejmc1UB4EsES5oAaRN63SpoxMJidt3ZGBrqrZk49vjTZ"
);

export const WORM_MARKET_BASE = new PublicKey(
  "6a9wpsZpZGxGhFVSQBpcTNjNjytdbSA1iUw1A5KNDxPw"
);

export const WORM_USDC_MINT = new PublicKey(
  "FVsXUnbhifqJ4LiXQEbpUtXVdB8T5ADLKqSs5t1oc54F"
);

export const WORM_USDC_MARKET = new PublicKey(
  "6nGMps9VfDjkKEwYjdSNqN1ToXkLae4VsN49fzBiDFBd"
);

export const WORM_USDT_MINT = new PublicKey(
  "9w97GdWUYYaamGwdKMKZgGzPduZJkiFizq4rz5CPXRv2"
);

export const WORM_USDT_MARKET = new PublicKey(
  "4v6e6vNXAaEunrvbqkYnKwbaWfck8a2KVR4uRAVXxVwC"
);

export const PROGRAM_IDS = [
  {
    name: "mainnet-beta",
  },
  {
    name: "testnet",
  },
  {
    name: "devnet",
  },
  {
    name: "localnet",
  },
];

export const setProgramIds = (envName: string) => {
  let instance = PROGRAM_IDS.find((env) => env.name === envName);
  if (!instance) {
    return;
  }
};

export const programIds = () => {
  return {
    token: TOKEN_PROGRAM_ID,
  };
};
