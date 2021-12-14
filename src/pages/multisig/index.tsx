import React, { useCallback, useContext, useMemo } from 'react';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CheckOutlined,
  ContainerFilled,
  EllipsisOutlined,
  InfoCircleOutlined,
  LoadingOutlined, 
  ReloadOutlined, 
  SearchOutlined

} from '@ant-design/icons';

import { Account, ConfirmOptions, Connection, DataSizeFilter, Enum, GetProgramAccountsFilter, LAMPORTS_PER_SOL, PublicKey, PublicKeyInitData, SYSVAR_RENT_PUBKEY, Transaction, TransactionInstruction } from '@solana/web3.js';
import { useEffect, useState } from 'react';
import { PreFooter } from '../../components/PreFooter';
import { getSolanaExplorerClusterParam, useConnectionConfig } from '../../contexts/connection';
import { useWallet } from '../../contexts/wallet';
import { AppStateContext } from '../../contexts/appstate';
import { useTranslation } from 'react-i18next';
import { Identicon } from '../../components/Identicon';
import {
  formatAmount,
  formatThousands,
  getAmountWithSymbol,
  getTokenAmountAndSymbolByTokenAddress,
  getTokenByMintAddress,
  getTokenSymbol,
  getTxIxResume,
  shortenAddress

} from '../../utils/utils';

import { Button, Col, Divider, Dropdown, Empty, Menu, Modal, Row, Space, Spin, Tooltip } from 'antd';
import {
  copyText,
  consoleOut,
  isValidAddress,
  getIntervalFromSeconds,
  getTransactionModalTitle,
  getFormattedNumberToLocale,
  getTransactionStatusForLogs,
  getTransactionOperationDescription,
  delay,
  isLocal

} from '../../utils/ui';

import {
  FALLBACK_COIN_IMAGE,
  SIMPLE_DATE_FORMAT,
  SIMPLE_DATE_TIME_FORMAT,
  SOLANA_EXPLORER_URI_INSPECT_ADDRESS,
  STREAMS_REFRESH_TIMEOUT,
  VERBOSE_DATE_TIME_FORMAT

} from '../../constants';

