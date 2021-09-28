import React, { useCallback, useContext } from 'react';
import { ArrowLeftOutlined, EditOutlined, LoadingOutlined, QrcodeOutlined, ReloadOutlined, SyncOutlined } from '@ant-design/icons';
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { useEffect, useState } from 'react';
import { PreFooter } from '../../components/PreFooter';
import { TransactionItemView } from '../../components/TransactionItemView';
import { getSolanaExplorerClusterParam, useConnectionConfig } from '../../contexts/connection';
import { useWallet } from '../../contexts/wallet';
import { FetchStatus, UserTokenAccount } from '../../models/transactions';
import { AppStateContext } from '../../contexts/appstate';
import { useTranslation } from 'react-i18next';
import { Identicon } from '../../components/Identicon';
import { fetchAccountTokens, getTokenAmountAndSymbolByTokenAddress, shortenAddress } from '../../utils/utils';
import { Button, Empty, Result, Space, Spin, Tooltip } from 'antd';
import { consoleOut, copyText, isValidAddress } from '../../utils/ui';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { SOLANA_WALLET_GUIDE, SOLANA_EXPLORER_URI_INSPECT_ADDRESS, EMOJIS, TRANSACTIONS_PER_PAGE } from '../../constants';
import { QrScannerModal } from '../../components/QrScannerModal';
import _ from 'lodash';
import { IconCopy } from '../../Icons';
import { notify } from '../../utils/notifications';
import { fetchAccountHistory, MappedTransaction } from '../../utils/history';
import { useHistory } from 'react-router-dom';
import { isDesktop } from "react-device-detect";
import useWindowSize from '../../hooks/useWindowResize';

const antIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;
const QRCode = require('qrcode.react');

