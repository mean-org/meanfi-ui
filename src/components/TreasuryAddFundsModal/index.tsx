import React, { useCallback, useEffect, useMemo } from 'react';
import { useContext, useState } from 'react';
import { Modal, Button, Select, Spin, Tooltip, Radio } from 'antd';
import { AppStateContext } from '../../contexts/appstate';
import { useTranslation } from 'react-i18next';
import { TokenInfo } from '@solana/spl-token-registry';
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined, WarningFilled, WarningOutlined } from '@ant-design/icons';
import { TokenDisplay } from '../TokenDisplay';
import {
  displayAmountWithSymbol,
  formatThousands,
  getSdkValue,
  isValidNumber,
  shortenAddress,
  toTokenAmount2,
  toUiAmount2
} from '../../middleware/utils';
import { IconHelpCircle } from '../../Icons';
import {
  consoleOut,
  getTransactionOperationDescription,
  isValidAddress,
  toUsCurrency,
} from '../../middleware/ui';
import { StreamInfo, TransactionFees, TreasuryInfo } from '@mean-dao/money-streaming/lib/types';
import { TreasuryTopupParams } from '../../models/common-types';
import { TransactionStatus } from '../../models/enums';
import { useWallet } from '../../contexts/wallet';
import { NATIVE_SOL_MINT } from '../../middleware/ids';
import { AllocationType, Stream, Treasury, TreasuryType } from '@mean-dao/msp';
import BN from 'bn.js';
import { CUSTOM_TOKEN_NAME, FALLBACK_COIN_IMAGE, MIN_SOL_BALANCE_REQUIRED, SOLANA_EXPLORER_URI_INSPECT_ADDRESS, WRAPPED_SOL_MINT_ADDRESS } from '../../constants';
import { useSearchParams } from 'react-router-dom';
import { MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import { Identicon } from '../Identicon';
import { QRCodeSVG } from 'qrcode.react';
import { AddressDisplay } from '../AddressDisplay';
import { getSolanaExplorerClusterParam, useConnectionConfig } from '../../contexts/connection';
import { NATIVE_SOL } from '../../middleware/tokens';
import { InputMean } from '../InputMean';
import { AccountInfo, Connection, ParsedAccountData } from '@solana/web3.js';
import { readAccountInfo } from '../../middleware/accounts';

const { Option } = Select;
const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const TreasuryAddFundsModal = (props: {
  associatedToken: string;
  handleClose: any;
  handleOk: any;
  isBusy: boolean;
  isVisible: boolean;
  nativeBalance: number;
  onReloadTokenBalances: any;
  selectedMultisig: MultisigInfo | undefined;
  transactionFees: TransactionFees;
  treasuryDetails: Treasury | TreasuryInfo | undefined;
  treasuryList?: (Treasury | TreasuryInfo)[] | undefined;
  treasuryStreams: Array<Stream | StreamInfo> | undefined;
  userBalances: any;
  withdrawTransactionFees: TransactionFees;
}) => {
  const {
    associatedToken,
    handleClose,
    handleOk,
    isBusy,
    isVisible,
    nativeBalance,
    onReloadTokenBalances,
    selectedMultisig,
    transactionFees,
    treasuryDetails,
    treasuryList,
    treasuryStreams,
    userBalances,
    withdrawTransactionFees,
  } = props;
  const {
    theme,
    splTokenList,
    loadingPrices,
    transactionStatus,
    highLightableStreamId,
    getTokenByMintAddress,
    getTokenPriceBySymbol,
    refreshPrices,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const connectionConfig = useConnectionConfig();
  const [topupAmount, setTopupAmount] = useState<string>('');
  const [allocationOption, setAllocationOption] = useState<AllocationType>(AllocationType.None);
  const [, setTreasuryType] = useState<TreasuryType>(TreasuryType.Open);
  const [availableBalance, setAvailableBalance] = useState<any>();
  const [tokenAmount, setTokenAmount] = useState<any>(0);
  const [searchParams] = useSearchParams();
  const [tokenBalance, setSelectedTokenBalance] = useState<number>(0);
  const [showQrCode, setShowQrCode] = useState(false);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | undefined>(undefined);
  const [workingAssociatedToken, setWorkingAssociatedToken] = useState('');
  const [workingTreasuryDetails, setWorkingTreasuryDetails] = useState<Treasury | TreasuryInfo | undefined>(undefined);
  const [selectedStreamingAccountId, setSelectedStreamingAccountId] = useState('');
  const [fundFromSafeOption, setFundFromSafeOption] = useState(false);
  const [proposalTitle, setProposalTitle] = useState("");


  /////////////////
  //   Getters   //
  /////////////////

  const connection = useMemo(() => new Connection(connectionConfig.endpoint, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true
  }), [
    connectionConfig.endpoint
  ]);

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

  const hasNoStreamingAccounts = useMemo(() => {
    return  param === "multisig" &&
            selectedMultisig &&
            (!treasuryList || treasuryList.length === 0)
      ? true
      : false;
  }, [param, selectedMultisig, treasuryList]);

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

  const getTokenPrice = useCallback(() => {
    if (!topupAmount || !selectedToken) {
        return 0;
    }

    return parseFloat(topupAmount) * getTokenPriceBySymbol(selectedToken.symbol);
}, [topupAmount, selectedToken, getTokenPriceBySymbol]);

  const isfeePayedByTreasurerOn = useCallback(() => {
    if (highLightableStreamId) {
      consoleOut('highLightableStreamId:', highLightableStreamId, 'orange');
      consoleOut('Getting stream data...', '', 'orange');
      const stream = getSelectedStream(highLightableStreamId);
      consoleOut('stream:', stream, 'orange');
      if (stream && stream.version >= 2 && (stream as Stream).feePayedByTreasurer) {
        return true;
      }
    }

    return false;
  }, [
    highLightableStreamId,
    getSelectedStream,
  ]);

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

  const getTokenOrCustomToken = useCallback(async (address: string) => {

    const token = getTokenByMintAddress(address);

    const unkToken = {
      address: address,
      name: CUSTOM_TOKEN_NAME,
      chainId: 101,
      decimals: 6,
      symbol: `[${shortenAddress(address)}]`,
    };

    if (token) {
      return token;
    } else {
      try {
        const tokeninfo = await readAccountInfo(connection, address);
        if ((tokeninfo as any).data["parsed"]) {
          const decimals = (tokeninfo as AccountInfo<ParsedAccountData>).data.parsed.info.decimals as number;
          unkToken.decimals = decimals || 0;
          return unkToken as TokenInfo;
        } else {
          return unkToken as TokenInfo;
        }
      } catch (error) {
        console.error('Could not get token info, assuming decimals = 6');
        return unkToken as TokenInfo;
      }
    }
  }, [connection, getTokenByMintAddress]);

  const selectFromTokenBalance = useCallback(() => {
    if (!selectedToken) { return nativeBalance; }
    consoleOut(`selectedToken:`, selectedToken ? selectedToken.address : '-', 'blue');
    consoleOut(`tokenBalance:`, tokenBalance || 0, 'blue');
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

  const isNewTreasury = useCallback((treasury: Treasury | TreasuryInfo) => {
    if (treasury) {
      const v2 = treasury as Treasury;
      return v2.version >= 2 ? true : false;
    }

    return false;
  }, []);

  /////////////////////
  // Data management //
  /////////////////////

  // Set working copy of the selected streaming account if passed-in
  // Also set the working associated token
  // Also set the treasury type
  useEffect(() => {
    if (isVisible) {
      if (treasuryDetails) {
        const v1 = treasuryDetails as TreasuryInfo;
        const v2 = treasuryDetails as Treasury;
        consoleOut('treasuryDetails aquired:', treasuryDetails, 'blue');
        setWorkingTreasuryDetails(treasuryDetails);
        setSelectedStreamingAccountId(treasuryDetails.id as string);
        setWorkingAssociatedToken(treasuryDetails.version < 2 ? v1.associatedTokenAddress as string : v2.associatedToken as string);
      }
    }
  }, [isVisible, treasuryDetails]);

  // Preset a working copy of the first available streaming account in the list if treasuryDetails was not passed in
  useEffect(() => {
    if (isVisible && !treasuryDetails && treasuryList && treasuryList.length > 0 && !workingTreasuryDetails) {
      consoleOut('treasuryDetails not set!', 'Try to pick one from list', 'blue');
      const selected = treasuryList[0];
      const v1 = selected as TreasuryInfo;
      const v2 = selected as Treasury;
      consoleOut('treasuryDetails preset:', selected, 'blue');
      setWorkingTreasuryDetails(selected);
      setSelectedStreamingAccountId(selected.id as string);
      setWorkingAssociatedToken(selected.version < 2 ? v1.associatedTokenAddress as string : v2.associatedToken as string);
    }
  }, [isVisible, treasuryDetails, treasuryList, workingTreasuryDetails]);

  // Set token based on selected treasury details
  useEffect(() => {
    if (hasNoStreamingAccounts || !workingAssociatedToken || !workingTreasuryDetails) {
      return;
    }

    let tokenAddress = '';
    const v1 = workingTreasuryDetails as TreasuryInfo;
    const v2 = workingTreasuryDetails as Treasury;
    tokenAddress = workingTreasuryDetails.version < 2 ? v1.associatedTokenAddress as string : v2.associatedToken as string;
    getTokenOrCustomToken(tokenAddress)
    .then(token => {
      consoleOut('Treasury workingAssociatedToken:', token, 'blue');
      setSelectedToken(token);
      setWorkingAssociatedToken(tokenAddress)
    });
  }, [getTokenOrCustomToken, hasNoStreamingAccounts, workingAssociatedToken, workingTreasuryDetails]);

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

  // Set available balance in BN either from user's wallet or from treasury if a stream is being funded
  useEffect(() => {

    const getUnallocatedBalance = (details: Treasury | TreasuryInfo) => {
      const balance = new BN(details.balance);
      const allocationAssigned = new BN(details.allocationAssigned);
      return balance.sub(allocationAssigned);
    }

    if (isVisible && workingTreasuryDetails && selectedToken) {
      const decimals = selectedToken ? selectedToken.decimals : 6;
      if (highLightableStreamId) {
        // Take source balance from the treasury
        const unallocated = getUnallocatedBalance(workingTreasuryDetails);
        const ub = isNewTreasury(workingTreasuryDetails)
          ? unallocated
          : toUiAmount2(unallocated, selectedToken.decimals);
        consoleOut('unallocatedBalance:', ub.toString(), 'blue');
        setAvailableBalance(ub);
      } else {
        // Take source balance from the user's wallet or safe
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
    tokenBalance,
    selectedToken,
    workingTreasuryDetails,
    highLightableStreamId,
    selectFromTokenBalance,
    isNewTreasury,
  ]);

  // When modal goes visible, use the treasury associated token or use the default from the appState
  useEffect(() => {
    if (isVisible && associatedToken) {
      getTokenOrCustomToken(associatedToken)
      .then(token => {
        setSelectedToken(token);
      });
    }
  }, [associatedToken, getTokenOrCustomToken, isVisible]);

  // When modal goes visible, update allocation type option
  useEffect(() => {
    if (!workingTreasuryDetails) { return; }
    const isNew = (workingTreasuryDetails as Treasury).version && (workingTreasuryDetails as Treasury).version >= 2
      ? true
      : false;
    const tt = isNew
      ? (workingTreasuryDetails as Treasury).treasuryType
      : (workingTreasuryDetails as TreasuryInfo).type as TreasuryType;
    setTreasuryType(tt);
    if (highLightableStreamId) {
      setAllocationOption(AllocationType.Specific);
    } else {
      setAllocationOption(AllocationType.None);
    }
  }, [
    workingTreasuryDetails,
    treasuryStreams,
    highLightableStreamId,
  ]);

  useEffect(() => {
    if (isVisible) {
      if (param === "multisig" && selectedMultisig && !highLightableStreamId) {
        consoleOut('Getting funds from safe...', '', 'blue');
        setFundFromSafeOption(true);
      }
    }
  }, [highLightableStreamId, isVisible, param, selectedMultisig, treasuryDetails]);

  ////////////////
  //   Events   //
  ////////////////

  const onStreamingAccountSelected = useCallback((e: any) => {
    consoleOut('Selected streaming account:', e, 'blue');
    setSelectedStreamingAccountId(e.id as string);
    const item = treasuryList?.find(t => t.id === e);
    consoleOut('item:', item, 'blue');
    if (item) {
      setWorkingTreasuryDetails(item);
      setSelectedStreamingAccountId(item.id as string);
      const v1 = item as TreasuryInfo;
      const v2 = item as Treasury;
      const tokenAddress = item.version < 2 ? v1.associatedTokenAddress as string : v2.associatedToken as string;
      getTokenOrCustomToken(tokenAddress)
      .then(token => {
        consoleOut('Treasury workingAssociatedToken:', token, 'blue');
        setSelectedToken(token);
        setWorkingAssociatedToken(tokenAddress)
      });
    }
  },[getTokenOrCustomToken, treasuryList]);

  const onAcceptModal = useCallback(() => {
    if (!selectedToken) {
      return;
    }

    const params: TreasuryTopupParams = {
      proposalTitle: proposalTitle || '',
      amount: topupAmount,
      tokenAmount: tokenAmount.toString(),
      allocationType: allocationOption,
      associatedToken: selectedToken
        ? selectedToken.address === WRAPPED_SOL_MINT_ADDRESS
          ? NATIVE_SOL_MINT.toBase58()
          : selectedToken.address
        : '',
      streamId: highLightableStreamId && allocationOption === AllocationType.Specific
                ? highLightableStreamId : '',
      treasuryId: selectedStreamingAccountId || '',
      contributor: fundFromSafeOption && selectedMultisig
        ? selectedMultisig.authority.toBase58()
        : '',
      fundFromSafe: fundFromSafeOption,
    };

    handleOk(params);
  }, [
    allocationOption,
    fundFromSafeOption,
    handleOk,
    highLightableStreamId,
    proposalTitle,
    selectedMultisig,
    selectedStreamingAccountId,
    selectedToken,
    topupAmount,
    tokenAmount
  ]);

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


  //////////////////
  //  Validation  //
  //////////////////

  const isStreamingAccountSelected = (): boolean => {
    const isMultisig = param === "multisig" && selectedMultisig ? true : false;
    return !isMultisig || (isMultisig && selectedStreamingAccountId && isValidAddress(selectedStreamingAccountId))
      ? true
      : false;
  }

  const isValidInput = (): boolean => {
    return publicKey &&
           (!fundFromSafeOption || (param === "multisig" && selectedMultisig && fundFromSafeOption && proposalTitle)) &&
           selectedToken &&
           ((fundFromSafeOption && tokenBalance) || (!fundFromSafeOption && (availableBalance && (availableBalance as BN).gtn(0)))) &&
           nativeBalance > MIN_SOL_BALANCE_REQUIRED &&
           tokenAmount && (tokenAmount as BN).gtn(0) &&
           tokenAmount.lte(getMaxAmount())
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

  const getTransactionStartButtonLabel = (): string => {
    return !publicKey
      ? t('transactions.validation.not-connected')
      : !isStreamingAccountSelected()
        ? 'Select streaming account'
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

  const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    event.currentTarget.src = FALLBACK_COIN_IMAGE;
    event.currentTarget.className = "error";
  };

  const getStreamingAccountIcon = (item: Treasury | TreasuryInfo | undefined) => {
    if (!item) { return null; }
    const isV2Treasury = item && item.version >= 2 ? true : false;
    const v1 = item as TreasuryInfo;
    const v2 = item as Treasury;
    const token = isV2Treasury
      ? v2.associatedToken
        ? getTokenByMintAddress(v2.associatedToken as string)
        : undefined
      : v1.associatedTokenAddress
        ? getTokenByMintAddress(v1.associatedTokenAddress as string)
        : undefined;
    return (
      <div className="token-icon">
        {(isV2Treasury ? v2.associatedToken : v1.associatedTokenAddress) ? (
          <>
            {token && token.logoURI ? (
              <img alt={`${token.name}`} width={20} height={20} src={token.logoURI} onError={imageOnErrorHandler} />
            ) : (
              <Identicon address={(isV2Treasury ? v2.associatedToken : v1.associatedTokenAddress)} style={{ width: "20", display: "inline-flex" }} />
            )}
          </>
        ) : (
          <Identicon address={item.id} style={{ width: "20", display: "inline-flex" }} />
        )}
      </div>
    );
  }

  const getStreamingAccountDescription = (item: Treasury | TreasuryInfo | undefined) => {
    if (!item) { return null; }
    const isV2Treasury = item && item.version >= 2 ? true : false;
    const v1 = item as TreasuryInfo;
    const v2 = item as Treasury;
    return (
      <>
        {(isV2Treasury && item ? v2.name : v1.label) ? (
          <>
            <div className="title text-truncate">
              {isV2Treasury ? v2.name : v1.label}
              <span className={`badge small ml-1 ${theme === 'light' ? 'golden fg-dark' : 'darken'}`}>
                {isV2Treasury
                  ? v2.treasuryType === TreasuryType.Open ? 'Open' : 'Locked'
                  : v1.type === TreasuryType.Open ? 'Open' : 'Locked'
                }
              </span>
            </div>
            <div className="subtitle text-truncate">{shortenAddress(item.id, 8)}</div>
          </>
        ) : (
          <div className="title text-truncate">{shortenAddress(item.id, 8)}</div>
        )}
      </>
    );
  }

  const getStreamingAccountStreamCount = (item: Treasury | TreasuryInfo | undefined) => {
    if (!item) { return null; }
    const isV2Treasury = item && item.version >= 2 ? true : false;
    const v1 = item as TreasuryInfo;
    const v2 = item as Treasury;
    return (
      <>
        {!isV2Treasury && v1.upgradeRequired ? (
          <span>&nbsp;</span>
        ) : (
          <>
          <div className="rate-amount">
            {formatThousands(isV2Treasury ? +getSdkValue(v2.totalStreams) : +getSdkValue(v1.streamsAmount))}
          </div>
          <div className="interval">streams</div>
          </>
        )}
      </>
    );
  }

  const renderStreamingAccountItem = (item: Treasury | TreasuryInfo) => {
    return (
      <Option key={`${item.id}`} value={item.id as string}>
        <div className={`transaction-list-row no-pointer`}>
          <div className="icon-cell">{getStreamingAccountIcon(item)}</div>
          <div className="description-cell">
            {getStreamingAccountDescription(item)}
          </div>
          <div className="rate-cell">
            {getStreamingAccountStreamCount(item)}
          </div>
        </div>
      </Option>
    );
  }

  return (
    <Modal
      className="mean-modal simple-modal"
      title={
        <div className="modal-title">
          {highLightableStreamId
            ? t('treasuries.add-funds.modal-title-fund-stream')
            : t('treasuries.add-funds.modal-title')
          }
        </div>
      }
      maskClosable={false}
      footer={null}
      visible={isVisible}
      onOk={onAcceptModal}
      onCancel={handleClose}
      width={isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}>

      {hasNoStreamingAccounts && !treasuryDetails ? (
        <div className="text-center px-4 py-4">
          {theme === 'light' ? (
            <WarningFilled style={{ fontSize: 48 }} className="icon mt-0 mb-3 fg-warning" />
          ) : (
            <WarningOutlined style={{ fontSize: 48 }} className={`icon mt-0 mb-3 fg-warning`} />
          )}
          <h2 className={`mb-3 fg-warning`}>No streaming accounts</h2>
          <p>Your super safe needs a streaming account to set up and fund payment streams. To get started, create and fund a streaming account and then you can proceed with creating a payment stream.</p>
        </div>
      ) : (
        <>
          <div className={!isBusy ? "panel1 show" : "panel1 hide"}>

            {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
              <>
                {/* Fund from Wallet/Safe switch */}
                {param === "multisig" && selectedMultisig && workingTreasuryDetails && !highLightableStreamId && (
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
                      placeholder="Add a proposal title (required)"
                      value={proposalTitle}
                    />
                  </div>
                )}

                {param === "multisig" && selectedMultisig && !treasuryDetails && (
                  <>
                    <div className="mb-3">
                      <div className="form-label icon-label">
                        {t('treasuries.add-funds.select-streaming-account-label')}
                        <Tooltip placement="bottom" title="Every payment stream is funded from a streaming account. Select the account to fund below.">
                          <span>
                            <IconHelpCircle className="mean-svg-icons" />
                          </span>
                        </Tooltip>
                      </div>
                      <div className={`well ${isBusy ? 'disabled' : ''}`}>
                        <div className="dropdown-trigger no-decoration flex-fixed-right align-items-center">
                          {treasuryList && treasuryList.length > 0 && (
                            <Select className={`auto-height`} value={selectedStreamingAccountId}
                              style={{width:"100%", maxWidth:'none'}}
                              dropdownClassName="stream-select-dropdown"
                              onChange={onStreamingAccountSelected}
                              bordered={false}
                              showArrow={false}
                              dropdownRender={menu => (
                              <div>{menu}</div>
                            )}>
                              {treasuryList.map(option => {
                                return renderStreamingAccountItem(option);
                              })}
                            </Select>
                          )}
                        </div>
                        {
                          selectedStreamingAccountId && !isValidAddress(selectedStreamingAccountId) && (
                            <span className="form-field-error">
                              {t('transactions.validation.address-validation')}
                            </span>
                          )
                        }
                      </div>
                    </div>
                  </>
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
                                const decimals = selectedToken ? selectedToken.decimals : 6;
                                if (isfeePayedByTreasurerOn()) {
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
                              ? displayAmountWithSymbol(
                                  availableBalance,
                                  selectedToken.address,
                                  selectedToken.decimals,
                                  splTokenList
                                )
                              : "0"
                          }`}
                        </span>
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
                      { transactionStatus.customError }
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
            <div className="mt-3 transaction-progress p-0">
              <Button
                className={`center-text-in-btn ${isBusy ? 'inactive' : ''}`}
                block
                type="primary"
                shape="round"
                size="large"
                disabled={!isStreamingAccountSelected() || !isTopupFormValid()}
                onClick={onAcceptModal}>
                {isBusy
                  ? allocationOption === AllocationType.Specific && highLightableStreamId
                    ? t('treasuries.add-funds.main-cta-fund-stream-busy')
                    : t('treasuries.add-funds.main-cta-busy')
                  : transactionStatus.currentOperation === TransactionStatus.Iddle
                    ? getTransactionStartButtonLabel()
                    : t('general.retry')
                }
              </Button>
            </div>
          )}

          {!isBusy && !highLightableStreamId && workingTreasuryDetails && transactionStatus.currentOperation === TransactionStatus.Iddle && (
            <div className={`text-center mt-4 mb-2`}>
              <p>You can also fund this streaming account by sending {selectedToken?.symbol} tokens to:</p>

              {showQrCode && workingTreasuryDetails && (
                <>
                  <div className="qr-container bg-white">
                    <QRCodeSVG
                      value={workingTreasuryDetails.id as string}
                      size={200}
                    />
                  </div>
                </>
              )}

              {workingTreasuryDetails && (
                <div className="flex-center mb-2">
                  <AddressDisplay
                    address={workingTreasuryDetails.id as string}
                    showFullAddress={true}
                    iconStyles={{ width: "15", height: "15" }}
                    newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${workingTreasuryDetails.id as string}${getSolanaExplorerClusterParam()}`}
                  />
                </div>
              )}

              {!showQrCode && (
                <div className="simplelink underline" onClick={() => {setShowQrCode(true)}}>Scan QR code instead?</div>
              )}

            </div>
          )}

        </>
      )}
    </Modal>
  );
};