import { isDesktop } from "react-device-detect";
import useWindowSize from '../../hooks/useWindowResize';
import { OperationType, TransactionStatus } from '../../models/enums';
import { TransactionStatusContext } from '../../contexts/transaction-status';
import { notify } from '../../utils/notifications';
import { IconBank, IconClock, IconDocument, IconExternalLink, IconSort, IconTrash, IconWallet } from '../../Icons';
import { TreasuryOpenModal } from '../../components/TreasuryOpenModal';
import { MSP_ACTIONS, StreamInfo, STREAM_STATE, TransactionFees, TreasuryInfo, TreasuryType } from '@mean-dao/money-streaming/lib/types';
// import { TreasuryCreateModal } from '../../components/TreasuryCreateModal';
import { MoneyStreaming } from '@mean-dao/money-streaming/lib/money-streaming';
import dateFormat from 'dateformat';
import { PerformanceCounter } from '../../utils/perf-counter';
import { calculateActionFees } from '@mean-dao/money-streaming/lib/utils';
import { useAccountsContext, useNativeAccount } from '../../contexts/accounts';
import { MEAN_MULTISIG, NATIVE_SOL_MINT } from '../../utils/ids';
import { customLogger } from '../..';
import { TreasuryAddFundsModal } from '../../components/TreasuryAddFundsModal';
import { ASSOCIATED_TOKEN_PROGRAM_ID, MintLayout, Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { ACCOUNT_LAYOUT } from '../../utils/layouts';
import { TreasuryCloseModal } from '../../components/TreasuryCloseModal';
import { StreamCloseModal } from '../../components/StreamCloseModal';
import { TreasuryStreamsBreakdown } from '../../models/streams';
import { StreamPauseModal } from '../../components/StreamPauseModal';
import { TreasuryStreamCreateModal } from '../../components/TreasuryStreamCreateModal';
import { StreamResumeModal } from '../../components/StreamResumeModal';
import { TREASURY_TYPE_OPTIONS } from '../../constants/treasury-type-options';
import { TreasuryTopupParams } from '../../models/common-types';
import { TokenInfo } from '@solana/spl-token-registry';
import './style.less';
import { useNavigate } from 'react-router-dom';
import { MultisigAccountInfo, MultisigTransactionInfo, MultisigTransactionStatus, TestMultisigAccounts, TestMultisigTransactions } from '../../models/multisig';
import { MultisigCreateModal } from '../../components/MultisigCreateModal';

// MULTISIG
import { BN, Program, Provider } from "@project-serum/anchor";
import MultisigIdl from "../../models/mean-multisig-idl";
import { MultisigMintTokenModal } from '../../components/MultisigMintTokenModal';
import { MultisigTransferTokensModal } from '../../components/MultisigTransferTokensModal';
import { MultisigUpgradeProgramModal } from '../../components/MultisigUpgradeProgramModal';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;
const treasuryStreamsPerfCounter = new PerformanceCounter();
const treasuryDetailPerfCounter = new PerformanceCounter();
const treasuryListPerfCounter = new PerformanceCounter();

export const MultisigView = () => {
  const navigate = useNavigate();
  const connectionConfig = useConnectionConfig();
  const { publicKey, connected, wallet } = useWallet();
  const {
    // theme,
    tokenList,
    tokenBalance,
    isWhitelisted,
    selectedToken,
    // treasuryOption,
    detailsPanelOpen,
    transactionStatus,
    streamProgramAddress,
    previousWalletConnectState,
    setSelectedToken,
    setEffectiveRate,
    setTreasuryOption,
    setDtailsPanelOpen,
    resetContractValues,
    refreshTokenBalance,
    setForceReloadTokens,
    setTransactionStatus

  } = useContext(AppStateContext);

  const {
    fetchTxInfoStatus,
    lastSentTxSignature,
    lastSentTxOperationType,
    startFetchTxSignatureInfo,
    clearTransactionStatusContext
    
  } = useContext(TransactionStatusContext);

  const { t } = useTranslation('common');
  const { width } = useWindowSize();
  const { account } = useNativeAccount();
  const accounts = useAccountsContext();
  const [isSmallUpScreen, setIsSmallUpScreen] = useState(isDesktop);
  const [treasuryList, setTreasuryList] = useState<TreasuryInfo[]>([]);
  const [selectedTreasury, setSelectedTreasury] = useState<TreasuryInfo | undefined>(undefined);
  const [loadingTreasuries, setLoadingTreasuries] = useState(false);
  const [treasuriesLoaded, setTreasuriesLoaded] = useState(false);
  const [customStreamDocked, setCustomStreamDocked] = useState(false);
  const [loadingTreasuryStreams, setLoadingTreasuryStreams] = useState(false);
  const [treasuryStreams, setTreasuryStreams] = useState<StreamInfo[]>([]);
  const [streamStats, setStreamStats] = useState<TreasuryStreamsBreakdown | undefined>(undefined);
  const [signalRefreshTreasuryStreams, setSignalRefreshTreasuryStreams] = useState(false);
  const [treasuryDetails, setTreasuryDetails] = useState<TreasuryInfo | undefined>(undefined);
  const [highlightedStream, sethHighlightedStream] = useState<StreamInfo | undefined>();
  const [loadingTreasuryDetails, setLoadingTreasuryDetails] = useState(false);
  const [ongoingOperation, setOngoingOperation] = useState<OperationType | undefined>(undefined);
  // const [retryOperationPayload, setRetryOperationPayload] = useState<any>(undefined);

  // Transactions
  const [nativeBalance, setNativeBalance] = useState(0);
  const [userBalances, setUserBalances] = useState<any>();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [transactionFees, setTransactionFees] = useState<TransactionFees>({
    blockchainFee: 0, mspFlatFee: 0, mspPercentFee: 0
  });

  // MULTISIG
  const [multisigAccounts, setMultisigAccounts] = useState<MultisigAccountInfo[]>([]);
  const [multisigPendingTxs, setMultisigPendingTxs] = useState<MultisigTransactionInfo[]>([]);
  const [loadingMultisigAccounts, setLoadingMultisigAccounts] = useState(true);
  const [loadingMultisigAccountDetails, setLoadingMultisigAccountDetails] = useState(false);
  const [loadingMultisigTxs, setLoadingMultisigTxs] = useState(false);
  const [selectedMultisig, setSelectedMultisig] = useState<MultisigAccountInfo | undefined>(undefined);
  const [highlightedMultisigTx, sethHighlightedMultisigTx] = useState<MultisigTransactionInfo | undefined>();
  const [retryOperationPayload, setRetryOperationPayload] = useState<any>(undefined);
  const [isCreateMultisigModalVisible, setIsCreateMultisigModalVisible] = useState(false);
  const [isMintTokenModalVisible, setIsMintTokenModalVisibility] = useState(false);
  const [isTransactionModalVisible, setTransactionModalVisible] = useState(false);

  const connection = useMemo(() => new Connection(connectionConfig.endpoint, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true
  }), [
    connectionConfig.endpoint
  ]);

  const multisigClient = useMemo(() => {

    const opts: ConfirmOptions = {
      preflightCommitment: "recent",
      commitment: "recent",
    };

    const provider = new Provider(connection, wallet as any, opts);
    
    return new Program(
      MultisigIdl,
      MEAN_MULTISIG,
      provider
    );

  }, [
    connection, 
    wallet
  ]);

  // Create and cache Money Streaming Program instance
  const ms = useMemo(() => new MoneyStreaming(
    connectionConfig.endpoint, streamProgramAddress
  ), [
    connectionConfig.endpoint,
    streamProgramAddress
  ]);

  const refreshPage = useCallback(() => {
    window.location.reload();
  },[])

  const resetTransactionStatus = useCallback(() => {

    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });

  }, [
    setTransactionStatus
  ]);

  const refreshMultisigAccountsClick = useCallback(() => {
    // refreshTreasuries(false);
    // setCustomStreamDocked(false);
    return {

    }

  },[]);

  const onAcceptCreateMultisig = (data: any) => {
    consoleOut('multisig:', data, 'blue');
    onExecuteCreateMultisigTx(data);
  };

  const onMultisigCreated = useCallback(() => {

    setIsCreateMultisigModalVisible(false);
    setLoadingMultisigAccounts(true);
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });

  },[
    setTransactionStatus
  ])

  const onTokensMinted = useCallback(() => {

    setIsMintTokenModalVisibility(false);
    setLoadingMultisigAccounts(true);
    setLoadingMultisigTxs(true);
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });

  },[
    setTransactionStatus
  ]);

  const onTxApproved = useCallback(() => {

    setLoadingMultisigAccounts(true);
    setLoadingMultisigTxs(true);
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });

  },[
    setTransactionStatus
  ]);

  const onTxExecuted = useCallback(() => {

    setLoadingMultisigAccounts(true);
    setLoadingMultisigTxs(true);
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });

  },[
    setTransactionStatus
  ]);

  const onExecuteCreateMultisigTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.CreateMultisig);
    setRetryOperationPayload(data);
    setIsBusy(true);

    const createMultisig = async (data: any) => {

      const multisig = new Account();
      // Disc. + threshold + nonce + label.
      const baseSize = 8 + 8 + 1 + 4 + 32;
      // Add enough for 2 more participants, in case the user changes one's mind later.
      const fudge = 64;
      // Can only grow the participant set by 2x the initialized value.
      const ownerSize = data.owners.length * 32 + 8;
      const multisigSize = baseSize + ownerSize + fudge;
      const [, nonce] = await PublicKey.findProgramAddress(
        [multisig.publicKey.toBuffer()],
        multisigClient.programId
      );
      
      const owners = data.owners.map((p: string) => new PublicKey(p));
      const encodedUIntArray = new TextEncoder().encode(data.label);
      const label = Buffer
        .alloc(32)
        .fill(encodedUIntArray, 0, encodedUIntArray.byteLength);

      let tx = multisigClient.transaction.createMultisig(
        owners,
        new BN(data.threshold),
        nonce,
        label,
        {
          accounts: {
            multisig: multisig.publicKey,
            rent: SYSVAR_RENT_PUBKEY,
          },
          signers: [multisig],
          instructions: [
            await multisigClient.account.multisig.createInstruction(
              multisig,
              multisigSize
            ),
          ],
        }
      );

      tx.feePayer = publicKey;
      const { blockhash } = await connection.getRecentBlockhash("recent");
      tx.recentBlockhash = blockhash;
      tx.partialSign(...[multisig]);

      return tx;
    };

    const createTx = async (): Promise<boolean> => {

      if (publicKey && data) {
        consoleOut("Start transaction for create multisig", '', 'blue');
        consoleOut('Wallet address:', publicKey.toBase58());

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        // Create a transaction
        const payload = {
          wallet: publicKey.toBase58(),                               // wallet
          label: data.label,                                          // multisig label
          threshold: data.threshold,
          signers: data.signers
        };
        
        consoleOut('data:', payload);

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: payload
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: ''
        });

        // Abort transaction in not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
        consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');

        if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${
              getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getTokenAmountAndSymbolByTokenAddress(
                transactionFees.blockchainFee + transactionFees.mspFlatFee, 
                NATIVE_SOL_MINT.toBase58()
              )
            })`
          });
          customLogger.logError('Add funds transaction failed', { transcript: transactionLog });
          return false;
        }

        return await createMultisig(data)
          .then(value => {
            consoleOut('createTreasury returned transaction:', value);
            setTransactionStatus({
              lastOperation: TransactionStatus.InitTransactionSuccess,
              currentOperation: TransactionStatus.SignTransaction
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
              result: getTxIxResume(value)
            });
            transaction = value;
            return true;
          })
          .catch(error => {
            console.error('createTreasury error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`
            });
            customLogger.logError('Create Treasury transaction failed', { transcript: transactionLog });
            return false;
          });
          
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Create Treasury transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
        consoleOut('Signing transaction...');
        return await wallet.signTransaction(transaction)
        .then((signed: Transaction) => {
          consoleOut('signTransaction returned a signed transaction:', signed);
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
              result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logWarning('Close stream transaction failed', { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: wallet.publicKey.toBase58()}
          });
          return true;
        })
        .catch(error => {
          console.error(error);
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('Create Treasury transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        console.error('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot sign transaction! Wallet not found!'
        });
        customLogger.logError('Create Treasury transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      if (wallet) {
        return await connection
          .sendEncodedTransaction(encodedTx)
          .then(sig => {
            consoleOut('sendEncodedTransaction returned a signature:', sig);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction
            });
            signature = sig;
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionSuccess),
              result: `signature: ${signature}`
            });
            return true;
          })
          .catch(error => {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
              result: { error, encodedTx }
            });
            customLogger.logError('Create Treasury transaction failed', { transcript: transactionLog });
            return false;
          });
      } else {
        console.error('Cannot send transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot send transaction! Wallet not found!'
        });
        customLogger.logError('Create Treasury transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet) {
      const create = await createTx();
      consoleOut('created:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('signed:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.TreasuryCreate);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            await delay(1000);
            onMultisigCreated();
            setOngoingOperation(undefined);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    clearTransactionStatusContext, 
    connection, 
    multisigClient.account.multisig, 
    multisigClient.programId, 
    multisigClient.transaction, 
    nativeBalance, 
    onMultisigCreated, 
    publicKey, 
    setTransactionStatus, 
    startFetchTxSignatureInfo, 
    transactionCancelled, 
    transactionFees.blockchainFee, 
    transactionFees.mspFlatFee, 
    transactionStatus.currentOperation, 
    wallet
  ]);

  const onCreateMultisigClick = useCallback(() => {
    
    resetTransactionStatus();
    setIsCreateMultisigModalVisible(true);

  },[
    resetTransactionStatus
  ]);

  const onCancelCustomMultisigClick = useCallback(() => {
    
    return {
      
    }

  },[]);

  const onShowOpenMultisigModal = useCallback(() => {
    
    return {
      
    }

  },[]);

  const isCreatingMultisig = useCallback((): boolean => {

    return (
      fetchTxInfoStatus === "fetching" && 
      lastSentTxOperationType === OperationType.TreasuryCreate
    );

  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  // Copy address to clipboard
  const copyMultisigAddress = useCallback((address: any) => {

    if (copyText(address.toString())) {
      notify({
        description: t('notifications.multisigid-copied-message'),
        type: "info"
      });
    } else {
      notify({
        description: t('notifications.multisigid-not-copied-message'),
        type: "error"
      });
    }

  },[t])

  // Transfer token modal
  const [isTransferTokenModalVisible, setIsTransferTokenModalVisibility] = useState(false);
  const showTransferTokenModal = useCallback(() => {
    setIsTransferTokenModalVisibility(true);
    // TODO: Hardcoded fees, we can work on this later
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.000010,
      mspPercentFee: 0
    };
    setTransactionFees(fees);
  }, []);
  const closeTransferTokenModal = useCallback(() => setIsTransferTokenModalVisibility(false), []);
  const onAcceptTransferToken = (params: any) => {
    consoleOut('params', params, 'blue');
    onExecuteTransferTokensTx(params);
  };

  const onExecuteTransferTokensTx = useCallback(async (data: any) => {
  }, []);

  const onTransactionFinished = () => {
    resetTransactionStatus();
    setTransactionModalVisible(false);
    refreshTokenBalance();
    setForceReloadTokens(true);
  };

  const onTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      setTransactionModalVisible(false);
    }
    resetTransactionStatus();
  }

  // Mint token modal
  const showMintTokenModal = useCallback(() => {
    setIsMintTokenModalVisibility(true);
    // TODO: Hardcoded fees, we can work on this later
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.000010,
      mspPercentFee: 0
    };
    setTransactionFees(fees);
  }, []);

  const onExecuteMintTokensTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.MintTokens);
    setRetryOperationPayload(data);
    setIsBusy(true);

    const mintTokens = async (data: any) => {

      if (!selectedMultisig || !publicKey) { return null; }
  
      const [multisigAuthority] = await PublicKey.findProgramAddress(
        [selectedMultisig.id.toBuffer()],
        multisigClient.programId
      );

      const mintInfo = await connection.getAccountInfo(data.tokenAddress);
      if (!mintInfo) { return null; }
      const mint = MintLayout.decode(mintInfo.data);
      const mintToTokenAddress = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        data.tokenAddress,
        data.mintTo,
        true
      );

      let ixs: TransactionInstruction[] = [];
      const mintToTokenInfo = await connection.getAccountInfo(mintToTokenAddress);

      if (!mintToTokenInfo) {
        ixs.push(
          Token.createAssociatedTokenAccountInstruction(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            data.tokenAddress,
            mintToTokenAddress,
            data.mintTo,
            publicKey
          )
        );
      }

      const mintIx = Token.createMintToInstruction(
        TOKEN_PROGRAM_ID,
        data.tokenAddress,
        mintToTokenAddress,
        multisigAuthority,
        [],
        new BN(data.amount * 10 ** mint.decimals).toNumber()
      );

      const transaction = new Account();
      const txSize = 1000; // todo
      ixs.push(
        await multisigClient.account.transaction.createInstruction(
          transaction,
          txSize
        )
      );
  
      let tx = multisigClient.transaction.createTransaction(
        TOKEN_PROGRAM_ID,
        OperationType.MintTokens,
        mintIx.keys,
        Buffer.from(mintIx.data),
        {
          accounts: {
            multisig: selectedMultisig.id,
            transaction: transaction.publicKey,
            proposer: publicKey,
            rent: SYSVAR_RENT_PUBKEY
          },
          signers: [transaction],
          instructions: ixs,
        }
      );
  
      tx.feePayer = publicKey;
      const { blockhash } = await connection.getRecentBlockhash("recent");
      tx.recentBlockhash = blockhash;
      tx.partialSign(...[transaction]);
  
      return tx;
    };

    const createTx = async (): Promise<boolean> => {

      if (publicKey && data) {
        consoleOut("Start transaction for create multisig", '', 'blue');
        consoleOut('Wallet address:', publicKey.toBase58());

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        // Create a transaction
        const payload = {
          tokenAddress: new PublicKey(data.tokenAddress),
          mintTo: new PublicKey(data.mintTo),
          amount: data.amount
        };
        
        consoleOut('DATA:', payload);

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: payload
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: ''
        });

        // Abort transaction in not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
        consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');

        if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${
              getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getTokenAmountAndSymbolByTokenAddress(
                transactionFees.blockchainFee + transactionFees.mspFlatFee, 
                NATIVE_SOL_MINT.toBase58()
              )
            })`
          });
          customLogger.logError('Add funds transaction failed', { transcript: transactionLog });
          return false;
        }

        return await mintTokens(payload)
          .then(value => {
            if (!value) { return false; }
            consoleOut('mint tokens returned transaction:', value);
            setTransactionStatus({
              lastOperation: TransactionStatus.InitTransactionSuccess,
              currentOperation: TransactionStatus.SignTransaction
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
              result: getTxIxResume(value)
            });
            transaction = value;
            return true;
          })
          .catch(error => {
            console.error('mint tokens error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`
            });
            customLogger.logError('Mint tokens transaction failed', { transcript: transactionLog });
            return false;
          });
          
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Mint tokens transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
        consoleOut('Signing transaction...');
        return await wallet.signTransaction(transaction)
        .then((signed: Transaction) => {
          consoleOut('signTransaction returned a signed transaction:', signed);
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
              result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logWarning('Close stream transaction failed', { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: wallet.publicKey.toBase58()}
          });
          return true;
        })
        .catch(error => {
          console.error(error);
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('Create Treasury transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        console.error('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot sign transaction! Wallet not found!'
        });
        customLogger.logError('Create Treasury transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      if (wallet) {
        return await connection
          .sendEncodedTransaction(encodedTx)
          .then(sig => {
            consoleOut('sendEncodedTransaction returned a signature:', sig);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction
            });
            signature = sig;
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionSuccess),
              result: `signature: ${signature}`
            });
            return true;
          })
          .catch(error => {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
              result: { error, encodedTx }
            });
            customLogger.logError('Create Treasury transaction failed', { transcript: transactionLog });
            return false;
          });
      } else {
        console.error('Cannot send transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot send transaction! Wallet not found!'
        });
        customLogger.logError('Create Treasury transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet) {
      const create = await createTx();
      consoleOut('created:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('signed:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.TreasuryCreate);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            await delay(1000);
            onTokensMinted();
            setOngoingOperation(undefined);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    clearTransactionStatusContext, 
    connection, 
    multisigClient.account.transaction, 
    multisigClient.programId, 
    multisigClient.transaction, 
    nativeBalance, 
    onTokensMinted, 
    publicKey, 
    selectedMultisig, 
    setTransactionStatus, 
    startFetchTxSignatureInfo, 
    transactionCancelled, 
    transactionFees.blockchainFee, 
    transactionFees.mspFlatFee, 
    transactionStatus.currentOperation, 
    wallet
  ]);

  const onExecuteApproveTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.CreateMultisig);
    setRetryOperationPayload(data);
    setIsBusy(true);

    const approveTx = async (data: any) => {

      if (!selectedMultisig || !publicKey) { return null; }
  
      let tx = multisigClient.transaction.approve({
          accounts: {
            multisig: selectedMultisig.id,
            transaction: data.transaction.id,
            owner: publicKey,
          }
        }
      );
  
      tx.feePayer = publicKey;
      const { blockhash } = await connection.getRecentBlockhash("recent");
      tx.recentBlockhash = blockhash;
  
      return tx;
    };

    const createTx = async (): Promise<boolean> => {

      if (publicKey && data) {
        consoleOut("Start transaction for create multisig", '', 'blue');
        consoleOut('Wallet address:', publicKey.toBase58());

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        // Create a transaction
        const payload = { transaction: data.transaction };        
        consoleOut('data:', payload);

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: payload
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: ''
        });

        // Abort transaction in not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
        consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');

        if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${
              getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getTokenAmountAndSymbolByTokenAddress(
                transactionFees.blockchainFee + transactionFees.mspFlatFee, 
                NATIVE_SOL_MINT.toBase58()
              )
            })`
          });
          customLogger.logError('Add funds transaction failed', { transcript: transactionLog });
          return false;
        }

        return await approveTx(payload)
          .then(value => {
            if (!value) { return false; }
            consoleOut('mint tokens returned transaction:', value);
            setTransactionStatus({
              lastOperation: TransactionStatus.InitTransactionSuccess,
              currentOperation: TransactionStatus.SignTransaction
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
              result: getTxIxResume(value)
            });
            transaction = value;
            return true;
          })
          .catch(error => {
            console.error('mint tokens error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`
            });
            customLogger.logError('Mint tokens transaction failed', { transcript: transactionLog });
            return false;
          });
          
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Mint tokens transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
        consoleOut('Signing transaction...');
        return await wallet.signTransaction(transaction)
        .then((signed: Transaction) => {
          consoleOut('signTransaction returned a signed transaction:', signed);
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
              result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logWarning('Close stream transaction failed', { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: wallet.publicKey.toBase58()}
          });
          return true;
        })
        .catch(error => {
          console.error(error);
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('Create Treasury transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        console.error('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot sign transaction! Wallet not found!'
        });
        customLogger.logError('Create Treasury transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      if (wallet) {
        return await connection
          .sendEncodedTransaction(encodedTx)
          .then(sig => {
            consoleOut('sendEncodedTransaction returned a signature:', sig);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction
            });
            signature = sig;
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionSuccess),
              result: `signature: ${signature}`
            });
            return true;
          })
          .catch(error => {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
              result: { error, encodedTx }
            });
            customLogger.logError('Create Treasury transaction failed', { transcript: transactionLog });
            return false;
          });
      } else {
        console.error('Cannot send transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot send transaction! Wallet not found!'
        });
        customLogger.logError('Create Treasury transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet) {
      const create = await createTx();
      consoleOut('created:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('signed:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.TreasuryCreate);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            await delay(1000);
            onTxApproved();
            setOngoingOperation(undefined);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    onTxApproved, 
    clearTransactionStatusContext, 
    connection, 
    multisigClient.transaction, 
    nativeBalance, 
    publicKey, 
    selectedMultisig, 
    setTransactionStatus, 
    startFetchTxSignatureInfo, 
    transactionCancelled, 
    transactionFees.blockchainFee, 
    transactionFees.mspFlatFee, 
    transactionStatus.currentOperation, 
    wallet
  ]);

  const onExecuteFinishTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.CreateMultisig);
    setRetryOperationPayload(data);
    setIsBusy(true);

    const finishTx = async (data: any) => {

      if (!selectedMultisig || !publicKey) { return null; }

      const [multisigAuthority] = await PublicKey.findProgramAddress(
        [selectedMultisig.id.toBuffer()],
        multisigClient.programId
      );
  
      let tx = multisigClient.transaction.executeTransaction({
        accounts: {
          multisig: selectedMultisig.id,
          multisigSigner: multisigAuthority,
          transaction: data.transaction.id,
        },
        remainingAccounts: data.transaction.accounts
          .map((t: any) => {
            if (t.pubkey.equals(multisigAuthority)) {
              return { ...t, isSigner: false };
            }
            return t;
          })
          .concat({
            pubkey: data.transaction.programId,
            isWritable: false,
            isSigner: false,
          }),
        }
      );
  
      tx.feePayer = publicKey;
      const { blockhash } = await connection.getRecentBlockhash("recent");
      tx.recentBlockhash = blockhash;
  
      return tx;
    };

    const createTx = async (): Promise<boolean> => {

      if (publicKey && data) {
        consoleOut("Start transaction for create multisig", '', 'blue');
        consoleOut('Wallet address:', publicKey.toBase58());

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        // Create a transaction
        const payload = { transaction: data.transaction };  
        consoleOut('data:', payload);

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: payload
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: ''
        });

        // Abort transaction in not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
        consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');

        if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${
              getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getTokenAmountAndSymbolByTokenAddress(
                transactionFees.blockchainFee + transactionFees.mspFlatFee, 
                NATIVE_SOL_MINT.toBase58()
              )
            })`
          });
          customLogger.logError('Add funds transaction failed', { transcript: transactionLog });
          return false;
        }

        return await finishTx(payload)
          .then(value => {
            if (!value) { return false; }
            consoleOut('mint tokens returned transaction:', value);
            setTransactionStatus({
              lastOperation: TransactionStatus.InitTransactionSuccess,
              currentOperation: TransactionStatus.SignTransaction
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
              result: getTxIxResume(value)
            });
            transaction = value;
            return true;
          })
          .catch(error => {
            console.error('mint tokens error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`
            });
            customLogger.logError('Mint tokens transaction failed', { transcript: transactionLog });
            return false;
          });
          
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Mint tokens transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
        consoleOut('Signing transaction...');
        return await wallet.signTransaction(transaction)
        .then((signed: Transaction) => {
          consoleOut('signTransaction returned a signed transaction:', signed);
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
              result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logWarning('Close stream transaction failed', { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: wallet.publicKey.toBase58()}
          });
          return true;
        })
        .catch(error => {
          console.error(error);
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('Create Treasury transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        console.error('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot sign transaction! Wallet not found!'
        });
        customLogger.logError('Create Treasury transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      if (wallet) {
        return await connection
          .sendEncodedTransaction(encodedTx)
          .then(sig => {
            consoleOut('sendEncodedTransaction returned a signature:', sig);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction
            });
            signature = sig;
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionSuccess),
              result: `signature: ${signature}`
            });
            return true;
          })
          .catch(error => {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
              result: { error, encodedTx }
            });
            customLogger.logError('Create Treasury transaction failed', { transcript: transactionLog });
            return false;
          });
      } else {
        console.error('Cannot send transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot send transaction! Wallet not found!'
        });
        customLogger.logError('Create Treasury transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet) {
      const create = await createTx();
      consoleOut('created:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('signed:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.TreasuryCreate);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            await delay(1000);
            onTxExecuted();
            setOngoingOperation(undefined);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    onTxExecuted,
    clearTransactionStatusContext, 
    connection, 
    multisigClient.programId, 
    multisigClient.transaction, 
    nativeBalance, 
    publicKey, 
    selectedMultisig, 
    setTransactionStatus, 
    startFetchTxSignatureInfo, 
    transactionCancelled, 
    transactionFees.blockchainFee, 
    transactionFees.mspFlatFee, 
    transactionStatus.currentOperation, 
    wallet
  ]);

  const onAcceptMintToken = (params: any) => {
    consoleOut('params', params, 'blue');
    onExecuteMintTokensTx(params);
  };

  const isMintingToken = useCallback((): boolean => {

    return ( 
      fetchTxInfoStatus === "fetching" && 
      lastSentTxOperationType === OperationType.MintTokens
    );

  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  const isSendingTokens = useCallback((): boolean => {

    return ( 
      fetchTxInfoStatus === "fetching" && 
      lastSentTxOperationType === OperationType.TransferTokens
    );

  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  // Upgrade program modal
  const [isUpgradeProgramModalVisible, setIsUpgradeProgramModalVisibility] = useState(false);
  const showUpgradeProgramModal = useCallback(() => {
    setIsUpgradeProgramModalVisibility(true);
    // TODO: Hardcoded fees, we can work on this later
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.000010,
      mspPercentFee: 0
    };
    setTransactionFees(fees);
  }, []);
  const closeUpgradeProgramModal = useCallback(() => setIsUpgradeProgramModalVisibility(false), []);
  const onAcceptUpgradeProgram = (params: any) => {
    consoleOut('params', params, 'blue');
    onExecuteUpgradeProgramsTx(params);
  };

  const onExecuteUpgradeProgramsTx = useCallback(async (data: any) => {
  }, []);

  const isUpgradingProgram = useCallback((): boolean => {

    return ( 
      fetchTxInfoStatus === "fetching" && 
      lastSentTxOperationType === OperationType.UpgradeProgram
    );

  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  // Shows create vault modal
  const onShowCreateVaultModal = useCallback(() => {

    return {

    }

  },[]);

  const isCreatingVault = useCallback((): boolean => {

    return ( 
      fetchTxInfoStatus === "fetching" && 
      lastSentTxOperationType === OperationType.CreateVault
    );

  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  const getOperationName = useCallback((op: OperationType) => {

    if (op === OperationType.MintTokens) {
      return "Mint token";
    } else if (op === OperationType.TransferTokens) {
      return "Transfer tokens";
    } else if (op === OperationType.UpgradeProgram) {
      return "Upgrade program";
    } else {
      return "Create vault";
    }

  },[]);

  const getTransactionStatusAction = useCallback((mtx: MultisigTransactionInfo) => {

    if (mtx.status === MultisigTransactionStatus.Pending) {
      return "Approve";
    } 
    
    if (mtx.status === MultisigTransactionStatus.Approved) {
      return "Execute";
    }

    return "Executed";

  },[]);

  const getTransactionStatusClass = useCallback((mtx: MultisigTransactionInfo) => {

    const approvals = mtx.signers.filter((s: boolean) => s === true).length;

    if (approvals === 0) {
      return "warning";
    } 
    
    if (mtx.status === MultisigTransactionStatus.Pending) {
      return "info";
    } 
    
    if(mtx.status === MultisigTransactionStatus.Approved) {
      return "error";
    }

    return "darken";

  },[]);

  const getOperationProgram = useCallback((op: OperationType) => {

    if (op === OperationType.MintTokens || op === OperationType.TransferTokens) {
      return "SPL Token";
    } else if (op === OperationType.UpgradeProgram) {
      return "BPF Upgradable Loader";
    } else {
      return "Mean Multisig";
    }

  },[]);

  const getTransactionStatus = useCallback((account: any) => {

    if (account.didExecute) {
      return MultisigTransactionStatus.Executed;
    } 

    const approvals = account.signers.filter((s: boolean) => s === true).length;
    
    if (selectedMultisig && selectedMultisig.threshold === approvals) {
      return MultisigTransactionStatus.Approved;
    }

    return MultisigTransactionStatus.Pending;

  },[
    selectedMultisig
  ]);

  // TODO: Remove when releasing to the public
  useEffect(() => {
    if (!isWhitelisted && !isLocal()) {
      navigate('/');
    }
  }, [
    isWhitelisted,
    navigate
  ]);

  // Refresh the multisig accounts list
  useEffect(() => {

    if (!connection || !connected || !publicKey || !multisigClient || !loadingMultisigAccounts) {
      setLoadingMultisigAccounts(false);
      return;
    }

    const timeout = setTimeout(() => {

      multisigClient.account.multisig
        .all()
        .then((accs: any) => {

          let multisigInfoArray: any = [];
          let filteredAccs = accs.filter((a: any) => {
            if (a.account.owners.filter((o: PublicKey) => o.equals(publicKey)).length) { return true; }
            return false;
          });

          for (let info of filteredAccs) {
            
            let address: any;
            let labelBuffer = Buffer
              .alloc(info.account.label.length, info.account.label)
              .filter(function (elem, index) { return elem !== 0; }
            );

            PublicKey
              .findProgramAddress([info.publicKey.toBuffer()], MEAN_MULTISIG)
              .then(k => { 

                address = k[0];

                let multisigInfo = {
                  id: info.publicKey,
                  label: new TextDecoder().decode(labelBuffer),
                  address,
                  nounce: info.account.nounce,
                  ownerSeqNumber: info.account.ownerSetSeqno,
                  threshold: info.account.threshold.toNumber(),
                  pendingTxsAmount: info.account.pendingTxs.toNumber(),
                  createdOnUtc: new Date(info.account.createdOn.toNumber() * 1000),
                  owners: info.account.owners
      
                } as MultisigAccountInfo;

                multisigInfoArray.push(multisigInfo);

              });
          }

          setTimeout(() => {
            setMultisigAccounts(multisigInfoArray.sort((a: any, b: any) => b.createdOnUtc.getTime() - a.createdOnUtc.getTime()));
            setSelectedMultisig(multisigInfoArray[0]);
            setLoadingMultisigAccounts(false);
          });
        }
      )
      .catch(err => {
        console.error(err);
        setLoadingMultisigAccounts(false);
      });

    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connected, 
    connection, 
    multisigClient, 
    publicKey,
    loadingMultisigAccounts,
    selectedMultisig
  ]);

  // Subscribe to multisig account changes
  useEffect(() => {

    if (!connection || !connected || !selectedMultisig || !selectedMultisig.id) {
      return;
    }

    const timeout = setTimeout(() => {
      multisigClient.account.multisig
        .subscribe(selectedMultisig.id)
        .on("change", (account) => {
          let address: any;
          let labelBuffer = Buffer
            .alloc(account.label.length, account.label)
            .filter(function (elem, index) { return elem !== 0; }
          );

          PublicKey
            .findProgramAddress([selectedMultisig.id.toBuffer()], MEAN_MULTISIG)
            .then(k => {
              address = k[0];
              let multisigInfo = {
                id: account.publicKey,
                label: new TextDecoder().decode(labelBuffer),
                address,
                nounce: account.nounce,
                ownerSeqNumber: account.ownerSetSeqno,
                threshold: account.threshold.toNumber(),
                pendingTxsAmount: new BN(account.pendingTxs).toNumber(),
                createdOnUtc: new Date(account.createdOn.toNumber() * 1000),
                owners: account.owners  
              } as MultisigAccountInfo;
              setSelectedMultisig(multisigInfo);
            });
          }
        );
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connected, 
    connection, 
    multisigClient, 
    selectedMultisig
  ]);

  // Update selected multisig txs
  useEffect(() => {

    if (!connection || !connected || !selectedMultisig || !selectedMultisig.id || !loadingMultisigTxs) { 
      return;
    }

    const timeout = setTimeout(() => {

      let transactions: MultisigTransactionInfo[] = [];
      multisigClient.account.transaction
        .all(selectedMultisig.id.toBuffer())
        .then((txs) => {
          
          for (let tx of txs) {

            let txInfo = Object.assign({}, {
              id: tx.publicKey,
              multisig: tx.account.multisig,
              programId: tx.account.programId,
              signers: tx.account.signers,
              createdOn: new Date(tx.account.createdOn.toNumber() * 1000),
              executedOn: tx.account.executedOn 
                ? new Date(tx.account.executedOn.toNumber() * 1000) 
                : undefined,

              status: getTransactionStatus(tx.account),
              action: Object.values(OperationType).filter(o => o === tx.account.action)[0] || 31,
              accounts: tx.account.accounts

            } as MultisigTransactionInfo);

            transactions.push(txInfo);
          }
          
          setMultisigPendingTxs(transactions.sort((a, b) => b.createdOn.getTime() - a.createdOn.getTime()));
          setLoadingMultisigTxs(false);
        })
        .catch(err => {
          console.error(err);
          setLoadingMultisigTxs(false);
        });   
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connection, 
    connected, 
    selectedMultisig, 
    multisigClient.account.transaction, 
    loadingMultisigTxs,
    getTransactionStatus
  ]);

  // Load/Unload multisig on wallet connect/disconnect
  useEffect(() => {
    if (previousWalletConnectState !== connected) {
      if (!previousWalletConnectState && connected && publicKey) {
        consoleOut('User is connecting...', publicKey.toBase58(), 'green');
        setLoadingMultisigAccounts(true);
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'green');
        setMultisigAccounts([]);
        setSelectedMultisig(undefined);
        setLoadingMultisigAccounts(false);
      }
    }
  }, [
    connected,
    previousWalletConnectState,
    publicKey
  ]);
  
  // Detect when entering small screen mode
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

  // Handle what to do when pending Tx confirmation reaches finality or on error
  useEffect(() => {
    if (!publicKey) { return; }

    if (lastSentTxSignature && (fetchTxInfoStatus === "fetched" || fetchTxInfoStatus === "error")) {
      switch (lastSentTxOperationType) {
        case OperationType.TreasuryCreate:
        case OperationType.TreasuryClose:
          setLoadingMultisigAccounts(false);
          break;
        default:
          // setLoadingMultisigAccounts(false);
          break;
      }
    }
  }, [
    publicKey,
    fetchTxInfoStatus,
    lastSentTxSignature,
    lastSentTxOperationType
  ]);

  // END MULTISIG


  // Keep account balance updated
  useEffect(() => {

    const getAccountBalance = (): number => {
      return (account?.lamports || 0) / LAMPORTS_PER_SOL;
    }

    if (account?.lamports !== previousBalance || !nativeBalance) {
      // Refresh token balance
      refreshTokenBalance();
      setNativeBalance(getAccountBalance());
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [
    account,
    nativeBalance,
    previousBalance,
    refreshTokenBalance
  ]);

  // Automatically update all token balances (in token list)
  useEffect(() => {

    if (!connection) {
      console.error('No connection');
      return;
    }

    if (!publicKey || !tokenList || !accounts || !accounts.tokenAccounts) {
      return;
    }

    const timeout = setTimeout(() => {

      const balancesMap: any = {};
      connection.getTokenAccountsByOwner(
        publicKey, 
        { programId: TOKEN_PROGRAM_ID }, 
        connection.commitment
      )
      .then(response => {
        for (let acc of response.value) {
          const decoded = ACCOUNT_LAYOUT.decode(acc.account.data);
          const address = decoded.mint.toBase58();
          const itemIndex = tokenList.findIndex(t => t.address === address);
          if (itemIndex !== -1) {
            balancesMap[address] = decoded.amount.toNumber() / (10 ** tokenList[itemIndex].decimals);
          } else {
            balancesMap[address] = 0;
          }
        }
      })
      .catch(error => {
        console.error(error);
        for (let t of tokenList) {
          balancesMap[t.address] = 0;
        }
      })
      .finally(() => setUserBalances(balancesMap));
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connection,
    tokenList,
    accounts,
    publicKey
  ]);

  const getTransactionFees = useCallback(async (action: MSP_ACTIONS): Promise<TransactionFees> => {
    return await calculateActionFees(connection, action);
  }, [connection]);

  const setCustomToken = useCallback((address: string) => {

    if (address && isValidAddress(address)) {
      const unkToken: TokenInfo = {
        address: address,
        name: 'Unknown',
        chainId: 101,
        decimals: 6,
        symbol: shortenAddress(address),
      };
      setSelectedToken(unkToken);
      consoleOut("token selected:", unkToken, 'blue');
      setEffectiveRate(0);
    }
  }, [
    setEffectiveRate,
    setSelectedToken,
  ]);

  const openTreasuryById = useCallback((treasuryId: string, dock = false) => {
    if (!connection || !publicKey || !ms || loadingTreasuryDetails) { return; }

    setTimeout(() => {
      setLoadingTreasuryDetails(true);
    });

    treasuryDetailPerfCounter.start();
    const treasueyPk = new PublicKey(treasuryId);
    ms.getTreasury(treasueyPk)
      .then(details => {
        if (details) {
          consoleOut('treasuryDetails:', details, 'blue');
          setSelectedTreasury(details);
          setTreasuryDetails(details);
          setSignalRefreshTreasuryStreams(true);

          // Preset active token to the treasury associated token
          const token = getTokenByMintAddress(details.associatedTokenAddress as string);
          consoleOut("treasury token:", token ? token.symbol : 'Custom', 'blue');
          if (token) {
            if (!selectedToken || selectedToken.address !== token.address) {
              setSelectedToken(token);
            }
          } else if (!token && (!selectedToken || selectedToken.address !== details.associatedTokenAddress)) {
            setCustomToken(details.associatedTokenAddress as string);
          }

          const tOption = TREASURY_TYPE_OPTIONS.find(t => t.type === details.type);
          if (tOption) {
            setTreasuryOption(tOption);
          }
          if (dock) {
            setTreasuryList([details]);
            setCustomStreamDocked(true);
            notify({
              description: t('notifications.success-loading-treasury-message', {treasuryId: shortenAddress(treasuryId, 10)}),
              type: "success"
            });
          }
        } else {
          setTreasuryDetails(undefined);
          setSelectedTreasury(undefined);
          if (dock) {
            notify({
              message: t('notifications.error-title'),
              description: t('notifications.error-loading-treasuryid-message', {treasuryId: shortenAddress(treasuryId as string, 10)}),
              type: "error"
            });
          }
        }
        setLoadingTreasuryDetails(false);
      })
      .catch(error => {
        console.error(error);
        setTreasuryDetails(undefined);
        setLoadingTreasuryDetails(false);
        notify({
          message: t('notifications.error-title'),
          description: t('notifications.error-loading-treasuryid-message', {treasuryId: shortenAddress(treasuryId as string, 10)}),
          type: "error"
        });
      })
      .finally(() => {
        treasuryDetailPerfCounter.stop();
        consoleOut(`getTreasury took ${(treasuryDetailPerfCounter.elapsedTime).toLocaleString()}ms`, '', 'crimson');
      });

  }, [
    ms,
    publicKey,
    connection,
    selectedToken,
    loadingTreasuryDetails,
    setTreasuryOption,
    setSelectedToken,
    setCustomToken,
    t,
  ]);

  /////////////////
  //   Getters   //
  /////////////////

  const getShortDate = (date: string, includeTime = false): string => {
    if (!date) { return ''; }
    const localDate = new Date(date);
    return dateFormat(
      localDate,
      includeTime ? SIMPLE_DATE_TIME_FORMAT : SIMPLE_DATE_FORMAT
    );
  }

  const isTxInProgress = useCallback((): boolean => {
    return isBusy || fetchTxInfoStatus === "fetching" ? true : false;
  }, [
    isBusy,
    fetchTxInfoStatus,
  ]);

  const isSuccess = (): boolean => {
    return transactionStatus.currentOperation === TransactionStatus.TransactionFinished;
  }

  const isError = (): boolean => {
    return  transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ||
            transactionStatus.currentOperation === TransactionStatus.InitTransactionFailure ||
            transactionStatus.currentOperation === TransactionStatus.SignTransactionFailure ||
            transactionStatus.currentOperation === TransactionStatus.SendTransactionFailure ||
            transactionStatus.currentOperation === TransactionStatus.ConfirmTransactionFailure
            ? true
            : false;
  }

  ////////////////
  //   Events   //
  ////////////////

  // Open treasury modal
  const [isOpenTreasuryModalVisible, setIsOpenTreasuryModalVisibility] = useState(false);
  const showOpenTreasuryModal = useCallback(() => setIsOpenTreasuryModalVisibility(true), []);
  const closeOpenTreasuryModal = useCallback(() => setIsOpenTreasuryModalVisibility(false), []);

  const onAcceptOpenTreasury = (e: any) => {
    closeOpenTreasuryModal();
    consoleOut('treasury id:', e, 'blue');
    openTreasuryById(e, true);
  };

  ///////////////
  // Rendering //
  ///////////////

  const renderMultisigPendingTxs = () => {

    if (!selectedMultisig) {
      return null;
    } else if (selectedMultisig && loadingMultisigTxs) {
      return (
        <div className="mb-2">{t('multisig.multisig-transactions.loading-transactions')}</div>
      );
    } else if (selectedMultisig && !loadingMultisigTxs && multisigPendingTxs.length === 0) {
      return (
        <div className="mb-2">{t('multisig.multisig-transactions.no-transactions')}</div>
      );
    }

    return (
      <>
        <div className="item-list-header compact">
          <div className="header-row" style={{ paddingBottom: 5 }}>
            <div className="std-table-cell responsive-cell">{t('multisig.multisig-transactions.column-operation')}</div>
            <div className="std-table-cell responsive-cell">{t('multisig.multisig-transactions.column-program-id')}</div>
            <div className="std-table-cell responsive-cell">{t('multisig.multisig-transactions.column-created-on')}</div>
            <div className="std-table-cell text-center fixed-width-120">
              {
                t('multisig.multisig-transactions.column-pending-signatures')
              }
            </div>
          </div>
        </div>
        {multisigPendingTxs && multisigPendingTxs.length && (
          <div className="item-list-body compact">
            {multisigPendingTxs.map(item => {
              return (
                <div 
                  style={{padding: '3px 0px'}} 
                  className={`item-list-row ${highlightedMultisigTx && highlightedMultisigTx.id === item.id ? 'selected' : ''}`} key={item.id.toBase58()}>
                  
                  <div className="std-table-cell responsive-cell">
                    <span className="align-middle">{getOperationName(item.action)}</span>
                  </div>
                  <div className="std-table-cell responsive-cell">
                    <span className="align-middle">{getOperationProgram(item.action)}</span>
                  </div>
                  <div className="std-table-cell responsive-cell">
                    <span className="align-middle">{getShortDate(item.createdOn.toString(), true)}</span>
                  </div>
                  <div className="std-table-cell text-center fixed-width-120">
                    <span className="align-middle" style={{
                      marginRight:5
                    }} >
                      {
                        `${item.signers.filter(s => s === true).length}/${selectedMultisig.threshold}`
                      }
                    </span>
                    <span 
                      onClick={() => {
                        if (item.status === MultisigTransactionStatus.Pending) {
                          onExecuteApproveTx({ transaction: item });
                        } if (item.status === MultisigTransactionStatus.Approved) {
                          onExecuteFinishTx({ transaction: item })
                        }                      
                      }}
                      aria-disabled={item.status === MultisigTransactionStatus.Executed} 
                      className={`badge small ${getTransactionStatusClass(item)}`} 
                      style={{
                        padding: '3px 5px',
                        cursor: 
                          item.status === MultisigTransactionStatus.Executed 
                            ? 'not-allowed' 
                            : 'pointer'
                      }}>
                      {
                        ` ${getTransactionStatusAction(item)} `
                      }
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  }

  const renderMultisigMeta = () => {
    return (
      <>
      {selectedMultisig && (
        <div className="stream-fields-container">

          {/* Multisig owners and creation date */}

          <div className="mb-3">
            <Row>
              <Col span={12}>
                <div className="transaction-detail-row">
                  <span className="info-label">
                    {t('multisig.multisig-account-detail.multisig-owners')}
                  </span>
                </div>
                <div className="transaction-detail-row">
                  <span className="info-icon">
                    <IconWallet className="mean-svg-icons" />
                  </span>
                  <div className="info-data flex-row wrap align-items-center">
                    {selectedMultisig.owners.length}
                  </div>
                </div>
              </Col>
              <Col span={12}>
                <div className="transaction-detail-row">
                  <span className="info-label">
                    {t('multisig.multisig-account-detail.created-on')}
                  </span>
                </div>
                <div className="transaction-detail-row">
                  <span className="info-icon">
                    <IconClock className="mean-svg-icons" />
                  </span>
                  <div className="info-data flex-row wrap align-items-center">
                    {dateFormat(selectedMultisig.createdOnUtc, VERBOSE_DATE_TIME_FORMAT)}
                  </div>
                </div>
              </Col>
            </Row>
            <Row>
              <Col span={12}>
                <div className="transaction-detail-row">
                  <span className="info-label">
                    {t('multisig.multisig-account-detail.required-signatures')}
                  </span>
                </div>
                <div className="transaction-detail-row">
                  <span className="info-icon">
                    <IconDocument className="mean-svg-icons" />
                  </span>
                  <div className="info-data flex-row wrap align-items-center">
                    {selectedMultisig.threshold}
                  </div>
                </div>
              </Col>
              <Col span={12}>
                <div className="transaction-detail-row">
                  <span className="info-label">
                    {t('multisig.multisig-account-detail.authority')}
                  </span>
                </div>
                <div className="transaction-detail-row stream-share-ctas">
                  <div onClick={() => copyMultisigAddress(selectedMultisig.address)} 
                       className="copy-cta info-data flex-row wrap align-items-center"
                       style={{cursor: 'pointer', fontSize: '1.1rem'}}>
                    {shortenAddress(selectedMultisig.address.toBase58(), 8)}
                  </div>
                </div>
              </Col>
            </Row>
          </div>      
        </div>
      )}
      </>
    );
  };

  const renderCtaRow = () => {
    return (
      <>
        <Space size="middle">
          {/* Mint token */}
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            disabled={isTxInProgress() || loadingMultisigAccounts}
            onClick={showMintTokenModal}>
            {isMintingToken() && (<LoadingOutlined />)}
            {isMintingToken()
              ? t('multisig.multisig-account-detail.cta-mint-busy')
              : t('multisig.multisig-account-detail.cta-mint')}
          </Button>
          {/* Transfer tokens */}
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            // disabled={isTxInProgress() || loadingMultisigAccounts}
            disabled={true}
            onClick={showTransferTokenModal}>
            {isSendingTokens() && (<LoadingOutlined />)}
            {isSendingTokens()
              ? t('multisig.multisig-account-detail.cta-transfer-busy')
              : t('multisig.multisig-account-detail.cta-transfer')}
          </Button>
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            // disabled={isTxInProgress() || loadingMultisigAccounts}
            disabled={true}
            onClick={showUpgradeProgramModal}>
            {isUpgradingProgram() && (<LoadingOutlined />)}
            {isUpgradingProgram()
              ? t('multisig.multisig-account-detail.cta-upgrade-program-busy')
              : t('multisig.multisig-account-detail.cta-upgrade-program')}
          </Button>
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            // disabled={isTxInProgress() || loadingMultisigAccounts}
            disabled={true}
            onClick={onShowCreateVaultModal}>
            {isCreatingVault() && (<LoadingOutlined />)}
            {isCreatingVault()
              ? t('multisig.multisig-account-detail.cta-create-vault-busy')
              : t('multisig.multisig-account-detail.cta-create-vault')}
          </Button>
        </Space>
      </>
    );
  }

  const renderMultisigList = (
    <>
    {multisigAccounts && multisigAccounts.length ? (
      multisigAccounts.map((item, index) => {
        const onMultisigClick = (ev: any) => {
          consoleOut('selected multisig:', item, 'blue');
          setSelectedMultisig(item);
          setLoadingMultisigTxs(true);
        };
        return (
          <div 
            key={`${index + 50}`} 
            onClick={onMultisigClick}
            className={
              `transaction-list-row ${
                selectedMultisig && selectedMultisig.id && selectedMultisig.id.equals(item.id) 
                  ? 'selected' 
                  : ''
                }`
              }>

            <div className="icon-cell">
              <Identicon address={item.id} style={{ width: "30", display: "inline-flex" }} />
            </div>
            <div className="description-cell">
              {item.label ? (
                <div className="title text-truncate">
                  {item.label}
                </div>
              ) : (
                <div className="title text-truncate">{shortenAddress(item.id.toBase58(), 8)}</div>
              )}
              {
                <div className="subtitle text-truncate">{shortenAddress(item.address.toBase58(), 8)}</div>
              }
            </div>
            <div className="description-cell text-right">
              <div className="subtitle">
              {
                t("multisig.multisig-accounts.pending-transactions", {
                  txs: item.pendingTxsAmount
                })
              }
              </div>
            </div>
          </div>
        );
      })
    ) : (
      <>
      {isCreatingMultisig() ? (
        <div className="h-100 flex-center">
          <Spin indicator={bigLoadingIcon} />
        </div>
      ) : (
        <div className="h-100 flex-center">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{connected
          ? t('multisig.multisig-accounts.no-accounts')
          : t('multisig.multisig-accounts.not-connected')}</p>} />
        </div>
      )}
      </>
    )}

    </>
  );

  return (
    <>
      <div className="container main-container">

        <div className="interaction-area">

          <div className={`meanfi-two-panel-layout ${detailsPanelOpen ? 'details-open' : ''}`}>

            <div className="meanfi-two-panel-left">

              <div className="meanfi-panel-heading">
                <span className="title">{t('multisig.screen-title')}</span>
                <Tooltip placement="bottom" title={t('multisig.refresh-tooltip')}>
                  <div 
                    className={
                      `transaction-stats user-address ${loadingMultisigAccounts 
                        ? 'click-disabled' 
                        : 'simplelink'}`
                    } 
                    onClick={refreshMultisigAccountsClick}
                  >
                    <Spin size="small" />
                    {!loadingMultisigAccounts && (
                      <span className="incoming-transactions-amout">{formatThousands(multisigAccounts.length)}</span>
                    )}
                    <span className="transaction-legend">
                      <span className="icon-button-container">
                        <Button
                          type="default"
                          shape="circle"
                          size="small"
                          icon={<ReloadOutlined />}
                          onClick={() => {
                            setLoadingMultisigAccounts(true);
                          }}
                        />
                      </span>
                    </span>
                  </div>
                </Tooltip>
              </div>

              <div className="inner-container">
                <div className="item-block vertical-scroll">
                  <Spin spinning={loadingMultisigAccounts}>
                    {renderMultisigList}
                  </Spin>
                </div>
                <div className="bottom-ctas">
                  {customStreamDocked ? (
                    <div className="create-stream">
                      <Button
                        block
                        type="primary"
                        shape="round"
                        disabled={!connected}
                        onClick={onCancelCustomMultisigClick}>
                        {t('multisig.back-to-multisig-accounts-cta')}
                      </Button>
                    </div>
                  ) : (
                    <div className="create-stream">
                      <Button
                        block
                        type="primary"
                        shape="round"
                        disabled={!connected}
                        onClick={onCreateMultisigClick}>
                        {connected
                          ? t('multisig.create-new-multisig-account-cta')
                          : t('transactions.validation.not-connected')
                        }
                      </Button>
                    </div>
                  )}
                  {(!customStreamDocked && connected) && (
                    <div className="open-stream">
                      <Tooltip title={t('multisig.lookup-multisig-account-cta-tooltip')}>
                        <Button
                          shape="round"
                          type="text"
                          size="small"
                          className="ant-btn-shaded"
                          onClick={onShowOpenMultisigModal}
                          icon={<SearchOutlined />}>
                        </Button>
                      </Tooltip>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="meanfi-two-panel-right">
              <div className="meanfi-panel-heading">
                <span className="title">
                  {t('multisig.multisig-detail-heading')}
                </span>
              </div>

              <div className="inner-container">
                {connected ? (
                  <>
                    <div className={
                      `stream-details-data-wrapper vertical-scroll ${
                        (loadingMultisigAccounts || !selectedMultisig) 
                          ? 'h-100 flex-center' 
                          : ''
                        }`
                      }>
                      <Spin spinning={loadingMultisigAccounts || loadingMultisigTxs}>
                        {selectedMultisig && (
                          <>
                            {renderMultisigMeta()}
                            <Divider className="activity-divider" plain></Divider>
                            {renderCtaRow()}
                            <Divider className="activity-divider" plain></Divider>
                            {renderMultisigPendingTxs()}
                          </>
                        )}
                      </Spin>
                      {(!loadingMultisigAccounts && !loadingMultisigTxs) && (
                        <>
                        {(!multisigAccounts || multisigAccounts.length === 0) && !selectedMultisig && (
                          <div className="h-100 flex-center">
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{t('multisig.multisig-account-detail.no-multisig-loaded')}</p>} />
                          </div>
                        )}
                        </>
                      )}
                    </div>
                    {selectedMultisig && (
                      <div className="stream-share-ctas">
                        <span 
                          className="copy-cta" 
                          onClick={() => copyMultisigAddress(selectedMultisig.id)}>
                            {`${t("multisig.multisig-account-detail.copy-id-title")}: ${selectedMultisig.id}`}
                        </span>
                        
                        <a 
                          className="explorer-cta" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${selectedMultisig.id}${getSolanaExplorerClusterParam()}`}>
                          <IconExternalLink className="mean-svg-icons" />
                        </a>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="h-100 flex-center">
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{t('multisig.multisig-accounts.not-connected')}</p>} />
                  </div>
                )}
              </div>

            </div>

          </div>

        </div>

      </div>

      <TreasuryOpenModal
        isVisible={isOpenTreasuryModalVisible}
        handleOk={onAcceptOpenTreasury}
        handleClose={closeOpenTreasuryModal}
      />

      <MultisigCreateModal
        isVisible={isCreateMultisigModalVisible}
        nativeBalance={nativeBalance}
        transactionFees={transactionFees}
        handleOk={onAcceptCreateMultisig}
        handleClose={() => setIsCreateMultisigModalVisible(false)}
        isBusy={isBusy}
      />

      <MultisigMintTokenModal
        isVisible={isMintTokenModalVisible}
        nativeBalance={nativeBalance}
        transactionFees={transactionFees}
        handleOk={onAcceptMintToken}
        handleClose={() => setIsMintTokenModalVisibility(false)}
        isBusy={isBusy}
      />

      <MultisigTransferTokensModal
        isVisible={isTransferTokenModalVisible}
        nativeBalance={nativeBalance}
        transactionFees={transactionFees}
        handleOk={onAcceptTransferToken}
        handleClose={closeTransferTokenModal}
        isBusy={isBusy}
      />

      <MultisigUpgradeProgramModal
        isVisible={isUpgradeProgramModalVisible}
        nativeBalance={nativeBalance}
        transactionFees={transactionFees}
        handleOk={onAcceptUpgradeProgram}
        handleClose={closeUpgradeProgramModal}
        isBusy={isBusy}
      />

      {/* Transaction execution modal */}
      <Modal
        className="mean-modal no-full-screen"
        maskClosable={false}
        visible={isTransactionModalVisible}
        afterClose={onTransactionModalClosed}
        title={getTransactionModalTitle(transactionStatus, isBusy, t)}
        onCancel={() => { setTransactionModalVisible(false); }}
        width={360}
        footer={null}>
        <div className="transaction-progress">
          {isBusy ? (
            <>
              <Spin indicator={bigLoadingIcon} className="icon" />
              <h4 className="font-bold mb-1">
                {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
              </h4>
              {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
                <div className="indication">{t('transactions.status.instructions')}</div>
              )}
            </>
          ) : isSuccess() ? (
            <>
              <CheckOutlined style={{ fontSize: 48 }} className="icon" />
              <h4 className="font-bold mb-1 text-uppercase">
                {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
              </h4>
              <p className="operation">{t('transactions.status.tx-generic-operation-success')}</p>
              <Button
                block
                type="primary"
                shape="round"
                size="middle"
                onClick={() => {}}>
                {t('general.cta-finish')}
              </Button>
            </>
          ) : isError() ? (
            <>
              <InfoCircleOutlined style={{ fontSize: 48 }} className="icon" />
              {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                <h4 className="mb-4">
                  {t('transactions.status.tx-start-failure', {
                    accountBalance: getTokenAmountAndSymbolByTokenAddress(
                      nativeBalance,
                      NATIVE_SOL_MINT.toBase58()
                    ),
                    feeAmount: getTokenAmountAndSymbolByTokenAddress(
                      transactionFees.blockchainFee + transactionFees.mspFlatFee,
                      NATIVE_SOL_MINT.toBase58()
                    )})
                  }
                </h4>
              ) : (
                <h4 className="font-bold mb-3">
                  {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
                </h4>
              )}
              {transactionStatus.currentOperation === TransactionStatus.SendTransactionFailure ? (
                <div className="row two-col-ctas mt-3">
                  <div className="col-6">
                    <Button
                      block
                      type="text"
                      shape="round"
                      size="middle"
                      onClick={() => { }}>
                      {t('general.retry')}
                    </Button>
                  </div>
                  <div className="col-6">
                    <Button
                      block
                      type="primary"
                      shape="round"
                      size="middle"
                      onClick={() => refreshPage()}>
                      {t('general.refresh')}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  block
                  type="primary"
                  shape="round"
                  size="middle"
                  onClick={() => { setTransactionModalVisible(false); }}>
                  {t('general.cta-close')}
                </Button>
              )}
            </>
          ) : (
            <>
              <Spin indicator={bigLoadingIcon} className="icon" />
              <h4 className="font-bold mb-4 text-uppercase">{t('transactions.status.tx-wait')}...</h4>
            </>
          )}
        </div>
      </Modal>

      <PreFooter />
    </>
  );

};
