import React, { useCallback, useEffect } from 'react';
import { useContext, useState } from 'react';
import { Modal, Button, Select, Dropdown, Menu, DatePicker, Checkbox, Divider } from 'antd';
import { AppStateContext } from '../../contexts/appstate';
import {
  cutNumber,
  formatAmount,
  getAmountWithSymbol,
  getTokenAmountAndSymbolByTokenAddress,
  getTxIxResume,
  isValidNumber,
  makeDecimal,
  makeInteger,
  shortenAddress,
  toTokenAmount
} from '../../utils/utils';
import { useTranslation } from 'react-i18next';
import { TokenInfo } from '@solana/spl-token-registry';
import {
  consoleOut,
  disabledDate,
  getIntervalFromSeconds,
  getPaymentRateOptionLabel,
  getRateIntervalInSeconds,
  getTransactionStatusForLogs,
  isToday,
  isValidAddress,
  PaymentRateTypeOption,
} from '../../utils/ui';
import { getTokenByMintAddress } from '../../utils/tokens';
import { LoadingOutlined } from '@ant-design/icons';
import { TokenDisplay } from '../TokenDisplay';
import { IconCaretDown, IconEdit } from '../../Icons';
import { OperationType, PaymentRateType, TransactionStatus } from '../../models/enums';
import moment from "moment";
import { useWallet } from '../../contexts/wallet';
import { StepSelector } from '../StepSelector';
import { DATEPICKER_FORMAT } from '../../constants';
import { Identicon } from '../Identicon';
import { MEAN_MULTISIG, NATIVE_SOL_MINT } from '../../utils/ids';
import { TransactionStatusContext } from '../../contexts/transaction-status';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { customLogger } from '../..';
import { Constants, MSP, TransactionFees, Treasury } from '@mean-dao/msp';
import { TreasuryInfo } from '@mean-dao/money-streaming';
import { useConnectionConfig } from '../../contexts/connection';
import { Idl, Program } from '@project-serum/anchor';
import { BN } from 'bn.js';

const { Option } = Select;

