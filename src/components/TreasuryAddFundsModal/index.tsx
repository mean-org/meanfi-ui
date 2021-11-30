import React from 'react';
import { useContext, useState } from 'react';
import { Modal, Button, Select } from 'antd';
import { AppStateContext } from '../../contexts/appstate';
import { formatAmount, getTokenAmountAndSymbolByTokenAddress, isValidNumber } from '../../utils/utils';
import { Identicon } from '../Identicon';
import { useTranslation } from 'react-i18next';
import { TokenInfo } from '@solana/spl-token-registry';
import { consoleOut } from '../../utils/ui';
import { getTokenByMintAddress } from '../../utils/tokens';
import { LoadingOutlined } from '@ant-design/icons';

const { Option } = Select;

export const TreasuryAddFundsModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  userBalances: any;
  isBusy: boolean;
}) => {
  const {
    tokenList,
    coinPrices,
    tokenBalance,
    selectedToken,
    effectiveRate,
    setEffectiveRate,
    setSelectedToken,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');

  const [topupAmount, setTopupAmount] = useState<string>('');

  const getPricePerToken = (token: TokenInfo): number => {
    const tokenSymbol = token.symbol.toUpperCase();
    const symbol = tokenSymbol[0] === 'W' ? tokenSymbol.slice(1) : tokenSymbol;

    return coinPrices && coinPrices[symbol]
      ? coinPrices[symbol]
      : 0;
  }

  const onAcceptTopup = () => {
    props.handleOk(topupAmount);
  }

  const setValue = (value: string) => {
    setTopupAmount(value);
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

  // Validation

  const isValidInput = (): boolean => {
    return selectedToken &&
           tokenBalance &&
           topupAmount && parseFloat(topupAmount) > 0 &&
           parseFloat(topupAmount) <= tokenBalance
            ? true
            : false;
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

  const onTokenChange = (e: any) => {
    consoleOut("token selected:", e, 'blue');
    const token = getTokenByMintAddress(e);
    if (token) {
      setSelectedToken(token as TokenInfo);
      setEffectiveRate(getPricePerToken(token as TokenInfo));
    }
  }

  return (
    <Modal
      className="mean-modal"
      title={<div className="modal-title">{t('add-funds.modal-title')}</div>}
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptTopup}
      onCancel={props.handleClose}
      afterClose={() => setValue('')}
      width={480}>

      {/* Top up amount */}
      <div className="form-label">{t('add-funds.label')}</div>
      <div className={`well ${props.isBusy && 'disabled'}`}>
        <div className="flex-fixed-left">
          <div className="left">
            <span className="add-on">
              {(selectedToken && tokenList) && (
                <Select className="token-selector-dropdown" value={selectedToken.address} onChange={onTokenChange} bordered={false} showArrow={false}>
                  {tokenList.map((option) => {
                    return (
                      <Option key={option.address} value={option.address}>
                        <div className="option-container">
                          <div className="token-selector">
                            <div className="token-icon">
                              {option?.logoURI ? (
                                <img alt={`${option.name}`} width={20} height={20} src={option.logoURI} />
                              ) : (
                                <Identicon address={option?.address} style={{ width: "24", display: "inline-flex" }} />
                              )}
                            </div>
                            <div className="token-symbol">{option?.symbol}</div>
                          </div>
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
            <span>{t('add-funds.label-right')}:</span>
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

      <Button
        className={`main-cta ${props.isBusy ? 'inactive' : ''}`}
        block
        type="primary"
        shape="round"
        size="large"
        disabled={!isValidInput()}
        onClick={onAcceptTopup}>
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
