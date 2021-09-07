import React, { useCallback, useContext, useReducer } from 'react';
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
  TransactionWithSignature, Timestamp
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
    detailsPanelOpen,
    setDtailsPanelOpen,
    setTransactions
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
  const [selectedAsset, setSelectedAsset] = useState<UserTokenAccount | undefined>(undefined);
  const [signatures, setSignatures] = useState<Array<ConfirmedSignatureInfo>>([]);
  const [stats, dispatch] = useReducer((state: TransactionStats, action: TransactionActions) => {
    switch (action.type) {
      case ActionTypes.SET_STATS:
        return {...state, ...action.payload};
      case ActionTypes.RESET_STATS:
        return {...state, ...defaultTransactionStats};
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
    setAbortSignalReceived(false);
    setLoadingTransactions(true);
    setShouldLoadTransactions(true);
  }

  const selectAsset = (asset: UserTokenAccount) => {
    console.log(`${asset.symbol} (${asset.name}) =>`, shortenAddress(asset.ataAddress || asset.address, 8));
    setSelectedAsset(asset);
    setDtailsPanelOpen(true);
    if (loadingTransactions) {
      abortSwitch();
    }
    setTimeout(() => {
      reloadSwitch();
    }, 100);
  }

  const loadTransactionSignatures = useCallback(async () => {
    if (customConnection && publicKey && shouldLoadTransactions && !loadingTransactions) {
      setShouldLoadTransactions(false);
      const pk = selectedAsset &&
                 selectedAsset.ataAddress &&
                 selectedAsset.ataAddress !== NATIVE_SOL_MINT.toBase58()
        ? new PublicKey(selectedAsset.ataAddress)
        : publicKey
      customConnection.getConfirmedSignaturesForAddress2(pk)
        .then(sigs => {
          setSignatures(sigs);
          const newStats = new TransactionStats();
          newStats.index = 0;
          newStats.total = sigs.length;
          dispatch(new SetStatsAction(newStats));
          if (sigs.length > 0) {
            setShouldGetTxDetails(true);
          } else {
            setTransactions([]);
            dispatch(new ResetStatsAction());
            setLoadingTransactions(false);
          }
          console.log('transSignatures:', sigs);
        })
        .catch(error => {
          console.error(error.message, error);
          setSignatures([]);
          setShouldGetTxDetails(false);
          dispatch(new ResetStatsAction());
          setLoadingTransactions(false);
        });
    }
  }, [
    publicKey,
    selectedAsset,
    customConnection,
    loadingTransactions,
    shouldLoadTransactions,
    setTransactions,
  ])

  // Auto execute if wallet is connected
  useEffect(() => {

    if (customConnection && publicKey && shouldLoadTransactions) {
      setLoadingTransactions(true);
      loadTransactionSignatures();
    }

    return () => {
      setSelectedAsset(undefined);
    }
  }, [
    publicKey,
    customConnection,
    shouldLoadTransactions,
    loadTransactionSignatures
  ]);

  // Get transaction detail for each signature if not already loaded
  useEffect(() => {
    if (!shouldGetTxDetails || !customConnection || !publicKey || abortSignalReceived) {
      return;
    }

    const timeout = setTimeout(() => {
      const currentSignature = signatures[stats.index];
      if (!currentSignature) {
        setShouldGetTxDetails(false);
        setLoadingTransactions(false);
        return;
      }
      const needFetching = signatures.length > 0 &&
                           (!transactions || transactions.length === 0 ||
                            !transactions.some(tx => tx.signature === currentSignature.signature));

      // If no need to fetch the Tx detail and the signature is the last one in the list
      if (!needFetching && stats.index >= (signatures.length - 1)) {
        // Set the state to stop and finish the whole process
        setShouldGetTxDetails(false);
        setLoadingTransactions(false);
        return;
      }

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
      userTokens.map((token, index) => {
        const onTokenAccountClick = () => {
          selectAsset(token);
        };
        return (
          <div key={`${index + 50}`} onClick={onTokenAccountClick}
               className={selectedAsset && selectedAsset.symbol === token.symbol ? 'transaction-list-row selected' : 'transaction-list-row'}>
            <div className="icon-cell">
              <div className="token-icon">
                {token.logoURI ? (
                  <img
                    alt={`${token.name}`}
                    width={30}
                    height={30}
                    src={token.logoURI}
                  />
                ) : (
                  <Identicon
                    address={token.address}
                    style={{ width: "30", display: "inline-flex" }}
                  />
                )}
              </div>
            </div>
            <div className="description-cell">
              <div className="title text-truncate">{token.symbol}</div>
              <div className="subtitle text-truncate">{token.name}</div>
            </div>
            <div className="rate-cell">
              <div className="rate-amount">
                {getTokenAmountAndSymbolByTokenAddress(token.balance || 0, token.address, true)}
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
                  {selectedAsset && (
                    <div className="stream-share-ctas font-size-70">
                      <span className="fg-secondary-70 font-light mr-1">asset:</span><span className="font-bold fg-black mr-1">{selectedAsset.symbol}</span>
                      <span className="fg-secondary-70 font-light mr-1">address:</span><span className="font-bold fg-black">{selectedAsset.ataAddress}</span>
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
