import React, { useCallback, useContext } from 'react';
import { ArrowLeftOutlined, CopyOutlined, EditOutlined, LoadingOutlined, QrcodeOutlined, ReloadOutlined, SyncOutlined } from '@ant-design/icons';
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
import { fetchAccountTokens, getAmountFromLamports, getFormattedRateAmount, getTokenAmountAndSymbolByTokenAddress, shortenAddress } from '../../utils/utils';
import { Button, Empty, Result, Space, Spin, Switch, Tooltip } from 'antd';
import { consoleOut, copyText, isValidAddress } from '../../utils/ui';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { SOLANA_WALLET_GUIDE, SOLANA_EXPLORER_URI_INSPECT_ADDRESS, EMOJIS, TRANSACTIONS_PER_PAGE, ACCOUNTS_LOW_BALANCE_LIMIT, FALLBACK_COIN_IMAGE } from '../../constants';
import { QrScannerModal } from '../../components/QrScannerModal';
import { Helmet } from "react-helmet";
import { IconCopy } from '../../Icons';
import { notify } from '../../utils/notifications';
import { fetchAccountHistory, MappedTransaction } from '../../utils/history';
import { useHistory } from 'react-router-dom';
import { isDesktop } from "react-device-detect";
import useWindowSize from '../../hooks/useWindowResize';
import useLocalStorage from '../../hooks/useLocalStorage';
import { refreshCachedRpc } from '../../models/connections-hq';

const antIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;
const QRCode = require('qrcode.react');

