import React, { useCallback, useContext, useMemo } from 'react';
import {
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowUpOutlined,
  CheckOutlined,
  EllipsisOutlined,
  InfoCircleOutlined,
  LoadingOutlined, ReloadOutlined, SearchOutlined,
} from '@ant-design/icons';
import { ConfirmOptions, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { useEffect, useState } from 'react';
import { PreFooter } from '../../components/PreFooter';
import { getSolanaExplorerClusterParam, useConnectionConfig } from '../../contexts/connection';
import { useWallet } from '../../contexts/wallet';
import { AppStateContext } from '../../contexts/appstate';
import { useTranslation } from 'react-i18next';
import { Identicon } from '../../components/Identicon';
import {
  formatAmount,
  formatThousands,
  getAmountWithSymbol,
  getTokenAmountAndSymbolByTokenAddress,
  getTokenByMintAddress,
  getTokenSymbol,
  getTxIxResume,
  makeDecimal,
  shortenAddress,
  toTokenAmount,
  toUiAmount
} from '../../utils/utils';
import { Button, Col, Divider, Dropdown, Empty, Menu, Modal, Row, Space, Spin, Tooltip } from 'antd';
import {
  copyText,
  consoleOut,
  isValidAddress,
  getTransactionModalTitle,
  getFormattedNumberToLocale,
  getTransactionStatusForLogs,
  getTransactionOperationDescription,
  isProd,
  getIntervalFromSeconds,
  delay,
  getShortDate,
  isLocal,
} from '../../utils/ui';
import {
  FALLBACK_COIN_IMAGE,
  SOLANA_EXPLORER_URI_INSPECT_ADDRESS,
  STREAMS_REFRESH_TIMEOUT,
  VERBOSE_DATE_TIME_FORMAT
} from '../../constants';
import { isDesktop } from "react-device-detect";
import useWindowSize from '../../hooks/useWindowResize';
import { OperationType, TransactionStatus } from '../../models/enums';
import { TransactionStatusContext } from '../../contexts/transaction-status';
import { notify, openNotification } from '../../utils/notifications';
import { IconBank, IconClock, IconExternalLink, IconRefresh, IconShowAll, IconSort, IconTrash } from '../../Icons';
import { TreasuryOpenModal } from '../../components/TreasuryOpenModal';
import { MSP_ACTIONS, StreamInfo, STREAM_STATE, TreasuryInfo } from '@mean-dao/money-streaming/lib/types';
import { TreasuryCreateModal } from '../../components/TreasuryCreateModal';
import { MoneyStreaming } from '@mean-dao/money-streaming/lib/money-streaming';
import dateFormat from 'dateformat';
import { calculateActionFees } from '@mean-dao/money-streaming/lib/utils';
import { useAccountsContext, useNativeAccount } from '../../contexts/accounts';
import { MEAN_MULTISIG, NATIVE_SOL_MINT } from '../../utils/ids';
import { TreasuryAddFundsModal } from '../../components/TreasuryAddFundsModal';
import { AccountLayout, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { ACCOUNT_LAYOUT } from '../../utils/layouts';
import { TreasuryCloseModal } from '../../components/TreasuryCloseModal';
import { StreamCloseModal } from '../../components/StreamCloseModal';
import { TreasuryStreamsBreakdown } from '../../models/streams';
import { StreamPauseModal } from '../../components/StreamPauseModal';
import { TreasuryStreamCreateModal } from '../../components/TreasuryStreamCreateModal';
import { StreamResumeModal } from '../../components/StreamResumeModal';
import { TREASURY_TYPE_OPTIONS } from '../../constants/treasury-type-options';
import { TreasuryTopupParams } from '../../models/common-types';
import { TokenInfo } from '@solana/spl-token-registry';
import './style.less';
import { Constants, refreshTreasuryBalanceInstruction } from '@mean-dao/money-streaming';
import { TransactionFees, MSP_ACTIONS as MSP_ACTIONS_V2, calculateActionFees as calculateActionFeesV2, Treasury, Stream, STREAM_STATUS, MSP, TreasuryType, Constants as MSPV2Constants } from '@mean-dao/msp';
import BN from 'bn.js';
import { InfoIcon } from '../../components/InfoIcon';
import { useLocation, useNavigate } from 'react-router-dom';
import MultisigIdl from "../../models/mean-multisig-idl";
import { MultisigParticipant, MultisigV2 } from '../../models/multisig';
import { Program, Provider } from '@project-serum/anchor';
import { TreasuryCreateOptions } from '../../models/treasuries';
import { customLogger } from '../..';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const TreasuriesView = () => {
  const location = useLocation();
  const connectionConfig = useConnectionConfig();
  const { publicKey, connected, wallet } = useWallet();
  const {
    theme,
    tokenList,
    tokenBalance,
    selectedToken,
    treasuryOption,
    detailsPanelOpen,
    transactionStatus,
    streamProgramAddress,
    highLightableStreamId,
    streamV2ProgramAddress,
    previousWalletConnectState,
    setSelectedToken,
    setEffectiveRate,
    refreshStreamList,
    setTreasuryOption,
    setDtailsPanelOpen,
    resetContractValues,
    refreshTokenBalance,
    setTransactionStatus,
    setHighLightableStreamId,
    setHighLightableMultisigId,
  } = useContext(AppStateContext);
  const {
    fetchTxInfoStatus,
    lastSentTxSignature,
    lastSentTxOperationType,
    startFetchTxSignatureInfo,
    clearTransactionStatusContext,
  } = useContext(TransactionStatusContext);
  const { t } = useTranslation('common');
  const { width } = useWindowSize();
  const { account } = useNativeAccount();
  const accounts = useAccountsContext();
  const navigate = useNavigate();
  const [isSmallUpScreen, setIsSmallUpScreen] = useState(isDesktop);
  const [treasuryList, setTreasuryList] = useState<(Treasury | TreasuryInfo)[]>([]);
  const [loadingTreasuries, setLoadingTreasuries] = useState(false);
  const [treasuriesLoaded, setTreasuriesLoaded] = useState(false);
  const [customStreamDocked, setCustomStreamDocked] = useState(false);
  const [loadingTreasuryStreams, setLoadingTreasuryStreams] = useState(false);
  const [treasuryStreams, setTreasuryStreams] = useState<(Stream | StreamInfo)[]>([]);
  const [streamStats, setStreamStats] = useState<TreasuryStreamsBreakdown | undefined>(undefined);
  const [signalRefreshTreasuryStreams, setSignalRefreshTreasuryStreams] = useState(false);
  const [treasuryDetails, setTreasuryDetails] = useState<Treasury | TreasuryInfo | undefined>(undefined);
  const [highlightedStream, sethHighlightedStream] = useState<Stream | StreamInfo | undefined>();
  const [loadingTreasuryDetails, setLoadingTreasuryDetails] = useState(false);
  const [ongoingOperation, setOngoingOperation] = useState<OperationType | undefined>(undefined);
  const [retryOperationPayload, setRetryOperationPayload] = useState<any>(undefined);

  // Multisig related
  const [multisigAddress, setMultisigAddress] = useState('');
  const [selectedMultisig, setSelectedMultisig] = useState<MultisigV2 | undefined>(undefined);
  const [treasuryAddress, setTreasuryAddress] = useState('');
  const [loadingMultisigAccounts, setLoadingMultisigAccounts] = useState(true);
  const [multisigAccounts, setMultisigAccounts] = useState<MultisigV2[] | undefined>(undefined);
  const [treasuryPendingTxs, setTreasuryPendingTxs] = useState(0);

  // Transactions
  const [nativeBalance, setNativeBalance] = useState(0);
  const [userBalances, setUserBalances] = useState<any>();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [transactionFees, setTransactionFees] = useState<TransactionFees>({
    blockchainFee: 0, mspFlatFee: 0, mspPercentFee: 0
  });
  const [withdrawTransactionFees, setWithdrawTransactionFees] = useState<TransactionFees>({
    blockchainFee: 0, mspFlatFee: 0, mspPercentFee: 0
  });

  // Enable deep-linking - Parse and save query params as needed
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    let multisig: string | null = null;
    let treasury: string | null = null;

    if (params.has('multisig')) {             // Preset multisig address if passed-in
      multisig = params.get('multisig');
      setMultisigAddress(multisig || '');
      consoleOut('multisigAddress:', multisig, 'blue');
    } else if (params.has('treasury')) {      // Preset treasury address if passed-in
      treasury = params.get('treasury');
      setTreasuryAddress(treasury || '');
      consoleOut('treasuryAddress:', treasury, 'blue');
    } else if (selectedMultisig) {            // Clean any data we may have data relative to a previous multisig
      setMultisigAddress('');
      setSelectedMultisig(undefined);
    }
  }, [
    location.search,
    selectedMultisig,
  ]);

  // Create and cache the connection
  const connection = useMemo(() => new Connection(connectionConfig.endpoint, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true
  }), [
    connectionConfig.endpoint
  ]);

  // Create and cache Multisig client instance
  const multisigClient = useMemo(() => {

    const opts: ConfirmOptions = {
      preflightCommitment: "finalized",
      commitment: "finalized",
    };

    const provider = new Provider(connection, wallet as any, opts);

    return new Program(
      MultisigIdl,
      MEAN_MULTISIG,
      provider
    );

  }, [
    connection, 
    wallet
  ]);

  // Create and cache Money Streaming Program V1 instance
  const ms = useMemo(() => new MoneyStreaming(
    connectionConfig.endpoint,
    streamProgramAddress,
    "finalized"
  ), [
    connectionConfig.endpoint,
    streamProgramAddress
  ]);

  // Create and cache Money Streaming Program V2 instance
  const msp = useMemo(() => {
    if (publicKey) {
      console.log('New MSP from treasuries');
      return new MSP(
        connectionConfig.endpoint,
        streamV2ProgramAddress,
        "finalized"
      );
    }
  }, [
    connectionConfig.endpoint,
    publicKey,
    streamV2ProgramAddress
  ]);

  const getTransactionFees = useCallback(async (action: MSP_ACTIONS): Promise<TransactionFees> => {
    return await calculateActionFees(connection, action);
  }, [connection]);

  const getTransactionFeesV2 = useCallback(async (action: MSP_ACTIONS_V2): Promise<TransactionFees> => {
    return await calculateActionFeesV2(connection, action);
  }, [connection]);

  const getTreasuryStreams = useCallback((treasuryPk: PublicKey, isNewTreasury: boolean) => {
    if (!publicKey || !ms || loadingTreasuryStreams) { return; }

    setTimeout(() => {
      setLoadingTreasuryStreams(true);
    });

    consoleOut('Executing getTreasuryStreams...', '', 'blue');

    if (isNewTreasury) {
      if (msp) {
        msp.listStreams({treasury: treasuryPk })
          .then((streams) => {
            consoleOut('treasuryStreams:', streams, 'blue');
            setTreasuryStreams(streams);
          })
          .catch(err => {
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
          .then((streams) => {
            consoleOut('treasuryStreams:', streams, 'blue');
            setTreasuryStreams(streams);
          })
          .catch(err => {
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
            notify({
              description: t('notifications.success-loading-treasury-message', {treasuryId: shortenAddress(treasuryId, 10)}),
              type: "success"
            });
          }
        } else {
          setTreasuryDetails(undefined);
          setTreasuryDetails(undefined);
          if (dock) {
            notify({
              message: t('notifications.error-title'),
              description: t('notifications.error-loading-treasuryid-message', {treasuryId: shortenAddress(treasuryId as string, 10)}),
              type: "error"
            });
          }
        }
      })
      .catch((error: any) => {
        console.error(error);
        setTreasuryDetails(undefined);
        notify({
          message: t('notifications.error-title'),
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
    setTreasuryOption,
    setSelectedToken,
    setCustomToken,
    t,
  ]);

  const getAllUserV2Treasuries = useCallback(async () => {

    if (!connection || !publicKey || loadingTreasuries || !multisigAccounts || !msp) { return []; }

    let treasuries: Treasury[] = [];

    if (!selectedMultisig) {
      treasuries = await msp.listTreasuries(publicKey);
    }

    let filterMultisigAccounts = selectedMultisig 
      ? [selectedMultisig.address]
      : multisigAccounts.map(m => m.address);

    if (filterMultisigAccounts) {
      for (let key of filterMultisigAccounts) {
        let multisigTreasuries = await msp.listTreasuries(key);
        treasuries.push(...multisigTreasuries);
      }
    }    

    return treasuries.filter(t => !t.autoClose);

  }, [
    connection, 
    loadingTreasuries, 
    msp,
    selectedMultisig,
    multisigAccounts,
    publicKey
  ]);

  const refreshTreasuries = useCallback((reset = false) => {
    if (!connection || !publicKey) { return; }

    if (msp && ms && fetchTxInfoStatus !== "fetching") {

      setTimeout(() => {
        setLoadingTreasuries(true);
        clearTransactionStatusContext();
      });

      let treasuryAccumulator: (Treasury | TreasuryInfo)[] = [];
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
              console.log('treasuryAddress under reset:', treasuryAddress);
              if (treasuryAddress) {
                // treasuryAddress was passed in as query param?
                const itemFromServer = treasuryAccumulator.find(i => i.id === treasuryAddress);
                item = itemFromServer || treasuryAccumulator[0];
              } else {
                item = treasuryAccumulator[0];
              }
            } else {
              console.log('treasuryAddress under no reset:', treasuryAddress);
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
              // setTreasuryDetails(item);
              const isNewTreasury = (item as Treasury).version && (item as Treasury).version >= 2 ? true : false;
              openTreasuryById(item.id as string, isNewTreasury);
            }

            // setLoadingTreasuries(false);

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
    fetchTxInfoStatus,
    selectedMultisig,
    clearTransactionStatusContext,
    openTreasuryById,
    getAllUserV2Treasuries
  ]);

  const numTreasuryStreams = useCallback(() => {
    return treasuryStreams ? treasuryStreams.length : 0;
  }, [treasuryStreams]);

  // Keep account balance updated
  useEffect(() => {

    const getAccountBalance = (): number => {
      return (account?.lamports || 0) / LAMPORTS_PER_SOL;
    }

    if (account?.lamports !== previousBalance || !nativeBalance) {
      // Refresh token balance
      refreshTokenBalance();
      setNativeBalance(getAccountBalance());
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [
    account,
    nativeBalance,
    previousBalance,
    refreshTokenBalance
  ]);

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
      for (let acc of response.value) {
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
      for (let t of tokenList) {
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

  // Automatically update all token balances (in token list)
  useEffect(() => {

    if (!connection) {
      console.error('No connection');
      return;
    }

    if (!publicKey || !tokenList || !accounts || !accounts.tokenAccounts) {
      return;
    }

    const timeout = setTimeout(() => {
      refreshUserBalances();
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    accounts,
    tokenList,
    publicKey,
    connection,
    refreshUserBalances
  ]);

  /**
   * Block of code from multisig
   * - Gets the list of multisigs for the user
   * - Parse account for all items in the list
   * - Select the matching item in the list by the supplied multisigAddress
   */

  const readAllMultisigV2Accounts = useCallback(async (wallet: PublicKey) => { // V2

    let accounts: any[] = [];
    let multisigV2Accs = await multisigClient.account.multisigV2.all();
    let filteredAccs = multisigV2Accs.filter((a: any) => {
      if (a.account.owners.filter((o: any) => o.address.equals(wallet)).length) { return true; }
      return false;
    });

    accounts.push(...filteredAccs);

    return accounts;
    
  }, [
    multisigClient.account.multisigV2
  ]);

  const parseMultisigV2Account = (info: any) => {
    return PublicKey
      .findProgramAddress([info.publicKey.toBuffer()], MEAN_MULTISIG)
      .then(k => {

        let address = k[0];
        let owners: MultisigParticipant[] = [];
        let labelBuffer = Buffer
          .alloc(info.account.label.length, info.account.label)
          .filter(function (elem, index) { return elem !== 0; }
        );

        let filteredOwners = info.account.owners.filter((o: any) => !o.address.equals(PublicKey.default));

        for (let i = 0; i < filteredOwners.length; i ++) {
          owners.push({
            address: filteredOwners[i].address.toBase58(),
            name: filteredOwners[i].name.length > 0 
              ? new TextDecoder().decode(
                  Buffer.from(
                    Uint8Array.of(
                      ...filteredOwners[i].name.filter((b: any) => b !== 0)
                    )
                  )
                )
              : ""
          } as MultisigParticipant);
        }

        return {
          id: info.publicKey,
          version: info.account.version,
          label: new TextDecoder().decode(labelBuffer),
          address,
          nounce: info.account.nonce,
          ownerSeqNumber: info.account.ownerSetSeqno,
          threshold: info.account.threshold.toNumber(),
          pendingTxsAmount: info.account.pendingTxs.toNumber(),
          createdOnUtc: new Date(info.account.createdOn.toNumber() * 1000),
          owners: owners

        } as MultisigV2;
      })
      .catch(err => { 
        consoleOut('error', err, 'red');
        return undefined;
      });
  };

  const isMultisigTreasury = useCallback((treasury?: any) => {

    let treasuryInfo: any = treasury ?? treasuryDetails;

    if (!treasuryInfo || treasuryInfo.version < 2 || !treasuryInfo.treasurer || !publicKey) {
      return false;
    }

    let treasurer = new PublicKey(treasuryInfo.treasurer as string);

    if (!treasurer.equals(publicKey) && multisigAccounts && multisigAccounts.findIndex(m => m.address.equals(treasurer)) !== -1) {
      return true;
    }

    return false;

  }, [
    multisigAccounts, 
    publicKey, 
    treasuryDetails
  ])

  const getSelectedTreasuryMultisig = useCallback((treasury?: any) => {

    let treasuryInfo: any = treasury ?? treasuryDetails;

    if (!treasuryInfo || treasuryInfo.version < 2 || !treasuryInfo.treasurer || !publicKey) {
      return PublicKey.default;
    }

    let treasurer = new PublicKey(treasuryInfo.treasurer as string);

    if (!multisigAccounts || !treasuryDetails) { return PublicKey.default; }
    const multisig = multisigAccounts.filter(a => a.address.equals(treasurer))[0];
    if (!multisig) { return PublicKey.default; }
    return multisig.id;

  }, [
    multisigAccounts, 
    publicKey, 
    treasuryDetails
  ])

  useEffect(() => {

    if (!isMultisigTreasury() || !treasuryDetails || !connected || !publicKey || !multisigAccounts) {
      setTreasuryPendingTxs(0);
      return;
    }

    const timeout = setTimeout(() => {
      let treasury = treasuryDetails as Treasury;
      let multisig = multisigAccounts.find(m => m.address.toBase58() === treasury.treasurer);
      
      if (!multisig) {
        setTreasuryPendingTxs(0);
        return;
      }
      
      multisigClient.account.transaction
        .all(multisig.id.toBuffer())
        .then((value) => { 
          setTreasuryPendingTxs(
            value ? value.filter(t => t.account.executedOn.toNumber() === 0).length : 0
          ); 
        });
    });

    return () => {
      clearTimeout(timeout);
    }

  },[
    connected, 
    isMultisigTreasury, 
    multisigAccounts, 
    multisigClient.account.transaction, 
    publicKey, 
    treasuryDetails
  ]);

  // Get the user multisig accounts' list
  useEffect(() => {

    if (!connection || !publicKey || !multisigClient) {
      return;
    }

    const timeout = setTimeout(() => {

      readAllMultisigV2Accounts(publicKey)
        .then((allInfo: any) => {
          let multisigInfoArray: MultisigV2[] = [];
          for (let info of allInfo) {
            parseMultisigV2Account(info)
              .then((multisig: any) =>{
                if (multisig) {
                  multisigInfoArray.push(multisig);
                }
              })
              .catch((err: any) => {
                console.error(err);
                setLoadingMultisigAccounts(false);
              });
          }
          
          setTimeout(() => {
            multisigInfoArray.sort((a: any, b: any) => b.createdOnUtc.getTime() - a.createdOnUtc.getTime());
            setMultisigAccounts(multisigInfoArray);
            consoleOut('multisigs:', multisigInfoArray, 'blue');
            setLoadingMultisigAccounts(false);
          });
        })
        .catch(err => {
          console.error(err);
          setLoadingMultisigAccounts(false);
        });
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connection,
    multisigClient,
    publicKey,
    readAllMultisigV2Accounts,
  ]);

  // Set selectedMultisig based on the passed-in multisigAddress in query params
  useEffect(() => {

    if (!publicKey || !multisigAddress || !multisigAccounts || multisigAccounts.length === 0) {
      return;
    }

    const timeout = setTimeout(() => {
      if (location.search) {
        consoleOut(`try to select multisig ${multisigAddress} from list`, multisigAccounts, 'blue');
        const selected = multisigAccounts.find(m => m.id.toBase58() === multisigAddress);
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

  // Load treasuries once per page access
  useEffect(() => {
    if (!publicKey || !connection || treasuriesLoaded || loadingTreasuries || loadingMultisigAccounts || !multisigAccounts) {
      return;
    }

    // Verify query param
    const params = new URLSearchParams(location.search);
    if (params.has('treasury') && !treasuryAddress) {
      consoleOut('Wait for treasuryAddress on next render...', '', 'blue');
      return;
    }

    setTreasuriesLoaded(true);
    consoleOut('Loading treasuries with wallet connection...', '', 'blue');
    refreshTreasuries(true);
  }, [
    publicKey,
    connection,
    treasuryAddress,
    location.search,
    multisigAccounts,
    treasuriesLoaded,
    loadingTreasuries,
    loadingMultisigAccounts,
    refreshTreasuries
  ]);

  // Load/Unload treasuries on wallet connect/disconnect
  useEffect(() => {
    if (previousWalletConnectState !== connected) {
      if (!previousWalletConnectState && connected && publicKey) {
        consoleOut('User is connecting...', publicKey.toBase58(), 'green');
        setLoadingMultisigAccounts(true);
        setTreasuriesLoaded(false);
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'green');
        setUserBalances(undefined);
        setTreasuryList([]);
        setTreasuryStreams([]);
        setCustomStreamDocked(false);
        setTreasuryDetails(undefined);
      }
    }
  }, [
    connected,
    publicKey,
    treasuriesLoaded,
    loadingTreasuries,
    previousWalletConnectState,
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

  // Maintain stream stats
  useEffect(() => {

    const updateStats = () => {
      if (treasuryStreams && treasuryStreams.length) {
        const scheduled = treasuryStreams.filter(s => {
          if (s.version < 2) {
            return (s as StreamInfo).state === STREAM_STATE.Schedule
          } else {
            return (s as Stream).status === STREAM_STATUS.Schedule
          }
        });
        const running = treasuryStreams.filter(s => {
          if (s.version < 2) {
            return (s as StreamInfo).state === STREAM_STATE.Running
          } else {
            return (s as Stream).status === STREAM_STATUS.Running
          }
        });
        const stopped = treasuryStreams.filter(s => {
          if (s.version < 2) {
            return (s as StreamInfo).state === STREAM_STATE.Paused
          } else {
            return (s as Stream).status === STREAM_STATUS.Paused
          }
        });
        const stats: TreasuryStreamsBreakdown = {
          total: treasuryStreams.length,
          scheduled: scheduled.length,
          running: running.length,
          stopped: stopped.length
        }
        setStreamStats(stats);
      } else {
        setStreamStats(undefined);
      }
    }

    updateStats();
  }, [
    publicKey,
    treasuryStreams,
  ]);

  // Detect when entering small screen mode
  useEffect(() => {
    if (isSmallUpScreen && width < 576) {
      setIsSmallUpScreen(false);
    }
  }, [
    width,
    isSmallUpScreen,
    detailsPanelOpen,
    setDtailsPanelOpen
  ]);

  // Treasury list refresh timeout
  useEffect(() => {
    let timer: any;

    if (publicKey && treasuriesLoaded && !customStreamDocked) {
      timer = setInterval(() => {
        consoleOut(`Refreshing treasuries past ${STREAMS_REFRESH_TIMEOUT / 60 / 1000}min...`);
        refreshTreasuries(false);
      }, STREAMS_REFRESH_TIMEOUT);
    }

    return () => clearInterval(timer);
  }, [
    publicKey,
    treasuriesLoaded,
    customStreamDocked,
    refreshTreasuries
  ]);

  // Handle what to do when pending Tx confirmation reaches finality or on error
  // For now just refresh treasuries keeping the selection or reseting to first item
  useEffect(() => {
    if (!publicKey) { return; }

    const stackedMessagesAndNavigate = async (multisigId: string) => {
      openNotification({
        type: "info",
        description: t('treasuries.create-treasury.multisig-treasury-created-info'),
        duration: 10
      });
      await delay(1500);
      openNotification({
        type: "info",
        description: t('treasuries.create-treasury.multisig-treasury-created-instructions'),
        duration: null,
      });
      const destMultisig = multisigAccounts ? multisigAccounts.find(m => m.id.toBase58() === multisigId) : undefined;
      consoleOut('destMultisig:', destMultisig, 'crimson');
      if (destMultisig) {
        setHighLightableMultisigId(destMultisig.address.toBase58());
      }
      navigate('/multisig');
    }

    if (lastSentTxSignature && (fetchTxInfoStatus === "fetched" || fetchTxInfoStatus === "error")) {
      switch (lastSentTxOperationType) {
        case OperationType.TreasuryCreate:
          const usedOptions = retryOperationPayload as TreasuryCreateOptions;
          if (usedOptions.multisigId) {
            clearTransactionStatusContext();
            stackedMessagesAndNavigate(usedOptions.multisigId);
          } else {
            refreshTreasuries(true);
          }
          setOngoingOperation(undefined);
          break;
        case OperationType.TreasuryClose:
          refreshTreasuries(true);
          break;
        default:
          refreshTreasuries(false);
          break;
      }
    }
  }, [
    publicKey,
    selectedMultisig,
    fetchTxInfoStatus,
    lastSentTxSignature,
    retryOperationPayload,
    lastSentTxOperationType,
    clearTransactionStatusContext,
    setHighLightableMultisigId,
    refreshTreasuries,
    navigate,
    t
  ]);

  /////////////////
  //   Getters   //
  /////////////////

  const isAnythingLoading = useCallback((): boolean => {
    return loadingTreasuries || loadingTreasuryDetails || loadingTreasuryStreams
            ? true
            : false;
  }, [
    loadingTreasuries,
    loadingTreasuryDetails,
    loadingTreasuryStreams,
  ]);

  const isCreatingTreasury = useCallback((): boolean => {
    return fetchTxInfoStatus === "fetching" && lastSentTxOperationType === OperationType.TreasuryCreate
            ? true
            : false;
  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  const isRefreshingTreasuryBalance = useCallback((): boolean => {
    return fetchTxInfoStatus === "fetching" && lastSentTxOperationType === OperationType.TreasuryRefreshBalance
            ? true
            : false;
  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  const isClosingTreasury = useCallback((): boolean => {
    return fetchTxInfoStatus === "fetching" && lastSentTxOperationType === OperationType.TreasuryClose
            ? true
            : false;
  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  const isAddingFunds = useCallback((): boolean => {
    return fetchTxInfoStatus === "fetching" && lastSentTxOperationType === OperationType.TreasuryAddFunds
            ? true
            : false;
  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  const isCreatingStream = useCallback((): boolean => {
    return fetchTxInfoStatus === "fetching" && lastSentTxOperationType === OperationType.TreasuryStreamCreate
            ? true
            : false;
  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  const isClosingStream = useCallback((): boolean => {
    return fetchTxInfoStatus === "fetching" && lastSentTxOperationType === OperationType.StreamClose
            ? true
            : false;
  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  const isPausingStream = useCallback((): boolean => {
    return fetchTxInfoStatus === "fetching" && lastSentTxOperationType === OperationType.StreamPause
            ? true
            : false;
  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  const isResumingStream = useCallback((): boolean => {
    return fetchTxInfoStatus === "fetching" && lastSentTxOperationType === OperationType.StreamResume
            ? true
            : false;
  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  const isTxInProgress = useCallback((): boolean => {
    return isBusy || fetchTxInfoStatus === "fetching"
            ? true
            : false;
  }, [
    isBusy,
    fetchTxInfoStatus,
  ]);

  const isMultisigAvailable = useCallback((): boolean => {
    return multisigAddress && selectedMultisig && selectedMultisig.id.toBase58() === multisigAddress
            ? true
            : false;
  }, [
    multisigAddress,
    selectedMultisig,
  ]);

  const isTreasurer = useCallback((): boolean => {
    if (treasuryDetails && publicKey) {
      const v1 = treasuryDetails as TreasuryInfo;
      const v2 = treasuryDetails as Treasury;
      if (v2.version && v2.version >= 2) {
        const isMultisig = isMultisigTreasury();
        if (isMultisig && multisigAccounts) {
          return multisigAccounts.find(m => m.address.toBase58() === v2.treasurer) ? true : false;
        }
        return v2.treasurer === publicKey.toBase58() ? true : false;
      }
      return v1.treasurerAddress === publicKey.toBase58() ? true : false;
    }
    return false;
  }, [
    publicKey,
    treasuryDetails,
    multisigAccounts,
    isMultisigTreasury
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

  const getStreamIcon = useCallback((item: Stream | StreamInfo) => {
    const isInbound = isInboundStream(item);
    return isInbound
      ? (<ArrowDownOutlined className="mean-svg-icons incoming" />)
      : (<ArrowUpOutlined className="mean-svg-icons outgoing" />)
  }, [isInboundStream]);

  const getDepletionLabel = useCallback((item: Stream | StreamInfo) => {
    const decimals = selectedToken ? selectedToken.decimals : 6;
    const v1 = item as StreamInfo;
    const v2 = item as Stream;
    const nowUtc = new Date().toUTCString();
    // Get a date 3 hrs from now to compare against depletionDate
    const added3hrs = new Date(nowUtc);
    const threehoursFromNow = new Date(added3hrs.getTime()+(3*60*60*1000));
    // Get a date 3 days from now to compare against depletionDate
    const added72hrs = new Date(nowUtc);
    const threeDaysFromNow = new Date(added72hrs.getTime()+(3*24*60*60*1000));

    let depletionDate: Date;
    let fundsLeft: string;
    if (item.version >= 2) {
      depletionDate = new Date(v2.estimatedDepletionDate);
      const amount = toUiAmount(new BN(v2.fundsLeftInStream), decimals);
      fundsLeft = formatThousands(amount, decimals, 4);
    } else {
      depletionDate = new Date(v1.escrowEstimatedDepletionUtc as string);
      fundsLeft = formatThousands(v1.escrowUnvestedAmount, decimals, 4);
    }

    const colorClass = depletionDate < threehoursFromNow
      ? 'font-bold fg-error'
      : depletionDate >= threehoursFromNow && depletionDate < threeDaysFromNow
        ? `font-bold ${theme === 'light' ? "fg-light-orange" : "fg-yellow"}`
        : ''

    return (
      <span className={colorClass}>{fundsLeft}</span>
    );
  }, [
    theme,
    selectedToken,
  ]);

  const getStreamDescription = useCallback((item: Stream | StreamInfo): string => {
    let title = '';
    if (item) {
      const v1 = item as StreamInfo;
      const v2 = item as Stream;
      const isInbound = isInboundStream(item);
      if (v1.version < 2) {
        if (v1.streamName) {
          return `${v1.streamName}`;
        }
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
        if (v2.name) {
          return `${v2.name}`;
        }
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
    }
    return title;
  }, [
    t,
    isInboundStream
  ]);

  const getStreamStatus = useCallback((item: Stream | StreamInfo) => {
    const v1 = item as StreamInfo;
    const v2 = item as Stream;
    if (v1.version < 2) {
      switch (v1.state) {
        case STREAM_STATE.Schedule:
          return t('treasuries.treasury-streams.status-scheduled');
        case STREAM_STATE.Paused:
          return t('treasuries.treasury-streams.status-stopped');
        default:
          return t('treasuries.treasury-streams.status-running');
      }
    } else {
      switch (v2.status) {
        case STREAM_STATUS.Schedule:
          return t('treasuries.treasury-streams.status-scheduled');
        case STREAM_STATUS.Paused:
          return t('treasuries.treasury-streams.status-stopped');
        default:
          return t('treasuries.treasury-streams.status-running');
      }
    }
  }, [t]);

  const getRateAmountDisplay = (item: Stream | StreamInfo): string => {
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
  }

  const getDepositAmountDisplay = (item: Stream | StreamInfo): string => {
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
  }

  const getTreasuryTotalStreams = useCallback((item: Treasury | TreasuryInfo) => {
    const v1 = item as TreasuryInfo;
    const v2 = item as Treasury;
    const isNewTreasury = v2.version && v2.version >= 2 ? true : false;
    return isNewTreasury ? v2.totalStreams : v1.streamsAmount;
  }, []);

  const getTreasuryClosureMessage = () => {
    return (
      <div>{t('treasuries.close-treasury-confirmation')}</div>
    );
  }

  const getStreamClosureMessage = () => {
    let message = '';

    if (publicKey && highlightedStream) {

      const me = publicKey.toBase58();

      const treasurer = highlightedStream.version && highlightedStream.version >= 2
        ? (highlightedStream as Stream).treasurer as string : (highlightedStream as StreamInfo).treasurerAddress as string;

      const beneficiary = highlightedStream.version && highlightedStream.version >= 2
        ? (highlightedStream as Stream).beneficiary as string : (highlightedStream as StreamInfo).beneficiaryAddress as string;

      if (treasurer === me) {  // If I am the treasurer
        message = t('close-stream.context-treasurer-single-beneficiary', {beneficiary: shortenAddress(beneficiary)});
      } else if (beneficiary === me)  {  // If I am the beneficiary
        message = t('close-stream.context-beneficiary', { beneficiary: shortenAddress(beneficiary) });
      }

    }

    return (
      <div>{message}</div>
    );
  }

  const getStreamPauseMessage = () => {
    let message = '';

    if (publicKey && highlightedStream) {

      const treasury = highlightedStream.version && highlightedStream.version >= 2
        ? (highlightedStream as Stream).treasury as string
        : (highlightedStream as StreamInfo).treasuryAddress as string;

      const beneficiary = highlightedStream.version && highlightedStream.version >= 2
        ? (highlightedStream as Stream).beneficiary as string
        : (highlightedStream as StreamInfo).beneficiaryAddress as string;

      message = t('streams.pause-stream-confirmation', {
        treasury: shortenAddress(treasury),
        beneficiary: shortenAddress(beneficiary)
      });

    }

    return (
      <div>{message}</div>
    );
  }

  const getStreamResumeMessage = () => {
    let message = '';

    if (publicKey && highlightedStream) {

      const treasury = highlightedStream.version && highlightedStream.version >= 2
        ? (highlightedStream as Stream).treasury as string
        : (highlightedStream as StreamInfo).treasuryAddress as string;

      const beneficiary = highlightedStream.version && highlightedStream.version >= 2
        ? (highlightedStream as Stream).beneficiary as string
        : (highlightedStream as StreamInfo).beneficiaryAddress as string;

      message = t('streams.resume-stream-confirmation', {
        treasury: shortenAddress(treasury),
        beneficiary: shortenAddress(beneficiary)
      });

    }

    return (
      <div>{message}</div>
    );
  }

  const isTreasuryFunded = useCallback((): boolean => {

    if (treasuryDetails) {
      const v1 = treasuryDetails as TreasuryInfo;
      const v2 = treasuryDetails as Treasury;
      const isNewTreasury = v2.version && v2.version >= 2 ? true : false;
      return isNewTreasury
        ? v2.associatedToken ? true : false
        : v1.associatedTokenAddress ? true : false;
    }
    return false;

  }, [treasuryDetails]);

  const isSuccess = (): boolean => {
    return transactionStatus.currentOperation === TransactionStatus.TransactionFinished;
  }

  const isError = (): boolean => {
    return  transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ||
            transactionStatus.currentOperation === TransactionStatus.InitTransactionFailure ||
            transactionStatus.currentOperation === TransactionStatus.SignTransactionFailure ||
            transactionStatus.currentOperation === TransactionStatus.SendTransactionFailure ||
            transactionStatus.currentOperation === TransactionStatus.ConfirmTransactionFailure
            ? true
            : false;
  }

  ////////////////
  //   Events   //
  ////////////////

  const refreshPage = () => {
    hideCloseStreamTransactionModal();
    window.location.reload();
  }

  const resetTreasuriesContext = useCallback(() => {
    setTreasuriesLoaded(false);
    setSelectedMultisig(undefined);
    setMultisigAddress('');
    navigate('/treasuries');
  }, [
    navigate,
  ]);

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }, [setTransactionStatus]);

  const onRefreshTreasuriesClick = () => {
    refreshTreasuries(false);
    setCustomStreamDocked(false);
  };

  const onCopyTreasuryAddress = (data: any) => {
    if (copyText(data.toString())) {
      notify({
        description: t('notifications.treasuryid-copied-message'),
        type: "info"
      });
    } else {
      notify({
        description: t('notifications.treasuryid-not-copied-message'),
        type: "error"
      });
    }
  }

  const onCopyStreamAddress = (data: any) => {
    if (copyText(data.toString())) {
      notify({
        description: t('notifications.streamid-copied-message'),
        type: "info"
      });
    } else {
      notify({
        description: t('notifications.streamid-not-copied-message'),
        type: "error"
      });
    }
  }

  // Open treasury modal
  const [isOpenTreasuryModalVisible, setIsOpenTreasuryModalVisibility] = useState(false);
  const showOpenTreasuryModal = useCallback(() => setIsOpenTreasuryModalVisibility(true), []);
  const closeOpenTreasuryModal = useCallback(() => setIsOpenTreasuryModalVisibility(false), []);

  const onAcceptOpenTreasury = (e: any) => {
    closeOpenTreasuryModal();
    consoleOut('treasury id:', e, 'blue');
    openTreasuryById(e, true, true);
  };

  const onCancelCustomTreasuryClick = () => {
    setCustomStreamDocked(false);
    refreshTreasuries(true);
  }

  const onCreateTreasuryClick = () => {
    setCustomStreamDocked(false);
    showCreateTreasuryModal();
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
  const closeCreateTreasuryModal = useCallback(() => setIsCreateTreasuryModalVisibility(false), []);

  const onAcceptCreateTreasury = (data: TreasuryCreateOptions) => {
    consoleOut('treasury create options:', data, 'blue');
    onExecuteCreateTreasuryTx(data);
    setRetryOperationPayload(data);
  };

  const onTreasuryCreated = useCallback((createOptions: TreasuryCreateOptions) => {
    closeCreateTreasuryModal();
    refreshTokenBalance();

    const usedOptions = retryOperationPayload as TreasuryCreateOptions;
    consoleOut('retryOperationPayload:', retryOperationPayload, 'crimson');
    consoleOut('usedOptions:', usedOptions, 'crimson');
    consoleOut('createOptions:', createOptions, 'crimson');

    if (createOptions && createOptions.multisigId) {
      notify({
        description: t('treasuries.create-treasury.create-multisig-treasury-success'),
        type: "success"
      });
    } else {
      notify({
        description: t('treasuries.create-treasury.success-message'),
        type: "success"
      });
    }

    resetTransactionStatus();
  }, [
    retryOperationPayload,
    closeCreateTreasuryModal,
    resetTransactionStatus,
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

  const onExecuteRefreshTreasuryBalance = useCallback(async() => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    resetTransactionStatus();
    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.TreasuryRefreshBalance);
    setIsBusy(true);

    const refreshBalance = async (treasury: PublicKey) => {

      if (!connection || !connected || !publicKey || !msp) {
        return false;
      }

      let ixs: TransactionInstruction[] = [];

      const { value } = await connection.getTokenAccountsByOwner(treasury, {
        programId: TOKEN_PROGRAM_ID
      });

      if (!value || !value.length) {
        return false;
      }

      const tokenAddress = value[0].pubkey;
      const tokenAccount = AccountLayout.decode(value[0].account.data);
      const associatedTokenMint = new PublicKey(tokenAccount.mint);
      const mspAddress = isProd() ? Constants.MSP_PROGRAM : Constants.MSP_PROGRAM_DEV;
      const feeTreasuryAddress: PublicKey = new PublicKey(
        "3TD6SWY9M1mLY2kZWJNavPLhwXvcRsWdnZLRaMzERJBw"
      );

      ixs.push(
        await refreshTreasuryBalanceInstruction(
          mspAddress,
          publicKey,
          associatedTokenMint,
          treasury,
          tokenAddress,
          feeTreasuryAddress
        )
      );

      const tx = new Transaction().add(...ixs);
      tx.feePayer = publicKey;
      const { blockhash } = await connection.getRecentBlockhash("recent");
      tx.recentBlockhash = blockhash;

      return tx;
    };

    const refreshTreasuryData = async (data: any) => {

      if (!publicKey || !treasuryDetails || !msp) { return null; }

      const v2 = treasuryDetails as Treasury;
      const isNewTreasury = v2.version >= 2 ? true : false;

      if (!isNewTreasury) {
        return await refreshBalance(new PublicKey(data.treasury));
      }

      if (!isMultisigTreasury()) {
        return await msp.refreshTreasuryData(
          new PublicKey(publicKey),
          new PublicKey(data.treasurer),
          new PublicKey(data.treasury)
        );
      }

      if (!treasuryDetails || !multisigClient || !multisigAccounts || !publicKey) { return null; }

      let treasury = treasuryDetails as Treasury;
      let multisig = multisigAccounts.filter(m => m.address.toBase58() === treasury.treasurer)[0];

      if (!multisig) { return null; }

      let refreshTreasury = await msp.refreshTreasuryData(
        new PublicKey(publicKey),
        multisig.address,
        new PublicKey(data.treasury)
      );

      const ixData = Buffer.from(refreshTreasury.instructions[0].data);
      const ixAccounts = refreshTreasury.instructions[0].keys;
      const transaction = Keypair.generate();
      const txSize = 1000;
      const txSigners = [transaction];
      const createIx = await multisigClient.account.transaction.createInstruction(
        transaction,
        txSize
      );
      
      let tx = multisigClient.transaction.createTransaction(
        MSPV2Constants.MSP, 
        OperationType.TreasuryRefreshBalance,
        ixAccounts as any,
        ixData as any,
        {
          accounts: {
            multisig: multisig.id,
            transaction: transaction.publicKey,
            proposer: publicKey as PublicKey,
          },
          preInstructions: [createIx],
          signers: txSigners,
        }
      );

      tx.feePayer = publicKey;
      let { blockhash } = await connection.getRecentBlockhash("finalized");
      tx.recentBlockhash = blockhash;
      tx.partialSign(...txSigners);

      return tx;
    }

    const createTx = async (): Promise<boolean> => {

      if (!publicKey || !treasuryDetails) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Refresh Treasury data transaction failed', { transcript: transactionLog });
        return false;
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      const treasury = new PublicKey(treasuryDetails.id as string);
      const data = {
        treasurer: publicKey.toBase58(),                      // treasurer
        treasury: treasury.toBase58()                         // treasury
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
      consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${
            getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
          }) to pay for network fees (${
            getTokenAmountAndSymbolByTokenAddress(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
          })`
        });
        customLogger.logWarning('Refresh Treasury data transaction failed', { transcript: transactionLog });
        return false;
      }

      // Create a transaction
      let result = await refreshTreasuryData(data)
        .then(value => {
          if (!value) { return false; }
          consoleOut('refreshBalance returned transaction:', value);
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
          console.error('refreshBalance error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Refresh Treasury data transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Refresh Treasury data transaction failed', { transcript: transactionLog });
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
          console.error('Signing transaction failed!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('Refresh Treasury data transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Refresh Treasury data transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Refresh Treasury data transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Refresh Treasury data transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet) {
      const created = await createTx();
      consoleOut('created:', created);
      if (created && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('sign:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            startFetchTxSignatureInfo(signature, "finalized", OperationType.TreasuryRefreshBalance);
            setIsBusy(false);
            onRefreshTreasuryBalanceTransactionFinished();
            setOngoingOperation(undefined);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  },[
    resetTransactionStatus, 
    clearTransactionStatusContext, 
    wallet, 
    connection, 
    connected, 
    publicKey, 
    msp, 
    treasuryDetails, 
    isMultisigTreasury, 
    multisigClient, 
    multisigAccounts, 
    setTransactionStatus, 
    transactionFees.blockchainFee, 
    transactionFees.mspFlatFee, 
    nativeBalance, 
    transactionStatus.currentOperation, 
    transactionCancelled, 
    startFetchTxSignatureInfo, 
    onRefreshTreasuryBalanceTransactionFinished
  ]);

  const onExecuteCreateTreasuryTx = async (createOptions: TreasuryCreateOptions) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
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
          data.label,                                       // label
          treasuryType                                      // type
        );
      }

      if (!multisigClient || !multisigAccounts) { return null; }

      const multisig = multisigAccounts.filter(m => m.id.toBase58() === data.multisig)[0];

      if (!multisig) { return null; }

      // Create Treasury
      const createTreasuryTx = await msp.createTreasury(
        publicKey,                                        // payer
        multisig.address,                                 // treasurer
        data.label,                                       // label
        treasuryType,                                     // type
        true,                                             // solFeePayedByTreasury = true
      );

      const ixData = Buffer.from(createTreasuryTx.instructions[0].data);
      const ixAccounts = createTreasuryTx.instructions[0].keys;
      const transaction = Keypair.generate();
      const txSize = 1000;
      const txSigners = [transaction];
      const createIx = await multisigClient.account.transaction.createInstruction(
        transaction,
        txSize
      );
      
      let tx = multisigClient.transaction.createTransaction(
        MSPV2Constants.MSP, 
        OperationType.TreasuryCreate,
        ixAccounts as any,
        ixData as any,
        {
          accounts: {
            multisig: multisig.id,
            transaction: transaction.publicKey,
            proposer: publicKey as PublicKey,
          },
          preInstructions: [createIx],
          signers: txSigners,
        }
      );

      tx.feePayer = publicKey;
      let { blockhash } = await connection.getRecentBlockhash("finalized");
      tx.recentBlockhash = blockhash;
      tx.partialSign(...txSigners);

      return tx;
    }

    const createTx = async () => {

      if (!connection || !wallet || !publicKey || !msp || !treasuryOption) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Create Treasury transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut("Start transaction for create treasury", '', 'blue');
      consoleOut('Wallet address:', publicKey.toBase58());

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      // Create a transaction
      const payload = {
        treasurer: publicKey.toBase58(),                                                                  // treasurer
        label: createOptions.treasuryName,                                                                // label
        type: createOptions.treasuryType === TreasuryType.Open         // type
          ? 'Open'
          : 'Lock',
        multisig: createOptions.multisigId                                                                // multisig
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
      consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${
            getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
          }) to pay for network fees (${
            getTokenAmountAndSymbolByTokenAddress(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
          })`
        });
        customLogger.logWarning('Create Treasury transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut('Starting Create Treasury using MSP V2...', '', 'blue');

      let result = await createTreasury(payload)
        .then(value => {
          if (!value) { return false; }
          consoleOut('createTreasury returned transaction:', value);
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
          console.error('createTreasury error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Create Treasury transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Create Treasury transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Create Treasury transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Create Treasury transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Create Treasury transaction failed', { transcript: transactionLog });
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
            startFetchTxSignatureInfo(signature, "finalized", OperationType.TreasuryCreate);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            onTreasuryCreated(createOptions);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  };

  // Add funds modal
  const [isAddFundsModalVisible, setIsAddFundsModalVisibility] = useState(false);
  const showAddFundsModal = useCallback(() => {
    resetTransactionStatus();
    refreshUserBalances();
    refreshTokenBalance();
    if (treasuryDetails) {
      const v2 = treasuryDetails as Treasury;
      if (v2.version && v2.version >= 2) {
        getTransactionFeesV2(MSP_ACTIONS_V2.addFunds).then(value => {
          setTransactionFees(value);
          consoleOut('transactionFees:', value, 'orange');
        });
        getTransactionFeesV2(MSP_ACTIONS_V2.withdraw).then(value => {
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
    treasuryDetails,
    getTransactionFees,
    refreshTokenBalance,
    refreshUserBalances,
    getTransactionFeesV2,
    resetTransactionStatus,
  ]);

  const closeAddFundsModal = useCallback(() => {
    setIsAddFundsModalVisibility(false);
    setHighLightableStreamId(undefined);
    sethHighlightedStream(undefined);
  }, [setHighLightableStreamId]);

  const onAddFundsTransactionFinished = () => {
    closeAddFundsModal();
    refreshTokenBalance();
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
    notify({
      description: t('treasuries.add-funds.success-message'),
      type: "success"
    });
  };

  const onAcceptAddFunds = (params: TreasuryTopupParams) => {
    consoleOut('AddFunds params:', params, 'blue');
    onExecuteAddFundsTransaction(params);
  };

  const onExecuteAddFundsTransaction = async (params: TreasuryTopupParams) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.TreasuryAddFunds);
    setRetryOperationPayload(params);
    setIsBusy(true);

    const createTxV1 = async (): Promise<boolean> => {
      if (publicKey && treasuryDetails && selectedToken) {
        consoleOut("Start transaction for treasury addFunds", '', 'blue');
        consoleOut('Wallet address:', publicKey.toBase58());

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const treasury = new PublicKey(treasuryDetails.id);
        const associatedToken = new PublicKey(selectedToken.address);
        const amount = parseFloat(params.amount);
        const stream = params.streamId ? new PublicKey(params.streamId) : undefined;

        console.log('params.streamId', params.streamId);

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
        consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');
        if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${
              getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getTokenAmountAndSymbolByTokenAddress(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
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
        .then(value => {
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
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Treasury Add funds transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const addFunds = async (data: any) => {

      if (!msp) { return null; }

      if (data.stream === '') {
        return await msp.addFunds(
          new PublicKey(data.payer),                   // payer
          new PublicKey(data.contributor),             // contributor
          new PublicKey(data.treasury),                // treasury
          new PublicKey(data.associatedToken),         // associatedToken
          data.amount,                                 // amount
        );
      }

      if (!isMultisigTreasury()) {
        return await msp.allocate(
          new PublicKey(data.payer),                   // payer
          new PublicKey(data.contributor),             // treasurer
          new PublicKey(data.treasury),                // treasury
          new PublicKey(data.stream),                  // stream
          data.amount,                                 // amount
        );
      }

      if (!treasuryDetails || !multisigClient || !multisigAccounts || !publicKey) { return null; }

      let treasury = treasuryDetails as Treasury;
      let multisig = multisigAccounts.filter(m => m.address.toBase58() === treasury.treasurer)[0];

      if (!multisig) { return null; }

      let allocateTx = await msp.allocate(
        new PublicKey(data.payer),                   // payer
        new PublicKey(multisig.address),             // treasurer
        new PublicKey(data.treasury),                // treasury
        new PublicKey(data.stream),                  // stream
        data.amount,                                 // amount
      );

      const ixData = Buffer.from(allocateTx.instructions[0].data);
      const ixAccounts = allocateTx.instructions[0].keys;
      const transaction = Keypair.generate();
      const txSize = 1000;
      const txSigners = [transaction];
      const createIx = await multisigClient.account.transaction.createInstruction(
        transaction,
        txSize
      );
      
      let tx = multisigClient.transaction.createTransaction(
        MSPV2Constants.MSP, 
        OperationType.StreamAddFunds,
        ixAccounts as any,
        ixData as any,
        {
          accounts: {
            multisig: multisig.id,
            transaction: transaction.publicKey,
            proposer: publicKey as PublicKey,
          },
          preInstructions: [createIx],
          signers: txSigners,
        }
      );

      tx.feePayer = publicKey;
      let { blockhash } = await connection.getRecentBlockhash("finalized");
      tx.recentBlockhash = blockhash;
      tx.partialSign(...txSigners);

      return tx;
    }

    const createTxV2 = async (): Promise<boolean> => {

      if (!publicKey || !treasuryDetails || !selectedToken || !msp) {
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

      const treasury = new PublicKey(treasuryDetails.id);
      const associatedToken = new PublicKey(selectedToken.address);
      const amount = params.tokenAmount.toNumber();

      console.log('params.streamId', params.streamId);

      const data = {
        payer: publicKey.toBase58(),                              // payer
        contributor: publicKey.toBase58(),                        // contributor
        treasury: treasury.toBase58(),                            // treasury
        associatedToken: associatedToken.toBase58(),              // associatedToken
        stream: params.streamId ? params.streamId : '',
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
      consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');
      if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${
            getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
          }) to pay for network fees (${
            getTokenAmountAndSymbolByTokenAddress(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
          })`
        });
        customLogger.logWarning('Treasury Add funds transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut('Starting Add Funds using MSP V2...', '', 'blue');
      // Create a transaction
      let result = await addFunds(data)
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
            customLogger.logError('Treasury Add funds transaction failed', { transcript: transactionLog });
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
          console.error('Signing transaction failed!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('Treasury Add funds transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Treasury Add funds transaction failed', { transcript: transactionLog });
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

    if (publicKey && treasuryDetails && selectedToken) {
      let created: boolean;
      if ((treasuryDetails as Treasury).version && (treasuryDetails as Treasury).version >= 2) {
        created = await createTxV2();
      } else {
        created = await createTxV1();
      }
      consoleOut('created:', created, 'blue');
      if (created && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('sign:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            startFetchTxSignatureInfo(signature, "finalized", OperationType.TreasuryAddFunds);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            onAddFundsTransactionFinished();
            setOngoingOperation(undefined);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  // Close treasury modal
  const [isCloseTreasuryModalVisible, setIsCloseTreasuryModalVisibility] = useState(false);
  const showCloseTreasuryModal = useCallback(() => {
    resetTransactionStatus();
    if (treasuryDetails) {
      const v2 = treasuryDetails as Treasury;
      if (v2.version && v2.version >= 2) {
        getTransactionFeesV2(MSP_ACTIONS_V2.closeTreasury).then(value => {
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
    treasuryDetails,
    getTransactionFees,
    getTransactionFeesV2,
    resetTransactionStatus
  ]);

  const hideCloseTreasuryModal = useCallback(() => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    setIsCloseTreasuryModalVisibility(false);
  }, [isBusy]);

  const onAcceptCloseTreasury = () => {
    onExecuteCloseTreasuryTransaction();
  };

  const onCloseTreasuryTransactionFinished = () => {
    hideCloseTreasuryModal();
    refreshTokenBalance();
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  };

  const onExecuteCloseTreasuryTransaction = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.TreasuryClose);
    setIsBusy(true);

    const createTxV1 = async (): Promise<boolean> => {
      if (publicKey && treasuryDetails) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const treasury = new PublicKey(treasuryDetails.id as string);
        const data = {
          treasurer: publicKey.toBase58(),                      // treasurer
          treasury: treasury.toBase58()                         // treasury
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
        consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');
        if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${
              getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getTokenAmountAndSymbolByTokenAddress(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
            })`
          });
          customLogger.logWarning('Close Treasury transaction failed', { transcript: transactionLog });
          return false;
        }

        consoleOut('Starting Close Treasury using MSP V1...', '', 'blue');
        // Create a transaction
        return await ms.closeTreasury(
          publicKey,                                  // treasurer
          treasury,                                   // treasury
        )
        .then(value => {
          consoleOut('closeTreasury returned transaction:', value);
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
          console.error('closeTreasury error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Close Treasury transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Close Treasury transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const closeTreasury = async (data: any) => {

      if (!msp) { return null; }

      if (!isMultisigTreasury()) {
        return await msp.closeTreasury(
          new PublicKey(data.treasurer),              // treasurer
          new PublicKey(data.treasurer),              // treasurer
          new PublicKey(data.treasury),               // treasury
        );
      }

      if (!treasuryDetails || !multisigClient || !multisigAccounts || !publicKey) { return null; }

      let treasury = treasuryDetails as Treasury;
      let multisig = multisigAccounts.filter(m => m.address.toBase58() === treasury.treasurer)[0];

      if (!multisig) { return null; }

      let closeTreasury = await msp.closeTreasury(
        publicKey,                                                // payer
        new PublicKey(multisig.owners[0].address),             // TODO: This should come from the UI             
        new PublicKey(data.treasury),                             // treasury
      );

      const ixData = Buffer.from(closeTreasury.instructions[0].data);
      const ixAccounts = closeTreasury.instructions[0].keys;
      const transaction = Keypair.generate();
      const txSize = 1000;
      const txSigners = [transaction];
      const createIx = await multisigClient.account.transaction.createInstruction(
        transaction,
        txSize
      );
      
      let tx = multisigClient.transaction.createTransaction(
        MSPV2Constants.MSP, 
        OperationType.TreasuryClose,
        ixAccounts as any,
        ixData as any,
        {
          accounts: {
            multisig: multisig.id,
            transaction: transaction.publicKey,
            proposer: publicKey as PublicKey,
          },
          preInstructions: [createIx],
          signers: txSigners,
        }
      );

      tx.feePayer = publicKey;
      let { blockhash } = await connection.getRecentBlockhash("finalized");
      tx.recentBlockhash = blockhash;
      tx.partialSign(...txSigners);

      return tx;
    }

    const createTxV2 = async (): Promise<boolean> => {
      if (!publicKey || !treasuryDetails || !msp) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Close Treasury transaction failed', { transcript: transactionLog });
        return false;
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      const treasury = new PublicKey(treasuryDetails.id as string);
      const data = {
        treasurer: publicKey.toBase58(),                      // treasurer
        treasury: treasury.toBase58()                         // treasury
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
      consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');
      if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${
            getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
          }) to pay for network fees (${
            getTokenAmountAndSymbolByTokenAddress(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
          })`
        });
        customLogger.logWarning('Close Treasury transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut('Starting Close Treasury using MSP V2...', '', 'blue');
      // Create a transaction
      let result = closeTreasury(data)
        .then(value => {
          if (!value) { return false; }
          consoleOut('closeTreasury returned transaction:', value);
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
          console.error('closeTreasury error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Close Treasury transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Close Treasury transaction failed', { transcript: transactionLog });
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
          console.error('Signing transaction failed!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('Close Treasury transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Close Treasury transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Close Treasury transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Close Treasury transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet && treasuryDetails) {
      let created: boolean;
      if ((treasuryDetails as Treasury).version && (treasuryDetails as Treasury).version >= 2) {
        created = await createTxV2();
      } else {
        created = await createTxV1();
      }
      consoleOut('created:', created, 'blue');
      if (created && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('sign:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            startFetchTxSignatureInfo(signature, "finalized", OperationType.TreasuryClose);
            setIsBusy(false);
            onCloseTreasuryTransactionFinished();
            setOngoingOperation(undefined);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  // Close stream modal
  const [isCloseStreamModalVisible, setIsCloseStreamModalVisibility] = useState(false);
  const showCloseStreamModal = useCallback(() => {
    resetTransactionStatus();
    if (treasuryDetails) {
      const v2 = treasuryDetails as Treasury;
      if (v2.version && v2.version >= 2) {
        getTransactionFeesV2(MSP_ACTIONS_V2.closeStream).then(value => {
          setTransactionFees(value);
          consoleOut('transactionFees:', value, 'orange');
        });
      } else {
        getTransactionFees(MSP_ACTIONS.closeStream).then(value => {
          setTransactionFees(value);
          consoleOut('transactionFees:', value, 'orange');
        });
      }
      setIsCloseStreamModalVisibility(true);
    }
  }, [
    treasuryDetails,
    getTransactionFees,
    getTransactionFeesV2,
    resetTransactionStatus
  ]);
  const hideCloseStreamModal = useCallback(() => setIsCloseStreamModalVisibility(false), []);
  const onAcceptCloseStream = (closeTreasury: boolean) => {
    hideCloseStreamModal();
    onExecuteCloseStreamTransaction(closeTreasury);
  };

  // Close stream Transaction execution modal
  const [isCloseStreamTransactionModalVisible, setCloseStreamTransactionModalVisibility] = useState(false);
  const showCloseStreamTransactionModal = useCallback(() => setCloseStreamTransactionModalVisibility(true), []);
  const hideCloseStreamTransactionModal = useCallback(() => setCloseStreamTransactionModalVisibility(false), []);

  const onCloseStreamTransactionFinished = () => {
    resetTransactionStatus();
    hideCloseStreamTransactionModal();
    refreshTokenBalance();
  };

  const onAfterCloseStreamTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      hideCloseStreamTransactionModal();
    }
    resetTransactionStatus();
  }

  const onExecuteCloseStreamTransaction = async (closeTreasury: boolean) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.StreamClose);
    setRetryOperationPayload(closeTreasury);
    setIsBusy(true);

    const createTxV1 = async (): Promise<boolean> => {
      if (wallet && highlightedStream) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });
        const streamPublicKey = new PublicKey(highlightedStream.id as string);

        const data = {
          stream: streamPublicKey.toBase58(),                     // stream
          initializer: wallet.publicKey.toBase58(),               // initializer
          closeTreasury                                           // closeTreasury
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
        consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');
        if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${
              getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getTokenAmountAndSymbolByTokenAddress(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
            })`
          });
          customLogger.logWarning('Close stream transaction failed', { transcript: transactionLog });
          return false;
        }

        consoleOut('Starting Close Stream using MSP V1...', '', 'blue');
        // Create a transaction
        return await ms.closeStream(
          publicKey as PublicKey,                           // Initializer public key
          streamPublicKey,                                  // Stream ID
          closeTreasury                                     // closeTreasury
        )
        .then(value => {
          consoleOut('closeStream returned transaction:', value);
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
          console.error('closeStream error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const closeStream = async (data: any) => {

      if (!msp) { return null; }

      if (!isMultisigTreasury()) {        
        return await msp.closeStream(
          new PublicKey(data.payer),             // payer
          new PublicKey(data.payer),             // destination
          new PublicKey(data.stream),            // stream,
          data.closeTreasury                     // closeTreasury
        );
      }

      if (!treasuryDetails || !multisigClient || !multisigAccounts || !publicKey) { return null; }

      let treasury = treasuryDetails as Treasury;
      let multisig = multisigAccounts.filter(m => m.address.toBase58() === treasury.treasurer)[0];

      if (!multisig) { return null; }

      let closeStream = await msp.closeStream(
        new PublicKey(data.payer),             // payer
        new PublicKey(data.payer),             // TODO: This should come from the UI 
        new PublicKey(data.stream),            // stream,
        data.closeTreasury                     // closeTreasury
      );

      const ixData = Buffer.from(closeStream.instructions[0].data);
      const ixAccounts = closeStream.instructions[0].keys;
      const transaction = Keypair.generate();
      const txSize = 1000;
      const txSigners = [transaction];
      const createIx = await multisigClient.account.transaction.createInstruction(
        transaction,
        txSize
      );
      
      let tx = multisigClient.transaction.createTransaction(
        MSPV2Constants.MSP, 
        OperationType.StreamClose,
        ixAccounts as any,
        ixData as any,
        {
          accounts: {
            multisig: multisig.id,
            transaction: transaction.publicKey,
            proposer: publicKey as PublicKey,
          },
          preInstructions: [createIx],
          signers: txSigners,
        }
      );

      tx.feePayer = publicKey;
      let { blockhash } = await connection.getRecentBlockhash("finalized");
      tx.recentBlockhash = blockhash;
      tx.partialSign(...txSigners);

      return tx;
    }

    const createTxV2 = async (): Promise<boolean> => {
      if (!publicKey || !highlightedStream || !msp) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
        return false;
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });
      const streamPublicKey = new PublicKey(highlightedStream.id as string);

      const data = {
        stream: streamPublicKey.toBase58(),                     // stream
        payer: publicKey.toBase58(),                      // initializer
        closeTreasury                                           // closeTreasury
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
      consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${
            getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
          }) to pay for network fees (${
            getTokenAmountAndSymbolByTokenAddress(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
          })`
        });
        customLogger.logWarning('Close stream transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut('Starting Close Stream using MSP V2...', '', 'blue');
      // Create a transaction
      let result = await closeStream(data)
        .then(value => {
          if (!value) { return false; }
          consoleOut('closeStream returned transaction:', value);
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
          console.error('closeStream error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet && highlightedStream) {
      showCloseStreamTransactionModal();
      let created: boolean;
      if (highlightedStream.version < 2) {
        created = await createTxV1();
      } else {
        created = await createTxV2();
      }
      consoleOut('created:', created, 'blue');
      if (created && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('sign:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            startFetchTxSignatureInfo(signature, "finalized", OperationType.StreamClose);
            setIsBusy(false);
            onCloseStreamTransactionFinished();
            setOngoingOperation(undefined);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  // Pause stream modal
  const [isPauseStreamModalVisible, setIsPauseStreamModalVisibility] = useState(false);
  const showPauseStreamModal = useCallback(() => {
    resetTransactionStatus();
    if (treasuryDetails) {
      const v2 = treasuryDetails as Treasury;
      if (v2.version && v2.version >= 2) {
        getTransactionFeesV2(MSP_ACTIONS_V2.pauseStream).then(value => {
          setTransactionFees(value);
          consoleOut('transactionFees:', value, 'orange');
        });
      } else {
        getTransactionFees(MSP_ACTIONS.pauseStream).then(value => {
          setTransactionFees(value);
          consoleOut('transactionFees:', value, 'orange');
        });
      }
      setIsPauseStreamModalVisibility(true);
    }
  }, [
    treasuryDetails,
    getTransactionFees,
    getTransactionFeesV2,
    resetTransactionStatus
  ]);

  const hidePauseStreamModal = useCallback(() => setIsPauseStreamModalVisibility(false), []);
  const onAcceptPauseStream = () => {
    hidePauseStreamModal();
    onExecutePauseStreamTransaction();
  };

  const onPauseStreamTransactionFinished = () => {
    resetTransactionStatus();
    hideCloseStreamTransactionModal();
    refreshTokenBalance();
  };

  const onExecutePauseStreamTransaction = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.StreamPause);
    setIsBusy(true);

    const createTxV1 = async (): Promise<boolean> => {
      if (wallet && highlightedStream) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });
        const streamPublicKey = new PublicKey(highlightedStream.id as string);

        const data = {
          stream: streamPublicKey.toBase58(),                     // stream
          initializer: wallet.publicKey.toBase58(),               // initializer
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
        consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');
        if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${
              getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getTokenAmountAndSymbolByTokenAddress(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
            })`
          });
          customLogger.logWarning('Pause stream transaction failed', { transcript: transactionLog });
          return false;
        }

        consoleOut('Starting Stream Pause using MSP V1...', '', 'blue');
        // Create a transaction
        return await ms.pauseStream(
          publicKey as PublicKey,                           // Initializer public key
          streamPublicKey,                                  // Stream ID
        )
        .then(value => {
          consoleOut('pauseStream returned transaction:', value);
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
          console.error('pauseStream error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const pauseStream = async (data: any) => {

      if (!msp) { return null; }

      if (!isMultisigTreasury()) {
        return await msp.pauseStream(
          new PublicKey(data.payer),             // payer,
          new PublicKey(data.payer),             // treasurer,
          new PublicKey(data.stream),            // stream,
        );
      }

      if (!treasuryDetails || !multisigClient || !multisigAccounts || !publicKey) { return null; }

      let treasury = treasuryDetails as Treasury;
      let multisig = multisigAccounts.filter(m => m.address.toBase58() === treasury.treasurer)[0];

      if (!multisig) { return null; }

      let pauseStream = await msp.pauseStream(
        new PublicKey(data.payer),                   // payer
        multisig.address,                            // treasurer
        new PublicKey(data.stream),                  // stream,
      );

      const ixData = Buffer.from(pauseStream.instructions[0].data);
      const ixAccounts = pauseStream.instructions[0].keys;
      const transaction = Keypair.generate();
      const txSize = 1000;
      const txSigners = [transaction];
      const createIx = await multisigClient.account.transaction.createInstruction(
        transaction,
        txSize
      );
      
      let tx = multisigClient.transaction.createTransaction(
        MSPV2Constants.MSP, 
        OperationType.StreamPause,
        ixAccounts as any,
        ixData as any,
        {
          accounts: {
            multisig: multisig.id,
            transaction: transaction.publicKey,
            proposer: publicKey as PublicKey,
          },
          preInstructions: [createIx],
          signers: txSigners,
        }
      );

      tx.feePayer = publicKey;
      let { blockhash } = await connection.getRecentBlockhash("finalized");
      tx.recentBlockhash = blockhash;
      tx.partialSign(...txSigners);

      return tx;
    }

    const createTxV2 = async (): Promise<boolean> => {
      if (!publicKey || !highlightedStream || !msp) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
        return false;
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });
      const streamPublicKey = new PublicKey(highlightedStream.id as string);

      const data = {
        stream: streamPublicKey.toBase58(),               // stream
        payer: publicKey.toBase58(),                      // payer
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
      consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');
      if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${
            getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
          }) to pay for network fees (${
            getTokenAmountAndSymbolByTokenAddress(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
          })`
        });
        customLogger.logWarning('Pause stream transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut('Starting Stream Pause using MSP V2...', '', 'blue');
      // Create a transaction
      let result = await pauseStream(data)
        .then(value => {
          if (!value) { return false; }
          consoleOut('pauseStream returned transaction:', value);
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
          console.error('pauseStream error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
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
          console.error('Signing transaction failed!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('Pause stream transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      const encodedTx = signedTransaction.serialize().toString('base64');
      consoleOut('encodedTx:', encodedTx, 'orange');
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
            customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet && highlightedStream) {
      showCloseStreamTransactionModal();
      let created: boolean;
      if (highlightedStream.version < 2) {
        created = await createTxV1();
      } else {
        created = await createTxV2();
      }
      consoleOut('created:', created, 'blue');
      if (created && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('sign:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            startFetchTxSignatureInfo(signature, "finalized", OperationType.StreamPause);
            setIsBusy(false);
            onCloseStreamTransactionFinished();
            setOngoingOperation(undefined);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  // Resume stream modal
  const [isResumeStreamModalVisible, setIsResumeStreamModalVisibility] = useState(false);
  const showResumeStreamModal = useCallback(() => {
    resetTransactionStatus();
    if (treasuryDetails) {
      const v2 = treasuryDetails as Treasury;
      if (v2.version && v2.version >= 2) {
        getTransactionFeesV2(MSP_ACTIONS_V2.resumeStream).then(value => {
          setTransactionFees(value);
          consoleOut('transactionFees:', value, 'orange');
        });
      } else {
        getTransactionFees(MSP_ACTIONS.resumeStream).then(value => {
          setTransactionFees(value);
          consoleOut('transactionFees:', value, 'orange');
        });
      }
      setIsResumeStreamModalVisibility(true);
    }
  }, [
    treasuryDetails,
    getTransactionFees,
    getTransactionFeesV2,
    resetTransactionStatus
  ]);

  const hideResumeStreamModal = useCallback(() => setIsResumeStreamModalVisibility(false), []);
  const onAcceptResumeStream = () => {
    hideResumeStreamModal();
    onExecuteResumeStreamTransaction();
  };

  const onResumeStreamTransactionFinished = () => {
    resetTransactionStatus();
    hideCloseStreamTransactionModal();
    refreshTokenBalance();
  };

  const onExecuteResumeStreamTransaction = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.StreamResume);
    setIsBusy(true);

    const createTxV1 = async (): Promise<boolean> => {
      if (wallet && highlightedStream) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });
        const streamPublicKey = new PublicKey(highlightedStream.id as string);

        const data = {
          stream: streamPublicKey.toBase58(),                     // stream
          initializer: wallet.publicKey.toBase58(),               // initializer
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
        consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');
        if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${
              getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getTokenAmountAndSymbolByTokenAddress(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
            })`
          });
          customLogger.logWarning('Resume stream transaction failed', { transcript: transactionLog });
          return false;
        }

        consoleOut('Starting Stream Resume using MSP V1...', '', 'blue');
        // Create a transaction
        return await ms.resumeStream(
          publicKey as PublicKey,                           // Initializer public key
          streamPublicKey,                                  // Stream ID
        )
        .then(value => {
          consoleOut('resumeStream returned transaction:', value);
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
          console.error('resumeStream error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Resume stream transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Resume stream transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const resumeStream = async (data: any) => {

      if (!msp) { return null; }

      if (!isMultisigTreasury()) {
        return await msp.resumeStream(
          new PublicKey(data.payer),             // payer,
          new PublicKey(data.payer),             // treasurer,
          new PublicKey(data.stream),            // stream,
        );
      }

      if (!treasuryDetails || !multisigClient || !multisigAccounts || !publicKey) { return null; }

      let treasury = treasuryDetails as Treasury;
      let multisig = multisigAccounts.filter(m => m.address.toBase58() === treasury.treasurer)[0];

      if (!multisig) { return null; }

      let resumeStream = await msp.resumeStream(
        new PublicKey(data.payer),                   // payer
        multisig.address,                            // treasurer
        new PublicKey(data.stream),                  // stream,
      );

      const ixData = Buffer.from(resumeStream.instructions[0].data);
      const ixAccounts = resumeStream.instructions[0].keys;
      const transaction = Keypair.generate();
      const txSize = 1000;
      const txSigners = [transaction];
      const createIx = await multisigClient.account.transaction.createInstruction(
        transaction,
        txSize
      );
      
      let tx = multisigClient.transaction.createTransaction(
        MSPV2Constants.MSP, 
        OperationType.StreamResume,
        ixAccounts as any,
        ixData as any,
        {
          accounts: {
            multisig: multisig.id,
            transaction: transaction.publicKey,
            proposer: publicKey as PublicKey,
          },
          preInstructions: [createIx],
          signers: txSigners,
        }
      );

      tx.feePayer = publicKey;
      let { blockhash } = await connection.getRecentBlockhash("finalized");
      tx.recentBlockhash = blockhash;
      tx.partialSign(...txSigners);

      return tx;
    }

    const createTxV2 = async (): Promise<boolean> => {
      if (!publicKey || !highlightedStream || !msp) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Resume stream transaction failed', { transcript: transactionLog });
        return false;
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      const streamPublicKey = new PublicKey(highlightedStream.id as string);
      const data = {
        stream: streamPublicKey.toBase58(),               // stream
        payer: publicKey.toBase58(),                      // payer
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
      consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');
      if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${
            getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
          }) to pay for network fees (${
            getTokenAmountAndSymbolByTokenAddress(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
          })`
        });
        customLogger.logWarning('Resume stream transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut('Starting Stream Resume using MSP V2...', '', 'blue');
      // Create a transaction
      let result = await resumeStream(data)
        .then(value => {
          if (!value) { return false; }
          consoleOut('resumeStream returned transaction:', value);
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
          console.error('resumeStream error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Resume stream transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Resume stream transaction failed', { transcript: transactionLog });
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
          console.error('Signing transaction failed!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('Resume stream transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Resume stream transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Resume stream transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Resume stream transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet && highlightedStream) {
      showCloseStreamTransactionModal();
      let created: boolean;
      if (highlightedStream.version < 2) {
        created = await createTxV1();
      } else {
        created = await createTxV2();
      }
      consoleOut('created:', created, 'blue');
      if (created && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('sign:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            startFetchTxSignatureInfo(signature, "finalized", OperationType.StreamResume);
            setIsBusy(false);
            onResumeStreamTransactionFinished();
            setOngoingOperation(undefined);
          } else { setIsBusy(false); }
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
    setIsCreateStreamModalVisibility(true);
    getTransactionFeesV2(MSP_ACTIONS_V2.createStream).then(value => {
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
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }, [setTransactionStatus]);

  const onAcceptCreateStream = () => {
    closeCreateStreamModal();
    resetContractValues();
    refreshTokenBalance();
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  };

  ///////////////
  // Rendering //
  ///////////////

  const renderStreamOptions = (item: Stream | StreamInfo) => {
    const streamV2 = item as Stream;
    const treasuryV2 = treasuryDetails as Treasury;
    const isNewTreasury = treasuryV2.version && treasuryV2.version >= 2 ? true : false;

    const menu = (
      <Menu>
        {(isNewTreasury && treasuryV2.treasuryType === TreasuryType.Open) && (
          <>
            {streamV2.status === STREAM_STATUS.Paused
              ? (
                <>
                  {streamV2.fundsLeftInStream > 0 && (
                    <Menu.Item key="1" onClick={showResumeStreamModal}>
                      <span className="menu-item-text">{t('treasuries.treasury-streams.option-resume-stream')}</span>
                    </Menu.Item>
                  )}
                </>
              ) : streamV2.status === STREAM_STATUS.Running ? (
                <Menu.Item key="2" onClick={showPauseStreamModal}>
                  <span className="menu-item-text">{t('treasuries.treasury-streams.option-pause-stream')}</span>
                </Menu.Item>
              ) : null
            }
            <Menu.Item key="3" onClick={showAddFundsModal}>
              <span className="menu-item-text">{t('streams.stream-detail.add-funds-cta')}</span>
            </Menu.Item>
          </>
        )}
        {(!isNewTreasury ||
          (isNewTreasury && treasuryV2.treasuryType === TreasuryType.Open) ||
          (isNewTreasury && treasuryV2.treasuryType === TreasuryType.Lock && streamV2.status === STREAM_STATUS.Paused)) && (
          <Menu.Item key="4" onClick={showCloseStreamModal}>
            <span className="menu-item-text">{t('treasuries.treasury-streams.option-close-stream')}</span>
          </Menu.Item>
        )}
        <Menu.Item key="5" onClick={() => onCopyStreamAddress(item.id)}>
          <span className="menu-item-text">Copy Stream ID</span>
        </Menu.Item>
        <Menu.Item key="6" onClick={() => {
            setHighLightableStreamId(item.id as string);
            refreshStreamList();
            navigate('/accounts/streams');
          }}>
          <span className="menu-item-text">Show stream</span>
        </Menu.Item>
        <Menu.Item key="7" onClick={() => {}}>
          <a href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${item.id}${getSolanaExplorerClusterParam()}`}
              target="_blank" rel="noopener noreferrer">
            <span className="menu-item-text">{t('treasuries.treasury-streams.option-explorer-link')}</span>
          </a>
        </Menu.Item>
      </Menu>
    );

    return (
      <Dropdown overlay={menu} trigger={["click"]} onVisibleChange={(visibleChange) => {
        if (visibleChange) {
          sethHighlightedStream(item);
          setHighLightableStreamId(item.id as string);
        } else {
          sethHighlightedStream(undefined);
        }
      }}>
        <span className="icon-container"><EllipsisOutlined /></span>
      </Dropdown>
    );
  }

  const renderTreasuryStreams = () => {
    if (!treasuryDetails) {
      return null;
    } else if (treasuryDetails && loadingTreasuryStreams) {
      return (
        <div className="mb-2">{t('treasuries.treasury-streams.loading-streams')}</div>
      );
    } else if (treasuryDetails && !loadingTreasuryStreams && treasuryStreams.length === 0) {
      return (
        <div className="mb-2">{t('treasuries.treasury-streams.no-streams')}</div>
      );
    }

    return (
      <>
        <div className="item-list-header compact">
          <div className="header-row">
            <div className="std-table-cell first-cell">&nbsp;</div>
            <div className="std-table-cell responsive-cell">{t('treasuries.treasury-streams.column-activity')}</div>
            <div className="std-table-cell fixed-width-90">{t('treasuries.treasury-streams.column-destination')}</div>
            <div className="std-table-cell fixed-width-130">{t('treasuries.treasury-streams.column-rate')}</div>
            <div className="std-table-cell fixed-width-72 text-right pr-1">{t('treasuries.treasury-streams.column-funds-left')}</div>
            <div className="std-table-cell last-cell">&nbsp;</div>
          </div>
        </div>
        <div className="item-list-body compact">
          {treasuryStreams.map((item, index) => {
            const status = getStreamStatus(item);
            return (
              <div className={`item-list-row ${highlightedStream && highlightedStream.id === item.id ? 'selected' : ''}`} key={item.id as string}>
                <div className="std-table-cell first-cell">{getStreamIcon(item)}</div>
                <div className="std-table-cell responsive-cell">
                  {status && (<span className="badge darken small text-uppercase mr-1">{status}</span>)}
                  <span className="align-middle">{getStreamDescription(item)}</span>
                </div>
                <div className="std-table-cell fixed-width-90">
                  <span className="align-middle">{shortenAddress(item.version < 2 ? (item as StreamInfo).beneficiaryAddress as string : (item as Stream).beneficiary as string)}</span>
                </div>
                <div className="std-table-cell fixed-width-130">
                  <span className="align-middle">
                    {item.rateAmount > 0 ? getRateAmountDisplay(item) : getDepositAmountDisplay(item)}
                    {item && item.rateAmount > 0 && (
                      <span>{getIntervalFromSeconds(item.rateIntervalInSeconds, true, t)}</span>
                    )}
                  </span>
                </div>
                <div className="std-table-cell fixed-width-72 text-right pr-1">
                  <span className="align-middle">{getDepletionLabel(item)}</span>
                </div>
                <div className="std-table-cell last-cell">
                  <span className={`icon-button-container ${isClosingTreasury() && highlightedStream ? 'click-disabled' : ''}`}>
                    {renderStreamOptions(item)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  // TODO: Bind the amount of pending Txs for this treasury
  const renderMultisigTxReminder = useCallback(() => {
    const v2 = treasuryDetails as Treasury;
    const isNewTreasury = v2.version >= 2 ? true : false;
    const multisig = v2 && isNewTreasury && multisigAccounts
      ? multisigAccounts.find(m => m.address.toBase58() === v2.treasurer)
      : undefined;
    return (
      <div key="streams" className="transaction-list-row no-pointer mb-2">
        <div className="icon-cell">
          <div className="token-icon">
            <div className="streams-count">
              <span className="font-bold text-shadow">
                {treasuryPendingTxs}
              </span>
            </div>
          </div>
        </div>
        <div className="description-cell">
          <div className="font-bold simplelink underline-on-hover" onClick={() => {
            if (selectedMultisig) {
              consoleOut('Navigating to multisig:', selectedMultisig.address.toBase58(), 'blue');
              setHighLightableMultisigId(selectedMultisig.address.toBase58());
            } else if (multisig) {
              consoleOut('Navigating to multisig:', multisig.address.toBase58(), 'blue');
              setHighLightableMultisigId(multisig.address.toBase58());
            }
            navigate('/multisig');
          }}>{t('treasuries.treasury-detail.multisig-tx-headsup')}</div>
        </div>
      </div>
    );
  }, [
    treasuryDetails,
    multisigAccounts,
    selectedMultisig,
    treasuryPendingTxs,
    setHighLightableMultisigId,
    navigate,
    t,
  ]);

  const renderTreasuryMeta = () => {
    const v1 = treasuryDetails as TreasuryInfo;
    const v2 = treasuryDetails as Treasury;
    const isNewTreasury = v2.version && v2.version >= 2 ? true : false;
    const token = isNewTreasury
      ? v2.associatedToken
        ? getTokenByMintAddress(v2.associatedToken as string)
        : undefined
      : v1.associatedTokenAddress
        ? getTokenByMintAddress(v1.associatedTokenAddress as string)
        : undefined;
    const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
      event.currentTarget.src = FALLBACK_COIN_IMAGE;
      event.currentTarget.className = "error";
    };
    return (
      <>
      {treasuryDetails && (
        <div className="stream-fields-container">

          <div className="mb-3">
            <Row>
              <Col span={12}>
                <div className="info-label text-truncate">
                  {t('treasuries.treasury-detail.number-of-streams')}
                </div>
                <div className="transaction-detail-row">
                  <span className="info-icon">
                    <IconSort className="mean-svg-icons" />
                  </span>
                  <span className="info-data flex-row wrap align-items-center">
                    <span className="mr-1">{formatThousands(isNewTreasury ? v2.totalStreams : v1.streamsAmount)}</span>
                    {(v1.streamsAmount > 0 || v2.totalStreams > 0) && (
                      <>
                        {streamStats && streamStats.total > 0 && (
                          <>
                          {streamStats.scheduled > 0 && (
                            <div className="badge mr-1 medium font-bold info">{formatThousands(streamStats.scheduled)} {t('treasuries.treasury-streams.status-scheduled')}</div>
                          )}
                          {streamStats.running > 0 && (
                            <div className="badge mr-1 medium font-bold success">{formatThousands(streamStats.running)} {t('treasuries.treasury-streams.status-running')}</div>
                          )}
                          {streamStats.stopped > 0 && (
                            <div className="badge medium font-bold error">{formatThousands(streamStats.stopped)} {t('treasuries.treasury-streams.status-stopped')}</div>
                          )}
                          </>
                        )}
                      </>
                    )}
                  </span>
                </div>
              </Col>
              <Col span={12}>
                <div className="info-label text-truncate">
                  {t('treasuries.treasury-detail.funds-added-to-treasury')}
                </div>
                <div className="transaction-detail-row">
                  <span className="info-icon">
                    <IconBank className="mean-svg-icons" />
                  </span>
                  <span className="info-data">
                    {
                      getAmountWithSymbol(
                        isNewTreasury
                          ? toUiAmount(new BN(v2.balance), token ? token.decimals : 6)
                          : v1.balance,
                        token ? token.address : isNewTreasury
                          ? v2.associatedToken  as string
                          : v1.associatedTokenAddress as string
                      )
                    }
                  </span>
                </div>
              </Col>
            </Row>
          </div>

          <div className="mb-3">
            <Row>
              {token && (
                <Col span={treasuryDetails.createdOnUtc ? 12 : 24}>
                  <div className="info-label">
                    {t('treasuries.treasury-detail.associated-token')}
                  </div>
                  <div className="transaction-detail-row">
                    <span className="info-icon token-icon">
                      {token && token.logoURI ? (
                        <img alt={`${token.name}`} width={24} height={24} src={token.logoURI} onError={imageOnErrorHandler} />
                      ) : (
                        <Identicon address={(isNewTreasury ? v2.associatedToken : v1.associatedTokenAddress)} style={{ width: "24", display: "inline-flex" }} />
                      )}
                    </span>
                    <span className="info-data text-truncate">
                      {token && token.symbol ? `${token.symbol} (${token.name})` : shortenAddress(isNewTreasury ? v2.associatedToken as string : v1.associatedTokenAddress as string)}
                    </span>
                  </div>
                </Col>
              )}
              {treasuryDetails.createdOnUtc && (
                <Col span={token ? 12 : 24}>
                  <div className="info-label">
                    {t('treasuries.treasury-detail.created-on')}
                  </div>
                  <div className="transaction-detail-row">
                    <span className="info-icon">
                      <IconClock className="mean-svg-icons" />
                    </span>
                    <span className="info-data">
                      {dateFormat(treasuryDetails.createdOnUtc, VERBOSE_DATE_TIME_FORMAT)}
                    </span>
                  </div>
                </Col>
              )}
            </Row>
          </div>

        </div>
      )}
      </>
    );
  };

  const renderCtaRow = () => {
    if (!treasuryDetails) { return null; }
    const v2 = treasuryDetails as Treasury;
    const isNewTreasury = v2.version && v2.version >= 2 ? true : false;
    return (
      <>
        <Space size="middle">
          {isNewTreasury ? (
            <>
              {
                <Button
                  type="default"
                  shape="round"
                  size="small"
                  className="thin-stroke"
                  disabled={isTxInProgress() || loadingTreasuries}
                  onClick={() => {
                    setHighLightableStreamId(undefined);
                    sethHighlightedStream(undefined);
                    showAddFundsModal();
                  }}>
                  {isAddingFunds() && (<LoadingOutlined />)}
                  {isAddingFunds()
                    ? t('treasuries.treasury-detail.cta-add-funds-busy')
                    : t('treasuries.treasury-detail.cta-add-funds')}
                </Button>
              }

              {isMultisigAvailable() && (
                <Button
                  type="default"
                  shape="round"
                  size="small"
                  className="thin-stroke"
                  disabled={isTxInProgress() || loadingMultisigAccounts || isAnythingLoading()}
                  onClick={() => {}}>
                  {t('treasuries.treasury-detail.cta-withdraw-multisig-treasury')}
                </Button>
              )}

              <Button
                type="default"
                shape="round"
                size="small"
                className="thin-stroke"
                disabled={
                  isTxInProgress() ||
                  loadingTreasuries ||
                  loadingTreasuryDetails ||
                  (!treasuryDetails || !isNewTreasury || v2.balance - v2.allocationAssigned <= 0)
                }
                onClick={showCreateStreamModal}>
                {isCreatingStream() && (<LoadingOutlined />)}
                {isCreatingStream()
                  ? t('treasuries.treasury-streams.create-stream-main-cta-busy')
                  : t('treasuries.treasury-streams.create-stream-main-cta')}
              </Button>
            </>
          ) : (
            <div className="flex-row align-items">
              <span className="simplelink underline-on-hover">Start V2 Migration</span>
              <InfoIcon content={<p>There is a new and improved version of the Treasuries feature. To continue using this treasury you must update it first.</p>} placement="leftBottom">
                <InfoCircleOutlined />
              </InfoIcon>
            </div>
          )}
          {isClosingTreasury() ? (
            <div className="flex-row flex-center">
              <LoadingOutlined />
              <span className="ml-1">{t('treasuries.treasury-detail.cta-close-busy')}</span>
            </div>
          ) : isRefreshingTreasuryBalance() ? (
            <div className="flex-row flex-center">
              <LoadingOutlined />
              <span className="ml-1">Refresing treasury balance</span>
            </div>
          ) : isClosingStream() ? (
            <div className="flex-row flex-center">
              <LoadingOutlined />
              <span className="ml-1">{t('streams.stream-detail.cta-disabled-closing')}</span>
            </div>
          ) : isPausingStream() ? (
            <div className="flex-row flex-center">
              <LoadingOutlined />
              <span className="ml-1">{t('treasuries.treasury-streams.busy-pausing')}</span>
            </div>
          ) : isResumingStream() ? (
            <div className="flex-row flex-center">
              <LoadingOutlined />
              <span className="ml-1">{t('treasuries.treasury-streams.busy-resuming')}</span>
            </div>
          ) : null}
        </Space>
      </>
    );
  };

  const renderTreasuryList = (
    <>
    {isMultisigAvailable() && selectedMultisig && (
      <div className="left-panel-inner-heading">
        <div className="font-bold">Multsig Treasuries - [{selectedMultisig.label}]</div>
        <div>Below is a list of all the treasuries that are connected to this Multsig</div>
      </div>
    )}
    {treasuryList && treasuryList.length > 0 ? (
      treasuryList.map((item, index) => {
        const v1 = item as TreasuryInfo;
        const v2 = item as Treasury;
        const isNewTreasury = v2.version && v2.version >= 2 ? true : false;
        const token = isNewTreasury
          ? v2.associatedToken
            ? getTokenByMintAddress(v2.associatedToken as string)
            : undefined
          : v1.associatedTokenAddress
            ? getTokenByMintAddress(v1.associatedTokenAddress as string)
            : undefined;
        const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
          event.currentTarget.src = FALLBACK_COIN_IMAGE;
          event.currentTarget.className = "error";
        };
        const onTreasuryClick = () => {
          consoleOut('selected treasury:', item, 'blue');
          setTreasuryDetails(item);
          setTreasuryStreams([]);
          openTreasuryById(item.id as string, isNewTreasury);
          setDtailsPanelOpen(true);
        };
        return (
          <div key={`${index + 50}`} onClick={onTreasuryClick}
            className={`transaction-list-row ${treasuryDetails && treasuryDetails.id === item.id ? 'selected' : ''}`}>
            <div className="icon-cell">
              <div className="token-icon">
                {(isNewTreasury ? v2.associatedToken : v1.associatedTokenAddress) ? (
                  <>
                    {token ? (
                      <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} onError={imageOnErrorHandler} />
                    ) : (
                      <Identicon address={(isNewTreasury ? v2.associatedToken : v1.associatedTokenAddress)} style={{ width: "30", display: "inline-flex" }} />
                    )}
                  </>
                ) : (
                  <Identicon address={item.id} style={{ width: "30", display: "inline-flex" }} />
                )}
              </div>
            </div>
            <div className="description-cell">
              {(isNewTreasury ? v2.name : v1.label) ? (
                <div className="title text-truncate">
                  {isNewTreasury ? v2.name : v1.label}
                  <span className={`badge small ml-1 ${theme === 'light' ? 'golden fg-dark' : 'darken'}`}>
                    {isNewTreasury
                      ? v2.treasuryType === TreasuryType.Open ? 'Open' : 'Locked'
                      : v1.type === TreasuryType.Open ? 'Open' : 'Locked'
                    }
                  </span>
                </div>
              ) : (
                <div className="title text-truncate">{shortenAddress(item.id as string, 8)}</div>
              )}
              {isMultisigTreasury(item) && (
                <div className="subtitle text-truncate">{t('treasuries.treasury-list.multisig-treasury-label')}</div>
              )}
            </div>
            <div className="rate-cell text-center">
              {!isNewTreasury && v1.upgradeRequired ? (
                <span>&nbsp;</span>
              ) : (
                <>
                <div className="rate-amount">
                  {formatThousands(isNewTreasury ? v2.totalStreams : v1.streamsAmount)}
                </div>
                <div className="interval">streams</div>
                </>
              )}
            </div>
          </div>
        );
      })
    ) : (
      <>
      {isCreatingTreasury() ? (
        <div className="h-100 flex-center">
          <Spin indicator={bigLoadingIcon} />
        </div>
      ) : (
        <div className={`flex-center ${isMultisigAvailable() ? 'h-50' : 'h-100'}`}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{connected
          ? t('treasuries.treasury-list.no-treasuries')
          : t('treasuries.treasury-list.not-connected')}</p>} />
        </div>
      )}
      </>
    )}
    {isMultisigAvailable() && (
      <div className="py-3 px-3 simplelink" onClick={() => resetTreasuriesContext()}>
        <IconShowAll className="mean-svg-icons align-middle" />
        <span className="ml-1 align-middle">Show All Treasuries</span>
      </div>
    )}
    </>
  );

  return (
    <>
      {isLocal() && (
        <div className="debug-bar">
          <span className="ml-1">loadingTreasuries:</span><span className="ml-1 font-bold fg-dark-active">{loadingTreasuries ? 'true' : 'false'}</span>
          <span className="ml-1">isBusy:</span><span className="ml-1 font-bold fg-dark-active">{isBusy ? 'true' : 'false'}</span>
          <span className="ml-1">retryOperationPayload:</span><span className="ml-1 font-bold fg-dark-active">{retryOperationPayload ? 'true' : 'false'}</span>
          <span className="ml-1">highLightableStreamId:</span><span className="ml-1 font-bold fg-dark-active">{highLightableStreamId || '-'}</span>
          {(transactionStatus.lastOperation !== undefined) && (
            <>
            <span className="ml-1">lastOperation:</span><span className="ml-1 font-bold fg-dark-active">{TransactionStatus[transactionStatus.lastOperation]}</span>
            </>
          )}
          {(transactionStatus.currentOperation !== undefined) && (
            <>
            <span className="ml-1">currentOperation:</span><span className="ml-1 font-bold fg-dark-active">{TransactionStatus[transactionStatus.currentOperation]}</span>
            </>
          )}
        </div>
      )}

      <div className="container main-container">

        <div className="interaction-area">

          <div className={`meanfi-two-panel-layout ${detailsPanelOpen ? 'details-open' : ''}`}>

            <div className="meanfi-two-panel-left">

              <div className="meanfi-panel-heading">
                {isMultisigAvailable() && (
                  <div className="back-button">
                    <span className="icon-button-container">
                      <Tooltip placement="bottom" title={t('multisig.multisig-vaults.back-to-multisig-accounts-cta')}>
                        <Button
                          type="default"
                          shape="circle"
                          size="middle"
                          icon={<ArrowLeftOutlined />}
                          onClick={() => {
                            if (selectedMultisig) {
                              setHighLightableMultisigId(selectedMultisig.address.toBase58());
                            }
                            navigate('/multisig');
                          }}
                        />
                      </Tooltip>
                    </span>
                  </div>
                )}
                <span className="title">{t('treasuries.screen-title')}</span>
                <Tooltip placement="bottom" title={t('treasuries.refresh-tooltip')}>
                  <div className={`transaction-stats user-address ${loadingTreasuries ? 'click-disabled' : 'simplelink'}`} onClick={onRefreshTreasuriesClick}>
                    <Spin size="small" />
                    {(!customStreamDocked && !loadingTreasuries) && (
                      <span className="incoming-transactions-amout">({formatThousands(treasuryList.length)})</span>
                    )}
                    <span className="transaction-legend">
                      <span className="icon-button-container">
                        <Button
                          type="default"
                          shape="circle"
                          size="small"
                          icon={<ReloadOutlined />}
                          onClick={() => {}}
                        />
                      </span>
                    </span>
                  </div>
                </Tooltip>
              </div>

              <div className="inner-container">
                <div className="item-block vertical-scroll">
                  <Spin spinning={loadingTreasuries}>
                    {renderTreasuryList}
                  </Spin>
                </div>
                <div className="bottom-ctas">
                  {customStreamDocked ? (
                    <div className="create-stream">
                      <Button
                        block
                        type="primary"
                        shape="round"
                        disabled={!connected}
                        onClick={onCancelCustomTreasuryClick}>
                        {t('treasuries.back-to-treasuries-cta')}
                      </Button>
                    </div>
                  ) : (
                    <div className="create-stream">
                      <Button
                        block
                        type="primary"
                        shape="round"
                        disabled={!connected}
                        onClick={onCreateTreasuryClick}>
                        {connected
                          ? t('treasuries.create-new-treasury-cta')
                          : t('transactions.validation.not-connected')
                        }
                      </Button>
                    </div>
                  )}
                  {(!customStreamDocked && connected) && (
                    <div className="open-stream">
                      <Tooltip title={t('treasuries.lookup-treasury-cta-tooltip')}>
                        <Button
                          shape="round"
                          type="text"
                          size="small"
                          className="ant-btn-shaded"
                          onClick={showOpenTreasuryModal}
                          icon={<SearchOutlined />}>
                        </Button>
                      </Tooltip>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="meanfi-two-panel-right">
              <div className="meanfi-panel-heading"><span className="title">{t('treasuries.treasury-detail-heading')}</span></div>

              <div className="inner-container">
                {connected ? (
                  <>
                    {treasuryDetails && (
                      <div className="float-top-right">
                        <span className="icon-button-container secondary-button">
                          <Tooltip placement="bottom" title={t("treasuries.treasury-refresh-tooltip")}>
                            <Button
                              type="default"
                              shape="circle"
                              size="middle"
                              icon={<IconRefresh className="mean-svg-icons" />}
                              onClick={() => onExecuteRefreshTreasuryBalance()}
                              disabled={
                                isTxInProgress() ||
                                !isTreasurer() ||
                                isAnythingLoading() ||
                                !isTreasuryFunded()
                              }
                            />
                          </Tooltip>
                          <Tooltip placement="bottom" title={t('treasuries.treasury-detail.cta-close')}>
                            <Button
                              type="default"
                              shape="circle"
                              size="middle"
                              icon={<IconTrash className="mean-svg-icons" />}
                              onClick={showCloseTreasuryModal}
                              disabled={
                                isTxInProgress() ||
                                (treasuryStreams && treasuryStreams.length > 0) ||
                                !isTreasurer() ||
                                isAnythingLoading() ||
                                !isTreasuryFunded()
                              }
                            />
                          </Tooltip>
                        </span>
                      </div>
                    )}
                    <div className={`stream-details-data-wrapper vertical-scroll ${(loadingTreasuries || loadingTreasuryDetails || !treasuryDetails) ? 'h-100 flex-center' : ''}`}>
                      <Spin spinning={loadingTreasuries || loadingTreasuryDetails}>
                        {treasuryDetails && (
                          <>
                            {isMultisigTreasury() && (
                              renderMultisigTxReminder()
                            )}
                            {renderTreasuryMeta()}
                            <Divider className="activity-divider" plain></Divider>
                            {(!treasuryDetails.autoClose || (treasuryDetails.autoClose && getTreasuryTotalStreams(treasuryDetails) > 0 )) && (
                              <>
                                {renderCtaRow()}
                                <Divider className="activity-divider" plain></Divider>
                              </>
                            )}
                            {renderTreasuryStreams()}
                          </>
                        )}
                      </Spin>
                      {(!loadingTreasuries && !loadingTreasuryDetails && !loadingTreasuryStreams) && (
                        <>
                        {(!treasuryList || treasuryList.length === 0) && !treasuryDetails && (
                          <div className="h-100 flex-center">
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{t('treasuries.treasury-detail.no-treasury-loaded')}</p>} />
                          </div>
                        )}
                        </>
                      )}
                    </div>
                    {treasuryDetails && (
                      <div className="stream-share-ctas">
                        <span className="copy-cta" onClick={() => onCopyTreasuryAddress(treasuryDetails.id)}>TREASURY ID: {treasuryDetails.id}</span>
                        <a className="explorer-cta" target="_blank" rel="noopener noreferrer"
                          href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${treasuryDetails.id}${getSolanaExplorerClusterParam()}`}>
                          <IconExternalLink className="mean-svg-icons" />
                        </a>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="h-100 flex-center">
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{t('treasuries.treasury-list.not-connected')}</p>} />
                  </div>
                )}
              </div>

            </div>

          </div>

        </div>

      </div>

      <TreasuryOpenModal
        isVisible={isOpenTreasuryModalVisible}
        handleOk={onAcceptOpenTreasury}
        handleClose={closeOpenTreasuryModal}
      />

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
        />
      )}

      <TreasuryCloseModal
        isVisible={isCloseTreasuryModalVisible}
        transactionFees={transactionFees}
        tokenBalance={tokenBalance}
        nativeBalance={nativeBalance}
        treasuryDetails={treasuryDetails}
        handleOk={onAcceptCloseTreasury}
        handleClose={hideCloseTreasuryModal}
        content={getTreasuryClosureMessage()}
        transactionStatus={transactionStatus.currentOperation}
        isBusy={isBusy}
      />

      {isCloseStreamModalVisible && (
        <StreamCloseModal
          isVisible={isCloseStreamModalVisible}
          selectedToken={selectedToken}
          transactionFees={transactionFees}
          streamDetail={highlightedStream}
          handleOk={onAcceptCloseStream}
          handleClose={hideCloseStreamModal}
          content={getStreamClosureMessage()}
          mspClient={
            highlightedStream
              ? highlightedStream.version < 2
                ? ms
                : msp
              : undefined
          }
          canCloseTreasury={numTreasuryStreams() === 1 ? true : false}
        />
      )}

      <StreamPauseModal
        isVisible={isPauseStreamModalVisible}
        selectedToken={selectedToken}
        transactionFees={transactionFees}
        tokenBalance={tokenBalance}
        streamDetail={highlightedStream}
        handleOk={onAcceptPauseStream}
        handleClose={hidePauseStreamModal}
        content={getStreamPauseMessage()}
      />

      <StreamResumeModal
        isVisible={isResumeStreamModalVisible}
        selectedToken={selectedToken}
        transactionFees={transactionFees}
        tokenBalance={tokenBalance}
        streamDetail={highlightedStream}
        handleOk={onAcceptResumeStream}
        handleClose={hideResumeStreamModal}
        content={getStreamResumeMessage()}
      />

      {isAddFundsModalVisible && (
        <TreasuryAddFundsModal
          handleOk={onAcceptAddFunds}
          handleClose={closeAddFundsModal}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          withdrawTransactionFees={withdrawTransactionFees}
          treasuryDetails={treasuryDetails}
          isVisible={isAddFundsModalVisible}
          userBalances={userBalances}
          streamStats={streamStats}
          treasuryStreams={treasuryStreams}
          associatedToken={
            treasuryDetails
              ? (treasuryDetails as Treasury).version && (treasuryDetails as Treasury).version >= 2
                ? (treasuryDetails as Treasury).associatedToken as string
                : (treasuryDetails as TreasuryInfo).associatedTokenAddress as string
              : ''
          }
          isBusy={isBusy}
        />
      )}

      {isCreateStreamModalVisible && (
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
          handleOk={onAcceptCreateStream}
          isVisible={isCreateStreamModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          withdrawTransactionFees={withdrawTransactionFees}
          treasuryDetails={treasuryDetails}
          isMultisigTreasury={isMultisigTreasury()}
          multisigClient={multisigClient}
          multisigAddress={getSelectedTreasuryMultisig()}
          userBalances={userBalances}
        />
      )}

      {/* Transaction execution modal */}
      <Modal
        className="mean-modal no-full-screen"
        maskClosable={false}
        visible={isCloseStreamTransactionModalVisible}
        afterClose={onAfterCloseStreamTransactionModalClosed}
        title={getTransactionModalTitle(transactionStatus, isBusy, t)}
        onCancel={hideCloseStreamTransactionModal}
        width={360}
        footer={null}>
        <div className="transaction-progress">
          {isBusy ? (
            <>
              <Spin indicator={bigLoadingIcon} className="icon" />
              <h4 className="font-bold mb-1">
                {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
              </h4>
              {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
                <div className="indication">{t('transactions.status.instructions')}</div>
              )}
            </>
          ) : isSuccess() ? (
            <>
              <CheckOutlined style={{ fontSize: 48 }} className="icon" />
              <h4 className="font-bold mb-1 text-uppercase">
                {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
              </h4>
              <p className="operation">{t('transactions.status.tx-generic-operation-success')}</p>
              <Button
                block
                type="primary"
                shape="round"
                size="middle"
                onClick={() => lastSentTxOperationType === OperationType.StreamPause
                  ? onPauseStreamTransactionFinished()
                  : lastSentTxOperationType === OperationType.StreamResume
                    ? onResumeStreamTransactionFinished()
                    : lastSentTxOperationType === OperationType.StreamClose
                      ? onCloseStreamTransactionFinished()
                      : hideCloseStreamTransactionModal()}>
                {t('general.cta-finish')}
              </Button>
            </>
          ) : isError() ? (
            <>
              <InfoCircleOutlined style={{ fontSize: 48 }} className="icon" />
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
              {transactionStatus.currentOperation === TransactionStatus.SendTransactionFailure ? (
                <div className="row two-col-ctas mt-3">
                  <div className="col-6">
                    <Button
                      block
                      type="text"
                      shape="round"
                      size="middle"
                      onClick={() => ongoingOperation === OperationType.StreamPause
                        ? onExecutePauseStreamTransaction()
                        : ongoingOperation === OperationType.StreamResume
                          ? onExecuteResumeStreamTransaction()
                          : ongoingOperation === OperationType.StreamClose
                            ? onExecuteCloseStreamTransaction(retryOperationPayload)
                            : hideCloseStreamTransactionModal()}>
                      {t('general.retry')}
                    </Button>
                  </div>
                  <div className="col-6">
                    <Button
                      block
                      type="primary"
                      shape="round"
                      size="middle"
                      onClick={() => refreshPage()}>
                      {t('general.refresh')}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  block
                  type="primary"
                  shape="round"
                  size="middle"
                  onClick={hideCloseStreamTransactionModal}>
                  {t('general.cta-close')}
                </Button>
              )}
            </>
          ) : (
            <>
              <Spin indicator={bigLoadingIcon} className="icon" />
              <h4 className="font-bold mb-4 text-uppercase">{t('transactions.status.tx-wait')}...</h4>
            </>
          )}
        </div>
      </Modal>

      <PreFooter />
    </>
  );

};
