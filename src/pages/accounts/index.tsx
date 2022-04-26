import React, { useCallback, useContext, useMemo } from 'react';
import "./style.scss";
import {
  ArrowLeftOutlined,
  BarChartOutlined,
  CopyOutlined,
  EditOutlined,
  LoadingOutlined,
  QrcodeOutlined,
  ReloadOutlined,
  SendOutlined,
  SwapOutlined,
  SyncOutlined
} from '@ant-design/icons';
import { Connection, LAMPORTS_PER_SOL, ParsedConfirmedTransactionMeta, PublicKey } from '@solana/web3.js';
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
  getFormattedRateAmount,
  getTokenAmountAndSymbolByTokenAddress,
  shortenAddress
} from '../../utils/utils';
import { Button, Col, Dropdown, Empty, Menu, Result, Row, Space, Spin, Tooltip } from 'antd';
import { consoleOut, copyText, friendlyDisplayDecimalPlaces, isValidAddress, kFormatter, toUsCurrency } from '../../utils/ui';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import {
  SOLANA_WALLET_GUIDE,
  SOLANA_EXPLORER_URI_INSPECT_ADDRESS,
  EMOJIS,
  TRANSACTIONS_PER_PAGE,
  FALLBACK_COIN_IMAGE,
  WRAPPED_SOL_MINT_ADDRESS
} from '../../constants';
import { QrScannerModal } from '../../components/QrScannerModal';
import { Helmet } from "react-helmet";
import { IconCopy, IconShoppingCart, IconVerticalEllipsis } from '../../Icons';
import { fetchAccountHistory, MappedTransaction } from '../../utils/history';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import useLocalStorage from '../../hooks/useLocalStorage';
import { refreshCachedRpc } from '../../models/connections-hq';
import { AccountTokenParsedInfo } from '../../models/token';
import { getTokenByMintAddress, TokenInfo } from '../../utils/tokens';
import { TokenInfo as SolanaTokenInfo } from "@solana/spl-token-registry";
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
import { ExchangeAssetModal } from '../../components/ExchangeAssetModal';

const antIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;
const QRCode = require('qrcode.react');
type CategoryOption = "networth" | "user-account" | "other-assets";

