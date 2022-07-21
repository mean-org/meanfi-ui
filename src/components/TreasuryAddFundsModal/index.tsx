import React, { useCallback, useEffect, useMemo } from 'react';
import { useContext, useState } from 'react';
import { Modal, Button, Select, Divider, Input, Spin, Tooltip, AutoComplete } from 'antd';
import { AppStateContext } from '../../contexts/appstate';
import { useTranslation } from 'react-i18next';
import { TokenInfo } from '@solana/spl-token-registry';
import { NATIVE_SOL } from '../../utils/tokens';
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined, WarningFilled, WarningOutlined } from '@ant-design/icons';
import { TokenDisplay } from '../TokenDisplay';
import {
  cutNumber,
  formatAmount,
  formatThousands,
  getTokenAmountAndSymbolByTokenAddress,
  getTokenSymbol,
  isValidNumber,
  makeDecimal,
  makeInteger,
  shortenAddress,
  toUiAmount
} from '../../utils/utils';
import { IconCheckedBox, IconDownload, IconHelpCircle, IconIncomingPaused, IconOutgoingPaused, IconTimer, IconUpload } from '../../Icons';
import {
  consoleOut,
  getShortDate,
  getIntervalFromSeconds,
  getFormattedNumberToLocale,
  getTransactionOperationDescription,
  isValidAddress
} from '../../utils/ui';
import { StreamInfo, STREAM_STATE, TransactionFees, TreasuryInfo } from '@mean-dao/money-streaming/lib/types';
import { TreasuryTopupParams } from '../../models/common-types';
import { TransactionStatus } from '../../models/enums';
import { useWallet } from '../../contexts/wallet';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { isError } from '../../utils/transactions';
import { AllocationType, Stream, STREAM_STATUS, Treasury, TreasuryType } from '@mean-dao/msp';
import BN from 'bn.js';
import { openNotification } from '../Notifications';
import { CUSTOM_TOKEN_NAME, FALLBACK_COIN_IMAGE, SOLANA_EXPLORER_URI_INSPECT_ADDRESS, WRAPPED_SOL_MINT_ADDRESS } from '../../constants';
import { useSearchParams } from 'react-router-dom';
import { MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import { Identicon } from '../Identicon';
import { QRCodeSVG } from 'qrcode.react';
import { AddressDisplay } from '../AddressDisplay';
import { getSolanaExplorerClusterParam } from '../../contexts/connection';

const { Option } = Select;
const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const TreasuryAddFundsModal = (props: {
  associatedToken: string;
  handleClose: any;
  handleOk: any;
  isBusy: boolean;
  isVisible: boolean;
  nativeBalance: number;
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
    tokenList,
    effectiveRate,
    loadingPrices,
    transactionStatus,
    highLightableStreamId,
    getTokenByMintAddress,
    getTokenPriceBySymbol,
    setTransactionStatus,
    setEffectiveRate,
    refreshPrices,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const [topupAmount, setTopupAmount] = useState<string>('');
  const [allocationOption, setAllocationOption] = useState<AllocationType>(AllocationType.None);
  const [customTokenInput, setCustomTokenInput] = useState("");
  // const [selectedStreamForAllocation, setSelectedStreamForAllocation] = useState('');
  const [, setTreasuryType] = useState<TreasuryType>(TreasuryType.Open);
  const [availableBalance, setAvailableBalance] = useState<any>();
  const [tokenAmount, setTokenAmount] = useState<any>(0);
  const [searchParams] = useSearchParams();
  const [tokenBalance, setSelectedTokenBalance] = useState<number>(0);
  const [showQrCode, setShowQrCode] = useState(false);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | undefined>(undefined);
  const [workingAssociatedToken, setWorkingAssociatedToken] = useState('');
  const [workingTreasuryDetails, setWorkingTreasuryDetails] = useState<Treasury | TreasuryInfo | undefined>(undefined);
  const [workingTreasuryType, setWorkingTreasuryType] = useState<TreasuryType>(TreasuryType.Open);
  const [selectedStreamingAccountId, setSelectedStreamingAccountId] = useState('');


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

  const isInboundStream = useCallback((item: Stream | StreamInfo): boolean => {
    if (item && publicKey) {
      const v1 = item as StreamInfo;
      const v2 = item as Stream;
      if (v1.version < 2) {
        return v1.beneficiaryAddress === publicKey.toBase58() ? true : false;
      } else {
        return v2.beneficiary === publicKey.toBase58() ? true : false;
      }
    }
    return false;
  }, [publicKey]);

  const getTransactionStartButtonLabel = (): string => {
    return !publicKey
      ? t('transactions.validation.not-connected')
      : !isStreamingAccountSelected()
        ? 'Select streaming account'
        : !selectedToken || !availableBalance || availableBalance.isZero()
          ? t('transactions.validation.no-balance')
          : !tokenAmount || tokenAmount.isZero()
            ? t('transactions.validation.no-amount')
            : tokenAmount.gt(getMaxAmount())
              ? t('transactions.validation.amount-high')
              : allocationOption === AllocationType.Specific && !highLightableStreamId
                ? t('transactions.validation.select-stream')
                : allocationOption === AllocationType.Specific && highLightableStreamId
                  ? t('treasuries.add-funds.main-cta-fund-stream')
                  : t('treasuries.add-funds.main-cta');
  }

  const getRateAmountDisplay = useCallback((item: Stream | StreamInfo): string => {
    let value = '';

    if (item) {
      const token = item.associatedToken ? getTokenByMintAddress(item.associatedToken as string) : undefined;
      if (item.version < 2) {
        value += getFormattedNumberToLocale(formatAmount(item.rateAmount, 2));
      } else {
        value += getFormattedNumberToLocale(formatAmount(toUiAmount(new BN(item.rateAmount), token?.decimals || 6), 2));
      }
      value += ' ';
      value += getTokenSymbol(item.associatedToken as string);
    }
    return value;
  }, [getTokenByMintAddress]);

  const getTransferAmountDisplay = useCallback((item: Stream | StreamInfo): string => {
    let value = '';

    if (item && item.rateAmount === 0 && item.allocationAssigned > 0) {
      const token = item.associatedToken ? getTokenByMintAddress(item.associatedToken as string) : undefined;
      if (item.version < 2) {
        value += getFormattedNumberToLocale(formatAmount(item.rateAmount, 2));
      } else {
        value += getFormattedNumberToLocale(formatAmount(toUiAmount(new BN(item.rateAmount), token?.decimals || 6), 2));
      }
      value += ' ';
      value += getTokenSymbol(item.associatedToken as string);
    }
    return value;
  }, [getTokenByMintAddress]);

  const getStreamIcon = useCallback((item: Stream | StreamInfo) => {
    const isInbound = isInboundStream(item);
    const v1 = item as StreamInfo;
    const v2 = item as Stream;

    if (v1.version < 2) {
      if (isInbound) {
        switch (v1.state) {
          case STREAM_STATE.Schedule:
            return (<IconTimer className="mean-svg-icons incoming" />);
          case STREAM_STATE.Paused:
            return (<IconIncomingPaused className="mean-svg-icons incoming" />);
          default:
            return (<IconDownload className="mean-svg-icons incoming" />);
        }
      } else {
        switch (v1.state) {
          case STREAM_STATE.Schedule:
            return (<IconTimer className="mean-svg-icons outgoing" />);
          case STREAM_STATE.Paused:
            return (<IconOutgoingPaused className="mean-svg-icons outgoing" />);
          default:
            return (<IconUpload className="mean-svg-icons outgoing" />);
        }
      }
    } else {
      if (isInbound) {
        switch (v2.status) {
          case STREAM_STATUS.Schedule:
            return (<IconTimer className="mean-svg-icons incoming" />);
          case STREAM_STATUS.Paused:
            return (<IconIncomingPaused className="mean-svg-icons incoming" />);
          default:
            return (<IconDownload className="mean-svg-icons incoming" />);
        }
      } else {
        switch (v2.status) {
          case STREAM_STATUS.Schedule:
            return (<IconTimer className="mean-svg-icons outgoing" />);
          case STREAM_STATUS.Paused:
            return (<IconOutgoingPaused className="mean-svg-icons outgoing" />);
          default:
            return (<IconUpload className="mean-svg-icons outgoing" />);
        }
      }
    }
  }, [isInboundStream]);

  const getStreamDescription = useCallback((item: Stream | StreamInfo): string => {
    let title = '';
    const isInbound = isInboundStream(item);

    const v1 = item as StreamInfo;
    const v2 = item as Stream;

    if (v1.version < 2) {
      if (isInbound) {
        if (v1.state === STREAM_STATE.Schedule) {
          title = `${t('streams.stream-list.title-scheduled-from')} (${shortenAddress(`${v1.treasurerAddress}`)})`;
        } else if (v1.state === STREAM_STATE.Paused) {
          title = `${t('streams.stream-list.title-paused-from')} (${shortenAddress(`${v1.treasurerAddress}`)})`;
        } else {
          title = `${t('streams.stream-list.title-receiving-from')} (${shortenAddress(`${v1.treasurerAddress}`)})`;
        }
      } else {
        if (v1.state === STREAM_STATE.Schedule) {
          title = `${t('streams.stream-list.title-scheduled-to')} (${shortenAddress(`${v1.beneficiaryAddress}`)})`;
        } else if (v1.state === STREAM_STATE.Paused) {
          title = `${t('streams.stream-list.title-paused-to')} (${shortenAddress(`${v1.beneficiaryAddress}`)})`;
        } else {
          title = `${t('streams.stream-list.title-sending-to')} (${shortenAddress(`${v1.beneficiaryAddress}`)})`;
        }
      }
    } else {
      if (isInbound) {
        if (v2.status === STREAM_STATUS.Schedule) {
          title = `${t('streams.stream-list.title-scheduled-from')} (${shortenAddress(`${v2.treasurer}`)})`;
        } else if (v2.status === STREAM_STATUS.Paused) {
          title = `${t('streams.stream-list.title-paused-from')} (${shortenAddress(`${v2.treasurer}`)})`;
        } else {
          title = `${t('streams.stream-list.title-receiving-from')} (${shortenAddress(`${v2.treasurer}`)})`;
        }
      } else {
        if (v2.status === STREAM_STATUS.Schedule) {
          title = `${t('streams.stream-list.title-scheduled-to')} (${shortenAddress(`${v2.beneficiary}`)})`;
        } else if (v2.status === STREAM_STATUS.Paused) {
          title = `${t('streams.stream-list.title-paused-to')} (${shortenAddress(`${v2.beneficiary}`)})`;
        } else {
          title = `${t('streams.stream-list.title-sending-to')} (${shortenAddress(`${v2.beneficiary}`)})`;
        }
      }
    }
    return title;
  }, [
    t,
    isInboundStream
  ]);

  const getStreamSubTitle = useCallback((item: Stream | StreamInfo) => {
    let title = '';

    if (item) {
      const v1 = item as StreamInfo;
      const v2 = item as Stream;
      const isInbound = isInboundStream(item);
      let rateAmount = item.rateAmount > 0 ? getRateAmountDisplay(item) : getTransferAmountDisplay(item);
      if (item.rateAmount > 0) {
        rateAmount += ' ' + getIntervalFromSeconds(item.rateIntervalInSeconds, false, t);
      }

      if (v1.version < 2) {
        if (isInbound) {
          if (v1.state === STREAM_STATE.Schedule) {
            title = t('streams.stream-list.subtitle-scheduled-inbound', {
              rate: rateAmount
            });
            title += ` ${getShortDate(v1.startUtc as string)}`;
          } else {
            title = t('streams.stream-list.subtitle-running-inbound', {
              rate: rateAmount
            });
            title += ` ${getShortDate(v1.startUtc as string)}`;
          }
        } else {
          if (v1.state === STREAM_STATE.Schedule) {
            title = t('streams.stream-list.subtitle-scheduled-outbound', {
              rate: rateAmount
            });
            title += ` ${getShortDate(v1.startUtc as string)}`;
          } else {
            title = t('streams.stream-list.subtitle-running-outbound', {
              rate: rateAmount
            });
            title += ` ${getShortDate(v1.startUtc as string)}`;
          }
        }
      } else {
        if (isInbound) {
          if (v2.status === STREAM_STATUS.Schedule) {
            title = t('streams.stream-list.subtitle-scheduled-inbound', {
              rate: rateAmount
            });
            title += ` ${getShortDate(v2.startUtc as string)}`;
          } else {
            title = t('streams.stream-list.subtitle-running-inbound', {
              rate: rateAmount
            });
            title += ` ${getShortDate(v2.startUtc as string)}`;
          }
        } else {
          if (v2.status === STREAM_STATUS.Schedule) {
            title = t('streams.stream-list.subtitle-scheduled-outbound', {
              rate: rateAmount
            });
            title += ` ${getShortDate(v2.startUtc as string)}`;
          } else {
            title = t('streams.stream-list.subtitle-running-outbound', {
              rate: rateAmount
            });
            title += ` ${getShortDate(v2.startUtc as string)}`;
          }
        }
      }
    }

    return title;

  }, [
    t,
    isInboundStream,
    getRateAmountDisplay,
    getTransferAmountDisplay,
  ]);

  const toggleOverflowEllipsisMiddle = useCallback((state: boolean) => {
    const ellipsisElements = document.querySelectorAll(".ant-select.token-selector-dropdown .ant-select-selector .ant-select-selection-item");
    if (ellipsisElements && ellipsisElements.length) {
      const element = ellipsisElements[0];
      if (state) {
        if (!element.classList.contains('overflow-ellipsis-middle')) {
          element.classList.add('overflow-ellipsis-middle');
        }
      } else {
        if (element.classList.contains('overflow-ellipsis-middle')) {
          element.classList.remove('overflow-ellipsis-middle');
        }
      }
      setTimeout(() => {
        triggerWindowResize();
      }, 10);
    }
  }, []);

  const setCustomToken = useCallback((address: string) => {

    if (address && isValidAddress(address)) {
      const unkToken: TokenInfo = {
        address: address,
        name: CUSTOM_TOKEN_NAME,
        chainId: 101,
        decimals: 6,
        symbol: shortenAddress(address),
      };
      setSelectedToken(unkToken);
      consoleOut("token selected:", unkToken, 'blue');
      setEffectiveRate(0);
      toggleOverflowEllipsisMiddle(true);
    } else {
      openNotification({
        title: t('notifications.error-title'),
        description: t('transactions.validation.invalid-solana-address'),
        type: "error"
      });
    }
  }, [
    toggleOverflowEllipsisMiddle,
    setEffectiveRate,
    setSelectedToken,
    t,
  ]);

  const selectFromTokenBalance = useCallback(() => {
    if (!selectedToken) { return nativeBalance; }
    return selectedToken.address === WRAPPED_SOL_MINT_ADDRESS
      ? nativeBalance
      : tokenBalance
  }, [nativeBalance, selectedToken, tokenBalance]);

  const getStreamingAccountName = useCallback((item: Treasury | TreasuryInfo | undefined) => {
    if (item) {
      const v1 = item as TreasuryInfo;
      const v2 = item as Treasury;
      return v1.version < 2 ? v1.label : v2.name;
    }
    return '';
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
        const treasuryType = treasuryDetails.version < 2 ? v1.type as TreasuryType : v2.treasuryType as TreasuryType;
        consoleOut('treasuryDetails aquired:', treasuryDetails, 'blue');
        setWorkingTreasuryDetails(treasuryDetails);
        setSelectedStreamingAccountId(treasuryDetails.id as string);
        setWorkingAssociatedToken(treasuryDetails.version < 2 ? v1.associatedTokenAddress as string : v2.associatedToken as string);
        setWorkingTreasuryType(treasuryType);
      } else {
        consoleOut('treasuryDetails not set!', '', 'blue');
      }
    }
  }, [associatedToken, isVisible, treasuryDetails]);

  // Set token based of selected treasury details
  useEffect(() => {
    if (hasNoStreamingAccounts || workingAssociatedToken || !workingTreasuryDetails) {
      return;
    }

    let tokenAddress = '';
    let token: TokenInfo | undefined = undefined;
    const v1 = workingTreasuryDetails as TreasuryInfo;
    const v2 = workingTreasuryDetails as Treasury;
    tokenAddress = workingTreasuryDetails.version < 2 ? v1.associatedTokenAddress as string : v2.associatedToken as string;
    token = getTokenByMintAddress(tokenAddress);

    if (token) {
      consoleOut('Treasury workingAssociatedToken:', token, 'blue');
      setSelectedToken(token);
    } else if (!selectedToken || selectedToken.address !== workingAssociatedToken) {
      setCustomToken(tokenAddress);
    }
    setWorkingAssociatedToken(tokenAddress)
  }, [getTokenByMintAddress, hasNoStreamingAccounts, selectedToken, setCustomToken, treasuryList, workingAssociatedToken, workingTreasuryDetails]);

  // Keep token balance updated
  useEffect(() => {
    if (selectedToken && userBalances) {
      if (userBalances[selectedToken.address]) {
        setSelectedTokenBalance(userBalances[selectedToken.address]);
      }
    }
  }, [selectedToken, userBalances]);

  // Set available balance in BN either from user's wallet or from treasury if a stream is being funded
  useEffect(() => {
    if (isVisible && workingTreasuryDetails && selectedToken) {
      const decimals = selectedToken ? selectedToken.decimals : 6;
      if (highLightableStreamId) {
        // Take source balance from the treasury
        const unallocated = workingTreasuryDetails.balance - workingTreasuryDetails.allocationAssigned;
        const ub = new BN(unallocated);
        consoleOut('Treasury unallocated balance:', ub.toNumber(), 'blue');
        setAvailableBalance(ub);
      } else {
        // Take source balance from the user's wallet
        const balance = makeInteger(selectFromTokenBalance(), decimals);
        consoleOut('User\'s balance:', balance.toNumber(), 'blue');
        setAvailableBalance(balance);
      }
    } else {
      setAvailableBalance(new BN(0));
    }
  }, [
    tokenBalance,
    selectedToken,
    isVisible,
    workingTreasuryDetails,
    highLightableStreamId,
    selectFromTokenBalance,
  ]);

  // When modal goes visible, use the treasury associated token or use the default from the appState
  useEffect(() => {
    if (isVisible && associatedToken) {
      const token = tokenList.find(t => t.address === associatedToken);
      if (token) {
        if (!selectedToken || selectedToken.address !== token.address) {
          setSelectedToken(token);
        }
      } else if (!token && (!selectedToken || selectedToken.address !== associatedToken)) {
        setCustomToken(associatedToken);
      }
    }
  }, [
    tokenList,
    selectedToken,
    isVisible,
    associatedToken,
    setCustomToken,
    setSelectedToken,
    toggleOverflowEllipsisMiddle
  ]);

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

  ////////////////
  //   Events   //
  ////////////////

  const triggerWindowResize = () => {
    window.dispatchEvent(new Event('resize'));
  }

  const onAcceptModal = () => {
    const params: TreasuryTopupParams = {
      amount: topupAmount,
      tokenAmount: tokenAmount,
      allocationType: allocationOption,
      associatedToken: selectedToken
        ? selectedToken.address === WRAPPED_SOL_MINT_ADDRESS
          ? NATIVE_SOL_MINT.toBase58()
          : selectedToken.address
        : '',
      streamId: highLightableStreamId && allocationOption === AllocationType.Specific
                ? highLightableStreamId : '',
      treasuryId: selectedStreamingAccountId || ''
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

  // const onStreamSelected = (e: any) => {
  //   consoleOut('selectedStreamForAllocation:', e, 'blue');
  //   setSelectedStreamForAllocation(e);
  //   const stream = getSelectedStream(e);
  //   if (stream && (stream as any).feePayedByTreasurer) {
  //     if (availableBalance && tokenAmount && tokenAmount.eq(availableBalance)) {
  //       setTimeout(() => {
  //         const maxButton = document.getElementById("treasury-add-funds-max");
  //         if (maxButton) {
  //           maxButton.click();
  //         }
  //       }, 100);
  //     }
  //   }
  // }

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
      setTokenAmount(makeInteger(newValue, selectedToken?.decimals || 6));
    }
  };

  // const handleAllocationOptionChange = (val: SelectOption) => {
  //   setAllocationOption(val.value);
  // }

  const onTokenChange = (e: any) => {
    consoleOut("token selected:", e, 'blue');
    const token = getTokenByMintAddress(e);
    if (token) {
      setSelectedToken(token as TokenInfo);
      setEffectiveRate(getTokenPriceBySymbol(token.symbol));
      toggleOverflowEllipsisMiddle(false);
    }
  }

  const onCustomTokenChange = (e: any) => {
    setCustomTokenInput(e.target.value);
  }

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
           selectedToken &&
           availableBalance && availableBalance.toNumber() > 0 &&
           tokenAmount && tokenAmount.toNumber() > 0 &&
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

  ///////////////
  // Rendering //
  ///////////////

  const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    event.currentTarget.src = FALLBACK_COIN_IMAGE;
    event.currentTarget.className = "error";
  };

  const onStreamingAccountSelected = (e: any) => {
    consoleOut('Selected streaming account:', e, 'blue');
    setSelectedStreamingAccountId(e);
    const item = treasuryList?.find(t => t.id === e);
    consoleOut('item:', item, 'blue');
    if (item) {
      setWorkingTreasuryDetails(item);
      setSelectedStreamingAccountId(item.id as string);
      const v1 = item as TreasuryInfo;
      const v2 = item as Treasury;
      const tokenAddress = item.version < 2 ? v1.associatedTokenAddress as string : v2.associatedToken as string;
      const token = getTokenByMintAddress(tokenAddress);
      if (token) {
        consoleOut('Treasury workingAssociatedToken:', token, 'blue');
        setSelectedToken(token);
      } else if (!selectedToken || selectedToken.address !== workingAssociatedToken) {
        setCustomToken(tokenAddress);
      }
      setWorkingAssociatedToken(tokenAddress)
    }
  }

  const renderStream = () => {

    const item = getSelectedStream(highLightableStreamId);
    if (!item) { return null; }

    return (
      <div className={`transaction-list-row no-pointer`}>
        <div className="icon-cell">{getStreamIcon(item)}</div>
        <div className="description-cell">
          <div className="title text-truncate">{getStreamDescription(item)}</div>
          <div className="subtitle text-truncate">{getStreamSubTitle(item)}</div>
        </div>
        <div className="rate-cell">
          <div className="rate-amount">
            {item && item.rateAmount > 0 ? getRateAmountDisplay(item) : getTransferAmountDisplay(item)}
          </div>
          {item && item.rateAmount > 0 && (
            <div className="interval">{getIntervalFromSeconds(item.rateIntervalInSeconds, false, t)}</div>
          )}
        </div>
      </div>
    )
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
            {token ? (
              <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} onError={imageOnErrorHandler} />
            ) : (
              <Identicon address={(isV2Treasury ? v2.associatedToken : v1.associatedTokenAddress)} style={{ width: "30", display: "inline-flex" }} />
            )}
          </>
        ) : (
          <Identicon address={item.id} style={{ width: "30", display: "inline-flex" }} />
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
            <div className="subtitle text-truncate">{shortenAddress(item.id as string, 8)}</div>
          </>
        ) : (
          <div className="title text-truncate">{shortenAddress(item.id as string, 8)}</div>
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
            {formatThousands(isV2Treasury ? v2.totalStreams : v1.streamsAmount)}
          </div>
          <div className="interval">streams</div>
          </>
        )}
      </>
    );
  }

  const renderStreamSelectItem = (item: Treasury | TreasuryInfo) => ({
    key: getStreamingAccountName(item) as string,
    value: item.id as string,
    label: (
      <div className={`transaction-list-row`}>
        <div className="icon-cell">{getStreamingAccountIcon(item)}</div>
        <div className="description-cell">
          {getStreamingAccountDescription(item)}
        </div>
        <div className="rate-cell">
          {getStreamingAccountStreamCount(item)}
        </div>
      </div>
    ),
  });

  const renderStreamingAccountsSelectOptions = () => {
    if (!treasuryList) { return undefined; }
    const options = treasuryList.map((stream: Treasury | TreasuryInfo, index: number) => {
      return renderStreamSelectItem(stream);
    });
    return options;
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
      onCancel={onCloseModal}
      afterClose={onAfterClose}
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
                          <div className="left mr-0">
                            <AutoComplete
                              bordered={false}
                              style={{ width: '100%' }}
                              allowClear={true}
                              dropdownClassName="stream-select-dropdown"
                              options={renderStreamingAccountsSelectOptions()}
                              placeholder={t('treasuries.add-funds.search-streams-placeholder')}
                              onChange={(inputValue, option) => {
                                setSelectedStreamingAccountId(inputValue);
                              }}
                              filterOption={(inputValue, option) => {
                                if (!treasuryList || treasuryList.length === 0) { return false; }
                                const originalItem = treasuryList.find(i => {
                                  const trsryName = i.version < 2
                                    ? (i as TreasuryInfo).label
                                    : (i as Treasury).name;
                                  return trsryName === option?.key ? true : false;
                                });
                                return option?.value.indexOf(inputValue) !== -1 || getStreamingAccountName(originalItem).indexOf(inputValue) !== -1
                              }}
                              onSelect={onStreamingAccountSelected}
                            />
                          </div>
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
                          {(selectedToken && tokenList) && (
                            <Select className="token-selector-dropdown click-disabled" value={selectedToken.address}
                                onChange={onTokenChange} bordered={false} showArrow={false}
                                dropdownRender={menu => (
                                <div>
                                  {menu}
                                  <Divider style={{ margin: '4px 0' }} />
                                  <div style={{ display: 'flex', flexWrap: 'nowrap', padding: 8 }}>
                                    <Input style={{ flex: 'auto' }} value={customTokenInput} onChange={onCustomTokenChange} />
                                    <div style={{ flex: '0 0 auto' }} className="flex-row align-items-center">
                                      <span className="flat-button icon-button ml-1" onClick={() => setCustomToken(customTokenInput)}><IconCheckedBox className="normal"/></span>
                                    </div>
                                  </div>
                                </div>
                              )}>
                              {tokenList.map((option) => {
                                if (option.address === NATIVE_SOL.address) {
                                  return null;
                                }
                                return (
                                  <Option key={option.address} value={option.address}>
                                    <div className="option-container">
                                      <TokenDisplay onClick={() => {}}
                                        mintAddress={option.address}
                                        name={option.name}
                                        showCaretDown={associatedToken ? false : true}
                                      />
                                      <div className="balance">
                                        {userBalances && userBalances[option.address] > 0 && (
                                          <span>{getTokenAmountAndSymbolByTokenAddress(userBalances[option.address], option.address, true)}</span>
                                        )}
                                      </div>
                                    </div>
                                  </Option>
                                );
                              })}
                            </Select>
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
                                  setTopupAmount(cutNumber(makeDecimal(new BN(maxAmount), decimals), decimals));
                                  setTokenAmount(new BN(maxAmount));
                                } else {
                                  const maxAmount = getMaxAmount();
                                  consoleOut('Settings maxAmount to:', maxAmount.toNumber(), 'blue');
                                  setTopupAmount(cutNumber(makeDecimal(new BN(maxAmount), decimals), decimals));
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
                              ? getTokenAmountAndSymbolByTokenAddress(
                                  makeDecimal(availableBalance, selectedToken.decimals),
                                  selectedToken?.address,
                                  true
                                )
                              : "0"
                          }`}
                        </span>
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
                </div>

                {allocationOption === AllocationType.Specific && (
                  <div className="mb-3">
                    <div className="form-label">{t('treasuries.add-funds.money-stream-to-topup-label')}</div>
                    <div className="well">
                      {renderStream()}
                    </div>
                  </div>
                )}

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
                    disabled={!isStreamingAccountSelected() || !isTopupFormValid()}
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
            <div className={`text-center mt-4 mb-2`}>
              <p>You can also fund this streaming account by sending {selectedToken?.symbol} tokens to:</p>

              {showQrCode && workingTreasuryDetails && (
                <>
                  <div className={theme === 'light' ? 'qr-container bg-white' : 'qr-container bg-black'}>
                    <QRCodeSVG
                      value={workingTreasuryDetails.id as string}
                      size={200}
                    />
                  </div>
                </>
              )}

              {workingTreasuryDetails && (
                <div className="flex-center font-size-70 mb-2">
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
