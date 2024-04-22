import { CheckOutlined, InfoCircleOutlined, LoadingOutlined, WarningFilled, WarningOutlined } from '@ant-design/icons';
import type { MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import type { StreamInfo, TransactionFees, TreasuryInfo } from '@mean-dao/money-streaming/lib/types';
import { AccountType, type PaymentStreamingAccount, type Stream } from '@mean-dao/payment-streaming';
import { BN } from '@project-serum/anchor';
import { IconHelpCircle } from 'Icons';
import { Button, Modal, Select, Spin, Tooltip } from 'antd';
import { AddressDisplay } from 'components/AddressDisplay';
import { Identicon } from 'components/Identicon';
import { InputMean } from 'components/InputMean';
import {
  FALLBACK_COIN_IMAGE,
  MIN_SOL_BALANCE_REQUIRED,
  SOLANA_EXPLORER_URI_INSPECT_ADDRESS,
  WRAPPED_SOL_MINT_ADDRESS,
} from 'constants/common';
import { NATIVE_SOL } from 'constants/tokens';
import { AppStateContext } from 'contexts/appstate';
import { getSolanaExplorerClusterParam, useConnection } from 'contexts/connection';
import { useWallet } from 'contexts/wallet';
import { getStreamingAccountId } from 'middleware/getStreamingAccountId';
import { getStreamingAccountMint } from 'middleware/getStreamingAccountMint';
import { getStreamingAccountType } from 'middleware/getStreamingAccountType';
import { SOL_MINT } from 'middleware/ids';
import { consoleOut, getTransactionOperationDescription, isValidAddress, toUsCurrency } from 'middleware/ui';
import {
  displayAmountWithSymbol,
  formatThousands,
  getSdkValue,
  getTokenOrCustomToken,
  isValidNumber,
  shortenAddress,
  toTokenAmount,
  toUiAmount,
} from 'middleware/utils';
import type { TokenInfo } from 'models/SolanaTokenInfo';
import type { TreasuryTopupParams } from 'models/common-types';
import { TransactionStatus } from 'models/enums';
import { QRCodeSVG } from 'qrcode.react';
import type React from 'react';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LooseObject } from 'types/LooseObject';
import { TokenDisplay } from '../TokenDisplay';

const { Option } = Select;
const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

interface Props {
  associatedToken: string;
  handleClose: () => void;
  handleOk: (params: TreasuryTopupParams) => void;
  isBusy: boolean;
  isVisible: boolean;
  nativeBalance: number;
  selectedMultisig: MultisigInfo | undefined;
  transactionFees: TransactionFees;
  treasuryDetails?: PaymentStreamingAccount | TreasuryInfo;
  treasuryList?: (PaymentStreamingAccount | TreasuryInfo)[];
  treasuryStreams: Array<Stream | StreamInfo> | undefined;
  userBalances: LooseObject | undefined;
  withdrawTransactionFees: TransactionFees;
}

