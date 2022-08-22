import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Button, Checkbox, DatePicker, Dropdown, Menu, Modal, Spin, TimePicker } from "antd";
import { UserTokenAccount } from '../../../../models/transactions';
import { StreamTemplate, TransactionFees, Treasury } from '@mean-dao/msp';
import { MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import { useTranslation } from 'react-i18next';
import { useWallet } from '../../../../contexts/wallet';
import { AppStateContext } from '../../../../contexts/appstate';
import { addDays, isValidInteger, isValidNumber, makeDecimal, shortenAddress } from '../../../../utils/utils';
import { Identicon } from '../../../../components/Identicon';
import { TokenDisplay } from '../../../../components/TokenDisplay';
import { CUSTOM_TOKEN_NAME, DATEPICKER_FORMAT, MIN_SOL_BALANCE_REQUIRED } from '../../../../constants';
import { FormLabelWithIconInfo } from '../../../../components/FormLabelWithIconInfo';
import { consoleOut, getLockPeriodOptionLabel, getPaymentIntervalFromSeconds, getRateIntervalInSeconds, PaymentRateTypeOption } from '../../../../utils/ui';
import { PaymentRateType } from '../../../../models/enums';
import { IconCaretDown } from '../../../../Icons';
import moment from 'moment';
import { LoadingOutlined } from '@ant-design/icons';
import { isError } from '../../../../utils/transactions';
import { VestingContractEditOptions } from '../../../../models/vesting';
import BN from 'bn.js';

const timeFormat="hh:mm A"

export const VestingContractEditModal = (props: {
  accountAddress: string;
  handleClose: any;
  isBusy: boolean;
  isMultisigContext: boolean;
  isVisible: boolean;
  loadingMultisigAccounts: boolean;
  nativeBalance: number;
  onTransactionStarted: any;
  selectedMultisig: MultisigInfo | undefined;
  selectedToken: UserTokenAccount | undefined;
  streamTemplate: StreamTemplate | undefined;
  transactionFees: TransactionFees;
  vestingContract: Treasury | undefined;
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
  const {
      transactionStatus,
  } = useContext(AppStateContext);
  const percentages = [5, 10, 15, 20];
  const [cliffReleasePercentage, setCliffReleasePercentage] = useState<string>("");
  const [isFeePaidByTreasurer, setIsFeePaidByTreasurer] = useState(false);
  const [contractTime, setContractTime] = useState<string | undefined>(undefined);
  const [defaultTime, setDefaultTime] = useState<moment.Moment>();
  const [paymentStartDate, setPaymentStartDate] = useState<string>("");
  const [lockPeriodAmount, setLockPeriodAmount] = useState<string>("");
  const [lockPeriodFrequency, setLockPeriodFrequency] = useState<PaymentRateType>(PaymentRateType.PerMonth);

  /////////////////////
  // Data management //
  /////////////////////

  // Set template data
  useEffect(() => {
    if (isVisible && vestingContract && streamTemplate) {
      const cliffPercent = makeDecimal(new BN(streamTemplate.cliffVestPercent), 4);
      setCliffReleasePercentage(cliffPercent.toString());
      const contractStartDate = new Date(streamTemplate.startUtc as string);
      const localUsDate = contractStartDate.toLocaleDateString("en-US");
      setPaymentStartDate(localUsDate);
      setLockPeriodAmount(streamTemplate.durationNumberOfUnits.toString());
      const periodFrequency = getPaymentIntervalFromSeconds(streamTemplate.rateIntervalInSeconds);
      setLockPeriodFrequency(periodFrequency);
      const momentTime = moment(contractStartDate);
      setDefaultTime(momentTime);
      const time = momentTime.format(timeFormat);
      setContractTime(time);
    }
  }, [isVisible, streamTemplate, vestingContract]);

  const getFeeAmount = useCallback(() => {
    return transactionFees.blockchainFee + transactionFees.mspFlatFee;
  }, [transactionFees.blockchainFee, transactionFees.mspFlatFee]);

  const getMinSolBlanceRequired = useCallback(() => {
    return getFeeAmount() > MIN_SOL_BALANCE_REQUIRED
      ? getFeeAmount()
      : MIN_SOL_BALANCE_REQUIRED;
  }, [getFeeAmount]);


  ////////////////////////////////////
  // Events, actions and Validation //
  ////////////////////////////////////

  // TODO: Modify payload as needed
  const onAcceptEditChanges = () => {
    const parsedDate = Date.parse(paymentStartDate as string);
    const startUtc = new Date(parsedDate);
    const shortTime = moment(contractTime, timeFormat).format("HH:mm");
    const to24hTime = moment(shortTime, "HH:mm");
    startUtc.setHours(to24hTime.hours());
    startUtc.setMinutes(to24hTime.minutes());
    startUtc.setSeconds(to24hTime.seconds());
    consoleOut('start date in UTC:', startUtc, 'darkorange');
    const options: VestingContractEditOptions = {
      feePayedByTreasurer: isFeePaidByTreasurer,
      duration: parseFloat(lockPeriodAmount),
      durationUnit: getRateIntervalInSeconds(lockPeriodFrequency),
      cliffVestPercent: parseFloat(cliffReleasePercentage) || 0,
      startDate: startUtc,
      multisig: isMultisigContext ? accountAddress : ''
    };
    onTransactionStarted(options);
  }

  const handleLockPeriodAmountChange = (e: any) => {

    const newValue = e.target.value;

    if (isValidInteger(newValue)) {
      setLockPeriodAmount(newValue);
    } else {
      setLockPeriodAmount("");
    }

  }

  const handleLockPeriodOptionChange = (val: PaymentRateType) => {
    setLockPeriodFrequency(val);
  }

  const getLockPeriodOptionsFromEnum = (value: any): PaymentRateTypeOption[] => {
    let index = 0;
    const options: PaymentRateTypeOption[] = [];
    for (const enumMember in value) {
      const mappedValue = parseInt(enumMember, 10);
      if (!isNaN(mappedValue)) {
        const item = new PaymentRateTypeOption(
          index,
          mappedValue,
          getLockPeriodOptionLabel(mappedValue, t)
        );
        options.push(item);
      }
      index++;
    }
    return options;
  }

  const handleDateChange = (date: string) => {
    setPaymentStartDate(date);
  }

  const handleCliffReleaseAmountChange = (e: any) => {

    let newValue = e.target.value;

    const decimals = selectedToken ? selectedToken.decimals : 0;
    const splitted = newValue.toString().split('.');
    const left = splitted[0];

    if (decimals && splitted[1]) {
      if (splitted[1].length > decimals) {
        splitted[1] = splitted[1].slice(0, -1);
        newValue = splitted.join('.');
      }
    } else if (left.length > 1) {
      const number = splitted[0] - 0;
      splitted[0] = `${number}`;
      newValue = splitted.join('.');
    }

    if (newValue === null || newValue === undefined || newValue === "") {
      setCliffReleasePercentage("");
    } else if (newValue === '.') {
      setCliffReleasePercentage(".");
    } else if (isValidNumber(newValue)) {
      setCliffReleasePercentage(newValue);
    }
  };

  const todayAndPriorDatesDisabled = (current: any) => {
    // Can not select neither today nor days before today
    return current && current < moment().add(1, 'days').endOf('day');
  }

  const onResetDate = () => {
    const date = addDays(new Date(), 1).toLocaleDateString("en-US");
    setPaymentStartDate(date);
  }

  const onChangeValuePercentages = (value: number) => {
    setCliffReleasePercentage(`${value}`);
  };

  const onTimePickerChange = (time: moment.Moment | null, timeString: string) => {
    if (time) {
      const shortTime = time.format(timeFormat);
      setContractTime(shortTime);
    }
  };

  const onFeePayedByTreasurerChange = (e: any) => {
    consoleOut('onFeePayedByTreasurerChange:', e.target.checked, 'blue');
    setIsFeePaidByTreasurer(e.target.checked);
  }

  const getFormButtonLabel = () => {
    return !publicKey
      ? t('transactions.validation.not-connected')
      : !nativeBalance || nativeBalance < getMinSolBlanceRequired()
        ? t('transactions.validation.amount-sol-low')
        : !lockPeriodAmount
          ? 'Set vesting period'
          : !lockPeriodFrequency
            ? 'Set vesting period'
            : t('vesting.create-account.create-cta');
  }

  const isFormValid = (): boolean => {
    return  publicKey &&
            lockPeriodAmount &&
            parseFloat(lockPeriodAmount) > 0 &&
            lockPeriodFrequency
      ? true
      : false;
  };

  ///////////////
  // Rendering //
  ///////////////

  const lockPeriodOptionsMenu = (
    <Menu>
      {getLockPeriodOptionsFromEnum(PaymentRateType).map((item) => {
        return (
          <Menu.Item
            key={item.key}
            onClick={() => handleLockPeriodOptionChange(item.value)}>
            {item.text}
          </Menu.Item>
        );
      })}
    </Menu>
  );

  const renderDatePickerExtraPanel = () => {
    return (
      <span className="flat-button tiny stroked primary" onClick={onResetDate}>
        <span className="mx-1">Reset</span>
      </span>
    );
  }

  const renderSelectedMultisig = () => {
    return (
      selectedMultisig && (
        <div className={`transaction-list-row w-100 no-pointer`}>
          <div className="icon-cell">
            <Identicon address={selectedMultisig.id} style={{ width: "30", display: "inline-flex" }} />
          </div>
          <div className="description-cell">
            <div className="title text-truncate">{selectedMultisig.label}</div>
            <div className="subtitle text-truncate">{shortenAddress(selectedMultisig.id, 8)}</div>
          </div>
          <div className="rate-cell">
            <div className="rate-amount">
              {
                t('multisig.multisig-accounts.pending-transactions', {
                  txs: selectedMultisig.pendingTxsAmount
                })
              }
            </div>
          </div>
        </div>
      )
    )
  }

  return (
    <Modal
      className="mean-modal simple-modal unpadded-content"
      title={<div className="modal-title">Create Vesting Contract</div>}
      footer={null}
      visible={isVisible}
      onCancel={handleClose}
      width={480}>

      <Spin spinning={loadingMultisigAccounts}>
        <div className={`scrollable-content pl-5 pr-4 py-2`}>

          {/* Multisig in context */}
          {isMultisigContext && selectedMultisig && (
            <>
              <div className="form-label">Multisig account</div>
              <div className="well">
                {renderSelectedMultisig()}
              </div>
            </>
          )}

          {/* Vesting period */}
          <div className="form-label">Vesting period</div>
          <div className="two-column-layout">
            <div className="left">
              <div className="well">
                <div className="flex-fixed-right">
                  <div className="left">
                    <input
                      id="plock-period-field"
                      className="w-100 general-text-input"
                      autoComplete="on"
                      autoCorrect="off"
                      type="text"
                      onChange={handleLockPeriodAmountChange}
                      placeholder={`Number of ${getLockPeriodOptionLabel(lockPeriodFrequency, t)}`}
                      spellCheck="false"
                      min={1}
                      value={lockPeriodAmount}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="right">
              <div className="well">
                <Dropdown
                  overlay={lockPeriodOptionsMenu}
                  trigger={["click"]}>
                  <span className="dropdown-trigger no-decoration flex-fixed-right align-items-center">
                    <div className="left">
                      <span>{getLockPeriodOptionLabel(lockPeriodFrequency, t)}{" "}</span>
                    </div>
                    <div className="right">
                      <IconCaretDown className="mean-svg-icons" />
                    </div>
                  </span>
                </Dropdown>
              </div>
            </div>
          </div>

          {/* Contract commencement date */}
          <FormLabelWithIconInfo
            label="Contract commencement date"
            tooltipText="This the the contract start date and time and establishes when vesting will begin for all recipients. No additional streams can be created once the vesting contract has started."
          />
          <div className="two-column-layout">
            <div className="left">
              <div className="well">
                <div className="flex-fixed-right">
                  <div className="left static-data-field">{paymentStartDate}</div>
                  <div className="right">
                    <div className="add-on simplelink">
                      <>
                        {
                          <DatePicker
                            size="middle"
                            bordered={false}
                            className="addon-date-picker"
                            aria-required={true}
                            allowClear={false}
                            disabledDate={todayAndPriorDatesDisabled}
                            placeholder="Pick a date"
                            onChange={(value: any, date: string) => handleDateChange(date)}
                            value={moment(
                              paymentStartDate,
                              DATEPICKER_FORMAT
                            ) as any}
                            format={DATEPICKER_FORMAT}
                            showNow={false}
                            showToday={false}
                            renderExtraFooter={renderDatePickerExtraPanel}
                          />
                        }
                      </>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="right">
              <div className="well time-picker">
                <TimePicker
                  defaultValue={moment()}
                  bordered={false}
                  allowClear={false}
                  size="middle"
                  use12Hours
                  format={timeFormat}
                  value={defaultTime}
                  onChange={onTimePickerChange} />
              </div>
            </div>
          </div>

          {/* Cliff release */}
          <FormLabelWithIconInfo
            label="Cliff release (On commencement date)"
            tooltipText="The percentage of allocated funds released to each recipient once the vesting contract starts."
          />
          <div className="well">
            <div className="flexible-right mb-1">
              <div className="token-group">
                {percentages.map((percentage, index) => (
                  <div key={index} className="mb-1 d-flex flex-column align-items-center">
                    <div className="token-max simplelink active" onClick={() => onChangeValuePercentages(percentage)}>{percentage}%</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-fixed-left">
              <div className="left">
                <span className="add-on simplelink">
                  {selectedToken && (
                    <TokenDisplay onClick={() => { }}
                      mintAddress={selectedToken.address}
                      name={selectedToken.name}
                      fullTokenInfo={selectedToken}
                    />
                  )}
                </span>
              </div>
              <div className="right flex-row justify-content-end align-items-center">
                <input
                  className="general-text-input text-right"
                  inputMode="decimal"
                  autoComplete="off"
                  autoCorrect="off"
                  type="text"
                  onChange={handleCliffReleaseAmountChange}
                  pattern="^[0-9]*[.,]?[0-9]*$"
                  placeholder="0.0"
                  minLength={1}
                  maxLength={79}
                  spellCheck="false"
                  value={cliffReleasePercentage}
                />
                <span className="suffix">%</span>
              </div>
            </div>
          </div>

          {/* Streaming fees will be paid from the vesting contract's funds */}
          <div className="ml-1 mb-3">
            <Checkbox checked={isFeePaidByTreasurer} onChange={onFeePayedByTreasurerChange}>{t('vesting.create-account.fee-paid-by-treasury')}</Checkbox>
          </div>

          {/* CTA */}
          <div className="cta-container">
            <Button
              type="primary"
              shape="round"
              size="large"
              className="thin-stroke"
              disabled={isBusy || !isFormValid()}
              onClick={onAcceptEditChanges}>
              {isBusy && (
                <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
              )}
              {isBusy
                ? t('vesting.create-account.create-cta-busy')
                : isError(transactionStatus.currentOperation)
                  ? t('general.retry')
                  : getFormButtonLabel()
              }
            </Button>
          </div>

        </div>
      </Spin>

    </Modal>
  );
};
