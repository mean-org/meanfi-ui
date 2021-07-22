import { useEffect, useState } from "react";
import { Modal, Button } from "antd";
import {
  getTokenDecimals,
  getTokenSymbol,
  isValidNumber,
  truncateFloat
} from "../../utils/utils";
import { percentage } from "../../utils/ui";
import { StreamInfo } from "../../money-streaming/types";

export const WithdrawModal = (props: {
  startUpData: StreamInfo | undefined;
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
}) => {
  const [withdrawAmountInput, setWithdrawAmountInput] = useState<string>("");
  const [maxAmount, setMaxAmount] = useState<number>(0);

  useEffect(() => {
    if (props.startUpData) {
      setMaxAmount(props.startUpData.escrowVestedAmount);
    }
  }, [props]);

  const onAcceptWithdrawal = () => {
    const isMaxAmount = getDisplayAmount(maxAmount) === getDisplayAmount(withdrawAmountInput)
      ? true : false;
    props.handleOk(isMaxAmount ? maxAmount : withdrawAmountInput);
  };

  const onCloseModal = () => {
    props.handleClose();
  }

  const setValue = (value: string) => {
    setWithdrawAmountInput(value);
  };

  const setPercentualValue = (value: number) => {
    if (props.startUpData) {
      if (value === 100) {
        setValue(getDisplayAmount(maxAmount));
      } else {
        const partialAmount = percentage(value, maxAmount);
        setValue(getDisplayAmount(partialAmount));
      }
    } else {
      setValue("");
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

  const isValidInput = () => {
    return props.startUpData && withdrawAmountInput &&
      parseFloat(withdrawAmountInput) &&
      parseFloat(withdrawAmountInput) <= parseFloat(getDisplayAmount(maxAmount))
      ? true
      : false;
  };

  const getDisplayAmount = (amount: any, addSymbol = false): string => {
    if (props && props.startUpData) {
      const bareAmount = truncateFloat(amount, getTokenDecimals(props.startUpData.associatedToken as string));
      if (addSymbol) {
        return bareAmount + ' ' + getTokenSymbol(props.startUpData.associatedToken as string);
      }
      return bareAmount;
    }

    return '';
  }

  return (
    <Modal
      className="mean-modal"
      title={<div className="modal-title">Withdraw funds</div>}
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptWithdrawal}
      onCancel={onCloseModal}
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
              {props.startUpData && getDisplayAmount(maxAmount, true)}
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
              {props.startUpData && parseFloat(withdrawAmountInput) > maxAmount ? (
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