export const TreasuryAddFundsModal = ({
  associatedToken,
  handleClose,
  handleOk,
  isBusy,
  isVisible,
  nativeBalance,
  selectedMultisig,
  treasuryDetails,
  treasuryList,
  treasuryStreams,
  userBalances,
  withdrawTransactionFees,
}: Props) => {
  const {
    theme,
    splTokenList,
    loadingPrices,
    selectedAccount,
    transactionStatus,
    highLightableStreamId,
    getTokenPriceByAddress,
    getTokenByMintAddress,
    refreshPrices,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const connection = useConnection();
  const [topupAmount, setTopupAmount] = useState<string>('');
  const [availableBalance, setAvailableBalance] = useState(new BN(0));
  const [tokenAmount, setTokenAmount] = useState(new BN(0));
  const [tokenBalance, setSelectedTokenBalance] = useState<number>(0);
  const [showQrCode, setShowQrCode] = useState(false);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | undefined>(undefined);
  const [workingAssociatedToken, setWorkingAssociatedToken] = useState('');
  const [workingTreasuryDetails, setWorkingTreasuryDetails] = useState<PaymentStreamingAccount | TreasuryInfo>();
  const [selectedStreamingAccountId, setSelectedStreamingAccountId] = useState('');
  const [fundFromSafeOption, setFundFromSafeOption] = useState(false);
  const [proposalTitle, setProposalTitle] = useState('');

  /////////////////
  //   Getters   //
  /////////////////

  const isMultisigContext = useMemo(() => {
    return !!(publicKey && selectedAccount.isMultisig);
  }, [publicKey, selectedAccount]);

  const hasNoStreamingAccounts = useMemo(() => {
    return !!(isMultisigContext && selectedMultisig && (!treasuryList || treasuryList.length === 0));
  }, [isMultisigContext, selectedMultisig, treasuryList]);

  const getSelectedStream = useCallback(
    (id?: string) => {
      if (!treasuryStreams || treasuryStreams.length === 0 || (!id && !highLightableStreamId)) {
        return undefined;
      }

      if (id) {
        return treasuryStreams.find(ts => ts.id === id);
      }
      if (highLightableStreamId) {
        return treasuryStreams.find(ts => ts.id === highLightableStreamId);
      }

      return undefined;
    },
    [treasuryStreams, highLightableStreamId],
  );

  const getTokenPrice = useCallback(() => {
    if (!topupAmount || !selectedToken) {
      return 0;
    }

    const price = getTokenPriceByAddress(selectedToken.address, selectedToken.symbol);

    return Number.parseFloat(topupAmount) * price;
  }, [getTokenPriceByAddress, selectedToken, topupAmount]);

  const isfeePayedByTreasurerOn = useCallback(() => {
    if (highLightableStreamId) {
      consoleOut('highLightableStreamId:', highLightableStreamId, 'orange');
      consoleOut('Getting stream data...', '', 'orange');
      const stream = getSelectedStream(highLightableStreamId);
      consoleOut('stream:', stream, 'orange');
      if (stream && stream.version >= 2 && (stream as Stream).tokenFeePayedFromAccount) {
        return true;
      }
    }

    return false;
  }, [highLightableStreamId, getSelectedStream]);

  const getMaxAmount = useCallback(
    (preSetting = false) => {
      if (withdrawTransactionFees && highLightableStreamId) {
        const stream = getSelectedStream();
        if (stream && ((stream as Stream).tokenFeePayedFromAccount || preSetting)) {
          const BASE_100_TO_BASE_1_MULTIPLIER = 10_000;
          const feeNumerator = withdrawTransactionFees.mspPercentFee * BASE_100_TO_BASE_1_MULTIPLIER;
          const feeDenaminator = 1000000;
          const badStreamMaxAllocation = availableBalance
            .mul(new BN(feeDenaminator))
            .div(new BN(feeNumerator + feeDenaminator));

          const feeAmount = badStreamMaxAllocation.mul(new BN(feeNumerator)).div(new BN(feeDenaminator));

          const goodStreamMaxAllocation = availableBalance.sub(feeAmount);
          const maxAmount = goodStreamMaxAllocation;

          return maxAmount;
        }
      }
      return selectedToken && availableBalance ? availableBalance : new BN(0);
    },
    [selectedToken, availableBalance, highLightableStreamId, withdrawTransactionFees, getSelectedStream],
  );

  const selectProperBalance = useCallback(() => {
    if (selectedToken?.address !== WRAPPED_SOL_MINT_ADDRESS) {
      return tokenBalance;
    }
    if (userBalances) {
      return userBalances[NATIVE_SOL.address] || 0;
    }

    return 0;
  }, [selectedToken?.address, tokenBalance, userBalances]);

  const selectFromTokenBalance = useCallback(() => {
    if (!selectedToken) {
      return nativeBalance;
    }
    consoleOut('selectedToken:', selectedToken ? selectedToken.address : '-', 'blue');
    consoleOut('token decimals:', selectedToken ? selectedToken.decimals : '-', 'blue');
    consoleOut('tokenBalance:', tokenBalance || 0, 'blue');
    if (fundFromSafeOption) {
      return selectProperBalance();
    }

    return selectedToken.address === WRAPPED_SOL_MINT_ADDRESS ? nativeBalance : tokenBalance;
  }, [fundFromSafeOption, nativeBalance, selectProperBalance, selectedToken, tokenBalance]);

  const isNewTreasury = useCallback((treasury: PaymentStreamingAccount | TreasuryInfo) => {
    if (treasury) {
      const v2 = treasury as PaymentStreamingAccount;
      return v2.version >= 2;
    }

    return false;
  }, []);

  /////////////////////
  // Data management //
  /////////////////////

  // Keep token balance updated
  useEffect(() => {
    if (selectedToken && userBalances) {
      if (userBalances[selectedToken.address]) {
        setSelectedTokenBalance(userBalances[selectedToken.address]);
      } else {
        setSelectedTokenBalance(0);
      }
    }
  }, [selectedToken, userBalances]);

  // Set working copy of the selected streaming account if passed-in
  // Also set the working associated token
  // Also set the treasury type
  useEffect(() => {
    if (isVisible) {
      if (treasuryDetails) {
        consoleOut('treasuryDetails aquired:', treasuryDetails, 'blue');
        setWorkingTreasuryDetails(treasuryDetails);
        setSelectedStreamingAccountId(treasuryDetails.id.toString());
        const associatedToken = getStreamingAccountMint(treasuryDetails);
        setWorkingAssociatedToken(associatedToken);
      }
    }
  }, [isVisible, treasuryDetails]);

  // Preset a working copy of the first available streaming account in the list if treasuryDetails was not passed in
  useEffect(() => {
    if (isVisible && !treasuryDetails && treasuryList && treasuryList.length > 0 && !workingTreasuryDetails) {
      consoleOut('treasuryDetails not set!', 'Try to pick one from list', 'blue');
      const selected = treasuryList[0];
      consoleOut('treasuryDetails preset:', selected, 'blue');
      setWorkingTreasuryDetails(selected);
      setSelectedStreamingAccountId(selected.id.toString());
      const associatedToken = getStreamingAccountMint(selected);
      setWorkingAssociatedToken(associatedToken);
    }
  }, [isVisible, treasuryDetails, treasuryList, workingTreasuryDetails]);

  // Set token based on selected treasury details
  // biome-ignore lint/correctness/useExhaustiveDependencies: Deps managed manually
  useEffect(() => {
    if (hasNoStreamingAccounts || !workingAssociatedToken || !userBalances) {
      return;
    }
    consoleOut('workingAssociatedToken:', workingAssociatedToken, 'darkorange');
    getTokenOrCustomToken(connection, workingAssociatedToken, getTokenByMintAddress).then(token => {
      consoleOut('PaymentStreamingAccount workingAssociatedToken:', token, 'blue');
      setSelectedToken(token);
      consoleOut('userBalances:', userBalances, 'darkorange');
      if (userBalances[workingAssociatedToken]) {
        setSelectedTokenBalance(userBalances[workingAssociatedToken]);
      } else {
        setSelectedTokenBalance(0);
      }
    });
  }, [connection, userBalances, workingAssociatedToken, hasNoStreamingAccounts]);

  // Set available balance in BN either from user's wallet or from treasury if a stream is being funded
  useEffect(() => {
    const getUnallocatedBalance = (details: PaymentStreamingAccount | TreasuryInfo) => {
      const balance = new BN(details.balance);
      const allocationAssigned = new BN(details.allocationAssigned);
      return balance.sub(allocationAssigned);
    };

    if (isVisible && workingTreasuryDetails && selectedToken) {
      if (highLightableStreamId) {
        // Take source balance from the treasury
        const unallocated = getUnallocatedBalance(workingTreasuryDetails);
        const ub = isNewTreasury(workingTreasuryDetails)
          ? unallocated.toString()
          : toUiAmount(unallocated, selectedToken.decimals);
        consoleOut('unallocatedBalance:', ub, 'blue');
        setAvailableBalance(new BN(ub));
      } else {
        // Take source balance from the user's wallet or safe
        const userBalance = selectFromTokenBalance();
        consoleOut(`User's balance Ui:`, userBalance, 'blue');
        const toBignumber = toTokenAmount(userBalance, selectedToken.decimals, true) as string;
        consoleOut(`User's balance Bn:`, toBignumber, 'blue');
        setAvailableBalance(new BN(toBignumber));
      }
    } else {
      setAvailableBalance(new BN(0));
    }
  }, [isVisible, selectedToken, highLightableStreamId, workingTreasuryDetails, selectFromTokenBalance, isNewTreasury]);

  // When modal goes visible, use the treasury associated token or use the default from the appState
  useEffect(() => {
    if (isVisible && associatedToken) {
      getTokenOrCustomToken(connection, associatedToken, getTokenByMintAddress).then(token => {
        setSelectedToken(token);
      });
    }
  }, [associatedToken, connection, getTokenByMintAddress, isVisible]);

  useEffect(() => {
    if (isVisible) {
      if (isMultisigContext && selectedMultisig && !highLightableStreamId) {
        consoleOut('Getting funds from safe...', '', 'blue');
        setFundFromSafeOption(true);
      } else {
        setFundFromSafeOption(false);
      }
    }
  }, [highLightableStreamId, isVisible, isMultisigContext, selectedMultisig]);

  ////////////////
  //   Events   //
  ////////////////

  const onStreamingAccountSelected = useCallback(
    (e: string) => {
      consoleOut('Selected streaming account:', e, 'blue');
      setSelectedStreamingAccountId(e);
      const item = treasuryList?.find(t => getStreamingAccountId(t) === e);
      consoleOut('item:', item, 'blue');
      if (item) {
        setWorkingTreasuryDetails(item);
        setSelectedStreamingAccountId(item.id.toString());
        const tokenAddress = getStreamingAccountMint(item);
        getTokenOrCustomToken(connection, tokenAddress, getTokenByMintAddress).then(token => {
          consoleOut('PaymentStreamingAccount workingAssociatedToken:', token, 'blue');
          setSelectedToken(token);
          setWorkingAssociatedToken(tokenAddress);
        });
      }
    },
    [connection, getTokenByMintAddress, treasuryList],
  );

  const onAcceptModal = useCallback(() => {
    if (!selectedToken) {
      return;
    }

    const params: TreasuryTopupParams = {
      proposalTitle: proposalTitle || '',
      amount: topupAmount,
      tokenAmount: tokenAmount.toString(),
      associatedToken:
        selectedToken?.address === WRAPPED_SOL_MINT_ADDRESS ? SOL_MINT.toBase58() : selectedToken.address ?? '',
      streamId: highLightableStreamId ?? '',
      treasuryId: selectedStreamingAccountId ?? '',
      contributor: fundFromSafeOption && selectedMultisig ? selectedMultisig.authority.toBase58() : '',
      fundFromSafe: fundFromSafeOption,
    };

    handleOk(params);
  }, [
    fundFromSafeOption,
    handleOk,
    highLightableStreamId,
    proposalTitle,
    selectedMultisig,
    selectedStreamingAccountId,
    selectedToken,
    topupAmount,
    tokenAmount,
  ]);

  // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
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

  //////////////////
  //  Validation  //
  //////////////////

  const isStreamingAccountSelected = (): boolean => {
    const isMultisig = !!(isMultisigContext && selectedMultisig);
    return !!(!isMultisig || (isMultisig && selectedStreamingAccountId && isValidAddress(selectedStreamingAccountId)));
  };

  const isValidInput = (): boolean => {
    const effectiveBalance = selectedToken?.address === WRAPPED_SOL_MINT_ADDRESS ? nativeBalance : tokenBalance;
    return !!(
      publicKey &&
      (!fundFromSafeOption || (isMultisigContext && selectedMultisig && fundFromSafeOption && proposalTitle)) &&
      selectedToken &&
      ((fundFromSafeOption && effectiveBalance) || (!fundFromSafeOption && availableBalance.gtn(0))) &&
      nativeBalance > MIN_SOL_BALANCE_REQUIRED &&
      tokenAmount.gtn(0) &&
      tokenAmount.lte(getMaxAmount())
    );
  };

  const isTopupFormValid = () => {
    return !!(publicKey && isValidInput());
  };

  // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
  const onTitleInputValueChange = (e: any) => {
    setProposalTitle(e.target.value);
  };

  const isProposalTitleRequired = () => {
    return !!(fundFromSafeOption && isMultisigContext && selectedMultisig && !proposalTitle);
  };

  const isTokenBalanceEmpty = () => {
    const effectiveBalance = selectedToken?.address === WRAPPED_SOL_MINT_ADDRESS ? nativeBalance : tokenBalance;
    return !!(
      !selectedToken ||
      (fundFromSafeOption && !effectiveBalance) ||
      (!fundFromSafeOption && availableBalance.isZero())
    );
  };

  const getTransactionStartButtonLabel = () => {
    if (!publicKey) {
      return t('transactions.validation.not-connected');
    }
    if (isProposalTitleRequired()) {
      return 'Add a proposal title';
    }
    if (isTokenBalanceEmpty()) {
      return t('transactions.validation.no-balance');
    }
    if (!tokenAmount || tokenAmount.isZero()) {
      return t('transactions.validation.no-amount');
    }
    if (tokenAmount.gt(getMaxAmount())) {
      return t('transactions.validation.amount-high');
    }
    if (nativeBalance <= MIN_SOL_BALANCE_REQUIRED) {
      return t('transactions.validation.insufficient-balance-needed', { balance: MIN_SOL_BALANCE_REQUIRED });
    }
    if (highLightableStreamId) {
      return t('treasuries.add-funds.main-cta-fund-stream');
    }

    return t('treasuries.add-funds.main-cta');
  };

  const getMainCtaLabel = () => {
    if (isBusy) {
      return highLightableStreamId
        ? t('treasuries.add-funds.main-cta-fund-stream-busy')
        : t('treasuries.add-funds.main-cta-busy');
    }

    return transactionStatus.currentOperation === TransactionStatus.Iddle
      ? getTransactionStartButtonLabel()
      : t('general.cta-try-again');
  };

  ///////////////
  // Rendering //
  ///////////////

  const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    event.currentTarget.src = FALLBACK_COIN_IMAGE;
    event.currentTarget.className = 'error';
  };

  const getStreamingAccountIcon = (item?: PaymentStreamingAccount | TreasuryInfo) => {
    if (!item) {
      return null;
    }

    const tokenAddress = getStreamingAccountMint(item);
    const token = getTokenByMintAddress(tokenAddress);

    return (
      <div className='token-icon'>
        {tokenAddress ? (
          <>
            {token?.logoURI ? (
              <img alt={`${token.name}`} width={20} height={20} src={token.logoURI} onError={imageOnErrorHandler} />
            ) : (
              <Identicon address={tokenAddress} style={{ width: '20', display: 'inline-flex' }} />
            )}
          </>
        ) : (
          <Identicon address={item.id} style={{ width: '20', display: 'inline-flex' }} />
        )}
      </div>
    );
  };

  const getStreamingAccountDescription = (item: PaymentStreamingAccount | TreasuryInfo | undefined) => {
    if (!item) {
      return null;
    }
    const treasuryType = getStreamingAccountType(item);

    const isV2Treasury = !!(item && item.version >= 2);
    const v1 = item as TreasuryInfo;
    const v2 = item as PaymentStreamingAccount;

    const name = isV2Treasury ? v2.name.trim() || '' : v1.label.trim() || '';

    return (
      <>
        {name ? (
          <>
            <div className='title text-truncate'>
              {name}
              <span className={`badge small ml-1 ${theme === 'light' ? 'golden fg-dark' : 'darken'}`}>
                {treasuryType === AccountType.Open ? 'Open' : 'Locked'}
              </span>
            </div>
            <div className='subtitle text-truncate'>{shortenAddress(item.id, 8)}</div>
          </>
        ) : (
          <div className='title text-truncate'>{shortenAddress(item.id, 8)}</div>
        )}
      </>
    );
  };

  const getStreamingAccountStreamCount = (item: PaymentStreamingAccount | TreasuryInfo | undefined) => {
    if (!item) {
      return null;
    }
    const isV2Treasury = !!(item && item.version >= 2);
    const v1 = item as TreasuryInfo;
    const v2 = item as PaymentStreamingAccount;
    return (
      <>
        {!isV2Treasury && v1.upgradeRequired ? (
          <span>&nbsp;</span>
        ) : (
          <>
            <div className='rate-amount'>
              {formatThousands(isV2Treasury ? +getSdkValue(v2.totalStreams) : +getSdkValue(v1.streamsAmount))}
            </div>
            <div className='interval'>streams</div>
          </>
        )}
      </>
    );
  };

  const renderStreamingAccountItem = (item: PaymentStreamingAccount | TreasuryInfo) => {
    const accountId = getStreamingAccountId(item);
    return (
      <Option key={`${item.id}`} value={accountId}>
        <div className='transaction-list-row no-pointer'>
          <div className='icon-cell'>{getStreamingAccountIcon(item)}</div>
          <div className='description-cell'>{getStreamingAccountDescription(item)}</div>
          <div className='rate-cell'>{getStreamingAccountStreamCount(item)}</div>
        </div>
      </Option>
    );
  };

  return (
    <Modal
      className='mean-modal simple-modal'
      title={
        <div className='modal-title'>
          {highLightableStreamId
            ? t('treasuries.add-funds.modal-title-fund-stream')
            : t('treasuries.add-funds.modal-title')}
        </div>
      }
      maskClosable={false}
      footer={null}
      open={isVisible}
      onOk={onAcceptModal}
      onCancel={handleClose}
      width={isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}
    >
      {hasNoStreamingAccounts && !treasuryDetails ? (
        <div className='text-center px-4 py-4'>
          {theme === 'light' ? (
            <WarningFilled style={{ fontSize: 48 }} className='icon mt-0 mb-3 fg-warning' />
          ) : (
            <WarningOutlined style={{ fontSize: 48 }} className='icon mt-0 mb-3 fg-warning' />
          )}
          <h2 className='mb-3 fg-warning'>No streaming accounts</h2>
          <p>
            Your super safe needs a streaming account to set up and fund payment streams. To get started, create and
            fund a streaming account and then you can proceed with creating a payment stream.
          </p>
        </div>
      ) : (
        <>
          <div className={!isBusy ? 'panel1 show' : 'panel1 hide'}>
            {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
              <>
                {/* Proposal title */}
                {isMultisigContext && selectedMultisig && (
                  <div className='mb-3 mt-3'>
                    <div className='form-label text-left'>{t('multisig.proposal-modal.title')}</div>
                    <InputMean
                      id='proposal-title-field'
                      name='Title'
                      className={`w-100 general-text-input${!fundFromSafeOption ? ' disabled' : ''}`}
                      onChange={onTitleInputValueChange}
                      placeholder='Add a proposal title (required)'
                      value={proposalTitle}
                    />
                  </div>
                )}

                {isMultisigContext && selectedMultisig && !treasuryDetails && (
                  <div className='mb-3'>
                    <div className='form-label icon-label'>
                      {t('treasuries.add-funds.select-streaming-account-label')}
                      <Tooltip
                        placement='bottom'
                        title='Every payment stream is funded from a streaming account. Select the account to fund below.'
                      >
                        <span>
                          <IconHelpCircle className='mean-svg-icons' />
                        </span>
                      </Tooltip>
                    </div>
                    <div className={`well ${isBusy ? 'disabled' : ''}`}>
                      <div className='dropdown-trigger no-decoration flex-fixed-right align-items-center'>
                        {treasuryList && treasuryList.length > 0 && (
                          <Select
                            className='auto-height'
                            value={selectedStreamingAccountId}
                            style={{ width: '100%', maxWidth: 'none' }}
                            popupClassName='stream-select-dropdown'
                            onChange={onStreamingAccountSelected}
                            bordered={false}
                            showArrow={false}
                            dropdownRender={menu => <div>{menu}</div>}
                          >
                            {treasuryList.map(option => {
                              return renderStreamingAccountItem(option);
                            })}
                          </Select>
                        )}
                      </div>
                      {selectedStreamingAccountId && !isValidAddress(selectedStreamingAccountId) && (
                        <span className='form-field-error'>{t('transactions.validation.address-validation')}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Top up amount */}
                <div className='mb-3'>
                  {highLightableStreamId ? (
                    <>
                      <p>{t('treasuries.add-funds.allocation-heading')}</p>
                      <div className='form-label'>{t('treasuries.add-funds.allocation-amount-label')}</div>
                    </>
                  ) : (
                    <div className='form-label'>{t('treasuries.add-funds.label')}</div>
                  )}
                  <div className={`well ${isBusy ? 'disabled' : ''}`}>
                    <div className='flex-fixed-left'>
                      <div className='left'>
                        <span className='add-on'>
                          {selectedToken && (
                            <TokenDisplay
                              onClick={() => {}}
                              mintAddress={selectedToken.address}
                              showCaretDown={false}
                              fullTokenInfo={selectedToken}
                            />
                          )}
                          {selectedToken && availableBalance.gtn(0) ? (
                            <div
                              id='treasury-add-funds-max'
                              className='token-max simplelink'
                              onKeyDown={() => {}}
                              onClick={() => {
                                const decimals = selectedToken ? selectedToken.decimals : 6;
                                if (isfeePayedByTreasurerOn()) {
                                  const maxAmount = getMaxAmount(true);
                                  consoleOut('PaymentStreamingAccount pays for fees...', '', 'blue');
                                  consoleOut('Settings maxAmount to:', maxAmount.toString(), 'blue');
                                  setTopupAmount(toUiAmount(maxAmount, decimals));
                                  setTokenAmount(maxAmount);
                                } else {
                                  const maxAmount = getMaxAmount();
                                  consoleOut('Settings maxAmount to:', maxAmount.toString(), 'blue');
                                  setTopupAmount(toUiAmount(maxAmount, decimals));
                                  setTokenAmount(maxAmount);
                                }
                              }}
                            >
                              MAX
                            </div>
                          ) : null}
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
                          onChange={handleAmountChange}
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
                        {!highLightableStreamId ? (
                          <span>{t('add-funds.label-right')}:</span>
                        ) : (
                          <span>{t('treasuries.treasury-streams.available-unallocated-balance-label')}:</span>
                        )}
                        <span>
                          {`${
                            selectedToken && availableBalance.gtn(0)
                              ? displayAmountWithSymbol(
                                  availableBalance,
                                  selectedToken.address,
                                  selectedToken.decimals,
                                  splTokenList,
                                )
                              : '0'
                          }`}
                        </span>
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
                </div>
              </>
            ) : transactionStatus.currentOperation === TransactionStatus.TransactionFinished ? (
              <div className='transaction-progress'>
                <CheckOutlined style={{ fontSize: 48 }} className='icon mt-0' />
                <h4 className='font-bold'>{t('treasuries.add-funds.success-message')}</h4>
              </div>
            ) : (
              <div className='transaction-progress p-0'>
                <InfoCircleOutlined style={{ fontSize: 48 }} className='icon mt-0' />
                {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                  <h4 className='mb-4'>{transactionStatus.customError}</h4>
                ) : (
                  <h4 className='font-bold mb-3'>
                    {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
                  </h4>
                )}
              </div>
            )}
          </div>

          <div className={isBusy ? 'panel2 show' : 'panel2 hide'}>
            <div className='transaction-progress'>
              <Spin indicator={bigLoadingIcon} className='icon mt-0' />
              <h4 className='font-bold mb-1'>
                {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
              </h4>
              {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
                <div className='indication'>{t('transactions.status.instructions')}</div>
              )}
            </div>
          </div>

          {!(isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle) && (
            <div className='mt-3 transaction-progress p-0'>
              <Button
                className={`center-text-in-btn ${isBusy ? 'inactive' : ''}`}
                block
                type='primary'
                shape='round'
                size='large'
                disabled={!isStreamingAccountSelected() || !isTopupFormValid()}
                onClick={onAcceptModal}
              >
                {getMainCtaLabel()}
              </Button>
            </div>
          )}

          {!isBusy &&
            !highLightableStreamId &&
            workingTreasuryDetails &&
            transactionStatus.currentOperation === TransactionStatus.Iddle && (
              <div className='text-center mt-4 mb-2'>
                <p>You can also fund this streaming account by sending {selectedToken?.symbol} tokens to:</p>

                {showQrCode && workingTreasuryDetails && (
                  <div className='qr-container bg-white'>
                    <QRCodeSVG value={workingTreasuryDetails.id.toString()} size={200} />
                  </div>
                )}

                {workingTreasuryDetails && (
                  <div className='flex-center mb-2'>
                    <AddressDisplay
                      address={workingTreasuryDetails.id.toString()}
                      showFullAddress={true}
                      iconStyles={{ width: '15', height: '15' }}
                      newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${workingTreasuryDetails.id.toString()}${getSolanaExplorerClusterParam()}`}
                    />
                  </div>
                )}

                {!showQrCode && (
                  <div
                    className='simplelink underline'
                    onKeyDown={() => {}}
                    onClick={() => {
                      setShowQrCode(true);
                    }}
                  >
                    Scan QR code instead?
                  </div>
                )}
              </div>
            )}
        </>
      )}
    </Modal>
  );
};
