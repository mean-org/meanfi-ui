import {
  DEFAULT_EXPIRATION_TIME_SECONDS,
  getFees,
  MeanMultisig,
  MultisigInfo,
  MultisigTransactionFees,
  MULTISIG_ACTIONS
} from '@mean-dao/mean-multisig-sdk';
import {
  calculateActionFees,
  Constants,
  MoneyStreaming,
  MSP_ACTIONS,
  refreshTreasuryBalanceInstruction,
} from '@mean-dao/money-streaming';
import {
  StreamInfo,
  STREAM_STATE,
  TreasuryInfo
} from '@mean-dao/money-streaming/lib/types';
import {
  calculateFeesForAction,
  PaymentStreaming,
  ACTION_CODES,
  Stream,
  STREAM_STATUS_CODE,
  TransactionFees,
  PaymentStreamingAccount,
  AccountType,
  VestingAccountActivity,
  ActivityActionCode,
  AddFundsToAccountTransactionAccounts,
  AllocateFundsToStreamTransactionAccounts,
  WithdrawFromAccountTransactionAccounts,
  CloseAccountTransactionAccounts,
  RefreshAccountDataTransactionAccounts
} from '@mean-dao/payment-streaming';
import { AccountLayout, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  TransactionInstruction
} from '@solana/web3.js';
import { Alert, Button, Dropdown, Menu, Row, Space, Spin, Tabs } from 'antd';
import { ItemType } from 'antd/lib/menu/hooks/useItems';
import BN from 'bn.js';
import { CopyExtLinkGroup } from 'components/CopyExtLinkGroup';
import { Identicon } from 'components/Identicon';
import { openNotification } from 'components/Notifications';
import { ResumeItem } from 'components/ResumeItem';
import { SolBalanceModal } from 'components/SolBalanceModal';
import { StreamStatusSummary } from 'components/StreamStatusSummary';
import { TreasuryAddFundsModal } from 'components/TreasuryAddFundsModal';
import { TreasuryCloseModal } from 'components/TreasuryCloseModal';
import { TreasuryStreamCreateModal } from 'components/TreasuryStreamCreateModal';
import { TreasuryTransferFundsModal } from 'components/TreasuryTransferFundsModal';
import {
  FALLBACK_COIN_IMAGE,
  MEAN_MULTISIG_ACCOUNT_LAMPORTS,
  MSP_FEE_TREASURY,
  NO_FEES,
  SOLANA_EXPLORER_URI_INSPECT_TRANSACTION,
  WRAPPED_SOL_MINT_ADDRESS
} from 'constants/common';
import { NATIVE_SOL } from 'constants/tokens';
import { AppStateContext } from 'contexts/appstate';
import {
  getSolanaExplorerClusterParam,
  useConnectionConfig
} from 'contexts/connection';
import { TxConfirmationContext } from 'contexts/transaction-status';
import { useWallet } from 'contexts/wallet';
import useWindowSize from 'hooks/useWindowResize';
import {
  IconArrowBack,
  IconArrowForward,
  IconEllipsisVertical,
  IconExternalLink
} from 'Icons';
import { appConfig, customLogger } from 'index';
import {
  fetchAccountTokens,
  getTokenAccountBalanceByAddress
} from 'middleware/accounts';
import { getStreamAssociatedMint } from 'middleware/getStreamAssociatedMint';
import { getStreamingAccountMint } from 'middleware/getStreamingAccountMint';
import { getStreamingAccountType } from 'middleware/getStreamingAccountType';
import { NATIVE_SOL_MINT } from 'middleware/ids';
import { getStreamTitle } from 'middleware/streams';
import { sendTx, signTx } from 'middleware/transactions';
import {
  consoleOut,
  getIntervalFromSeconds,
  getShortDate,
  getTransactionStatusForLogs,
  isProd
} from 'middleware/ui';
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
  toTokenAmountBn
} from 'middleware/utils';
import { TreasuryTopupParams } from 'models/common-types';
import { OperationType, TransactionStatus } from 'models/enums';
import { ZERO_FEES } from 'models/multisig';
import { TokenInfo } from 'models/SolanaTokenInfo';
import { TreasuryWithdrawParams } from 'models/treasuries';
import { AddFundsParams } from 'models/vesting';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isMobile } from 'react-device-detect';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';