export const AccountsView = () => {
  const connection = useConnectionConfig();
  const { publicKey, connected } = useWallet();
  const { theme } = useContext(AppStateContext);
  const [customConnection, setCustomConnection] = useState<Connection>();
  const {
    userTokens,
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
  const [isInputValid, setIsInputValid] = useState(false);
  const [shouldLoadTokens, setShouldLoadTokens] = useState(false);
  const [tokensLoaded, setTokensLoaded] = useState(false);
  const [accountTokens, setAccountTokens] = useState<UserTokenAccount[]>([]);

  // Flow control
  const [status, setStatus] = useState<FetchStatus>(FetchStatus.Iddle);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [shouldLoadTransactions, setShouldLoadTransactions] = useState(false);
  // const [stats, dispatch] = useReducer((state: TransactionStats, action: TransactionActions) => {
  //   switch (action.type) {
  //     case ActionTypes.SET_STATS:
  //       return {...state, ...action.payload};
  //     case ActionTypes.RESET_STATS:
  //       return {...state, ...defaultTransactionStats};
  //     case ActionTypes.RESET_INDEX:
  //       return Object.assign({}, state, { index: 0 });
  //     case ActionTypes.ROLL_INDEX:
  //       return Object.assign({}, state, { index: signatures.length - 1 });
  //     case ActionTypes.INCREMENT_INDEX:
  //       return Object.assign({}, state, { index: state.index + 1 });
  //     default:
  //       return state;
  //   }
  // }, defaultTransactionStats);

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
    setAccountAddressInput(inputValue.trim());
    // But set the isInputValid flag for validation
    if (inputValue && isValidAddress(inputValue) ) {
      setIsInputValid(true);
    } else {
      setIsInputValid(false);
    }
  }

  const handleAccountAddressInputFocusIn = () => {
    setTimeout(() => {
      triggerWindowResize();
    }, 10);
  }

  const handleAccountAddressInputFocusOut = () => {
    setTimeout(() => {
      triggerWindowResize();
    }, 10);
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

  // Setup custom connection with 'confirmed' commitment
  useEffect(() => {
    if (!customConnection) {
      setCustomConnection(new Connection(connection.endpoint, 'confirmed'));
    }
  }, [
    connection.endpoint,
    customConnection
  ]);

  // Fetch all the owned token accounts on demmand via setShouldLoadTokens(true)
  useEffect(() => {
    if (!connection || !customConnection || !accountAddress || !shouldLoadTokens || !userTokens) {
      return;
    }

    const timeout = setTimeout(() => {
      if (connection && customConnection && accountAddress && shouldLoadTokens && userTokens) {
        setShouldLoadTokens(false);
        setTokensLoaded(false);
  
        const myTokens = _.cloneDeep(userTokens);
        const pk = new PublicKey(accountAddress);
        let nativeBalance = 0;
  
        // Fetch SOL balance.
        customConnection.getBalance(pk)
          .then(solBalance => {
            nativeBalance = solBalance || 0;
            myTokens[0].balance = nativeBalance / LAMPORTS_PER_SOL;
            myTokens[0].ataAddress = accountAddress;
            // We have the native account balance, now get the token accounts' balance
            // but first, set all balances to zero
            for (let index = 1; index < myTokens.length; index++) {
              myTokens[index].balance = 0;
            }
            fetchAccountTokens(pk, connection.endpoint)
              .then(accTks => {
                if (accTks) {
                  accTks.forEach(item => {
                    const tokenIndex = myTokens.findIndex(i => i.address === item.parsedInfo.mint);
                    if (tokenIndex !== -1) {
                      myTokens[tokenIndex].ataAddress = item.pubkey.toBase58();
                      myTokens[tokenIndex].balance = item.parsedInfo.tokenAmount.uiAmount || 0;
                    }
                  });    
                  // Report in the console for debugging
                  const tokenTable: any[] = [];
                  myTokens.forEach(item => {
                    if (item.ataAddress && item.address) {
                      tokenTable.push({
                        ataAddress: shortenAddress(item.ataAddress, 8),
                        address: shortenAddress(item.address, 8),
                        balance: item.balance
                      });
                    }
                  });
                  console.table(tokenTable);
                  setAccountTokens(myTokens);
                  setTokensLoaded(true);
                } else {
                  console.error('could not get account tokens');
                  setAccountTokens(myTokens);
                  setTokensLoaded(true);
                }
                // Preset the first available token
                selectAsset(myTokens[0]);
              })
              .catch(error => {
                console.error(error);
                setAccountTokens(myTokens);
                setTokensLoaded(true);
                selectAsset(myTokens[0]);
              });
          })
          .catch(error => {
            console.error(error);
          });
      }
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    accountAddress,
    userTokens,
    connection,
    customConnection,
    shouldLoadTokens,
    selectAsset
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

      if (lastTxSignature) {
        fetchAccountHistory(
          customConnection,
          pk,
          {
            before: lastTxSignature,
            limit: TRANSACTIONS_PER_PAGE
          },
          true
        )
        .then(history => {
          consoleOut('history:', history, 'blue');
          setTransactions(history.transactionMap, true);
          setStatus(FetchStatus.Fetched);
        })
        .catch(error => {
          console.error(error);
          setStatus(FetchStatus.FetchFailed);
        })
        .finally(() => setLoadingTransactions(false));
      } else {
        fetchAccountHistory(
          customConnection,
          pk,
          { limit: TRANSACTIONS_PER_PAGE },
          true
        )
        .then(history => {
          consoleOut('history:', history, 'blue');
          setTransactions(history.transactionMap);
          setStatus(FetchStatus.Fetched);
        })
        .catch(error => {
          console.error(error);
          setStatus(FetchStatus.FetchFailed);
        })
        .finally(() => setLoadingTransactions(false));
      }

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
    setTransactions,
    getScanAddress,
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
      if (isInputValid) {
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
  }, [isInputValid]);

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
        const onTokenAccountClick = () => selectAsset(asset, true);
        return (
          <div key={`${index + 50}`} onClick={onTokenAccountClick}
               className={selectedAsset && selectedAsset.symbol === asset.symbol ? 'transaction-list-row selected' : 'transaction-list-row'}>
            <div className="icon-cell">
              <div className="token-icon">
                {asset.logoURI ? (
                  <img alt={`${asset.name}`} width={30} height={30} src={asset.logoURI} />
                ) : (
                  <Identicon address={asset.address} style={{ width: "30", display: "inline-flex" }} />
                )}
              </div>
            </div>
            <div className="description-cell">
              <div className="title text-truncate">{asset.symbol}</div>
              <div className="subtitle text-truncate">{asset.name}</div>
            </div>
            <div className="rate-cell">
              <div className="rate-amount">
                {getTokenAmountAndSymbolByTokenAddress(asset.balance || 0, asset.address, true)}
              </div>
            </div>
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
    return transactions?.map((trans: MappedTransaction) => {
      return <TransactionItemView
                key={trans.signature}
                transaction={trans}
                selectedAsset={selectedAsset as UserTokenAccount}
                accountAddress={accountAddress}
                tokenAccounts={accountTokens} />;
    });
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
          <Button className="secondary-button" shape="round" size="middle" type="default"
                  onClick={handleGoToExchangeClick}>{t('assets.no-balance.cta2')}</Button>
        </Space>
        {renderQrCode}
      </div>
    );
  };

  return (
    <>
      <div className="container main-container">

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
                  </div>
                </div>
                <div className="inner-container">
                  <div className="item-block vertical-scroll">
                    {renderTokenList}
                  </div>
                </div>
              </div>

              {/* Right / down panel */}
              <div className="transaction-list-container">
                <div className="transactions-heading"><span className="title">{t('assets.history-panel-title')}</span></div>
                <div className="inner-container">
                  {(transactions && transactions.length > 0) && (
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
                  <div className={transactions && transactions.length ? 'transaction-list-data-wrapper vertical-scroll' : 'transaction-list-data-wrapper empty'}>
                    <div className="activity-list">
                      {
                        transactions && transactions.length ? (
                          <div className="item-list-body compact">
                            {renderTransactions()}
                          </div>
                        ) : status === FetchStatus.Fetching ? (
                          <div className="h-100 flex-center">
                            <Spin indicator={antIcon} />
                          </div>
                        ) : status === FetchStatus.Fetched ? (
                          !selectedAsset ? (
                            <div className="h-100 flex-center">
                              <span>{t('assets.no-asset-selected')}</span>
                            </div>
                          ) : !selectedAsset.balance ? (
                            renderTokenBuyOptions()
                          ) : (
                            <div className="h-100 flex-center">
                              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{t('assets.no-transactions')}</p>} />
                            </div>
                          )
                        ) : status === FetchStatus.FetchFailed && (
                          <Result status="warning" title={t('assets.loading-error')} />
                        )
                      }
                    </div>
                  </div>
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
                        {/* <Button
                          type="ghost"
                          shape="round"
                          size="middle"
                          className="hidden-sm"
                          icon={<ArrowLeftOutlined />}
                          onClick={handleBackToAccountDetailsButtonClick}>
                          {t('assets.back-to-assets-cta')}
                        </Button> */}
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
                        {accountAddressInput && !isInputValid ? (
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
                    disabled={!isInputValid}>
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
