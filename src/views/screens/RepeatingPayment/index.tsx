import { Button, Modal, Menu, Dropdown, DatePicker, Divider } from "antd";
import { QrcodeOutlined } from "@ant-design/icons";
import { useCallback, useContext, useEffect, useState } from "react";
import { useConnectionConfig } from "../../../contexts/connection";
import { useMarkets } from "../../../contexts/market";
import { IconCaretDown, IconSort } from "../../../Icons";
import {
  formatAmount,
  fromLamports,
  isValidNumber,
  useLocalStorageState,
} from "../../../utils/utils";
import { TokenInfo, TokenListProvider } from "@solana/spl-token-registry";
import { Identicon } from "../../../components/Identicon";
import { cache } from "../../../contexts/accounts";
import { getPrices } from "../../../utils/api";
import { DATEPICKER_FORMAT, PRICE_REFRESH_TIMEOUT } from "../../../constants";
import { QrScannerModal } from "../../../components/QrScannerModal";
import { PaymentRateType, TransactionStatus } from "../../../models/enums";
import {
  getCurrentTransactionOperationText,
  getOptionsFromEnum,
  getPaymentRateOptionLabel,
  getRateIntervalInSeconds
} from "../../../utils/ui";
import moment from "moment";
import { useWallet } from "../../../contexts/wallet";
import { useUserAccounts } from "../../../hooks";
import { AppStateContext } from "../../../contexts/appstate";
import { MoneyStreaming } from "../../../money-streaming/money-streaming";
import { PublicKey, Transaction } from "@solana/web3.js";

