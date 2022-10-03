import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import { TransactionFees } from '@mean-dao/money-streaming/lib/types';
import { AllocationType, Stream, StreamTemplate, Treasury, TreasuryType } from '@mean-dao/msp';
import { Button, Modal, Radio, Spin } from 'antd';
import BN from 'bn.js';
import { AddressDisplay } from 'components/AddressDisplay';
import { InputMean } from 'components/InputMean';
import { TokenDisplay } from 'components/TokenDisplay';
import {
  MIN_SOL_BALANCE_REQUIRED,
  SOLANA_EXPLORER_URI_INSPECT_ADDRESS,
  WRAPPED_SOL_MINT_ADDRESS
} from 'constants/common';
import { NATIVE_SOL } from 'constants/tokens';
import { AppStateContext } from 'contexts/appstate';
import { getSolanaExplorerClusterParam } from 'contexts/connection';
import { useWallet } from 'contexts/wallet';
import { NATIVE_SOL_MINT } from 'middleware/ids';
import { isError } from 'middleware/transactions';
import {
  consoleOut,
  getTransactionOperationDescription,
  toUsCurrency
} from 'middleware/ui';
import {
  cutNumber,
  getAmountWithSymbol,
  isValidNumber,
  toTokenAmount,
  toUiAmount
} from 'middleware/utils';
import { MeanFiAccountType, TransactionStatus } from 'models/enums';
import { TokenInfo } from 'models/SolanaTokenInfo';
import { VestingContractTopupParams } from 'models/vesting';
import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const VestingContractAddFundsModal = (props: {
  handleClose: any;
  handleOk: any;
  isBusy: boolean;
  isVisible: boolean;
  minRequiredBalance: number;
  nativeBalance: number;
  onReloadTokenBalances: any;
  selectedMultisig: MultisigInfo | undefined;
  selectedToken: TokenInfo | undefined;
  streamTemplate: StreamTemplate | undefined;
  transactionFees: TransactionFees;
  treasuryStreams: Stream[];
  userBalances: any;
  vestingContract: Treasury | undefined;
  withdrawTransactionFees: TransactionFees;
}) => {
  const {
    handleClose,
    handleOk,
    isBusy,
    isVisible,
    minRequiredBalance,
    nativeBalance,
    onReloadTokenBalances,
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
    accountAddress,
    selectedAccount,
    transactionStatus,
    highLightableStreamId,
    getTokenPriceByAddress,
    getTokenPriceBySymbol,
    setTransactionStatus,
    refreshPrices,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const [topupAmount, setTopupAmount] = useState<string>('');
  const [allocationOption, setAllocationOption] = useState<AllocationType>(AllocationType.None);
  const [, setTreasuryType] = useState<TreasuryType>(TreasuryType.Open);
  const [availableBalance, setAvailableBalance] = useState<any>();
  const [tokenAmount, setTokenAmount] = useState<any>(0);
  const [tokenBalance, setSelectedTokenBalance] = useState<number>(0);
  const [showQrCode, setShowQrCode] = useState(false);
  const [isFeePaidByTreasurer, setIsFeePaidByTreasurer] = useState(false);
  const [fundFromSafeOption, setFundFromSafeOption] = useState(false);
  const [proposalTitle, setProposalTitle] = useState("");

  /////////////////
  //   Getters   //
  /////////////////

  const isMultisigContext = useMemo(() => {
    if (publicKey && accountAddress && selectedAccount.type === MeanFiAccountType.Multisig) {
      return true;
    }
    return false;
  }, [publicKey && accountAddress, selectedAccount]);

  const getTokenPrice = useCallback((inputAmount: string) => {
    if (!selectedToken) { return 0; }
    const price = getTokenPriceByAddress(selectedToken.address) || getTokenPriceBySymbol(selectedToken.symbol);

    return parseFloat(inputAmount) * price;
  }, [getTokenPriceByAddress, getTokenPriceBySymbol, selectedToken]);

  const getSelectedStream = useCallback((id?: string) => {
    if (!treasuryStreams || treasuryStreams.length === 0 || (!id && !highLightableStreamId)) {
      return undefined;
    }

    if (id) {
      return treasuryStreams.find(ts => ts.id.toBase58() === id);
    } else if (highLightableStreamId) {
      return treasuryStreams.find(ts => ts.id.toBase58() === highLightableStreamId);
    }

    return undefined;
  }, [
    treasuryStreams,
    highLightableStreamId
  ]);

  const getMaxPossibleSolAmount = () => {
    const maxPossibleAmount = nativeBalance - minRequiredBalance;

    return maxPossibleAmount > 0
      ? maxPossibleAmount : nativeBalance;
  }

  const getMaxAmount = useCallback((preSetting = false) => {
    if (withdrawTransactionFees && allocationOption === AllocationType.Specific && highLightableStreamId) {
      const stream = getSelectedStream();
      if (stream && ((stream as any).feePayedByTreasurer || preSetting)) {

        const BASE_100_TO_BASE_1_MULTIPLIER = 10_000;
        const feeNumerator = withdrawTransactionFees.mspPercentFee * BASE_100_TO_BASE_1_MULTIPLIER;
        const feeDenaminator = 1000000;
        const badStreamMaxAllocation = availableBalance
          .mul(new BN(feeDenaminator))
          .div(new BN(feeNumerator + feeDenaminator));

        const feeAmount = badStreamMaxAllocation
          .mul(new BN(feeNumerator))
          .div(new BN(feeDenaminator));

        const goodStreamMaxAllocation = availableBalance.sub(feeAmount);
        const maxAmount = goodStreamMaxAllocation;

        return maxAmount;
      }
    }
    return selectedToken && availableBalance ? availableBalance : 0;
  },[
    selectedToken,
    availableBalance,
    allocationOption,
    highLightableStreamId,
    withdrawTransactionFees,
    getSelectedStream
  ]);

  const selectFromTokenBalance = useCallback(() => {
    if (!selectedToken) { return nativeBalance; }
    if (fundFromSafeOption) {
      const fromUserBalances = userBalances ? userBalances[NATIVE_SOL.address] || 0 : 0;
      return selectedToken.address === WRAPPED_SOL_MINT_ADDRESS
        ? fromUserBalances
        : tokenBalance
    } else {
      return selectedToken.address === WRAPPED_SOL_MINT_ADDRESS
        ? nativeBalance
        : tokenBalance
    }
  }, [fundFromSafeOption, nativeBalance, selectedToken, tokenBalance, userBalances]);

  /////////////////////
  // Data management //
  /////////////////////

  // When modal goes visible, Set available balance in BN either from user's wallet or from treasury if a streams is being funded
  useEffect(() => {

    const getUnallocatedBalance = (details: Treasury) => {
      const balance = new BN(details.balance);
      const allocationAssigned = new BN(details.allocationAssigned);
      return balance.sub(allocationAssigned);
    }

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
  }, [
    isVisible,
    userBalances,
    selectedToken,
    vestingContract,
    highLightableStreamId,
    selectFromTokenBalance,
  ]);

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

  // When modal goes visible, update allocation type option
  useEffect(() => {
    if (!vestingContract) { return; }
    setTreasuryType(vestingContract.treasuryType);
    if (highLightableStreamId) {
      setAllocationOption(AllocationType.Specific);
    } else {
      setAllocationOption(AllocationType.None);
    }
  }, [
    vestingContract,
    treasuryStreams,
    highLightableStreamId,
  ]);

  // When modal goes visible, set template data
  useEffect(() => {
    if (isVisible && streamTemplate) {
      setIsFeePaidByTreasurer(streamTemplate.feePayedByTreasurer);
    }
  }, [
    isVisible,
    streamTemplate,
  ]);

  // Window resize listener
  useEffect(() => {
    const resizeListener = () => {
      const NUM_CHARS = 4;
      const ellipsisElements = document.querySelectorAll(".overflow-ellipsis-middle");
      for (const element of ellipsisElements) {
        const e = element as HTMLElement;
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

  useEffect(() => {
    if (isVisible) {
      if (isMultisigContext && selectedMultisig && !highLightableStreamId) {
        consoleOut('Getting funds from safe...', '', 'blue');
        setFundFromSafeOption(true);
      }
    }
  }, [highLightableStreamId, isVisible, isMultisigContext, selectedMultisig]);

  ////////////////
  //   Events   //
  ////////////////

  const onAcceptModal = () => {
    if (!selectedToken) { return; }
    const params: VestingContractTopupParams = {
      amount: topupAmount,
      tokenAmount: tokenAmount,
      allocationType: allocationOption,
      associatedToken: selectedToken.address === WRAPPED_SOL_MINT_ADDRESS
        ? NATIVE_SOL
        : selectedToken,
      streamId: highLightableStreamId && allocationOption === AllocationType.Specific
                ? highLightableStreamId : '',
      contributor: fundFromSafeOption && selectedMultisig
        ? selectedMultisig.authority.toBase58()
        : '',
      fundFromSafe: fundFromSafeOption,
      proposalTitle: proposalTitle || ''
    };
    handleOk(params);
  }

  const onCloseModal = () => {
    handleClose();
  }

  const onAfterClose = () => {
    setTimeout(() => {
      setTopupAmount('');
      setTokenAmount(new BN(0));
    }, 50);
    setTransactionStatus({
        lastOperation: TransactionStatus.Iddle,
        currentOperation: TransactionStatus.Iddle
    });
  }

  const refreshPage = () => {
    handleClose();
    window.location.reload();
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
      setTokenAmount(0);
    } else if (newValue === '.') {
      setTopupAmount(".");
    } else if (isValidNumber(newValue)) {
      setTopupAmount(newValue);
      setTokenAmount(new BN(toTokenAmount(newValue, decimals).toString()));
    }
  };

  const onTitleInputValueChange = (e: any) => {
    setProposalTitle(e.target.value);
  }

  const onFundFromSafeOptionChanged = (e: any) => {
    const newValue = e.target.value;
    setFundFromSafeOption(newValue);
    if (newValue) {
      onReloadTokenBalances('safe');
    } else {
      onReloadTokenBalances('wallet');
    }
  }

  //////////////////
  //  Validation  //
  //////////////////

  const isValidInput = (): boolean => {
    return publicKey &&
          (!fundFromSafeOption || (isMultisigContext && selectedMultisig && fundFromSafeOption && proposalTitle)) &&
           selectedToken &&
           ((fundFromSafeOption && tokenBalance) || (!fundFromSafeOption && (availableBalance && (availableBalance as BN).gtn(0)))) &&
           nativeBalance > MIN_SOL_BALANCE_REQUIRED &&
           tokenAmount && (tokenAmount as BN).gtn(0) &&
           (tokenAmount as BN).lte(getMaxAmount())
            ? true
            : false;
  }

  const isTopupFormValid = () => {
    return publicKey &&
           isValidInput() &&
           ((allocationOption !== AllocationType.Specific) ||
            (allocationOption === AllocationType.Specific && highLightableStreamId))
          ? true
          : false;
  }

  const isProposalTitleRequired = () => {
    return fundFromSafeOption && isMultisigContext && selectedMultisig && !proposalTitle
      ? true
      : false;
  }

  const isTokenBalanceEmpty = () => {
    return !selectedToken || ((fundFromSafeOption && !tokenBalance) || (!fundFromSafeOption && availableBalance.isZero()))
      ? true
      : false;
  }

  const getTransactionStartButtonLabel = () => {
    if (!publicKey) {
      return t('transactions.validation.not-connected');
    } else if (isProposalTitleRequired()) {
      return 'Add a proposal title';
    } else if (isTokenBalanceEmpty()) {
      return t('transactions.validation.no-balance');
    } else if (!tokenAmount || tokenAmount.isZero()) {
      return t('transactions.validation.no-amount');
    } else if (tokenAmount.gt(getMaxAmount())) {
      return t('transactions.validation.amount-high');
    } else if (nativeBalance <= MIN_SOL_BALANCE_REQUIRED) {
      return t('transactions.validation.amount-sol-low');
    } else if (allocationOption === AllocationType.Specific && !highLightableStreamId) {
      return t('transactions.validation.select-stream');
    } else if (allocationOption === AllocationType.Specific && highLightableStreamId) {
      return t('treasuries.add-funds.main-cta-fund-stream');
    } else {
      return t('treasuries.add-funds.main-cta');
    }
  }

  const getMainCtaLabel = () => {
    if (isBusy) {
      return allocationOption === AllocationType.Specific && highLightableStreamId
        ? t('treasuries.add-funds.main-cta-fund-stream-busy')
        : t('treasuries.add-funds.main-cta-busy');
    } else {
      return transactionStatus.currentOperation === TransactionStatus.Iddle
        ? getTransactionStartButtonLabel()
        : t('general.refresh');
    }
  }

  const getModalTitle = () => {
    return highLightableStreamId ? t('treasuries.add-funds.modal-title-fund-stream') : t('vesting.add-funds.modal-title');
  }

  const getModalAdaptiveWidth = () => {
    return isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480;
  }

  const handleMaxClick = () => {
    if (!selectedToken) { return; }

    const decimals = selectedToken.decimals;
    if (selectedToken.address === WRAPPED_SOL_MINT_ADDRESS) {
      const maxSolAmount = getMaxPossibleSolAmount();
      consoleOut('nativeBalance:', nativeBalance, 'darkgreen');
      consoleOut('minRequiredBalance:', minRequiredBalance, 'darkgreen');
      consoleOut('maxSolAmount:', maxSolAmount, 'darkgreen');
      setTopupAmount(cutNumber(maxSolAmount, decimals));
      setTokenAmount(new BN(maxSolAmount));
    } else {
      if (isFeePaidByTreasurer) {
        const maxAmount = getMaxAmount(true);
        consoleOut('Treasury pays for fees...', '', 'blue');
        consoleOut('Settings maxAmount to:', maxAmount, 'blue');
        setTopupAmount(toUiAmount(new BN(maxAmount), decimals));
        setTokenAmount(new BN(maxAmount));
      } else {
        const maxAmount = getMaxAmount();
        consoleOut('Settings maxAmount to:', maxAmount.toString(), 'blue');
        setTopupAmount(toUiAmount(new BN(maxAmount), decimals));
        setTokenAmount(new BN(maxAmount));
      }
    }
  }

  const getPanel1Classes = () => {
    return !isBusy ? "panel1 show" : "panel1 hide";
  }

  const getPanel2Classes = () => {
    return isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle ? "panel2 show" : "panel2 hide";
  }


  ///////////////
  // Rendering //
  ///////////////

  const renderFundFromSwitch = () => {
    if (isMultisigContext && selectedMultisig && vestingContract && !highLightableStreamId) {
      return (
        <div className="mb-2 flex-fixed-right">
          <div className="form-label left m-0">Get funds from:</div>
          <div className="right">
            <Radio.Group onChange={onFundFromSafeOptionChanged} value={fundFromSafeOption}>
              <Radio value={true}>Safe</Radio>
              <Radio value={false}>User wallet</Radio>
            </Radio.Group>
          </div>
        </div>
      );
    } else {
      return null;
    }
  }

  const renderProposalTitle = () => {
    if (isMultisigContext && selectedMultisig) {
      return (
        <div className="mb-3 mt-3">
          <div className="form-label text-left">{t('multisig.proposal-modal.title')}</div>
          <InputMean
            id="proposal-title-field"
            name="Title"
            className={`w-100 general-text-input${!fundFromSafeOption ? ' disabled' : ''}`}
            onChange={onTitleInputValueChange}
            placeholder="Title for the multisig proposal"
            value={proposalTitle} />
        </div>
      );
    } else {
      return null;
    }
  }

  const renderTopupAmount = () => {
    return (
      <>
        {/* Top up amount */}
        <div className="mb-3">
          {highLightableStreamId ? (
            <>
              <p>{t('treasuries.add-funds.allocation-heading')}</p>
              <div className="form-label">{t('treasuries.add-funds.allocation-amount-label')}</div>
            </>
          ) : (
            <div className="form-label">{t('treasuries.add-funds.label')}</div>
          )}
          {selectedToken && (
            <div className={`well ${isBusy ? 'disabled' : ''}`}>
              <div className="flex-fixed-left">
                <div className="left">
                  <span className="add-on">
                    <TokenDisplay onClick={() => { } }
                      mintAddress={selectedToken.address}
                      showCaretDown={false}
                      fullTokenInfo={selectedToken}
                    />
                    {availableBalance ? (
                      <div
                        id="treasury-add-funds-max"
                        className="token-max simplelink"
                        onClick={handleMaxClick}>
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
                    value={topupAmount} />
                </div>
              </div>
              <div className="flex-fixed-right">
                <div className="left inner-label">
                  {!highLightableStreamId ? (
                    <span>{t('add-funds.label-right')}:</span>
                  ) : (
                    <span>{t('treasuries.treasury-streams.available-unallocated-balance-label')}:</span>
                  )}
                  <span>
                    {`${availableBalance
                      ? getAmountWithSymbol(
                        toUiAmount(availableBalance, selectedToken.decimals),
                        selectedToken.address,
                        true,
                        splTokenList,
                        selectedToken.decimals
                      )
                      : "0"}`}
                  </span>
                </div>
                <div className="right inner-label">
                  <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
                    ~{topupAmount
                      ? toUsCurrency(getTokenPrice(topupAmount))
                      : "$0.00"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </>
    );
  }

  const renderPanel1ProgressContent = () => {
    return (
      <div className="transaction-progress p-0">
        <InfoCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
        {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
          <h4 className="mb-4">
            {t('transactions.status.tx-start-failure', {
              accountBalance: getAmountWithSymbol(
                nativeBalance,
                NATIVE_SOL_MINT.toBase58()
              ),
              feeAmount: getAmountWithSymbol(
                transactionFees.blockchainFee + transactionFees.mspFlatFee,
                NATIVE_SOL_MINT.toBase58()
              )
            })}
          </h4>
        ) : (
          <h4 className="font-bold mb-3">
            {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
          </h4>
        )}
      </div>
    );
  }

  const renderPanel2BusyContent = () => {
    return (
      <div className="transaction-progress">
        <Spin indicator={bigLoadingIcon} className="icon mt-0" />
        <h4 className="font-bold mb-1">
          {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
        </h4>
        {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
          <div className="indication">{t('transactions.status.instructions')}</div>
        )}
      </div>
    );
  }

  const renderCtas = () => {
    return (
      <div className="row two-col-ctas mt-3 transaction-progress p-0">
        <div className={!isError(transactionStatus.currentOperation) ? "col-6" : "col-12"}>
          <Button
            block
            type="text"
            shape="round"
            size="middle"
            className={isBusy ? 'inactive' : ''}
            onClick={() => isError(transactionStatus.currentOperation)
              ? onAcceptModal()
              : onCloseModal()}>
            {isError(transactionStatus.currentOperation)
              ? t('general.retry')
              : t('general.cta-close')}
          </Button>
        </div>
        {!isError(transactionStatus.currentOperation) && (
          <div className="col-6">
            <Button
              className={isBusy ? 'inactive' : ''}
              block
              type="primary"
              shape="round"
              size="middle"
              disabled={!isTopupFormValid()}
              onClick={() => {
                if (transactionStatus.currentOperation === TransactionStatus.Iddle) {
                  onAcceptModal();
                } else {
                  refreshPage();
                }
              } }>
              {getMainCtaLabel()}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <Modal
      className="mean-modal simple-modal unpadded-content"
      title={
        <div className="modal-title">{getModalTitle()}</div>
      }
      maskClosable={false}
      footer={null}
      open={isVisible}
      onOk={onAcceptModal}
      onCancel={onCloseModal}
      afterClose={onAfterClose}
      width={getModalAdaptiveWidth()}>
      <div className="scrollable-content pl-5 pr-4 py-2">

        {/* Panel1 */}
        <div className={getPanel1Classes()}>

          {transactionStatus.currentOperation === TransactionStatus.Iddle && (
            <>
              {/* Fund from Wallet/Safe switch */}
              {renderFundFromSwitch()}
      
              {/* Proposal title */}
              {renderProposalTitle()}

              {/* Top up amount */}
              {renderTopupAmount()}
            </>
          )}
          {transactionStatus.currentOperation === TransactionStatus.TransactionFinished && (
            <>
              <div className="transaction-progress">
                <CheckOutlined style={{ fontSize: 48 }} className="icon mt-0" />
                <h4 className="font-bold">{t('treasuries.add-funds.success-message')}</h4>
              </div>
            </>
          )}
          {transactionStatus.currentOperation !== TransactionStatus.Iddle &&
           transactionStatus.currentOperation !== TransactionStatus.TransactionFinished && (
            <>
              {renderPanel1ProgressContent()}
            </>
          )}

        </div>

        {/* Panel2 */}
        <div className={getPanel2Classes()}>
          {isBusy && transactionStatus !== TransactionStatus.Iddle && (
            <>
              {renderPanel2BusyContent()}
            </>
          )}
        </div>

        {/* CTAs */}
        {!(isBusy && transactionStatus !== TransactionStatus.Iddle) && (
          <>
            {renderCtas()}
          </>
        )}

        {/* Funding options */}
        {!isBusy && !highLightableStreamId && transactionStatus.currentOperation === TransactionStatus.Iddle && (
          <div className={`buy-token-options text-center mt-4 mb-2`}>
            <p>You can also fund this contract by sending {selectedToken?.symbol} tokens to:</p>

            {showQrCode && vestingContract && (
              <>
                <div className="qr-container bg-white">
                  <QRCodeSVG
                    value={vestingContract.id as string}
                    size={200}
                  />
                </div>
              </>
            )}

            {vestingContract && (
              <div className="flex-center mb-2">
                <AddressDisplay
                  address={vestingContract.id as string}
                  showFullAddress={true}
                  iconStyles={{ width: "15", height: "15" }}
                  newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${vestingContract.id as string}${getSolanaExplorerClusterParam()}`}
                />
              </div>
            )}

            {!showQrCode && (
              <div className="simplelink underline" onClick={() => {setShowQrCode(true)}}>Scan QR code instead?</div>
            )}

          </div>
        )}

      </div>
    </Modal>
  );
};
