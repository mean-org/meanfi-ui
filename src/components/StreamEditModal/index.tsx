import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppStateContext } from "../../contexts/appstate";
import { Modal, Button, Spin, Dropdown, Menu, Row, Col } from 'antd';
import { PaymentRateType, TransactionStatus } from '../../models/enums';
import { TokenInfo } from "@solana/spl-token-registry";
import { TokenListItem } from "../TokenListItem";
import { consoleOut, getIntervalFromSeconds, getPaymentRateOptionLabel, isValidAddress, PaymentRateTypeOption } from "../../utils/ui";
import { useWallet } from "../../contexts/wallet";
import { TokenDisplay } from "../TokenDisplay";
import { formatAmount, getAmountWithSymbol, isValidNumber, toUiAmount } from "../../utils/utils";
import { TextInput } from "../TextInput";
import { useNavigate } from "react-router-dom";
import { IconCaretDown } from "../../Icons";
import { isError } from "../../utils/transactions";
import { StreamInfo } from '@mean-dao/money-streaming/lib/types';
import { Stream } from "@mean-dao/msp";
import { BN } from "bn.js";
import { NATIVE_SOL } from "../../utils/tokens";

export const StreamEditModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  streamDetail: Stream | StreamInfo | undefined;
  isBusy: boolean;
}) => {
  const { t } = useTranslation('common');
  const { connected } = useWallet();
  const navigate = useNavigate();
  const {
    transactionStatus,
    selectedToken,
    effectiveRate,
    coinPrices,
    tokenList,
    tokenBalance,
    loadingPrices,
    recipientNote,
    fromCoinAmount,
    paymentRateFrequency,
    selectedStream,
    setTransactionStatus,
    setSelectedToken,
    setEffectiveRate,
    refreshPrices,
    setRecipientNote,
    setFromCoinAmount,
    setPaymentRateFrequency
  } = useContext(AppStateContext);
  const [filteredTokenList, setFilteredTokenList] = useState<TokenInfo[]>([]);
  const [tokenFilter, setTokenFilter] = useState("");
  const [userBalances, setUserBalances] = useState<any>();

  useEffect(() => {
    if (props.streamDetail) {
      // setRecipientNote();

      // setFromCoinAmount(toUiAmount(new BN(props.streamDetail.rateAmount), 6).toString());

      // let frequency = getIntervalFromSeconds(props.streamDetail.rateIntervalInSeconds, false, t);
      // const camalize = frequency.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase());
      // const rateType = camalize.charAt(0).toUpperCase() + camalize.slice(1);
      
      // setPaymentRateFrequency(PaymentRateType[rateType]);
    }
  }, [
    props.streamDetail,
  ]);

  const refreshPage = () => {
    if (props.streamDetail) {
      // setRecipientNote();

      // setFromCoinAmount(toUiAmount(new BN(props.streamDetail.rateAmount), 6).toString());

      // let frequency = getIntervalFromSeconds(props.streamDetail.rateIntervalInSeconds, false, t);
      // const camalize = frequency.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase());
      // const rateType = camalize.charAt(0).toUpperCase() + camalize.slice(1);
      
      // setPaymentRateFrequency(PaymentRateType[rateType]);
    }
    props.handleClose();
    window.location.reload();
  }

  const onAcceptModal = () => {
    props.handleOk({

    });
  }

  const onCloseModal = () => {
    props.handleClose();
  }

  const onAfterClose = () => {

    setTimeout(() => {

    });

    setTransactionStatus({
        lastOperation: TransactionStatus.Iddle,
        currentOperation: TransactionStatus.Iddle
    });
  }

  const onNameInputValueChange = (e: any) => {
    setRecipientNote(e.target.value);
  }

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

  const getPricePerToken = (token: TokenInfo): number => {
    const tokenSymbol = token.symbol.toUpperCase();
    const symbol = tokenSymbol[0] === 'W' ? tokenSymbol.slice(1) : tokenSymbol;

    return coinPrices && coinPrices[symbol]
      ? coinPrices[symbol]
      : 0;
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

  const handlePaymentRateOptionChange = (val: PaymentRateType) => {
    setPaymentRateFrequency(val);
  }

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
        filteredTokenList.map((token, index) => {

          if (token.address === NATIVE_SOL.address) {
            return null;
          }

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
      <Modal
        className="mean-modal simple-modal"
        title={<div className="modal-title">{t('streams.edit-stream.modal-title')}</div>}
        footer={null}
        visible={props.isVisible}
        onOk={onAcceptModal}
        onCancel={onCloseModal}
        afterClose={onAfterClose}
        width={props.isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}>

        <div className={!props.isBusy ? "panel1 show" : "panel1 hide"}>

          {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
            <>
              <div className="mb-3">

                {/* Stream name */}
                <div className="form-label">{t('streams.edit-stream.name-input-label')}</div>
                <div className={`well ${props.isBusy ? 'disabled' : ''}`}>
                  <div className="flex-fixed-right">
                    <div className="left">
                      <input
                        id="stream-label-field"
                        className="w-100 general-text-input"
                        autoComplete="off"
                        autoCorrect="off"
                        type="text"
                        maxLength={32}
                        onChange={onNameInputValueChange}
                        placeholder={t('streams.edit-stream.name-input-placeholder')}
                        value={recipientNote}
                      />
                    </div>
                  </div>
                  <div className="form-field-hint">{t('streams.edit-stream.name-input-hint')}</div>
                </div>
              </div>

              {/* Amount to send */}
              <div className="form-label">{t('streams.edit-stream.send-amount-input-label')}</div>
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
                  {/* <div className="right inner-label">
                    <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
                      ~${fromCoinAmount && effectiveRate
                        ? formatAmount(parseFloat(fromCoinAmount) * effectiveRate, 2)
                        : "0.00"}
                    </span>
                  </div> */}
                </div>
              </div>
              
              {/* Frequency */}
              <div className="form-label">{t('streams.edit-stream.frequency-input-label')}</div>
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
                <div className="form-field-hint">{t('streams.edit-stream.frequency-input-hint')}</div>
              </div>

              {/* Button group */}
              <Row className="transaction-progress">
                <Col span={12}>
                  <Button
                    block
                    type="text"
                    shape="round"
                    size="middle"
                    className={props.isBusy ? 'inactive' : ''}
                    onClick={() => isError(transactionStatus.currentOperation)
                      ? onAcceptModal()
                      : onCloseModal()}>
                    {isError(transactionStatus.currentOperation)
                      ? t('general.retry')
                      : t('general.cta-close')
                    }
                  </Button>
                </Col>
                <Col span={12}>
                  <Button
                    className={props.isBusy ? 'inactive' : ''}
                    block
                    type="primary"
                    shape="round"
                    size="middle"
                    // disabled={!isFormValid()}
                    onClick={() => {
                      if (transactionStatus.currentOperation === TransactionStatus.Iddle) {
                        onAcceptModal();
                      } else if (transactionStatus.currentOperation === TransactionStatus.TransactionFinished) {
                        onCloseModal();
                      } else {
                        refreshPage();
                      }
                    }}>
                    {props.isBusy
                      ? t('streams.edit-stream.main-cta-busy')
                      : transactionStatus.currentOperation === TransactionStatus.Iddle
                        ? t('streams.edit-stream.main-cta')
                        : transactionStatus.currentOperation === TransactionStatus.TransactionFinished
                          ? t('general.cta-finish')
                          : t('general.refresh')
                    }
                  </Button>
                </Col>
              </Row>
            </>
          ) : transactionStatus.currentOperation === TransactionStatus.TransactionFinished ? (
            <></>
          ) : (
            <></>
          )}
        </div>
      </Modal>

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
  );
};