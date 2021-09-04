import React, { useContext, useReducer } from 'react';
import { CheckCircleOutlined, SyncOutlined } from '@ant-design/icons';
import { ConfirmedSignatureInfo, Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { useCallback, useEffect, useState } from 'react';
import { PreFooter } from '../../components/PreFooter';
import { TransactionItemView } from '../../components/TransactionItemView';
import { ENDPOINTS, useConnectionConfig } from '../../contexts/connection';
import { useWallet } from '../../contexts/wallet';
import { TransactionWithSignature } from '../../utils/transactions';
import {
  ActionTypes, defaultTransactionStats, IncrementTransactionIndexAction,
  ResetStatsAction, MoveTxIndexToEndAction, SetStatsAction, TransactionActions, TransactionStats, UserTokenAccount
} from '../../models/transactions';
import { AppStateContext } from '../../contexts/appstate';
import { TokenListProvider } from '@solana/spl-token-registry';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { useUserAccounts } from '../../hooks';
import { useTranslation } from 'react-i18next';
import { environment } from '../../environments/environment';
import { MEAN_TOKEN_LIST } from '../../constants/token-list';
import { Identicon } from '../../components/Identicon';
import { getTokenAmountAndSymbolByTokenAddress } from '../../utils/utils';
import _ from 'lodash';
import { NATIVE_SOL } from '../../utils/tokens';
import { useNativeAccount } from '../../contexts/accounts';

export const AccountsView = () => {
  const connection = useConnectionConfig();
  const { publicKey, connected } = useWallet();
  const [customConnection, setCustomConnection] = useState<Connection>();
  const chain = ENDPOINTS.find((end) => end.endpoint === connection.endpoint) || ENDPOINTS[0];
  const { userAccounts } = useUserAccounts();
  const { account } = useNativeAccount();
  const [nativeBalance, setNativeBalance] = useState(0);
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);

  // Setup custom connection with 'confirmed' commitment
  useEffect(() => {
    if (!customConnection) {
      setCustomConnection(new Connection(connection.endpoint, 'confirmed'));
    }
  }, [
    connection.endpoint,
    customConnection
  ]);

  // Keep track of native account balance
  useEffect(() => {

    const getAccountBalance = (): number => {
      return (account?.lamports || 0) / LAMPORTS_PER_SOL;
    }

    if (account?.lamports !== previousBalance || !nativeBalance) {
      // Refresh token balance
      setNativeBalance(getAccountBalance());
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [
    account,
    previousBalance
  ]);

  const {
    detailsPanelOpen,
    previousWalletConnectState,
    setDtailsPanelOpen
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');

  const [tokens, setTokens] = useState<UserTokenAccount[]>([]);
  const [userTokens, setUserTokens] = useState<UserTokenAccount[]>();

  // Load Solana SPL Token List
  useEffect(() => {
    (async () => {
      let list = new Array<UserTokenAccount>();
      if (environment === 'production') {
        const res = await new TokenListProvider().resolve();
        list = res
          .filterByChainId(chain.chainID)
          .excludeByTag("nft")
          .getList();
      } else {
        list = MEAN_TOKEN_LIST.filter(t => t.chainId === chain.chainID);
      }
      setTokens(list);
    })();

    return () => { }

  }, []);

  // Flow control
  const [shouldGetTxDetails, setShouldGetTxDetails] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [abortSignalReceived, setAbortSignalReceived] = useState(false);
  const [shouldLoadBalances, setShouldLoadBalances] = useState(false);

  // Data
  const [signatures, setSignatures] = useState<Array<ConfirmedSignatureInfo>>([]);
  const [transactions, setTransactions] = useState<Array<TransactionWithSignature>>([]);
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

  // Methods
  const abortSwitch = () => {
    setAbortSignalReceived(abortSignalReceived => !abortSignalReceived);
    setShouldGetTxDetails(false);
    setLoadingTransactions(false);
    dispatch(new MoveTxIndexToEndAction());
  }

  const loadTransactionSignatures = useCallback(() => {

    if (customConnection && publicKey && !loadingTransactions) {
      setLoadingTransactions(true);
      customConnection.getConfirmedSignaturesForAddress2(publicKey)
        .then(sigs => {
          setSignatures(sigs);
          const newStats = new TransactionStats();
          newStats.index = 0;
          newStats.total = sigs.length;
          dispatch(new SetStatsAction(newStats));
          console.log('transSignatures:', signatures);
          console.log('stats:', newStats);
          if (sigs.length > 0) {
            setShouldGetTxDetails(true);
          } else {
            setTransactions([]);
            dispatch(new ResetStatsAction());
            setLoadingTransactions(false);
          }
        })
        .catch(error => {
          console.error(error.message, error);
          setSignatures([]);
          setShouldGetTxDetails(false);
          dispatch(new ResetStatsAction());
          setLoadingTransactions(false);
        });
    }

    // Cleanup
    return () => {
      setLoadingTransactions(false);
      setSignatures([]);
      setTransactions([]);
      dispatch(new ResetStatsAction());
    }
  }, [
    stats,
    customConnection,
    loadingTransactions,
    publicKey
  ]);

  const getTokenBalance = useCallback(async (tokenPk: PublicKey) => {
    if (tokenPk.equals(NATIVE_SOL_MINT)) {
      const info = await customConnection?.getAccountInfo(publicKey as PublicKey);
      const balance = info ? info.lamports / LAMPORTS_PER_SOL : 0;
      return balance;
    } else {
      const associatedTokenAddress = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        tokenPk,
        publicKey as PublicKey
      );
      if (associatedTokenAddress) {
        const info = await customConnection?.getTokenAccountBalance(associatedTokenAddress);
        const balance = info && info.value ? (info.value.uiAmount || 0) : 0;
        return balance;
      } else {
        return 0;
      }
    }
  }, [
    customConnection, 
    publicKey
  ]);

  const loadUserTokens = () => {
    if (connection && publicKey && tokens && userAccounts && userAccounts.length > 0) {
      const myTokens = new Array<UserTokenAccount>();
      myTokens.push(NATIVE_SOL as UserTokenAccount);
      for (let i = 0; i < userAccounts.length; i++) {
        const item = userAccounts[i];
        let token: UserTokenAccount | undefined;
        const mintAddress = item.info.mint.toBase58();
        // console.log(`Account ${i + 1} of ${userAccounts.length}| Native: ${item.info.isNative ? 'Yes' : 'No'} | mint address:`, mintAddress || '-');
        token = tokens.find(i => i.address === mintAddress);

        // Add the token only if matches one of the user's token account and it is not already in the list
        if (token) {
          if (!myTokens.some(t => t.address === token?.address)) {
            myTokens.push(token);
          }
        }
      }

      console.log('myTokens:', myTokens);
      setTimeout(() => {
        setShouldLoadBalances(true);
        setUserTokens(myTokens);
      }, 10);
    }
  }

  // Automatically update the balances when the list of tokens change
  useEffect(() => {

    const getBalances = async (tokenList: UserTokenAccount[]) => {
      if (tokenList && tokenList.length > 0 && userAccounts && userAccounts.length > 0) {
        const tokenListCopy = _.cloneDeep(tokenList);
        tokenListCopy[0].balance = nativeBalance;
        for (let i = 1; i < tokenListCopy.length; i++) {
          const tokenAddress = tokenListCopy[i].address;
          const tokenMint = userAccounts.find(m => m.info.mint.toBase58() === tokenAddress);
          if (tokenMint) {
            tokenListCopy[i].balance = await getTokenBalance(tokenMint.info.mint);
          }
        }
        setUserTokens(tokenListCopy);
        setShouldLoadBalances(false);
      }
    }
  
    if (userTokens && userTokens.length && shouldLoadBalances) {
      getBalances(userTokens);
    }
  }, [userTokens]);

  // Auto execute if wallet is connected
  useEffect(() => {

    if (customConnection && publicKey && userAccounts?.length > 0) {
      if (!userTokens || userTokens.length === 0) {
        loadUserTokens();
      }
      // setAbortSignalReceived(false);
      // loadTransactionSignatures();
    }
  }, [
    publicKey,
    customConnection,
    userAccounts,
    userTokens
  ]);

  // Hook on wallet disconnect
  useEffect(() => {
    if (previousWalletConnectState !== connected) {
      if (previousWalletConnectState && !connected) {
        console.log('Deactivating account stats...');
        setAbortSignalReceived(true);
        setShouldGetTxDetails(false);
        setLoadingTransactions(false);
        setUserTokens(undefined);
      }
    }
  }, [
    connected,
    publicKey,
    userAccounts,
    customConnection,
    previousWalletConnectState
  ]);

  // Get transaction detail for each signature if not already loaded
  /*
  useEffect(() => {

    if (shouldGetTxDetails && customConnection && publicKey && !abortSignalReceived) {
      setShouldGetTxDetails(false);
      // Process current signature (signatures[stats.index].signature)
      // if its corresponding detail is not loaded into the transactions array
      const currentSignature = signatures[stats.index];
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
                confirmedTx
              );
              setTransactions(items => [...items, transWithSignature]);
              // Increment index to select next signature
              dispatch(new IncrementTransactionIndexAction());
              setShouldGetTxDetails(true);
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
  */

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
          console.log('selected token account:', token);
          // TODO: Actually set the address of the token for scanning transactions
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
      return <TransactionItemView key={trans.signature} transaction={trans} />;
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
                {connected ? (
                  transactions && transactions.length ? (
                    renderTransactions()
                  ) : loadingTransactions ? (
                    <p>Loading transactions...</p>
                  ) : (
                    <p>No transactions</p>
                  )
                ) : (
                  <p>{t('general.not-connected')}</p>
                )}
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
