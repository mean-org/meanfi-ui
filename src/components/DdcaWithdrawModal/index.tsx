import type { DdcaDetails, TransactionFees } from '@mean-dao/ddca';
import { Button, Col, Modal, Row } from 'antd';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { percentage } from '../../middleware/ui';
import { getAmountWithSymbol, getTokenDecimals, getTokenSymbol, isValidNumber } from '../../middleware/utils';

interface DdcaWithdrawModalProps {
  ddcaDetails: DdcaDetails | undefined;
  handleClose: () => void;
  handleOk: (amount: string) => void;
  isVisible: boolean;
  transactionFees: TransactionFees;
}

export const DdcaWithdrawModal = ({
  ddcaDetails,
  handleClose,
  handleOk,
  isVisible,
  transactionFees,
}: DdcaWithdrawModalProps) => {
  const { t } = useTranslation('common');
  const [withdrawAmountInput, setWithdrawAmountInput] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<number>(0);
  const [feeAmount, setFeeAmount] = useState<number | null>(null);

  useEffect(() => {
    if (ddcaDetails) {
      setMaxAmount(ddcaDetails.toBalance);
    }
  }, [ddcaDetails]);

  useEffect(() => {
    if (!feeAmount && transactionFees) {
      setFeeAmount(getFeeAmount(transactionFees));
    }
  }, [feeAmount, transactionFees]);

  const onAcceptWithdrawal = () => {
    const isMaxAmount = getDisplayAmount(maxAmount) === getDisplayAmount(+withdrawAmountInput);
    setWithdrawAmountInput('');
    handleOk(isMaxAmount ? `${maxAmount}` : withdrawAmountInput);
  };

  const onCloseModal = () => {
    setWithdrawAmountInput('');
    handleClose();
  };

  const setValue = (value: string) => {
    setWithdrawAmountInput(value);
  };

  const setPercentualValue = (value: number) => {
    let newValue = '';
    let fee = 0;
    if (ddcaDetails) {
      if (value === 100) {
        fee = getFeeAmount(transactionFees, `${maxAmount}`);
        newValue = getDisplayAmount(maxAmount);
      } else {
        const partialAmount = percentage(value, maxAmount);
        fee = getFeeAmount(transactionFees, `${partialAmount}`);
        newValue = getDisplayAmount(partialAmount);
      }
    }
    setValue(newValue);
    setFeeAmount(fee);
  };

  const handleWithdrawAmountChange = (value: string) => {
    let newValue = value;

    const decimals = ddcaDetails ? getTokenDecimals(ddcaDetails.toMint as string) : 0;
    const splitted = newValue.toString().split('.');
    const left = splitted[0];

    if (decimals && splitted[1]) {
      if (splitted[1].length > decimals) {
        splitted[1] = splitted[1].slice(0, -1);
        newValue = splitted.join('.');
      }
    } else if (left.length > 1) {
      const number = +splitted[0] - 0;
      splitted[0] = `${number}`;
      newValue = splitted.join('.');
    }

    if (newValue === null || newValue === undefined || newValue === '') {
      setValue('');
    } else if (newValue === '.') {
      setValue('.');
    } else if (isValidNumber(newValue)) {
      setValue(newValue);
      setFeeAmount(getFeeAmount(transactionFees, newValue));
    }
  };

  const getFeeAmount = (fees: TransactionFees, amount?: string): number => {
    let fee = 0;
    const inputAmount = amount ? Number.parseFloat(amount) : 0;
    if (fees) {
      if (fees.percentFee) {
        fee = inputAmount ? percentage(fees.percentFee, inputAmount) : 0;
      } else if (fees.flatFee) {
        fee = fees.flatFee;
      }
    }
    return fee;
  };

  // Validation

  const isValidInput = (): boolean => {
    return !!(
      ddcaDetails &&
      withdrawAmountInput &&
      Number.parseFloat(withdrawAmountInput) <= Number.parseFloat(getDisplayAmount(maxAmount)) &&
      Number.parseFloat(withdrawAmountInput) > (feeAmount as number)
    );
  };

  const getDisplayAmount = (amount: number, addSymbol = false): string => {
    if (ddcaDetails) {
      const bareAmount = amount.toFixed(getTokenDecimals(ddcaDetails.toMint as string));
      if (addSymbol) {
        return bareAmount + ' ' + getTokenSymbol(ddcaDetails.toMint as string);
      }
      return bareAmount;
    }

    return '';
  };

  const infoRow = (caption: string, value: string) => {
    return (
      <Row>
        <Col span={12} className='text-right pr-1'>
          {caption}
        </Col>
        <Col span={12} className='text-left pl-1 fg-secondary-70'>
          {value}
        </Col>
      </Row>
    );
  };

  return (
    <Modal
      className='mean-modal'
      title={<div className='modal-title'>{t('withdraw-funds.modal-title')}</div>}
      footer={null}
      open={isVisible}
      onOk={onAcceptWithdrawal}
      onCancel={onCloseModal}
      width={480}
    >
      <div className='mb-3'>
        <div className='transaction-field disabled'>
          <div className='transaction-field-row'>
            <span className='field-label-left'>{t('withdraw-funds.label-available-amount')}</span>
            <span className='field-label-right'>&nbsp;</span>
          </div>
          <div className='transaction-field-row main-row'>
            <span className='field-select-left'>{ddcaDetails && getDisplayAmount(maxAmount, true)}</span>
          </div>
        </div>

        <div className='transaction-field mb-1'>
          <div className='transaction-field-row'>
            <span className='field-label-left'>{t('withdraw-funds.label-input-amount')}</span>
            <span className='field-label-right'>{t('withdraw-funds.label-input-right')}</span>
          </div>
          <div className='transaction-field-row main-row'>
            <span className='input-left'>
              <input
                className='general-text-input'
                inputMode='decimal'
                autoComplete='off'
                autoCorrect='off'
                type='text'
                onChange={e => handleWithdrawAmountChange(e.target.value)}
                pattern='^[0-9]*[.,]?[0-9]*$'
                placeholder='0.0'
                minLength={1}
                maxLength={79}
                spellCheck='false'
                value={withdrawAmountInput}
              />
            </span>
            <div className='addon-right'>
              <div className='token-group'>
                <div className='token-max simplelink' onKeyDown={() => {}} onClick={() => setPercentualValue(25)}>
                  25%
                </div>
                <div className='token-max simplelink' onKeyDown={() => {}} onClick={() => setPercentualValue(50)}>
                  50%
                </div>
                <div className='token-max simplelink' onKeyDown={() => {}} onClick={() => setPercentualValue(75)}>
                  75%
                </div>
                <div className='token-max simplelink' onKeyDown={() => {}} onClick={() => setPercentualValue(100)}>
                  100%
                </div>
              </div>
            </div>
          </div>
          <div className='transaction-field-row'>
            <span className='field-label-left'>
              {ddcaDetails &&
              Number.parseFloat(withdrawAmountInput) > Number.parseFloat(getDisplayAmount(maxAmount)) ? (
                <span className='fg-red'>{t('transactions.validation.amount-withdraw-high')}</span>
              ) : (
                <span>&nbsp;</span>
              )}
            </span>
            <span className='field-label-right'>&nbsp;</span>
          </div>
        </div>
      </div>

      {/* Info */}
      {ddcaDetails?.toMint ? (
        <div className='p-2 mb-2'>
          {isValidInput() &&
            infoRow(
              t('transactions.transaction-info.transaction-fee') + ':',
              `~${getAmountWithSymbol(feeAmount as number, ddcaDetails.toMint as string)}`,
            )}
          {isValidInput() &&
            infoRow(
              t('transactions.transaction-info.you-receive') + ':',
              `~${getAmountWithSymbol(
                Number.parseFloat(withdrawAmountInput) - (feeAmount as number),
                ddcaDetails.toMint as string,
              )}`,
            )}
        </div>
      ) : null}

      <Button
        className='main-cta'
        block
        type='primary'
        shape='round'
        size='large'
        disabled={!isValidInput()}
        onClick={onAcceptWithdrawal}
      >
        {isValidInput()
          ? t('transactions.validation.valid-start-withdrawal')
          : t('transactions.validation.invalid-amount')}
      </Button>
    </Modal>
  );
};
