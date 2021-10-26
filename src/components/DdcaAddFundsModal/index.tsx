import React, { useEffect } from 'react';
import { useContext, useState } from 'react';
import { Modal, Button, Row, Col } from 'antd';
import { IconSort } from "../../Icons";
import { AppStateContext } from '../../contexts/appstate';
import { formatAmount, getTokenAmountAndSymbolByTokenAddress, isValidNumber } from '../../utils/utils';
import { Identicon } from '../Identicon';
import { percentage } from '../../utils/ui';
import { useTranslation } from 'react-i18next';
import { DdcaDetails, TransactionFees } from '@mean-dao/ddca';
import { getTokenByMintAddress, TokenInfo } from '../../utils/tokens';

export const DdcaAddFundsModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  ddcaDetails: DdcaDetails | undefined;
  transactionFees: TransactionFees;
}) => {
  const { coinPrices } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const [topupAmount, setTopupAmount] = useState<string>('');
  const [effectiveRate, setEffectiveRate] = useState(0);
  const [selectedToken, setSelectedToken] = useState<TokenInfo>();

  // Set selected token and price per token
  useEffect(() => {

    if (!coinPrices || !props.ddcaDetails) { return; }

    const getPricePerToken = (token: TokenInfo): number => {
      const tokenSymbol = token.symbol.toUpperCase();
      const symbol = tokenSymbol[0] === 'W' ? tokenSymbol.slice(1) : tokenSymbol;
  
      return coinPrices && coinPrices[symbol]
        ? coinPrices[symbol]
        : 0;
    }

    if (coinPrices && props.ddcaDetails) {
      const token = getTokenByMintAddress(props.ddcaDetails.fromMint);
      if (token) {
        setSelectedToken(token);
        setEffectiveRate(getPricePerToken(token));
      }
    }
  }, [
    coinPrices,
    props.ddcaDetails
  ]);

  const onAcceptTopup = () => {
    props.handleOk(topupAmount);
  }

  const setValue = (value: string) => {
    setTopupAmount(value);
  }

  const handleAmountChange = (e: any) => {
    const newValue = isValidNumber(e.target.value) ? e.target.value : '';
    setValue(newValue);
  };

  const getFeeAmount = (amount?: any): number => {
    let fee = 0;
    const inputAmount = amount ? parseFloat(amount) : 0;
    if (props && props.transactionFees) {
      if (props.transactionFees.percentFee) {
        fee = percentage(props.transactionFees.percentFee, inputAmount);
      } else if (props.transactionFees.flatFee) {
        fee = props.transactionFees.flatFee;
      }
    }
    return fee;
  }

  // Validation

  const isValidInput = (): boolean => {
    return selectedToken &&
           props.ddcaDetails?.fromBalance &&
           topupAmount && parseFloat(topupAmount) > 0 &&
           parseFloat(topupAmount) <= props.ddcaDetails.fromBalance &&
           parseFloat(topupAmount) > getFeeAmount(topupAmount)
            ? true
            : false;
  }

  const getTransactionStartButtonLabel = (): string => {
    return !selectedToken || !props.ddcaDetails?.fromBalance
      ? t('transactions.validation.no-balance')
      : !topupAmount || !isValidNumber(topupAmount) || !parseFloat(topupAmount)
      ? t('transactions.validation.no-amount')
      : parseFloat(topupAmount) > props.ddcaDetails.fromBalance
      ? t('transactions.validation.amount-high')
      : props.ddcaDetails.fromBalance < getFeeAmount(topupAmount)
      ? t('transactions.validation.amount-low')
      : t('transactions.validation.valid-approve');
  }

  const infoRow = (caption: string, value: string) => {
    return (
      <Row>
        <Col span={12} className="text-right pr-1">{caption}</Col>
        <Col span={12} className="text-left pl-1 fg-secondary-70">{value}</Col>
      </Row>
    );
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
      {props.ddcaDetails && (
        <div className="mb-3">
          <div className="transaction-field mb-1">
            <div className="transaction-field-row">
              <span className="field-label-left" style={{marginBottom: '-6px'}}>
                {t('add-funds.label')} ~${topupAmount && effectiveRate
                  ? formatAmount(parseFloat(topupAmount) * effectiveRate, 2)
                  : "0.00"}
                <IconSort className="mean-svg-icons usd-switcher fg-red" />
                <span className="fg-red">USD</span>
              </span>
              <span className="field-label-right">
                <span>{t('add-funds.label-right')}:</span>
                <span className="balance-amount">
                  {`${selectedToken && props.ddcaDetails.fromBalance
                    ? getTokenAmountAndSymbolByTokenAddress(props.ddcaDetails.fromBalance, selectedToken.address, true)
                    : "0"
                  }`}
                </span>
                <span className="balance-amount">
                  (~$
                  {props.ddcaDetails.fromBalance && effectiveRate
                    ? formatAmount(props.ddcaDetails.fromBalance as number * effectiveRate, 2)
                    : "0.00"})
                </span>
              </span>
            </div>
            <div className="transaction-field-row main-row">
              <span className="input-left">
                <input
                  id="topup-amount-field"
                  className="general-text-input"
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
              </span>
              {selectedToken && (
                <div className="addon-right">
                  <div className="token-group">
                    {props.ddcaDetails.fromBalance > 0 && (
                      <div
                        className="token-max simplelink"
                        onClick={() => {
                          setValue(
                            getTokenAmountAndSymbolByTokenAddress(props.ddcaDetails?.fromBalance || 0, selectedToken.address, true)
                          );
                        }}>
                        MAX
                      </div>
                    )}
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
                            style={{ width: "24", display: "inline-flex" }}
                          />
                        )}
                      </div>
                      <div className="token-symbol">{selectedToken.symbol}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="transaction-field-row">
              <span className="field-label-left">{
                parseFloat(topupAmount) > props.ddcaDetails.fromBalance
                  ? (<span className="fg-red">{t('transactions.validation.amount-high')}</span>)
                  : (<span>&nbsp;</span>)
              }</span>
              <span className="field-label-right">&nbsp;</span>
            </div>
          </div>
        </div>
      )}

      {/* Info */}
      {(selectedToken) && (
        <div className="p-2 mb-2">
          {infoRow(
            `1 ${selectedToken.symbol}:`,
            effectiveRate ? `$${formatAmount(effectiveRate, 2)}` : "--"
          )}
          {isValidInput() && infoRow(
            t('transactions.transaction-info.transaction-fee') + ':',
            `~${getTokenAmountAndSymbolByTokenAddress(getFeeAmount(topupAmount), selectedToken?.address)}`
          )}
          {isValidInput() && infoRow(
            t('transactions.transaction-info.beneficiary-receives') + ':',
            `~${getTokenAmountAndSymbolByTokenAddress(parseFloat(topupAmount) - getFeeAmount(topupAmount), selectedToken?.address)}`
          )}
        </div>
      )}

      <Button
        className="main-cta"
        block
        type="primary"
        shape="round"
        size="large"
        disabled={!isValidInput()}
        onClick={onAcceptTopup}>
        {getTransactionStartButtonLabel()}
      </Button>
    </Modal>
  );
};
