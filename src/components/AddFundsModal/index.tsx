import { useContext, useEffect, useState } from 'react';
import { Modal, Button, Row, Col } from 'antd';
import { IconSort } from "../../Icons";

import { AppStateContext } from '../../contexts/appstate';
import { formatAmount, getTokenAmountAndSymbolByTokenAddress, isValidNumber } from '../../utils/utils';
import { Identicon } from '../Identicon';
import { TransactionFees } from '../../money-streaming/types';
import { percentage } from '../../utils/ui';

export const AddFundsModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  transactionFees: TransactionFees;
}) => {
  const {
    selectedToken,
    tokenBalance,
    effectiveRate
  } = useContext(AppStateContext);
  const [topupAmount, setTopupAmount] = useState<string>('');
  const [feeAmount, setFeeAmount] = useState<number | null>(null);

  useEffect(() => {
    if (!feeAmount && props.transactionFees) {
      setFeeAmount(getFeeAmount(props.transactionFees));
    }
  }, [feeAmount, props.transactionFees]);

  const onAcceptTopup = () => {
    props.handleOk(topupAmount);
  }

  const setValue = (value: string) => {
    setTopupAmount(value);
  }

  const handleAmountChange = (e: any) => {
    const newValue = isValidNumber(e.target.value) ? e.target.value : '';
    setValue(newValue);
    setFeeAmount(getFeeAmount(props.transactionFees, newValue));
  };

  const getFeeAmount = (fees: TransactionFees, amount?: any): number => {
    let fee = 0;
    let inputAmount = amount ? parseFloat(amount) : 0;
    if (fees) {
      if (fees.mspPercentFee) {
        fee = inputAmount ? percentage(fees.mspPercentFee, inputAmount) : 0;
      } else if (fees.mspFlatFee) {
        fee = fees.mspFlatFee;
      }
    }
    return fee;
  }

  // Validation

  const isValidInput = (): boolean => {
    const numberAmount = parseFloat(topupAmount);
    return selectedToken &&
           tokenBalance &&
           topupAmount &&
           numberAmount > (feeAmount as number) &&
           numberAmount <= tokenBalance - (feeAmount as number)
            ? true
            : false;
  }

  const getTransactionStartButtonLabel = (): string => {
    return !selectedToken || !tokenBalance
      ? "No balance"
      : !topupAmount || !isValidNumber(topupAmount) || !parseFloat(topupAmount)
      ? "Enter amount"
      : parseFloat(topupAmount) > tokenBalance - (feeAmount as number)
      ? "Invalid amount"
      : tokenBalance < (feeAmount as number)
      ? "Invalid amount"
      : "Start funding";
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
      title={<div className="modal-title">Add funds</div>}
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptTopup}
      onCancel={props.handleClose}
      afterClose={() => setValue('')}
      width={480}>

      {/* Top up amount */}
      <div className="mb-3">
        <div className="transaction-field mb-1">
          <div className="transaction-field-row">
            <span className="field-label-left" style={{marginBottom: '-6px'}}>
              Amount ~${topupAmount && effectiveRate
                ? formatAmount(parseFloat(topupAmount) * effectiveRate, 2)
                : "0.00"}
              <IconSort className="mean-svg-icons usd-switcher fg-red" />
              <span className="fg-red">USD</span>
            </span>
            <span className="field-label-right">
              <span>Balance:</span>
              <span className="balance-amount">
                {`${selectedToken && tokenBalance
                    ? formatAmount(tokenBalance as number, selectedToken.decimals || 2)
                    : "0"
                }`}
              </span>
              <span>
                (~$
                {tokenBalance && effectiveRate
                  ? formatAmount(tokenBalance as number * effectiveRate, 2)
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
                  {selectedToken && (
                    <div
                      className="token-max simplelink"
                      onClick={() => {
                        const feeForTotal = getFeeAmount(props.transactionFees, (tokenBalance as number));
                        setValue(
                          formatAmount(
                            (tokenBalance as number) - feeForTotal,
                            selectedToken.decimals
                          )
                        );
                        setFeeAmount(feeForTotal);
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
              parseFloat(topupAmount) > tokenBalance - (feeAmount as number)
              ? (<span className="fg-red">Amount exceeds your balance</span>)
              : tokenBalance < (feeAmount as number)
              ? (<span className="fg-red">Amount has to be greater than the transaction fee</span>)
              : (<span>&nbsp;</span>)
            }</span>
            <span className="field-label-right">&nbsp;</span>
          </div>
        </div>
      </div>

      {/* Info */}
      {selectedToken && (
        <div className="p-2 mb-2">
          {infoRow(
            `1 ${selectedToken.symbol}:`,
            effectiveRate ? `$${formatAmount(effectiveRate, 2)}` : "--"
          )}
          {infoRow(
            'Transaction fee:',
            `${isValidInput()
              ? '~' + getTokenAmountAndSymbolByTokenAddress((feeAmount as number), selectedToken?.address)
              : '0'
            }`
          )}
          {infoRow(
            'Beneficiary receives:',
            `${isValidInput()
              ? '~' + getTokenAmountAndSymbolByTokenAddress(parseFloat(topupAmount) - (feeAmount as number), selectedToken?.address)
              : '0'
            }`
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
