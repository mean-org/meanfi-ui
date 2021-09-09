import React, { useCallback, useContext, useReducer } from 'react';
import { CheckCircleOutlined, PauseCircleOutlined, QrcodeOutlined, SyncOutlined } from '@ant-design/icons';
import { ConfirmedSignatureInfo, Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { useEffect, useState } from 'react';
import { PreFooter } from '../../components/PreFooter';
import { TransactionItemView } from '../../components/TransactionItemView';
import { useConnectionConfig } from '../../contexts/connection';
import { useWallet } from '../../contexts/wallet';
import useLocalStorage from '../../hooks/useLocalStorage';
import {
  ActionTypes, defaultTransactionStats, IncrementTransactionIndexAction, ResetStatsAction,
  SetStatsAction, TransactionActions, TransactionStats,
  TransactionWithSignature, Timestamp, MoveTxIndexToStartAction, UserTokenAccount
} from '../../models/transactions';
import { AppStateContext } from '../../contexts/appstate';
import { useTranslation } from 'react-i18next';
import { Identicon } from '../../components/Identicon';
import { fetchAccountTokens, getTokenAmountAndSymbolByTokenAddress, shortenAddress } from '../../utils/utils';
import { Button, Empty, Progress } from 'antd';
import { consoleOut, percentual } from '../../utils/ui';
import { NATIVE_SOL } from '../../utils/tokens';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { HELP_URI_WALLET_GUIDE, MEAN_DAO_GITBOOKS_URL } from '../../constants';
import { QrScannerModal } from '../../components/QrScannerModal';

export const AccountsView = () => {
  const connection = useConnectionConfig();
  const { publicKey, connected } = useWallet();
  const [customConnection, setCustomConnection] = useState<Connection>();
  const {
    tokens,
    userTokens,
    transactions,
    selectedAsset,
    detailsPanelOpen,
    previousWalletConnectState,
    setTransactions,
    setSelectedAsset,
    setDtailsPanelOpen,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');

  // User account address to use
  const [accountAddress, setAccountAddress] = useLocalStorage('lastUsedAccount', publicKey ? publicKey.toBase58() : '');
  const [accountAddressInput, setAccountAddressInput] = useState<string>('');
  const [shouldLoadTokens, setShouldLoadTokens] = useState(false);
  const [accountTokens, setAccountTokens] = useState<UserTokenAccount[]>([]);
  const [tokenDisplayList, setTokenDisplayList] = useState<UserTokenAccount[]>([]);

  // QR scan modal
  const [isQrScannerModalVisible, setIsQrScannerModalVisibility] = useState(false);
  const showQrScannerModal = useCallback(() => setIsQrScannerModalVisibility(true), []);
  const closeQrScannerModal = useCallback(() => setIsQrScannerModalVisibility(false), []);
  const onAcceptQrScannerModal = () => {
    triggerWindowResize();
    closeQrScannerModal();
  };

  // Setup custom connection with 'confirmed' commitment
  useEffect(() => {
    if (!customConnection) {
      setCustomConnection(new Connection(connection.endpoint, 'confirmed'));
    }
  }, [
    connection.endpoint,
    customConnection
  ]);

  // Fetch all the owned token accounts
  useEffect(() => {

    if (connection && customConnection && accountAddress && shouldLoadTokens && tokens) {
      setShouldLoadTokens(false);

      const pk = new PublicKey(accountAddress);
      let nativeBalance = 0;

      // Fetch SOL balance.
      customConnection.getBalance(pk)
        .then(value => nativeBalance = value || 0);

      fetchAccountTokens(pk, connection.endpoint)
        .then(accTks => {
          if (accTks) {
            const myTokens = new Array<UserTokenAccount>();
            myTokens.push(NATIVE_SOL as UserTokenAccount);
            myTokens[0].balance = nativeBalance / LAMPORTS_PER_SOL;
            myTokens[0].ataAddress = accountAddress;

            for (let i = 0; i < accTks.length; i++) {
              const item = accTks[i];
              const token = tokens.find(i => i.address === item.parsedInfo.mint);
              // Add the token only if matches one of the user's token account and it is not already in the list
              if (token) {
                token.ataAddress = item.pubkey.toBase58();
                token.balance = item.parsedInfo.tokenAmount.uiAmount || 0;
                if (!myTokens.some(t => t.address === token?.address)) {
                  myTokens.push(token);
                }
              }
            }

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
            console.log(accTks);
            setAccountTokens(myTokens);
          } else {
            console.log('could not get account tokens');
            setAccountTokens([]);
          }
        })
        .catch(error => {
          setAccountTokens([]);
          console.error(error);
        });
    }

  }, [
    tokens,
    connection,
    customConnection,
    shouldLoadTokens,
    accountAddress
  ]);

  // Decide which list to use for tokenDisplayList
  useEffect(() => {
    if (publicKey && userTokens) {
      setTokenDisplayList(userTokens);
      console.log('Switch to use userTokens');
    } else if (!publicKey && accountTokens) {
      setTokenDisplayList(accountTokens);
      console.log('Switch to use accountTokens');
    }
  }, [
    accountTokens,
    publicKey,
    userTokens
  ]);

  // Flow control
  const [shouldGetTxDetails, setShouldGetTxDetails] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [shouldLoadTransactions, setShouldLoadTransactions] = useState(true);
  const [abortSignalReceived, setAbortSignalReceived] = useState(false);

  // Data
  const [signatures, setSignatures] = useState<Array<ConfirmedSignatureInfo>>([]);
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

  const abortSwitch = () => {
    setAbortSignalReceived(true);
    setLoadingTransactions(false);
    setShouldGetTxDetails(false);
    setShouldLoadTransactions(false);
  }

  const resumeSwitch = () => {
    setAbortSignalReceived(false);
    setShouldGetTxDetails(true);
    setLoadingTransactions(true);
  }

  const reloadSwitch = () => {
    dispatch(new ResetStatsAction());
    dispatch(new MoveTxIndexToStartAction());
    setAbortSignalReceived(false);
    setLoadingTransactions(false);
    setShouldLoadTransactions(true);
  }

  const onAddAccountAddress = () => {
    console.log('Address:', accountAddressInput);
    setAccountAddress(accountAddressInput);
    setShouldLoadTokens(true);
    reloadSwitch();
    setTimeout(() => {
      setAccountAddressInput('');
    }, 100);
  }

  // Hook on the wallet connect/disconnect
  useEffect(() => {

    if (previousWalletConnectState !== connected) {
      // User is connecting
      if (!previousWalletConnectState && connected && publicKey) {
        consoleOut('Reading account address...', publicKey.toBase58(), 'blue');
        setAccountAddress(publicKey.toBase58());
        reloadSwitch();
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'blue');
        setShouldLoadTokens(true);
        reloadSwitch();
      }
    }

  }, [
    connected,
    previousWalletConnectState,
    publicKey,
    setAccountAddress
  ]);

  // Auto execute if we have an address already stored
  useEffect(() => {
    if (!customConnection || !accountAddress || !shouldLoadTransactions || loadingTransactions) {
      return;
    }

    const loadTransactionSignatures = async () => {
      if (customConnection && accountAddress && shouldLoadTransactions && !loadingTransactions) {
        setShouldLoadTransactions(false);
        console.log('selectedAsset:', selectedAsset);
        const pk = selectedAsset &&
                   selectedAsset.ataAddress &&
                   selectedAsset.ataAddress !== NATIVE_SOL_MINT.toBase58()
          ? new PublicKey(selectedAsset.ataAddress)
          : new PublicKey(accountAddress);
        console.log('pk:', pk.toBase58());

        customConnection.getConfirmedSignaturesForAddress2(pk)
          .then(sigs => {
            setSignatures(sigs);
            if (sigs.length > 0) {
              const newStats = new TransactionStats();
              newStats.index = 0;
              newStats.total = sigs.length;
              dispatch(new SetStatsAction(newStats));
              setShouldGetTxDetails(true);
            } else {
              setTransactions([]);
              dispatch(new ResetStatsAction());
              setLoadingTransactions(false);
            }
            console.log('Total signatures:', sigs.length);
          })
          .catch(error => {
            console.error(error.message, error);
            setSignatures([]);
            setShouldGetTxDetails(false);
            dispatch(new ResetStatsAction());
            setLoadingTransactions(false);
          });
      }
    }

    const timeout = setTimeout(() => {
      if (!publicKey) {
        setShouldLoadTokens(true);
      }
      setLoadingTransactions(true);
      loadTransactionSignatures();
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    publicKey,
    selectedAsset,
    accountAddress,
    customConnection,
    loadingTransactions,
    shouldLoadTransactions,
    setTransactions
  ]);

  // Get transaction detail for each signature if not already loaded
  useEffect(() => {
    if (!shouldGetTxDetails || !customConnection|| abortSignalReceived) {
      return;
    }

    const timeout = setTimeout(() => {
      // Turn OFF shouldGetTxDetails to avoid multiple entry points to this procedure
      // Lets turn it ON at will
      setShouldGetTxDetails(false);

      // Are we beyond the list index boundary ? Abort
      if (stats.index >= (signatures.length - 1)) {
        setLoadingTransactions(false);
        return;
      }

      // If the items dynamically changed in the list and current index
      // no longer valid, Abort
      const currentSignature = signatures[stats.index];
      if (!currentSignature) {
        setLoadingTransactions(false);
        return;
      }

      // Do we have the item already or do we need to fetch it?
      const needFetching = signatures.length > 0 &&
                           (!transactions || transactions.length === 0 ||
                            !transactions.some(tx => tx.signature === currentSignature.signature));
      if (needFetching) {
        customConnection.getConfirmedTransaction(currentSignature.signature)
          .then(confirmedTx => {
            if (confirmedTx) {
              const transWithSignature = new TransactionWithSignature(
                currentSignature.signature,
                confirmedTx,
                0
              );
              let timestamp: Timestamp = "unavailable";
              customConnection.getBlockTime(confirmedTx.slot)
                .then(bTime => {
                  timestamp = bTime !== null ? bTime : "unavailable";
                })
                .catch(error => {
                  console.error(error, { slot: `${confirmedTx.slot}` });
                })
                .finally(() => {
                  transWithSignature.timestamp = timestamp;
                  setTransactions([...transactions, transWithSignature]);
                  // Increment index to select next signature
                  dispatch(new IncrementTransactionIndexAction());
                  setShouldGetTxDetails(true);
                });
            } else {
              dispatch(new IncrementTransactionIndexAction());
              setShouldGetTxDetails(true);
            }
          })
      } else {
        dispatch(new IncrementTransactionIndexAction());
        setShouldGetTxDetails(true);
      }
    });

    return () => {
      clearTimeout(timeout);
    }
  }, [
    stats,
    signatures,
    transactions,
    customConnection,
    shouldGetTxDetails,
    abortSignalReceived,
    setTransactions
  ]);

  // Keep stats in sync when transaction's list changes
  /*
  useEffect(() => {
    if (accountAddress && transactions) {
      const incoming = transactions.filter(tx => tx.confirmedTransaction.transaction.instructions[0].keys[1].pubkey.toBase58() === accountAddress);
      const outgoing = transactions.filter(tx => tx.confirmedTransaction.transaction.instructions[0].keys[0].pubkey.toBase58() === accountAddress);
      const newStats = Object.assign({}, stats, {
        incoming: incoming.length,
        outgoing: outgoing.length
      });
      dispatch(new SetStatsAction(newStats));
    }
  }, [
    accountAddress,
    transactions
  ]);
  */

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

  const renderTokenList = (
    <>
    {tokenDisplayList && tokenDisplayList.length ? (
      tokenDisplayList.map((asset, index) => {
        const onTokenAccountClick = () => {
          setSelectedAsset(asset);
          console.log(`${asset.symbol} (${asset.name}) =>`, asset.ataAddress || asset.address);
          setDtailsPanelOpen(true);
          abortSwitch();
          setTimeout(() => {
            setSignatures([]);
            setTransactions([]);
            dispatch(new ResetStatsAction());
            setTimeout(() => {
              reloadSwitch();
            }, 50);
          }, 50);
        };
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
    return transactions?.map((trans) => {
      return <TransactionItemView key={trans.signature} transaction={trans} accountAddress={accountAddress} />;
    });
  };

  return (
    <>
      <div className="container main-container">

        <div className={accountAddress ? 'interaction-area' : 'interaction-area flex-center h-75'}>

          {accountAddress ? (
            <div className={`transactions-layout ${detailsPanelOpen ? 'details-open' : ''}`}>

              {/* Left / top panel*/}
              <div className="tokens-container">
                <div className="transactions-heading">
                  <span className="title">{t('assets.screen-title')}</span>
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
                    <div className="fetch-proggress">
                      <Progress percent={Math.round(percentual(stats.index + 1, stats.total))} size="small"
                                status={loadingTransactions ? "active" : "normal"} />
                    </div>
                    <div className="fetch-control">{loadingTransactions ? (
                      <>
                        <SyncOutlined spin />&nbsp;
                        <span role="link" className="secondary-link font-size-60 text-uppercase" onClick={abortSwitch}>Stop</span>
                      </>
                      ) : stats.index < stats.total ? (
                      <>
                        <PauseCircleOutlined className="fg-dark-active" />&nbsp;
                        <span role="link" className="secondary-link font-size-60 text-uppercase" onClick={resumeSwitch}>Resume</span>
                      </>
                      ) : (
                      <>
                        <CheckCircleOutlined className="fg-success" />&nbsp;
                        <span role="link" className="secondary-link font-size-60 text-uppercase" onClick={reloadSwitch}>Reload</span>
                      </>
                      )}
                    </div>
                    {/*  */}
                    <div className="item-list-header compact">
                      <div className="header-row">
                        <div className="std-table-cell first-cell">&nbsp;</div>
                        <div className="std-table-cell responsive-cell">Src/Dst</div>
                        <div className="std-table-cell fixed-width-120">Amount</div>
                        <div className="std-table-cell fixed-width-150">Post Balance</div>
                        <div className="std-table-cell fixed-width-80">Date</div>
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
                        ) : loadingTransactions ? (
                          <p>Loading transactions...</p>
                        ) : (
                          <p>No transactions</p>
                        )
                      }
                    </div>
                  </div>
                  {stats && (
                    <div className="stream-share-ctas font-size-70">
                      <span className="fg-secondary-70 font-light mr-1">Item:</span><span className="font-regular fg-black mr-1">{stats.index}</span>
                      <span className="fg-secondary-70 font-light mr-1">out of:</span><span className="font-regular fg-black">{stats.total}</span>
                    </div>
                  )}
                </div>
              </div>

            </div>
          ) : (
            <>
              <div className="boxed-area">
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
