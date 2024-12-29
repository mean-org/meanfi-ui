import {
  DEFAULT_EXPIRATION_TIME_SECONDS,
  MULTISIG_ACTIONS,
  type MultisigInfo,
  type MultisigTransactionFees,
  getFees,
} from '@mean-dao/mean-multisig-sdk';
import {
  Constants,
  MSP_ACTIONS,
  calculateActionFees,
  refreshTreasuryBalanceInstruction,
} from '@mean-dao/money-streaming';
import type { StreamInfo, TreasuryInfo } from '@mean-dao/money-streaming/lib/types';
import {
  ACTION_CODES,
  type AccountActivity,
  AccountType,
  ActivityActionCode,
  type AddFundsToAccountTransactionAccounts,
  type AllocateFundsToStreamTransactionAccounts,
  type CloseAccountTransactionAccounts,
  FEE_ACCOUNT,
  NATIVE_SOL_MINT,
  type PaymentStreamingAccount,
  type RefreshAccountDataTransactionAccounts,
  type Stream,
  type TransactionFees,
  type WithdrawFromAccountTransactionAccounts,
  calculateFeesForAction,
} from '@mean-dao/payment-streaming';
import { BN } from '@project-serum/anchor';
import { AccountLayout, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  type TransactionInstruction,
  type VersionedTransaction,
} from '@solana/web3.js';
import { Alert, Button, Dropdown, Row, Space, Spin, Tabs } from 'antd';
import type { ItemType, MenuItemType } from 'antd/lib/menu/interface';
import { type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isMobile } from 'react-device-detect';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import { IconArrowBack, IconArrowForward, IconEllipsisVertical, IconExternalLink } from 'src/Icons';
import {
  FALLBACK_COIN_IMAGE,
  MEAN_MULTISIG_ACCOUNT_LAMPORTS,
  NO_FEES,
  SOLANA_EXPLORER_URI_INSPECT_TRANSACTION,
  WRAPPED_SOL_MINT_ADDRESS,
} from 'src/app-constants/common';
import { NATIVE_SOL } from 'src/app-constants/tokens';
import { CopyExtLinkGroup } from 'src/components/CopyExtLinkGroup';
import { Identicon } from 'src/components/Identicon';
import { openNotification } from 'src/components/Notifications';
import { ResumeItem } from 'src/components/ResumeItem';
import { SolBalanceModal } from 'src/components/SolBalanceModal';
import { StreamStatusSummary } from 'src/components/StreamStatusSummary';
import { TreasuryAddFundsModal } from 'src/components/TreasuryAddFundsModal';
import { TreasuryCloseModal } from 'src/components/TreasuryCloseModal';
import { TreasuryStreamCreateModal } from 'src/components/TreasuryStreamCreateModal';
import { TreasuryTransferFundsModal } from 'src/components/TreasuryTransferFundsModal';
import { AppStateContext } from 'src/contexts/appstate';
import { getSolanaExplorerClusterParam, useConnection } from 'src/contexts/connection';
import { TxConfirmationContext } from 'src/contexts/transaction-status';
import { useWallet } from 'src/contexts/wallet';
import useLocalStorage from 'src/hooks/useLocalStorage';
import useWindowSize from 'src/hooks/useWindowResize';
import { customLogger } from 'src/main';
import { getTokenAccountBalanceByAddress } from 'src/middleware/accounts';
import { SOL_MINT } from 'src/middleware/ids';
import { getStreamStatusLabel } from 'src/middleware/streamHelpers';
import { getStreamTitle } from 'src/middleware/token-streaming-utils/get-stream-title';
import { getStreamAssociatedMint } from 'src/middleware/token-streaming-utils/getStreamAssociatedMint';
import { getStreamingAccountId } from 'src/middleware/token-streaming-utils/getStreamingAccountId';
import { getStreamingAccountMint } from 'src/middleware/token-streaming-utils/getStreamingAccountMint';
import { getStreamingAccountType } from 'src/middleware/token-streaming-utils/getStreamingAccountType';
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
  getShortDate,
  getTransactionStatusForLogs,
  isProd,
} from 'src/middleware/ui';
import {
  displayAmountWithSymbol,
  findATokenAddress,
  formatThousands,
  getAmountFromLamports,
  getAmountWithSymbol,
  getTokenOrCustomToken,
  getTxIxResume,
  makeInteger,
  openLinkInNewTab,
  shortenAddress,
  toTokenAmountBn,
} from 'src/middleware/utils';
import type { TokenInfo } from 'src/models/SolanaTokenInfo';
import type { TreasuryTopupParams } from 'src/models/common-types';
import { OperationType, TransactionStatus } from 'src/models/enums';
import { ZERO_FEES } from 'src/models/multisig';
import type { TreasuryWithdrawParams } from 'src/models/treasuries';
import type { AddFundsParams } from 'src/models/vesting';
import { useFetchAccountTokens } from 'src/query-hooks/accountTokens';
import useMultisigClient from 'src/query-hooks/multisigClient';
import useStreamingClient from 'src/query-hooks/streamingClient';
import type { LooseObject } from 'src/types/LooseObject';

interface StreamingAccountViewProps {
  multisigAccounts: MultisigInfo[] | undefined;
  onSendFromStreamingAccountDetails?: () => void;
  onSendFromStreamingAccountStreamInfo?: (stream: Stream | StreamInfo) => void;
  selectedMultisig: MultisigInfo | undefined;
  streamingAccountSelected: PaymentStreamingAccount | TreasuryInfo | undefined;
  treasuryList: (PaymentStreamingAccount | TreasuryInfo)[] | undefined;
}

