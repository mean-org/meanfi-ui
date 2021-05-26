import React, { useEffect, useMemo, useState } from "react";
import { useLocalStorageState } from "../utils/utils";
import { STREAMING_PAYMENT_CONTRACTS } from "../constants";
import { ContractDefinition } from "../models/contract-definition";

interface ContractConfig {
  contract: ContractDefinition | undefined;
  setContract: (name: string) => void;
}

const contextDefaultValues: ContractConfig = {
  contract: undefined,
  setContract: () => {}
};

const ContractContext = React.createContext<ContractConfig>(contextDefaultValues);

const ContractProvider: React.FC = ({ children }) => {
  const [contract, setSelectedContract] = useState<ContractDefinition | undefined>();

  const setContract = (name: string) => {
    const items = STREAMING_PAYMENT_CONTRACTS.filter(c => c.name === name);
    if (items?.length) {
      setSelectedContract(items[0]);
      setContractName(name);
    }
  }

  const [contractName, setContractName] = useLocalStorageState("contractName");
  console.log('contractName:', contractName);

  const contractFromCache = useMemo(
    () => STREAMING_PAYMENT_CONTRACTS.find(({ name }) => name === contractName),
    [contractName]
  );
  console.log('contractFromCache:', contractFromCache);

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
    <ContractContext.Provider
      value={{
        contract,
        setContract
      }}>
      {children}
    </ContractContext.Provider>
  );
};

export default ContractProvider;

/*
export function ContractSwitcherProvider({ children = undefined as any }) {
  const [selectedContract, setSelectedContract] = useState<ContractDefinition>(new ContractDefinition());

  const [contractName, setContractName] = useLocalStorageState("contractName");

  const contract = useMemo(
    () => STREAMING_PAYMENT_CONTRACTS.find(({ name }) => name === contractName),
    [contractName]
  );

  useEffect(() => {
    if (contract) {
        setSelectedContract(contract);
    }

    return () => {};
  }, [contract]);

  return (
    <ContractSwitcherContext.Provider
      value={{
        contract: selectedContract,
        select,
      }}>
      {children}
      <Modal
        className="mean-modal"
        title="Select Wallet"
        okText="Connect"
        visible={isModalVisible}
        okButtonProps={{ style: { display: "none" } }}
        onCancel={close}
        width={600}>
        <div className="contract-selector-container">
          <p>Contract selector ready</p>
        </div>
      </Modal>
    </ContractSwitcherContext.Provider>
  );
}

export function useContractSelectionModal() {
  const { contract: selectedContract, select } = useContext(ContractSwitcherContext);

  return {
    selectedContract,
    select,
  };
}
*/