export const StreamingAccountView = (props: {
  multisigAccounts: MultisigInfo[] | undefined;
  onSendFromStreamingAccountDetails?: any;
  onSendFromStreamingAccountStreamInfo?: any;
  selectedMultisig: MultisigInfo | undefined;
  streamingAccountSelected: PaymentStreamingAccount | TreasuryInfo | undefined;
  treasuryList: (PaymentStreamingAccount | TreasuryInfo)[] | undefined;
}) => {
  const {
    multisigAccounts,
    onSendFromStreamingAccountDetails,
    onSendFromStreamingAccountStreamInfo,
    selectedMultisig,
    streamingAccountSelected,
    treasuryList,
  } = props;

  const {
    splTokenList,
    selectedAccount,
    transactionStatus,
    streamProgramAddress,
    setHighLightableStreamId,
    getTokenByMintAddress,
    setTransactionStatus,
    resetContractValues,
  } = useContext(AppStateContext);
  const { confirmationHistory, enqueueTransactionConfirmation } = useContext(
    TxConfirmationContext,
  );

  const { publicKey, connected, wallet } = useWallet();
  const connectionConfig = useConnectionConfig();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation('common');
  const { width } = useWindowSize();
  const { address, streamingItemId } = useParams();
  const [isXsDevice, setIsXsDevice] = useState<boolean>(isMobile);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | undefined>(
    undefined,
  );
  // Streaming account
  const [streamingAccountStreams, setStreamingAccountStreams] = useState<
    Array<Stream | StreamInfo> | undefined
  >(undefined);
  const [loadingStreamingAccountStreams, setLoadingStreamingAccountStreams] =
    useState(true);
  // Transactions
  const [nativeBalance, setNativeBalance] = useState(0);
  const [userBalances, setUserBalances] = useState<any>();
  const [transactionFees, setTransactionFees] =
    useState<TransactionFees>(NO_FEES);
  const [withdrawTransactionFees, setWithdrawTransactionFees] =
    useState<TransactionFees>(NO_FEES);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [multisigTransactionFees, setMultisigTransactionFees] =
    useState<MultisigTransactionFees>(ZERO_FEES);
  const [minRequiredBalance, setMinRequiredBalance] = useState(0);
  const [streamingAccountActivity, setStreamingAccountActivity] = useState<
    VestingAccountActivity[]
  >([]);
  const [loadingStreamingAccountActivity, setLoadingStreamingAccountActivity] =
    useState(false);
  const [hasMoreStreamingAccountActivity, setHasMoreStreamingAccountActivity] =
    useState<boolean>(true);
  const [associatedTokenBalance, setAssociatedTokenBalance] = useState(
    new BN(0),
  );
  const [treasuryEffectiveBalance, setTreasuryEffectiveBalance] = useState(0);

  ////////////
  //  Init  //
  ////////////

  const mspV2AddressPK = useMemo(() => new PublicKey(appConfig.getConfig().streamV2ProgramAddress), []);
  const multisigAddressPK = useMemo(() => new PublicKey(appConfig.getConfig().multisigProgramAddress), []);

  // Create and cache the connection
  const connection = useMemo(
    () =>
      new Connection(connectionConfig.endpoint, {
        commitment: 'confirmed',
        disableRetryOnRateLimit: true,
      }),
    [connectionConfig.endpoint],
  );

  const multisigClient = useMemo(() => {
    if (!connection || !publicKey || !connectionConfig.endpoint) {
      return null;
    }

    return new MeanMultisig(
      connectionConfig.endpoint,
      publicKey,
      'confirmed',
      multisigAddressPK,
    );
  }, [connection, publicKey, multisigAddressPK, connectionConfig.endpoint]);

  // Create and cache Money Streaming Program V1 instance
  const ms = useMemo(
    () =>
      new MoneyStreaming(
        connectionConfig.endpoint,
        streamProgramAddress,
        'confirmed',
      ),
    [connectionConfig.endpoint, streamProgramAddress],
  );

  // Create and cache Payment Streaming instance
  const paymentStreaming = useMemo(() => {
    return new PaymentStreaming(
      connection,
      mspV2AddressPK,
      'confirmed'
    );
  }, [connection, mspV2AddressPK]);

  const isMultisigContext = useMemo(() => {
    return publicKey && selectedAccount.isMultisig ? true : false;
  }, [publicKey, selectedAccount]);

  /////////////////////////
  // Callbacks & Getters //
  /////////////////////////

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle,
    });
  }, [setTransactionStatus]);

  const refreshUserBalances = useCallback(
    (source?: PublicKey) => {
      if (!connection || !publicKey || !splTokenList) {
        return;
      }

      const balancesMap: any = {};
      const pk = source || publicKey;
      consoleOut('Reading balances for:', pk.toBase58(), 'darkpurple');

      connection.getBalance(pk).then(solBalance => {
        const uiBalance = getAmountFromLamports(solBalance);
        balancesMap[NATIVE_SOL.address] = uiBalance;
        setNativeBalance(uiBalance);
      });

      fetchAccountTokens(connection, pk)
        .then(accTks => {
          if (accTks) {
            for (const item of accTks) {
              const address = item.parsedInfo.mint;
              const balance = item.parsedInfo.tokenAmount.uiAmount || 0;
              balancesMap[address] = balance;
            }
          } else {
            for (const t of splTokenList) {
              balancesMap[t.address] = 0;
            }
          }
        })
        .catch(error => {
          console.error(error);
          for (const t of splTokenList) {
            balancesMap[t.address] = 0;
          }
        })
        .finally(() => setUserBalances(balancesMap));

    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [publicKey, connection]
  );

  const getRateAmountBn = useCallback(
    (item: Stream | StreamInfo) => {
      if (item && selectedToken) {
        const rateAmount =
          item.version < 2
            ? toTokenAmountBn(item.rateAmount as number, selectedToken.decimals)
            : item.rateAmount;
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

  const getTransactionFeesV2 = useCallback(
    async (action: ACTION_CODES): Promise<TransactionFees> => {
      return await calculateFeesForAction(action);
    },
    [],
  );

  const getMultisigTxProposalFees = useCallback(() => {
    if (!multisigClient) {
      return;
    }

    getFees(
      multisigClient.getProgram(),
      MULTISIG_ACTIONS.createTransaction,
    ).then(value => {
      setMultisigTransactionFees(value);
      consoleOut('multisigTransactionFees:', value, 'orange');
      consoleOut('nativeBalance:', nativeBalance, 'blue');
      consoleOut('networkFee:', value.networkFee, 'blue');
      consoleOut('rentExempt:', value.rentExempt, 'blue');
      const totalMultisigFee =
        value.multisigFee + MEAN_MULTISIG_ACCOUNT_LAMPORTS / LAMPORTS_PER_SOL;
      consoleOut('multisigFee:', totalMultisigFee, 'blue');
      const minRequired =
        totalMultisigFee + value.rentExempt + value.networkFee;
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
      setSearchParams({ v: tab as string });
    },
    [setSearchParams],
  );

  const isMultisigTreasury = useCallback(
    (treasury?: any) => {
      const treasuryInfo: any = treasury ?? streamingAccountSelected;

      if (
        !treasuryInfo ||
        treasuryInfo.version < 2 ||
        !treasuryInfo.treasurer ||
        !publicKey
      ) {
        return false;
      }

      const treasurer = new PublicKey(treasuryInfo.treasurer as string);

      if (
        !treasurer.equals(publicKey) &&
        multisigAccounts &&
        multisigAccounts.findIndex(m => m.authority.equals(treasurer)) !== -1
      ) {
        return true;
      }

      return false;
    },
    [publicKey, multisigAccounts, streamingAccountSelected],
  );

  const getStreamingAccountActivity = useCallback((streamingAccountSelectedId: string, clearHistory = false) => {
      if (
        !streamingAccountSelectedId ||
        !paymentStreaming ||
        loadingStreamingAccountActivity
      ) {
        return;
      }

      consoleOut('Loading streaming account activity...', '', 'crimson');

      setLoadingStreamingAccountActivity(true);
      const streamingAccountPublicKey = new PublicKey(streamingAccountSelectedId);

      const before = clearHistory
        ? ''
        : streamingAccountActivity && streamingAccountActivity.length > 0
        ? streamingAccountActivity[streamingAccountActivity.length - 1]
            .signature
        : '';
      consoleOut('before:', before, 'crimson');
      paymentStreaming
        .listVestingAccountActivity(streamingAccountPublicKey, before, 5)
        .then(value => {
          consoleOut('Streaming Account activity:', value);
          const activities = clearHistory
            ? []
            : streamingAccountActivity && streamingAccountActivity.length > 0
            ? JSON.parse(JSON.stringify(streamingAccountActivity))
            : [];

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
    [loadingStreamingAccountActivity, paymentStreaming, streamingAccountActivity],
  );

  const getStreamingAccountName = useCallback(() => {
    if (streamingAccountSelected) {
      const v1 = streamingAccountSelected as TreasuryInfo;
      const v2 = streamingAccountSelected as PaymentStreamingAccount;
      const isNewTreasury = v2.version && v2.version >= 2 ? true : false;
      return isNewTreasury ? v2.name.trim() : v1.label.trim();
    }
    return '';
  }, [streamingAccountSelected]);

  const getAccountOwner = useCallback((account: TreasuryInfo | PaymentStreamingAccount) => {
    const v1 = account as TreasuryInfo;
    const v2 = account as PaymentStreamingAccount;
    return account.version < 2
      ? new PublicKey(v1.treasurerAddress)
      : v2.owner;
  }, []);

  const getStreamingAccountActivityAssociatedToken = (item: VestingAccountActivity) => {
    let message = '';

    if (!selectedToken) {
      return message;
    }

    const amount = displayAmountWithSymbol(
      new BN(item.amount || 0),
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
    if (!selectedAccount || !selectedAccount.address || !streamingAccountSelected) {
      return false;
    }

    const isNew = streamingAccountSelected.version >= 2;
    const v1 = streamingAccountSelected as TreasuryInfo;
    const v2 = streamingAccountSelected as PaymentStreamingAccount;
    const treasurer = isNew ? v2.owner.toBase58() : v1.treasurerAddress as string;
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
          h =>
            h.extras === streamingAccountSelected.id &&
            h.txInfoFetchStatus === 'fetching',
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
        value += selectedToken
          ? selectedToken.symbol
          : `[${shortenAddress(associatedToken)}]`;
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
        let rateAmount =
          rate > 0 ? getRateAmountDisplay(item) : getDepositAmountDisplay(item);

        if (rate > 0) {
          rateAmount +=
            ' ' + getIntervalFromSeconds(item.rateIntervalInSeconds, true, t);
        }

        subtitle = rateAmount;
      }

      return subtitle;
    },
    [getRateAmountDisplay, getDepositAmountDisplay, t],
  );

  const getStreamStatusLabel = useCallback(
    (item: Stream | StreamInfo) => {
      if (item) {
        const v1 = item as StreamInfo;
        const v2 = item as Stream;
        if (v1.version < 2) {
          switch (v1.state) {
            case STREAM_STATE.Schedule:
              return t('streams.status.status-scheduled');
            case STREAM_STATE.Paused:
              return t('streams.status.status-stopped');
            default:
              return t('streams.status.status-running');
          }
        } else {
          switch (v2.statusCode) {
            case STREAM_STATUS_CODE.Scheduled:
              return t('streams.status.status-scheduled');
            case STREAM_STATUS_CODE.Paused:
              if (v2.isManuallyPaused) {
                return t('streams.status.status-paused');
              }
              return t('streams.status.status-stopped');
            default:
              return t('streams.status.status-running');
          }
        }
      }
    },
    [t],
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
        const isNewTreasury =
          (tsry as PaymentStreamingAccount).version && (tsry as PaymentStreamingAccount).version >= 2
            ? true
            : false;
        if (isNewTreasury) {
          return unallocated;
        } else {
          return makeInteger(
            (tsry as TreasuryInfo).balance -
              (tsry as TreasuryInfo).allocationAssigned,
            decimals,
          );
        }
      }
      return new BN(0);
    },
    [],
  );

  const getStreamingAccountStreams = useCallback(
    (treasuryPk: PublicKey, isNewTreasury: boolean) => {
      if (!publicKey || !ms) {
        return;
      }

      consoleOut('Executing getStreamingAccountStreams...', '', 'blue');

      if (isNewTreasury) {
        if (paymentStreaming) {
          paymentStreaming
            .listStreams({ treasury: treasuryPk })
            .then((streams: any) => {
              consoleOut('treasuryStreams:', streams, 'blue');
              setStreamingAccountStreams(streams);
            })
            .catch((err: any) => {
              console.error(err);
              setStreamingAccountStreams([]);
            })
            .finally(() => {
              setLoadingStreamingAccountStreams(false);
            });
        }
      } else {
        if (ms) {
          ms.listStreams({ treasury: treasuryPk })
            .then((streams: any) => {
              consoleOut('treasuryStreams:', streams, 'blue');
              setStreamingAccountStreams(streams);
            })
            .catch((err: any) => {
              console.error(err);
              setStreamingAccountStreams([]);
            })
            .finally(() => {
              setLoadingStreamingAccountStreams(false);
            });
        }
      }
    },
    [ms, paymentStreaming, publicKey],
  );

  ////////////////
  ///  MODALS  ///
  ////////////////

  // SOL Balance Modal
  const [isSolBalanceModalOpen, setIsSolBalanceModalOpen] = useState(false);
  const hideSolBalanceModal = useCallback(
    () => setIsSolBalanceModalOpen(false),
    [],
  );
  const showSolBalanceModal = useCallback(
    () => setIsSolBalanceModalOpen(true),
    [],
  );

  // Create Stream modal
  const [isCreateStreamModalVisible, setIsCreateStreamModalVisibility] =
    useState(false);
  const showCreateStreamModal = useCallback(() => {
    resetTransactionStatus();
    if (isMultisigContext && selectedMultisig) {
      refreshUserBalances(selectedMultisig.authority);
    } else {
      refreshUserBalances();
    }
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
  }, [
    selectedMultisig,
    isMultisigContext,
    refreshUserBalances,
    getTransactionFeesV2,
    resetTransactionStatus,
    getMultisigTxProposalFees,
  ]);

  const closeCreateStreamModal = useCallback(() => {
    setIsCreateStreamModalVisibility(false);
    resetContractValues();
    if (isMultisigContext && selectedMultisig) {
      refreshUserBalances(selectedMultisig.authority);
    } else {
      refreshUserBalances();
    }
    resetTransactionStatus();
  }, [
    isMultisigContext,
    refreshUserBalances,
    resetContractValues,
    resetTransactionStatus,
    selectedMultisig,
  ]);

  // Add funds modal
  const [isAddFundsModalVisible, setIsAddFundsModalVisibility] =
    useState(false);
  const showAddFundsModal = useCallback(() => {
    resetTransactionStatus();
    getMultisigTxProposalFees();
    if (isMultisigContext && selectedMultisig) {
      refreshUserBalances(selectedMultisig.authority);
    } else {
      refreshUserBalances();
    }
    if (streamingAccountSelected) {
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
    }
  }, [
    selectedMultisig,
    isMultisigContext,
    streamingAccountSelected,
    getMultisigTxProposalFees,
    resetTransactionStatus,
    getTransactionFeesV2,
    refreshUserBalances,
    getTransactionFees,
  ]);

  const closeAddFundsModal = useCallback(() => {
    setIsAddFundsModalVisibility(false);
    setHighLightableStreamId(undefined);
    resetTransactionStatus();
  }, [resetTransactionStatus, setHighLightableStreamId]);

  const onAddFundsTransactionFinished = () => {
    closeAddFundsModal();
    if (isMultisigContext && selectedMultisig) {
      refreshUserBalances(selectedMultisig.authority);
    } else {
      refreshUserBalances();
    }
    resetTransactionStatus();
  };

  const onAcceptAddFunds = (params: TreasuryTopupParams) => {
    consoleOut('AddFunds params:', params, 'blue');
    onExecuteAddFundsTransaction(params);
  };

  const onExecuteAddFundsTransaction = async (params: TreasuryTopupParams) => {
    let transaction: Transaction | null = null;
    let signature: any;
    let encodedTx: string;
    let multisigAuth = '';
    let transactionLog: any[] = [];

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
        const amount = parseFloat(params.amount);
        const stream = params.streamId
          ? new PublicKey(params.streamId)
          : undefined;
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
          action: getTransactionStatusForLogs(
            TransactionStatus.TransactionStart,
          ),
          inputs: data,
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(
            TransactionStatus.InitTransaction,
          ),
          result: '',
        });

        // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee

        const bf = transactionFees.blockchainFee; // Blockchain fee
        const ff = transactionFees.mspFlatFee; // Flat fee (protocol)
        const mp =
          multisigTransactionFees.networkFee +
          multisigTransactionFees.multisigFee +
          multisigTransactionFees.rentExempt; // Multisig proposal
        const minRequired = isMultisigTreasury() ? mp : bf + ff;

        setMinRequiredBalance(minRequired);

        consoleOut('Min balance required:', minRequired, 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');

        if (nativeBalance < minRequired) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(
              TransactionStatus.TransactionStartFailure,
            ),
            result: `Not enough balance (${getAmountWithSymbol(
              nativeBalance,
              NATIVE_SOL_MINT.toBase58(),
            )}) to pay for network fees (${getAmountWithSymbol(
              minRequired,
              NATIVE_SOL_MINT.toBase58(),
            )})`,
          });
          customLogger.logWarning('PaymentStreamingAccount Add funds transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }

        consoleOut('Starting Add Funds using MSP V1...', '', 'blue');
        // Create a transaction
        return await ms
          .addFunds(
            publicKey,
            treasury,
            stream,
            associatedToken,
            amount,
            1,  // former AllocationType.Specific
          )
          .then((value: any) => {
            consoleOut('addFunds returned transaction:', value);
            setTransactionStatus({
              lastOperation: TransactionStatus.InitTransactionSuccess,
              currentOperation: TransactionStatus.SignTransaction,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.InitTransactionSuccess,
              ),
              result: getTxIxResume(value),
            });
            transaction = value;
            return true;
          })
          .catch((error: any) => {
            console.error('addFunds error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.InitTransactionFailure,
              ),
              result: `${error}`,
            });
            customLogger.logError('PaymentStreamingAccount Add funds transaction failed', {
              transcript: transactionLog,
            });
            return false;
          });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('PaymentStreamingAccount Add funds transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }
    };

    const addFunds = async (data: AddFundsParams) => {
      if (!paymentStreaming) {
        return null;
      }

      if (!isMultisigTreasury() || !params.fundFromSafe) {
        if (data.stream === '') {
          const accounts: AddFundsToAccountTransactionAccounts = {
            feePayer: new PublicKey(data.payer),                // feePayer
            contributor: new PublicKey(data.contributor),       // contributor
            psAccount: new PublicKey(data.treasury),            // psAccount
            psAccountMint: new PublicKey(data.associatedToken), // psAccountMint
          };
          const { transaction } = await paymentStreaming.buildAddFundsToAccountTransaction(
            accounts,     // accounts
            data.amount,  // amount
          );
          return transaction;
        }

        const accounts: AllocateFundsToStreamTransactionAccounts = {
          feePayer: new PublicKey(data.payer),                // payer
          psAccount: new PublicKey(data.treasury),            // psAccount
          owner: new PublicKey(data.contributor),             // owner
          stream: new PublicKey(data.stream),                 // stream
        };
        const { transaction } = await paymentStreaming.buildAllocateFundsToStreamTransaction(
          accounts,     // accounts
          data.amount,  // amount
        );
        return transaction;
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
        const accounts: AllocateFundsToStreamTransactionAccounts = {
          feePayer: new PublicKey(data.payer),                // payer
          psAccount: new PublicKey(data.treasury),            // psAccount
          owner: new PublicKey(multisig.authority),           // owner
          stream: new PublicKey(data.stream),                 // stream
        };
        const { transaction } = await paymentStreaming.buildAllocateFundsToStreamTransaction(
          accounts,     // accounts
          data.amount,  // amount
        );
        addFundsTx = transaction;
      } else {
        operationType = OperationType.TreasuryAddFunds;
        const accounts: AddFundsToAccountTransactionAccounts = {
          feePayer: new PublicKey(data.payer),                // feePayer
          contributor: new PublicKey(data.contributor),       // contributor
          psAccount: new PublicKey(data.treasury),            // psAccount
          psAccountMint: new PublicKey(data.associatedToken), // psAccountMint
        };
        const { transaction } = await paymentStreaming.buildAddFundsToAccountTransaction(
          accounts,     // accounts
          data.amount,  // amount
        );
        addFundsTx = transaction;
      }

      const ixData = Buffer.from(addFundsTx.instructions[0].data);
      const ixAccounts = addFundsTx.instructions[0].keys;
      const expirationTime = parseInt(
        (Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString(),
      );

      const tx = await multisigClient.createTransaction(
        publicKey,
        data.proposalTitle || 'Add Funds',
        '', // description
        new Date(expirationTime * 1_000),
        operationType,
        multisig.id,
        mspV2AddressPK,
        ixAccounts,
        ixData,
      );

      return tx;
    };

    const createTxV2 = async (): Promise<boolean> => {
      if (
        !publicKey ||
        !streamingAccountSelected ||
        !params ||
        !params.associatedToken ||
        !paymentStreaming
      ) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('PaymentStreamingAccount Add funds transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }

      consoleOut('Start transaction for treasury addFunds', '', 'blue');
      consoleOut('Wallet address:', publicKey.toBase58());

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction,
      });

      const treasury = new PublicKey(streamingAccountSelected.id);
      const associatedToken = new PublicKey(params.associatedToken);
      const amount = params.tokenAmount.toString();
      consoleOut('raw amount:', params.tokenAmount, 'blue');
      consoleOut('amount.toString():', amount, 'blue');
      const contributor = params.contributor || selectedAccount.address;
      const data = {
        proposalTitle: params.proposalTitle, // proposalTitle
        payer: selectedAccount.address, // payer
        contributor: contributor, // contributor
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
        multisigTransactionFees.networkFee +
        multisigTransactionFees.multisigFee +
        multisigTransactionFees.rentExempt; // Multisig proposal
      const minRequired = isMultisigTreasury() ? mp : bf + ff;

      setMinRequiredBalance(minRequired);

      consoleOut('Min balance required:', minRequired, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance < minRequired) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(
            TransactionStatus.TransactionStartFailure,
          ),
          result: `Not enough balance (${getAmountWithSymbol(
            nativeBalance,
            NATIVE_SOL_MINT.toBase58(),
          )}) to pay for network fees (${getAmountWithSymbol(
            minRequired,
            NATIVE_SOL_MINT.toBase58(),
          )})`,
        });
        customLogger.logWarning('PaymentStreamingAccount Add funds transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }

      consoleOut('Starting Add Funds using MSP V2...', '', 'blue');
      consoleOut(
        'onExecuteAddFundsTransaction ->',
        '/src/views/StreamingAccount/index.tsx',
        'darkcyan',
      );
      // Create a transaction
      const result = await addFunds(data)
        .then((value: Transaction | null) => {
          if (!value) {
            console.error('could not initialize addFunds Tx');
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.InitTransactionFailure,
              ),
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
            action: getTransactionStatusForLogs(
              TransactionStatus.InitTransactionSuccess,
            ),
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
            action: getTransactionStatusForLogs(
              TransactionStatus.InitTransactionFailure,
            ),
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
      const token = await getTokenOrCustomToken(
        connection,
        params.associatedToken,
        getTokenByMintAddress,
      );
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
        const sign = await signTx('Fund Account', wallet, publicKey, transaction);
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
              ? `Streaming account funding has been submitted for approval.`
              : `Streaming account funded with ${amountDisplay}`;
            enqueueTransactionConfirmation({
              signature,
              operationType: OperationType.TreasuryAddFunds,
              finality: 'finalized',
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
  const [isTransferFundsModalVisible, setIsTransferFundsModalVisible] =
    useState(false);
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
    let transaction: Transaction | null = null;
    let signature: any;
    let encodedTx: string;
    let transactionLog: any[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const treasuryWithdraw = async (data: TreasuryWithdrawParams) => {
      if (!paymentStreaming) {
        return null;
      }

      if (!isMultisigTreasury()) {
        const accounts: WithdrawFromAccountTransactionAccounts = {
          feePayer: new PublicKey(data.payer),          // payer
          destination: new PublicKey(data.destination), // destination
          psAccount: new PublicKey(data.treasury),      // psAccount
        };
        const { transaction } = await paymentStreaming.buildWithdrawFromAccountTransaction(
          accounts,     // accounts
          data.amount,  // amount
          true,         // autoWsol
        );
        return transaction;
      }

      if (!streamingAccountSelected || !multisigClient || !multisigAccounts || !publicKey) {
        return null;
      }

      const accountOwner = getAccountOwner(streamingAccountSelected);
      const multisig = multisigAccounts.find(m => m.authority.equals(accountOwner));

      if (!multisig) {
        return null;
      }

      const accounts: WithdrawFromAccountTransactionAccounts = {
        feePayer: new PublicKey(multisig.authority),      // payer
        destination: new PublicKey(data.destination),     // destination
        psAccount: new PublicKey(data.treasury),          // psAccount
      };
      const { transaction } = await paymentStreaming.buildWithdrawFromAccountTransaction(
        accounts,     // accounts
        data.amount,  // amount
        false,        // autoWsol
      );

      const ixData = Buffer.from(transaction.instructions[0].data);
      const ixAccounts = transaction.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());
      const proposalTitle = data.proposalTitle;

      const tx = await multisigClient.createTransaction(
        publicKey,
        proposalTitle || 'Withdraw treasury funds',
        '', // description
        new Date(expirationTime * 1_000),
        OperationType.TreasuryWithdraw,
        multisig.id,
        mspV2AddressPK,
        ixAccounts,
        ixData,
      );

      return tx;
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

      if (!streamingAccountSelected || !paymentStreaming) {
        transactionLog.push({
          action: getTransactionStatusForLogs(
            TransactionStatus.TransactionStartFailure,
          ),
          result:
            'Cannot start transaction! PaymentStreamingAccount details or MSP client not found!',
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
        multisigTransactionFees.networkFee +
        multisigTransactionFees.multisigFee +
        multisigTransactionFees.rentExempt; // Multisig proposal
      const minRequired = isMultisigTreasury() ? mp : bf + ff;

      setMinRequiredBalance(minRequired);

      consoleOut('Min balance required:', minRequired, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance < minRequired) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(
            TransactionStatus.TransactionStartFailure,
          ),
          result: `Not enough balance (${getAmountWithSymbol(
            nativeBalance,
            NATIVE_SOL_MINT.toBase58(),
          )}) to pay for network fees (${getAmountWithSymbol(
            minRequired,
            NATIVE_SOL_MINT.toBase58(),
          )})`,
        });
        customLogger.logWarning('PaymentStreamingAccount withdraw transaction failed', {
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
            action: getTransactionStatusForLogs(
              TransactionStatus.InitTransactionSuccess,
            ),
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
            action: getTransactionStatusForLogs(
              TransactionStatus.InitTransactionFailure,
            ),
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
        const sign = await signTx('Streaming Account Withdraw', wallet, publicKey, transaction);
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
            const isMultisig =
            isMultisigTreasury(streamingAccountSelected) && selectedMultisig
              ? selectedMultisig.authority.toBase58()
              : '';
            enqueueTransactionConfirmation({
              signature,
              operationType: OperationType.TreasuryWithdraw,
              finality: 'finalized',
              txInfoFetchStatus: 'fetching',
              loadingTitle: 'Confirming transaction',
              loadingMessage: `Withdraw ${formatThousands(
                parseFloat(data.amount),
                selectedToken.decimals,
              )} ${selectedToken.symbol}`,
              completedTitle: 'Transaction confirmed',
              completedMessage: `Successfully withdrawn ${formatThousands(
                parseFloat(data.amount),
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
  const [isCloseTreasuryModalVisible, setIsCloseTreasuryModalVisibility] =
    useState(false);
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
    if (isMultisigContext && selectedMultisig) {
      refreshUserBalances(selectedMultisig.authority);
    } else {
      refreshUserBalances();
    }
  };

  const onExecuteCloseTreasuryTransaction = async (title: string) => {
    let transaction: Transaction | null = null;
    let signature: any;
    let encodedTx: string;
    let transactionLog: any[] = [];

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
          title: title as string, // title
          treasurer: publicKey.toBase58(), // treasurer
          treasury: treasury.toBase58(), // treasury
        };
        consoleOut('data:', data);

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(
            TransactionStatus.TransactionStart,
          ),
          inputs: data,
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(
            TransactionStatus.InitTransaction,
          ),
          result: '',
        });

        // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee

        const bf = transactionFees.blockchainFee; // Blockchain fee
        const ff = transactionFees.mspFlatFee; // Flat fee (protocol)
        const mp =
          multisigTransactionFees.networkFee +
          multisigTransactionFees.multisigFee +
          multisigTransactionFees.rentExempt; // Multisig proposal
        const minRequired = isMultisigTreasury() ? mp : bf + ff;

        setMinRequiredBalance(minRequired);

        consoleOut('Min balance required:', minRequired, 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');

        if (nativeBalance < minRequired) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(
              TransactionStatus.TransactionStartFailure,
            ),
            result: `Not enough balance (${getAmountWithSymbol(
              nativeBalance,
              NATIVE_SOL_MINT.toBase58(),
            )}) to pay for network fees (${getAmountWithSymbol(
              minRequired,
              NATIVE_SOL_MINT.toBase58(),
            )})`,
          });
          customLogger.logWarning('Close PaymentStreamingAccount transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }

        consoleOut('Starting Close PaymentStreamingAccount using MSP V1...', '', 'blue');
        // Create a transaction
        return await ms
          .closeTreasury(
            publicKey, // treasurer
            treasury, // treasury
          )
          .then((value: any) => {
            consoleOut('closeTreasury returned transaction:', value);
            setTransactionStatus({
              lastOperation: TransactionStatus.InitTransactionSuccess,
              currentOperation: TransactionStatus.SignTransaction,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.InitTransactionSuccess,
              ),
              result: getTxIxResume(value),
            });
            transaction = value;
            return true;
          })
          .catch((error: any) => {
            console.error('closeTreasury error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.InitTransactionFailure,
              ),
              result: `${error}`,
            });
            customLogger.logError('Close PaymentStreamingAccount transaction failed', {
              transcript: transactionLog,
            });
            return false;
          });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('Close PaymentStreamingAccount transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }
    };

    const closeTreasury = async (data: any) => {
      if (!paymentStreaming) {
        return null;
      }

      if (!isMultisigTreasury()) {
        const accounts: CloseAccountTransactionAccounts = {
          feePayer: new PublicKey(data.treasurer),    // feePayer
          destination: new PublicKey(data.treasurer), // destination
          psAccount: new PublicKey(data.treasury),    // psAccount
        };
        const { transaction } = await paymentStreaming.buildCloseAccountTransaction(
          accounts,           // accounts
          true,               // autoWSol
        );
        return transaction;
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
        feePayer: multisig.authority,             // feePayer
        destination: multisig.authority,          // destination
        psAccount: new PublicKey(data.treasury),  // psAccount
      };
      const { transaction } = await paymentStreaming.buildCloseAccountTransaction(
        accounts,           // accounts
        true,               // autoWSol
      );

      const ixData = Buffer.from(transaction.instructions[0].data);
      const ixAccounts = transaction.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
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

      return tx;
    };

    const createTxV2 = async (): Promise<boolean> => {
      if (!publicKey || !streamingAccountSelected || !paymentStreaming) {
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
        title: title as string, // title
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
        multisigTransactionFees.networkFee +
        multisigTransactionFees.multisigFee +
        multisigTransactionFees.rentExempt; // Multisig proposal
      const minRequired = isMultisigTreasury() ? mp : bf + ff;

      setMinRequiredBalance(minRequired);

      consoleOut('Min balance required:', minRequired, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance < minRequired) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(
            TransactionStatus.TransactionStartFailure,
          ),
          result: `Not enough balance (${getAmountWithSymbol(
            nativeBalance,
            NATIVE_SOL_MINT.toBase58(),
          )}) to pay for network fees (${getAmountWithSymbol(
            minRequired,
            NATIVE_SOL_MINT.toBase58(),
          )})`,
        });
        customLogger.logWarning('Close PaymentStreamingAccount transaction failed', {
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
            action: getTransactionStatusForLogs(
              TransactionStatus.InitTransactionSuccess,
            ),
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
            action: getTransactionStatusForLogs(
              TransactionStatus.InitTransactionFailure,
            ),
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
      if (
        streamingAccountSelected.version &&
        streamingAccountSelected.version >= 2
      ) {
        streamingAccountName = (streamingAccountSelected as PaymentStreamingAccount)
          .name as string;
        created = await createTxV2();
      } else {
        streamingAccountName = (streamingAccountSelected as TreasuryInfo)
          .label as string;
        created = await createTxV1();
      }
      consoleOut('created:', created, 'blue');
      if (created && !transactionCancelled) {
        const sign = await signTx('Close Account', wallet, publicKey, transaction);
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
            const isMultisig =
              isMultisigTreasury(streamingAccountSelected) && selectedMultisig
                ? selectedMultisig.authority.toBase58()
                : '';
            enqueueTransactionConfirmation({
              signature,
              operationType: OperationType.TreasuryClose,
              finality: 'finalized',
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
    if (isMultisigContext && selectedMultisig) {
      refreshUserBalances(selectedMultisig.authority);
    } else {
      refreshUserBalances();
    }
    resetTransactionStatus();
  }, [
    isMultisigContext,
    refreshUserBalances,
    resetTransactionStatus,
    selectedMultisig,
  ]);

  const onExecuteRefreshTreasuryBalance = useCallback(async () => {
    let transaction: Transaction | null = null;
    let signature: any;
    let encodedTx: string;
    let transactionLog: any[] = [];

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

      if (!value || !value.length) {
        return false;
      }

      const tokenAddress = value[0].pubkey;
      const tokenAccount = AccountLayout.decode(value[0].account.data);
      const associatedTokenMint = new PublicKey(tokenAccount.mint);
      const mspAddress = isProd()
        ? Constants.MSP_PROGRAM
        : Constants.MSP_PROGRAM_DEV;
      const feeTreasuryAddress: PublicKey = new PublicKey(MSP_FEE_TREASURY);

      ixs.push(
        await refreshTreasuryBalanceInstruction(
          mspAddress,
          publicKey,
          associatedTokenMint,
          treasury,
          tokenAddress,
          feeTreasuryAddress,
        ),
      );

      const tx = new Transaction().add(...ixs);
      tx.feePayer = publicKey;
      const { blockhash } = await connection.getLatestBlockhash('recent');
      tx.recentBlockhash = blockhash;

      return tx;
    };

    const refreshTreasuryData = async (data: any) => {
      if (!publicKey || !streamingAccountSelected || !paymentStreaming) {
        return null;
      }

      const account = streamingAccountSelected;
      const isNewTreasury = account.version >= 2 ? true : false;

      if (!isNewTreasury) {
        return await refreshBalance(new PublicKey(data.treasury));
      }

      const accounts: RefreshAccountDataTransactionAccounts = {
        feePayer: publicKey,                      // feePayer
        psAccount: new PublicKey(data.treasury),  // psAccount
      };
      const { transaction } = await paymentStreaming.buildRefreshAccountDataTransaction(
        accounts
      )
      return transaction;
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
        multisigTransactionFees.networkFee +
        multisigTransactionFees.multisigFee +
        multisigTransactionFees.rentExempt; // Multisig proposal
      const minRequired = isMultisigTreasury() ? mp : bf + ff;

      setMinRequiredBalance(minRequired);

      consoleOut('Min balance required:', minRequired, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance < minRequired) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(
            TransactionStatus.TransactionStartFailure,
          ),
          result: `Not enough balance (${getAmountWithSymbol(
            nativeBalance,
            NATIVE_SOL_MINT.toBase58(),
          )}) to pay for network fees (${getAmountWithSymbol(
            minRequired,
            NATIVE_SOL_MINT.toBase58(),
          )})`,
        });
        customLogger.logWarning('Refresh PaymentStreamingAccount data transaction failed', {
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
            action: getTransactionStatusForLogs(
              TransactionStatus.InitTransactionSuccess,
            ),
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
            action: getTransactionStatusForLogs(
              TransactionStatus.InitTransactionFailure,
            ),
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
        const sign = await signTx('Refresh Account Balance', wallet, publicKey, transaction);
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
              finality: 'finalized',
              txInfoFetchStatus: 'fetching',
              loadingTitle: 'Confirming transaction',
              loadingMessage: 'Refresh streaming account data',
              completedTitle: 'Transaction confirmed',
              completedMessage:
                'Successfully refreshed data in streaming account',
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
    paymentStreaming,
    wallet,
    connected,
    publicKey,
    connection,
    nativeBalance,
    multisigTransactionFees,
    transactionCancelled,
    streamingAccountSelected,
    transactionFees.mspFlatFee,
    transactionFees.blockchainFee,
    transactionStatus.currentOperation,
    onRefreshTreasuryBalanceTransactionFinished,
    enqueueTransactionConfirmation,
    resetTransactionStatus,
    setTransactionStatus,
    isMultisigTreasury,
    t,
  ]);

  //////////////
  //  Events  //
  //////////////

  const hideDetailsHandler = () => {
    onSendFromStreamingAccountDetails();
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
    const getStreamingAccountAtaBalance = async (
      address: string,
      streamingAccountAddress: string,
    ) => {
      if (!connection || !publicKey || !address || !streamingAccountAddress) {
        return null;
      }

      try {
        consoleOut('address', address, 'blue');
        consoleOut('streamingAccountAddress', streamingAccountAddress, 'blue');
        const tokenPk = new PublicKey(address);
        const saPk = new PublicKey(streamingAccountAddress);
        const saAtaTokenAddress = findATokenAddress(saPk, tokenPk);
        const ta = await getTokenAccountBalanceByAddress(
          connection,
          saAtaTokenAddress,
        );
        consoleOut('getTokenAccountBalanceByAddress ->', ta, 'blue');
        return ta;
      } catch (error) {
        return null;
      }
    };

    if (streamingAccountSelected) {
      const tokenAddress = getStreamingAccountMint(streamingAccountSelected);

      getStreamingAccountAtaBalance(
        tokenAddress,
        streamingAccountSelected.id.toString(),
      )
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, publicKey, streamingAccountSelected]);

  // Automatically update all token balances (in token list)
  useEffect(() => {
    if (!connection) {
      console.error('No connection');
      return;
    }

    if (!publicKey || !splTokenList) {
      return;
    }

    const timeout = setTimeout(() => {
      refreshUserBalances();
    });

    return () => {
      clearTimeout(timeout);
    };
  }, [splTokenList, publicKey, connection, refreshUserBalances]);

  // Set selected token with the streaming account associated token as soon as streamingAccountSelected is available
  useEffect(() => {
    if (!connection || !publicKey || !streamingAccountSelected) {
      return;
    }

    const tokenAddress = getStreamingAccountMint(streamingAccountSelected);

    getTokenOrCustomToken(connection, tokenAddress, getTokenByMintAddress).then(
      token => {
        consoleOut(
          'getTokenOrCustomToken (StreamingAccountView) ->',
          token,
          'blue',
        );
        if (token && token.address === WRAPPED_SOL_MINT_ADDRESS) {
          const modifiedToken = Object.assign({}, token, {
            symbol: 'SOL',
          }) as TokenInfo;
          setSelectedToken(modifiedToken);
        } else {
          setSelectedToken(token);
        }
      },
    );
  }, [connection, getTokenByMintAddress, publicKey, streamingAccountSelected]);

  // Reload streaming account streams whenever the selected streaming account changes
  useEffect(() => {
    if (!publicKey || !streamingAccountSelected) {
      return;
    }

    if (streamingAccountSelected.id === streamingItemId) {
      consoleOut('calling getTreasuryStreams...', '', 'blue');
      const treasuryPk = new PublicKey(streamingItemId as string);
      const isNewTreasury =
        (streamingAccountSelected as PaymentStreamingAccount).version &&
        (streamingAccountSelected as PaymentStreamingAccount).version >= 2
          ? true
          : false;
      getStreamingAccountStreams(treasuryPk, isNewTreasury);
    }
  }, [
    ms,
    publicKey,
    streamingAccountSelected,
    getStreamingAccountStreams,
    streamingItemId,
  ]);

  // Get the Streeaming Account activity while in "activity" tab
  useEffect(() => {
    if (
      publicKey &&
      paymentStreaming &&
      streamingAccountSelected &&
      searchParams.get('v') === 'activity' &&
      streamingAccountActivity.length < 5
    ) {
      getStreamingAccountActivity(streamingAccountSelected.id.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, paymentStreaming, publicKey, streamingAccountSelected]);

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
              console.error(
                'Failure fetching minimum balance for rent exemption',
                error,
              );
            });
        })
        .catch(error => {
          console.error(
            'Failure fetching native account balance for Streaming Account',
            error,
          );
        });
    }
  }, [connection, publicKey, streamingAccountSelected]);

  /////////////////
  //  Rendering  //
  /////////////////

  const getTreasuryClosureMessage = () => {
    return (
      <div>
        Since your streaming account has no streams you are able to close it
      </div>
    );
  };

  const getStreamingAccountContent = useCallback(() => {
    if (streamingAccountSelected) {
      const v1 = streamingAccountSelected as TreasuryInfo;
      const v2 = streamingAccountSelected as PaymentStreamingAccount;
      const isNewTreasury = v2.version && v2.version >= 2 ? true : false;
      return isNewTreasury ? (v2.id.toBase58()) : (v1.id as string);
    }
    return '';
  }, [streamingAccountSelected]);

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
  }, [
    getTreasuryUnallocatedBalance,
    selectedToken,
    splTokenList,
    streamingAccountSelected,
  ]);

  const getStreamingAccountActivityAction = (
    item: VestingAccountActivity,
  ): string => {
    let message = '';
    switch (item.actionCode) {
      case ActivityActionCode.AccountCreated:
        message += 'Streaming account created';
        break;
      case ActivityActionCode.StreamTemplateUpdated:
        message += `Vesting contract modified`;
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
        message += `Create stream ${
          item.stream ? shortenAddress(item.stream) : ''
        }`;
        break;
      case ActivityActionCode.FundsAllocatedToStream:
        message += `Topped up stream ${
          item.stream ? shortenAddress(item.stream) : ''
        }`;
        break;
      case ActivityActionCode.FundsWithdrawnFromStream:
        message += `Withdraw funds from stream ${
          item.stream ? shortenAddress(item.stream) : ''
        }`;
        break;
      case ActivityActionCode.StreamClosed:
        message += `Close stream ${
          item.stream ? shortenAddress(item.stream) : ''
        }`;
        break;
      case ActivityActionCode.StreamPaused:
        message += `Pause stream ${
          item.stream ? shortenAddress(item.stream) : ''
        }`;
        break;
      case ActivityActionCode.StreamResumed:
        message += `Resume stream ${
          item.stream ? shortenAddress(item.stream) : ''
        }`;
        break;
      default:
        message += '--';
        break;
    }
    return message;
  };

  const renderDropdownMenu = useCallback(() => {
    const items: ItemType[] = [];
    if (isXsDevice) {
      items.push({
        key: '00-create-stream',
        label: (
          <div onClick={showCreateStreamModal}>
            <span className="menu-item-text">Create stream</span>
          </div>
        ),
        disabled:
          hasStreamingAccountPendingTx() ||
          !streamingAccountSelected ||
          getTreasuryUnallocatedBalance(
            streamingAccountSelected,
            selectedToken,
          ).ltn(0),
      });
    }
    items.push({
      key: '01-close-account',
      label: (
        <div onClick={showCloseTreasuryModal}>
          <span className="menu-item-text">Close account</span>
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
          <div onClick={() => onExecuteRefreshTreasuryBalance()}>
            <span className="menu-item-text">Refresh account data</span>
          </div>
        ),
      });
    }
    if (isMultisigTreasury()) {
      items.push({
        key: '03-sol-balance',
        label: (
          <div onClick={() => showSolBalanceModal()}>
            <span className="menu-item-text">SOL balance</span>
          </div>
        ),
        disabled: !isTreasurer(),
      });
    }

    return <Menu items={items} />;
  }, [
    getTreasuryUnallocatedBalance,
    hasStreamingAccountPendingTx,
    isMultisigTreasury,
    isTreasurer,
    isXsDevice,
    onExecuteRefreshTreasuryBalance,
    selectedToken,
    showCloseTreasuryModal,
    showCreateStreamModal,
    showSolBalanceModal,
    streamingAccountSelected,
    streamingAccountStreams,
  ]);

  const renderStreamingAccountStreams = () => {
    const sortedStreamingAccountsStreamsList =
      streamingAccountStreams &&
      streamingAccountStreams.sort((a, b) => {
        const vA1 = a as StreamInfo;
        const vA2 = a as Stream;
        const vB1 = b as StreamInfo;
        const vB2 = b as Stream;

        if (a && b) {
          return (
            new Date(
              vA2.estimatedDepletionDate ||
                (vA1.escrowEstimatedDepletionUtc as string) ||
                '0',
            ).getTime() -
            new Date(
              vB2.estimatedDepletionDate ||
                (vB1.escrowEstimatedDepletionUtc as string) ||
                '0',
            ).getTime()
          );
        } else {
          return 0;
        }
      });

    const renderMessages = () => {
      if (
        loadingStreamingAccountStreams &&
        (!sortedStreamingAccountsStreamsList ||
          sortedStreamingAccountsStreamsList.length === 0)
      ) {
        return <span className="pl-1">Loading streams ...</span>;
      }
      return (
        <span className="pl-1">This streaming account has no streams</span>
      );
    };

    return (
      <>
        {sortedStreamingAccountsStreamsList &&
        sortedStreamingAccountsStreamsList.length > 0
          ? sortedStreamingAccountsStreamsList.map((stream, index) => {
              const onSelectStream = () => {
                onSendFromStreamingAccountStreamInfo(stream);
              };

              const imageOnErrorHandler = (
                event: React.SyntheticEvent<HTMLImageElement, Event>,
              ) => {
                event.currentTarget.src = FALLBACK_COIN_IMAGE;
                event.currentTarget.className = 'error';
              };

              const streamToken = getStreamAssociatedMint(stream);

              let img;

              if (selectedToken && selectedToken.logoURI) {
                img = (
                  <img
                    alt={`${selectedToken.name}`}
                    width={30}
                    height={30}
                    src={selectedToken.logoURI}
                    onError={imageOnErrorHandler}
                    className="token-img"
                  />
                );
              } else {
                img = (
                  <Identicon
                    address={streamToken}
                    style={{ width: '30', display: 'inline-flex' }}
                    className="token-img"
                  />
                );
              }

              const title = stream
                ? getStreamTitle(stream, t)
                : 'Unknown outgoing stream';
              const subtitle = getStreamSubtitle(stream);

              return (
                <div
                  key={index}
                  onClick={onSelectStream}
                  className={`w-100 simplelink hover-list ${
                    (index + 1) % 2 === 0 ? '' : 'bg-secondary-02'
                  }`}
                >
                  <ResumeItem
                    id={index}
                    img={img}
                    title={title}
                    subtitle={subtitle || '0.00'}
                    resume={<StreamStatusSummary stream={stream} />}
                    status={getStreamStatusLabel(stream)}
                    hasRightIcon={true}
                    rightIcon={<IconArrowForward className="mean-svg-icons" />}
                    isLink={true}
                    isStream={true}
                    classNameRightContent="resume-stream-row"
                    classNameIcon="icon-stream-row"
                  />
                </div>
              );
            })
          : renderMessages()}
      </>
    );
  };

  const renderStreamingAccountActivity = (
    <>
      {!loadingStreamingAccountActivity ? (
        streamingAccountActivity !== undefined &&
        streamingAccountActivity.length > 0 ? (
          streamingAccountActivity.map((item, index) => {
            const title = getStreamingAccountActivityAction(item);
            const subtitle = (
              <CopyExtLinkGroup
                content={item.signature}
                number={8}
                externalLink={false}
              />
            );

            const amount = getStreamingAccountActivityAssociatedToken(item);
            const resume = getShortDate(item.utcDate as string, true);

            return (
              <div
                key={index}
                onClick={() =>
                  openLinkInNewTab(
                    `${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${
                      item.signature
                    }${getSolanaExplorerClusterParam()}`,
                  )
                }
                className={`w-100 simplelink hover-list ${
                  (index + 1) % 2 === 0 ? '' : 'bg-secondary-02'
                }`}
              >
                <ResumeItem
                  id={`${index}`}
                  title={title}
                  subtitle={subtitle}
                  amount={amount}
                  resume={resume}
                  hasRightIcon={true}
                  rightIcon={
                    <IconExternalLink className="mean-svg-icons external-icon" />
                  }
                  isLink={false}
                  classNameRightContent="resume-activity-row"
                  classNameIcon="icon-stream-row"
                />
              </div>
            );
          })
        ) : (
          <span className="pl-1">This streaming account has no activity</span>
        )
      ) : (
        <span className="pl-1">Loading streaming account activity ...</span>
      )}
      {streamingAccountActivity &&
        streamingAccountActivity.length >= 5 &&
        hasMoreStreamingAccountActivity && (
          <div className="mt-1 text-center">
            <span
              className={
                loadingStreamingAccountActivity
                  ? 'no-pointer'
                  : 'secondary-link underline-on-hover'
              }
              role="link"
              onClick={() => {
                if (streamingAccountSelected) {
                  getStreamingAccountActivity(
                    streamingAccountSelected.id.toString(),
                  );
                }
              }}
            >
              {t('general.cta-load-more')}
            </span>
          </div>
        )}
    </>
  );

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
      children: renderStreamingAccountActivity,
    },
  ];

  const streamAccountSubtitle = (
    <CopyExtLinkGroup
      content={getStreamingAccountContent()}
      number={8}
      externalLink={true}
    />
  );

  const streamAccountContent = t(
    'treasuries.treasury-detail.unallocated-treasury-balance',
  );

  const renderTabset = () => {
    const option = getQueryTabOption() || 'streams';
    return (
      <Tabs
        items={tabs}
        activeKey={option}
        onChange={navigateToTab}
        className="neutral"
      />
    );
  };

  const getStreamingAccountTitle = () => {
    if (!streamingAccountSelected) { return ''; }
    const name = getStreamingAccountName();
    return name || shortenAddress(streamingAccountSelected.id, 8);
  }

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
    return associatedTokenBalance.eq(new BN(streamingAccountSelected.balance))
      ? false
      : true;
  };

  return (
    <>
      <Spin spinning={loadingStreamingAccountStreams}>
        {!isXsDevice && (
          <Row gutter={[8, 8]} className="safe-details-resume mr-0 ml-0">
            <div
              onClick={hideDetailsHandler}
              className="back-button icon-button-container"
            >
              <IconArrowBack className="mean-svg-icons" />
              <span className="ml-1">Back</span>
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
            classNameRightContent="header-streaming-details-row resume-right-content"
          />
        )}

        {/* CTAs row */}
        <div className="flex-fixed-right cta-row mt-2 mb-2">
          <Space className="left" size="middle" wrap>
            <Button
              type="default"
              shape="round"
              size="small"
              className="thin-stroke btn-min-width"
              disabled={hasStreamingAccountPendingTx(
                OperationType.TreasuryAddFunds,
              )}
              onClick={showAddFundsModal}
            >
              <div className="btn-content">Add funds</div>
            </Button>
            <Button
              type="default"
              shape="round"
              size="small"
              className="thin-stroke btn-min-width"
              disabled={
                !streamingAccountSelected ||
                hasStreamingAccountPendingTx() ||
                getTreasuryUnallocatedBalance(
                  streamingAccountSelected,
                  selectedToken,
                ).ltn(0)
              }
              onClick={showTransferFundsModal}
            >
              <div className="btn-content">Withdraw funds</div>
            </Button>
            {!isXsDevice && (
              <Button
                type="default"
                shape="round"
                size="small"
                className="thin-stroke btn-min-width"
                disabled={
                  hasStreamingAccountPendingTx() ||
                  !streamingAccountSelected ||
                  getTreasuryUnallocatedBalance(
                    streamingAccountSelected,
                    selectedToken,
                  ).ltn(0)
                }
                onClick={showCreateStreamModal}
              >
                <div className="btn-content">Create stream</div>
              </Button>
            )}
          </Space>
          <Dropdown
            overlay={renderDropdownMenu()}
            placement="bottomRight"
            trigger={['click']}
          >
            <span className="ellipsis-icon icon-button-container mr-1">
              <Button
                type="default"
                shape="circle"
                size="middle"
                icon={<IconEllipsisVertical className="mean-svg-icons" />}
                onClick={e => e.preventDefault()}
              />
            </span>
          </Dropdown>
        </div>

        {/* Alert to offer refresh treasury */}
        {streamingAccountSelected && hasBalanceChanged() && (
          <div className="alert-info-message mb-2 mr-2 pr-2">
            <Alert
              message={
                <>
                  <span>
                    This streaming account received an incoming funds
                    transfer.&nbsp;
                  </span>
                  <span
                    className="simplelink underline"
                    onClick={() => onExecuteRefreshTreasuryBalance()}
                  >
                    Refresh the account data
                  </span>
                  <span>&nbsp;to update the account balance.</span>
                </>
              }
              type="info"
              showIcon
            />
          </div>
        )}

        {tabs && renderTabset()}
      </Spin>

      {multisigClient && isCreateStreamModalVisible && (
        <TreasuryStreamCreateModal
          associatedToken={streamingAccountSelected
            ? getStreamingAccountMint(streamingAccountSelected)
            : ''
          }
          connection={connection}
          handleClose={closeCreateStreamModal}
          handleOk={closeCreateStreamModal}
          isVisible={isCreateStreamModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          withdrawTransactionFees={withdrawTransactionFees}
          treasuryDetails={
            streamingAccountSelected
              ? streamingAccountSelected
              : treasuryList && treasuryList.length > 0
              ? treasuryList[0]
              : undefined
          }
          treasuryList={treasuryList?.filter(t => t.version >= 2)}
          minRequiredBalance={minRequiredBalance}
          selectedMultisig={selectedMultisig}
          multisigClient={multisigClient}
          userBalances={userBalances}
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
          selectedMultisig={selectedMultisig || undefined}
          userBalances={userBalances}
          treasuryStreams={streamingAccountStreams}
          associatedToken={streamingAccountSelected
            ? getStreamingAccountMint(streamingAccountSelected)
            : ''
          }
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
          tokenBalance={
            userBalances && selectedToken
              ? userBalances[selectedToken.address] || 0
              : 0
          }
          nativeBalance={nativeBalance}
          treasuryDetails={streamingAccountSelected}
          handleOk={onAcceptCloseTreasury}
          handleClose={hideCloseTreasuryModal}
          content={getTreasuryClosureMessage()}
          transactionStatus={transactionStatus.currentOperation}
          isBusy={isBusy}
          selectedMultisig={selectedMultisig || undefined}
        />
      )}

      {isSolBalanceModalOpen && (
        <SolBalanceModal
          address={
            streamingAccountSelected
              ? (streamingAccountSelected.id.toString())
              : ''
          }
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
