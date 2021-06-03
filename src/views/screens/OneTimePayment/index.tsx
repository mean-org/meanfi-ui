import { Button, Modal, DatePicker } from "antd";
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
import moment from "moment";
import { useWallet } from "../../../contexts/wallet";
import { useUserAccounts } from "../../../hooks";
import { AppStateContext } from "../../../contexts/appstate";
import { MoneyTransfer } from "../../../money-streaming/money-transfer";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

export const OneTimePayment = () => {
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
    setRecipientAddress,
    setRecipientNote,
    setPaymentStartDate,
    setFromCoinAmount
  } = useContext(AppStateContext);

  const [previousChain, setChain] = useState("");
  const [previousWalletConnectState, setPreviousWalletConnectState] = useState(connected);

  const [coinPrices, setCoinPrices] = useState<any>(null);

  const [shouldLoadCoinPrices, setShouldLoadCoinPrices] = useState(true);
  const [effectiveRate, setEffectiveRate] = useState<number>(0);

  const [shouldLoadTokens, setShouldLoadTokens] = useState(true);
  const [simpleTokenList, setSimpleTokenList] = useState<TokenInfo[]>([]);
  const [selectedToken, setSelectedToken] = useLocalStorageState("userSelectedToken");

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

  // Effect to load token list
  useEffect(() => {
    if (shouldLoadTokens) {
      setShouldLoadTokens(false);
      new TokenListProvider().resolve().then((tokens) => {
        const filteredTokens = tokens
          .filterByClusterSlug(connectionConfig.env)
          .getList();
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
          setSimpleTokenList(tokensWithBalance);
          console.log('tokensWithBalance:', tokensWithBalance);
          // Preset a token
          if (tokensWithBalance?.length) {
            setSelectedToken(tokensWithBalance[0]);
            console.log("Preset token:", tokensWithBalance[0]);
          }
        } else {
          setSimpleTokenList(filteredTokens);
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
    simpleTokenList,
    connectionConfig,
    shouldLoadTokens,
    setSelectedToken,
    setSimpleTokenList,
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
        // TODO: Find how to wait for the accounts' list to be populated to avoid setTimeout
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
      var NUM_CHARS = 4;
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

  // Ui helpers
  const getTransactionStartButtonLabel = (): string => {
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
      : "Approve on your wallet";
  }

  // Main action

  const onTransactionStart = () => {
    console.log("Start transaction for contract type:", contract?.name);

    const destPubkey = new PublicKey(recipientAddress as string);
    console.log('Beneficiary address:', recipientAddress);
    console.log('Beneficiary public key:', destPubkey);

    const senderPubkey = wallet?.publicKey;
    console.log('Wallet address:', wallet?.publicKey?.toBase58());
    console.log('Wallet public key:', senderPubkey);
    const tokenBalance = selectedToken?.balance
      ? formatAmount(selectedToken.balance, selectedToken.decimals)
      : "Unknown";
    console.log(`Token account balance: ${tokenBalance} ${selectedToken.symbol}`);

    console.log(`Amount to transfer: ${fromCoinAmount} ${selectedToken.symbol}`);
    const amount = fromCoinAmount ? parseFloat(fromCoinAmount) * LAMPORTS_PER_SOL : 0;
    console.log('Amount in lamports:', amount);

    // if (recipientNote) {
    //   console.log('Adding memo to the transaction instruction:', recipientNote);
    // }

    const transfer = new MoneyTransfer(connectionConfig.endpoint);
    transfer.sendMoney(wallet, recipientAddress as string, amount)
      .then(value => {
        console.log('sendMoney returned:', value);
      })
      .catch(error => {
        console.log('sendMoney error:', error);
      });
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

      {/* Send amount */}
      <div className="transaction-field">
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
                <div
                  className="token-selector simplelink"
                  onClick={showTokenSelector}>
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
          {/* Loop through the tokens */}
          {selectedToken && simpleTokenList ? (
            simpleTokenList.map((token, index) => {
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
                <div
                  key={index + 100}
                  onClick={onClick}
                  className={`token-item ${
                    selectedToken && selectedToken.address === token.address
                      ? "selected"
                      : "simplelink"
                  }`}>
                  <div className="token-icon">
                    {token.logoURI ? (
                      <img
                        alt={`${token.name}`}
                        width={24}
                        height={24}
                        src={token.logoURI}
                      />
                    ) : (
                      <Identicon
                        address={token.address}
                        style={{ width: "24", display: "inline-flex" }}
                      />
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
        </div>
      </Modal>

      {/* Optional note */}
      <div className="transaction-field">
        <div className="transaction-field-row">
          <span className="field-label-left">Memo</span>
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
              placeholder="Add an optional note"
              spellCheck="false"
              value={recipientNote} />
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

      {/* Info */}
      <div className="text-center p-2">
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
        disabled={!recipientAddress || !paymentStartDate || !areSendAmountSettingsValid()}>
        {getTransactionStartButtonLabel()}
      </Button>
    </>
  );
};
