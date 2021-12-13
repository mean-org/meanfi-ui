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

import { Account, ConfirmOptions, Connection, Enum, LAMPORTS_PER_SOL, PublicKey, PublicKeyInitData, SYSVAR_RENT_PUBKEY, Transaction } from '@solana/web3.js';
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
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
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
  const [loadingMultisigAccounts, setLoadingMultisigAccounts] = useState(false);
  const [loadingMultisigAccountDetails, setLoadingMultisigAccountDetails] = useState(false);
  const [loadingMultisigTxs, setLoadingMultisigTxs] = useState(false);
  const [selectedMultisig, setSelectedMultisig] = useState<MultisigAccountInfo | undefined>(undefined);
  const [highlightedMultisigTx, sethHighlightedMultisigTx] = useState<MultisigTransactionInfo | undefined>();
  const [retryOperationPayload, setRetryOperationPayload] = useState<any>(undefined);
  const [isCreateMultisigModalVisible, setIsCreateMultisigModalVisible] = useState(false);

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
      const ownerSize = data.threshold * 32 + 8;
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

  // Mint token modal
  const [isMintTokenModalVisible, setIsMintTokenModalVisibility] = useState(false);
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
  const closeMintTokenModal = useCallback(() => setIsMintTokenModalVisibility(false), []);

  const onAcceptMintToken = (params: any) => {
    // TODO: Execute Tx
    consoleOut('params', params, 'blue');
  };

  const isMintingToken = useCallback((): boolean => {

    return ( 
      fetchTxInfoStatus === "fetching" && 
      lastSentTxOperationType === OperationType.MintToken
    );

  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  // Shows transfer tokens modal
  const onShowTransferTokensModal = useCallback(() => {

    return {

    }

  },[]);

  const isSendingTokens = useCallback((): boolean => {

    return ( 
      fetchTxInfoStatus === "fetching" && 
      lastSentTxOperationType === OperationType.TransferTokens
    );

  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  // Shows upgrade program modal
  const onShowUpgradeProgramModal = useCallback(() => {

    return {

    }

  },[]);

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

    if (op === OperationType.MintToken) {
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
    } else if (mtx.status === MultisigTransactionStatus.Approved) {
      return "Execute";
    } else if(mtx.signers.filter((s: boolean) => s === true).length === 0) {
      return "Approve";
    } else {
      return "Executed"
    }

  },[]);

  const getTransactionStatusClass = useCallback((mtx: MultisigTransactionInfo) => {

    if (mtx.status === MultisigTransactionStatus.Pending) {
      return "info";
    } else if (mtx.status === MultisigTransactionStatus.Approved) {
      return "error";
    } else if(mtx.signers.filter((s: boolean) => s === true).length === 0) {
      return "warning"
    } else {
      return "darken"
    }

  },[]);

  const getOperationProgram = useCallback((op: OperationType) => {

    if (op === OperationType.MintToken || op === OperationType.TransferTokens) {
      return "SPL Token";
    } else if (op === OperationType.UpgradeProgram) {
      return "BPF Upgradable Loader";
    } else {
      return "Mean Multisig";
    }

  },[]);

  const mintTokens = async (data: any) => {

    if (!selectedMultisig || !publicKey) { return null; }

    const [multisigAuthority] = await PublicKey.findProgramAddress(
      [selectedMultisig.id.toBuffer()],
      multisigClient.programId
    );

    const accounts = [
      {
        pubkey: TOKEN_PROGRAM_ID,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: new PublicKey(data.tokenAddress),
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: new PublicKey(data.mintTo),
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: multisigAuthority,
        isWritable: true,
        isSigner: false,
      }
    ];

    const mintData = multisigClient.coder.instruction.encode("create_transaction", {
      amount: new BN(data.amount),
    })

    const transaction = new Account();
    const txSize = 1000; // todo

    let tx = multisigClient.transaction.createTransaction(
      TOKEN_PROGRAM_ID,
      accounts,
      mintData,
      {
        accounts: {
          multisig: selectedMultisig.id,
          transaction: transaction.publicKey,
          proposer: publicKey,
          rent: SYSVAR_RENT_PUBKEY
        },
        signers: [transaction],
        instructions: [
          await multisigClient.account.transaction.createInstruction(
            transaction,
            txSize
          ),
        ],
      }
    );

    tx.feePayer = publicKey;
    const { blockhash } = await connection.getRecentBlockhash("recent");
    tx.recentBlockhash = blockhash;
    tx.partialSign(...[transaction]);

    return tx;
  };



  // Refresh the multisig accounts list
  useEffect(() => {

    if (!connection || !connected || !publicKey || !multisigClient || !loadingMultisigAccounts) {
      return;
    }

    const timeout = setTimeout(() => {

      multisigClient.account.multisig
        .all()
        .then((accs: any) => {

          setLoadingMultisigAccounts(true);
          let multisigInfoArray: any = [];
          let filteredAccs = accs.filter((a: any) => {
            console.log('owners', a.account.owners);
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
                  pendingTxsAmount: new BN(info.account.pendingTxs).toNumber(),
                  createdOnUtc: new Date(new BN(info.account.createdOn).toNumber() * 1000),
                  owners: info.account.owners
      
                } as MultisigAccountInfo;

                multisigInfoArray.push(multisigInfo);

              });
          }

          setMultisigAccounts(multisigInfoArray);
          setSelectedMultisig(multisigInfoArray[0]);
          setLoadingMultisigAccounts(false);
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

    if (!connection || !connected || !selectedMultisig) {
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
                createdOnUtc: new Date(new BN(account.createdOn).toNumber() * 1000),
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

    if (!connection || !connected || !selectedMultisig || !loadingMultisigTxs) { 
      return;
    }

    const timeout = setTimeout(() => {
      setLoadingMultisigTxs(true);
      let transactions: MultisigTransactionInfo[] = [];
      multisigClient.account.transaction
        .all(selectedMultisig.id.toBuffer())
        .then((txs) => {
          console.log('txs', txs);
          for (let tx of txs) {
            let txInfo = {
              id: tx.publicKey,
              multisig: tx.account.multisig,
              programId: tx.account.programId,
              signers: tx.account.signers,
              createdOn: new Date(new BN(tx.account.createdOn).toNumber()),
              executedOn: tx.account.executedOn 
                ? new Date(new BN(tx.account.executedOn).toNumber()) 
                : undefined,

              status: tx.account.signers.filter((s: boolean) => s === true).length === selectedMultisig.threshold 
                ? MultisigTransactionStatus.Approved
                : MultisigTransactionStatus.Pending,

              operation: Object
                .values(OperationType)
                .filter(t => t === new BN(tx.account.operationType).toNumber())[0]

            } as MultisigTransactionInfo;

            transactions.push(txInfo);
          }
          console.log('transactions', transactions);
          setMultisigPendingTxs(transactions);
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
    loadingMultisigTxs
  ]);

  

  // END MULTISIG

  // TODO: Remove when releasing to the public
  useEffect(() => {
    if (!isWhitelisted && !isLocal()) {
      navigate('/');
    }
  }, [
    isWhitelisted,
    navigate
  ]);


  // Create and cache Money Streaming Program instance
  const ms = useMemo(() => new MoneyStreaming(
    connectionConfig.endpoint, streamProgramAddress
  ), [
    connectionConfig.endpoint,
    streamProgramAddress
  ]);

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

  const getTreasuryStreams = useCallback((treasuryPk: PublicKey) => {
    if (!publicKey || !ms || loadingTreasuryStreams) { return; }

    setTimeout(() => {
      setLoadingTreasuryStreams(true);
    });

    consoleOut('Executing getTreasuryStreams...', '', 'blue');

    treasuryStreamsPerfCounter.start();
    ms.listStreams({treasury: treasuryPk })
      .then((streams) => {
        consoleOut('treasuryStreams:', streams, 'blue');
        setTreasuryStreams(streams);
        setLoadingTreasuryStreams(false);
      })
      .catch(err => {
        console.error(err);
        setTreasuryStreams([]);
        setLoadingTreasuryStreams(false);
      })
      .finally(() => {
        treasuryStreamsPerfCounter.stop();
        consoleOut(`getTreasuryStreams took ${(treasuryStreamsPerfCounter.elapsedTime).toLocaleString()}ms`, '', 'crimson');
      });

  }, [
    ms,
    publicKey,
    loadingTreasuryStreams,
  ]);

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

  const refreshTreasuries = useCallback((reset = false) => {
    if (!connection || !publicKey || !ms || loadingTreasuries) { return; }

    if (!loadingTreasuries && fetchTxInfoStatus !== "fetching") {

      // const signature = lastSentTxStatus || '';
      setTimeout(() => {
        setLoadingTreasuries(true);
        clearTransactionStatusContext();
      });

      treasuryListPerfCounter.start();
      ms.listTreasuries(publicKey)
        .then((treasuries) => {
          consoleOut('treasuries:', treasuries, 'blue');
          let item: TreasuryInfo | undefined = undefined;

          if (treasuries.length) {

            if (reset) {
              item = treasuries[0];
            } else {
              // Try to get current item by its original Tx signature then its id
              if (selectedTreasury) {
                const itemFromServer = treasuries.find(i => i.id === selectedTreasury.id);
                item = itemFromServer || treasuries[0];
              } else {
                item = treasuries[0];
              }
            }
            if (!item) {
              item = JSON.parse(JSON.stringify(treasuries[0]));
            }
            if (item) {
              setSelectedTreasury(item);
              openTreasuryById(item.id as string);
            }
          } else {
            setSelectedTreasury(undefined);
            setTreasuryDetails(undefined);
            setTreasuryStreams([]);
          }

          setTreasuryList(treasuries);
          setLoadingTreasuries(false);
        })
        .catch(error => {
          console.error(error);
          setLoadingTreasuries(false);
        })
        .finally(() => {
          treasuryListPerfCounter.stop();
          consoleOut(`listTreasuries took ${(treasuryListPerfCounter.elapsedTime).toLocaleString()}ms`, '', 'crimson');
        });
    }

  }, [
    ms,
    publicKey,
    connection,
    selectedTreasury,
    loadingTreasuries,
    fetchTxInfoStatus,
    clearTransactionStatusContext,
    openTreasuryById,
  ]);

  const numTreasuryStreams = useCallback(() => {
    return treasuryStreams ? treasuryStreams.length : 0;
  }, [treasuryStreams]);

  // Load treasuries once per page access
  useEffect(() => {
    if (!publicKey || !connection || treasuriesLoaded || loadingTreasuries) {
      return;
    }

    setTreasuriesLoaded(true);
    consoleOut('Loading treasuries with wallet connection...', '', 'blue');
    refreshTreasuries(true);
  }, [
    publicKey,
    connection,
    treasuriesLoaded,
    loadingTreasuries,
    refreshTreasuries
  ]);

  // Load/Unload treasuries on wallet connect/disconnect
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
    publicKey,
    refreshTreasuries
  ]);

  // Reload Treasury streams whenever the selected treasury changes
  useEffect(() => {
    if (!publicKey || !ms) { return; }

    if (treasuryDetails && !loadingTreasuryStreams && signalRefreshTreasuryStreams) {
      setSignalRefreshTreasuryStreams(false);
      consoleOut('calling getTreasuryStreams...', '', 'blue');
      const treasuryPk = new PublicKey(treasuryDetails.id as string);
      getTreasuryStreams(treasuryPk);
    }
  }, [
    ms,
    publicKey,
    treasuryStreams,
    treasuryDetails,
    loadingTreasuryStreams,
    signalRefreshTreasuryStreams,
    getTreasuryStreams,
  ]);

  // Maintain stream stats
  useEffect(() => {

    const updateStats = () => {
      if (treasuryStreams && treasuryStreams.length) {
        const scheduled = treasuryStreams.filter(s => s.state === STREAM_STATE.Schedule);
        const running = treasuryStreams.filter(s => s.state === STREAM_STATE.Running);
        const stopped = treasuryStreams.filter(s => s.state === STREAM_STATE.Paused);
        const stats: TreasuryStreamsBreakdown = {
          total: treasuryStreams.length,
          scheduled: scheduled.length,
          running: running.length,
          stopped: stopped.length
        }
        setStreamStats(stats);
      } else {
        setStreamStats(undefined);
      }
    }

    updateStats();
  }, [
    publicKey,
    treasuryStreams,
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

  // Treasury list refresh timeout
  useEffect(() => {
    let timer: any;

    if (publicKey && treasuriesLoaded && !customStreamDocked) {
      timer = setInterval(() => {
        consoleOut(`Refreshing treasuries past ${STREAMS_REFRESH_TIMEOUT / 60 / 1000}min...`);
        refreshTreasuries(false);
      }, STREAMS_REFRESH_TIMEOUT);
    }

    return () => clearInterval(timer);
  }, [
    publicKey,
    treasuriesLoaded,
    customStreamDocked,
    refreshTreasuries
  ]);

  // Handle what to do when pending Tx confirmation reaches finality or on error
  useEffect(() => {
    if (!publicKey) { return; }

    if (lastSentTxSignature && (fetchTxInfoStatus === "fetched" || fetchTxInfoStatus === "error")) {
      switch (lastSentTxOperationType) {
        case OperationType.TreasuryCreate:
        case OperationType.TreasuryClose:
          refreshTreasuries(true);
          break;
        default:
          refreshTreasuries(false);
          break;
      }
    }
  }, [
    publicKey,
    fetchTxInfoStatus,
    lastSentTxSignature,
    lastSentTxOperationType,
    refreshTreasuries,
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

  const isAnythingLoading = useCallback((): boolean => {
    return loadingTreasuries || loadingTreasuryDetails || loadingTreasuryStreams
            ? true
            : false;
  }, [
    loadingTreasuries,
    loadingTreasuryDetails,
    loadingTreasuryStreams,
  ]);

  const isCreatingTreasury = useCallback((): boolean => {
    return fetchTxInfoStatus === "fetching" && lastSentTxOperationType === OperationType.TreasuryCreate
            ? true
            : false;
  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  const isClosingTreasury = useCallback((): boolean => {
    return fetchTxInfoStatus === "fetching" && lastSentTxOperationType === OperationType.TreasuryClose
            ? true
            : false;
  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  const isAddingFunds = useCallback((): boolean => {
    return fetchTxInfoStatus === "fetching" && lastSentTxOperationType === OperationType.TreasuryAddFunds
            ? true
            : false;
  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  const isCreatingStream = useCallback((): boolean => {
    return fetchTxInfoStatus === "fetching" && lastSentTxOperationType === OperationType.TreasuryStreamCreate
            ? true
            : false;
  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  const isClosingStream = useCallback((): boolean => {
    return fetchTxInfoStatus === "fetching" && lastSentTxOperationType === OperationType.StreamClose
            ? true
            : false;
  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  const isPausingStream = useCallback((): boolean => {
    return fetchTxInfoStatus === "fetching" && lastSentTxOperationType === OperationType.StreamPause
            ? true
            : false;
  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  const isResumingStream = useCallback((): boolean => {
    return fetchTxInfoStatus === "fetching" && lastSentTxOperationType === OperationType.StreamResume
            ? true
            : false;
  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  const isTxInProgress = useCallback((): boolean => {
    return isBusy || fetchTxInfoStatus === "fetching"
            ? true
            : false;
  }, [
    isBusy,
    fetchTxInfoStatus,
  ]);

  const isTreasurer = useCallback((): boolean => {
    return publicKey && treasuryDetails && treasuryDetails.treasurerAddress === publicKey.toBase58()
            ? true
            : false;
  }, [
    publicKey,
    treasuryDetails,
  ]);

  const getStreamIcon = useCallback((item: StreamInfo) => {
    const isInbound = item.beneficiaryAddress === publicKey?.toBase58() ? true : false;
    return isInbound
      ? (<ArrowDownOutlined className="mean-svg-icons incoming" />)
      : (<ArrowUpOutlined className="mean-svg-icons outgoing" />)
  }, [
    publicKey
  ]);

  const getStreamDescription = (item: StreamInfo): string => {
    let title = '';
    const isInbound = item.beneficiaryAddress === publicKey?.toBase58() ? true : false;

    if (isInbound) {
      if (item.isUpdatePending) {
        title = `${t('streams.stream-list.title-pending-from')} (${shortenAddress(`${item.treasurerAddress}`)})`;
      } else if (item.state === STREAM_STATE.Schedule) {
        title = `${t('streams.stream-list.title-scheduled-from')} (${shortenAddress(`${item.treasurerAddress}`)})`;
      } else if (item.state === STREAM_STATE.Paused) {
        title = `${t('streams.stream-list.title-paused-from')} (${shortenAddress(`${item.treasurerAddress}`)})`;
      } else {
        title = `${t('streams.stream-list.title-receiving-from')} (${shortenAddress(`${item.treasurerAddress}`)})`;
      }
    } else {
      if (item.isUpdatePending) {
        title = `${t('streams.stream-list.title-pending-to')} (${shortenAddress(`${item.beneficiaryAddress}`)})`;
      } else if (item.state === STREAM_STATE.Schedule) {
        title = `${t('streams.stream-list.title-scheduled-to')} (${shortenAddress(`${item.beneficiaryAddress}`)})`;
      } else if (item.state === STREAM_STATE.Paused) {
        title = `${t('streams.stream-list.title-paused-to')} (${shortenAddress(`${item.beneficiaryAddress}`)})`;
      } else {
        title = `${t('streams.stream-list.title-sending-to')} (${shortenAddress(`${item.beneficiaryAddress}`)})`;
      }
    }
    return title;
  }

  const getStreamStatus = useCallback((item: StreamInfo) => {

    if (item.isUpdatePending) {
      return 'Update pending';
    }

    switch (item.state) {
      case STREAM_STATE.Schedule:
        return t('treasuries.treasury-streams.status-scheduled');
      case STREAM_STATE.Paused:
        return t('treasuries.treasury-streams.status-stopped');
      default:
        return t('treasuries.treasury-streams.status-running');
    }
  }, [t]);

  const getRateAmountDisplay = (item: StreamInfo): string => {
    let value = '';
    if (item && item.rateAmount && item.associatedToken) {
      value += getFormattedNumberToLocale(formatAmount(item.rateAmount, 2));
      value += ' ';
      value += getTokenSymbol(item.associatedToken as string);
    }
    return value;
  }

  const getDepositAmountDisplay = (item: StreamInfo): string => {
    let value = '';
    if (item && item.rateAmount === 0 && item.allocationReserved > 0) {
      value += getFormattedNumberToLocale(formatAmount(item.allocationReserved, 2));
      value += ' ';
      value += getTokenSymbol(item.associatedToken as string);
    }
    return value;
  }

  const getStreamRateAmount = (item: StreamInfo) => {
    let strOut = '';
    if (item && item.rateAmount > 0) {
      strOut = `${getRateAmountDisplay(item)} ${getIntervalFromSeconds(item.rateIntervalInSeconds, true, t)}`;
    } else {
      strOut = getDepositAmountDisplay(item);
    }
    return strOut;
  }

  const getTreasuryClosureMessage = () => {

    // if (publicKey && treasuryDetails) {
    //   const me = publicKey.toBase58();
    //   const treasury = treasuryDetails.id as string;
    //   const treasurer = treasuryDetails.treasurerAddress as string;
    // }

    return (
      <div>{t('treasuries.close-treasury-confirmation')}</div>
    );
  }

  const getStreamClosureMessage = () => {
    let message = '';

    if (publicKey && highlightedStream) {

      const me = publicKey.toBase58();
      const treasurer = highlightedStream.treasurerAddress as string;
      const beneficiary = highlightedStream.beneficiaryAddress as string;

      if (treasurer === me) {  // If I am the treasurer
        message = t('close-stream.context-treasurer-single-beneficiary', {beneficiary: shortenAddress(beneficiary)});
      } else if (beneficiary === me)  {  // If I am the beneficiary
        message = t('close-stream.context-beneficiary', { beneficiary: shortenAddress(beneficiary) });
      }

    }

    return (
      <div>{message}</div>
    );
  }

  const getStreamPauseMessage = () => {
    let message = '';

    if (publicKey && highlightedStream) {

      const treasury = highlightedStream.treasuryAddress as string;
      const beneficiary = highlightedStream.beneficiaryAddress as string;

      message = t('streams.pause-stream-confirmation', {
        treasury: shortenAddress(treasury),
        beneficiary: shortenAddress(beneficiary)
      });

    }

    return (
      <div>{message}</div>
    );
  }

  const getStreamResumeMessage = () => {
    let message = '';

    if (publicKey && highlightedStream) {

      const treasury = highlightedStream.treasuryAddress as string;
      const beneficiary = highlightedStream.beneficiaryAddress as string;

      message = t('streams.resume-stream-confirmation', {
        treasury: shortenAddress(treasury),
        beneficiary: shortenAddress(beneficiary)
      });

    }

    return (
      <div>{message}</div>
    );
  }

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


  const onCopyTreasuryAddress = (data: any) => {
    if (copyText(data.toString())) {
      notify({
        description: t('notifications.treasuryid-copied-message'),
        type: "info"
      });
    } else {
      notify({
        description: t('notifications.treasuryid-not-copied-message'),
        type: "error"
      });
    }
  }

  const onCopyStreamAddress = (data: any) => {
    if (copyText(data.toString())) {
      notify({
        description: t('notifications.streamid-copied-message'),
        type: "info"
      });
    } else {
      notify({
        description: t('notifications.streamid-not-copied-message'),
        type: "error"
      });
    }
  }

  // Open treasury modal
  const [isOpenTreasuryModalVisible, setIsOpenTreasuryModalVisibility] = useState(false);
  const showOpenTreasuryModal = useCallback(() => setIsOpenTreasuryModalVisibility(true), []);
  const closeOpenTreasuryModal = useCallback(() => setIsOpenTreasuryModalVisibility(false), []);

  const onAcceptOpenTreasury = (e: any) => {
    closeOpenTreasuryModal();
    consoleOut('treasury id:', e, 'blue');
    openTreasuryById(e, true);
  };

  // Add funds modal
  const [isAddFundsModalVisible, setIsAddFundsModalVisibility] = useState(false);
  const showAddFundsModal = useCallback(() => {
    setIsAddFundsModalVisibility(true);
    getTransactionFees(MSP_ACTIONS.addFunds).then(value => {
      setTransactionFees(value);
      consoleOut('transactionFees:', value, 'orange');
    });
  }, [getTransactionFees]);
  const closeAddFundsModal = useCallback(() => {
    setIsAddFundsModalVisibility(false);
  }, []);

  const onAcceptAddFunds = (params: TreasuryTopupParams) => {
    consoleOut('AddFunds params:', params, 'blue');
    onExecuteAddFundsTransaction(params);
  };

  const onAddFundsTransactionFinished = () => {
    closeAddFundsModal();
    refreshTokenBalance();
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  };

  const onExecuteAddFundsTransaction = async (params: TreasuryTopupParams) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.TreasuryAddFunds);
    setRetryOperationPayload(params);
    setIsBusy(true);

    const createTx = async (): Promise<boolean> => {
      if (publicKey && treasuryDetails && selectedToken) {
        consoleOut("Start transaction for treasury addFunds", '', 'blue');
        consoleOut('Wallet address:', publicKey.toBase58());

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const treasury = new PublicKey(treasuryDetails.id);
        const associatedToken = new PublicKey(selectedToken.address);
        const amount = parseFloat(params.amount);
        const stream = params.streamId ? new PublicKey(params.streamId) : undefined;

        console.log('params.streamId', params.streamId);

        const data = {
          contributor: publicKey.toBase58(),                       // contributor
          treasury: treasury.toBase58(),                           // treasury
          stream: stream?.toBase58(),                               // stream
          associatedToken: associatedToken.toBase58(),             // associatedToken
          amount,                                                 // amount
          allocationType: params.allocationType                   // allocationType
        }
        consoleOut('data:', data);

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: data
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
              getTokenAmountAndSymbolByTokenAddress(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
            })`
          });
          customLogger.logError('Add funds transaction failed', { transcript: transactionLog });
          return false;
        }

        // Create a transaction
        return await ms.addFunds(
          publicKey,
          treasury,
          stream,
          associatedToken,
          amount,
          params.allocationType
        )
        .then(value => {
          consoleOut('addFunds returned transaction:', value);
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
          console.error('addFunds error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Add funds transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Add funds transaction failed', { transcript: transactionLog });
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
            customLogger.logWarning('Add funds transaction failed', { transcript: transactionLog });
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
          console.error('Signing transaction failed!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('Add funds transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Add funds transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Add funds transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Add funds transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (publicKey && treasuryDetails && selectedToken) {
      const create = await createTx();
      consoleOut('create:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('sign:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.TreasuryAddFunds);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            await delay(1000);
            onAddFundsTransactionFinished();
            setOngoingOperation(undefined);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  // Close treasury modal
  const [isCloseTreasuryModalVisible, setIsCloseTreasuryModalVisibility] = useState(false);

  const showCloseTreasuryModal = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
    setIsCloseTreasuryModalVisibility(true);
    getTransactionFees(MSP_ACTIONS.closeStream).then(value => {
      setTransactionFees(value);
      consoleOut('transactionFees:', value, 'orange');
    });
  }, [
    getTransactionFees,
    setTransactionStatus,
  ]);

  const hideCloseTreasuryModal = useCallback(() => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    setIsCloseTreasuryModalVisibility(false);
  }, [isBusy]);

  const onAcceptCloseTreasury = () => {
    onExecuteCloseTreasuryTransaction();
  };

  const onCloseTreasuryTransactionFinished = () => {
    hideCloseTreasuryModal();
    refreshTokenBalance();
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
    setForceReloadTokens(true);
  };

  const onExecuteCloseTreasuryTransaction = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.TreasuryClose);
    setIsBusy(true);

    const createTx = async (): Promise<boolean> => {
      if (publicKey && treasuryDetails) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const treasury = new PublicKey(treasuryDetails.id as string);
        const data = {
          treasurer: publicKey.toBase58(),                      // treasurer
          treasury: treasury.toBase58()                         // treasury
        }
        consoleOut('data:', data);

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: data
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
              getTokenAmountAndSymbolByTokenAddress(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
            })`
          });
          customLogger.logError('Close Treasury transaction failed', { transcript: transactionLog });
          return false;
        }

        // Create a transaction
        return await ms.closeTreasury(
          publicKey,                                  // treasurer
          treasury,                                   // treasury
        )
        .then(value => {
          consoleOut('closeTreasury returned transaction:', value);
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
          console.error('closeTreasury error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Close Treasury transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Close Treasury transaction failed', { transcript: transactionLog });
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
            customLogger.logWarning('Close Treasury transaction failed', { transcript: transactionLog });
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
          console.error('Signing transaction failed!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('Close Treasury transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Close Treasury transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Close Treasury transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Close Treasury transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet) {
      const create = await createTx();
      consoleOut('create:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('sign:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            startFetchTxSignatureInfo(signature, "finalized", OperationType.TreasuryClose);
            setIsBusy(false);
            onCloseTreasuryTransactionFinished();
            setOngoingOperation(undefined);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  // Close stream modal
  const [isCloseStreamModalVisible, setIsCloseStreamModalVisibility] = useState(false);
  const showCloseStreamModal = useCallback(() => {
    getTransactionFees(MSP_ACTIONS.closeStream).then(value => {
      setTransactionFees(value);
      setIsCloseStreamModalVisibility(true);
      consoleOut('transactionFees:', value, 'orange');
    });
  }, [getTransactionFees]);
  const hideCloseStreamModal = useCallback(() => setIsCloseStreamModalVisibility(false), []);
  const onAcceptCloseStream = (closeTreasury: boolean) => {
    hideCloseStreamModal();
    onExecuteCloseStreamTransaction(closeTreasury);
  };

  // Close stream Transaction execution modal
  const [isCloseStreamTransactionModalVisible, setCloseStreamTransactionModalVisibility] = useState(false);
  const showCloseStreamTransactionModal = useCallback(() => setCloseStreamTransactionModalVisibility(true), []);
  const hideCloseStreamTransactionModal = useCallback(() => setCloseStreamTransactionModalVisibility(false), []);

  const onCloseStreamTransactionFinished = () => {
    resetTransactionStatus();
    hideCloseStreamTransactionModal();
    refreshTokenBalance();
    setForceReloadTokens(true);
  };

  const onAfterCloseStreamTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      hideCloseStreamTransactionModal();
    }
    resetTransactionStatus();
  }

  const onExecuteCloseStreamTransaction = async (closeTreasury: boolean) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.StreamClose);
    setRetryOperationPayload(closeTreasury);
    setIsBusy(true);

    const createTx = async (): Promise<boolean> => {
      if (wallet && highlightedStream) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });
        const streamPublicKey = new PublicKey(highlightedStream.id as string);

        const data = {
          stream: streamPublicKey.toBase58(),                     // stream
          initializer: wallet.publicKey.toBase58(),               // initializer
          closeTreasury                                           // closeTreasury
        }
        consoleOut('data:', data);

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: data
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
              getTokenAmountAndSymbolByTokenAddress(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
            })`
          });
          customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
          return false;
        }

        // Create a transaction
        return await ms.closeStream(
          publicKey as PublicKey,                           // Initializer public key
          streamPublicKey,                                  // Stream ID,
          closeTreasury
        )
        .then(value => {
          consoleOut('closeStream returned transaction:', value);
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
          console.error('closeStream error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
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
          customLogger.logWarning('Close stream transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet) {
      showCloseStreamTransactionModal();
      const create = await createTx();
      consoleOut('create:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('sign:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            startFetchTxSignatureInfo(signature, "finalized", OperationType.StreamClose);
            setIsBusy(false);
            onCloseStreamTransactionFinished();
            setOngoingOperation(undefined);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  // Pause stream modal
  const [isPauseStreamModalVisible, setIsPauseStreamModalVisibility] = useState(false);
  const showPauseStreamModal = useCallback(() => {
    getTransactionFees(MSP_ACTIONS.pauseStream).then(value => {
      setTransactionFees(value);
      setIsPauseStreamModalVisibility(true);
      consoleOut('transactionFees:', value, 'orange');
    });
  }, [getTransactionFees]);
  const hidePauseStreamModal = useCallback(() => setIsPauseStreamModalVisibility(false), []);
  const onAcceptPauseStream = () => {
    hidePauseStreamModal();
    onExecutePauseStreamTransaction();
  };

  const onPauseStreamTransactionFinished = () => {
    resetTransactionStatus();
    hideCloseStreamTransactionModal();
    refreshTokenBalance();
    setForceReloadTokens(true);
  };

  const onExecutePauseStreamTransaction = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.StreamPause);
    setIsBusy(true);

    const createTx = async (): Promise<boolean> => {
      if (wallet && highlightedStream) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });
        const streamPublicKey = new PublicKey(highlightedStream.id as string);

        const data = {
          stream: streamPublicKey.toBase58(),                     // stream
          initializer: wallet.publicKey.toBase58(),               // initializer
        }
        consoleOut('data:', data);

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: data
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
              getTokenAmountAndSymbolByTokenAddress(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
            })`
          });
          customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
          return false;
        }

        // Create a transaction
        return await ms.pauseStream(
          publicKey as PublicKey,                           // Initializer public key
          streamPublicKey,                                  // Stream ID
        )
        .then(value => {
          consoleOut('pauseStream returned transaction:', value);
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
          console.error('pauseStream error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
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
            customLogger.logWarning('Pause stream transaction failed', { transcript: transactionLog });
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
          console.error('Signing transaction failed!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('Pause stream transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      const encodedTx = signedTransaction.serialize().toString('base64');
      consoleOut('encodedTx:', encodedTx, 'orange');
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
            customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet) {
      showCloseStreamTransactionModal();
      const create = await createTx();
      consoleOut('create:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('sign:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.StreamPause);
            setIsBusy(false);
            onCloseStreamTransactionFinished();
            setOngoingOperation(undefined);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  // Resume stream modal
  const [isResumeStreamModalVisible, setIsResumeStreamModalVisibility] = useState(false);
  const showResumeStreamModal = useCallback(() => {
    getTransactionFees(MSP_ACTIONS.pauseStream).then(value => {
      setTransactionFees(value);
      setIsResumeStreamModalVisibility(true);
      consoleOut('transactionFees:', value, 'orange');
    });
  }, [getTransactionFees]);
  const hideResumeStreamModal = useCallback(() => setIsResumeStreamModalVisibility(false), []);
  const onAcceptResumeStream = () => {
    hideResumeStreamModal();
    onExecuteResumeStreamTransaction();
  };

  const onResumeStreamTransactionFinished = () => {
    resetTransactionStatus();
    hideCloseStreamTransactionModal();
    refreshTokenBalance();
    setForceReloadTokens(true);
  };

  const onExecuteResumeStreamTransaction = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.StreamResume);
    setIsBusy(true);

    const createTx = async (): Promise<boolean> => {
      if (wallet && highlightedStream) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });
        const streamPublicKey = new PublicKey(highlightedStream.id as string);

        const data = {
          stream: streamPublicKey.toBase58(),                     // stream
          initializer: wallet.publicKey.toBase58(),               // initializer
        }
        consoleOut('data:', data);

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: data
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
              getTokenAmountAndSymbolByTokenAddress(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
            })`
          });
          customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
          return false;
        }

        // Create a transaction
        return await ms.resumeStream(
          publicKey as PublicKey,                           // Initializer public key
          streamPublicKey,                                  // Stream ID
        )
        .then(value => {
          consoleOut('pauseStream returned transaction:', value);
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
          console.error('pauseStream error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
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
            customLogger.logWarning('Resume stream transaction failed', { transcript: transactionLog });
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
          console.error('Signing transaction failed!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('Resume stream transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Resume stream transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Resume stream transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Resume stream transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet) {
      showCloseStreamTransactionModal();
      const create = await createTx();
      consoleOut('create:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('sign:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.StreamResume);
            setIsBusy(false);
            onResumeStreamTransactionFinished();
            setOngoingOperation(undefined);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  // Create Stream modal
  const [isCreateStreamModalVisible, setIsCreateStreamModalVisibility] = useState(false);
  const showCreateStreamModal = useCallback(() => {
    setIsCreateStreamModalVisibility(true);
    getTransactionFees(MSP_ACTIONS.createStream).then(value => {
      setTransactionFees(value);
      consoleOut('transactionFees:', value, 'orange');
    });
  }, [getTransactionFees]);

  const closeCreateStreamModal = useCallback(() => {
    setIsCreateStreamModalVisibility(false);
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }, [setTransactionStatus]);

  const onAcceptCreateStream = () => {
    closeCreateStreamModal();
    resetContractValues();
    setForceReloadTokens(true);
    refreshTokenBalance();
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  };

  ///////////////
  // Rendering //
  ///////////////

  const renderStreamOptions = (item: StreamInfo) => {
    const menu = (
      <Menu>
        {item.state === STREAM_STATE.Paused ? (
          <Menu.Item key="1" onClick={showResumeStreamModal}>
            <span className="menu-item-text">{t('treasuries.treasury-streams.option-resume-stream')}</span>
          </Menu.Item>
        ) : item.state === STREAM_STATE.Running ? (
          <Menu.Item key="2" onClick={showPauseStreamModal}>
            <span className="menu-item-text">{t('treasuries.treasury-streams.option-pause-stream')}</span>
          </Menu.Item>
        ) : null}
        <Menu.Item key="3" onClick={showCloseStreamModal}>
          <span className="menu-item-text">{t('treasuries.treasury-streams.option-close-stream')}</span>
        </Menu.Item>
        <Menu.Item key="4" onClick={() => onCopyStreamAddress(item.id)}>
          <span className="menu-item-text">Copy Stream ID</span>
        </Menu.Item>
        <Menu.Item key="5" onClick={() => {}}>
          <a href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${item.id}${getSolanaExplorerClusterParam()}`}
              target="_blank" rel="noopener noreferrer">
            <span className="menu-item-text">{t('treasuries.treasury-streams.option-explorer-link')}</span>
          </a>
        </Menu.Item>
      </Menu>
    );

    return (
      <Dropdown overlay={menu} trigger={["click"]} onVisibleChange={(visibleChange) => {
        if (visibleChange) {
          sethHighlightedStream(item);
        } else {
          sethHighlightedStream(undefined);
        }
      }}>
        <span className="icon-container"><EllipsisOutlined /></span>
      </Dropdown>
    );
  }

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
            {multisigPendingTxs.map((item, index) => {
              // const status = getStreamStatus(item);
              return (
                <div 
                  style={{padding: '3px 0px'}} 
                  className={`item-list-row ${highlightedMultisigTx && highlightedMultisigTx.id === item.id ? 'selected' : ''}`} key={item.id.toBase58()}>
                  
                  <div className="std-table-cell responsive-cell">
                    <span className="align-middle">{getOperationName(item.operation)}</span>
                  </div>
                  <div className="std-table-cell responsive-cell">
                    <span className="align-middle">{getOperationProgram(item.operation)}</span>
                  </div>
                  <div className="std-table-cell responsive-cell">
                    <span className="align-middle">{getShortDate(item.createdOn.toString(), true)}</span>
                  </div>
                  <div className="std-table-cell text-center fixed-width-120">
                    <span className="align-middle" style={{
                      marginRight:5
                    }} >
                      {
                        `${item.signers}/${selectedMultisig.threshold}`
                      }
                    </span>
                    <span 
                      aria-disabled={item.status === MultisigTransactionStatus.Executed} 
                      className={`badge small ${getTransactionStatusClass(item)}`} 
                      style={{
                        padding: '3px 5px',
                        cursor: 
                          item.signers.filter(s => s === true).length === selectedMultisig.threshold && 
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
            disabled={isTxInProgress() || loadingMultisigAccounts}
            onClick={onShowTransferTokensModal}>
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
            disabled={isTxInProgress() || loadingMultisigAccounts}
            onClick={onShowUpgradeProgramModal}>
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
            disabled={isTxInProgress() || loadingMultisigAccounts}
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
          console.log('authority', item.address.toBase58());
          // openTreasuryById(item.id.toBase58());
          setDtailsPanelOpen(true);
        };
        return (
          <div 
            key={`${index + 50}`} 
            onClick={onMultisigClick}
            className={
              `transaction-list-row ${
                selectedMultisig && selectedMultisig.id.equals(item.id) 
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
                    {(!customStreamDocked && !loadingMultisigAccounts) && (
                      <span className="incoming-transactions-amout">{formatThousands(multisigAccounts.length)}</span>
                    )}
                    <span className="transaction-legend">
                      <span className="icon-button-container">
                        <Button
                          type="default"
                          shape="circle"
                          size="small"
                          icon={<ReloadOutlined />}
                          onClick={() => {}}
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
                        (loadingMultisigAccounts || loadingMultisigAccountDetails || !selectedMultisig) 
                          ? 'h-100 flex-center' 
                          : ''
                        }`
                      }>
                      <Spin spinning={loadingMultisigAccounts || loadingMultisigAccountDetails}>
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
                      {(!loadingMultisigAccounts && !loadingMultisigAccountDetails && !loadingMultisigTxs) && (
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
        handleClose={closeMintTokenModal}
        isBusy={isBusy}
      />

      <TreasuryCloseModal
        isVisible={isCloseTreasuryModalVisible}
        transactionFees={transactionFees}
        tokenBalance={tokenBalance}
        nativeBalance={nativeBalance}
        treasuryDetails={treasuryDetails}
        handleOk={onAcceptCloseTreasury}
        handleClose={hideCloseTreasuryModal}
        content={getTreasuryClosureMessage()}
        transactionStatus={transactionStatus.currentOperation}
        isBusy={isBusy}
      />

      {isCloseStreamModalVisible && (
        <StreamCloseModal
          isVisible={isCloseStreamModalVisible}
          transactionFees={transactionFees}
          streamDetail={highlightedStream}
          handleOk={onAcceptCloseStream}
          handleClose={hideCloseStreamModal}
          content={getStreamClosureMessage()}
          canCloseTreasury={numTreasuryStreams() === 1 ? true : false}
        />
      )}

      <StreamPauseModal
        isVisible={isPauseStreamModalVisible}
        transactionFees={transactionFees}
        tokenBalance={tokenBalance}
        streamDetail={highlightedStream}
        handleOk={onAcceptPauseStream}
        handleClose={hidePauseStreamModal}
        content={getStreamPauseMessage()}
      />

      <StreamResumeModal
        isVisible={isResumeStreamModalVisible}
        transactionFees={transactionFees}
        tokenBalance={tokenBalance}
        streamDetail={highlightedStream}
        handleOk={onAcceptResumeStream}
        handleClose={hideResumeStreamModal}
        content={getStreamResumeMessage()}
      />

      {isAddFundsModalVisible && (
        <TreasuryAddFundsModal
          handleOk={onAcceptAddFunds}
          handleClose={closeAddFundsModal}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          isVisible={isAddFundsModalVisible}
          userBalances={userBalances}
          streamStats={streamStats}
          treasuryStreams={treasuryStreams}
          associatedToken={treasuryDetails ? treasuryDetails.associatedTokenAddress as string : ''}
          isBusy={isBusy}
        />
      )}

      {isCreateStreamModalVisible && (
        <TreasuryStreamCreateModal
          associatedToken={treasuryDetails ? treasuryDetails.associatedTokenAddress as string : ''}
          connection={connection}
          handleClose={closeCreateStreamModal}
          handleOk={onAcceptCreateStream}
          isVisible={isCreateStreamModalVisible}
          moneyStreamingClient={ms}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          treasuryDetails={treasuryDetails}
          userBalances={userBalances}
        />
      )}

      {/* Transaction execution modal */}
      <Modal
        className="mean-modal no-full-screen"
        maskClosable={false}
        visible={isCloseStreamTransactionModalVisible}
        afterClose={onAfterCloseStreamTransactionModalClosed}
        title={getTransactionModalTitle(transactionStatus, isBusy, t)}
        onCancel={hideCloseStreamTransactionModal}
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
                onClick={() => lastSentTxOperationType === OperationType.StreamPause
                  ? onPauseStreamTransactionFinished()
                  : lastSentTxOperationType === OperationType.StreamResume
                    ? onResumeStreamTransactionFinished()
                    : lastSentTxOperationType === OperationType.StreamClose
                      ? onCloseStreamTransactionFinished()
                      : hideCloseStreamTransactionModal()}>
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
                      onClick={() => ongoingOperation === OperationType.StreamPause
                        ? onExecutePauseStreamTransaction()
                        : ongoingOperation === OperationType.StreamResume
                          ? onExecuteResumeStreamTransaction()
                          : ongoingOperation === OperationType.StreamClose
                            ? onExecuteCloseStreamTransaction(retryOperationPayload)
                            : hideCloseStreamTransactionModal()}>
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
                  onClick={hideCloseStreamTransactionModal}>
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
