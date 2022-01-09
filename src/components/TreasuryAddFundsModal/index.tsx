import React, { useCallback, useEffect, useMemo } from 'react';
import { useContext, useState } from 'react';
import { Modal, Button, Select, Dropdown, Menu, AutoComplete, Divider, Input, Spin } from 'antd';
import { AppStateContext } from '../../contexts/appstate';
import { useTranslation } from 'react-i18next';
import { TokenInfo } from '@solana/spl-token-registry';
import { getTokenByMintAddress } from '../../utils/tokens';
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { TokenDisplay } from '../TokenDisplay';
import { formatAmount, getTokenAmountAndSymbolByTokenAddress, getTokenSymbol, isValidNumber, shortenAddress, toUiAmount } from '../../utils/utils';
import { IconCaretDown, IconCheckedBox, IconDownload, IconIncomingPaused, IconOutgoingPaused, IconTimer, IconUpload } from '../../Icons';
import { consoleOut, getFormattedNumberToLocale, getIntervalFromSeconds, getShortDate, getTransactionOperationDescription, isValidAddress } from '../../utils/ui';
import { TreasuryStreamsBreakdown } from '../../models/streams';
import { StreamInfo, STREAM_STATE, TransactionFees } from '@mean-dao/money-streaming/lib/types';
import { SelectOption, TreasuryTopupParams } from '../../models/common-types';
import { AllocationType, TransactionStatus } from '../../models/enums';
import { useWallet } from '../../contexts/wallet';
import { notify } from '../../utils/notifications';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { isError } from '../../utils/transactions';
import { Stream, STREAM_STATUS } from '@mean-dao/msp';
import BN from 'bn.js';

