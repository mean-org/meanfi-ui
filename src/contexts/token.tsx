import React, { useContext, useState, useEffect } from "react";
import * as assert from "assert";
import { useAsync } from "react-async-hook";
import { Provider, BN } from "@project-serum/anchor";
import { PublicKey, Account } from "@solana/web3.js";
import { NATIVE_SOL_MINT } from "../utils/ids";
import {
  MintInfo,
  AccountInfo as TokenAccount,
  Token,
  TOKEN_PROGRAM_ID
  
} from "@solana/spl-token";

import { getOwnedAssociatedTokenAccounts, parseTokenAccountData } from "../utils/utils";

// Cache storing all token accounts for the connected wallet provider.
const OWNED_TOKEN_ACCOUNTS_CACHE: Array<{
  publicKey: PublicKey;
  account: TokenAccount;
}> = [];

// Cache storing all previously fetched mint infos.
// @ts-ignore
const MINT_CACHE = new Map<string, Promise<MintInfo>>([
  [NATIVE_SOL_MINT.toString(), { decimals: 9 } as MintInfo],
]);

export type TokenContextState = {
  provider: Provider;
};

const TokenContext = React.createContext<TokenContextState | null>(null);

export function TokenContextProvider(props: any) {
  const provider = props.provider;
  const [, setRefresh] = useState(0);

  // Fetch all the owned token accounts for the wallet.
  useEffect(() => {      
    if (!provider.wallet.publicKey) {
      OWNED_TOKEN_ACCOUNTS_CACHE.length = 0;
      setRefresh((r) => r + 1);
      return;
    }
    // Fetch SPL tokens.
    getOwnedAssociatedTokenAccounts(
      provider.connection,
      provider.wallet.publicKey
      
    ).then((accs: any) => {
      if (accs) {
        OWNED_TOKEN_ACCOUNTS_CACHE.push(...accs);
        setRefresh((r) => r + 1);
      }
    });
    
    // Fetch SOL balance.
    provider.connection
      .getAccountInfo(provider.wallet.publicKey)
      .then((acc: { lamports: number }) => {
        if (acc) {
          OWNED_TOKEN_ACCOUNTS_CACHE.push({
            publicKey: provider.wallet.publicKey,
            // @ts-ignore
            account: {
              amount: new BN(acc.lamports),
              mint: NATIVE_SOL_MINT,
            },
          });
          setRefresh((r) => r + 1);
        }
      });

  }, [
      provider.wallet.publicKey,
      provider.connection
  ]);

  return (
    <TokenContext.Provider
      value={{
        provider,
      }}>
      {props.children}
    </TokenContext.Provider>
  );
}

function useTokenContext() {
  const ctx = useContext(TokenContext);
  
  if (ctx === null) {
    throw new Error("Context not available");
  }
  
  return ctx;
}

// Null => none exists.
// Undefined => loading.
export function useOwnedTokenAccount(mint?: PublicKey): {
    publicKey: PublicKey;
    account: TokenAccount
} | null | undefined {

  const { provider } = useTokenContext();
  const [, setRefresh] = useState(0);
  const tokenAccounts = OWNED_TOKEN_ACCOUNTS_CACHE.filter(
    (account) => mint && account.account.mint.equals(mint)
  );

  // Take the account with the most tokens in it.
  tokenAccounts.sort((a, b) =>
    a.account.amount > b.account.amount
      ? -1
      : a.account.amount < b.account.amount
      ? 1
      : 0
  );

  let tokenAccount = tokenAccounts[0];
  const isSol = !mint || typeof mint === 'string'
    ? mint === NATIVE_SOL_MINT.toBase58()
    : mint.equals(NATIVE_SOL_MINT);

  // Stream updates when the balance changes.
  useEffect(() => {
    let listener: number;
    // SOL is special cased since it's not an SPL token.
    if (tokenAccount && isSol) {
      listener = provider.connection.onAccountChange(
        provider.wallet.publicKey,
        (info: { lamports: number }) => {
          const token = {
            amount: new BN(info.lamports),
            mint: NATIVE_SOL_MINT
          } as TokenAccount;
          if (token.amount !== tokenAccount.account.amount) {
            const index = OWNED_TOKEN_ACCOUNTS_CACHE.indexOf(tokenAccount);
            assert.ok(index >= 0);
            OWNED_TOKEN_ACCOUNTS_CACHE[index].account = token;
            setRefresh((r) => r + 1);
          }
        }
      );
    }
    
    // SPL tokens.
    else if (tokenAccount) {
      listener = provider.connection.onAccountChange(
        tokenAccount.publicKey,
        (info) => {
          const token = parseTokenAccountData(info.data);
          if (token.amount !== tokenAccount.account.amount) {
            const index = OWNED_TOKEN_ACCOUNTS_CACHE.indexOf(tokenAccount);
            assert.ok(index >= 0);
            OWNED_TOKEN_ACCOUNTS_CACHE[index].account = token;
            setRefresh((r) => r + 1);
          }
        }
      );
    }
    
    return () => {
      if (listener) {
        provider.connection.removeAccountChangeListener(listener);
      }
    };
    
  }, [
      isSol,
      provider.connection,
      provider.wallet.publicKey,
      tokenAccount
  ]);

  if (mint === undefined) {
    return undefined;
  }

  if (!isSol && tokenAccounts.length === 0) {
    return null;
  }

  return tokenAccount;
}

export function useMint(mint?: PublicKey): MintInfo | undefined | null {
  const { provider } = useTokenContext();
  // Lazy load the mint account if needeed.
  const asyncMintInfo = useAsync(async () => {
    if (!mint) {
      return undefined;
    }
    if (MINT_CACHE.get(mint.toString())) {
      return MINT_CACHE.get(mint.toString());
    }

    const mintClient = new Token(
      provider.connection,
      mint,
      TOKEN_PROGRAM_ID,
      new Account()
    );
    const mintInfo = mintClient.getMintInfo();
    MINT_CACHE.set(mint.toString(), mintInfo);
    return mintInfo;
  }, [provider.connection, mint]);

  if (asyncMintInfo.result) {
    return asyncMintInfo.result;
  }
  return undefined;
}

export function setMintCache(pk: PublicKey, account: MintInfo) {
  MINT_CACHE.set(pk.toString(), new Promise((resolve) => resolve(account)));
}
