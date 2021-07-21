import { useContext, useState } from 'react';
import { Modal, Button } from 'antd';
import { IconSort } from "../../Icons";

import { AppStateContext } from '../../contexts/appstate';
import { formatAmount, isValidNumber } from '../../utils/utils';
import { Identicon } from '../Identicon';

export const AddFundsModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
}) => {
  const {
    selectedToken,
    tokenBalance,
    effectiveRate
  } = useContext(AppStateContext);
  const [topupAmount, setTopupAmount] = useState<string>('');

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
    } else if (isValidNumber(newValue)) {
      setValue(newValue);
    }
  };

  const isValidInput = (): boolean => {
    return selectedToken &&
           tokenBalance &&
           topupAmount &&
           parseFloat(topupAmount) > 0 &&
           parseFloat(topupAmount) <= tokenBalance
            ? true
            : false;
  }

  // 'Start funding' : 'Invalid amount'
  const getTransactionStartButtonLabel = (): string => {
    return !selectedToken || !tokenBalance
      ? "No balance"
      : !topupAmount
      ? "Enter amount"
      : parseFloat(topupAmount) <= 0 || parseFloat(topupAmount) > tokenBalance
      ? "Invalid amount"
      : "Start funding";
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
      <div className="mb-3">

        {/* Top up amount */}
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
                      onClick={() =>
                        setValue(
                          formatAmount(
                            tokenBalance as number,
                            selectedToken.decimals
                          )
                        )
                      }>
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
              parseFloat(topupAmount) > tokenBalance
                ? (<span className="fg-red">Amount exceeds your balance</span>)
                : (<span>&nbsp;</span>)
            }</span>
            <span className="field-label-right">&nbsp;</span>
          </div>
        </div>

      </div>
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
