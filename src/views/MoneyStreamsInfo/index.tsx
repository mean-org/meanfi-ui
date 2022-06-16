import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { Button, Col, Menu, Row, Tabs } from "antd";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CopyExtLinkGroup } from "../../components/CopyExtLinkGroup";
import { ResumeItem } from "../../components/ResumeItem";
import { RightInfoDetails } from "../../components/RightInfoDetails";
import { TreasuryStreamCreateModal } from "../../components/TreasuryStreamCreateModal";
import { AppStateContext } from "../../contexts/appstate";
import { useConnectionConfig } from "../../contexts/connection";
import { useWallet } from "../../contexts/wallet";
import { IconArrowForward, IconVerticalEllipsis } from "../../Icons";
import { MoneyStreaming } from '@mean-dao/money-streaming/lib/money-streaming';
import { calculateActionFees } from '@mean-dao/money-streaming/lib/utils';
import { OperationType, TransactionStatus } from "../../models/enums";
import { PieChartComponent } from "./PieChart";
import "./style.scss";
import { TxConfirmationContext } from "../../contexts/transaction-status";
import {
  TransactionFees,
  MSP_ACTIONS as MSP_ACTIONS_V2,
  calculateActionFees as calculateActionFeesV2,
  Treasury,
  Stream,
  MSP,
  Constants as MSPV2Constants,
  TreasuryType,
  STREAM_STATUS
} from '@mean-dao/msp';
import { MSP_ACTIONS, StreamInfo, STREAM_STATE, TreasuryInfo } from "@mean-dao/money-streaming/lib/types";
import { DEFAULT_EXPIRATION_TIME_SECONDS, MeanMultisig, MultisigInfo, MultisigTransactionFees } from "@mean-dao/mean-multisig-sdk";
import { consoleOut, getFormattedNumberToLocale, getIntervalFromSeconds, getShortDate, getTransactionStatusForLogs, isValidAddress } from "../../utils/ui";
import { TokenInfo } from "@solana/spl-token-registry";
import { formatAmount, formatThousands, getTokenAmountAndSymbolByTokenAddress, getTxIxResume, shortenAddress, toUiAmount } from "../../utils/utils";
import { TREASURY_TYPE_OPTIONS } from "../../constants/treasury-type-options";
import { openNotification } from "../../components/Notifications";
import { useTranslation } from "react-i18next";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useAccountsContext } from "../../contexts/accounts";
import { ACCOUNT_LAYOUT } from "../../utils/layouts";
import { HALF_MINUTE_REFRESH_TIMEOUT, NO_FEES, WRAPPED_SOL_MINT_ADDRESS } from "../../constants";
import { useLocation, useNavigate } from "react-router-dom";
import { TreasuryOpenModal } from "../../components/TreasuryOpenModal";
import { TreasuryCreateModal } from "../../components/TreasuryCreateModal";
import { TreasuryCreateOptions } from "../../models/treasuries";
import { customLogger } from "../..";
import { NATIVE_SOL_MINT } from "../../utils/ids";
import BN from "bn.js";
import { ArrowDownOutlined, ArrowUpOutlined } from "@ant-design/icons";
import { ACCOUNTS_ROUTE_BASE_PATH } from "../../pages/accounts";

const { TabPane } = Tabs;

