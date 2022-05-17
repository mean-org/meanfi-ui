import React, { useCallback, useContext, useMemo } from 'react';
import "./style.scss";
import {
  ArrowLeftOutlined,
  EditOutlined,
  LoadingOutlined,
  MergeCellsOutlined,
  QrcodeOutlined,
  SyncOutlined
} from '@ant-design/icons';
import { Connection, Keypair, LAMPORTS_PER_SOL, ParsedConfirmedTransactionMeta, PublicKey, Transaction } from '@solana/web3.js';
import { useEffect, useState } from 'react';
import { PreFooter } from '../../components/PreFooter';
import { TransactionItemView } from '../../components/TransactionItemView';
import { getSolanaExplorerClusterParam, useConnectionConfig } from '../../contexts/connection';
import { useWallet } from '../../contexts/wallet';
import { FetchStatus, UserTokenAccount } from '../../models/transactions';
import { AppStateContext } from '../../contexts/appstate';
import { useTranslation } from 'react-i18next';
import { Identicon } from '../../components/Identicon';
import {
  fetchAccountTokens,
  findATokenAddress,
  formatThousands,
  getAmountFromLamports,
  getTxIxResume,
  openLinkInNewTab,
  shortenAddress
} from '../../utils/utils';
import { Button, Col, Dropdown, Empty, Menu, Row, Space, Spin, Tooltip } from 'antd';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import {
  SOLANA_WALLET_GUIDE,
  SOLANA_EXPLORER_URI_INSPECT_ADDRESS,
  EMOJIS,
  TRANSACTIONS_PER_PAGE,
  FALLBACK_COIN_IMAGE,
  WRAPPED_SOL_MINT_ADDRESS,
  ACCOUNTS_LOW_BALANCE_LIMIT
} from '../../constants';
import { QrScannerModal } from '../../components/QrScannerModal';
import { Helmet } from "react-helmet";
import { IconAdd, IconExternalLink, IconEyeOff, IconEyeOn, IconLightBulb, IconVerticalEllipsis } from '../../Icons';
import { fetchAccountHistory, MappedTransaction } from '../../utils/history';
import { useLocation, useNavigate } from 'react-router-dom';
import useLocalStorage from '../../hooks/useLocalStorage';
import { AccountTokenParsedInfo } from '../../models/token';
import { TokenInfo } from "@solana/spl-token-registry";
import { AccountsMergeModal } from '../../components/AccountsMergeModal';
import { Streams } from '../../views';
import { MoneyStreaming } from '@mean-dao/money-streaming/lib/money-streaming';
import { initialSummary, StreamsSummary } from '../../models/streams';
import { MSP, Stream, STREAM_STATUS } from '@mean-dao/msp';
import { StreamInfo, STREAM_STATE } from '@mean-dao/money-streaming';
import { openNotification } from '../../components/Notifications';
import { AddressDisplay } from '../../components/AddressDisplay';
import { ReceiveSplOrSolModal } from '../../components/ReceiveSplOrSolModal';
import { SendAssetModal } from '../../components/SendAssetModal';
import { EventType, OperationType, TransactionStatus } from '../../models/enums';
import { consoleOut, copyText, getTransactionStatusForLogs, isValidAddress, kFormatter, toUsCurrency } from '../../utils/ui';
import { WrapSolModal } from '../../components/WrapSolModal';
import { UnwrapSolModal } from '../../components/UnwrapSolModal';
import { confirmationEvents, TxConfirmationContext, TxConfirmationInfo } from '../../contexts/transaction-status';
import { AppUsageEvent } from '../../utils/segment-service';
import { segmentAnalytics } from '../../App';
import { TreasuriesSummary } from '../../components/TreasuriesSummary';
import { AccountsSuggestAssetModal } from '../../components/AccountsSuggestAssetModal';
import { QRCodeSVG } from 'qrcode.react';
import { NATIVE_SOL } from '../../utils/tokens';
import { unwrapSol } from '@mean-dao/hybrid-liquidity-ag';
import { customLogger } from '../..';
import { AccountsInitAtaModal } from '../../components/AccountsInitAtaModal';
import { AccountsCloseAssetModal } from '../../components/AccountsCloseAssetModal';

const antIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;
export type CategoryOption = "networth" | "user-account" | "other-assets";
export type OtherAssetsOption = "msp-streams" | "msp-treasuries" | "orca" | "solend" | "friktion" | undefined;

