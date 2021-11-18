import React from 'react';
import { Button, Modal, Menu, Dropdown, DatePicker, Spin } from "antd";
import {
  CheckOutlined,
  LoadingOutlined,
  QrcodeOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useCallback, useContext, useEffect, useState } from "react";
import { useConnection, useConnectionConfig } from "../../contexts/connection";
import { IconCaretDown, IconEdit } from "../../Icons";
import {
  formatAmount,
  getTokenAmountAndSymbolByTokenAddress,
  getTxIxResume,
  isValidNumber,
  shortenAddress,
} from "../../utils/utils";
import { Identicon } from "../../components/Identicon";
import { DATEPICKER_FORMAT, PAYROLL_CONTRACT } from "../../constants";
import { QrScannerModal } from "../../components/QrScannerModal";
import { PaymentRateType, TimesheetRequirementOption, TransactionStatus } from "../../models/enums";
import {
  consoleOut,
  disabledDate,
  getAmountWithTokenSymbol,
  getFairPercentForInterval,
  getIntervalFromSeconds,
  getPaymentRateOptionLabel,
  getRateIntervalInSeconds,
  getTimesheetRequirementOptionLabel,
  getTransactionModalTitle,
  getTransactionOperationDescription,
  getTransactionStatusForLogs,
  isLocal,
  isToday,
  isValidAddress,
  PaymentRateTypeOption
} from "../../utils/ui";
import moment from "moment";
import { useWallet } from "../../contexts/wallet";
import { AppStateContext } from "../../contexts/appstate";
import { LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import { TokenInfo } from "@solana/spl-token-registry";
import { useAccountsContext, useNativeAccount } from "../../contexts/accounts";
import { MoneyStreaming } from '@mean-dao/money-streaming/lib/money-streaming';
import { MSP_ACTIONS, TransactionFees } from '@mean-dao/money-streaming/lib/types';
import { calculateActionFees } from '@mean-dao/money-streaming/lib/utils';
import { useTranslation } from "react-i18next";
import { ContractDefinition } from "../../models/contract-definition";
import { Redirect } from "react-router-dom";
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { ACCOUNT_LAYOUT } from '../../utils/layouts';
import { customLogger } from '../..';
import { StepSelector } from '../../components/StepSelector';
import { NATIVE_SOL_MINT } from '../../utils/ids';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const PayrollPayment = () => {
  const connection = useConnection();
  const { endpoint } = useConnectionConfig();
  const { connected, publicKey, wallet } = useWallet();
  const {
    tokenList,
    selectedToken,
    tokenBalance,
    effectiveRate,
    coinPrices,
    recipientAddress,
    recipientNote,
    paymentStartDate,
    fromCoinAmount,
    paymentRateAmount,
    paymentRateFrequency,
    transactionStatus,
    streamProgramAddress,
    timeSheetRequirement,
    previousWalletConnectState,
    setSelectedToken,
    resetContractValues,
    setSelectedTokenBalance,
    setEffectiveRate,
    setRecipientAddress,
    setRecipientNote,
    setPaymentStartDate,
    setFromCoinAmount,
    setPaymentRateAmount,
    setPaymentRateFrequency,
    setTransactionStatus,
    setSelectedStream,
    refreshStreamList,
    refreshTokenBalance,
    setTimeSheetRequirement,
    setPreviousWalletConnectState
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const [contract] = useState<ContractDefinition>(PAYROLL_CONTRACT);
  const [redirect, setRedirect] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const { account } = useNativeAccount();
  const accounts = useAccountsContext();
  const [userBalances, setUserBalances] = useState<any>();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {

    const getAccountBalance = (): number => {
      return (account?.lamports || 0) / LAMPORTS_PER_SOL;
    }

    if (account?.lamports !== previousBalance || !nativeBalance) {
      // Refresh token balance
      refreshTokenBalance();
      setNativeBalance(getAccountBalance());
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [
    account,
    nativeBalance,
    previousBalance,
    refreshTokenBalance
  ]);

  // Automatically update all token balances
  useEffect(() => {

    if (!connection) {
      console.error('No connection');
      return;
    }

    if (!publicKey || !tokenList || !accounts || !accounts.tokenAccounts) {
      return;
    }

    const timeout = setTimeout(() => {

      const balancesMap: any = {};
      connection.getTokenAccountsByOwner(
        publicKey, 
        { programId: TOKEN_PROGRAM_ID }, 
        connection.commitment
      )
      .then(response => {
        for (let acc of response.value) {
          const decoded = ACCOUNT_LAYOUT.decode(acc.account.data);
          const address = decoded.mint.toBase58();
          const itemIndex = tokenList.findIndex(t => t.address === address);
          if (itemIndex !== -1) {
            balancesMap[address] = decoded.amount.toNumber() / (10 ** tokenList[itemIndex].decimals);
          } else {
            balancesMap[address] = 0;
          }
        }
      })
      .catch(error => {
        console.error(error);
        for (let t of tokenList) {
          balancesMap[t.address] = 0;
        }
      })
      .finally(() => setUserBalances(balancesMap));
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connection,
    tokenList,
    accounts,
    publicKey
  ]);

  const [payrollFees, setPayrollFees] = useState<TransactionFees>({
    blockchainFee: 0, mspFlatFee: 0, mspPercentFee: 0
  });

  useEffect(() => {
    const getTransactionFees = async (): Promise<TransactionFees> => {
      return await calculateActionFees(connection, MSP_ACTIONS.createStreamWithFunds);
    }
    if (!payrollFees.mspFlatFee) {
      getTransactionFees().then(values => {
        setPayrollFees(values);
        consoleOut("payrollFees:", values);
      });
    }
  }, [connection, payrollFees]);

  // Token selection modal
  const [isTokenSelectorModalVisible, setTokenSelectorModalVisibility] = useState(false);
  const showTokenSelector = useCallback(() => setTokenSelectorModalVisibility(true), []);
  const onCloseTokenSelector = useCallback(() => setTokenSelectorModalVisibility(false), []);

  // Recipient Selector modal
  const [isQrScannerModalVisible, setIsQrScannerModalVisibility] = useState(false);
  const showQrScannerModal = useCallback(() => setIsQrScannerModalVisibility(true), []);
  const closeQrScannerModal = useCallback(() => setIsQrScannerModalVisibility(false), []);
  const onAcceptQrScannerModal = () => {
    triggerWindowResize();
    closeQrScannerModal();
  };

  // Transaction execution modal
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isTransactionModalVisible, setTransactionModalVisibility] = useState(false);
  const showTransactionModal = useCallback(() => setTransactionModalVisibility(true), []);
  const closeTransactionModal = useCallback(() => setTransactionModalVisibility(false), []);

  // Event handling

  const onAfterTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      resetContractValues();
    }
  }

  const handleGoToStreamsClick = () => {
    resetContractValues();
    setSelectedStream(undefined);
    closeTransactionModal();
    refreshStreamList(true);
    setRedirect('/accounts/streams');
  };

  const handleFromCoinAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setFromCoinAmount("");
    } else if (newValue === '.') {
      setFromCoinAmount(".");
    } else if (isValidNumber(newValue)) {
      setFromCoinAmount(newValue);
    }
  };

  const handleDateChange = (date: string) => {
    setPaymentStartDate(date);
  }

  const triggerWindowResize = () => {
    window.dispatchEvent(new Event('resize'));
  }

  const handleRecipientNoteChange = (e: any) => {
    setRecipientNote(e.target.value);
  }

  const handleRecipientAddressChange = (e: any) => {
    const inputValue = e.target.value as string;
    // Set the input value
    const trimmedValue = inputValue.trim();
    setRecipientAddress(trimmedValue);
  }

  const handleRecipientAddressFocusIn = () => {
    setTimeout(() => {
      triggerWindowResize();
    }, 10);
  }

  const handleRecipientAddressFocusOut = () => {
    setTimeout(() => {
      triggerWindowResize();
    }, 10);
  }

  // const onRateAmountChange = (value: any) => {
  //   if (value === null || value === undefined || value === "") {
  //     setPaymentRateAmount("");
  //   } else if (isValidNumber(value)) {
  //     setPaymentRateAmount(value);
  //   }
  // }

  const handlePaymentRateAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setPaymentRateAmount("");
    } else if (newValue === '.') {
      setPaymentRateAmount(".");
    } else if (isValidNumber(newValue)) {
      setPaymentRateAmount(newValue);
    }
  };

  const handlePaymentRateOptionChange = (val: PaymentRateType) => {
    setPaymentRateFrequency(val);
  }

  // Effect auto-select token on wallet connect and clear balance on disconnect
  useEffect(() => {
    if (previousWalletConnectState !== connected) {
      // User is connecting
      if (!previousWalletConnectState && connected) {
        setSelectedTokenBalance(0);
      }
      setPreviousWalletConnectState(connected);
    } else if (!connected) {
      setSelectedTokenBalance(0);
    }

    return () => {
      clearTimeout();
    };
  }, [
    connected,
    previousWalletConnectState,
    tokenList,
    setSelectedToken,
    setSelectedTokenBalance,
    setPreviousWalletConnectState,
  ]);

  useEffect(() => {
    const resizeListener = () => {
      const NUM_CHARS = 4;
      const ellipsisElements = document.querySelectorAll(".overflow-ellipsis-middle");
      for (let i = 0; i < ellipsisElements.length; ++i){
        const e = ellipsisElements[i] as HTMLElement;
        if (e.offsetWidth < e.scrollWidth){
          const text = e.textContent;
          e.dataset.tail = text?.slice(text.length - NUM_CHARS);
        }
      }
    };
    // Call it a first time
    resizeListener();

    // set resize listener
    window.addEventListener('resize', resizeListener);

    // clean up function
    return () => {
      // remove resize listener
      window.removeEventListener('resize', resizeListener);
    }
  }, []);

  // Validation

  const isAddressOwnAccount = (): boolean => {
    return recipientAddress && wallet && wallet.publicKey && recipientAddress === wallet.publicKey.toBase58()
           ? true : false;
  }

  const isSendAmountValid = (): boolean => {
    return connected &&
           selectedToken &&
           tokenBalance &&
           fromCoinAmount && parseFloat(fromCoinAmount) > 0 &&
           parseFloat(fromCoinAmount) <= tokenBalance
            ? true
            : false;
  }

  const areSendAmountSettingsValid = (): boolean => {
    return isSendAmountValid() && paymentStartDate ? true : false;
  }

  const arePaymentSettingsValid = (): boolean => {
    let result = true;
    if (!paymentStartDate) {
      return false;
    }
    const rateAmount = parseFloat(paymentRateAmount || '0');
    if (!rateAmount) {
      result = false;
    }

    return result;
  }

  // Ui helpers
  const getStepOneContinueButtonLabel = (): string => {
    return !connected
      ? t('transactions.validation.not-connected')
      : !recipientAddress || isAddressOwnAccount()
      ? t('transactions.validation.select-recipient')
      : !selectedToken || !tokenBalance
      ? t('transactions.validation.no-balance')
      : !paymentStartDate
      ? t('transactions.validation.no-valid-date')
      : !arePaymentSettingsValid()
      ? getPaymentSettingsButtonLabel()
      : t('transactions.validation.valid-continue');
  }

  const getTransactionStartButtonLabel = (): string => {
    return !connected
      ? t('transactions.validation.not-connected')
      : !recipientAddress || isAddressOwnAccount()
      ? t('transactions.validation.select-recipient')
      : !selectedToken || !tokenBalance
      ? t('transactions.validation.no-balance')
      : !fromCoinAmount || !isValidNumber(fromCoinAmount) || !parseFloat(fromCoinAmount)
      ? t('transactions.validation.no-amount')
      : parseFloat(fromCoinAmount) > tokenBalance
      ? t('transactions.validation.amount-high')
      : !paymentStartDate
      ? t('transactions.validation.no-valid-date')
      : !arePaymentSettingsValid()
      ? getPaymentSettingsButtonLabel()
      : t('transactions.validation.valid-approve');
  }

  const getPaymentSettingsButtonLabel = (): string => {
    const rateAmount = parseFloat(paymentRateAmount || '0');
    return !rateAmount
      ? t('transactions.validation.no-payment-rate')
      : rateAmount > tokenBalance
      ? t('transactions.validation.payment-rate-high')
      : '';
  }

  const getPaymentRateLabel = (
    rate: PaymentRateType,
    amount: string | undefined
  ): string => {
    let label: string;
    label = `${selectedToken ? getAmountWithTokenSymbol(amount, selectedToken) : '--'}`;
    switch (rate) {
      case PaymentRateType.PerMinute:
        label += ` ${t('transactions.rate-and-frequency.payment-rates.per-minute')}`;
        break;
      case PaymentRateType.PerHour:
        label += ` ${t('transactions.rate-and-frequency.payment-rates.per-hour')}`;
        break;
      case PaymentRateType.PerDay:
        label += ` ${t('transactions.rate-and-frequency.payment-rates.per-day')}`;
        break;
      case PaymentRateType.PerWeek:
        label += ` ${t('transactions.rate-and-frequency.payment-rates.per-week')}`;
        break;
      case PaymentRateType.PerMonth:
        label += ` ${t('transactions.rate-and-frequency.payment-rates.per-month')}`;
        break;
      case PaymentRateType.PerYear:
        label += ` ${t('transactions.rate-and-frequency.payment-rates.per-year')}`;
        break;
      default:
        break;
    }
    return label;
  };

  const getRecommendedFundingAmount = () => {
    const rateAmount = parseFloat(paymentRateAmount as string);
    const percent = getFairPercentForInterval(paymentRateFrequency);
    const recommendedMinAmount = percent * rateAmount || 0;
    const formatted = formatAmount(recommendedMinAmount, selectedToken?.decimals, true);

    // String to obtain: 0.21 SOL (10%).
    return `${parseFloat(formatted).toString()} ${selectedToken?.symbol}.`;
  }

  const getOptionsFromEnum = (value: any): PaymentRateTypeOption[] => {
    let index = 0;
    const options: PaymentRateTypeOption[] = [];
    for (const enumMember in value) {
        const mappedValue = parseInt(enumMember, 10);
        if (!isNaN(mappedValue)) {
            const item = new PaymentRateTypeOption(
                index,
                mappedValue,
                getPaymentRateOptionLabel(mappedValue, t)
            );
            options.push(item);
        }
        index++;
    }
    return options;
  }

  const getPricePerToken = (token: TokenInfo): number => {
    const tokenSymbol = token.symbol.toUpperCase();
    const symbol = tokenSymbol[0] === 'W' ? tokenSymbol.slice(1) : tokenSymbol;

    return coinPrices && coinPrices[symbol]
      ? coinPrices[symbol]
      : 0;
  }

  const onStepperChange = (value: number) => {
    setCurrentStep(value);
  }

  const onContinueButtonClick = () => {
    setCurrentStep(1);  // Go to step 2
  }

  // Main action

  const onTransactionStart = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    const transactionLog: any[] = [];

    setTransactionCancelled(false);
    setIsBusy(true);

    // Init a streaming operation
    const moneyStream = new MoneyStreaming(endpoint, streamProgramAddress, "confirmed");

    const createTx = async (): Promise<boolean> => {
      if (wallet) {
        consoleOut("Start transaction for contract type:", contract?.name);
        consoleOut('Wallet address:', wallet?.publicKey?.toBase58());

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        consoleOut('Beneficiary address:', recipientAddress);
        const beneficiary = new PublicKey(recipientAddress as string);

        consoleOut('beneficiaryMint:', selectedToken?.address);
        const beneficiaryMint = new PublicKey(selectedToken?.address as string);

        const amount = parseFloat(fromCoinAmount as string);
        const rateAmount = parseFloat(paymentRateAmount as string);
        const now = new Date();
        const parsedDate = Date.parse(paymentStartDate as string);
        consoleOut('Parsed paymentStartDate:', parsedDate);
        const fromParsedDate = new Date(parsedDate);
        fromParsedDate.setHours(now.getHours());
        fromParsedDate.setMinutes(now.getMinutes());
        consoleOut('Local time added to parsed date!');
        consoleOut('fromParsedDate.toString()', fromParsedDate.toString());
        consoleOut('fromParsedDate.toUTCString()', fromParsedDate.toUTCString());

        // Create a transaction
        const data = {
          wallet: wallet.publicKey.toBase58(),                        // wallet
          treasury: 'undefined',                                      // treasury
          beneficiary: beneficiary.toBase58(),                        // beneficiary
          beneficiaryMint: beneficiaryMint.toBase58(),                // beneficiaryMint
          rateAmount: rateAmount,                                     // rateAmount
          rateIntervalInSeconds:
            getRateIntervalInSeconds(paymentRateFrequency),           // rateIntervalInSeconds
          startUtc: fromParsedDate,                                   // startUtc
          streamName: recipientNote
            ? recipientNote.trim()
            : undefined,                                              // streamName
          fundingAmount: amount                                       // fundingAmount
        };
        consoleOut('data:', data, 'blue');

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: data
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: ''
        });

        // Abort transaction in not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
        consoleOut('blockchainFee:', payrollFees.blockchainFee + payrollFees.mspFlatFee, 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');
        if (nativeBalance < payrollFees.blockchainFee + payrollFees.mspFlatFee) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${
              getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getTokenAmountAndSymbolByTokenAddress(payrollFees.blockchainFee + payrollFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
            })`
          });
          customLogger.logError('Payroll Payment transaction failed', { transcript: transactionLog });
          return false;
        }

        return await moneyStream.createStream(
          wallet.publicKey,                                           // wallet
          undefined,                                                  // treasury
          beneficiary,                                                // beneficiary
          beneficiaryMint,                                            // beneficiaryMint
          rateAmount,                                                 // rateAmount
          getRateIntervalInSeconds(paymentRateFrequency),             // rateIntervalInSeconds
          fromParsedDate,                                             // startUtc
          recipientNote
            ? recipientNote.trim()
            : undefined,                                              // streamName
          amount                                                      // fundingAmount
        )
        .then(value => {
          consoleOut('createStream returned transaction:', value);
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
            result: getTxIxResume(value)
          });
          transaction = value;
          return true;
        })
        .catch(error => {
          console.error('createStream error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Payroll Payment transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Payroll Payment transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
        consoleOut('Signing transaction...');
        return await wallet.signTransaction(transaction)
        .then((signed: Transaction) => {
          consoleOut('signTransaction returned a signed transaction:', signed);
          signedTransaction = signed;
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: wallet.publicKey.toBase58(), signature: signed.signature ? signed.signature.toString() : '-'}
          });
          return true;
        })
        .catch(error => {
          console.error('Signing transaction failed!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('Payroll Payment transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        console.error('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot sign transaction! Wallet not found!'
        });
        customLogger.logError('Payroll Payment transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      const encodedTx = signedTransaction.serialize().toString('base64');
      if (wallet) {
        return await connection
          .sendEncodedTransaction(encodedTx, { preflightCommitment: "confirmed" })
          .then(sig => {
            consoleOut('sendEncodedTransaction returned a signature:', sig);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction
            });
            signature = sig;
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionSuccess),
              result: `signature: ${signature}`
            });
            return true;
          })
          .catch(error => {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
              result: { error, encodedTx }
            });
            customLogger.logError('Payroll Payment transaction failed', { transcript: transactionLog });
            return false;
          });
      } else {
        console.error('Cannot send transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot send transaction! Wallet not found!'
        });
        customLogger.logError('Payroll Payment transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const confirmTx = async (): Promise<boolean> => {
      return await connection
        .confirmTransaction(signature, "confirmed")
        .then(result => {
          consoleOut('confirmTransaction result:', result);
          if (result && result.value && !result.value.err) {
            setTransactionStatus({
              lastOperation: TransactionStatus.ConfirmTransactionSuccess,
              currentOperation: TransactionStatus.TransactionFinished
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.TransactionFinished),
              result: result.value
            });
            return true;
          } else {
            setTransactionStatus({
              lastOperation: TransactionStatus.ConfirmTransaction,
              currentOperation: TransactionStatus.ConfirmTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.ConfirmTransactionFailure),
              result: signature
            });
            customLogger.logError('Payroll Payment transaction failed', { transcript: transactionLog });
            return false;
          }
        })
        .catch(e => {
          setTransactionStatus({
            lastOperation: TransactionStatus.ConfirmTransaction,
            currentOperation: TransactionStatus.ConfirmTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.ConfirmTransactionFailure),
            result: signature
          });
          customLogger.logError('Payroll Payment transaction failed', { transcript: transactionLog });
          return false;
        });
    }

    if (wallet) {
      showTransactionModal();
      const create = await createTx();
      consoleOut('create:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('sign:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            const confirmed = await confirmTx();
            consoleOut('confirmed:', confirmed);
            if (confirmed) {
              setIsBusy(false);
            } else { setIsBusy(false); }
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  const isSuccess = (): boolean => {
    return transactionStatus.currentOperation === TransactionStatus.TransactionFinished;
  }

  const isError = (): boolean => {
    return  transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ||
            transactionStatus.currentOperation === TransactionStatus.InitTransactionFailure ||
            transactionStatus.currentOperation === TransactionStatus.SignTransactionFailure ||
            transactionStatus.currentOperation === TransactionStatus.SendTransactionFailure ||
            transactionStatus.currentOperation === TransactionStatus.ConfirmTransactionFailure
            ? true
            : false;
  }

  ///////////////////
  //   Rendering   //
  ///////////////////

  const paymentRateOptionsMenu = (
    <Menu>
      {getOptionsFromEnum(PaymentRateType).map((item) => {
        return (
          <Menu.Item
            key={item.key}
            onClick={() => handlePaymentRateOptionChange(item.value)}>
            {item.text}
          </Menu.Item>
        );
      })}
    </Menu>
  );

  const renderTokenList = (
    <>
      {(selectedToken && tokenList) && (
        tokenList.map((token, index) => {
          const onClick = () => {
            setSelectedToken(token);
            consoleOut("token selected:", token);
            setEffectiveRate(getPricePerToken(token));
            onCloseTokenSelector();
          };
          return (
            <div key={index + 100} onClick={onClick} className={`token-item ${
                selectedToken && selectedToken.address === token.address
                  ? "selected"
                  : "simplelink"
              }`}>
              <div className="token-icon">
                {token.logoURI ? (
                  <img alt={`${token.name}`} width={24} height={24} src={token.logoURI} />
                ) : (
                  <Identicon address={token.address} style={{ width: "24", display: "inline-flex" }} />
                )}
              </div>
              <div className="token-description">
                <div className="token-symbol">{token.symbol}</div>
                <div className="token-name">{token.name}</div>
              </div>
              {
                connected && userBalances && userBalances[token.address] > 0 && (
                  <div className="token-balance">
                    {getTokenAmountAndSymbolByTokenAddress(userBalances[token.address], token.address, true)}
                  </div>
                )
              }
            </div>
          );
        })
      )}
    </>
  );

  const timeSheetRequirementOptionsMenu = (
    <Menu>
      <Menu.Item
        key={TimesheetRequirementOption[0]}
        onClick={() => setTimeSheetRequirement(TimesheetRequirementOption.NotRequired)}>
        {getTimesheetRequirementOptionLabel(TimesheetRequirementOption.NotRequired, t)}
      </Menu.Item>
      <Menu.Item
        key={TimesheetRequirementOption[1]}
        onClick={() => setTimeSheetRequirement(TimesheetRequirementOption.SubmitTimesheets)}>
        {getTimesheetRequirementOptionLabel(TimesheetRequirementOption.SubmitTimesheets, t)}
      </Menu.Item>
      <Menu.Item
        key={TimesheetRequirementOption[2]}
        onClick={() => setTimeSheetRequirement(TimesheetRequirementOption.ClockinClockout)}>
        {getTimesheetRequirementOptionLabel(TimesheetRequirementOption.ClockinClockout, t)}
      </Menu.Item>
    </Menu>
  );

  return (
    <>
      {redirect && (<Redirect to={redirect} />)}

      <StepSelector step={currentStep} steps={2} onValueSelected={onStepperChange} />

      <div className={currentStep === 0 ? "contract-wrapper panel1 show" : "contract-wrapper panel1 hide"}>

        {/* Recipient */}
        <div className="form-label">{t('transactions.recipient.label')}</div>
        <div className="well">
          <div className="flex-fixed-right">
            <div className="left position-relative">
              <span className="recipient-field-wrapper">
                <input id="payment-recipient-field"
                  className="general-text-input"
                  autoComplete="on"
                  autoCorrect="off"
                  type="text"
                  onFocus={handleRecipientAddressFocusIn}
                  onChange={handleRecipientAddressChange}
                  onBlur={handleRecipientAddressFocusOut}
                  placeholder={t('transactions.recipient.placeholder')}
                  required={true}
                  spellCheck="false"
                  value={recipientAddress}/>
                <span id="payment-recipient-static-field"
                      className={`${recipientAddress ? 'overflow-ellipsis-middle' : 'placeholder-text'}`}>
                  {recipientAddress || t('transactions.recipient.placeholder')}
                </span>
              </span>
            </div>
            <div className="right">
              <div className="add-on simplelink" onClick={showQrScannerModal}>
                <QrcodeOutlined />
              </div>
            </div>
          </div>
          {
            recipientAddress && !isValidAddress(recipientAddress) ? (
              <span className="form-field-error">
                {t("assets.account-address-validation")}
              </span>
            ) : isAddressOwnAccount() ? (
              <span className="form-field-error">
                {t('transactions.recipient.recipient-is-own-account')}
              </span>
            ) : (null)
          }
        </div>

        {/* <div className="well">
          <div className="flex-fixed-left">
            <div className="left">
              <span className="add-on simplelink">
                <div className="token-selector" onClick={() => showTokenSelector()}>
                  <div className="token-icon">
                    {selectedToken?.logoURI ? (
                      <img alt={`${selectedToken.name}`} width={20} height={20} src={selectedToken.logoURI} />
                    ) : (
                      <Identicon address={selectedToken?.address} style={{ width: "24", display: "inline-flex" }} />
                    )}
                  </div>
                  <div className="token-symbol">{selectedToken?.symbol}</div>
                  <span className="flex-center">
                    <IconCaretDown className="mean-svg-icons" />
                  </span>
                </div>
              </span>
            </div>
            <div className="well-divider"></div>
            <div className="right">
              <InputNumber
                className="general-text-input"
                min={0}
                step={1}
                pattern="^[0-9]*[.,]?[0-9]*$"
                placeholder="0.0"
                value={parseFloat(paymentRateAmount)}
                onChange={onRateAmountChange}
              />
            </div>
          </div>
        </div> */}

        {/* Receive rate */}
        <div className="form-label">{t('transactions.rate-and-frequency.amount-label')}</div>
        <div className="well">
          <div className="flex-fixed-left">
            <div className="left">
              <span className="add-on simplelink">
                <div className="token-selector" onClick={() => showTokenSelector()}>
                  <div className="token-icon">
                    {selectedToken?.logoURI ? (
                      <img alt={`${selectedToken.name}`} width={20} height={20} src={selectedToken.logoURI} />
                    ) : (
                      <Identicon address={selectedToken?.address} style={{ width: "24", display: "inline-flex" }} />
                    )}
                  </div>
                  <div className="token-symbol">{selectedToken?.symbol}</div>
                  <span className="flex-center">
                    <IconCaretDown className="mean-svg-icons" />
                  </span>
                </div>
              </span>
            </div>
            <div className="right">
              <input
                className="general-text-input text-right"
                inputMode="decimal"
                autoComplete="off"
                autoCorrect="off"
                type="text"
                onChange={handlePaymentRateAmountChange}
                pattern="^[0-9]*[.,]?[0-9]*$"
                placeholder="0.0"
                minLength={1}
                maxLength={79}
                spellCheck="false"
                value={paymentRateAmount}
              />
            </div>
          </div>
          <div className="flex-fixed-right">
            <div className="left inner-label">
              <span>{t('transactions.send-amount.label-right')}:</span>
              <span>
                {`${tokenBalance && selectedToken
                    ? getTokenAmountAndSymbolByTokenAddress(tokenBalance, selectedToken?.address, true)
                    : "0"
                }`}
              </span>
            </div>
            <div className="right inner-label">&nbsp;</div>
          </div>
        </div>

        {/* Receive frequency */}
        <div className="form-label">{t('transactions.rate-and-frequency.rate-label')}</div>
        <div className="well">
          <Dropdown
            overlay={paymentRateOptionsMenu}
            trigger={["click"]}>
            <span className="dropdown-trigger no-decoration flex-fixed-right align-items-center">
              <div className="left">
                <span className="capitalize-first-letter">{getPaymentRateOptionLabel(paymentRateFrequency, t)}{" "}</span>
              </div>
              <div className="right">
                <IconCaretDown className="mean-svg-icons" />
              </div>
            </span>
          </Dropdown>
        </div>

        {/* Send date */}
        <div className="form-label">{t('transactions.send-date.label')}</div>
        <div className="well">
          <div className="flex-fixed-right">
            <div className="left static-data-field">
              {isToday(paymentStartDate || '')
                ? `${paymentStartDate} (${t('common:general.now')})`
                : `${paymentStartDate}`}
            </div>
            <div className="right">
              <div className="add-on simplelink">
                <DatePicker
                  size="middle"
                  bordered={false}
                  className="addon-date-picker"
                  aria-required={true}
                  allowClear={false}
                  disabledDate={disabledDate}
                  placeholder={t('transactions.send-date.placeholder')}
                  onChange={(value, date) => handleDateChange(date)}
                  value={moment(
                    paymentStartDate,
                    DATEPICKER_FORMAT
                  )}
                  format={DATEPICKER_FORMAT}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Memo */}
        <div className="form-label">{t('transactions.memo2.label')}</div>
        <div className="well">
          <div className="flex-fixed-right">
            <div className="left">
              <input
                id="payment-memo-field"
                className="w-100 general-text-input"
                autoComplete="on"
                autoCorrect="off"
                type="text"
                onChange={handleRecipientNoteChange}
                placeholder={t('transactions.memo2.placeholder')}
                spellCheck="false"
                value={recipientNote}
              />
            </div>
          </div>
        </div>

        {/* Continue button */}
        <Button
          className="main-cta"
          block
          type="primary"
          shape="round"
          size="large"
          onClick={onContinueButtonClick}
          disabled={!connected || !isValidAddress(recipientAddress) || isAddressOwnAccount() || !arePaymentSettingsValid()}>
          {getStepOneContinueButtonLabel()}
        </Button>

      </div>

      <div className={currentStep === 1 ? "contract-wrapper panel2 show" : "contract-wrapper panel2 hide"}>

        {/* Summary */}
        {publicKey && recipientAddress && (
          <>
            <div className="flex-fixed-right">
              <div className="left">
                <div className="form-label">{t('transactions.resume')}</div>
              </div>
              <div className="right">
                <span className="flat-button change-button" onClick={() => setCurrentStep(0)}>
                  <IconEdit className="mean-svg-icons" />
                  <span>{t('general.cta-change')}</span>
                </span>
              </div>
            </div>
            <div className="well">
              <div className="three-col-flexible-middle">
                <div className="left flex-row">
                  <div className="flex-center">
                    <Identicon
                      address={isValidAddress(recipientAddress) ? recipientAddress : NATIVE_SOL_MINT.toBase58()}
                      style={{ width: "30", display: "inline-flex" }} />
                  </div>
                  <div className="flex-column pl-3">
                    <div className="address">
                      {publicKey && isValidAddress(recipientAddress)
                        ? shortenAddress(recipientAddress)
                        : t('transactions.validation.no-recipient')}
                    </div>
                    <div className="inner-label mt-0">{recipientNote || '-'}</div>
                  </div>
                </div>
                <div className="middle flex-center">
                  <div className="vertical-bar"></div>
                </div>
                <div className="right flex-column">
                  <div className="rate">
                    {selectedToken
                      ? getTokenAmountAndSymbolByTokenAddress(parseFloat(paymentRateAmount), selectedToken.address)
                      : '-'
                    }
                    {getIntervalFromSeconds(getRateIntervalInSeconds(paymentRateFrequency), true, t)}
                  </div>
                  <div className="inner-label mt-0">{paymentStartDate}</div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Timesheet requirement */}
        {isLocal() && (
          <>
            <div className="form-label">{t('transactions.timesheet-requirement.label')}</div>
            <div className="well">
              <Dropdown
                overlay={timeSheetRequirementOptionsMenu}
                trigger={["click"]}>
                <span className="dropdown-trigger no-decoration flex-fixed-right align-items-center">
                  <div className="left">
                    <span className="capitalize-first-letter">{getTimesheetRequirementOptionLabel(timeSheetRequirement, t)}</span>
                  </div>
                  <div className="right">
                    <IconCaretDown className="mean-svg-icons" />
                  </div>
                </span>
              </Dropdown>
            </div>
          </>
        )}

        <div className="mb-3 text-center">
          <div>{t('transactions.transaction-info.add-funds-payroll-advice')}.</div>
          <div>{t('transactions.transaction-info.min-recommended-amount')}: <span className="fg-red">{getRecommendedFundingAmount()}</span></div>
        </div>

        {/* Add funds */}
        <div className="form-label">{t('transactions.send-amount.label-amount')}</div>
        <div className="well">
          <div className="flex-fixed-left">
            <div className="left">
              <span className="add-on simplelink">
                <div className="token-selector" onClick={() => showTokenSelector()}>
                  <div className="token-icon">
                    {selectedToken?.logoURI ? (
                      <img alt={`${selectedToken.name}`} width={20} height={20} src={selectedToken.logoURI} />
                    ) : (
                      <Identicon address={selectedToken?.address} style={{ width: "24", display: "inline-flex" }} />
                    )}
                  </div>
                  <div className="token-symbol">{selectedToken?.symbol}</div>
                  <span className="flex-center">
                    <IconCaretDown className="mean-svg-icons" />
                  </span>
                </div>
                {selectedToken && tokenBalance ? (
                  <div
                    className="token-max simplelink"
                    onClick={() =>
                      setFromCoinAmount(
                        tokenBalance.toFixed(selectedToken.decimals)
                      )
                    }>
                    MAX
                  </div>
                ) : null}
              </span>
            </div>
            <div className="right">
              <input
                className="general-text-input text-right"
                inputMode="decimal"
                autoComplete="off"
                autoCorrect="off"
                type="text"
                onChange={handleFromCoinAmountChange}
                pattern="^[0-9]*[.,]?[0-9]*$"
                placeholder="0.0"
                minLength={1}
                maxLength={79}
                spellCheck="false"
                value={fromCoinAmount}
              />
            </div>
          </div>
          <div className="flex-fixed-right">
            <div className="left inner-label">
              <span>{t('transactions.send-amount.label-right')}:</span>
              <span>
                {`${tokenBalance && selectedToken
                    ? getTokenAmountAndSymbolByTokenAddress(tokenBalance, selectedToken?.address, true)
                    : "0"
                }`}
              </span>
            </div>
            <div className="right inner-label">
              ~${fromCoinAmount && effectiveRate
                ? formatAmount(parseFloat(fromCoinAmount) * effectiveRate, 2)
                : "0.00"}
            </div>
          </div>
        </div>

        {/* Action button */}
        <Button
          className="main-cta"
          block
          type="primary"
          shape="round"
          size="large"
          onClick={onTransactionStart}
          disabled={!connected || !isValidAddress(recipientAddress) || isAddressOwnAccount() || !arePaymentSettingsValid() || !areSendAmountSettingsValid()}>
          {getTransactionStartButtonLabel()}
        </Button>

      </div>

      {/* QR scan modal */}
      {isQrScannerModalVisible && (
        <QrScannerModal
          isVisible={isQrScannerModalVisible}
          handleOk={onAcceptQrScannerModal}
          handleClose={closeQrScannerModal}/>
      )}

      {/* Token selection modal */}
      <Modal
        className="mean-modal unpadded-content"
        visible={isTokenSelectorModalVisible}
        title={<div className="modal-title">{t('token-selector.modal-title')}</div>}
        onCancel={onCloseTokenSelector}
        width={450}
        footer={null}>
        <div className="token-list">
          {renderTokenList}
        </div>
      </Modal>

      {/* Transaction execution modal */}
      <Modal
        className="mean-modal"
        maskClosable={false}
        afterClose={onAfterTransactionModalClosed}
        visible={isTransactionModalVisible}
        title={getTransactionModalTitle(transactionStatus, isBusy, t)}
        onCancel={closeTransactionModal}
        width={330}
        footer={null}>
        <div className="transaction-progress">
          {isBusy ? (
            <>
              <Spin indicator={bigLoadingIcon} className="icon" />
              <h4 className="font-bold mb-1">{getTransactionOperationDescription(transactionStatus)}</h4>
              <h5 className="operation">{getPaymentRateLabel(paymentRateFrequency, paymentRateAmount)}</h5>
              <div className="indication">{t('transactions.status.instructions')}</div>
            </>
          ) : isSuccess() ? (
            <>
              <CheckOutlined style={{ fontSize: 48 }} className="icon" />
              <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus)}</h4>
              <p className="operation">{t('transactions.status.stream-started-pre')} {getPaymentRateLabel(paymentRateFrequency, paymentRateAmount)} {t('transactions.status.stream-started-post')}.</p>
              <Button
                block
                type="primary"
                shape="round"
                size="middle"
                onClick={handleGoToStreamsClick}>
                {t('transactions.status.cta-view-stream')}
              </Button>
            </>
          ) : isError() ? (
            <>
              <WarningOutlined style={{ fontSize: 48 }} className="icon" />
              {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                <h4 className="mb-4">
                  {t('transactions.status.tx-start-failure', {
                    accountBalance: getTokenAmountAndSymbolByTokenAddress(
                      nativeBalance,
                      NATIVE_SOL_MINT.toBase58()
                    ),
                    feeAmount: getTokenAmountAndSymbolByTokenAddress(
                      payrollFees.blockchainFee + payrollFees.mspFlatFee,
                      NATIVE_SOL_MINT.toBase58()
                    )})
                  }
                </h4>
              ) : (
                <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus)}</h4>
              )}
              <Button
                block
                type="primary"
                shape="round"
                size="middle"
                onClick={closeTransactionModal}>
                {t('general.cta-close')}
              </Button>
            </>
          ) : (
            <>
              <Spin indicator={bigLoadingIcon} className="icon" />
              <h4 className="font-bold mb-4 text-uppercase">{t('transactions.status.tx-wait')}...</h4>
            </>
          )}
        </div>
      </Modal>
    </>
  );
};
