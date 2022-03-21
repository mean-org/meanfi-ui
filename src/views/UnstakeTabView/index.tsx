import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import './style.less';
// import { ArrowDownOutlined, CheckOutlined, ReloadOutlined } from "@ant-design/icons";
import { Button, Tooltip, Row, Col, Space, Empty, Spin, Modal } from "antd";
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
import { CheckOutlined } from "@ant-design/icons";
import { StakingClient, UnstakeQuote } from "@mean-dao/staking";
// import { IconRefresh, IconStats } from "../../Icons";
// import { IconHelpCircle } from "../../Icons/IconHelpCircle";
// import useWindowSize from '../../hooks/useWindowResize';
// import { consoleOut, isLocal, isProd } from "../../utils/ui";
// import { useNavigate } from "react-router-dom";
// import { ConfirmOptions } from "@solana/web3.js";
// import { Provider } from "@project-serum/anchor";
// import { EnvMintAddresses, StakingClient } from "@mean-dao/staking";

export const UnstakeTabView = (props: {
  stakeClient: StakingClient;
}) => {
  const {
    selectedToken,
    effectiveRate,
    loadingPrices,
    fromCoinAmount,
    // isVerifiedRecipient,
    paymentStartDate,
    unstakeStartDate,
    stakedAmount,
    unstakedAmount,
    refreshPrices,
    setFromCoinAmount,
    setStakedAmount,
    setUnstakedAmount
    // setIsVerifiedRecipient
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const percentages = [25, 50, 75, 100];
  const [percentageValue, setPercentageValue] = useState<number>(0);
  const [availableUnstake, setAvailableUnstake] = useState<number>(0);
  const [unstakeQuote, setUnstakeQuote] = useState<UnstakeQuote>();
  
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
            parseFloat(fromCoinAmount) <= parseFloat(stakedAmount)
      ? true
      : false;
  }

  const areSendAmountSettingsValid = (): boolean => {
    return paymentStartDate && isSendAmountValid() ? true : false;
  }

  // Transaction execution modal
  const [isTransactionModalVisible, setTransactionModalVisible] = useState(false);
  const showTransactionModal = useCallback(() => setTransactionModalVisible(true), []);
  const closeTransactionModal = useCallback(() => setTransactionModalVisible(false), []);

  const onTransactionStart = useCallback(async () => {
    showTransactionModal();

    const newStakedAmount = (parseFloat(stakedAmount) - parseFloat(unstakedAmount)).toString();

    setStakedAmount(newStakedAmount);
    setFromCoinAmount('');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    showTransactionModal
  ]);

  const onAfterTransactionModalClosed = () => {
    // const unstakeAmountAfterTransaction = !stakedAmount ? fromCoinAmount : `${parseFloat(stakedAmount) + parseFloat(fromCoinAmount)}`;

    // setStakedAmount(unstakeAmountAfterTransaction);
    setFromCoinAmount("");
    closeTransactionModal();
  }

  useEffect(() => {
    if (!props.stakeClient) {
      return;
    }

    props.stakeClient.getUnstakeQuote(parseFloat(stakedAmount)).then((value: any) => {
      setUnstakeQuote(value.meanOutUiAmount);
    }).catch((error: any) => {
      console.error(error);
    });
    
  }, [
    props.stakeClient,
    stakedAmount
  ]);

  useEffect(() => {
    const percentageFromCoinAmount = parseFloat(stakedAmount) > 0 ? `${(parseFloat(stakedAmount)*percentageValue/100)}` : '';

    setFromCoinAmount(percentageFromCoinAmount);

    setUnstakedAmount(percentageFromCoinAmount);

    // setFromCoinAmount(formatAmount(parseFloat(percentageFromCoinAmount), 6).toString());

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [percentageValue]);

  useEffect(() => {
    parseFloat(stakedAmount) > 0 && currentDate === unstakeStartDate ?
      setAvailableUnstake(parseFloat(stakedAmount))
    :
      setAvailableUnstake(0)
  }, [currentDate, stakedAmount, unstakeStartDate]);

  return (
    <>
      {/* <span className="info-label">{stakedAmount ? t("invest.panel-right.tabset.unstake.notification-label-one", {stakedAmount: cutNumber(parseFloat(stakedAmount), 6), unstakeStartDate: unstakeStartDate}) : t("invest.panel-right.tabset.unstake.notification-label-one-error")}</span> */}
      <span className="info-label">{stakedAmount ? `Your currently have ${cutNumber(parseFloat(stakedAmount), 6)} sMEAN staked which is currently worth ${cutNumber(parseFloat(stakedAmount), 6)} MEAN` : t("invest.panel-right.tabset.unstake.notification-label-one-error")}</span>
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
        onClick={onTransactionStart}
        disabled={
          !areSendAmountSettingsValid() ||
          // !isVerifiedRecipient ||
          availableUnstake <= 0
        }
      >
        {availableUnstake <= 0 ? t("invest.panel-right.tabset.unstake.unstake-button-unavailable") : t("invest.panel-right.tabset.unstake.unstake-button-available")} {selectedToken && selectedToken.symbol}
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
            {unstakedAmount} sMEAN has been successfully unstaked and you have received {unstakedAmount} MEAN in return.
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