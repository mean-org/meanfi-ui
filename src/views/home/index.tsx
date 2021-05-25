import { Button, Col, Modal, Row, Menu, Dropdown, DatePicker, Input, Tooltip } from "antd";
import { DownOutlined, CheckOutlined, SwapOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useState } from "react";
import { useConnectionConfig } from "../../contexts/connection";
import { useMarkets } from "../../contexts/market";
import { IconCaretDown } from "../../Icons";
import {
  formatAmount,
  fromLamports,
  isPositiveNumber,
  isValidNumber,
} from "../../utils/utils";
import { TokenInfo, TokenListProvider } from "@solana/spl-token-registry";
import { Identicon } from "../../components/Identicon";
import { cache } from "../../contexts/accounts";
import { getPrices } from "../../utils/api";
import { DATEPICKER_FORMAT, PRICE_REFRESH_TIMEOUT } from "../../constants";
import { PaymentOptionsModal } from "../../components/PaymentOptionsModal";
import {
  PaymentRateType,
  PaymentScheme,
  PaymentStartPlan,
} from "../../models/enums";
import {
  getAmountWithTokenSymbol,
  getOptionsFromEnum,
  getPaymentRateIntervalByRateType,
  getPaymentRateOptionLabel,
  getPaymentStartPlanOptionLabel,
  timeConvert
} from "../../utils/ui";
import moment from "moment";
import { useWallet } from "../../contexts/wallet";
import { useUserAccounts } from "../../hooks";

