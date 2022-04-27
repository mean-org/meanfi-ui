import React, { useCallback, useContext, useEffect } from 'react';
import { useState } from 'react';
import { Modal, Button, Spin, Select, Divider, Input } from 'antd';
import { useTranslation } from 'react-i18next';
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { TREASURY_TYPE_OPTIONS } from '../../constants/treasury-type-options';
import { AppStateContext } from '../../contexts/appstate';
import { TreasuryCreateOptions, TreasuryTypeOption } from '../../models/treasuries';
import { TransactionStatus } from '../../models/enums';
import { consoleOut, getTransactionOperationDescription, isValidAddress } from '../../utils/ui';
import { isError } from '../../utils/transactions';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { TransactionFees, TreasuryType } from '@mean-dao/money-streaming';
import { formatAmount, getTokenAmountAndSymbolByTokenAddress, getTokenByMintAddress, shortenAddress } from '../../utils/utils';
import { MultisigV2 } from '../../models/multisig';
import { Identicon } from '../Identicon';
import { IconCheckedBox } from '../../Icons';
import { TokenInfo } from '@solana/spl-token-registry';
import { TokenDisplay } from '../TokenDisplay';
import { NATIVE_SOL } from '../../utils/tokens';
import { openNotification } from '../Notifications';

