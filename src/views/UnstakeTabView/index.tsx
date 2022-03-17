import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import './style.less';
// import { ArrowDownOutlined, CheckOutlined, ReloadOutlined } from "@ant-design/icons";
import { Button, Tooltip, Row, Col, Space, Empty, Spin } from "antd";
import moment from 'moment';
// import Checkbox from "antd/lib/checkbox/Checkbox";
// import Modal from "antd/lib/modal/Modal";
import { useTranslation } from 'react-i18next';
// import { isDesktop } from "react-device-detect";
import { TokenDisplay } from "../../components/TokenDisplay";
// import { useConnection, useConnectionConfig } from '../../contexts/connection';
// import { useWallet } from "../../contexts/wallet";
import { AppStateContext } from "../../contexts/appstate";
import { cutNumber, formatAmount, formatThousands, getAmountWithSymbol, isValidNumber } from "../../utils/utils";
// import { IconRefresh, IconStats } from "../../Icons";
// import { IconHelpCircle } from "../../Icons/IconHelpCircle";
// import useWindowSize from '../../hooks/useWindowResize';
// import { consoleOut, isLocal, isProd } from "../../utils/ui";
// import { useNavigate } from "react-router-dom";
// import { ConfirmOptions } from "@solana/web3.js";
// import { Provider } from "@project-serum/anchor";
// import { EnvMintAddresses, StakingClient } from "@mean-dao/staking";

export const UnstakeTabView = () => {
  const {
    selectedToken,
    effectiveRate,
    loadingPrices,
    fromCoinAmount,
    // isVerifiedRecipient,
    paymentStartDate,
    unstakeStartDate,
    unstakeAmount,
    refreshPrices,
    setFromCoinAmount,
    setUnstakeAmount
    // setIsVerifiedRecipient
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const percentages = [25, 50, 75, 100];
  const [percentageValue, setPercentageValue] = useState<number>(0);
  const [availableUnstake, setAvailableUnstake] = useState<number>(0);

  const currentDate = moment().format("LL");

  const onChangeValue = (value: number) => {
    setPercentageValue(value);
  };
  
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

  // const onIsVerifiedRecipientChange = (e: any) => {
  //   setIsVerifiedRecipient(e.target.checked);
  // }

  const isSendAmountValid = (): boolean => {
    return  fromCoinAmount &&
            parseFloat(fromCoinAmount) > 0 &&
            parseFloat(fromCoinAmount) <= parseFloat(unstakeAmount)
      ? true
      : false;
  }

  const areSendAmountSettingsValid = (): boolean => {
    return paymentStartDate && isSendAmountValid() ? true : false;
  }

  const handleUnstake = () => {
    const newUnstakeAmount = (parseFloat(unstakeAmount) - parseFloat(fromCoinAmount)).toString();

    setUnstakeAmount(newUnstakeAmount);
    setFromCoinAmount('');
  }

  useEffect(() => {
    const percentageFromCoinAmount = parseFloat(unstakeAmount) > 0 ? `${(parseFloat(unstakeAmount)*percentageValue/100)}` : '';

    setFromCoinAmount(percentageFromCoinAmount);
    // setFromCoinAmount(formatAmount(parseFloat(percentageFromCoinAmount), 6).toString());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [percentageValue]);

  useEffect(() => {
    parseFloat(unstakeAmount) > 0 && currentDate === unstakeStartDate ?
      setAvailableUnstake(parseFloat(unstakeAmount))
    :
      setAvailableUnstake(0)
  }, [currentDate, unstakeAmount, unstakeStartDate]);

  return (
    <>
      <span className="info-label">{unstakeAmount ? t("invest.panel-right.tabset.unstake.notification-label-one", {unstakeAmount: cutNumber(parseFloat(unstakeAmount), 6), unstakeStartDate: unstakeStartDate}) : t("invest.panel-right.tabset.unstake.notification-label-one-error")}</span>
      <div className="form-label mt-2">{t("invest.panel-right.tabset.unstake.amount-label")}</div>
      <div className="well">
        <div className="flexible-right mb-1">
          <div className="token-group">
            {percentages.map((percentage, index) => (
              <div key={index} className="mb-1 d-flex flex-column align-items-center">
                <div className={`token-max simplelink ${availableUnstake !== 0 ? "active" : "disabled"}`} onClick={() => onChangeValue(percentage)}>{percentage}%</div>
              </div>
            ))}
          </div>
        </div>
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
            <input
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
              spellCheck="false"
              value={fromCoinAmount}
            />
          </div>
        </div>
        <div className="flex-fixed-right">
          <div className="left inner-label">
            <span>{t('invest.panel-right.tabset.unstake.send-amount.label-right')}:</span>
            <span>{formatAmount(availableUnstake, 6)}</span>
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
      <span className="info-label">{t("invest.panel-right.tabset.unstake.notification-label-two")}</span>
      
      {/* Confirm that have read the terms and conditions */}
      {/* <div className="mt-2 confirm-terms">
        <Checkbox checked={isVerifiedRecipient} onChange={onIsVerifiedRecipientChange}>{t("invest.panel-right.tabset.unstake.verified-label")}</Checkbox>
        <Tooltip placement="top" title={t("invest.panel-right.tabset.unstake.terms-and-conditions-tooltip")}>
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
        onClick={handleUnstake}
        disabled={
          !areSendAmountSettingsValid() ||
          // !isVerifiedRecipient ||
          availableUnstake <= 0
        }
      >
        {availableUnstake <= 0 ? t("invest.panel-right.tabset.unstake.unstake-button-unavailable") : t("invest.panel-right.tabset.unstake.unstake-button-available")} {selectedToken && selectedToken.name}
      </Button>
    </>
  )
}