export const StreamingAccountView = ({
  multisigAccounts,
  onSendFromStreamingAccountDetails,
  onSendFromStreamingAccountStreamInfo,
  selectedMultisig,
  streamingAccountSelected,
  treasuryList,
}: StreamingAccountViewProps) => {
  const {
    splTokenList,
    selectedAccount,
    transactionStatus,
    setHighLightableStreamId,
    getTokenByMintAddress,
    setTransactionStatus,
    resetContractValues,
  } = useContext(AppStateContext);
  const { confirmationHistory, enqueueTransactionConfirmation } = useContext(TxConfirmationContext);

  const { publicKey, connected, wallet } = useWallet();
  const connection = useConnection();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation('common');
  const { width } = useWindowSize();
  const { address, streamingItemId } = useParams();
  const [isXsDevice, setIsXsDevice] = useState<boolean>(isMobile);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | undefined>(undefined);
  // Streaming account
  const [streamingAccountStreams, setStreamingAccountStreams] = useState<Array<Stream | StreamInfo> | undefined>(
    undefined,
  );
  const [loadingStreamingAccountStreams, setLoadingStreamingAccountStreams] = useState(true);
  // Transactions
  const [nativeBalance, setNativeBalance] = useState(0);
  const [userBalances, setUserBalances] = useState<LooseObject>();
  const [transactionFees, setTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [withdrawTransactionFees, setWithdrawTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [multisigTransactionFees, setMultisigTransactionFees] = useState<MultisigTransactionFees>(ZERO_FEES);
  const [minRequiredBalance, setMinRequiredBalance] = useState(0);
  const [streamingAccountActivity, setStreamingAccountActivity] = useState<AccountActivity[]>([]);
  const [loadingStreamingAccountActivity, setLoadingStreamingAccountActivity] = useState(false);
  const [hasMoreStreamingAccountActivity, setHasMoreStreamingAccountActivity] = useState<boolean>(true);
  const [associatedTokenBalance, setAssociatedTokenBalance] = useState(new BN(0));
  const [treasuryEffectiveBalance, setTreasuryEffectiveBalance] = useState(0);

  const sourceAccount = selectedMultisig ? selectedMultisig.authority.toBase58() : publicKey?.toBase58();
  const { data: sourceAccountTokens } = useFetchAccountTokens(sourceAccount);

  ////////////
  //  Init  //
  ////////////

  const [transactionPriorityOptions] = useLocalStorage<ComputeBudgetConfig>(
    'transactionPriority',
    DEFAULT_BUDGET_CONFIG,
  );

  const { tokenStreamingV1, tokenStreamingV2, streamV2ProgramAddress } = useStreamingClient();
  const mspV2AddressPK = useMemo(() => new PublicKey(streamV2ProgramAddress), [streamV2ProgramAddress]);
  const { multisigClient } = useMultisigClient();

  const isMultisigContext = useMemo(() => {
    return !!(publicKey && selectedAccount.isMultisig);
  }, [publicKey, selectedAccount]);

  const isNewTreasury = useMemo(() => {
    if (!streamingAccountSelected) {
      return false;
    }

    return !!(streamingAccountSelected.version && streamingAccountSelected.version >= 2);
  }, [streamingAccountSelected]);

  /////////////////////////
  // Callbacks & Getters //
  /////////////////////////

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Idle,
      currentOperation: TransactionStatus.Idle,
    });
  }, [setTransactionStatus]);

  const getRateAmountBn = useCallback(
    (item: Stream | StreamInfo) => {
      if (item && selectedToken) {
        const rateAmount =
          item.version < 2 ? toTokenAmountBn(item.rateAmount as number, selectedToken.decimals) : item.rateAmount;
        return rateAmount;
      }
      return new BN(0);
    },
    [selectedToken],
  );

  const getTransactionFees = useCallback(
    async (action: MSP_ACTIONS): Promise<TransactionFees> => {
      return await calculateActionFees(connection, action);
    },
    [connection],
  );

  const getTransactionFeesV2 = useCallback(async (action: ACTION_CODES): Promise<TransactionFees> => {
    return await calculateFeesForAction(action);
  }, []);

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

  const getQueryTabOption = useCallback(() => {
    let tabOptionInQuery: string | null = null;
    if (searchParams) {
      tabOptionInQuery = searchParams.get('v');
      if (tabOptionInQuery) {
        return tabOptionInQuery;
      }
    }
    return undefined;
  }, [searchParams]);

  const navigateToTab = useCallback(
    (tab: string) => {
      setSearchParams({ v: tab });
    },
    [setSearchParams],
  );

  const getSearchSignatureMarker = useCallback(
    (clearHistory: boolean) => {
      const activityLength = streamingAccountActivity.length;
      if (clearHistory) {
        return '';
      }
      if (activityLength > 0) {
        return streamingAccountActivity[activityLength - 1].signature;
      }

      return '';
    },
    [streamingAccountActivity],
  );

  const getActivitiesCopy = useCallback(
    (clearHistory: boolean) => {
      const activityLength = streamingAccountActivity.length;
      if (clearHistory) {
        return [];
      }
      if (activityLength > 0) {
        return JSON.parse(JSON.stringify(streamingAccountActivity));
      }

      return [];
    },
    [streamingAccountActivity],
  );

  const getStreamingAccountActivity = useCallback(
    (streamingAccountSelectedId: string, clearHistory = false) => {
      if (!streamingAccountSelectedId || !tokenStreamingV2 || loadingStreamingAccountActivity) {
        return;
      }

      consoleOut('Loading streaming account activity...', '', 'crimson');

      setLoadingStreamingAccountActivity(true);
      const streamingAccountPublicKey = new PublicKey(streamingAccountSelectedId);

      const before = getSearchSignatureMarker(clearHistory);
      consoleOut('before:', before, 'crimson');
      tokenStreamingV2
        .listAccountActivity(streamingAccountPublicKey, before, 5)
        .then(value => {
          consoleOut('Streaming Account activity:', value);
          const activities = getActivitiesCopy(clearHistory);

          if (value && value.length > 0) {
            activities.push(...value);
            setHasMoreStreamingAccountActivity(true);
          } else {
            setHasMoreStreamingAccountActivity(false);
          }
          setStreamingAccountActivity(activities);
        })
        .catch(err => {
          console.error(err);
          setStreamingAccountActivity([]);
          setHasMoreStreamingAccountActivity(false);
        })
        .finally(() => setLoadingStreamingAccountActivity(false));
    },
    [getActivitiesCopy, getSearchSignatureMarker, loadingStreamingAccountActivity, tokenStreamingV2],
  );

  const getStreamingAccountName = useCallback(() => {
    if (streamingAccountSelected) {
      const v1 = streamingAccountSelected as TreasuryInfo;
      const v2 = streamingAccountSelected as PaymentStreamingAccount;
      return isNewTreasury ? v2.name.trim() : v1.label.trim();
    }
    return '';
  }, [isNewTreasury, streamingAccountSelected]);

  const getAccountOwner = useCallback((account: TreasuryInfo | PaymentStreamingAccount) => {
    const v1 = account as TreasuryInfo;
    const v2 = account as PaymentStreamingAccount;
    return account.version < 2 ? new PublicKey(v1.treasurerAddress) : v2.owner;
  }, []);

  const getStreamingAccountActivityAssociatedToken = (item: AccountActivity) => {
    let message = '';

    if (!selectedToken) {
      return message;
    }

    const amount = displayAmountWithSymbol(
      new BN(item.amount ?? 0),
      selectedToken.address,
      selectedToken.decimals,
      splTokenList,
      true,
      false,
    );

    switch (item.actionCode) {
      case ActivityActionCode.FundsAddedToAccount:
      case ActivityActionCode.FundsWithdrawnFromAccount:
        message += `${amount} ${selectedToken?.symbol}`;
        break;
      case ActivityActionCode.StreamCreated:
      case ActivityActionCode.FundsAllocatedToStream:
      case ActivityActionCode.FundsWithdrawnFromStream:
        message += `${amount} ${selectedToken?.symbol}`;
        break;
      default:
        message += '--';
        break;
    }
    return message;
  };

  const isTreasurer = useCallback((): boolean => {
    if (!selectedAccount?.address || !streamingAccountSelected) {
      return false;
    }

    const isNew = streamingAccountSelected.version >= 2;
    const v1 = streamingAccountSelected as TreasuryInfo;
    const v2 = streamingAccountSelected as PaymentStreamingAccount;
    const treasurer = isNew ? v2.owner.toBase58() : (v1.treasurerAddress as string);
    return treasurer === selectedAccount.address;
  }, [selectedAccount, streamingAccountSelected]);

  const hasStreamingAccountPendingTx = useCallback(
    (type?: OperationType) => {
      if (!streamingAccountSelected) {
        return false;
      }

      if (confirmationHistory && confirmationHistory.length > 0) {
        if (type !== undefined) {
          return confirmationHistory.some(
            h =>
              h.extras === streamingAccountSelected.id &&
              h.txInfoFetchStatus === 'fetching' &&
              h.operationType === type,
          );
        }
        return confirmationHistory.some(
          h => h.extras === streamingAccountSelected.id && h.txInfoFetchStatus === 'fetching',
        );
      }

      return false;
    },
    [confirmationHistory, streamingAccountSelected],
  );

  const getRateAmountDisplay = useCallback(
    (item: Stream | StreamInfo): string => {
      if (!selectedToken) {
        return '';
      }

      const rateAmount = getRateAmountBn(item);
      const value = displayAmountWithSymbol(
        rateAmount,
        selectedToken.address,
        selectedToken.decimals,
        splTokenList,
        true,
        true,
      );

      return value;
    },
    [getRateAmountBn, selectedToken, splTokenList],
  );

  const getDepositAmountDisplay = useCallback(
    (item: Stream | StreamInfo): string => {
      if (!selectedToken) {
        return '';
      }

      let value = '';
      let associatedToken = '';

      if (item.version < 2) {
        associatedToken = (item as StreamInfo).associatedToken as string;
      } else {
        associatedToken = (item as Stream).mint.toBase58();
      }

      if (item.rateIntervalInSeconds === 0) {
        if (item.version < 2) {
          const allocationAssigned = new BN(item.allocationAssigned).toNumber();
          value += getAmountWithSymbol(
            allocationAssigned,
            selectedToken.address,
            true,
            splTokenList,
            selectedToken.decimals,
            true,
          );
        } else {
          const allocationAssigned = new BN(item.allocationAssigned);
          value += displayAmountWithSymbol(
            allocationAssigned,
            selectedToken.address,
            selectedToken.decimals,
            splTokenList,
            true,
            false,
          );
        }

        value += ' ';
        value += selectedToken ? selectedToken.symbol : `[${shortenAddress(associatedToken)}]`;
      }

      return value;
    },
    [selectedToken, splTokenList],
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
    [getRateAmountDisplay, getDepositAmountDisplay, t],
  );

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
        if (isNewTreasury) {
          return unallocated;
        }

        return makeInteger((tsry as TreasuryInfo).balance - (tsry as TreasuryInfo).allocationAssigned, decimals);
      }
      return new BN(0);
    },
    [isNewTreasury],
  );

  const getStreamingAccountStreams = useCallback(
    (treasuryPk: PublicKey, isNewAccount: boolean) => {
      if (!publicKey || !tokenStreamingV1) {
        return;
      }

      consoleOut('Executing getStreamingAccountStreams...', '', 'blue');

      if (isNewAccount && tokenStreamingV2) {
        tokenStreamingV2
          .listStreams({ psAccount: treasuryPk })
          .then(streams => {
            consoleOut('treasuryStreams:', streams, 'blue');
            setStreamingAccountStreams(streams);
          })
          .catch(err => {
            console.error(err);
            setStreamingAccountStreams([]);
          })
          .finally(() => {
            setLoadingStreamingAccountStreams(false);
          });

        return;
      }

      if (tokenStreamingV1) {
        tokenStreamingV1
          .listStreams({ treasury: treasuryPk })
          .then(streams => {
            consoleOut('treasuryStreams:', streams, 'blue');
            setStreamingAccountStreams(streams);
          })
          .catch(err => {
            console.error(err);
            setStreamingAccountStreams([]);
          })
          .finally(() => {
            setLoadingStreamingAccountStreams(false);
          });
      }
    },
    [tokenStreamingV1, tokenStreamingV2, publicKey],
  );

  ////////////////
  ///  MODALS  ///
  ////////////////

  // SOL Balance Modal
  const [isSolBalanceModalOpen, setIsSolBalanceModalOpen] = useState(false);
  const hideSolBalanceModal = useCallback(() => setIsSolBalanceModalOpen(false), []);
  const showSolBalanceModal = useCallback(() => setIsSolBalanceModalOpen(true), []);

  // Create Stream modal
  const [isCreateStreamModalVisible, setIsCreateStreamModalVisibility] = useState(false);
  const showCreateStreamModal = useCallback(() => {
    resetTransactionStatus();
    getMultisigTxProposalFees();
    getTransactionFeesV2(ACTION_CODES.CreateStreamWithFunds).then(value => {
      setTransactionFees(value);
      consoleOut('transactionFees:', value, 'orange');
    });
    getTransactionFeesV2(ACTION_CODES.WithdrawFromStream).then(value => {
      setWithdrawTransactionFees(value);
      consoleOut('withdrawTransactionFees:', value, 'orange');
    });
    setIsCreateStreamModalVisibility(true);
  }, [getTransactionFeesV2, resetTransactionStatus, getMultisigTxProposalFees]);

  const closeCreateStreamModal = useCallback(() => {
    setIsCreateStreamModalVisibility(false);
    resetContractValues();
    resetTransactionStatus();
  }, [resetContractValues, resetTransactionStatus]);

  // Add funds modal
  const [isAddFundsModalVisible, setIsAddFundsModalVisibility] = useState(false);
  const showAddFundsModal = useCallback(() => {
    resetTransactionStatus();
    getMultisigTxProposalFees();
    if (!streamingAccountSelected) {
      return;
    }
    const v2 = streamingAccountSelected as PaymentStreamingAccount;
    if (v2.version && v2.version >= 2) {
      getTransactionFeesV2(ACTION_CODES.AddFundsToAccount).then(value => {
        setTransactionFees(value);
        consoleOut('transactionFees:', value, 'orange');
      });
      getTransactionFeesV2(ACTION_CODES.WithdrawFromStream).then(value => {
        setWithdrawTransactionFees(value);
        consoleOut('withdrawTransactionFees:', value, 'orange');
      });
    } else {
      getTransactionFees(MSP_ACTIONS.addFunds).then(value => {
        setTransactionFees(value);
        consoleOut('transactionFees:', value, 'orange');
      });
    }
    setIsAddFundsModalVisibility(true);
  }, [
    streamingAccountSelected,
    getMultisigTxProposalFees,
    resetTransactionStatus,
    getTransactionFeesV2,
    getTransactionFees,
  ]);

  const closeAddFundsModal = useCallback(() => {
    setIsBusy(false);
    setIsAddFundsModalVisibility(false);
    setHighLightableStreamId(undefined);
    resetTransactionStatus();
  }, [resetTransactionStatus, setHighLightableStreamId]);

  const onAddFundsTransactionFinished = () => {
    closeAddFundsModal();
    resetTransactionStatus();
  };

  const onAcceptAddFunds = (params: TreasuryTopupParams) => {
    consoleOut('StreamingAccountView -> AddFunds params:', params, 'blue');
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
      if (publicKey && streamingAccountSelected) {
        consoleOut('Start transaction for treasury addFunds', '', 'blue');
        consoleOut('Wallet address:', publicKey.toBase58());

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        const treasury = new PublicKey(streamingAccountSelected.id);
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
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${getAmountWithSymbol(
              nativeBalance,
              SOL_MINT.toBase58(),
            )}) to pay for network fees (${getAmountWithSymbol(minRequired, SOL_MINT.toBase58())})`,
          });
          customLogger.logError('PaymentStreamingAccount Add funds transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }

        consoleOut('Starting Add Funds using MSP V1...', '', 'blue');
        // Create a transaction
        return await tokenStreamingV1
          .addFunds(
            publicKey,
            treasury,
            stream,
            associatedToken,
            amount,
            1, // former AllocationType.Specific
          )
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
          feePayer: new PublicKey(data.payer), // payer
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

      if (!streamingAccountSelected || !multisigClient || !multisigAccounts || !publicKey) {
        return null;
      }

      const accountOwner = getAccountOwner(streamingAccountSelected);
      const multisig = multisigAccounts.find(m => m.authority.equals(accountOwner));

      if (!multisig) {
        return null;
      }
      multisigAuth = multisig.authority.toBase58();
      let operationType = OperationType.StreamAddFunds;
      let addFundsTx: Transaction;

      if (data.stream) {
        consoleOut('Create multisig Tx ->', 'buildAllocateFundsToStreamTransaction', 'darkgreen');
        const accounts: AllocateFundsToStreamTransactionAccounts = {
          feePayer: new PublicKey(data.payer), // payer
          psAccount: new PublicKey(data.treasury), // psAccount
          owner: new PublicKey(multisig.authority), // owner
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
          feePayer: new PublicKey(data.payer), // feePayer
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
      if (!publicKey || !streamingAccountSelected || !params || !params.associatedToken || !tokenStreamingV2) {
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

      const treasury = new PublicKey(streamingAccountSelected.id);
      const associatedToken =
        params.associatedToken === SOL_MINT.toBase58()
          ? NATIVE_SOL_MINT // imported from SDK
          : new PublicKey(params.associatedToken);
      const amount = params.tokenAmount.toString();
      consoleOut('raw amount:', params.tokenAmount, 'blue');
      consoleOut('amount.toString():', amount, 'blue');
      const contributor = params.contributor || selectedAccount.address;
      consoleOut('contributor:', contributor, 'purple');
      const data = {
        proposalTitle: params.proposalTitle, // proposalTitle
        payer: publicKey.toBase58(), // payer
        contributor, // contributor
        treasury: treasury.toBase58(), // treasury
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
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${getAmountWithSymbol(
            nativeBalance,
            SOL_MINT.toBase58(),
          )}) to pay for network fees (${getAmountWithSymbol(minRequired, SOL_MINT.toBase58())})`,
        });
        customLogger.logError('PaymentStreamingAccount Add funds transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }

      consoleOut('Starting Add Funds using MSP V2...', '', 'blue');
      consoleOut('onExecuteAddFundsTransaction ->', 'StreamingAccountView', 'darkcyan');
      // Create a transaction
      const result = await addFunds(data)
        .then(value => {
          if (!value) {
            console.error('could not initialize addFunds Tx');
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: 'could not initialize addFunds Tx',
            });
            customLogger.logError('PaymentStreamingAccount Add funds transaction failed', {
              transcript: transactionLog,
            });
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

    if (wallet && publicKey && streamingAccountSelected) {
      const token = await getTokenOrCustomToken(connection, params.associatedToken, getTokenByMintAddress);
      consoleOut('onExecuteAddFundsTransaction token:', token, 'blue');
      let created: boolean;
      if (
        (streamingAccountSelected as PaymentStreamingAccount).version &&
        (streamingAccountSelected as PaymentStreamingAccount).version >= 2
      ) {
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

  // Transfer funds modal
  const [isTransferFundsModalVisible, setIsTransferFundsModalVisible] = useState(false);
  const showTransferFundsModal = useCallback(() => {
    setIsTransferFundsModalVisible(true);
    getMultisigTxProposalFees();
    getTransactionFeesV2(ACTION_CODES.WithdrawFromAccount).then(value => {
      setTransactionFees(value);
      consoleOut('transactionFees:', value, 'orange');
    });
    resetTransactionStatus();
  }, [getTransactionFeesV2, resetTransactionStatus, getMultisigTxProposalFees]);

  const onAcceptTreasuryTransferFunds = (params: TreasuryWithdrawParams) => {
    consoleOut('params', params, 'blue');
    onExecuteTreasuryTransferFundsTx(params);
  };

  const onExecuteTreasuryTransferFundsTx = async (data: TreasuryWithdrawParams) => {
    let transaction: VersionedTransaction | Transaction | null = null;
    let signature: string;
    let encodedTx: string;
    let transactionLog: LooseObject[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const treasuryWithdraw = async (data: TreasuryWithdrawParams) => {
      if (!publicKey || !tokenStreamingV2) {
        return null;
      }

      if (!isMultisigContext) {
        consoleOut('Create single signer Tx ->', 'buildWithdrawFromAccountTransaction', 'darkgreen');
        const accounts: WithdrawFromAccountTransactionAccounts = {
          feePayer: new PublicKey(data.payer), // payer
          destination: new PublicKey(data.destination), // destination
          psAccount: new PublicKey(data.treasury), // psAccount
        };
        const { transaction } = await tokenStreamingV2.buildWithdrawFromAccountTransaction(
          accounts, // accounts
          data.amount, // amount
          false, // autoWsol
        );

        return await composeTxWithPrioritizationFees(connection, publicKey, transaction.instructions);
      }

      if (!streamingAccountSelected || !multisigClient || !multisigAccounts || !publicKey) {
        return null;
      }

      const accountOwner = getAccountOwner(streamingAccountSelected);
      const multisig = multisigAccounts.find(m => m.authority.equals(accountOwner));

      if (!multisig) {
        return null;
      }

      consoleOut('Create multisig Tx ->', 'buildWithdrawFromAccountTransaction', 'darkgreen');
      const accounts: WithdrawFromAccountTransactionAccounts = {
        feePayer: new PublicKey(multisig.authority), // payer
        destination: new PublicKey(data.destination), // destination
        psAccount: new PublicKey(data.treasury), // psAccount
      };
      const { transaction } = await tokenStreamingV2.buildWithdrawFromAccountTransaction(
        accounts, // accounts
        data.amount, // amount
        false, // autoWsol
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
        data.proposalTitle ?? 'Withdraw treasury funds',
        '', // description
        new Date(expirationTime * 1_000),
        OperationType.TreasuryWithdraw,
        multisig.id,
        mspV2AddressPK,
        ixAccounts,
        ixData,
      );

      return tx?.transaction ?? null;
    };

    const createTx = async () => {
      if (!connection || !wallet || !publicKey) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('PaymentStreamingAccount withdraw transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }

      if (!streamingAccountSelected || !tokenStreamingV2) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: 'Cannot start transaction! PaymentStreamingAccount details or MSP client not found!',
        });
        customLogger.logError('PaymentStreamingAccount withdraw transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction,
      });

      /**
       * payer: PublicKey,
       * destination: PublicKey,
       * treasury: PublicKey,
       * amount: number
       */

      const destinationPk = new PublicKey(data.destination);
      const treasuryPk = new PublicKey(streamingAccountSelected.id);
      const amount = data.amount;

      // Create a transaction
      const payload: TreasuryWithdrawParams = {
        proposalTitle: data.proposalTitle,
        payer: selectedAccount.address,
        destination: destinationPk.toBase58(),
        treasury: treasuryPk.toBase58(),
        amount: amount.toString(),
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
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${getAmountWithSymbol(
            nativeBalance,
            SOL_MINT.toBase58(),
          )}) to pay for network fees (${getAmountWithSymbol(minRequired, SOL_MINT.toBase58())})`,
        });
        customLogger.logError('PaymentStreamingAccount withdraw transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }

      consoleOut('Starting PaymentStreamingAccount Withdraw using MSP V2...', '', 'blue');

      const result = await treasuryWithdraw(payload)
        .then(value => {
          if (!value) {
            return false;
          }
          consoleOut('treasuryWithdraw returned transaction:', value);
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
          console.error('treasuryWithdraw error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`,
          });
          customLogger.logError('PaymentStreamingAccount withdraw transaction failed', {
            transcript: transactionLog,
          });
          return false;
        });

      return result;
    };

    if (wallet && publicKey && streamingAccountSelected && selectedToken) {
      const create = await createTx();
      consoleOut('created:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx('Streaming Account Withdraw', wallet.adapter, publicKey, transaction);
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
            const isMultisig = isMultisigContext && selectedMultisig ? selectedMultisig.authority.toBase58() : '';
            enqueueTransactionConfirmation({
              signature,
              operationType: OperationType.TreasuryWithdraw,
              finality: 'confirmed',
              txInfoFetchStatus: 'fetching',
              loadingTitle: 'Confirming transaction',
              loadingMessage: `Withdraw ${formatThousands(Number.parseFloat(data.amount), selectedToken.decimals)} ${
                selectedToken.symbol
              }`,
              completedTitle: 'Transaction confirmed',
              completedMessage: `Successfully withdrawn ${formatThousands(
                Number.parseFloat(data.amount),
                selectedToken.decimals,
              )} ${selectedToken.symbol}`,
              extras: {
                multisigAuthority: isMultisig,
              },
            });
            setIsTransferFundsModalVisible(false);
            resetTransactionStatus();
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

  // Close treasury modal
  const [isCloseTreasuryModalVisible, setIsCloseTreasuryModalVisibility] = useState(false);
  const showCloseTreasuryModal = useCallback(() => {
    resetTransactionStatus();
    getMultisigTxProposalFees();
    getMultisigTxProposalFees();
    if (streamingAccountSelected) {
      const v2 = streamingAccountSelected as PaymentStreamingAccount;
      if (v2.version && v2.version >= 2) {
        getTransactionFeesV2(ACTION_CODES.CloseAccount).then(value => {
          setTransactionFees(value);
          consoleOut('transactionFees:', value, 'orange');
        });
      } else {
        getTransactionFees(MSP_ACTIONS.closeStream).then(value => {
          setTransactionFees(value);
          consoleOut('transactionFees:', value, 'orange');
        });
      }
      setIsCloseTreasuryModalVisibility(true);
    }
  }, [
    streamingAccountSelected,
    getMultisigTxProposalFees,
    resetTransactionStatus,
    getTransactionFeesV2,
    getTransactionFees,
  ]);

  const hideCloseTreasuryModal = useCallback(() => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    setIsCloseTreasuryModalVisibility(false);
  }, [isBusy]);

  const onAcceptCloseTreasury = (title: string) => {
    consoleOut('Input title for close treaury:', title, 'blue');
    onExecuteCloseTreasuryTransaction(title);
  };

  const onCloseTreasuryTransactionFinished = () => {
    hideCloseTreasuryModal();
  };

  const onExecuteCloseTreasuryTransaction = async (title: string) => {
    let transaction: VersionedTransaction | Transaction | null = null;
    let signature: string;
    let encodedTx: string;
    let transactionLog: LooseObject[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createTxV1 = async (): Promise<boolean> => {
      if (publicKey && streamingAccountSelected) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        const treasury = new PublicKey(streamingAccountSelected.id.toString());
        const data = {
          title, // title
          treasurer: publicKey.toBase58(), // treasurer
          treasury: treasury.toBase58(), // treasury
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
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${getAmountWithSymbol(
              nativeBalance,
              SOL_MINT.toBase58(),
            )}) to pay for network fees (${getAmountWithSymbol(minRequired, SOL_MINT.toBase58())})`,
          });
          customLogger.logError('Close PaymentStreamingAccount transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }

        consoleOut('Starting Close PaymentStreamingAccount using MSP V1...', '', 'blue');
        // Create a transaction
        return await tokenStreamingV1
          .closeTreasury(
            publicKey, // treasurer
            treasury, // treasury
          )
          .then(value => {
            consoleOut('closeTreasury returned transaction:', value);
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
            console.error('closeTreasury error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`,
            });
            customLogger.logError('Close PaymentStreamingAccount transaction failed', {
              transcript: transactionLog,
            });
            return false;
          });
      }

      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
        result: 'Cannot start transaction! Wallet not found!',
      });
      customLogger.logError('Close PaymentStreamingAccount transaction failed', {
        transcript: transactionLog,
      });
      return false;
    };

    // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
    const closeTreasury = async (data: any) => {
      if (!publicKey || !tokenStreamingV2) {
        return null;
      }

      if (!isMultisigContext) {
        const accounts: CloseAccountTransactionAccounts = {
          feePayer: new PublicKey(data.treasurer), // feePayer
          destination: new PublicKey(data.treasurer), // destination
          psAccount: new PublicKey(data.treasury), // psAccount
        };
        const { transaction } = await tokenStreamingV2.buildCloseAccountTransaction(
          accounts, // accounts
          false, // autoWSol
        );

        return await composeTxWithPrioritizationFees(connection, publicKey, transaction.instructions);
      }

      if (!streamingAccountSelected || !multisigClient || !multisigAccounts || !publicKey) {
        return null;
      }

      const accountOwner = getAccountOwner(streamingAccountSelected);
      const multisig = multisigAccounts.find(m => m.authority.equals(accountOwner));

      if (!multisig) {
        return null;
      }

      const accounts: CloseAccountTransactionAccounts = {
        feePayer: multisig.authority, // feePayer
        destination: multisig.authority, // destination
        psAccount: new PublicKey(data.treasury), // psAccount
      };
      const { transaction } = await tokenStreamingV2.buildCloseAccountTransaction(
        accounts, // accounts
        false, // autoWSol
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
        data.title === '' ? 'Close streaming account' : data.title,
        '', // description
        new Date(expirationTime * 1_000),
        OperationType.TreasuryClose,
        multisig.id,
        mspV2AddressPK,
        ixAccounts,
        ixData,
      );

      return tx?.transaction ?? null;
    };

    const createTxV2 = async (): Promise<boolean> => {
      if (!publicKey || !streamingAccountSelected || !tokenStreamingV2) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('Close PaymentStreamingAccount transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction,
      });

      const treasury = new PublicKey(streamingAccountSelected.id.toString());
      const data = {
        title, // title
        treasurer: publicKey.toBase58(), // treasurer
        treasury: treasury.toBase58(), // treasury
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
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${getAmountWithSymbol(
            nativeBalance,
            SOL_MINT.toBase58(),
          )}) to pay for network fees (${getAmountWithSymbol(minRequired, SOL_MINT.toBase58())})`,
        });
        customLogger.logError('Close PaymentStreamingAccount transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }

      consoleOut('Starting Close PaymentStreamingAccount using MSP V2...', '', 'blue');
      // Create a transaction
      const result = closeTreasury(data)
        .then(value => {
          if (!value) {
            return false;
          }
          consoleOut('closeTreasury returned transaction:', value);
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
          console.error('closeTreasury error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`,
          });
          customLogger.logError('Close PaymentStreamingAccount transaction failed', {
            transcript: transactionLog,
          });
          return false;
        });

      return result;
    };

    if (wallet && publicKey && streamingAccountSelected) {
      let created: boolean;
      let streamingAccountName = '';
      if (streamingAccountSelected.version && streamingAccountSelected.version >= 2) {
        streamingAccountName = (streamingAccountSelected as PaymentStreamingAccount).name;
        created = await createTxV2();
      } else {
        streamingAccountName = (streamingAccountSelected as TreasuryInfo).label;
        created = await createTxV1();
      }
      consoleOut('created:', created, 'blue');
      if (created && !transactionCancelled) {
        const sign = await signTx('Close Account', wallet.adapter, publicKey, transaction);
        if (sign.encodedTransaction) {
          encodedTx = sign.encodedTransaction;
          transactionLog = transactionLog.concat(sign.log);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionSuccess,
          });
          const sent = await sendTx('Close Account', connection, encodedTx);
          consoleOut('sent:', sent);
          if (sent.signature && !transactionCancelled) {
            signature = sent.signature;
            consoleOut('Send Tx to confirmation queue:', signature);
            const isMultisig = isMultisigContext && selectedMultisig ? selectedMultisig.authority.toBase58() : '';
            enqueueTransactionConfirmation({
              signature,
              operationType: OperationType.TreasuryClose,
              finality: 'confirmed',
              txInfoFetchStatus: 'fetching',
              loadingTitle: 'Confirming transaction',
              loadingMessage: `Close streaming account: ${streamingAccountName}`,
              completedTitle: 'Transaction confirmed',
              completedMessage: `Successfully closed streaming account: ${streamingAccountName}`,
              extras: {
                multisigAuthority: isMultisig,
              },
            });
            setIsCloseTreasuryModalVisibility(false);
            onCloseTreasuryTransactionFinished();
            resetTransactionStatus();
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

  // Refresh account data
  const onRefreshTreasuryBalanceTransactionFinished = useCallback(() => {
    resetTransactionStatus();
  }, [resetTransactionStatus]);

  const onExecuteRefreshTreasuryBalance = useCallback(async () => {
    let transaction: VersionedTransaction | Transaction | null = null;
    let signature: string;
    let encodedTx: string;
    let transactionLog: LooseObject[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const refreshBalance = async (treasury: PublicKey) => {
      if (!connection || !connected || !publicKey) {
        return false;
      }

      const ixs: TransactionInstruction[] = [];

      const { value } = await connection.getTokenAccountsByOwner(treasury, {
        programId: TOKEN_PROGRAM_ID,
      });

      if (!value?.length) {
        return false;
      }

      const tokenAddress = value[0].pubkey;
      const tokenAccount = AccountLayout.decode(value[0].account.data);
      const associatedTokenMint = new PublicKey(tokenAccount.mint);
      const mspAddress = isProd() ? Constants.MSP_PROGRAM : Constants.MSP_PROGRAM_DEV;

      ixs.push(
        await refreshTreasuryBalanceInstruction(
          mspAddress,
          publicKey,
          associatedTokenMint,
          treasury,
          tokenAddress,
          FEE_ACCOUNT,
        ),
      );

      const tx = new Transaction().add(...ixs);
      tx.feePayer = publicKey;
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;

      return tx;
    };

    // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
    const refreshTreasuryData = async (data: any) => {
      if (!publicKey || !streamingAccountSelected || !tokenStreamingV2) {
        return null;
      }

      if (!isNewTreasury) {
        return await refreshBalance(new PublicKey(data.treasury));
      }

      const accounts: RefreshAccountDataTransactionAccounts = {
        feePayer: publicKey, // feePayer
        psAccount: new PublicKey(data.treasury), // psAccount
      };
      const { transaction } = await tokenStreamingV2.buildRefreshAccountDataTransaction(accounts);

      return await composeTxWithPrioritizationFees(connection, publicKey, transaction.instructions);
    };

    const createTx = async (): Promise<boolean> => {
      if (!publicKey || !streamingAccountSelected) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('Refresh PaymentStreamingAccount data transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction,
      });

      const treasury = new PublicKey(streamingAccountSelected.id.toString());
      const data = {
        treasurer: publicKey.toBase58(), // treasurer
        treasury: treasury.toBase58(), // treasury
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
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${getAmountWithSymbol(
            nativeBalance,
            SOL_MINT.toBase58(),
          )}) to pay for network fees (${getAmountWithSymbol(minRequired, SOL_MINT.toBase58())})`,
        });
        customLogger.logError('Refresh PaymentStreamingAccount data transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }

      // Create a transaction
      const result = await refreshTreasuryData(data)
        .then(value => {
          if (!value) {
            return false;
          }
          consoleOut('refreshBalance returned transaction:', value);
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
          console.error('refreshBalance error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`,
          });
          customLogger.logError('Refresh PaymentStreamingAccount data transaction failed', {
            transcript: transactionLog,
          });
          return false;
        });

      return result;
    };

    if (wallet && publicKey && streamingAccountSelected) {
      const created = await createTx();
      consoleOut('created:', created);
      if (created && !transactionCancelled) {
        const sign = await signTx('Refresh Account Balance', wallet.adapter, publicKey, transaction);
        if (sign.encodedTransaction) {
          encodedTx = sign.encodedTransaction;
          transactionLog = transactionLog.concat(sign.log);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionSuccess,
          });
          const sent = await sendTx('Refresh Account Balance', connection, encodedTx);
          consoleOut('sent:', sent);
          if (sent.signature && !transactionCancelled) {
            signature = sent.signature;
            consoleOut('Send Tx to confirmation queue:', signature);
            enqueueTransactionConfirmation({
              signature,
              operationType: OperationType.TreasuryRefreshBalance,
              finality: 'confirmed',
              txInfoFetchStatus: 'fetching',
              loadingTitle: 'Confirming transaction',
              loadingMessage: 'Refresh streaming account data',
              completedTitle: 'Transaction confirmed',
              completedMessage: 'Successfully refreshed data in streaming account',
              extras: {
                multisigAuthority: '',
              },
            });
            setIsBusy(false);
            onRefreshTreasuryBalanceTransactionFinished();
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
  }, [
    wallet,
    connected,
    publicKey,
    connection,
    isNewTreasury,
    nativeBalance,
    tokenStreamingV2,
    isMultisigContext,
    transactionCancelled,
    multisigTransactionFees,
    streamingAccountSelected,
    transactionFees.mspFlatFee,
    transactionFees.blockchainFee,
    transactionStatus.currentOperation,
    onRefreshTreasuryBalanceTransactionFinished,
    enqueueTransactionConfirmation,
    resetTransactionStatus,
    setTransactionStatus,
    t,
  ]);

  //////////////
  //  Events  //
  //////////////

  const hideDetailsHandler = () => {
    onSendFromStreamingAccountDetails?.();
  };

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

  // Keep Streaming Account ATA balance
  useEffect(() => {
    const getStreamingAccountAtaBalance = async (address: string, streamingAccountAddress: string) => {
      if (!connection || !publicKey || !address || !streamingAccountAddress) {
        return null;
      }

      try {
        consoleOut('address', address, 'blue');
        consoleOut('streamingAccountAddress', streamingAccountAddress, 'blue');
        const tokenPk = new PublicKey(address);
        const saPk = new PublicKey(streamingAccountAddress);
        const saAtaTokenAddress = findATokenAddress(saPk, tokenPk);
        const ta = await getTokenAccountBalanceByAddress(connection, saAtaTokenAddress);
        consoleOut('getTokenAccountBalanceByAddress ->', ta, 'blue');
        return ta;
      } catch (error) {
        console.error(error);
        return null;
      }
    };

    if (streamingAccountSelected) {
      const tokenAddress = getStreamingAccountMint(streamingAccountSelected);

      getStreamingAccountAtaBalance(tokenAddress, streamingAccountSelected.id.toString())
        .then(value => {
          if (value) {
            setAssociatedTokenBalance(new BN(value.amount));
          }
        })
        .catch(err => {
          console.error(err);
          setAssociatedTokenBalance(new BN(0));
        });
    }
  }, [connection, publicKey, streamingAccountSelected]);

  // Automatically update all token balances (in token list)
  useEffect(() => {
    const balancesMap: LooseObject = {};

    if (!publicKey) {
      return;
    }

    if (!sourceAccountTokens || sourceAccountTokens.length === 0) {
      for (const t of splTokenList) {
        balancesMap[t.address] = 0;
      }
      setUserBalances(balancesMap);
      return;
    }

    // sourceAccount
    consoleOut('Reading balances for:', publicKey.toBase58(), 'darkpurple');

    connection.getBalance(publicKey).then(solBalance => {
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
  }, [connection, publicKey, sourceAccountTokens, splTokenList]);

  // Set selected token with the streaming account associated token as soon as streamingAccountSelected is available
  useEffect(() => {
    if (!connection || !publicKey || !streamingAccountSelected) {
      return;
    }

    const tokenAddress = getStreamingAccountMint(streamingAccountSelected);

    getTokenOrCustomToken(connection, tokenAddress, getTokenByMintAddress).then(token => {
      consoleOut('getTokenOrCustomToken (StreamingAccountView) ->', token, 'blue');
      if (token && token.address === WRAPPED_SOL_MINT_ADDRESS) {
        const modifiedToken = Object.assign({}, token, {
          symbol: 'SOL',
        }) as TokenInfo;
        setSelectedToken(modifiedToken);
      } else {
        setSelectedToken(token);
      }
    });
  }, [connection, getTokenByMintAddress, publicKey, streamingAccountSelected]);

  // Reload streaming account streams whenever the selected streaming account changes
  useEffect(() => {
    if (!publicKey || !streamingAccountSelected) {
      return;
    }

    const accountId = getStreamingAccountId(streamingAccountSelected);

    if (accountId === streamingItemId) {
      consoleOut('calling getTreasuryStreams...', '', 'blue');
      const treasuryPk = new PublicKey(accountId);
      getStreamingAccountStreams(treasuryPk, isNewTreasury);
    }
  }, [publicKey, isNewTreasury, streamingAccountSelected, getStreamingAccountStreams, streamingItemId]);

  // Get the Streeaming Account activity while in "activity" tab
  // biome-ignore lint/correctness/useExhaustiveDependencies: Deps managed manually
  useEffect(() => {
    if (
      publicKey &&
      tokenStreamingV2 &&
      streamingAccountSelected &&
      searchParams.get('v') === 'activity' &&
      streamingAccountActivity.length < 5
    ) {
      getStreamingAccountActivity(streamingAccountSelected.id.toString());
    }
  }, [searchParams, tokenStreamingV2, publicKey, streamingAccountSelected]);

  // Get the effective balance of the treasury
  useEffect(() => {
    if (!connection || !publicKey) {
      return;
    }

    if (streamingAccountSelected) {
      let balance = 0;
      connection
        .getBalance(new PublicKey(streamingAccountSelected.id))
        .then(solBalance => {
          balance = getAmountFromLamports(solBalance);
          connection
            .getMinimumBalanceForRentExemption(300)
            .then(value => {
              const re = getAmountFromLamports(value);
              const eb = balance - re;
              consoleOut('treasuryRentExcemption:', re, 'darkgreen');
              consoleOut('PaymentStreamingAccount native balance:', balance, 'darkgreen');
              consoleOut('Effective account balance:', eb, 'darkgreen');
              setTreasuryEffectiveBalance(eb);
            })
            .catch(error => {
              console.error('Failure fetching minimum balance for rent exemption', error);
            });
        })
        .catch(error => {
          console.error('Failure fetching native account balance for Streaming Account', error);
        });
    }
  }, [connection, publicKey, streamingAccountSelected]);

  /////////////////
  //  Rendering  //
  /////////////////

  const getTreasuryClosureMessage = () => {
    return <div>Since your streaming account has no streams you are able to close it</div>;
  };

  const getStreamingAccountContent = useCallback(() => {
    if (streamingAccountSelected) {
      const v1 = streamingAccountSelected as TreasuryInfo;
      const v2 = streamingAccountSelected as PaymentStreamingAccount;
      return isNewTreasury ? v2.id.toBase58() : (v1.id as string);
    }
    return '';
  }, [isNewTreasury, streamingAccountSelected]);

  const getStreamingAccountResume = useCallback(() => {
    if (streamingAccountSelected && selectedToken) {
      return displayAmountWithSymbol(
        getTreasuryUnallocatedBalance(streamingAccountSelected, selectedToken),
        selectedToken.address,
        selectedToken.decimals,
        splTokenList,
      );
    }
    return '--';
  }, [getTreasuryUnallocatedBalance, selectedToken, splTokenList, streamingAccountSelected]);

  const getStreamingAccountActivityAction = (item: AccountActivity): string => {
    let message = '';
    switch (item.actionCode) {
      case ActivityActionCode.AccountCreated:
        message += 'Streaming account created';
        break;
      case ActivityActionCode.StreamTemplateUpdated:
        message += 'Vesting contract modified';
        break;
      case ActivityActionCode.FundsAddedToAccount:
        message += 'Deposit funds in the streaming account';
        break;
      case ActivityActionCode.FundsWithdrawnFromAccount:
        message += 'Withdraw funds from streaming account';
        break;
      case ActivityActionCode.AccountDataRefreshed:
        message += 'Refresh streaming account data';
        break;
      case ActivityActionCode.StreamCreated:
        message += `Create stream ${item.stream ? shortenAddress(item.stream) : ''}`;
        break;
      case ActivityActionCode.FundsAllocatedToStream:
        message += `Topped up stream ${item.stream ? shortenAddress(item.stream) : ''}`;
        break;
      case ActivityActionCode.FundsWithdrawnFromStream:
        message += `Withdraw funds from stream ${item.stream ? shortenAddress(item.stream) : ''}`;
        break;
      case ActivityActionCode.StreamClosed:
        message += `Close stream ${item.stream ? shortenAddress(item.stream) : ''}`;
        break;
      case ActivityActionCode.StreamPaused:
        message += `Pause stream ${item.stream ? shortenAddress(item.stream) : ''}`;
        break;
      case ActivityActionCode.StreamResumed:
        message += `Resume stream ${item.stream ? shortenAddress(item.stream) : ''}`;
        break;
      default:
        message += '--';
        break;
    }
    return message;
  };

  const renderDropdownMenu = useCallback(() => {
    const items: ItemType<MenuItemType>[] = [];
    if (isXsDevice) {
      items.push({
        key: '00-create-stream',
        label: (
          <div onKeyDown={showCreateStreamModal} onClick={showCreateStreamModal}>
            <span className='menu-item-text'>Create stream</span>
          </div>
        ),
        disabled:
          hasStreamingAccountPendingTx() ||
          !streamingAccountSelected ||
          getTreasuryUnallocatedBalance(streamingAccountSelected, selectedToken).ltn(0),
      });
    }
    items.push({
      key: '01-close-account',
      label: (
        <div onKeyDown={showCloseTreasuryModal} onClick={showCloseTreasuryModal}>
          <span className='menu-item-text'>Close account</span>
        </div>
      ),
      disabled:
        hasStreamingAccountPendingTx() ||
        (streamingAccountStreams && streamingAccountStreams.length > 0) ||
        !isTreasurer(),
    });
    if (streamingAccountSelected) {
      items.push({
        key: '02-refresh-account',
        label: (
          <div onKeyDown={() => onExecuteRefreshTreasuryBalance()} onClick={() => onExecuteRefreshTreasuryBalance()}>
            <span className='menu-item-text'>Refresh account data</span>
          </div>
        ),
      });
    }
    if (isMultisigContext) {
      items.push({
        key: '03-sol-balance',
        label: (
          <div onKeyDown={() => showSolBalanceModal()} onClick={() => showSolBalanceModal()}>
            <span className='menu-item-text'>SOL balance</span>
          </div>
        ),
        disabled: !isTreasurer(),
      });
    }

    return { items };
  }, [
    isXsDevice,
    selectedToken,
    isMultisigContext,
    streamingAccountSelected,
    streamingAccountStreams,
    onExecuteRefreshTreasuryBalance,
    getTreasuryUnallocatedBalance,
    hasStreamingAccountPendingTx,
    showCloseTreasuryModal,
    showCreateStreamModal,
    showSolBalanceModal,
    isTreasurer,
  ]);

  const streamSortFunc = (a: Stream | StreamInfo, b: Stream | StreamInfo) => {
    const vA1 = a as StreamInfo;
    const vA2 = a as Stream;
    const vB1 = b as StreamInfo;
    const vB2 = b as Stream;

    if (a && b) {
      return (
        new Date(vA2.estimatedDepletionDate || (vA1.escrowEstimatedDepletionUtc as string) || '0').getTime() -
        new Date(vB2.estimatedDepletionDate || (vB1.escrowEstimatedDepletionUtc as string) || '0').getTime()
      );
    }

    return 0;
  };

  const renderStreamingAccountStreams = () => {
    const sortedStreamingAccountsStreamsList = streamingAccountStreams?.sort(streamSortFunc);

    const renderMessages = () => {
      if (
        loadingStreamingAccountStreams &&
        (!sortedStreamingAccountsStreamsList || sortedStreamingAccountsStreamsList.length === 0)
      ) {
        return <span className='pl-1'>Loading streams ...</span>;
      }
      return <span className='pl-1'>This streaming account has no streams</span>;
    };

    return (
      <>
        {sortedStreamingAccountsStreamsList && sortedStreamingAccountsStreamsList.length > 0
          ? sortedStreamingAccountsStreamsList.map((stream, index) => {
              const onSelectStream = () => {
                onSendFromStreamingAccountStreamInfo?.(stream);
              };

              const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
                event.currentTarget.src = FALLBACK_COIN_IMAGE;
                event.currentTarget.className = 'error';
              };

              const streamToken = getStreamAssociatedMint(stream);

              let img: ReactNode;

              if (selectedToken?.logoURI) {
                img = (
                  <img
                    alt={`${selectedToken.name}`}
                    width={30}
                    height={30}
                    src={selectedToken.logoURI}
                    onError={imageOnErrorHandler}
                    className='token-img'
                  />
                );
              } else {
                img = (
                  <Identicon
                    address={streamToken}
                    style={{ width: '30', display: 'inline-flex' }}
                    className='token-img'
                  />
                );
              }

              const title = stream ? getStreamTitle(stream, t) : 'Unknown outgoing stream';
              const subtitle = getStreamSubtitle(stream);
              const status = t(getStreamStatusLabel(stream));

              return (
                <div
                  key={stream.id?.toString()}
                  onKeyDown={onSelectStream}
                  onClick={onSelectStream}
                  className={`w-100 simplelink hover-list ${(index + 1) % 2 === 0 ? '' : 'bg-secondary-02'}`}
                >
                  <ResumeItem
                    id={index}
                    img={img}
                    title={title}
                    subtitle={subtitle || '0.00'}
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
            })
          : renderMessages()}
      </>
    );
  };

  const renderActivityItem = (item: AccountActivity, index: number) => {
    const title = getStreamingAccountActivityAction(item);
    const subtitle = <CopyExtLinkGroup content={item.signature} number={8} externalLink={false} />;
    const amount = getStreamingAccountActivityAssociatedToken(item);
    const resume = getShortDate(item.utcDate, true);

    return (
      <div
        key={item.signature}
        onKeyDown={() => {}}
        onClick={() =>
          openLinkInNewTab(
            `${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${item.signature}${getSolanaExplorerClusterParam()}`,
          )
        }
        className={`w-100 simplelink hover-list ${(index + 1) % 2 === 0 ? '' : 'bg-secondary-02'}`}
      >
        <ResumeItem
          id={`${index}`}
          title={title}
          subtitle={subtitle}
          amount={amount}
          resume={resume}
          hasRightIcon={true}
          rightIcon={<IconExternalLink className='mean-svg-icons external-icon' />}
          isLink={false}
          classNameRightContent='resume-activity-row'
          classNameIcon='icon-stream-row'
        />
      </div>
    );
  };

  const renderStreamingAccountActivity = () => {
    const renderList = () => {
      if (loadingStreamingAccountActivity) {
        return <span className='pl-1'>Loading streaming account activity ...</span>;
      }
      if (streamingAccountActivity !== undefined && streamingAccountActivity.length > 0) {
        return streamingAccountActivity.map((item, index) => renderActivityItem(item, index));
      }

      return <span className='pl-1'>This streaming account has no activity</span>;
    };

    return (
      <>
        {renderList()}
        {streamingAccountActivity && streamingAccountActivity.length >= 5 && hasMoreStreamingAccountActivity && (
          <div className='mt-1 text-center'>
            <span
              className={loadingStreamingAccountActivity ? 'no-pointer' : 'secondary-link underline-on-hover'}
              role='link'
              onKeyDown={() => {}}
              onClick={() => {
                if (streamingAccountSelected) {
                  getStreamingAccountActivity(streamingAccountSelected.id.toString());
                }
              }}
            >
              {t('general.cta-load-more')}
            </span>
          </div>
        )}
      </>
    );
  };

  // Tabs
  const tabs = [
    {
      key: 'streams',
      label: 'Streams',
      children: renderStreamingAccountStreams(),
    },
    {
      key: 'activity',
      label: 'Activity',
      children: renderStreamingAccountActivity(),
    },
  ];

  const streamAccountSubtitle = (
    <CopyExtLinkGroup content={getStreamingAccountContent()} number={8} externalLink={true} />
  );

  const streamAccountContent = t('treasuries.treasury-detail.unallocated-treasury-balance');

  const renderTabset = () => {
    const option = getQueryTabOption() ?? 'streams';
    return <Tabs items={tabs} activeKey={option} onChange={navigateToTab} className='neutral' />;
  };

  const getStreamingAccountTitle = () => {
    if (!streamingAccountSelected) {
      return '';
    }
    const name = getStreamingAccountName();
    return name || shortenAddress(streamingAccountSelected.id, 8);
  };

  const getBadgesList = () => {
    if (!streamingAccountSelected) {
      return;
    }

    const treasuryType = getStreamingAccountType(streamingAccountSelected);
    const type = treasuryType === AccountType.Open ? 'Open' : 'Locked';

    return [type];
  };

  const hasBalanceChanged = () => {
    if (!streamingAccountSelected) {
      return false;
    }
    return !associatedTokenBalance.eq(new BN(streamingAccountSelected.balance));
  };

  const selectDetailsForStreamCreateModal = useCallback(() => {
    if (streamingAccountSelected) {
      return streamingAccountSelected;
    }

    if (treasuryList && treasuryList.length > 0) {
      return treasuryList[0];
    }
  }, [streamingAccountSelected, treasuryList]);

  return (
    <>
      <Spin spinning={loadingStreamingAccountStreams}>
        {!isXsDevice && (
          <Row gutter={[8, 8]} className='safe-details-resume mr-0 ml-0'>
            <div
              onKeyDown={hideDetailsHandler}
              onClick={hideDetailsHandler}
              className='back-button icon-button-container'
            >
              <IconArrowBack className='mean-svg-icons' />
              <span className='ml-1'>Back</span>
            </div>
          </Row>
        )}

        {streamingAccountSelected && (
          <ResumeItem
            title={getStreamingAccountTitle()}
            extraTitle={getBadgesList()}
            subtitle={streamAccountSubtitle}
            content={streamAccountContent}
            resume={getStreamingAccountResume()}
            isDetailsPanel={true}
            isLink={false}
            isStreamingAccount={true}
            classNameRightContent='header-streaming-details-row resume-right-content'
          />
        )}

        {/* CTAs row */}
        <div className='flex-fixed-right cta-row mt-2 mb-2'>
          <Space className='left' size='middle' wrap>
            <Button
              type='primary'
              shape='round'
              size='small'
              className='thin-stroke btn-min-width'
              disabled={hasStreamingAccountPendingTx(OperationType.TreasuryAddFunds)}
              onClick={showAddFundsModal}
            >
              <div className='btn-content'>Add funds</div>
            </Button>
            <Button
              type='primary'
              shape='round'
              size='small'
              className='thin-stroke btn-min-width'
              disabled={
                !streamingAccountSelected ||
                hasStreamingAccountPendingTx() ||
                getTreasuryUnallocatedBalance(streamingAccountSelected, selectedToken).ltn(0)
              }
              onClick={showTransferFundsModal}
            >
              <div className='btn-content'>Withdraw funds</div>
            </Button>
            {!isXsDevice && (
              <Button
                type='primary'
                shape='round'
                size='small'
                className='thin-stroke btn-min-width'
                disabled={
                  hasStreamingAccountPendingTx() ||
                  !streamingAccountSelected ||
                  getTreasuryUnallocatedBalance(streamingAccountSelected, selectedToken).ltn(0)
                }
                onClick={showCreateStreamModal}
              >
                <div className='btn-content'>Create stream</div>
              </Button>
            )}
          </Space>
          <Dropdown menu={renderDropdownMenu()} placement='bottomRight' trigger={['click']}>
            <span className='ellipsis-icon icon-button-container mr-1'>
              <Button
                type='default'
                shape='circle'
                size='middle'
                icon={<IconEllipsisVertical className='mean-svg-icons' />}
                onClick={e => e.preventDefault()}
              />
            </span>
          </Dropdown>
        </div>

        {/* Alert to offer refresh treasury */}
        {streamingAccountSelected && hasBalanceChanged() && (
          <div className='alert-info-message mb-2 mr-2 pr-2'>
            <Alert
              message={
                <>
                  <span>This streaming account received an incoming funds transfer.&nbsp;</span>
                  <span
                    className='simplelink underline'
                    onKeyDown={() => onExecuteRefreshTreasuryBalance()}
                    onClick={() => onExecuteRefreshTreasuryBalance()}
                  >
                    Refresh the account data
                  </span>
                  <span>&nbsp;to update the account balance.</span>
                </>
              }
              type='info'
              showIcon
            />
          </div>
        )}

        {tabs && renderTabset()}
      </Spin>

      {multisigClient && isCreateStreamModalVisible && (
        <TreasuryStreamCreateModal
          associatedToken={streamingAccountSelected ? getStreamingAccountMint(streamingAccountSelected) : ''}
          connection={connection}
          handleClose={closeCreateStreamModal}
          handleOk={closeCreateStreamModal}
          isVisible={isCreateStreamModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          withdrawTransactionFees={withdrawTransactionFees}
          treasuryDetails={selectDetailsForStreamCreateModal()}
          treasuryList={treasuryList?.filter(t => t.version >= 2)}
          minRequiredBalance={minRequiredBalance}
          selectedMultisig={selectedMultisig}
          multisigClient={multisigClient}
        />
      )}

      {isAddFundsModalVisible && (
        <TreasuryAddFundsModal
          handleOk={(params: TreasuryTopupParams) => onAcceptAddFunds(params)}
          handleClose={closeAddFundsModal}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          withdrawTransactionFees={withdrawTransactionFees}
          treasuryDetails={streamingAccountSelected}
          treasuryList={[]}
          isVisible={isAddFundsModalVisible}
          selectedMultisig={selectedMultisig ?? undefined}
          userBalances={userBalances}
          treasuryStreams={streamingAccountStreams}
          associatedToken={streamingAccountSelected ? getStreamingAccountMint(streamingAccountSelected) : ''}
          isBusy={isBusy}
        />
      )}

      {isTransferFundsModalVisible && (
        <TreasuryTransferFundsModal
          isVisible={isTransferFundsModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          treasuryDetails={streamingAccountSelected}
          multisigAccounts={multisigAccounts}
          minRequiredBalance={minRequiredBalance}
          handleOk={(params: TreasuryWithdrawParams) => onAcceptTreasuryTransferFunds(params)}
          handleClose={() => {
            setIsTransferFundsModalVisible(false);
          }}
          isBusy={isBusy}
          selectedToken={selectedToken}
        />
      )}

      {isCloseTreasuryModalVisible && (
        <TreasuryCloseModal
          isVisible={isCloseTreasuryModalVisible}
          transactionFees={transactionFees}
          tokenBalance={userBalances && selectedToken ? userBalances[selectedToken.address] || 0 : 0}
          nativeBalance={nativeBalance}
          treasuryDetails={streamingAccountSelected}
          handleOk={onAcceptCloseTreasury}
          handleClose={hideCloseTreasuryModal}
          content={getTreasuryClosureMessage()}
          transactionStatus={transactionStatus.currentOperation}
          isBusy={isBusy}
          selectedMultisig={selectedMultisig ?? undefined}
        />
      )}

      {isSolBalanceModalOpen && (
        <SolBalanceModal
          address={streamingAccountSelected ? streamingAccountSelected.id.toString() : ''}
          accountAddress={selectedAccount.address}
          multisigAddress={address as string}
          isVisible={isSolBalanceModalOpen}
          handleClose={hideSolBalanceModal}
          tokenSymbol={NATIVE_SOL.symbol}
          nativeBalance={nativeBalance}
          selectedMultisig={selectedMultisig}
          treasuryBalance={treasuryEffectiveBalance}
          isStreamingAccount={true}
        />
      )}
    </>
  );
};
