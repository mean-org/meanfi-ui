import React, { useEffect, useMemo, useState } from "react";
import { useLocalStorageState } from "../utils/utils";
import { STREAMING_PAYMENT_CONTRACTS } from "../constants";
import { ContractDefinition } from "../models/contract-definition";

interface AppStateConfig {
  currentScreen: string | undefined;
  contract: ContractDefinition | undefined;
  setCurrentScreen: (name: string) => void;
  setContract: (name: string) => void;
}

const contextDefaultValues: AppStateConfig = {
  currentScreen: undefined,
  contract: undefined,
  setCurrentScreen: () => {},
  setContract: () => {}
};

export const AppStateContext = React.createContext<AppStateConfig>(contextDefaultValues);

const AppStateProvider: React.FC = ({ children }) => {
  const [currentScreen, setSelectedTab] = useState<string | undefined>();
  const [contract, setSelectedContract] = useState<ContractDefinition | undefined>();

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
          const items = STREAMING_PAYMENT_CONTRACTS.filter(c => c.name === name);
          if (items?.length) {
            setSelectedContract(items[0]);
            setContractName(name);
          }
        }
      } else {
        const item = STREAMING_PAYMENT_CONTRACTS[0];
        setSelectedContract(item);
        setContractName(item.name);
      }
    }

    setOrAutoSelectFirst(contractName);
  }, [contractName, contractFromCache, setSelectedContract, setContractName]);

  return (
    <AppStateContext.Provider
      value={{
        currentScreen,
        contract,
        setCurrentScreen,
        setContract
      }}>
      {children}
    </AppStateContext.Provider>
  );
};

export default AppStateProvider;
