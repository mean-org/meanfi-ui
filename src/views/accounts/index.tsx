import React, { useContext, useReducer } from 'react';
import { CheckCircleOutlined, PauseCircleOutlined, SyncOutlined } from '@ant-design/icons';
import { ConfirmedSignatureInfo, Connection, PublicKey } from '@solana/web3.js';
import { useEffect, useState } from 'react';
import { PreFooter } from '../../components/PreFooter';
import { TransactionItemView } from '../../components/TransactionItemView';
import { useConnectionConfig } from '../../contexts/connection';
import { useWallet } from '../../contexts/wallet';
import {
  ActionTypes, defaultTransactionStats, IncrementTransactionIndexAction, ResetStatsAction,
  SetStatsAction, TransactionActions, TransactionStats, UserTokenAccount,
  TransactionWithSignature, Timestamp, MoveTxIndexToStartAction
} from '../../models/transactions';
import { AppStateContext } from '../../contexts/appstate';
import { useTranslation } from 'react-i18next';
import { Identicon } from '../../components/Identicon';
import { getTokenAmountAndSymbolByTokenAddress, shortenAddress } from '../../utils/utils';
import { Progress } from 'antd';
import { percentual } from '../../utils/ui';
import { NATIVE_SOL_MINT } from '../../utils/ids';

export const AccountsView = () => {
  const connection = useConnectionConfig();
  const { publicKey, connected } = useWallet();
  const [customConnection, setCustomConnection] = useState<Connection>();
  const {
    userTokens,
    transactions,
    selectedAsset,
    detailsPanelOpen,
    setDtailsPanelOpen,
    setSelectedAsset,
    setTransactions,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');

  // Setup custom connection with 'confirmed' commitment
  useEffect(() => {
    if (!customConnection) {
      setCustomConnection(new Connection(connection.endpoint, 'confirmed'));
    }
  }, [
    connection.endpoint,
    customConnection
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

  // Auto execute if wallet is connected
  useEffect(() => {
    if (!customConnection || !publicKey || !shouldLoadTransactions || loadingTransactions) {
      return;
    }

    const loadTransactionSignatures = async () => {
      if (customConnection && publicKey && shouldLoadTransactions && !loadingTransactions) {
        setShouldLoadTransactions(false);
        console.log('selectedAsset:', selectedAsset);
        const pk = selectedAsset &&
                   selectedAsset.ataAddress &&
                   selectedAsset.ataAddress !== NATIVE_SOL_MINT.toBase58()
          ? new PublicKey(selectedAsset.ataAddress)
          : publicKey
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
      setLoadingTransactions(true);
      loadTransactionSignatures();
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    publicKey,
    selectedAsset,
    customConnection,
    loadingTransactions,
    shouldLoadTransactions,
    setTransactions
  ]);

  // Get transaction detail for each signature if not already loaded
  useEffect(() => {
    if (!shouldGetTxDetails || !customConnection || !publicKey || abortSignalReceived) {
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
    publicKey,
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
    if (publicKey && transactions) {
      const incoming = transactions.filter(tx => tx.confirmedTransaction.transaction.instructions[0].keys[1].pubkey.toBase58() === publicKey.toBase58());
      const outgoing = transactions.filter(tx => tx.confirmedTransaction.transaction.instructions[0].keys[0].pubkey.toBase58() === publicKey.toBase58());
      const newStats = Object.assign({}, stats, {
        incoming: incoming.length,
        outgoing: outgoing.length
      });
      dispatch(new SetStatsAction(newStats));
    }
  }, [
    publicKey,
    transactions
  ]);
  */

  const renderTokenList = (
    <>
    {userTokens && userTokens.length ? (
      userTokens.map((asset, index) => {
        const onTokenAccountClick = () => {
          setSelectedAsset(asset);
          console.log(`${asset.symbol} (${asset.name}) =>`, asset.ataAddress || asset.address);
          // setDtailsPanelOpen(true);
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
                  <img
                    alt={`${asset.name}`}
                    width={30}
                    height={30}
                    src={asset.logoURI}
                  />
                ) : (
                  <Identicon
                    address={asset.address}
                    style={{ width: "30", display: "inline-flex" }}
                  />
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
      <>
      <p>{t('general.not-connected')}</p>
      </>
    )}

    </>
  );

  const renderTransactions = () => {
    return transactions?.map((trans) => {
      return <TransactionItemView key={trans.signature} transaction={trans} publicKey={publicKey} />;
    });
  };

  return (
    <>
      <div className="container main-container">

        <div className="interaction-area">

          {publicKey ? (
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
                      {connected && (
                        transactions && transactions.length ? (
                          <div className="item-list-body compact">
                            {renderTransactions()}
                          </div>
                        ) : loadingTransactions ? (
                          <p>Loading transactions...</p>
                        ) : (
                          <p>No transactions</p>
                        )
                      )}
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
            <p>{t("general.not-connected")}.</p>
          )}

        </div>

      </div>
      <PreFooter />
    </>
  );

};
