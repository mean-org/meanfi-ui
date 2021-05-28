import React, { useEffect, useMemo, useState } from "react";
import { useLocalStorageState } from "../utils/utils";
import { STREAMING_PAYMENT_CONTRACTS } from "../constants";
import { ContractDefinition } from "../models/contract-definition";

interface AppStateConfig {
  currentScreen: string | undefined;
  contract: ContractDefinition | undefined;
  recipientAddress: string | undefined;
  recipientNote: string | undefined;
  setCurrentScreen: (name: string) => void;
  setContract: (name: string) => void;
  setRecipientAddress: (address: string) => void;
  setRecipientNote: (note: string) => void;
}

const contextDefaultValues: AppStateConfig = {
  currentScreen: undefined,
  contract: undefined,
  recipientAddress: undefined,
  recipientNote: undefined,
  setCurrentScreen: () => {},
  setContract: () => {},
  setRecipientAddress: () => {},
  setRecipientNote: () => {},
};

export const AppStateContext = React.createContext<AppStateConfig>(contextDefaultValues);

const AppStateProvider: React.FC = ({ children }) => {
  const [currentScreen, setSelectedTab] = useState<string | undefined>();
  const [contract, setSelectedContract] = useState<ContractDefinition | undefined>();

  const [recipientAddress, updateRecipientAddress] = useState<string | undefined>();
  const [recipientNote, updateRecipientNote] = useState<string | undefined>();

  const setCurrentScreen = (name: string) => {
    setSelectedTab(name);
  }

  const setContract = (name: string) => {
    const items = STREAMING_PAYMENT_CONTRACTS.filter(c => c.name === name);
    if (items?.length) {
      setSelectedContract(items[0]);
      setContractName(name);
    }
  }

  const setRecipientAddress = (address: string) => {
    updateRecipientAddress(address);
  }

  const setRecipientNote = (note: string) => {
    updateRecipientNote(note);
  }

  const [contractName, setContractName] = useLocalStorageState("contractName");

  const contractFromCache = useMemo(
    () => STREAMING_PAYMENT_CONTRACTS.find(({ name }) => name === contractName),
    [contractName]
  );

  useEffect(() => {

    const setOrAutoSelectFirst = (name?: string) => {
      if (name) {
        if (contractFromCache) {
          setSelectedContract(contractFromCache);
        } else {
          const item = STREAMING_PAYMENT_CONTRACTS[0];
          setSelectedContract(item);
          setContractName(item.name);
        }
      } else {
        const item = STREAMING_PAYMENT_CONTRACTS[0];
        setSelectedContract(item);
        setContractName(item.name);
      }
    }

    setOrAutoSelectFirst(contractName);
    return () => {};
  }, [
    contractName,
    contractFromCache,
    setSelectedContract,
    setContractName
  ]);

  return (
    <AppStateContext.Provider
      value={{
        currentScreen,
        contract,
        recipientAddress,
        recipientNote,
        setCurrentScreen,
        setContract,
        setRecipientAddress,
        setRecipientNote
      }}>
      {children}
    </AppStateContext.Provider>
  );
};

export default AppStateProvider;
