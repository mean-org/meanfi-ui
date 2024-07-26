import { LoadingOutlined } from '@ant-design/icons';
import type { MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import type { PaymentStreamingAccount, StreamTemplate, TransactionFees } from '@mean-dao/payment-streaming';
import { BN } from '@project-serum/anchor';
import { IconCaretDown } from 'Icons';
import { Button, Checkbox, DatePicker, type DatePickerProps, Dropdown, Modal, Spin, TimePicker, type TimePickerProps } from 'antd';
import type { CheckboxChangeEvent } from 'antd/lib/checkbox';
import type { ItemType, MenuItemType } from 'antd/lib/menu/interface';
import { DATEPICKER_FORMAT, MIN_SOL_BALANCE_REQUIRED } from 'app-constants/common';
import { FormLabelWithIconInfo } from 'components/FormLabelWithIconInfo';
import { Identicon } from 'components/Identicon';
import { InputMean } from 'components/InputMean';
import { TokenDisplay } from 'components/TokenDisplay';
import { AppStateContext } from 'contexts/appstate';
import { useWallet } from 'contexts/wallet';
import dayjs from 'dayjs';
import { isError } from 'middleware/transactions';
import {
  consoleOut,
  getLockPeriodOptionLabel,
  getPaymentIntervalFromSeconds,
  getRateIntervalInSeconds,
  todayAndPriorDatesDisabled,
} from 'middleware/ui';
import { isValidInteger, isValidNumber, makeDecimal, shortenAddress } from 'middleware/utils';
import { PaymentRateTypeOption } from 'models/PaymentRateTypeOption';
import type { UserTokenAccount } from 'models/accounts';
import { PaymentRateType } from 'models/enums';
import type { VestingContractEditOptions } from 'models/vesting';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const timeFormat = 'h:mm a';

export const VestingContractEditModal = (props: {
  accountAddress: string;
  handleClose: () => void;
  isBusy: boolean;
  isMultisigContext: boolean;
  isVisible: boolean;
  loadingMultisigAccounts: boolean;
  nativeBalance: number;
  onTransactionStarted: (options: VestingContractEditOptions) => void;
  selectedMultisig: MultisigInfo | undefined;
  selectedToken: UserTokenAccount | undefined;
  streamTemplate: StreamTemplate | undefined;
  transactionFees: TransactionFees;
  vestingContract: PaymentStreamingAccount | undefined;
}) => {
  const {
    accountAddress,
    handleClose,
    isBusy,
    isMultisigContext,
    isVisible,
    loadingMultisigAccounts,
    nativeBalance,
    onTransactionStarted,
    selectedMultisig,
    selectedToken,
    streamTemplate,
    transactionFees,
    vestingContract,
  } = props;
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const { transactionStatus } = useContext(AppStateContext);
  const percentages = [5, 10, 15, 20];
  const [cliffReleasePercentage, setCliffReleasePercentage] = useState<string>('');
  const [isFeePaidByTreasurer, setIsFeePaidByTreasurer] = useState(false);
  const [contractTime, setContractTime] = useState<string | undefined>(undefined);
  const [defaultTime, setDefaultTime] = useState<dayjs.Dayjs>();
  const [paymentStartDate, setPaymentStartDate] = useState<string>('');
  const [lockPeriodAmount, setLockPeriodAmount] = useState<string>('');
  const [lockPeriodFrequency, setLockPeriodFrequency] = useState<PaymentRateType>(PaymentRateType.PerMonth);
  const [proposalTitle, setProposalTitle] = useState('');

  /////////////////////
  // Data management //
  /////////////////////

  // Set template data
  useEffect(() => {
    if (!(isVisible && vestingContract && streamTemplate)) {
      return;
    }

    const cliffPercent = makeDecimal(new BN(streamTemplate.cliffVestPercent), 4);
    setCliffReleasePercentage(cliffPercent.toString());
    const contractStartDate = new Date(streamTemplate.startUtc);
    const localUsDate = contractStartDate.toLocaleDateString('en-US');
    setPaymentStartDate(localUsDate);
    setLockPeriodAmount(streamTemplate.durationNumberOfUnits.toString());
    const periodFrequency = getPaymentIntervalFromSeconds(streamTemplate.rateIntervalInSeconds);
    setLockPeriodFrequency(periodFrequency);
    const dayJsTime = dayjs(contractStartDate);
    setDefaultTime(dayJsTime);
    const time = dayJsTime.format(timeFormat);
    setContractTime(time);
  }, [isVisible, streamTemplate, vestingContract]);

  const getFeeAmount = useCallback(() => {
    return transactionFees.blockchainFee + transactionFees.mspFlatFee;
  }, [transactionFees.blockchainFee, transactionFees.mspFlatFee]);

  const getMinSolBlanceRequired = useCallback(() => {
    return getFeeAmount() > MIN_SOL_BALANCE_REQUIRED ? getFeeAmount() : MIN_SOL_BALANCE_REQUIRED;
  }, [getFeeAmount]);

  ////////////////////////////////////
  // Events, actions and Validation //
  ////////////////////////////////////

  const onAcceptEditChanges = () => {
    const parsedDate = Date.parse(paymentStartDate);
    const startUtc = new Date(parsedDate);
    const to24hTime = dayjs(contractTime, 'HH:mm');
    startUtc.setHours(to24hTime.hour());
    startUtc.setMinutes(to24hTime.minute());
    startUtc.setSeconds(to24hTime.second());
    consoleOut('start date in UTC:', startUtc, 'darkorange');
    const options: VestingContractEditOptions = {
      proposalTitle,
      feePayedByTreasurer: isFeePaidByTreasurer,
      duration: Number.parseFloat(lockPeriodAmount),
      durationUnit: getRateIntervalInSeconds(lockPeriodFrequency),
      cliffVestPercent: Number.parseFloat(cliffReleasePercentage) || 0,
      startDate: startUtc,
      multisig: isMultisigContext ? accountAddress : '',
    };
    onTransactionStarted(options);
  };

  const handleLockPeriodAmountChange = (value: string) => {
    const newValue = value.trim();

    if (isValidInteger(newValue)) {
      setLockPeriodAmount(newValue);
    } else {
      setLockPeriodAmount('');
    }
  };

  const handleLockPeriodOptionChange = (val: PaymentRateType) => {
    setLockPeriodFrequency(val);
  };

  const getLockPeriodOptionsFromEnum = (): PaymentRateTypeOption[] => {
    let index = 0;
    const options: PaymentRateTypeOption[] = [];
    for (const enumMember in PaymentRateType) {
      const mappedValue = Number.parseInt(enumMember, 10);
      if (!Number.isNaN(mappedValue)) {
        const item = new PaymentRateTypeOption(index, mappedValue, getLockPeriodOptionLabel(mappedValue, t));
        options.push(item);
      }
      index++;
    }
    return options;
  };

  const handleDateChange = (date: string) => {
    setPaymentStartDate(date);
  };

  const handleCliffReleaseAmountChange = (value: string) => {
    let newValue = value.trim();

    const decimals = selectedToken ? selectedToken.decimals : 0;
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
      setCliffReleasePercentage('');
    } else if (newValue === '.') {
      setCliffReleasePercentage('.');
    } else if (isValidNumber(newValue)) {
      setCliffReleasePercentage(newValue);
    }
  };

  const onChangeValuePercentages = (value: number) => {
    setCliffReleasePercentage(`${value}`);
  };

  const onTimePickerChange: TimePickerProps['onChange'] = (_date, dateString) => {
    if (dateString) {
      setContractTime(dateString as string);
    }
  };

  const onDateChange: DatePickerProps['onChange'] = (_date, dateString) => {
    handleDateChange(dateString as string);
  };

  const onFeePayedByTreasurerChange = (e: CheckboxChangeEvent) => {
    consoleOut('onFeePayedByTreasurerChange:', e.target.checked, 'blue');
    setIsFeePaidByTreasurer(e.target.checked);
  };

  const getFormButtonLabel = () => {
    return !publicKey
      ? t('transactions.validation.not-connected')
      : !proposalTitle && isMultisigContext
        ? 'Add a proposal title'
        : !nativeBalance || nativeBalance < getMinSolBlanceRequired()
          ? t('transactions.validation.amount-sol-low')
          : !lockPeriodAmount
            ? 'Set vesting period'
            : !lockPeriodFrequency
              ? 'Set vesting period'
              : 'Update vesting contract';
  };

  const isFormValid = (): boolean => {
    return !!(publicKey &&
      (proposalTitle || !isMultisigContext) &&
      lockPeriodAmount &&
      Number.parseFloat(lockPeriodAmount) > 0 &&
      lockPeriodFrequency);
  };

  ///////////////
  // Rendering //
  ///////////////

  const lockPeriodOptionsMenu = () => {
    const items: ItemType<MenuItemType>[] = getLockPeriodOptionsFromEnum().map((item, index) => {
      return {
        key: `option-${index}`,
        label: (
          <span onKeyDown={() => {}} onClick={() => handleLockPeriodOptionChange(item.value)}>
            {item.text}
          </span>
        ),
      };
    });

    return { items };
  };

  const renderSelectedMultisig = () => {
    return (
      selectedMultisig && (
        <div className={'transaction-list-row w-100 no-pointer'}>
          <div className='icon-cell'>
            <Identicon address={selectedMultisig.id} style={{ width: '30', display: 'inline-flex' }} />
          </div>
          <div className='description-cell'>
            <div className='title text-truncate'>{selectedMultisig.label}</div>
            <div className='subtitle text-truncate'>{shortenAddress(selectedMultisig.id, 8)}</div>
          </div>
          <div className='rate-cell'>
            <div className='rate-amount'>
              {t('multisig.multisig-accounts.pending-transactions', {
                txs: selectedMultisig.pendingTxsAmount,
              })}
            </div>
          </div>
        </div>
      )
    );
  };

  const renderProposalTitleField = () => {
    if (isMultisigContext && selectedMultisig) {
      return (
        <div className='mb-3 mt-3'>
          <div className='form-label text-left'>{t('multisig.proposal-modal.title')}</div>
          <InputMean
            id='proposal-title-field'
            name='Title'
            className='w-100 general-text-input'
            onChange={value => setProposalTitle(value)}
            placeholder='Title for the multisig proposal'
            value={proposalTitle}
          />
        </div>
      );
    }
    return null;
  };

  return (
    <Modal
      className='mean-modal simple-modal'
      title={<div className='modal-title'>Edit Vesting Contract</div>}
      footer={null}
      open={isVisible}
      onCancel={handleClose}
      width={480}
    >
      <Spin spinning={loadingMultisigAccounts}>
        <div className={'scrollable-content'}>
          {/* Proposal title */}
          {renderProposalTitleField()}

          {/* Multisig in context */}
          {isMultisigContext && selectedMultisig && (
            <>
              <div className='form-label'>Multisig account</div>
              <div className='well'>{renderSelectedMultisig()}</div>
            </>
          )}

          {/* Vesting period */}
          <div className='form-label'>Vesting period</div>
          <div className='two-column-layout'>
            <div className='left'>
              <div className='well'>
                <div className='flex-fixed-right'>
                  <div className='left'>
                    <input
                      id='plock-period-field'
                      className='w-100 general-text-input'
                      autoComplete='on'
                      autoCorrect='off'
                      type='text'
                      onChange={e => handleLockPeriodAmountChange(e.target.value)}
                      placeholder={`Number of ${getLockPeriodOptionLabel(lockPeriodFrequency, t)}`}
                      spellCheck='false'
                      min={1}
                      value={lockPeriodAmount}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className='right'>
              <div className='well'>
                <Dropdown menu={lockPeriodOptionsMenu()} trigger={['click']}>
                  <span className='dropdown-trigger no-decoration flex-fixed-right align-items-center'>
                    <div className='left'>
                      <span>{getLockPeriodOptionLabel(lockPeriodFrequency, t)} </span>
                    </div>
                    <div className='right'>
                      <IconCaretDown className='mean-svg-icons' />
                    </div>
                  </span>
                </Dropdown>
              </div>
            </div>
          </div>

          {/* Contract commencement date */}
          <FormLabelWithIconInfo
            label='Contract commencement date'
            tooltipText='This the the contract start date and time and establishes when vesting will begin for all recipients. No additional streams can be created once the vesting contract has started.'
          />
          <div className='two-column-layout'>
            <div className='left'>
              <div className='well'>
                <div className='flex-fixed-right'>
                  <div className='left static-data-field'>{paymentStartDate}</div>
                  <div className='right'>
                    <div className='add-on simplelink'>
                      <>
                        {
                          <DatePicker
                            size='middle'
                            variant='borderless'
                            className='addon-date-picker'
                            aria-required={true}
                            allowClear={false}
                            disabledDate={todayAndPriorDatesDisabled}
                            placeholder='Pick a date'
                            showNow={false}
                            onChange={onDateChange}
                            defaultValue={paymentStartDate ? dayjs(paymentStartDate, DATEPICKER_FORMAT) : undefined}
                            format={DATEPICKER_FORMAT}
                          />
                        }
                      </>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className='right'>
              <div className='well time-picker'>
                <TimePicker
                  defaultValue={defaultTime}
                  variant='borderless'
                  allowClear={false}
                  size='middle'
                  use12Hours
                  format={timeFormat}
                  onChange={onTimePickerChange}
                />
              </div>
            </div>
          </div>

          {/* Cliff release */}
          <FormLabelWithIconInfo
            label='Cliff release (On commencement date)'
            tooltipText='The percentage of allocated funds released to each recipient once the vesting contract starts.'
          />
          <div className='well'>
            <div className='flexible-right mb-1'>
              <div className='token-group'>
                {percentages.map(percentage => (
                  <div key={percentage} className='mb-1 d-flex flex-column align-items-center'>
                    <div
                      className='token-max simplelink active'
                      onKeyDown={() => {}}
                      onClick={() => onChangeValuePercentages(percentage)}
                    >
                      {percentage}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className='flex-fixed-left'>
              <div className='left'>
                <span className='add-on simplelink'>
                  {selectedToken && (
                    <TokenDisplay
                      onClick={() => {}}
                      mintAddress={selectedToken.address}
                      name={selectedToken.name}
                      fullTokenInfo={selectedToken}
                    />
                  )}
                </span>
              </div>
              <div className='right flex-row justify-content-end align-items-center'>
                <input
                  className='general-text-input text-right'
                  inputMode='decimal'
                  autoComplete='off'
                  autoCorrect='off'
                  type='text'
                  onChange={e => handleCliffReleaseAmountChange(e.target.value)}
                  pattern='^[0-9]*[.,]?[0-9]*$'
                  placeholder='0.0'
                  minLength={1}
                  maxLength={79}
                  spellCheck='false'
                  value={cliffReleasePercentage}
                />
                <span className='suffix'>%</span>
              </div>
            </div>
          </div>

          {/* Streaming fees will be paid from the vesting contract's funds */}
          <div className='ml-1 mb-3'>
            <Checkbox checked={isFeePaidByTreasurer} onChange={onFeePayedByTreasurerChange}>
              {t('vesting.create-account.fee-paid-by-treasury')}
            </Checkbox>
          </div>

          {/* CTA */}
          <div className='cta-container'>
            <Button
              type='primary'
              shape='round'
              size='large'
              className='thin-stroke'
              disabled={isBusy || !isFormValid()}
              onClick={onAcceptEditChanges}
            >
              {isBusy && (
                <span className='mr-1'>
                  <LoadingOutlined style={{ fontSize: '16px' }} />
                </span>
              )}
              {isBusy
                ? 'Updating vesting contract'
                : isError(transactionStatus.currentOperation)
                  ? t('general.retry')
                  : getFormButtonLabel()}
            </Button>
          </div>
        </div>
      </Spin>
    </Modal>
  );
};