export const MoneyStreamsInfoView = (props: {
  onSendFromIncomingStreamInfo?: any;
  onSendFromOutgoingStreamInfo?: any;
  onSendFromStreamingAccountDetails?: any;
  streamList?: Array<Stream | StreamInfo> | undefined;
  accountAddress: string;
  selectedTab: string;
}) => {
  const {
    tokenList,
    selectedToken,
    treasuryOption,
    transactionStatus,
    streamProgramAddress,
    streamV2ProgramAddress,
    getTokenByMintAddress,
    setTransactionStatus,
    refreshTokenBalance,
    resetContractValues,
    setTreasuryOption,
    setEffectiveRate,
    setSelectedToken,
  } = useContext(AppStateContext);
  const {
    fetchTxInfoStatus,
    startFetchTxSignatureInfo,
    clearTxConfirmationContext,
  } = useContext(TxConfirmationContext);
  const {
    streamList,
    onSendFromIncomingStreamInfo,
    onSendFromOutgoingStreamInfo,
    onSendFromStreamingAccountDetails,
    accountAddress,
    selectedTab,
  } = props;

  const accounts = useAccountsContext();
  const { t } = useTranslation('common');
  const connectionConfig = useConnectionConfig();
  const { publicKey, wallet } = useWallet();
  const location = useLocation();
  const navigate = useNavigate();

  const [signalRefreshTreasuryStreams, setSignalRefreshTreasuryStreams] = useState(false);
  const [customStreamDocked, setCustomStreamDocked] = useState(false);
  const [retryOperationPayload, setRetryOperationPayload] = useState<any>(undefined);
  const [ongoingOperation, setOngoingOperation] = useState<OperationType | undefined>(undefined);

  // Multisig related
  const [multisigAddress, setMultisigAddress] = useState('');
  const [selectedMultisig, setSelectedMultisig] = useState<MultisigInfo | undefined>(undefined);
  const [treasuryAddress, setTreasuryAddress] = useState('');
  const [loadingMultisigAccounts, setLoadingMultisigAccounts] = useState(false);
  const [multisigAccounts, setMultisigAccounts] = useState<MultisigInfo[] | undefined>(undefined);
  const [needReloadMultisig, setNeedReloadMultisig] = useState(true);

  // Transactions
  const [nativeBalance, setNativeBalance] = useState(0);
  const [userBalances, setUserBalances] = useState<any>();
  const [transactionFees, setTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [minRequiredBalance, setMinRequiredBalance] = useState(0);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [multisigTxFees, setMultisigTxFees] = useState<MultisigTransactionFees>({
    multisigFee: 0,
    networkFee: 0,
    rentExempt: 0
  } as MultisigTransactionFees);

  const [withdrawTransactionFees, setWithdrawTransactionFees] = useState<TransactionFees>({
    blockchainFee: 0, mspFlatFee: 0, mspPercentFee: 0
  });

  // Treasuries related
  const [treasuryList, setTreasuryList] = useState<(Treasury | TreasuryInfo)[]>([]);
  const [treasuryDetails, setTreasuryDetails] = useState<Treasury | TreasuryInfo | undefined>(undefined);
  const [treasuryStreams, setTreasuryStreams] = useState<(Stream | StreamInfo)[]>([]);
  const [loadingTreasuries, setLoadingTreasuries] = useState(false);
  const [loadingTreasuryDetails, setLoadingTreasuryDetails] = useState(false);
  const [loadingTreasuryStreams, setLoadingTreasuryStreams] = useState(false);
  const [treasuriesLoaded, setTreasuriesLoaded] = useState(false);

  // Create and cache the connection
  const connection = useMemo(() => new Connection(connectionConfig.endpoint, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true
  }), [
    connectionConfig.endpoint
  ]);

  const multisigClient = useMemo(() => {

    if (!connection || !publicKey || !connectionConfig.endpoint) { return null; }

    return new MeanMultisig(
      connectionConfig.endpoint,
      publicKey,
      "confirmed"
    );

  }, [
    connection,
    publicKey,
    connectionConfig.endpoint,
  ]);

  // Create and cache Money Streaming Program V1 instance
  const ms = useMemo(() => new MoneyStreaming(
    connectionConfig.endpoint,
    streamProgramAddress,
    "confirmed"
  ), [
    connectionConfig.endpoint,
    streamProgramAddress
  ]);

  // Create and cache Money Streaming Program V2 instance
  const msp = useMemo(() => {
    if (publicKey) {
      return new MSP(
        connectionConfig.endpoint,
        streamV2ProgramAddress,
        "confirmed"
      );
    }
  }, [
    connectionConfig.endpoint,
    publicKey,
    streamV2ProgramAddress
  ]);

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }, [setTransactionStatus]);

  const setCustomToken = useCallback((address: string) => {

    if (address && isValidAddress(address)) {
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
    }
  }, [
    setEffectiveRate,
    setSelectedToken,
  ]);

  const openTreasuryById = useCallback((treasuryId: string, isNew = true, dock = false) => {
    if (!connection || !publicKey || !msp || !ms || loadingTreasuryDetails) { return; }

    setLoadingTreasuryDetails(true);
    const mspInstance: any = isNew || dock ? msp : ms;
    const treasuryPk = new PublicKey(treasuryId);

    mspInstance.getTreasury(treasuryPk)
      .then((details: Treasury | TreasuryInfo | undefined) => {
        if (details) {
          consoleOut('treasuryDetails:', details, 'blue');
          setTreasuryDetails(details);
          setSignalRefreshTreasuryStreams(true);
          const v1 = details as TreasuryInfo;
          const v2 = details as Treasury;
          const isNewTreasury = v2.version && v2.version >= 2 ? true : false;
      
          // Preset active token to the treasury associated token
          const ata = isNewTreasury ? v2.associatedToken as string : v1.associatedTokenAddress as string;
          const type = isNewTreasury ? v2.treasuryType : v1.type;
          const token = getTokenByMintAddress(ata);
          consoleOut("treasury token:", token ? token.symbol : 'Custom', 'blue');
          if (token) {
            if (!selectedToken || selectedToken.address !== token.address) {
              setSelectedToken(token);
            }
          } else if (!token && (!selectedToken || selectedToken.address !== ata)) {
            setCustomToken(ata);
          }

          const tOption = TREASURY_TYPE_OPTIONS.find(t => t.type === type);
          if (tOption) {
            setTreasuryOption(tOption);
          }
          if (dock) {
            setTreasuryList([details]);
            setCustomStreamDocked(true);
            openNotification({
              description: t('notifications.success-loading-treasury-message', {treasuryId: shortenAddress(treasuryId, 10)}),
              type: "success"
            });
          }
        } else {
          setTreasuryDetails(undefined);
          setTreasuryDetails(undefined);
          if (dock) {
            openNotification({
              title: t('notifications.error-title'),
              description: t('notifications.error-loading-treasuryid-message', {treasuryId: shortenAddress(treasuryId as string, 10)}),
              type: "error"
            });
          }
        }
      })
      .catch((error: any) => {
        console.error(error);
        setTreasuryDetails(undefined);
        openNotification({
          title: t('notifications.error-title'),
          description: t('notifications.error-loading-treasuryid-message', {treasuryId: shortenAddress(treasuryId as string, 10)}),
          type: "error"
        });
      })
      .finally(() => {
        setLoadingTreasuryDetails(false);
      });

  }, [
    ms,
    msp,
    publicKey,
    connection,
    selectedToken,
    loadingTreasuryDetails,
    getTokenByMintAddress,
    setTreasuryOption,
    setSelectedToken,
    setCustomToken,
    t,
  ]);

  const getAllUserV2Treasuries = useCallback(async () => {

    if (!connection || !publicKey || loadingTreasuries || !msp) { return []; }

    let treasuries = await msp.listTreasuries(publicKey);

    if (selectedMultisig && multisigAccounts) {

      const multisigTreasuries: any[] = [];

      const filterMultisigAccounts = selectedMultisig
        ? [selectedMultisig.authority]
        : multisigAccounts.map(m => m.authority);

      if (filterMultisigAccounts) {
        for (const key of filterMultisigAccounts) {
          multisigTreasuries.push(...(await msp.listTreasuries(key)));
        }
      }

      treasuries = multisigTreasuries;
    } 

    return treasuries.filter((t: any) => !t.autoClose);

  }, [
    connection, 
    loadingTreasuries, 
    msp,
    selectedMultisig,
    multisigAccounts,
    publicKey
  ]);

  const getTreasuryStreams = useCallback((treasuryPk: PublicKey, isNewTreasury: boolean) => {
    if (!publicKey || !ms || loadingTreasuryStreams) { return; }

    setTimeout(() => {
      setLoadingTreasuryStreams(true);
    });

    consoleOut('Executing getTreasuryStreams...', '', 'blue');

    if (isNewTreasury) {
      if (msp) {
        msp.listStreams({treasury: treasuryPk })
          .then((streams: any) => {
            consoleOut('treasuryStreams:', streams, 'blue');
            setTreasuryStreams(streams);
          })
          .catch((err: any) => {
            console.error(err);
            setTreasuryStreams([]);
          })
          .finally(() => {
            setLoadingTreasuryStreams(false);
          });
      }
    } else {
      if (ms) {
        ms.listStreams({treasury: treasuryPk })
          .then((streams: any) => {
            consoleOut('treasuryStreams:', streams, 'blue');
            setTreasuryStreams(streams);
          })
          .catch((err: any) => {
            console.error(err);
            setTreasuryStreams([]);
          })
          .finally(() => {
            setLoadingTreasuryStreams(false);
          });
      }
    }

  }, [
    ms,
    msp,
    publicKey,
    loadingTreasuryStreams,
  ]);

  const refreshTreasuries = useCallback((reset = false) => {
    
    if (!connection || !publicKey || loadingTreasuries) { return; }

    if (msp && ms && fetchTxInfoStatus !== "fetching") {

      setTimeout(() => {
        setLoadingTreasuries(true);
        clearTxConfirmationContext();
      });

      const treasuryAccumulator: (Treasury | TreasuryInfo)[] = [];
      let treasuriesv1: TreasuryInfo[] = [];
      getAllUserV2Treasuries()
        .then(async (treasuriesv2) => {
          treasuryAccumulator.push(...treasuriesv2);
          consoleOut('v2 treasuries:', treasuriesv2, 'blue');

          if (!selectedMultisig) {
            try {
              treasuriesv1 = await ms.listTreasuries(publicKey);
            } catch (error) {
              console.error(error);
            }
            consoleOut('v1 treasuries:', treasuriesv1, 'blue');
            treasuryAccumulator.push(...treasuriesv1);
          }

          setTreasuryList(treasuryAccumulator);
          consoleOut('Combined treasury list:', treasuryAccumulator, 'blue');
          let item: Treasury | TreasuryInfo | undefined = undefined;
              
          if (treasuryAccumulator.length) {
            if (reset) {
              if (treasuryAddress) {
                // treasuryAddress was passed in as query param?
                const itemFromServer = treasuryAccumulator.find(i => i.id === treasuryAddress);
                item = itemFromServer || treasuryAccumulator[0];
              } else {
                item = treasuryAccumulator[0];
              }
            } else {
              // Try to get current item by its id
              if (treasuryAddress) {
                // treasuryAddress was passed in as query param?
                const itemFromServer = treasuryAccumulator.find(i => i.id === treasuryAddress);
                item = itemFromServer || treasuryAccumulator[0];
              } else if (treasuryDetails) {
                // there was an item already selected
                const itemFromServer = treasuryAccumulator.find(i => i.id === treasuryDetails.id);
                item = itemFromServer || treasuryAccumulator[0];
              } else {
                // then choose the first one
                item = treasuryAccumulator[0];
              }
            }

            if (!item) {
              item = Object.assign({}, treasuryAccumulator[0]);
            }

            if (item) {
              const isNewTreasury = (item as Treasury).version && (item as Treasury).version >= 2 ? true : false;
              openTreasuryById(item.id as string, isNewTreasury);
            }

          } else {
            setTreasuryDetails(undefined);
            setTreasuryDetails(undefined);
            setTreasuryStreams([]);
          }
        })
        .catch(error => {
          console.error(error);
        })
        .finally(() => setLoadingTreasuries(false));
    }

  }, [
    ms,
    msp,
    publicKey,
    connection,
    treasuryAddress,
    treasuryDetails,
    selectedMultisig,
    fetchTxInfoStatus,
    loadingTreasuries,
    clearTxConfirmationContext,
    openTreasuryById,
    getAllUserV2Treasuries
  ]);

  useEffect(() => {
    refreshTreasuries(false);
    setCustomStreamDocked(false);
  }, [refreshTreasuries]);

  const refreshUserBalances = useCallback(() => {

    if (!connection || !publicKey || !tokenList || !accounts || !accounts.tokenAccounts) {
      return;
    }

    const balancesMap: any = {};
    connection.getTokenAccountsByOwner(
      publicKey, 
      { programId: TOKEN_PROGRAM_ID }, 
      connection.commitment
    )
    .then(response => {
      for (const acc of response.value) {
        const decoded = ACCOUNT_LAYOUT.decode(acc.account.data);
        const address = decoded.mint.toBase58();
        const itemIndex = tokenList.findIndex(t => t.address === address);
        if (itemIndex !== -1) {
          balancesMap[address] = decoded.amount.toNumber() / (10 ** tokenList[itemIndex].decimals);
        } else {
          balancesMap[address] = 0;
        }
      }
    })
    .catch(error => {
      console.error(error);
      for (const t of tokenList) {
        balancesMap[t.address] = 0;
      }
    })
    .finally(() => setUserBalances(balancesMap));

  }, [
    accounts,
    publicKey,
    tokenList,
    connection,
  ]);

  const getTransactionFeesV2 = useCallback(async (action: MSP_ACTIONS_V2): Promise<TransactionFees> => {
    return await calculateActionFeesV2(connection, action);
  }, [connection]);

  // Create Stream modal
  const [isCreateStreamModalVisible, setIsCreateStreamModalVisibility] = useState(false);
  const showCreateStreamModal = useCallback(() => {
    resetTransactionStatus();
    refreshUserBalances();
    refreshTokenBalance();
    setIsCreateStreamModalVisibility(true);
    getTransactionFeesV2(MSP_ACTIONS_V2.createStreamWithFunds).then((value: any) => {
      setTransactionFees(value);
      consoleOut('transactionFees:', value, 'orange');
    });
    getTransactionFeesV2(MSP_ACTIONS_V2.withdraw).then(value => {
      setWithdrawTransactionFees(value);
      consoleOut('withdrawTransactionFees:', value, 'orange');
    });
  }, [
    refreshUserBalances,
    refreshTokenBalance,
    getTransactionFeesV2,
    resetTransactionStatus,
  ]);

  const closeCreateStreamModal = useCallback(() => {
    setIsCreateStreamModalVisibility(false);
    resetContractValues();
    refreshTokenBalance();
    resetTransactionStatus();
  }, [refreshTokenBalance, resetContractValues, resetTransactionStatus]);

  const isMultisigTreasury = useCallback((treasury?: any) => {

    const treasuryInfo: any = treasury ?? treasuryDetails;

    if (!treasuryInfo || treasuryInfo.version < 2 || !treasuryInfo.treasurer || !publicKey) {
      return false;
    }

    const treasurer = new PublicKey(treasuryInfo.treasurer as string);

    if (!treasurer.equals(publicKey) && multisigAccounts && multisigAccounts.findIndex(m => m.authority.equals(treasurer)) !== -1) {
      return true;
    }

    return false;

  }, [
    multisigAccounts, 
    publicKey, 
    treasuryDetails
  ]);

  // Open treasury modal
  const [isOpenTreasuryModalVisible, setIsOpenTreasuryModalVisibility] = useState(false);
  const showOpenTreasuryModal = useCallback(() => setIsOpenTreasuryModalVisibility(true), []);
  const closeOpenTreasuryModal = useCallback(() => setIsOpenTreasuryModalVisibility(false), []);

  const onAcceptOpenTreasury = (e: any) => {
    closeOpenTreasuryModal();
    consoleOut('treasury id:', e, 'blue');
    openTreasuryById(e, true, true);
  };

  // Create treasury modal
  const [isCreateTreasuryModalVisible, setIsCreateTreasuryModalVisibility] = useState(false);
  const showCreateTreasuryModal = useCallback(() => {
    resetTransactionStatus();
    setIsCreateTreasuryModalVisibility(true);
    getTransactionFeesV2(MSP_ACTIONS_V2.createTreasury).then(value => {
      setTransactionFees(value);
      consoleOut('transactionFees:', value, 'orange');
    });
  }, [
    getTransactionFeesV2,
    resetTransactionStatus
  ]);

  const closeCreateTreasuryModal = useCallback(() => {
    setIsCreateTreasuryModalVisibility(false);
    resetTransactionStatus();
  }, [resetTransactionStatus]);

  const onAcceptCreateTreasury = (data: TreasuryCreateOptions) => {
    consoleOut('treasury create options:', data, 'blue');
    onExecuteCreateTreasuryTx(data);
    setRetryOperationPayload(data);
  };

  const onTreasuryCreated = useCallback((createOptions: TreasuryCreateOptions) => {
    closeCreateTreasuryModal();
    refreshTokenBalance();

    // const usedOptions = retryOperationPayload as TreasuryCreateOptions;
    consoleOut('retryOperationPayload:', retryOperationPayload, 'blue');

    if (createOptions && createOptions.multisigId) {
      openNotification({
        description: t('treasuries.create-treasury.create-multisig-streaming-account-success'),
        type: "success"
      });
    } else {
      openNotification({
        description: t('treasuries.create-treasury.success-multisig-streaming-account-message'),
        type: "success"
      });
    }

  }, [
    retryOperationPayload,
    closeCreateTreasuryModal,
    refreshTokenBalance,
    t,
  ]);

  const onRefreshTreasuryBalanceTransactionFinished = useCallback(() => {
    refreshTokenBalance();
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  },[
    refreshTokenBalance, 
    setTransactionStatus
  ]);

  const onExecuteCreateTreasuryTx = async (createOptions: TreasuryCreateOptions) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTxConfirmationContext();
    resetTransactionStatus();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.TreasuryCreate);
    setRetryOperationPayload(createOptions);
    setIsBusy(true);

    const createTreasury = async (data: any) => {

      if (!connection || !msp || !publicKey) { return null; }

      const treasuryType = data.type === 'Open' ? TreasuryType.Open : TreasuryType.Lock;

      if (!data.multisig) {
        return await msp.createTreasury(
          new PublicKey(data.treasurer),                    // treasurer
          new PublicKey(data.treasurer),                    // treasurer
          new PublicKey(data.associatedTokenAddress),       // associatedToken
          data.label,                                       // label
          treasuryType                                      // type
        );
      }

      if (!multisigClient || !multisigAccounts) { return null; }

      const multisig = multisigAccounts.filter(m => m.id.toBase58() === data.multisig)[0];

      if (!multisig) { return null; }

      // Create Streaming account
      const createTreasuryTx = await msp.createTreasury(
        publicKey,                                        // payer
        multisig.authority,                               // treasurer
        new PublicKey(data.associatedTokenAddress),       // associatedToken
        data.label,                                       // label
        treasuryType,                                     // type
        true,                                             // solFeePayedByTreasury = true
      );

      const ixData = Buffer.from(createTreasuryTx.instructions[0].data);
      const ixAccounts = createTreasuryTx.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
        publicKey,
        "Create streaming account",
        "", // description
        new Date(expirationTime * 1_000),
        OperationType.TreasuryCreate,
        multisig.id,
        MSPV2Constants.MSP,
        ixAccounts,
        ixData
      );

      return tx;
    }

    const createTx = async () => {

      if (!connection || !wallet || !publicKey || !msp || !treasuryOption) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Create streaming account transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut("Start transaction for create streaming account", '', 'blue');
      consoleOut('Wallet address:', publicKey.toBase58());

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      // Create a transaction
      const associatedToken = createOptions.token;
      const payload = {
        treasurer: publicKey.toBase58(),                                                                  // treasurer
        label: createOptions.treasuryName,                                                                // label
        type: createOptions.treasuryType === TreasuryType.Open                                            // type
          ? 'Open'
          : 'Lock',
        multisig: createOptions.multisigId,                                                               // multisig
        associatedTokenAddress: associatedToken.address
      };

      consoleOut('payload:', payload);
      // Log input data
      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
        inputs: payload
      });

      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
        result: ''
      });

      // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
      // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee

      const bf = transactionFees.blockchainFee;       // Blockchain fee
      const ff = transactionFees.mspFlatFee;          // Flat fee (protocol)
      const mp = multisigTxFees.networkFee + multisigTxFees.multisigFee + multisigTxFees.rentExempt;  // Multisig proposal
      const minRequired = createOptions.multisigId ? mp : bf + ff;

      setMinRequiredBalance(minRequired);

      consoleOut('Min balance required:', minRequired, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance < minRequired) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${
            getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
          }) to pay for network fees (${
            getTokenAmountAndSymbolByTokenAddress(minRequired, NATIVE_SOL_MINT.toBase58())
          })`
        });
        customLogger.logWarning('Create streaming account transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut('Starting Create streaming account using MSP V2...', '', 'blue');

      const result = await createTreasury(payload)
        .then(value => {
          if (!value) { return false; }
          consoleOut('create streaming account returned transaction:', value);
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
          console.error('create streaming account error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Create streaming account transaction failed', { transcript: transactionLog });
          return false;
        });

      return result;
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet && publicKey) {
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
              result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logError('Create streaming account transaction failed', { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: publicKey.toBase58()}
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
            result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logError('Create streaming account transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Create streaming account transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      if (wallet) {
        return await connection
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
            customLogger.logError('Create Treasury transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Create streaming account transaction failed', { transcript: transactionLog });
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
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.TreasuryCreate);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            onTreasuryCreated(createOptions);
            setNeedReloadMultisig(true);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  };

  // TODO: Here the multisig ID is returned
  const getSelectedTreasuryMultisig = useCallback((treasury?: any) => {

    const treasuryInfo: any = treasury ?? treasuryDetails;

    if (!treasuryInfo || treasuryInfo.version < 2 || !treasuryInfo.treasurer || !publicKey) {
      return PublicKey.default;
    }

    const treasurer = new PublicKey(treasuryInfo.treasurer as string);

    if (!multisigAccounts || !treasuryDetails) { return PublicKey.default; }
    const multisig = multisigAccounts.filter(a => a.authority.equals(treasurer))[0];
    if (!multisig) { return PublicKey.default; }
    return multisig.id;

  }, [
    multisigAccounts, 
    publicKey, 
    treasuryDetails
  ])

  // Get the Multisig accounts
  // TODO: Signal when it is loading
  useEffect(() => {

    if (!connection || !publicKey || !multisigClient || !multisigAddress || !needReloadMultisig) {
      return;
    }

    const timeout = setTimeout(() => {

      consoleOut('Loading multisigs...', '', 'blue');
      setNeedReloadMultisig(false);
      setLoadingMultisigAccounts(true);

      multisigClient
        .getMultisigs(publicKey)
        .then((allInfo: MultisigInfo[]) => {
          allInfo.sort((a: any, b: any) => b.createdOnUtc.getTime() - a.createdOnUtc.getTime());
          setMultisigAccounts(allInfo);
          consoleOut('multisigs:', allInfo, 'blue');
        })
        .catch(err => {
          console.error(err);
        })
        .finally(() => {
          setLoadingMultisigAccounts(false);
        });
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    publicKey,
    connection,
    multisigClient,
    multisigAddress,
    needReloadMultisig,
  ]);

  // Set selectedMultisig based on the passed-in multisigAddress in query params
  useEffect(() => {

    if (!publicKey || !multisigAddress || !multisigAccounts || multisigAccounts.length === 0) {
      return;
    }

    const timeout = setTimeout(() => {
      if (location.search) {
        consoleOut(`try to select multisig ${multisigAddress} from list`, multisigAccounts, 'blue');
        const selected = multisigAccounts.find(m => m.authority.toBase58() === multisigAddress);
        if (selected) {
          consoleOut('selectedMultisig:', selected, 'blue');
          setSelectedMultisig(selected);
        } else {
          consoleOut('multisigAccounts does not contain the requested multisigAddress:', multisigAddress, 'orange');
        }
      }
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    publicKey,
    location.search,
    multisigAddress,
    multisigAccounts,
  ]);

  // Treasury list refresh timeout
  useEffect(() => {
    let timer: any;

    if (publicKey && treasuriesLoaded && !customStreamDocked) {
      timer = setInterval(() => {
        consoleOut(`Refreshing treasuries past ${HALF_MINUTE_REFRESH_TIMEOUT / 60 / 1000}min...`);
        refreshTreasuries(false);
      }, HALF_MINUTE_REFRESH_TIMEOUT);
    }

    return () => clearInterval(timer);
  }, [
    publicKey,
    treasuriesLoaded,
    customStreamDocked,
    refreshTreasuries
  ]);

  // Reload Treasury streams whenever the selected treasury changes
  useEffect(() => {
    if (!publicKey) { return; }

    if (treasuryDetails && !loadingTreasuryStreams && signalRefreshTreasuryStreams) {
      setSignalRefreshTreasuryStreams(false);
      consoleOut('calling getTreasuryStreams...', '', 'blue');
      const treasuryPk = new PublicKey(treasuryDetails.id as string);
      const isNewTreasury = (treasuryDetails as Treasury).version && (treasuryDetails as Treasury).version >= 2
        ? true
        : false;
      getTreasuryStreams(treasuryPk, isNewTreasury);
    }
  }, [
    ms,
    publicKey,
    treasuryStreams,
    treasuryDetails,
    loadingTreasuryStreams,
    signalRefreshTreasuryStreams,
    getTreasuryStreams,
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

  const getStreamTitle = (item: Stream | StreamInfo): string => {
    let title = '';
    if (item) {
      const v1 = item as StreamInfo;
      const v2 = item as Stream;

      if (v1.version < 2) {
        if (v1.streamName) {
          return `${v1.streamName}`;
        }
        
        if (v1.isUpdatePending) {
          title = `${t('streams.stream-list.title-pending-from')} (${shortenAddress(`${v1.treasurerAddress}`)})`;
        } else if (v1.state === STREAM_STATE.Schedule) {
          title = `${t('streams.stream-list.title-scheduled-from')} (${shortenAddress(`${v1.treasurerAddress}`)})`;
        } else if (v1.state === STREAM_STATE.Paused) {
          title = `${t('streams.stream-list.title-paused-from')} (${shortenAddress(`${v1.treasurerAddress}`)})`;
        } else {
          title = `${t('streams.stream-list.title-receiving-from')} (${shortenAddress(`${v1.treasurerAddress}`)})`;
        }
      } else {
        if (v2.name) {
          return `${v2.name}`;
        }

        if (v2.status === STREAM_STATUS.Schedule) {
          title = `${t('streams.stream-list.title-scheduled-from')} (${shortenAddress(`${v2.treasurer}`)})`;
        } else if (v2.status === STREAM_STATUS.Paused) {
          title = `${t('streams.stream-list.title-paused-from')} (${shortenAddress(`${v2.treasurer}`)})`;
        } else {
          title = `${t('streams.stream-list.title-receiving-from')} (${shortenAddress(`${v2.treasurer}`)})`;
        }
      }
    }

    return title;
  }

  const getRateAmountDisplay = useCallback((item: Stream | StreamInfo): string => {
    let value = '';
    if (item) {
      let token = item.associatedToken ? getTokenByMintAddress(item.associatedToken as string) : undefined;

      if (token && token.address === WRAPPED_SOL_MINT_ADDRESS) {
        token = Object.assign({}, token, {
          symbol: 'SOL'
        }) as TokenInfo;
      }

      if (item.version < 2) {
        value += getFormattedNumberToLocale(formatAmount(item.rateAmount, 2));
      } else {
        value += getFormattedNumberToLocale(formatAmount(toUiAmount(new BN(item.rateAmount), token?.decimals || 6), 2));
      }
      value += ' ';
      value += token ? token.symbol : `[${shortenAddress(item.associatedToken as string)}]`;
    }
    return value;
  }, [getTokenByMintAddress]);

  const getDepositAmountDisplay = useCallback((item: Stream | StreamInfo): string => {
    let value = '';

    if (item && item.rateAmount === 0 && item.allocationAssigned > 0) {
      let token = item.associatedToken ? getTokenByMintAddress(item.associatedToken as string) : undefined;

      if (token && token.address === WRAPPED_SOL_MINT_ADDRESS) {
        token = Object.assign({}, token, {
          symbol: 'SOL'
        }) as TokenInfo;
      }

      if (item.version < 2) {
        value += getFormattedNumberToLocale(formatAmount(item.rateAmount, 2));
      } else {
        value += getFormattedNumberToLocale(formatAmount(toUiAmount(new BN(item.rateAmount), token?.decimals || 6), 2));
      }
      value += ' ';
      value += token ? token.symbol : `[${shortenAddress(item.associatedToken as string)}]`;
    }
    return value;
  }, [getTokenByMintAddress]);

  const getStreamSubtitle = useCallback((item: Stream | StreamInfo) => {
    let subtitle = '';

    if (item) {
      let rateAmount = item.rateAmount > 0 ? getRateAmountDisplay(item) : getDepositAmountDisplay(item);
      if (item.rateAmount > 0) {
        rateAmount += ' ' + getIntervalFromSeconds(item.rateIntervalInSeconds, true, t);
      }

      subtitle = rateAmount;
    }

    return subtitle;

  }, [getRateAmountDisplay, getDepositAmountDisplay, t]);

  const getStreamStatus = useCallback((item: Stream | StreamInfo) => {
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
        switch (v2.status) {
          case STREAM_STATUS.Schedule:
            return t('streams.status.status-scheduled');
          case STREAM_STATUS.Paused:
            if (v2.isManuallyPaused) {
              return t('streams.status.status-paused');
            }
            return t('streams.status.status-stopped');
          default:
            return t('streams.status.status-running');
        }
      }
    }
  }, [t]);

  const getStreamResume = useCallback((item: Stream | StreamInfo) => {
    if (item) {
      const v1 = item as StreamInfo;
      const v2 = item as Stream;
      if (v1.version < 2) {
        switch (v1.state) {
          case STREAM_STATE.Schedule:
            return t('streams.status.scheduled', {date: getShortDate(v1.startUtc as string)});
          case STREAM_STATE.Paused:
            return t('streams.status.stopped');
          default:
            return t('streams.status.streaming');
        }
      } else {
        switch (v2.status) {
          case STREAM_STATUS.Schedule:
            return `starts on ${getShortDate(v2.startUtc as string)}`;
          case STREAM_STATUS.Paused:
            if (v2.isManuallyPaused) {
              return `paused on ${getShortDate(v2.startUtc as string)}`;
            }
            return `out of funds on ${getShortDate(v2.startUtc as string)}`;
          default:
            return `streaming since ${getShortDate(v2.startUtc as string)}`;
        }
      }
    }
  }, [t]);

  const [incomingStreamList, setIncomingStreamList] = useState<Array<Stream | StreamInfo> | undefined>();

  const [outgoingStreamList, setOutgoingStreamList] = useState<Array<Stream | StreamInfo> | undefined>();

  const [incomingAmount, setIncomingAmount] = useState(0);
  const [outgoingAmount, setOutgoingAmount] = useState(0);

  useEffect(() => {
    if (!connection || !publicKey || !streamList) { return; }

    setIncomingStreamList(streamList.filter((stream: Stream | StreamInfo) => isInboundStream(stream)));

    setOutgoingStreamList(streamList.filter((stream: Stream | StreamInfo) => !isInboundStream(stream)));

  }, [connection, isInboundStream, publicKey, streamList]);

  useEffect(() => {
    if (!incomingStreamList || !outgoingStreamList) { return; }

    setIncomingAmount(incomingStreamList.length);
    setOutgoingAmount(outgoingStreamList.length);

  }, [incomingStreamList, outgoingStreamList]);

  // Protocol
  const listOfBadges = ["MSP", "DEFI", "Money Streams"];

  const renderBadges = (
    <div className="badge-container">
      {listOfBadges.map((badge, index) => (
        <span key={`${badge}+${index}`} className="badge darken small text-uppercase mr-1">{badge}</span>
      ))}
      </div>
  );

  // Balance
  const renderBalance = (
    <a href="#" className="simplelink underline-on-hover">Tracking 2 smart contracts</a>
  );

  const infoData = [
    {
      name: "Protocol",
      value: "Money Streams",
      content: renderBadges
    },
    {
      name: "Balance (My TVL)",
      value: "$3,391.01",
      content: renderBalance
    }
  ];

  const goToIncomingTabHandler = () => {
    const url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming/incoming`;

    navigate(url);
  }

  const goToOutgoingTabHandler = () => {
    const url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming/outgoing`;

    navigate(url);
  }

  const renderSummary = (
    <>
      <Row gutter={[8, 8]}>
        <Col xs={23} sm={11} md={23} lg={11} className="background-card simplelink" onClick={goToIncomingTabHandler}>
          <div className="incoming-stream-amount">
            <div className="d-flex align-items-center">
              <h3>Incoming Streams</h3>
              <span className="info-icon">
                {incomingAmount ? (
                  <ArrowDownOutlined className="mean-svg-icons incoming bounce" />
                ) : (
                  <ArrowDownOutlined className="mean-svg-icons incoming" />
                )}
              </span>
            </div>
            <span className="incoming-amount">+$15.40/day</span>
          </div>
          <div className="card-row">
            <div className="card-column">
              <div className="info-label">
                Balance
              </div>
              <div className="info-value">
                $49,853.58
              </div>
            </div>
            <div className="card-column">
              <div className="info-label">
                Total streams
              </div>
              <div className="info-value">
                {incomingAmount} {incomingAmount > 1 ? "streams" : "stream"}
              </div>
            </div>
          </div>
        </Col>
        <Col xs={23} sm={11} md={23} lg={11} className="background-card simplelink" onClick={goToOutgoingTabHandler}>
          <div className="outgoing-stream-amount">
            <div className="d-flex align-items-center">
              <h3>Outgoing Streams</h3>
              <span className="info-icon">
                {outgoingAmount ? (
                  <ArrowUpOutlined className="mean-svg-icons outgoing bounce" />
                ) : (
                  <ArrowUpOutlined className="mean-svg-icons outgoing" />
                )}
              </span>
            </div>
            <span className="outgoing-amount">-$4.00/day</span>
          </div>
          <div className="card-row">
            <div className="card-column">
              <div className="info-label">
                Balance
              </div>
              <div className="info-value">
                $12,291.01
              </div>
            </div>
            <div className="card-column">
              <div className="info-label">
                Total streams
              </div>
              <div className="info-value">
                {outgoingAmount} {outgoingAmount > 1 ? "streams" : "stream"}
              </div>
            </div>
          </div>
        </Col>
      </Row>

      {(incomingAmount > 0 && outgoingAmount > 0) && (
        <PieChartComponent
          incomingAmount={incomingAmount}
          outgoingAmount={outgoingAmount}
        />
      )}
    </>
  );

  const subtitle = accountAddress && (
    <CopyExtLinkGroup
      content={accountAddress}
      number={8}
      externalLink={true}
    />
  );

  // Incoming streams list
  const renderListOfIncomingStreams = (
    <>
      {incomingStreamList && incomingStreamList.map((stream, index) => {
        const onSelectStream = () => {
          // Sends outgoing stream value to the parent component "Accounts"
          onSendFromIncomingStreamInfo(stream);
        };

        const title = stream ? getStreamTitle(stream) : "Unknown incoming stream";
        const subtitle = getStreamSubtitle(stream);
        const status = getStreamStatus(stream);
        const resume = getStreamResume(stream);

        return (
          <div 
            key={index}
            onClick={onSelectStream}
            className={`d-flex w-100 align-items-center simplelink ${(index + 1) % 2 === 0 ? '' : 'background-gray'}`}
          >
            <ResumeItem
              id={index}
              title={title}
              subtitle={subtitle}
              resume={resume}
              status={status}
              hasRightIcon={true}
              rightIcon={<IconArrowForward className="mean-svg-icons" />}
              isLink={true}
              isStream={true}
            />
          </div>
        )
      })}
    </>
  );

  // Dropdown (three dots button) inside outgoing stream list
  const menu = (
    <Menu>
      <Menu.Item key="00" onClick={showCreateStreamModal}>
        <span className="menu-item-text">Add outgoing stream</span>
      </Menu.Item>
      <Menu.Item key="01" onClick={showCreateTreasuryModal}>
        <span className="menu-item-text">Add streaming account</span>
      </Menu.Item>
    </Menu>
  );

  // Outgoing streams list
  const renderListOfOutgoingStreams = (
    <>
      <ResumeItem
        title="Outflows"
        classNameTitle="text-uppercase"
        subtitle={subtitle}
        amount={outgoingAmount}
        resume="outflow"
        className="account-category-title"
        hasRightIcon={true}
        rightIconHasDropdown={true}
        rightIcon={<IconVerticalEllipsis className="mean-svg-icons"/>}
        dropdownMenu={menu}
        isLink={false}
      />
      {outgoingStreamList && outgoingStreamList.map((stream, index) => {
        const onSelectStream = () => {
          // Sends outgoing stream value to the parent component "Accounts"
          onSendFromOutgoingStreamInfo(stream);
        };

        const title = stream ? getStreamTitle(stream) : "Unknown outgoing stream";
        const subtitle = getStreamSubtitle(stream);
        const status = getStreamStatus(stream);
        const resume = getStreamResume(stream);

        return (
          <div 
            key={index}
            onClick={onSelectStream}
            className={`d-flex w-100 align-items-center simplelink ${(index + 1) % 2 === 0 ? '' : 'background-gray'}`}
          >
            <ResumeItem
              id={index}
              title={title}
              subtitle={subtitle}
              resume={resume}
              status={status}
              hasRightIcon={true}
              rightIcon={<IconArrowForward className="mean-svg-icons" />}
              isLink={true}
              isStream={true}
            />
          </div>
        )
      })}

      {treasuryList && treasuryList.length > 0 ? (
        treasuryList.filter(item => item !== null && item !== undefined).map((item, index) => {
          const v1 = item as TreasuryInfo;
          const v2 = item as Treasury;
          const isNewTreasury = item && item.version >= 2 ? true : false;

          const onSelectedStreamingAccount = () => {
            setTreasuryDetails(item);
            // Sends outgoing stream value to the parent component "Accounts"
            onSendFromStreamingAccountDetails(item);
          }

          const state = isNewTreasury
            ? v2.treasuryType === TreasuryType.Open ? 'Open' : 'Locked'
            : v1.type === TreasuryType.Open ? 'Open' : 'Locked';

          const title = isNewTreasury ? v2.name : v1.label;

          const subtitle = <CopyExtLinkGroup
            content={item.id as string}
            number={8}
            externalLink={true}
          />;

          const amount = isNewTreasury ? v2.totalStreams : v1.streamsAmount;

          const resume = amount > 1 ? "streams" : "stream";

          return (
            <div 
              key={index}
              // onClick={onSelectedStreamingAccount}
              // className={`d-flex w-100 align-items-center simplelink ${(index + 1) % 2 === 0 ? '' : 'background-gray'}`}
            >
              <ResumeItem
                title={title}
                extraTitle={state}
                classNameTitle="text-uppercase"
                subtitle={subtitle}
                amount={amount}
                resume={resume}
                className="account-category-title"
                hasRightIcon={true}
                rightIcon={<IconArrowForward className="mean-svg-icons" />}
                isLink={true}
                onClick={onSelectedStreamingAccount}
              />
            </div>
          )
        })
      ) : null}
      {/* {teamSalary.map((stream, index) => {
        const onSelectStream = () => {
          // Sends outgoing stream value to the parent component "Accounts"
          onSendFromOutgoingStreamInfo(stream);
        };

        const title = stream.title ? stream.title : "Unknown salary";

        return (
          <div 
            key={index}
            onClick={onSelectStream}
            className={`d-flex w-100 align-items-center simplelink ${(index + 1) % 2 === 0 ? '' : 'background-gray'}`}
            >
              <ResumeItem
                id={index}
                title={title}
                status={stream.status}
                subtitle={stream.amount}
                resume={stream.resume}
                hasRightIcon={true}
                rightIcon={<IconArrowForward className="mean-svg-icons" />}
                isLink={true}
              />
          </div>
        )
      })} */}
    </>
  );

  const onTabChange = useCallback((activeKey: string) => {
    consoleOut('Selected tab option:', activeKey, 'blue');
    // /accounts/:address/streaming/:streamingTab
    const url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming/${activeKey}`;
    navigate(url);
  }, [accountAddress, navigate]);

  // Tabs
  const tabs = [
    {
      id: "summary",
      name: "Summary",
      render: renderSummary
    },
    {
      id: "incoming",
      name: `Incoming ${incomingAmount > 0 ? `(${incomingAmount})` : ""}`,
      render: incomingAmount > 0 ? renderListOfIncomingStreams : "You don't have any incoming stream"
    },
    {
      id: "outgoing",
      name: `Outgoing ${outgoingAmount > 0 ? `(${outgoingAmount})` : ""}`,
      render: outgoingAmount > 0 ? renderListOfOutgoingStreams : "You don't have any outgoing stream"
    },
  ];

  const renderTabset = () => {
    return (
      <Tabs activeKey={selectedTab} onChange={onTabChange} className="neutral">
        {tabs.map(item => {
          return (
            <TabPane tab={item.name} key={item.id} tabKey={item.id}>
              {item.render}
            </TabPane>
          );
        })}
      </Tabs>
    );
  }

  return (
    <>
      <RightInfoDetails
        infoData={infoData}
      />

      {selectedTab === "summary" && (
        <Row gutter={[8, 8]} className="safe-btns-container mb-1">
          <Col xs={24} sm={24} md={24} lg={24} className="btn-group">
            <Button
              type="default"
              shape="round"
              size="small"
              className="thin-stroke"
              onClick={showCreateStreamModal}>
                <div className="btn-content">
                  Create stream
                </div>
            </Button>
            <Button
              type="default"
              shape="round"
              size="small"
              className="thin-stroke"
              onClick={showOpenTreasuryModal}>
                <div className="btn-content">
                  Find money stream
                </div>
            </Button>
          </Col>
        </Row>
      )}

      {renderTabset()}

      {/* TODO: Here the multisig ID is used */}
      {multisigClient && isCreateStreamModalVisible && (
        <TreasuryStreamCreateModal
          associatedToken={
            treasuryDetails
              ? (treasuryDetails as Treasury).version && (treasuryDetails as Treasury).version >= 2
                ? (treasuryDetails as Treasury).associatedToken as string
                : (treasuryDetails as TreasuryInfo).associatedTokenAddress as string
              : ''
          }
          connection={connection}
          handleClose={closeCreateStreamModal}
          handleOk={closeCreateStreamModal}
          isVisible={isCreateStreamModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          withdrawTransactionFees={withdrawTransactionFees}
          treasuryDetails={treasuryDetails}
          isMultisigTreasury={isMultisigTreasury()}
          minRequiredBalance={minRequiredBalance}
          multisigClient={multisigClient}
          multisigAddress={getSelectedTreasuryMultisig()}
          userBalances={userBalances}
        />
      )}

      {isOpenTreasuryModalVisible && (
        <TreasuryOpenModal
          isVisible={isOpenTreasuryModalVisible}
          handleOk={onAcceptOpenTreasury}
          handleClose={closeOpenTreasuryModal}
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
          multisigAccounts={multisigAccounts || []}
          multisigAddress={multisigAddress || undefined}
        />
      )}
    </>
  )
}