export const AccountsNewView = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { endpoint } = useConnectionConfig();
  const { publicKey, connected, wallet } = useWallet();
  const {
    theme,
    coinPrices,
    userTokens,
    streamList,
    pinnedTokens,
    splTokenList,
    streamListv1,
    streamListv2,
    streamDetail,
    transactions,
    selectedAsset,
    accountAddress,
    loadingStreams,
    streamsSummary,
    lastTxSignature,
    detailsPanelOpen,
    shouldLoadTokens,
    transactionStatus,
    streamProgramAddress,
    canShowAccountDetails,
    loadingStreamsSummary,
    streamV2ProgramAddress,
    previousWalletConnectState,
    setLoadingStreamsSummary,
    setCanShowAccountDetails,
    showDepositOptionsModal,
    setAddAccountPanelOpen,
    getTokenPriceByAddress,
    getTokenPriceBySymbol,
    setLastStreamsSummary,
    getTokenByMintAddress,
    setTransactionStatus,
    setShouldLoadTokens,
    setDtailsPanelOpen,
    refreshStreamList,
    setStreamsSummary,
    setAccountAddress,
    setSelectedToken,
    setSelectedAsset,
    setStreamDetail,
    setTransactions,
  } = useContext(AppStateContext);
  const { enqueueTransactionConfirmation } = useContext(TxConfirmationContext);
  const { t } = useTranslation('common');
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [accountAddressInput, setAccountAddressInput] = useState<string>('');
  const [tokensLoaded, setTokensLoaded] = useState(false);
  const [accountTokens, setAccountTokens] = useState<UserTokenAccount[]>([]);
  const [solAccountItems, setSolAccountItems] = useState(0);
  const [tokenAccountGroups, setTokenAccountGroups] = useState<Map<string, AccountTokenParsedInfo[]>>();
  const [userOwnedTokenAccounts, setUserOwnedTokenAccounts] = useState<AccountTokenParsedInfo[]>();
  const [selectedTokenMergeGroup, setSelectedTokenMergeGroup] = useState<AccountTokenParsedInfo[]>();
  const [wSolBalance, setWsolBalance] = useState(0);
  const [refreshingBalance, setRefreshingBalance] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategoryOption>("user-account");
  const [selectedOtherAssetsOption, setSelectedOtherAssetsOption] = useState<OtherAssetsOption>(undefined);
  const [totalTokenAccountsValue, setTotalTokenAccountsValue] = useState(0);
  const [netWorth, setNetWorth] = useState(0);
  const [treasuriesTvl, setTreasuriesTvl] = useState(0);
  const [isUnwrapping, setIsUnwrapping] = useState(false);

  // Url Query Params attendants
  const [urlQueryAddress, setUrlQueryAddress] = useState('');
  const [urlQueryCategory, setUrlQueryCategory] = useState('');
  const [urlQueryAsset, setUrlQueryAsset] = useState('');

  // Flow control
  const [status, setStatus] = useState<FetchStatus>(FetchStatus.Iddle);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [shouldLoadTransactions, setShouldLoadTransactions] = useState(false);
  const [hideLowBalances, setHideLowBalances] = useLocalStorage('hideLowBalances', true);
  const [canSubscribe, setCanSubscribe] = useState(true);

  // QR scan modal
  const [isQrScannerModalVisible, setIsQrScannerModalVisibility] = useState(false);
  const showQrScannerModal = useCallback(() => setIsQrScannerModalVisibility(true), []);
  const closeQrScannerModal = useCallback(() => setIsQrScannerModalVisibility(false), []);
  const onAcceptQrScannerModal = (value: string) => {
    setAccountAddressInput(value);
    triggerWindowResize();
    closeQrScannerModal();
  };

  const connection = useMemo(() => new Connection(endpoint, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true
  }), [
    endpoint
  ]);

  // Create and cache Money Streaming Program instance
  const ms = useMemo(() => new MoneyStreaming(
    endpoint,
    streamProgramAddress,
    "confirmed"
  ), [
    endpoint,
    streamProgramAddress
  ]);

  const msp = useMemo(() => {
    return new MSP(
      endpoint,
      streamV2ProgramAddress,
      "confirmed"
    );
  }, [
    endpoint,
    streamV2ProgramAddress
  ]);

  ////////////////////////////
  //   Events and actions   //
  ////////////////////////////

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }, [setTransactionStatus]);

  // Token Merger Modal
  const hideTokenMergerModal = useCallback(() => setTokenMergerModalVisibility(false), []);
  const showTokenMergerModal = useCallback(() => setTokenMergerModalVisibility(true), []);
  const [isTokenMergerModalVisible, setTokenMergerModalVisibility] = useState(false);
  const onCloseTokenMergeModal = useCallback(() => {
    resetTransactionStatus();
    hideTokenMergerModal();
  }, [
    hideTokenMergerModal,
    resetTransactionStatus,
  ]);

  const onFinishedTokenMerge = useCallback(() => {
    hideTokenMergerModal();
    resetTransactionStatus();
    setShouldLoadTokens(true);
  }, [
    setShouldLoadTokens,
    hideTokenMergerModal,
    resetTransactionStatus,
  ]);

  // Receive SPL or SOL modal
  const [isReceiveSplOrSolModalOpen, setIsReceiveSplOrSolModalOpen] = useState(false);
  const hideReceiveSplOrSolModal = useCallback(() => setIsReceiveSplOrSolModalOpen(false), []);
  const showReceiveSplOrSolModal = useCallback(() => setIsReceiveSplOrSolModalOpen(true), []);

  // Send selected token modal
  const [isSendAssetModalOpen, setIsSendAssetModalOpen] = useState(false);
  const hideSendAssetModal = useCallback(() => setIsSendAssetModalOpen(false), []);
  const showSendAssetModal = useCallback(() => setIsSendAssetModalOpen(true), []);

  // Wrap SOL token modal
  const [isWrapSolModalOpen, setIsWrapSolModalOpen] = useState(false);
  const hideWrapSolModal = useCallback(() => setIsWrapSolModalOpen(false), []);
  const showWrapSolModal = useCallback(() => setIsWrapSolModalOpen(true), []);

  // Unwrap SOL token modal
  const [isUnwrapSolModalOpen, setIsUnwrapSolModalOpen] = useState(false);
  const hideUnwrapSolModal = useCallback(() => setIsUnwrapSolModalOpen(false), []);
  const showUnwrapSolModal = useCallback(() => setIsUnwrapSolModalOpen(true), []);

  // Suggest an Asset modal
  const [isSuggestAssetModalOpen, setIsSuggestAssetModalOpen] = useState(false);
  const hideSuggestAssetModal = useCallback(() => setIsSuggestAssetModalOpen(false), []);
  const showSuggestAssetModal = useCallback(() => setIsSuggestAssetModalOpen(true), []);

  // Add Asset (Init ATA) modal
  const [isInitAtaModalOpen, setIsInitAtaModalOpen] = useState(false);
  const hideInitAtaModal = useCallback(() => setIsInitAtaModalOpen(false), []);
  const showInitAtaModal = useCallback(() => setIsInitAtaModalOpen(true), []);

  // Close Asset modal
  const [isCloseAssetModalOpen, setIsCloseAssetModalOpen] = useState(false);
  const hideCloseAssetModal = useCallback(() => setIsCloseAssetModalOpen(false), []);
  const showCloseAssetModal = useCallback(() => setIsCloseAssetModalOpen(true), []);

  // Exchange selected token
  // const [isExchangeAssetModalOpen, setIsExchangeAssetModalOpen] = useState(false);
  // const hideExchangeAssetModal = useCallback(() => setIsExchangeAssetModalOpen(false), []);
  // const showExchangeAssetModal = useCallback(() => setIsExchangeAssetModalOpen(true), []);

  const onAfterWrap = () => {
    hideWrapSolModal();
  }

  const onAfterUnwrap = () => {
    hideUnwrapSolModal();
  }

  const onAddAccountAddress = useCallback(() => {
    setAccountAddress(accountAddressInput);
    setShouldLoadTokens(true);
    setCanShowAccountDetails(true);
    setAccountAddressInput('');
    setAddAccountPanelOpen(false);
  }, [
    accountAddressInput,
    setCanShowAccountDetails,
    setAddAccountPanelOpen,
    setShouldLoadTokens,
    setAccountAddress,
  ]);

  const handleScanAnotherAddressButtonClick = () => {
    setCanShowAccountDetails(false);
    setAddAccountPanelOpen(true);
  }

  const handleBackToAccountDetailsButtonClick = () => {
    setCanShowAccountDetails(true);
    setAddAccountPanelOpen(false);
  }

  const triggerWindowResize = () => {
    window.dispatchEvent(new Event('resize'));
  }

  const handleAccountAddressInputChange = (e: any) => {
    const inputValue = e.target.value as string;
    // Set the input value
    const trimmedValue = inputValue.trim();
    setAccountAddressInput(trimmedValue);
  }

  const handleAccountAddressInputFocusIn = () => {
    setTimeout(() => {
      triggerWindowResize();
    }, 100);
  }

  const handleAccountAddressInputFocusOut = () => {
    setTimeout(() => {
      triggerWindowResize();
    }, 100);
  }

  const isSelectedAssetNativeAccount = useCallback(() => {
    return accountAddress && selectedAsset && accountAddress === selectedAsset.publicAddress ? true : false;
  }, [
    selectedAsset,
    accountAddress,
  ]);

  const isSelectedAssetWsol = useCallback(() => {
    return selectedAsset && selectedAsset.address === WRAPPED_SOL_MINT_ADDRESS ? true : false;
  }, [selectedAsset]);

  const goToExchangeWithPresetAsset = useCallback(() => {
    const queryParams = `${selectedAsset ? '?from=' + selectedAsset.symbol : ''}`;
    setDtailsPanelOpen(false);
    if (queryParams) {
      navigate(`/exchange${queryParams}`);
    } else {
      navigate('/exchange');
    }
  }, [navigate, selectedAsset, setDtailsPanelOpen]);

  const handleGoToExchangeClick = useCallback(() => {
    const queryParams = `${selectedAsset ? '?to=' + selectedAsset.symbol : ''}`;
    setDtailsPanelOpen(false);
    if (queryParams) {
      navigate(`/exchange${queryParams}`);
    } else {
      navigate('/exchange');
    }
  }, [navigate, selectedAsset, setDtailsPanelOpen]);

  const handleGoToInvestClick = useCallback(() => {
    setDtailsPanelOpen(false);
    navigate('/invest');
  }, [navigate, setDtailsPanelOpen]);

  const onExchangeAsset = useCallback(() => {
    if (!selectedAsset) { return; }

    goToExchangeWithPresetAsset();

    // let token: TokenInfo | null;
    // if (isSelectedAssetNativeAccount()) {
    //   token = getTokenByMintAddress(WRAPPED_SOL_MINT_ADDRESS);
    // } else {
    //   token = getTokenByMintAddress(selectedAsset.address);
    // }
    // if (token) {
    //   setSelectedToken(token as TokenInfo);
    // }
    // showExchangeAssetModal();

  }, [goToExchangeWithPresetAsset, selectedAsset]);

  const onSendAsset = useCallback(() => {
    if (!selectedAsset) { return; }

    let token: TokenInfo | undefined;
    if (isSelectedAssetNativeAccount()) {
      token = getTokenByMintAddress(WRAPPED_SOL_MINT_ADDRESS);
    } else {
      token = getTokenByMintAddress(selectedAsset.address);
    }
    if (token) {
      setSelectedToken(token);
    }
    showSendAssetModal();

  }, [getTokenByMintAddress, isSelectedAssetNativeAccount, selectedAsset, setSelectedToken, showSendAssetModal]);

  // Copy address to clipboard
  const copyAddressToClipboard = useCallback((address: any) => {

    if (!address) { return; }

    if (copyText(address.toString())) {
      openNotification({
        description: t('notifications.account-address-copied-message'),
        type: "info"
      });
    } else {
      openNotification({
        description: t('notifications.account-address-not-copied-message'),
        type: "error"
      });
    }

  },[t])

  const hasTransactions = useCallback(() => {
    return transactions && transactions.length > 0 ? true : false;
  }, [transactions]);

  const getScanAddress = useCallback((asset: UserTokenAccount): PublicKey | null => {
    /**
     * If asset.ataAddress
     *    If asset.ataAddress equals the SOL mint address
     *      Use accountAddress
     *    Else
     *      Use asset.ataAddress 
     * Else
     *    Reflect no transactions
     */
    return asset?.publicAddress
            ? asset.publicAddress !== NATIVE_SOL_MINT.toBase58()
              ? new PublicKey(asset.publicAddress)
              : new PublicKey(accountAddress)
            : null;
  },[accountAddress]);

  const canActivateMergeTokenAccounts = (): boolean => {
    if (publicKey && selectedAsset && tokenAccountGroups) {
      const acc = tokenAccountGroups.has(selectedAsset.address);
      if (acc) {
        const item = tokenAccountGroups.get(selectedAsset.address);
        return item && item.length > 1 ? true : false;
      }
    }
    return false;
  }

  const updateAtaFlag = useCallback(async (token: UserTokenAccount): Promise<boolean> => {
    const ata = await findATokenAddress(new PublicKey(accountAddress), new PublicKey(token.address));
    return ata && token.publicAddress && ata.toBase58() === token.publicAddress ? true : false;
  }, [accountAddress]);

  const refreshAssetBalance = useCallback(() => {
    if (!connection || !accountAddress || !selectedAsset || refreshingBalance || !accountTokens) { return; }

    setRefreshingBalance(true);

    const tokensCopy = JSON.parse(JSON.stringify(accountTokens)) as UserTokenAccount[];

    if (isSelectedAssetNativeAccount()) {
      const pk = new PublicKey(accountAddress);
      // Fetch SOL balance.
      connection.getBalance(pk)
        .then(solBalance => {
          tokensCopy[0].balance = solBalance / LAMPORTS_PER_SOL;
          tokensCopy[0].valueInUsd = (solBalance / LAMPORTS_PER_SOL) * getTokenPriceBySymbol(tokensCopy[0].symbol);
          consoleOut('solBalance:', solBalance / LAMPORTS_PER_SOL, 'blue');
          setAccountTokens(tokensCopy);
        })
        .catch(error => {
          console.error(error);
        })
        .finally(() => setRefreshingBalance(false));
    } else if (selectedAsset.publicAddress) {
      let itemIndex = -1;
      const pk = new PublicKey(selectedAsset.publicAddress);
      // Fetch token account balance.
      connection.getTokenAccountBalance(pk)
        .then(tokenAmount => {
          const balance = tokenAmount.value.uiAmount;
          consoleOut('balance:', balance, 'blue');
          const valueInUSD = (balance || 0) * getTokenPriceByAddress(selectedAsset.address);
          consoleOut('valueInUSD:', valueInUSD, 'blue');
          // Find the token and update it if found
          itemIndex = tokensCopy.findIndex(t => t.publicAddress === selectedAsset.publicAddress);
          if (itemIndex !== -1) {
            tokensCopy[itemIndex].balance = (balance || 0);
            tokensCopy[itemIndex].valueInUsd = valueInUSD;
            setAccountTokens(tokensCopy);
            return;
          }
        })
        .catch(error => {
          console.error(error);
        })
        .finally(() => setRefreshingBalance(false));
    }
  }, [
    connection,
    accountTokens,
    selectedAsset,
    accountAddress,
    refreshingBalance,
    isSelectedAssetNativeAccount,
    getTokenPriceByAddress,
    getTokenPriceBySymbol,
  ]);

  const startSwitch = useCallback(() => {
    setStatus(FetchStatus.Fetching);
    setLoadingTransactions(false);
    setShouldLoadTransactions(true);
  }, [])

  const reloadSwitch = useCallback(() => {
    refreshAssetBalance();
    setSolAccountItems(0);
    setTransactions(undefined);
    startSwitch();
  }, [
    startSwitch,
    setTransactions,
    refreshAssetBalance,
  ]);

  const selectAsset = useCallback((
    asset: UserTokenAccount,
    clearTxList = true,
    openDetailsPanel = false
  ) => {
    setStatus(FetchStatus.Fetching);
    if (clearTxList) {
      setSolAccountItems(0);
      setTransactions(undefined);
    }
    setSelectedAsset(asset);
    if (openDetailsPanel) {
      setDtailsPanelOpen(true);
    }
    setTimeout(() => {
      startSwitch();
    }, 10);
  }, [
    startSwitch,
    setTransactions,
    setSelectedAsset,
    setDtailsPanelOpen,
  ])

  const toggleHideLowBalances = useCallback((setting: boolean) => {
    if (selectedAsset && (!selectedAsset.valueInUsd || selectedAsset.valueInUsd < ACCOUNTS_LOW_BALANCE_LIMIT) && setting) {
      selectAsset(accountTokens[0]);
    }
    setHideLowBalances(setting);
  }, [accountTokens, selectAsset, selectedAsset, setHideLowBalances]);

  const recordTxConfirmation = useCallback((item: TxConfirmationInfo, success = true) => {
    let event: any;

    if (item && item.operationType === OperationType.Wrap) {
      event = success ? AppUsageEvent.WrapSolCompleted : AppUsageEvent.WrapSolFailed;
    } else if (item && item.operationType === OperationType.Unwrap) {
      event = success ? AppUsageEvent.UnwrapSolCompleted : AppUsageEvent.UnwrapSolFailed;
    }

    segmentAnalytics.recordEvent(event, { signature: item.signature });
  }, []);

  // Setup event handler for Tx confirmed
  const onTxConfirmed = useCallback((item: TxConfirmationInfo) => {
    consoleOut("onTxConfirmed event executed:", item, 'crimson');
    if (item && item.operationType === OperationType.Wrap) {
      recordTxConfirmation(item, true);
      setShouldLoadTokens(true);
      reloadSwitch();
    } else if (item && item.operationType === OperationType.Unwrap) {
      setIsUnwrapping(false);
      recordTxConfirmation(item, true);
      setShouldLoadTokens(true);
      reloadSwitch();
    } else if (item && item.operationType === OperationType.Transfer && item.extras !== 'scheduled') {
      recordTxConfirmation(item, true);
      setShouldLoadTokens(true);
      reloadSwitch();
    } else if (item && item.operationType === OperationType.CreateAsset) {
      recordTxConfirmation(item, true);
      setShouldLoadTokens(true);
      if (isSelectedAssetNativeAccount()) {
        reloadSwitch();
      }
    } else if (item && item.operationType === OperationType.CloseTokenAccount) {
      recordTxConfirmation(item, true);
      setShouldLoadTokens(true);
      reloadSwitch();
    }
    resetTransactionStatus();
  }, [isSelectedAssetNativeAccount, recordTxConfirmation, reloadSwitch, resetTransactionStatus, setShouldLoadTokens]);

  // Setup event handler for Tx confirmation error
  const onTxTimedout = useCallback((item: TxConfirmationInfo) => {
    consoleOut("onTxTimedout event executed:", item, 'crimson');
    if (item && item.operationType === OperationType.Unwrap) {
      setIsUnwrapping(false);
    }
    recordTxConfirmation(item, false);
    resetTransactionStatus();
  }, [recordTxConfirmation, resetTransactionStatus]);

  const refreshStreamSummary = useCallback(async () => {

    if (!ms || !msp || !(publicKey || urlQueryAddress || accountAddress) || (!streamListv1 && !streamListv2) || loadingStreamsSummary) { return; }

    setLoadingStreamsSummary(true);

    const resume: StreamsSummary = {
      totalNet: 0,
      incomingAmount: 0,
      outgoingAmount: 0,
      totalAmount: 0
    };

    const treasurer = publicKey
      ? publicKey
      : urlQueryAddress
        ? new PublicKey(urlQueryAddress)
        : new PublicKey(accountAddress);

    const updatedStreamsv1 = await ms.refreshStreams(streamListv1 || [], treasurer);
    const updatedStreamsv2 = await msp.refreshStreams(streamListv2 || [], treasurer);

    // consoleOut('=========== Block start ===========', '', 'orange');

    for (const stream of updatedStreamsv1) {

      const isIncoming = stream.beneficiaryAddress && stream.beneficiaryAddress === treasurer.toBase58()
        ? true
        : false;

      if (isIncoming) {
        resume['incomingAmount'] = resume['incomingAmount'] + 1;
      } else {
        resume['outgoingAmount'] = resume['outgoingAmount'] + 1;
      }

      // Get refreshed data
      const freshStream = await ms.refreshStream(stream) as StreamInfo;
      if (!freshStream || freshStream.state !== STREAM_STATE.Running) { continue; }

      const asset = getTokenByMintAddress(freshStream.associatedToken as string);
      const rate = asset ? getTokenPriceByAddress(asset.address) : 0;
      if (isIncoming) {
        resume['totalNet'] = resume['totalNet'] + ((freshStream.escrowVestedAmount || 0) * rate);
      } else {
        resume['totalNet'] = resume['totalNet'] + ((freshStream.escrowUnvestedAmount || 0) * rate);
      }
    }

    resume['totalAmount'] = updatedStreamsv1.length;

    // consoleOut('totalNet v1:', resume['totalNet'], 'blue');

    for (const stream of updatedStreamsv2) {

      const isIncoming = stream.beneficiary && stream.beneficiary === treasurer.toBase58()
        ? true
        : false;

      if (isIncoming) {
        resume['incomingAmount'] = resume['incomingAmount'] + 1;
      } else {
        resume['outgoingAmount'] = resume['outgoingAmount'] + 1;
      }

      // Get refreshed data
      const freshStream = await msp.refreshStream(stream) as Stream;
      if (!freshStream || freshStream.status !== STREAM_STATUS.Running) { continue; }

      const asset = getTokenByMintAddress(freshStream.associatedToken as string);
      const pricePerToken = asset ? getTokenPriceByAddress(asset.address) : 0;
      const rate = asset ? (pricePerToken ? pricePerToken : 1) : 1;
      const decimals = asset ? asset.decimals : 9;
      // const amount = isIncoming ? freshStream.fundsSentToBeneficiary : freshStream.fundsLeftInStream;
      const amount = freshStream.withdrawableAmount;
      const amountChange = parseFloat((amount / 10 ** decimals).toFixed(decimals)) * rate;

      if (isIncoming) {
        resume['totalNet'] += amountChange;
      } else {
        resume['totalNet'] -= amountChange;
      }
    }

    resume['totalAmount'] += updatedStreamsv2.length;

    // consoleOut('totalNet:', resume['totalNet'], 'blue');
    // consoleOut('=========== Block ends ===========', '', 'orange');

    // Update state
    setLastStreamsSummary(streamsSummary);
    setStreamsSummary(resume);
    setLoadingStreamsSummary(false);

  }, [
    ms,
    msp,
    publicKey,
    streamListv1,
    streamListv2,
    streamsSummary,
    accountAddress,
    urlQueryAddress,
    loadingStreamsSummary,
    setLastStreamsSummary,
    setLoadingStreamsSummary,
    getTokenPriceByAddress,
    getTokenByMintAddress,
    setStreamsSummary,
  ]);

  // Filter only useful Txs for the SOL account and return count
  const getSolAccountItems = useCallback((txs: MappedTransaction[]): number => {

    const getChange = (accountIndex: number, meta: ParsedConfirmedTransactionMeta | null): number => {
      if (meta !== null && accountIndex !== -1) {
        const prevBalance = meta.preBalances[accountIndex] || 0;
        const postbalance = meta.postBalances[accountIndex] || 0;
        const change = getAmountFromLamports(postbalance) - getAmountFromLamports(prevBalance);
        return change;
      }
      return 0;
    }

    if (txs && txs.length) {

      // Show only txs that have SOL changes
      const filtered = txs.filter(tx => {
        const meta = tx.parsedTransaction && tx.parsedTransaction.meta
          ? tx.parsedTransaction.meta
          : null;
        if (!meta || meta.err !== null) { return false; }
        const accounts = tx.parsedTransaction.transaction.message.accountKeys;
        const accIdx = accounts.findIndex(acc => acc.pubkey.toBase58() === accountAddress);
        if (isSelectedAssetNativeAccount() && accIdx === -1) { return false; }
        const change = getChange(accIdx, meta);
        return isSelectedAssetNativeAccount() && change !== 0 ? true : false;
      });

      consoleOut(`${filtered.length} useful Txs`);
      return filtered.length || 0;
    } else {
      return 0;
    }
  }, [
    accountAddress,
    isSelectedAssetNativeAccount
  ]);

  // Lets consider there are items to render if there are transactions for selected asset (NOT SOL)
  // or if there are transactions with balance changes for the selected asset (SOL)
  const hasItemsToRender = useCallback((): boolean => {
    return ((!isSelectedAssetNativeAccount() && hasTransactions()) ||
            (isSelectedAssetNativeAccount() && hasTransactions() && solAccountItems > 0))
      ? true
      : false;
  }, [hasTransactions, isSelectedAssetNativeAccount, solAccountItems]);

  const canShowBuyOptions = useCallback(() => {
    if (!selectedAsset) { return false; }
    return !selectedAsset.publicAddress ? true : false;
  }, [selectedAsset]);

  /////////////////////
  // Data management //
  /////////////////////

  /**
   * URL scheme to redirect to /accounts page
   * 
   * /accounts?address={address}&cat={catId}&asset={assetId}
   * 
   * Navigate to /accounts with Net Worth selected
   * /accounts?address=GFefRR6EASXvnphnJApp2PRH1wF1B5pJijKBZGFzq1x1&cat=networth
   * Navigate to /accounts with my USDC asset selected
   * /accounts?address=GFefRR6EASXvnphnJApp2PRH1wF1B5pJijKBZGFzq1x1&cat=user-assets&asset=USDC
   * Navigate to /accounts with Treasuries summary selected
   * /accounts?address=GFefRR6EASXvnphnJApp2PRH1wF1B5pJijKBZGFzq1x1&cat=other-assets&asset=msp-treasuries
   * 
   * cat [networth | user-assets | other-assets]
   * asset (when cat=user-assets)  = [any token symbol]
   * asset (when cat=other-assets) = [msp-streams | msp-treasuries | orca | solend | friktion]
   */

  // Enable deep-linking - Parse and save query params as needed
  useEffect(() => {
    if (!isFirstLoad) { return; }

    const params = new URLSearchParams(location.search);
    let address: string | null = null;
    let asset: string | null = null;
    let cat: string | null = null;

    if (params.has('address')) {
      address = params.get('address');
      setUrlQueryAddress(address || '');
      consoleOut('params.get("address") =', address, 'crimson');
    }
    if (params.has('cat')) {
      cat = params.get('cat');
      setUrlQueryCategory(cat || '');
      consoleOut('params.get("cat") =', cat, 'crimson');
    }
    if (params.has('asset')) {
      asset = params.get('asset');
      setUrlQueryAsset(asset || '');
      consoleOut('params.get("asset") =', asset, 'crimson');
    }
    if (address) {
      setAccountAddress(address);
      if (cat) {
        switch (cat) {
          case "networth":
            setSelectedCategory("networth");
            break;
          case "user-account":
            setSelectedCategory("user-account");
            break;
          case "other-assets":
            setSelectedCategory("other-assets");
            break;
          default:
            break;
        }
      }
      if (asset && cat && (cat as CategoryOption) === "other-assets") {
        switch (asset as OtherAssetsOption) {
          case "msp-streams":
            setSelectedOtherAssetsOption("msp-streams");
            break;
          case "msp-treasuries":
            setSelectedOtherAssetsOption("msp-treasuries");
            break;
          case "orca":
            setSelectedOtherAssetsOption("orca");
            break;
          case "solend":
            setSelectedOtherAssetsOption("solend");
            break;
          case "friktion":
            setSelectedOtherAssetsOption("friktion");
            break;
          default:
            setSelectedOtherAssetsOption(undefined);
            break;
        }
      }
    }
  }, [isFirstLoad, location.search, setAccountAddress]);

  // Load streams on entering /accounts
  useEffect(() => {
    if (!isFirstLoad) { return; }
    setIsFirstLoad(false);
    setTransactions([]);

    setTimeout(() => {
      if (!shouldLoadTokens) {
        setShouldLoadTokens(true);
      }
    }, 1000);

    if ((publicKey || urlQueryAddress || accountAddress) && (!streamList || streamList.length === 0)) {
      consoleOut('Loading streams...', '', 'green');

      const treasurer = publicKey
      ? publicKey
      : urlQueryAddress
        ? new PublicKey(urlQueryAddress)
        : new PublicKey(accountAddress);

      refreshStreamList(false, treasurer);
    }
  }, [
    wallet,
    publicKey,
    streamList,
    isFirstLoad,
    accountAddress,
    urlQueryAddress,
    shouldLoadTokens,
    setShouldLoadTokens,
    refreshStreamList,
    setTransactions,
  ]);

  // Fetch all the owned token accounts on demmand via setShouldLoadTokens(true)
  // Also, do this after any Tx is completed in places where token balances were indeed changed)
  useEffect(() => {

    if (!connection ||
        !accountAddress ||
        !shouldLoadTokens ||
        !userTokens ||
        userTokens.length === 0 ||
        !splTokenList ||
        splTokenList.length === 0 ||
        !coinPrices
    ) {
      return;
    }

    // If we have a query param address and accountAddress is different
    // skip this render. In further renders they will eventually be equal
    if (urlQueryAddress && urlQueryAddress !== accountAddress) {
      return;
    }

    const timeout = setTimeout(() => {
      setShouldLoadTokens(false);
      setTokensLoaded(false);

      const meanTokensCopy = new Array<UserTokenAccount>();
      const intersectedList = new Array<UserTokenAccount>();

      const userTokensCopy = JSON.parse(JSON.stringify(userTokens)) as UserTokenAccount[];
      const splTokensCopy = JSON.parse(JSON.stringify(splTokenList)) as UserTokenAccount[];
      const pk = new PublicKey(accountAddress);

      // Fetch SOL balance.
      connection.getBalance(pk)
        .then(solBalance => {

          const sol: UserTokenAccount = {
            address: NATIVE_SOL.address,
            balance: solBalance / LAMPORTS_PER_SOL,
            chainId: 0,
            decimals: NATIVE_SOL.decimals,
            name: NATIVE_SOL.name,
            symbol: NATIVE_SOL.symbol,
            publicAddress: accountAddress,
            tags: NATIVE_SOL.tags,
            logoURI: NATIVE_SOL.logoURI,
            valueInUsd: (solBalance / LAMPORTS_PER_SOL) * getTokenPriceBySymbol('SOL')
          };

          fetchAccountTokens(connection, pk)
            .then(accTks => {
              if (accTks) {

                consoleOut('fetched accountTokens:', accTks.map(i => {
                  return {
                    pubAddress: i.pubkey.toBase58(),
                    mintAddress: i.parsedInfo.mint,
                    balance: i.parsedInfo.tokenAmount.uiAmount || 0
                  };
                }), 'blue');

                setUserOwnedTokenAccounts(accTks);

                // Group the token accounts by mint.
                const groupedTokenAccounts = new Map<string, AccountTokenParsedInfo[]>();
                const tokenGroups = new Map<string, AccountTokenParsedInfo[]>();
                accTks.forEach((ta) => {
                  const key = ta.parsedInfo.mint;
                  const info = getTokenByMintAddress(key);
                  const updatedTa = Object.assign({}, ta, {
                    description: info ? `${info.name} (${info.symbol})` : ''
                  });
                  if (groupedTokenAccounts.has(key)) {
                    const current = groupedTokenAccounts.get(key) as AccountTokenParsedInfo[];
                    current.push(updatedTa);
                  } else {
                    groupedTokenAccounts.set(key, [updatedTa]);
                  }
                });

                // Keep only groups with more than 1 item
                groupedTokenAccounts.forEach((item, key) => {
                  if (item.length > 1) {
                    tokenGroups.set(key, item);
                  }
                });

                // Save groups for possible further merging
                if (tokenGroups.size > 0) {
                  consoleOut('This account owns duplicated tokens...', '', 'blue');
                  consoleOut('tokenGroups:', tokenGroups, 'blue');
                  setTokenAccountGroups(tokenGroups);
                } else {
                  setTokenAccountGroups(undefined);
                }

                // Build meanTokensCopy including the MeanFi pinned tokens
                userTokensCopy.forEach(item => {
                  meanTokensCopy.push(item);
                });
                // Now add all other items but excluding those in userTokens
                splTokensCopy.forEach(item => {
                  if (!userTokens.includes(item)) {
                    meanTokensCopy.push(item);
                  }
                });

                // Create a list containing tokens for the user owned token accounts
                // Intersected output list
                accTks.forEach(item => {
                  // Loop through the user token accounts and add the token account to the list: intersectedList
                  // If it is not already on the list (diferentiate token accounts of the same mint)

                  const isTokenAccountInTheList = intersectedList.some(t => t.address === item.parsedInfo.mint);
                  const tokenFromMeanTokensCopy = meanTokensCopy.find(t => t.address === item.parsedInfo.mint);
                  if (tokenFromMeanTokensCopy && !isTokenAccountInTheList) {
                    intersectedList.push(tokenFromMeanTokensCopy);
                  }
                });

                intersectedList.unshift(sol);

                // Update balances in the mean token list
                accTks.forEach(item => {
                  // Locate the token in intersectedList
                  const tokenIndex = intersectedList.findIndex(i => i.address === item.parsedInfo.mint);
                  if (tokenIndex !== -1) {
                    const rate = getTokenPriceBySymbol(intersectedList[tokenIndex].symbol);
                    // If we didn't already filled info for this associated token address
                    if (!intersectedList[tokenIndex].publicAddress) {
                      // Add it
                      intersectedList[tokenIndex].publicAddress = item.pubkey.toBase58();
                      intersectedList[tokenIndex].balance = item.parsedInfo.tokenAmount.uiAmount || 0;
                      intersectedList[tokenIndex].valueInUsd = (item.parsedInfo.tokenAmount.uiAmount || 0) * rate;
                    } else if (intersectedList[tokenIndex].publicAddress !== item.pubkey.toBase58()) {
                      // If we did and the publicAddress is different/new then duplicate this item with the new info
                      const newItem = JSON.parse(JSON.stringify(intersectedList[tokenIndex])) as UserTokenAccount;
                      newItem.publicAddress = item.pubkey.toBase58();
                      newItem.balance = item.parsedInfo.tokenAmount.uiAmount || 0;
                      newItem.valueInUsd = (item.parsedInfo.tokenAmount.uiAmount || 0) * rate;
                      intersectedList.splice(tokenIndex + 1, 0, newItem);
                    }
                  }
                });

                const sortedList = intersectedList.sort((a, b) => {
                  if ((a.valueInUsd || 0) < (b.valueInUsd || 0)) {
                    return 1;
                  } else if ((a.valueInUsd || 0) > (b.valueInUsd || 0)) {
                    return -1;
                  }
                  return 0;
                });

                // Update displayIndex and isAta flag
                sortedList.forEach(async (item: UserTokenAccount, index: number) => {
                  item.displayIndex = index;
                  item.isAta = await updateAtaFlag(item);
                });

                // Finally add all owned token accounts as custom tokens
                accTks.forEach((item: AccountTokenParsedInfo, index: number) => {
                  if (!sortedList.some(t => t.address === item.parsedInfo.mint)) {
                    const customToken: UserTokenAccount = {
                      address: item.parsedInfo.mint,
                      balance: item.parsedInfo.tokenAmount.uiAmount || 0,
                      chainId: 0,
                      displayIndex: sortedList.length + 1 + index,
                      decimals: item.parsedInfo.tokenAmount.decimals,
                      name: 'Custom account',
                      symbol: shortenAddress(item.parsedInfo.mint),
                      publicAddress: item.pubkey.toBase58(),
                      tags: undefined,
                      logoURI: undefined,
                      valueInUsd: 0
                    };
                    sortedList.push(customToken);
                  }
                });

                // Report in the console for debugging
                const tokenTable: any[] = [];
                sortedList.forEach((item: UserTokenAccount, index: number) => tokenTable.push({
                    pubAddress: item.publicAddress ? shortenAddress(item.publicAddress, 6) : null,
                    mintAddress: shortenAddress(item.address, 6),
                    symbol: item.symbol,
                    balance: item.balance,
                    valueInUSD: item.valueInUsd
                  })
                );
                console.table(tokenTable);

                // Update the state
                setAccountTokens(sortedList);
                setTokensLoaded(true);

                // Preset the passed-in token via query params either
                // as token account address or mint address or token symbol
                if (urlQueryAsset) {
                  let asset: UserTokenAccount | undefined = undefined;
                  if (isValidAddress(urlQueryAsset)) {
                    asset = intersectedList.find(t => t.publicAddress === urlQueryAsset || t.address === urlQueryAsset);
                  } else {
                    asset = intersectedList.find(t => t.symbol === urlQueryAsset);
                  }
                  if (asset) {
                    selectAsset(asset);
                  }
                } else if (selectedAsset) {
                  // If no query param asset but there is already one selected, keep selection
                  const tokensItemIndex = intersectedList.findIndex(m => m.publicAddress === selectedAsset.publicAddress);
                  if (tokensItemIndex !== -1) {
                    selectAsset(intersectedList[tokensItemIndex], true);
                  } else {
                    selectAsset(intersectedList[0]);
                  }
                } else {
                  // Preset the first available token
                  selectAsset(intersectedList[0]);
                }

              } else {
                pinnedTokens.forEach((item, index) => {
                  item.valueInUsd = 0;
                });
                setAccountTokens(pinnedTokens);
                selectAsset(pinnedTokens[0]);
                setTokensLoaded(true);
                consoleOut('No tokens found in account!', '', 'red');

              }
            })
            .catch(error => {
              console.error(error);
              setAccountTokens(pinnedTokens);
              setTokensLoaded(true);
              selectAsset(pinnedTokens[0], true);
            });
        })
        .catch(error => {
          console.error(error);
        });
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connection,
    coinPrices,
    userTokens,
    pinnedTokens,
    splTokenList,
    urlQueryAsset,
    selectedAsset,
    accountAddress,
    urlQueryAddress,
    shouldLoadTokens,
    getTokenByMintAddress,
    getTokenPriceBySymbol,
    setShouldLoadTokens,
    updateAtaFlag,
    selectAsset,
  ]);

  // Load the transactions when signaled
  useEffect(() => {

    if (shouldLoadTransactions && tokensLoaded && connection && accountAddress && selectedAsset && !loadingTransactions) {
      setShouldLoadTransactions(false);
      setLoadingTransactions(true);

      // Get the address to scan and ensure there is one
      const pk = getScanAddress(selectedAsset as UserTokenAccount);
      consoleOut('pk:', pk ? pk.toBase58() : 'NONE', 'blue');
      if (!pk) {
        consoleOut('Asset has no public address, aborting...', '', 'goldenrod');
        setTransactions(undefined);
        setStatus(FetchStatus.Fetched);
        return;
      }

      let options = {
        limit: TRANSACTIONS_PER_PAGE
      }

      if (lastTxSignature) {
        options = Object.assign(options, {
          before: lastTxSignature
        });
      }

      fetchAccountHistory(
        connection,
        pk,
        options,
        true
      )
      .then(history => {
        consoleOut('history:', history, 'blue');
        setTransactions(history.transactionMap, true);
        setStatus(FetchStatus.Fetched);

        if (history.transactionMap && history.transactionMap.length && pk.toBase58() === accountAddress) {
          const validItems = getSolAccountItems(history.transactionMap);
          const nativeAccountTxItems = solAccountItems + validItems;
          setSolAccountItems(nativeAccountTxItems);
          // If the valid items are less than 10, get more (only once after the first fetch)
          // Only for the native account where some Txs might have no balance changes
          // if (!history.before && nativeAccountTxItems < 10) {
          //   setTimeout(() => {
          //     consoleOut('Few items, loading more...', '', 'green');
          //     startSwitch();
          //   }, 100);
          // }
        }

      })
      .catch(error => {
        console.error(error);
        setStatus(FetchStatus.FetchFailed);
      })
      .finally(() => setLoadingTransactions(false));
    }

  }, [
    connection,
    transactions,
    tokensLoaded,
    selectedAsset,
    accountAddress,
    lastTxSignature,
    solAccountItems,
    loadingTransactions,
    loadingStreamsSummary,
    shouldLoadTransactions,
    getSolAccountItems,
    setTransactions,
    getScanAddress,
    startSwitch
  ]);

  // Keep track of wSOL balance
  useEffect(() => {
    if (tokensLoaded && accountTokens && accountTokens.length > 0) {
      const wSol = accountTokens.find(t => t.address === WRAPPED_SOL_MINT_ADDRESS);
      if (wSol) {
        setWsolBalance(wSol.balance || 0);
      }
    }
  }, [accountTokens, tokensLoaded]);

  // Hook on the wallet connect/disconnect
  useEffect(() => {

    if (previousWalletConnectState !== connected) {
      // User is connecting
      if (!previousWalletConnectState && connected && publicKey) {
        consoleOut('Preset account address...', publicKey.toBase58(), 'green');
        setTimeout(() => {
          setLastStreamsSummary(initialSummary);
          setStreamsSummary(initialSummary);
        });
        const treasurer = publicKey
          ? publicKey
          : urlQueryAddress
            ? new PublicKey(urlQueryAddress)
            : new PublicKey(accountAddress);
        refreshStreamList(true, treasurer);
        setSelectedAsset(undefined);
        setShouldLoadTokens(true);
        setAddAccountPanelOpen(false);
        setCanShowAccountDetails(true);
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'blue');
        confirmationEvents.off(EventType.TxConfirmSuccess, onTxConfirmed);
        consoleOut('Unsubscribed from event txConfirmed!', '', 'blue');
        confirmationEvents.off(EventType.TxConfirmTimeout, onTxTimedout);
        consoleOut('Unsubscribed from event onTxTimedout!', '', 'blue');
        setCanSubscribe(true);
        setTimeout(() => {
          setLastStreamsSummary(initialSummary);
          setStreamsSummary(initialSummary);
        });
        if (streamDetail) {
          setStreamDetail(undefined);
        }
        setAddAccountPanelOpen(false);
        setCanShowAccountDetails(true);
      }
    }

  }, [
    wallet,
    publicKey,
    connected,
    streamDetail,
    accountAddress,
    urlQueryAddress,
    previousWalletConnectState,
    setCanShowAccountDetails,
    setAddAccountPanelOpen,
    setLastStreamsSummary,
    setShouldLoadTokens,
    setStreamsSummary,
    refreshStreamList,
    setSelectedAsset,
    setStreamDetail,
    onTxConfirmed,
    onTxTimedout,
    startSwitch,
  ]);

  // Live data calculation
  useEffect(() => {

    if (!streamList || (!streamListv1 && !streamListv2)) { return; }

    const timeout = setTimeout(() => {
      refreshStreamSummary();
    }, 1000);

    return () => {
      clearTimeout(timeout);
    }

  }, [
    streamList,
    streamListv1,
    streamListv2,
    refreshStreamSummary,
  ]);

  // Live data calculation - Totals
  useEffect(() => {

    if (streamsSummary && accountTokens) {
      // Total USD value
      let sumMeanTokens = 0;
      accountTokens.forEach((asset: UserTokenAccount, index: number) => {
        const tokenPrice = getTokenPriceBySymbol(asset.symbol);
        if (asset.balance && tokenPrice) {
          sumMeanTokens += asset.balance * tokenPrice;
        }
      });
      setTotalTokenAccountsValue(sumMeanTokens);

      // Net Worth
      const total = sumMeanTokens + streamsSummary.totalNet + treasuriesTvl;
      setNetWorth(total);
    }

  }, [treasuriesTvl, streamsSummary, getTokenPriceBySymbol, accountTokens]);

  // Window resize listeners
  useEffect(() => {
    const resizeListener = () => {
      const NUM_CHARS = 4;
      const ellipsisElements = document.querySelectorAll(".overflow-ellipsis-middle");
      if (isValidAddress(accountAddressInput)) {
        for (let i = 0; i < ellipsisElements.length; ++i){
          const e = ellipsisElements[i] as HTMLElement;
          if (e.offsetWidth < e.scrollWidth){
            const text = e.textContent;
            e.dataset.tail = text?.slice(text.length - NUM_CHARS);
          }
        }
      } else {
        if (ellipsisElements?.length) {
          const e = ellipsisElements[0] as HTMLElement;
          e.dataset.tail = '';
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
  }, [accountAddressInput]);

  // Setup event listeners
  useEffect(() => {
    if (publicKey && canSubscribe) {
      setCanSubscribe(false);
      confirmationEvents.on(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut('Subscribed to event txConfirmed with:', 'onTxConfirmed', 'blue');
      confirmationEvents.on(EventType.TxConfirmTimeout, onTxTimedout);
      consoleOut('Subscribed to event txTimedout with:', 'onTxTimedout', 'blue');
    }
  }, [publicKey, canSubscribe, onTxConfirmed, onTxTimedout]);

  //////////////////
  // Transactions //
  //////////////////

  const onStartUnwrapTx = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    const createTx = async (): Promise<boolean> => {
      if (wallet) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        consoleOut('wrapAmount:', wSolBalance, 'blue')

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: `wrapAmount: ${wSolBalance}`
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: ''
        });

        return await unwrapSol(
          connection,                 // connection
          wallet,                     // wallet
          Keypair.generate(),
          wSolBalance                 // amount
        )
          .then((value) => {
            consoleOut("unwrapSol returned transaction:", value);
            // Stage 1 completed - The transaction is created and returned
            setTransactionStatus({
              lastOperation: TransactionStatus.InitTransactionSuccess,
              currentOperation: TransactionStatus.SignTransaction,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
              result: getTxIxResume(value)
            });
            transaction = value;
            return true;
          })
          .catch((error) => {
            console.error("unwrapSol transaction init error:", error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`
            });
            customLogger.logError('Unwrap transaction failed', { transcript: transactionLog });
            return false;
          });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Unwrap transaction failed', { transcript: transactionLog });
        return false;
      }
    };

    const signTx = async (): Promise<boolean> => {
      if (wallet && publicKey) {
        consoleOut("Signing transaction...");
        return await wallet
          .signTransaction(transaction)
          .then((signed: Transaction) => {
            consoleOut("signTransaction returned a signed transaction:", signed);
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
                result: { signer: `${publicKey.toBase58()}`, error: `${error}` }
              });
              customLogger.logError('Unwrap transaction failed', { transcript: transactionLog });
              return false;
            }
            setTransactionStatus({
              lastOperation: TransactionStatus.SignTransactionSuccess,
              currentOperation: TransactionStatus.SendTransaction,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
              result: { signer: publicKey.toBase58() }
            });
            return true;
          })
          .catch(error => {
            console.error("Signing transaction failed!");
            setTransactionStatus({
              lastOperation: TransactionStatus.SignTransaction,
              currentOperation: TransactionStatus.SignTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
              result: { signer: `${publicKey.toBase58()}`, error: `${error}` }
            });
            customLogger.logError('Unwrap transaction failed', { transcript: transactionLog });
            return false;
          });
      } else {
        console.error("Cannot sign transaction! Wallet not found!");
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot sign transaction! Wallet not found!'
        });
        customLogger.logError('Unwrap transaction failed', { transcript: transactionLog });
        return false;
      }
    };

    const sendTx = async (): Promise<boolean> => {
      if (wallet) {
        return await connection
          .sendEncodedTransaction(encodedTx)
          .then((sig) => {
            consoleOut("sendEncodedTransaction returned a signature:", sig);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction,
            });
            signature = sig;
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionSuccess),
              result: `signature: ${signature}`
            });
            return true;
          })
          .catch((error) => {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
              result: { error, encodedTx }
            });
            customLogger.logError('Unwrap transaction failed', { transcript: transactionLog });
            return false;
          });
      } else {
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.WalletNotFound,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot send transaction! Wallet not found!'
        });
        customLogger.logError('Unwrap transaction failed', { transcript: transactionLog });
        return false;
      }
    };

    if (wallet) {
      setIsUnwrapping(true);
      const create = await createTx();
      consoleOut("created:", create);
      if (create) {
        const sign = await signTx();
        consoleOut("signed:", sign);
        if (sign) {
          const sent = await sendTx();
          consoleOut("sent:", sent);
          if (sent) {
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.Unwrap,
              finality: "confirmed",
              txInfoFetchStatus: "fetching",
              loadingTitle: 'Confirming transaction',
              loadingMessage: `Unwrap ${formatThousands(wSolBalance, NATIVE_SOL.decimals)} SOL`,
              completedTitle: 'Transaction confirmed',
              completedMessage: `Successfully unwrapped ${formatThousands(wSolBalance, NATIVE_SOL.decimals)} SOL`
            });
          } else {
            openNotification({
              title: t('notifications.error-title'),
              description: t('notifications.error-sending-transaction'),
              type: "error"
            });
            setIsUnwrapping(false);
          }
        } else { setIsUnwrapping(false); }
      } else { setIsUnwrapping(false); }
    }
  }


  ///////////////
  // Rendering //
  ///////////////

  const renderNetworth = () => {
    return (
      <div className={`networth-list-item flex-fixed-right no-pointer ${selectedCategory === "networth" ? 'selected' : ''}`} onClick={() => {
        // setSelectedCategory("networth");
        // setSelectedAsset(undefined);
      }}>
        <div className="font-bold font-size-110 left">Net Worth</div>
        <div className="font-bold font-size-110 right">
          {toUsCurrency(netWorth)}
        </div>
      </div>
    );
  };

  const renderMoneyStreamsSummary = (
    <>
      <Tooltip title={publicKey ? "See your Money Streams" : "To see your Money Streams you need to connect your wallet"}>
        <div key="streams" onClick={() => {
          if (publicKey) {
            // setSelectedCategory("other-assets");
            // setSelectedOtherAssetsOption("msp-streams");
            // setSelectedAsset(undefined);
            navigate("/accounts/streams");
          }
        }} className={`transaction-list-row ${selectedCategory === "other-assets" && selectedOtherAssetsOption === "msp-streams" ? 'selected' : ''}`}>
          <div className="icon-cell">
            {loadingStreams ? (
              <div className="token-icon animate-border-loading">
                <div className="streams-count simplelink" onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}>
                  <span className="font-bold text-shadow"><SyncOutlined spin /></span>
                </div>
              </div>
            ) : (
              <div className={streamsSummary.totalNet !== 0 ? 'token-icon animate-border' : 'token-icon'}>
                <div className="streams-count simplelink" onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const treasurer = publicKey
                      ? publicKey
                      : urlQueryAddress
                        ? new PublicKey(urlQueryAddress)
                        : new PublicKey(accountAddress);
                    refreshStreamList(false, treasurer);
                  }}>
                  <span className="font-size-75 font-bold text-shadow">{kFormatter(streamsSummary.totalAmount) || 0}</span>
                </div>
              </div>
            )}
          </div>
          <div className="description-cell">
            <div className="title">{t('account-area.money-streams')}</div>
            {streamsSummary.totalAmount === 0 ? (
              <div className="subtitle">{t('account-area.no-money-streams')}</div>
            ) : (
              <div className="subtitle">{streamsSummary.incomingAmount} {t('streams.stream-stats-incoming')}, {streamsSummary.outgoingAmount} {t('streams.stream-stats-outgoing')}</div>
            )}
          </div>
          <div className="rate-cell">
            {streamsSummary.totalAmount === 0 ? (
              <span className="rate-amount">--</span>
            ) : (
              <>
                <div className="rate-amount">
                  {toUsCurrency(Math.abs(streamsSummary.totalNet))}
                </div>
                <div className="interval">{t('streams.streaming-balance')}</div>
              </>
            )}
          </div>
        </div>
      </Tooltip>
    </>
  );

  const renderAsset = (asset: UserTokenAccount, index: number) => {
    const onTokenAccountClick = () => {
      setSelectedCategory("user-account");
      selectAsset(asset, true, true);
    }
    const priceByAddress = getTokenPriceByAddress(asset.address);
    const tokenPrice = priceByAddress || getTokenPriceBySymbol(asset.symbol);
    const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
      event.currentTarget.src = FALLBACK_COIN_IMAGE;
      event.currentTarget.className = "error";
    };
    const isSelectedToken = (): boolean => {
      return selectedAsset && asset && selectedAsset.displayIndex === asset.displayIndex
        ? true
        : false;
    }

    return (
      <div key={`${index}`} onClick={onTokenAccountClick}
          className={`transaction-list-row ${isSelectedToken() && selectedCategory === "user-account"
            ? 'selected'
            : hideLowBalances && (asset.valueInUsd || 0) < ACCOUNTS_LOW_BALANCE_LIMIT
              ? 'hidden'
              : ''
          }`
        }>
        <div className="icon-cell">
          <div className="token-icon">
            {asset.logoURI ? (
              <img alt={`${asset.name}`} width={30} height={30} src={asset.logoURI} onError={imageOnErrorHandler} />
            ) : (
              <Identicon address={asset.address} style={{ width: "30", display: "inline-flex" }} />
            )}
          </div>
        </div>
        <div className="description-cell">
          <div className="title">
            {asset.symbol}
            {tokenPrice > 0 ? (
              <span className={`badge small ml-1 ${theme === 'light' ? 'golden fg-dark' : 'darken'}`}>
                {toUsCurrency(tokenPrice)}
              </span>
            ) : (null)}
          </div>
          <div className="subtitle text-truncate">{asset.address === WRAPPED_SOL_MINT_ADDRESS ? 'Wrapped SOL' : asset.name}</div>
        </div>
        <div className="rate-cell">
          <div className="rate-amount">
            {toUsCurrency(asset.valueInUsd || 0)}
          </div>
          <div className="interval">
              {(asset.balance || 0) > 0 ? formatThousands(asset.balance || 0, asset.decimals, asset.decimals) : '0'}
          </div>
        </div>
      </div>
    );
  };

  const renderAssetsList = (
    <>
      {accountTokens && accountTokens.length > 0 ? (
        <>
          {wSolBalance > 0 && (
              <div className="utility-box">
                  <div className="well mb-1">
                      <div className="flex-fixed-right align-items-center">
                          <div className="left">You have {formatThousands(wSolBalance, NATIVE_SOL.decimals, NATIVE_SOL.decimals)} <strong>wrapped SOL</strong> in your wallet. Click to unwrap to native SOL.</div>
                          <div className="right">
                              <Button
                                  type="primary"
                                  shape="round"
                                  disabled={isUnwrapping}
                                  onClick={onStartUnwrapTx}
                                  size="small">
                                  {isUnwrapping ? 'Unwrapping SOL' : 'Unwrap SOL'}
                              </Button>
                          </div>
                      </div>
                  </div>
              </div>
          )}
          {/* Render user token accounts */}
          {accountTokens.map((asset, index) => renderAsset(asset, index))}
        </>
      ) : tokensLoaded ? (
        <div className="flex flex-center">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      ) : (
        <div className="flex flex-center">
          <Spin indicator={antIcon} />
        </div>
      )}
    </>
  );

  const renderActivityList = () => {
    const hasItems = hasItemsToRender();

    if (status === FetchStatus.Fetching && !hasItems) {
      return (
        <div className="flex flex-center">
          <Spin indicator={antIcon} />
        </div>
      );
    }

    return (
      <>
        {/* Activity list */}
        <div className={`transaction-list-data-wrapper ${
          (status === FetchStatus.Fetched && !hasTransactions()) ||
           status === FetchStatus.FetchFailed
            ? 'h-100'
            : 'vertical-scroll'
           }`
          }>
          <div className="activity-list h-100">
            {
              hasTransactions() ? (
                <div className="item-list-body compact">
                  {renderTransactions()}
                </div>
              ) : status === FetchStatus.Fetched && !hasTransactions() ? (
                <div className="h-100 flex-center">
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{t('assets.no-transactions')}</p>} />
                </div>
              ) : status === FetchStatus.FetchFailed && (
                <div className="h-100 flex-center">
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{t('assets.loading-error')}</p>} />
                </div>
              )
            }
            {lastTxSignature && (
                <div className="mt-1 text-center">
                    <span className={status === FetchStatus.Fetching ? 'no-pointer' : 'secondary-link underline-on-hover'}
                      role="link"
                      onClick={() => startSwitch()}>
                    {status === FetchStatus.Fetching ? (
                      <>
                        <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
                        <span className="no-pointer fg-orange-red pulsate-fast">{t('general.loading')}</span>
                      </>
                    ) : t('general.cta-load-more')}
                    </span>
                </div>
            )}
          </div>
        </div>
      </>
    );
  };

  const renderSolanaIcon = (
    <img className="token-icon" src="/solana-logo.png" alt="Solana logo" />
  );

  const renderTransactions = () => {
    if (transactions) {
      if (isSelectedAssetNativeAccount()) {
        // Get amount change for each tx
        const getChange = (accountIndex: number, meta: ParsedConfirmedTransactionMeta | null): number => {
          if (meta !== null && accountIndex !== -1) {
            const prevBalance = meta.preBalances[accountIndex] || 0;
            const postbalance = meta.postBalances[accountIndex] || 0;
            const change = getAmountFromLamports(postbalance) - getAmountFromLamports(prevBalance);
            // consoleOut(
            //   `prev: ${getAmountFromLamports(prevBalance)}, chge: ${change}, post: ${getAmountFromLamports(postbalance)}`, '',
            //   change === 0 ? 'red' : 'dkgray'
            // );
            return change;
          }
          return 0;
        }
        // Render only txs that have SOL changes
        const filtered = transactions.filter(tx => {
          const meta = tx.parsedTransaction && tx.parsedTransaction.meta
            ? tx.parsedTransaction.meta
            : null;
          if (!meta || meta.err !== null) { return false; }
          const accounts = tx.parsedTransaction.transaction.message.accountKeys;
          const accIdx = accounts.findIndex(acc => acc.pubkey.toBase58() === accountAddress);
          if (isSelectedAssetNativeAccount() && accIdx === -1) { return false; }
          const change = getChange(accIdx, meta);
          return isSelectedAssetNativeAccount() && change !== 0 ? true : false;
        });
        return filtered?.map((trans: MappedTransaction, index: number) => {
          return <TransactionItemView
                    key={`${index}`}
                    transaction={trans}
                    selectedAsset={selectedAsset as UserTokenAccount}
                    accountAddress={accountAddress}
                    tokenAccounts={accountTokens} />;
        });
      } else {
        // Render the transactions collection
        return transactions?.map((trans: MappedTransaction, index: number) => {
          if (trans.parsedTransaction && trans.parsedTransaction.meta && trans.parsedTransaction.meta.err === null) {
            return <TransactionItemView
                      key={`${index}`}
                      transaction={trans}
                      selectedAsset={selectedAsset as UserTokenAccount}
                      accountAddress={accountAddress}
                      tokenAccounts={accountTokens} />;
          }
          return null;
        });
      }
    } else return null;
  };

  const userAssetOptions = (
    <Menu>
      <Menu.Item key="1" onClick={reloadSwitch}>
        <span className="menu-item-text">Refresh asset</span>
      </Menu.Item>
      {isSelectedAssetNativeAccount() ? (
        <Menu.Item key="2" onClick={showWrapSolModal}>
          <span className="menu-item-text">Wrap SOL</span>
        </Menu.Item>
      ) : (
        <Menu.Item key="3" onClick={showCloseAssetModal}>
          <span className="menu-item-text">Close account</span>
        </Menu.Item>
      )}
    </Menu>
  );

  const assetListOptions = (
    <Menu>
      <Menu.Item key="10" onClick={showSuggestAssetModal}>
        <IconLightBulb className="mean-svg-icons" />
        <span className="menu-item-text">Suggest an asset</span>
      </Menu.Item>
      {(accountTokens && accountTokens.length > 0) && (
        <>
          {hideLowBalances ? (
            <Menu.Item key="11" onClick={() => toggleHideLowBalances(false)}>
              <IconEyeOn className="mean-svg-icons" />
              <span className="menu-item-text">Show low balances</span>
            </Menu.Item>
          ) : (
            <Menu.Item key="12" onClick={() => toggleHideLowBalances(true)}>
              <IconEyeOff className="mean-svg-icons" />
              <span className="menu-item-text">Hide low balances</span>
            </Menu.Item>
          )}
        </>
      )}
      {canActivateMergeTokenAccounts() && (
        <Menu.Item key="13" onClick={() => {
          if (selectedAsset && tokenAccountGroups) {
            const acc = tokenAccountGroups.has(selectedAsset.address);
            if (acc) {
              const item = tokenAccountGroups.get(selectedAsset.address);
              if (item) {
                setSelectedTokenMergeGroup(item);
                resetTransactionStatus();
                showTokenMergerModal();
              }
            }
          }
        }}>
          <MergeCellsOutlined />
          <span className="menu-item-text">{t('assets.merge-accounts-cta')}</span>
        </Menu.Item>
      )}
    </Menu>
  );

  const renderUserAccountAssetCtaRow = () => {
    if (!selectedAsset) { return null; }

    return (
      <div className="flex-fixed-right cta-row">
        <Space className="left" size="middle" wrap>
          {selectedAsset.name !== 'Custom account' ? (
            <>
              <Tooltip placement="bottom" title={isSelectedAssetNativeAccount() ? "SOL is not available for money streams, please use wSOL instead." : ""}>
                <Button
                  type="default"
                  shape="round"
                  size="small"
                  className="thin-stroke"
                  disabled={isSelectedAssetNativeAccount()}
                  onClick={onSendAsset}>
                  <span>Send</span>
                </Button>
              </Tooltip>
              <Button
                type="default"
                shape="round"
                size="small"
                className="thin-stroke"
                onClick={showReceiveSplOrSolModal}>
                <span>Receive</span>
              </Button>
              {!isSelectedAssetWsol() && (
                <Button
                  type="default"
                  shape="round"
                  size="small"
                  className="thin-stroke"
                  onClick={onExchangeAsset}>
                  <span>Exchange</span>
                </Button>
              )}
              {!isSelectedAssetWsol() && (
                <Button
                  type="default"
                  shape="round"
                  size="small"
                  className="thin-stroke"
                  onClick={handleGoToInvestClick}>
                  <span>Invest</span>
                </Button>
              )}
              {isSelectedAssetWsol() && (
                <Button
                  type="default"
                  shape="round"
                  size="small"
                  className="thin-stroke"
                  onClick={showUnwrapSolModal}>
                  <span>Unwrap</span>
                </Button>
              )}
              {!isSelectedAssetWsol() && (
                <Button
                  type="default"
                  shape="round"
                  size="small"
                  className="thin-stroke"
                  onClick={showDepositOptionsModal}>
                  <span>Buy</span>
                </Button>
              )}
            </>
          ) : (
            <h4 className="mb-0">The token for this Custom account was not found in the Solana token list</h4>
          )}
        </Space>
        <Dropdown overlay={userAssetOptions} placement="bottomRight" trigger={["click"]}>
          <span className="icon-button-container">
            <Button
              type="default"
              shape="circle"
              size="middle"
              icon={<IconVerticalEllipsis className="mean-svg-icons"/>}
              onClick={(e) => e.preventDefault()}
            />
          </span>
        </Dropdown>
      </div>
    );
  };

  const renderUserAccountAssetMeta = () => {
    if (!selectedAsset) { return null; }

    const priceByAddress = getTokenPriceByAddress(selectedAsset.address);
    const tokenPrice = priceByAddress || getTokenPriceBySymbol(selectedAsset.symbol);
    return (
      <>
        <div className="accounts-category-meta">
          <div className="mb-2">
            <Row>
              <Col span={14}>
                <div className="info-label">
                  Balance
                </div>
                <div className="transaction-detail-row">
                  <div className="info-data">
                    {
                      `${formatThousands(
                        selectedAsset.balance || 0,
                        selectedAsset.decimals,
                        selectedAsset.decimals
                      )} ${selectedAsset.symbol}`
                    }
                  </div>
                </div>
                <div className="info-extra font-size-85">
                  <AddressDisplay
                    address={selectedAsset.publicAddress as string}
                    iconStyles={{ width: "16", height: "16" }}
                    newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${selectedAsset.publicAddress}${getSolanaExplorerClusterParam()}`}
                  />
                </div>
              </Col>
              <Col span={10}>
                <div className="info-label">
                  Value
                </div>
                <div className="transaction-detail-row">
                  <span className="info-data">
                    {toUsCurrency((selectedAsset.balance || 0) * tokenPrice)}
                  </span>
                </div>
              </Col>
            </Row>
          </div>
        </div>
      </>
    );
  };

  const renderCategoryMeta = () => {
    switch (selectedCategory) {
      case "networth":
        break;
      case "user-account":
        return renderUserAccountAssetMeta();
      case "other-assets":
        break;
      default:
        break;
    }
  };

  const getRandomEmoji = useCallback(() => {
    const totalEmojis = EMOJIS.length;
    if (totalEmojis) {
      const randomIndex = Math.floor(Math.random() * totalEmojis);
      return (
        <span className="emoji" aria-label={EMOJIS[randomIndex]} role="img">{EMOJIS[randomIndex]}</span>
      );
    }
    return null;
  }, []);

  const renderQrCodeAndAddress = (
    <div className="text-center mt-3">
      <h3 className="mb-3">{t('assets.no-balance.line3')}</h3>
      <div className={theme === 'light' ? 'qr-container bg-white' : 'qr-container bg-black'}>
        <QRCodeSVG
          value={accountAddress}
          size={200}
        />
      </div>
      <div className="flex-center font-size-70 mb-2">
        <AddressDisplay
          address={accountAddress}
          showFullAddress={true}
          iconStyles={{ width: "15", height: "15" }}
          newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${publicKey?.toBase58()}${getSolanaExplorerClusterParam()}`}
        />
      </div>
      <div className="font-light font-size-75 px-4">{t('assets.no-balance.line4')}</div>
      <div className="font-light font-size-75 px-4">{t('assets.no-balance.line5')}</div>
    </div>
  );

  const renderTokenBuyOptions = () => {
    return (
      <div className="buy-token-options">
        <h3 className="text-center mb-3">{t('assets.no-balance.line1', { tokenSymbol: selectedAsset?.symbol })} {getRandomEmoji()}</h3>
        <h3 className="text-center mb-2">{t('assets.no-balance.line2')}</h3>
        <Space size={[16, 16]} wrap>
          {isSelectedAssetNativeAccount() && (
            <Button shape="round" type="ghost"
                    onClick={showDepositOptionsModal}>{t('assets.no-balance.cta1', { tokenSymbol: selectedAsset?.symbol })}</Button>
          )}
          {/* For SOL the first option is ok, any other token, we can use the exchange */}
          {selectedAsset?.publicAddress !== accountAddress && (
            <Button shape="round" type="ghost"
                    onClick={handleGoToExchangeClick}>{t('assets.no-balance.cta2')}</Button>
          )}
        </Space>
        {renderQrCodeAndAddress}
      </div>
    );
  };

  return (
    <>
      <div className="container main-container">

        {location.pathname === '/accounts/streams' ? (
          <Helmet>
            <title>Streams - Mean Finance</title>
            <link rel="canonical" href="/accounts/streams" />
            <meta name="description" content="Streams. Manage your live money streams" />
            <meta name="keywords" content="streams, transfers, send money" />
          </Helmet>
        ) : (
          <Helmet>
            <title>Accounts - Mean Finance</title>
            <link rel="canonical" href="/accounts" />
            <meta name="description" content="Accounts. Keep track of your assets and transactions" />
            <meta name="google-site-verification" content="u-gc96PrpV7y_DAaA0uoo4tc2ffcgi_1r6hqSViM-F8" />
            <meta name="keywords" content="assets, token accounts, transactions" />
          </Helmet>
        )}

        {/* {isLocal() && (
          <div className="debug-bar">
            <span className="ml-1">incoming:</span><span className="ml-1 font-bold fg-dark-active">{streamsSummary ? streamsSummary.incomingAmount : '-'}</span>
            <span className="ml-1">outgoing:</span><span className="ml-1 font-bold fg-dark-active">{streamsSummary ? streamsSummary.outgoingAmount : '-'}</span>
            <span className="ml-1">totalAmount:</span><span className="ml-1 font-bold fg-dark-active">{streamsSummary ? streamsSummary.totalAmount : '-'}</span>
            <span className="ml-1">totalNet:</span><span className="ml-1 font-bold fg-dark-active">{streamsSummary ? streamsSummary.totalNet : '-'}</span>
            <span className="ml-1">treasuriesTvl:</span><span className="ml-1 font-bold fg-dark-active">{treasuriesTvl || '0'}</span>
          </div>
        )} */}

        {/* This is a SEO mandatory h1 but it is not visible */}
        {location.pathname === '/accounts/streams' ? (
          <h1 className="mandatory-h1">Manage your live money streams</h1>
        ) : (
          <h1 className="mandatory-h1">Keep track of your assets and transactions</h1>
        )}

        <div className={(canShowAccountDetails && accountAddress) ? 'interaction-area' : 'interaction-area flex-center h-75'}>

          {location.pathname === '/accounts/streams' ? (
            <Streams />
          ) : (
            <>
              {canShowAccountDetails && accountAddress ? (
                <div className={`meanfi-two-panel-layout ${detailsPanelOpen ? 'details-open' : ''}`}>

                  {/* Left / top panel */}
                  <div className="meanfi-two-panel-left">
                    <div className="meanfi-panel-heading">
                      <span className="title">{t('assets.screen-title')}</span>
                      <div className="user-address">
                        <span className="fg-secondary">
                          (<span className="simplelink underline-on-hover" onClick={() => copyAddressToClipboard(accountAddress)}>
                            {shortenAddress(accountAddress, 5)}
                          </span>)
                        </span>
                        {!connected && (
                          <span className="icon-button-container">
                            <Tooltip placement="bottom" title={t('assets.account-address-change-cta')}>
                              <Button
                                type="default"
                                shape="circle"
                                size="middle"
                                icon={<EditOutlined />}
                                onClick={handleScanAnotherAddressButtonClick}
                              />
                            </Tooltip>
                          </span>
                        )}
                        <span className="icon-button-container">
                          <Tooltip placement="bottom" title={t('assets.account-address-copy-cta')}>
                            <Button
                              type="default"
                              shape="circle"
                              size="middle"
                              icon={<IconExternalLink className="mean-svg-icons" style={{width: "18", height: "18"}} />}
                              onClick={() => openLinkInNewTab(`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${accountAddress}${getSolanaExplorerClusterParam()}`)}
                            />
                          </Tooltip>
                        </span>
                      </div>
                    </div>
                    <div className="inner-container">

                      {/* Net Worth header (sticky) */}
                      {renderNetworth()}

                      {/* Middle area (vertically flexible block of items) */}
                      <div className="item-block vertical-scroll">

                        <div className="asset-category-title flex-fixed-right">
                          <div className="title">Streaming Assets (2)</div>
                          <div className="amount">{toUsCurrency(streamsSummary.totalNet + treasuriesTvl)}</div>
                        </div>
                        <div className="asset-category">
                          {renderMoneyStreamsSummary}
                          <TreasuriesSummary
                            address={
                              publicKey
                                ? publicKey.toBase58()
                                : urlQueryAddress
                                  ? urlQueryAddress
                                  : accountAddress
                            }
                            connection={connection}
                            ms={ms}
                            msp={msp}
                            selected={selectedCategory === "other-assets" && selectedOtherAssetsOption === "msp-treasuries"}
                            onNewValue={(value: number) => setTreasuriesTvl(value)}
                            onSelect={() => {
                              if (publicKey) {
                                // setSelectedCategory("other-assets");
                                // setSelectedOtherAssetsOption("msp-streams");
                                // setSelectedAsset(undefined);
                              }
                            }}
                          />
                        </div>

                        <div className="asset-category-title flex-fixed-right">
                          <div className="title">Assets in wallet ({accountTokens.length})</div>
                          <div className="amount">{toUsCurrency(totalTokenAccountsValue)}</div>
                        </div>
                        <div className="asset-category flex-column">
                          {renderAssetsList}
                        </div>

                      </div>

                      {/* Bottom CTAs */}
                      <div className="bottom-ctas">
                        <div className="primary-action">
                          <Button
                            block
                            className="flex-center"
                            type="primary"
                            shape="round"
                            onClick={showInitAtaModal}>
                            <IconAdd className="mean-svg-icons" />
                            <span className="ml-1">Add asset</span>
                          </Button>
                        </div>
                        <Dropdown className="options-dropdown"
                          overlay={assetListOptions}
                          placement="bottomRight"
                          trigger={["click"]}>
                          <span className="icon-button-container">
                            <Button
                              type="default"
                              shape="circle"
                              size="middle"
                              icon={<IconVerticalEllipsis className="mean-svg-icons"/>}
                              onClick={(e) => e.preventDefault()}
                            />
                          </span>
                        </Dropdown>
                      </div>

                    </div>
                  </div>

                  {/* Right / down panel */}
                  <div className="meanfi-two-panel-right">
                    <div className="meanfi-panel-heading"><span className="title">{t('assets.history-panel-title')}</span></div>
                    <div className="inner-container">
                      {canShowBuyOptions() ? renderTokenBuyOptions() : (
                        <div className="flexible-column-bottom">
                          <div className="top">
                            {renderCategoryMeta()}
                            {selectedCategory === "user-account" && renderUserAccountAssetCtaRow()}
                            {/* Activity table heading */}
                            {hasItemsToRender() && (
                              <div className="stats-row">
                                <div className="item-list-header compact">
                                  <div className="header-row">
                                    <div className="std-table-cell first-cell">&nbsp;</div>
                                    <div className="std-table-cell responsive-cell">{t('assets.history-table-activity')}</div>
                                    <div className="std-table-cell responsive-cell pr-2 text-right">{t('assets.history-table-amount')}</div>
                                    <div className="std-table-cell responsive-cell pr-2 text-right">{t('assets.history-table-postbalance')}</div>
                                    <div className="std-table-cell responsive-cell pl-2">{t('assets.history-table-date')}</div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                          <div className={`bottom ${!hasItemsToRender() ? 'h-100 flex-column' : ''}`}>
                            {selectedCategory === "user-account" && renderActivityList()}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              ) : (
                <>
                  <div className="boxed-area container-max-width-600 add-account">
                    {accountAddress && (
                      <div className="back-button">
                        <span className="icon-button-container">
                          <Tooltip placement="bottom" title={t('assets.back-to-assets-cta')}>
                            <Button
                              type="default"
                              shape="circle"
                              size="middle"
                              className="hidden-xs"
                              icon={<ArrowLeftOutlined />}
                              onClick={handleBackToAccountDetailsButtonClick}
                            />
                          </Tooltip>
                        </span>
                      </div>
                    )}
                    <h2 className="text-center mb-3 px-5">{t('assets.account-add-heading')} {renderSolanaIcon} Solana</h2>
                    <div className="flexible-left mb-3">
                      <div className="transaction-field left">
                        <div className="transaction-field-row">
                          <span className="field-label-left">{t('assets.account-address-label')}</span>
                          <span className="field-label-right">&nbsp;</span>
                        </div>
                        <div className="transaction-field-row main-row">
                          <span className="input-left recipient-field-wrapper">
                            <input id="payment-recipient-field"
                              className="w-100 general-text-input"
                              autoComplete="on"
                              autoCorrect="off"
                              type="text"
                              onFocus={handleAccountAddressInputFocusIn}
                              onChange={handleAccountAddressInputChange}
                              onBlur={handleAccountAddressInputFocusOut}
                              placeholder={t('assets.account-address-placeholder')}
                              required={true}
                              spellCheck="false"
                              value={accountAddressInput}/>
                            <span id="payment-recipient-static-field"
                                  className={`${accountAddressInput ? 'overflow-ellipsis-middle' : 'placeholder-text'}`}>
                              {accountAddressInput || t('assets.account-address-placeholder')}
                            </span>
                          </span>
                          <div className="addon-right simplelink" onClick={showQrScannerModal}>
                            <QrcodeOutlined />
                          </div>
                        </div>
                        <div className="transaction-field-row">
                          <span className="field-label-left">
                            {accountAddressInput && !isValidAddress(accountAddressInput) ? (
                              <span className="fg-red">
                                {t('transactions.validation.address-validation')}
                              </span>
                            ) : (
                              <span>&nbsp;</span>
                            )}
                          </span>
                        </div>
                      </div>
                      {/* Go button */}
                      <Button
                        className="main-cta right"
                        type="primary"
                        shape="round"
                        size="large"
                        onClick={onAddAccountAddress}
                        disabled={!isValidAddress(accountAddressInput)}>
                        {t('assets.account-add-cta-label')}
                      </Button>
                    </div>
                    <div className="text-center">
                      <span className="mr-1">{t('assets.create-account-help-pre')}</span>
                      <a className="primary-link font-medium" href={SOLANA_WALLET_GUIDE} target="_blank" rel="noopener noreferrer">
                        {t('assets.create-account-help-link')}
                      </a>
                      <span className="ml-1">{t('assets.create-account-help-post')}</span>
                    </div>
                  </div>
                  {/* QR scan modal */}
                  {isQrScannerModalVisible && (
                    <QrScannerModal
                      isVisible={isQrScannerModalVisible}
                      handleOk={onAcceptQrScannerModal}
                      handleClose={closeQrScannerModal}/>
                  )}
                </>
              )}
            </>
          )}

        </div>

      </div>

      {(connection && selectedTokenMergeGroup && isTokenMergerModalVisible) && (
        <AccountsMergeModal
          connection={connection}
          isVisible={isTokenMergerModalVisible}
          handleOk={onFinishedTokenMerge}
          handleClose={onCloseTokenMergeModal}
          tokenMint={selectedTokenMergeGroup[0].parsedInfo.mint}
          tokenGroup={selectedTokenMergeGroup}
          accountTokens={accountTokens}
        />
      )}

      {isReceiveSplOrSolModalOpen && selectedAsset && (
        <ReceiveSplOrSolModal
          address={selectedAsset.publicAddress || ''}
          accountAddress={accountAddress}
          isVisible={isReceiveSplOrSolModalOpen}
          handleClose={hideReceiveSplOrSolModal}
          tokenSymbol={selectedAsset.symbol}
        />
      )}

      {isSendAssetModalOpen && selectedAsset && (
        <SendAssetModal
          selectedToken={selectedAsset}
          isVisible={isSendAssetModalOpen}
          handleClose={hideSendAssetModal}
          selected={"one-time"}
        />
      )}

      {isWrapSolModalOpen && (
        <WrapSolModal
          isVisible={isWrapSolModalOpen}
          handleOk={onAfterWrap}
          handleClose={hideWrapSolModal}
        />
      )}

      {isUnwrapSolModalOpen && (
        <UnwrapSolModal
          isVisible={isUnwrapSolModalOpen}
          handleOk={onAfterUnwrap}
          handleClose={hideUnwrapSolModal}
        />
      )}

      {/* {isExchangeAssetModalOpen && publicKey && selectedAsset && (
        <ExchangeAssetModal
          isVisible={isExchangeAssetModalOpen}
          handleClose={hideExchangeAssetModal}
          tokenSymbol={selectedAsset.symbol}
        />
      )} */}

      {isSuggestAssetModalOpen && (
        <AccountsSuggestAssetModal
          handleOk={hideSuggestAssetModal}
          handleClose={hideSuggestAssetModal}
          isVisible={isSuggestAssetModalOpen}
        />
      )}

      {isInitAtaModalOpen && (
        <AccountsInitAtaModal
          connection={connection}
          handleOk={hideInitAtaModal}
          handleClose={hideInitAtaModal}
          isVisible={isInitAtaModalOpen}
          ownedTokenAccounts={userOwnedTokenAccounts}
        />
      )}

      {isCloseAssetModalOpen && selectedAsset && (
        <AccountsCloseAssetModal
          connection={connection}
          handleOk={hideCloseAssetModal}
          handleClose={hideCloseAssetModal}
          isVisible={isCloseAssetModalOpen}
          asset={selectedAsset}
        />
      )}

      <PreFooter />
    </>
  );

};
