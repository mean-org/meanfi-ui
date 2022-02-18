import { useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import './style.less';
import { TokenInfo } from "@solana/spl-token-registry";
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { ReloadOutlined } from "@ant-design/icons";
import { Button, Tooltip, Row, Col, Space } from "antd";
import Modal from "antd/lib/modal/Modal";
import Checkbox from "antd/lib/checkbox/Checkbox";
import { useTranslation } from 'react-i18next';
import { IconStats } from "../../Icons";
import { TokenDisplay } from "../../components/TokenDisplay";
import { TextInput } from "../../components/TextInput";
import { TokenListItem } from "../../components/TokenListItem";
import { PreFooter } from "../../components/PreFooter";
import { useWallet } from "../../contexts/wallet";
import { useAccountsContext } from "../../contexts/accounts";
import { useConnection } from "../../contexts/connection";
import { AppStateContext } from "../../contexts/appstate";
import { ACCOUNT_LAYOUT } from '../../utils/layouts';
import { formatAmount, getAmountWithSymbol, isValidNumber } from "../../utils/utils";
import { consoleOut, isValidAddress } from "../../utils/ui";

type SwapOption = "stake" | "unstake";

export const InvestView = () => {
  const {
    tokenList,
    selectedToken,
    tokenBalance,
    effectiveRate,
    coinPrices,
    loadingPrices,
    fromCoinAmount,
    isVerifiedRecipient,
    paymentStartDate,
    refreshPrices,
    setSelectedToken,
    setEffectiveRate,
    setFromCoinAmount,
    setIsVerifiedRecipient,
  } = useContext(AppStateContext);
  const navigate = useNavigate();
  const connection = useConnection();
  const accounts = useAccountsContext();
  const { connected, publicKey } = useWallet();
  const { t } = useTranslation('common');
  const [currentTab, setCurrentTab] = useState<SwapOption>("stake");
  const [userBalances, setUserBalances] = useState<any>();
  const [filteredTokenList, setFilteredTokenList] = useState<TokenInfo[]>([]);
  const [tokenFilter, setTokenFilter] = useState("");
  const [termValue, setTermValue] = useState(7);

  // Token selection modal
  const [isTokenSelectorModalVisible, setTokenSelectorModalVisibility] = useState(false);
  const showTokenSelector = useCallback(() => setTokenSelectorModalVisibility(true), []);

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

  const onCloseTokenSelector = useCallback(() => {
    setTokenSelectorModalVisibility(false);
    if (tokenFilter && !isValidAddress(tokenFilter)) {
      setTokenFilter('');
    }
  }, [tokenFilter]);

  const onTabChange = (option: SwapOption) => {
    setCurrentTab(option);
  }

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

  // Updates the token list everytime is filtered
  const updateTokenListByFilter = useCallback((searchString: string) => {

    if (!tokenList) {
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

  const onGotoExchange = () => {
    onCloseTokenSelector();
    navigate('/exchange?from=SOL&to=wSOL');
  }

  const getPricePerToken = (token: TokenInfo): number => {
    const tokenSymbol = token.symbol.toUpperCase();
    const symbol = tokenSymbol[0] === 'W' ? tokenSymbol.slice(1) : tokenSymbol;

    return coinPrices && coinPrices[symbol]
      ? coinPrices[symbol]
      : 0;
  }

  const onChangeValue = (value: number) => {
    setTermValue(value);
  }

  const onIsVerifiedRecipientChange = (e: any) => {
    setIsVerifiedRecipient(e.target.checked);
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

  const renderInvestOptions = (
    <div className="transaction-list-row money-streams-summary">
      <div className="icon-cell">
        <div className="token-icon">
          <img alt="MEAN" width="30" height="30" src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/MEANeD3XDdUmNMsRGjASkSWdC8prLYsoRJ61pPeHctD/logo.svg" />
        </div>
      </div>
      <div className="description-cell">
        <div className="title">Stake MEAN</div>
      </div>
      <div className="rate-cell">
        <div className="rate-amount">52.09%</div>
        <div className="interval">APR</div>
      </div>
    </div>
  );

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
      <div className="container main-container">
        <div className="interaction-area">
          <div className="title-and-subtitle">
            <div className="title">
              <IconStats className="mean-svg-icons" />
              <div>{t('invest.title')}</div>
            </div>
            <div className="subtitle">
            {t('invest.subtitle')}
            </div>
          </div>
          <div className="meanfi-two-panel-layout invest-layout">
            <div className="meanfi-two-panel-left">
              <div className="meanfi-panel-heading">
                <span className="title">{t('invest.screen-title')}</span>
                <Tooltip placement="bottom" title={t('invest.refresh-tooltip')}>
                  <div className="transaction-stats user-address">
                    <span className="incoming-transactions-amout">(7)</span>
                    <span className="transaction-legend">
                      <span className="icon-button-container">
                        <Button
                          type="default"
                          shape="circle"
                          size="small"
                          icon={<ReloadOutlined />}
                          onClick={() => {}}
                        />
                      </span>
                    </span>
                  </div>
                </Tooltip>
              </div>
              <div className="inner-container">
                <div className="item-block vertical-scroll">
                  {renderInvestOptions}
                </div>
              </div>
            </div>

            <div className="meanfi-two-panel-right">
              <div className="inner-container">

                {/* Staking paragraphs */}
                <p>{t("invest.panel-right.first-text")}</p>
                <p>{t("invest.panel-right.second-text")}</p>
                <div className="pinned-token-separator"></div>

                {/* Staking Stats */}
                <div className="stream-fields-container">
                  <div className="mb-3">
                    <Row>
                      <Col span={8}>
                        <div className="info-label">
                          {t("invest.panel-right.stats.staking-apr")}
                        </div>
                        <div className="transaction-detail-row">52.09%</div>
                      </Col>
                      <Col span={8}>
                        <div className="info-label">
                          {t("invest.panel-right.stats.total-value-locked")}
                        </div>
                        <div className="transaction-detail-row">$7.64M</div>
                      </Col>
                      <Col span={8}>
                        <div className="info-label">
                          {t("invest.panel-right.stats.next-week-payout")}
                        </div>
                        <div className="transaction-detail-row">$108,730</div>
                      </Col>
                    </Row>
                  </div>
                </div>

                <Row gutter={[8, 8]} className="d-flex justify-content-center">
                  {/* Tabset */}
                  <Col span={12}>
                    <div className="place-transaction-box mb-3">
                      <div className="button-tabset-container">
                        <div className={`tab-button ${currentTab === "stake" ? 'active' : ''}`} onClick={() => onTabChange("stake")}>
                          {t('invest.panel-right.tabset.stake.name')}
                        </div>
                        <div className={`tab-button ${currentTab === "unstake" ? 'active' : ''}`} onClick={() => onTabChange("unstake")}>
                          {t('invest.panel-right.tabset.unstake.name')}
                        </div>
                      </div>

                      {/* Tab Stake */}
                      {currentTab === "stake" && (
                        <>
                          <div className="form-label">{t("invest.panel-right.tabset.stake.amount-label")}</div>
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
                        
                          <span className="info-label">{t("invest.panel-right.tabset.stake.term-label")}</span>
                          <div className="flexible-left mb-1 mt-2">
                            <div className="left token-group">
                              <div className="mb-1 d-flex flex-column align-items-center">
                                <div className={`token-max simplelink ${termValue === 7 ? "active" : "disabled"}`} onClick={() => onChangeValue(7)}>7 days</div>
                                <span>1x</span>
                              </div>
                              <div className="mb-1 d-flex flex-column align-items-center">
                                <div className={`token-max simplelink ${termValue === 30 ? "active" : "disabled"}`} onClick={() => onChangeValue(30)}>30 days</div>
                                <span>1.1x</span>
                              </div>
                              <div className="mb-1 d-flex flex-column align-items-center">
                                <div className={`token-max simplelink ${termValue === 90 ? "active" : "disabled"}`} onClick={() => onChangeValue(90)}>90 days</div>
                                <span>1.2x</span>
                              </div>
                              <div className="mb-1 d-flex flex-column align-items-center">
                                <div className={`token-max simplelink ${termValue === 1 ? "active" : "disabled"}`} onClick={() => onChangeValue(1)}>1 year</div>
                                <span>2.0x</span>
                              </div>
                              <div className="mb-1 d-flex flex-column align-items-center">
                                <div className={`token-max simplelink ${termValue === 4 ? "active" : "disabled"}`} onClick={() => onChangeValue(4)}>4 year</div>
                                <span>4.0x</span>
                              </div>
                            </div>
                          </div>
                          <span className="info-label">{t("invest.panel-right.tabset.stake.notification-label")}</span>

                          {/* Confirm that have read the terms and conditions */}
                          <div className="mb-2 mt-2">
                            <Checkbox checked={isVerifiedRecipient} onChange={onIsVerifiedRecipientChange}>{t("invest.panel-right.tabset.stake.verified-label")}</Checkbox>
                          </div>

                          {/* Action button */}
                          <Button
                            className="main-cta"
                            block
                            type="primary"
                            shape="round"
                            size="large"
                            disabled={
                              !areSendAmountSettingsValid() ||
                              !isVerifiedRecipient}
                          >
                            Stake {selectedToken && selectedToken.name}
                          </Button>

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
                                  <span>{t('token-selector.looking-for-sol')}</span>&nbsp;
                                  <span className="simplelink underline" onClick={onGotoExchange}>{t('token-selector.wrap-sol-first')}</span>
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
                        </>
                      )}

                      {/* Tab unstake */}
                      {currentTab === "unstake" && (
                          <div>Unstake</div>
                      )}
                    </div>
                  </Col>

                  {/* Staking data */}
                  <Col span={12}>
                    <div className="staking-data">
                      <Row>
                        <Col span={12}>
                          <span>{"Your Current Stake:"}</span>
                        </Col>
                        <Col span={12}>
                          <span className="staking-number">3.78x boost</span>
                        </Col>
                        <Col span={12}>
                          <span>{"My Staked MEAN"}</span>
                        </Col>
                        <Col span={12}>
                          <span className="staking-number">5,000.0000</span>
                        </Col>
                        <Col span={12}>
                          <span>{"Avg. Locked Yield"}</span>
                        </Col>
                        <Col span={12}>
                          <span className="staking-number">114.98%</span>
                        </Col>
                        <Col span={12}>
                          <span>{"My Locked eMEAN"}</span>
                        </Col>
                        <Col span={12}>
                          <span className="staking-number">1,000</span>
                        </Col>
                        <Col span={12}>
                          <span>{"My xMEAN Balance"}</span>
                        </Col>
                        <Col span={12}>
                          <span className="staking-number">20,805.1232</span>
                        </Col>
                        <span className="info-label mt-1">{t("invest.panel-right.staking-data.text-one")}</span>
                        <span className="info-label">{t("invest.panel-right.staking-data.text-two")}</span>
                        <Col span={24} className="d-flex flex-column justify-content-end align-items-end">
                          <div className="staking-value mb-2 mt-1">5.229181 MEAN</div>
                          <Space size="middle">
                            <Button
                              type="default"
                              shape="round"
                              size="small"
                              className="thin-stroke"
                            >
                              {t("invest.panel-right.staking-data.withdraw-button")}
                            </Button>
                          </Space>
                        </Col>
                      </Row>
                    </div>
                  </Col>
                </Row>
              </div>
            </div>
          </div>
        </div>
      </div>
      <PreFooter />
    </>
  );
};