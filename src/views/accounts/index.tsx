import React, { useContext, useReducer } from 'react';
import { CheckCircleOutlined, SyncOutlined } from '@ant-design/icons';
import { ConfirmedSignatureInfo, Connection } from '@solana/web3.js';
import { useEffect, useState } from 'react';
import { PreFooter } from '../../components/PreFooter';
import { TransactionItemView } from '../../components/TransactionItemView';
import { useConnectionConfig } from '../../contexts/connection';
import { useWallet } from '../../contexts/wallet';
import {
  ActionTypes, defaultTransactionStats, IncrementTransactionIndexAction, ResetStatsAction,
  MoveTxIndexToEndAction, SetStatsAction, TransactionActions, TransactionStats, UserTokenAccount,
  TransactionWithSignature, Timestamp
} from '../../models/transactions';
import { AppStateContext } from '../../contexts/appstate';
import { useTranslation } from 'react-i18next';
import { Identicon } from '../../components/Identicon';
import { getTokenAmountAndSymbolByTokenAddress, shortenAddress } from '../../utils/utils';
import _ from 'lodash';

export const AccountsView = () => {
  const connection = useConnectionConfig();
  const { publicKey, connected } = useWallet();
  const [customConnection, setCustomConnection] = useState<Connection>();
  const {
    userTokens,
    transactions,
    detailsPanelOpen,
    previousWalletConnectState,
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
    setAbortSignalReceived(value => !value);
    setShouldGetTxDetails(false);
    setLoadingTransactions(false);
    dispatch(new MoveTxIndexToEndAction());
  }

  const loadTransactionSignatures = async () => {
    if (customConnection && publicKey && !loadingTransactions) {
      setLoadingTransactions(true);
      try {
        const sigs = await customConnection.getConfirmedSignaturesForAddress2(publicKey);
        setSignatures(sigs);
        const newStats = new TransactionStats();
        newStats.index = 0;
        newStats.total = sigs.length;
        dispatch(new SetStatsAction(newStats));
        console.log('transSignatures:', signatures);
        if (sigs.length > 0) {
          setShouldGetTxDetails(true);
        } else {
          setTransactions([]);
          dispatch(new ResetStatsAction());
          setLoadingTransactions(false);
        }
      } catch (error) {
        console.error(error.message, error);
        setSignatures([]);
        setShouldGetTxDetails(false);
        dispatch(new ResetStatsAction());
        setLoadingTransactions(false);
      }
    }
  }

  // Auto execute if wallet is connected
  useEffect(() => {

    if (customConnection && publicKey) {
      setAbortSignalReceived(false);
      loadTransactionSignatures();
    }

    return () => {
      setSelectedAsset(undefined);
    }
  }, [
    publicKey,
    customConnection
  ]);

  // Hook on wallet disconnect
  useEffect(() => {

    if (previousWalletConnectState !== connected) {
      // Connection changed
      if (!previousWalletConnectState && connected) {
        // Connecting
        console.log('Execute on wallet connect...');
        // setAbortSignalReceived(false);
        // loadTransactionSignatures();
      } else if (previousWalletConnectState && !connected) {
        // disconnecting
        console.log('Execute on wallet disconnect...');
        // setAbortSignalReceived(true);
        // setShouldGetTxDetails(false);
        // setLoadingTransactions(false);
        // setSelectedAsset(undefined);
      }
    }
  }, [
    connected,
    previousWalletConnectState
  ]);

  // Get transaction detail for each signature if not already loaded
  useEffect(() => {

    if (shouldGetTxDetails && customConnection && publicKey && !abortSignalReceived) {
      setShouldGetTxDetails(false);
      // Process current signature (signatures[stats.index].signature)
      // if its corresponding detail is not loaded into the transactions array
      const currentSignature = signatures[stats.index];
      if (!currentSignature) { return; }
      const needFetching = signatures.length > 0 &&
                           (!transactions || transactions.length === 0 ||
                            !transactions.some(tx => tx.signature === currentSignature.signature));

      // If no need to fetch the Tx detail and the signature is the last one in the list
      if (!needFetching && stats.index >= (signatures.length - 1)) {
        // Set the state to stop and finish the whole process
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
            }
          })
      } else {
        // Increment index to select next signature
        dispatch(new IncrementTransactionIndexAction());
        // Set state to load next Tx details
        setShouldGetTxDetails(true);
      }
    }
  }, [
    stats,
    publicKey,
    signatures,
    transactions,
    customConnection,
    shouldGetTxDetails,
    abortSignalReceived,
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
          console.log(`Selected: ${token.symbol} (${token.name}) =>`, shortenAddress(token.address));
          setSelectedAsset(token);
          setDtailsPanelOpen(true);
        };
        return (
          <div key={`${index + 50}`} onClick={onTokenAccountClick} className={`transaction-list-row`}>
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
            <div className="description-cell pl-2">
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

          <div className={`streams-layout ${detailsPanelOpen ? 'details-open' : ''}`}>

            {/* Left / top panel*/}
            <div className="streams-container">
              <div className="streams-heading">
                <span className="title">{t('assets.screen-title')}</span>
              </div>
              <div className="inner-container">
                <div className="item-block vertical-scroll">
                  {renderTokenList}
                </div>
              </div>
            </div>

            {/* Right / down panel */}
            <div className="stream-details-container">
              <div className="streams-heading"><span className="title">{t('assets.history-panel-title')}</span></div>
              <div className="inner-container">
                <div className="stats-row">
                  <span>Activity:&nbsp;{loadingTransactions ? (
                    <>
                      <SyncOutlined spin />
                      &nbsp;<span role="link" className="secondary-link" onClick={abortSwitch}>Stop</span>
                    </>
                    ) : (
                      <CheckCircleOutlined className="fg-success" />
                    )}
                  </span>
                </div>
                <div className="stream-details-data-wrapper vertical-scroll">
                  <div className="activity-list">
                    <div className="item-list-header compact">
                      <div className="header-row">
                        <div className="std-table-cell first-cell">&nbsp;</div>
                        <div className="std-table-cell responsive-cell">Src/Dst</div>
                        <div className="std-table-cell fixed-width-120">Amount</div>
                        <div className="std-table-cell fixed-width-150">Post Balance</div>
                        <div className="std-table-cell fixed-width-80">Date</div>
                      </div>
                    </div>
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
              </div>
            </div>

          </div>

        </div>

        {/* <div>
          <p>Activity:&nbsp;{loadingTransactions ? (
            <>
              <SyncOutlined spin />
              &nbsp;<span role="link" className="secondary-link" onClick={abortSwitch}>Stop</span>
            </>
          ) : (
            <CheckCircleOutlined className="fg-success" />
          )}
          </p>
          <p>Abort signal received: {abortSignalReceived ? 'true' : 'false'}</p>
          <p>Tx: {stats.total ? stats.index + 1 : 0} of {stats.total} | incoming: {stats.incoming} outgoing: {stats.outgoing}</p>
          <div>{renderTransactions()}</div>
        </div> */}
      </div>
      <PreFooter />
    </>
  );

};
