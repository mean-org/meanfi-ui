import { ArrowDownOutlined, ArrowUpOutlined } from "@ant-design/icons";
import { DEFAULT_EXPIRATION_TIME_SECONDS, getFees, MeanMultisig, MultisigInfo, MultisigTransactionFees, MULTISIG_ACTIONS } from "@mean-dao/mean-multisig-sdk";
import { MoneyStreaming } from '@mean-dao/money-streaming/lib/money-streaming';
import { StreamInfo, STREAM_STATE, TreasuryInfo } from "@mean-dao/money-streaming/lib/types";
import {
  calculateActionFees as calculateActionFeesV2, MSP, MSP_ACTIONS as MSP_ACTIONS_V2, Stream, STREAM_STATUS, TransactionFees, Treasury, TreasuryType
} from '@mean-dao/msp';
import { AccountInfo, Connection, LAMPORTS_PER_SOL, ParsedAccountData, PublicKey, Transaction } from "@solana/web3.js";
import { Button, Col, Dropdown, Menu, Row, Space, Spin, Tabs } from "antd";
import { ItemType } from "antd/lib/menu/hooks/useItems";
import BigNumber from "bignumber.js";
import BN from "bn.js";
import { CopyExtLinkGroup } from "components/CopyExtLinkGroup";
import { Identicon } from "components/Identicon";
import { openNotification } from "components/Notifications";
import { ResumeItem } from "components/ResumeItem";
import { RightInfoDetails } from "components/RightInfoDetails";
import { SendAssetModal } from "components/SendAssetModal";
import { StreamOpenModal } from "components/StreamOpenModal";
import { TreasuryAddFundsModal } from "components/TreasuryAddFundsModal";
import { TreasuryCreateModal } from "components/TreasuryCreateModal";
import { TreasuryStreamCreateModal } from "components/TreasuryStreamCreateModal";
import {
  ACCOUNTS_ROUTE_BASE_PATH,
  CUSTOM_TOKEN_NAME,
  FALLBACK_COIN_IMAGE,
  MEAN_MULTISIG_ACCOUNT_LAMPORTS,
  NO_FEES
} from "constants/common";
import { NATIVE_SOL } from "constants/tokens";
import { useNativeAccount } from "contexts/accounts";
import { AppStateContext } from "contexts/appstate";
import { useConnectionConfig } from "contexts/connection";
import { TxConfirmationContext } from "contexts/transaction-status";
import { useWallet } from "contexts/wallet";
import useWindowSize from "hooks/useWindowResize";
import { IconArrowForward, IconEllipsisVertical, IconLoading } from "Icons";
import { appConfig, customLogger } from "index";
import { fetchAccountTokens, readAccountInfo } from "middleware/accounts";
import { NATIVE_SOL_MINT } from "middleware/ids";
import { getStreamTitle } from "middleware/streams";
import { consoleOut, getIntervalFromSeconds, getShortDate, getTransactionStatusForLogs, toUsCurrency } from "middleware/ui";
import {
  cutNumber,
  displayAmountWithSymbol,
  formatThousands,
  getAmountFromLamports,
  getAmountWithSymbol,
  getTxIxResume,
  shortenAddress,
  toTokenAmountBn,
  toUiAmount
} from "middleware/utils";
import { TreasuryTopupParams } from "models/common-types";
import { OperationType, TransactionStatus } from "models/enums";
import { ZERO_FEES } from "models/multisig";
import { TokenInfo } from "models/SolanaTokenInfo";
import { StreamsSummary } from "models/streams";
import { TreasuryCreateOptions, UserTreasuriesSummary } from "models/treasuries";
import { AddFundsParams } from "models/vesting";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { isMobile } from "react-device-detect";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import Wave from 'react-wavify';
import "./style.scss";

