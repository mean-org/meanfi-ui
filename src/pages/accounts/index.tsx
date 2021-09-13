import React, { useCallback, useContext, useReducer } from 'react';
import { ArrowLeftOutlined, EditOutlined, QrcodeOutlined, ReloadOutlined, SyncOutlined } from '@ant-design/icons';
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { useEffect, useState } from 'react';
import { PreFooter } from '../../components/PreFooter';
import { TransactionItemView } from '../../components/TransactionItemView';
import { getSolanaExplorerClusterParam, useConnectionConfig } from '../../contexts/connection';
import { useWallet } from '../../contexts/wallet';
import {
  ActionTypes, defaultTransactionStats, ResetStatsAction, TransactionActions, TransactionStats,
  UserTokenAccount
} from '../../models/transactions';
import { AppStateContext } from '../../contexts/appstate';
import { useTranslation } from 'react-i18next';
import { Identicon } from '../../components/Identicon';
import { fetchAccountTokens, getTokenAmountAndSymbolByTokenAddress, shortenAddress } from '../../utils/utils';
import { Button, Empty, Tooltip } from 'antd';
import { consoleOut, copyText } from '../../utils/ui';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { HELP_URI_WALLET_GUIDE, MEAN_DAO_GITBOOKS_URL, SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from '../../constants';
import { QrScannerModal } from '../../components/QrScannerModal';
import _ from 'lodash';
import { IconCopy } from '../../Icons';
import { notify } from '../../utils/notifications';
import { environment } from '../../environments/environment';
import { fetchAccountHistory, MappedTransaction } from '../../utils/history';

const QRCode = require('qrcode.react');

export const AccountsView = () => {
  const connection = useConnectionConfig();
  const { publicKey, connected } = useWallet();
  const { theme } = useContext(AppStateContext);
  const [customConnection, setCustomConnection] = useState<Connection>();
  const {
    userTokens,
    signatures,
    transactions,
    selectedAsset,
    accountAddress,
    detailsPanelOpen,
    previousWalletConnectState,
    setSignatures,
    setTransactions,
    setSelectedAsset,
    setAccountAddress,
    setDtailsPanelOpen,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');

  const [accountAddressInput, setAccountAddressInput] = useState<string>('');
  const [shouldLoadTokens, setShouldLoadTokens] = useState(false);
  const [tokensLoaded, setTokensLoaded] = useState(false);
  const [accountTokens, setAccountTokens] = useState<UserTokenAccount[]>([]);
  const [canShowAccountDetails, setCanShowAccountDetails] = useState(accountAddress ? true : false);

  // Flow control
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [shouldLoadTransactions, setShouldLoadTransactions] = useState(true);
  const [stats, dispatch] = useReducer((state: TransactionStats, action: TransactionActions) => {
    switch (action.type) {
      case ActionTypes.SET_STATS:
        return {...state, ...action.payload};
      case ActionTypes.RESET_STATS:
        return {...state, ...defaultTransactionStats};
      case ActionTypes.RESET_INDEX:
        return Object.assign({}, state, { index: 0 });
      case ActionTypes.ROLL_INDEX:
        return Object.assign({}, state, { index: signatures.length - 1 });
      case ActionTypes.INCREMENT_INDEX:
        return Object.assign({}, state, { index: state.index + 1 });
      default:
        return state;
    }
  }, defaultTransactionStats);
  
  // QR scan modal
  const [isQrScannerModalVisible, setIsQrScannerModalVisibility] = useState(false);
  const showQrScannerModal = useCallback(() => setIsQrScannerModalVisibility(true), []);
  const closeQrScannerModal = useCallback(() => setIsQrScannerModalVisibility(false), []);
  const onAcceptQrScannerModal = () => {
    triggerWindowResize();
    closeQrScannerModal();
  };

  const abortSwitch = () => {
    setShouldLoadTransactions(false);
    setLoadingTransactions(false);
  }

  const startSwitch = () => {
    setLoadingTransactions(false);
    setShouldLoadTransactions(true);
  }

  const reloadSwitch = useCallback(() => {
    dispatch(new ResetStatsAction());
    setSignatures([]);
    setTransactions(undefined);
    startSwitch();
  }, [
    setTransactions,
    setSignatures
  ])

  const selectAsset = useCallback((asset: UserTokenAccount) => {
    abortSwitch();
    if (!asset || !asset.address) {
      setSignatures([]);
      setTransactions(undefined);
    }
    setSelectedAsset(asset);
    setDtailsPanelOpen(true);
    setTimeout(() => {
      startSwitch();
    }, 10);
  }, [
    setSignatures,
    setDtailsPanelOpen,
    setSelectedAsset,
    setTransactions
  ])

  const onAddAccountAddress = () => {
    setAccountAddress(accountAddressInput);
    setShouldLoadTokens(true);
    setCanShowAccountDetails(true);
    setTimeout(() => {
      setAccountAddressInput('');
    }, 100);
  }

  const handleScanAnotherAddressButtonClick = () => {
    setCanShowAccountDetails(false);
  }

  const handleBackToAccountDetailsButtonClick = () => {
    setCanShowAccountDetails(true);
  }

  const triggerWindowResize = () => {
    window.dispatchEvent(new Event('resize'));
  }

  const handleAccountAddressInputChange = (e: any) => {
    setAccountAddressInput(e.target.value);
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
                    tokenTable.push({
                      pubAddr: shortenAddress(item.ataAddress || '-', 8),
                      mintAddr: shortenAddress(item.address, 8),
                      balance: item.balance
                    });
                  });
                  console.table(tokenTable);
                  setAccountTokens(myTokens);
                  setTokensLoaded(true);
                } else {
                  console.log('could not get account tokens');
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

  const getScanAddress = useCallback((): PublicKey => {
    return selectedAsset?.ataAddress &&
           selectedAsset.ataAddress !== NATIVE_SOL_MINT.toBase58()
           ? new PublicKey(selectedAsset.ataAddress)
           : new PublicKey(accountAddress);
  },[
    accountAddress,
    selectedAsset?.ataAddress
  ]);

  // Start loading the transactions when signaled
  useEffect(() => {

    if (shouldLoadTransactions && tokensLoaded && customConnection && accountAddress && selectedAsset && !loadingTransactions) {
      setShouldLoadTransactions(false);
      if (!selectedAsset.address) {
        console.log('Asset has no public address, aborting...');
        setTransactions(undefined);
        dispatch(new ResetStatsAction());
        setLoadingTransactions(false);
        return;
      }
      setLoadingTransactions(true);
      console.log('pk:', getScanAddress().toBase58());

      fetchAccountHistory(
        customConnection,
        getScanAddress(),
        { limit: 10 },
        true
      )
      .then(history => {
        console.log('history:', history);
        setTransactions(history.transactionMap);
      })
      .finally(() => setLoadingTransactions(false));
    }

  }, [
    tokensLoaded,
    selectedAsset,
    accountAddress,
    customConnection,
    loadingTransactions,
    shouldLoadTransactions,
    setSignatures,
    getScanAddress,
    setTransactions
  ]);

  // Auto execute (when entering /accounts) if we have an address already stored
  useEffect(() => {
    if (!accountAddress || !customConnection || tokensLoaded || accountTokens.length) {
      return;
    }

    const timeout = setTimeout(() => {
      console.log('loading user tokens...');
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
        setAccountAddress(publicKey.toBase58());
        setSelectedAsset(undefined);
        setShouldLoadTokens(true);
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'blue');
      }
      setTimeout(() => {
        setCanShowAccountDetails(true);
        startSwitch();
      }, 100);
    }

  }, [
    connected,
    previousWalletConnectState,
    publicKey,
    setSelectedAsset,
    setAccountAddress
  ]);

  // Window resize listener
  useEffect(() => {
    const resizeListener = () => {
      const NUM_CHARS = 4;
      const ellipsisElements = document.querySelectorAll(".overflow-ellipsis-middle");
      for (let i = 0; i < ellipsisElements.length; ++i){
        const e = ellipsisElements[i] as HTMLElement;
        if (e.offsetWidth < e.scrollWidth){
          const text = e.textContent;
          e.dataset.tail = text?.slice(text.length - NUM_CHARS);
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
  }, []);

  ///////////////
  // Rendering //
  ///////////////

  const renderTokenList = (
    <>
    {accountTokens && accountTokens.length ? (
      accountTokens.map((asset, index) => {
        const onTokenAccountClick = () => selectAsset(asset);
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
      return <TransactionItemView key={trans.signature} transaction={trans} accountAddress={accountAddress} />;
    });
  };

  const renderQrCode = (
    <div className="text-center">
      <h3 className="font-bold mb-3">{t("deposits.send-from-wallet-cta-label")}</h3>
      <div className={theme === 'light' ? 'qr-container bg-white' : 'qr-container bg-black'}>
        {publicKey && (
          <QRCode
            value={publicKey.toBase58()}
            size={200}
            renderAs="svg"/>
        )}
      </div>
      <div className="transaction-field medium">
        <div className="transaction-field-row main-row">
          <span className="input-left recipient-field-wrapper">
            {publicKey && (
              <span id="address-static-field" className="overflow-ellipsis-middle">
                {publicKey.toBase58()}
              </span>
            )}
          </span>
          <div className="addon-right simplelink" onClick={onCopyAddress}>
            <IconCopy className="mean-svg-icons link" />
          </div>
        </div>
      </div>
      <div className="font-light font-size-75 px-4">{t('deposits.address-share-disclaimer')}</div>
    </div>
  );

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
                  <div className="stats-row">
                    <div className="fetch-control">
                      <span className="icon-button-container">
                        {loadingTransactions ? (
                          <Tooltip placement="bottom" title="Stop">
                            <Button
                              type="default"
                              shape="circle"
                              size="small"
                              onClick={abortSwitch}>
                              <SyncOutlined spin />
                            </Button>
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
                        <div className="std-table-cell fixed-width-120">{t('assets.history-table-amount')}</div>
                        <div className="std-table-cell fixed-width-150">{t('assets.history-table-postbalance')}</div>
                        <div className="std-table-cell fixed-width-80">{t('assets.history-table-date')}</div>
                      </div>
                    </div>
                  </div>
                  <div className="transaction-list-data-wrapper vertical-scroll">
                    <div className="activity-list">
                      {
                        transactions && transactions.length ? (
                          <div className="item-list-body compact">
                            {renderTransactions()}
                          </div>
                        ) : selectedAsset?.balance ? (
                          <p>No transactions</p>
                        ) : (
                          <p>No tiene lana</p>
                        )
                      }
                    </div>
                  </div>
                  {(stats && environment === 'local') && (
                    <div className="stream-share-ctas font-size-70">
                      <span className="fg-secondary-70 font-light mr-1">Item:</span><span className="font-regular fg-black mr-1">{stats.index}</span>
                      <span className="fg-secondary-70 font-light mr-1">out of:</span><span className="font-regular fg-black mr-1">{stats.total}</span>
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
                      <Tooltip placement="bottom" title={t('assets.account-address-change-cta')}>
                        <Button
                          type="default"
                          shape="circle"
                          size="middle"
                          icon={<ArrowLeftOutlined />}
                          onClick={handleBackToAccountDetailsButtonClick}
                        />
                      </Tooltip>
                    </span>
                  </div>
                )}
                <h2 className="text-center mb-3 px-3">{t('assets.account-add-heading')} {renderSolanaIcon} Solana</h2>
                <div className="flexible-left mb-3">
                  <div className="transaction-field">
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
                  </div>
                  {/* Go button */}
                  <Button
                    className="main-cta"
                    type="primary"
                    shape="round"
                    size="large"
                    onClick={onAddAccountAddress}
                    disabled={!accountAddressInput}>
                    {t('assets.account-add-cta-label')}
                  </Button>
                </div>
                <div className="text-center">
                  {t('assets.create-account-help')}<br />
                  <a className="primary-link font-medium text-uppercase" href={MEAN_DAO_GITBOOKS_URL + HELP_URI_WALLET_GUIDE} target="_blank" rel="noopener noreferrer">
                    {t('ui-menus.main-menu.services.wallet-guide')}
                  </a>
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
