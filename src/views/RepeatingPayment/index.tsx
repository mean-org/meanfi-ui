import React from 'react';
import { Button, Modal, Menu, Dropdown, DatePicker, Checkbox, Drawer } from "antd";
import {
  InfoCircleOutlined,
  LoadingOutlined,
  QrcodeOutlined,
} from "@ant-design/icons";
import { useCallback, useContext, useEffect, useState } from "react";
import { getNetworkIdByEnvironment, useConnection, useConnectionConfig } from "../../contexts/connection";
import { IconCaretDown, IconEdit } from "../../Icons";
import {
  cutNumber,
  fetchAccountTokens,
  formatThousands,
  getAmountWithSymbol,
  getTokenAmountAndSymbolByTokenAddress,
  getTokenBySymbol,
  getTxIxResume,
  isValidNumber,
  shortenAddress,
  toTokenAmount2,
  toUiAmount2,
} from "../../middleware/utils";
import { Identicon } from "../../components/Identicon";
import { CUSTOM_TOKEN_NAME, DATEPICKER_FORMAT, MAX_TOKEN_LIST_ITEMS, MIN_SOL_BALANCE_REQUIRED, NO_FEES, SIMPLE_DATE_TIME_FORMAT } from "../../constants";
import { QrScannerModal } from "../../components/QrScannerModal";
import { EventType, OperationType, PaymentRateType, TransactionStatus } from "../../models/enums";
import {
  consoleOut,
  disabledDate,
  getIntervalFromSeconds,
  getPaymentRateOptionLabel,
  getRateIntervalInSeconds,
  getTransactionStatusForLogs,
  isToday,
  isValidAddress,
  PaymentRateTypeOption,
  toUsCurrency
} from "../../middleware/ui";
import moment from "moment";
import { useWallet } from "../../contexts/wallet";
import { AppStateContext } from "../../contexts/appstate";
import { AccountInfo, LAMPORTS_PER_SOL, ParsedAccountData, PublicKey, Transaction } from "@solana/web3.js";
import { useNativeAccount } from "../../contexts/accounts";
import { useTranslation } from "react-i18next";
import { customLogger } from '../..';
import { StepSelector } from '../../components/StepSelector';
import { NATIVE_SOL_MINT } from '../../middleware/ids';
import { useLocation } from 'react-router-dom';
import { confirmationEvents, TxConfirmationContext, TxConfirmationInfo } from '../../contexts/transaction-status';
import { TokenDisplay } from '../../components/TokenDisplay';
import { TextInput } from '../../components/TextInput';
import { TokenListItem } from '../../components/TokenListItem';
import { calculateActionFees, MSP, MSP_ACTIONS, TransactionFees } from "@mean-dao/msp";
import { AppUsageEvent, SegmentStreamRPTransferData } from '../../middleware/segment-service';
import { segmentAnalytics } from '../../App';
import dateFormat from 'dateformat';
import { TokenInfo } from '@solana/spl-token-registry';
import useWindowSize from '../../hooks/useWindowResize';
import { InfoIcon } from '../../components/InfoIcon';
import { NATIVE_SOL } from '../../middleware/tokens';
import { environment } from '../../environments/environment';
import { ACCOUNTS_ROUTE_BASE_PATH } from '../../pages/accounts';
import { AccountTokenParsedInfo } from '../../models/token';
import { RecipientAddressInfo } from '../../models/common-types';
import BN from 'bn.js';