export const AccountsView = () => {
  const connection = useConnectionConfig();
  const { publicKey, connected } = useWallet();
  const { theme } = useContext(AppStateContext);
  const [customConnection, setCustomConnection] = useState<Connection>();
  const {
    coinPrices,
    userTokens,
    splTokenList,
    transactions,
    selectedAsset,
    accountAddress,
    lastTxSignature,
    detailsPanelOpen,
    canShowAccountDetails,
    previousWalletConnectState,
    setTransactions,
    setSelectedAsset,
    setAccountAddress,
    setDtailsPanelOpen,
    setAddAccountPanelOpen,
    setCanShowAccountDetails,
    showDepositOptionsModal
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const history = useHistory();
  const { width } = useWindowSize();
  const [isSmallUpScreen, setIsSmallUpScreen] = useState(isDesktop);
  const [accountAddressInput, setAccountAddressInput] = useState<string>('');
  // const [isInputValid, setIsInputValid] = useState(false);
  const [shouldLoadTokens, setShouldLoadTokens] = useState(false);
  const [tokensLoaded, setTokensLoaded] = useState(false);
  const [accountTokens, setAccountTokens] = useState<UserTokenAccount[]>([]);
  const [solAccountItems, setSolAccountItems] = useState(0);
  // const [shallWeDraw, setShallWeDraw] = useState(false);

  // Flow control
  const [status, setStatus] = useState<FetchStatus>(FetchStatus.Iddle);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [shouldLoadTransactions, setShouldLoadTransactions] = useState(false);
  const [hideLowBalances, setHideLowBalances] = useLocalStorage('hideLowBalances', true);
  const [numMeanTokens, setNumMeanTokens] = useState(0);

  // QR scan modal
  const [isQrScannerModalVisible, setIsQrScannerModalVisibility] = useState(false);
  const showQrScannerModal = useCallback(() => setIsQrScannerModalVisibility(true), []);
  const closeQrScannerModal = useCallback(() => setIsQrScannerModalVisibility(false), []);
  const onAcceptQrScannerModal = (value: string) => {
    setAccountAddressInput(value);
    triggerWindowResize();
    closeQrScannerModal();
  };

  const startSwitch = useCallback(() => {
    setStatus(FetchStatus.Fetching);
    setLoadingTransactions(false);
    setShouldLoadTransactions(true);
  }, [])

  const reloadSwitch = useCallback(() => {
    setSolAccountItems(0);
    setTransactions(undefined);
    startSwitch();
  }, [
    startSwitch,
    setTransactions
  ])

  const selectAsset = useCallback((
    asset: UserTokenAccount,
    openDetailsPanel: boolean = false
  ) => {
    setStatus(FetchStatus.Fetching);
    setSolAccountItems(0);
    setTransactions(undefined);
    setSelectedAsset(asset);
    if (isSmallUpScreen || openDetailsPanel) {
      setDtailsPanelOpen(true);
    }
    setTimeout(() => {
      startSwitch();
    }, 10);
  }, [
    isSmallUpScreen,
    startSwitch,
    setTransactions,
    setSelectedAsset,
    setDtailsPanelOpen,
  ])

  const onAddAccountAddress = () => {
    setAccountAddress(accountAddressInput);
    setShouldLoadTokens(true);
    setCanShowAccountDetails(true);
    setAccountAddressInput('');
    setAddAccountPanelOpen(false);
  }

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

  const onCopyAddress = () => {
    if (accountAddress && copyText(accountAddress)) {
      notify({
        description: t('notifications.account-address-copied-message'),
        type: "info"
      });
    } else {
      notify({
        description: t('notifications.account-address-not-copied-message'),
        type: "error"
      });
    }
  }

  const handleGoToExchangeClick = () => {
    const queryParams = `${selectedAsset ? '?to=' + selectedAsset.symbol : ''}`;
    setDtailsPanelOpen(false);
    if (queryParams) {
      history.push({
        pathname: '/exchange',
        search: queryParams,
      });
    } else {
      history.push('/exchange');
    }
  }

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
    return asset?.ataAddress
            ? asset.ataAddress !== NATIVE_SOL_MINT.toBase58()
              ? new PublicKey(asset.ataAddress)
              : new PublicKey(accountAddress)
            : null;
  },[accountAddress]);

  const getPricePerToken = (token: UserTokenAccount): number => {
    const tokenSymbol = token.symbol.toUpperCase();
    const symbol = tokenSymbol[0] === 'W' ? tokenSymbol.slice(1) : tokenSymbol;

    return coinPrices && coinPrices[symbol]
      ? coinPrices[symbol]
      : 0;
  }

  // Setup custom connection with 'confirmed' commitment
  useEffect(() => {
    if (!customConnection) {
      setCustomConnection(new Connection(connection.endpoint, {
        commitment: "confirmed",
        disableRetryOnRateLimit: true
      }));
    }
  }, [
    connection.endpoint,
    customConnection
  ]);

  // Fetch all the owned token accounts on demmand via setShouldLoadTokens(true)
  useEffect(() => {
    if (!connection || !customConnection || !accountAddress || !shouldLoadTokens || !userTokens || !splTokenList) {
      return;
    }

    const timeout = setTimeout(() => {
      if (connection && customConnection && accountAddress && shouldLoadTokens &&
          userTokens && userTokens.length && splTokenList && splTokenList.length) {
        setShouldLoadTokens(false);
        setTokensLoaded(false);
  
        const meanTokensCopy = JSON.parse(JSON.stringify(userTokens)) as UserTokenAccount[];
        const splTokensCopy = JSON.parse(JSON.stringify(splTokenList)) as UserTokenAccount[];
        const pk = new PublicKey(accountAddress);
        let nativeBalance = 0;

        // Fetch SOL balance.
        customConnection.getBalance(pk)
          .then(solBalance => {
            nativeBalance = solBalance || 0;
            meanTokensCopy[0].balance = nativeBalance / LAMPORTS_PER_SOL;
            meanTokensCopy[0].ataAddress = accountAddress;
            // We have the native account balance, now get the token accounts' balance
            // but first, set all balances to zero
            for (let index = 1; index < meanTokensCopy.length; index++) {
              meanTokensCopy[index].balance = 0;
            }

            fetchAccountTokens(pk, connection.endpoint)
              .then(accTks => {
                if (accTks) {
                  consoleOut('fetched accountTokens:', accTks.map(i => {
                    return {
                      pubAddress: i.pubkey.toBase58(),
                      mintAddress: i.parsedInfo.mint,
                      balance: i.parsedInfo.tokenAmount.uiAmount || 0
                    };
                  }), 'blue');
                  // Update balances in the mean token list
                  accTks.forEach(item => {
                    let tokenIndex = 0;
                    // Locate the token in meanTokensCopy
                    tokenIndex = meanTokensCopy.findIndex(i => i.address === item.parsedInfo.mint);
                    if (tokenIndex !== -1) {
                      // If we didn't already filled info for this associated token address
                      if (!meanTokensCopy[tokenIndex].ataAddress) {
                        // Add it
                        meanTokensCopy[tokenIndex].ataAddress = item.pubkey.toBase58();
                        meanTokensCopy[tokenIndex].balance = item.parsedInfo.tokenAmount.uiAmount || 0;
                      } else if (meanTokensCopy[tokenIndex].ataAddress !== item.pubkey.toBase58()) {
                        // If we did and the ataAddress is different/new then duplicate this item with the new info
                        const newItem = JSON.parse(JSON.stringify(meanTokensCopy[tokenIndex]));
                        newItem.ataAddress = item.pubkey.toBase58();
                        newItem.balance = item.parsedInfo.tokenAmount.uiAmount || 0;
                        meanTokensCopy.splice(tokenIndex + 1, 0, newItem);
                      }
                    }
                  });
                  consoleOut('intersected List:', meanTokensCopy, 'blue');
                  // Update meanTokens count
                  setNumMeanTokens(meanTokensCopy.length);
                  // Update balances in the SPL token list
                  accTks.forEach(item => {
                    const tokenIndex = splTokensCopy.findIndex(i => i.address === item.parsedInfo.mint);
                    if (tokenIndex !== -1) {
                      splTokensCopy[tokenIndex].ataAddress = item.pubkey.toBase58();
                      splTokensCopy[tokenIndex].balance = item.parsedInfo.tokenAmount.uiAmount || 0;
                    }
                  });
                  // Create a list containing the tokens for the user accounts not in the meanTokensCopy
                  const intersectedList = new Array<UserTokenAccount>();
                  accTks.forEach(item => {
                    // Loop through the user token accounts and add the token account to the list: meanTokensCopy
                    // If it is not already on the list (diferentiate associated token accounts of the same mint)
                    const isTokenAccountInTheList = meanTokensCopy.some(t => t.address === item.parsedInfo.mint && t.ataAddress === item.pubkey.toBase58());
                    const tokenFromSplTokenList = splTokensCopy.find(t => t.address === item.parsedInfo.mint);
                    if (tokenFromSplTokenList && !isTokenAccountInTheList) {
                      intersectedList.push(tokenFromSplTokenList);
                    }
                  });
                  const sortedList = intersectedList.sort((a, b) => {
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
                  const finalList = meanTokensCopy.concat(sortedList);
                  // Report in the console for debugging
                  const tokenTable: any[] = [];
                  finalList.forEach(item => {
                    if (item.ataAddress && item.address) {
                      tokenTable.push({
                        ataAddress: shortenAddress(item.ataAddress, 8),
                        address: shortenAddress(item.address, 8),
                        symbol: item.symbol,
                        balance: item.balance
                      });
                    }
                  });
                  console.table(tokenTable);
                  // Update the state
                  consoleOut('Extra tokens (sorted):', intersectedList, 'blue');
                  setAccountTokens(finalList);
                  setTokensLoaded(true);
                } else {
                  console.error('could not get account tokens');
                  setAccountTokens(meanTokensCopy);
                  setTokensLoaded(true);
                  refreshCachedRpc();
                }
                // Preset the first available token
                selectAsset(meanTokensCopy[0]);
              })
              .catch(error => {
                console.error(error);
                setAccountTokens(meanTokensCopy);
                setTokensLoaded(true);
                selectAsset(meanTokensCopy[0]);
                refreshCachedRpc();
              });
          })
          .catch(error => {
            console.error(error);
            refreshCachedRpc();
          });
      }
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    accountAddress,
    splTokenList,
    userTokens,
    connection,
    customConnection,
    shouldLoadTokens,
    selectAsset
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

      const isScanningWallet = accountAddress === selectedAsset?.ataAddress ? true : false;
      // Show only txs that have SOL changes
      const filtered = txs.filter(tx => {
        const meta = tx.parsedTransaction.meta;
        if (meta && meta.err !== null) { return false; }
        const accounts = tx.parsedTransaction.transaction.message.accountKeys;
        const accIdx = accounts.findIndex(acc => acc.pubkey.toBase58() === accountAddress);
        if (isScanningWallet && accIdx === -1) { return false; }
        const change = getChange(accIdx, meta);
        return isScanningWallet && change !== 0 ? true : false;
      });

      consoleOut(`${filtered.length} useful Txs`);
      return filtered.length || 0;
    } else {
      return 0;
    }
  }, [
    accountAddress,
    selectedAsset?.ataAddress
  ]);

  // Load the transactions when signaled
  useEffect(() => {

    if (shouldLoadTransactions && tokensLoaded && customConnection && accountAddress && selectedAsset && !loadingTransactions) {
      setShouldLoadTransactions(false);

      // Get the address to scan and ensure there is one
      const pk = getScanAddress(selectedAsset as UserTokenAccount);
      consoleOut('pk:', pk ? pk.toBase58() : 'NONE', 'blue');
      if (!pk) {
        consoleOut('Asset has no public address, aborting...', '', 'goldenrod');
        setTransactions(undefined);
        setStatus(FetchStatus.Fetched);
        return;
      }

      setLoadingTransactions(true);

      let options = {
        limit: TRANSACTIONS_PER_PAGE
      }

      if (lastTxSignature) {
        options = Object.assign(options, {
          before: lastTxSignature
        });
      }

      fetchAccountHistory(
        customConnection,
        pk,
        options,
        true
      )
      .then(history => {
        consoleOut('history:', history, 'blue');
        setTransactions(history.transactionMap, true);

        if (history.transactionMap && history.transactionMap.length && pk.toBase58() === accountAddress) {
          const validItems = getSolAccountItems(history.transactionMap);
          setSolAccountItems(current => current + validItems);
        }

        setStatus(FetchStatus.Fetched);
      })
      .catch(error => {
        console.error(error);
        setStatus(FetchStatus.FetchFailed);
      })
      .finally(() => setLoadingTransactions(false));
    }

  }, [
    lastTxSignature,
    transactions,
    tokensLoaded,
    selectedAsset,
    accountAddress,
    customConnection,
    loadingTransactions,
    shouldLoadTransactions,
    getSolAccountItems,
    setTransactions,
    getScanAddress,
    startSwitch
  ]);

  // Auto execute (when entering /accounts) if we have an address already stored
  useEffect(() => {
    if (!accountAddress || !customConnection || tokensLoaded || accountTokens.length) {
      return;
    }

    const timeout = setTimeout(() => {
      consoleOut('loading user tokens...');
      setShouldLoadTokens(true);
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    accountTokens,
    tokensLoaded,
    accountAddress,
    customConnection
  ]);

  // Hook on the wallet connect/disconnect
  useEffect(() => {

    if (previousWalletConnectState !== connected) {
      // User is connecting
      if (!previousWalletConnectState && connected && publicKey) {
        consoleOut('Preset account address...', publicKey.toBase58(), 'blue');
        setShouldLoadTokens(true);
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'blue');
        setSolAccountItems(0);
        setTransactions(undefined);
      }
      setTimeout(() => {
        setCanShowAccountDetails(true);
        setAddAccountPanelOpen(false);
        startSwitch();
      }, 150);
    }

  }, [
    connected,
    previousWalletConnectState,
    publicKey,
    startSwitch,
    setTransactions,
    setSelectedAsset,
    setAccountAddress,
    setAddAccountPanelOpen,
    setCanShowAccountDetails,
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

  ///////////////
  // Rendering //
  ///////////////

  const renderTokenList = (
    <>
    {accountTokens && accountTokens.length ? (
      accountTokens.map((asset, index) => {
        const isDivider = index === numMeanTokens - 1 && accountTokens.length > numMeanTokens;
        const onTokenAccountClick = () => selectAsset(asset, true);
        const tokenPrice = getPricePerToken(asset);
        const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
          event.currentTarget.src = FALLBACK_COIN_IMAGE;
          event.currentTarget.className = "error";
        };
        return (
          <div key={isDivider ? 'group-divider' : index.toString()} onClick={onTokenAccountClick}
              className={`${isDivider
              ? 'pinned-token-separator'
              : 'transaction-list-row'} ${selectedAsset && selectedAsset.ataAddress === asset.ataAddress
                ? 'selected'
                : hideLowBalances && !asset.isMeanSupportedToken && (asset.balance || 0) < ACCOUNTS_LOW_BALANCE_LIMIT
                  ? 'hidden'
                  : ''}`
            }>
            {!isDivider && (
              <>
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
                      <span className={`badge small ${theme === 'light' ? 'golden fg-dark' : 'darken'}`}>
                        ${getFormattedRateAmount(tokenPrice)}
                      </span>
                    ) : (null)}
                  </div>
                  <div className="subtitle text-truncate">{asset.name}</div>
                </div>
                <div className="rate-cell">
                  <div className="rate-amount">
                    {(asset.balance || 0) > 0 ? getTokenAmountAndSymbolByTokenAddress(asset.balance || 0, asset.address, true) : '0'}
                  </div>
                  {(tokenPrice > 0 && (asset.balance || 0) > 0) ? (
                    <div className="interval">
                      ${getFormattedRateAmount((asset.balance || 0) * tokenPrice)}
                    </div>
                  ) : (null)}
                </div>
              </>
            )}
          </div>
        );
      })
    ) : (
      <div className="h-75 flex-center">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    )}

    </>
  );

  const renderSolanaIcon = (
    <img className="token-icon" src="solana-logo.png" alt="Solana logo" />
  );

  const renderTransactions = () => {
    const isScanningWallet = accountAddress === selectedAsset?.ataAddress ? true : false;
    if (transactions) {
      if (isScanningWallet) {
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
          const meta = tx.parsedTransaction.meta;
          if (meta && meta.err !== null) { return false; }
          const accounts = tx.parsedTransaction.transaction.message.accountKeys;
          const accIdx = accounts.findIndex(acc => acc.pubkey.toBase58() === accountAddress);
          if (isScanningWallet && accIdx === -1) { return false; }
          const change = getChange(accIdx, meta);
          return isScanningWallet && change !== 0 ? true : false;
        });
        return filtered?.map((trans: MappedTransaction) => {
          return <TransactionItemView
                    key={trans.signature}
                    transaction={trans}
                    selectedAsset={selectedAsset as UserTokenAccount}
                    accountAddress={accountAddress}
                    tokenAccounts={accountTokens} />;
        });
      } else {
        // Render the transactions collection
        return transactions?.map((trans: MappedTransaction) => {
          if (trans.parsedTransaction.meta?.err === null) {
            return <TransactionItemView
                      key={trans.signature}
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

  // TODO: Add a11y attributes to emojis for screen readers  aria-hidden={label ? undefined : true} aria-label={label ? label : undefined} role="img"

  const getRandomEmoji = () => {
    const totalEmojis = EMOJIS.length;
    if (totalEmojis) {
      const randomIndex = Math.floor(Math.random() * totalEmojis);
      return (
        <span className="emoji">{EMOJIS[randomIndex]}</span>
      );
    }
    return null;
  }

  const renderQrCode = (
    <div className="text-center mt-3">
      <h3 className="mb-3">{t("assets.no-balance.line3")}</h3>
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
          <div className="addon-right simplelink" onClick={onCopyAddress}>
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
        <h3 className="text-center mb-3">{t('assets.no-balance.line1')} {getRandomEmoji()}</h3>
        <h3 className="text-center mb-2">{t('assets.no-balance.line2')}</h3>
        <Space size={[16, 16]} wrap>
          <Button className="secondary-button" shape="round" size="middle" type="default"
                  onClick={showDepositOptionsModal}>{t('assets.no-balance.cta1', {tokenSymbol: selectedAsset?.symbol})}</Button>
          {/* For SOL the first option is ok, any other token, we can use the exchange */}
          {selectedAsset?.ataAddress !== accountAddress && (
            <Button className="secondary-button" shape="round" size="middle" type="default"
                    onClick={handleGoToExchangeClick}>{t('assets.no-balance.cta2')}</Button>
          )}
        </Space>
        {renderQrCode}
      </div>
    );
  };

  const shallWeDraw = (): boolean => {
    return ((accountAddress !== selectedAsset?.ataAddress && transactions && transactions.length > 0) ||
            (accountAddress === selectedAsset?.ataAddress && transactions && transactions.length > 0 && solAccountItems > 0))
      ? true
      : false;
  }

  return (
    <>
      <Helmet>
        <title>Accounts - Mean Finance</title>
        <link rel="canonical" href="https://app.meanfi.com/accounts" />
        <meta name="description" content="Water flows, and now, money does too. Welcome to Mean Finance, your money unleashed!" />
        <meta name="google-site-verification" content="u-gc96PrpV7y_DAaA0uoo4tc2ffcgi_1r6hqSViM-F8" />
      </Helmet>
      <div className="container main-container">

        {/* {window.location.hostname === 'localhost' && (
          <div className="debug-bar">
            <span className="ml-1">solAccountItems:</span><span className="ml-1 font-bold fg-dark-active">{solAccountItems}</span>
            <span className="ml-1">shallWeDraw:</span><span className="ml-1 font-bold fg-dark-active">{shallWeDraw() ? 'true' : 'false'}</span>
          </div>
        )} */}

        {/* This is a SEO mandatory h1 but it is not visible */}
        <h1 className="mandatory-h1">Accounts, Where you keep track of your assets</h1>

        <div className={(canShowAccountDetails && accountAddress) ? 'interaction-area' : 'interaction-area flex-center h-75'}>

          {canShowAccountDetails && accountAddress ? (
            <div className={`transactions-layout ${detailsPanelOpen ? 'details-open' : ''}`}>

              {/* Left / top panel*/}
              <div className="tokens-container">
                <div className="transactions-heading">
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
                          onClick={onCopyAddress}
                        />
                      </Tooltip>
                    </span>
                  </div>
                </div>
                <div className="inner-container">
                  <div className="item-block vertical-scroll">
                    {renderTokenList}
                  </div>
                  {(accountTokens && accountTokens.length > 0) && (
                    <div className="bottom-ctas">
                      <Switch size="small" checked={hideLowBalances} onClick={() => setHideLowBalances(value => !value)} />
                      <span className="ml-1 simplelink" onClick={() => setHideLowBalances(value => !value)}>{t('assets.switch-hide-low-balances')}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right / down panel */}
              <div className="transaction-list-container">
                <div className="transactions-heading"><span className="title">{t('assets.history-panel-title')}</span></div>
                <div className="inner-container">
                  {/* Activity table heading */}
                  {shallWeDraw() && (
                    <div className="stats-row">
                      <div className="fetch-control">
                        <span className="icon-button-container">
                          {status === FetchStatus.Fetching ? (
                            <Tooltip placement="bottom" title="Stop">
                              <span className="icon-container"><SyncOutlined spin /></span>
                            </Tooltip>
                          ) : (
                            <Tooltip placement="bottom" title="Refresh">
                              <Button
                                type="default"
                                shape="circle"
                                size="small"
                                icon={<ReloadOutlined />}
                                onClick={reloadSwitch}
                              />
                            </Tooltip>
                          )}
                        </span>
                      </div>
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
                  {/* Activity list */}
                  <div className={((accountAddress !== selectedAsset?.ataAddress && transactions && transactions.length > 0) ||
                                   (accountAddress === selectedAsset?.ataAddress && transactions && transactions.length > 0 && solAccountItems > 0))
                                   ? 'transaction-list-data-wrapper vertical-scroll'
                                   : 'transaction-list-data-wrapper empty'}>
                    <div className="activity-list h-100">
                      {
                        status === FetchStatus.Fetching && !((accountAddress !== selectedAsset?.ataAddress && transactions && transactions.length > 0) ||
                                                             (accountAddress === selectedAsset?.ataAddress && transactions && transactions.length > 0 && solAccountItems > 0)) ? (
                          <div className="h-100 flex-center">
                            <Spin indicator={antIcon} />
                          </div>
                        ) : selectedAsset?.balance === 0 && !((accountAddress !== selectedAsset?.ataAddress && transactions && transactions.length > 0) ||
                                                              (accountAddress === selectedAsset?.ataAddress && transactions && transactions.length > 0 && solAccountItems > 0)) ? (
                          renderTokenBuyOptions()
                        ) : (transactions && transactions.length) ? (
                          <div className="item-list-body compact">
                            {renderTransactions()}
                          </div>
                        ) : status === FetchStatus.Fetched && (!transactions || transactions.length === 0) ? (
                          <div className="h-100 flex-center">
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{t('assets.no-transactions')}</p>} />
                          </div>
                        ) : status === FetchStatus.FetchFailed && (
                          <Result status="warning" title={t('assets.loading-error')} />
                        )
                      }
                    </div>
                  </div>
                  {/* Load more cta */}
                  {lastTxSignature && (
                    <div className="stream-share-ctas">
                      <Button
                        type="ghost"
                        shape="round"
                        size="small"
                        disabled={status === FetchStatus.Fetching}
                        onClick={() => startSwitch()}>
                        {status === FetchStatus.Fetching ? t('general.loading') : t('assets.history-load-more-cta-label')}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

            </div>
          ) : (
            <>
              <div className="boxed-area">
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
                <h2 className="text-center mb-3 px-3">{t('assets.account-add-heading')} {renderSolanaIcon} Solana</h2>
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
                            {t("assets.account-address-validation")}
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

        </div>

      </div>
      <PreFooter />
    </>
  );

};
