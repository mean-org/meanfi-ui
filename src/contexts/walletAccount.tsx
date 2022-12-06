import { SYSTEM_PROGRAM_ID } from '@solana/spl-governance';
import { consoleOut } from 'middleware/ui';
import { useLocalStorageState } from 'middleware/utils';
import { AccountContext } from 'models/accounts';
import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
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
  const { publicKey, connected, isSelectingWallet } = useWallet();
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

  //const [selectedAccount, updateSelectedAccount] = useState<AccountContext>(emptyAccount);

  /*
  useEffect(() => {
    // lastUsedAccount
    if (publicKey && selectedAccount && lastUsedAccount) {
      const selectedAddress = selectedAccount.address;
      const lastAddress = (lastUsedAccount as AccountContext).address;
      if (
        selectedAddress &&
        !selectedAccount.isMultisig &&
        lastAddress &&
        lastAddress !== selectedAddress &&
        lastAddress !== publicKey.toBase58()
      ) {
        const account: AccountContext = {
          name: 'Personal account',
          address: publicKey.toBase58(),
          isMultisig: false,
          owner: SYSTEM_PROGRAM_ID.toBase58(),
        };
        consoleOut('Stored account different than current wallet!', '', 'crimson');
        consoleOut('Setting account to connected wallet!', '', 'crimson');
        updateLastUsedAccount(account);
      }
    }
  }, [lastUsedAccount, publicKey, selectedAccount, updateLastUsedAccount]);
*/
  /*
  const setSelectedAccount = (account?: AccountContext, override = false) => {
    updateSelectedAccount(account || emptyAccount);
    updateLastUsedAccount(account || emptyAccount);
  };
*/

  /*
  useEffect(() => {
    if (!publicKey) return;
    if (selectedAccount.address) return;
    if (
      lastUsedAccount?.address &&
      selectedAccount.address !== lastUsedAccount.address &&
      (lastUsedAccount.owner === publicKey.toBase58() || lastUsedAccount.address === publicKey.toBase58())
    ) {
      consoleOut('Auto select account:', lastUsedAccount, 'crimson');
      setSelectedAccount(lastUsedAccount);
      //      setShouldSelectAccount(false);
      //setIsSelectingAccount(false);
      return;
    }

    //if (isUnauthenticatedRoute(location.pathname)) return;
    if (isSelectingWallet) return;
    //setShouldSelectAccount(true);
  }, [
    lastUsedAccount,
    selectedAccount,
    publicKey,
    isSelectingWallet,
    //location.pathname,
    // setIsSelectingAccount,
    //setSelectedAccount,
    //shouldSelectAccount,
  ]);
*/

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
