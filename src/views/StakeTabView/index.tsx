import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import './style.less';
import { ArrowDownOutlined, CheckOutlined, ReloadOutlined } from "@ant-design/icons";
import { Button, Tooltip, Row, Col, Space, Empty, Spin, Modal } from "antd";
import moment from 'moment';
// import Checkbox from "antd/lib/checkbox/Checkbox";
import { useTranslation } from 'react-i18next';
// import { isDesktop } from "react-device-detect";
import { TokenDisplay } from "../../components/TokenDisplay";
// import { PreFooter } from "../../components/PreFooter";
// import { useConnection, useConnectionConfig } from '../../contexts/connection';
import { useWallet } from "../../contexts/wallet";
import { AppStateContext } from "../../contexts/appstate";
import { cutNumber, formatAmount, formatThousands, getAmountWithSymbol, isValidNumber } from "../../utils/utils";
import { DebounceInput } from "react-debounce-input";
import { StakeQuote, StakingClient } from "@mean-dao/staking";
// import { IconRefresh, IconStats } from "../../Icons";
// import { IconHelpCircle } from "../../Icons/IconHelpCircle";
// import useWindowSize from '../../hooks/useWindowResize';
// import { consoleOut, isLocal, isProd } from "../../utils/ui";
// import { useNavigate } from "react-router-dom";
// import { ConfirmOptions } from "@solana/web3.js";
// import { Provider } from "@project-serum/anchor";