export const RepeatingPayment = (props: {
  inModal: boolean;
  transferCompleted?: any;
  token?: TokenInfo;
  tokenChanged: any;
}) => {
  const { inModal, transferCompleted, token, tokenChanged } = props;
  const connection = useConnection();
  const { endpoint } = useConnectionConfig();
  const { connected, publicKey, wallet } = useWallet();
  const {
    tokenList,
    userTokens,
    splTokenList,
    loadingPrices,
    recipientNote,
    fromCoinAmount,
    recipientAddress,
    paymentStartDate,
    paymentRateAmount,
    transactionStatus,
    isVerifiedRecipient,
    paymentRateFrequency,
    streamV2ProgramAddress,
    previousWalletConnectState,
    setPaymentRateFrequency,
    setIsVerifiedRecipient,
    getTokenPriceByAddress,
    getTokenPriceBySymbol,
    setPaymentRateAmount,
    setTransactionStatus,
    resetContractValues,
    setRecipientAddress,
    setPaymentStartDate,
    setFromCoinAmount,
    setRecipientNote,
    setEffectiveRate,
    refreshPrices,
  } = useContext(AppStateContext);
  const { enqueueTransactionConfirmation } = useContext(TxConfirmationContext);
  // const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('common');
  const { account } = useNativeAccount();
  const { width } = useWindowSize();
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [userBalances, setUserBalances] = useState<any>();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [tokenFilter, setTokenFilter] = useState("");
  const [filteredTokenList, setFilteredTokenList] = useState<TokenInfo[]>([]);
  const [selectedList, setSelectedList] = useState<TokenInfo[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [canSubscribe, setCanSubscribe] = useState(true);
  const [isTokenSelectorVisible, setIsTokenSelectorVisible] = useState(false);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | undefined>(undefined);
  const [tokenBalance, setSelectedTokenBalance] = useState<number>(0);
  const [tokenBalanceBn, setSelectedTokenBalanceBn] = useState(new BN(0));
  const [recipientAddressInfo, setRecipientAddressInfo] = useState<RecipientAddressInfo>({ type: '', mint: '', owner: '' });
  const [repeatingPaymentFees, setRepeatingPaymentFees] = useState<TransactionFees>(NO_FEES);

  const getTransactionFees = useCallback(async (action: MSP_ACTIONS): Promise<TransactionFees> => {
    return await calculateActionFees(connection, action);
  }, [connection]);

  const getFeeAmount = useCallback(() => {
    return repeatingPaymentFees.blockchainFee + repeatingPaymentFees.mspFlatFee;
  }, [repeatingPaymentFees.blockchainFee, repeatingPaymentFees.mspFlatFee]);

  const getMinSolBlanceRequired = useCallback(() => {
    const feeAmount = getFeeAmount();
    return feeAmount > MIN_SOL_BALANCE_REQUIRED
      ? feeAmount
      : MIN_SOL_BALANCE_REQUIRED;

  }, [getFeeAmount]);

  const getMaxAmount = useCallback(() => {
    const amount = nativeBalance - getMinSolBlanceRequired();
    return amount > 0 ? amount : 0;
  }, [getMinSolBlanceRequired, nativeBalance]);

  const getDisplayAmount = useCallback((amount: BN) => {
    if (selectedToken) {
      return getAmountWithSymbol(
        toUiAmount2(amount, selectedToken.decimals),
        selectedToken.address,
        true,
        splTokenList,
        selectedToken.decimals
      );
    }
    return '0';
  }, [selectedToken, splTokenList]);

  const resetTransactionStatus = useCallback(() => {

    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });

  }, [
    setTransactionStatus
  ]);

  const autoFocusInput = useCallback(() => {
    const input = document.getElementById("token-search-rp");
    if (input) {
      setTimeout(() => {
        input.focus();
      }, 100);
    }
  }, []);

  const showDrawer = () => {
    setIsTokenSelectorVisible(true);
    autoFocusInput();
  };

  const hideDrawer = () => {
    setIsTokenSelectorVisible(false);
  };

  // Token selection modal
  const [isTokenSelectorModalVisible, setTokenSelectorModalVisibility] = useState(false);

  const showTokenSelector = useCallback(() => {
    setTokenSelectorModalVisibility(true);
    autoFocusInput();
  }, [autoFocusInput]);

  const onCloseTokenSelector = useCallback(() => {
    hideDrawer();
    setTokenSelectorModalVisibility(false);
    // Reset token on errors (decimals: -1 or -2)
    if (selectedToken && selectedToken.decimals < 0) {
      tokenChanged(undefined);
      setSelectedToken(undefined);
    }
    if (tokenFilter && !isValidAddress(tokenFilter)) {
      setTokenFilter('');
    }
  }, [selectedToken, tokenChanged, tokenFilter]);

  // Recipient Selector modal
  const [isQrScannerModalVisible, setIsQrScannerModalVisibility] = useState(false);
  const showQrScannerModal = useCallback(() => setIsQrScannerModalVisibility(true), []);
  const closeQrScannerModal = useCallback(() => setIsQrScannerModalVisibility(false), []);
  const onAcceptQrScannerModal = () => {
    triggerWindowResize();
    closeQrScannerModal();
  };

  // Event handling

  const handleGoToStreamsClick = useCallback(() => {
    resetContractValues();
    setCurrentStep(0);
    // navigate(STREAMS_ROUTE_BASE_PATH);
  }, [resetContractValues]);

  const recordTxConfirmation = useCallback((signature: string, success = true) => {
    const event = success ? AppUsageEvent.TransferRecurringCompleted : AppUsageEvent.TransferRecurringFailed;
    segmentAnalytics.recordEvent(event, { signature: signature });
  }, []);

  // Setup event handler for Tx confirmed
  const onTxConfirmed = useCallback((item: TxConfirmationInfo) => {

    const path = window.location.pathname;
    if (!path.startsWith(ACCOUNTS_ROUTE_BASE_PATH)) {
      return;
    }

    consoleOut("onTxConfirmed event executed:", item, 'crimson');
    setIsBusy(false);
    resetTransactionStatus();
    // If we have the item, record success and remove it from the list
    if (item && item.operationType === OperationType.Transfer) {
      recordTxConfirmation(item.signature, true);
      if (!inModal) {
        handleGoToStreamsClick();
      }
    }
  }, [
    inModal,
    recordTxConfirmation,
    handleGoToStreamsClick,
    resetTransactionStatus,
  ]);

  // Setup event handler for Tx confirmation error
  const onTxTimedout = useCallback((item: TxConfirmationInfo) => {
    console.log("onTxTimedout event executed:", item);
    // If we have the item, record failure and remove it from the list
    if (item) {
      recordTxConfirmation(item.signature, false);
    }
    setIsBusy(false);
    resetTransactionStatus();
  }, [recordTxConfirmation, resetTransactionStatus]);

  const handleFromCoinAmountChange = (e: any) => {

    let newValue = e.target.value;

    const decimals = selectedToken ? selectedToken.decimals : 0;
    const splitted = newValue.toString().split('.');
    const left = splitted[0];

    if (decimals && splitted[1]) {
      if (splitted[1].length > decimals) {
        splitted[1] = splitted[1].slice(0, -1);
        newValue = splitted.join('.');
      }
    } else if (left.length > 1) {
      const number = splitted[0] - 0;
      splitted[0] = `${number}`;
      newValue = splitted.join('.');
    }

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

  const handlePaymentRateAmountChange = (e: any) => {

    let newValue = e.target.value;

    const decimals = selectedToken ? selectedToken.decimals : 0;
    const splitted = newValue.toString().split('.');
    const left = splitted[0];

    if (decimals && splitted[1]) {
      if (splitted[1].length > decimals) {
        splitted[1] = splitted[1].slice(0, -1);
        newValue = splitted.join('.');
      }
    } else if (left.length > 1) {
      const number = splitted[0] - 0;
      splitted[0] = `${number}`;
      newValue = splitted.join('.');
    }

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

  // Updates the token list everytime is filtered
  const updateTokenListByFilter = useCallback((searchString: string) => {

    if (!selectedList) {
      return;
    }

    const timeout = setTimeout(() => {

      const filter = (t: any) => {
        return (
          t.symbol.toLowerCase().includes(searchString.toLowerCase()) ||
          t.name.toLowerCase().includes(searchString.toLowerCase()) ||
          t.address.toLowerCase().includes(searchString.toLowerCase())
        );
      };

      const showFromList = !searchString 
        ? selectedList
        : selectedList.filter((t: any) => filter(t));

      setFilteredTokenList(showFromList);

    });

    return () => { 
      clearTimeout(timeout);
    }

  }, [selectedList]);

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

  const getTokenPrice = useCallback(() => {
    if (!fromCoinAmount || !selectedToken) {
      return 0;
    }
    const price = getTokenPriceByAddress(selectedToken.address) || getTokenPriceBySymbol(selectedToken.symbol);

    return parseFloat(fromCoinAmount) * price;
  }, [fromCoinAmount, selectedToken, getTokenPriceByAddress, getTokenPriceBySymbol]);

  const getPaymentRateAmount = useCallback(() => {

    let outStr = selectedToken
      ? getTokenAmountAndSymbolByTokenAddress(
          parseFloat(paymentRateAmount),
          selectedToken.address,
          false
        )
      : '-'
    outStr += getIntervalFromSeconds(getRateIntervalInSeconds(paymentRateFrequency), true, t)

    return outStr;
  }, [paymentRateAmount, paymentRateFrequency, selectedToken, t]);


  /////////////////////
  // Data management //
  /////////////////////

  useEffect(() => {
    getTransactionFees(MSP_ACTIONS.createStreamWithFunds).then(value => {
      setRepeatingPaymentFees(value);
      consoleOut("repeatingPaymentFees:", value, 'orange');
    });
  }, [
    repeatingPaymentFees.mspFlatFee,
    getTransactionFees,
  ]);

  // Process inputs
  useEffect(() => {
    if (token && inModal) {
      setSelectedToken(token);
      return;
    } else {
      let from: TokenInfo | undefined = undefined;
      if (token) {
        from = token
          ? token.symbol === 'SOL'
            ? getTokenBySymbol('wSOL')
            : getTokenBySymbol(token.symbol)
          : getTokenBySymbol('MEAN');

        if (from) {
          setSelectedToken(from);
        }
      } else {
        from = getTokenBySymbol('MEAN');
        if (from) {
          setSelectedToken(from);
        }
      }
    }
  }, [token, selectedToken, inModal]);

  // Keep account balance updated
  useEffect(() => {

    const getAccountBalance = (): number => {
      return (account?.lamports || 0) / LAMPORTS_PER_SOL;
    }

    if (account?.lamports !== previousBalance || !nativeBalance) {
      setNativeBalance(getAccountBalance());
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [
    account,
    nativeBalance,
    previousBalance,
  ]);

  // Automatically update all token balances and rebuild token list
  useEffect(() => {

    if (!connection) {
      console.error('No connection');
      return;
    }

    if (!publicKey || !userTokens || !tokenList) {
      return;
    }

    const timeout = setTimeout(() => {

      const balancesMap: any = {};

      fetchAccountTokens(connection, publicKey)
      .then(accTks => {
        if (accTks) {

          const meanTokensCopy = new Array<TokenInfo>();
          const intersectedList = new Array<TokenInfo>();
          const userTokensCopy = JSON.parse(JSON.stringify(userTokens)) as TokenInfo[];

          // Build meanTokensCopy including the MeanFi pinned tokens
          userTokensCopy.forEach(item => {
            meanTokensCopy.push(item);
          });

          // Now add all other items but excluding those in userTokens
          splTokenList.forEach(item => {
            if (!userTokens.includes(item)) {
              meanTokensCopy.push(item);
            }
          });

          intersectedList.unshift(userTokensCopy[0]);
          balancesMap[userTokensCopy[0].address] = nativeBalance;          
          // Create a list containing tokens for the user owned token accounts
          accTks.forEach(item => {
            balancesMap[item.parsedInfo.mint] = item.parsedInfo.tokenAmount.uiAmount || 0;
            const isTokenAccountInTheList = intersectedList.some(t => t.address === item.parsedInfo.mint);
            const tokenFromMeanTokensCopy = meanTokensCopy.find(t => t.address === item.parsedInfo.mint);
            if (tokenFromMeanTokensCopy && !isTokenAccountInTheList) {
              intersectedList.push(tokenFromMeanTokensCopy);
            }
          });

          intersectedList.sort((a, b) => {
            if ((balancesMap[a.address] || 0) < (balancesMap[b.address] || 0)) {
              return 1;
            } else if ((balancesMap[a.address] || 0) > (balancesMap[b.address] || 0)) {
              return -1;
            }
            return 0;
          });

          const custom: TokenInfo[] = [];
          // Build a list with all owned token accounts not already in intersectedList as custom tokens
          accTks.forEach((item: AccountTokenParsedInfo, index: number) => {
            if (!intersectedList.some(t => t.address === item.parsedInfo.mint)) {
              const customToken: TokenInfo = {
                address: item.parsedInfo.mint,
                chainId: 0,
                decimals: item.parsedInfo.tokenAmount.decimals,
                name: 'Custom account',
                symbol: shortenAddress(item.parsedInfo.mint),
                tags: undefined,
                logoURI: undefined,
              };
              custom.push(customToken);
            }
          });

          // Sort by token balance
          custom.sort((a, b) => {
            if ((balancesMap[a.address] || 0) < (balancesMap[b.address] || 0)) {
              return 1;
            } else if ((balancesMap[a.address] || 0) > (balancesMap[b.address] || 0)) {
              return -1;
            }
            return 0;
          });

          // Finally add all owned token accounts as custom tokens
          const finalList = intersectedList.concat(custom);

          consoleOut('finalList items:', finalList.length, 'blue');
          setSelectedList(finalList);

        } else {
          for (const t of tokenList) {
            balancesMap[t.address] = 0;
          }
          // set the list to the userTokens list
          setSelectedList(tokenList);
        }
      })
      .catch(error => {
        console.error(error);
        for (const t of tokenList) {
          balancesMap[t.address] = 0;
        }
        setSelectedList(tokenList);
      })
      .finally(() => setUserBalances(balancesMap));

    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    publicKey,
    tokenList,
    userTokens,
    connection,
    splTokenList,
    nativeBalance,
  ]);

  // Keep token balance updated
  useEffect(() => {

    if (!connection || !publicKey || !userBalances || !selectedToken) {
      setSelectedTokenBalance(0);
      setSelectedTokenBalanceBn(new BN(0));
      return;
    }

    const timeout = setTimeout(() => {
      const balance = userBalances[selectedToken.address] as number;
      setSelectedTokenBalance(balance);
      const balanceBn = toTokenAmount2(balance, selectedToken.decimals);
      setSelectedTokenBalanceBn(new BN(balanceBn.toString()));
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [connection, publicKey, selectedToken, userBalances]);

  // Fetch and store information about the destination address
  useEffect(() => {

    if (!connection) { return; }

    const getInfo = async (address: string) => {
      try {
        const accountInfo = (await connection.getParsedAccountInfo(new PublicKey(address))).value;
        consoleOut('accountInfo:', accountInfo, 'blue');
        return accountInfo;
      } catch (error) {
        console.error(error);
        return null;
      }
    }

    if (recipientAddress && isValidAddress(recipientAddress)) {
      let type = '';
      let mint = '';
      let owner = '';
      getInfo(recipientAddress)
      .then(info => {
        if (info) {
          if ((info as any).data["program"] &&
              (info as any).data["program"] === "spl-token" &&
              (info as any).data["parsed"] &&
              (info as any).data["parsed"]["type"]) {
            type = (info as any).data["parsed"]["type"];
          }
          if ((info as any).data["program"] &&
              (info as any).data["program"] === "spl-token" &&
              (info as any).data["parsed"] &&
              (info as any).data["parsed"]["type"] &&
              (info as any).data["parsed"]["type"] === "account") {
            mint = (info as any).data["parsed"]["info"]["mint"];
            owner = (info as any).data["parsed"]["info"]["owner"];
          }
        }
        setRecipientAddressInfo({
          type,
          mint,
          owner
        });
      })
    }
  }, [connection, recipientAddress]);

  // Hook on wallet connect/disconnect
  useEffect(() => {

    if (previousWalletConnectState !== connected) {
      if (!previousWalletConnectState && connected && publicKey) {
        consoleOut('User is connecting...', publicKey.toBase58(), 'green');
        setSelectedTokenBalance(0);
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'green');
        setUserBalances(undefined);
        confirmationEvents.off(EventType.TxConfirmSuccess, onTxConfirmed);
        consoleOut('Unsubscribed from event txConfirmed!', '', 'blue');
        confirmationEvents.off(EventType.TxConfirmTimeout, onTxTimedout);
        consoleOut('Unsubscribed from event onTxTimedout!', '', 'blue');
        setCanSubscribe(true);
      }
    } else if (!connected) {
      setSelectedTokenBalance(0);
    }

  }, [
    connected,
    publicKey,
    previousWalletConnectState,
    setSelectedTokenBalance,
    onTxConfirmed,
    onTxTimedout,
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

  // Detect when entering small screen mode
  useEffect(() => {
    if (isSmallScreen && width < 576) {
      setIsSmallScreen(true);
    } else {
      setIsSmallScreen(false);
    }
  }, [isSmallScreen, width]);

  // Setup event listeners
  useEffect(() => {
    if (publicKey && canSubscribe) {
      setCanSubscribe(false);
      confirmationEvents.on(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut('Subscribed to event txConfirmed with:', 'onTxConfirmed', 'blue');
      confirmationEvents.on(EventType.TxConfirmTimeout, onTxTimedout);
      consoleOut('Subscribed to event txTimedout with:', 'onTxTimedout', 'blue');
    }
  }, [
    publicKey,
    canSubscribe,
    onTxConfirmed,
    onTxTimedout,
  ]);

  // Unsubscribe from events
  useEffect(() => {
    // Do unmounting stuff here
    return () => {
      confirmationEvents.off(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut('Unsubscribed from event txConfirmed!', '', 'blue');
      confirmationEvents.off(EventType.TxConfirmTimeout, onTxTimedout);
      consoleOut('Unsubscribed from event onTxTimedout!', '', 'blue');
      setCanSubscribe(true);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /////////////////////////////
  //  Events and validation  //
  /////////////////////////////

  const getRecipientAddressValidation = () => {
    if (recipientAddressInfo.type === "mint") {
      return 'Recipient cannot be a mint address'
    } else if (recipientAddressInfo.type === "account" &&
               recipientAddressInfo.mint &&
               recipientAddressInfo.mint === selectedToken?.address &&
               recipientAddressInfo.owner === publicKey?.toBase58()) {
      return 'Recipient cannot be the selected token mint';
    }
    return '';
  }

  const isMemoValid = (): boolean => {
    return recipientNote && recipientNote.length <= 32
      ? true
      : false;
  }

  const isAddressOwnAccount = (): boolean => {
    return recipientAddress && wallet && publicKey && recipientAddress === publicKey.toBase58()
           ? true : false;
  }

  const isSendAmountValid = (): boolean => {
    return connected &&
           selectedToken &&
           tokenBalanceBn.gtn(0) &&
           nativeBalance >= getMinSolBlanceRequired() &&
           fromCoinAmount && parseFloat(fromCoinAmount) > 0 &&
           ((selectedToken.address === NATIVE_SOL.address && parseFloat(fromCoinAmount) <= getMaxAmount()) ||
            (selectedToken.address !== NATIVE_SOL.address && tokenBalanceBn.gtn(parseFloat(fromCoinAmount))))
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
        : getRecipientAddressValidation() || !isValidAddress(recipientAddress)
          ? 'Invalid recipient address'
          : !selectedToken || tokenBalanceBn.isZero()
            ? t('transactions.validation.no-balance')
            : !paymentStartDate
              ? t('transactions.validation.no-valid-date')
              : !recipientNote
                ? t('transactions.validation.memo-empty')
                : !arePaymentSettingsValid()
                  ? getPaymentSettingsButtonLabel()
                  : t('transactions.validation.valid-continue');
  }

  const getTransactionStartButtonLabel = (): string => {
    return !connected
      ? t('transactions.validation.not-connected')
      : !recipientAddress || isAddressOwnAccount()
        ? t('transactions.validation.select-recipient')
        : getRecipientAddressValidation() || !isValidAddress(recipientAddress)
          ? 'Invalid recipient address'
          : !selectedToken || tokenBalanceBn.isZero()
            ? t('transactions.validation.no-balance')
            : !fromCoinAmount || !isValidNumber(fromCoinAmount) || !parseFloat(fromCoinAmount)
              ? t('transactions.validation.no-amount')
              : ((selectedToken.address === NATIVE_SOL.address && parseFloat(fromCoinAmount) > getMaxAmount()) ||
                 (selectedToken.address !== NATIVE_SOL.address && tokenBalanceBn.ltn(parseFloat(fromCoinAmount))))
                ? t('transactions.validation.amount-high')
                : !paymentStartDate
                  ? t('transactions.validation.no-valid-date')
                  : !recipientNote
                    ? t('transactions.validation.memo-empty')
                    : !arePaymentSettingsValid()
                      ? getPaymentSettingsButtonLabel()
                      : !isVerifiedRecipient
                        ? t('transactions.validation.verified-recipient-unchecked')
                        : nativeBalance < getMinSolBlanceRequired()
                          ? t('transactions.validation.insufficient-balance-needed', { balance: formatThousands(getFeeAmount(), 4) })
                          : t('transactions.validation.valid-approve');
  }

  const getPaymentSettingsButtonLabel = (): string => {
    const rateAmount = parseFloat(paymentRateAmount || '0');
    return !rateAmount
      ? t('transactions.validation.no-payment-rate')
      : tokenBalanceBn.ltn(rateAmount)
      ? t('transactions.validation.payment-rate-high')
      : '';
  }

  const getPaymentRateLabel = useCallback((
    rate: PaymentRateType,
    amount: string | undefined
  ): string => {
    let label: string;
    label = `${selectedToken ? getAmountWithSymbol(parseFloat(amount || '0'), selectedToken.address) : '--'}`;
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
  }, [selectedToken, t]);

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

  const onStepperChange = (value: number) => {
    setCurrentStep(value);
  }

  const onContinueButtonClick = () => {
    setCurrentStep(1);  // Go to step 2
  }

  // Main action

  const onTransactionStart = useCallback(async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    setTransactionCancelled(false);
    setIsBusy(true);

    const createTx = async (): Promise<boolean> => {
      if (wallet && publicKey && selectedToken) {
        consoleOut('Wallet address:', wallet?.publicKey?.toBase58());

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        consoleOut('Beneficiary address:', recipientAddress);
        const beneficiary = new PublicKey(recipientAddress as string);
        consoleOut('beneficiaryMint:', selectedToken.address);
        const associatedToken = new PublicKey(selectedToken.address as string);
        const amount = toTokenAmount2(fromCoinAmount, selectedToken.decimals).toString();
        const rateAmount = toTokenAmount2(paymentRateAmount, selectedToken.decimals).toString();
        const now = new Date();
        const parsedDate = Date.parse(paymentStartDate as string);
        const startUtc = new Date(parsedDate);
        startUtc.setHours(now.getHours());
        startUtc.setMinutes(now.getMinutes());
        startUtc.setSeconds(now.getSeconds());
        startUtc.setMilliseconds(now.getMilliseconds());

        consoleOut('fromParsedDate.toString()', startUtc.toString(), 'crimson');
        consoleOut('fromParsedDate.toLocaleString()', startUtc.toLocaleString(), 'crimson');
        consoleOut('fromParsedDate.toISOString()', startUtc.toISOString(), 'crimson');
        consoleOut('fromParsedDate.toUTCString()', startUtc.toUTCString(), 'crimson');

        // Create a transaction
        const data = {
          wallet: publicKey.toBase58(),                        // wallet
          treasury: 'undefined',                                      // treasury
          beneficiary: beneficiary.toBase58(),                        // beneficiary
          associatedToken: associatedToken.toBase58(),                // mint
          rateIntervalInSeconds:
            getRateIntervalInSeconds(paymentRateFrequency),           // rateIntervalInSeconds
          startUtc: startUtc,                                         // startUtc
          streamName: recipientNote
            ? recipientNote.trim()
            : '',                                                     // streamName
          rateAmount: rateAmount,                                     // rateAmount
          allocation: amount,                                         // allocation
          feePayedByTreasurer: false // TODO: Should come from the UI
        };
        consoleOut('data:', data);

        // Report event to Segment analytics
        const price = getTokenPrice();
        const segmentData: SegmentStreamRPTransferData = {
          asset: selectedToken?.symbol,
          assetPrice: price,
          allocation: parseFloat(fromCoinAmount as string),
          beneficiary: data.beneficiary,
          startUtc: dateFormat(data.startUtc, SIMPLE_DATE_TIME_FORMAT),
          rateAmount: parseFloat(paymentRateAmount as string),
          interval: getPaymentRateOptionLabel(paymentRateFrequency),
          feePayedByTreasurer: data.feePayedByTreasurer,
          valueInUsd: price * parseFloat(fromCoinAmount as string)
        };
        consoleOut('segment data:', segmentData, 'brown');
        segmentAnalytics.recordEvent(AppUsageEvent.TransferRecurringFormButton, segmentData);

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: data
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: ''
        });

        consoleOut('repeatingPaymentFees:', getFeeAmount(), 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');

        // Init a streaming operation
        const msp = new MSP(endpoint, streamV2ProgramAddress, "confirmed");

        return await msp.streamPayment(
          publicKey,                                                  // treasurer
          beneficiary,                                                // beneficiary
          associatedToken,                                            // mint
          recipientNote,                                              // streamName
          amount,                                                     // allocationAssigned
          rateAmount,                                                 // rateAmount
          getRateIntervalInSeconds(paymentRateFrequency),             // rateIntervalInSeconds
          startUtc,                                                   // startUtc
          0,                                                          // cliffVestAmount
          0,                                                          // cliffVestPercent
          false // TODO: (feePayedByTreasurer)
        )
        .then(value => {
          consoleOut('streamPayment returned transaction:', value);
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
          console.error('streamPayment error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Repeating Payment transaction failed', { transcript: transactionLog });
          segmentAnalytics.recordEvent(AppUsageEvent.TransferRecurringFailed, { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Repeating Payment transaction failed', { transcript: transactionLog });
        segmentAnalytics.recordEvent(AppUsageEvent.TransferRecurringFailed, { transcript: transactionLog });
        return false;
      }
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet && publicKey) {
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
              result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logError('Repeating Payment transaction failed', { transcript: transactionLog });
            segmentAnalytics.recordEvent(AppUsageEvent.TransferRecurringFailed, { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: publicKey.toBase58()}
          });
          segmentAnalytics.recordEvent(AppUsageEvent.TransferRecurringSigned, {
            signature,
            encodedTx
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
            result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logError('Repeating Payment transaction failed', { transcript: transactionLog });
          segmentAnalytics.recordEvent(AppUsageEvent.TransferRecurringFailed, { transcript: transactionLog });
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
        customLogger.logError('Repeating Payment transaction failed', { transcript: transactionLog });
        segmentAnalytics.recordEvent(AppUsageEvent.TransferRecurringFailed, { transcript: transactionLog });
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
              currentOperation: TransactionStatus.SendTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
              result: { error, encodedTx }
            });
            customLogger.logError('Repeating Payment transaction failed', { transcript: transactionLog });
            segmentAnalytics.recordEvent(AppUsageEvent.TransferRecurringFailed, { transcript: transactionLog });
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
        customLogger.logError('Repeating Payment transaction failed', { transcript: transactionLog });
        segmentAnalytics.recordEvent(AppUsageEvent.TransferRecurringFailed, { transcript: transactionLog });
        return false;
      }
    }

    if (wallet) {
      const created = await createTx();
      consoleOut('created:', created);
      if (created && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('signed:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.StreamCreate,
              finality: "confirmed",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: `Send ${getPaymentRateLabel(paymentRateFrequency, paymentRateAmount)}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `${location.pathname.includes("streaming") ? "Outgoing stream" : "Stream"} to send ${getPaymentRateLabel(paymentRateFrequency, paymentRateAmount)} has been created.`
            });
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.TransactionFinished
            });
            if (inModal) {
              setIsBusy(false);
              resetTransactionStatus();
              resetContractValues();
              setIsVerifiedRecipient(false);
              transferCompleted();
            }
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  }, [
    wallet,
    inModal,
    endpoint,
    publicKey,
    connection,
    nativeBalance,
    recipientNote,
    selectedToken,
    fromCoinAmount,
    recipientAddress,
    paymentStartDate,
    paymentRateAmount,
    transferCompleted,
    location.pathname,
    paymentRateFrequency,
    transactionCancelled,
    streamV2ProgramAddress,
    transactionStatus.currentOperation,
    enqueueTransactionConfirmation,
    resetTransactionStatus,
    setIsVerifiedRecipient,
    setTransactionStatus,
    resetContractValues,
    getPaymentRateLabel,
    getTokenPrice,
    getFeeAmount,
  ]);

  const onIsVerifiedRecipientChange = (e: any) => {
    setIsVerifiedRecipient(e.target.checked);
  }

  ///////////////////
  //   Rendering   //
  ///////////////////

  // const renderTextWithBreaks = (text: string) => {
  //   return (
  //       <div dangerouslySetInnerHTML={{ __html: text }}></div>
  //   );
  // }

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
      {(filteredTokenList && filteredTokenList.length > 0) && (
        filteredTokenList.map((t, index) => {
          const onClick = function () {
            tokenChanged(t);
            setSelectedToken(t);

            consoleOut("token selected:", t, 'blue');
            const price = getTokenPriceByAddress(t.address) || getTokenPriceBySymbol(t.symbol);
            setEffectiveRate(price);
            onCloseTokenSelector();
          };

          if (index < MAX_TOKEN_LIST_ITEMS) {
            const balance = connected && userBalances && userBalances[t.address] > 0 ? userBalances[t.address] : 0;
            return (
              <TokenListItem
                key={t.address}
                name={t.name || CUSTOM_TOKEN_NAME}
                mintAddress={t.address}
                token={t}
                className={balance ? selectedToken && selectedToken.address === t.address ? "selected" : "simplelink" : "hidden"}
                onClick={onClick}
                balance={balance}
              />
            );
          } else {
            return null;
          }
        })
      )}
    </>
  );

  const renderTokenSelectorInner = (
    <div className="token-selector-wrapper">
      <div className="token-search-wrapper">
        <TextInput
          id="token-search-rp"
          value={tokenFilter}
          allowClear={true}
          extraClass="mb-2"
          onInputClear={onInputCleared}
          placeholder={t('token-selector.search-input-placeholder')}
          error={
            tokenFilter && selectedToken && selectedToken.decimals === -1
              ? 'Account not found'
              : tokenFilter && selectedToken && selectedToken.decimals === -2
                ? 'Account is not a token mint'
                : ''
          }
          onInputChange={onTokenSearchInputChange} />
      </div>
      <div className="token-list">
        {filteredTokenList.length > 0 && renderTokenList}
        {(tokenFilter && isValidAddress(tokenFilter) && filteredTokenList.length === 0) && (
          <TokenListItem
            key={tokenFilter}
            name={CUSTOM_TOKEN_NAME}
            mintAddress={tokenFilter}
            className={selectedToken && selectedToken.address === tokenFilter ? "selected" : "simplelink"}
            onClick={async () => {
              const address = tokenFilter;
              let decimals = -1;
              let accountInfo: AccountInfo<Buffer | ParsedAccountData> | null = null;
              try {
                accountInfo = (await connection.getParsedAccountInfo(new PublicKey(address))).value;
                consoleOut('accountInfo:', accountInfo, 'blue');
              } catch (error) {
                console.error(error);
              }
              if (accountInfo) {
                if ((accountInfo as any).data["program"] &&
                    (accountInfo as any).data["program"] === "spl-token" &&
                    (accountInfo as any).data["parsed"] &&
                    (accountInfo as any).data["parsed"]["type"] &&
                    (accountInfo as any).data["parsed"]["type"] === "mint") {
                  decimals = (accountInfo as any).data["parsed"]["info"]["decimals"];
                } else {
                  decimals = -2;
                }
              }
              const unknownToken: TokenInfo = {
                address,
                name: CUSTOM_TOKEN_NAME,
                chainId: getNetworkIdByEnvironment(environment),
                decimals,
                symbol: `[${shortenAddress(address)}]`,
              };
              tokenChanged(unknownToken);
              setSelectedToken(unknownToken);
              if (userBalances && userBalances[address]) {
                setSelectedTokenBalance(userBalances[address]);
              }
              consoleOut("token selected:", unknownToken, 'blue');
              // Do not close on errors (-1 or -2)
              if (decimals >= 0) {
                onCloseTokenSelector();
              }
            }}
            balance={connected && userBalances && userBalances[tokenFilter] > 0 ? userBalances[tokenFilter] : 0}
          />
        )}
      </div>
    </div>
  );

  return (
    <>
      <StepSelector step={currentStep} steps={2} onValueSelected={onStepperChange} />

      <div className={currentStep === 0 ? "contract-wrapper panel1 show" : "contract-wrapper panel1 hide"}>

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
                maxLength={32}
                onChange={handleRecipientNoteChange}
                placeholder={t('transactions.memo2.placeholder')}
                spellCheck="false"
                value={recipientNote}
              />
            </div>
          </div>
        </div>

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
              {inModal ? (
                <span>&nbsp;</span>
              ) : (
                <div className="add-on simplelink" onClick={showQrScannerModal}>
                  <QrcodeOutlined />
                </div>
              )}
            </div>
          </div>
          {
            recipientAddress && !isValidAddress(recipientAddress) ? (
              <span className="form-field-error">
                {t('transactions.validation.address-validation')}
              </span>
            ) : isAddressOwnAccount() ? (
              <span className="form-field-error">
                {t('transactions.recipient.recipient-is-own-account')}
              </span>
            ) : recipientAddress && getRecipientAddressValidation() ? (
              <span className="form-field-error">
                {getRecipientAddressValidation()}
              </span>
            ) : (null)
          }
        </div>

        {/* Payment rate */}
        <div className="form-label">{t('transactions.rate-and-frequency.amount-label')}</div>

        <div className="two-column-form-layout col60x40 mb-3">
          <div className="left">
            <div className="well mb-1">
              <div className="flex-fixed-left">
                <div className="left">
                  <span className="add-on simplelink">
                    {selectedToken && (
                      <TokenDisplay onClick={() => inModal ? showDrawer() : showTokenSelector()}
                        mintAddress={selectedToken.address}
                        name={selectedToken.name}
                        showCaretDown={true}
                        fullTokenInfo={selectedToken}
                      />
                    )}
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
            </div>
          </div>
          <div className="right">
            <div className="well mb-0">
              <div className="flex-fixed-left">
                <div className="left">
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
              </div>
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
                  defaultValue={moment(
                    paymentStartDate,
                    DATEPICKER_FORMAT
                  )}
                  format={DATEPICKER_FORMAT}
                />
              </div>
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
          disabled={!connected ||
            !isMemoValid() ||
            !isValidAddress(recipientAddress) ||
            isAddressOwnAccount() ||
            !arePaymentSettingsValid()}>
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
                  <div className="rate">{getPaymentRateAmount()}</div>
                  <div className="inner-label mt-0">{paymentStartDate}</div>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="mb-3 text-center">
          <div>
            {
              t(
                'transactions.transaction-info.add-funds-repeating-payment-advice', {
                  tokenSymbol: selectedToken?.symbol,
                  rateInterval: getPaymentRateAmount()
              })
            }
          </div>
        </div>

        {/* Amount to stream */}
        <div className="form-label">
          <span className="align-middle">{t('transactions.send-amount.label-amount')}</span>
          <span className="align-middle">
            <InfoIcon content={<span>This is the total amount of funds that will be streamed to the recipient at the payment rate selected. You can add more funds at any time by topping up the stream.</span>}
                      placement="top">
              <InfoCircleOutlined />
            </InfoIcon>
          </span>
        </div>
        <div className="well">
          <div className="flex-fixed-left">
            <div className="left">
              <span className="add-on">
              {selectedToken && (
                <TokenDisplay onClick={() => {}}
                    mintAddress={selectedToken.address}
                    showCaretDown={false}
                    showName={false}
                    fullTokenInfo={selectedToken}
                  />
                )}
                {selectedToken && tokenBalanceBn.gtn(getMinSolBlanceRequired()) ? (
                  <div className="token-max simplelink" onClick={() =>
                    {
                      if (selectedToken.address === NATIVE_SOL.address) {
                        const amount = nativeBalance - getMinSolBlanceRequired();
                        setFromCoinAmount(cutNumber(amount > 0 ? amount : 0, selectedToken.decimals));
                      } else {
                        setFromCoinAmount(toUiAmount2(tokenBalanceBn, selectedToken.decimals));
                      }
                    }}>
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
                {getDisplayAmount(tokenBalanceBn)}
              </span>
            </div>
            <div className="right inner-label">
              <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
                ~{fromCoinAmount
                  ? toUsCurrency(getTokenPrice())
                  : "$0.00"}
              </span>
            </div>
          </div>
          {selectedToken && selectedToken.address === NATIVE_SOL.address && (!tokenBalance || tokenBalance < MIN_SOL_BALANCE_REQUIRED) && (
            <div className="form-field-error">{t('transactions.validation.minimum-balance-required')}</div>
          )}
        </div>

        {/* Confirm recipient address is correct Checkbox */}
        <div className="mb-2">
          <Checkbox checked={isVerifiedRecipient} onChange={onIsVerifiedRecipientChange}>{t('transfers.verified-recipient-disclaimer')}</Checkbox>
        </div>

        {/* Action button */}
        <Button
          className={`main-cta ${isBusy ? 'inactive' : ''}`}
          block
          type="primary"
          shape="round"
          size="large"
          onClick={onTransactionStart}
          disabled={
            !connected ||
            !isMemoValid() ||
            !isValidAddress(recipientAddress) ||
            isAddressOwnAccount() ||
            !arePaymentSettingsValid() ||
            !areSendAmountSettingsValid() ||
            !isVerifiedRecipient
          }>
          {isBusy && (
            <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
          )}
          {isBusy
            ? t('streams.create-new-stream-cta-busy')
            : getTransactionStartButtonLabel()
          }
        </Button>
      </div>

      {inModal && (
        <Drawer
          title={t('token-selector.modal-title')}
          placement="bottom"
          closable={true}
          onClose={onCloseTokenSelector}
          visible={isTokenSelectorVisible}
          getContainer={false}
          style={{ position: 'absolute' }}>
          {renderTokenSelectorInner}
        </Drawer>
      )}

      {/* Token selection modal */}
      {!inModal && isTokenSelectorModalVisible && (
        <Modal
          className="mean-modal unpadded-content"
          visible={isTokenSelectorModalVisible}
          title={<div className="modal-title">{t('token-selector.modal-title')}</div>}
          onCancel={onCloseTokenSelector}
          width={450}
          footer={null}>
          {renderTokenSelectorInner}
        </Modal>
      )}

      {/* QR scan modal */}
      {isQrScannerModalVisible && (
        <QrScannerModal
          isVisible={isQrScannerModalVisible}
          handleOk={onAcceptQrScannerModal}
          handleClose={closeQrScannerModal}/>
      )}
    </>
  );
};
