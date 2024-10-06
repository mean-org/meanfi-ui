import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import type { MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import type { TransactionFees } from '@mean-dao/money-streaming/lib/types';
import type { PaymentStreamingAccount, Stream, StreamTemplate } from '@mean-dao/payment-streaming';
import { BN } from '@project-serum/anchor';
import { Button, Modal, Spin } from 'antd';
import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MIN_SOL_BALANCE_REQUIRED,
  SOLANA_EXPLORER_URI_INSPECT_ADDRESS,
  WRAPPED_SOL_MINT_ADDRESS,
} from 'src/app-constants/common';
import { NATIVE_SOL } from 'src/app-constants/tokens';
import { AddressDisplay } from 'src/components/AddressDisplay';
import { InputMean } from 'src/components/InputMean';
import { TokenDisplay } from 'src/components/TokenDisplay';
import { AppStateContext } from 'src/contexts/appstate';
import { getSolanaExplorerClusterParam } from 'src/contexts/connection';
import { useWallet } from 'src/contexts/wallet';
import { SOL_MINT } from 'src/middleware/ids';
import { isError } from 'src/middleware/transactions';
import { consoleOut, getTransactionOperationDescription, toUsCurrency } from 'src/middleware/ui';
import { cutNumber, getAmountWithSymbol, isValidNumber, toTokenAmount, toUiAmount } from 'src/middleware/utils';
import type { TokenInfo } from 'src/models/SolanaTokenInfo';
import { TransactionStatus } from 'src/models/enums';
import type { VestingContractTopupParams } from 'src/models/vesting';
import type { LooseObject } from 'src/types/LooseObject';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const VestingContractAddFundsModal = (props: {
  handleClose: () => void;
  handleOk: (params: VestingContractTopupParams) => void;
  isBusy: boolean;
  isVisible: boolean;
  minRequiredBalance: number;
  nativeBalance: number;
  selectedMultisig: MultisigInfo | undefined;
  selectedToken: TokenInfo | undefined;
  streamTemplate: StreamTemplate | undefined;
  transactionFees: TransactionFees;
  treasuryStreams: Stream[];
  userBalances: LooseObject;
  vestingContract: PaymentStreamingAccount | undefined;
  withdrawTransactionFees: TransactionFees;
}) => {
  const {
    handleClose,
    handleOk,
    isBusy,
    isVisible,
    minRequiredBalance,
    nativeBalance,
    selectedMultisig,
    selectedToken,
    streamTemplate,
    transactionFees,
    treasuryStreams,
    userBalances,
    vestingContract,
    withdrawTransactionFees,
  } = props;
  const {
    splTokenList,
    loadingPrices,
    selectedAccount,
    transactionStatus,
    highLightableStreamId,
    getTokenPriceByAddress,
    setTransactionStatus,
    refreshPrices,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const [topupAmount, setTopupAmount] = useState<string>('');
  const [availableBalance, setAvailableBalance] = useState(new BN(0));
  const [tokenAmount, setTokenAmount] = useState(new BN(0));
  const [tokenBalance, setSelectedTokenBalance] = useState<number>(0);
  const [showQrCode, setShowQrCode] = useState(false);
  const [isFeePaidByTreasurer, setIsFeePaidByTreasurer] = useState(false);
  const [fundFromSafeOption, setFundFromSafeOption] = useState(false);
  const [proposalTitle, setProposalTitle] = useState('');

  /////////////////
  //   Getters   //
  /////////////////

  const isMultisigContext = useMemo(() => {
    return !!(publicKey && selectedAccount.isMultisig);
  }, [publicKey, selectedAccount]);

  const getTokenPrice = useCallback(
    (inputAmount: string) => {
      if (!selectedToken) {
        return 0;
      }
      const price = getTokenPriceByAddress(selectedToken.address, selectedToken.symbol);

      return Number.parseFloat(inputAmount) * price;
    },
    [getTokenPriceByAddress, selectedToken],
  );

  const getSelectedStream = useCallback(
    (id?: string) => {
      if (!treasuryStreams || treasuryStreams.length === 0 || (!id && !highLightableStreamId)) {
        return undefined;
      }

      if (id) {
        return treasuryStreams.find(ts => ts.id.toBase58() === id);
      }
      if (highLightableStreamId) {
        return treasuryStreams.find(ts => ts.id.toBase58() === highLightableStreamId);
      }

      return undefined;
    },
    [treasuryStreams, highLightableStreamId],
  );

  const getMaxPossibleSolAmount = () => {
    const maxPossibleAmount = nativeBalance - minRequiredBalance;

    return maxPossibleAmount > 0 ? maxPossibleAmount : nativeBalance;
  };

  const getMaxAmount = useCallback(
    (preSetting = false) => {
      if (withdrawTransactionFees && highLightableStreamId) {
        const stream = getSelectedStream();
        if (stream && (stream.tokenFeePayedFromAccount || preSetting)) {
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

  const selectFromTokenBalance = useCallback(() => {
    if (!selectedToken) {
      return nativeBalance;
    }
    if (fundFromSafeOption) {
      const fromUserBalances = userBalances ? userBalances[NATIVE_SOL.address] || 0 : 0;
      return selectedToken.address === WRAPPED_SOL_MINT_ADDRESS ? fromUserBalances : tokenBalance;
    }

    return selectedToken.address === WRAPPED_SOL_MINT_ADDRESS ? nativeBalance : tokenBalance;
  }, [fundFromSafeOption, nativeBalance, selectedToken, tokenBalance, userBalances]);

  /////////////////////
  // Data management //
  /////////////////////

  // When modal goes visible, Set available balance in BN either from user's wallet or from treasury if a streams is being funded
  useEffect(() => {
    const getUnallocatedBalance = (details: PaymentStreamingAccount) => {
      const balance = new BN(details.balance);
      const allocationAssigned = new BN(details.allocationAssigned);
      return balance.sub(allocationAssigned);
    };

    if (isVisible && vestingContract && selectedToken && userBalances) {
      const decimals = selectedToken.decimals;
      if (highLightableStreamId) {
        // Take source balance from the treasury
        const unallocated = getUnallocatedBalance(vestingContract);
        consoleOut('unallocatedBalance:', unallocated.toString(), 'blue');
        setAvailableBalance(unallocated);
      } else {
        // Take source balance from the user's wallet
        const userBalance = selectFromTokenBalance();
        const toBignumber = toTokenAmount(userBalance, decimals);
        consoleOut(`User's balance:`, toBignumber.toString(), 'blue');
        setAvailableBalance(new BN(toBignumber.toString()));
      }
    } else {
      setAvailableBalance(new BN(0));
    }
  }, [isVisible, userBalances, selectedToken, vestingContract, highLightableStreamId, selectFromTokenBalance]);

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

  // When modal goes visible, set template data
  useEffect(() => {
    if (isVisible && streamTemplate) {
      setIsFeePaidByTreasurer(streamTemplate.feePayedByTreasurer);
    }
  }, [isVisible, streamTemplate]);

  // Window resize listener
  useEffect(() => {
    const resizeListener = () => {
      const NUM_CHARS = 4;
      const ellipsisElements = document.querySelectorAll('.overflow-ellipsis-middle');
      for (const element of ellipsisElements) {
        const e = element as HTMLElement;
        if (e.offsetWidth < e.scrollWidth) {
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
    };
  }, []);

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

  const onAcceptModal = () => {
    if (!selectedToken) {
      return;
    }
    const params: VestingContractTopupParams = {
      amount: topupAmount,
      tokenAmount,
      associatedToken: selectedToken.address === WRAPPED_SOL_MINT_ADDRESS ? NATIVE_SOL : selectedToken,
      streamId: highLightableStreamId ?? '',
      contributor: fundFromSafeOption && selectedMultisig ? selectedMultisig.authority.toBase58() : '',
      fundFromSafe: fundFromSafeOption,
      proposalTitle: proposalTitle ?? '',
    };
    handleOk(params);
  };

  const onCloseModal = () => {
    handleClose();
  };

  const onAfterClose = () => {
    setTimeout(() => {
      setTopupAmount('');
      setTokenAmount(new BN(0));
    }, 50);
    setTransactionStatus({
      lastOperation: TransactionStatus.Idle,
      currentOperation: TransactionStatus.Idle,
    });
  };

  const refreshPage = () => {
    handleClose();
    window.location.reload();
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

  const onTitleInputValueChange = (value: string) => {
    setProposalTitle(value);
  };

  //////////////////
  //  Validation  //
  //////////////////

  const isValidInput = (): boolean => {
    return !!(
      publicKey &&
      (!fundFromSafeOption || (isMultisigContext && selectedMultisig && fundFromSafeOption && proposalTitle)) &&
      selectedToken &&
      ((fundFromSafeOption && tokenBalance) ||
        (!fundFromSafeOption && availableBalance && (availableBalance as BN).gtn(0))) &&
      nativeBalance > MIN_SOL_BALANCE_REQUIRED &&
      tokenAmount &&
      (tokenAmount as BN).gtn(0) &&
      (tokenAmount as BN).lte(getMaxAmount())
    );
  };

  const isTopupFormValid = () => {
    return !!(publicKey && isValidInput());
  };

  const isProposalTitleRequired = () => {
    return !!(fundFromSafeOption && isMultisigContext && selectedMultisig && !proposalTitle);
  };

  const isTokenBalanceEmpty = () => {
    return !!(
      !selectedToken ||
      (fundFromSafeOption && !tokenBalance) ||
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
      return t('transactions.validation.amount-sol-low');
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

    return transactionStatus.currentOperation === TransactionStatus.Idle
      ? getTransactionStartButtonLabel()
      : t('general.refresh');
  };

  const getModalTitle = () => {
    return highLightableStreamId
      ? t('treasuries.add-funds.modal-title-fund-stream')
      : t('vesting.add-funds.modal-title');
  };

  const getModalAdaptiveWidth = () => {
    return isBusy || transactionStatus.currentOperation !== TransactionStatus.Idle ? 380 : 480;
  };

  const handleMaxClick = () => {
    if (!selectedToken) {
      return;
    }

    const decimals = selectedToken.decimals;
    if (selectedToken.address === WRAPPED_SOL_MINT_ADDRESS) {
      const maxSolAmount = getMaxPossibleSolAmount();
      consoleOut('nativeBalance:', nativeBalance, 'darkgreen');
      consoleOut('minRequiredBalance:', minRequiredBalance, 'darkgreen');
      consoleOut('maxSolAmount:', maxSolAmount, 'darkgreen');
      setTopupAmount(cutNumber(maxSolAmount, decimals));
      setTokenAmount(new BN(maxSolAmount));
    } else {
      const maxAmount = getMaxAmount(isFeePaidByTreasurer);
      consoleOut('PaymentStreamingAccount pays for fees...', '', 'blue');
      consoleOut('Settings maxAmount to:', maxAmount, 'blue');
      setTopupAmount(toUiAmount(new BN(maxAmount), decimals));
      setTokenAmount(new BN(maxAmount));
    }
  };

  const getPanel1Classes = () => {
    return !isBusy ? 'panel1 show' : 'panel1 hide';
  };

  const getPanel2Classes = () => {
    return isBusy && transactionStatus.currentOperation !== TransactionStatus.Idle ? 'panel2 show' : 'panel2 hide';
  };

  ///////////////
  // Rendering //
  ///////////////

  const renderProposalTitle = () => {
    if (isMultisigContext && selectedMultisig) {
      return (
        <div className='mb-3 mt-3'>
          <div className='form-label text-left'>{t('multisig.proposal-modal.title')}</div>
          <InputMean
            id='proposal-title-field'
            name='Title'
            className={`w-100 general-text-input${!fundFromSafeOption ? ' disabled' : ''}`}
            onChange={onTitleInputValueChange}
            placeholder='Title for the multisig proposal'
            value={proposalTitle}
          />
        </div>
      );
    }

    return null;
  };

  const renderTopupAmount = () => {
    return (
      <>
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
          {selectedToken && (
            <div className={`well ${isBusy ? 'disabled' : ''}`}>
              <div className='flex-fixed-left'>
                <div className='left'>
                  <span className='add-on'>
                    <TokenDisplay
                      onClick={() => {}}
                      mintAddress={selectedToken.address}
                      showCaretDown={false}
                      fullTokenInfo={selectedToken}
                    />
                    {availableBalance ? (
                      <div
                        id='treasury-add-funds-max'
                        className='token-max simplelink'
                        onKeyDown={() => {}}
                        onClick={handleMaxClick}
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
                  {!highLightableStreamId ? (
                    <span>{t('add-funds.label-right')}:</span>
                  ) : (
                    <span>{t('treasuries.treasury-streams.available-unallocated-balance-label')}:</span>
                  )}
                  <span>
                    {`${
                      availableBalance
                        ? getAmountWithSymbol(
                            toUiAmount(availableBalance, selectedToken.decimals),
                            selectedToken.address,
                            true,
                            splTokenList,
                            selectedToken.decimals,
                          )
                        : '0'
                    }`}
                  </span>
                </div>
                <div className='right inner-label'>
                  <span
                    className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'}
                    onKeyDown={() => {}}
                    onClick={() => refreshPrices()}
                  >
                    ~{topupAmount ? toUsCurrency(getTokenPrice(topupAmount)) : '$0.00'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </>
    );
  };

  const renderPanel1ProgressContent = () => {
    return (
      <div className='transaction-progress p-0'>
        <InfoCircleOutlined style={{ fontSize: 48 }} className='icon mt-0' />
        {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
          <h4 className='mb-4'>
            {t('transactions.status.tx-start-failure', {
              accountBalance: getAmountWithSymbol(nativeBalance, SOL_MINT.toBase58()),
              feeAmount: getAmountWithSymbol(
                transactionFees.blockchainFee + transactionFees.mspFlatFee,
                SOL_MINT.toBase58(),
              ),
            })}
          </h4>
        ) : (
          <h4 className='font-bold mb-3'>
            {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
          </h4>
        )}
      </div>
    );
  };

  const renderPanel2BusyContent = () => {
    return (
      <div className='transaction-progress'>
        <Spin indicator={bigLoadingIcon} className='icon mt-0' />
        <h4 className='font-bold mb-1'>{getTransactionOperationDescription(transactionStatus.currentOperation, t)}</h4>
        {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
          <div className='indication'>{t('transactions.status.instructions')}</div>
        )}
      </div>
    );
  };

  const renderCtas = () => {
    return (
      <div className='row two-col-ctas mt-3 transaction-progress p-0'>
        <div className={!isError(transactionStatus.currentOperation) ? 'col-6' : 'col-12'}>
          <Button
            block
            type='text'
            shape='round'
            size='middle'
            className={isBusy ? 'inactive' : ''}
            onClick={() => (isError(transactionStatus.currentOperation) ? onAcceptModal() : onCloseModal())}
          >
            {isError(transactionStatus.currentOperation) ? t('general.retry') : t('general.cta-close')}
          </Button>
        </div>
        {!isError(transactionStatus.currentOperation) && (
          <div className='col-6'>
            <Button
              className={isBusy ? 'inactive' : ''}
              block
              type='primary'
              shape='round'
              size='middle'
              disabled={!isTopupFormValid()}
              onClick={() => {
                if (transactionStatus.currentOperation === TransactionStatus.Idle) {
                  onAcceptModal();
                } else {
                  refreshPage();
                }
              }}
            >
              {getMainCtaLabel()}
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <Modal
      className='mean-modal simple-modal'
      title={<div className='modal-title'>{getModalTitle()}</div>}
      maskClosable={false}
      footer={null}
      open={isVisible}
      onOk={onAcceptModal}
      onCancel={onCloseModal}
      afterClose={onAfterClose}
      width={getModalAdaptiveWidth()}
    >
      <div className='scrollable-content'>
        {/* Panel1 */}
        <div className={getPanel1Classes()}>
          {transactionStatus.currentOperation === TransactionStatus.Idle && (
            <>
              {/* Proposal title */}
              {renderProposalTitle()}

              {/* Top up amount */}
              {renderTopupAmount()}
            </>
          )}
          {transactionStatus.currentOperation === TransactionStatus.TransactionFinished && (
            <>
              <div className='transaction-progress'>
                <CheckOutlined style={{ fontSize: 48 }} className='icon mt-0' />
                <h4 className='font-bold'>{t('treasuries.add-funds.success-message')}</h4>
              </div>
            </>
          )}
          {transactionStatus.currentOperation !== TransactionStatus.Idle &&
          transactionStatus.currentOperation !== TransactionStatus.TransactionFinished
            ? renderPanel1ProgressContent()
            : null}
        </div>

        {/* Panel2 */}
        <div className={getPanel2Classes()}>
          {isBusy && transactionStatus.currentOperation !== TransactionStatus.Idle ? renderPanel2BusyContent() : null}
        </div>

        {/* CTAs */}
        {!(isBusy && transactionStatus.currentOperation !== TransactionStatus.Idle) ? renderCtas() : null}

        {/* Funding options */}
        {!isBusy && !highLightableStreamId && transactionStatus.currentOperation === TransactionStatus.Idle && (
          <div className={'buy-token-options text-center mt-4 mb-2'}>
            <p>You can also fund this contract by sending {selectedToken?.symbol} tokens to:</p>

            {showQrCode && vestingContract && (
              <>
                <div className='qr-container bg-white'>
                  <QRCodeSVG value={vestingContract.id.toBase58()} size={200} />
                </div>
              </>
            )}

            {vestingContract && (
              <div className='flex-center mb-2'>
                <AddressDisplay
                  address={vestingContract.id.toBase58()}
                  showFullAddress={true}
                  iconStyles={{ width: '15', height: '15' }}
                  newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${vestingContract.id.toBase58()}${getSolanaExplorerClusterParam()}`}
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
      </div>
    </Modal>
  );
};