export const StakeTabView = (props: {
  stakeClient: StakingClient;
}) => {
  const {
    selectedToken,
    tokenBalance,
    effectiveRate,
    loadingPrices,
    fromCoinAmount,
    isVerifiedRecipient,
    paymentStartDate,
    stakedAmount,
    unstakeStartDate,
    refreshPrices,
    setFromCoinAmount,
    setIsVerifiedRecipient,
    setStakedAmount,
    setUnstakeStartDate,
    setStakingMultiplier
  } = useContext(AppStateContext);
  const { connected } = useWallet();
  const { t } = useTranslation('common');
  const periods = [
    {
      value: 0,
      time: t("invest.panel-right.tabset.stake.days"),
      multiplier: 1
    },
    {
      value: 30,
      time: t("invest.panel-right.tabset.stake.days"),
      multiplier: 1.1
    },
    {
      value: 90,
      time: t("invest.panel-right.tabset.stake.days"),
      multiplier: 1.2
    },
    {
      value: 1,
      time: t("invest.panel-right.tabset.stake.year"),
      multiplier: 2.0
    },
    {
      value: 4,
      time: t("invest.panel-right.tabset.stake.years"),
      multiplier: 4.0
    },
  ];

  const [periodValue, setPeriodValue] = useState<number>(periods[0].value);
  const [periodTime, setPeriodTime] = useState<string>(periods[0].time);
  const [stakeQuote, setStakeQuote] = useState<StakeQuote>();

  // Transaction execution modal
  const [isTransactionModalVisible, setTransactionModalVisible] = useState(false);
  const showTransactionModal = useCallback(() => setTransactionModalVisible(true), []);
  const closeTransactionModal = useCallback(() => setTransactionModalVisible(false), []);

  const handleFromCoinAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setFromCoinAmount("");
    } else if (newValue === '.') {
      setFromCoinAmount(".");
    } else if (isValidNumber(newValue)) {
      setFromCoinAmount(newValue);
    }
  };

  const isSendAmountValid = (): boolean => {
    return  connected &&
            selectedToken &&
            tokenBalance &&
            fromCoinAmount &&
            parseFloat(fromCoinAmount) > 0 &&
            parseFloat(fromCoinAmount) <= tokenBalance
      ? true
      : false;
  }

  const areSendAmountSettingsValid = (): boolean => {
    return paymentStartDate && isSendAmountValid() ? true : false;
  }  

  const onIsVerifiedRecipientChange = (e: any) => {
    setIsVerifiedRecipient(e.target.checked);
  }

  const onAfterTransactionModalClosed = () => {
    const unstakeAmountAfterTransaction = !stakedAmount ? fromCoinAmount : `${parseFloat(stakedAmount) + parseFloat(fromCoinAmount)}`;

    setStakedAmount(unstakeAmountAfterTransaction);
    setFromCoinAmount("");
    setIsVerifiedRecipient(false);
    closeTransactionModal();
  }

  const onTransactionStart = useCallback(async () => {
    showTransactionModal();
  }, [
    showTransactionModal
  ]);

  // const onChangeValue = (value: number, time: string, rate: number) => {
  //   setPeriodValue(value);
  //   setPeriodTime(time);
  //   setStakingMultiplier(rate);
  // }

  useEffect(() => {
    if (!props.stakeClient) {
      return;
    }

    props.stakeClient.getStakeQuote(parseFloat(stakedAmount)).then((value: any) => {
      setStakeQuote(value.meanInUiAmount);
    }).catch((error: any) => {
      console.error(error);
    });

  }, [
    props.stakeClient,
    stakedAmount
  ]);

  useEffect(() => {
    const unstakeStartDateUpdate = moment().add(periodValue, periodValue === 1 ? "year" : periodValue === 4 ? "years" : "days").format("LL")

    setUnstakeStartDate(unstakeStartDateUpdate);
  }, [periodTime, periodValue, setUnstakeStartDate]);
  
  return (
    <>
      <div className="form-label">{t("invest.panel-right.tabset.stake.amount-label")}</div>
      <div className="well">
        <div className="flex-fixed-left">
          <div className="left">
            <span className="add-on simplelink">
              {selectedToken && (
                <TokenDisplay onClick={() => {}}
                  mintAddress={selectedToken.address}
                  name={selectedToken.name}
                />
              )}
            </span>
          </div>
          <div className="right">
            <DebounceInput
              className="general-text-input text-right"
              inputMode="decimal"
              autoComplete="off"
              autoCorrect="off"
              type="text"
              onChange={handleFromCoinAmountChange}
              pattern="^[0-9]*[.,]?[0-9]*$"
              placeholder="0.0"
              minLength={1}
              maxLength={79}
              debounceTimeout={400}
              spellCheck="false"
              value={fromCoinAmount}
            />
          </div>
        </div>
        <div className="flex-fixed-right">
          <div className="left inner-label">
            <span>{t('transactions.send-amount.label-right')}:</span>
            <span>
              {`${tokenBalance && selectedToken
                  ? getAmountWithSymbol(tokenBalance, selectedToken?.address, true)
                  : "0"
              }`}
            </span>
          </div>
          <div className="right inner-label">
            <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
              ~${fromCoinAmount && effectiveRate
                ? formatAmount(parseFloat(fromCoinAmount) * effectiveRate, 2)
                : "0.00"}
            </span>
          </div>
        </div>
      </div>
    
      {/* Periods */}
      {/* <span className="info-label">{t("invest.panel-right.tabset.stake.period-label")}</span>
      <div className="flexible-left mb-1 mt-2">
        <div className="left token-group">
          {periods.map((period, index) => (
            <div key={index} className="mb-1 d-flex flex-column align-items-center">
              <div className={`token-max simplelink ${period.value === 7 ? "active" : "disabled"}`} onClick={() => onChangeValue(period.value, period.time, period.multiplier)}>{period.value} {period.time}</div>
              <span>{`${period.multiplier}x`}</span>
            </div>
          ))}
        </div>
      </div>
      <span className="info-label">{t("invest.panel-right.tabset.stake.notification-label", { periodValue: periodValue, periodTime: periodTime, unstakeStartDate: unstakeStartDate })}</span> */}

      {/* Confirm that have read the terms and conditions */}
      {/* <div className="mt-2 d-flex confirm-terms">
        <Checkbox checked={isVerifiedRecipient} onChange={onIsVerifiedRecipientChange}>{t("invest.panel-right.tabset.stake.verified-label")}</Checkbox>
        <Tooltip placement="top" title={t("invest.panel-right.tabset.stake.terms-and-conditions-tooltip")}>
          <span>
            <IconHelpCircle className="mean-svg-icons" />
          </span>
        </Tooltip>
      </div> */}

      {/* Action button */}
      <Button
        className="main-cta mt-2"
        block
        type="primary"
        shape="round"
        size="large"
        onClick={onTransactionStart}
        // disabled={
        //   !areSendAmountSettingsValid() ||
        //   !isVerifiedRecipient}
        disabled={
          !areSendAmountSettingsValid()}
      >
        {t("invest.panel-right.tabset.stake.stake-button")} {selectedToken && selectedToken.name}
      </Button>

      {/* Transaction execution modal */}
      <Modal
        className="mean-modal no-full-screen"
        maskClosable={false}
        visible={isTransactionModalVisible}
        onCancel={closeTransactionModal}
        afterClose={onAfterTransactionModalClosed}
        width={330}
        footer={null}>
        <div className="transaction-progress"> 
          <CheckOutlined style={{ fontSize: 48 }} className="icon" />
          <h4 className="font-bold mb-1 text-uppercase">
            Operation completed
          </h4>
          <p className="operation">
            {fromCoinAmount} MEAN has been staked successfully
          </p>
          <Button
            block
            type="primary"
            shape="round"
            size="middle"
            onClick={closeTransactionModal}>
            {t('general.cta-close')}
          </Button>
        </div>
      </Modal>
    </>
  )
}