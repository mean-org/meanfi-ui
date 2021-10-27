import React, { useCallback, useEffect } from 'react';
import { useContext, useState } from 'react';
import { Modal, Button, Row, Col } from 'antd';
import { IconSort } from "../../Icons";
import { AppStateContext } from '../../contexts/appstate';
import { findATokenAddress, formatAmount, getTokenAmountAndSymbolByTokenAddress, isValidNumber } from '../../utils/utils';
import { Identicon } from '../Identicon';
import { consoleOut, percentage } from '../../utils/ui';
import { useTranslation } from 'react-i18next';
import { DdcaDetails, TransactionFees } from '@mean-dao/ddca';
import { getTokenByMintAddress, TokenInfo } from '../../utils/tokens';
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { useWallet } from '../../contexts/wallet';
import Slider, { SliderMarks } from 'antd/lib/slider';

export const DdcaAddFundsModal = (props: {
  connection: Connection;
  ddcaDetails: DdcaDetails | undefined;
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  userBalance: number;
  ddcaTxFees: TransactionFees;
}) => {
  const { t } = useTranslation('common');
  const { publicKey, wallet } = useWallet();

  const [rangeMin, setRangeMin] = useState(0);
  const [rangeMax, setRangeMax] = useState(0);
  const [marks, setMarks] = useState<SliderMarks>();
  const [recurrencePeriod, setRecurrencePeriod] = useState(0);
  const [lockedSliderValue, setLockedSliderValue] = useState(0);
  const [fromTokenBalance, setFromTokenBalance] = useState(0);

  const getModalHeadline = () => {
    return `<span>Modal headline here</span>`;
  }

  const getMaxRangeFromInterval = (intervalInSeconds: number): number => {
    if (!intervalInSeconds) { return 12; }
    switch (intervalInSeconds) {
      case 86400:
        return 365;
      case 604800:
        return 52;
      case 1209600:
        return 26;
      case 2629750:
        return 12;
      default:
        return 12;
    }
  }

  const getTotalPeriod = useCallback((periodValue: number): string => {
    let strOut = '';
    if (props.ddcaDetails) {
      switch (props.ddcaDetails.intervalInSeconds) {
        case 86400:
          strOut = `${periodValue} ${t('general.days')}`;
          break;
        case 604800:
          strOut = `${periodValue} ${t('general.weeks')}`;
          break;
        case 1209600:
          strOut = `${periodValue * 2} ${t('general.weeks')}`;
          break;
        case 2629750:
          strOut = `${periodValue} ${t('general.months')}`;
          break;
        default:
          break;
      }
    }
    return strOut;
  }, [
    t,
    props.ddcaDetails
  ])

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

  const onSliderChange = (value?: number) => {
    setRecurrencePeriod(value || 0);
    setLockedSliderValue(value || 0);
  }

  //////////////////////////
  //   Data Preparation   //
  //////////////////////////

  useEffect(() => {
    const getTokenAccountBalanceByAddress = async (address: string): Promise<number> => {
      if (!address) return 0;
      try {
        const accountInfo = await props.connection.getAccountInfo(address.toPublicKey());
        if (!accountInfo) return 0;
        if (address === publicKey?.toBase58()) {
          return accountInfo.lamports / LAMPORTS_PER_SOL;
        }
        const tokenAmount = (await props.connection.getTokenAccountBalance(address.toPublicKey())).value;
        return tokenAmount.uiAmount || 0;
      } catch (error) {
        console.error(error);
        throw(error);
      }
    }

    (async () => {
      if (props.ddcaDetails) {
        let balance = 0;
        const selectedTokenAddress = await findATokenAddress(publicKey as PublicKey, props.ddcaDetails.fromMint.toPublicKey());
        balance = await getTokenAccountBalanceByAddress(selectedTokenAddress.toBase58());
        setFromTokenBalance(balance);
      }
    })();

    return () => { }
  }, [
    publicKey,
    props.ddcaDetails,
    props.connection,
  ]);

  useEffect(() => {

    if (props.ddcaDetails) {
      const maxRangeFromSelection = getMaxRangeFromInterval(props.ddcaDetails.intervalInSeconds);
      const maxRangeFromBalance = Math.floor(fromTokenBalance / props.ddcaDetails.amountPerSwap);
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
      const minimumRequired = props.ddcaDetails.amountPerSwap * (minRangeSelectable + 1);
      const isOpValid = minimumRequired < fromTokenBalance ? true : false;

      // Set the slider position
      if (isOpValid) {
        setRecurrencePeriod(initialValue);
      } else {
        setRecurrencePeriod(minRangeSelectable);
      }
    }
  }, [
    props.ddcaDetails,
    fromTokenBalance,
    getTotalPeriod
  ]);

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{t('ddca-setup-modal.modal-title')}</div>}
      footer={null}
      maskClosable={false}
      visible={props.isVisible}
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
          value={lockedSliderValue}
          onChange={onSliderChange}
          tooltipVisible
          dots={false}/>
      </div>

      {/* <div className="mb-3">
        <div className="font-bold">{t('ddca-setup-modal.help.how-does-it-work')}</div>
        <ol className="greek">
          <li>
            {
              t('ddca-setup-modal.help.help-item-01', {
                fromTokenAmount: getTokenAmountAndSymbolByTokenAddress(
                  props.ddcaDetails.amountPerSwap * (lockedSliderValue + 1),
                  props.fromToken?.address as string)
              })
            }
          </li>
          <li>
            {
              t('ddca-setup-modal.help.help-item-02', {
                lockedSliderValue: getRecurrencePeriod(),
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
      <div className="row two-col-ctas">
        <div className="col-6">
          <Button
            className={`main-cta ${!vaultCreated && isBusy ? 'inactive' : vaultCreated ? 'completed' : ''}`}
            block
            type="primary"
            shape="round"
            size="large"
            disabled={!isProd() ||
              (isNative() && props.userBalance < getTotalSolAmount()) ||
              (!isNative() && !hasEnoughFromTokenBalance())
            }
            onClick={() => onCreateVaultTxStart()}>
            {
              !vaultCreated && isBusy
                ? t('ddca-setup-modal.cta-label-depositing')
                : vaultCreated
                ? t('ddca-setup-modal.cta-label-vault-created')
                : isNative()
                  ? getTotalSolAmount() > props.userBalance
                      ? `Need at least ${getTokenAmountAndSymbolByTokenAddress(getTotalSolAmount(), NATIVE_SOL_MINT.toBase58())}`
                      : t('ddca-setup-modal.cta-label-deposit')
                  : !hasEnoughFromTokenBalance()
                    ? t('transactions.validation.amount-low')
                    : !hasEnoughNativeBalanceForFees()
                        ? `Need at least ${getTokenAmountAndSymbolByTokenAddress(getGasFeeAmount(), NATIVE_SOL_MINT.toBase58())}`
                        : t('ddca-setup-modal.cta-label-deposit')
            }
          </Button>
        </div>
        <div className="col-6">
          <Button
            className={`main-cta ${isBusy ? 'inactive' : ''}`}
            block
            type="primary"
            shape="round"
            size="large"
            disabled={!vaultCreated}
            onClick={() => {
              if (vaultCreated && swapExecuted) {
                onOperationSuccess();
              } else {
                onSpawnSwapTxStart();
              }
            }}>
            {vaultCreated && isBusy ? 'Starting' : vaultCreated && swapExecuted ? 'Finished' : 'Start'}
          </Button>
        </div>
      </div>
      <div className="transaction-timeline-wrapper">
        <ul className="transaction-timeline">
          <li>
            {!vaultCreated && !swapExecuted && isBusy ? (
              <span className="value"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
            ) : vaultCreated ? (
              <span className="value">✔︎</span>
            ) : (
              <span className="value">1</span>
            )}
          </li>
          <li>
            {vaultCreated && isBusy ? (
              <span className="value"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
            ) : vaultCreated && swapExecuted ? (
              <span className="value">✔︎</span>
            ) : (
              <span className="value">2</span>
            )}
          </li>
        </ul>
      </div> */}

    </Modal>
  );


  // const { coinPrices } = useContext(AppStateContext);
  // const { t } = useTranslation('common');
  // const [topupAmount, setTopupAmount] = useState<string>('');
  // const [effectiveRate, setEffectiveRate] = useState(0);
  // const [selectedToken, setSelectedToken] = useState<TokenInfo>();

  // Set selected token and price per token
  // useEffect(() => {

  //   if (!coinPrices || !props.ddcaDetails) { return; }

  //   const getPricePerToken = (token: TokenInfo): number => {
  //     const tokenSymbol = token.symbol.toUpperCase();
  //     const symbol = tokenSymbol[0] === 'W' ? tokenSymbol.slice(1) : tokenSymbol;
  
  //     return coinPrices && coinPrices[symbol]
  //       ? coinPrices[symbol]
  //       : 0;
  //   }

  //   if (coinPrices && props.ddcaDetails) {
  //     const token = getTokenByMintAddress(props.ddcaDetails.fromMint);
  //     if (token) {
  //       setSelectedToken(token);
  //       setEffectiveRate(getPricePerToken(token));
  //     }
  //   }
  // }, [
  //   coinPrices,
  //   props.ddcaDetails
  // ]);

  // const onAcceptTopup = () => {
  //   props.handleOk(topupAmount);
  // }

  // const setValue = (value: string) => {
  //   setTopupAmount(value);
  // }

  // const handleAmountChange = (e: any) => {
  //   const newValue = isValidNumber(e.target.value) ? e.target.value : '';
  //   setValue(newValue);
  // };

  // const getFeeAmount = (amount?: any): number => {
  //   let fee = 0;
  //   const inputAmount = amount ? parseFloat(amount) : 0;
  //   if (props && props.ddcaTxFees) {
  //     if (props.ddcaTxFees.percentFee) {
  //       fee = percentage(props.ddcaTxFees.percentFee, inputAmount);
  //     } else if (props.ddcaTxFees.flatFee) {
  //       fee = props.ddcaTxFees.flatFee;
  //     }
  //   }
  //   return fee;
  // }

  // Validation

  // const isValidInput = (): boolean => {
  //   return selectedToken &&
  //          props.ddcaDetails?.fromBalance &&
  //          topupAmount && parseFloat(topupAmount) > 0 &&
  //          parseFloat(topupAmount) <= props.ddcaDetails.fromBalance &&
  //          parseFloat(topupAmount) > getFeeAmount(topupAmount)
  //           ? true
  //           : false;
  // }

  // const getTransactionStartButtonLabel = (): string => {
  //   return !selectedToken || !props.ddcaDetails?.fromBalance
  //     ? t('transactions.validation.no-balance')
  //     : !topupAmount || !isValidNumber(topupAmount) || !parseFloat(topupAmount)
  //     ? t('transactions.validation.no-amount')
  //     : parseFloat(topupAmount) > props.ddcaDetails.fromBalance
  //     ? t('transactions.validation.amount-high')
  //     : props.ddcaDetails.fromBalance < getFeeAmount(topupAmount)
  //     ? t('transactions.validation.amount-low')
  //     : t('transactions.validation.valid-approve');
  // }

  // const infoRow = (caption: string, value: string) => {
  //   return (
  //     <Row>
  //       <Col span={12} className="text-right pr-1">{caption}</Col>
  //       <Col span={12} className="text-left pl-1 fg-secondary-70">{value}</Col>
  //     </Row>
  //   );
  // }

  // return (
  //   <Modal
  //     className="mean-modal"
  //     title={<div className="modal-title">{t('add-funds.modal-title')}</div>}
  //     footer={null}
  //     visible={props.isVisible}
  //     onOk={onAcceptTopup}
  //     onCancel={props.handleClose}
  //     afterClose={() => setValue('')}
  //     width={480}>

  //     {props.ddcaDetails && (
  //       <div className="mb-3">
  //         <div className="transaction-field mb-1">
  //           <div className="transaction-field-row">
  //             <span className="field-label-left" style={{marginBottom: '-6px'}}>
  //               {t('add-funds.label')} ~${topupAmount && effectiveRate
  //                 ? formatAmount(parseFloat(topupAmount) * effectiveRate, 2)
  //                 : "0.00"}
  //               <IconSort className="mean-svg-icons usd-switcher fg-red" />
  //               <span className="fg-red">USD</span>
  //             </span>
  //             <span className="field-label-right">
  //               <span>{t('add-funds.label-right')}:</span>
  //               <span className="balance-amount">
  //                 {`${selectedToken && props.ddcaDetails.fromBalance
  //                   ? getTokenAmountAndSymbolByTokenAddress(props.ddcaDetails.fromBalance, selectedToken.address, true)
  //                   : "0"
  //                 }`}
  //               </span>
  //               <span className="balance-amount">
  //                 (~$
  //                 {props.ddcaDetails.fromBalance && effectiveRate
  //                   ? formatAmount(props.ddcaDetails.fromBalance as number * effectiveRate, 2)
  //                   : "0.00"})
  //               </span>
  //             </span>
  //           </div>
  //           <div className="transaction-field-row main-row">
  //             <span className="input-left">
  //               <input
  //                 id="topup-amount-field"
  //                 className="general-text-input"
  //                 inputMode="decimal"
  //                 autoComplete="off"
  //                 autoCorrect="off"
  //                 type="text"
  //                 onChange={handleAmountChange}
  //                 pattern="^[0-9]*[.,]?[0-9]*$"
  //                 placeholder="0.0"
  //                 minLength={1}
  //                 maxLength={79}
  //                 spellCheck="false"
  //                 value={topupAmount}
  //               />
  //             </span>
  //             {selectedToken && (
  //               <div className="addon-right">
  //                 <div className="token-group">
  //                   {props.ddcaDetails.fromBalance > 0 && (
  //                     <div
  //                       className="token-max simplelink"
  //                       onClick={() => {
  //                         setValue(
  //                           getTokenAmountAndSymbolByTokenAddress(props.ddcaDetails?.fromBalance || 0, selectedToken.address, true)
  //                         );
  //                       }}>
  //                       MAX
  //                     </div>
  //                   )}
  //                   <div className="token-selector">
  //                     <div className="token-icon">
  //                       {selectedToken.logoURI ? (
  //                         <img
  //                           alt={`${selectedToken.name}`}
  //                           width={20}
  //                           height={20}
  //                           src={selectedToken.logoURI}
  //                         />
  //                       ) : (
  //                         <Identicon
  //                           address={selectedToken.address}
  //                           style={{ width: "24", display: "inline-flex" }}
  //                         />
  //                       )}
  //                     </div>
  //                     <div className="token-symbol">{selectedToken.symbol}</div>
  //                   </div>
  //                 </div>
  //               </div>
  //             )}
  //           </div>
  //           <div className="transaction-field-row">
  //             <span className="field-label-left">{
  //               parseFloat(topupAmount) > props.ddcaDetails.fromBalance
  //                 ? (<span className="fg-red">{t('transactions.validation.amount-high')}</span>)
  //                 : (<span>&nbsp;</span>)
  //             }</span>
  //             <span className="field-label-right">&nbsp;</span>
  //           </div>
  //         </div>
  //       </div>
  //     )}

  //     {(selectedToken) && (
  //       <div className="p-2 mb-2">
  //         {infoRow(
  //           `1 ${selectedToken.symbol}:`,
  //           effectiveRate ? `$${formatAmount(effectiveRate, 2)}` : "--"
  //         )}
  //         {isValidInput() && infoRow(
  //           t('transactions.transaction-info.transaction-fee') + ':',
  //           `~${getTokenAmountAndSymbolByTokenAddress(getFeeAmount(topupAmount), selectedToken?.address)}`
  //         )}
  //         {isValidInput() && infoRow(
  //           t('transactions.transaction-info.beneficiary-receives') + ':',
  //           `~${getTokenAmountAndSymbolByTokenAddress(parseFloat(topupAmount) - getFeeAmount(topupAmount), selectedToken?.address)}`
  //         )}
  //       </div>
  //     )}

  //     <Button
  //       className="main-cta"
  //       block
  //       type="primary"
  //       shape="round"
  //       size="large"
  //       disabled={!isValidInput()}
  //       onClick={onAcceptTopup}>
  //       {getTransactionStartButtonLabel()}
  //     </Button>
  //   </Modal>
  // );

};
