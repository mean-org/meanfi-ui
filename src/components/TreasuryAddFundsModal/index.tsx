import React, { useCallback, useEffect, useMemo } from 'react';
import { useContext, useState } from 'react';
import { Modal, Button, Select, Dropdown, Menu, AutoComplete, Divider, Input } from 'antd';
import { AppStateContext } from '../../contexts/appstate';
import { useTranslation } from 'react-i18next';
import { TokenInfo } from '@solana/spl-token-registry';
import { getTokenByMintAddress } from '../../utils/tokens';
import { LoadingOutlined } from '@ant-design/icons';
import { TokenDisplay } from '../TokenDisplay';
import { formatAmount, getTokenAmountAndSymbolByTokenAddress, getTokenSymbol, isValidNumber, shortenAddress } from '../../utils/utils';
import { IconCaretDown, IconCheckedBox, IconDownload, IconIncomingPaused, IconOutgoingPaused, IconTimer, IconUpload } from '../../Icons';
import { consoleOut, getFormattedNumberToLocale, getIntervalFromSeconds, getShortDate, isValidAddress } from '../../utils/ui';
import { TreasuryStreamsBreakdown } from '../../models/streams';
import { StreamInfo, STREAM_STATE } from '@mean-dao/money-streaming/lib/types';
import { SelectOption, TreasuryTopupParams } from '../../models/common-types';
import { AllocationType } from '../../models/enums';
import { useWallet } from '../../contexts/wallet';
import { notify } from '../../utils/notifications';

const { Option } = Select;

interface StreamSummary {
  allocationReserved: number;
  associatedToken: string;
  beneficiaryAddress: string;
  id: string;
  rateAmount: number;
  rateIntervalInSeconds: number;
  state: STREAM_STATE;
  streamName: String;
  streamSubtitle: String;
};

