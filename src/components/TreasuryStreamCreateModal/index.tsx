import React, { useCallback, useEffect, useMemo } from 'react';
import { useContext, useState } from 'react';
import { Modal, Button, Select, Dropdown, Menu, AutoComplete } from 'antd';
import { AppStateContext } from '../../contexts/appstate';
import { formatAmount, getTokenAmountAndSymbolByTokenAddress, getTokenSymbol, isValidNumber, shortenAddress } from '../../utils/utils';
import { useTranslation } from 'react-i18next';
import { TokenInfo } from '@solana/spl-token-registry';
import { consoleOut, getFormattedNumberToLocale, getIntervalFromSeconds, getShortDate, isValidAddress } from '../../utils/ui';
import { getTokenByMintAddress } from '../../utils/tokens';
import { LoadingOutlined, QrcodeOutlined } from '@ant-design/icons';
import { TokenDisplay } from '../TokenDisplay';
import { IconCaretDown, IconDownload, IconIncomingPaused, IconOutgoingPaused, IconTimer, IconUpload } from '../../Icons';
import { SelectOption } from '../../models/common-types';
import { AllocationType, PaymentRateType } from '../../models/enums';
import { TreasuryStreamsBreakdown } from '../../models/streams';
import { StreamInfo, STREAM_STATE } from '@mean-dao/money-streaming/lib/types';
import { useWallet } from '../../contexts/wallet';
import { StepSelector } from '../StepSelector';

const { Option } = Select;

