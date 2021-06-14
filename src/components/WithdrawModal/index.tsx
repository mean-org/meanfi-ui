import { useContext, useState } from 'react';
import { Modal, Button } from 'antd';
import { AppStateContext } from '../../contexts/appstate';
import { getTokenAmountAndSymbolByTokenAddress, isValidNumber } from '../../utils/utils';
import { percentage } from '../../utils/ui';

export const WithdrawModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
}) => {
  const { streamDetail } = useContext(AppStateContext);
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');

  const onAcceptWithdrawal = () => {
    props.handleOk(withdrawAmount);
  }

  const handleWithdrawAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setWithdrawAmount("");
    } else if (isValidNumber(newValue)) {
      setWithdrawAmount(newValue);
    }
  };

  const getAmountWithSymbol = (amount: any, address: string, onlyValue = false) => {
    return getTokenAmountAndSymbolByTokenAddress(amount, address, onlyValue);
  }

  const isValidInput = () => {
    return withdrawAmount &&
           parseFloat(withdrawAmount) &&
           parseFloat(withdrawAmount) <= parseFloat(getAmountWithSymbol(streamDetail?.escrowVestedAmount, streamDetail?.associatedToken as string, true))
      ? true
      : false;
  }

  return (
    <Modal
      className="mean-modal"
      title={<div className="modal-title">Withdraw funds</div>}
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptWithdrawal}
      onCancel={props.handleClose}
      width={480}>
      <div className="mb-3">
        <div className="transaction-field disabled">
          <div className="transaction-field-row">
            <span className="field-label-left">Funds available to withdraw now</span>
            <span className="field-label-right">&nbsp;</span>
          </div>
          <div className="transaction-field-row main-row">
            <span className="field-select-left">
            {streamDetail
              ? getAmountWithSymbol(streamDetail.escrowVestedAmount, streamDetail.associatedToken as string)
              : '--'}
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
                value={withdrawAmount}
              />
            </span>
            <div className="addon-right">
              <div className="token-group">
                <div className="token-max simplelink" onClick={() =>
                    setWithdrawAmount(streamDetail
                      ? getAmountWithSymbol(percentage(25, streamDetail.escrowVestedAmount as number), streamDetail.associatedToken as string, true)
                      : '0'
                    )
                  }>
                  25%
                </div>
                <div className="token-max simplelink" onClick={() =>
                    setWithdrawAmount(streamDetail
                      ? getAmountWithSymbol(percentage(50, streamDetail.escrowVestedAmount as number), streamDetail.associatedToken as string, true)
                      : '0'
                    )
                  }>
                  50%
                </div>
                <div className="token-max simplelink" onClick={() =>
                    setWithdrawAmount(streamDetail
                      ? getAmountWithSymbol(percentage(75, streamDetail.escrowVestedAmount as number), streamDetail.associatedToken as string, true)
                      : '0'
                    )
                  }>
                  75%
                </div>
                <div className="token-max simplelink" onClick={() =>
                    setWithdrawAmount(streamDetail
                      ? getAmountWithSymbol(streamDetail.escrowVestedAmount, streamDetail.associatedToken as string, true)
                      : '0'
                    )
                  }>
                  100%
                </div>
              </div>
            </div>
          </div>
          <div className="transaction-field-row">
            <span className="field-label-left">{
              streamDetail && parseFloat(withdrawAmount) > parseFloat(getAmountWithSymbol(streamDetail.escrowVestedAmount, streamDetail?.associatedToken as string, true))
                ? (<span className="fg-red">Amount is greater than the available funds</span>)
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
        onClick={onAcceptWithdrawal}>
        {isValidInput() ? 'Start withdrawal' : 'Invalid amount'}
      </Button>
    </Modal>
  );
};