export const TreasuryAddFundsModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  userBalances: any;
  isBusy: boolean;
  streamStats: TreasuryStreamsBreakdown | undefined;
  treasuryStreams: StreamInfo[];
  associatedToken: string;
}) => {
  const {
    tokenList,
    coinPrices,
    tokenBalance,
    selectedToken,
    effectiveRate,
    treasuryOption,
    setEffectiveRate,
    setSelectedToken,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const [topupAmount, setTopupAmount] = useState<string>('');
  const [allocationOption, setAllocationOption] = useState<AllocationType>(AllocationType.None);
  const [streamSummaries, setStreamSummaries] = useState<StreamSummary[]>([]);
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

  const getStreamIcon = useCallback((item: StreamSummary) => {
    const isInbound = item.beneficiaryAddress === publicKey?.toBase58() ? true : false;
    
    if (isInbound) {
      switch (item.state) {
        case STREAM_STATE.Schedule:
          return (<IconTimer className="mean-svg-icons incoming" />);
        case STREAM_STATE.Paused:
          return (<IconIncomingPaused className="mean-svg-icons incoming" />);
        default:
          return (<IconDownload className="mean-svg-icons incoming" />);
      }
    } else {
      switch (item.state) {
        case STREAM_STATE.Schedule:
          return (<IconTimer className="mean-svg-icons outgoing" />);
        case STREAM_STATE.Paused:
          return (<IconOutgoingPaused className="mean-svg-icons outgoing" />);
        default:
          return (<IconUpload className="mean-svg-icons outgoing" />);
      }
    }
  }, [
    publicKey
  ]);

  const getStreamDescription = useCallback((item: StreamInfo): string => {
    let title = '';
    const isInbound = item.beneficiaryAddress === publicKey?.toBase58() ? true : false;

    if (isInbound) {
      if (item.isUpdatePending) {
        title = `${t('streams.stream-list.title-pending-from')} (${shortenAddress(`${item.treasurerAddress}`)})`;
      } else if (item.state === STREAM_STATE.Schedule) {
        title = `${t('streams.stream-list.title-scheduled-from')} (${shortenAddress(`${item.treasurerAddress}`)})`;
      } else if (item.state === STREAM_STATE.Paused) {
        title = `${t('streams.stream-list.title-paused-from')} (${shortenAddress(`${item.treasurerAddress}`)})`;
      } else {
        title = `${t('streams.stream-list.title-receiving-from')} (${shortenAddress(`${item.treasurerAddress}`)})`;
      }
    } else {
      if (item.isUpdatePending) {
        title = `${t('streams.stream-list.title-pending-to')} (${shortenAddress(`${item.beneficiaryAddress}`)})`;
      } else if (item.state === STREAM_STATE.Schedule) {
        title = `${t('streams.stream-list.title-scheduled-to')} (${shortenAddress(`${item.beneficiaryAddress}`)})`;
      } else if (item.state === STREAM_STATE.Paused) {
        title = `${t('streams.stream-list.title-paused-to')} (${shortenAddress(`${item.beneficiaryAddress}`)})`;
      } else {
        title = `${t('streams.stream-list.title-sending-to')} (${shortenAddress(`${item.beneficiaryAddress}`)})`;
      }
    }
    return title;
  }, [
    t,
    publicKey
  ]);

  const getTransactionSubTitle = useCallback((item: StreamInfo) => {
    let title = '';
    const isInbound = item.beneficiaryAddress === publicKey?.toBase58() ? true : false;
    const isOtp = item.rateAmount === 0 ? true : false;

    if (isInbound) {
      if (item.isUpdatePending) {
        title = t('streams.stream-list.subtitle-pending-inbound');
        return title;
      }

      switch (item.state) {
        case STREAM_STATE.Schedule:
          title = t('streams.stream-list.subtitle-scheduled-inbound');
          title += ` ${getShortDate(item.startUtc as string)}`;
          break;
        case STREAM_STATE.Paused:
          if (isOtp) {
            title = t('streams.stream-list.subtitle-paused-otp');
          } else {
            title = t('streams.stream-list.subtitle-paused-inbound');
          }
          break;
        case STREAM_STATE.Running:
          title = t('streams.stream-list.subtitle-running-inbound');
          title += ` ${getShortDate(item.startUtc as string)}`;
          break;
        default:
          break;
      }
    } else {
      if (item.isUpdatePending) {
        title = t('streams.stream-list.subtitle-pending-outbound');
        return title;
      }

      switch (item.state) {
        case STREAM_STATE.Schedule:
          title = t('streams.stream-list.subtitle-scheduled-outbound');
          title += ` ${getShortDate(item.startUtc as string)}`;
          break;
        case STREAM_STATE.Paused:
          if (isOtp) {
            title = t('streams.stream-list.subtitle-paused-otp');
          } else {
            title = t('streams.stream-list.subtitle-paused-outbound');
          }
          break;
        case STREAM_STATE.Running:
          title = t('streams.stream-list.subtitle-running-outbound');
          title += ` ${getShortDate(item.startUtc as string)}`;
          break;
        default:
          break;
      }
    }
    return title;

  }, [
    t,
    publicKey
  ]);

  const getRateAmountDisplay = (item: StreamSummary): string => {
    let value = '';
    if (item && item.rateAmount && item.associatedToken) {
      value += getFormattedNumberToLocale(formatAmount(item.rateAmount, 2));
      value += ' ';
      value += getTokenSymbol(item.associatedToken as string);
    }
    return value;
  }

  const getTransferAmountDisplay = (item: StreamSummary): string => {
    let value = '';
    if (item && item.rateAmount === 0 && item.allocationReserved > 0) {
      value += getFormattedNumberToLocale(formatAmount(item.allocationReserved, 2));
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

  // When modal goes visible, Build a list of StreamSummary from treasuryStreams
  useEffect(() => {
    if (props.isVisible && props.streamStats && props.streamStats.total > 0 && props.treasuryStreams && props.treasuryStreams.length > 0) {
      const summaries = props.treasuryStreams.map(item => {
        return {
          allocationReserved: item.allocationReserved,
          associatedToken: item.associatedToken,
          beneficiaryAddress: item.beneficiaryAddress,
          id: item.id,
          rateAmount: item.rateAmount,
          rateIntervalInSeconds: item.rateIntervalInSeconds,
          state: item.state,
          streamName: item.streamName || getStreamDescription(item),
          streamSubtitle: getTransactionSubTitle(item),
        } as StreamSummary;
      });
      setStreamSummaries(summaries);
      if (summaries.length === 1) {
        setAllocationOption(AllocationType.Specific);
      } else {
        setAllocationOption(AllocationType.All);
      }
    }
  }, [
    props.isVisible,
    props.streamStats,
    props.treasuryStreams,
    getStreamDescription,
    getTransactionSubTitle
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

  const onAcceptTopup = () => {
    props.handleOk({
      amount: topupAmount,
      allocationType: allocationOption,
      streamId: allocationOption === AllocationType.Specific
                ? selectedStreamForAllocation : ''
    } as TreasuryTopupParams);
  }

  const onStreamSelected = (e: any) => {
    consoleOut('selectedStreamForAllocation:', e, 'blue');
    setSelectedStreamForAllocation(e);
  }

  const setValue = (value: string) => {
    setTopupAmount(value);
  }

  const handleAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setValue("");
    } else if (newValue === '.') {
      setValue(".");
    } else if (isValidNumber(newValue)) {
      setValue(newValue);
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

  const renderStreamSelectItem = (item: StreamSummary) => ({
    key: item.streamName as string,
    value: item.id as string,
    label: (
      <div className={`transaction-list-row`}>
        <div className="icon-cell">
          {getStreamIcon(item)}
        </div>
        <div className="description-cell">
          <div className="title text-truncate">{item.streamName}</div>
          <div className="subtitle text-truncate">{item.streamSubtitle}</div>
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
    const options = streamSummaries.map((stream: StreamSummary, index: number) => {
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
      className="mean-modal"
      title={<div className="modal-title">{t('treasuries.add-funds.modal-title')}</div>}
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptTopup}
      onCancel={props.handleClose}
      afterClose={() => setValue('')}
      width={480}>

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
                    onClick={() => setValue(
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
              ~${topupAmount && effectiveRate
                ? formatAmount(parseFloat(topupAmount) * effectiveRate, 2)
                : "0.00"}
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
                    const originalItem = streamSummaries.find(i => i.streamName === option!.key);
                    return option!.value.indexOf(inputValue) !== -1 || originalItem?.streamName.indexOf(inputValue) !== -1
                  }}
                  onSelect={onStreamSelected}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <Button
        className={`main-cta ${props.isBusy ? 'inactive' : ''}`}
        block
        type="primary"
        shape="round"
        size="large"
        disabled={!isTopupFormValid()}
        onClick={onAcceptTopup}>
        {props.isBusy && (
          <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
        )}
        {props.isBusy
          ? t('treasuries.add-funds.main-cta-busy')
          : getTransactionStartButtonLabel()}
      </Button>
    </Modal>
  );
};