export const HomeView = () => {
  const today = new Date().toLocaleDateString();
  const { marketEmitter, midPriceInUSD } = useMarkets();
  const connectionConfig = useConnectionConfig();
  const { connected } = useWallet();
  // const { account } = useNativeAccount();
  const { userAccounts } = useUserAccounts();

  // const [currentTab, setCurrentTab] = useState("send");
  const [previousChain, setChain] = useState("");
  const [previousWalletConnectState, setPreviousWalletConnectState] = useState(connected);

  const [fromCoinAmount, setFromCoinAmount] = useState("");
  const [paymentRateAmount, setPaymentRateAmount] = useState("");
  const [paymentRateInterval, setPaymentRateInterval] = useState(getPaymentRateIntervalByRateType(PaymentRateType.PerMonth));

  const [coinPrices, setCoinPrices] = useState<any>(null);

  const [shouldLoadCoinPrices, setShouldLoadCoinPrices] = useState(true);
  const [effectiveRate, setEffectiveRate] = useState<number>(0);

  const [shouldLoadTokens, setShouldLoadTokens] = useState(true);
  const [simpleTokenList, setSimpleTokenList] = useState<TokenInfo[]>([]);
  const [selectedToken, setSelectedToken] = useState<any>(null);
  // const [selectedToken, setSelectedToken] = useLocalStorageState("userSelectedToken");

  // Token selection modal
  const [isTokenSelectorModalVisible, setTokenSelectorModalVisibility] = useState(false);
  const showTokenSelector = useCallback(() => setTokenSelectorModalVisibility(true), []);
  const onCloseTokenSelector = useCallback(() => setTokenSelectorModalVisibility(false), []);

  // Schedule Payment modal
  const [isSchedulePaymentModalVisible, setSchedulePaymentModalVisibility] = useState(false);
  const showSchedulePayment = useCallback(() => setSchedulePaymentModalVisibility(true), []);
  const onCloseSchedulePayment = useCallback(() => setSchedulePaymentModalVisibility(false), []);
  const [paymentStartScheduleValue, setPaymentStartScheduleValue] = useState(today);
  const [paymentStartPlanValue, setPaymentStartPlanValue] = useState<PaymentStartPlan>(PaymentStartPlan.Now);
  const [paymentSchemeValue, setPaymentSchemeValue] = useState<PaymentScheme>(PaymentScheme.OneTimePayment);
  const [paymentRateValue, setPaymentRateValue] = useState<PaymentRateType>(PaymentRateType.PerMonth);

  // const onSendTabSelected = () => {
  //   setCurrentTab("send");
  // };

  // const onReceiveTabSelected = () => {
  //   setCurrentTab("receive");
  // };

  const handleFromCoinAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setFromCoinAmount("");
    } else if (isValidNumber(newValue)) {
      setFromCoinAmount(newValue);
    }
  };

  const handlePaymentRateAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setPaymentRateAmount("");
    } else if (isValidNumber(newValue)) {
      setPaymentRateAmount(newValue);
    }
  };

  const handlePaymentRateIntervalChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setPaymentRateInterval("");
    } else if (isPositiveNumber(newValue)) {
      setPaymentRateInterval(newValue);
    }
  };

  const handlePaymentRateOptionChange = (val: PaymentRateType) => {
    setPaymentRateValue(val);
    setPaymentRateInterval(getPaymentRateIntervalByRateType(val));
  }

  // Set to reload prices every 30 seconds
  const setPriceTimer = () => {
    setTimeout(() => {
      setShouldLoadCoinPrices(true);
    }, PRICE_REFRESH_TIMEOUT);
  };

  const getSendPaymentLabel = (
    plan: PaymentStartPlan,
    scheme: PaymentScheme
  ): string => {
    let label = "";
    if (plan === PaymentStartPlan.Now) {
      label = "Now";
    } else {
      label = `On ${paymentStartScheduleValue}`;
    }
    if (scheme === PaymentScheme.OneTimePayment) {
      label += " (one time)";
    } else {
      label += " (repeating)";
    }
    return label;
  };

  const getPaymentRateLabel = (
    scheme: PaymentScheme,
    rate: PaymentRateType,
    amount: string,
    interval: string
  ): string => {
    let label = "";
    // console.log(`scheme: ${PaymentScheme[scheme]}\nRate: ${PaymentRateType[rate]}\nAmount: ${amount}\nInterval: ${interval}`);
    if (scheme === PaymentScheme.RepeatingPayment) {
      label += `${getAmountWithTokenSymbol(amount, selectedToken)} `;
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
        case PaymentRateType.Other:
          const intervalNumber = parseInt(interval, 10);
          label += `every ${timeConvert(intervalNumber)}`;
          break;
      }
    }
    return label;
  };

  const onAcceptSchedulePayment = () => {
    onCloseSchedulePayment();
  };

  // Effect to load token list
  useEffect(() => {
    const filterTokenList = () => {
      // Immediately signal the state to avoid this again
      setShouldLoadTokens(false);
      const tokensWithBalance: TokenInfo[] = [];
      new TokenListProvider().resolve().then((tokens) => {
        const filteredTokens = tokens
          .filterByClusterSlug(connectionConfig.env)
          .getList();
        // List loaded, now reflect it as it is if no wallet connected
        // If a wallet gets connected then filter by tokens the user own
        if (connected && userAccounts && userAccounts.length > 0) {
          for (let i = 0; i < userAccounts.length; i++) {
            const account = userAccounts[i];
            const mintAddress = account.info.mint.toBase58();
            const mint = cache.get(mintAddress);
            const tokenInfoItem = simpleTokenList.find(t => t.address === mintAddress);
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

    if (shouldLoadTokens) {
      filterTokenList();
    }
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
  }, [coinPrices, shouldLoadCoinPrices, selectedToken, setEffectiveRate]);

  // Effect signal token list reload on network change
  useEffect(() => {
    if (previousChain !== connectionConfig.env) {
      setChain(connectionConfig.env);
      console.log(`cluster:`, connectionConfig.env);
      if (!shouldLoadTokens) {
        setShouldLoadTokens(true);
      }
    }
  }, [
    previousChain,
    connectionConfig.env,
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
  }, [
    connected,
    shouldLoadTokens,
    previousWalletConnectState,
    setShouldLoadTokens,
    setPreviousWalletConnectState,
  ]);

  // Validation
  const areSendAmountSettingsValid = (): boolean => {
    return connected &&
           selectedToken &&
           selectedToken.balance &&
           fromCoinAmount &&
           parseFloat(fromCoinAmount) <= selectedToken.balance &&
           arePaymentSettingsValid();
  }

  const arePaymentSettingsValid = (): boolean => {
    let result = true;
    if (paymentStartPlanValue === PaymentStartPlan.Schedle && !paymentStartScheduleValue) {
      return false;
    }
    const rateAmount = parseFloat(paymentRateAmount);
    if (paymentSchemeValue === PaymentScheme.RepeatingPayment) {
      if (!rateAmount) {
        result = false;
      } else if (rateAmount > parseFloat(fromCoinAmount)) {
        result = false;
      } else if (paymentRateValue === PaymentRateType.Other && !paymentRateInterval) {
        result = false;
      }
    }

    return result;
  }

  const getTransactionStartButtonLabel = (): string => {
    return !connected
           ? "Connect your wallet"
           : !selectedToken.balance
           ? "No balance"
           : !fromCoinAmount
           ? "Enter an amount"
           : parseFloat(fromCoinAmount) > selectedToken.balance
           ? "Amount exceeds your balance"
           : !arePaymentSettingsValid()
           ? "Review Send payment settings"
           : "Start payment";
  }

  const getPaymentSettingsModalButtonLabel = (): string => {
    const rateAmount = parseFloat(paymentRateAmount);
    return !rateAmount && paymentSchemeValue === PaymentScheme.RepeatingPayment
           ? "Add payment rate"
           : rateAmount > parseFloat(fromCoinAmount) 
           ? "Review payment rate"
           : (paymentSchemeValue === PaymentScheme.RepeatingPayment &&
             paymentRateValue === PaymentRateType.Other &&
             !paymentRateInterval)
           ? 'Select a valid interval'
           : 'Next';
  }

  // Main action

  const onTransactionStart = () => {
    console.log("You clicked on start transaction");
  };

  // Prefabrics
  const paymentStartPlanMenu = (
    <Menu>
      <Menu.Item
        key="10"
        onClick={() => {
          setPaymentStartPlanValue(PaymentStartPlan.Now);
        }}>
        {getPaymentStartPlanOptionLabel(PaymentStartPlan.Now)}
      </Menu.Item>
      <Menu.Item
        key="11"
        onClick={() => {
          setPaymentStartPlanValue(PaymentStartPlan.Schedle);
        }}>
        {getPaymentStartPlanOptionLabel(PaymentStartPlan.Schedle)}
      </Menu.Item>
    </Menu>
  );

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

  return (
    <div className="container">
      <div className="interaction-area">
        <div className="place-transaction-box">
          {/* Tab selection */}
          {/* <Row gutter={[24, 24]}>
            <Col span={12}>
              <Button
                block
                shape="round"
                type="text"
                size="large"
                className={`${
                  currentTab === "send" ? "ant-btn-shaded" : "ant-btn-flat"
                }`}
                onClick={onSendTabSelected}
              >
                Send
              </Button>
            </Col>
            <Col span={12}>
              <Button
                block
                shape="round"
                type="text"
                size="large"
                className={`${
                  currentTab === "receive" ? "ant-btn-shaded" : "ant-btn-flat"
                }`}
                onClick={onReceiveTabSelected}>
                Receive
              </Button>
            </Col>
          </Row> */}
          <div className="position-relative mb-2">
            <h2 className="screen-title">Simple Payment</h2>
            <p>For one time payments, or to setup a gift over time. This also works great to pay for a service received, for example: handyman work.</p>
            <span className="contract-switch-button">
              <Tooltip title="Change money streming contract">
                <Button shape="circle" icon={<SwapOutlined className="fg-red"/>} />
              </Tooltip>
            </span>
          </div>
          {/* Send amount */}
          <div id="send-transaction-field" className="transaction-field">
            <div className="transaction-field-row">
              <span className="field-label-left">Send</span>
              <span className="field-label-right">
                <span className="mr-1">Balance:</span>{`${
                  selectedToken?.balance
                    ? formatAmount(
                      selectedToken.balance,
                      selectedToken.decimals
                      )
                    : "Unknown"
                }`}
              </span>
            </div>
            <div className="transaction-field-row main-row">
              <span className="input-left">
                <input
                  className="token-amount-input"
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
                <div className="token-right">
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
                      onClick={showTokenSelector}
                    >
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
            <div className="transaction-field-row">
              <span className="field-label-left">
                ~$
                {fromCoinAmount && effectiveRate
                  ? formatAmount(parseFloat(fromCoinAmount) * effectiveRate, 2)
                  : "0.00"}
              </span>
              <span className="field-label-right">
                ~$
                {
                  selectedToken?.balance && effectiveRate
                  ? formatAmount(selectedToken.balance * effectiveRate, 2)
                  : "0.00"
                }
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
            footer={null}
          >
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
                      }`}
                    >
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
          {/* Payment scheme */}
          <div id="send-payment-field" className={`transaction-field ${!fromCoinAmount ? "disabled" : ""}`}>
            <div className="transaction-field-row">
              <span className="field-label-left">Send payment</span>
              <span className="field-label-right">&nbsp;</span>
            </div>
            <div
              className="transaction-field-row main-row simplelink"
              onClick={showSchedulePayment}>
              <span className="field-select-left text-truncate">
                {getSendPaymentLabel(paymentStartPlanValue, paymentSchemeValue)}
              </span>
              <span className="field-caret-down">
                <IconCaretDown className="mean-svg-icons" />
              </span>
            </div>
            <div className="transaction-field-row">
              <span className="field-label-left">
                {paymentSchemeValue === PaymentScheme.RepeatingPayment
                  ? getPaymentRateLabel(
                      paymentSchemeValue,
                      paymentRateValue,
                      paymentRateAmount,
                      paymentRateInterval
                    )
                  : ""}
              </span>
            </div>
          </div>
          {/* Schedule Payment modal */}
          <PaymentOptionsModal
            isVisible={isSchedulePaymentModalVisible}
            handleOk={onAcceptSchedulePayment}
            handleClose={onCloseSchedulePayment}>
            <div className="mean-modal-form">
              <div className="mb-4">
                <h4 className="modal-form-heading">What kind of payment is this?</h4>
                <div className="item-selector-grid w-100 mb-3">
                  <div
                    className={`option-grid-item position-relative ${
                      paymentSchemeValue === PaymentScheme.OneTimePayment
                        ? "selected"
                        : ""
                    }`}
                    onClick={() =>
                      setPaymentSchemeValue(PaymentScheme.OneTimePayment)
                    }>
                    <span className="position absolute right-top">
                      <CheckOutlined />
                    </span>
                    <span className="option-grid-item-text">
                      One time
                      <br />
                      payment
                    </span>
                  </div>
                  <div
                    className={`option-grid-item position-relative ${
                      paymentSchemeValue === PaymentScheme.RepeatingPayment
                        ? "selected"
                        : ""
                    }`}
                    onClick={() =>
                      setPaymentSchemeValue(PaymentScheme.RepeatingPayment)
                    }>
                    <span className="position absolute right-top">
                      <CheckOutlined />
                    </span>
                    <span className="option-grid-item-text">
                      Repeating
                      <br />
                      payment
                    </span>
                  </div>
                </div>
                <div className={`${paymentSchemeValue === PaymentScheme.OneTimePayment ? 'd-none' : ''}`}>
                  <h4 className="modal-form-heading">What is the payment rate?</h4>
                  <div className="font-size-85 font-regular fg-black-25 mb-1">This is the agreed upon payment rate between you and the recepient.</div>
                  <Row gutter={[24, 0]} className="mb-2">
                    <Col span={12}>
                      <div className="transaction-field medium my-0">
                        <div className="transaction-field-row main-row">
                          <span className="input-left">
                            <input
                              className="token-amount-input"
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
                              min={0}
                              max={fromCoinAmount}
                              value={paymentRateAmount}
                            />
                          </span>
                          {selectedToken && (
                            <div className="token-right">
                              <div className="token-group">
                                <div className="token-selector">
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
                                        style={{
                                          width: "24",
                                          display: "inline-flex",
                                        }}
                                      />
                                    )}
                                  </div>
                                  <div className="token-symbol">
                                    {selectedToken.symbol}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <span className="font-size-75 font-regular fg-black-25 pl-1">Select up to {getAmountWithTokenSymbol(parseFloat(fromCoinAmount),selectedToken)}</span>
                    </Col>
                    <Col span={12}>
                      <Dropdown
                        overlay={paymentRateOptionsMenu}
                        trigger={["click"]}
                      >
                        <Button size="large" className="w-100 gray-stroke">
                          {getPaymentRateOptionLabel(paymentRateValue)}{" "}
                          <DownOutlined />
                        </Button>
                      </Dropdown>
                    </Col>
                  </Row>
                  <Row gutter={[24, 0]} className={paymentRateValue !== PaymentRateType.Other ? "d-none" : "mb-3"}>
                    <Col span={12} offset={12}>
                      {/* Only for integer input greater than 0 */}
                      <Input
                        className="w-100 gray-stroke"
                        inputMode="decimal"
                        autoComplete="off"
                        autoCorrect="off"
                        type="text"
                        suffix="minutes"
                        onChange={handlePaymentRateIntervalChange}
                        disabled={paymentRateValue !== PaymentRateType.Other}
                        pattern="^([0]*?([1-9]\d*)(\.0{1,2})?)$"
                        placeholder="0"
                        minLength={1}
                        maxLength={79}
                        spellCheck="false"
                        value={paymentRateInterval}
                        defaultValue={paymentRateInterval}
                      />
                    </Col>
                  </Row>
                </div>
                <h4 className="modal-form-heading">When do you want to send this payment?</h4>
                <Row gutter={[24, 0]} className="mb-2">
                  <Col span={12}>
                    <Dropdown overlay={paymentStartPlanMenu} trigger={["click"]}>
                      <Button size="large" className="w-100 gray-stroke">
                        {getPaymentStartPlanOptionLabel(paymentStartPlanValue)}{" "}
                        <DownOutlined />
                      </Button>
                    </Dropdown>
                  </Col>
                  <Col span={12}>
                    {paymentStartPlanValue === PaymentStartPlan.Now ? (
                      <Button
                        block
                        className="gray-stroke"
                        type="primary"
                        shape="round"
                        size="large"
                        disabled={true}
                      >
                        Will send right away
                      </Button>
                    ) : (
                      <DatePicker
                        size="large"
                        className="w-100 gray-stroke"
                        aria-required={paymentStartPlanValue === PaymentStartPlan.Schedle}
                        allowClear={false}
                        onChange={(value, date) =>
                          setPaymentStartScheduleValue(date)
                        }
                        defaultValue={moment(
                          paymentStartScheduleValue,
                          DATEPICKER_FORMAT
                        )}
                        format={DATEPICKER_FORMAT}
                      />
                    )}
                  </Col>
                </Row>
              </div>
              <Button
                className="main-cta"
                block
                type="primary"
                shape="round"
                size="large"
                onClick={onAcceptSchedulePayment}
                disabled={!arePaymentSettingsValid()}>
                {getPaymentSettingsModalButtonLabel()}
              </Button>
            </div>
          </PaymentOptionsModal>
          {/* Recipient */}
          <div id="payment-recipient-field" className="transaction-field">
            <div className="transaction-field-row">
              <span className="field-label-left">Recipient</span>
              <span className="field-label-right">&nbsp;</span>
            </div>
            <div className="transaction-field-row main-row simplelink">
              <span className="field-select-left">Select</span>
              <span className="field-caret-down">
                <IconCaretDown className="mean-svg-icons" />
              </span>
            </div>
            <div className="transaction-field-row">
              <span className="field-label-left">&nbsp;</span>
            </div>
          </div>
          {/* Info */}
          <div className="text-center p-2">
            {selectedToken && effectiveRate
              ? `1 ${selectedToken.symbol} = ${formatAmount(
                  effectiveRate
                )} USDC`
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
            disabled={!areSendAmountSettingsValid()}>
            {getTransactionStartButtonLabel()}
          </Button>
        </div>
      </div>
    </div>
  );
};
