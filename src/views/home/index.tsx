import { Button, Col, Modal, Row } from "antd";
import { useCallback, useEffect, useState } from "react";
import { useConnectionConfig } from "../../contexts/connection";
import { useMarkets } from "../../contexts/market";
import { IconCaretDown } from "../../Icons";
import { formatAmount, formatNumber, isValidNumber, useLocalStorageState } from "../../utils/utils";
import { TokenInfo, TokenListProvider } from "@solana/spl-token-registry";
import { Identicon } from "../../components/Identicon";
import { useNativeAccount } from "../../contexts/accounts";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getPrices } from "../../utils/api";
// import { WRAPPED_SOL_MINT } from "../../utils/ids";
// import { useUserBalance, useUserTotalBalance } from "../../hooks";

export const HomeView = () => {
  const { marketEmitter, midPriceInUSD } = useMarkets();
  const connectionConfig = useConnectionConfig();
  const { account } = useNativeAccount();
  // const SRM_ADDRESS = 'SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt';
  // const SRM = useUserBalance(SRM_ADDRESS);
  // const SOL = useUserBalance(WRAPPED_SOL_MINT);
  // const { hasBalance, balanceInUSD: totalBalanceInUSD } = useUserTotalBalance();

  const [currentTab, setCurrentTab] = useState('send');
  const [previousChain, setChain] = useState('');

  const [fromCoinAmount, setFromCoinAmount] = useState('');

  // const [getCoinPrices, coinPrices] = useCoinPrices();
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

  const onSendTabSelected = () => {
    setCurrentTab('send');
  }

  const onReceiveTabSelected = () => {
    setCurrentTab('receive');
  }

  const handleFromCoinAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === '') {
      setFromCoinAmount('');
    } else if (isValidNumber(newValue)) {
      setFromCoinAmount(newValue);
    }
  }

  const onTransactionStart = () => {
    console.log('You clicked on start transaction');
  }

  const setPriceTimer = () => {
    //
  }

  // Effect to load token list
  useEffect(() => {
    const filterTokenList = () => {
      new TokenListProvider().resolve().then((tokens) => {
        const filteredTokens = tokens.filterByClusterSlug(connectionConfig.env).getList();
        setSimpleTokenList(filteredTokens);
        setShouldLoadTokens(false);
        console.log('tokens', filteredTokens);
        // Preset a token
        if (!selectedToken && filteredTokens) {
          setSelectedToken(filteredTokens[0]);
          console.log('Preset token:', filteredTokens[0]);
        }
      });
    }
    if (shouldLoadTokens) {
      filterTokenList();
    }
  }, [
    coinPrices,
    setSimpleTokenList,
    connectionConfig.env,
    selectedToken,
    shouldLoadTokens,
    setSelectedToken,
    setEffectiveRate
  ]);

  // Effect to load coin prices
  useEffect(() => {
    const getCoinPrices = async () => {
      try {
        await getPrices()
          .then((prices) => {
            console.log('Coin prices:', prices);
            setCoinPrices(prices);
            setEffectiveRate(prices[selectedToken.symbol] ? prices[selectedToken.symbol] : 0);
          })
          .catch(() => setCoinPrices(null));
      } catch (error) {
        setCoinPrices(null);
      }
    };

    if (shouldLoadCoinPrices) {
      getCoinPrices();
      setShouldLoadCoinPrices(false);
      setPriceTimer();
    }
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
  }, [previousChain, connectionConfig.env, shouldLoadTokens, setShouldLoadTokens]);

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

  // const balances = (
  //   <Row gutter={[16, 16]} align="middle">
  //     <Col span={24}>
  //       <h2>Your balances ({formatUSD.format(totalBalanceInUSD)}):</h2>
  //       <h2>SOL: {SOL.balance} ({formatUSD.format(SOL.balanceInUSD)})</h2>
  //       <h2>SRM: {SRM?.balance} ({formatUSD.format(SRM?.balanceInUSD)})</h2>
  //     </Col>
  //   </Row>
  // );

  return (
    <div className="container">
      <div className="interaction-area">
        <div className="place-transaction-box box-shadow-6">
          {/* Tab selection */}
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Button block
                shape="round"
                type="text"
                size="large"
                className={`${currentTab === 'send' ? "ant-btn-shaded" : "ant-btn-flat"}`}
                onClick={onSendTabSelected}>
                Send
              </Button>
            </Col>
            <Col span={12}>
              <Button block
                shape="round"
                type="text"
                size="large"
                className={`${currentTab === 'receive' ? "ant-btn-shaded" : "ant-btn-flat"}`}
                onClick={onReceiveTabSelected}>
                Receive
              </Button>
            </Col>
          </Row>
          {/* Send amount */}
          <div id="send-transaction-field" className="transaction-field">
            <div className="transaction-field-row">
              <span className="field-label-left">Send</span>
              <span className="field-label-right">Balance: {`${account && account.lamports ? formatNumber.format((account?.lamports || 0) / LAMPORTS_PER_SOL) : 'Unknown'}`}</span>
            </div>
            <div className="transaction-field-row main-row">
              <span className="input-left">
                <input className="token-amount-input" inputMode="decimal" autoComplete="off" autoCorrect="off" type="text" onChange={handleFromCoinAmountChange}
                        pattern="^[0-9]*[.,]?[0-9]*$" placeholder="0.0" minLength={1} maxLength={79} spellCheck="false" value={fromCoinAmount} />
              </span>
              {selectedToken && (
              <div className="token-right">
                <div className="token-group">
                  {account && account.lamports && (
                    <div className="token-max simplelink" onClick={() => setFromCoinAmount(formatAmount((account?.lamports || 0) / LAMPORTS_PER_SOL, selectedToken.decimals))}>MAX</div>
                  )}
                  <div className="token-selector simplelink" onClick={showTokenSelector}>
                    <div className="token-icon">
                      {selectedToken.logoURI ? (
                        <img alt={`${selectedToken.name}`} width={20} height={20} src={selectedToken.logoURI} />
                      ) : (
                        <Identicon
                                address={selectedToken.address}
                                style={{ width: "24", display: "inline-flex" }} />
                      )}
                    </div>
                    <div className="token-symbol">{selectedToken.symbol}</div>
                  </div>
                </div>
              </div>
              )}
              <span className="field-caret-down">
                <IconCaretDown className="mean-svg-icons"/>
              </span>
              {/* Token selection modal */}
              <Modal className="mean-modal unpadded-content"
                      visible={isTokenSelectorModalVisible}
                      title="Select a token"
                      onCancel={onCloseTokenSelector}
                      width={450}
                      footer={null}>
                <div className="token-list">
                  {/* Loop through the tokens */}
                  {selectedToken && simpleTokenList ? simpleTokenList.map((token, index) => {
                    const onClick = function () {
                      setSelectedToken(token);
                      console.log('token selected:', token.symbol);
                      setEffectiveRate(coinPrices && coinPrices[token.symbol] ? coinPrices[token.symbol] : 0);
                      onCloseTokenSelector();
                    };
                    return (
                      <div key={index} onClick={onClick}
                          className={`token-item ${selectedToken && selectedToken.address === token.address ? "selected" : "simplelink"}`}>
                        <div className="token-icon">
                          {token.logoURI ? (
                            <img alt={`${token.name}`} width={24} height={24} src={token.logoURI} />
                          ) : (
                            <Identicon
                                address={token.address}
                                style={{ width: "24", display: "inline-flex" }} />
                          )}
                        </div>
                        <div className="token-description">
                          <div className="token-symbol">{token.symbol}</div>
                          <div className="token-name">{token.name}</div>
                        </div>
                      </div>
                    );
                  }) : (<p>Loading...</p>)}
                </div>
              </Modal>
            </div>
            <div className="transaction-field-row">
              <span className="field-label-left">
                ~${fromCoinAmount && effectiveRate ? formatAmount(parseFloat(fromCoinAmount) * effectiveRate, 2) : '0.00'}
              </span>
              <span className="field-label-right">
                ~${account && account.lamports && effectiveRate ? formatAmount(((account?.lamports || 0) / LAMPORTS_PER_SOL) * effectiveRate, 2) : '0.00'}
              </span>
            </div>
          </div>
          {/* Payment scheme */}
          <div id="send-payment-field" className="transaction-field">
            <div className="transaction-field-row">
              <span className="field-label-left">Send payment</span>
              <span className="field-label-right">&nbsp;</span>
            </div>
            <div className="transaction-field-row main-row simplelink">
              <span className="field-select-left">Now (one time)</span>
              <span className="field-caret-down">
                <IconCaretDown className="mean-svg-icons"/>
              </span>
            </div>
            <div className="transaction-field-row">
              <span className="field-label-left">&nbsp;</span>
            </div>
          </div>
          {/* Recipient */}
          <div id="payment-recipient-field" className="transaction-field">
            <div className="transaction-field-row">
              <span className="field-label-left">Recipient</span>
              <span className="field-label-right">&nbsp;</span>
            </div>
            <div className="transaction-field-row main-row simplelink">
              <span className="field-select-left">Select</span>
              <span className="field-caret-down">
                <IconCaretDown className="mean-svg-icons"/>
              </span>
            </div>
            <div className="transaction-field-row">
              <span className="field-label-left">&nbsp;</span>
            </div>
          </div>
          {/* Info */}
          <div className="text-center p-2">
            {selectedToken && effectiveRate ? `1 ${selectedToken.symbol} = ${formatAmount(effectiveRate)} USDC` : '--'}
          </div>
          {/* Action button */}
          <Button block
            type="primary"
            shape="round"
            size="large"
            onClick={onTransactionStart}
            disabled={!fromCoinAmount}>
            {!fromCoinAmount ? 'Enter an amount' : 'Start payment'}
          </Button>
        </div>
        {/* {balances} */}
      </div>
    </div>
  );
};
