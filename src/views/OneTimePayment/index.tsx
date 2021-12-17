import React from 'react';
import { Button, Modal, DatePicker, Spin, Checkbox, Select } from "antd";
import {
  CheckOutlined,
  LoadingOutlined,
  QrcodeOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useCallback, useContext, useEffect, useState } from "react";
import { useConnection, useConnectionConfig } from "../../contexts/connection";
import { formatAmount, getAmountWithSymbol, getTokenAmountAndSymbolByTokenAddress, getTxIxResume, isValidNumber } from "../../utils/utils";
import { DATEPICKER_FORMAT } from "../../constants";
import { QrScannerModal } from "../../components/QrScannerModal";
import { OperationType, TransactionStatus } from "../../models/enums";
import {
  addMinutes,
  consoleOut,
  disabledDate,
  getAmountWithTokenSymbol,
  getTransactionModalTitle,
  getTransactionOperationDescription,
  getTransactionStatusForLogs,
  isToday,
  isValidAddress
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
import { ACCOUNT_LAYOUT } from '../../utils/layouts';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { customLogger } from '../..';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { notify } from '../../utils/notifications';
import { TransactionStatusContext } from '../../contexts/transaction-status';
import { useNavigate } from 'react-router-dom';
import { TokenDisplay } from '../../components/TokenDisplay';
import { TextInput } from '../../components/TextInput';
import { TokenListItem } from '../../components/TokenListItem';

const { Option } = Select;
const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const OneTimePayment = () => {
  const connection = useConnection();
  const { endpoint } = useConnectionConfig();
  const { connected, publicKey, wallet } = useWallet();
  const {
    contract,
    tokenList,
    selectedToken,
    tokenBalance,
    effectiveRate,
    coinPrices,
    loadingPrices,
    isWhitelisted,
    recipientAddress,
    recipientNote,
    paymentStartDate,
    fromCoinAmount,
    transactionStatus,
    isVerifiedRecipient,
    streamProgramAddress,
    previousWalletConnectState,
    refreshPrices,
    setSelectedToken,
    setEffectiveRate,
    setRecipientNote,
    setFromCoinAmount,
    setSelectedStream,
    resetContractValues,
    setRecipientAddress,
    setPaymentStartDate,
    refreshTokenBalance,
    setTransactionStatus,
    setIsVerifiedRecipient,
    setSelectedTokenBalance,
    setPreviousWalletConnectState
  } = useContext(AppStateContext);
  const {
    clearTransactionStatusContext,
    startFetchTxSignatureInfo,
  } = useContext(TransactionStatusContext);
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const [isBusy, setIsBusy] = useState(false);
  const { account } = useNativeAccount();
  const accounts = useAccountsContext();
  const [userBalances, setUserBalances] = useState<any>();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [tokenFilter, setTokenFilter] = useState("");
  const [filteredTokenList, setFilteredTokenList] = useState<TokenInfo[]>([]);
  const [fixedScheduleValue, setFixedScheduleValue] = useState(0);

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

  const [otpFees, setOtpFees] = useState<TransactionFees>({
    blockchainFee: 0, mspFlatFee: 0, mspPercentFee: 0
  });

  useEffect(() => {
    const getTransactionFees = async (): Promise<TransactionFees> => {
      return await calculateActionFees(connection, MSP_ACTIONS.scheduleOneTimePayment);
    }
    if (!otpFees.mspFlatFee) {
      getTransactionFees().then(values => {
        setOtpFees(values);
        consoleOut("otpFees:", values);
      });
    }
  }, [connection, otpFees]);

  const getFeeAmount = () => {
    return isScheduledPayment() ? otpFees.blockchainFee + otpFees.mspFlatFee : otpFees.blockchainFee;
  }

  const resetTransactionStatus = () => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }

  // Token selection modal
  const [isTokenSelectorModalVisible, setTokenSelectorModalVisibility] = useState(false);
  const showTokenSelector = useCallback(() => setTokenSelectorModalVisibility(true), []);
  const onCloseTokenSelector = useCallback(() => {
    setTokenSelectorModalVisibility(false);
    if (tokenFilter && !isValidAddress(tokenFilter)) {
      setTokenFilter('');
    }
  }, [tokenFilter]);

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

  const isScheduledPayment = (): boolean => {
    const now = new Date();
    const parsedDate = Date.parse(paymentStartDate as string);
    const fromParsedDate = new Date(parsedDate);
    return fromParsedDate.getDate() > now.getDate() ? true : false;
  }

  const onAfterTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      setFixedScheduleValue(0);
      resetContractValues();
      setIsVerifiedRecipient(false);
    }
    resetTransactionStatus();
  }

  const handleGoToStreamsClick = () => {
    resetContractValues();
    setIsVerifiedRecipient(false);
    setSelectedStream(undefined);
    closeTransactionModal();
    if (isScheduledPayment()) {
      notify({
        message: t('notifications.create-money-stream-completed'),
        description: t('notifications.create-money-stream-completed-wait-for-confirm'),
        type: "info"
      });
      navigate("/accounts/streams");
    }
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

  // Updates the token list everytime is filtered
  const updateTokenListByFilter = useCallback((searchString: string) => {

    if (!tokenList) {
      return;
    }

    const timeout = setTimeout(() => {

      const filter = (t: any) => {
        return (
          t.symbol.toLowerCase().startsWith(searchString.toLowerCase()) ||
          t.name.toLowerCase().startsWith(searchString.toLowerCase()) ||
          t.address.toLowerCase().startsWith(searchString.toLowerCase())
        );
      };

      let showFromList = !searchString 
        ? tokenList
        : tokenList.filter((t: any) => filter(t));

      setFilteredTokenList(showFromList);

    });

    return () => { 
      clearTimeout(timeout);
    }
    
  }, [
    tokenList,
  ]);

  const onInputCleared = useCallback(() => {
    setTokenFilter('');
    updateTokenListByFilter('');
  },[
    updateTokenListByFilter
  ]);

  const onTokenSearchInputChange = useCallback((e: any) => {

    const newValue = e.target.value;
    setTokenFilter(newValue);
    updateTokenListByFilter(newValue);

  },[
    updateTokenListByFilter
  ]);

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

  // Reset results when the filter is cleared
  useEffect(() => {
    if (tokenList && tokenList.length && filteredTokenList.length === 0 && !tokenFilter) {
      updateTokenListByFilter(tokenFilter);
    }
  }, [
    tokenList,
    tokenFilter,
    filteredTokenList,
    updateTokenListByFilter
  ]);

  // Window resize listener
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

  //////////////////
  //  Validation  //
  //////////////////

  const isMemoValid = (): boolean => {
    return recipientNote && recipientNote.length <= 32
      ? true
      : false;
  }

  const isAddressOwnAccount = (): boolean => {
    return recipientAddress && wallet && wallet.publicKey && recipientAddress === wallet.publicKey.toBase58()
           ? true : false;
  }

  const isSendAmountValid = (): boolean => {
    return  connected &&
            selectedToken &&
            tokenBalance &&
            fromCoinAmount &&
            parseFloat(fromCoinAmount) > 0 &&
            parseFloat(fromCoinAmount) <= tokenBalance
      ? true
      : false;
  }

  const areSendAmountSettingsValid = (): boolean => {
    return paymentStartDate && isSendAmountValid() ? true : false;
  }

  // Ui helpers
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
      : !recipientNote
      ? 'Memo cannot be empty'
      : !isVerifiedRecipient
      ? t('transactions.validation.verified-recipient-unchecked')
      : t('transactions.validation.valid-approve');
  }

  // Main action

  const onTransactionStart = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
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
        consoleOut('associatedToken:', selectedToken?.address);
        const associatedToken = new PublicKey(selectedToken?.address as string);
        const amount = parseFloat(fromCoinAmount as string);
        const now = new Date();
        const parsedDate = Date.parse(paymentStartDate as string);
        let fromParsedDate = new Date(parsedDate);
        fromParsedDate.setHours(now.getHours());
        fromParsedDate.setMinutes(now.getMinutes());
        fromParsedDate.setSeconds(now.getSeconds());
        fromParsedDate.setMilliseconds(now.getMilliseconds());

        // If current user is in the whitelist and we have an amount of minutes to add
        // to the current date selection, calculate it!
        if (isWhitelisted && fixedScheduleValue > 0) {
          fromParsedDate = addMinutes(fromParsedDate, fixedScheduleValue);
        }

        consoleOut('fromParsedDate.toString()', fromParsedDate.toString(), 'crimson');
        consoleOut('fromParsedDate.toLocaleString()', fromParsedDate.toLocaleString(), 'crimson');
        consoleOut('fromParsedDate.toISOString()', fromParsedDate.toISOString(), 'crimson');
        consoleOut('fromParsedDate.toUTCString()', fromParsedDate.toUTCString(), 'crimson');

        // Create a transaction
        const data = {
          wallet: wallet.publicKey.toBase58(),
          beneficiary: beneficiary.toBase58(),                                        // beneficiary
          associatedToken: associatedToken.toBase58(),                                // beneficiaryMint
          amount: amount,                                                             // fundingAmount
          fromParsedDate: fromParsedDate,                                             // startUtc
          recipientNote: recipientNote
            ? recipientNote.trim()
            : undefined                                                               // streamName
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
        consoleOut('blockchainFee:', getFeeAmount(), 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');
        if (nativeBalance < getFeeAmount()) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${
              getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getTokenAmountAndSymbolByTokenAddress(getFeeAmount(), NATIVE_SOL_MINT.toBase58())
            })`
          });
          customLogger.logError('One-Time Payment transaction failed', { transcript: transactionLog });
          return false;
        }

        return await moneyStream.oneTimePayment(
          wallet.publicKey,
          beneficiary,                                                // beneficiary
          associatedToken,                                            // beneficiaryMint
          amount,                                                     // fundingAmount
          fromParsedDate,                                             // startUtc
          recipientNote
            ? recipientNote.trim()
            : undefined                                               // streamName
        )
        .then(value => {
          consoleOut('oneTimePayment returned transaction:', value);
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
          console.error('oneTimePayment error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('One-Time Payment transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('One-Time Payment transaction failed', { transcript: transactionLog });
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
          // Try signature verification by serializing the transaction
          try {
            encodedTx = signedTransaction.serialize().toString('base64');
            consoleOut('encodedTx:', encodedTx, 'orange');
          } catch (error) {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SignTransaction,
              currentOperation: TransactionStatus.SignTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
              result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logWarning('Close stream transaction failed', { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: wallet.publicKey.toBase58()}
          });
          return true;
        })
        .catch(error => {
          console.error(error);
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('One-Time Payment transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        console.error("Cannot sign transaction! Wallet not found!");
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot sign transaction! Wallet not found!'
        });
        customLogger.logError('One-Time Payment transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      if (wallet) {
        return await connection
          .sendEncodedTransaction(encodedTx)
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
              currentOperation: TransactionStatus.SendTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
              result: { error, encodedTx }
            });
            customLogger.logError('One-Time Payment transaction failed', { transcript: transactionLog });
            return false;
          });
      } else {
        console.error('Cannot send transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.WalletNotFound,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot send transaction! Wallet not found!'
        });
        customLogger.logError('One-Time Payment transaction failed', { transcript: transactionLog });
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
              result: ''
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
            customLogger.logError('One-Time Payment transaction failed', { transcript: transactionLog });
            throw(result?.value?.err || new Error("Could not confirm transaction"));
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
          customLogger.logError('One-Time Payment transaction failed', { transcript: transactionLog });
          return false;
        });
    }

    if (wallet) {
      showTransactionModal();
      const create = await createTx();
      consoleOut('created:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('signed:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            if (isScheduledPayment()) {
              consoleOut('Send Tx to confirmation queue:', signature);
              startFetchTxSignatureInfo(signature, "confirmed", OperationType.Transfer);
              setIsBusy(false);
              handleGoToStreamsClick();
            } else {
              const confirmed = await confirmTx();
              consoleOut('confirmed:', confirmed);
              if (confirmed) {
                setIsBusy(false);
              } else { setIsBusy(false); }
            }
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  const onIsVerifiedRecipientChange = (e: any) => {
    setIsVerifiedRecipient(e.target.checked);
  }

  const onFixedScheduleValueChange = (value: any) => {
    setFixedScheduleValue(value);
  }

  const onGotoExchange = () => {
    onCloseTokenSelector();
    navigate('/exchange?from=SOL&to=wSOL');
  }

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

  const getPricePerToken = (token: TokenInfo): number => {
    const tokenSymbol = token.symbol.toUpperCase();
    const symbol = tokenSymbol[0] === 'W' ? tokenSymbol.slice(1) : tokenSymbol;

    return coinPrices && coinPrices[symbol]
      ? coinPrices[symbol]
      : 0;
  }

  const renderTokenList = (
    <>
      {(filteredTokenList && filteredTokenList.length > 0) && (
        filteredTokenList.map((token, index) => {
          const onClick = function () {
            setSelectedToken(token);
            consoleOut("token selected:", token.symbol, 'blue');
            setEffectiveRate(getPricePerToken(token));
            onCloseTokenSelector();
          };

          return (
            <TokenListItem
              key={token.address}
              name={token.name || 'Unknown'}
              mintAddress={token.address}
              className={selectedToken && selectedToken.address === token.address ? "selected" : "simplelink"}
              onClick={onClick}
              balance={connected && userBalances && userBalances[token.address] > 0 ? userBalances[token.address] : 0}
            />
          );
        })
      )}
    </>
  );

  return (
    <>
      {/* {isLocal() && (
        <div className="debug-bar">
          <span className="ml-1">tokenFilter:</span><span className="ml-1 font-bold fg-dark-active">{tokenFilter || '-'}</span>
        </div>
      )} */}

      <div className="contract-wrapper">

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
                {t("transactions.validation.address-validation")}
              </span>
            ) : isAddressOwnAccount() ? (
              <span className="form-field-error">
                {t('transactions.recipient.recipient-is-own-account')}
              </span>
            ) : (null)
          }
        </div>

        {/* Send amount */}
        <div className="form-label">{t('transactions.send-amount.label')}</div>
        <div className="well">
          <div className="flex-fixed-left">
            <div className="left">
              <span className="add-on simplelink">
                {selectedToken && (
                  <TokenDisplay onClick={() => showTokenSelector()}
                    mintAddress={selectedToken.address}
                    name={selectedToken.name}
                    showCaretDown={true}
                  />
                )}
                {selectedToken && tokenBalance ? (
                  <div className="token-max simplelink" onClick={() =>
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
                    ? getAmountWithSymbol(tokenBalance, selectedToken?.address, true)
                    : "0"
                }`}
              </span>
            </div>
            <div className="right inner-label">
              <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
                ~${fromCoinAmount && effectiveRate
                  ? formatAmount(parseFloat(fromCoinAmount) * effectiveRate, 2)
                  : "0.00"}
              </span>
            </div>
          </div>
        </div>

        {/* Optional note */}
        <div className="form-label">{t('transactions.memo.label')}</div>
        <div className="well">
          <div className="flex-fixed-right">
            <div className="left">
              <input
                id="payment-memo-field"
                className="w-100 general-text-input"
                autoComplete="on"
                autoCorrect="off"
                type="text"
                maxLength={32}
                onChange={handleRecipientNoteChange}
                placeholder={t('transactions.memo.placeholder')}
                spellCheck="false"
                value={recipientNote}
              />
            </div>
          </div>
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

        {isWhitelisted && (
          <>
            <div className="form-label">Schedule transfer for: (For dev team only)</div>
              <div className="well">
                <Select value={fixedScheduleValue} bordered={false} onChange={onFixedScheduleValueChange} style={{ width: '100%' }}>
                  <Option value={0}>No fixed scheduling</Option>
                  <Option value={5}>5 minutes from now</Option>
                  <Option value={10}>10 minutes from now</Option>
                  <Option value={15}>15 minutes from now</Option>
                  <Option value={20}>20 minutes from now</Option>
                  <Option value={30}>30 minutes from now</Option>
                </Select>
              <div className="form-field-hint">Selecting a value will override your date selection</div>
            </div>
          </>
        )}

        {/* Confirm recipient address is correct Checkbox */}
        <div className="mb-2">
          <Checkbox onChange={onIsVerifiedRecipientChange}>{t('transactions.verified-recipient-label')}</Checkbox>
        </div>

        {/* Action button */}
        <Button
          className="main-cta"
          block
          type="primary"
          shape="round"
          size="large"
          onClick={onTransactionStart}
          disabled={!isValidAddress(recipientAddress) ||
            !isMemoValid() ||
            isAddressOwnAccount() ||
            !paymentStartDate ||
            !areSendAmountSettingsValid() ||
            !isVerifiedRecipient}>
          {getTransactionStartButtonLabel()}
        </Button>
      </div>

      {/* Token selection modal */}
      {isTokenSelectorModalVisible && (
        <Modal
          className="mean-modal unpadded-content"
          visible={isTokenSelectorModalVisible}
          title={<div className="modal-title">{t('token-selector.modal-title')}</div>}
          onCancel={onCloseTokenSelector}
          width={450}
          footer={null}>
          <div className="token-selector-wrapper">
            <div className="token-search-wrapper">
              <TextInput
                id="token-search-otp"
                value={tokenFilter}
                allowClear={true}
                extraClass="mb-2"
                onInputClear={onInputCleared}
                placeholder={t('token-selector.search-input-placeholder')}
                onInputChange={onTokenSearchInputChange} />
            </div>
            <div className="flex-row align-items-center fg-secondary-60 mb-2 px-1">
              <span>{t("token-selector.looking-for-sol")}</span>&nbsp;
              <span className="simplelink underline" onClick={onGotoExchange}>{t("token-selector.wrap-sol-first")}</span>
            </div>
            <div className="token-list vertical-scroll">
              {filteredTokenList.length > 0 && renderTokenList}
              {(tokenFilter && isValidAddress(tokenFilter) && filteredTokenList.length === 0) && (
                <TokenListItem
                  key={tokenFilter}
                  name="Unknown"
                  mintAddress={tokenFilter}
                  className={selectedToken && selectedToken.address === tokenFilter ? "selected" : "simplelink"}
                  onClick={() => {
                    const uknwnToken: TokenInfo = {
                      address: tokenFilter,
                      name: 'Unknown',
                      chainId: 101,
                      decimals: 6,
                      symbol: '',
                    };
                    setSelectedToken(uknwnToken);
                    consoleOut("token selected:", uknwnToken, 'blue');
                    setEffectiveRate(0);
                    onCloseTokenSelector();
                  }}
                  balance={connected && userBalances && userBalances[tokenFilter] > 0 ? userBalances[tokenFilter] : 0}
                />
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* QR scan modal */}
      {isQrScannerModalVisible && (
        <QrScannerModal
          isVisible={isQrScannerModalVisible}
          handleOk={onAcceptQrScannerModal}
          handleClose={closeQrScannerModal}/>
      )}

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
              <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus.currentOperation, t)}</h4>
              <p className="operation">{t('transactions.status.tx-send-operation')} {getAmountWithTokenSymbol(fromCoinAmount, selectedToken as TokenInfo)}...</p>
              {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
                <div className="indication">{t('transactions.status.instructions')}</div>
              )}
            </>
          ) : isSuccess() ? (
            <>
              <CheckOutlined style={{ fontSize: 48 }} className="icon" />
              <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus.currentOperation, t)}</h4>
              <p className="operation">{getAmountWithTokenSymbol(fromCoinAmount, selectedToken as TokenInfo)} {t('transactions.status.tx-send-operation-success')}.</p>
              <Button
                block
                type="primary"
                shape="round"
                size="middle"
                onClick={isScheduledPayment() ? handleGoToStreamsClick : closeTransactionModal}>
                {isScheduledPayment() ? t('transactions.status.cta-view-stream') : t('general.cta-close')}
              </Button>
            </>
          ) : isError() ? (
            <>
              <WarningOutlined style={{ fontSize: 48 }} className="icon" />
              {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                <h4 className="mb-4">
                  {t('transactions.status.tx-start-failure', {
                    accountBalance: `${getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())}`,
                    feeAmount: `${getTokenAmountAndSymbolByTokenAddress(getFeeAmount(), NATIVE_SOL_MINT.toBase58())}`})
                  }
                </h4>
              ) : (
                <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus.currentOperation, t)}</h4>
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
