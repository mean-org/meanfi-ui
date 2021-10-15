import React, { useCallback, useEffect, useState } from 'react';
import { Button, Modal, Slider } from "antd";
import { useContext } from "react";
import { AppStateContext } from "../../contexts/appstate";
import { useTranslation } from "react-i18next";
import { DcaInterval } from '../../models/ddca-models';
import { percentage } from '../../utils/ui';
import { TokenInfo } from '@solana/spl-token-registry';
import { getTokenAmountAndSymbolByTokenAddress } from '../../utils/utils';
import "./style.less";
import { SliderMarks } from 'antd/lib/slider';
import { IconShield } from '../../Icons';
import { InfoIcon } from '../InfoIcon';

export const DdcaSetupModal = (props: {
  fromToken: TokenInfo | undefined;
  fromTokenBalance: number;
  fromTokenAmount: number;
  toToken: TokenInfo | undefined;
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
}) => {
  const { t } = useTranslation("common");
  const { ddcaOption, setDdcaOption } = useContext(AppStateContext);
  const [rangeMin, setRangeMin] = useState(0);
  const [rangeMax, setRangeMax] = useState(0);
  const [recurrencePeriod, setRecurrencePeriod] = useState(0);
  const [minimumRequiredBalance, setMinimumRequiredBalance] = useState(0);
  const [marks, setMarks] = useState<SliderMarks>();
  const [isOperationValid, setIsOperationValid] = useState(false);

  const onAcceptModal = () => {
    props.handleOk();
  }

  const getRecurrencePeriod = (): string => {
    let strOut = '';
    switch (ddcaOption?.dcaInterval) {
      case DcaInterval.RepeatingDaily:
        strOut = t('ddca-selector.repeating-daily.recurrence-period');
        break;
      case DcaInterval.RepeatingWeekly:
        strOut = t('ddca-selector.repeating-weekly.recurrence-period');
        break;
      case DcaInterval.RepeatingTwiceMonth:
        strOut = t('ddca-selector.repeating-twice-month.recurrence-period');
        break;
      case DcaInterval.RepeatingOnceMonth:
        strOut = t('ddca-selector.repeating-once-month.recurrence-period');
        break;
      default:
        break;
    }
    return strOut;
  }

  const getTotalPeriod = useCallback((periodValue: number): string => {
    let strOut = '';
    switch (ddcaOption?.dcaInterval) {
      case DcaInterval.RepeatingDaily:
        strOut = `${periodValue} ${t('general.days')}`;
        break;
      case DcaInterval.RepeatingWeekly:
        strOut = `${periodValue} ${t('general.weeks')}`;
        break;
      case DcaInterval.RepeatingTwiceMonth:
        strOut = `${periodValue * 2} ${t('general.weeks')}`;
        break;
      case DcaInterval.RepeatingOnceMonth:
        strOut = `${periodValue} ${t('general.months')}`;
        break;
      default:
        break;
    }
    return strOut;
  }, [
    t,
    ddcaOption?.dcaInterval
  ])

  const getModalHeadline = () => {
    // Buy 100 USDC worth of SOL every week ,for 6 weeks, starting today.
    // Buy {{fromTokenAmount}} worth of {{toTokenSymbol}} {{recurrencePeriod}} for {{totalPeriod}}, starting today.
    return `<span>${t('ddca-setup-modal.headline', {
      fromTokenAmount: getTokenAmountAndSymbolByTokenAddress(props.fromTokenAmount, props.fromToken?.address as string),
      toTokenSymbol: props.toToken?.symbol,
      recurrencePeriod: getRecurrencePeriod(),
      totalPeriod: getTotalPeriod(recurrencePeriod)
    })}</span>`;
  }

  const onSliderChange = (value?: number) => {
    setRecurrencePeriod(value || 0);
  }

  function sliderTooltipFormatter(value?: number) {
    return (
      <>
      <svg className="tooltip-svg" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9.99999 3.57843C9.58578 3.57843 9.24999 3.24264 9.24999 2.82843C9.24999 2.41422 9.58578 2.07843 9.99999 2.07843H13.5355C13.9497 2.07843 14.2855 2.41422 14.2855 2.82843C14.2855 3.24264 13.9497 3.57843 13.5355 3.57843H9.99999Z" fill="currentColor"/>
        <path d="M6.53033 4.03033C6.82322 4.32323 6.82322 4.7981 6.53033 5.09099L4.03033 7.59099C3.73744 7.88389 3.26256 7.88389 2.96967 7.59099C2.67678 7.2981 2.67678 6.82323 2.96967 6.53033L5.46967 4.03033C5.76256 3.73744 6.23744 3.73744 6.53033 4.03033Z" fill="currentColor"/>
        <path fillRule="evenodd" clipRule="evenodd" d="M12 5.06066C7.30558 5.06066 3.5 8.86624 3.5 13.5607C3.5 18.2551 7.30558 22.0607 12 22.0607C16.6944 22.0607 20.5 18.2551 20.5 13.5607C20.5 8.86624 16.6944 5.06066 12 5.06066ZM16.9909 8.77144C17.1457 8.5724 17.128 8.28922 16.9497 8.11092C16.7714 7.93261 16.4883 7.91498 16.2892 8.06979L13.1153 10.5384L11.0397 12.021C10.6629 12.2901 10.4393 12.7246 10.4393 13.1876C10.4393 13.9794 11.0812 14.6213 11.873 14.6213C12.3361 14.6213 12.7706 14.3977 13.0397 14.0209L14.5223 11.9454L16.9909 8.77144Z" fill="currentColor"/>
      </svg>
      <span className="fg-primary-highlight font-bold">{getTotalPeriod(value || 0)}</span>
      </>
    );
  }

  // const isOperationValid = (): boolean => {
  //   return fromTokenBalance >= minimumRequiredBalance;
  // }

  /**
   * Set values for rangeMin, rangeMax and recurrencePeriod
   * 
   * var maxRangeFromSelection = daily->365 | weekly->52 | by-weekly -> 26 | monthly -> 12
   * var maxRangeFromBalance = fromTokenBalance/fromInputAmount;
   * var minRangeSelectable = 3 weeks;
   * var maxRangeSelectable = maxRangeFromBalance <= maxRangeFromSelection
   *     ? max(minRangeSelectable + 10, maxRangeFromBalance)
   *     : maxRangeFromSelection;
   * MAX = "[maxRangeSelectable] [range]"
   * Set minimum required and valid flag
  */
  useEffect(() => {
    if (ddcaOption && props.fromTokenAmount && props.fromTokenBalance) {
      const maxRangeFromSelection =
        ddcaOption.dcaInterval === DcaInterval.RepeatingDaily
          ? 365
          : ddcaOption.dcaInterval === DcaInterval.RepeatingWeekly
          ? 52
          : ddcaOption.dcaInterval === DcaInterval.RepeatingTwiceMonth
          ? 26
          : 12;
      const maxRangeFromBalance = (props.fromTokenBalance / props.fromTokenAmount);
      const minRangeSelectable = 3;
      const maxRangeSelectable =
        maxRangeFromBalance <= maxRangeFromSelection
          ? Math.max(minRangeSelectable + 10, maxRangeFromBalance)
          : maxRangeFromSelection;
      // Set state
      setRangeMin(minRangeSelectable);
      setRangeMax(maxRangeSelectable);
      const initialValue = Math.floor(percentage(50, maxRangeSelectable));
      const marks: SliderMarks = {
        [minRangeSelectable]: getTotalPeriod(minRangeSelectable),
        [maxRangeSelectable]: getTotalPeriod(maxRangeSelectable)
      };
      setMarks(marks);

      // Set minimum required and valid flag
      const minimumRequired = props.fromTokenAmount * rangeMin;
      const isOpValid = minimumRequired < props.fromTokenBalance ? true : false;
      setMinimumRequiredBalance(minimumRequired);
      setIsOperationValid(isOpValid);

      // Set the slider position
      if (isOpValid) {
        setRecurrencePeriod(initialValue);
      } else {
        setRecurrencePeriod(minRangeSelectable);
      }

    }
  }, [
    ddcaOption,
    rangeMin,
    props.fromTokenAmount,
    props.fromTokenBalance,
    getTotalPeriod
  ]);

  /**
   * si el balance es menos que el needed for the min time of 3 weeks
   * the CTA disabled reading "Not enough balance" (min needed > balance)
   * a red validation label reading: "You need a min of 0.62125859 SOL to start this repeating buy"
   * 
   * Important Notes
   * Only you can withdraw funds from your DCA Vault
   * Fees for the scheduled swaps are charged upfront
   * All unused fees are returned to you upon withdrawal
  */

  // Info items will draw inside the popover
  const importantNotesPopoverContent = () => {
    return (
      <>
        <div className="font-bold">{t('ddca-setup-modal.notes.notes-title')}</div>
        <ol className="greek small">
          <li>{t('ddca-setup-modal.notes.note-item-01')}</li>
          <li>{t('ddca-setup-modal.notes.note-item-02')}</li>
          <li>{t('ddca-setup-modal.notes.note-item-03')}</li>
        </ol>
      </>
    );
  }

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{t('ddca-setup-modal.modal-title')}</div>}
      footer={null}
      visible={props.isVisible}
      onOk={props.handleOk}
      onCancel={props.handleClose}
      width={480}>
      <div className="mb-3">
        <div className="ddca-setup-heading" dangerouslySetInnerHTML={{ __html: getModalHeadline() }}></div>
      </div>
      <div className="slider-container">
        <Slider
          marks={marks}
          min={rangeMin}
          max={rangeMax}
          included={false}
          tipFormatter={sliderTooltipFormatter}
          value={recurrencePeriod}
          onChange={onSliderChange}
          tooltipVisible
          dots={false}/>
      </div>
      <div className="mb-3">
        <div className="font-bold">{t('ddca-setup-modal.help.how-does-it-work')}</div>
        <ol className="greek">
          <li>
            {
              t('ddca-setup-modal.help.help-item-01', {
                fromTokenAmount: getTokenAmountAndSymbolByTokenAddress(
                  props.fromTokenAmount * recurrencePeriod,
                  props.fromToken?.address as string)
              })
            }
          </li>
          <li>
            {
              t('ddca-setup-modal.help.help-item-02', {
                recurrencePeriod: getRecurrencePeriod(),
              })
            }
          </li>
          <li>
            {
              t('ddca-setup-modal.help.help-item-03', {
                toTokenSymbol: props.toToken?.symbol,
              })
            }
          </li>
        </ol>
      </div>
      <div className="mb-2 text-center">
        <span className="yellow-pill">
          <InfoIcon trigger="click" content={importantNotesPopoverContent()} placement="top">
            <IconShield className="mean-svg-icons"/>
          </InfoIcon>
          <span>{t('ddca-setup-modal.notes.note-item-01')}</span>
        </span>
      </div>
      {!isOperationValid && (
        <div className="mb-2 text-center">
          <span className="fg-error">
            {
              t('transactions.validation.minimum-repeating-buy-amount', {
                fromTokenAmount: getTokenAmountAndSymbolByTokenAddress(
                  minimumRequiredBalance,
                  props.fromToken?.address as string
                )
              })
            }
          </span>
        </div>
      )}
      <Button
        className="main-cta"
        block
        type="primary"
        shape="round"
        size="large"
        // disabled={!isOperationValid}
        disabled={true}
        onClick={onAcceptModal}>
          {isOperationValid
            // ? t('ddca-setup-modal.cta-label')
            ? 'Repeating buy temporarily unavailable'
            : t('transactions.validation.amount-low')}
      </Button>
    </Modal>
  );
};
