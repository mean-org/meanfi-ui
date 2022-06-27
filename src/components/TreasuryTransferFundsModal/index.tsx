import React, { useCallback, useContext, useEffect, useState } from 'react';
import "./style.scss";
import { Modal, Button, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { AppStateContext } from '../../contexts/appstate';
import { TransactionStatus } from '../../models/enums';
import { consoleOut, getTransactionOperationDescription, isValidAddress } from '../../utils/ui';
import { isError } from '../../utils/transactions';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { StreamInfo, TransactionFees, TreasuryInfo } from '@mean-dao/money-streaming';
import { cutNumber, formatAmount, formatThousands, getTokenAmountAndSymbolByTokenAddress, isValidNumber, makeDecimal, makeInteger, shortenAddress } from '../../utils/utils';
import { useWallet } from '../../contexts/wallet';
import { PublicKey } from '@solana/web3.js';
import { FALLBACK_COIN_IMAGE } from '../../constants';
import { Identicon } from '../Identicon';
import { Stream, Treasury, TreasuryType } from '@mean-dao/msp';
import Checkbox from 'antd/lib/checkbox/Checkbox';
import { TokenDisplay } from '../TokenDisplay';
import { BN } from 'bn.js';
import { StreamTreasuryType } from '../../models/treasuries';

import { MultisigInfo } from "@mean-dao/mean-multisig-sdk";
import { useSearchParams } from 'react-router-dom';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const TreasuryTransferFundsModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  isBusy: boolean;
  nativeBalance: number;
  minRequiredBalance: number;
  transactionFees: TransactionFees;
  treasuryDetails: Treasury | TreasuryInfo | undefined;
  multisigAccounts: MultisigInfo[] | undefined;
}) => {
  const [searchParams] = useSearchParams();
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const {
    theme,
    tokenBalance,
    selectedToken,
    isWhitelisted,
    loadingPrices,
    effectiveRate,
    transactionStatus,
    isVerifiedRecipient,
    setIsVerifiedRecipient,
    getTokenByMintAddress,
    setTransactionStatus,
    refreshPrices,
  } = useContext(AppStateContext);

  const [to, setTo] = useState('');
  const [topupAmount, setTopupAmount] = useState<string>('');
  const [tokenAmount, setTokenAmount] = useState(new BN(0));
  const [unallocatedBalance, setUnallocatedBalance] = useState(new BN(0));
  const [localStreamDetail, setLocalStreamDetail] = useState<Stream | StreamInfo | undefined>(undefined);
  const [maxAllocatableAmount, setMaxAllocatableAmount] = useState<any>(undefined);
  const [streamTreasuryType, setStreamTreasuryType] = useState<StreamTreasuryType | undefined>(undefined);
  const [multisigAddresses, setMultisigAddresses] = useState<string[]>([]);

  const isMultisigTreasury = useCallback((treasury?: any) => {
    const treasuryInfo: any = treasury ?? props.treasuryDetails;

    if (!treasuryInfo || treasuryInfo.version < 2 || !treasuryInfo.treasurer || !publicKey) {
      return false;
    }

    const treasurer = new PublicKey(treasuryInfo.treasurer as string);

    if (!treasurer.equals(publicKey) && props.multisigAccounts && props.multisigAccounts.findIndex(m => m.authority.equals(treasurer)) !== -1) {
      return true;
    }

    return false;
  }, [
    props.multisigAccounts, 
    publicKey, 
    props.treasuryDetails
  ]);

  const shouldFundFromTreasury = useCallback(() => {
    if (!props.treasuryDetails || (props.treasuryDetails && props.treasuryDetails.autoClose)) {
      return false;
    }

    return true;
  }, [props.treasuryDetails]);

  const onAcceptWithdrawTreasuryFunds = () => {
    props.handleOk({
      amount: topupAmount,
      tokenAmount: tokenAmount,
      destinationAccount: to
    });
  }

  useEffect(() => {
    if (props.isVisible) {
      if (props.multisigAccounts && props.multisigAccounts.length > 0) {
        const msAddresses = props.multisigAccounts.map(ms => ms.id.toBase58());
        setMultisigAddresses(msAddresses);
      }
    }
  }, [
    props.isVisible,
    props.multisigAccounts
  ]);

  const onCloseModal = () => {
    consoleOut('onCloseModal called!', '', 'crimson');
    props.handleClose();
    onAfterClose();
  }

  const onAfterClose = () => {
    setTimeout(() => {
      setTopupAmount("");
      setTo("");
      setIsVerifiedRecipient(false);
    });
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }

  const onMintToAddressChange = (e: any) => {
    const inputValue = e.target.value as string;
    const trimmedValue = inputValue.trim();
    setTo(trimmedValue);
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
      setTokenAmount(new BN(0));
    } else if (newValue === '.') {
      setTopupAmount(".");
    } else if (isValidNumber(newValue)) {
      setTopupAmount(newValue);
      setTokenAmount(makeInteger(newValue, selectedToken?.decimals || 6));
    }
  };

  const refreshPage = () => {
    props.handleClose();
    window.location.reload();
  }

  const onIsVerifiedRecipientChange = (e: any) => {
    setIsVerifiedRecipient(e.target.checked);
  }

  const isfeePayedByTreasurerOn = useCallback(() => {
    if (localStreamDetail && localStreamDetail.version >= 2 && (localStreamDetail as Stream).feePayedByTreasurer) {
      return true;
    }

    return false;
  }, [localStreamDetail]);

  // Validation
  const isValidForm = (): boolean => {
    const userBalance = makeInteger(tokenBalance, selectedToken?.decimals || 6);
    return  publicKey &&
            to &&
            isValidAddress(to) &&
            selectedToken && 
            isVerifiedRecipient &&
            ((shouldFundFromTreasury() && unallocatedBalance.toNumber() > 0) ||
            (!shouldFundFromTreasury() && userBalance.toNumber() > 0)) &&
            tokenAmount && tokenAmount.toNumber() > 0 &&
            ((!shouldFundFromTreasury() && tokenAmount.lte(userBalance)) ||
            (shouldFundFromTreasury() && ((isfeePayedByTreasurerOn() && tokenAmount.lte(maxAllocatableAmount)) ||
            (!isfeePayedByTreasurerOn() && tokenAmount.lte(unallocatedBalance)))))
      ? true
      : false;
  }

  const isInputMultisigAddress = (address: string) => {
    return multisigAddresses.includes(address);
  }

  const getMaxAmount = useCallback((preSetting = false) => {
    if (((localStreamDetail && localStreamDetail.version >= 2 && (localStreamDetail as Stream).feePayedByTreasurer) || preSetting) && props.transactionFees) {
      const BASE_100_TO_BASE_1_MULTIPLIER = 10_000;
      const feeNumerator = props.transactionFees.mspPercentFee * BASE_100_TO_BASE_1_MULTIPLIER;
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
    props.transactionFees,
  ]);

  const isNewTreasury = useCallback(() => {
    if (props.treasuryDetails) {
      const v2 = props.treasuryDetails as Treasury;
      return v2.version >= 2 ? true : false;
    }

    return false;
  }, [props.treasuryDetails]);

  // Set treasury unalocated balance in BN
  useEffect(() => {
    if (props.isVisible && props.treasuryDetails) {
      const unallocated = props.treasuryDetails.balance - props.treasuryDetails.allocationAssigned;
      const ub = isNewTreasury()
        ? new BN(unallocated)
        : makeInteger(unallocated, selectedToken?.decimals || 6);
      consoleOut('unallocatedBalance:', ub.toNumber(), 'blue');
      setUnallocatedBalance(ub);
    }
  }, [
    props.isVisible,
    props.treasuryDetails,
    selectedToken?.decimals,
    isNewTreasury,
  ]);

  const renderTreasury = (item: Treasury | TreasuryInfo) => {
    const v1 = item as TreasuryInfo;
    const v2 = item as Treasury;
    const isNewTreasury = v2.version && v2.version >= 2 ? true : false;
    const token = isNewTreasury
      ? v2.associatedToken
        ? getTokenByMintAddress(v2.associatedToken as string)
        : undefined
      : v1.associatedTokenAddress
        ? getTokenByMintAddress(v1.associatedTokenAddress as string)
        : undefined;
    const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
      event.currentTarget.src = FALLBACK_COIN_IMAGE;
      event.currentTarget.className = "error";
    };

    return (
      <div className="transaction-list-row no-pointer">
        <div className="icon-cell">
          <div className="token-icon">
            {(isNewTreasury ? v2.associatedToken : v1.associatedTokenAddress) ? (
              <>
                {token ? (
                  <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} onError={imageOnErrorHandler} />
                ) : (
                  <Identicon address={(isNewTreasury ? v2.associatedToken : v1.associatedTokenAddress)} style={{ width: "30", display: "inline-flex" }} />
                )}
              </>
            ) : (
              <Identicon address={item.id} style={{ width: "30", display: "inline-flex" }} />
            )}
          </div>
        </div>
        <div className="description-cell">
          {(isNewTreasury ? v2.name : v1.label) ? (
            <div className="title text-truncate">
              {isNewTreasury ? v2.name : v1.label}
              <span className={`badge small ml-1 ${theme === 'light' ? 'golden fg-dark' : 'darken'}`}>
                {isNewTreasury
                  ? v2.treasuryType === TreasuryType.Open ? 'Open' : 'Locked'
                  : v1.type === TreasuryType.Open ? 'Open' : 'Locked'
                }
              </span>
            </div>
          ) : (
            <div className="title text-truncate">{shortenAddress(item.id as string, 8)}</div>
          )}
          {isMultisigTreasury(item) && (
            <div className="subtitle text-truncate">{t('treasuries.treasury-list.multisig-treasury-label')}</div>
          )}
        </div>
        <div className="rate-cell text-center">
          {!isNewTreasury && v1.upgradeRequired ? (
            <span>&nbsp;</span>
          ) : (
            <>
            <div className="rate-amount">
              {formatThousands(isNewTreasury ? v2.totalStreams : v1.streamsAmount)}
            </div>
            <div className="interval">streams</div>
            </>
          )}
        </div>
      </div>
    );
  };

  const getQueryAccountType = useCallback(() => {
    let accountTypeInQuery: string | null = null;
    if (searchParams) {
      accountTypeInQuery = searchParams.get('account-type');
      if (accountTypeInQuery) {
        return accountTypeInQuery;
      }
    }
    return undefined;
  }, [searchParams]);

  const param = getQueryAccountType();

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{param === "multisig" ? "Propose withdrawal" : t('treasuries.withdraw-funds.modal-title')}</div>}
      maskClosable={false}
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptWithdrawTreasuryFunds}
      onCancel={onCloseModal}
      afterClose={() => {
        setTopupAmount("");
        setTokenAmount(new BN(0));
        setIsVerifiedRecipient(false);
      }}
      width={props.isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}>

      <div className={!props.isBusy ? "panel1 show" : "panel1 hide"}>
        {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
          <>
            {/* Transfer from */}
            {props.treasuryDetails && (
              <div className="mb-3">
                <div className="form-label">{t('treasuries.withdraw-funds.selected-treasury-label')}</div>
                  <div className="well">
                    {renderTreasury(props.treasuryDetails)}
                  </div>
              </div>
            )}

            {/* Transfer to */}
            <div className="form-label">{t('multisig.transfer-tokens.transfer-to-label')}</div>
            <div className="well">
              <input id="mint-to-field"
                className="general-text-input"
                autoComplete="on"
                autoCorrect="off"
                type="text"
                onChange={onMintToAddressChange}
                placeholder={t('multisig.transfer-tokens.transfer-to-placeholder')}
                required={true}
                spellCheck="false"
                value={to}/>
              {to && !isValidAddress(to) ? (
                <span className="form-field-error">
                  {t('transactions.validation.address-validation')}
                </span>
              ) : isInputMultisigAddress(to) && (
                <span className="form-field-error">
                  {t('transactions.validation.invalid-account')}
                </span>
              )}
            </div>

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
                    {props.treasuryDetails && props.treasuryDetails.autoClose ? (
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
                  {!props.treasuryDetails || (props.treasuryDetails && props.treasuryDetails.autoClose) ? (
                    <span>{t('add-funds.label-right')}:</span>
                  ) : (
                    <span>{t('treasuries.treasury-streams.available-unallocated-balance-label')}:</span>
                  )}
                  {props.treasuryDetails && props.treasuryDetails.autoClose ? (
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
              {(parseFloat(topupAmount) > makeDecimal(unallocatedBalance, 6)) && (
                <span className="form-field-error">
                  {t('transactions.validation.invalid-amount')}
                </span>
              )}
            </div>

            {/* explanatory paragraph */}
            {isMultisigTreasury(props.treasuryDetails) && (
              <p>{t("multisig.multisig-assets.explanatory-paragraph")}</p>
            )}

            {/* confirm that the recipient address doesn't belong to an exchange */}
            <div className="mt-2 mb-3 confirm-terms">
              <Checkbox checked={isVerifiedRecipient} onChange={onIsVerifiedRecipientChange}>
                {t("treasuries.withdraw-funds.verified-label")}
              </Checkbox>
            </div>
          </>
        ) : transactionStatus.currentOperation === TransactionStatus.TransactionFinished ? (
          <>
            <div className="transaction-progress">
              <CheckOutlined style={{ fontSize: 48 }} className="icon mt-0" />
              <h4 className="font-bold">{t('multisig.transfer-tokens.success-message')}</h4>
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
                      props.minRequiredBalance,
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

      <div 
        className={
          props.isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle 
            ? "panel2 show" 
            : "panel2 hide"
          }>          
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
                  : onAcceptWithdrawTreasuryFunds()
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
                className={`extra-height ${props.isBusy ? 'inactive' : ''}`}
                block
                type="primary"
                shape="round"
                size="middle"
                disabled={!isValidForm() || isInputMultisigAddress(to)}
                onClick={() => {
                  if (transactionStatus.currentOperation === TransactionStatus.Iddle) {
                    onAcceptWithdrawTreasuryFunds();
                  } else if (transactionStatus.currentOperation === TransactionStatus.TransactionFinished) {
                    onCloseModal();
                  } else {
                    refreshPage();
                  }
                }}>
                {props.isBusy
                  ? ('multisig.transfer-tokens.main-cta-busy')
                  : transactionStatus.currentOperation === TransactionStatus.Iddle
                    ? (param === "multisig" ? "Submit proposal" : t('treasuries.withdraw-funds.main-cta'))
                    : transactionStatus.currentOperation === TransactionStatus.TransactionFinished
                      ? t('general.cta-finish')
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