export const MoneyStreamsInfoView = (props: {
  loadingStreams: boolean;
  loadingTreasuries: boolean;
  multisigAccounts: MultisigInfo[] | undefined;
  onSendFromIncomingStreamInfo?: any;
  onSendFromOutgoingStreamInfo?: any;
  onSendFromStreamingAccountInfo?: any;
  selectedMultisig: MultisigInfo | undefined;
  selectedTab: string;
  streamList: Array<Stream | StreamInfo> | undefined;
  treasuryList: (Treasury | TreasuryInfo)[];
}) => {
  const {
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
  } = props;
  const {
    splTokenList,
    streamListv1,
    streamListv2,
    treasuryOption,
    selectedAccount,
    transactionStatus,
    streamProgramAddress,
    streamV2ProgramAddress,
    getTokenPriceByAddress,
    setIsVerifiedRecipient,
    getTokenPriceBySymbol,
    getTokenByMintAddress,
    setTransactionStatus,
    refreshTokenBalance,
    resetContractValues,
    openStreamById
  } = useContext(AppStateContext);
  const {
    enqueueTransactionConfirmation,
  } = useContext(TxConfirmationContext);
  const connectionConfig = useConnectionConfig();
  const { publicKey, wallet } = useWallet();
  const { t } = useTranslation('common');
  const { account } = useNativeAccount();
  const { width } = useWindowSize();
  const navigate = useNavigate();

  // Transactions
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [userBalances, setUserBalances] = useState<any>();
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
  const [streamingAccountsSummary, setStreamingAccountsSummary] = useState<UserTreasuriesSummary | undefined>(undefined);
  const [incomingStreamsSummary, setIncomingStreamsSummary] = useState<StreamsSummary | undefined>(undefined);
  const [outgoingStreamsSummary, setOutgoingStreamsSummary] = useState<StreamsSummary | undefined>(undefined);
  const [hasIncomingStreamsRunning, setHasIncomingStreamsRunning] = useState<number>();
  const [hasOutgoingStreamsRunning, setHasOutgoingStreamsRunning] = useState<number>();
  const [isXsDevice, setIsXsDevice] = useState<boolean>(isMobile);

  ////////////
  //  Init  //
  ////////////

  const mspV2AddressPK = useMemo(() => new PublicKey(appConfig.getConfig().streamV2ProgramAddress), []);
  const multisigAddressPK = useMemo(() => new PublicKey(appConfig.getConfig().multisigProgramAddress), []);

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
      "confirmed",
      multisigAddressPK
    );

  }, [
    connection,
    publicKey,
    multisigAddressPK,
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

  const isMultisigContext = useMemo(() => {
    return publicKey && selectedAccount.isMultisig ? true : false;
  }, [publicKey, selectedAccount]);

  /////////////////
  //  Callbacks  //
  /////////////////

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }, [setTransactionStatus]);

  const getTokenOrCustomToken = useCallback(async (address: string) => {

    const token = getTokenByMintAddress(address);

    const unkToken = {
      address: address,
      name: CUSTOM_TOKEN_NAME,
      chainId: 101,
      decimals: 6,
      symbol: shortenAddress(address),
    };

    if (token) {
      return token;
    } else {
      return await readAccountInfo(connection, address)
      .then(info => {
        if ((info as any).data["parsed"]) {
          const decimals = (info as AccountInfo<ParsedAccountData>).data.parsed.info.decimals as number;
          unkToken.decimals = decimals || 0;
          return unkToken as TokenInfo;
        } else {
          return unkToken as TokenInfo;
        }
      })
      .catch(err => {
        console.error('Could not get token info, assuming decimals = 6');
        return unkToken as TokenInfo;
      });
    }
  }, [connection, getTokenByMintAddress]);

  const getMultisigTxProposalFees = useCallback(() => {

    if (!multisigClient) { return; }

    getFees(multisigClient.getProgram(), MULTISIG_ACTIONS.createTransaction)
      .then(value => {
        setMultisigTransactionFees(value);
        consoleOut('multisigTransactionFees:', value, 'orange');
        consoleOut('nativeBalance:', nativeBalance, 'blue');
        consoleOut('networkFee:', value.networkFee, 'blue');
        consoleOut('rentExempt:', value.rentExempt, 'blue');
        const totalMultisigFee = value.multisigFee + (MEAN_MULTISIG_ACCOUNT_LAMPORTS / LAMPORTS_PER_SOL);
        consoleOut('multisigFee:', totalMultisigFee, 'blue');
        const minRequired = totalMultisigFee + value.rentExempt + value.networkFee;
        consoleOut('Min required balance:', minRequired, 'blue');
        setMinRequiredBalance(minRequired);
      });

    resetTransactionStatus();

  }, [multisigClient, nativeBalance, resetTransactionStatus]);

  const refreshUserBalances = useCallback((source?: PublicKey) => {

    if (!connection || !publicKey || !splTokenList) {
      return;
    }

    const balancesMap: any = {};
    const pk = source || publicKey;
    consoleOut('Reading balances for:', pk.toBase58(), 'darkpurple');

    connection.getBalance(pk)
    .then(solBalance => {
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    publicKey,
    connection,
  ]);

  const getRateAmountBn = useCallback((item: Stream | StreamInfo, decimals: number) => {
    if (item) {
      const rateAmount = item.version < 2
        ? toTokenAmountBn(item.rateAmount as number, decimals)
        : item.rateAmount as BN;
      return rateAmount;
    }
    return new BN(0);
  }, []);

  const getTreasuryUnallocatedBalance = useCallback((tsry: Treasury | TreasuryInfo, assToken: TokenInfo | undefined) => {

    const getUnallocatedBalance = (details: Treasury | TreasuryInfo) => {
      const balance = new BN(details.balance);
      const allocationAssigned = new BN(details.allocationAssigned);
      return balance.sub(allocationAssigned);
    }

    if (tsry) {
        const decimals = assToken ? assToken.decimals : 9;
        const unallocated = getUnallocatedBalance(tsry);
        const isNewTreasury = (tsry as Treasury).version && (tsry as Treasury).version >= 2 ? true : false;
        const ub = isNewTreasury
          ? new BigNumber(toUiAmount(unallocated, decimals)).toNumber()
          : new BigNumber(unallocated.toString()).toNumber();
        return ub;
    }
    return 0;
  }, []);

  const refreshTreasuriesSummary = useCallback(async () => {

    if (!treasuryList) { return; }

    const resume: UserTreasuriesSummary = {
        totalAmount: 0,
        openAmount: 0,
        lockedAmount: 0,
        totalNet: 0
    };

    // consoleOut('=========== Block start ===========', '', 'orange');

    for (const treasury of treasuryList) {

        const isNew = (treasury as Treasury).version && (treasury as Treasury).version >= 2
            ? true
            : false;

        const treasuryType = isNew
            ? (treasury as Treasury).treasuryType
            : (treasury as TreasuryInfo).type as TreasuryType;

        const associatedToken = isNew
            ? (treasury as Treasury).associatedToken as string
            : (treasury as TreasuryInfo).associatedTokenAddress as string;

        if (treasuryType === TreasuryType.Open) {
            resume['openAmount'] += 1;
        } else {
            resume['lockedAmount'] += 1;
        }

        let amountChange = 0;

        const token = getTokenByMintAddress(associatedToken as string);

        if (token) {
          const tokenPrice = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);
          const amount = getTreasuryUnallocatedBalance(treasury, token);
          amountChange = amount * tokenPrice;
        }

        resume['totalNet'] += amountChange;
    }

    resume['totalAmount'] += treasuryList.length;

    // consoleOut('totalNet in streaming accounts:', resume['totalNet'], 'blue');
    // consoleOut('=========== Block ends ===========', '', 'orange');

    return resume;

  }, [
    treasuryList,
    getTokenByMintAddress,
    getTokenPriceByAddress,
    getTokenPriceBySymbol,
    getTreasuryUnallocatedBalance
  ]);

  const refreshIncomingStreamSummary = useCallback(async () => {

    if (!ms || !msp || !publicKey || (!streamListv1 && !streamListv2)) { return; }

    const resume: StreamsSummary = {
      totalNet: 0,
      incomingAmount: 0,
      outgoingAmount: 0,
      totalAmount: 0
    };

    const treasurer = selectedAccount.address
      ? new PublicKey(selectedAccount.address)
      : publicKey;

    const updatedStreamsv1 = await ms.refreshStreams(streamListv1 || [], treasurer);
    const updatedStreamsv2 = await msp.refreshStreams(streamListv2 || [], treasurer);

    for (const stream of updatedStreamsv1) {

      const isIncoming = stream.beneficiaryAddress && stream.beneficiaryAddress === treasurer.toBase58()
        ? true
        : false;

      // Get refreshed data
      const freshStream = await ms.refreshStream(stream, undefined, false) as StreamInfo;
      if (!freshStream || freshStream.state !== STREAM_STATE.Running) { continue; }

      const token = getTokenByMintAddress(freshStream.associatedToken as string);

      if (token) {
        const tokenPrice = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);

        if (isIncoming) {
          resume['totalNet'] = resume['totalNet'] + ((freshStream.escrowVestedAmount || 0) * tokenPrice);
        }
      }
    }

    resume['totalAmount'] = updatedStreamsv1.length;

    for (const stream of updatedStreamsv2) {

      const isIncoming = stream.beneficiary && stream.beneficiary.equals(treasurer)
        ? true
        : false;

      // Get refreshed data
      const freshStream = await msp.refreshStream(stream, undefined) as Stream;
      if (!freshStream || freshStream.status !== STREAM_STATUS.Running) { continue; }

      const token = getTokenByMintAddress(freshStream.associatedToken.toBase58());

      if (token) {
        const tokenPrice = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);
        const decimals = token.decimals || 9;
        const amount = new BigNumber(freshStream.withdrawableAmount.toString()).toNumber();
        const amountChange = parseFloat((amount / 10 ** decimals).toFixed(decimals)) * tokenPrice;

        if (isIncoming) {
          resume['totalNet'] += amountChange;
        }
      }
    }

    resume['totalAmount'] += updatedStreamsv2.length;

    setIncomingStreamsSummary(resume);

    return resume;
  }, [
    ms,
    msp,
    publicKey,
    streamListv1,
    streamListv2,
    selectedAccount.address,
    getTokenByMintAddress,
    getTokenPriceBySymbol,
    getTokenPriceByAddress,
  ]);

  const refreshOutgoingStreamSummary = useCallback(async () => {

    if (!ms || !msp || !publicKey || (!streamListv1 && !streamListv2)) { return; }

    const resume: StreamsSummary = {
      totalNet: 0,
      incomingAmount: 0,
      outgoingAmount: 0,
      totalAmount: 0
    };

    const treasurer = selectedAccount.address
      ? new PublicKey(selectedAccount.address)
      : publicKey;

    const updatedStreamsv1 = await ms.refreshStreams(streamListv1 || [], treasurer);
    const updatedStreamsv2 = await msp.refreshStreams(streamListv2 || [], treasurer);

    for (const stream of updatedStreamsv1) {

      const isIncoming = stream.beneficiaryAddress && stream.beneficiaryAddress === treasurer.toBase58()
        ? true
        : false;

      // Get refreshed data
      const freshStream = await ms.refreshStream(stream) as StreamInfo;
      if (!freshStream || freshStream.state !== STREAM_STATE.Running) { continue; }

      const token = getTokenByMintAddress(freshStream.associatedToken as string);

      if (token) {
        const tokenPrice = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);

        if (!isIncoming) {
          resume['totalNet'] = resume['totalNet'] + ((freshStream.escrowUnvestedAmount || 0) * tokenPrice);
        }
      }
    }

    resume['totalAmount'] = updatedStreamsv1.length;

    for (const stream of updatedStreamsv2) {

      const isIncoming = stream.beneficiary && stream.beneficiary.equals(treasurer)
        ? true
        : false;

      // Get refreshed data
      const freshStream = await msp.refreshStream(stream) as Stream;
      if (!freshStream || freshStream.status !== STREAM_STATUS.Running) { continue; }

      const token = getTokenByMintAddress(freshStream.associatedToken.toBase58());

      if (token) {
        const tokenPrice = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);
        const decimals = token.decimals || 9;
        const amount = new BigNumber(freshStream.fundsLeftInStream.toString()).toNumber();
        const amountChange = parseFloat((amount / 10 ** decimals).toFixed(decimals)) * tokenPrice;

        if (!isIncoming) {
          resume['totalNet'] += amountChange;
        }
      }
    }

    resume['totalAmount'] += updatedStreamsv2.length;

    setOutgoingStreamsSummary(resume);
    return resume;
  }, [
    ms,
    msp,
    publicKey,
    streamListv1,
    streamListv2,
    selectedAccount.address,
    getTokenPriceBySymbol,
    getTokenByMintAddress,
    getTokenPriceByAddress,
  ]);

  const getTransactionFeesV2 = useCallback(async (action: MSP_ACTIONS_V2): Promise<TransactionFees> => {
    return await calculateActionFeesV2(connection, action);
  }, [connection]);

  const isMultisigTreasury = useCallback((treasuryId: string) => {

    if (!publicKey || !treasuryId || !multisigAccounts || !treasuryList) { return false; }

    const treasury = treasuryList.find(t => t.id === treasuryId);
    if (treasury) {
      const isNew = treasury.version >= 2 ? true : false;
      const v1 = treasury as TreasuryInfo;
      const v2 = treasury as Treasury;
      const treasurer = isNew ? v2.treasurer : v1.treasurerAddress;
      const treasurerPk = new PublicKey(treasurer);
      if (!treasurerPk.equals(publicKey) && multisigAccounts && multisigAccounts.findIndex(m => m.authority.equals(treasurerPk)) !== -1) {
        return true;
      }
    }

    return false;

  }, [
    publicKey,
    treasuryList,
    multisigAccounts,
  ]);

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
    if (selectedMultisig) {
      refreshUserBalances(selectedMultisig.authority);
    } else {
      refreshUserBalances();
    }
    refreshTokenBalance();
    getTransactionFeesV2(MSP_ACTIONS_V2.addFunds).then(value => {
      setTransactionFees(value);
      consoleOut('transactionFees:', value, 'orange');
    });
    getTransactionFeesV2(MSP_ACTIONS_V2.withdraw).then(value => {
      setWithdrawTransactionFees(value);
      consoleOut('withdrawTransactionFees:', value, 'orange');
    });
    setIsAddFundsModalVisibility(true);
  }, [
    selectedMultisig,
    refreshTokenBalance,
    refreshUserBalances,
    getTransactionFeesV2,
    resetTransactionStatus,
    getMultisigTxProposalFees,
  ]);

  const closeAddFundsModal = useCallback(() => {
    setIsAddFundsModalVisibility(false);
    resetTransactionStatus();
  }, [resetTransactionStatus]);

  const onAddFundsTransactionFinished = () => {
    closeAddFundsModal();
    refreshTokenBalance();
    resetTransactionStatus();
  };

  const onAcceptAddFunds = (params: TreasuryTopupParams) => {
    consoleOut('AddFunds params:', params, 'blue');
    onExecuteAddFundsTransaction(params);
  };

  const onExecuteAddFundsTransaction = async (params: TreasuryTopupParams) => {
    let transaction: Transaction;
    let signature: any;
    let encodedTx: string;
    let multisigAuth = '';
    const transactionLog: any[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createTxV1 = async (): Promise<boolean> => {
      if (publicKey && params && params.treasuryId) {
        consoleOut("Start transaction for treasury addFunds", '', 'blue');
        consoleOut('Wallet address:', publicKey.toBase58());

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const treasury = new PublicKey(params.treasuryId);
        const associatedToken = new PublicKey(params.associatedToken);
        const amount = parseFloat(params.amount);
        const stream = params.streamId ? new PublicKey(params.streamId) : undefined;
        const data = {
          contributor: publicKey.toBase58(),                        // contributor
          treasury: treasury.toBase58(),                            // treasury
          stream: stream?.toBase58(),                               // stream
          associatedToken: associatedToken.toBase58(),              // associatedToken
          amount: amount,                                           // amount
          allocationType: params.allocationType                     // allocationType
        }
        consoleOut('data:', data);

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

        const bf = transactionFees.blockchainFee;       // Blockchain fee
        const ff = transactionFees.mspFlatFee;          // Flat fee (protocol)
        const mp = multisigTransactionFees.networkFee + multisigTransactionFees.multisigFee + multisigTransactionFees.rentExempt;  // Multisig proposal
        const minRequired = isMultisigTreasury(params.treasuryId) ? mp : bf + ff;

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
              getAmountWithSymbol(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getAmountWithSymbol(minRequired, NATIVE_SOL_MINT.toBase58())
            })`
          });
            customLogger.logWarning('Treasury Add funds transaction failed', { transcript: transactionLog });
          return false;
        }

        consoleOut('Starting Add Funds using MSP V1...', '', 'blue');
        // Create a transaction
        return await ms.addFunds(
          publicKey,
          treasury,
          stream,
          associatedToken,
          amount,
          params.allocationType
        )
        .then((value: any) => {
          consoleOut('addFunds returned transaction:', value);
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
        .catch((error: any) => {
          console.error('addFunds error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Treasury Add funds transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Treasury Add funds transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const addFunds = async (data: AddFundsParams) => {

      if (!msp) { return null; }

      if (!isMultisigTreasury(data.treasury) || !params.fundFromSafe) {
        if (data.stream === '') {
          return await msp.addFunds(
            new PublicKey(data.payer),                    // payer
            new PublicKey(data.contributor),              // contributor
            new PublicKey(data.treasury),                 // treasury
            new PublicKey(data.associatedToken),          // associatedToken
            data.amount,                                  // amount
          );
        }

        return await msp.allocate(
          new PublicKey(data.payer),                   // payer
          new PublicKey(data.contributor),             // treasurer
          new PublicKey(data.treasury),                // treasury
          new PublicKey(data.stream),                  // stream
          data.amount,                                 // amount
        );
      }

      if (!treasuryList || !multisigClient || !multisigAccounts || !publicKey) { return null; }

      const treasury = treasuryList.find(t => t.id === data.treasury) as Treasury | undefined;
      if (!treasury) { return null; }

      const multisig = multisigAccounts.filter(m => m.authority.toBase58() === treasury.treasurer)[0];
      if (!multisig) { return null; }

      multisigAuth = multisig.authority.toBase58();

      let operationType = OperationType.StreamAddFunds;
      let addFundsTx: Transaction;

      if (data.stream) {
        addFundsTx = await msp.allocate(
          new PublicKey(data.payer),                   // payer
          new PublicKey(multisig.authority),           // treasurer
          new PublicKey(data.treasury),                // treasury
          new PublicKey(data.stream),                  // stream
          data.amount,                                 // amount
        );
      } else {
        operationType = OperationType.TreasuryAddFunds;
        addFundsTx = await msp.addFunds(
          new PublicKey(data.payer),                    // payer
          new PublicKey(data.contributor),              // contributor
          new PublicKey(data.treasury),                 // treasury
          new PublicKey(data.associatedToken),          // associatedToken
          data.amount,                                  // amount
        );
      }

      const ixData = Buffer.from(addFundsTx.instructions[0].data);
      const ixAccounts = addFundsTx.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
        publicKey,
        data.proposalTitle || "Add Funds",
        "", // description
        new Date(expirationTime * 1_000),
        operationType,
        multisig.id,
        mspV2AddressPK,
        ixAccounts,
        ixData
      );

      return tx;
    }

    const createTxV2 = async (): Promise<boolean> => {

      if (!publicKey || !params || !params.treasuryId || !params.associatedToken || !msp) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Treasury Add funds transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut("Start transaction for treasury addFunds", '', 'blue');
      consoleOut('Wallet address:', publicKey.toBase58());

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      const associatedToken = new PublicKey(params.associatedToken);
      const amount = params.tokenAmount;
      consoleOut('raw amount:', params.tokenAmount, 'blue');
      consoleOut('amount.toNumber():', amount, 'blue');
      consoleOut('amount.toString():', params.tokenAmount.toString(), 'blue');
      const contributor = params.contributor || publicKey.toBase58();
      const data: AddFundsParams = {
        proposalTitle: params.proposalTitle,                      // proposalTitle
        payer: publicKey.toBase58(),                              // payer
        contributor: contributor,                                 // contributor
        treasury: params.treasuryId,                              // treasury
        associatedToken: associatedToken.toBase58(),              // associatedToken
        stream: params.streamId ? params.streamId : '',           // stream
        amount,                                                   // amount
      }

      consoleOut('data:', data);

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

      const bf = transactionFees.blockchainFee;       // Blockchain fee
      const ff = transactionFees.mspFlatFee;          // Flat fee (protocol)
      const mp = multisigTransactionFees.networkFee + multisigTransactionFees.multisigFee + multisigTransactionFees.rentExempt;  // Multisig proposal
      const minRequired = isMultisigTreasury(params.treasuryId) ? mp : bf + ff;

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
            getAmountWithSymbol(nativeBalance, NATIVE_SOL_MINT.toBase58())
          }) to pay for network fees (${
            getAmountWithSymbol(minRequired, NATIVE_SOL_MINT.toBase58())
          })`
        });
        customLogger.logWarning('Treasury Add funds transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut('Starting Add Funds using MSP V2...', '', 'blue');
      consoleOut('onExecuteAddFundsTransaction ->','/src/views/MoneyStreamsInfo/index.tsx', 'darkcyan');
      // Create a transaction
      const result = await addFunds(data)
        .then((value: Transaction | null) => {
          if (!value) { return false; }
          consoleOut('addFunds returned transaction:', value);
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
          console.error('addFunds error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Treasury Add funds transaction failed', { transcript: transactionLog });
          return false;
        });

      return result;
    }

    const sendTx = async (): Promise<boolean> => {
      if (connection && wallet && wallet.publicKey && transaction) {
        const {
          context: { slot: minContextSlot },
          value: { blockhash, lastValidBlockHeight },
        } = await connection.getLatestBlockhashAndContext();

        transaction.feePayer = wallet.publicKey;
        transaction.recentBlockhash = blockhash;

        return wallet.sendTransaction(transaction, connection, { minContextSlot })
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
            customLogger.logError('Treasury Add funds transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Treasury Add funds transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (publicKey && params) {
      const token = await getTokenOrCustomToken(params.associatedToken);
      consoleOut('onExecuteAddFundsTransaction token:', token, 'blue');
      const treasury = treasuryList.find(t => t.id === params.treasuryId);
      if (!treasury) { return null; }
      let created: boolean;
      if ((treasury as Treasury).version && (treasury as Treasury).version >= 2) {
        created = await createTxV2();
      } else {
        created = await createTxV1();
      }
      consoleOut('created:', created, 'blue');
      if (created && !transactionCancelled) {
        const sent = await sendTx();
        consoleOut('sent:', sent);
        if (sent && !transactionCancelled) {
          consoleOut('Send Tx to confirmation queue:', signature);
          const amountDisplay = getAmountWithSymbol(
            params.amount,
            params.associatedToken,
            false,
            splTokenList,
            token.decimals
          );
          const loadingMessage = multisigAuth
            ? `Create proposal to fund streaming account with ${amountDisplay}`
            : `Fund streaming account with ${amountDisplay}`;
          const completed = multisigAuth
            ? `Streaming account funding has been submitted for approval.`
            : `Streaming account funded with ${amountDisplay}`;
          enqueueTransactionConfirmation({
            signature: signature,
            operationType: OperationType.TreasuryAddFunds,
            finality: "finalized",
            txInfoFetchStatus: "fetching",
            loadingTitle: "Confirming transaction",
            loadingMessage: loadingMessage,
            completedTitle: "Transaction confirmed",
            completedMessage: completed,
            extras: {
              treasuryId: treasury.id as string,
              multisigAuthority: multisigAuth
            }
          });
          onAddFundsTransactionFinished();
          setIsBusy(false);
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  };

  // Create Stream modal
  const [isCreateStreamModalVisible, setIsCreateStreamModalVisibility] = useState(false);
  const showCreateStreamModal = useCallback(() => {
    resetTransactionStatus();
    refreshUserBalances();
    refreshTokenBalance();
    getMultisigTxProposalFees();
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
    getMultisigTxProposalFees,
  ]);

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
  const onAcceptOpenStream = (e: any) => {
    if (streamList) {
      const findStream = streamList.filter((stream: Stream | StreamInfo) => stream.id === e);
      const streamSelected = Object.assign({}, ...findStream);

      const url = `${ACCOUNTS_ROUTE_BASE_PATH}/streaming/${isInboundStream(streamSelected) ? "incoming" : "outgoing"}/${e}?v=details`;

      navigate(url);
    }

    openStreamById(e, true);
    closeOpenStreamModal();
  };

  // Create treasury modal
  const [isCreateTreasuryModalVisible, setIsCreateTreasuryModalVisibility] = useState(false);
  const showCreateTreasuryModal = useCallback(() => {
    resetTransactionStatus();
    getMultisigTxProposalFees();
    setIsCreateTreasuryModalVisibility(true);
    getTransactionFeesV2(MSP_ACTIONS_V2.createTreasury).then(value => {
      setTransactionFees(value);
      consoleOut('transactionFees:', value, 'orange');
    });
  }, [
    getTransactionFeesV2,
    resetTransactionStatus,
    getMultisigTxProposalFees,
  ]);

  const closeCreateTreasuryModal = useCallback(() => {
    setIsCreateTreasuryModalVisibility(false);
    resetTransactionStatus();
  }, [resetTransactionStatus]);

  const onAcceptCreateTreasury = (data: TreasuryCreateOptions) => {
    consoleOut('treasury create options:', data, 'blue');
    onExecuteCreateTreasuryTx(data);
  };

  const onTreasuryCreated = useCallback((createOptions: TreasuryCreateOptions) => {
    refreshTokenBalance();
  }, [refreshTokenBalance]);

  const onExecuteCreateTreasuryTx = async (createOptions: TreasuryCreateOptions) => {
    let transaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
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
      const treasuryAssociatedTokenMint = new PublicKey(data.associatedTokenAddress);
      const createTreasuryTx = await msp.createTreasury(
        publicKey,                                        // payer
        multisig.authority,                               // treasurer
        treasuryAssociatedTokenMint,                      // associatedToken
        data.label,                                       // label
        treasuryType,                                     // type
        true,                                             // solFeePayedByTreasury = true
      );

      const ixData = Buffer.from(createTreasuryTx.instructions[0].data);
      const ixAccounts = createTreasuryTx.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      // Add a pre-instruction to create the treasurer ATA if it doesn't exist
      // const createTreasurerAtaIx = await getCreateAtaInstructionIfNotExists(
      //   connection,
      //   multisig.authority,
      //   treasuryAssociatedTokenMint,
      //   publicKey);
      // const preInstructions = createTreasurerAtaIx ? [createTreasurerAtaIx] : undefined;

      const tx = await multisigClient.createTransaction(
        publicKey,
        data.title === "" ? "Create streaming account" : data.title,
        "", // description
        new Date(expirationTime * 1_000),
        OperationType.TreasuryCreate,
        multisig.id,
        mspV2AddressPK,
        ixAccounts,
        ixData,
        // preInstructions
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
        title: createOptions.treasuryTitle,
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
      const mp = multisigTransactionFees.networkFee + multisigTransactionFees.multisigFee + multisigTransactionFees.rentExempt;  // Multisig proposal
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
            getAmountWithSymbol(nativeBalance, NATIVE_SOL_MINT.toBase58())
          }) to pay for network fees (${
            getAmountWithSymbol(minRequired, NATIVE_SOL_MINT.toBase58())
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

    const sendTx = async (): Promise<boolean> => {
      if (connection && wallet && wallet.publicKey && transaction) {
        const {
          context: { slot: minContextSlot },
          value: { blockhash, lastValidBlockHeight },
        } = await connection.getLatestBlockhashAndContext();

        transaction.feePayer = wallet.publicKey;
        transaction.recentBlockhash = blockhash;

        return wallet.sendTransaction(transaction, connection, { minContextSlot })
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
        const sent = await sendTx();
        consoleOut('sent:', sent);
        if (sent && !transactionCancelled) {
          consoleOut('Send Tx to confirmation queue:', signature);
          const multisig = createOptions.multisigId && selectedMultisig
            ? selectedMultisig.authority.toBase58()
            : "";
          enqueueTransactionConfirmation({
            signature: signature,
            operationType: OperationType.TreasuryCreate,
            finality: "finalized",
            txInfoFetchStatus: "fetching",
            loadingTitle: "Confirming transaction",
            loadingMessage: `Create streaming account: ${createOptions.treasuryName}`,
            completedTitle: "Transaction confirmed",
            completedMessage: `Successfully streaming account creation: ${createOptions.treasuryName}`,
            extras: {
              multisigAuthority: multisig
            }
          });

          setIsCreateTreasuryModalVisibility(false);
          !multisig && onTreasuryCreated(createOptions);
        } else {
          openNotification({
            title: t('notifications.error-title'),
            description: t('notifications.error-sending-transaction'),
            type: "error"
          });
        }
        resetTransactionStatus();
        setIsBusy(false);
      } else { setIsBusy(false); }
    }
  };

  const isInboundStream = useCallback((item: Stream | StreamInfo): boolean => {
    if (item && publicKey && selectedAccount.address) {
      const v1 = item as StreamInfo;
      const v2 = item as Stream;
      let beneficiary = '';
      if (v1.version < 2) {
        beneficiary = v1.beneficiaryAddress
          ? typeof v1.beneficiaryAddress === "string"
            ? (v1.beneficiaryAddress as string)
            : (v1.beneficiaryAddress as PublicKey).toBase58()
          : '';
      } else {
        beneficiary = v2.beneficiary
          ? typeof v2.beneficiary === "string"
            ? (v2.beneficiary as string)
            : (v2.beneficiary as PublicKey).toBase58()
          : '';
      }
      return beneficiary === selectedAccount.address ? true : false
    }
    return false;
  }, [selectedAccount.address, publicKey]);

  const getRateAmountDisplay = useCallback((item: Stream | StreamInfo): string => {
    let associatedToken = '';

    if (item.version < 2) {
      associatedToken = (item as StreamInfo).associatedToken as string;
    } else {
      associatedToken = (item as Stream).associatedToken.toBase58();
    }

    const token = getTokenByMintAddress(associatedToken);
    const decimals = token?.decimals || 9;
    const rateAmount = getRateAmountBn(item, decimals);

    const rate = displayAmountWithSymbol(
      rateAmount,
      associatedToken,
      decimals,
      splTokenList,
      true,
      true
    );

    return rate;
  }, [getRateAmountBn, getTokenByMintAddress, splTokenList]);

  const getDepositAmountDisplay = useCallback((item: Stream | StreamInfo): string => {
    let value = '';
    let associatedToken = '';

    if (item.version < 2) {
      associatedToken = (item as StreamInfo).associatedToken as string;
    } else {
      associatedToken = (item as Stream).associatedToken.toBase58();
    }

    if (item && item.rateIntervalInSeconds === 0 && item.allocationAssigned > 0) {
      const token = getTokenByMintAddress(associatedToken);
      const decimals = token?.decimals || 9;

      if (item.version < 2) {
        const allocationAssigned = new BN(item.allocationAssigned).toNumber();
        value += getAmountWithSymbol(
          allocationAssigned,
          associatedToken,
          true,
          splTokenList,
          decimals,
          true
        );
      } else {
        const allocationAssigned = new BN(item.allocationAssigned);
        value += displayAmountWithSymbol(
          allocationAssigned,
          associatedToken,
          decimals,
          splTokenList,
          true,
          false
        )
      }
      value += ' ';
      value += token ? token.symbol : `[${shortenAddress(associatedToken)}]`;
    }

    return value;
  }, [getTokenByMintAddress, splTokenList]);

  const getStreamSubtitle = useCallback((item: Stream | StreamInfo) => {
    let subtitle = '';

    if (item) {
      const rate = +item.rateAmount.toString();
      let rateAmount = rate > 0
        ? getRateAmountDisplay(item)
        : getDepositAmountDisplay(item);

      if (rate > 0) {
        rateAmount += ' ' + getIntervalFromSeconds(item.rateIntervalInSeconds, true, t);
      }

      subtitle = rateAmount;
    }

    return subtitle;
  }, [getDepositAmountDisplay, getRateAmountDisplay, t]);

  const isStreamRunning = useCallback((stream: Stream | StreamInfo) => {
    const v1 = stream as StreamInfo;
    const v2 = stream as Stream;
    if (stream.version < 2) {
      return v1.state === STREAM_STATE.Running ? true : false;
    } else {
      return v2.status === STREAM_STATUS.Running ? true : false;
    }
  }, []);

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
          case STREAM_STATUS.Scheduled:
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

  const getTimeRemaining = useCallback((time: string) => {
    if (time) {
      const countDownDate = new Date(time).getTime();
      const now = new Date().getTime();
      const timeleft = countDownDate - now;
  
      const seconds = Math.floor((timeleft % (1000 * 60)) / 1000);
      const minutes = Math.floor((timeleft % (1000 * 60 * 60)) / (1000 * 60));
      const hours = Math.floor((timeleft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const days = Math.floor(timeleft / (1000 * 60 * 60 * 24));
      const weeks = Math.floor(days/7);
      const months = Math.floor(days/30);
      const years = Math.floor(days/365);
  
      if (years === 0 && months === 0 && weeks === 0 && days === 0 && hours === 0 && minutes === 0 && seconds === 0) {
        return `out of funds`;
      } else if (years === 0 && months === 0 && weeks === 0 && days === 0 && hours === 0 && minutes === 0 && seconds <= 60) {
        return <span className="fg-warning">less than a minute left</span>;
      } else if (years === 0 && months === 0 && weeks === 0 && days === 0 && hours === 0 && minutes <= 60) {
        return <span className="fg-warning">{`only ${minutes} ${minutes > 1 ? "minutes" : "minute"} left`}</span>;
      } else if (years === 0 && months === 0 && weeks === 0 && days === 0 && hours <= 24) {
        return <span className="fg-warning">{`only ${hours} ${hours > 1 ? "hours" : "hour"} left`}</span>;
      } else if (years === 0 && months === 0 && weeks === 0 && days > 1 && days <= 7) {
        return `${days} ${days > 1 ? "days" : "day"} left`;
      } else if (years === 0 && months === 0 && days > 7 && days <= 30) {
        return `${weeks} ${weeks > 1 ? "weeks" : "week"} left`;
      } else if (years === 0 && days > 30 && days <= 365) {
        return `${months} ${months > 1 ? "months" : "month"} left`;
      } else if (days > 365) {
        return `${years} ${years > 1 ? "years" : "year"} left`;
      } else {
        return ""
      }
    }
  }, []);

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
          case STREAM_STATUS.Scheduled:
            return `starts on ${getShortDate(v2.startUtc)}`;
          case STREAM_STATUS.Paused:
            if (v2.isManuallyPaused) {
              return `paused on ${getShortDate(v2.startUtc)}`;
            }
            return `out of funds on ${getShortDate(v2.startUtc)}`;
          default:
            return getTimeRemaining(v2.estimatedDepletionDate);
        }
      }
    }
  }, [getTimeRemaining, t]);

  const goToIncomingTabHandler = () => {
    const url = `${ACCOUNTS_ROUTE_BASE_PATH}/streaming/incoming`;
    navigate(url);
  }

  const goToOutgoingTabHandler = () => {
    const url = `${ACCOUNTS_ROUTE_BASE_PATH}/streaming/outgoing`;
    navigate(url);
  }

  const onTabChange = useCallback((activeKey: string) => {
    consoleOut('Selected tab option:', activeKey, 'blue');

    const url = `${ACCOUNTS_ROUTE_BASE_PATH}/streaming/${activeKey}`;
    navigate(url);
  }, [navigate]);


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
    if (account?.lamports !== previousBalance || !nativeBalance) {
      // Refresh token balance
      refreshTokenBalance();
      setNativeBalance(getAmountFromLamports(account?.lamports));
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [
    account,
    nativeBalance,
    previousBalance,
    refreshTokenBalance
  ]);

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

  // Set the list of incoming and outgoing streams
  useEffect(() => {
    if (!publicKey || !streamList) {
      setIncomingStreamList(undefined);
      setOutgoingStreamList(undefined);

      return;
    }

    // Sort the list of incoming streams by withdrawal amount
    const onlyIncomings = streamList.filter((stream: Stream | StreamInfo) => isInboundStream(stream));
    const sortedIncomingStreamsList = onlyIncomings.sort((a, b) => {
      const vA1 = a as StreamInfo;
      const vA2 = a as Stream;
      const vB1 = b as StreamInfo;
      const vB2 = b as Stream;

      const isNew = ((vA2.version && vA2.version >= 2) && (vB2.version && vB2.version >= 2))
        ? true
        : false;

      const associatedTokenA = isNew
        ? vA2.associatedToken.toBase58()
        : vA1.associatedToken as string;

      const associatedTokenB = isNew
        ? vB2.associatedToken.toBase58()
        : vB1.associatedToken as string;

      const tokenA = getTokenByMintAddress(associatedTokenA as string);
      const tokenB = getTokenByMintAddress(associatedTokenB as string);

      let tokenPriceA;
      let tokenPriceB;

      if (tokenA) {
        tokenPriceA = getTokenPriceByAddress(tokenA.address) || getTokenPriceBySymbol(tokenA.symbol);
      } else {
        tokenPriceA = 0;
      }

      if (tokenB) {
        tokenPriceB = getTokenPriceByAddress(tokenB.address) || getTokenPriceBySymbol(tokenB.symbol);
      } else {
        tokenPriceB = 0;
      }

      const priceB = isNew ? vB2.withdrawableAmount.muln(tokenPriceB) : new BN(vB1.escrowVestedAmount * tokenPriceB);
      const priceA = isNew ? vA2.withdrawableAmount.muln(tokenPriceB) : new BN(vA1.escrowVestedAmount * tokenPriceB);

      if (tokenPriceA && tokenPriceB) {
        if (priceB.gt(priceA)) {
          return 1;
        } else {
          return -1;
        }
      } else {
        return 0;
      }
    });

    consoleOut('incoming streams:', sortedIncomingStreamsList, 'crimson');
    setIncomingStreamList(sortedIncomingStreamsList);

    // Sort the list of outgoinng streams by estimated depletion date
    const onlyOuts = streamList.filter(item => !isInboundStream(item) && (item as any).category === 0);
    const sortedOutgoingStreamsList = onlyOuts.sort((a, b) => {
      const vA1 = a as StreamInfo;
      const vA2 = a as Stream;
      const vB1 = b as StreamInfo;
      const vB2 = b as Stream;

      const isNew = ((vA2.version && vA2.version >= 2) && (vB2.version && vB2.version >= 2))
      ? true
      : false;

      const timeA = isNew 
        ? new Date(vA2.estimatedDepletionDate).getTime()
        : new Date(vA1.escrowEstimatedDepletionUtc as string).getTime();

      const timeB = isNew 
        ? new Date(vB2.estimatedDepletionDate).getTime()
        : new Date(vB1.escrowEstimatedDepletionUtc as string).getTime();

      if (timeA && timeB) {
        if (timeA > timeB) {
          return 1;
        } else {
          return -1;
        }
      } else {
        return 0;
      }
    });

    consoleOut('outgoing streams:', sortedOutgoingStreamsList, 'crimson');
    setOutgoingStreamList(sortedOutgoingStreamsList);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    publicKey,
    streamList,
    isInboundStream,
  ]);

  // Incoming amount
  useEffect(() => {
    if (!incomingStreamList) { return; }

    setIncomingAmount(incomingStreamList.length);
  }, [
    incomingStreamList
  ]);

  // Outgoing amount
  useEffect(() => {
    // if (!outgoingStreamList || !streamingAccountCombinedList) { return; }

    if (!outgoingStreamList) { return; }

    setOutgoingAmount(outgoingStreamList.length);
  }, [outgoingStreamList]);

  // Streaming accounts amount
  useEffect(() => {
    if (!treasuryList) { return; }

    setStreamingAccountsAmount(treasuryList.length);
  }, [treasuryList]);

  // Live data calculation
  useEffect(() => {
    if (!publicKey || !treasuryList) { return; }

    if (!streamingAccountsSummary) {
      refreshTreasuriesSummary()
      .then(value => {
        if (value) {
          setStreamingAccountsSummary(value);
        }
        setCanDisplayTotalAccountBalance(true);
      });
    }

    const timeout = setTimeout(() => {
      refreshTreasuriesSummary()
      .then(value => {
        consoleOut('streamingAccountsSummary:', value, 'orange');
        if (value) {
          setStreamingAccountsSummary(value);
        }
        setCanDisplayTotalAccountBalance(true);
      });
    }, 1000);

    return () => {
      clearTimeout(timeout);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey, treasuryList]);

  // Set refresh timeout for incomingStreamsSummary but get first time data
  useEffect(() => {
    if (!publicKey || !streamList || (!streamListv1 && !streamListv2)) { return; }

    if (!incomingStreamsSummary) {
      refreshIncomingStreamSummary()
      .then(value => {
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
    }
  }, [incomingStreamsSummary, publicKey, refreshIncomingStreamSummary, streamList, streamListv1, streamListv2]);

  // Set refresh timeout for outgoingStreamsSummary but get first time data
  useEffect(() => {
    if (!publicKey || !streamList || (!streamListv1 && !streamListv2) || !streamingAccountsSummary) { return; }

    if (!outgoingStreamsSummary) {
      refreshOutgoingStreamSummary()
      .then(value => {
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
    }
  }, [outgoingStreamsSummary, publicKey, refreshOutgoingStreamSummary, streamList, streamListv1, streamListv2, streamingAccountsSummary]);

  // Update incoming balance
  useEffect(() => {
    if (!streamList || loadingStreams || !incomingStreamsSummary) { return; }

    const withdrawalTotalAmount = new BigNumber(incomingStreamsSummary.totalNet.toFixed(2)).toNumber();

    setWithdrawalBalance(withdrawalTotalAmount);
  }, [incomingStreamsSummary, loadingStreams, streamList]);

  // Update outgoing balance
  useEffect(() => {
    if (!streamingAccountsSummary || !outgoingStreamsSummary) { return; }

    const unallocatedTotalAmount = outgoingStreamsSummary.totalNet + streamingAccountsSummary.totalNet;
    const convertToBN = new BigNumber(unallocatedTotalAmount.toFixed(2));

    setUnallocatedBalance(convertToBN.toNumber());
  }, [ streamingAccountsSummary, outgoingStreamsSummary]);

  // Update total account balance
  useEffect(() => {
      setTotalAccountBalance(withdrawalBalance + unallocatedBalance);
  }, [unallocatedBalance, withdrawalBalance]);

  // Calculate the rate per day for incoming streams
  useEffect(() => {
    if (incomingStreamList && !loadingStreams) {
      const runningIncomingStreams = incomingStreamList.filter((stream: Stream | StreamInfo) => isStreamRunning(stream));

      let totalRateAmountValuePerDay = 0;
      let totalRateAmountValuePerSecond = 0;

      for (const stream of runningIncomingStreams) {
        const v1 = stream as StreamInfo;
        const v2 = stream as Stream;
        const isNew = v2.version && v2.version >= 2 ? true : false;

        const token = getTokenByMintAddress((stream.associatedToken as PublicKey).toString());

        if (token) {
          const tokenPrice = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);
          const rateAmountValue = isNew ? new BigNumber(toUiAmount(new BN(v2.rateAmount), token.decimals)).toNumber() : v1.rateAmount;
          const valueOfDay = rateAmountValue * tokenPrice / stream.rateIntervalInSeconds * 86400;
          totalRateAmountValuePerDay += valueOfDay

          const valueOfSeconds = rateAmountValue * tokenPrice / stream.rateIntervalInSeconds;
          totalRateAmountValuePerSecond += valueOfSeconds
        }
      }

      setHasIncomingStreamsRunning(runningIncomingStreams.length);
      setRateIncomingPerDay(totalRateAmountValuePerDay);
      setRateIncomingPerSecond(totalRateAmountValuePerSecond);
    }
  }, [
    loadingStreams,
    incomingStreamList,
    getDepositAmountDisplay,
    getTokenPriceByAddress,
    getTokenByMintAddress,
    getTokenPriceBySymbol,
    getRateAmountDisplay,
    isStreamRunning,
    t,
  ]);

  // Calculate the rate per day for outgoing streams
  useEffect(() => {
    if (outgoingStreamList && !loadingStreams) {
      const runningOutgoingStreams = outgoingStreamList.filter((stream: Stream | StreamInfo) => isStreamRunning(stream));

      let totalRateAmountValue = 0;
      let totalRateAmountValuePerSecond = 0;

      for (const stream of runningOutgoingStreams) {
        const v1 = stream as StreamInfo;
        const v2 = stream as Stream;
        const isNew = v2.version && v2.version >= 2 ? true : false;

        let associatedToken = '';

        if (isNew) {
          associatedToken = v2.associatedToken.toBase58();
        } else {
          associatedToken = v1.associatedToken as string;
        }
        const token = getTokenByMintAddress(associatedToken);

        if (token) {
          const tokenPrice = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);
          if (!tokenPrice) {
            continue;
          }
          BigNumber.config({
            CRYPTO: true,
            DECIMAL_PLACES: 16
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
    getTokenPriceBySymbol,
    isStreamRunning,
    getRateAmountBn,
    t,
  ]);

  // Protocol
  const listOfBadges = ["MSP", "DEFI", "Payment Streams"];

  const renderProtocol = (
    <>
      {selectedAccount.address && (
        !isXsDevice ? (
          <CopyExtLinkGroup
            content={selectedAccount.address}
            number={8}
            externalLink={true}
            isTx={false}
            classNameContainer="mb-1"
          />
        ) : (
          <CopyExtLinkGroup
            content={selectedAccount.address}
            number={4}
            externalLink={true}
            isTx={false}
            classNameContainer="mb-1"
          />
        )
      )}
      <div className="badge-container">
        {listOfBadges.map((badge, index) => (
          <span key={`${badge}+${index}`} className="badge darken small text-uppercase mr-1">{badge}</span>
        ))}
      </div>
    </>
  );

  // Balance
  const renderBalance = (
    <>
      {loadingStreams || loadingTreasuries || !canDisplayTotalAccountBalance ? (
        <IconLoading className="mean-svg-icons" style={{ height: "12px", lineHeight: "12px" }} />
      ) : (
        <>
          {(totalAccountBalance && totalAccountBalance > 0) ? (
            <span>{toUsCurrency(totalAccountBalance)}</span>
          ) : (
            <span>$0.0</span>
          )}
          {(totalAccountBalance && totalAccountBalance > 0) && (
            (withdrawalBalance > unallocatedBalance) ? (
              <ArrowDownOutlined className="mean-svg-icons incoming bounce ml-1" />
            ) : (
              <ArrowUpOutlined className="mean-svg-icons outgoing bounce ml-1" />
            )
          )}
        </>
      )}
    </>
  )

  const renderBalanceContracts = (
    <a href="https://docs.meanfi.com/products/developers/smart-contracts" target="_blank" rel="noopener noreferrer" className="simplelink underline-on-hover">Tracking 2 smart contracts</a>
  );

  const infoData = [
    {
      name: "Protocol",
      value: t('account-area.money-streams'),
      content: renderProtocol
    },
    {
      name: "Balance (My TVL)",
      value: renderBalance,
      content: renderBalanceContracts
    }
  ];

  const [withdrawalScale, setWithdrawalScale] = useState<number>(0);
  const [unallocatedScale, setUnallocatedScale] = useState<number>(0);

  useEffect(() => {
    if (!totalAccountBalance || !withdrawalBalance) { return; }

    const getlength = (number: any) => {
      return Math.round(number).toString().length;
    }
    
    const divider = getlength(totalAccountBalance);
    const incomingDivider = parseFloat(`1${"0".repeat((divider && divider >= 2) ? divider - 2 : 1)}`);
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
    if (!totalAccountBalance || !unallocatedBalance) { return; }

    const getlength = (number: any) => {
      return Math.round(number).toString().length;
    }
    
    const divider = getlength(totalAccountBalance);

    const outgoingDivider = parseFloat(`1${"0".repeat((divider && divider >= 2) ? divider - 2 : 1)}`);
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

  const setHeightGreenWave = (newHeight: string) => {
    document.documentElement.style.setProperty('--heigth-green-wave', newHeight);
  }

  const setHeightRedWave = (newHeight: string) => {
    document.documentElement.style.setProperty('--heigth-red-wave', newHeight);
  }

  useEffect(() => {
    getComputedStyle(document.documentElement).getPropertyValue('--heigth-green-wave');

    getComputedStyle(document.documentElement).getPropertyValue('--heigth-red-wave');

    setHeightGreenWave(`${withdrawalScale}vh`);
    setHeightRedWave(`${unallocatedScale}vh`);

  }, [unallocatedScale, withdrawalScale]);

  const [isPaused, setIsPaused] = useState(true);

  useEffect(() => {
    if (!selectedAccount.address) { return; }

    const timeout = setTimeout(() => {
      setIsPaused(false);
    }, 5000);

    return () => {
      clearTimeout(timeout);
    }
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

  const renderSummary = (
    <>
      <Row gutter={[8, 8]} className="ml-0 mr-0">
        <Col xs={11} sm={11} md={11} lg={11} className="background-card simplelink bg-secondary-02 hover-list" onClick={goToIncomingTabHandler}>
          {/* Background animation */}
          {(hasIncomingStreamsRunning && hasIncomingStreamsRunning > 0) ? (
            (!loadingTreasuries && !loadingStreams) && (
              <div className="stream-background stream-background-incoming">
                <img
                  className="inbound"
                  src="/assets/incoming-crypto.svg"
                  alt=""
                />
              </div>
            )) : null
          }
          <div className="incoming-stream-amount">
            <div className="incoming-stream-running mb-1">
              <div className="d-flex align-items-center text-center">
                <h4>
                  {loadingTreasuries || loadingStreams ? (
                    <IconLoading className="mean-svg-icons" style={{ height: "12px", lineHeight: "12px" }} />
                  ) : (
                    formatThousands(incomingAmount as number)
                  )}
                  <span className="ml-1">Incoming streams</span>
                </h4>
                <span className="info-icon">
                  {(hasIncomingStreamsRunning && hasIncomingStreamsRunning > 0) ? (
                    <ArrowDownOutlined className="mean-svg-icons incoming bounce ml-1" />
                  ) : (
                    <ArrowDownOutlined className="mean-svg-icons incoming ml-1" />
                  )}
                </span>
              </div>
            </div>
            <div className="incoming-stream-rates">
              {loadingTreasuries || loadingStreams ? (
                <IconLoading className="mean-svg-icons" style={{ height: "12px", lineHeight: "12px" }} />
              ) : (
                <span className="incoming-amount">{rateIncomingPerSecond ? (
                    (rateIncomingPerSecond > 0 && rateIncomingPerSecond < 0.01) ? `< $0.01/second` : `+ $${cutNumber(rateIncomingPerSecond, 4)}/second`
                  ) : "$0.00/second"}
                </span>
              )}
              {loadingTreasuries || loadingStreams ? (
                <IconLoading className="mean-svg-icons" style={{ height: "12px", lineHeight: "12px" }} />
              ) : (
                <span className="incoming-amount">{rateIncomingPerDay ? (
                    (rateIncomingPerDay > 0 && rateIncomingPerDay < 0.01) ? `< $0.01/day` : `+ $${cutNumber(rateIncomingPerDay, 4)}/day`
                  ) : "$0.00/day"}
                </span>
              )}
            </div>
          </div>
          <div className="stream-balance">
            <div className="info-label">
              Available to withdraw:
            </div>
            <div className="info-value">
              {loadingStreams || !canDisplayIncomingBalance ? (
                <IconLoading className="mean-svg-icons" style={{ height: "12px", lineHeight: "12px" }} />
              ) : withdrawalBalance
                ? toUsCurrency(withdrawalBalance)
                : "$0.00"
              }
            </div>
          </div>
          {(!loadingTreasuries && !loadingStreams) && (
            <div className="wave-container wave-green" id="wave">
              <Wave fill="url(#gradient1)"
                paused={isPaused}
                className="svg-container"
                style={{ height: `${withdrawalScale}vh`, position: "absolute", bottom: 0 }}
                options={{
                  amplitude: 6,
                  speed: 0.25,
                  points: 6
                }}>
                <defs>
                  <linearGradient id="gradient1" gradientTransform="rotate(180)">
                    <stop offset="10%"  stopColor="#006820" />
                    <stop offset="100%" stopColor="#181a2a" />
                  </linearGradient>
                </defs>
              </Wave>
            </div>
          )}
        </Col>
        <Col xs={11} sm={11} md={11} lg={11} className="background-card simplelink bg-secondary-02 hover-list" onClick={goToOutgoingTabHandler}>
          {/* Background animation */}
          {(hasOutgoingStreamsRunning && hasOutgoingStreamsRunning > 0) ? (
            (!loadingTreasuries && !loadingStreams) && (
              <div className="stream-background stream-background-outgoing">
                <img
                  className="inbound"
                  src="/assets/outgoing-crypto.svg"
                  alt=""
                />
              </div>
            )
          ) : null}
          <div className="outgoing-stream-amount">
            <div className="outgoing-stream-running mb-1">
              <div className="d-flex align-items-center text-center">
                <h4>
                  {loadingTreasuries || loadingStreams ? (
                    <IconLoading className="mean-svg-icons" style={{ height: "12px", lineHeight: "12px" }} />
                  ) : formatThousands(outgoingAmount as number)}
                  <span className="ml-1">Outgoing streams</span>
                </h4>
                <span className="info-icon">
                  {(hasOutgoingStreamsRunning && hasOutgoingStreamsRunning > 0) ? (
                    <ArrowUpOutlined className="mean-svg-icons outgoing bounce ml-1" />
                  ) : (
                    <ArrowUpOutlined className="mean-svg-icons outgoing ml-1" />
                  )}
                </span>
              </div>
            </div>
            <div className="outgoing-stream-rates">
              {loadingTreasuries || loadingStreams ? (
                  <IconLoading className="mean-svg-icons" style={{ height: "12px", lineHeight: "12px" }} />
                ) : (
                  <span className="outgoing-amount">{rateOutgoingPerSecond ? (
                      (rateOutgoingPerSecond > 0 && rateOutgoingPerSecond < 0.01) ? `< $0.01/second` : `- $${cutNumber(rateOutgoingPerSecond, 4)}/second`
                    ) : "$0.00/second"}
                  </span>
                )}
                {loadingTreasuries || loadingStreams ? (
                  <IconLoading className="mean-svg-icons" style={{ height: "12px", lineHeight: "12px" }} />
                ) : (
                  <span className="outgoing-amount">{rateOutgoingPerDay ? (
                      (rateOutgoingPerDay > 0 && rateOutgoingPerDay < 0.01) ? `< $0.01/day` : `- $${cutNumber(rateOutgoingPerDay, 4)}/day`
                    ) : "$0.00/day"}
                  </span>
                )}
            </div>
          </div>
          <div className="stream-balance">
            <div className="info-label">
              Remaining balance:
            </div>
            <div className="info-value">
              {loadingStreams || loadingTreasuries || !canDisplayOutgoingBalance ? (
                <IconLoading className="mean-svg-icons" style={{ height: "12px", lineHeight: "12px" }} />
              ) : unallocatedBalance
                ? toUsCurrency(unallocatedBalance)
                : "$0.00"
              }
            </div>
          </div>
          {(!loadingTreasuries && !loadingStreams) && (
            <div className="wave-container wave-red" id="wave">
              <Wave fill="url(#gradient2)"
                paused={isPaused}
                className="svg-container"
                style={{ height: `${unallocatedScale}vh`, position: "absolute", bottom: 0 }}
                options={{
                  amplitude: 6,
                  speed: 0.25,
                  points: 6
                }}>
                <defs>
                  <linearGradient id="gradient2" gradientTransform="rotate(180)">
                    <stop offset="10%"  stopColor="#b7001c" />
                    <stop offset="100%" stopColor="#181a2a" />
                  </linearGradient>
                </defs>
              </Wave>
            </div>
          )}
        </Col>
      </Row>
    </>
  );

  // Incoming streams list
  const renderListOfIncomingStreams = (
    <>
      {!loadingStreams ? (
        (incomingStreamList !== undefined && incomingStreamList.length > 0) ? (
          incomingStreamList.map((stream, index) => {
            const onSelectStream = () => {
              // Sends outgoing stream value to the parent component "Accounts"
              onSendFromIncomingStreamInfo(stream);
            };

            const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
              event.currentTarget.src = FALLBACK_COIN_IMAGE;
              event.currentTarget.className = "error";
            };

            const v1 = stream as StreamInfo;
            const v2 = stream as Stream;
            const isNew = stream.version >= 2 ? true : false;

            const associatedToken = isNew ? (stream.associatedToken as PublicKey).toBase58() : stream.associatedToken as string;

            const token = associatedToken ? getTokenByMintAddress(associatedToken) : undefined;

            let img;

            if (associatedToken) {
              if (token && token.logoURI) {
                img = <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} onError={imageOnErrorHandler} className="token-img" />
              } else {
                img = <Identicon address={associatedToken} style={{ width: "30", display: "inline-flex" }} className="token-img" />
              }
            } else {
              img = <Identicon address={isNew ? v2.id.toBase58() : v1.id?.toString()} style={{ width: "30", display: "inline-flex" }} className="token-img" />
            }

            const title = stream ? getStreamTitle(stream, t) : "Unknown incoming stream";
            const subtitle = getStreamSubtitle(stream) || "0.00";
            const status = getStreamStatus(stream);
            const resume = getStreamResume(stream);

            const withdrawResume = isNew
              ? displayAmountWithSymbol(
                  v2.withdrawableAmount,
                  v2.associatedToken.toString(),
                  token?.decimals || 9,
                  splTokenList,
                )
              : getAmountWithSymbol(
                  v1.escrowVestedAmount,
                  v1.associatedToken as string,
                  false,
                  splTokenList,
                  token?.decimals || 9,
                );

            return (
              <div 
                key={`incoming-stream-${index}`}
                onClick={onSelectStream}
                className={`w-100 simplelink hover-list ${(index + 1) % 2 === 0 ? '' : 'bg-secondary-02'}`}>
                <ResumeItem
                  id={index}
                  img={img}
                  title={title}
                  subtitle={subtitle}
                  resume={((isNew && v2.withdrawableAmount.gtn(0)) || (!isNew && v1.escrowVestedAmount > 0)) ? `${withdrawResume} available` : resume}
                  status={status}
                  hasRightIcon={true}
                  rightIcon={<IconArrowForward className="mean-svg-icons" />}
                  isLink={true}
                  isStream={true}
                  classNameRightContent="resume-stream-row"
                  classNameIcon="icon-stream-row"
                />
              </div>
            )
          })
        ) : (
          <span className="pl-1">You don't have any incoming streams</span>
        )
      ) : (
        <span className="pl-1">Loading incoming streams ...</span>
      )}
    </>
  );

  // Outgoing streams list
  const renderListOfOutgoingStreams = (
    <>
      {!loadingStreams ? (
        outgoingStreamList !== undefined && outgoingStreamList.length > 0 ? (
          <>
            {outgoingStreamList && outgoingStreamList.map((stream, index) => {
              const onSelectStream = () => {
                // Sends outgoing stream value to the parent component "Accounts"
                onSendFromOutgoingStreamInfo(stream);
              };

              const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
                event.currentTarget.src = FALLBACK_COIN_IMAGE;
                event.currentTarget.className = "error";
              };

              const v1 = stream as StreamInfo;
              const v2 = stream as Stream;
              const isNew = stream.version >= 2 ? true : false;
  
              const associatedToken = isNew ? (stream.associatedToken as PublicKey).toBase58() : stream.associatedToken as string;
              const token = associatedToken ? getTokenByMintAddress(associatedToken) : undefined;

              let img;

              if (associatedToken) {
                if (token && token.logoURI) {
                  img = <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} onError={imageOnErrorHandler} className="token-img" />
                } else {
                  img = <Identicon address={associatedToken} style={{ width: "30", display: "inline-flex" }} className="token-img" />
                }
              } else {
                img = <Identicon address={isNew ? v2.id.toBase58() : v1.id?.toString()} style={{ width: "30", display: "inline-flex" }} className="token-img" />
              }
  
              const title = stream ? getStreamTitle(stream, t) : "Unknown outgoing stream";
              const subtitle = getStreamSubtitle(stream) || "0.00";
              const status = getStreamStatus(stream);
              const resume = getStreamResume(stream);

              return (
                <div
                  key={`outgoing-stream-${index}}`}
                  onClick={onSelectStream}
                  className={`w-100 simplelink hover-list ${(index + 1) % 2 === 0 ? '' : 'bg-secondary-02'}`}
                >
                  <ResumeItem
                    id={index}
                    img={img}
                    title={title}
                    subtitle={subtitle}
                    resume={resume}
                    status={status}
                    hasRightIcon={true}
                    rightIcon={<IconArrowForward className="mean-svg-icons" />}
                    isLink={true}
                    isStream={true}
                    classNameRightContent="resume-stream-row"
                    classNameIcon="icon-stream-row"
                  />
                </div>
              )
            })}
          </>
        ) : (
          <span className="pl-1">You don't have any outgoing streams</span>
        )
      ) : (
        <span className="pl-1">Loading outgoing streams ...</span>
      )}
    </>
  );

  // Streaming accounts list
  const renderListOfStreamingAccounts = (
    <>
      {(!loadingStreams && !loadingTreasuries) ? (
        (treasuryList !== undefined && treasuryList.length > 0) ? (
          <>
            {(treasuryList && treasuryList.map((streamingAccount, index) => {
                const v1 = streamingAccount as unknown as TreasuryInfo;
                const v2 = streamingAccount as Treasury;
                const isNewTreasury = streamingAccount && streamingAccount.version >= 2 ? true : false;

                const onSelectedStreamingAccount = () => {
                  // Sends outgoing stream value to the parent component "Accounts"
                  onSendFromStreamingAccountInfo(streamingAccount);
                }

                const type = isNewTreasury
                  ? v2.treasuryType === TreasuryType.Open ? 'Open' : 'Locked'
                  : v1.type === TreasuryType.Open ? 'Open' : 'Locked';

                const badges = [type];

                const title = isNewTreasury ? v2.name : (v1.label ? v1.label : shortenAddress(v1.id as string, 8));
                const subtitle = shortenAddress(streamingAccount.id as string, 8);
                const amount = isNewTreasury ? v2.totalStreams : v1.streamsAmount;
                const resume = amount > 1 ? "streams" : "stream";

                return (
                  <div
                    key={`streaming-account-${index}`}
                    onClick={onSelectedStreamingAccount}
                    className={`w-100 simplelink hover-list ${(index + 1) % 2 === 0 ? '' : 'bg-secondary-02'}`}
                  >
                    <ResumeItem
                      title={title}
                      extraTitle={badges}
                      classNameTitle="text-uppercase"
                      subtitle={subtitle}
                      amount={amount}
                      resume={resume}
                      className="simplelink"
                      hasRightIcon={true}
                      rightIcon={<IconArrowForward className="mean-svg-icons" />}
                      isLink={true}
                      onClick={onSelectedStreamingAccount}
                      classNameRightContent="resume-streaming-row"
                      classNameIcon="icon-streaming-row"
                    />
                  </div>
                )
              })
            )}
          </>
        ) : (
          <span className="pl-1">You don't have any streaming accounts</span>
        )
      ) : (
        <span className="pl-1">Loading streaming accounts ...</span>
      )}
    </>
  );

  // Tabs
  const tabs = [
    {
      key: "summary",
      label: "Summary",
      children: renderSummary
    },
    {
      key: "streaming-accounts",
      label: `Accounts ${(!loadingTreasuries && !loadingStreams) 
        ? `(${streamingAccountsAmount && streamingAccountsAmount >= 0 && streamingAccountsAmount})` 
        : ""}`,
      children: renderListOfStreamingAccounts
    },
    {
      key: "incoming",
      label: `Incoming ${(!loadingTreasuries && !loadingStreams) 
        ? `(${incomingAmount && incomingAmount >= 0 && incomingAmount})` 
        : ""}`,
      children: renderListOfIncomingStreams
    },
    {
      key: "outgoing",
      label: `Outgoing ${!loadingStreams
        ? `(${outgoingAmount && outgoingAmount >= 0 && outgoingAmount})` 
        : ""}`,
      children: renderListOfOutgoingStreams
    },
  ];

  const renderTabset = () => {
    return (
      <Tabs
        items={tabs}
        activeKey={selectedTab}
        onChange={onTabChange}
        className="neutral"
      />
    );
  }

  const renderDropdownMenu = useCallback(() => {
    const items: ItemType[] = [];
    if (isMultisigContext) {
      items.push({
        key: '01-create-stream',
        label: (
          <div onClick={showCreateStreamModal}>
            <span className="menu-item-text">Create stream</span>
          </div>
        )
      });
    } else {
      items.push({
        key: '02-find-stream',
        label: (
          <div onClick={showOpenStreamModal}>
            <span className="menu-item-text">Find stream</span>
          </div>
        )
      });
    }

    return <Menu items={items} />;
  }, [isMultisigContext, showCreateStreamModal, showOpenStreamModal]);

  return (
    <>
      <Spin spinning={loadingStreams || loadingTreasuries}>

        <RightInfoDetails infoData={infoData} />

        <div className="flex-fixed-right cta-row mb-2 pl-1">
          <Space className="left" size="middle" wrap>
            <Button
              type="default"
              shape="round"
              size="small"
              className="thin-stroke btn-min-width"
              onClick={showCreateTreasuryModal}>
              Create account
            </Button>
            {!isMultisigContext && (
              <Button
                type="default"
                shape="round"
                size="small"
                className="thin-stroke btn-min-width"
                onClick={showCreateMoneyStreamModal}>
                Create stream
              </Button>
            )}
            {isMultisigContext && (
              <Button
                type="default"
                shape="round"
                size="small"
                className="thin-stroke btn-min-width"
                onClick={showAddFundsModal}>
                  Fund account
              </Button>
            )}
            {!isXsDevice && (
              isMultisigContext && (
                <Button
                  type="default"
                  shape="round"
                  size="small"
                  className="thin-stroke btn-min-width"
                  onClick={showCreateStreamModal}>
                  Create stream
                </Button>
              )
            )}
            {!isXsDevice && !isMultisigContext && (
              <Button
                type="default"
                shape="round"
                size="small"
                className="thin-stroke btn-min-width"
                onClick={showOpenStreamModal}>
                  Find stream
              </Button>
            )}
          </Space>
          {isXsDevice && (
            <Dropdown className="options-dropdown"
              overlay={renderDropdownMenu()}
              placement="bottomRight"
              trigger={["click"]}>
              <span className="icon-button-container ml-1">
                <Button
                  type="default"
                  shape="circle"
                  size="middle"
                  icon={<IconEllipsisVertical className="mean-svg-icons"/>}
                  onClick={(e) => e.preventDefault()}
                />
              </span>
            </Dropdown>
          )}
        </div>

        {renderTabset()}
      </Spin>

      {multisigClient && isCreateStreamModalVisible && (
        <TreasuryStreamCreateModal
          associatedToken=""
          connection={connection}
          handleClose={closeCreateStreamModal}
          handleOk={closeCreateStreamModal}
          isVisible={isCreateStreamModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          withdrawTransactionFees={withdrawTransactionFees}
          treasuryDetails={undefined}
          treasuryList={props.treasuryList?.filter(t => t.version >= 2)}
          minRequiredBalance={minRequiredBalance}
          multisigClient={multisigClient}
          selectedMultisig={selectedMultisig}
          userBalances={userBalances}
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
          title="Create outgoing stream"
          selected="recurring"
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
          selectedMultisig={selectedMultisig || undefined}
          userBalances={userBalances}
          treasuryStreams={undefined}
          associatedToken=""
          isBusy={isBusy}
          onReloadTokenBalances={(option: string) => {
            if (option === "safe") {
              if (selectedMultisig) {
                refreshUserBalances(selectedMultisig.authority);
              }
            } else {
              if (publicKey) {
                refreshUserBalances(publicKey);
              }
            }
          }}
        />
      )}

    </>
  );
}