export const RepeatingPayment = () => {
  const today = new Date().toLocaleDateString();
  const { marketEmitter, midPriceInUSD } = useMarkets();
  const connectionConfig = useConnectionConfig();
  const { connected, wallet } = useWallet();
  const { userAccounts } = useUserAccounts();
  const {
    contract,
    recipientAddress,
    recipientNote,
    paymentStartDate,
    fromCoinAmount,
    paymentRateAmount,
    paymentRateFrequency,
    transactionStatus,
    setRecipientAddress,
    setRecipientNote,
    setPaymentStartDate,
    setFromCoinAmount,
    setPaymentRateAmount,
    setPaymentRateFrequency,
    setTransactionStatus
  } = useContext(AppStateContext);

  const [previousChain, setChain] = useState("");
  const [previousWalletConnectState, setPreviousWalletConnectState] = useState(connected);
  const [isBusy, setIsBusy] = useState(false);

  const [coinPrices, setCoinPrices] = useState<any>(null);
  const [shouldLoadCoinPrices, setShouldLoadCoinPrices] = useState(true);
  const [effectiveRate, setEffectiveRate] = useState<number>(0);

  const [shouldLoadTokens, setShouldLoadTokens] = useState(true);
  const [availableTokenList, setAvailableTokenList] = useState<TokenInfo[]>([]);
  const [filteredTokenList, setFilteredTokenList] = useState<TokenInfo[]>([]);
  const [selectedToken, setSelectedToken] = useLocalStorageState("userSelectedToken");
  const [destinationToken, setDestinationToken] = useState<TokenInfo>();

  // Token selection modal
  const [isTokenSelectorModalVisible, setTokenSelectorModalVisibility] = useState(false);
  const showTokenSelector = useCallback(() => setTokenSelectorModalVisibility(true), []);
  const onCloseTokenSelector = useCallback(() => setTokenSelectorModalVisibility(false), []);
  const [subjectTokenSelection, setSubjectTokenSelection] = useState('payer');

  // Recipient Selector modal
  const [isQrScannerModalVisible, setIsQrScannerModalVisibility] = useState(false);
  const showQrScannerModal = useCallback(() => setIsQrScannerModalVisibility(true), []);
  const closeQrScannerModal = useCallback(() => setIsQrScannerModalVisibility(false), []);
  const onAcceptQrScannerModal = () => {
    triggerWindowResize();
    closeQrScannerModal();
  };

  // Event handling

  const handleFromCoinAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setFromCoinAmount("");
    } else if (isValidNumber(newValue)) {
      setFromCoinAmount(newValue);
    }
  };

  // Set to reload prices every 30 seconds
  const setPriceTimer = () => {
    setTimeout(() => {
      setShouldLoadCoinPrices(true);
    }, PRICE_REFRESH_TIMEOUT);
  };

  const triggerWindowResize = () => {
    window.dispatchEvent(new Event('resize'));
  }

  const handleRecipientAddressChange = (e: any) => {
    setRecipientAddress(e.target.value);
  }

  const handleRecipientNoteChange = (e: any) => {
    setRecipientNote(e.target.value);
  }

  const handleRecipientAddressFocusIn = (e: any) => {
    setTimeout(() => {
      triggerWindowResize();
    }, 100);
  }

  const handleRecipientAddressFocusOut = (e: any) => {
    setTimeout(() => {
      triggerWindowResize();
    }, 100);
  }

  const handlePaymentRateAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setPaymentRateAmount("");
    } else if (isValidNumber(newValue)) {
      setPaymentRateAmount(newValue);
    }
  };

  // const handlePaymentRateIntervalChange = (e: any) => {
  //   const newValue = e.target.value;
  //   if (newValue === null || newValue === undefined || newValue === "") {
  //     setPaymentRateInterval("");
  //   } else if (isPositiveNumber(newValue)) {
  //     setPaymentRateInterval(newValue);
  //   }
  // };

  const handlePaymentRateOptionChange = (val: PaymentRateType) => {
    setPaymentRateFrequency(val);
    // setPaymentRateInterval(getPaymentRateIntervalByRateType(val));
  }

  // Effect to load token list
  useEffect(() => {
    if (shouldLoadTokens) {
      setShouldLoadTokens(false);
      new TokenListProvider().resolve().then((tokens) => {
        const filteredTokens = tokens
          .filterByClusterSlug(connectionConfig.env)
          .getList();
        // Save a copy of available tokens for the destination account
        setAvailableTokenList(filteredTokens);
        // Preset a token for the destination account
        if (!destinationToken) {
          setDestinationToken(filteredTokens[0]);
        }
        // List loaded, now reflect it as it is if no wallet connected
        // If a wallet gets connected then filter by tokens the user own
        if (connected && userAccounts && userAccounts.length > 0) {
          const tokensWithBalance: TokenInfo[] = [];
          for (let i = 0; i < userAccounts.length; i++) {
            const account = userAccounts[i];
            const mintAddress = account.info.mint.toBase58();
            const mint = cache.get(mintAddress);
            const tokenInfoItem = filteredTokens.find(t => t.address === mintAddress);
            if (mint && tokenInfoItem) {
              const balance = fromLamports(account.info.amount.toNumber(), mint.info);
              tokensWithBalance.push(Object.assign({}, tokenInfoItem, {
                balance
              }));
            }
          }
          setFilteredTokenList(tokensWithBalance);
          console.log('tokensWithBalance:', tokensWithBalance);
          // Preset a token
          if (tokensWithBalance?.length) {
            setSelectedToken(tokensWithBalance[0]);
            console.log("Preset token:", tokensWithBalance[0]);
          }
        } else {
          setFilteredTokenList(filteredTokens);
          console.log("tokens", filteredTokens);
          // Preset a token
          if (!selectedToken && filteredTokens) {
            setSelectedToken(filteredTokens[0]);
            console.log("Preset token:", filteredTokens[0]);
          }
        }
      });
    };

    return () => {};
  }, [
    connected,
    coinPrices,
    userAccounts,
    selectedToken,
    filteredTokenList,
    connectionConfig,
    shouldLoadTokens,
    setSelectedToken,
    destinationToken,
    setFilteredTokenList,
    setEffectiveRate
  ]);

  // Effect to load coin prices
  useEffect(() => {
    const getCoinPrices = async () => {
      setShouldLoadCoinPrices(false);
      try {
        await getPrices()
          .then((prices) => {
            console.log("Coin prices:", prices);
            setCoinPrices(prices);
            setEffectiveRate(
              prices[selectedToken.symbol] ? prices[selectedToken.symbol] : 0
            );
          })
          .catch(() => setCoinPrices(null));
      } catch (error) {
        setCoinPrices(null);
      }
    };

    if (shouldLoadCoinPrices && selectedToken) {
      getCoinPrices();
      setPriceTimer();
    }

    return () => {
      clearTimeout();
    };
  }, [
    coinPrices,
    shouldLoadCoinPrices,
    selectedToken,
    setEffectiveRate
  ]);

  // Effect signal token list reload on network change
  useEffect(() => {
    if (previousChain !== connectionConfig.env) {
      setChain(connectionConfig.env);
      console.log(`cluster:`, connectionConfig.env);
      if (!shouldLoadTokens) {
        setShouldLoadTokens(true);
      }
    }

    return () => {};
  }, [
    previousChain,
    connectionConfig,
    shouldLoadTokens,
    setShouldLoadTokens,
  ]);

  // Effect to handle onMarket event
  useEffect(() => {
    const refreshTotal = () => {};

    const dispose = marketEmitter.onMarket(() => {
      refreshTotal();
    });

    refreshTotal();

    return () => {
      dispose();
    };
  }, [marketEmitter, midPriceInUSD, connectionConfig.tokenMap]);

  // Effect signal token list reload on wallet connected status change
  useEffect(() => {
    if (previousWalletConnectState !== connected) {
      // User is connecting
      if (!previousWalletConnectState && connected) {
        // TODO: Find how to wait for the accounts' list to be populated to avoit setTimeout
        setTimeout(() => {
          setShouldLoadTokens(true);
        }, 1000);
      } else {
        setSelectedToken(null);
        setShouldLoadTokens(true);
      }
      setPreviousWalletConnectState(connected);
    }

    return () => {
      clearTimeout();
    };
  }, [
    connected,
    shouldLoadTokens,
    previousWalletConnectState,
    setSelectedToken,
    setShouldLoadTokens,
    setPreviousWalletConnectState,
  ]);

  useEffect(() => {
    const resizeListener = () => {
      var NUM_CHARS = 6;
      var ellipsisElements = document.querySelectorAll(".overflow-ellipsis-middle");
      for (var i = 0; i < ellipsisElements.length; ++i){
        var e = ellipsisElements[i] as HTMLElement;
        if (e.offsetWidth < e.scrollWidth){
          var text = e.textContent;
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
  const areSendAmountSettingsValid = (): boolean => {
    return connected &&
           selectedToken &&
           selectedToken.balance &&
           fromCoinAmount &&
           parseFloat(fromCoinAmount) <= selectedToken.balance;
  }

  const arePaymentSettingsValid = (): boolean => {
    let result = true;
    if (!paymentStartDate) {
      return false;
    }
    const rateAmount = parseFloat(paymentRateAmount || '0');
    if (!rateAmount) {
      result = false;
    } else if (rateAmount > parseFloat(fromCoinAmount || '0')) {
      result = false;
    // } else if (paymentRateFrequency === PaymentRateType.Other && !paymentRateInterval) {
    //   result = false;
    }

    return result;
  }

  // Ui helpers
  const getTransactionStartButtonLabel = (): string => {
    // if (isBusy) {
    //   return getCurrentTransactionOperationText(transactionStatus);
    // }
    return !connected
      ? "Connect your wallet"
      : !selectedToken || !selectedToken.balance
      ? "No balance"
      : !recipientAddress
      ? "Select recipient"
      : !fromCoinAmount
      ? "Enter amount"
      : parseFloat(fromCoinAmount) > selectedToken.balance
      ? "Amount exceeds your balance"
      : !paymentStartDate
      ? "Set a valid date"
      : !arePaymentSettingsValid()
      ? getPaymentSettingsModalButtonLabel()
      : transactionStatus?.lastOperation !== TransactionStatus.Iddle && transactionStatus?.currentOperation !== TransactionStatus.Iddle
      ? getCurrentTransactionOperationText(transactionStatus)
      : "Approve on your wallet";
  }

  const getPaymentSettingsModalButtonLabel = (): string => {
    const rateAmount = parseFloat(paymentRateAmount || '0');
    return !rateAmount
      ? "Add payment rate"
      : rateAmount > parseFloat(fromCoinAmount || '0')
      ? "Review payment rate"
      // : paymentRateFrequency === PaymentRateType.Other && !paymentRateInterval
      // ? 'Select a valid interval'
      : '';
  }

  /*
  const getPaymentRateLabel = (
    rate: PaymentRateType,
    amount: string,
    interval: string
  ): string => {
    let label: string;
    label = `${getAmountWithTokenSymbol(amount, selectedToken)} `;
    switch (rate) {
      case PaymentRateType.PerHour:
        label += "per hour";
        break;
      case PaymentRateType.PerDay:
        label += "per day";
        break;
      case PaymentRateType.PerWeek:
        label += "per week";
        break;
      case PaymentRateType.PerMonth:
        label += "per month";
        break;
      case PaymentRateType.PerYear:
        label += "per year";
        break;
      // case PaymentRateType.Other:
      // const intervalNumber = parseInt(interval, 10);
      // label += `every ${timeConvert(intervalNumber)}`;
      default:
        break;
    }
    return label;
  };
  */
  
  // Prefabrics

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

  const renderAvailableTokenList = (
    <>
      {destinationToken && availableTokenList ? (
        availableTokenList.map((token, index) => {
          const onClick = function () {
            setDestinationToken(token);
            console.log("destination token selected:", token.symbol);
            onCloseTokenSelector();
          };
          return (
            <div key={index + 100} onClick={onClick} className={`token-item ${
                destinationToken && destinationToken.address === token.address
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
            </div>
          );
        })
      ) : (
        <p>Loading...</p>
      )}
    </>
  );

  const renderUserTokenList = (
    <>
      {selectedToken && filteredTokenList ? (
        filteredTokenList.map((token, index) => {
          const onClick = function () {
            setSelectedToken(token);
            console.log("token selected:", token.symbol);
            setEffectiveRate(
              coinPrices && coinPrices[token.symbol]
                ? coinPrices[token.symbol]
                : 0
            );
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
            </div>
          );
        })
      ) : (
        <p>Loading...</p>
      )}
    </>
  );

  // Main action

  const onTransactionStart = async () => {
    console.log("Start transaction for contract type:", contract?.name);
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;

    // Init a streaming operation
    const transfer = new MoneyStreaming(connectionConfig.endpoint);

    const createTx = async (): Promise<boolean> => {
      if (wallet) {
        console.log('Wallet address:', wallet?.publicKey?.toBase58());
        const senderPubkey = wallet.publicKey as PublicKey;
    
        console.log('Beneficiary address:', recipientAddress);
        const destPubkey = new PublicKey(recipientAddress as string);
    
        console.log('associatedToken:', destinationToken?.address);
        const associatedToken = new PublicKey(destinationToken?.address as string);
    
        console.log('paymentStartDate:', Date.parse(paymentStartDate as string));
        let utcDate = new Date();
        utcDate.setTime(Date.parse(paymentStartDate as string));
        console.log('utcDate:', utcDate);
    
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.CreateTransaction
        });
        // Create a transaction
        const data = {
          treasurer: senderPubkey,                                        // treasurer
          beneficiary: destPubkey,                                        // beneficiary
          treasury: null,                                                 // treasury
          associatedToken: associatedToken,                               // associatedToken
          rateAmount: parseFloat(paymentRateAmount as string),            // rateAmount
          rateIntervalInSeconds: getRateIntervalInSeconds(paymentRateFrequency),   // rateIntervalInSeconds
          startUtc: utcDate,                                              // startUtc
          streamName: contract?.name.trim(),                              // streamName
          fundingAmount: parseFloat(fromCoinAmount as string)             // fundingAmount
        };
        data.streamName = 'aaa';
        console.log('La puta data:', data);
        return await transfer.getCreateStreamTransaction(
          senderPubkey,                                     // treasurer
          destPubkey,                                       // beneficiary
          null,                                             // treasury
          associatedToken,                                  // associatedToken
          parseFloat(paymentRateAmount as string),          // rateAmount
          getRateIntervalInSeconds(paymentRateFrequency),   // rateIntervalInSeconds
          utcDate,                                          // startUtc
          contract?.name.trim(),                            // streamName
          parseFloat(fromCoinAmount as string)              // fundingAmount
        )
        .then(value => {
          console.log('getCreateStreamTransaction returned transaction:', value);
          // Stage 1 completed - The transaction is created and returned
          setTransactionStatus({
            lastOperation: TransactionStatus.CreateTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction
          });
          transaction = value;
          return true;
        })
        .catch(error => {
          console.log('getCreateStreamTransaction error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.CreateTransactionFailure
          });
          return false;
        });
      }
      return false;
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
        console.log('Signing transaction...');
        return await transfer.signTransaction(wallet, transaction)
        .then(signed => {
          console.log('signTransaction returned a signed transaction:', signed);
          // Stage 2 completed - The transaction was signed
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          signedTransaction = signed;
          return true;
        })
        .catch(error => {
          console.log('Signing transaction failed!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          return false;
        });
      } else {
        console.log('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.SignTransactionFailure
        });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      if (wallet) {
        return transfer.sendSignedTransaction(signedTransaction)
          .then(sig => {
            console.log('sendSignedTransaction returned a signature:', sig);
            // Stage 3 completed - The transaction was sent and a signature was returned
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction
            });
            signature = sig;
            return true;
          })
          .catch(error => {
            console.log(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure
            });
            return false;
          });
      } else {
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.SendTransactionFailure
        });
        return false;
      }
    }

    const confirmTx = async (): Promise<boolean> => {
      return await transfer.confirmTransaction(signature)
        .then(result => {
          console.log('confirmTransaction result:', result);
          // Stage 4 completed - The transaction was confirmed!
          setTransactionStatus({
            lastOperation: TransactionStatus.ConfirmTransactionSuccess,
            currentOperation: TransactionStatus.TransactionFinished
          });
          return true;
        })
        .catch(error => {
          setTransactionStatus({
            lastOperation: TransactionStatus.ConfirmTransaction,
            currentOperation: TransactionStatus.ConfirmTransactionFailure
          });
          return false;
        });
    }

    const resetContractValues = () => {
      const today = new Date().toLocaleDateString();
      setFromCoinAmount('');
      setRecipientAddress('');
      setRecipientNote('');
      setPaymentStartDate(today);
      setPaymentRateAmount('');
      setPaymentRateFrequency(PaymentRateType.PerMonth);
      setTransactionStatus({
        lastOperation: TransactionStatus.Iddle,
        currentOperation: TransactionStatus.Iddle
      });
    }

    // Lets hit it
    if (wallet) {
      setIsBusy(true);
      const create = await createTx();
      console.log('create:', create);
      if (create) {
        const sign = await signTx();
        console.log('sign:', sign);
        if (sign) {
          const sent = await sendTx();
          console.log('sent:', sent);
          if (sent) {
            const confirmed = await confirmTx();
            console.log('confirmed:', confirmed);
            // Reset form (All contract values) after 3 seconds
            setTimeout(() => {
              setIsBusy(false);
              resetContractValues();
            }, 3000);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };


  return (
    <>
      {/* Recipient */}
      <div className="transaction-field">
        <div className="transaction-field-row">
          <span className="field-label-left">Recipient</span>
          <span className="field-label-right">&nbsp;</span>
        </div>
        <div className="transaction-field-row main-row">
          <span className="input-left recipient-field-wrapper">
            <input id="payment-recipient-field"
              className="w-100 general-text-input"
              autoComplete="on"
              autoCorrect="off"
              type="text"
              onFocus={handleRecipientAddressFocusIn}
              onChange={handleRecipientAddressChange}
              onBlur={handleRecipientAddressFocusOut}
              placeholder="Public address or ENS"
              required={true}
              spellCheck="false"
              value={recipientAddress}/>
            <span id="payment-recipient-static-field"
                  className={`${recipientAddress ? 'overflow-ellipsis-middle' : 'placeholder-text'}`}>
              {recipientAddress || 'Public address or ENS'}
            </span>
          </span>
          <div className="addon-right simplelink" onClick={showQrScannerModal}>
            <QrcodeOutlined />
          </div>
        </div>
      </div>
      {/* QR scan modal */}
      {isQrScannerModalVisible && (
        <QrScannerModal
          isVisible={isQrScannerModalVisible}
          handleOk={onAcceptQrScannerModal}
          handleClose={closeQrScannerModal}/>
      )}

      {/* Memo */}
      <div className="transaction-field">
        <div className="transaction-field-row">
          <span className="field-label-left">Memo / Subject</span>
          <span className="field-label-right">&nbsp;</span>
        </div>
        <div className="transaction-field-row main-row">
          <span className="input-left">
            <input
              className="w-100 general-text-input"
              autoComplete="on"
              autoCorrect="off"
              type="text"
              onChange={handleRecipientNoteChange}
              placeholder="What is this payment for?"
              spellCheck="false"
              value={recipientNote} />
          </span>
        </div>
      </div>

      {/* Receive rate and frequency */}
      <div className="transaction-field">
        <div className="transaction-field-row">
          <span className="field-label-left cell-1">Recipient receives</span>
          <span className="field-label-left cell-2 flex-center">&nbsp;</span>
          <span className="field-label-left cell-3">Rate and frequency</span>
          <span className="field-label-left cell-4">&nbsp;</span>
        </div>
        <div className="transaction-field-row main-row">
          <span className="addon-left cell-1">
            <div className="token-selector simplelink" onClick={() => {
              setSubjectTokenSelection('beneficiary');
              showTokenSelector();
            }}>
              <div className="token-icon">
                {destinationToken?.logoURI ? (
                  <img alt={`${destinationToken.name}`} width={20} height={20} src={destinationToken.logoURI} />
                ) : (
                  <Identicon address={destinationToken?.address} style={{ width: "24", display: "inline-flex" }} />
                )}
              </div>
              <div className="token-symbol">{destinationToken?.symbol}</div>
              <span className="flex-center">
                <IconCaretDown className="mean-svg-icons" />
              </span>
            </div>
          </span>
          <span className="static-field-text cell-2 flex-center">
            <span className="symbol-at">@</span>
          </span>
          <span className="static-field-text cell-3">
            <input
              className="general-text-input"
              inputMode="decimal"
              autoComplete="off"
              autoCorrect="off"
              type="text"
              required={true}
              onChange={handlePaymentRateAmountChange}
              pattern="^[0-9]*[.,]?[0-9]*$"
              placeholder="0.0"
              minLength={1}
              maxLength={79}
              spellCheck="false"
              value={paymentRateAmount}
            />
          </span>
          <span className="static-field-text cell-4">
            <Dropdown
              overlay={paymentRateOptionsMenu}
              trigger={["click"]}>
              <span className="dropdown-trigger no-decoration flex-center">
                {getPaymentRateOptionLabel(paymentRateFrequency)}{" "}
                <IconCaretDown className="mean-svg-icons" />
              </span>
            </Dropdown>
          </span>
        </div>
      </div>

      {/* Send date */}
      <div className="transaction-field">
        <div className="transaction-field-row">
          <span className="field-label-left">Send on</span>
          <span className="field-label-right">&nbsp;</span>
        </div>
        <div className="transaction-field-row main-row">
          <span className="field-select-left">
            {paymentStartDate === today ? `${paymentStartDate} (today)` : `${paymentStartDate}`}
          </span>
          <div className="addon-right">
            <DatePicker
              size="middle"
              bordered={false}
              className="addon-date-picker"
              aria-required={true}
              allowClear={false}
              onChange={(value, date) => setPaymentStartDate(date)}
              value={moment(
                paymentStartDate,
                DATEPICKER_FORMAT
              )}
              format={DATEPICKER_FORMAT}
            />
          </div>
        </div>
      </div>

      <Divider plain></Divider>

      <div className="mb-3 text-center">
        <div>You must add funds to start the repeating payment.</div>
        <div>Recommended minimum amount: <span className="fg-red">0.21 SOL (10%)</span>.</div>
      </div>

      {/* Send amount */}
      <div className="transaction-field mb-1">
        <div className="transaction-field-row">
          <span className="field-label-left" style={{marginBottom: '-6px'}}>
            Send ~${fromCoinAmount && effectiveRate
              ? formatAmount(parseFloat(fromCoinAmount) * effectiveRate, 2)
              : "0.00"}
            <IconSort className="mean-svg-icons usd-switcher fg-red" />
            <span className="fg-red">USD</span>
          </span>
          <span className="field-label-right">
            <span>Balance:</span>
            <span className="balance-amount">
              {`${
                selectedToken?.balance
                  ? formatAmount(selectedToken.balance, selectedToken.decimals)
                  : "Unknown"
              }`}
            </span>
            <span>
              (~$
              {selectedToken?.balance && effectiveRate
                ? formatAmount(selectedToken.balance * effectiveRate, 2)
                : "0.00"})
            </span>
          </span>
        </div>
        <div className="transaction-field-row main-row">
          <span className="input-left">
            <input
              className="general-text-input"
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
          </span>
          {selectedToken && (
            <div className="addon-right">
              <div className="token-group">
                {selectedToken?.balance && (
                  <div
                    className="token-max simplelink"
                    onClick={() =>
                      setFromCoinAmount(
                        formatAmount(
                          selectedToken.balance,
                          selectedToken.decimals
                        )
                      )
                    }>
                    MAX
                  </div>
                )}
                <div className="token-selector simplelink" onClick={() => {
                    setSubjectTokenSelection('payer');
                    showTokenSelector();
                  }}>
                  <div className="token-icon">
                    {selectedToken.logoURI ? (
                      <img
                        alt={`${selectedToken.name}`}
                        width={20}
                        height={20}
                        src={selectedToken.logoURI}
                      />
                    ) : (
                      <Identicon
                        address={selectedToken.address}
                        style={{ width: "24", display: "inline-flex" }}
                      />
                    )}
                  </div>
                  <div className="token-symbol">{selectedToken.symbol}</div>
                </div>
              </div>
            </div>
          )}
          <span className="field-caret-down">
            <IconCaretDown className="mean-svg-icons" />
          </span>
        </div>
      </div>

      {/* Token selection modal */}
      <Modal
        className="mean-modal unpadded-content"
        visible={isTokenSelectorModalVisible}
        title={<div className="modal-title">Select a token</div>}
        onCancel={onCloseTokenSelector}
        width={450}
        footer={null}>
        <div className="token-list">
          {subjectTokenSelection === 'payer' ? renderUserTokenList : renderAvailableTokenList}
        </div>
      </Modal>

      {/* Info */}
      <div className="text-center mb-1">
        {selectedToken && effectiveRate
          ? `1 ${selectedToken.symbol} = ${formatAmount(effectiveRate)} USDC`
          : "--"}
      </div>

      {/* Action button */}
      <Button
        className="main-cta"
        block
        type="primary"
        shape="round"
        size="large"
        onClick={onTransactionStart}
        disabled={!recipientAddress || !arePaymentSettingsValid() || !areSendAmountSettingsValid() || isBusy}>
        {getTransactionStartButtonLabel()}
      </Button>
    </>
  );
};
