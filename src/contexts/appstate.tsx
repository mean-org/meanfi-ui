import React, { useEffect, useMemo, useState } from "react";
import { useLocalStorageState } from "../utils/utils";
import { STREAMING_PAYMENT_CONTRACTS } from "../constants";
import { ContractDefinition } from "../models/contract-definition";
import { PaymentRateType, TimesheetRequirementOption } from "../models/enums";

interface AppStateConfig {
  currentScreen: string | undefined;
  contract: ContractDefinition | undefined;
  recipientAddress: string | undefined;
  recipientNote: string | undefined;
  paymentStartDate: string | undefined;
  fromCoinAmount: string | undefined;
  paymentRateAmount: string | undefined;
  paymentRateFrequency: PaymentRateType;
  timeSheetRequirement: TimesheetRequirementOption;
  setCurrentScreen: (name: string) => void;
  setContract: (name: string) => void;
  setRecipientAddress: (address: string) => void;
  setRecipientNote: (note: string) => void;
  setPaymentStartDate: (date: string) => void;
  setFromCoinAmount: (data: string) => void;
  setPaymentRateAmount: (data: string) => void;
  setPaymentRateFrequency: (freq: PaymentRateType) => void;
  setTimeSheetRequirement: (req: TimesheetRequirementOption) => void;
}

const contextDefaultValues: AppStateConfig = {
  currentScreen: undefined,
  contract: undefined,
  recipientAddress: undefined,
  recipientNote: undefined,
  paymentStartDate: undefined,
  fromCoinAmount: undefined,
  paymentRateAmount: undefined,
  paymentRateFrequency: PaymentRateType.PerMonth,
  timeSheetRequirement: TimesheetRequirementOption.NotRequired,
  setCurrentScreen: () => {},
  setContract: () => {},
  setRecipientAddress: () => {},
  setRecipientNote: () => {},
  setPaymentStartDate: () => {},
  setFromCoinAmount: () => {},
  setPaymentRateAmount: () => {},
  setPaymentRateFrequency: () => {},
  setTimeSheetRequirement: () => {},
};

export const AppStateContext = React.createContext<AppStateConfig>(contextDefaultValues);

const AppStateProvider: React.FC = ({ children }) => {
  const today = new Date().toLocaleDateString();
  const [currentScreen, setSelectedTab] = useState<string | undefined>();
  const [contract, setSelectedContract] = useState<ContractDefinition | undefined>();
  const [recipientAddress, updateRecipientAddress] = useState<string | undefined>();
  const [recipientNote, updateRecipientNote] = useState<string | undefined>();
  const [paymentStartDate, updatePaymentStartDate] = useState<string | undefined>(today);
  const [fromCoinAmount, updateFromCoinAmount] = useState<string | undefined>();
  const [paymentRateAmount, updatePaymentRateAmount] = useState<string | undefined>();
  const [paymentRateFrequency, updatePaymentRateFrequency] = useState<PaymentRateType>(PaymentRateType.PerMonth);
  const [timeSheetRequirement, updateTimeSheetRequirement] = useState<TimesheetRequirementOption>(TimesheetRequirementOption.NotRequired);

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

  const setPaymentStartDate = (date: string) => {
    updatePaymentStartDate(date);
  }

  const setFromCoinAmount = (data: string) => {
    updateFromCoinAmount(data);
  }

  const setPaymentRateAmount = (data: string) => {
    updatePaymentRateAmount(data);
  }

  const setPaymentRateFrequency = (freq: PaymentRateType) => {
    updatePaymentRateFrequency(freq);
  }

  const setTimeSheetRequirement = (req: TimesheetRequirementOption) => {
    updateTimeSheetRequirement(req);
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
          const item = STREAMING_PAYMENT_CONTRACTS.filter(c => !c.disabled)[0];
          setSelectedContract(item);
          setContractName(item.name);
        }
      } else {
        const item = STREAMING_PAYMENT_CONTRACTS.filter(c => !c.disabled)[0];
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
        paymentStartDate,
        fromCoinAmount,
        paymentRateAmount,
        paymentRateFrequency,
        timeSheetRequirement,
        setCurrentScreen,
        setContract,
        setRecipientAddress,
        setRecipientNote,
        setPaymentStartDate,
        setFromCoinAmount,
        setPaymentRateAmount,
        setPaymentRateFrequency,
        setTimeSheetRequirement
      }}>
      {children}
    </AppStateContext.Provider>
  );
};

export default AppStateProvider;