export const TreasuryStreamCreateModal = (props: {
  associatedToken: string;
  connection: Connection;
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  nativeBalance: number;
  transactionFees: TransactionFees;
  withdrawTransactionFees: TransactionFees;
  treasuryDetails: Treasury | TreasuryInfo | undefined;
  isMultisigTreasury: boolean;
  multisigClient: Program<Idl>;
  multisigAddress: PublicKey;
  userBalances: any;
}) => {
  const { t } = useTranslation('common');
  const { wallet, publicKey } = useWallet();
  const { endpoint } = useConnectionConfig();
  const {
    tokenList,
    coinPrices,
    selectedToken,
    effectiveRate,
    recipientAddress,
    loadingPrices,
    recipientNote,
    isWhitelisted,
    paymentStartDate,
    fromCoinAmount,
    paymentRateAmount,
    paymentRateFrequency,
    transactionStatus,
    isVerifiedRecipient,
    streamV2ProgramAddress,
    refreshPrices,
    setSelectedToken,
    setEffectiveRate,
    setRecipientNote,
    setFromCoinAmount,
    setRecipientAddress,
    setPaymentStartDate,
    setPaymentRateAmount,
    setTransactionStatus,
    setIsVerifiedRecipient,
    setPaymentRateFrequency,
  } = useContext(AppStateContext);
  const {
    clearTransactionStatusContext,
    startFetchTxSignatureInfo,
  } = useContext(TransactionStatusContext);
  const [currentStep, setCurrentStep] = useState(0);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [unallocatedBalance, setUnallocatedBalance] = useState<any>(0);
  const [isFeePaidByTreasurer, setIsFeePaidByTreasurer] = useState(false);
  const [tokenAmount, setTokenAmount] = useState<any>(0);
  const [maxAllocatableAmount, setMaxAllocatableAmount] = useState<any>(undefined);

  const isNewTreasury = useCallback(() => {
    if (props.treasuryDetails) {
      const v2 = props.treasuryDetails as Treasury;
      return v2.version >= 2 ? true : false;
    }

    return false;
  }, [props.treasuryDetails]);

  const getMaxAmount = useCallback((preSetting = false) => {
    if ((isFeePaidByTreasurer || preSetting) && props.withdrawTransactionFees) {
      const BASE_100_TO_BASE_1_MULTIPLIER = 10_000;
      const feeNumerator = props.withdrawTransactionFees.mspPercentFee * BASE_100_TO_BASE_1_MULTIPLIER;
      const feeDenaminator = 1000000;
      const badStreamMaxAllocation = unallocatedBalance
        .muln(feeDenaminator)
        .divn(feeNumerator + feeDenaminator);

      const feeAmount = badStreamMaxAllocation
        .muln(feeNumerator)
        .divn(feeDenaminator);

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
        console.table(debugTable);
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
    unallocatedBalance,
    isFeePaidByTreasurer,
    props.withdrawTransactionFees,
  ]);

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

  // Set max amount allocatable to a stream in BN the first time
  useEffect(() => {
    if (props.isVisible && props.treasuryDetails && props.withdrawTransactionFees && !isFeePaidByTreasurer) {
      getMaxAmount();
    }
  }, [
    props.isVisible,
    isFeePaidByTreasurer,
    props.treasuryDetails,
    props.withdrawTransactionFees,
    getMaxAmount
  ]);

  /////////////////
  //   Getters   //
  /////////////////

  const getPricePerToken = (token: TokenInfo): number => {
    const tokenSymbol = token.symbol.toUpperCase();
    const symbol = tokenSymbol[0] === 'W' ? tokenSymbol.slice(1) : tokenSymbol;

    return coinPrices && coinPrices[symbol]
      ? coinPrices[symbol]
      : 0;
  }

  const getOptionsFromEnum = (value: any): PaymentRateTypeOption[] => {
    let index = 0;
    const options: PaymentRateTypeOption[] = [];
    for (const enumMember in value) {
        const mappedValue = parseInt(enumMember, 10);
        if (!isNaN(mappedValue)) {
            const item = new PaymentRateTypeOption(
                index,
                mappedValue,
                getPaymentRateOptionLabel(mappedValue, t)
            );
            options.push(item);
        }
        index++;
    }
    return options;
  }

  const getStepOneContinueButtonLabel = (): string => {
    return !publicKey
      ? t('transactions.validation.not-connected')
      : !recipientAddress || isAddressOwnAccount()
        ? t('transactions.validation.select-recipient')
        : !selectedToken || unallocatedBalance === 0
          ? t('transactions.validation.no-balance')
          : !paymentStartDate
            ? t('transactions.validation.no-valid-date')
            : !recipientNote
              ? 'Memo cannot be empty'
              : !arePaymentSettingsValid()
                ? getPaymentSettingsButtonLabel()
                : t('transactions.validation.valid-continue');
  }

  const getTransactionStartButtonLabel = (): string => {
    return !publicKey
      ? t('transactions.validation.not-connected')
      : !recipientAddress || isAddressOwnAccount()
      ? t('transactions.validation.select-recipient')
      : !selectedToken || unallocatedBalance === 0
      ? t('transactions.validation.no-balance')
      : tokenAmount === 0
      ? t('transactions.validation.no-amount')
      : (isFeePaidByTreasurer && tokenAmount.gt(maxAllocatableAmount)) ||
        (!isFeePaidByTreasurer && tokenAmount.gt(unallocatedBalance))
      ? t('transactions.validation.amount-high')
      : !paymentStartDate
      ? t('transactions.validation.no-valid-date')
      : !recipientNote
      ? 'Memo cannot be empty'
      : !arePaymentSettingsValid()
      ? getPaymentSettingsButtonLabel()
      : !isVerifiedRecipient
      ? t('transactions.validation.verified-recipient-unchecked')
      : t('transactions.validation.valid-approve');
  }

  const getPaymentSettingsButtonLabel = (): string => {
    const rateAmount = parseFloat(paymentRateAmount || '0');
    return !rateAmount
      ? t('transactions.validation.no-payment-rate')
      : '';
  }

  const toggleOverflowEllipsisMiddle = useCallback((state: boolean) => {
    const ellipsisElements = document.querySelectorAll(".ant-select.token-selector-dropdown .ant-select-selector .ant-select-selection-item");
    if (ellipsisElements && ellipsisElements.length) {
      console.log('ellipsisElements:', ellipsisElements);

      ellipsisElements.forEach(element => {
        if (state) {
          if (!element.classList.contains('overflow-ellipsis-middle')) {
            element.classList.add('overflow-ellipsis-middle');
          }
        } else {
          if (element.classList.contains('overflow-ellipsis-middle')) {
            element.classList.remove('overflow-ellipsis-middle');
          }
        }
      });

      setTimeout(() => {
        triggerWindowResize();
      }, 10);
    }
  }, []);

  const setCustomToken = useCallback((address: string) => {
    const unkToken: TokenInfo = {
      address: address,
      name: 'Unknown',
      chainId: 101,
      decimals: 6,
      symbol: shortenAddress(address),
    };
    setSelectedToken(unkToken);
    consoleOut("token selected:", unkToken, 'blue');
    setEffectiveRate(0);
    toggleOverflowEllipsisMiddle(true);
  }, [
    setEffectiveRate,
    setSelectedToken,
    toggleOverflowEllipsisMiddle
  ]);

  /////////////////////
  // Data management //
  /////////////////////

  // When modal goes visible, use the treasury associated token or use the default from the appState
  useEffect(() => {
    if (props.isVisible && props.associatedToken) {
      const token = tokenList.find(t => t.address === props.associatedToken);
      if (token) {
        if (!selectedToken || selectedToken.address !== token.address) {
          setSelectedToken(token);
        }
      } else if (!token && (!selectedToken || selectedToken.address !== props.associatedToken)) {
        setCustomToken(props.associatedToken);
      }
    }
  }, [
    tokenList,
    selectedToken,
    props.isVisible,
    props.associatedToken,
    setCustomToken,
    setSelectedToken
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

  const onStepperChange = (value: number) => {
    setCurrentStep(value);
  }

  const onContinueButtonClick = () => {
    setCurrentStep(1);  // Go to step 2
  }

  const handleRecipientNoteChange = (e: any) => {
    setRecipientNote(e.target.value);
  }

  const handleRecipientAddressChange = (e: any) => {
    const inputValue = e.target.value as string;
    // Set the input value
    const trimmedValue = inputValue.trim();
    setRecipientAddress(trimmedValue);
  }

  const handleRecipientAddressFocusIn = () => {
    setTimeout(() => {
      triggerWindowResize();
    }, 10);
  }

  const handleRecipientAddressFocusOut = () => {
    setTimeout(() => {
      triggerWindowResize();
    }, 10);
  }

  const handlePaymentRateAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setPaymentRateAmount("");
    } else if (newValue === '.') {
      setPaymentRateAmount(".");
    } else if (isValidNumber(newValue)) {
      setPaymentRateAmount(newValue);
    }
  };

  const handlePaymentRateOptionChange = (val: PaymentRateType) => {
    setPaymentRateFrequency(val);
  }

  const onTokenChange = (e: any) => {
    consoleOut("token selected:", e, 'blue');
    const token = getTokenByMintAddress(e);
    if (token) {
      setSelectedToken(token as TokenInfo);
      setEffectiveRate(getPricePerToken(token as TokenInfo));
    }
  }

  const handleFromCoinAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setFromCoinAmount("");
      setTokenAmount(0);
    } else if (newValue === '.') {
      setFromCoinAmount(".");
    } else if (isValidNumber(newValue)) {
      setFromCoinAmount(newValue);
      setTokenAmount(makeInteger(newValue, selectedToken?.decimals || 6));
    }
  };

  const handleDateChange = (date: string) => {
    setPaymentStartDate(date);
  }

  const onFeePayedByTreasurerChange = (e: any) => {

    consoleOut('onFeePayedByTreasurerChange:', e.target.checked, 'blue');

    if (e.target.checked && tokenAmount) {
      const maxAmount = getMaxAmount(true);
      consoleOut('tokenAmount:', tokenAmount.toNumber(), 'blue');
      consoleOut('maxAmount:', maxAmount.toNumber(), 'blue');
      if (tokenAmount.gt(maxAmount)) {
        const decimals = selectedToken ? selectedToken.decimals : 6;
        setFromCoinAmount(cutNumber(makeDecimal(new BN(maxAmount), decimals), decimals));
        setTokenAmount(new BN(maxAmount));
      }
    }

    setIsFeePaidByTreasurer(e.target.checked);
  }

  const onIsVerifiedRecipientChange = (e: any) => {
    setIsVerifiedRecipient(e.target.checked);
  }

  // const onAllocationReservedChanged = (e: any) => {
  //   setIsAllocationReserved(e.target.value);
  // }

  const onTransactionStart = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createStream = async (data: any) => {

      consoleOut('Starting withdraw using MSP V2...', '', 'blue');
      const msp = new MSP(endpoint, streamV2ProgramAddress, "finalized");

      if (!props.isMultisigTreasury) {
        return await msp.createStream(
          new PublicKey(data.payer),                                          // initializer
          new PublicKey(data.treasurer),                                      // treasurer
          new PublicKey(data.treasury),                                       // treasury
          new PublicKey(data.beneficiary),                                    // beneficiary
          new PublicKey(data.associatedToken),                                // associatedToken
          data.streamName,                                                    // streamName
          data.allocationAssigned,                                            // allocationAssigned
          data.rateAmount,                                                    // rateAmount
          data.rateIntervalInSeconds,                                         // rateIntervalInSeconds
          data.startUtc,                                                      // startUtc
          data.cliffVestAmount,                                               // cliffVestAmount
          data.cliffVestPercent,                                              // cliffVestPercent
          data.feePayedByTreasurer                                            // feePayedByTreasurer
        );
      }

      if (!props.treasuryDetails || !props.multisigClient || !props.multisigAddress || !publicKey) { return null; }

      let multisigSigner = (await PublicKey.findProgramAddress(
        [props.multisigAddress.toBuffer()],
        MEAN_MULTISIG
      ))[0];

      let createStream = await msp.createStream(
        publicKey,                                                            // payer
        multisigSigner,                                                       // treasurer
        new PublicKey(data.treasury),                                         // treasury
        new PublicKey(data.beneficiary),                                      // beneficiary
        new PublicKey(data.associatedToken),                                  // associatedToken
        data.streamName,                                                      // streamName
        data.allocationAssigned,                                              // allocationAssigned
        data.rateAmount,                                                      // rateAmount
        data.rateIntervalInSeconds,                                           // rateIntervalInSeconds
        data.startUtc,                                                        // startUtc
        data.cliffVestAmount,                                                 // cliffVestAmount
        data.cliffVestPercent,                                                // cliffVestPercent
        data.feePayedByTreasurer                                              // feePayedByTreasurer
      );

      const ixData = Buffer.from(createStream.instructions[0].data);
      const ixAccounts = createStream.instructions[0].keys;
      const transaction = Keypair.generate();
      const txSize = 1000;
      const txSigners = [transaction];
      const createIx = await props.multisigClient.account.transaction.createInstruction(
        transaction,
        txSize
      );

      let tx = props.multisigClient.transaction.createTransaction(
        Constants.MSP, 
        OperationType.StreamCreate,
        ixAccounts as any,
        ixData as any,
        {
          accounts: {
            multisig: props.multisigAddress,
            transaction: transaction.publicKey,
            proposer: publicKey as PublicKey,
          },
          preInstructions: [createIx],
          signers: txSigners,
        }
      );

      tx.feePayer = publicKey;
      let { blockhash } = await props.multisigClient.provider.connection.getRecentBlockhash("finalized");
      tx.recentBlockhash = blockhash;
      tx.partialSign(...txSigners);

      return tx;
    }

    const createTx = async (): Promise<boolean> => {

      if (!publicKey || !props.treasuryDetails || !selectedToken) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('CreateStream for a treasury transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut('Wallet address:', publicKey.toBase58());

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      const beneficiary = new PublicKey(recipientAddress as string);
      const associatedToken = new PublicKey(selectedToken?.address as string);
      const treasury = new PublicKey(props.treasuryDetails.id as string);
      const amount = tokenAmount;
      const rateAmount = toTokenAmount(parseFloat(paymentRateAmount as string), selectedToken.decimals);
      const now = new Date();
      const parsedDate = Date.parse(paymentStartDate as string);
      const startUtc = new Date(parsedDate);
      startUtc.setHours(now.getHours());
      startUtc.setMinutes(now.getMinutes());
      startUtc.setSeconds(now.getSeconds());
      startUtc.setMilliseconds(now.getMilliseconds());

      consoleOut('fromParsedDate.toString()', startUtc.toString(), 'crimson');
      consoleOut('fromParsedDate.toLocaleString()', startUtc.toLocaleString(), 'crimson');
      consoleOut('fromParsedDate.toISOString()', startUtc.toISOString(), 'crimson');
      consoleOut('fromParsedDate.toUTCString()', startUtc.toUTCString(), 'crimson');

      // Create a transaction
      const data = {
        payer: publicKey.toBase58(),                                                // initializer
        treasurer: publicKey.toBase58(),                                            // treasurer
        treasury: treasury.toBase58(),                                              // treasury
        beneficiary: beneficiary.toBase58(),                                        // beneficiary
        associatedToken: associatedToken.toBase58(),                                // associatedToken
        streamName: recipientNote ? recipientNote.trim() : undefined,               // streamName
        allocationAssigned: amount,                                                 // allocationAssigned
        rateAmount: rateAmount,                                                     // rateAmount
        rateIntervalInSeconds: getRateIntervalInSeconds(paymentRateFrequency),      // rateIntervalInSeconds
        startUtc: startUtc,                                                         // startUtc
        cliffVestAmount: undefined,                                                 // cliffVestAmount
        cliffVestPercent: undefined,                                                // cliffVestPercent
        feePayedByTreasurer: isFeePaidByTreasurer                                   // feePayedByTreasurer
      };

      consoleOut('data:', data);

      /**
       * payer: PublicKey,
       * treasurer: PublicKey,
       * treasury: PublicKey | undefined,
       * beneficiary: PublicKey,
       * associatedToken: PublicKey,
       * streamName: string,
       * allocationAssigned: number,
       * rateAmount?: number | undefined,
       * rateIntervalInSeconds?: number | undefined,
       * startUtc?: Date | undefined,
       * cliffVestAmount?: number | undefined,
       * cliffVestPercent?: number | undefined,
       * feePayedByTreasurer?: boolean | undefined
       */

      // Log input data
      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
        inputs: data
      });

      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
        result: ''
      });

      // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
      // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
      consoleOut('blockchainFee:', props.transactionFees.blockchainFee + props.transactionFees.mspFlatFee, 'blue');
      consoleOut('nativeBalance:', props.nativeBalance, 'blue');

      if (props.nativeBalance < props.transactionFees.blockchainFee + props.transactionFees.mspFlatFee) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${
            getTokenAmountAndSymbolByTokenAddress(props.nativeBalance, NATIVE_SOL_MINT.toBase58())
          }) to pay for network fees (${
            getTokenAmountAndSymbolByTokenAddress(props.transactionFees.blockchainFee + props.transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
          })`
        });
        customLogger.logWarning('CreateStream for a treasury transaction failed', { transcript: transactionLog });
        return false;
      }

      let result = await createStream(data)
        .then(value => {
          if (!value) { return false; }
          consoleOut('createStream returned transaction:', value);
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
            result: getTxIxResume(value)
          });
          transaction = value;
          return true;
        })
        .catch(error => {
          console.error('createStream error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('CreateStream for a treasury transaction failed', { transcript: transactionLog });
          return false;
        });

      return result;
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
        consoleOut('Signing transaction...');
        return await wallet.signTransaction(transaction)
        .then((signed: Transaction) => {
          consoleOut('signTransaction returned a signed transaction:', signed);
          signedTransaction = signed;
          // Try signature verification by serializing the transaction
          try {
            encodedTx = signedTransaction.serialize().toString('base64');
            consoleOut('encodedTx:', encodedTx, 'orange');
          } catch (error) {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SignTransaction,
              currentOperation: TransactionStatus.SignTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
              result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logError('CreateStream for a treasury transaction failed', { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: wallet.publicKey.toBase58()}
          });
          return true;
        })
        .catch(error => {
          console.error(error);
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logError('CreateStream for a treasury transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        console.error('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot sign transaction! Wallet not found!'
        });
        customLogger.logError('CreateStream for a treasury transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      if (wallet) {
        return await props.connection
          .sendEncodedTransaction(encodedTx)
          .then(sig => {
            consoleOut('sendEncodedTransaction returned a signature:', sig);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction
            });
            signature = sig;
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionSuccess),
              result: `signature: ${signature}`
            });
            return true;
          })
          .catch(error => {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
              result: { error, encodedTx }
            });
            customLogger.logError('CreateStream for a treasury transaction failed', { transcript: transactionLog });
            return false;
          });
      } else {
        console.error('Cannot send transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot send transaction! Wallet not found!'
        });
        customLogger.logError('CreateStream for a treasury transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet) {
      const create = await createTx();
      consoleOut('created:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('signed:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            startFetchTxSignatureInfo(signature, "finalized", OperationType.TreasuryStreamCreate);
            setIsBusy(false);
            props.handleOk();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  };

  //////////////////
  //  Validation  //
  //////////////////

  const isMemoValid = (): boolean => {
    return recipientNote && recipientNote.length <= 32
      ? true
      : false;
  }

  const isAddressOwnAccount = (): boolean => {
    return recipientAddress && publicKey && recipientAddress === publicKey.toBase58()
           ? true : false;
  }

  const isSendAmountValid = (): boolean => {
    return publicKey &&
           selectedToken &&
           tokenAmount > 0 &&
           ((isFeePaidByTreasurer && tokenAmount.lte(maxAllocatableAmount)) ||
            (!isFeePaidByTreasurer && tokenAmount.lte(unallocatedBalance)))
    ? true
    : false;
  }

  const isRateAmountValid = (): boolean => {
    return paymentRateAmount && parseFloat(paymentRateAmount) > 0
     ? true
     : false;
  }

  const areSendAmountSettingsValid = (): boolean => {
    return isSendAmountValid() && paymentStartDate ? true : false;
  }

  const arePaymentSettingsValid = (): boolean => {
    if (!paymentStartDate) {
      return false;
    }

    return isRateAmountValid();
  }

  ///////////////
  // Rendering //
  ///////////////

  const paymentRateOptionsMenu = (
    <Menu>
      {getOptionsFromEnum(PaymentRateType).map((item) => {
        return (
          <Menu.Item
            key={item.key}
            onClick={() => handlePaymentRateOptionChange(item.value)}>
            {item.text}
          </Menu.Item>
        );
      })}
    </Menu>
  );

  return (
    <Modal
      className="mean-modal"
      title={<div className="modal-title">{t('treasuries.treasury-streams.add-stream-modal-title')}</div>}
      footer={null}
      visible={props.isVisible}
      onOk={props.handleOk}
      onCancel={props.handleClose}
      width={480}>

      <div className="scrollable-content">
        <StepSelector step={currentStep} steps={2} onValueSelected={onStepperChange} />

        <div className={currentStep === 0 ? "contract-wrapper panel1 show" : "contract-wrapper panel1 hide"}>
          <div className="form-label">{t('transactions.recipient.label')}</div>
          <div className="well">
            <div className="flex-fixed-right">
              <div className="left position-relative">
                <span className="recipient-field-wrapper">
                  <input id="payment-recipient-field"
                    className="general-text-input"
                    autoComplete="on"
                    autoCorrect="off"
                    type="text"
                    onFocus={handleRecipientAddressFocusIn}
                    onChange={handleRecipientAddressChange}
                    onBlur={handleRecipientAddressFocusOut}
                    placeholder={t('transactions.recipient.placeholder')}
                    required={true}
                    spellCheck="false"
                    value={recipientAddress}/>
                  <span id="payment-recipient-static-field"
                        className={`${recipientAddress ? 'overflow-ellipsis-middle' : 'placeholder-text'}`}>
                    {recipientAddress || t('transactions.recipient.placeholder')}
                  </span>
                </span>
              </div>
            </div>
            {
              recipientAddress && !isValidAddress(recipientAddress) ? (
                <span className="form-field-error">
                  {t('transactions.validation.address-validation')}
                </span>
              ) : isAddressOwnAccount() ? (
                <span className="form-field-error">
                  {t('transactions.recipient.recipient-is-own-account')}
                </span>
              ) : (null)
            }
          </div>

          <div className="form-label">{t('transactions.rate-and-frequency.amount-label')}</div>
          <div className="well">
            <div className="flex-fixed-left">
              <div className="left">
                <span className="add-on">
                  {(selectedToken && tokenList) && (
                    <Select className={`token-selector-dropdown ${props.associatedToken ? 'click-disabled' : ''}`} value={selectedToken.address}
                            onChange={onTokenChange} bordered={false} showArrow={false}>
                      {tokenList.map((option) => {
                        return (
                          <Option key={option.address} value={option.address}>
                            <div className="option-container">
                              <TokenDisplay onClick={() => {}}
                                mintAddress={option.address}
                                name={option.name}
                                showCaretDown={props.associatedToken ? false : true}
                              />
                              <div className="balance">
                                {props.userBalances && props.userBalances[option.address] > 0 && (
                                  <span>{getTokenAmountAndSymbolByTokenAddress(props.userBalances[option.address], option.address, true)}</span>
                                )}
                              </div>
                            </div>
                          </Option>
                        );
                      })}
                    </Select>
                  )}
                </span>
              </div>
              <div className="right">
                <input
                  className="general-text-input text-right"
                  inputMode="decimal"
                  autoComplete="off"
                  autoCorrect="off"
                  type="text"
                  onChange={handlePaymentRateAmountChange}
                  pattern="^[0-9]*[.,]?[0-9]*$"
                  placeholder="0.0"
                  minLength={1}
                  maxLength={79}
                  spellCheck="false"
                  value={paymentRateAmount}
                />
              </div>
            </div>
            <div className="flex-fixed-right">
              <div className="left inner-label">
                <span>{t('treasuries.treasury-streams.available-unallocated-balance-label')}:</span>
                <span>
                  {`${unallocatedBalance && selectedToken
                      ? getAmountWithSymbol(
                          makeDecimal(new BN(unallocatedBalance), selectedToken.decimals),
                          selectedToken.address,
                          true
                        )
                      : "0"
                  }`}
                </span>
              </div>
              <div className="right inner-label">
                <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
                  ~${paymentRateAmount && effectiveRate
                    ? formatAmount(parseFloat(paymentRateAmount) * effectiveRate, 2)
                    : "0.00"}
                </span>
              </div>
            </div>
          </div>

          <div className="form-label">{t('transactions.rate-and-frequency.rate-label')}</div>
          <div className="well">
            <Dropdown
              overlay={paymentRateOptionsMenu}
              trigger={["click"]}>
              <span className="dropdown-trigger no-decoration flex-fixed-right align-items-center">
                <div className="left">
                  <span className="capitalize-first-letter">{getPaymentRateOptionLabel(paymentRateFrequency, t)}{" "}</span>
                </div>
                <div className="right">
                  <IconCaretDown className="mean-svg-icons" />
                </div>
              </span>
            </Dropdown>
          </div>

          <div className="form-label">{t('transactions.send-date.label')}</div>
          <div className="well">
            <div className="flex-fixed-right">
              <div className="left static-data-field">
                {isToday(paymentStartDate || '')
                  ? `${paymentStartDate} (${t('common:general.now')})`
                  : `${paymentStartDate}`}
              </div>
              <div className="right">
                <div className="add-on simplelink">
                  <DatePicker
                    size="middle"
                    bordered={false}
                    className="addon-date-picker"
                    aria-required={true}
                    allowClear={false}
                    disabledDate={disabledDate}
                    placeholder={t('transactions.send-date.placeholder')}
                    onChange={(value, date) => handleDateChange(date)}
                    value={moment(
                      paymentStartDate,
                      DATEPICKER_FORMAT
                    )}
                    format={DATEPICKER_FORMAT}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="form-label">{t('transactions.memo2.label')}</div>
          <div className="well m-0">
            <div className="flex-fixed-right">
              <div className="left">
                <input
                  id="payment-memo-field"
                  className="w-100 general-text-input"
                  autoComplete="on"
                  autoCorrect="off"
                  type="text"
                  maxLength={32}
                  onChange={handleRecipientNoteChange}
                  placeholder={t('transactions.memo2.placeholder')}
                  spellCheck="false"
                  value={recipientNote}
                />
              </div>
            </div>
          </div>
        </div>

        <div className={currentStep === 1 ? "contract-wrapper panel2 show" : "contract-wrapper panel2 hide"}>

          {publicKey && recipientAddress && (
            <>
              <div className="flex-fixed-right">
                <div className="left">
                  <div className="form-label">{t('transactions.resume')}</div>
                </div>
                <div className="right">
                  <span className="flat-button change-button" onClick={() => setCurrentStep(0)}>
                    <IconEdit className="mean-svg-icons" />
                    <span>{t('general.cta-change')}</span>
                  </span>
                </div>
              </div>
              <div className="well">
                <div className="three-col-flexible-middle">
                  <div className="left flex-row">
                    <div className="flex-center">
                      <Identicon
                        address={isValidAddress(recipientAddress) ? recipientAddress : NATIVE_SOL_MINT.toBase58()}
                        style={{ width: "30", display: "inline-flex" }} />
                    </div>
                    <div className="flex-column pl-3">
                      <div className="address">
                        {publicKey && isValidAddress(recipientAddress)
                          ? shortenAddress(recipientAddress)
                          : t('transactions.validation.no-recipient')}
                      </div>
                      <div className="inner-label mt-0">{recipientNote || '-'}</div>
                    </div>
                  </div>
                  <div className="middle flex-center">
                    <div className="vertical-bar"></div>
                  </div>
                  <div className="right flex-column">
                    <div className="rate">
                      {selectedToken
                        ? getTokenAmountAndSymbolByTokenAddress(parseFloat(paymentRateAmount), selectedToken.address)
                        : '-'
                      }
                      {getIntervalFromSeconds(getRateIntervalInSeconds(paymentRateFrequency), true, t)}
                    </div>
                    <div className="inner-label mt-0">{paymentStartDate}</div>
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="mb-3 text-center">
            <div>{t('treasuries.treasury-streams.minimum-allocation-advice')}</div>
          </div>

          <div className="form-label">{t('treasuries.treasury-streams.allocate-funds-label')}</div>
          <div className="well">
            <div className="flex-fixed-left">
              <div className="left">
                <span className="add-on">
                  {(selectedToken && tokenList) && (
                    <Select className={`token-selector-dropdown ${props.associatedToken ? 'click-disabled' : ''}`} value={selectedToken.address}
                            onChange={onTokenChange} bordered={false} showArrow={false}>
                      {tokenList.map((option) => {
                        return (
                          <Option key={option.address} value={option.address}>
                            <div className="option-container">
                              <TokenDisplay onClick={() => {}}
                                mintAddress={option.address}
                                name={option.name}
                                showCaretDown={props.associatedToken ? false : true}
                              />
                              <div className="balance">
                                {props.userBalances && props.userBalances[option.address] > 0 && (
                                  <span>{getTokenAmountAndSymbolByTokenAddress(props.userBalances[option.address], option.address, true)}</span>
                                )}
                              </div>
                            </div>
                          </Option>
                        );
                      })}
                    </Select>
                  )}
                  {selectedToken && unallocatedBalance ? (
                    <div
                      className="token-max simplelink"
                      onClick={() => {
                        const decimals = selectedToken ? selectedToken.decimals : 6;
                        if (isFeePaidByTreasurer) {
                          const maxAmount = getMaxAmount(true);
                          consoleOut('tokenAmount:', tokenAmount.toNumber(), 'blue');
                          consoleOut('maxAmount:', maxAmount.toNumber(), 'blue');
                          setFromCoinAmount(cutNumber(makeDecimal(new BN(maxAmount), decimals), decimals));
                          setTokenAmount(new BN(maxAmount));
                        } else {
                          const maxAmount = getMaxAmount();
                          setFromCoinAmount(cutNumber(makeDecimal(new BN(maxAmount), decimals), decimals));
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
                  className="general-text-input text-right"
                  inputMode="decimal"
                  autoComplete="off"
                  autoCorrect="off"
                  type="text"
                  onChange={handleFromCoinAmountChange}
                  pattern="^[0-9]*[.,]?[0-9]*$"
                  placeholder="0.0"
                  minLength={1}
                  maxLength={79}
                  spellCheck="false"
                  value={fromCoinAmount}
                />
              </div>
            </div>
            <div className="flex-fixed-right">
              <div className="left inner-label">
                <span>{t('treasuries.treasury-streams.available-unallocated-balance-label')}:</span>
                <span>
                  {`${unallocatedBalance && selectedToken
                      ? getAmountWithSymbol(
                          makeDecimal(new BN(unallocatedBalance), selectedToken.decimals),
                          selectedToken.address,
                          true
                        )
                      : "0"
                  }`}
                </span>
              </div>
              <div className="right inner-label">
                <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
                  ~${fromCoinAmount && effectiveRate
                    ? formatAmount(parseFloat(fromCoinAmount) * effectiveRate, 2)
                    : "0.00"}
                </span>
              </div>
            </div>
          </div>

          {/* {treasuryOption && treasuryOption.type === TreasuryType.Lock && (
            <div className="mb-2 flex-fixed-right">
              <div className="left form-label flex-row align-items-center">
                {t('treasuries.treasury-streams.allocation-reserved-label')}
                <a className="simplelink" href="https://docs.meanfi.com/platform/specifications/money-streaming-protocol#treasuries-and-streams"
                    target="_blank" rel="noopener noreferrer">
                  <Button
                    className="info-icon-button"
                    type="default"
                    shape="circle">
                    <InfoCircleOutlined />
                  </Button>
                </a>
              </div>
              <div className="right">
                <Radio.Group onChange={onAllocationReservedChanged} value={isAllocationReserved}>
                  <Radio value={true}>{t('general.yes')}</Radio>
                  <Radio value={false}>{t('general.no')}</Radio>
                </Radio.Group>
              </div>
            </div>
          )} */}

          <div className="ml-1 mb-3">
            <Checkbox checked={isFeePaidByTreasurer} onChange={onFeePayedByTreasurerChange}>{t('treasuries.treasury-streams.fee-payed-by-treasurer')}</Checkbox>
          </div>

          <div className="ml-1">
            <Checkbox checked={isVerifiedRecipient} onChange={onIsVerifiedRecipientChange}>{t('transactions.verified-recipient-label')}</Checkbox>
          </div>

        </div>
      </div>

      <Divider plain/>

      <div className={currentStep === 0 ? "contract-wrapper panel1 show" : "contract-wrapper panel1 hide"}>
        <Button
            className="main-cta"
            block
            type="primary"
            shape="round"
            size="large"
            onClick={onContinueButtonClick}
            disabled={!publicKey ||
              !isMemoValid() ||
              !isValidAddress(recipientAddress) ||
              isAddressOwnAccount() ||
              !arePaymentSettingsValid()}>
            {getStepOneContinueButtonLabel()}
          </Button>
      </div>
      <div className={currentStep === 1 ? "contract-wrapper panel2 show" : "contract-wrapper panel2 hide"}>
        <Button
          className={`main-cta ${isBusy ? 'inactive' : ''}`}
          block
          type="primary"
          shape="round"
          size="large"
          onClick={onTransactionStart}
          disabled={!publicKey ||
            !isMemoValid() ||
            !isValidAddress(recipientAddress) ||
            isAddressOwnAccount() ||
            !arePaymentSettingsValid() ||
            !areSendAmountSettingsValid() ||
            !isVerifiedRecipient}>
          {isBusy && (
            <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
          )}
          {isBusy
            ? t('treasuries.treasury-streams.create-stream-main-cta-busy')
            : getTransactionStartButtonLabel()}
        </Button>
      </div>

    </Modal>
  );
};
