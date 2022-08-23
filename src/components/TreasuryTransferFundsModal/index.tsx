import React, { useCallback, useContext, useEffect, useState } from 'react';
import "./style.scss";
import { Modal, Button, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { AppStateContext } from '../../contexts/appstate';
import { TransactionStatus } from '../../models/enums';
import { consoleOut, getTransactionOperationDescription, isValidAddress, toUsCurrency } from '../../utils/ui';
import { isError } from '../../utils/transactions';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { StreamInfo, TransactionFees, TreasuryInfo } from '@mean-dao/money-streaming';
import { formatThousands, getAmountWithSymbol, getSdkValue, getTokenAmountAndSymbolByTokenAddress, isValidNumber, makeInteger, shortenAddress, toTokenAmount2, toUiAmount2 } from '../../utils/utils';
import { useWallet } from '../../contexts/wallet';
import { PublicKey } from '@solana/web3.js';
import { FALLBACK_COIN_IMAGE } from '../../constants';
import { Identicon } from '../Identicon';
import { Stream, Treasury, TreasuryType } from '@mean-dao/msp';
import Checkbox from 'antd/lib/checkbox/Checkbox';
import { TokenDisplay } from '../TokenDisplay';
import { BN } from 'bn.js';
import { MultisigInfo } from "@mean-dao/mean-multisig-sdk";
import { useSearchParams } from 'react-router-dom';
import { InputMean } from '../InputMean';
import { TokenInfo } from '@solana/spl-token-registry';

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
  selectedToken: TokenInfo | undefined;
}) => {
  const {
    handleClose,
    handleOk,
    isVisible,
    isBusy,
    nativeBalance,
    minRequiredBalance,
    transactionFees,
    treasuryDetails,
    multisigAccounts,
    selectedToken
  } = props;
  const [searchParams] = useSearchParams();
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const {
    theme,
    splTokenList,
    tokenBalance,
    isWhitelisted,
    loadingPrices,
    transactionStatus,
    getTokenPriceBySymbol,
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
  const [multisigAddresses, setMultisigAddresses] = useState<string[]>([]);
  const [isVerifiedRecipient, setIsVerifiedRecipient] = useState(false);
  const [proposalTitle, setProposalTitle] = useState('');

  const isMultisigTreasury = useCallback((treasury?: any) => {
    const treasuryInfo: any = treasury ?? treasuryDetails;

    if (!treasuryInfo || treasuryInfo.version < 2 || !treasuryInfo.treasurer || !publicKey) {
      return false;
    }

    const treasurer = new PublicKey(treasuryInfo.treasurer as string);

    if (!treasurer.equals(publicKey) && multisigAccounts && multisigAccounts.findIndex(m => m.authority.equals(treasurer)) !== -1) {
      return true;
    }

    return false;
  }, [
    publicKey,
    multisigAccounts, 
    treasuryDetails,
  ]);

  const shouldFundFromTreasury = useCallback(() => {
    if (!treasuryDetails || (treasuryDetails && treasuryDetails.autoClose)) {
      return false;
    }

    return true;
  }, [treasuryDetails]);

  const onAcceptWithdrawTreasuryFunds = () => {
    handleOk({
      title: proposalTitle,
      amount: topupAmount,
      tokenAmount: tokenAmount,
      destinationAccount: to
    });
  }

  const getTransactionStartButtonLabel = () => {
    return !to
      ? 'Enter an address'
      : to && !isValidAddress(to)
        ? 'Invalid address'
        : !tokenAmount || +tokenAmount === 0
          ? 'Enter amount'
          : unallocatedBalance && unallocatedBalance.isZero()
            ? 'No balance'
            : (tokenAmount && unallocatedBalance && tokenAmount > (unallocatedBalance || new BN(0)))
              ? 'Amount exceeded'
              : !isVerifiedRecipient
                ? t('transactions.validation.verified-recipient-unchecked')
                : t('treasuries.withdraw-funds.main-cta')
  }

  const getTransactionStartButtonLabelMultisig = () => {
    return !proposalTitle
      ? "Add a proposal title"
      : !to
        ? 'Enter an address'
        : to && !isValidAddress(to)
          ? 'Invalid address'
          : !tokenAmount || +tokenAmount === 0
            ? 'Enter amount'
            : unallocatedBalance && unallocatedBalance.isZero()
              ? 'No balance'
              : (tokenAmount && unallocatedBalance && tokenAmount > (unallocatedBalance || new BN(0)))
                ? 'Amount exceeded'
                : !isVerifiedRecipient
                  ? t('transactions.validation.verified-recipient-unchecked')
                  : 'Sign proposal'
  }

  useEffect(() => {
    if (isVisible) {
      if (multisigAccounts && multisigAccounts.length > 0) {
        const msAddresses = multisigAccounts.map(ms => ms.id.toBase58());
        setMultisigAddresses(msAddresses);
      }
    }
  }, [
    isVisible,
    multisigAccounts
  ]);

  const onCloseModal = () => {
    consoleOut('onCloseModal called!', '', 'crimson');
    handleClose();
    onAfterClose();
  }

  const onAfterClose = () => {
    setTimeout(() => {
      setProposalTitle("");
      setTopupAmount("");
      setTo("");
      setIsVerifiedRecipient(false);
    });
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }

  const onTitleInputValueChange = (e: any) => {
    setProposalTitle(e.target.value);
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
      setTokenAmount(new BN(toTokenAmount2(newValue, decimals).toString()));
    }
  };

  const refreshPage = () => {
    handleClose();
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
            ((shouldFundFromTreasury() && unallocatedBalance.gtn(0)) ||
            (!shouldFundFromTreasury() && userBalance.gtn(0))) &&
            tokenAmount && tokenAmount.gtn(0) &&
            ((!shouldFundFromTreasury() && tokenAmount.lte(userBalance)) ||
            (shouldFundFromTreasury() && ((isfeePayedByTreasurerOn() && tokenAmount.lte(maxAllocatableAmount)) ||
            (!isfeePayedByTreasurerOn() && tokenAmount.lte(unallocatedBalance)))))
      ? true
      : false;
  }

  // Validation if multisig
  const isValidFormMultisig = (): boolean => {
    const userBalance = makeInteger(tokenBalance, selectedToken?.decimals || 6);
    return  publicKey &&
            proposalTitle &&
            to &&
            isValidAddress(to) &&
            !isInputMultisigAddress(to) &&
            selectedToken && 
            isVerifiedRecipient &&
            ((shouldFundFromTreasury() && unallocatedBalance.gtn(0)) ||
            (!shouldFundFromTreasury() && userBalance.gtn(0))) &&
            tokenAmount && tokenAmount.gtn(0) &&
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
    if (((localStreamDetail && localStreamDetail.version >= 2 && (localStreamDetail as Stream).feePayedByTreasurer) || preSetting) && transactionFees) {
      const BASE_100_TO_BASE_1_MULTIPLIER = 10_000;
      const feeNumerator = transactionFees.mspPercentFee * BASE_100_TO_BASE_1_MULTIPLIER;
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
          unallocatedBalance: unallocatedBalance.toString(),
          feeNumerator: feeNumerator,
          feePercentage01: feeNumerator/feeDenaminator,
          badStreamMaxAllocation: badStreamMaxAllocation.toString(),
          feeAmount: feeAmount.toString(),
          badTotal: badTotal.toString(),
          badRemaining: badRemaining.toString(),
          goodStreamMaxAllocation: goodStreamMaxAllocation.toString(),
          goodTotal: goodTotal.toString(),
          goodRemaining: goodRemaining.toString(),
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
    transactionFees,
  ]);

  const getTokenPrice = useCallback(() => {
    if (!topupAmount || !selectedToken) {
        return 0;
    }

    return parseFloat(topupAmount) * getTokenPriceBySymbol(selectedToken.symbol);
}, [topupAmount, selectedToken, getTokenPriceBySymbol]);

  const isNewTreasury = useCallback(() => {
    if (treasuryDetails) {
      const v2 = treasuryDetails as Treasury;
      return v2.version >= 2 ? true : false;
    }

    return false;
  }, [treasuryDetails]);

  // Set treasury unalocated balance in BN
  useEffect(() => {

    const getUnallocatedBalance = (details: Treasury | TreasuryInfo) => {
      const balance = new BN(details.balance);
      const allocationAssigned = new BN(details.allocationAssigned);
      return balance.sub(allocationAssigned);
    }

    if (isVisible && treasuryDetails) {
      const unallocated = getUnallocatedBalance(treasuryDetails);
      const ub = isNewTreasury()
        ? unallocated
        : toUiAmount2(unallocated, selectedToken?.decimals || 6);
      consoleOut('unallocatedBalance:', ub.toString(), 'blue');
      setUnallocatedBalance(new BN(ub));
    }
  }, [
    isVisible,
    treasuryDetails,
    selectedToken,
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
              {formatThousands(isNewTreasury ? +getSdkValue(v2.totalStreams) : +getSdkValue(v1.streamsAmount))}
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
      visible={isVisible}
      onOk={onAcceptWithdrawTreasuryFunds}
      onCancel={onCloseModal}
      afterClose={() => {
        setTopupAmount("");
        setTokenAmount(new BN(0));
        setIsVerifiedRecipient(false);
      }}
      width={isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}>

      <div className={!isBusy ? "panel1 show" : "panel1 hide"}>
        {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
          <>
            {/* Proposal title */}
            {param === "multisig" && (
              <div className="mb-3">
                <div className="form-label">{t('multisig.proposal-modal.title')}</div>
                <InputMean
                  id="proposal-title-field"
                  name="Title"
                  className="w-100 general-text-input"
                  onChange={onTitleInputValueChange}
                  placeholder="Add a proposal title (required)"
                  value={proposalTitle}
                />
              </div>
            )}

            {/* Transfer from */}
            {treasuryDetails && (
              <div className="mb-3">
                <div className="form-label">{t('treasuries.withdraw-funds.selected-treasury-label')}</div>
                  <div className="well">
                    {renderTreasury(treasuryDetails)}
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
                                consoleOut('tokenAmount:', tokenAmount.toString(), 'blue');
                                consoleOut('maxAmount:', maxAmount.toString(), 'blue');
                                setTopupAmount(toUiAmount2(new BN(maxAmount), decimals));
                                setTokenAmount(new BN(maxAmount));
                              } else {
                                const maxAmount = getMaxAmount();
                                setTopupAmount(toUiAmount2(new BN(maxAmount), decimals));
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
                            getAmountWithSymbol(
                              unallocatedBalance,
                              selectedToken.address,
                              true,
                              splTokenList,
                              selectedToken.decimals
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
                  {publicKey ? (
                    <>
                      <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
                      ~{topupAmount
                          ? toUsCurrency(getTokenPrice())
                          : "$0.00"
                      }
                      </span>
                    </>
                  ) : (
                    <span>~$0.00</span>
                  )}
                </div>
              </div>
              {/* {(parseFloat(topupAmount) > makeDecimal(unallocatedBalance, selectedToken?.decimals || 6)) && (
                <span className="form-field-error">
                  {t('transactions.validation.invalid-amount')}
                </span>
              )} */}
            </div>

            {/* explanatory paragraph */}
            {isMultisigTreasury(treasuryDetails) && (
              <p>{t("multisig.multisig-assets.explanatory-paragraph")}</p>
            )}

            {/* confirm that the recipient address doesn't belong to an exchange */}
            <div className="mt-2 mb-3 confirm-terms">
              <Checkbox checked={isVerifiedRecipient} onChange={onIsVerifiedRecipientChange}>
                {t("treasuries.withdraw-funds.verified-label")}
              </Checkbox>
            </div>

            {!isError(transactionStatus.currentOperation) && (
              <div className="col-12 p-0 mt-3">
                <Button
                  className={`center-text-in-btn ${isBusy ? 'inactive' : ''}`}
                  block
                  type="primary"
                  shape="round"
                  size="large"
                  disabled={param === "multisig" ? !isValidFormMultisig() : !isValidForm()}
                  onClick={() => {
                    if (transactionStatus.currentOperation === TransactionStatus.Iddle) {
                      onAcceptWithdrawTreasuryFunds();
                    } else if (transactionStatus.currentOperation === TransactionStatus.TransactionFinished) {
                      onCloseModal();
                    } else {
                      refreshPage();
                    }
                  }}>
                  {isBusy
                    ? ('multisig.transfer-tokens.main-cta-busy')
                    : transactionStatus.currentOperation === TransactionStatus.Iddle
                      ? (param === "multisig" ? getTransactionStartButtonLabelMultisig() : getTransactionStartButtonLabel())
                      : transactionStatus.currentOperation === TransactionStatus.TransactionFinished
                        ? t('general.cta-finish')
                        : t('general.refresh')
                  }
                </Button>
              </div>
            )}
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
                      nativeBalance,
                      NATIVE_SOL_MINT.toBase58()
                    ),
                    feeAmount: getTokenAmountAndSymbolByTokenAddress(
                      minRequiredBalance,
                      NATIVE_SOL_MINT.toBase58()
                    )})
                  }
                </h4>
              ) : (
                <h4 className="font-bold mb-3">
                  {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
                </h4>
              )}
              {!(isBusy && transactionStatus !== TransactionStatus.Iddle) && (
                <div className="row two-col-ctas mt-3 transaction-progress p-2">
                  <div className="col-12">
                    <Button
                      block
                      type="text"
                      shape="round"
                      size="middle"
                      className={isBusy ? 'inactive' : ''}
                      onClick={() => isError(transactionStatus.currentOperation)
                        ? onAcceptWithdrawTreasuryFunds()
                        : onCloseModal()}>
                      {(isError(transactionStatus.currentOperation) && transactionStatus.currentOperation !== TransactionStatus.TransactionStartFailure)
                        ? t('general.retry')
                        : t('general.cta-close')
                      }
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div 
        className={
          isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle 
            ? "panel2 show" 
            : "panel2 hide"
        }>
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
    </Modal>
  );
};