const { Option } = Select;
const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const TreasuryAddFundsModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  userBalances: any;
  isBusy: boolean;
  nativeBalance: number;
  transactionFees: TransactionFees;
  streamStats: TreasuryStreamsBreakdown | undefined;
  treasuryStreams: (Stream | StreamInfo)[];
  associatedToken: string;
}) => {
  const {
    tokenList,
    coinPrices,
    tokenBalance,
    selectedToken,
    effectiveRate,
    loadingPrices,
    transactionStatus,
    setTransactionStatus,
    setSelectedToken,
    setEffectiveRate,
    refreshPrices,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const [topupAmount, setTopupAmount] = useState<string>('');
  const [allocationOption, setAllocationOption] = useState<AllocationType>(AllocationType.None);
  const [customTokenInput, setCustomTokenInput] = useState("");
  const [selectedStreamForAllocation, setSelectedStreamForAllocation] = useState('');

  const numTreasuryStreams = useCallback(() => {
    return props.treasuryStreams ? props.treasuryStreams.length : 0;
  }, [props.treasuryStreams]);

  const allocationOptions = useMemo(() => {
    const options: SelectOption[] = [];
    options.push({
      key: AllocationType.All,
      label: t('treasuries.add-funds.allocation-option-evenly'),
      value: AllocationType.All,
      visible: numTreasuryStreams() > 1
    });
    options.push({
      key: AllocationType.Specific,
      label: t('treasuries.add-funds.allocation-option-specific'),
      value: AllocationType.Specific,
      visible: numTreasuryStreams() >= 1
    });
    options.push({
      key: AllocationType.None,
      label: t('treasuries.add-funds.allocation-option-none'),
      value: AllocationType.None,
      visible: true
    });
    return options;
  }, [t, numTreasuryStreams]);

  /////////////////
  //   Getters   //
  /////////////////

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

  const getPricePerToken = (token: TokenInfo): number => {
    const tokenSymbol = token.symbol.toUpperCase();
    const symbol = tokenSymbol[0] === 'W' ? tokenSymbol.slice(1) : tokenSymbol;

    return coinPrices && coinPrices[symbol]
      ? coinPrices[symbol]
      : 0;
  }

  const getTransactionStartButtonLabel = (): string => {
    return !selectedToken || !tokenBalance
      ? t('transactions.validation.no-balance')
      : !topupAmount || !isValidNumber(topupAmount) || !parseFloat(topupAmount)
      ? t('transactions.validation.no-amount')
      : parseFloat(topupAmount) > tokenBalance
      ? t('transactions.validation.amount-high')
      : allocationOption === AllocationType.Specific && !selectedStreamForAllocation
      ? t('transactions.validation.select-stream')
      : t('treasuries.add-funds.main-cta');
  }

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
    isInboundStream
  ]);

  const getRateAmountDisplay = (item: Stream | StreamInfo): string => {
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
  }

  const getTransferAmountDisplay = (item: Stream | StreamInfo): string => {
    let value = '';

    if (item && item.rateAmount === 0 && item.allocationReserved > 0) {
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
  }

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
        name: 'Unknown',
        chainId: 101,
        decimals: 6,
        symbol: shortenAddress(address),
      };
      setSelectedToken(unkToken);
      consoleOut("token selected:", unkToken, 'blue');
      setEffectiveRate(0);
      toggleOverflowEllipsisMiddle(true);
    } else {
      notify({
        message: t('notifications.error-title'),
        description: t('transactions.validation.invalid-solana-address'),
        type: "error"
      });
    }
  }, [
    toggleOverflowEllipsisMiddle,
    setEffectiveRate,
    setSelectedToken,
    t,
  ]);

  const getStreamName = useCallback((item: Stream | StreamInfo | undefined) => {
    if (item) {
      const v1 = item as StreamInfo;
      const v2 = item as Stream;
      return v1.version < 2 ? v1.streamName : v2.name;
    }
    return '';
  }, []);

  /////////////////////
  // Data management //
  /////////////////////

  // When modal goes visible, use the treasury associated token or use the default from the appState
  useEffect(() => {
    if (props.isVisible && props.associatedToken) {
      const token = tokenList.find(t => t.address === props.associatedToken);
      if (token) {
        if (!selectedToken || selectedToken.address !== token.address) {
          setSelectedToken(token);
        }
      } else if (!token && (!selectedToken || selectedToken.address !== props.associatedToken)) {
        setCustomToken(props.associatedToken);
      }
    }
  }, [
    tokenList,
    selectedToken,
    props.isVisible,
    props.associatedToken,
    setCustomToken,
    setSelectedToken,
    toggleOverflowEllipsisMiddle
  ]);

  // When modal goes visible, update allocation type option
  useEffect(() => {
    if (props.treasuryStreams && props.treasuryStreams.length > 0) {
      if (props.treasuryStreams.length === 1) {
        setAllocationOption(AllocationType.Specific);
      } else {
        setAllocationOption(AllocationType.All);
      }
    }
  }, [
    props.treasuryStreams,
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
    props.handleOk({
      amount: topupAmount,
      allocationType: allocationOption,
      streamId: allocationOption === AllocationType.Specific
                ? selectedStreamForAllocation : ''
    } as TreasuryTopupParams);
  }

  const onCloseModal = () => {
    props.handleClose();
  }

  const onAfterClose = () => {
    setTimeout(() => {
      setTopupAmount('');
    }, 50);
    setTransactionStatus({
        lastOperation: TransactionStatus.Iddle,
        currentOperation: TransactionStatus.Iddle
    });
  }

  const refreshPage = () => {
    props.handleClose();
    window.location.reload();
  }

  const onStreamSelected = (e: any) => {
    consoleOut('selectedStreamForAllocation:', e, 'blue');
    setSelectedStreamForAllocation(e);
  }

  const handleAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setTopupAmount("");
    } else if (newValue === '.') {
      setTopupAmount(".");
    } else if (isValidNumber(newValue)) {
      setTopupAmount(newValue);
    }
  };

  const handleAllocationOptionChange = (val: SelectOption) => {
    setAllocationOption(val.value);
  }

  const onTokenChange = (e: any) => {
    consoleOut("token selected:", e, 'blue');
    const token = getTokenByMintAddress(e);
    if (token) {
      setSelectedToken(token as TokenInfo);
      setEffectiveRate(getPricePerToken(token as TokenInfo));
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
    return selectedToken &&
           tokenBalance &&
           topupAmount && parseFloat(topupAmount) > 0 &&
           parseFloat(topupAmount) <= tokenBalance
            ? true
            : false;
  }

  const isTopupFormValid = () => {
    return publicKey &&
           isValidInput() &&
           ((allocationOption !== AllocationType.Specific) ||
            (allocationOption === AllocationType.Specific && selectedStreamForAllocation))
          ? true
          : false;
  }

  ///////////////
  // Rendering //
  ///////////////

  const renderStreamSelectItem = (item: Stream | StreamInfo) => ({
    key: getStreamName(item) as string,
    value: item.id as string,
    label: (
      <div className={`transaction-list-row`}>
        <div className="icon-cell">
          {getStreamIcon(item)}
        </div>
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
    ),
  });

  const renderStreamSelectOptions = () => {
    const options = props.treasuryStreams.map((stream: Stream | StreamInfo, index: number) => {
      return renderStreamSelectItem(stream);
    });
    return options;
  }

  const allocationOptionsMenu = (
    <Menu activeKey={allocationOption.toString()}>
      {allocationOptions.map((item) => {
        return (
          <Menu.Item
            className={item.visible ? 'active' : 'hidden'}
            key={`${item.key}`}
            onClick={() => handleAllocationOptionChange(item)}>
            {item.label}
          </Menu.Item>
        );
      })}
    </Menu>
  );

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{t('treasuries.add-funds.modal-title')}</div>}
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptModal}
      onCancel={onCloseModal}
      afterClose={onAfterClose}
      width={props.isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}>

      {/* sdsssd */}
      <div className={!props.isBusy ? "panel1 show" : "panel1 hide"}>

        {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
          <>
            {/* Top up amount */}
            <div className="mb-3">
              <div className="form-label">{t('treasuries.add-funds.label')}</div>
              <div className={`well ${props.isBusy && 'disabled'}`}>
                <div className="flex-fixed-left">
                  <div className="left">
                    <span className="add-on">
                      {(selectedToken && tokenList) && (
                        <Select className={`token-selector-dropdown ${props.associatedToken ? 'click-disabled' : ''}`} value={selectedToken.address}
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
                            return (
                              <Option key={option.address} value={option.address}>
                                <div className="option-container">
                                  <TokenDisplay onClick={() => {}}
                                    mintAddress={option.address}
                                    name={option.name}
                                    showCaretDown={props.associatedToken ? false : true}
                                  />
                                  <div className="balance">
                                    {props.userBalances && props.userBalances[option.address] > 0 && (
                                      <span>{getTokenAmountAndSymbolByTokenAddress(props.userBalances[option.address], option.address, true)}</span>
                                    )}
                                  </div>
                                </div>
                              </Option>
                            );
                          })}
                        </Select>
                      )}
                      {selectedToken && tokenBalance ? (
                        <div
                          className="token-max simplelink"
                          onClick={() => setTopupAmount(
                            getTokenAmountAndSymbolByTokenAddress(tokenBalance, selectedToken.address, true)
                          )}>
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
                    <span>{t('treasuries.add-funds.balance')}:</span>
                    <span>
                      {`${tokenBalance && selectedToken
                          ? getTokenAmountAndSymbolByTokenAddress(tokenBalance, selectedToken?.address, true)
                          : "0"
                      }`}
                    </span>
                  </div>
                  <div className="right inner-label">
                    <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
                      ~${topupAmount && effectiveRate
                        ? formatAmount(parseFloat(topupAmount) * effectiveRate, 2)
                        : "0.00"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Funds Allocation options */}
            {numTreasuryStreams() > 0 && (
              <div className="mb-3">
                <div className="form-label">{t('treasuries.add-funds.allocation-label')}</div>
                <div className="well">
                  <Dropdown overlay={allocationOptionsMenu} trigger={["click"]}>
                    <span className="dropdown-trigger no-decoration flex-fixed-right align-items-center">
                      <div className="left">
                        <span className="capitalize-first-letter">{allocationOptions.find(o => o.key === allocationOption)?.label}</span>
                      </div>
                      <div className="right">
                        <IconCaretDown className="mean-svg-icons" />
                      </div>
                    </span>
                  </Dropdown>
                </div>
              </div>
            )}

            {allocationOption === AllocationType.Specific && props.streamStats && props.streamStats.total > 0 && (
              <div className="mb-3">
                <div className="form-label">{t('treasuries.add-funds.allocation-select-stream-label')}</div>
                <div className="well">
                  <div className="dropdown-trigger no-decoration flex-fixed-right align-items-center">
                    <div className="left mr-0">
                      <AutoComplete
                        bordered={false}
                        style={{ width: '100%' }}
                        dropdownClassName="stream-select-dropdown"
                        options={renderStreamSelectOptions()}
                        placeholder={t('treasuries.add-funds.search-streams-placeholder')}
                        filterOption={(inputValue, option) => {
                          const originalItem = props.treasuryStreams.find(i => {
                            const streamName = i.version < 2
                              ? (i as StreamInfo).streamName
                              : (i as Stream).name;
                            return streamName === option!.key ? true : false;
                          });
                          return option!.value.indexOf(inputValue) !== -1 || getStreamName(originalItem).indexOf(inputValue) !== -1
                        }}
                        onSelect={onStreamSelected}
                      />
                    </div>
                  </div>
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
            <div className="transaction-progress">
              <InfoCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
              {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                <h4 className="mb-4">
                  {t('transactions.status.tx-start-failure', {
                    accountBalance: getTokenAmountAndSymbolByTokenAddress(
                      props.nativeBalance,
                      NATIVE_SOL_MINT.toBase58()
                    ),
                    feeAmount: getTokenAmountAndSymbolByTokenAddress(
                      props.transactionFees.blockchainFee + props.transactionFees.mspFlatFee,
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

      <div className={props.isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle ? "panel2 show" : "panel2 hide"}>
        {props.isBusy && transactionStatus !== TransactionStatus.Iddle && (
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

      {/**
       * NOTE: CTAs block may be required or not when Tx status is Finished!
       * I choose to set transactionStatus.currentOperation to TransactionStatus.TransactionFinished
       * and auto-close the modal after 1s. If we chose to NOT auto-close the modal
       * Uncommenting the commented lines below will do it!
       */}
      {transactionStatus.currentOperation !== TransactionStatus.TransactionFinished && (
        <div className="row two-col-ctas mt-3 transaction-progress">
          <div className="col-6">
            <Button
              block
              type="text"
              shape="round"
              size="middle"
              className={props.isBusy ? 'inactive' : ''}
              onClick={() => isError(transactionStatus.currentOperation)
                ? onAcceptModal()
                : onCloseModal()}>
              {isError(transactionStatus.currentOperation)
                ? t('general.retry')
                : t('general.cta-close')
              }
            </Button>
          </div>
          <div className="col-6">
            <Button
              className={props.isBusy ? 'inactive' : ''}
              block
              type="primary"
              shape="round"
              size="middle"
              disabled={!isTopupFormValid()}
              onClick={() => {
                if (transactionStatus.currentOperation === TransactionStatus.Iddle) {
                  onAcceptModal();
                // } else if (transactionStatus.currentOperation === TransactionStatus.TransactionFinished) {
                //   onCloseModal();
                } else {
                  refreshPage();
                }
              }}>
              {props.isBusy
                ? t('treasuries.add-funds.main-cta-busy')
                : transactionStatus.currentOperation === TransactionStatus.Iddle
                ? getTransactionStartButtonLabel()
                // : transactionStatus.currentOperation === TransactionStatus.TransactionFinished
                // ? t('general.cta-finish')
                : t('general.refresh')
              }
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
