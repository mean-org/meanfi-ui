import React, { useCallback, useEffect, useMemo } from 'react';
import { useContext, useState } from 'react';
import { Modal, Button, Spin, Radio } from 'antd';
import { useTranslation } from 'react-i18next';
import { TokenInfo } from '@solana/spl-token-registry';
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import {
  cutNumber,
  getAmountWithSymbol,
  getTokenAmountAndSymbolByTokenAddress,
  isValidNumber,
  toTokenAmount2,
  toUiAmount2,
} from '../../../../utils/utils';
import {
  consoleOut,
  getTransactionOperationDescription,
  toUsCurrency
} from '../../../../utils/ui';
import { TransactionFees } from '@mean-dao/money-streaming/lib/types';
import { TransactionStatus } from '../../../../models/enums';
import { useWallet } from '../../../../contexts/wallet';
import { NATIVE_SOL_MINT } from '../../../../utils/ids';
import { isError } from '../../../../utils/transactions';
import { AllocationType, Stream, StreamTemplate, Treasury, TreasuryType } from '@mean-dao/msp';
import BN from 'bn.js';
import { MIN_SOL_BALANCE_REQUIRED, SOLANA_EXPLORER_URI_INSPECT_ADDRESS, WRAPPED_SOL_MINT_ADDRESS } from '../../../../constants';
import { AppStateContext } from '../../../../contexts/appstate';
import { NATIVE_SOL } from '../../../../utils/tokens';
import { TokenDisplay } from '../../../../components/TokenDisplay';
import { QRCodeSVG } from 'qrcode.react';
import { AddressDisplay } from '../../../../components/AddressDisplay';
import { getSolanaExplorerClusterParam } from '../../../../contexts/connection';
import { VestingContractTopupParams } from '../../../../models/vesting';
import { MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import { useSearchParams } from 'react-router-dom';
import { InputMean } from '../../../../components/InputMean';

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
    transactionStatus,
    highLightableStreamId,
    getTokenPriceByAddress,
    getTokenPriceBySymbol,
    setTransactionStatus,
    refreshPrices,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const [searchParams] = useSearchParams();
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

  const param = useMemo(() => getQueryAccountType(), [getQueryAccountType]);

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
      return treasuryStreams.find(ts => ts.id === id);
    } else if (highLightableStreamId) {
      return treasuryStreams.find(ts => ts.id ===highLightableStreamId);
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
      return selectedToken.address === WRAPPED_SOL_MINT_ADDRESS
        ? userBalances
          ? userBalances[NATIVE_SOL.address] || 0
          : 0
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
        const toBignumber = toTokenAmount2(userBalance, decimals);
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

  useEffect(() => {
    if (isVisible) {
      if (param === "multisig" && selectedMultisig && !highLightableStreamId) {
        consoleOut('Getting funds from safe...', '', 'blue');
        setFundFromSafeOption(true);
      }
    }
  }, [highLightableStreamId, isVisible, param, selectedMultisig]);

  ////////////////
  //   Events   //
  ////////////////

  const onAcceptModal = () => {
    const params: VestingContractTopupParams = {
      amount: topupAmount,
      tokenAmount: tokenAmount,
      allocationType: allocationOption,
      associatedToken: selectedToken
        ? selectedToken.address === WRAPPED_SOL_MINT_ADDRESS
          ? NATIVE_SOL
          : selectedToken
        : undefined,
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
      setTokenAmount(new BN(toTokenAmount2(newValue, decimals).toString()));
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
          (!fundFromSafeOption || (param === "multisig" && selectedMultisig && fundFromSafeOption && proposalTitle)) &&
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

  const getTransactionStartButtonLabel = (): string => {
    return !publicKey
      ? t('transactions.validation.not-connected')
      : fundFromSafeOption && param === "multisig" && selectedMultisig && !proposalTitle
        ? 'Add a proposal title'
        : !selectedToken || (
            (fundFromSafeOption && !tokenBalance) ||
            (!fundFromSafeOption && (!availableBalance || availableBalance.isZero()))
          )
          ? t('transactions.validation.no-balance')
          : !tokenAmount || tokenAmount.isZero()
            ? t('transactions.validation.no-amount')
            : tokenAmount.gt(getMaxAmount())
              ? t('transactions.validation.amount-high')
              : nativeBalance <= MIN_SOL_BALANCE_REQUIRED
                ? t('transactions.validation.amount-sol-low')
                : allocationOption === AllocationType.Specific && !highLightableStreamId
                  ? t('transactions.validation.select-stream')
                  : allocationOption === AllocationType.Specific && highLightableStreamId
                    ? t('treasuries.add-funds.main-cta-fund-stream')
                    : t('treasuries.add-funds.main-cta');
  }


  ///////////////
  // Rendering //
  ///////////////

  return (
    <Modal
      className="mean-modal simple-modal unpadded-content"
      title={
        <div className="modal-title">
          {highLightableStreamId
            ? t('treasuries.add-funds.modal-title-fund-stream')
            : t('vesting.add-funds.modal-title')
          }
        </div>
      }
      maskClosable={false}
      footer={null}
      visible={isVisible}
      onOk={onAcceptModal}
      onCancel={onCloseModal}
      afterClose={onAfterClose}
      width={isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}>
      <div className="scrollable-content pl-5 pr-4 py-2">

        <div className={!isBusy ? "panel1 show" : "panel1 hide"}>

          {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
            <>
              {/* Fund from Wallet/Safe switch */}
              {param === "multisig" && selectedMultisig && vestingContract && !highLightableStreamId && (
                <div className="mb-2 flex-fixed-right">
                  <div className="form-label left m-0">Get funds from:</div>
                  <div className="right">
                    <Radio.Group onChange={onFundFromSafeOptionChanged} value={fundFromSafeOption}>
                      <Radio value={true}>Safe</Radio>
                      <Radio value={false}>User wallet</Radio>
                    </Radio.Group>
                  </div>
                </div>
              )}

              {/* Proposal title */}
              {param === "multisig" && selectedMultisig && (
                <div className="mb-3 mt-3">
                  <div className="form-label text-left">{t('multisig.proposal-modal.title')}</div>
                  <InputMean
                    id="proposal-title-field"
                    name="Title"
                    className={`w-100 general-text-input${!fundFromSafeOption ? ' disabled' : ''}`}
                    onChange={onTitleInputValueChange}
                    placeholder="Title for the multisig proposal"
                    value={proposalTitle}
                  />
                </div>
              )}

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
                <div className={`well ${isBusy ? 'disabled' : ''}`}>
                  <div className="flex-fixed-left">
                    <div className="left">
                      <span className="add-on">
                        {selectedToken && (
                          <TokenDisplay onClick={() => {}}
                            mintAddress={selectedToken.address}
                            showCaretDown={false}
                            fullTokenInfo={selectedToken}
                          />
                        )}
                        {selectedToken && availableBalance ? (
                          <div
                            id="treasury-add-funds-max"
                            className="token-max simplelink"
                            onClick={() => {
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
                                  setTopupAmount(toUiAmount2(new BN(maxAmount), decimals));
                                  setTokenAmount(new BN(maxAmount));
                                } else {
                                  const maxAmount = getMaxAmount();
                                  consoleOut('Settings maxAmount to:', maxAmount.toString(), 'blue');
                                  setTopupAmount(toUiAmount2(new BN(maxAmount), decimals));
                                  setTokenAmount(new BN(maxAmount));
                                }
                              }
                            }}>
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
                      {!highLightableStreamId ? (
                        <span>{t('add-funds.label-right')}:</span>
                      ) : (
                        <span>{t('treasuries.treasury-streams.available-unallocated-balance-label')}:</span>
                      )}
                      <span>
                        {`${availableBalance && selectedToken
                            ? getAmountWithSymbol(
                                availableBalance,
                                selectedToken.address,
                                true,
                                splTokenList,
                                selectedToken.decimals
                              )
                            : "0"
                        }`}
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
              </div>

            </>
          ) : transactionStatus.currentOperation === TransactionStatus.TransactionFinished ? (
            <>
              <div className="transaction-progress">
                <CheckOutlined style={{ fontSize: 48 }} className="icon mt-0" />
                <h4 className="font-bold">{t('treasuries.add-funds.success-message')}</h4>
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
                        transactionFees.blockchainFee + transactionFees.mspFlatFee,
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

        <div className={isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle ? "panel2 show" : "panel2 hide"}>
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

        {!(isBusy && transactionStatus !== TransactionStatus.Iddle) && (
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
                  : t('general.cta-close')
                }
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
                  }}>
                  {isBusy
                    ? allocationOption === AllocationType.Specific && highLightableStreamId
                      ? t('treasuries.add-funds.main-cta-fund-stream-busy')
                      : t('treasuries.add-funds.main-cta-busy')
                    : transactionStatus.currentOperation === TransactionStatus.Iddle
                      ? getTransactionStartButtonLabel()
                      : t('general.refresh')
                  }
                </Button>
              </div>
            )}
          </div>
        )}

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