export const AccountsNewView = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { endpoint } = useConnectionConfig();
  const { publicKey, connected, wallet } = useWallet();
  const { theme } = useContext(AppStateContext);
  const {
    coinPrices,
    userTokens,
    streamList,
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
    streamProgramAddress,
    canShowAccountDetails,
    loadingStreamsSummary,
    streamV2ProgramAddress,
    previousWalletConnectState,
    setLoadingStreamsSummary,
    setCanShowAccountDetails,
    showDepositOptionsModal,
    setAddAccountPanelOpen,
    setLastStreamsSummary,
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

  const { t } = useTranslation('common');
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [accountAddressInput, setAccountAddressInput] = useState<string>('');
  const [tokensLoaded, setTokensLoaded] = useState(false);
  const [accountTokens, setAccountTokens] = useState<UserTokenAccount[]>([]);
  const [meanSupportedTokens, setMeanSupportedTokens] = useState<UserTokenAccount[]>([]);
  const [extraUserTokensSorted, setExtraUserTokensSorted] = useState<UserTokenAccount[]>([]);
  const [solAccountItems, setSolAccountItems] = useState(0);
  const [tokenAccountGroups, setTokenAccountGroups] = useState<Map<string, AccountTokenParsedInfo[]>>();
  const [selectedTokenMergeGroup, setSelectedTokenMergeGroup] = useState<AccountTokenParsedInfo[]>();

  const [selectedCategory, setSelectedCategory] = useState<CategoryOption>("user-account");
  const [totalTokensHolded, setTotalTokensHolded] = useState(0);
  const [totalTokenAccountsValue, setTotalTokenAccountsValue] = useState(0);
  const [netWorth, setNetWorth] = useState(0);

  // Flow control
  const [status, setStatus] = useState<FetchStatus>(FetchStatus.Iddle);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [shouldLoadTransactions, setShouldLoadTransactions] = useState(false);
  const [hideLowBalances, setHideLowBalances] = useLocalStorage('hideLowBalances', true);

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
    if (publicKey) {
      console.log('New MSP from /acounts');
      return new MSP(
        endpoint,
        streamV2ProgramAddress,
        "confirmed"
      );
    }
    return undefined;
  }, [
    publicKey,
    endpoint,
    streamV2ProgramAddress
  ]);

  ////////////////////////////
  //   Events and actions   //
  ////////////////////////////

  // Token Merger Modal
  const hideTokenMergerModal = useCallback(() => setTokenMergerModalVisibility(false), []);
  const showTokenMergerModal = useCallback(() => setTokenMergerModalVisibility(true), []);
  const [isTokenMergerModalVisible, setTokenMergerModalVisibility] = useState(false);
  const onFinishedTokenMerge = useCallback(() => {
    hideTokenMergerModal();
    setShouldLoadTokens(true);
  }, [
    setShouldLoadTokens,
    hideTokenMergerModal
  ]);

  // Receive SPL or SOL modal
  const [isReceiveSplOrSolModalOpen, setIsReceiveSplOrSolModalOpen] = useState(false);
  const hideReceiveSplOrSolModal = useCallback(() => setIsReceiveSplOrSolModalOpen(false), []);
  const showReceiveSplOrSolModal = useCallback(() => setIsReceiveSplOrSolModalOpen(true), []);

  // Send selected token
  const [isSendAssetModalOpen, setIsSendAssetModalOpen] = useState(false);
  const hideSendAssetModal = useCallback(() => setIsSendAssetModalOpen(false), []);
  const showSendAssetModal = useCallback(() => setIsSendAssetModalOpen(true), []);

  // Exchange selected token
  const [isExchangeAssetModalOpen, setIsExchangeAssetModalOpen] = useState(false);
  const hideExchangeAssetModal = useCallback(() => setIsExchangeAssetModalOpen(false), []);
  const showExchangeAssetModal = useCallback(() => setIsExchangeAssetModalOpen(true), []);

  const startSwitch = useCallback(() => {
    setStatus(FetchStatus.Fetching);
    setLoadingTransactions(false);
    setShouldLoadTransactions(true);
  }, [])

  const reloadSwitch = useCallback(() => {
    setShouldLoadTokens(true);
    setSolAccountItems(0);
    setTransactions(undefined);
    startSwitch();
  }, [
    startSwitch,
    setTransactions,
    setShouldLoadTokens
  ])

  const selectAsset = useCallback((
    asset: UserTokenAccount,
    clearTxList: boolean = true,
    openDetailsPanel: boolean = false
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

    let token: TokenInfo | null;
    if (isSelectedAssetNativeAccount()) {
      token = getTokenByMintAddress(WRAPPED_SOL_MINT_ADDRESS);
    } else {
      token = getTokenByMintAddress(selectedAsset.address);
    }
    if (token) {
      setSelectedToken(token as SolanaTokenInfo);
    }
    showExchangeAssetModal();

  }, [isSelectedAssetNativeAccount, selectedAsset, setSelectedToken, showExchangeAssetModal]);

  const onSendAsset = useCallback(() => {
    if (!selectedAsset) { return; }

    let token: TokenInfo | null;
    if (isSelectedAssetNativeAccount()) {
      token = getTokenByMintAddress(WRAPPED_SOL_MINT_ADDRESS);
    } else {
      token = getTokenByMintAddress(selectedAsset.address);
    }
    if (token) {
      setSelectedToken(token as SolanaTokenInfo);
    }
    showSendAssetModal();

  }, [
    isSelectedAssetNativeAccount, selectedAsset, setSelectedToken, showSendAssetModal
  ]);

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

  const canShowBuyOptions = useCallback(() => {
    if (!selectedAsset) { return false; }
    return !selectedAsset.publicAddress ||
            (selectedAsset?.balance === 0 && !(
              (!isSelectedAssetNativeAccount() && hasTransactions()) ||
              (isSelectedAssetNativeAccount() && hasTransactions() && solAccountItems > 0)
            ))
      ? true
      : false
  }, [
    selectedAsset,
    solAccountItems,
    isSelectedAssetNativeAccount,
    hasTransactions,
  ]);

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

  const getPricePerToken = useCallback((token: UserTokenAccount): number => {
    if (!token || !token.symbol) { return 0; }
    const tokenSymbol = token.symbol.toUpperCase();
    const symbol = tokenSymbol[0] === 'W' ? tokenSymbol.slice(1) : tokenSymbol;

    return coinPrices && coinPrices[symbol]
      ? coinPrices[symbol]
      : 0;
  }, [coinPrices])

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

  const refreshStreamSummary = useCallback(async () => {

    if (!ms || !msp || !publicKey || (!streamListv1 && !streamListv2) || loadingStreamsSummary) { return; }

    setLoadingStreamsSummary(true);

    let resume: StreamsSummary = {
      totalNet: 0,
      incomingAmount: 0,
      outgoingAmount: 0,
      totalAmount: 0
    };

    const updatedStreamsv1 = await ms.refreshStreams(streamListv1 || [], publicKey);
    const updatedStreamsv2 = await msp.refreshStreams(streamListv2 || [], publicKey);

    // consoleOut('=========== Block strat ===========', '', 'orange');

    for (let stream of updatedStreamsv1) {

      const isIncoming = stream.beneficiaryAddress && stream.beneficiaryAddress === publicKey.toBase58()
        ? true
        : false;

      if (isIncoming) {
        resume['incomingAmount'] = resume['incomingAmount'] + 1;
      } else {
        resume['outgoingAmount'] = resume['outgoingAmount'] + 1;
      }

      // Get refreshed data
      let freshStream = await ms.refreshStream(stream) as StreamInfo;
      if (!freshStream || freshStream.state !== STREAM_STATE.Running) { continue; }

      const asset = getTokenByMintAddress(freshStream.associatedToken as string);
      const rate = asset ? getPricePerToken(asset as UserTokenAccount) : 0;
      if (isIncoming) {
        resume['totalNet'] = resume['totalNet'] + ((freshStream.escrowVestedAmount || 0) * rate);
      } else {
        resume['totalNet'] = resume['totalNet'] + ((freshStream.escrowUnvestedAmount || 0) * rate);
      }
    }

    resume['totalAmount'] = updatedStreamsv1.length;

    // consoleOut('totalNet v1:', resume['totalNet'], 'blue');

    for (let stream of updatedStreamsv2) {

      const isIncoming = stream.beneficiary && stream.beneficiary === publicKey.toBase58()
        ? true
        : false;

      if (isIncoming) {
        resume['incomingAmount'] = resume['incomingAmount'] + 1;
      } else {
        resume['outgoingAmount'] = resume['outgoingAmount'] + 1;
      }

      // Get refreshed data
      let freshStream = await msp.refreshStream(stream) as Stream;
      if (!freshStream || freshStream.status !== STREAM_STATUS.Running) { continue; }

      const asset = getTokenByMintAddress(freshStream.associatedToken as string);
      const pricePerToken = getPricePerToken(asset as UserTokenAccount);
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
    loadingStreamsSummary,
    setLastStreamsSummary, 
    setLoadingStreamsSummary, 
    setStreamsSummary,
    getPricePerToken
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


  /////////////////////
  // Data management //
  /////////////////////

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

    if (publicKey && (!streamList || streamList.length === 0)) {
      consoleOut('Loading streams with wallet connection...', '', 'green');
      refreshStreamList();
    }
  }, [
    wallet,
    publicKey,
    streamList,
    isFirstLoad,
    shouldLoadTokens,
    setTransactions,
    refreshStreamList,
    setShouldLoadTokens
  ]);

  // Fetch all the owned token accounts on demmand via setShouldLoadTokens(true)
  // Also, do this after any Tx is completed in places where token balances were indeed changed)
  useEffect(() => {
    if (!connection || !accountAddress || !shouldLoadTokens || !userTokens || userTokens.length === 0 || !splTokenList || splTokenList.length === 0 ) {
      return;
    }

    const timeout = setTimeout(() => {
      setShouldLoadTokens(false);
      setTokensLoaded(false);

      let meanTokensCopy = JSON.parse(JSON.stringify(userTokens)) as UserTokenAccount[];
      const splTokensCopy = JSON.parse(JSON.stringify(splTokenList)) as UserTokenAccount[];
      const pk = new PublicKey(accountAddress);

      // Fetch SOL balance.
      connection.getBalance(pk)
        .then(solBalance => {
          meanTokensCopy[0].balance = solBalance / LAMPORTS_PER_SOL;
          meanTokensCopy[0].publicAddress = accountAddress;

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
                if (tokenGroups.size > 0) {
                  consoleOut('tokenGroups:', tokenGroups, 'blue');
                }
                // Save groups for possible further merging
                if (tokenGroups.size) {
                  setTokenAccountGroups(tokenGroups);
                } else {
                  setTokenAccountGroups(undefined);
                }

                // Update balances in the mean token list
                accTks.forEach(item => {
                  let tokenIndex = 0;
                  // Locate the token in meanTokensCopy
                  tokenIndex = meanTokensCopy.findIndex(i => i.address === item.parsedInfo.mint);
                  if (tokenIndex !== -1) {
                    // If we didn't already filled info for this associated token address
                    if (!meanTokensCopy[tokenIndex].publicAddress) {
                      // Add it
                      meanTokensCopy[tokenIndex].publicAddress = item.pubkey.toBase58();
                      meanTokensCopy[tokenIndex].balance = item.parsedInfo.tokenAmount.uiAmount || 0;
                    } else if (meanTokensCopy[tokenIndex].publicAddress !== item.pubkey.toBase58()) {
                      // If we did and the publicAddress is different/new then duplicate this item with the new info
                      const newItem = JSON.parse(JSON.stringify(meanTokensCopy[tokenIndex])) as UserTokenAccount;
                      newItem.publicAddress = item.pubkey.toBase58();
                      newItem.balance = item.parsedInfo.tokenAmount.uiAmount || 0;
                      meanTokensCopy.splice(tokenIndex + 1, 0, newItem);
                    }
                  }
                });

                // Update balances in the SPL token list
                accTks.forEach(item => {
                  const tokenIndex = splTokensCopy.findIndex(i => i.address === item.parsedInfo.mint);
                  if (tokenIndex !== -1) {
                    splTokensCopy[tokenIndex].publicAddress = item.pubkey.toBase58();
                    splTokensCopy[tokenIndex].balance = item.parsedInfo.tokenAmount.uiAmount || 0;
                  }
                });

                // Create a list containing the tokens for the user accounts not in the meanTokensCopy
                const intersectedList = new Array<UserTokenAccount>();
                accTks.forEach(item => {
                  // Loop through the user token accounts and add the token account to the list: intersectedList
                  // If it is not already on the list (diferentiate token accounts of the same mint)
                  const isTokenAccountInTheList = meanTokensCopy.some(t => t.address === item.parsedInfo.mint && t.publicAddress === item.pubkey.toBase58());
                  const tokenFromSplTokenList = splTokensCopy.find(t => t.address === item.parsedInfo.mint);
                  if (tokenFromSplTokenList && !isTokenAccountInTheList) {
                    intersectedList.push(tokenFromSplTokenList);
                  }
                });
                let sortedList = intersectedList.sort((a, b) => {
                  var nameA = a.symbol.toUpperCase();
                  var nameB = b.symbol.toUpperCase();
                  if (nameA < nameB) {
                    return -1;
                  }
                  if (nameA > nameB) {
                    return 1;
                  }
                  // names must be equal
                  return 0;
                });
                meanTokensCopy.forEach(async (item: UserTokenAccount, index: number) => {
                  item.displayIndex = index;
                  item.isAta = await updateAtaFlag(item);
                });
                sortedList.forEach(async (item: UserTokenAccount, index: number) => {
                  item.displayIndex = meanTokensCopy.length + index;
                  item.isAta = await updateAtaFlag(item);
                });

                // Concatenate both lists
                const finalList = meanTokensCopy.concat(sortedList);
                consoleOut('Tokens (sorted):', finalList, 'blue');
                // Report in the console for debugging
                const tokenTable: any[] = [];
                finalList.forEach((item: UserTokenAccount, index: number) => tokenTable.push({
                    pubAddress: item.publicAddress ? shortenAddress(item.publicAddress, 6) : null,
                    mintAddress: shortenAddress(item.address, 6),
                    symbol: item.symbol,
                    balance: item.balance
                  })
                );
                console.table(tokenTable);
                // Update the state
                setAccountTokens(finalList);
                setExtraUserTokensSorted(sortedList);
                setMeanSupportedTokens(meanTokensCopy);
                setTokensLoaded(true);
              } else {
                setAccountTokens(meanTokensCopy);
                setExtraUserTokensSorted([]);
                setMeanSupportedTokens(meanTokensCopy);
                setTokensLoaded(true);
                refreshCachedRpc();
              }
              // Preset the first available token
              if (selectedAsset) {
                const meanTokenItemIndex = meanTokensCopy.findIndex(m => m.publicAddress === selectedAsset.publicAddress);
                if (meanTokenItemIndex !== -1) {
                  selectAsset(meanTokensCopy[meanTokenItemIndex], true);
                }
              } else {
                selectAsset(meanTokensCopy[0]);
              }
            })
            .catch(error => {
              console.error(error);
              setMeanSupportedTokens(meanTokensCopy);
              setAccountTokens(meanTokensCopy);
              setExtraUserTokensSorted([]);
              setTokensLoaded(true);
              selectAsset(meanTokensCopy[0], true);
              refreshCachedRpc();
            });
        })
        .catch(error => {
          console.error(error);
          refreshCachedRpc();
        });
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connection,
    shouldLoadTokens,
    accountAddress,
    selectedAsset,
    splTokenList,
    userTokens,
    selectAsset,
    updateAtaFlag,
    setShouldLoadTokens,
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
        refreshStreamList();
        setShouldLoadTokens(true);
        setAddAccountPanelOpen(false);
        setCanShowAccountDetails(true);
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'blue');
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
    previousWalletConnectState,
    setCanShowAccountDetails,
    setAddAccountPanelOpen,
    setLastStreamsSummary,
    setShouldLoadTokens,
    setStreamsSummary,
    refreshStreamList,
    setStreamDetail,
    startSwitch,
  ]);

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

  // Live data calculation
  useEffect(() => {

    if (!ms || !msp || !publicKey || !streamList || (!streamListv1 && !streamListv2)) { return; }

    const timeout = setTimeout(() => {
      refreshStreamSummary();
    }, 1000);

    return () => {
      clearTimeout(timeout);
    }

  }, [
    ms,
    msp,
    publicKey,
    streamList,
    streamListv1,
    streamListv2,
    streamsSummary,
    loadingStreamsSummary,
    setLoadingStreamsSummary,
    setLastStreamsSummary,
    refreshStreamSummary,
    setStreamsSummary,
    getPricePerToken,
  ]);

  // Live data calculation - Totals
  useEffect(() => {

    if (streamsSummary && meanSupportedTokens) {
      const meanSupportedTokensHolded = meanSupportedTokens.filter(t => t.balance).length;
      const extraUserTokensSortedHolded = extraUserTokensSorted.filter(t => t.balance).length;
      // Total tokens holded by the user
      const totalUserTokensHolded = meanSupportedTokensHolded + extraUserTokensSortedHolded;
      setTotalTokensHolded(totalUserTokensHolded);

      let sumMeanSupportedTokens = 0;
      let sumExtraUserTokensSorted = 0;
      meanSupportedTokens.forEach((asset: UserTokenAccount, index: number) => {
        const tokenPrice = getPricePerToken(asset);
        if (asset.balance && tokenPrice) {
          sumMeanSupportedTokens += asset.balance * tokenPrice;
        }
      });
      extraUserTokensSorted.forEach((asset: UserTokenAccount, index: number) => {
        const tokenPrice = getPricePerToken(asset);
        if (asset.balance && tokenPrice) {
          sumExtraUserTokensSorted += asset.balance * tokenPrice;
        }
      });
      // Total USD value
      const totalTokenUsdValue = sumMeanSupportedTokens + sumExtraUserTokensSorted;
      setTotalTokenAccountsValue(totalTokenUsdValue);
      // Net Worth
      const total = totalTokenUsdValue + streamsSummary.totalNet;
      setNetWorth(total);
    }
  }, [
    streamsSummary,
    meanSupportedTokens,
    extraUserTokensSorted,
    getPricePerToken
  ]);

  ///////////////
  // Rendering //
  ///////////////

  /**
   * /accounts?cat=networth
   * /accounts?cat=user-account&asset=Ss1dd5HsdsdSx2P
   *    autoselect asset or pick from url
   * /accounts?cat=other-assets&project=msp
   *    project/protocol identifier (msp/orca/solend/friktion)
   */

  const renderNetworth = () => {
    return (
      <div className={`networth-list-item flex-fixed-right no-pointer ${selectedCategory === "networth" ? 'selected' : ''}`} onClick={() => {
        setSelectedCategory("networth");
        setSelectedAsset(undefined);
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
      {/* Render Money Streams item if they exist and wallet is connected */}
      {publicKey && (
        <>
          <Link to="/accounts/streams">
            <div key="streams" className={`transaction-list-row ${selectedCategory === "other-assets" ? 'selected' : ''}`} onClick={() => {
              setSelectedCategory("other-assets");
              setSelectedAsset(undefined);
            }}>
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
                        refreshStreamList();
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
                    <div className="rate-amount">$
                      {
                        formatThousands(
                          Math.abs(streamsSummary.totalNet),
                          friendlyDisplayDecimalPlaces(streamsSummary.totalNet),
                          friendlyDisplayDecimalPlaces(streamsSummary.totalNet)
                        )
                      }
                    </div>
                    <div className="interval">{t('streams.streaming-balance')}</div>
                  </>
                )}
              </div>
            </div>
          </Link>
        </>
      )}
    </>
  );

  const renderAsset = (asset: UserTokenAccount, index: number) => {
    const onTokenAccountClick = () => {
      selectAsset(asset, true, true);
      setSelectedCategory("user-account");
    }
    const tokenPrice = getPricePerToken(asset);
    const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
      event.currentTarget.src = FALLBACK_COIN_IMAGE;
      event.currentTarget.className = "error";
    };
    const isSelectedToken = (): boolean => {
      return selectedAsset && asset && selectedAsset.displayIndex === asset.displayIndex
        ? true
        : false;
    }

    const isOwnedTokenAccount = asset.publicAddress && asset.publicAddress !== accountAddress
          ? true
          : false;

    return (
      <div key={`${index}`} onClick={onTokenAccountClick}
          className={`transaction-list-row ${isSelectedToken() && selectedCategory === "user-account" ? 'selected' : ''}`}>
        <div className="icon-cell">
          {publicKey && isOwnedTokenAccount && !asset.isAta ? (
            <Tooltip placement="bottomRight" title={t('account-area.non-ata-tooltip', { tokenSymbol: asset.symbol })}>
              <div className="token-icon grayed-out">
                {asset.logoURI ? (
                  <img alt={`${asset.name}`} width={30} height={30} src={asset.logoURI} onError={imageOnErrorHandler} />
                ) : (
                  <Identicon address={asset.address} style={{ width: "30", display: "inline-flex" }} />
                )}
              </div>
            </Tooltip>
          ) : (
            <div className="token-icon">
              {asset.logoURI ? (
                <img alt={`${asset.name}`} width={30} height={30} src={asset.logoURI} onError={imageOnErrorHandler} />
              ) : (
                <Identicon address={asset.address} style={{ width: "30", display: "inline-flex" }} />
              )}
            </div>
          )}
        </div>
        <div className="description-cell">
          <div className="title">
            {asset.symbol}
            {tokenPrice > 0 ? (
              <span className={`badge small ml-1 ${theme === 'light' ? 'golden fg-dark' : 'darken'}`}>
                ${getFormattedRateAmount(tokenPrice)}
              </span>
            ) : (null)}
          </div>
          {publicKey ? (
            <div className="subtitle text-truncate">{isOwnedTokenAccount && !asset.isAta && asset.name !== 'Unknown Token' ? t('account-area.non-ata-label') : asset.name}</div>
            ) : (
            <div className="subtitle text-truncate">{asset.address === WRAPPED_SOL_MINT_ADDRESS ? 'Wrapped SOL' : asset.name}</div>
          )}
        </div>
        <div className="rate-cell">
          <div className="rate-amount">
            ${getFormattedRateAmount((asset.balance || 0) * tokenPrice)}
          </div>
          {(tokenPrice > 0 && (asset.balance || 0) > 0) ? (
            <div className="interval">
              {(asset.balance || 0) > 0 ? getTokenAmountAndSymbolByTokenAddress(asset.balance || 0, asset.address, true) : '0'}
            </div>
          ) : (null)}
        </div>
      </div>
    );
  };

  const renderAssetsList = (
    <>
    {accountTokens && accountTokens.length ? (
      <>
        {/* Render mean supported tokens */}
        {(meanSupportedTokens && meanSupportedTokens.length > 0) && (
          meanSupportedTokens.map((asset, index) => renderAsset(asset, index))
        )}
        {/* Render divider if there are extra tokens */}
        {(accountTokens.length > meanSupportedTokens.length) && (
          <div key="separator2" className="pinned-token-separator"></div>
        )}
        {/* Render extra user tokens */}
        {(extraUserTokensSorted && extraUserTokensSorted.length > 0) && (
          extraUserTokensSorted.map((asset, index) => renderAsset(asset, index + 50))
        )}
      </>
    ) : (
      <div className="h-75 flex-center">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    )}
    </>
  );

  const renderActivityList = () => {
    return (
      <>
        {/* Activity list */}
        <div className={((!isSelectedAssetNativeAccount() && hasTransactions()) ||
                        (isSelectedAssetNativeAccount() && hasTransactions() && solAccountItems > 0))
                        ? 'transaction-list-data-wrapper vertical-scroll'
                        : 'transaction-list-data-wrapper vertical-scroll empty'}>
          <div className="activity-list h-100">
            {
              status === FetchStatus.Fetching && !((!isSelectedAssetNativeAccount() && hasTransactions()) ||
                                                  (isSelectedAssetNativeAccount() && hasTransactions() && solAccountItems > 0)) ? (
                <div className="h-100 flex-center">
                  <Spin indicator={antIcon} />
                </div>
              ) : hasTransactions() ? (
                <div className="item-list-body compact">
                  {renderTransactions()}
                </div>
              ) : status === FetchStatus.Fetched && !hasTransactions() ? (
                <div className="h-100 flex-center">
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{t('assets.no-transactions')}</p>} />
                </div>
              ) : status === FetchStatus.FetchFailed && (
                <div className="h-75 flex-center">
                  <Result status="warning" title={t('assets.loading-error')} />
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
      {/* <Menu.Item key="2" onClick={() => {}}>
        <span className="menu-item-text">Menu 2</span>
      </Menu.Item> */}
    </Menu>
  );

  const renderUserAccountAssetCtaRow = () => {
    if (!selectedAsset) { return null; }

    return (
      <div className="flex-fixed-right">
        <Space className="left" size="middle" wrap>
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            onClick={onSendAsset}>
            <SendOutlined />
            <span className="mx-1">Send</span>
          </Button>
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            onClick={showReceiveSplOrSolModal}>
            <QrcodeOutlined />
            <span className="mx-1">Receive</span>
          </Button>
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            onClick={onExchangeAsset}>
            <SwapOutlined />
            <span className="mx-1">Exchange</span>
          </Button>
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            onClick={handleGoToInvestClick}>
            <BarChartOutlined />
            <span className="mx-1">Invest</span>
          </Button>
        </Space>
        <Space className="right" size="small">
          <span className="flat-button medium primary" onClick={() => {}}>
            <IconShoppingCart className="mean-svg-icons"/>
            <span className="mx-1">Buy</span>
          </span>
          <Dropdown overlay={userAssetOptions} placement="bottomRight" trigger={["click"]}>
            <span className="icon-button-container">
              <Button
                type="default"
                shape="circle"
                size="middle"
                className="fg-primary-highlight"
                icon={<IconVerticalEllipsis className="mean-svg-icons"/>}
                onClick={(e) => e.preventDefault()}
              />
            </span>
          </Dropdown>
        </Space>
      </div>
    );
  };

  const renderUserAccountAssetMeta = () => {
    if (!selectedAsset) { return null; }

    const tokenPrice = getPricePerToken(selectedAsset);
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
                    {(selectedAsset.balance || 0) > 0 ? getTokenAmountAndSymbolByTokenAddress(selectedAsset.balance || 0, selectedAsset.address) : '0'}
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
                    ${getFormattedRateAmount((selectedAsset.balance || 0) * tokenPrice)}
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

  // TODO: Add a11y attributes to emojis for screen readers  aria-hidden={label ? undefined : true} aria-label={label ? label : undefined} role="img"

  const getRandomEmoji = useCallback(() => {
    const totalEmojis = EMOJIS.length;
    if (totalEmojis) {
      const randomIndex = Math.floor(Math.random() * totalEmojis);
      return (
        <span className="emoji">{EMOJIS[randomIndex]}</span>
      );
    }
    return null;
  }, []);

  const renderQrCode = (
    <div className="text-center mt-3">
      <h3 className="mb-3">{t('assets.no-balance.line3')}</h3>
      <div className={theme === 'light' ? 'qr-container bg-white' : 'qr-container bg-black'}>
        <QRCode
          value={accountAddress}
          size={200}
          renderAs="svg"/>
      </div>
      <div className="transaction-field medium">
        <div className="transaction-field-row main-row">
          <span className="input-left recipient-field-wrapper">
            <span id="address-static-field" className="overflow-ellipsis-middle">
              {accountAddress}
            </span>
          </span>
          <div className="addon-right simplelink" onClick={() =>copyAddressToClipboard(accountAddress)}>
            <IconCopy className="mean-svg-icons link" />
          </div>
        </div>
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
        {renderQrCode}
      </div>
    );
  };

  const shallWeDraw = (): boolean => {
    return ((!isSelectedAssetNativeAccount() && hasTransactions()) ||
            (isSelectedAssetNativeAccount() && hasTransactions() && solAccountItems > 0))
      ? true
      : false;
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
            <span className="ml-1">proggress:</span><span className="ml-1 font-bold fg-dark-active">{fetchTxInfoStatus || '-'}</span>
            <span className="ml-1">status:</span><span className="ml-1 font-bold fg-dark-active">{lastSentTxStatus || '-'}</span>
            <span className="ml-1">lastSentTxSignature:</span><span className="ml-1 font-bold fg-dark-active">{lastSentTxSignature ? shortenAddress(lastSentTxSignature, 8) : '-'}</span>
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
                          (<a className="simplelink underline-on-hover" target="_blank" rel="noopener noreferrer"
                              href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${accountAddress}${getSolanaExplorerClusterParam()}`}>
                            {shortenAddress(accountAddress, 5)}
                          </a>)
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
                              icon={<CopyOutlined />}
                              onClick={() => copyAddressToClipboard(accountAddress)}
                            />
                          </Tooltip>
                        </span>
                      </div>
                    </div>
                    <div className="inner-container">
                      <div className="item-block">
                        {renderNetworth()}
                        <div className="asset-category-title flex-fixed-right">
                          <div className="title">Assets in wallet ({totalTokensHolded})</div>
                          <div className="amount">{toUsCurrency(totalTokenAccountsValue)}</div>
                        </div>
                        <div className="asset-category vertical-scroll">
                          {renderAssetsList}
                        </div>
                        <div className="asset-category-title flex-fixed-right">
                          <div className="title">Other assets (1)</div>
                          <div className="amount">{toUsCurrency(streamsSummary.totalNet)}</div>
                        </div>
                        <div className="asset-category vertical-scroll">
                          {renderMoneyStreamsSummary}
                        </div>
                      </div>
                      {/* Bottom CTAs */}
                      {/* {(accountTokens && accountTokens.length > 0) && (
                        <div className="thin-bottom-ctas">
                          <Switch size="small" checked={hideLowBalances} onClick={() => setHideLowBalances(value => !value)} />
                          <span className="ml-1 simplelink" onClick={() => setHideLowBalances(value => !value)}>{t('assets.switch-hide-low-balances')}</span>
                          {(canActivateMergeTokenAccounts()) && (
                            <span className="flat-button ml-2" onClick={() => {
                              if (selectedAsset && tokenAccountGroups) {
                                const acc = tokenAccountGroups.has(selectedAsset.address);
                                if (acc) {
                                  const item = tokenAccountGroups.get(selectedAsset.address);
                                  if (item) {
                                    setSelectedTokenMergeGroup(item);
                                    // Reset transaction status in the AppState
                                    setTransactionStatus({
                                      lastOperation: TransactionStatus.Iddle,
                                      currentOperation: TransactionStatus.Iddle
                                    });
                                    showTokenMergerModal();
                                  }
                                }
                              }
                            }}>
                              <MergeCellsOutlined />
                              <span className="ml-1">{t('assets.merge-accounts-cta')}</span>
                            </span>
                          )}
                        </div>
                      )} */}
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
                            {shallWeDraw() && (
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
                          <div className="bottom">
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
          handleClose={hideTokenMergerModal}
          tokenMint={selectedTokenMergeGroup[0].parsedInfo.mint}
          tokenGroup={selectedTokenMergeGroup}
          accountTokens={accountTokens}
        />
      )}

      {isReceiveSplOrSolModalOpen && publicKey && selectedAsset && (
        <ReceiveSplOrSolModal
          address={publicKey.toBase58()}
          isVisible={isReceiveSplOrSolModalOpen}
          handleClose={hideReceiveSplOrSolModal}
          tokenSymbol={selectedAsset.symbol}
        />
      )}

      {isSendAssetModalOpen && publicKey && selectedAsset && (
        <SendAssetModal
          isVisible={isSendAssetModalOpen}
          handleClose={hideSendAssetModal}
          selected={"one-time"}
        />
      )}

      {isExchangeAssetModalOpen && publicKey && selectedAsset && (
        <ExchangeAssetModal
          isVisible={isExchangeAssetModalOpen}
          handleClose={hideExchangeAssetModal}
          tokenSymbol={selectedAsset.symbol}
        />
      )}

      <PreFooter />
    </>
  );

};
