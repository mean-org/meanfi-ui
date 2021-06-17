import { useContext, useState } from 'react';
import { Modal, Button } from 'antd';
import { AppStateContext } from '../../contexts/appstate';
import { getTokenAmountAndSymbolByTokenAddress, isValidNumber } from '../../utils/utils';
import { percentage } from '../../utils/ui';

export const AddFundsModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
}) => {
  const { streamDetail } = useContext(AppStateContext);
  const [withdrawAmountRaw, setWithdrawAmountRaw] = useState<string>('');
  const [withdrawAmountFormatted, setWithdrawAmountFormatted] = useState<string>('');

  const onAcceptWithdrawal = () => {
    props.handleOk(withdrawAmountRaw);
  }

  const setValue = (value: string) => {
    setWithdrawAmountRaw(value);
    setWithdrawAmountFormatted(value);
  }

  const handleWithdrawAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setValue("");
    } else if (isValidNumber(newValue)) {
      setValue(newValue);
    }
  };

  const getAmountWithSymbol = (amount: any, address: string, onlyValue = false) => {
    return getTokenAmountAndSymbolByTokenAddress(amount, address, onlyValue);
  }

  const isValidInput = () => {
    return withdrawAmountRaw &&
           parseFloat(withdrawAmountRaw) &&
           parseFloat(withdrawAmountRaw) <= parseFloat(getAmountWithSymbol(streamDetail?.escrowVestedAmount, streamDetail?.associatedToken as string, true))
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
      afterClose={() => setValue('')}
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
                value={withdrawAmountFormatted}
              />
            </span>
            <div className="addon-right">
              <div className="token-group">
                <div className="token-max simplelink" onClick={() => {
                    if (streamDetail) {
                      setWithdrawAmountRaw(`${streamDetail.escrowVestedAmount}`);
                      setWithdrawAmountFormatted(getAmountWithSymbol(streamDetail.escrowVestedAmount, streamDetail.associatedToken as string, true));
                    } else {
                      setValue('0');
                    }
                  }}>
                  MAX
                </div>
              </div>
            </div>
          </div>
          <div className="transaction-field-row">
            <span className="field-label-left">{
              streamDetail && parseFloat(withdrawAmountFormatted) > parseFloat(getAmountWithSymbol(streamDetail.escrowVestedAmount, streamDetail?.associatedToken as string, true))
                ? (<span className="fg-red">Amount is greater than the available funds</span>)
                : (<span>&nbsp;</span>)
            }</span>
            <span className="field-label-right">&nbsp;</span>
          </div>
        </div>

        {/* Send amount */}
        {/* <div className="transaction-field mb-1">
          <div className="transaction-field-row">
            <span className="field-label-left" style={{marginBottom: '-6px'}}>
              Send ~${fromCoinAmount && effectiveRate
                ? formatAmount(parseFloat(fromCoinAmount) * effectiveRate, 2)
                : "0.00"}
              <IconSort className="mean-svg-icons usd-switcher fg-red" />
              <span className="fg-red">USD</span>
            </span>
            <span className="field-label-right">
              <span>Balance:</span>
              <span className="balance-amount">
                {`${selectedToken && tokenBalance
                    ? formatAmount(tokenBalance as number, selectedToken.symbol === 'SOL' ? selectedToken.decimals : 2)
                    : "Unknown"
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
                className="general-text-input"
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
            </span>
            {selectedToken && (
              <div className="addon-right">
                <div className="token-group">
                  {selectedToken && (
                    <div
                      className="token-max simplelink"
                      onClick={() =>
                        setFromCoinAmount(
                          formatAmount(
                            tokenBalance as number,
                            selectedToken.decimals
                          )
                        )
                      }>
                      MAX
                    </div>
                  )}
                  <div className="token-selector simplelink" onClick={() => {
                      setSubjectTokenSelection('payer');
                      showTokenSelector();
                    }}>
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
            <span className="field-caret-down">
              <IconCaretDown className="mean-svg-icons" />
            </span>
          </div>
        </div> */}

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
