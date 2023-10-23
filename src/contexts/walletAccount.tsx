import { useLocalStorageState } from 'middleware/utils';
import { AccountContext } from 'models/accounts';
import React, { useCallback, useContext, useMemo, useState } from 'react';
import { useWallet } from './wallet';

export const emptyAccount: AccountContext = {
  address: '',
  name: '',
  isMultisig: false,
  owner: '',
};

interface WalletAccountContextState {
  selectedAccount: AccountContext;
  setSelectedAccount: (account?: AccountContext, override?: boolean) => void;
}

const defaultCtxValues: WalletAccountContextState = {
  selectedAccount: emptyAccount,
  setSelectedAccount: () => {},
};

const WalletAccountContext = React.createContext<WalletAccountContextState>(defaultCtxValues);

interface WalletAccountProviderProps {
  children: React.ReactNode;
}

export function WalletAccountProvider({ children = null }: WalletAccountProviderProps) {
  const { publicKey } = useWallet();
  const [lastUsedAccount, setLastUsedAccount] = useLocalStorageState('lastUsedAccount') as [
    AccountContext,
    (account: AccountContext | null) => void,
  ];
  const [isOverride, setIsOverride] = useState(false);

  const setSelectedAccount = useCallback(
    (account?: AccountContext, override?: boolean) => {
      setLastUsedAccount(account ?? null);
      if (override) {
        setIsOverride(true);
      } else {
        setIsOverride(false);
      }
    },
    [setLastUsedAccount],
  );

  const selectedAccount = useMemo(() => {
    if (!publicKey) return emptyAccount;
    if (!lastUsedAccount?.address) return emptyAccount;
    if (isOverride) {
      return lastUsedAccount;
    }

    if (lastUsedAccount.owner !== publicKey.toBase58() && lastUsedAccount.address !== publicKey.toBase58())
      return emptyAccount;

    return lastUsedAccount;
  }, [isOverride, lastUsedAccount, publicKey]);

  const providerValues = useMemo(() => {
    return {
      selectedAccount,
      setSelectedAccount,
    };
  }, [selectedAccount, setSelectedAccount]);

  return <WalletAccountContext.Provider value={providerValues}>{children}</WalletAccountContext.Provider>;
}

export function useWalletAccount() {
  const { selectedAccount, setSelectedAccount } = useContext(WalletAccountContext);

  return {
    selectedAccount,
    setSelectedAccount,
  };
}
