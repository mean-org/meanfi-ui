import React, { useMemo } from 'react';
import { useContext, useState } from 'react';
import { Modal, Button, Select, Dropdown, Menu } from 'antd';
import { AppStateContext } from '../../contexts/appstate';
import { formatAmount, getTokenAmountAndSymbolByTokenAddress, isValidNumber } from '../../utils/utils';
import { useTranslation } from 'react-i18next';
import { TokenInfo } from '@solana/spl-token-registry';
import { consoleOut } from '../../utils/ui';
import { getTokenByMintAddress } from '../../utils/tokens';
import { LoadingOutlined } from '@ant-design/icons';
import { TokenDisplay } from '../TokenDisplay';
import { IconCaretDown } from '../../Icons';
import { SelectOption } from '../../models/common-types';
import { AllocationType } from '../../models/enums';
import { TreasuryStreamsBreakdown } from '../../models/streams';

const { Option } = Select;

export const TreasuryAddFundsModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  userBalances: any;
  isBusy: boolean;
  streamStats: TreasuryStreamsBreakdown | undefined;
}) => {
  const {
    tokenList,
    coinPrices,
    tokenBalance,
    selectedToken,
    effectiveRate,
    setEffectiveRate,
    setSelectedToken,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');

  const [topupAmount, setTopupAmount] = useState<string>('');
  const [allocationOption, setAllocationOption] = useState<AllocationType>(AllocationType.All);

  const allocationOptions = useMemo(() => {
    const options: SelectOption[] = [];
    options.push({
      key: AllocationType.All,
      label: t('treasuries.add-funds.allocation-option-evenly'),
      value: AllocationType.All
    });
    options.push({
      key: AllocationType.Specific,
      label: t('treasuries.add-funds.allocation-option-specific'),
      value: AllocationType.Specific
    });
    options.push({
      key: AllocationType.None,
      label: t('treasuries.add-funds.allocation-option-none'),
      value: AllocationType.None
    });
    return options;
  }, [t]);

  const getPricePerToken = (token: TokenInfo): number => {
    const tokenSymbol = token.symbol.toUpperCase();
    const symbol = tokenSymbol[0] === 'W' ? tokenSymbol.slice(1) : tokenSymbol;

    return coinPrices && coinPrices[symbol]
      ? coinPrices[symbol]
      : 0;
  }

  const onAcceptTopup = () => {
    props.handleOk(topupAmount);
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

  // Validation

  const isValidInput = (): boolean => {
    return selectedToken &&
           tokenBalance &&
           topupAmount && parseFloat(topupAmount) > 0 &&
           parseFloat(topupAmount) <= tokenBalance
            ? true
            : false;
  }

  const getTransactionStartButtonLabel = (): string => {
    return !selectedToken || !tokenBalance
      ? t('transactions.validation.no-balance')
      : !topupAmount || !isValidNumber(topupAmount) || !parseFloat(topupAmount)
      ? t('transactions.validation.no-amount')
      : parseFloat(topupAmount) > tokenBalance
      ? t('transactions.validation.amount-high')
      : t('treasuries.add-funds.main-cta');
  }

  const onTokenChange = (e: any) => {
    consoleOut("token selected:", e, 'blue');
    const token = getTokenByMintAddress(e);
    if (token) {
      setSelectedToken(token as TokenInfo);
      setEffectiveRate(getPricePerToken(token as TokenInfo));
    }
  }

  const allocationOptionsMenu = (
    <Menu activeKey={allocationOption.toString()}>
      {allocationOptions.map((item) => {
        return (
          <Menu.Item disabled={item.key === AllocationType.Specific && (!props.streamStats || props.streamStats.total === 0)}
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
                  <Select className="token-selector-dropdown" value={selectedToken.address} onChange={onTokenChange} bordered={false} showArrow={false}>
                    {tokenList.map((option) => {
                      return (
                        <Option key={option.address} value={option.address}>
                          <div className="option-container">
                            <TokenDisplay onClick={() => {}}
                              mintAddress={option.address}
                              name={option.name}
                              showCaretDown={true}
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

      <Button
        className={`main-cta ${props.isBusy ? 'inactive' : ''}`}
        block
        type="primary"
        shape="round"
        size="large"
        disabled={!isValidInput()}
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
