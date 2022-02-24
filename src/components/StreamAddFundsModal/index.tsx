import React, { useCallback, useEffect } from 'react';
import { useContext, useState } from 'react';
import { Modal, Button } from 'antd';
import { AppStateContext } from '../../contexts/appstate';
import { cutNumber, formatAmount, getTokenAmountAndSymbolByTokenAddress, isValidNumber, makeDecimal, makeInteger } from '../../utils/utils';
import { useTranslation } from 'react-i18next';
import { StreamInfo, TransactionFees, TreasuryInfo } from '@mean-dao/money-streaming/lib/types';
import { TokenDisplay } from '../TokenDisplay';
import { MoneyStreaming } from '@mean-dao/money-streaming';
import { MSP, Stream, Treasury, TreasuryType } from '@mean-dao/msp';
import { StreamTreasuryType } from '../../models/treasuries';
import { useWallet } from '../../contexts/wallet';
import { useConnection } from '../../contexts/connection';
import { PublicKey } from '@solana/web3.js';
import { consoleOut } from '../../utils/ui';
import { ExclamationCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import BN from 'bn.js';

export const StreamAddFundsModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  mspClient: MoneyStreaming | MSP | undefined;
  streamDetail: Stream | StreamInfo | undefined;
  transactionFees: TransactionFees;
  withdrawTransactionFees: TransactionFees;
}) => {
  const {
    tokenBalance,
    loadingPrices,
    selectedToken,
    effectiveRate,
    isWhitelisted,
    refreshPrices,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const location = useLocation();
  const navigate = useNavigate();
  const connection = useConnection();
  const { publicKey } = useWallet();
  const [topupAmount, setTopupAmount] = useState<string>('');

  // Treasury related
  const [streamTreasuryType, setStreamTreasuryType] = useState<StreamTreasuryType | undefined>(undefined);
  const [loadingTreasuryDetails, setLoadingTreasuryDetails] = useState(true);
  const [localStreamDetail, setLocalStreamDetail] = useState<Stream | StreamInfo | undefined>(undefined);
  const [treasuryDetails, setTreasuryDetails] = useState<Treasury | TreasuryInfo | undefined>(undefined);
  const [unallocatedBalance, setUnallocatedBalance] = useState(new BN(0));
  const [maxAllocatableAmount, setMaxAllocatableAmount] = useState<any>(undefined);
  const [tokenAmount, setTokenAmount] = useState(new BN(0));

  const isNewTreasury = useCallback(() => {
    if (treasuryDetails) {
      const v2 = treasuryDetails as Treasury;
      return v2.version >= 2 ? true : false;
    }

    return false;
  }, [treasuryDetails]);

  const getTreasuryType = useCallback((details?: Treasury | TreasuryInfo | undefined): StreamTreasuryType | undefined => {
    if (details) {
      const v1 = details as TreasuryInfo;
      const v2 = details as Treasury;
      const isNewTreasury = v2.version && v2.version >= 2 ? true : false;
      const type = isNewTreasury ? v2.treasuryType : v1.type;
      if (type === TreasuryType.Lock) {
        return "locked";
      } else {
        return "open";
      }
    } else if (treasuryDetails) {
      const v1 = treasuryDetails as TreasuryInfo;
      const v2 = treasuryDetails as Treasury;
      const isNewTreasury = v2.version && v2.version >= 2 ? true : false;
      const type = isNewTreasury ? v2.treasuryType : v1.type;
      if (type === TreasuryType.Lock) {
        return "locked";
      } else {
        return "open";
      }
    }

    return "unknown";
  }, [treasuryDetails]);

  const getTreasuryTypeByTreasuryId = useCallback(async (treasuryId: string, streamVersion: number): Promise<StreamTreasuryType | undefined> => {
    if (!connection || !publicKey || !props.mspClient) { return undefined; }

    const mspInstance = streamVersion < 2 ? props.mspClient as MoneyStreaming : props.mspClient as MSP;
    const treasueyPk = new PublicKey(treasuryId);

    try {
      const details = await mspInstance.getTreasury(treasueyPk);
      if (details) {
        setTreasuryDetails(details);
        consoleOut('treasuryDetails:', details, 'blue');
        const v1 = details as TreasuryInfo;
        const v2 = details as Treasury;
        const isNewTreasury = v2.version && v2.version >= 2 ? true : false;
        const type = isNewTreasury ? v2.treasuryType : v1.type;
        if (type === TreasuryType.Lock) {
          return "locked";
        } else {
          return "open";
        }
      } else {
        setTreasuryDetails(undefined);
        return "unknown";
      }
    } catch (error) {
      console.error(error);
      return "unknown";
    } finally {
      setLoadingTreasuryDetails(false);
    }

  }, [
    publicKey,
    connection,
    props.mspClient,
  ]);

  const getMaxAmount = useCallback((preSetting = false) => {
    if (((localStreamDetail && localStreamDetail.version >= 2 && (localStreamDetail as Stream).feePayedByTreasurer) || preSetting) && props.withdrawTransactionFees) {
      const BASE_100_TO_BASE_1_MULTIPLIER = 10_000;
      const feeNumerator = props.withdrawTransactionFees.mspPercentFee * BASE_100_TO_BASE_1_MULTIPLIER;
      const feeDenaminator = 1000000;
      const badStreamMaxAllocation = unallocatedBalance
        .mul(new BN(feeDenaminator))
        .div(new BN(feeNumerator + feeDenaminator));

      const feeAmount = badStreamMaxAllocation
        .mul(new BN(feeNumerator))
        .div(new BN(feeDenaminator));

      const badTotal = badStreamMaxAllocation.add(feeAmount);
      const badRemaining = unallocatedBalance.sub(badTotal);
      const goodStreamMaxAllocation = unallocatedBalance.sub(feeAmount);
      const goodTotal = goodStreamMaxAllocation.add(feeAmount);
      const goodRemaining = unallocatedBalance.sub(goodTotal);
      const maxAmount = goodStreamMaxAllocation;

      if (isWhitelisted) {
        const debugTable: any[] = [];
        debugTable.push({
          unallocatedBalance: unallocatedBalance.toNumber(),
          feeNumerator: feeNumerator,
          feePercentage01: feeNumerator/feeDenaminator,
          badStreamMaxAllocation: badStreamMaxAllocation.toNumber(),
          feeAmount: feeAmount.toNumber(),
          badTotal: badTotal.toNumber(),
          badRemaining: badRemaining.toNumber(),
          goodStreamMaxAllocation: goodStreamMaxAllocation.toNumber(),
          goodTotal: goodTotal.toNumber(),
          goodRemaining: goodRemaining.toNumber(),
        });
        consoleOut('debug table', debugTable, 'blue');
      }

      if (!preSetting) {
        setMaxAllocatableAmount(maxAmount);
      }
      return maxAmount;
    }
    if (!preSetting) {
      setMaxAllocatableAmount(unallocatedBalance);
    }
    return unallocatedBalance;
  },[
    isWhitelisted,
    localStreamDetail,
    unallocatedBalance,
    props.withdrawTransactionFees,
  ]);

  const getTreasuryName = useCallback(() => {
    if (treasuryDetails) {
      const v1 = treasuryDetails as TreasuryInfo;
      const v2 = treasuryDetails as Treasury;
      const isNewTreasury = v2.version && v2.version >= 2 ? true : false;
      return isNewTreasury ? v2.name : v1.label;
    }
    return '-';
  }, [treasuryDetails]);

  const shouldFundFromTreasury = useCallback(() => {
    if (!treasuryDetails || (treasuryDetails && treasuryDetails.autoClose)) {
      return false;
    }

    return true;
  }, [treasuryDetails]);

  const isfeePayedByTreasurerOn = useCallback(() => {
    if (localStreamDetail && localStreamDetail.version >= 2 && (localStreamDetail as Stream).feePayedByTreasurer) {
      return true;
    }

    return false;
  }, [localStreamDetail]);

  // Read and keep the input copy of the stream
  useEffect(() => {
    if (props.isVisible && !localStreamDetail && props.streamDetail) {
      setLocalStreamDetail(props.streamDetail);
    }
  }, [
    props.isVisible,
    localStreamDetail,
    props.streamDetail,
  ]);

  // Read treasury and store treasuryType
  useEffect(() => {
    if (props.isVisible && localStreamDetail) {
      if (treasuryDetails) {
        const value = getTreasuryType(treasuryDetails);
        consoleOut('streamTreasuryType:', value, 'crimson');
        setStreamTreasuryType(value);
      } else {
        const v1 = localStreamDetail as StreamInfo;
        const v2 = localStreamDetail as Stream;
        consoleOut('fetching treasury details...', '', 'blue');
        getTreasuryTypeByTreasuryId(
          localStreamDetail.version < 2 ? v1.treasuryAddress as string : v2.treasury as string,
          localStreamDetail.version
        ).then(value => {
          consoleOut('streamTreasuryType:', value, 'crimson');
          setStreamTreasuryType(value)
        });
      }
    }
  }, [
    props.isVisible,
    treasuryDetails,
    localStreamDetail,
    getTreasuryTypeByTreasuryId,
    getTreasuryType,
  ]);

  // Set treasury unalocated balance in BN
  useEffect(() => {
    if (props.isVisible && treasuryDetails) {
      const unallocated = treasuryDetails.balance - treasuryDetails.allocationAssigned;
      const ub = isNewTreasury()
        ? new BN(unallocated)
        : makeInteger(unallocated, selectedToken?.decimals || 6);
      consoleOut('unallocatedBalance:', ub.toNumber(), 'blue');
      setUnallocatedBalance(ub);
    }
  }, [
    props.isVisible,
    treasuryDetails,
    selectedToken?.decimals,
    isNewTreasury,
  ]);

  // Set max amount allocatable to a stream in BN the first time
  useEffect(() => {
    if (props.isVisible && treasuryDetails && props.withdrawTransactionFees) {
      getMaxAmount();
    }
  }, [
    props.isVisible,
    treasuryDetails,
    props.withdrawTransactionFees,
    getMaxAmount
  ]);

  const onAcceptTopup = () => {
    props.handleOk({
      amount: topupAmount,
      tokenAmount: tokenAmount,
      treasuryType: streamTreasuryType,
      fundFromTreasury: shouldFundFromTreasury()
    });
  }

  const handleAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setTopupAmount("");
      setTokenAmount(new BN(0));
    } else if (newValue === '.') {
      setTopupAmount(".");
    } else if (isValidNumber(newValue)) {
      setTopupAmount(newValue);
      setTokenAmount(makeInteger(newValue, selectedToken?.decimals || 6));
    }
  };

  // Validation

  const isValidInput = (): boolean => {
    const userBalance = makeInteger(tokenBalance, selectedToken?.decimals || 6);
    return  publicKey &&
            selectedToken &&
            ((shouldFundFromTreasury() && unallocatedBalance.toNumber() > 0) ||
            (!shouldFundFromTreasury() && userBalance.toNumber() > 0)) &&
            tokenAmount && tokenAmount.toNumber() > 0 &&
            ((!shouldFundFromTreasury() && tokenAmount.lte(userBalance)) ||
            (shouldFundFromTreasury() && ((isfeePayedByTreasurerOn() && tokenAmount.lte(maxAllocatableAmount)) ||
                                          (!isfeePayedByTreasurerOn() && tokenAmount.lte(unallocatedBalance)))))
      ? true
      : false;
  }

  const getTransactionStartButtonLabel = (): string => {
    const userBalance = makeInteger(tokenBalance, selectedToken?.decimals || 6);
    return !selectedToken ||
           (shouldFundFromTreasury() && unallocatedBalance.isZero()) ||
           (!shouldFundFromTreasury() && userBalance.isZero())
      ? t('transactions.validation.no-balance')
      : !tokenAmount || tokenAmount.isZero()
      ? t('transactions.validation.no-amount')
      : (!shouldFundFromTreasury() && tokenAmount.gt(userBalance)) ||
        (shouldFundFromTreasury() && ((isfeePayedByTreasurerOn() && tokenAmount.gt(maxAllocatableAmount)) ||
                                      (!isfeePayedByTreasurerOn() && tokenAmount.gt(unallocatedBalance))))
      ? t('transactions.validation.amount-high')
      : t('transactions.validation.valid-approve');
  }

  return (
    <Modal
      className="mean-modal"
      title={<div className="modal-title">{t('streams.add-funds.modal-title')}</div>}
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptTopup}
      onCancel={props.handleClose}
      afterClose={() => {
        setTopupAmount("");
        setTokenAmount(new BN(0));
      }}
      width={480}>
      {loadingTreasuryDetails ? (
        // The loading part
        <div className="transaction-progress">
          <LoadingOutlined style={{ fontSize: 48 }} className="icon mt-0" spin />
          <h4 className="operation">{t('close-stream.loading-treasury-message')}</h4>
        </div>
      ) : streamTreasuryType === "locked" ? (
        // The user can't top-up the stream
        <div className="transaction-progress">
          <ExclamationCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
          <h4 className="operation">{t('close-stream.cant-topup-message')}</h4>

          {/* Only if the user is on streams offer navigating to the treasury */}
          {location.pathname === '/accounts/streams' && treasuryDetails && (
            <div className="mt-3">
              <span className="mr-1">{t('treasuries.treasury-detail.treasury-name-label')}:</span>
              <span className="mr-1 font-bold">{getTreasuryName()}</span>
              <span className="simplelink underline-on-hover" onClick={() => {
                props.handleClose();
                const url = `/treasuries?treasury=${treasuryDetails.id}`;
                navigate(url);
              }}>{t('close-stream.see-details-cta')}</span>
            </div>
          )}

          <div className="mt-3">
            <Button
                type="primary"
                shape="round"
                size="large"
                onClick={props.handleClose}>
                {t('general.cta-close')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {treasuryDetails && !treasuryDetails.autoClose && (
            <>
              <h3>{t('streams.add-funds.treasury-money-stream-title')}</h3>
              <p>{t('streams.add-funds.treasury-money-stream-description')}</p>
            </>
          )}
          {/* Top up amount */}
          <div className="form-label">{t('streams.add-funds.amount-label')}</div>
          <div className="well">
            <div className="flex-fixed-left">
              <div className="left">
                <span className="add-on">
                  {selectedToken && (
                    <TokenDisplay onClick={() => {}}
                      mintAddress={selectedToken.address}
                      name={selectedToken.name}
                      showCaretDown={false}
                    />
                  )}
                  {treasuryDetails && treasuryDetails.autoClose ? (
                    <>
                      {selectedToken && tokenBalance ? (
                        <div
                          className="token-max simplelink"
                          onClick={() => {
                            setTopupAmount(tokenBalance.toFixed(selectedToken.decimals));
                            setTokenAmount(makeInteger(tokenBalance, selectedToken?.decimals || 6));
                          }}>
                          MAX
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {selectedToken && unallocatedBalance ? (
                        <div
                          className="token-max simplelink"
                          onClick={() => {
                            const decimals = selectedToken ? selectedToken.decimals : 6;
                            if (isfeePayedByTreasurerOn()) {
                              const maxAmount = getMaxAmount(true);
                              consoleOut('tokenAmount:', tokenAmount.toNumber(), 'blue');
                              consoleOut('maxAmount:', maxAmount.toNumber(), 'blue');
                              setTopupAmount(cutNumber(makeDecimal(new BN(maxAmount), decimals), decimals));
                              setTokenAmount(new BN(maxAmount));
                            } else {
                              const maxAmount = getMaxAmount();
                              setTopupAmount(cutNumber(makeDecimal(new BN(maxAmount), decimals), decimals));
                              setTokenAmount(new BN(maxAmount));
                            }
                          }}>
                          MAX
                        </div>
                      ) : null}
                    </>
                  )}
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
                {!treasuryDetails || (treasuryDetails && treasuryDetails.autoClose) ? (
                  <span>{t('add-funds.label-right')}:</span>
                ) : (
                  <span>{t('treasuries.treasury-streams.available-unallocated-balance-label')}:</span>
                )}
                {treasuryDetails && treasuryDetails.autoClose ? (
                  <span>
                    {`${tokenBalance && selectedToken
                        ? getTokenAmountAndSymbolByTokenAddress(
                            tokenBalance,
                            selectedToken?.address,
                            true
                          )
                        : "0"
                    }`}
                  </span>
                ) : (
                  <>
                    {selectedToken && unallocatedBalance ? (
                      <span>
                        {
                          getTokenAmountAndSymbolByTokenAddress(
                            makeDecimal(unallocatedBalance, selectedToken.decimals),
                            selectedToken.address,
                            true
                          )
                        }
                      </span>
                    ) : tokenBalance && selectedToken ? (
                      <span>
                        {
                          getTokenAmountAndSymbolByTokenAddress(
                            tokenBalance,
                            selectedToken.address,
                            true
                          )
                        }
                      </span>
                    ) : null}
                  </>
                )}
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
          <Button
            className="main-cta"
            block
            type="primary"
            shape="round"
            size="large"
            disabled={!isValidInput()}
            onClick={onAcceptTopup}>
            {getTransactionStartButtonLabel()}
          </Button>
        </>
      )}
    </Modal>
  );
};