const { Option } = Select;
const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const TreasuryCreateModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  isBusy: boolean;
  nativeBalance: number;
  userBalances: any;
  transactionFees: TransactionFees;
  selectedMultisig: MultisigV2 | undefined;
  multisigAccounts: MultisigV2[];
  associatedToken: string;
}) => {
  const { t } = useTranslation('common');
  const {
    tokenList,
    coinPrices,
    tokenBalance,
    selectedToken,
    effectiveRate,
    loadingPrices,
    transactionStatus,
    highLightableStreamId,
    setTransactionStatus,
    setSelectedToken,
    setEffectiveRate,
    refreshPrices,
  } = useContext(AppStateContext);
  const [treasuryName, setTreasuryName] = useState('');
  const { treasuryOption, setTreasuryOption } = useContext(AppStateContext);
  const [localSelectedMultisig, setLocalSelectedMultisig] = useState<MultisigV2 | undefined>(undefined);
  const [enableMultisigTreasuryOption, setEnableMultisigTreasuryOption] = useState(true);
  const [customTokenInput, setCustomTokenInput] = useState("");

  const getPricePerToken = useCallback((token: TokenInfo): number => {
    if (!token || !token.symbol) { return 0; }
    const tokenSymbol = token.symbol.toUpperCase();
    const symbol = tokenSymbol[0] === 'W' ? tokenSymbol.slice(1) : tokenSymbol;

    return coinPrices && coinPrices[symbol]
      ? coinPrices[symbol]
      : 0;
  }, [coinPrices])

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
      openNotification({
        title: t('notifications.error-title'),
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

  // When modal goes visible, preset the appropriate value for multisig treasury switch
  useEffect(() => {
    if (props.isVisible && props.selectedMultisig) {
      setEnableMultisigTreasuryOption(true);
      setLocalSelectedMultisig(props.selectedMultisig);
    } else {
      setEnableMultisigTreasuryOption(false);
      setLocalSelectedMultisig(props.multisigAccounts[0]);
    }
  }, [
    props.isVisible,
    props.selectedMultisig,
    props.multisigAccounts,
  ]);

  const triggerWindowResize = () => {
    window.dispatchEvent(new Event('resize'));
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

  const onAcceptModal = () => {
    const options: TreasuryCreateOptions = {
      treasuryName,
      treasuryType: treasuryOption ? treasuryOption.type : TreasuryType.Open,
      multisigId: enableMultisigTreasuryOption && localSelectedMultisig ? localSelectedMultisig.id.toBase58() : ''
    };
    props.handleOk(options);
  }

  const onCloseModal = () => {
    props.handleClose();
  }

  const onAfterClose = () => {
    setTimeout(() => {
      setTreasuryName('');
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

  const onInputValueChange = (e: any) => {
    setTreasuryName(e.target.value);
  }

  const handleSelection = (option: TreasuryTypeOption) => {
    setTreasuryOption(option);
  }

  const onCloseTreasuryOptionChanged = (e: any) => {
    setEnableMultisigTreasuryOption(e.target.value);
  }

  const onMultisigChanged = useCallback((e: any) => {
    
    if (props.multisigAccounts && props.multisigAccounts.length > 0) {
      consoleOut("multisig selected:", e, 'blue');
      const ms = props.multisigAccounts.filter(v => v.id.toBase58() === e)[0];
      setLocalSelectedMultisig(ms);
    }

  },[
    props.multisigAccounts
  ]);

  const renderMultisigSelectItems = () => {
    return (
      <div className="flex-fixed-left">
        <div className="left">
          <span className="add-on">
            {(props.multisigAccounts && props.multisigAccounts.length > 0) && (
              <Select className={`token-selector-dropdown auto-height`} value={localSelectedMultisig ? localSelectedMultisig.id.toBase58() : undefined}
                  style={{width:400, maxWidth:'none'}}
                  onChange={onMultisigChanged} bordered={false} showArrow={false}>
                {props.multisigAccounts.map((option: MultisigV2) => {
                  return (
                    <Option key={option.id.toBase58()} value={option.id.toBase58()}>
                      <div className="option-container">
                        <div className={`transaction-list-row w-100`}>
                          <div className="icon-cell">
                            <Identicon address={option.id} style={{ width: "30", display: "inline-flex" }} />
                          </div>
                          <div className="description-cell">
                            <div className="title text-truncate">{option.label}</div>
                            <div className="subtitle text-truncate">{shortenAddress(option.id.toBase58(), 8)}</div>
                          </div>
                          <div className="rate-cell">
                            <div className="rate-amount">
                              {
                                t('multisig.multisig-accounts.pending-transactions', {
                                  txs: option.pendingTxsAmount
                                })
                              }
                            </div>
                          </div>
                        </div>
                      </div>
                    </Option>
                  );
                })}
              </Select>
            )}
          </span>
        </div>
      </div>
    );
  }

  const renderSelectedMultisig = () => {
    return (
      props.selectedMultisig && (
        <div className={`transaction-list-row w-100 no-pointer`}>
          <div className="icon-cell">
            <Identicon address={props.selectedMultisig.id} style={{ width: "30", display: "inline-flex" }} />
          </div>
          <div className="description-cell">
            <div className="title text-truncate">{props.selectedMultisig.label}</div>
            <div className="subtitle text-truncate">{shortenAddress(props.selectedMultisig.id.toBase58(), 8)}</div>
          </div>
          <div className="rate-cell">
            <div className="rate-amount">
              {
                t('multisig.multisig-accounts.pending-transactions', {
                  txs: props.selectedMultisig.pendingTxsAmount
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
      className="mean-modal simple-modal"
      title={<div className="modal-title">{t('treasuries.create-treasury.modal-title')}</div>}
      maskClosable={false}
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptModal}
      onCancel={onCloseModal}
      afterClose={onAfterClose}
      width={props.isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}>

      <div className={!props.isBusy ? "panel1 show" : "panel1 hide"}>

        {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
          <>
            {/* Treasury name */}
            <div className="mb-3">
              <div className="form-label">{t('treasuries.create-treasury.treasury-name-input-label')}</div>
              <div className={`well ${props.isBusy ? 'disabled' : ''}`}>
                <div className="flex-fixed-right">
                  <div className="left">
                    <input
                      id="treasury-name-field"
                      className="w-100 general-text-input"
                      autoComplete="off"
                      autoCorrect="off"
                      type="text"
                      maxLength={32}
                      onChange={onInputValueChange}
                      placeholder={t('treasuries.create-treasury.treasury-name-placeholder')}
                      value={treasuryName}
                    />
                  </div>
                </div>
                <div className="form-field-hint">I.e. "My company payroll", "Seed round vesting", etc.</div>
              </div>
            </div>

            <div className="form-label">{t('treasuries.create-treasury.treasury-token-label')}</div>
            <div className={`well ${props.isBusy ? 'disabled' : ''}`}>
              <div className="flex-fixed-left">
                <div className="left">
                  <span className="add-on">
                    {(selectedToken && tokenList) && (
                      <Select className="token-selector-dropdown" value={selectedToken.address}
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
                  </span>
                </div>
              </div>
              <div className="flex-fixed-right">
                <div className="left inner-label">
                  <span>{t('add-funds.label-right')}:</span>
                  <span>
                    {`${tokenBalance && selectedToken
                        ? getTokenAmountAndSymbolByTokenAddress(
                            tokenBalance,
                            selectedToken.address,
                            true
                          )
                        : "0"
                    }`}
                  </span>
                </div>
                <div className="right inner-label">
                  <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
                    ~${tokenBalance && effectiveRate
                      ? formatAmount(tokenBalance * effectiveRate, 2)
                      : "0.00"}
                  </span>
                </div>
              </div>
            </div>

            {/* Treasury type selector */}
            <div className="items-card-list vertical-scroll">
              {TREASURY_TYPE_OPTIONS.map(option => {
                return (
                  <div key={`${option.translationId}`} className={`item-card ${option.type === treasuryOption?.type
                    ? "selected"
                    : option.disabled
                      ? "disabled"
                      : ""
                  }`}
                  onClick={() => {
                    if (!option.disabled) {
                      handleSelection(option);
                    }
                  }}>
                    <div className="checkmark"><CheckOutlined /></div>
                    <div className="item-meta">
                      <div className="item-name">{t(`treasuries.create-treasury.treasury-type-options.${option.translationId}-name`)}</div>
                      <div className="item-description">{t(`treasuries.create-treasury.treasury-type-options.${option.translationId}-description`)}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Multisig Treasury checkbox */}
            {
              // (!props.selectedMultisig && props.multisigAccounts.length > 0) && (
              //   <div className="mb-2 flex-row align-items-center">
              //     <span className="form-label w-auto mb-0">{t('treasuries.create-treasury.multisig-treasury-switch-label')}</span>
              //     {/* <a className="simplelink" href="https://docs.meanfi.com/" target="_blank" rel="noopener noreferrer">
              //       <Button
              //         className="info-icon-button"
              //         type="default"
              //         shape="circle">
              //         <InfoCircleOutlined />
              //       </Button>
              //     </a> */}
              //     <Radio.Group className="ml-2" onChange={onCloseTreasuryOptionChanged} value={enableMultisigTreasuryOption}>
              //       <Radio value={true}>{t('general.yes')}</Radio>
              //       <Radio value={false}>{t('general.no')}</Radio>
              //     </Radio.Group>
              //   </div>
              // )
            }

            {(enableMultisigTreasuryOption && props.multisigAccounts.length > 0) && (
              <>
                <div className="mb-3">
                  <div className="form-label">{t('treasuries.create-treasury.multisig-selector-label')}</div>
                  <div className="well">
                    {/* {renderMultisigSelectItems()} */}
                    {renderSelectedMultisig()}
                  </div>
                </div>
              </>
            )}

          </>
        ) : transactionStatus.currentOperation === TransactionStatus.TransactionFinished ? (
          <>
            <div className="transaction-progress">
              <CheckOutlined style={{ fontSize: 48 }} className="icon mt-0" />
              <h4 className="font-bold">{t('treasuries.create-treasury.success-message')}</h4>
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
      {!(props.isBusy && transactionStatus !== TransactionStatus.Iddle) && (
        <div className="row two-col-ctas mt-3 transaction-progress p-0">
          <div className={!isError(transactionStatus.currentOperation) ? "col-6" : "col-12"}>
            <Button
              block
              type="text"
              shape="round"
              size="middle"
              className={props.isBusy ? 'inactive' : ''}
              onClick={() => isError(transactionStatus.currentOperation)
                ? transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure
                  ? onCloseModal()
                  : onAcceptModal()
                : onCloseModal()}>
              {isError(transactionStatus.currentOperation)
                ? transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure
                  ? t('general.cta-close')
                  : t('general.retry')
                : t('general.cta-close')
              }
            </Button>
          </div>
          {!isError(transactionStatus.currentOperation) && (
            <div className="col-6">
              <Button
                className={props.isBusy ? 'inactive' : ''}
                block
                type="primary"
                shape="round"
                size="middle"
                disabled={!treasuryName}
                onClick={() => {
                  if (transactionStatus.currentOperation === TransactionStatus.Iddle) {
                    onAcceptModal();
                  // } else if (transactionStatus.currentOperation === TransactionStatus.TransactionFinished) {
                  //   onCloseModal();
                  } else {
                    refreshPage();
                  }
                }}>
                {/* {props.isBusy && (
                  <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
                )} */}
                {props.isBusy
                  ? t('treasuries.create-treasury.main-cta-busy')
                  : transactionStatus.currentOperation === TransactionStatus.Iddle
                    ? enableMultisigTreasuryOption && props.multisigAccounts.length > 0
                      ? t('treasuries.create-treasury.create-multisig-cta')
                      : t('treasuries.create-treasury.main-cta')
                    : t('general.refresh')
                }
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
