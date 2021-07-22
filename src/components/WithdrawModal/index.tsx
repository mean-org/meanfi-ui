import { useState } from "react";
import { Modal, Button } from "antd";
import {
  getTokenAmountAndSymbolByTokenAddress,
  isValidNumber
} from "../../utils/utils";
import { StreamInfo } from "../../money-streaming/money-streaming";
import { percentage } from "../../utils/ui";

export const WithdrawModal = (props: {
  startUpData: StreamInfo | undefined;
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
}) => {
  const [withdrawAmountInput, setWithdrawAmountInput] = useState<string>("");

  const onAcceptWithdrawal = () => {
    props.handleOk(withdrawAmountInput);
  };

  const setValue = (value: string) => {
    setWithdrawAmountInput(value);
  };

  const setPercentualValue = (value: number) => {
    if (props.startUpData) {
      if (value === 100) {
        setWithdrawAmountInput(props.startUpData.escrowVestedAmount.toString());
      } else {
        const partialAmount = percentage(value, props.startUpData.escrowVestedAmount);
        setWithdrawAmountInput(
          getAmountWithSymbol(partialAmount, props.startUpData.associatedToken as string, true)
        );
      }
    } else {
      setValue("0");
    }
  }

  const handleWithdrawAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setValue("");
    } else if (isValidNumber(newValue)) {
      setValue(newValue);
    }
  };

  const getAmountWithSymbol = (amount: number, address?: string, onlyValue = false, truncateInsteadRound = false) => {
    return getTokenAmountAndSymbolByTokenAddress(amount, address || '', onlyValue);
  }

  const isValidInput = () => {
    return props.startUpData && withdrawAmountInput &&
      parseFloat(withdrawAmountInput) &&
      parseFloat(withdrawAmountInput) <= props.startUpData.escrowVestedAmount
      ? true
      : false;
  };

  return (
    <Modal
      className="mean-modal"
      title={<div className="modal-title">Withdraw funds</div>}
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptWithdrawal}
      onCancel={props.handleClose}
      afterClose={() => setValue("")}
      width={480}>
      <div className="mb-3">
        <div className="transaction-field disabled">
          <div className="transaction-field-row">
            <span className="field-label-left">
              Funds available to withdraw now
            </span>
            <span className="field-label-right">&nbsp;</span>
          </div>
          <div className="transaction-field-row main-row">
            <span className="field-select-left">
              {props.startUpData
                ? getAmountWithSymbol(
                    props.startUpData.escrowVestedAmount,
                    props.startUpData.associatedToken as string
                  )
                : "--"}
            </span>
          </div>
        </div>

        <div className="transaction-field mb-1">
          <div className="transaction-field-row">
            <span className="field-label-left">Enter amount to withdraw</span>
            <span className="field-label-right">By percentual preset</span>
          </div>
          <div className="transaction-field-row main-row">
            <span className="input-left">
              <input
                className="general-text-input"
                inputMode="decimal"
                autoComplete="off"
                autoCorrect="off"
                type="text"
                onChange={handleWithdrawAmountChange}
                pattern="^[0-9]*[.,]?[0-9]*$"
                placeholder="0.0"
                minLength={1}
                maxLength={79}
                spellCheck="false"
                value={withdrawAmountInput}
              />
            </span>
            <div className="addon-right">
              <div className="token-group">
                <div
                  className="token-max simplelink"
                  onClick={() => setPercentualValue(25)}>
                  25%
                </div>
                <div
                  className="token-max simplelink"
                  onClick={() => setPercentualValue(50)}>
                  50%
                </div>
                <div
                  className="token-max simplelink"
                  onClick={() => setPercentualValue(75)}>
                  75%
                </div>
                <div
                  className="token-max simplelink"
                  onClick={() => setPercentualValue(100)}>
                  100%
                </div>
              </div>
            </div>
          </div>
          <div className="transaction-field-row">
            <span className="field-label-left">
              {props.startUpData && parseFloat(withdrawAmountInput) > props.startUpData.escrowVestedAmount ? (
                <span className="fg-red">
                  Amount is greater than the available funds
                </span>
              ) : (
                <span>&nbsp;</span>
              )}
            </span>
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
        onClick={onAcceptWithdrawal}>
        {isValidInput() ? "Start withdrawal" : "Invalid amount"}
      </Button>
    </Modal>
  );
};
