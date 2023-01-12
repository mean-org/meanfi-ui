import React, { useCallback, useEffect } from 'react';
import { useContext, useState } from 'react';
import { Modal, Button } from 'antd';
import { AppStateContext } from 'contexts/appstate';
import {
  cutNumber,
  displayAmountWithSymbol,
  getAmountWithSymbol,
  isValidNumber,
  toTokenAmount,
  toTokenAmountBn,
  toUiAmount,
} from 'middleware/utils';
import { useTranslation } from 'react-i18next';
import { StreamInfo, TransactionFees, TreasuryInfo } from '@mean-dao/money-streaming/lib/types';
import { TokenDisplay } from '../TokenDisplay';
import { MoneyStreaming } from '@mean-dao/money-streaming';
import { PaymentStreaming, Stream, PaymentStreamingAccount, AccountType } from '@mean-dao/payment-streaming';
import { StreamTreasuryType } from 'models/treasuries';
import { useWallet } from 'contexts/wallet';
import { useConnection } from 'contexts/connection';
import { PublicKey } from '@solana/web3.js';
import { consoleOut, toUsCurrency } from 'middleware/ui';
import { ExclamationCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import BN from 'bn.js';
import { StreamTopupParams } from 'models/common-types';
import { WRAPPED_SOL_MINT_ADDRESS } from 'constants/common';
import { SOL_MINT } from 'middleware/ids';
import { TokenInfo } from 'models/SolanaTokenInfo';
import { InputMean } from 'components/InputMean';
import { getStreamingAccountType } from 'middleware/getStreamingAccountType';

export const StreamAddFundsModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  mspClient: MoneyStreaming | PaymentStreaming | undefined;
  nativeBalance: number;
  userBalances: any;
  selectedToken?: TokenInfo | undefined;
  streamDetail: Stream | StreamInfo | undefined;
  transactionFees: TransactionFees;
  withdrawTransactionFees: TransactionFees;
  isMultisigContext: boolean;
}) => {
  const {
    handleClose,
    handleOk,
    isVisible,
    mspClient,
    nativeBalance,
    userBalances,
    selectedToken,
    streamDetail,
    withdrawTransactionFees,
    isMultisigContext,
  } = props;
  const { splTokenList, loadingPrices, isWhitelisted, getTokenPriceBySymbol, refreshPrices } =
    useContext(AppStateContext);
  const { t } = useTranslation('common');
  const connection = useConnection();
  const { publicKey } = useWallet();
  const [topupAmount, setTopupAmount] = useState<string>('');

  // PaymentStreamingAccount related
  const [streamTreasuryType, setStreamTreasuryType] = useState<StreamTreasuryType | undefined>(undefined);
  const [loadingTreasuryDetails, setLoadingTreasuryDetails] = useState(true);
  const [localStreamDetail, setLocalStreamDetail] = useState<Stream | StreamInfo | undefined>(undefined);
  const [treasuryDetails, setTreasuryDetails] = useState<PaymentStreamingAccount | TreasuryInfo | undefined>(undefined);
  const [unallocatedBalance, setUnallocatedBalance] = useState(new BN(0));
  const [maxAllocatableAmount, setMaxAllocatableAmount] = useState<any>(undefined);
  const [tokenBalance, setSelectedTokenBalance] = useState<number>(0);
  const [tokenAmount, setTokenAmount] = useState(new BN(0));
  const [proposalTitle, setProposalTitle] = useState('');

  const getTreasuryType = useCallback(
    (details?: PaymentStreamingAccount | TreasuryInfo | undefined): StreamTreasuryType | undefined => {
      if (details) {
        const type = getStreamingAccountType(details);
        if (type === AccountType.Lock) {
          return 'locked';
        } else {
          return 'open';
        }
      } else if (treasuryDetails) {
        const type = getStreamingAccountType(treasuryDetails);
        if (type === AccountType.Lock) {
          return 'locked';
        } else {
          return 'open';
        }
      }

      return 'unknown';
    },
    [treasuryDetails],
  );

  const getTreasuryTypeByTreasuryId = useCallback(
    async (treasuryId: string, streamVersion: number): Promise<StreamTreasuryType | undefined> => {
      if (!connection || !publicKey || !mspClient) {
        return undefined;
      }

      const treasuryPk = new PublicKey(treasuryId);

      try {
        let details: PaymentStreamingAccount | TreasuryInfo | undefined = undefined;
        if (streamVersion < 2) {
          details = await (mspClient as MoneyStreaming).getTreasury(treasuryPk);
        } else {
          details = await (mspClient as PaymentStreaming).getAccount(treasuryPk);
        }
        if (details) {
          setTreasuryDetails(details);
          consoleOut('treasuryDetails:', details, 'blue');
          const type = getStreamingAccountType(details);
          if (type === AccountType.Lock) {
            return 'locked';
          } else {
            return 'open';
          }
        } else {
          setTreasuryDetails(undefined);
          return 'unknown';
        }
      } catch (error) {
        console.error(error);
        return 'unknown';
      } finally {
        setLoadingTreasuryDetails(false);
      }
    },
    [publicKey, connection, mspClient],
  );

  const getMaxAmount = useCallback(
    (preSetting = false) => {
      if (
        ((localStreamDetail &&
          localStreamDetail.version >= 2 &&
          (localStreamDetail as Stream).tokenFeePayedFromAccount) ||
          preSetting) &&
        withdrawTransactionFees
      ) {
        const BASE_100_TO_BASE_1_MULTIPLIER = 10_000;
        const feeNumerator = withdrawTransactionFees.mspPercentFee * BASE_100_TO_BASE_1_MULTIPLIER;
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

        if (!preSetting) {
          setMaxAllocatableAmount(maxAmount);
        }
        return maxAmount;
      }
      if (!preSetting) {
        setMaxAllocatableAmount(unallocatedBalance);
      }
      return unallocatedBalance;
    },
    [isWhitelisted, localStreamDetail, unallocatedBalance, withdrawTransactionFees],
  );

  const getTokenPrice = useCallback(() => {
    if (!topupAmount || !selectedToken) {
      return 0;
    }

    return parseFloat(topupAmount) * getTokenPriceBySymbol(selectedToken.symbol);
  }, [topupAmount, selectedToken, getTokenPriceBySymbol]);

  const shouldFundFromTreasury = useCallback(() => {
    if (!treasuryDetails || (treasuryDetails && treasuryDetails.autoClose)) {
      return false;
    }

    return true;
  }, [treasuryDetails]);

  const isfeePayedByTreasurerOn = useCallback(() => {
    if (localStreamDetail && localStreamDetail.version >= 2 && (localStreamDetail as Stream).tokenFeePayedFromAccount) {
      return true;
    }

    return false;
  }, [localStreamDetail]);

  const selectFromTokenBalance = useCallback(() => {
    if (!selectedToken) {
      return nativeBalance;
    }
    return selectedToken.address === WRAPPED_SOL_MINT_ADDRESS ? nativeBalance : tokenBalance;
  }, [nativeBalance, selectedToken, tokenBalance]);

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

  // Read and keep the input copy of the stream
  useEffect(() => {
    if (isVisible && !localStreamDetail && streamDetail) {
      setLocalStreamDetail(streamDetail);
    }
  }, [isVisible, localStreamDetail, streamDetail]);

  // Read treasury and store treasuryType
  useEffect(() => {
    if (isVisible && localStreamDetail) {
      if (treasuryDetails) {
        const value = getTreasuryType(treasuryDetails);
        consoleOut('streamTreasuryType:', value, 'crimson');
        setStreamTreasuryType(value);
      } else {
        const v1 = localStreamDetail as StreamInfo;
        const v2 = localStreamDetail as Stream;
        consoleOut('fetching treasury details...', '', 'blue');
        getTreasuryTypeByTreasuryId(
          localStreamDetail.version < 2 ? (v1.treasuryAddress as string) : v2.psAccount.toBase58(),
          localStreamDetail.version,
        ).then(value => {
          consoleOut('streamTreasuryType:', value, 'crimson');
          setStreamTreasuryType(value);
        });
      }
    }
  }, [isVisible, treasuryDetails, localStreamDetail, getTreasuryTypeByTreasuryId, getTreasuryType]);

  // Set treasury unalocated balance in BN
  useEffect(() => {
    if (!selectedToken) {
      setUnallocatedBalance(new BN(0));
      return;
    }

    const getUnallocatedBalance = (details: PaymentStreamingAccount | TreasuryInfo) => {
      const isNew = details && details.version >= 2 ? true : false;
      let result = new BN(0);
      let balance = new BN(0);
      let allocationAssigned = new BN(0);

      if (isNew) {
        balance = new BN(details.balance);
        allocationAssigned = new BN(details.allocationAssigned);
      } else {
        balance = toTokenAmountBn(details.balance, selectedToken.decimals);
        allocationAssigned = toTokenAmountBn(details.allocationAssigned, selectedToken.decimals);
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

  // Set max amount allocatable to a stream in BN the first time
  useEffect(() => {
    if (isVisible && treasuryDetails && withdrawTransactionFees) {
      getMaxAmount();
    }
  }, [isVisible, treasuryDetails, withdrawTransactionFees, getMaxAmount]);

  const onAcceptTopup = () => {
    const params: StreamTopupParams = {
      proposalTitle,
      amount: topupAmount,
      tokenAmount,
      treasuryType: streamTreasuryType,
      fundFromTreasury: shouldFundFromTreasury(),
      associatedToken: selectedToken
        ? selectedToken.address === WRAPPED_SOL_MINT_ADDRESS
          ? SOL_MINT.toBase58()
          : selectedToken.address
        : '',
    };
    handleOk(params);
  };

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

  // Validation

  const isValidInput = (): boolean => {
    if (!selectedToken) {
      return false;
    }
    const userBalance = toTokenAmountBn(selectFromTokenBalance(), selectedToken.decimals);
    return ((shouldFundFromTreasury() && unallocatedBalance.gtn(0)) ||
      (!shouldFundFromTreasury() && userBalance.gtn(0))) &&
      (proposalTitle || !isMultisigContext) &&
      tokenAmount &&
      (tokenAmount as BN).gtn(0) &&
      ((!shouldFundFromTreasury() && tokenAmount.lte(userBalance)) ||
        (shouldFundFromTreasury() &&
          ((isfeePayedByTreasurerOn() && tokenAmount.lte(maxAllocatableAmount)) ||
            (!isfeePayedByTreasurerOn() && tokenAmount.lte(unallocatedBalance)))))
      ? true
      : false;
  };

  const getTransactionStartButtonLabel = (): string => {
    if (!proposalTitle && isMultisigContext) {
      return 'Add a proposal title';
    }
    if (!selectedToken) {
      return t('transactions.validation.no-balance');
    }
    const userBalance = toTokenAmountBn(selectFromTokenBalance(), selectedToken.decimals);
    return (shouldFundFromTreasury() && unallocatedBalance.isZero()) ||
      (!shouldFundFromTreasury() && userBalance.isZero())
      ? t('transactions.validation.no-balance')
      : !tokenAmount || tokenAmount.isZero()
      ? t('transactions.validation.no-amount')
      : (!shouldFundFromTreasury() && tokenAmount.gt(userBalance)) ||
        (shouldFundFromTreasury() &&
          ((isfeePayedByTreasurerOn() && tokenAmount.gt(maxAllocatableAmount)) ||
            (!isfeePayedByTreasurerOn() && tokenAmount.gt(unallocatedBalance))))
      ? t('transactions.validation.amount-high')
      : t('transactions.validation.valid-approve');
  };

  return (
    <Modal
      className="mean-modal"
      title={<div className="modal-title">{t('streams.add-funds.modal-title')}</div>}
      maskClosable={false}
      footer={null}
      open={isVisible}
      onOk={onAcceptTopup}
      onCancel={handleClose}
      afterClose={() => {
        setTopupAmount('');
        setTokenAmount(new BN(0));
      }}
      width={480}
    >
      {loadingTreasuryDetails ? (
        // The loading part
        <div className="transaction-progress">
          <LoadingOutlined style={{ fontSize: 48 }} className="icon mt-0" spin />
          <h4 className="operation">{t('close-stream.loading-treasury-message')}</h4>
        </div>
      ) : streamTreasuryType === 'locked' ? (
        // The user can't top-up the stream
        <div className="transaction-progress">
          <ExclamationCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
          <h4 className="operation">{t('close-stream.cant-topup-message')}</h4>
          <div className="mt-3">
            <Button type="primary" shape="round" size="large" onClick={handleClose}>
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
          {/* Proposal title */}
          {isMultisigContext && (
            <div className="mb-3 mt-3">
              <div className="form-label text-left">{t('multisig.proposal-modal.title')}</div>
              <InputMean
                id="proposal-title-field"
                name="Title"
                className={`w-100 general-text-input`}
                onChange={(e: any) => {
                  setProposalTitle(e.target.value);
                }}
                placeholder="Add a proposal title (required)"
                value={proposalTitle}
              />
            </div>
          )}
          {/* Top up amount */}
          <div className="form-label">{t('streams.add-funds.amount-label')}</div>
          <div className="well">
            <div className="flex-fixed-left">
              <div className="left">
                <span className="add-on">
                  {selectedToken && (
                    <TokenDisplay
                      onClick={() => {}}
                      mintAddress={selectedToken.address}
                      name={selectedToken.name}
                      showCaretDown={false}
                      fullTokenInfo={selectedToken}
                    />
                  )}
                  {treasuryDetails && treasuryDetails.autoClose ? (
                    <>
                      {selectedToken && selectFromTokenBalance() ? (
                        <div
                          className="token-max simplelink"
                          onClick={() => {
                            setTopupAmount(cutNumber(selectFromTokenBalance(), selectedToken.decimals));
                            setTokenAmount(toTokenAmountBn(selectFromTokenBalance(), selectedToken.decimals));
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
                          className="token-max simplelink"
                          onClick={() => {
                            const decimals = selectedToken ? selectedToken.decimals : 6;
                            if (isfeePayedByTreasurerOn()) {
                              const maxAmount = getMaxAmount(true);
                              consoleOut('tokenAmount:', tokenAmount.toString(), 'blue');
                              consoleOut('maxAmount:', maxAmount.toString(), 'blue');
                              setTopupAmount(toUiAmount(new BN(maxAmount), decimals));
                              setTokenAmount(new BN(maxAmount));
                            } else {
                              const maxAmount = getMaxAmount();
                              setTopupAmount(toUiAmount(new BN(maxAmount), decimals));
                              setTokenAmount(new BN(maxAmount));
                            }
                          }}
                        >
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
                    {`${
                      selectedToken && selectFromTokenBalance()
                        ? getAmountWithSymbol(selectFromTokenBalance(), selectedToken?.address)
                        : '0'
                    }`}
                  </span>
                ) : (
                  <>
                    {selectedToken ? (
                      <span>
                        {displayAmountWithSymbol(
                          unallocatedBalance,
                          selectedToken.address,
                          selectedToken.decimals,
                          splTokenList,
                        )}
                      </span>
                    ) : null}
                  </>
                )}
              </div>
              <div className="right inner-label">
                {publicKey ? (
                  <>
                    <span
                      className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'}
                      onClick={() => refreshPrices()}
                    >
                      ~{topupAmount ? toUsCurrency(getTokenPrice()) : '$0.00'}
                    </span>
                  </>
                ) : (
                  <span>~$0.00</span>
                )}
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
            onClick={onAcceptTopup}
          >
            {getTransactionStartButtonLabel()}
          </Button>
        </>
      )}
    </Modal>
  );
};
