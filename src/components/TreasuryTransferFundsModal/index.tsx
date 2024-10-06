import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import type { MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import type { TransactionFees, TreasuryInfo } from '@mean-dao/money-streaming';
import { AccountType, type PaymentStreamingAccount } from '@mean-dao/payment-streaming';
import { BN } from '@project-serum/anchor';
import { Button, Modal, Spin } from 'antd';
import Checkbox, { type CheckboxChangeEvent } from 'antd/lib/checkbox/Checkbox';
import type React from 'react';
import { type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FALLBACK_COIN_IMAGE } from 'src/app-constants/common';
import { Identicon } from 'src/components/Identicon';
import { InputMean } from 'src/components/InputMean';
import { TokenDisplay } from 'src/components/TokenDisplay';
import { AppStateContext } from 'src/contexts/appstate';
import { useWallet } from 'src/contexts/wallet';
import { getStreamingAccountMint } from 'src/middleware/getStreamingAccountMint';
import { getStreamingAccountType } from 'src/middleware/getStreamingAccountType';
import { SOL_MINT } from 'src/middleware/ids';
import { isError } from 'src/middleware/transactions';
import { consoleOut, getTransactionOperationDescription, isValidAddress, toUsCurrency } from 'src/middleware/ui';
import {
  displayAmountWithSymbol,
  formatThousands,
  getAmountWithSymbol,
  getSdkValue,
  isValidNumber,
  makeInteger,
  shortenAddress,
  toTokenAmount,
  toTokenAmountBn,
  toUiAmount,
} from 'src/middleware/utils';
import type { TokenInfo } from 'src/models/SolanaTokenInfo';
import { TransactionStatus } from 'src/models/enums';
import type { TreasuryWithdrawParams } from 'src/models/treasuries';
import './style.scss';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const TreasuryTransferFundsModal = (props: {
  handleClose: () => void;
  handleOk: (params: TreasuryWithdrawParams) => void;
  isVisible: boolean;
  isBusy: boolean;
  nativeBalance: number;
  minRequiredBalance: number;
  transactionFees: TransactionFees;
  treasuryDetails: PaymentStreamingAccount | TreasuryInfo | undefined;
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
    selectedToken,
  } = props;
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const {
    theme,
    splTokenList,
    tokenBalance,
    isWhitelisted,
    loadingPrices,
    selectedAccount,
    transactionStatus,
    getTokenPriceByAddress,
    getTokenByMintAddress,
    setTransactionStatus,
    refreshPrices,
  } = useContext(AppStateContext);

  const [to, setTo] = useState('');
  const [topupAmount, setTopupAmount] = useState<string>('');
  const [tokenAmount, setTokenAmount] = useState(new BN(0));
  const [unallocatedBalance, setUnallocatedBalance] = useState(new BN(0));
  const [multisigAddresses, setMultisigAddresses] = useState<string[]>([]);
  const [isVerifiedRecipient, setIsVerifiedRecipient] = useState(false);
  const [proposalTitle, setProposalTitle] = useState('');

  const isMultisigContext = useMemo(() => {
    return !!(publicKey && selectedAccount.isMultisig);
  }, [publicKey, selectedAccount]);

  const shouldFundFromTreasury = useCallback(() => {
    if (!treasuryDetails || treasuryDetails?.autoClose) {
      return false;
    }

    return true;
  }, [treasuryDetails]);

  const onAcceptWithdrawTreasuryFunds = () => {
    const params: TreasuryWithdrawParams = {
      proposalTitle,
      amount: tokenAmount.toString(),
      destination: to,
      payer: selectedAccount.address,
      treasury: treasuryDetails?.id.toString() ?? '',
    };
    handleOk(params);
  };

  const getTransactionStartButtonLabel = () => {
    return !to
      ? 'Enter an address'
      : to && !isValidAddress(to)
        ? 'Invalid address'
        : !tokenAmount || +tokenAmount === 0
          ? 'Enter amount'
          : unallocatedBalance.isZero()
            ? 'No balance'
            : tokenAmount && unallocatedBalance && tokenAmount.gt(unallocatedBalance || new BN(0))
              ? 'Amount exceeded'
              : !isVerifiedRecipient
                ? t('transactions.validation.verified-recipient-unchecked')
                : t('treasuries.withdraw-funds.main-cta');
  };

  const getTransactionStartButtonLabelMultisig = () => {
    return !proposalTitle
      ? 'Add a proposal title'
      : !to
        ? 'Enter an address'
        : to && !isValidAddress(to)
          ? 'Invalid address'
          : !tokenAmount || +tokenAmount === 0
            ? 'Enter amount'
            : unallocatedBalance.isZero()
              ? 'No balance'
              : tokenAmount && unallocatedBalance && tokenAmount.gt(unallocatedBalance || new BN(0))
                ? 'Amount exceeded'
                : !isVerifiedRecipient
                  ? t('transactions.validation.verified-recipient-unchecked')
                  : 'Sign proposal';
  };

  useEffect(() => {
    if (isVisible) {
      if (multisigAccounts && multisigAccounts.length > 0) {
        const msAddresses = multisigAccounts.map(ms => ms.id.toBase58());
        setMultisigAddresses(msAddresses);
      }
    }
  }, [isVisible, multisigAccounts]);

  const onCloseModal = () => {
    consoleOut('onCloseModal called!', '', 'crimson');
    handleClose();
    onAfterClose();
  };

  const onAfterClose = () => {
    setTimeout(() => {
      setProposalTitle('');
      setTopupAmount('');
      setTo('');
      setIsVerifiedRecipient(false);
    });
    setTransactionStatus({
      lastOperation: TransactionStatus.Idle,
      currentOperation: TransactionStatus.Idle,
    });
  };

  const onTitleInputValueChange = (value: string) => {
    setProposalTitle(value);
  };

  const onMintToAddressChange = (value: string) => {
    const trimmedValue = value.trim();
    setTo(trimmedValue);
  };

  const handleAmountChange = (value: string) => {
    let newValue = value.trim();

    const decimals = selectedToken ? selectedToken.decimals : 0;
    const splitted = newValue.toString().split('.');
    const left = splitted[0];

    if (decimals && splitted[1]) {
      if (splitted[1].length > decimals) {
        splitted[1] = splitted[1].slice(0, -1);
        newValue = splitted.join('.');
      }
    } else if (left.length > 1) {
      const number = +splitted[0] - 0;
      splitted[0] = `${number}`;
      newValue = splitted.join('.');
    }

    if (newValue === null || newValue === undefined || newValue === '') {
      setTopupAmount('');
      setTokenAmount(new BN(0));
    } else if (newValue === '.') {
      setTopupAmount('.');
    } else if (isValidNumber(newValue)) {
      setTopupAmount(newValue);
      setTokenAmount(new BN(toTokenAmount(newValue, decimals).toString()));
    }
  };

  const refreshPage = () => {
    handleClose();
    window.location.reload();
  };

  const onIsVerifiedRecipientChange = (e: CheckboxChangeEvent) => {
    setIsVerifiedRecipient(e.target.checked);
  };

  // Validation
  const isValidForm = (): boolean => {
    const userBalance = makeInteger(tokenBalance, selectedToken?.decimals ?? 9);
    return !!(
      publicKey &&
      to &&
      isValidAddress(to) &&
      selectedToken &&
      isVerifiedRecipient &&
      ((shouldFundFromTreasury() && unallocatedBalance.gtn(0)) || (!shouldFundFromTreasury() && userBalance.gtn(0))) &&
      tokenAmount &&
      tokenAmount.gtn(0) &&
      ((!shouldFundFromTreasury() && tokenAmount.lte(userBalance)) ||
        (shouldFundFromTreasury() && tokenAmount.lte(unallocatedBalance)))
    );
  };

  // Validation if multisig
  const isValidFormMultisig = (): boolean => {
    const userBalance = makeInteger(tokenBalance, selectedToken?.decimals ?? 9);
    return !!(
      publicKey &&
      proposalTitle &&
      to &&
      isValidAddress(to) &&
      !isInputMultisigAddress(to) &&
      selectedToken &&
      isVerifiedRecipient &&
      ((shouldFundFromTreasury() && unallocatedBalance.gtn(0)) || (!shouldFundFromTreasury() && userBalance.gtn(0))) &&
      tokenAmount &&
      tokenAmount.gtn(0) &&
      ((!shouldFundFromTreasury() && tokenAmount.lte(userBalance)) ||
        (shouldFundFromTreasury() && tokenAmount.lte(unallocatedBalance)))
    );
  };

  const isInputMultisigAddress = (address: string) => {
    return multisigAddresses.includes(address);
  };

  const getMaxAmount = useCallback(() => {
    if (transactionFees) {
      const BASE_100_TO_BASE_1_MULTIPLIER = 10_000;
      const feeNumerator = transactionFees.mspPercentFee * BASE_100_TO_BASE_1_MULTIPLIER;
      const feeDenaminator = 1000000;
      const badStreamMaxAllocation = unallocatedBalance
        .mul(new BN(feeDenaminator))
        .div(new BN(feeNumerator + feeDenaminator));

      const feeAmount = badStreamMaxAllocation.mul(new BN(feeNumerator)).div(new BN(feeDenaminator));

      const badTotal = badStreamMaxAllocation.add(feeAmount);
      const badRemaining = unallocatedBalance.sub(badTotal);
      const goodStreamMaxAllocation = unallocatedBalance.sub(feeAmount);
      const goodTotal = goodStreamMaxAllocation.add(feeAmount);
      const goodRemaining = unallocatedBalance.sub(goodTotal);
      const maxAmount = goodStreamMaxAllocation;

      if (isWhitelisted) {
        // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
        const debugTable: any[] = [];
        debugTable.push({
          unallocatedBalance: unallocatedBalance.toString(),
          feeNumerator: feeNumerator,
          feePercentage01: feeNumerator / feeDenaminator,
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
      return maxAmount;
    }
    return unallocatedBalance;
  }, [isWhitelisted, unallocatedBalance, transactionFees]);

  const getTokenPrice = useCallback(() => {
    if (!topupAmount || !selectedToken) {
      return 0;
    }

    return Number.parseFloat(topupAmount) * getTokenPriceByAddress(selectedToken.address, selectedToken.symbol);
  }, [topupAmount, selectedToken, getTokenPriceByAddress]);

  // Set treasury unalocated balance in BN
  useEffect(() => {
    if (!selectedToken) {
      setUnallocatedBalance(new BN(0));
      return;
    }

    const getUnallocatedBalance = (details: PaymentStreamingAccount | TreasuryInfo) => {
      const isNew = !!(details?.version >= 2);
      let result = new BN(0);
      let balance = new BN(0);
      let allocationAssigned = new BN(0);

      if (!isNew) {
        balance = toTokenAmountBn(details.balance, selectedToken.decimals);
        allocationAssigned = toTokenAmountBn(details.allocationAssigned, selectedToken.decimals);
      } else {
        balance = new BN(details.balance);
        allocationAssigned = new BN(details.allocationAssigned);
      }
      result = balance.sub(allocationAssigned);

      return result;
    };

    if (isVisible && treasuryDetails) {
      const ub = getUnallocatedBalance(treasuryDetails);
      consoleOut('unallocatedBalance:', ub.toString(), 'blue');
      setUnallocatedBalance(new BN(ub));
    }
  }, [isVisible, treasuryDetails, selectedToken]);

  const renderTreasury = (item: PaymentStreamingAccount | TreasuryInfo) => {
    const v1 = item as TreasuryInfo;
    const v2 = item as PaymentStreamingAccount;
    const isNewTreasury = item.version >= 2;

    const treasuryType = getStreamingAccountType(item);

    const associatedToken = getStreamingAccountMint(item);
    const token = associatedToken ? getTokenByMintAddress(associatedToken) : undefined;

    const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
      event.currentTarget.src = FALLBACK_COIN_IMAGE;
      event.currentTarget.className = 'error';
    };

    let img: ReactNode;

    if (associatedToken) {
      if (token?.logoURI) {
        img = (
          <img
            alt={`${token.name}`}
            width={30}
            height={30}
            src={token.logoURI}
            onError={imageOnErrorHandler}
            className='token-img'
          />
        );
      } else {
        img = (
          <Identicon address={associatedToken} style={{ width: '30', display: 'inline-flex' }} className='token-img' />
        );
      }
    } else {
      img = (
        <Identicon
          address={isNewTreasury ? v2.id.toString() : v1.id?.toString()}
          style={{ width: '30', display: 'inline-flex' }}
          className='token-img'
        />
      );
    }

    return (
      <div className='transaction-list-row no-pointer'>
        <div className='icon-cell'>
          <div className='token-icon'>{img}</div>
        </div>
        <div className='description-cell'>
          {(isNewTreasury ? v2.name : v1.label) ? (
            <div className='title text-truncate'>
              {isNewTreasury ? v2.name : v1.label}
              <span className={`badge small ml-1 ${theme === 'light' ? 'golden fg-dark' : 'darken'}`}>
                {treasuryType === AccountType.Open ? 'Open' : 'Locked'}
              </span>
            </div>
          ) : (
            <div className='title text-truncate'>{shortenAddress(item.id as string, 8)}</div>
          )}
          {isMultisigContext ? (
            <div className='subtitle text-truncate'>{t('treasuries.treasury-list.multisig-treasury-label')}</div>
          ) : null}
        </div>
        <div className='rate-cell text-center'>
          {!isNewTreasury && v1.upgradeRequired ? (
            <span>&nbsp;</span>
          ) : (
            <>
              <div className='rate-amount'>
                {formatThousands(isNewTreasury ? +getSdkValue(v2.totalStreams) : +getSdkValue(v1.streamsAmount))}
              </div>
              <div className='interval'>streams</div>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <Modal
      className='mean-modal simple-modal'
      title={
        <div className='modal-title'>
          {isMultisigContext ? 'Propose withdrawal' : t('treasuries.withdraw-funds.modal-title')}
        </div>
      }
      maskClosable={false}
      footer={null}
      open={isVisible}
      onOk={onAcceptWithdrawTreasuryFunds}
      onCancel={onCloseModal}
      afterClose={() => {
        setTopupAmount('');
        setTokenAmount(new BN(0));
        setIsVerifiedRecipient(false);
      }}
      width={isBusy || transactionStatus.currentOperation !== TransactionStatus.Idle ? 380 : 480}
    >
      <div className={!isBusy ? 'panel1 show' : 'panel1 hide'}>
        {transactionStatus.currentOperation === TransactionStatus.Idle ? (
          <>
            {/* Proposal title */}
            {isMultisigContext && (
              <div className='mb-3'>
                <div className='form-label'>{t('multisig.proposal-modal.title')}</div>
                <InputMean
                  id='proposal-title-field'
                  name='Title'
                  className='w-100 general-text-input'
                  onChange={onTitleInputValueChange}
                  placeholder='Add a proposal title (required)'
                  value={proposalTitle}
                />
              </div>
            )}

            {/* Transfer from */}
            {treasuryDetails && (
              <div className='mb-3'>
                <div className='form-label'>{t('treasuries.withdraw-funds.selected-treasury-label')}</div>
                <div className='well'>{renderTreasury(treasuryDetails)}</div>
              </div>
            )}

            {/* Transfer to */}
            <div className='form-label'>{t('multisig.transfer-tokens.transfer-to-label')}</div>
            <div className='well'>
              <input
                id='mint-to-field'
                className='general-text-input'
                autoComplete='on'
                autoCorrect='off'
                type='text'
                onChange={e => onMintToAddressChange(e.target.value)}
                placeholder={t('multisig.transfer-tokens.transfer-to-placeholder')}
                required={true}
                spellCheck='false'
                value={to}
              />
              {to && !isValidAddress(to) ? (
                <span className='form-field-error'>{t('transactions.validation.address-validation')}</span>
              ) : (
                isInputMultisigAddress(to) && (
                  <span className='form-field-error'>{t('transactions.validation.invalid-account')}</span>
                )
              )}
            </div>

            {/* Top up amount */}
            <div className='form-label'>{t('streams.add-funds.amount-label')}</div>
            <div className='well'>
              <div className='flex-fixed-left'>
                <div className='left'>
                  <span className='add-on'>
                    {selectedToken && (
                      <TokenDisplay
                        onClick={() => {}}
                        mintAddress={selectedToken.address}
                        name={selectedToken.name}
                        showCaretDown={false}
                      />
                    )}
                    {treasuryDetails?.autoClose ? (
                      <>
                        {selectedToken && tokenBalance ? (
                          <div
                            className='token-max simplelink'
                            onKeyDown={() => {}}
                            onClick={() => {
                              setTopupAmount(tokenBalance.toFixed(selectedToken.decimals));
                              setTokenAmount(makeInteger(tokenBalance, selectedToken?.decimals || 9));
                            }}
                          >
                            MAX
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {selectedToken && unallocatedBalance ? (
                          <div
                            className='token-max simplelink'
                            onKeyDown={() => {}}
                            onClick={() => {
                              const decimals = selectedToken ? selectedToken.decimals : 6;
                              const maxAmount = getMaxAmount();
                              setTopupAmount(toUiAmount(new BN(maxAmount), decimals));
                              setTokenAmount(new BN(maxAmount));
                            }}
                          >
                            MAX
                          </div>
                        ) : null}
                      </>
                    )}
                  </span>
                </div>
                <div className='right'>
                  <input
                    id='topup-amount-field'
                    className='general-text-input text-right'
                    inputMode='decimal'
                    autoComplete='off'
                    autoCorrect='off'
                    type='text'
                    onChange={e => handleAmountChange(e.target.value)}
                    pattern='^[0-9]*[.,]?[0-9]*$'
                    placeholder='0.0'
                    minLength={1}
                    maxLength={79}
                    spellCheck='false'
                    value={topupAmount}
                  />
                </div>
              </div>
              <div className='flex-fixed-right'>
                <div className='left inner-label'>
                  {!treasuryDetails || treasuryDetails?.autoClose ? (
                    <span>{t('add-funds.label-right')}:</span>
                  ) : (
                    <span>{t('treasuries.treasury-streams.available-unallocated-balance-label')}:</span>
                  )}
                  {treasuryDetails?.autoClose ? (
                    <span>
                      {`${
                        tokenBalance && selectedToken
                          ? getAmountWithSymbol(tokenBalance, selectedToken?.address, true)
                          : '0'
                      }`}
                    </span>
                  ) : (
                    <>
                      {selectedToken && unallocatedBalance ? (
                        <span>
                          {displayAmountWithSymbol(
                            unallocatedBalance,
                            selectedToken.address,
                            selectedToken.decimals,
                            splTokenList,
                          )}
                        </span>
                      ) : tokenBalance && selectedToken ? (
                        <span>{getAmountWithSymbol(tokenBalance, selectedToken.address, true)}</span>
                      ) : null}
                    </>
                  )}
                </div>
                <div className='right inner-label'>
                  {publicKey ? (
                    <span
                      className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'}
                      onKeyDown={() => {}}
                      onClick={() => refreshPrices()}
                    >
                      ~{topupAmount ? toUsCurrency(getTokenPrice()) : '$0.00'}
                    </span>
                  ) : (
                    <span>~$0.00</span>
                  )}
                </div>
              </div>
            </div>

            {/* explanatory paragraph */}
            {isMultisigContext ? <p>{t('multisig.multisig-assets.explanatory-paragraph')}</p> : null}

            {/* confirm that the recipient address doesn't belong to an exchange */}
            <div className='mt-2 mb-3 confirm-terms'>
              <Checkbox checked={isVerifiedRecipient} onChange={onIsVerifiedRecipientChange}>
                {t('treasuries.withdraw-funds.verified-label')}
              </Checkbox>
            </div>

            {!isError(transactionStatus.currentOperation) && (
              <div className='col-12 p-0 mt-3'>
                <Button
                  className={`center-text-in-btn ${isBusy ? 'inactive' : ''}`}
                  block
                  type='primary'
                  shape='round'
                  size='large'
                  disabled={isMultisigContext ? !isValidFormMultisig() : !isValidForm()}
                  onClick={() => {
                    if (transactionStatus.currentOperation === TransactionStatus.Idle) {
                      onAcceptWithdrawTreasuryFunds();
                    } else if (transactionStatus.currentOperation === TransactionStatus.TransactionFinished) {
                      onCloseModal();
                    } else {
                      refreshPage();
                    }
                  }}
                >
                  {isBusy
                    ? 'multisig.transfer-tokens.main-cta-busy'
                    : transactionStatus.currentOperation === TransactionStatus.Idle
                      ? isMultisigContext
                        ? getTransactionStartButtonLabelMultisig()
                        : getTransactionStartButtonLabel()
                      : transactionStatus.currentOperation === TransactionStatus.TransactionFinished
                        ? t('general.cta-finish')
                        : t('general.refresh')}
                </Button>
              </div>
            )}
          </>
        ) : transactionStatus.currentOperation === TransactionStatus.TransactionFinished ? (
          <div className='transaction-progress'>
            <CheckOutlined style={{ fontSize: 48 }} className='icon mt-0' />
            <h4 className='font-bold'>{t('multisig.transfer-tokens.success-message')}</h4>
          </div>
        ) : (
          <div className='transaction-progress p-0'>
            <InfoCircleOutlined style={{ fontSize: 48 }} className='icon mt-0' />
            {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
              <h4 className='mb-4'>
                {t('transactions.status.tx-start-failure', {
                  accountBalance: getAmountWithSymbol(nativeBalance, SOL_MINT.toBase58()),
                  feeAmount: getAmountWithSymbol(minRequiredBalance, SOL_MINT.toBase58()),
                })}
              </h4>
            ) : (
              <h4 className='font-bold mb-3'>
                {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
              </h4>
            )}
          </div>
        )}
      </div>

      <div
        className={
          isBusy && transactionStatus.currentOperation !== TransactionStatus.Idle ? 'panel2 show' : 'panel2 hide'
        }
      >
        {isBusy && transactionStatus.currentOperation !== TransactionStatus.Idle && (
          <div className='transaction-progress'>
            <Spin indicator={bigLoadingIcon} className='icon mt-0' />
            <h4 className='font-bold mb-1'>
              {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
            </h4>
            {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
              <div className='indication'>{t('transactions.status.instructions')}</div>
            )}
          </div>
        )}
      </div>

      {!(isBusy && transactionStatus.currentOperation !== TransactionStatus.Idle) && (
        <div className='row two-col-ctas mt-3 transaction-progress p-2'>
          <div className='col-12'>
            <Button
              block
              type='text'
              shape='round'
              size='middle'
              className={isBusy ? 'inactive' : ''}
              onClick={() =>
                isError(transactionStatus.currentOperation) ? onAcceptWithdrawTreasuryFunds() : onCloseModal()
              }
            >
              {isError(transactionStatus.currentOperation) &&
              transactionStatus.currentOperation !== TransactionStatus.TransactionStartFailure
                ? t('general.retry')
                : t('general.cta-close')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
