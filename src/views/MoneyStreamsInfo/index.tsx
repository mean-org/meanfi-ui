import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import {
  DEFAULT_EXPIRATION_TIME_SECONDS,
  MULTISIG_ACTIONS,
  type MultisigInfo,
  type MultisigTransactionFees,
  getFees,
} from '@mean-dao/mean-multisig-sdk';
import { STREAM_STATE, type StreamInfo, type TreasuryInfo } from '@mean-dao/money-streaming/lib/types';
import {
  ACTION_CODES,
  AccountType,
  type AddFundsToAccountTransactionAccounts,
  type AllocateFundsToStreamTransactionAccounts,
  Category,
  type CreateAccountTransactionAccounts,
  NATIVE_SOL_MINT,
  type PaymentStreamingAccount,
  STREAM_STATUS_CODE,
  type Stream,
  type TransactionFees,
  calculateFeesForAction,
} from '@mean-dao/payment-streaming';
import { BN } from '@project-serum/anchor';
import { LAMPORTS_PER_SOL, PublicKey, type Transaction, type VersionedTransaction } from '@solana/web3.js';
import { Button, Col, Dropdown, Row, Space, Spin, Tabs } from 'antd';
import type { ItemType, MenuItemType } from 'antd/lib/menu/interface';
import BigNumber from 'bignumber.js';
import { type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isMobile } from 'react-device-detect';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Wave from 'react-wavify';
import { IconArrowForward, IconEllipsisVertical, IconLoading } from 'src/Icons';
import {
  FALLBACK_COIN_IMAGE,
  MEANFI_DOCS_URL,
  MEAN_MULTISIG_ACCOUNT_LAMPORTS,
  NO_FEES,
} from 'src/app-constants/common';
import { NATIVE_SOL } from 'src/app-constants/tokens';
import { CopyExtLinkGroup } from 'src/components/CopyExtLinkGroup';
import { Identicon } from 'src/components/Identicon';
import { openNotification } from 'src/components/Notifications';
import { ResumeItem } from 'src/components/ResumeItem';
import { RightInfoDetails } from 'src/components/RightInfoDetails';
import { SendAssetModal } from 'src/components/SendAssetModal';
import { StreamOpenModal } from 'src/components/StreamOpenModal';
import { StreamStatusSummary } from 'src/components/StreamStatusSummary';
import { TreasuryAddFundsModal } from 'src/components/TreasuryAddFundsModal';
import { TreasuryCreateModal } from 'src/components/TreasuryCreateModal';
import { TreasuryStreamCreateModal } from 'src/components/TreasuryStreamCreateModal';
import { useNativeAccount } from 'src/contexts/accounts';
import { AppStateContext, type TransactionStatusInfo } from 'src/contexts/appstate';
import { useConnection } from 'src/contexts/connection';
import { TxConfirmationContext } from 'src/contexts/transaction-status';
import { useWallet } from 'src/contexts/wallet';
import useLocalStorage from 'src/hooks/useLocalStorage';
import useWindowSize from 'src/hooks/useWindowResize';
import { customLogger } from 'src/main';
import { saveAppData } from 'src/middleware/appPersistedData';
import { getStreamAssociatedMint } from 'src/middleware/getStreamAssociatedMint';
import { getStreamingAccountId } from 'src/middleware/getStreamingAccountId';
import { getStreamingAccountOwner } from 'src/middleware/getStreamingAccountOwner';
import { SOL_MINT } from 'src/middleware/ids';
import { getStreamTitle } from 'src/middleware/streams';
import {
  type ComputeBudgetConfig,
  DEFAULT_BUDGET_CONFIG,
  composeTxWithPrioritizationFees,
  getProposalWithPrioritizationFees,
  sendTx,
  signTx,
} from 'src/middleware/transactions';
import {
  consoleOut,
  getIntervalFromSeconds,
  getNumberCharLength,
  getTransactionStatusForLogs,
  toUsCurrency,
} from 'src/middleware/ui';
import {
  cutNumber,
  displayAmountWithSymbol,
  formatThousands,
  getAmountFromLamports,
  getAmountWithSymbol,
  getTokenOrCustomToken,
  getTxIxResume,
  shortenAddress,
  toTokenAmountBn,
  toUiAmount,
} from 'src/middleware/utils';
import type { TokenInfo } from 'src/models/SolanaTokenInfo';
import { RegisteredAppPaths } from 'src/models/accounts/AccountsPageUi';
import type { TreasuryTopupParams } from 'src/models/common-types';
import { OperationType, TransactionStatus } from 'src/models/enums';
import { ZERO_FEES } from 'src/models/multisig';
import type { StreamsSummary } from 'src/models/streams';
import type { TreasuryCreateOptions, UserTreasuriesSummary } from 'src/models/treasuries';
import type { AddFundsParams } from 'src/models/vesting';
import useMultisigClient from 'src/query-hooks/multisigClient';
import useStreamingClient from 'src/query-hooks/streamingClient';
import type { LooseObject } from 'src/types/LooseObject';
import './style.scss';
import { getStreamCategory, getStreamStatusLabel, isV2Stream } from 'src/middleware/streamHelpers';
import { useFetchAccountTokens } from 'src/query-hooks/accountTokens';

interface MoneyStreamsInfoViewProps {
  loadingStreams: boolean;
  loadingTreasuries: boolean;
  multisigAccounts: MultisigInfo[] | undefined;
  onSendFromIncomingStreamInfo?: (stream: Stream | StreamInfo) => void;
  onSendFromOutgoingStreamInfo?: (stream: Stream | StreamInfo) => void;
  onSendFromStreamingAccountInfo?: (streamingAccount: PaymentStreamingAccount | TreasuryInfo) => void;
  selectedMultisig: MultisigInfo | undefined;
  selectedTab: string;
  streamList: Array<Stream | StreamInfo> | undefined;
  treasuryList: (PaymentStreamingAccount | TreasuryInfo)[];
}

