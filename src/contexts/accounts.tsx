import { MintInfo, MintLayout, u64 } from '@solana/spl-token';
import { AccountInfo, Connection, PublicKey } from '@solana/web3.js';
import React, { useCallback, useContext, useEffect, useState } from 'react';
import { HALF_MINUTE_REFRESH_TIMEOUT } from '../constants';
import { EventEmitter } from '../middleware/eventEmitter';
import { TokenAccount } from '../models/accounts';
import { useConnection } from './connection';
import { useWallet } from './wallet';

interface AccountsContextConfig {
  nativeAccount: AccountInfo<Buffer> | undefined;
  refreshAccount: () => void;
}

const contextDefaultValues: AccountsContextConfig = {
  nativeAccount: undefined,
  refreshAccount: () => {},
};

const AccountsContext = React.createContext<AccountsContextConfig>(contextDefaultValues);
const pendingCalls = new Map<string, Promise<ParsedAccountBase>>();
const genericCache = new Map<string, ParsedAccountBase>();

interface ParsedAccountBase {
  pubkey: PublicKey;
  account: AccountInfo<Buffer>;
  info: any;
}

type AccountParser = (pubkey: PublicKey, data: AccountInfo<Buffer>) => ParsedAccountBase | undefined;

export const MintParser = (pubKey: PublicKey, info: AccountInfo<Buffer>) => {
  const buffer = Buffer.from(info.data);

  const data = deserializeMint(buffer);

  const details = {
    pubkey: pubKey,
    account: {
      ...info,
    },
    info: data,
  } as ParsedAccountBase;

  return details;
};

export const keyToAccountParser = new Map<string, AccountParser>();

export const cache = {
  emitter: new EventEmitter(),
  query: async (connection: Connection, pubKey: string | PublicKey, parser?: AccountParser) => {
    let id: PublicKey;
    if (typeof pubKey === 'string') {
      id = new PublicKey(pubKey);
    } else {
      id = pubKey;
    }

    const address = id.toBase58();

    const account = genericCache.get(address);
    if (account) {
      return account;
    }

    let query = pendingCalls.get(address);
    if (query) {
      return query;
    }

    query = connection.getAccountInfo(id).then(data => {
      if (!data) {
        throw new Error('Account not found');
      }

      return cache.add(id, data, parser);
    }) as Promise<TokenAccount>;
    pendingCalls.set(address, query as any);

    return query;
  },
  add: (id: PublicKey | string, obj: AccountInfo<Buffer>, parser?: AccountParser) => {
    if (obj.data.length === 0) {
      return;
    }

    const address = typeof id === 'string' ? id : id?.toBase58();
    const deserialize = parser ? parser : keyToAccountParser.get(address);
    if (!deserialize) {
      throw new Error('Deserializer needs to be registered or passed as a parameter');
    }

    cache.registerParser(id, deserialize);
    pendingCalls.delete(address);
    const account = deserialize(new PublicKey(address), obj);
    if (!account) {
      return;
    }

    const isNew = !genericCache.has(address);

    genericCache.set(address, account);
    cache.emitter.raiseCacheUpdated(address, isNew, deserialize);
    return account;
  },
  get: (pubKey: string | PublicKey) => {
    let key: string;
    if (typeof pubKey !== 'string') {
      key = pubKey.toBase58();
    } else {
      key = pubKey;
    }

    return genericCache.get(key);
  },
  delete: (pubKey: string | PublicKey) => {
    let key: string;
    if (typeof pubKey !== 'string') {
      key = pubKey.toBase58();
    } else {
      key = pubKey;
    }

    if (genericCache.get(key)) {
      genericCache.delete(key);
      cache.emitter.raiseCacheDeleted(key);
      return true;
    }
    return false;
  },
  byParser: (parser: AccountParser) => {
    const result: string[] = [];
    for (const id of keyToAccountParser.keys()) {
      if (keyToAccountParser.get(id) === parser) {
        result.push(id);
      }
    }

    return result;
  },
  registerParser: (pubkey: PublicKey | string, parser: AccountParser) => {
    if (pubkey) {
      const address = typeof pubkey === 'string' ? pubkey : pubkey?.toBase58();
      keyToAccountParser.set(address, parser);
    }

    return pubkey;
  },
  clear: () => {
    genericCache.clear();
    cache.emitter.raiseCacheCleared();
  },
};

export const useAccountsContext = () => {
  const context = useContext(AccountsContext);
  return context;
};

const UseNativeAccount = () => {
  const connection = useConnection();
  const { publicKey } = useWallet();
  const [nativeAccount, setNativeAccount] = useState<AccountInfo<Buffer>>();

  const refreshAccount = useCallback(() => {
    if (!connection || !publicKey) {
      return undefined;
    }

    connection
      .getAccountInfo(publicKey)
      .then(acc => {
        if (acc) {
          setNativeAccount(acc);
        }
      })
      .catch(error => {
        throw error;
      });
  }, [connection, publicKey]);

  useEffect(() => {
    if (!connection || !publicKey) {
      return;
    }

    if (nativeAccount === undefined) {
      refreshAccount();
    }

    const timeout = setTimeout(() => {
      refreshAccount();
    }, HALF_MINUTE_REFRESH_TIMEOUT);

    return () => {
      clearTimeout(timeout);
    };
  }, [connection, nativeAccount, publicKey, refreshAccount]);

  return { nativeAccount, refreshAccount };
};

export function AccountsProvider({ children = null as any }) {
  const { nativeAccount, refreshAccount } = UseNativeAccount();

  return (
    <AccountsContext.Provider
      value={{
        nativeAccount,
        refreshAccount,
      }}
    >
      {children}
    </AccountsContext.Provider>
  );
}

export function useNativeAccount() {
  const context = useContext(AccountsContext);
  return {
    account: context.nativeAccount as AccountInfo<Buffer>,
  };
}

export function useMint(key?: string | PublicKey) {
  const connection = useConnection();
  const [mint, setMint] = useState<MintInfo>();

  const id = typeof key === 'string' ? key : key?.toBase58();

  useEffect(() => {
    if (!id) {
      return;
    }

    cache
      .query(connection, id, MintParser)
      .then(acc => setMint(acc.info as any))
      .catch(err => console.error(err));

    const dispose = cache.emitter.onCache(e => {
      const event = e;
      if (event.id === id) {
        cache.query(connection, id, MintParser).then(mint => setMint(mint.info as any));
      }
    });
    return () => {
      dispose();
    };
  }, [connection, id]);

  return mint;
}

export const deserializeMint = (data: Buffer) => {
  const mintInfo = MintLayout.decode(data);

  if (mintInfo.mintAuthorityOption === 0) {
    mintInfo.mintAuthority = null;
  } else {
    mintInfo.mintAuthority = new PublicKey(mintInfo.mintAuthority);
  }

  mintInfo.supply = u64.fromBuffer(mintInfo.supply);
  mintInfo.isInitialized = mintInfo.isInitialized !== 0;

  if (mintInfo.freezeAuthorityOption === 0) {
    mintInfo.freezeAuthority = null;
  } else {
    mintInfo.freezeAuthority = new PublicKey(mintInfo.freezeAuthority);
  }

  return mintInfo as MintInfo;
};
