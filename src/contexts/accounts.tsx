import { type MintInfo, MintLayout, u64 } from '@solana/spl-token';
import { type AccountInfo, PublicKey } from '@solana/web3.js';
import React, { useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { HALF_MINUTE_REFRESH_TIMEOUT } from '../app-constants';
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

interface ParsedAccountBase {
  pubkey: PublicKey;
  account: AccountInfo<Buffer>;
  info: MintInfo;
}

export const MintParser = (pubKey: PublicKey, info: AccountInfo<Buffer>) => {
  const buffer = Buffer.from(info.data);

  const details = {
    pubkey: pubKey,
    account: {
      ...info,
    },
    info: deserializeMint(buffer),
  } as ParsedAccountBase;

  return details;
};

export const useAccountsContext = () => {
  const context = useContext(AccountsContext);
  return context;
};

const useNativeAccountInfo = () => {
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

interface Props {
  children: ReactNode;
}

export function AccountsProvider({ children }: Props) {
  const { nativeAccount, refreshAccount } = useNativeAccountInfo();

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

export function useMintInfo(address: PublicKey | undefined) {
  const connection = useConnection();
  const [mint, setMint] = useState<MintInfo>();

  useEffect(() => {
    if (!address) return;

    connection.getAccountInfo(address).then(value => {
      if (value) {
        const account = MintParser(new PublicKey(address), value);
        if (account) {
          setMint(account.info);
        }
      }
    });
  }, [connection, address]);

  return mint;
}
