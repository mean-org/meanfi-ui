import { useLocalStorageState } from 'middleware/utils';
import { AccountContext } from 'models/accounts';
import React, { useContext, useMemo } from 'react';
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

  const setSelectedAccount = (account?: AccountContext) => {
    setLastUsedAccount(account ?? null);
  };

  const selectedAccount = useMemo(() => {
    if (!publicKey) return emptyAccount;
    if (!lastUsedAccount?.address) return emptyAccount;
    if (lastUsedAccount.owner !== publicKey.toBase58() && lastUsedAccount.address !== publicKey.toBase58())
      return emptyAccount;

    return lastUsedAccount;
  }, [lastUsedAccount, publicKey]);

  return (
    <WalletAccountContext.Provider
      value={{
        selectedAccount,
        setSelectedAccount,
      }}
    >
      {children}
    </WalletAccountContext.Provider>
  );
}

export function useWalletAccount() {
  const { selectedAccount, setSelectedAccount } = useContext(WalletAccountContext);

  return {
    selectedAccount,
    setSelectedAccount,
  };
}