export const TreasuryStreamCreateModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  userBalances: any;
  isBusy: boolean;
  associatedToken: string;
}) => {
  const {
    tokenList,
    coinPrices,
    tokenBalance,
    selectedToken,
    effectiveRate,
    treasuryOption,
    recipientAddress,
    recipientNote,
    paymentStartDate,
    fromCoinAmount,
    paymentRateAmount,
    paymentRateFrequency,
    transactionStatus,
    isVerifiedRecipient,
    streamProgramAddress,
    setSelectedToken,
    setEffectiveRate,
    setRecipientNote,
    setFromCoinAmount,
    resetContractValues,
    setRecipientAddress,
    setPaymentStartDate,
    refreshTokenBalance,
    setPaymentRateAmount,
    setTransactionStatus,
    setForceReloadTokens,
    setIsVerifiedRecipient,
    setPaymentRateFrequency,
    setSelectedTokenBalance,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const { publicKey, connected } = useWallet();
  const [topupAmount, setTopupAmount] = useState<string>('');
  const [currentStep, setCurrentStep] = useState(0);

  /////////////////
  //   Getters   //
  /////////////////

  const getPricePerToken = (token: TokenInfo): number => {
    const tokenSymbol = token.symbol.toUpperCase();
    const symbol = tokenSymbol[0] === 'W' ? tokenSymbol.slice(1) : tokenSymbol;

    return coinPrices && coinPrices[symbol]
      ? coinPrices[symbol]
      : 0;
  }

  const getTransactionStartButtonLabel = (): string => {
    return !selectedToken || !tokenBalance
      ? t('transactions.validation.no-balance')
      : !topupAmount || !isValidNumber(topupAmount) || !parseFloat(topupAmount)
      ? t('transactions.validation.no-amount')
      : parseFloat(topupAmount) > tokenBalance
      ? t('transactions.validation.amount-high')
      : t('treasuries.add-funds.main-cta');
  }

  /////////////////////
  // Data management //
  /////////////////////

  // When modal goes visible, use the treasury associated token or use the default from the appState
  useEffect(() => {
    if (props.isVisible && props.associatedToken) {
      const token = tokenList.find(t => t.address === props.associatedToken);
      if (token && token.address !== selectedToken?.address) {
        setSelectedToken(token);
      }
    }
  }, [
    tokenList,
    selectedToken,
    props.isVisible,
    props.associatedToken,
    setSelectedToken
  ]);

  ////////////////
  //   Events   //
  ////////////////

  const triggerWindowResize = () => {
    window.dispatchEvent(new Event('resize'));
  }

  const setValue = (value: string) => {
    setTopupAmount(value);
  }

  const onStepperChange = (value: number) => {
    setCurrentStep(value);
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

  const handleAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setValue("");
    } else if (newValue === '.') {
      setValue(".");
    } else if (isValidNumber(newValue)) {
      setValue(newValue);
    }
  };

  const onTokenChange = (e: any) => {
    consoleOut("token selected:", e, 'blue');
    const token = getTokenByMintAddress(e);
    if (token) {
      setSelectedToken(token as TokenInfo);
      setEffectiveRate(getPricePerToken(token as TokenInfo));
    }
  }

  //////////////////
  //  Validation  //
  //////////////////

  const isValidInput = (): boolean => {
    return selectedToken &&
           tokenBalance &&
           topupAmount && parseFloat(topupAmount) > 0 &&
           parseFloat(topupAmount) <= tokenBalance
            ? true
            : false;
  }

  const isAddressOwnAccount = (): boolean => {
    return recipientAddress && publicKey && recipientAddress === publicKey.toBase58()
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

  ///////////////
  // Rendering //
  ///////////////

  return (
    <Modal
      className="mean-modal"
      title={<div className="modal-title">{t('treasuries.add-funds.modal-title')}</div>}
      footer={null}
      visible={props.isVisible}
      onOk={props.handleOk}
      onCancel={props.handleClose}
      afterClose={() => setValue('')}
      width={480}>
      {/* <div>
        <StepSelector step={currentStep} steps={2} onValueSelected={onStepperChange} />

        <div className={currentStep === 0 ? "contract-wrapper panel1 show" : "contract-wrapper panel1 hide"}>

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
                <div className="add-on simplelink" onClick={() => {}}>
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

          <div className="form-label">{t('transactions.rate-and-frequency.amount-label')}</div>
          <div className="well">
            <div className="flex-fixed-left">
              <div className="left">
                <span className="add-on">
                  {(selectedToken && tokenList) && (
                    <Select className={`token-selector-dropdown ${props.associatedToken ? 'click-disabled' : ''}`} value={selectedToken.address}
                            onChange={onTokenChange} bordered={false} showArrow={false}>
                      {tokenList.map((option) => {
                        return (
                          <Option key={option.address} value={option.address}>
                            <div className="option-container">
                              <TokenDisplay onClick={() => {}}
                                mintAddress={option.address}
                                name={option.name}
                                showCaretDown={props.associatedToken ? false : true}
                              />
                              <div className="balance">
                                {props.userBalances && props.userBalances[option.address] > 0 && (
                                  <span>{getTokenAmountAndSymbolByTokenAddress(props.userBalances[option.address], option.address, true)}</span>
                                )}
                              </div>
                            </div>
                          </Option>
                        );
                      })}
                    </Select>
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

          <div className="mb-3 text-center">
            <div>{t('transactions.transaction-info.add-funds-repeating-payment-advice')}.</div>
            <div>{t('transactions.transaction-info.min-recommended-amount')}: <span className="fg-red">{getRecommendedFundingAmount()}</span></div>
          </div>

          <div className="form-label">{t('transactions.send-amount.label-amount')}</div>
          <div className="well">
            <div className="flex-fixed-left">
              <div className="left">
                <span className="add-on simplelink">
                {selectedToken && (
                  <TokenDisplay onClick={() => showTokenSelector()}
                      mintAddress={selectedToken.address}
                      name={selectedToken.name}
                      showName={false}
                      showCaretDown={true}
                    />
                  )}
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

          <div className="mb-2">
            <Checkbox onChange={onIsVerifiedRecipientChange}>{t('transactions.verified-recipient-label')}</Checkbox>
          </div>

          <Button
            className="main-cta"
            block
            type="primary"
            shape="round"
            size="large"
            onClick={onTransactionStart}
            disabled={!connected || !isValidAddress(recipientAddress) || isAddressOwnAccount() || !arePaymentSettingsValid() || !areSendAmountSettingsValid() || !isVerifiedRecipient}>
            {getTransactionStartButtonLabel()}
          </Button>
        </div>

      </div> */}

      {/* <div className="mb-3">
        <div className="form-label">{t('treasuries.add-funds.label')}</div>
        <div className={`well ${props.isBusy && 'disabled'}`}>
          <div className="flex-fixed-left">
            <div className="left">
              <span className="add-on">
                {(selectedToken && tokenList) && (
                  <Select className={`token-selector-dropdown ${props.associatedToken ? 'click-disabled' : ''}`} value={selectedToken.address}
                          onChange={onTokenChange} bordered={false} showArrow={false}>
                    {tokenList.map((option) => {
                      return (
                        <Option key={option.address} value={option.address}>
                          <div className="option-container">
                            <TokenDisplay onClick={() => {}}
                              mintAddress={option.address}
                              name={option.name}
                              showCaretDown={props.associatedToken ? false : true}
                            />
                            <div className="balance">
                              {props.userBalances && props.userBalances[option.address] > 0 && (
                                <span>{getTokenAmountAndSymbolByTokenAddress(props.userBalances[option.address], option.address, true)}</span>
                              )}
                            </div>
                          </div>
                        </Option>
                      );
                    })}
                  </Select>
                )}
                {selectedToken && tokenBalance ? (
                  <div
                    className="token-max simplelink"
                    onClick={() => setValue(
                      getTokenAmountAndSymbolByTokenAddress(tokenBalance, selectedToken.address, true)
                    )}>
                    MAX
                  </div>
                ) : null}
              </span>
            </div>
            <div className="right">
              <input
                id="topup-amount-field"
                className="general-text-input text-right"
                inputMode="decimal"
                autoComplete="off"
                autoCorrect="off"
                type="text"
                onChange={handleAmountChange}
                pattern="^[0-9]*[.,]?[0-9]*$"
                placeholder="0.0"
                minLength={1}
                maxLength={79}
                spellCheck="false"
                value={topupAmount}
              />
            </div>
          </div>
          <div className="flex-fixed-right">
            <div className="left inner-label">
              <span>{t('treasuries.add-funds.balance')}:</span>
              <span>
                {`${tokenBalance && selectedToken
                    ? getTokenAmountAndSymbolByTokenAddress(tokenBalance, selectedToken?.address, true)
                    : "0"
                }`}
              </span>
            </div>
            <div className="right inner-label">
              ~${topupAmount && effectiveRate
                ? formatAmount(parseFloat(topupAmount) * effectiveRate, 2)
                : "0.00"}
            </div>
          </div>
        </div>
      </div>

      <div className="mb-3">
        <div className="form-label">{t('treasuries.add-funds.allocation-label')}</div>
        <div className="well">
          <Dropdown overlay={allocationOptionsMenu} trigger={["click"]}>
            <span className="dropdown-trigger no-decoration flex-fixed-right align-items-center">
              <div className="left">
                <span className="capitalize-first-letter">{allocationOptions.find(o => o.key === allocationOption)?.label}</span>
              </div>
              <div className="right">
                <IconCaretDown className="mean-svg-icons" />
              </div>
            </span>
          </Dropdown>
        </div>
      </div>

      {allocationOption === AllocationType.Specific && props.streamStats && props.streamStats.total > 0 && (
        <div className="mb-3">
          <div className="form-label">{t('treasuries.add-funds.allocation-select-stream-label')}</div>
          <div className="well">
            <div className="dropdown-trigger no-decoration flex-fixed-right align-items-center">
              <div className="left mr-0">
                <AutoComplete
                  bordered={false}
                  style={{ width: '100%' }}
                  dropdownClassName="stream-select-dropdown"
                  options={renderStreamSelectOptions()}
                  placeholder={t('treasuries.add-funds.search-streams-placeholder')}
                  filterOption={(inputValue, option) => {
                    const originalItem = streamSummaries.find(i => i.streamName === option!.key);
                    return option!.value.indexOf(inputValue) !== -1 || originalItem?.streamName.indexOf(inputValue) !== -1
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )} */}

      <Button
        className={`main-cta ${props.isBusy ? 'inactive' : ''}`}
        block
        type="primary"
        shape="round"
        size="large"
        disabled={!isValidInput()}
        onClick={() => {}}>
        {props.isBusy && (
          <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
        )}
        {props.isBusy
          ? t('treasuries.add-funds.main-cta-busy')
          : getTransactionStartButtonLabel()}
      </Button>
    </Modal>
  );
};
