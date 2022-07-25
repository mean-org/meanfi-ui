import React, { useCallback, useEffect } from 'react';
import { useContext, useState } from 'react';
import { Modal, Button, Select, Divider, Input, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import { TokenInfo } from '@solana/spl-token-registry';
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import {
  cutNumber,
  formatAmount,
  getTokenAmountAndSymbolByTokenAddress,
  getTokenSymbol,
  isValidNumber,
  makeDecimal,
  makeInteger,
  shortenAddress,
  toUiAmount
} from '../../../../utils/utils';
import { IconCheckedBox, IconDownload, IconIncomingPaused, IconOutgoingPaused, IconTimer, IconUpload } from '../../../../Icons';
import {
  consoleOut,
  getShortDate,
  getIntervalFromSeconds,
  getFormattedNumberToLocale,
  getTransactionOperationDescription,
  isValidAddress,
  toUsCurrency
} from '../../../../utils/ui';
import { StreamInfo, STREAM_STATE, TransactionFees } from '@mean-dao/money-streaming/lib/types';
import { TransactionStatus } from '../../../../models/enums';
import { useWallet } from '../../../../contexts/wallet';
import { NATIVE_SOL_MINT } from '../../../../utils/ids';
import { isError } from '../../../../utils/transactions';
import { AllocationType, Stream, StreamTemplate, STREAM_STATUS, Treasury, TreasuryType } from '@mean-dao/msp';
import BN from 'bn.js';
import { CUSTOM_TOKEN_NAME, SOLANA_EXPLORER_URI_INSPECT_ADDRESS, WRAPPED_SOL_MINT_ADDRESS } from '../../../../constants';
import { AppStateContext } from '../../../../contexts/appstate';
import { openNotification } from '../../../../components/Notifications';
import { NATIVE_SOL } from '../../../../utils/tokens';
import { TokenDisplay } from '../../../../components/TokenDisplay';
import { QRCodeSVG } from 'qrcode.react';
import { AddressDisplay } from '../../../../components/AddressDisplay';
import { getSolanaExplorerClusterParam } from '../../../../contexts/connection';
import { VestingContractTopupParams } from '../../../../models/vesting';

const { Option } = Select;
const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const VestingContractAddFundsModal = (props: {
  associatedToken: string;
  handleClose: any;
  handleOk: any;
  isBusy: boolean;
  isVisible: boolean;
  nativeBalance: number;
  minRequiredBalance: number;
  streamTemplate: StreamTemplate | undefined;
  transactionFees: TransactionFees;
  treasuryStreams: Stream[];
  userBalances: any;
  vestingContract: Treasury | undefined;
  withdrawTransactionFees: TransactionFees;
}) => {
  const {
    associatedToken,
    handleClose,
    handleOk,
    isBusy,
    isVisible,
    nativeBalance,
    minRequiredBalance,
    streamTemplate,
    transactionFees,
    treasuryStreams,
    userBalances,
    vestingContract,
    withdrawTransactionFees,
  } = props;
  const {
    tokenList,
    tokenBalance,
    selectedToken,
    loadingPrices,
    transactionStatus,
    highLightableStreamId,
    getTokenPriceByAddress,
    getTokenPriceBySymbol,
    getTokenByMintAddress,
    setTransactionStatus,
    setSelectedToken,
    refreshPrices,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const [topupAmount, setTopupAmount] = useState<string>('');
  const [allocationOption, setAllocationOption] = useState<AllocationType>(AllocationType.None);
  const [customTokenInput, setCustomTokenInput] = useState("");
  const [, setTreasuryType] = useState<TreasuryType>(TreasuryType.Open);
  const [availableBalance, setAvailableBalance] = useState<any>();
  const [tokenAmount, setTokenAmount] = useState<any>(0);
  const [showQrCode, setShowQrCode] = useState(false);
  const [isFeePaidByTreasurer, setIsFeePaidByTreasurer] = useState(false);

  /////////////////
  //   Getters   //
  /////////////////

  const getTokenPrice = useCallback((inputAmount: string) => {
    if (!selectedToken) { return 0; }
    const price = getTokenPriceByAddress(selectedToken.address) || getTokenPriceBySymbol(selectedToken.symbol);

    return parseFloat(inputAmount) * price;
  }, [getTokenPriceByAddress, getTokenPriceBySymbol, selectedToken]);

  const getSelectedStream = useCallback((id?: string) => {
    if (!treasuryStreams || treasuryStreams.length === 0 || (!id && !highLightableStreamId)) {
      return undefined;
    }

    if (id) {
      return treasuryStreams.find(ts => ts.id === id);
    } else if (highLightableStreamId) {
      return treasuryStreams.find(ts => ts.id ===highLightableStreamId);
    }

    return undefined;
  }, [
    treasuryStreams,
    highLightableStreamId
  ]);

  const getMaxPossibleSolAmount = () => {
    const maxPossibleAmount = nativeBalance - minRequiredBalance;

    return maxPossibleAmount > 0
      ? maxPossibleAmount : nativeBalance;
  }

  const getMaxAmount = useCallback((preSetting = false) => {
    if (withdrawTransactionFees && allocationOption === AllocationType.Specific && highLightableStreamId) {
      const stream = getSelectedStream();
      if (stream && ((stream as any).feePayedByTreasurer || preSetting)) {

        const BASE_100_TO_BASE_1_MULTIPLIER = 10_000;
        const feeNumerator = withdrawTransactionFees.mspPercentFee * BASE_100_TO_BASE_1_MULTIPLIER;
        const feeDenaminator = 1000000;
        const badStreamMaxAllocation = availableBalance
          .mul(new BN(feeDenaminator))
          .div(new BN(feeNumerator + feeDenaminator));

        const feeAmount = badStreamMaxAllocation
          .mul(new BN(feeNumerator))
          .div(new BN(feeDenaminator));

        const goodStreamMaxAllocation = availableBalance.sub(feeAmount);
        const maxAmount = goodStreamMaxAllocation;

        return maxAmount;
      }
    }
    return selectedToken && availableBalance ? availableBalance : 0;
  },[
    selectedToken,
    availableBalance,
    allocationOption,
    highLightableStreamId,
    withdrawTransactionFees,
    getSelectedStream
  ]);

  const isInboundStream = useCallback((item: Stream | StreamInfo): boolean => {
    if (item && publicKey) {
      const v1 = item as StreamInfo;
      const v2 = item as Stream;
      if (v1.version < 2) {
        return v1.beneficiaryAddress === publicKey.toBase58() ? true : false;
      } else {
        return v2.beneficiary === publicKey.toBase58() ? true : false;
      }
    }
    return false;
  }, [publicKey]);

  const getTransactionStartButtonLabel = (): string => {
    return !selectedToken || !availableBalance || availableBalance.isZero()
      ? t('transactions.validation.no-balance')
      : !tokenAmount || tokenAmount.isZero()
        ? t('transactions.validation.no-amount')
        : tokenAmount.gt(getMaxAmount())
          ? t('transactions.validation.amount-high')
          : allocationOption === AllocationType.Specific && !highLightableStreamId
            ? t('transactions.validation.select-stream')
            : allocationOption === AllocationType.Specific && highLightableStreamId
            ? t('treasuries.add-funds.main-cta-fund-stream')
            : t('treasuries.add-funds.main-cta');
  }

  const getRateAmountDisplay = useCallback((item: Stream | StreamInfo): string => {
    let value = '';

    if (item) {
      const token = item.associatedToken ? getTokenByMintAddress(item.associatedToken as string) : undefined;
      if (item.version < 2) {
        value += getFormattedNumberToLocale(formatAmount(item.rateAmount, 2));
      } else {
        value += getFormattedNumberToLocale(formatAmount(toUiAmount(new BN(item.rateAmount), token?.decimals || 6), 2));
      }
      value += ' ';
      value += getTokenSymbol(item.associatedToken as string);
    }
    return value;
  }, [getTokenByMintAddress]);

  const getTransferAmountDisplay = useCallback((item: Stream | StreamInfo): string => {
    let value = '';

    if (item && item.rateAmount === 0 && item.allocationAssigned > 0) {
      const token = item.associatedToken ? getTokenByMintAddress(item.associatedToken as string) : undefined;
      if (item.version < 2) {
        value += getFormattedNumberToLocale(formatAmount(item.rateAmount, 2));
      } else {
        value += getFormattedNumberToLocale(formatAmount(toUiAmount(new BN(item.rateAmount), token?.decimals || 6), 2));
      }
      value += ' ';
      value += getTokenSymbol(item.associatedToken as string);
    }
    return value;
  }, [getTokenByMintAddress]);

  const getStreamIcon = useCallback((item: Stream | StreamInfo) => {
    const isInbound = isInboundStream(item);
    const v1 = item as StreamInfo;
    const v2 = item as Stream;

    if (v1.version < 2) {
      if (isInbound) {
        switch (v1.state) {
          case STREAM_STATE.Schedule:
            return (<IconTimer className="mean-svg-icons incoming" />);
          case STREAM_STATE.Paused:
            return (<IconIncomingPaused className="mean-svg-icons incoming" />);
          default:
            return (<IconDownload className="mean-svg-icons incoming" />);
        }
      } else {
        switch (v1.state) {
          case STREAM_STATE.Schedule:
            return (<IconTimer className="mean-svg-icons outgoing" />);
          case STREAM_STATE.Paused:
            return (<IconOutgoingPaused className="mean-svg-icons outgoing" />);
          default:
            return (<IconUpload className="mean-svg-icons outgoing" />);
        }
      }
    } else {
      if (isInbound) {
        switch (v2.status) {
          case STREAM_STATUS.Schedule:
            return (<IconTimer className="mean-svg-icons incoming" />);
          case STREAM_STATUS.Paused:
            return (<IconIncomingPaused className="mean-svg-icons incoming" />);
          default:
            return (<IconDownload className="mean-svg-icons incoming" />);
        }
      } else {
        switch (v2.status) {
          case STREAM_STATUS.Schedule:
            return (<IconTimer className="mean-svg-icons outgoing" />);
          case STREAM_STATUS.Paused:
            return (<IconOutgoingPaused className="mean-svg-icons outgoing" />);
          default:
            return (<IconUpload className="mean-svg-icons outgoing" />);
        }
      }
    }
  }, [isInboundStream]);

  const getStreamDescription = useCallback((item: Stream | StreamInfo): string => {
    let title = '';
    const isInbound = isInboundStream(item);

    const v1 = item as StreamInfo;
    const v2 = item as Stream;

    if (v1.version < 2) {
      if (isInbound) {
        if (v1.state === STREAM_STATE.Schedule) {
          title = `${t('streams.stream-list.title-scheduled-from')} (${shortenAddress(`${v1.treasurerAddress}`)})`;
        } else if (v1.state === STREAM_STATE.Paused) {
          title = `${t('streams.stream-list.title-paused-from')} (${shortenAddress(`${v1.treasurerAddress}`)})`;
        } else {
          title = `${t('streams.stream-list.title-receiving-from')} (${shortenAddress(`${v1.treasurerAddress}`)})`;
        }
      } else {
        if (v1.state === STREAM_STATE.Schedule) {
          title = `${t('streams.stream-list.title-scheduled-to')} (${shortenAddress(`${v1.beneficiaryAddress}`)})`;
        } else if (v1.state === STREAM_STATE.Paused) {
          title = `${t('streams.stream-list.title-paused-to')} (${shortenAddress(`${v1.beneficiaryAddress}`)})`;
        } else {
          title = `${t('streams.stream-list.title-sending-to')} (${shortenAddress(`${v1.beneficiaryAddress}`)})`;
        }
      }
    } else {
      if (isInbound) {
        if (v2.status === STREAM_STATUS.Schedule) {
          title = `${t('streams.stream-list.title-scheduled-from')} (${shortenAddress(`${v2.treasurer}`)})`;
        } else if (v2.status === STREAM_STATUS.Paused) {
          title = `${t('streams.stream-list.title-paused-from')} (${shortenAddress(`${v2.treasurer}`)})`;
        } else {
          title = `${t('streams.stream-list.title-receiving-from')} (${shortenAddress(`${v2.treasurer}`)})`;
        }
      } else {
        if (v2.status === STREAM_STATUS.Schedule) {
          title = `${t('streams.stream-list.title-scheduled-to')} (${shortenAddress(`${v2.beneficiary}`)})`;
        } else if (v2.status === STREAM_STATUS.Paused) {
          title = `${t('streams.stream-list.title-paused-to')} (${shortenAddress(`${v2.beneficiary}`)})`;
        } else {
          title = `${t('streams.stream-list.title-sending-to')} (${shortenAddress(`${v2.beneficiary}`)})`;
        }
      }
    }
    return title;
  }, [
    t,
    isInboundStream
  ]);

  const getStreamSubTitle = useCallback((item: Stream | StreamInfo) => {
    let title = '';

    if (item) {
      const v1 = item as StreamInfo;
      const v2 = item as Stream;
      const isInbound = isInboundStream(item);
      let rateAmount = item.rateAmount > 0 ? getRateAmountDisplay(item) : getTransferAmountDisplay(item);
      if (item.rateAmount > 0) {
        rateAmount += ' ' + getIntervalFromSeconds(item.rateIntervalInSeconds, false, t);
      }

      if (v1.version < 2) {
        if (isInbound) {
          if (v1.state === STREAM_STATE.Schedule) {
            title = t('streams.stream-list.subtitle-scheduled-inbound', {
              rate: rateAmount
            });
            title += ` ${getShortDate(v1.startUtc as string)}`;
          } else {
            title = t('streams.stream-list.subtitle-running-inbound', {
              rate: rateAmount
            });
            title += ` ${getShortDate(v1.startUtc as string)}`;
          }
        } else {
          if (v1.state === STREAM_STATE.Schedule) {
            title = t('streams.stream-list.subtitle-scheduled-outbound', {
              rate: rateAmount
            });
            title += ` ${getShortDate(v1.startUtc as string)}`;
          } else {
            title = t('streams.stream-list.subtitle-running-outbound', {
              rate: rateAmount
            });
            title += ` ${getShortDate(v1.startUtc as string)}`;
          }
        }
      } else {
        if (isInbound) {
          if (v2.status === STREAM_STATUS.Schedule) {
            title = t('streams.stream-list.subtitle-scheduled-inbound', {
              rate: rateAmount
            });
            title += ` ${getShortDate(v2.startUtc as string)}`;
          } else {
            title = t('streams.stream-list.subtitle-running-inbound', {
              rate: rateAmount
            });
            title += ` ${getShortDate(v2.startUtc as string)}`;
          }
        } else {
          if (v2.status === STREAM_STATUS.Schedule) {
            title = t('streams.stream-list.subtitle-scheduled-outbound', {
              rate: rateAmount
            });
            title += ` ${getShortDate(v2.startUtc as string)}`;
          } else {
            title = t('streams.stream-list.subtitle-running-outbound', {
              rate: rateAmount
            });
            title += ` ${getShortDate(v2.startUtc as string)}`;
          }
        }
      }
    }

    return title;

  }, [
    t,
    isInboundStream,
    getRateAmountDisplay,
    getTransferAmountDisplay,
  ]);

  const toggleOverflowEllipsisMiddle = useCallback((state: boolean) => {
    const ellipsisElements = document.querySelectorAll(".ant-select.token-selector-dropdown .ant-select-selector .ant-select-selection-item");
    if (ellipsisElements && ellipsisElements.length) {
      const element = ellipsisElements[0];
      if (state) {
        if (!element.classList.contains('overflow-ellipsis-middle')) {
          element.classList.add('overflow-ellipsis-middle');
        }
      } else {
        if (element.classList.contains('overflow-ellipsis-middle')) {
          element.classList.remove('overflow-ellipsis-middle');
        }
      }
      setTimeout(() => {
        triggerWindowResize();
      }, 10);
    }
  }, []);

  const setCustomToken = useCallback((address: string) => {

    if (address && isValidAddress(address)) {
      const unkToken: TokenInfo = {
        address: address,
        name: CUSTOM_TOKEN_NAME,
        chainId: 101,
        decimals: 6,
        symbol: shortenAddress(address),
      };
      setSelectedToken(unkToken);
      consoleOut("token selected:", unkToken, 'blue');
      toggleOverflowEllipsisMiddle(true);
    } else {
      openNotification({
        title: t('notifications.error-title'),
        description: t('transactions.validation.invalid-solana-address'),
        type: "error"
      });
    }
  }, [
    toggleOverflowEllipsisMiddle,
    setSelectedToken,
    t,
  ]);

  const selectFromTokenBalance = useCallback(() => {
    if (!selectedToken) { return nativeBalance; }
    return selectedToken.address === WRAPPED_SOL_MINT_ADDRESS
      ? nativeBalance
      : tokenBalance
  }, [nativeBalance, selectedToken, tokenBalance]);

  /////////////////////
  // Data management //
  /////////////////////

  // When modal goes visible, Set available balance in BN either from user's wallet or from treasury is a streams is being funded
  useEffect(() => {
    if (isVisible && vestingContract && selectedToken) {
      const decimals = selectedToken ? selectedToken.decimals : 6;
      if (highLightableStreamId) {
        // Take source balance from the treasury
        const unallocated = vestingContract.balance - vestingContract.allocationAssigned;
        const ub = new BN(unallocated);
        consoleOut('Treasury unallocated balance:', ub.toNumber(), 'blue');
        setAvailableBalance(ub);
      } else {
        // Take source balance from the user's wallet
        const balance = makeInteger(selectFromTokenBalance(), decimals);
        consoleOut(`User's balance:`, balance.toNumber(), 'blue');
        setAvailableBalance(balance);
      }
    } else {
      setAvailableBalance(new BN(0));
    }
  }, [
    tokenBalance,
    selectedToken,
    isVisible,
    vestingContract,
    highLightableStreamId,
    selectFromTokenBalance,
  ]);

  // When modal goes visible, use the treasury associated token or use the default from the appState
  useEffect(() => {
    if (isVisible && associatedToken) {
      const token = getTokenByMintAddress(associatedToken);
      if (token) {
        consoleOut("Contract Associated Token:", token, 'darkgreen');
        setSelectedToken(token);
      } else {
        setCustomToken(associatedToken as string);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isVisible,
    associatedToken,
  ]);

  // When modal goes visible, update allocation type option
  useEffect(() => {
    if (!vestingContract) { return; }
    setTreasuryType(vestingContract.treasuryType);
    if (highLightableStreamId) {
      setAllocationOption(AllocationType.Specific);
    } else {
      setAllocationOption(AllocationType.None);
    }
  }, [
    vestingContract,
    treasuryStreams,
    highLightableStreamId,
  ]);

  // When modal goes visible, set template data
  useEffect(() => {
    if (isVisible && streamTemplate) {
      setIsFeePaidByTreasurer(streamTemplate.feePayedByTreasurer);
    }
  }, [
    isVisible,
    streamTemplate,
  ]);

  // Window resize listener
  useEffect(() => {
    const resizeListener = () => {
      const NUM_CHARS = 4;
      const ellipsisElements = document.querySelectorAll(".overflow-ellipsis-middle");
      for (let i = 0; i < ellipsisElements.length; ++i){
        const e = ellipsisElements[i] as HTMLElement;
        if (e.offsetWidth < e.scrollWidth){
          const text = e.textContent;
          e.dataset.tail = text?.slice(text.length - NUM_CHARS);
        }
      }
    };
    // Call it a first time
    resizeListener();

    // set resize listener
    window.addEventListener('resize', resizeListener);

    // clean up function
    return () => {
      // remove resize listener
      window.removeEventListener('resize', resizeListener);
    }
  }, []);

  ////////////////
  //   Events   //
  ////////////////

  const triggerWindowResize = () => {
    window.dispatchEvent(new Event('resize'));
  }

  const onAcceptModal = () => {
    const params: VestingContractTopupParams = {
      amount: topupAmount,
      tokenAmount: tokenAmount,
      allocationType: allocationOption,
      associatedToken: selectedToken
        ? selectedToken.address === WRAPPED_SOL_MINT_ADDRESS
          ? NATIVE_SOL
          : selectedToken
        : undefined,
      streamId: highLightableStreamId && allocationOption === AllocationType.Specific
                ? highLightableStreamId : ''
    };
    handleOk(params);
  }

  const onCloseModal = () => {
    handleClose();
  }

  const onAfterClose = () => {
    setTimeout(() => {
      setTopupAmount('');
      setTokenAmount(new BN(0));
    }, 50);
    setTransactionStatus({
        lastOperation: TransactionStatus.Iddle,
        currentOperation: TransactionStatus.Iddle
    });
  }

  const refreshPage = () => {
    handleClose();
    window.location.reload();
  }

  const handleAmountChange = (e: any) => {

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
      setTopupAmount("");
      setTokenAmount(0);
    } else if (newValue === '.') {
      setTopupAmount(".");
    } else if (isValidNumber(newValue)) {
      setTopupAmount(newValue);
      setTokenAmount(makeInteger(newValue, selectedToken?.decimals || 6));
    }
  };

  // const handleAllocationOptionChange = (val: SelectOption) => {
  //   setAllocationOption(val.value);
  // }

  const onTokenChange = (e: any) => {
    consoleOut("token selected:", e, 'blue');
    const token = getTokenByMintAddress(e);
    if (token) {
      setSelectedToken(token as TokenInfo);
      toggleOverflowEllipsisMiddle(false);
    }
  }

  const onCustomTokenChange = (e: any) => {
    setCustomTokenInput(e.target.value);
  }

  //////////////////
  //  Validation  //
  //////////////////

  const isValidInput = (): boolean => {
    return publicKey &&
           selectedToken &&
           availableBalance && availableBalance.toNumber() > 0 &&
           tokenAmount && tokenAmount.toNumber() > 0 &&
           tokenAmount.lte(getMaxAmount())
            ? true
            : false;
  }

  const isTopupFormValid = () => {
    return publicKey &&
           isValidInput() &&
           ((allocationOption !== AllocationType.Specific) ||
            (allocationOption === AllocationType.Specific && highLightableStreamId))
          ? true
          : false;
  }

  ///////////////
  // Rendering //
  ///////////////

  const renderStream = () => {

    const item = getSelectedStream(highLightableStreamId);
    if (!item) { return null; }

    return (
      <div className={`transaction-list-row no-pointer`}>
        <div className="icon-cell">{getStreamIcon(item)}</div>
        <div className="description-cell">
          <div className="title text-truncate">{getStreamDescription(item)}</div>
          <div className="subtitle text-truncate">{getStreamSubTitle(item)}</div>
        </div>
        <div className="rate-cell">
          <div className="rate-amount">
            {item && item.rateAmount > 0 ? getRateAmountDisplay(item) : getTransferAmountDisplay(item)}
          </div>
          {item && item.rateAmount > 0 && (
            <div className="interval">{getIntervalFromSeconds(item.rateIntervalInSeconds, false, t)}</div>
          )}
        </div>
      </div>
    )
  };

  return (
    <Modal
      className="mean-modal simple-modal unpadded-content"
      title={
        <div className="modal-title">
          {highLightableStreamId
            ? t('treasuries.add-funds.modal-title-fund-stream')
            : t('vesting.add-funds.modal-title')
          }
        </div>
      }
      maskClosable={false}
      footer={null}
      visible={isVisible}
      onOk={onAcceptModal}
      onCancel={onCloseModal}
      afterClose={onAfterClose}
      width={isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}>
      <div className="scrollable-content pl-5 pr-4 py-2">

        <div className={!isBusy ? "panel1 show" : "panel1 hide"}>

          {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
            <>
              {/* Top up amount */}
              <div className="mb-3">
                {highLightableStreamId ? (
                  <>
                    <p>{t('treasuries.add-funds.allocation-heading')}</p>
                    <div className="form-label">{t('treasuries.add-funds.allocation-amount-label')}</div>
                  </>
                ) : (
                  <div className="form-label">{t('treasuries.add-funds.label')}</div>
                )}
                <div className={`well ${isBusy ? 'disabled' : ''}`}>
                  <div className="flex-fixed-left">
                    <div className="left">
                      <span className="add-on">
                        {(selectedToken && tokenList) && (
                          <Select className={`token-selector-dropdown ${associatedToken ? 'click-disabled' : ''}`} value={selectedToken.address}
                              onChange={onTokenChange} bordered={false} showArrow={false}
                              dropdownRender={menu => (
                              <div>
                                {menu}
                                <Divider style={{ margin: '4px 0' }} />
                                <div style={{ display: 'flex', flexWrap: 'nowrap', padding: 8 }}>
                                  <Input style={{ flex: 'auto' }} value={customTokenInput} onChange={onCustomTokenChange} />
                                  <div style={{ flex: '0 0 auto' }} className="flex-row align-items-center">
                                    <span className="flat-button icon-button ml-1" onClick={() => setCustomToken(customTokenInput)}><IconCheckedBox className="normal"/></span>
                                  </div>
                                </div>
                              </div>
                            )}>
                            {tokenList.map((option) => {
                              if (option.address === NATIVE_SOL.address) {
                                return null;
                              }
                              return (
                                <Option key={option.address} value={option.address}>
                                  <div className="option-container">
                                    <TokenDisplay onClick={() => {}}
                                      mintAddress={option.address}
                                      name={option.name}
                                      showCaretDown={associatedToken ? false : true}
                                    />
                                    <div className="balance">
                                      {userBalances && userBalances[option.address] > 0 && (
                                        <span>{getTokenAmountAndSymbolByTokenAddress(userBalances[option.address], option.address, true)}</span>
                                      )}
                                    </div>
                                  </div>
                                </Option>
                              );
                            })}
                          </Select>
                        )}
                        {selectedToken && availableBalance ? (
                          <div
                            id="treasury-add-funds-max"
                            className="token-max simplelink"
                            onClick={() => {
                              const decimals = selectedToken.decimals;
                              if (selectedToken.address === WRAPPED_SOL_MINT_ADDRESS) {
                                const maxSolAmount = getMaxPossibleSolAmount();
                                consoleOut('nativeBalance:', nativeBalance, 'darkgreen');
                                consoleOut('minRequiredBalance:', minRequiredBalance, 'darkgreen');
                                consoleOut('maxSolAmount:', maxSolAmount, 'darkgreen');
                                setTopupAmount(cutNumber(maxSolAmount, decimals));
                                setTokenAmount(new BN(maxSolAmount));
                              } else {
                                if (isFeePaidByTreasurer) {
                                  const maxAmount = getMaxAmount(true);
                                  consoleOut('Treasury pays for fees...', '', 'blue');
                                  consoleOut('Settings maxAmount to:', maxAmount, 'blue');
                                  setTopupAmount(cutNumber(makeDecimal(new BN(maxAmount), decimals), decimals));
                                  setTokenAmount(new BN(maxAmount));
                                } else {
                                  const maxAmount = getMaxAmount();
                                  consoleOut('Settings maxAmount to:', maxAmount.toNumber(), 'blue');
                                  setTopupAmount(cutNumber(makeDecimal(new BN(maxAmount), decimals), decimals));
                                  setTokenAmount(new BN(maxAmount));
                                }
                              }
                            }}>
                            MAX
                          </div>
                        ) : null}
                      </span>
                    </div>
                    <div className="right">
                      <input
                        id="topup-amount-field"
                        className="general-text-input text-right"
                        inputMode="decimal"
                        autoComplete="off"
                        autoCorrect="off"
                        type="text"
                        onChange={handleAmountChange}
                        pattern="^[0-9]*[.,]?[0-9]*$"
                        placeholder="0.0"
                        minLength={1}
                        maxLength={79}
                        spellCheck="false"
                        value={topupAmount}
                      />
                    </div>
                  </div>
                  <div className="flex-fixed-right">
                    <div className="left inner-label">
                      {!highLightableStreamId ? (
                        <span>{t('add-funds.label-right')}:</span>
                      ) : (
                        <span>{t('treasuries.treasury-streams.available-unallocated-balance-label')}:</span>
                      )}
                      <span>
                        {`${availableBalance && selectedToken
                            ? getTokenAmountAndSymbolByTokenAddress(
                                makeDecimal(availableBalance, selectedToken.decimals),
                                selectedToken?.address,
                                true
                              )
                            : "0"
                        }`}
                      </span>
                    </div>
                    <div className="right inner-label">
                      <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
                        ~{topupAmount
                          ? toUsCurrency(getTokenPrice(topupAmount))
                          : "$0.00"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {allocationOption === AllocationType.Specific && (
                <div className="mb-3">
                  <div className="form-label">{t('treasuries.add-funds.money-stream-to-topup-label')}</div>
                  <div className="well">
                    {renderStream()}
                  </div>
                </div>
              )}

            </>
          ) : transactionStatus.currentOperation === TransactionStatus.TransactionFinished ? (
            <>
              <div className="transaction-progress">
                <CheckOutlined style={{ fontSize: 48 }} className="icon mt-0" />
                <h4 className="font-bold">{t('treasuries.add-funds.success-message')}</h4>
              </div>
            </>
          ) : (
            <>
              <div className="transaction-progress p-0">
                <InfoCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
                {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                  <h4 className="mb-4">
                    {t('transactions.status.tx-start-failure', {
                      accountBalance: getTokenAmountAndSymbolByTokenAddress(
                        nativeBalance,
                        NATIVE_SOL_MINT.toBase58()
                      ),
                      feeAmount: getTokenAmountAndSymbolByTokenAddress(
                        transactionFees.blockchainFee + transactionFees.mspFlatFee,
                        NATIVE_SOL_MINT.toBase58()
                      )})
                    }
                  </h4>
                ) : (
                  <h4 className="font-bold mb-3">
                    {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
                  </h4>
                )}
              </div>
            </>
          )}

        </div>

        <div className={isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle ? "panel2 show" : "panel2 hide"}>
          {isBusy && transactionStatus !== TransactionStatus.Iddle && (
          <div className="transaction-progress">
            <Spin indicator={bigLoadingIcon} className="icon mt-0" />
            <h4 className="font-bold mb-1">
              {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
            </h4>
            {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
              <div className="indication">{t('transactions.status.instructions')}</div>
            )}
          </div>
          )}
        </div>

        {!(isBusy && transactionStatus !== TransactionStatus.Iddle) && (
          <div className="row two-col-ctas mt-3 transaction-progress p-0">
            <div className={!isError(transactionStatus.currentOperation) ? "col-6" : "col-12"}>
              <Button
                block
                type="text"
                shape="round"
                size="middle"
                className={isBusy ? 'inactive' : ''}
                onClick={() => isError(transactionStatus.currentOperation)
                  ? onAcceptModal()
                  : onCloseModal()}>
                {isError(transactionStatus.currentOperation)
                  ? t('general.retry')
                  : t('general.cta-close')
                }
              </Button>
            </div>
            {!isError(transactionStatus.currentOperation) && (
              <div className="col-6">
                <Button
                  className={isBusy ? 'inactive' : ''}
                  block
                  type="primary"
                  shape="round"
                  size="middle"
                  disabled={!isTopupFormValid()}
                  onClick={() => {
                    if (transactionStatus.currentOperation === TransactionStatus.Iddle) {
                      onAcceptModal();
                    } else {
                      refreshPage();
                    }
                  }}>
                  {isBusy
                    ? allocationOption === AllocationType.Specific && highLightableStreamId
                      ? t('treasuries.add-funds.main-cta-fund-stream-busy')
                      : t('treasuries.add-funds.main-cta-busy')
                    : transactionStatus.currentOperation === TransactionStatus.Iddle
                      ? getTransactionStartButtonLabel()
                      : t('general.refresh')
                  }
                </Button>
              </div>
            )}
          </div>
        )}

        {!isBusy && !highLightableStreamId && transactionStatus.currentOperation === TransactionStatus.Iddle && (
          <div className={`buy-token-options text-center mt-4 mb-2`}>
            <p>You can also fund this contract by sending {selectedToken?.symbol} tokens to:</p>

            {showQrCode && vestingContract && (
              <>
                <div className="qr-container bg-white">
                  <QRCodeSVG
                    value={vestingContract.id as string}
                    size={200}
                  />
                </div>
              </>
            )}

            {vestingContract && (
              <div className="flex-center font-size-70 mb-2">
                <AddressDisplay
                  address={vestingContract.id as string}
                  showFullAddress={true}
                  iconStyles={{ width: "15", height: "15" }}
                  newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${vestingContract.id as string}${getSolanaExplorerClusterParam()}`}
                />
              </div>
            )}

            {!showQrCode && (
              <div className="simplelink underline" onClick={() => {setShowQrCode(true)}}>Scan QR code instead?</div>
            )}

          </div>
        )}

      </div>
    </Modal>
  );
};