export const MoneyStreamsInfoView = ({
  loadingStreams,
  loadingTreasuries,
  multisigAccounts,
  onSendFromIncomingStreamInfo,
  onSendFromOutgoingStreamInfo,
  onSendFromStreamingAccountInfo,
  selectedMultisig,
  selectedTab,
  streamList,
  treasuryList,
}: MoneyStreamsInfoViewProps) => {
  const {
    tokenList,
    splTokenList,
    treasuryOption,
    selectedAccount,
    transactionStatus,
    getTokenPriceByAddress,
    setIsVerifiedRecipient,
    getTokenByMintAddress,
    setTransactionStatus,
    refreshTokenBalance,
    resetContractValues,
    openStreamById,
  } = useContext(AppStateContext);
  const { enqueueTransactionConfirmation } = useContext(TxConfirmationContext);
  const connection = useConnection();
  const { publicKey, wallet } = useWallet();
  const { t } = useTranslation('common');
  const { account } = useNativeAccount();
  const { width } = useWindowSize();
  const navigate = useNavigate();

  // Transactions
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [userBalances, setUserBalances] = useState<LooseObject>();
  const [transactionFees, setTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [minRequiredBalance, setMinRequiredBalance] = useState(0);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [multisigTransactionFees, setMultisigTransactionFees] = useState<MultisigTransactionFees>(ZERO_FEES);
  const [canDisplayIncomingBalance, setCanDisplayIncomingBalance] = useState(false);
  const [canDisplayOutgoingBalance, setCanDisplayOutgoingBalance] = useState(false);
  const [canDisplayTotalAccountBalance, setCanDisplayTotalAccountBalance] = useState(false);
  const [withdrawalBalance, setWithdrawalBalance] = useState(0);
  const [unallocatedBalance, setUnallocatedBalance] = useState(0);
  const [totalAccountBalance, setTotalAccountBalance] = useState<number | undefined>(undefined);
  const [rateIncomingPerSecond, setRateIncomingPerSecond] = useState(0);
  const [rateIncomingPerDay, setRateIncomingPerDay] = useState(0);
  const [rateOutgoingPerSecond, setRateOutgoingPerSecond] = useState(0);
  const [rateOutgoingPerDay, setRateOutgoingPerDay] = useState(0);
  const [incomingStreamList, setIncomingStreamList] = useState<Array<Stream | StreamInfo> | undefined>();
  const [outgoingStreamList, setOutgoingStreamList] = useState<Array<Stream | StreamInfo> | undefined>();
  const [incomingAmount, setIncomingAmount] = useState<number>();
  const [outgoingAmount, setOutgoingAmount] = useState<number>();
  const [streamingAccountsAmount, setStreamingAccountsAmount] = useState<number>();
  const [withdrawTransactionFees, setWithdrawTransactionFees] = useState<TransactionFees>(NO_FEES);
  // Treasuries related
  const [streamingAccountsSummary, setStreamingAccountsSummary] = useState<UserTreasuriesSummary | undefined>(
    undefined,
  );
  const [incomingStreamsSummary, setIncomingStreamsSummary] = useState<StreamsSummary | undefined>(undefined);
  const [outgoingStreamsSummary, setOutgoingStreamsSummary] = useState<StreamsSummary | undefined>(undefined);
  const [hasIncomingStreamsRunning, setHasIncomingStreamsRunning] = useState<number>();
  const [hasOutgoingStreamsRunning, setHasOutgoingStreamsRunning] = useState<number>();
  const [isXsDevice, setIsXsDevice] = useState<boolean>(isMobile);

  const sourceAccount = selectedMultisig ? selectedMultisig.authority.toBase58() : publicKey?.toBase58();
  const { data: sourceAccountTokens } = useFetchAccountTokens(sourceAccount);

  ////////////
  //  Init  //
  ////////////

  const [transactionPriorityOptions] = useLocalStorage<ComputeBudgetConfig>(
    'transactionPriority',
    DEFAULT_BUDGET_CONFIG,
  );

  const { multisigClient } = useMultisigClient();

  const { tokenStreamingV1, tokenStreamingV2, streamV2ProgramAddress } = useStreamingClient();
  const mspV2AddressPK = useMemo(() => new PublicKey(streamV2ProgramAddress), [streamV2ProgramAddress]);

  const streamListv1 = useMemo(
    () => (streamList?.filter(stream => !isV2Stream(stream)) as StreamInfo[]) ?? [],
    [streamList],
  );
  const streamListv2 = useMemo(
    () => (streamList?.filter(stream => isV2Stream(stream)) as Stream[]) ?? [],
    [streamList],
  );

  const isMultisigContext = useMemo(() => {
    return !!(publicKey && selectedAccount.isMultisig);
  }, [publicKey, selectedAccount]);

  /////////////////
  //  Callbacks  //
  /////////////////

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Idle,
      currentOperation: TransactionStatus.Idle,
    });
  }, [setTransactionStatus]);

  const getMultisigTxProposalFees = useCallback(() => {
    if (!multisigClient) {
      return;
    }

    getFees(multisigClient.getProgram(), MULTISIG_ACTIONS.createTransaction).then(value => {
      setMultisigTransactionFees(value);
      consoleOut('multisigTransactionFees:', value, 'orange');
      consoleOut('nativeBalance:', nativeBalance, 'blue');
      consoleOut('networkFee:', value.networkFee, 'blue');
      consoleOut('rentExempt:', value.rentExempt, 'blue');
      const totalMultisigFee = value.multisigFee + MEAN_MULTISIG_ACCOUNT_LAMPORTS / LAMPORTS_PER_SOL;
      consoleOut('multisigFee:', totalMultisigFee, 'blue');
      const minRequired = totalMultisigFee + value.rentExempt + value.networkFee;
      consoleOut('Min required balance:', minRequired, 'blue');
      setMinRequiredBalance(minRequired);
    });

    resetTransactionStatus();
  }, [multisigClient, nativeBalance, resetTransactionStatus]);

  // Automatically update all token balances (in token list)
  useEffect(() => {
    const balancesMap: LooseObject = {};

    if (!sourceAccount) {
      return;
    }

    if (!sourceAccountTokens || sourceAccountTokens.length === 0) {
      for (const t of tokenList) {
        balancesMap[t.address] = 0;
      }
      setUserBalances(balancesMap);
      return;
    }

    // sourceAccount
    consoleOut('Reading balances for:', sourceAccount, 'darkpurple');

    connection.getBalance(new PublicKey(sourceAccount)).then(solBalance => {
      const uiBalance = getAmountFromLamports(solBalance);
      balancesMap[NATIVE_SOL.address] = uiBalance;
      setNativeBalance(uiBalance);
    });

    for (const item of sourceAccountTokens) {
      const address = item.parsedInfo.mint;
      const balance = item.parsedInfo.tokenAmount.uiAmount ?? 0;
      balancesMap[address] = balance;
    }
    setUserBalances(balancesMap);
  }, [sourceAccount, sourceAccountTokens, connection, tokenList]);

  const getRateAmountBn = useCallback((item: Stream | StreamInfo, decimals: number) => {
    if (item) {
      const rateAmount =
        item.version < 2 ? toTokenAmountBn(item.rateAmount as number, decimals) : (item.rateAmount as BN);
      return rateAmount;
    }
    return new BN(0);
  }, []);

  const isNewTreasury = useCallback((tsry: PaymentStreamingAccount | TreasuryInfo): boolean => {
    return tsry.version >= 2;
  }, []);

  const getTreasuryUnallocatedBalance = useCallback(
    (tsry: PaymentStreamingAccount | TreasuryInfo, assToken: TokenInfo | undefined) => {
      const getUnallocatedBalance = (details: PaymentStreamingAccount | TreasuryInfo) => {
        const balance = new BN(details.balance);
        const allocationAssigned = new BN(details.allocationAssigned);
        return balance.sub(allocationAssigned);
      };

      if (tsry) {
        const decimals = assToken ? assToken.decimals : 9;
        const unallocated = getUnallocatedBalance(tsry);
        const ub = isNewTreasury(tsry)
          ? new BigNumber(toUiAmount(unallocated, decimals)).toNumber()
          : new BigNumber(unallocated.toString()).toNumber();
        return ub;
      }
      return 0;
    },
    [isNewTreasury],
  );

  const refreshTreasuriesSummary = useCallback(async () => {
    if (!treasuryList) {
      return;
    }

    const resume: UserTreasuriesSummary = {
      totalAmount: 0,
      openAmount: 0,
      lockedAmount: 0,
      totalNet: 0,
    };

    for (const treasury of treasuryList) {
      const isNew = isNewTreasury(treasury);

      const treasuryType = isNew
        ? +(treasury as PaymentStreamingAccount).accountType
        : +(treasury as TreasuryInfo).type;

      const associatedToken = isNew
        ? (treasury as PaymentStreamingAccount).mint.toBase58()
        : ((treasury as TreasuryInfo).associatedTokenAddress as string);

      if (treasuryType === 0) {
        resume.openAmount += 1;
      } else {
        resume.lockedAmount += 1;
      }

      let amountChange = 0;

      const token = getTokenByMintAddress(associatedToken);

      if (token) {
        const tokenPrice = getTokenPriceByAddress(token.address, token.symbol);
        const amount = getTreasuryUnallocatedBalance(treasury, token);
        amountChange = amount * tokenPrice;
      }

      resume.totalNet += amountChange;
    }

    resume.totalAmount += treasuryList.length;

    return resume;
  }, [treasuryList, isNewTreasury, getTokenByMintAddress, getTokenPriceByAddress, getTreasuryUnallocatedBalance]);

  const refreshIncomingStreamSummary = useCallback(async () => {
    if (!tokenStreamingV1 || !tokenStreamingV2 || !publicKey || (!streamListv1 && !streamListv2)) {
      return;
    }

    const resume: StreamsSummary = {
      totalNet: 0,
      incomingAmount: 0,
      outgoingAmount: 0,
      totalAmount: 0,
    };

    const treasurer = selectedAccount.address ? new PublicKey(selectedAccount.address) : publicKey;

    const updatedStreamsv1 = await tokenStreamingV1.refreshStreams(streamListv1 ?? [], treasurer);
    const updatedStreamsv2 = await tokenStreamingV2.refreshStreams(streamListv2 ?? [], treasurer);

    for (const stream of updatedStreamsv1) {
      const isIncoming = !!(stream.beneficiaryAddress && stream.beneficiaryAddress === treasurer.toBase58());

      // Get refreshed data
      const freshStream = await tokenStreamingV1.refreshStream(stream, undefined, false);
      if (!freshStream || freshStream.state !== STREAM_STATE.Running) {
        continue;
      }

      const token = getTokenByMintAddress(freshStream.associatedToken as string);

      if (token) {
        const tokenPrice = getTokenPriceByAddress(token.address, token.symbol);

        if (isIncoming) {
          resume.totalNet = resume.totalNet + (freshStream.escrowVestedAmount || 0) * tokenPrice;
        }
      }
    }

    resume.totalAmount = updatedStreamsv1.length;

    for (const stream of updatedStreamsv2) {
      const isIncoming = !!stream.beneficiary?.equals(treasurer);

      // Get refreshed data
      const freshStream = await tokenStreamingV2.refreshStream(stream);
      if (!freshStream || freshStream.statusCode !== STREAM_STATUS_CODE.Running) {
        continue;
      }

      const token = getTokenByMintAddress(freshStream.mint.toBase58());

      if (token) {
        const tokenPrice = getTokenPriceByAddress(token.address, token.symbol);
        const decimals = token.decimals || 9;
        const amount = new BigNumber(freshStream.withdrawableAmount.toString()).toNumber();
        const amountChange = Number.parseFloat((amount / 10 ** decimals).toFixed(decimals)) * tokenPrice;

        if (isIncoming) {
          resume.totalNet += amountChange;
        }
      }
    }

    resume.totalAmount += updatedStreamsv2.length;

    setIncomingStreamsSummary(resume);

    return resume;
  }, [
    tokenStreamingV1,
    tokenStreamingV2,
    publicKey,
    streamListv1,
    streamListv2,
    selectedAccount.address,
    getTokenByMintAddress,
    getTokenPriceByAddress,
  ]);

  const refreshOutgoingStreamSummary = useCallback(async () => {
    if (!tokenStreamingV1 || !tokenStreamingV2 || !publicKey || (!streamListv1 && !streamListv2)) {
      return;
    }

    const resume: StreamsSummary = {
      totalNet: 0,
      incomingAmount: 0,
      outgoingAmount: 0,
      totalAmount: 0,
    };

    const treasurer = selectedAccount.address ? new PublicKey(selectedAccount.address) : publicKey;

    const updatedStreamsv1 = await tokenStreamingV1.refreshStreams(streamListv1 ?? [], treasurer);
    const updatedStreamsv2 = await tokenStreamingV2.refreshStreams(streamListv2 ?? [], treasurer);

    for (const stream of updatedStreamsv1) {
      const isIncoming = !!(stream.beneficiaryAddress && stream.beneficiaryAddress === treasurer.toBase58());

      // Get refreshed data
      const freshStream = await tokenStreamingV1.refreshStream(stream);
      if (!freshStream || freshStream.state !== STREAM_STATE.Running) {
        continue;
      }

      const token = getTokenByMintAddress(freshStream.associatedToken as string);

      if (token) {
        const tokenPrice = getTokenPriceByAddress(token.address, token.symbol);

        if (!isIncoming) {
          resume.totalNet = resume.totalNet + (freshStream.escrowUnvestedAmount || 0) * tokenPrice;
        }
      }
    }

    resume.totalAmount = updatedStreamsv1.length;

    for (const stream of updatedStreamsv2) {
      const isIncoming = !!stream.beneficiary?.equals(treasurer);

      // Get refreshed data
      const freshStream = (await tokenStreamingV2.refreshStream(stream)) as Stream;
      if (!freshStream || freshStream.statusCode !== STREAM_STATUS_CODE.Running) {
        continue;
      }

      const streamMint = getStreamAssociatedMint(freshStream);
      const token = getTokenByMintAddress(streamMint);

      if (token) {
        const tokenPrice = getTokenPriceByAddress(token.address, token.symbol);
        const decimals = token.decimals || 9;
        const amount = new BigNumber(freshStream.fundsLeftInStream.toString()).toNumber();
        const amountChange = Number.parseFloat((amount / 10 ** decimals).toFixed(decimals)) * tokenPrice;

        if (!isIncoming) {
          resume.totalNet += amountChange;
        }
      }
    }

    resume.totalAmount += updatedStreamsv2.length;

    setOutgoingStreamsSummary(resume);
    return resume;
  }, [
    tokenStreamingV1,
    tokenStreamingV2,
    publicKey,
    streamListv1,
    streamListv2,
    selectedAccount.address,
    getTokenByMintAddress,
    getTokenPriceByAddress,
  ]);

  const getTransactionFeesV2 = useCallback(async (action: ACTION_CODES): Promise<TransactionFees> => {
    return calculateFeesForAction(action);
  }, []);

  const abortOnLowBalance = useCallback(
    (title: string, nativeBalance: number, minRequired: number, transactionLog: LooseObject[]) => {
      const txLog: LooseObject[] = transactionLog.slice();
      const notifContent = t('transactions.status.tx-start-failure', {
        accountBalance: getAmountWithSymbol(nativeBalance, SOL_MINT.toBase58()),
        feeAmount: getAmountWithSymbol(minRequired, SOL_MINT.toBase58()),
      });
      txLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
        result: notifContent,
      });
      customLogger.logWarning(title, {
        transcript: txLog,
      });
      openNotification({
        description: notifContent,
        type: 'info',
      });
      const txStatus = {
        customError: {
          message: notifContent,
          data: undefined,
        },
        lastOperation: transactionStatus.currentOperation,
        currentOperation: TransactionStatus.TransactionStartFailure,
      } as TransactionStatusInfo;
      setTransactionStatus(txStatus);
    },
    [setTransactionStatus, t, transactionStatus.currentOperation],
  );

  //////////////////////
  // MODALS & ACTIONS //
  //////////////////////

  // Send selected token modal
  const [isCreateMoneyStreamModalOpen, setIsCreateMoneyStreamModalOpen] = useState(false);
  const showCreateMoneyStreamModal = useCallback(() => setIsCreateMoneyStreamModalOpen(true), []);
  const hideCreateMoneyStreamModal = useCallback(() => {
    setIsCreateMoneyStreamModalOpen(false);
    resetContractValues();
    setIsVerifiedRecipient(false);
  }, [resetContractValues, setIsVerifiedRecipient]);

  // Add funds modal
  const [isAddFundsModalVisible, setIsAddFundsModalVisibility] = useState(false);
  const showAddFundsModal = useCallback(() => {
    resetTransactionStatus();
    getMultisigTxProposalFees();
    refreshTokenBalance();
    getTransactionFeesV2(ACTION_CODES.AddFundsToAccount).then(value => {
      setTransactionFees(value);
      consoleOut('transactionFees:', value, 'orange');
    });
    getTransactionFeesV2(ACTION_CODES.WithdrawFromStream).then(value => {
      setWithdrawTransactionFees(value);
      consoleOut('withdrawTransactionFees:', value, 'orange');
    });
    setIsAddFundsModalVisibility(true);
  }, [refreshTokenBalance, getTransactionFeesV2, resetTransactionStatus, getMultisigTxProposalFees]);

  const closeAddFundsModal = useCallback(() => {
    setIsBusy(false);
    setIsAddFundsModalVisibility(false);
    resetTransactionStatus();
  }, [resetTransactionStatus]);

  const onAddFundsTransactionFinished = () => {
    closeAddFundsModal();
    refreshTokenBalance();
    resetTransactionStatus();
  };

  const onAcceptAddFunds = (params: TreasuryTopupParams) => {
    consoleOut('MoneyStreamsInfoView -> AddFunds params:', params, 'blue');
    onExecuteAddFundsTransaction(params);
  };

  const onExecuteAddFundsTransaction = async (params: TreasuryTopupParams) => {
    let transaction: VersionedTransaction | Transaction | null = null;
    let signature: string;
    let encodedTx: string;
    let multisigAuth = '';
    let transactionLog: LooseObject[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createTxV1 = async (): Promise<boolean> => {
      if (publicKey && params && params.treasuryId) {
        consoleOut('Start transaction for treasury addFunds', '', 'blue');
        consoleOut('Wallet address:', publicKey.toBase58());

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        const treasury = new PublicKey(params.treasuryId);
        const associatedToken = new PublicKey(params.associatedToken);
        const amount = Number.parseFloat(params.amount);
        const stream = params.streamId ? new PublicKey(params.streamId) : undefined;
        const data = {
          contributor: publicKey.toBase58(), // contributor
          treasury: treasury.toBase58(), // treasury
          stream: stream?.toBase58(), // stream
          associatedToken: associatedToken.toBase58(), // associatedToken
          amount: amount, // amount
        };
        consoleOut('data:', data);

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: data,
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: '',
        });

        // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee

        const bf = transactionFees.blockchainFee; // Blockchain fee
        const ff = transactionFees.mspFlatFee; // Flat fee (protocol)
        const mp =
          multisigTransactionFees.networkFee + multisigTransactionFees.multisigFee + multisigTransactionFees.rentExempt; // Multisig proposal
        const minRequired = isMultisigContext ? mp : bf + ff;

        setMinRequiredBalance(minRequired);

        consoleOut('Min balance required:', minRequired, 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');

        if (nativeBalance < minRequired) {
          abortOnLowBalance(
            'PaymentStreamingAccount Add funds transaction failed',
            nativeBalance,
            minRequired,
            transactionLog,
          );

          return false;
        }

        consoleOut('Starting Add Funds using MSP V1...', '', 'blue');
        // Create a transaction
        return tokenStreamingV1
          .addFunds(publicKey, treasury, stream, associatedToken, amount, 1)
          .then(value => {
            consoleOut('addFunds returned transaction:', value);
            setTransactionStatus({
              lastOperation: TransactionStatus.InitTransactionSuccess,
              currentOperation: TransactionStatus.SignTransaction,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
              result: getTxIxResume(value),
            });
            transaction = value;
            return true;
          })
          .catch(error => {
            console.error('addFunds error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`,
            });
            customLogger.logError('PaymentStreamingAccount Add funds transaction failed', {
              transcript: transactionLog,
            });
            return false;
          });
      }

      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
        result: 'Cannot start transaction! Wallet not found!',
      });
      customLogger.logError('PaymentStreamingAccount Add funds transaction failed', {
        transcript: transactionLog,
      });
      return false;
    };

    const addFunds = async (data: AddFundsParams) => {
      if (!publicKey || !tokenStreamingV2) {
        return null;
      }

      if (!isMultisigContext || !params.fundFromSafe) {
        if (data.stream === '') {
          consoleOut('Create single signer Tx ->', 'buildAddFundsToAccountTransaction', 'darkgreen');
          const accounts: AddFundsToAccountTransactionAccounts = {
            feePayer: new PublicKey(data.payer), // feePayer
            contributor: new PublicKey(data.contributor), // contributor
            psAccount: new PublicKey(data.treasury), // psAccount
            psAccountMint: new PublicKey(data.associatedToken), // psAccountMint
          };
          const { transaction } = await tokenStreamingV2.buildAddFundsToAccountTransaction(
            accounts, // accounts
            data.amount, // amount
          );

          return await composeTxWithPrioritizationFees(connection, publicKey, transaction.instructions);
        }

        consoleOut('Create single signer Tx ->', 'buildAllocateFundsToStreamTransaction', 'darkgreen');
        const accounts: AllocateFundsToStreamTransactionAccounts = {
          feePayer: new PublicKey(data.payer), // feePayer
          psAccount: new PublicKey(data.treasury), // psAccount
          owner: new PublicKey(data.contributor), // owner
          stream: new PublicKey(data.stream), // stream
        };
        const { transaction } = await tokenStreamingV2.buildAllocateFundsToStreamTransaction(
          accounts, // accounts
          data.amount, // amount
        );

        return await composeTxWithPrioritizationFees(connection, publicKey, transaction.instructions);
      }

      if (!treasuryList || !multisigClient || !multisigAccounts || !publicKey) {
        return null;
      }
      const treasury = treasuryList.find(t => getStreamingAccountId(t) === data.treasury);
      if (!treasury) {
        return null;
      }

      const owner = getStreamingAccountOwner(treasury);
      const multisig = multisigAccounts.find(m => m.authority.toBase58() === owner);

      if (!multisig) {
        return null;
      }

      multisigAuth = multisig.authority.toBase58();

      let operationType = OperationType.StreamAddFunds;
      let addFundsTx: Transaction;

      if (data.stream) {
        consoleOut('Create multisig Tx ->', 'buildAllocateFundsToStreamTransaction', 'darkgreen');
        const accounts: AllocateFundsToStreamTransactionAccounts = {
          feePayer: new PublicKey(multisig.authority), // feePayer
          owner: new PublicKey(multisig.authority), // owner
          psAccount: new PublicKey(data.treasury), // psAccount
          stream: new PublicKey(data.stream), // stream
        };
        const { transaction } = await tokenStreamingV2.buildAllocateFundsToStreamTransaction(
          accounts, // accounts
          data.amount, // amount
        );
        addFundsTx = transaction;
      } else {
        operationType = OperationType.TreasuryAddFunds;
        consoleOut('Create multisig Tx ->', 'buildAddFundsToAccountTransaction', 'darkgreen');
        const accounts: AddFundsToAccountTransactionAccounts = {
          feePayer: new PublicKey(multisig.authority), // feePayer
          contributor: new PublicKey(data.contributor), // contributor
          psAccount: new PublicKey(data.treasury), // psAccount
          psAccountMint: new PublicKey(data.associatedToken), // psAccountMint
        };
        const { transaction } = await tokenStreamingV2.buildAddFundsToAccountTransaction(
          accounts, // accounts
          data.amount, // amount
        );
        addFundsTx = transaction;
      }

      const ixData = Buffer.from(addFundsTx.instructions[0].data);
      const ixAccounts = addFundsTx.instructions[0].keys;
      const expirationTime = Number.parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await getProposalWithPrioritizationFees(
        {
          connection,
          multisigClient,
          transactionPriorityOptions,
        },
        publicKey,
        data.proposalTitle ?? 'Add Funds',
        '', // description
        new Date(expirationTime * 1_000),
        operationType,
        multisig.id,
        mspV2AddressPK,
        ixAccounts,
        ixData,
      );

      return tx?.transaction ?? null;
    };

    const createTxV2 = async (): Promise<boolean> => {
      if (!publicKey || !params || !params.treasuryId || !params.associatedToken || !tokenStreamingV2) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('PaymentStreamingAccount Add funds transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction,
      });

      const associatedToken =
        params.associatedToken === SOL_MINT.toBase58()
          ? NATIVE_SOL_MINT // imported from SDK
          : new PublicKey(params.associatedToken);
      const amount = params.tokenAmount;
      consoleOut('raw amount:', params.tokenAmount, 'blue');
      consoleOut('amount.toNumber():', amount, 'blue');
      consoleOut('amount.toString():', params.tokenAmount.toString(), 'blue');
      const contributor = params.contributor ?? publicKey.toBase58();
      const data: AddFundsParams = {
        proposalTitle: params.proposalTitle, // proposalTitle
        payer: publicKey.toBase58(), // payer
        contributor: contributor, // contributor
        treasury: params.treasuryId, // treasury
        associatedToken: associatedToken.toBase58(), // associatedToken
        stream: params.streamId ? params.streamId : '', // stream
        amount, // amount
      };

      consoleOut('data:', data);

      // Log input data
      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
        inputs: data,
      });

      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
        result: '',
      });

      // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
      // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee

      const bf = transactionFees.blockchainFee; // Blockchain fee
      const ff = transactionFees.mspFlatFee; // Flat fee (protocol)
      const mp =
        multisigTransactionFees.networkFee + multisigTransactionFees.multisigFee + multisigTransactionFees.rentExempt; // Multisig proposal
      const minRequired = isMultisigContext ? mp : bf + ff;

      setMinRequiredBalance(minRequired);

      consoleOut('Min balance required:', minRequired, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance < minRequired) {
        abortOnLowBalance(
          'PaymentStreamingAccount Add funds transaction failed',
          nativeBalance,
          minRequired,
          transactionLog,
        );

        return false;
      }

      consoleOut('onExecuteAddFundsTransaction ->', 'MoneyStreamsInfoView', 'darkcyan');
      consoleOut('Starting Add Funds using MSP V2...', '', 'blue');
      // Create a transaction
      const result = await addFunds(data)
        .then(value => {
          if (!value) {
            return false;
          }
          consoleOut('addFunds returned transaction:', value);
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
            result: getTxIxResume(value),
          });
          transaction = value;
          return true;
        })
        .catch(error => {
          console.error('addFunds error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`,
          });
          customLogger.logError('PaymentStreamingAccount Add funds transaction failed', {
            transcript: transactionLog,
          });
          return false;
        });

      return result;
    };

    if (connection && wallet && publicKey && params) {
      const token = await getTokenOrCustomToken(connection, params.associatedToken, getTokenByMintAddress);
      consoleOut('onExecuteAddFundsTransaction token:', token, 'blue');
      const treasury = treasuryList.find(t => getStreamingAccountId(t) === params.treasuryId);
      if (!treasury) {
        return null;
      }
      let created: boolean;
      if ((treasury as PaymentStreamingAccount).version && (treasury as PaymentStreamingAccount).version >= 2) {
        created = await createTxV2();
      } else {
        created = await createTxV1();
      }
      consoleOut('created:', created, 'blue');
      if (created && !transactionCancelled) {
        const sign = await signTx('Fund Account', wallet.adapter, publicKey, transaction);
        if (sign.encodedTransaction) {
          encodedTx = sign.encodedTransaction;
          transactionLog = transactionLog.concat(sign.log);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionSuccess,
          });
          const sent = await sendTx('Fund Account', connection, encodedTx);
          consoleOut('sent:', sent);
          if (sent.signature && !transactionCancelled) {
            signature = sent.signature;
            consoleOut('Send Tx to confirmation queue:', signature);
            const amountDisplay = getAmountWithSymbol(
              params.amount,
              params.associatedToken,
              false,
              splTokenList,
              token.decimals,
            );
            const loadingMessage = multisigAuth
              ? `Create proposal to fund streaming account with ${amountDisplay}`
              : `Fund streaming account with ${amountDisplay}`;
            const completed = multisigAuth
              ? 'Streaming account funding has been submitted for approval.'
              : `Streaming account funded with ${amountDisplay}`;
            enqueueTransactionConfirmation({
              signature,
              operationType: OperationType.TreasuryAddFunds,
              finality: 'confirmed',
              txInfoFetchStatus: 'fetching',
              loadingTitle: 'Confirming transaction',
              loadingMessage: loadingMessage,
              completedTitle: 'Transaction confirmed',
              completedMessage: completed,
              extras: {
                treasuryId: treasury.id as string,
                multisigAuthority: multisigAuth,
              },
            });
            onAddFundsTransactionFinished();
            setIsBusy(false);
          } else {
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.SendTransactionFailure,
            });
            setIsBusy(false);
          }
        } else {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionFailure,
          });
          setIsBusy(false);
        }
      } else {
        setIsBusy(false);
      }
    }
  };

  // Create Stream modal
  const [isCreateStreamModalVisible, setIsCreateStreamModalVisibility] = useState(false);
  const showCreateStreamModal = useCallback(() => {
    resetTransactionStatus();
    refreshTokenBalance();
    getMultisigTxProposalFees();
    setIsCreateStreamModalVisibility(true);
    getTransactionFeesV2(ACTION_CODES.CreateStreamWithFunds).then(value => {
      setTransactionFees(value);
      consoleOut('transactionFees:', value, 'orange');
    });
    getTransactionFeesV2(ACTION_CODES.WithdrawFromStream).then(value => {
      setWithdrawTransactionFees(value);
      consoleOut('withdrawTransactionFees:', value, 'orange');
    });
  }, [refreshTokenBalance, getTransactionFeesV2, resetTransactionStatus, getMultisigTxProposalFees]);

  const closeCreateStreamModal = useCallback(() => {
    setIsCreateStreamModalVisibility(false);
    resetContractValues();
    refreshTokenBalance();
    resetTransactionStatus();
  }, [refreshTokenBalance, resetContractValues, resetTransactionStatus]);

  // Open stream modal
  const [isOpenStreamModalVisible, setIsOpenStreamModalVisibility] = useState(false);
  const showOpenStreamModal = useCallback(() => setIsOpenStreamModalVisibility(true), []);
  const closeOpenStreamModal = useCallback(() => setIsOpenStreamModalVisibility(false), []);
  const onAcceptOpenStream = (streamId: string) => {
    if (streamList) {
      const findStream = streamList.filter((stream: Stream | StreamInfo) => stream.id === streamId);
      const streamSelected = Object.assign({}, ...findStream);

      const url = `/${RegisteredAppPaths.PaymentStreaming}/${
        isInboundStream(streamSelected) ? 'incoming' : 'outgoing'
      }/${streamId}?v=details`;

      navigate(url);
    }

    openStreamById(streamId, true);
    closeOpenStreamModal();
  };

  // Create treasury modal
  const [isCreateTreasuryModalVisible, setIsCreateTreasuryModalVisibility] = useState(false);
  const showCreateTreasuryModal = useCallback(() => {
    resetTransactionStatus();
    getMultisigTxProposalFees();
    setIsCreateTreasuryModalVisibility(true);
    getTransactionFeesV2(ACTION_CODES.CreateAccount).then(value => {
      setTransactionFees(value);
      consoleOut('transactionFees:', value, 'orange');
    });
  }, [getTransactionFeesV2, resetTransactionStatus, getMultisigTxProposalFees]);

  const closeCreateTreasuryModal = useCallback(() => {
    setIsCreateTreasuryModalVisibility(false);
    resetTransactionStatus();
  }, [resetTransactionStatus]);

  const onAcceptCreateTreasury = (data: TreasuryCreateOptions) => {
    consoleOut('treasury create options:', data, 'blue');
    onExecuteCreateTreasuryTx(data);
  };

  const onTreasuryCreated = useCallback(() => {
    refreshTokenBalance();
  }, [refreshTokenBalance]);

  const onExecuteCreateTreasuryTx = async (createOptions: TreasuryCreateOptions) => {
    let transaction: VersionedTransaction | Transaction | null = null;
    let signature: string;
    let encodedTx: string;
    let transactionLog: LooseObject[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createTreasury = async (data: {
      title: string;
      treasurer: string;
      label: string;
      type: string;
      multisig: string;
      associatedTokenAddress: string;
    }) => {
      if (!connection || !tokenStreamingV2 || !publicKey) {
        return null;
      }

      const treasuryType = data.type === 'Open' ? AccountType.Open : AccountType.Lock;

      const treasuryAssociatedTokenMint =
        data.associatedTokenAddress === SOL_MINT.toBase58()
          ? NATIVE_SOL_MINT // imported from SDK
          : new PublicKey(data.associatedTokenAddress);

      if (!data.multisig) {
        const accounts: CreateAccountTransactionAccounts = {
          feePayer: new PublicKey(data.treasurer), // treasurer
          owner: new PublicKey(data.treasurer), // treasurer
          mint: treasuryAssociatedTokenMint, // mint
        };
        const { transaction } = await tokenStreamingV2.buildCreateAccountTransaction(
          accounts, // accounts
          data.label, // label
          treasuryType, // type
        );

        return await composeTxWithPrioritizationFees(connection, publicKey, transaction.instructions);
      }

      if (!multisigClient || !multisigAccounts) {
        return null;
      }

      const multisig = multisigAccounts.find(m => m.id.toBase58() === data.multisig);

      if (!multisig) {
        return null;
      }

      const accounts: CreateAccountTransactionAccounts = {
        feePayer: multisig.authority, // treasurer
        owner: multisig.authority, // treasurer
        mint: treasuryAssociatedTokenMint, // mint
      };
      const { transaction } = await tokenStreamingV2.buildCreateAccountTransaction(
        accounts, // accounts
        data.label, // label
        treasuryType, // type
        true, // solFeePayedByTreasury = true
      );

      const ixData = Buffer.from(transaction.instructions[0].data);
      const ixAccounts = transaction.instructions[0].keys;
      const expirationTime = Number.parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await getProposalWithPrioritizationFees(
        {
          connection,
          multisigClient,
          transactionPriorityOptions,
        },
        publicKey,
        data.title === '' ? 'Create streaming account' : data.title,
        '', // description
        new Date(expirationTime * 1_000),
        OperationType.TreasuryCreate,
        multisig.id,
        mspV2AddressPK,
        ixAccounts,
        ixData,
      );

      return tx?.transaction ?? null;
    };

    const createTx = async () => {
      if (!connection || !wallet || !publicKey || !tokenStreamingV2 || !treasuryOption) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('Create Streaming Account transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }

      consoleOut('Start transaction for create streaming account', '', 'blue');
      consoleOut('Wallet address:', publicKey.toBase58());

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction,
      });

      // Create a transaction
      const associatedToken = createOptions.token;
      const payload = {
        title: createOptions.treasuryTitle,
        treasurer: selectedAccount.address, // treasurer
        label: createOptions.treasuryName, // label
        type:
          createOptions.treasuryType === AccountType.Open // type
            ? 'Open'
            : 'Lock',
        multisig: createOptions.multisigId, // multisig
        associatedTokenAddress: associatedToken.address,
      };

      consoleOut('payload:', payload);
      // Log input data
      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
        inputs: payload,
      });

      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
        result: '',
      });

      // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
      // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee

      const bf = transactionFees.blockchainFee; // Blockchain fee
      const ff = transactionFees.mspFlatFee; // Flat fee (protocol)
      const mp =
        multisigTransactionFees.networkFee + multisigTransactionFees.multisigFee + multisigTransactionFees.rentExempt; // Multisig proposal
      const minRequired = isMultisigContext ? mp : bf + ff;

      setMinRequiredBalance(minRequired);

      consoleOut('Min balance required:', minRequired, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance < minRequired) {
        abortOnLowBalance('Create Streaming Account transaction failed', nativeBalance, minRequired, transactionLog);

        return false;
      }

      consoleOut('Starting Create Streaming Account using MSP V2...', '', 'blue');

      const result = await createTreasury(payload)
        .then(value => {
          if (!value) {
            return false;
          }
          consoleOut('create streaming account returned transaction:', value);
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
            result: getTxIxResume(value),
          });
          transaction = value;
          return true;
        })
        .catch(error => {
          console.error('create streaming account error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`,
          });
          customLogger.logError('Create Streaming Account transaction failed', {
            transcript: transactionLog,
          });
          return false;
        });

      return result;
    };

    if (wallet && publicKey) {
      const created = await createTx();
      consoleOut('created:', created);
      if (created && !transactionCancelled) {
        const sign = await signTx('Create Streaming Account', wallet.adapter, publicKey, transaction);
        if (sign.encodedTransaction) {
          encodedTx = sign.encodedTransaction;
          transactionLog = transactionLog.concat(sign.log);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionSuccess,
          });
          const sent = await sendTx('Create Streaming Account', connection, encodedTx);
          consoleOut('sent:', sent);
          if (sent.signature && !transactionCancelled) {
            signature = sent.signature;
            consoleOut('Send Tx to confirmation queue:', signature);
            const multisig = createOptions.multisigId && selectedMultisig ? selectedMultisig.authority.toBase58() : '';
            enqueueTransactionConfirmation({
              signature,
              operationType: OperationType.TreasuryCreate,
              finality: 'confirmed',
              txInfoFetchStatus: 'fetching',
              loadingTitle: 'Confirming transaction',
              loadingMessage: `Create Streaming Account: ${createOptions.treasuryName}`,
              completedTitle: 'Transaction confirmed',
              completedMessage: `Successfully streaming account creation: ${createOptions.treasuryName}`,
              extras: {
                multisigAuthority: multisig,
              },
            });
            setIsCreateTreasuryModalVisibility(false);
            !multisig && onTreasuryCreated();
            resetTransactionStatus();
          } else {
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.SendTransactionFailure,
            });
            openNotification({
              title: t('notifications.error-title'),
              description: t('notifications.error-sending-transaction'),
              type: 'error',
            });
          }
          setIsBusy(false);
        } else {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionFailure,
          });
          openNotification({
            title: t('notifications.error-title'),
            description: t('notifications.error-sending-transaction'),
            type: 'error',
          });
          setIsBusy(false);
        }
      } else {
        setIsBusy(false);
      }
    }
  };

  const isInboundStream = useCallback(
    (item: Stream | StreamInfo): boolean => {
      if (item && publicKey && selectedAccount.address) {
        const v1 = item as StreamInfo;
        const v2 = item as Stream;
        let beneficiary = '';
        if (item.version < 2) {
          beneficiary =
            typeof v1.beneficiaryAddress === 'string'
              ? v1.beneficiaryAddress
              : (v1.beneficiaryAddress as PublicKey).toBase58();
        } else {
          beneficiary = typeof v2.beneficiary === 'string' ? v2.beneficiary : v2.beneficiary.toBase58();
        }
        return beneficiary === selectedAccount.address;
      }
      return false;
    },
    [selectedAccount.address, publicKey],
  );

  const getRateAmountDisplay = useCallback(
    (item: Stream | StreamInfo): string => {
      const associatedToken = getStreamAssociatedMint(item);
      const token = getTokenByMintAddress(associatedToken);
      const decimals = token?.decimals ?? 9;
      const rateAmount = getRateAmountBn(item, decimals);

      const rate = displayAmountWithSymbol(rateAmount, associatedToken, decimals, splTokenList, true, true);

      return rate;
    },
    [getRateAmountBn, getTokenByMintAddress, splTokenList],
  );

  const getDepositAmountDisplay = useCallback(
    (item: Stream | StreamInfo): string => {
      let value = '';

      const associatedToken = getStreamAssociatedMint(item);
      const allocAssgnd =
        item.version < 2 ? new BN((item as StreamInfo).allocationAssigned) : (item as Stream).allocationAssigned;

      if (item.rateIntervalInSeconds === 0 && allocAssgnd.gtn(0)) {
        const token = getTokenByMintAddress(associatedToken);
        const decimals = token?.decimals ?? 9;

        if (item.version < 2) {
          const allocationAssigned = new BN(item.allocationAssigned).toNumber();
          value += getAmountWithSymbol(allocationAssigned, associatedToken, true, splTokenList, decimals, true);
        } else {
          const allocationAssigned = new BN(item.allocationAssigned);
          value += displayAmountWithSymbol(allocationAssigned, associatedToken, decimals, splTokenList, true, false);
        }
        value += ' ';
        value += token ? token.symbol : `[${shortenAddress(associatedToken)}]`;
      }

      return value;
    },
    [getTokenByMintAddress, splTokenList],
  );

  const getStreamSubtitle = useCallback(
    (item: Stream | StreamInfo) => {
      let subtitle = '';

      if (item) {
        const rate = +item.rateAmount.toString();
        let rateAmount = rate > 0 ? getRateAmountDisplay(item) : getDepositAmountDisplay(item);

        if (rate > 0) {
          rateAmount += ' ' + getIntervalFromSeconds(item.rateIntervalInSeconds, true, t);
        }

        subtitle = rateAmount;
      }

      return subtitle;
    },
    [getDepositAmountDisplay, getRateAmountDisplay, t],
  );

  const isStreamRunning = useCallback((stream: Stream | StreamInfo) => {
    const v1 = stream as StreamInfo;
    const v2 = stream as Stream;
    if (stream.version < 2) {
      return v1.state === STREAM_STATE.Running;
    }

    return v2.statusCode === STREAM_STATUS_CODE.Running;
  }, []);

  const goToIncomingTabHandler = () => {
    const url = `/${RegisteredAppPaths.PaymentStreaming}/incoming`;
    navigate(url);
  };

  const goToOutgoingTabHandler = () => {
    const url = `/${RegisteredAppPaths.PaymentStreaming}/outgoing`;
    navigate(url);
  };

  const onTabChange = useCallback(
    (activeKey: string) => {
      consoleOut('Selected tab option:', activeKey, 'blue');

      const url = `/${RegisteredAppPaths.PaymentStreaming}/${activeKey}`;
      navigate(url);
    },
    [navigate],
  );

  /////////////////////
  // Data management //
  /////////////////////

  // Detect XS screen
  useEffect(() => {
    if (width < 576) {
      setIsXsDevice(true);
    } else {
      setIsXsDevice(false);
    }
  }, [width]);

  // Keep account balance updated
  useEffect(() => {
    if (!(account?.lamports !== previousBalance || !nativeBalance)) {
      return;
    }
    // Refresh token balance
    refreshTokenBalance();
    setNativeBalance(getAmountFromLamports(account?.lamports));
    // Update previous balance
    setPreviousBalance(account?.lamports);
  }, [account, nativeBalance, previousBalance, refreshTokenBalance]);

  // Reset summaries and canDisplay flags when all dependencies start to load
  useEffect(() => {
    if (loadingStreams) {
      setIncomingStreamsSummary(undefined);
      setOutgoingStreamsSummary(undefined);
      setCanDisplayIncomingBalance(false);
      setCanDisplayOutgoingBalance(false);
    }
    if (loadingTreasuries) {
      setStreamingAccountsSummary(undefined);
      setCanDisplayTotalAccountBalance(false);
    }
  }, [loadingStreams, loadingTreasuries]);

  const sortStreamsByWithdrawableAmount = useCallback(
    (a: Stream | StreamInfo, b: Stream | StreamInfo) => {
      const vA1 = a as StreamInfo;
      const vA2 = a as Stream;
      const vB1 = b as StreamInfo;
      const vB2 = b as Stream;

      const isNew = !!(vA2.version && vA2.version >= 2 && vB2.version && vB2.version >= 2);

      const associatedTokenA = isNew ? vA2.mint.toBase58() : (vA1.associatedToken as string);

      const associatedTokenB = isNew ? vB2.mint.toBase58() : (vB1.associatedToken as string);

      const tokenA = getTokenByMintAddress(associatedTokenA);
      const tokenB = getTokenByMintAddress(associatedTokenB);

      let tokenPriceA = 0;
      let tokenPriceB = 0;

      if (tokenA) {
        tokenPriceA = getTokenPriceByAddress(tokenA.address, tokenA.symbol);
      } else {
        tokenPriceA = 0;
      }

      if (tokenB) {
        tokenPriceB = getTokenPriceByAddress(tokenB.address, tokenB.symbol);
      } else {
        tokenPriceB = 0;
      }

      const priceB = isNew
        ? new BN(vB2.withdrawableAmount.muln(tokenPriceB))
        : new BN(vB1.escrowVestedAmount * tokenPriceB);
      const priceA = isNew
        ? new BN(vA2.withdrawableAmount.muln(tokenPriceB))
        : new BN(vA1.escrowVestedAmount * tokenPriceB);

      if (tokenPriceA && tokenPriceB) {
        if (priceB.gt(priceA)) {
          return 1;
        }
        return -1;
      }
      return 0;
    },
    [getTokenByMintAddress, getTokenPriceByAddress],
  );

  const sortStreamsByEstimatedDepletionDate = useCallback((a: Stream | StreamInfo, b: Stream | StreamInfo) => {
    const vA1 = a as StreamInfo;
    const vA2 = a as Stream;
    const vB1 = b as StreamInfo;
    const vB2 = b as Stream;

    const isNew = !!(vA2.version && vA2.version >= 2 && vB2.version && vB2.version >= 2);

    const timeA = isNew
      ? new Date(vA2.estimatedDepletionDate).getTime()
      : new Date(vA1.escrowEstimatedDepletionUtc as string).getTime();

    const timeB = isNew
      ? new Date(vB2.estimatedDepletionDate).getTime()
      : new Date(vB1.escrowEstimatedDepletionUtc as string).getTime();

    if (timeA && timeB) {
      if (timeA > timeB) {
        return 1;
      }
      return -1;
    }
    return 0;
  }, []);

  // Set the list of incoming and outgoing streams
  // biome-ignore lint/correctness/useExhaustiveDependencies: Deps managed manually
  useEffect(() => {
    if (!publicKey || !streamList) {
      setIncomingStreamList(undefined);
      setOutgoingStreamList(undefined);

      return;
    }

    // Sort the list of incoming streams by withdrawal amount
    const onlyIncomings = streamList.filter((stream: Stream | StreamInfo) => isInboundStream(stream));
    const sortedIncomingStreamsList = [...onlyIncomings].sort((a, b) => sortStreamsByWithdrawableAmount(a, b));

    consoleOut('incoming streams:', sortedIncomingStreamsList, 'crimson');
    setIncomingStreamList(sortedIncomingStreamsList);

    // Sort the list of outgoinng streams by estimated depletion date
    const onlyOuts = streamList.filter(item => !isInboundStream(item) && getStreamCategory(item) === Category.default);
    const sortedOutgoingStreamsList = [...onlyOuts].sort((a, b) => sortStreamsByEstimatedDepletionDate(a, b));

    consoleOut('outgoing streams:', sortedOutgoingStreamsList, 'crimson');
    setOutgoingStreamList(sortedOutgoingStreamsList);
  }, [publicKey, streamList, isInboundStream]);

  // Incoming amount
  useEffect(() => {
    if (!incomingStreamList) {
      return;
    }

    setIncomingAmount(incomingStreamList.length);
  }, [incomingStreamList]);

  // Outgoing amount
  useEffect(() => {
    if (!outgoingStreamList) {
      return;
    }

    setOutgoingAmount(outgoingStreamList.length);
  }, [outgoingStreamList]);

  // Streaming accounts amount
  useEffect(() => {
    if (!treasuryList) {
      return;
    }

    setStreamingAccountsAmount(treasuryList.length);
  }, [treasuryList]);

  // Live data calculation
  // biome-ignore lint/correctness/useExhaustiveDependencies: Deps managed manually
  useEffect(() => {
    if (!publicKey || !treasuryList) {
      return;
    }

    if (!streamingAccountsSummary) {
      refreshTreasuriesSummary().then(value => {
        if (value) {
          setStreamingAccountsSummary(value);
        }
        setCanDisplayTotalAccountBalance(true);
      });
    }

    const timeout = setTimeout(() => {
      refreshTreasuriesSummary().then(value => {
        consoleOut('streamingAccountsSummary:', value, 'orange');
        if (value) {
          setStreamingAccountsSummary(value);
        }
        setCanDisplayTotalAccountBalance(true);
      });
    }, 1000);

    return () => {
      clearTimeout(timeout);
    };
  }, [publicKey, treasuryList]);

  // Set refresh timeout for incomingStreamsSummary but get first time data
  useEffect(() => {
    if (!publicKey || !streamList || (!streamListv1 && !streamListv2)) {
      return;
    }

    if (!incomingStreamsSummary) {
      refreshIncomingStreamSummary().then(value => {
        setWithdrawalBalance(value ? value.totalNet : 0);
        setCanDisplayIncomingBalance(true);
      });
    }

    const timeout = setTimeout(() => {
      if (incomingStreamsSummary) {
        refreshIncomingStreamSummary();
      }
    }, 1000);

    return () => {
      clearTimeout(timeout);
    };
  }, [incomingStreamsSummary, publicKey, refreshIncomingStreamSummary, streamList, streamListv1, streamListv2]);

  // Set refresh timeout for outgoingStreamsSummary but get first time data
  useEffect(() => {
    if (!publicKey || !streamList || (!streamListv1 && !streamListv2) || !streamingAccountsSummary) {
      return;
    }

    if (!outgoingStreamsSummary) {
      refreshOutgoingStreamSummary().then(value => {
        setUnallocatedBalance(value ? value.totalNet + streamingAccountsSummary.totalNet : 0);
        setCanDisplayOutgoingBalance(true);
      });
    }

    const timeout = setTimeout(() => {
      if (outgoingStreamsSummary) {
        refreshOutgoingStreamSummary();
      }
    }, 1000);

    return () => {
      clearTimeout(timeout);
    };
  }, [
    outgoingStreamsSummary,
    publicKey,
    refreshOutgoingStreamSummary,
    streamList,
    streamListv1,
    streamListv2,
    streamingAccountsSummary,
  ]);

  // Update incoming balance
  useEffect(() => {
    if (!streamList || loadingStreams || !incomingStreamsSummary) {
      return;
    }

    const withdrawalTotalAmount = new BigNumber(incomingStreamsSummary.totalNet.toFixed(2)).toNumber();

    setWithdrawalBalance(withdrawalTotalAmount);
  }, [incomingStreamsSummary, loadingStreams, streamList]);

  // Update outgoing balance
  useEffect(() => {
    if (!streamingAccountsSummary || !outgoingStreamsSummary) {
      return;
    }

    const unallocatedTotalAmount = outgoingStreamsSummary.totalNet + streamingAccountsSummary.totalNet;
    const convertToBN = new BigNumber(unallocatedTotalAmount.toFixed(2));

    setUnallocatedBalance(convertToBN.toNumber());
  }, [streamingAccountsSummary, outgoingStreamsSummary]);

  // Update total account balance
  useEffect(() => {
    const tvl = withdrawalBalance + unallocatedBalance;
    setTotalAccountBalance(tvl);
    // Every time the TVL is updated, save it in persistent store
    const cacheEntryKey = 'streamingTvl';
    saveAppData(cacheEntryKey, tvl.toString(), selectedAccount.address);
  }, [selectedAccount.address, unallocatedBalance, withdrawalBalance]);

  // Calculate the rate per day for incoming streams
  useEffect(() => {
    if (incomingStreamList && !loadingStreams) {
      const runningIncomingStreams = incomingStreamList.filter((stream: Stream | StreamInfo) =>
        isStreamRunning(stream),
      );

      let totalRateAmountValuePerDay = 0;
      let totalRateAmountValuePerSecond = 0;

      for (const stream of runningIncomingStreams) {
        const v1 = stream as StreamInfo;
        const v2 = stream as Stream;
        const isNew = !!(v2.version && v2.version >= 2);

        const associatedToken = getStreamAssociatedMint(stream);
        const token = getTokenByMintAddress(associatedToken);

        if (token) {
          const tokenPrice = getTokenPriceByAddress(token.address, token.symbol);
          const rateAmountValue = isNew
            ? new BigNumber(toUiAmount(new BN(v2.rateAmount), token.decimals)).toNumber()
            : v1.rateAmount;
          const valueOfDay = ((rateAmountValue * tokenPrice) / stream.rateIntervalInSeconds) * 86400;
          totalRateAmountValuePerDay += valueOfDay;

          const valueOfSeconds = (rateAmountValue * tokenPrice) / stream.rateIntervalInSeconds;
          totalRateAmountValuePerSecond += valueOfSeconds;
        }
      }

      setHasIncomingStreamsRunning(runningIncomingStreams.length);
      setRateIncomingPerDay(totalRateAmountValuePerDay);
      setRateIncomingPerSecond(totalRateAmountValuePerSecond);
    }
  }, [loadingStreams, incomingStreamList, getTokenPriceByAddress, getTokenByMintAddress, isStreamRunning]);

  // Calculate the rate per day for outgoing streams
  useEffect(() => {
    if (outgoingStreamList && !loadingStreams) {
      const runningOutgoingStreams = outgoingStreamList.filter((stream: Stream | StreamInfo) =>
        isStreamRunning(stream),
      );

      let totalRateAmountValue = 0;
      let totalRateAmountValuePerSecond = 0;

      for (const stream of runningOutgoingStreams) {
        const associatedToken = getStreamAssociatedMint(stream);
        const token = getTokenByMintAddress(associatedToken);

        if (token) {
          const tokenPrice = getTokenPriceByAddress(token.address, token.symbol);
          if (!tokenPrice) {
            continue;
          }
          BigNumber.config({
            CRYPTO: true,
            DECIMAL_PLACES: 16,
          });
          const rateAmountBn = getRateAmountBn(stream, token.decimals);
          const rateAmountToUi = toUiAmount(rateAmountBn, token.decimals);
          const totalValue = new BigNumber(rateAmountToUi).multipliedBy(tokenPrice);
          const amountAsecond = totalValue.dividedBy(stream.rateIntervalInSeconds).toNumber();
          const amountAday = totalValue.dividedBy(stream.rateIntervalInSeconds).multipliedBy(86400).toNumber();
          totalRateAmountValue += amountAday;
          totalRateAmountValuePerSecond += amountAsecond;
        }
      }

      setHasOutgoingStreamsRunning(runningOutgoingStreams.length);
      setRateOutgoingPerDay(totalRateAmountValue);
      setRateOutgoingPerSecond(totalRateAmountValuePerSecond);
    }
  }, [
    loadingStreams,
    outgoingStreamList,
    getTokenPriceByAddress,
    getTokenByMintAddress,
    isStreamRunning,
    getRateAmountBn,
  ]);

  // Protocol
  const listOfBadges = ['MSP', 'DEFI', 'Payment Streams'];

  const renderProtocol = () => {
    return (
      <>
        <CopyExtLinkGroup
          content={streamV2ProgramAddress}
          number={isXsDevice ? 4 : 8}
          externalLink={true}
          isTx={false}
          classNameContainer='mb-1'
        />
        <div className='badge-container'>
          {listOfBadges.map((badge, index) => (
            <span key={`${badge}+${index}`} className='badge darken small text-uppercase mr-1'>
              {badge}
            </span>
          ))}
        </div>
      </>
    );
  };

  // Balance
  const renderBalance = (
    <>
      {loadingStreams || loadingTreasuries || !canDisplayTotalAccountBalance ? (
        <IconLoading className='mean-svg-icons' style={{ height: '12px', lineHeight: '12px' }} />
      ) : (
        <>
          {totalAccountBalance && totalAccountBalance > 0 ? (
            <span>{toUsCurrency(totalAccountBalance)}</span>
          ) : (
            <span>$0.0</span>
          )}
          {totalAccountBalance &&
            totalAccountBalance > 0 &&
            (withdrawalBalance > unallocatedBalance ? (
              <ArrowDownOutlined className='mean-svg-icons incoming bounce ml-1' />
            ) : (
              <ArrowUpOutlined className='mean-svg-icons outgoing bounce ml-1' />
            ))}
        </>
      )}
    </>
  );

  const renderBalanceContracts = (
    <a
      href={`${MEANFI_DOCS_URL}products/developers/smart-contracts`}
      target='_blank'
      rel='noopener noreferrer'
      className='simplelink underline-on-hover'
    >
      Tracking 2 smart contracts
    </a>
  );

  const infoData = [
    {
      name: 'Protocol',
      value: t('account-area.money-streams'),
      content: renderProtocol(),
    },
    {
      name: 'Balance (My TVL)',
      value: renderBalance,
      content: renderBalanceContracts,
    },
  ];

  const [withdrawalScale, setWithdrawalScale] = useState<number>(0);
  const [unallocatedScale, setUnallocatedScale] = useState<number>(0);

  useEffect(() => {
    if (!totalAccountBalance || !withdrawalBalance) {
      return;
    }

    const divider = getNumberCharLength(totalAccountBalance);
    const incomingDivider = Number.parseFloat(`1${'0'.repeat(divider && divider >= 2 ? divider - 2 : 1)}`);
    const calculateScaleBalanceIncoming = withdrawalBalance / incomingDivider;
    const calculateScaleInHeightIncoming = (calculateScaleBalanceIncoming * 30) / 100;

    if (calculateScaleInHeightIncoming > 0 && calculateScaleInHeightIncoming <= 3) {
      setWithdrawalScale(3);
    } else if (calculateScaleInHeightIncoming === 0) {
      setWithdrawalScale(0);
    } else {
      setWithdrawalScale(Math.ceil(calculateScaleInHeightIncoming));
    }
  }, [totalAccountBalance, withdrawalBalance]);

  useEffect(() => {
    if (!totalAccountBalance || !unallocatedBalance) {
      return;
    }

    const divider = getNumberCharLength(totalAccountBalance);

    const outgoingDivider = Number.parseFloat(`1${'0'.repeat(divider && divider >= 2 ? divider - 2 : 1)}`);
    const calculateScaleBalanceOutgoing = unallocatedBalance / outgoingDivider;
    const calculateScaleInHeightOutgoing = (calculateScaleBalanceOutgoing * 30) / 100;

    if (calculateScaleInHeightOutgoing > 0 && calculateScaleInHeightOutgoing <= 3) {
      setUnallocatedScale(3);
    } else if (calculateScaleInHeightOutgoing === 0) {
      setUnallocatedScale(0);
    } else {
      setUnallocatedScale(Math.ceil(calculateScaleInHeightOutgoing));
    }
  }, [totalAccountBalance, unallocatedBalance]);

  const setHeightGreenWave = useCallback((newHeight: string) => {
    document.documentElement.style.setProperty('--heigth-green-wave', newHeight);
  }, []);

  const setHeightRedWave = useCallback((newHeight: string) => {
    document.documentElement.style.setProperty('--heigth-red-wave', newHeight);
  }, []);

  useEffect(() => {
    getComputedStyle(document.documentElement).getPropertyValue('--heigth-green-wave');

    getComputedStyle(document.documentElement).getPropertyValue('--heigth-red-wave');

    setHeightGreenWave(`${withdrawalScale}vh`);
    setHeightRedWave(`${unallocatedScale}vh`);
  }, [unallocatedScale, withdrawalScale, setHeightGreenWave, setHeightRedWave]);

  const [isWavesPaused, setIsWavesPaused] = useState(true);

  useEffect(() => {
    if (!selectedAccount.address) {
      return;
    }

    const timeout = setTimeout(() => {
      setIsWavesPaused(false);
    }, 5000);

    return () => {
      clearTimeout(timeout);
    };
  }, [selectedAccount.address]);

  // Clear state on unmount component
  useEffect(() => {
    // Do unmounting stuff here
    return () => {
      setIncomingStreamsSummary(undefined);
      setOutgoingStreamsSummary(undefined);
      setStreamingAccountsSummary(undefined);
      setCanDisplayIncomingBalance(false);
      setCanDisplayOutgoingBalance(false);
      setCanDisplayTotalAccountBalance(false);
    };
  }, []);

  const renderWithdrawalBalance = () => {
    if (withdrawalBalance) {
      return toUsCurrency(withdrawalBalance);
    }
    return '$0.00';
  };

  const renderUnallocatedBalance = () => {
    if (unallocatedBalance) {
      return toUsCurrency(unallocatedBalance);
    }
    return '$0.00';
  };

  const renderIncomingRatePerSecond = () => {
    if (rateIncomingPerSecond) {
      return rateIncomingPerSecond > 0 && rateIncomingPerSecond < 0.01
        ? '< $0.01/second'
        : `+ $${cutNumber(rateIncomingPerSecond, 4)}/second`;
    }

    return '$0.00/second';
  };

  const renderIncomingRatePerDay = () => {
    if (rateIncomingPerDay) {
      return rateIncomingPerDay > 0 && rateIncomingPerDay < 0.01
        ? '< $0.01/day'
        : `+ $${cutNumber(rateIncomingPerDay, 4)}/day`;
    }

    return '$0.00/day';
  };

  const renderOutgoingRatePerSecond = () => {
    if (rateOutgoingPerSecond) {
      return rateOutgoingPerSecond > 0 && rateOutgoingPerSecond < 0.01
        ? '< $0.01/second'
        : `- $${cutNumber(rateOutgoingPerSecond, 4)}/second`;
    }

    return '$0.00/second';
  };

  const renderOutgoingRatePerDay = () => {
    if (rateOutgoingPerDay) {
      return rateOutgoingPerDay > 0 && rateOutgoingPerDay < 0.01
        ? '< $0.01/day'
        : `- $${cutNumber(rateOutgoingPerDay, 4)}/day`;
    }

    return '$0.00/day';
  };

  const renderSummary = (
    <Row gutter={[8, 8]} className='ml-0 mr-0'>
      <Col
        xs={11}
        sm={11}
        md={11}
        lg={11}
        className='background-card simplelink bg-secondary-02 hover-list'
        onClick={goToIncomingTabHandler}
      >
        {/* Background animation */}
        {hasIncomingStreamsRunning && hasIncomingStreamsRunning > 0
          ? !loadingTreasuries &&
            !loadingStreams && (
              <div className='stream-background stream-background-incoming'>
                <img className='inbound' src='/assets/incoming-crypto.svg' alt='' />
              </div>
            )
          : null}
        <div className='incoming-stream-amount'>
          <div className='incoming-stream-running mb-1'>
            <div className='d-flex align-items-center text-center'>
              <h4>
                {loadingTreasuries || loadingStreams ? (
                  <IconLoading className='mean-svg-icons' style={{ height: '12px', lineHeight: '12px' }} />
                ) : (
                  formatThousands(incomingAmount as number)
                )}
                <span className='ml-1'>Incoming streams</span>
              </h4>
              <span className='info-icon'>
                {hasIncomingStreamsRunning && hasIncomingStreamsRunning > 0 ? (
                  <ArrowDownOutlined className='mean-svg-icons incoming bounce ml-1' />
                ) : (
                  <ArrowDownOutlined className='mean-svg-icons incoming ml-1' />
                )}
              </span>
            </div>
          </div>
          <div className='incoming-stream-rates'>
            {loadingTreasuries || loadingStreams ? (
              <IconLoading className='mean-svg-icons' style={{ height: '12px', lineHeight: '12px' }} />
            ) : (
              <span className='incoming-amount'>{renderIncomingRatePerSecond()}</span>
            )}
            {loadingTreasuries || loadingStreams ? (
              <IconLoading className='mean-svg-icons' style={{ height: '12px', lineHeight: '12px' }} />
            ) : (
              <span className='incoming-amount'>{renderIncomingRatePerDay()}</span>
            )}
          </div>
        </div>
        <div className='stream-balance'>
          <div className='info-label'>Available to withdraw:</div>
          <div className='info-value'>
            {loadingStreams || !canDisplayIncomingBalance ? (
              <IconLoading className='mean-svg-icons' style={{ height: '12px', lineHeight: '12px' }} />
            ) : (
              renderWithdrawalBalance()
            )}
          </div>
        </div>
        {!loadingTreasuries && !loadingStreams && (
          <div className='wave-container wave wave-green'>
            <Wave
              fill='url(#gradient1)'
              paused={isWavesPaused}
              className='svg-container'
              style={{
                height: `${withdrawalScale}vh`,
                position: 'absolute',
                bottom: 0,
              }}
              options={{
                amplitude: 6,
                speed: 0.25,
                points: 6,
              }}
            >
              <defs>
                <linearGradient id='gradient1' gradientTransform='rotate(180)'>
                  <stop offset='10%' stopColor='#006820' />
                  <stop offset='100%' stopColor='#181a2a' />
                </linearGradient>
              </defs>
            </Wave>
          </div>
        )}
      </Col>
      <Col
        xs={11}
        sm={11}
        md={11}
        lg={11}
        className='background-card simplelink bg-secondary-02 hover-list'
        onClick={goToOutgoingTabHandler}
      >
        {/* Background animation */}
        {hasOutgoingStreamsRunning && hasOutgoingStreamsRunning > 0
          ? !loadingTreasuries &&
            !loadingStreams && (
              <div className='stream-background stream-background-outgoing'>
                <img className='inbound' src='/assets/outgoing-crypto.svg' alt='' />
              </div>
            )
          : null}
        <div className='outgoing-stream-amount'>
          <div className='outgoing-stream-running mb-1'>
            <div className='d-flex align-items-center text-center'>
              <h4>
                {loadingTreasuries || loadingStreams ? (
                  <IconLoading className='mean-svg-icons' style={{ height: '12px', lineHeight: '12px' }} />
                ) : (
                  formatThousands(outgoingAmount as number)
                )}
                <span className='ml-1'>Outgoing streams</span>
              </h4>
              <span className='info-icon'>
                {hasOutgoingStreamsRunning && hasOutgoingStreamsRunning > 0 ? (
                  <ArrowUpOutlined className='mean-svg-icons outgoing bounce ml-1' />
                ) : (
                  <ArrowUpOutlined className='mean-svg-icons outgoing ml-1' />
                )}
              </span>
            </div>
          </div>
          <div className='outgoing-stream-rates'>
            {loadingTreasuries || loadingStreams ? (
              <IconLoading className='mean-svg-icons' style={{ height: '12px', lineHeight: '12px' }} />
            ) : (
              <span className='outgoing-amount'>{renderOutgoingRatePerSecond()}</span>
            )}
            {loadingTreasuries || loadingStreams ? (
              <IconLoading className='mean-svg-icons' style={{ height: '12px', lineHeight: '12px' }} />
            ) : (
              <span className='outgoing-amount'>{renderOutgoingRatePerDay()}</span>
            )}
          </div>
        </div>
        <div className='stream-balance'>
          <div className='info-label'>Remaining balance:</div>
          <div className='info-value'>
            {loadingStreams || loadingTreasuries || !canDisplayOutgoingBalance ? (
              <IconLoading className='mean-svg-icons' style={{ height: '12px', lineHeight: '12px' }} />
            ) : (
              renderUnallocatedBalance()
            )}
          </div>
        </div>
        {!loadingTreasuries && !loadingStreams && (
          <div className='wave-container wave wave-red'>
            <Wave
              fill='url(#gradient2)'
              paused={isWavesPaused}
              className='svg-container'
              style={{
                height: `${unallocatedScale}vh`,
                position: 'absolute',
                bottom: 0,
              }}
              options={{
                amplitude: 6,
                speed: 0.25,
                points: 6,
              }}
            >
              <defs>
                <linearGradient id='gradient2' gradientTransform='rotate(180)'>
                  <stop offset='10%' stopColor='#b7001c' />
                  <stop offset='100%' stopColor='#181a2a' />
                </linearGradient>
              </defs>
            </Wave>
          </div>
        )}
      </Col>
    </Row>
  );

  // Incoming streams list
  const renderListOfIncomingStreams = () => {
    if (loadingStreams) {
      return <span className='pl-1'>Loading incoming streams ...</span>;
    }
    if (incomingStreamList === undefined || incomingStreamList.length === 0) {
      return <span className='pl-1'>You don't have any incoming streams</span>;
    }

    return incomingStreamList.map((stream, index) => {
      const onSelectStream = () => {
        // Sends outgoing stream value to the parent component "Accounts"
        onSendFromIncomingStreamInfo?.(stream);
      };

      const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
        event.currentTarget.src = FALLBACK_COIN_IMAGE;
        event.currentTarget.className = 'error';
      };

      const v1 = stream as StreamInfo;
      const v2 = stream as Stream;
      const isNew = stream.version >= 2;

      const associatedToken = getStreamAssociatedMint(stream);
      const token = getTokenByMintAddress(associatedToken);

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
            <Identicon
              address={associatedToken}
              style={{ width: '30', display: 'inline-flex' }}
              className='token-img'
            />
          );
        }
      } else {
        img = (
          <Identicon
            address={isNew ? v2.id.toBase58() : v1.id?.toString()}
            style={{ width: '30', display: 'inline-flex' }}
            className='token-img'
          />
        );
      }

      const title = stream ? getStreamTitle(stream, t) : 'Unknown incoming stream';
      const subtitle = getStreamSubtitle(stream) ?? '0.00';
      const status = t(getStreamStatusLabel(stream));

      const withdrawResume = isNew
        ? displayAmountWithSymbol(v2.withdrawableAmount, associatedToken, token?.decimals ?? 9, splTokenList)
        : getAmountWithSymbol(v1.escrowVestedAmount, associatedToken, false, splTokenList, token?.decimals ?? 9);

      return (
        <div
          key={`incoming-stream-${stream.id?.toString()}`}
          onKeyDown={() => {}}
          onClick={onSelectStream}
          className={`w-100 simplelink hover-list ${(index + 1) % 2 === 0 ? '' : 'bg-secondary-02'}`}
        >
          <ResumeItem
            id={index}
            img={img}
            title={title}
            subtitle={subtitle}
            resume={
              (isNew && v2.withdrawableAmount.gtn(0)) || (!isNew && v1.escrowVestedAmount > 0) ? (
                `${withdrawResume} available`
              ) : (
                <StreamStatusSummary stream={stream} />
              )
            }
            status={status}
            hasRightIcon={true}
            rightIcon={<IconArrowForward className='mean-svg-icons' />}
            isLink={true}
            isStream={true}
            classNameRightContent='resume-stream-row'
            classNameIcon='icon-stream-row'
          />
        </div>
      );
    });
  };

  // Outgoing streams list
  const renderListOfOutgoingStreams = () => {
    if (loadingStreams) {
      return <span className='pl-1'>Loading outgoing streams ...</span>;
    }
    if (outgoingStreamList === undefined || outgoingStreamList.length === 0) {
      return <span className='pl-1'>You don't have any outgoing streams</span>;
    }

    return outgoingStreamList.map((stream, index) => {
      const onSelectStream = () => {
        // Sends outgoing stream value to the parent component "Accounts"
        onSendFromOutgoingStreamInfo?.(stream);
      };

      const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
        event.currentTarget.src = FALLBACK_COIN_IMAGE;
        event.currentTarget.className = 'error';
      };

      const v1 = stream as StreamInfo;
      const v2 = stream as Stream;
      const isNew = stream.version >= 2;

      const associatedToken = getStreamAssociatedMint(stream);
      const token = getTokenByMintAddress(associatedToken);

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
            <Identicon
              address={associatedToken}
              style={{ width: '30', display: 'inline-flex' }}
              className='token-img'
            />
          );
        }
      } else {
        img = (
          <Identicon
            address={isNew ? v2.id.toBase58() : v1.id?.toString()}
            style={{ width: '30', display: 'inline-flex' }}
            className='token-img'
          />
        );
      }

      const title = stream ? getStreamTitle(stream, t) : 'Unknown outgoing stream';
      const subtitle = getStreamSubtitle(stream) || '0.00';
      const status = t(getStreamStatusLabel(stream));

      return (
        <div
          key={`outgoing-stream-${stream.id?.toString()}}`}
          onKeyDown={() => {}}
          onClick={onSelectStream}
          className={`w-100 simplelink hover-list ${(index + 1) % 2 === 0 ? '' : 'bg-secondary-02'}`}
        >
          <ResumeItem
            id={index}
            img={img}
            title={title}
            subtitle={subtitle}
            resume={<StreamStatusSummary stream={stream} />}
            status={status}
            hasRightIcon={true}
            rightIcon={<IconArrowForward className='mean-svg-icons' />}
            isLink={true}
            isStream={true}
            classNameRightContent='resume-stream-row'
            classNameIcon='icon-stream-row'
          />
        </div>
      );
    });
  };

  // Streaming accounts list
  const renderListOfStreamingAccounts = () => {
    if (loadingStreams || loadingTreasuries) {
      return <span className='pl-1'>Loading streaming accounts ...</span>;
    }
    if (treasuryList === undefined || treasuryList.length === 0) {
      return <span className='pl-1'>You don't have any streaming accounts</span>;
    }

    return treasuryList.map((streamingAccount, index) => {
      const v1 = streamingAccount as unknown as TreasuryInfo;
      const v2 = streamingAccount as PaymentStreamingAccount;
      const isNew = isNewTreasury(streamingAccount);

      const onSelectedStreamingAccount = () => {
        // Sends outgoing stream value to the parent component "Accounts"
        onSendFromStreamingAccountInfo?.(streamingAccount);
      };

      const treasuryType = isNew ? +v2.accountType : +v1.type;
      const type = treasuryType === 0 ? 'Open' : 'Locked';

      const badges = [type];

      const title = isNew ? v2.name : v1.label || shortenAddress(v1.id, 8);
      const subtitle = shortenAddress(streamingAccount.id as string, 8);
      const amount = isNew ? v2.totalStreams : v1.streamsAmount;
      const resume = amount > 1 ? 'streams' : 'stream';

      return (
        <div
          key={`streaming-account-${streamingAccount.id?.toString()}`}
          onKeyDown={() => {}}
          onClick={onSelectedStreamingAccount}
          className={`w-100 simplelink hover-list ${(index + 1) % 2 === 0 ? '' : 'bg-secondary-02'}`}
        >
          <ResumeItem
            title={title}
            extraTitle={badges}
            classNameTitle='text-uppercase'
            subtitle={subtitle}
            amount={amount}
            resume={resume}
            className='simplelink'
            hasRightIcon={true}
            rightIcon={<IconArrowForward className='mean-svg-icons' />}
            isLink={true}
            onClick={onSelectedStreamingAccount}
            classNameRightContent='resume-streaming-row'
            classNameIcon='icon-streaming-row'
          />
        </div>
      );
    });
  };

  const outgoingCount = () => {
    if (loadingStreams) {
      return '';
    }
    return ` (${outgoingAmount && outgoingAmount >= 0 && outgoingAmount})`;
  };

  // Tabs
  const tabs = [
    {
      key: 'summary',
      label: 'Summary',
      children: renderSummary,
    },
    {
      key: 'streaming-accounts',
      label: `Accounts ${
        !loadingTreasuries && !loadingStreams
          ? `(${streamingAccountsAmount && streamingAccountsAmount >= 0 && streamingAccountsAmount})`
          : ''
      }`,
      children: renderListOfStreamingAccounts(),
    },
    {
      key: 'incoming',
      label: `Incoming ${
        !loadingTreasuries && !loadingStreams ? `(${incomingAmount && incomingAmount >= 0 && incomingAmount})` : ''
      }`,
      children: renderListOfIncomingStreams(),
    },
    {
      key: 'outgoing',
      label: `Outgoing${outgoingCount()}`,
      children: renderListOfOutgoingStreams(),
    },
  ];

  const renderTabset = () => {
    return <Tabs items={tabs} activeKey={selectedTab} onChange={onTabChange} className='neutral' />;
  };

  const renderDropdownMenu = useCallback(() => {
    const items: ItemType<MenuItemType>[] = [];
    if (isMultisigContext) {
      items.push({
        key: '01-create-stream',
        label: (
          <div onKeyDown={() => {}} onClick={showCreateStreamModal}>
            <span className='menu-item-text'>Create stream</span>
          </div>
        ),
      });
    } else {
      items.push({
        key: '02-find-stream',
        label: (
          <div onKeyDown={() => {}} onClick={showOpenStreamModal}>
            <span className='menu-item-text'>Find stream</span>
          </div>
        ),
      });
    }

    return { items };
  }, [isMultisigContext, showCreateStreamModal, showOpenStreamModal]);

  return (
    <>
      <Spin spinning={loadingStreams || loadingTreasuries}>
        <RightInfoDetails infoData={infoData} />

        <div className='flex-fixed-right cta-row mb-2 pl-1'>
          <Space className='left' size='middle' wrap>
            <Button
              type='primary'
              shape='round'
              size='small'
              className='thin-stroke btn-min-width'
              onClick={showCreateTreasuryModal}
            >
              Create account
            </Button>
            {!isMultisigContext && (
              <Button
                type='primary'
                shape='round'
                size='small'
                className='thin-stroke btn-min-width'
                onClick={showCreateMoneyStreamModal}
              >
                Create stream
              </Button>
            )}
            {isMultisigContext && (
              <Button
                type='primary'
                shape='round'
                size='small'
                className='thin-stroke btn-min-width'
                onClick={showAddFundsModal}
              >
                Fund account
              </Button>
            )}
            {!isXsDevice && isMultisigContext && (
              <Button
                type='primary'
                shape='round'
                size='small'
                className='thin-stroke btn-min-width'
                onClick={showCreateStreamModal}
              >
                Create stream
              </Button>
            )}
            {!isXsDevice && !isMultisigContext && (
              <Button
                type='primary'
                shape='round'
                size='small'
                className='thin-stroke btn-min-width'
                onClick={showOpenStreamModal}
              >
                Find stream
              </Button>
            )}
          </Space>
          {isXsDevice && (
            <Dropdown
              className='options-dropdown'
              menu={renderDropdownMenu()}
              placement='bottomRight'
              trigger={['click']}
            >
              <span className='icon-button-container ml-1'>
                <Button
                  type='default'
                  shape='circle'
                  size='middle'
                  icon={<IconEllipsisVertical className='mean-svg-icons' />}
                  onClick={e => e.preventDefault()}
                />
              </span>
            </Dropdown>
          )}
        </div>

        {renderTabset()}
      </Spin>

      {multisigClient && isCreateStreamModalVisible && (
        <TreasuryStreamCreateModal
          associatedToken=''
          connection={connection}
          handleClose={closeCreateStreamModal}
          handleOk={closeCreateStreamModal}
          isVisible={isCreateStreamModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          withdrawTransactionFees={withdrawTransactionFees}
          treasuryDetails={undefined}
          treasuryList={treasuryList?.filter(t => t.version >= 2)}
          minRequiredBalance={minRequiredBalance}
          multisigClient={multisigClient}
          selectedMultisig={selectedMultisig}
        />
      )}

      {isOpenStreamModalVisible && (
        <StreamOpenModal
          isVisible={isOpenStreamModalVisible}
          handleOk={onAcceptOpenStream}
          handleClose={closeOpenStreamModal}
        />
      )}

      {isCreateTreasuryModalVisible && (
        <TreasuryCreateModal
          isVisible={isCreateTreasuryModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          handleOk={onAcceptCreateTreasury}
          handleClose={closeCreateTreasuryModal}
          isBusy={isBusy}
          selectedMultisig={selectedMultisig}
          multisigAccounts={isMultisigContext ? multisigAccounts : undefined}
        />
      )}

      {isCreateMoneyStreamModalOpen && (
        <SendAssetModal
          selectedToken={undefined}
          title='Create outgoing stream'
          selected='recurring'
          isVisible={isCreateMoneyStreamModalOpen}
          handleClose={hideCreateMoneyStreamModal}
        />
      )}

      {isAddFundsModalVisible && (
        <TreasuryAddFundsModal
          handleOk={(params: TreasuryTopupParams) => onAcceptAddFunds(params)}
          handleClose={closeAddFundsModal}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          withdrawTransactionFees={withdrawTransactionFees}
          treasuryDetails={undefined}
          treasuryList={treasuryList}
          isVisible={isAddFundsModalVisible}
          selectedMultisig={selectedMultisig ?? undefined}
          userBalances={userBalances}
          treasuryStreams={undefined}
          associatedToken=''
          isBusy={isBusy}
        />
      )}
    </>
  );
};
