import { DEFAULT_EXPIRATION_TIME_SECONDS, MeanMultisig } from "@mean-dao/mean-multisig-sdk";
import { TransactionFees } from "@mean-dao/msp";
import { AnchorProvider, Program } from '@project-serum/anchor';
import {
  AccountInfo,
  ConfirmOptions,
  Connection,
  LAMPORTS_PER_SOL,
  ParsedAccountData,
  ParsedTransactionWithMeta,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  Transaction
} from "@solana/web3.js";
import { Button, Col, Row, Tooltip } from "antd";
import { CopyExtLinkGroup } from 'components/CopyExtLinkGroup';
import { MultisigSetProgramAuthModal } from "components/MultisigSetProgramAuthModal";
import { MultisigUpgradeProgramModal } from "components/MultisigUpgradeProgramModal";
import { TabsMean } from 'components/TabsMean';
import { NO_FEES } from "constants/common";
import { NATIVE_SOL } from 'constants/tokens';
import { useNativeAccount } from "contexts/accounts";
import { AppStateContext } from "contexts/appstate";
import { useConnectionConfig } from "contexts/connection";
import { TxConfirmationContext } from "contexts/transaction-status";
import { useWallet } from "contexts/wallet";
import { IconArrowBack } from "Icons";
import { appConfig, customLogger } from 'index';
import { resolveParsedAccountInfo } from "middleware/accounts";
import { NATIVE_SOL_MINT } from "middleware/ids";
import { consoleOut, getTransactionStatusForLogs } from "middleware/ui";
import { formatThousands, getAmountFromLamports, getAmountWithSymbol, getTxIxResume } from "middleware/utils";
import { OperationType, TransactionStatus } from "models/enums";
import { SetProgramAuthPayload } from "models/multisig";
import moment from 'moment';
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import ReactJson from 'react-json-view';
import './style.scss';

export const ProgramDetailsView = (props: {
  isProgramDetails: boolean;
  onDataToProgramView: any;
  programSelected: any;
  selectedMultisig?: any;
}) => {
  const { account } = useNativeAccount();
  const connectionConfig = useConnectionConfig();
  const { publicKey, wallet } = useWallet();
  const {
    transactionStatus,
    refreshTokenBalance,
    setTransactionStatus,
  } = useContext(AppStateContext);
  const {
    fetchTxInfoStatus,
    startFetchTxSignatureInfo,
    clearTxConfirmationContext,
  } = useContext(TxConfirmationContext);

  const {
    // isProgramDetails, 
    onDataToProgramView,
    programSelected,
    selectedMultisig
  } = props;

  const [transactionFees, setTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [isBusy, setIsBusy] = useState(false);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [selectedProgramIdl, setSelectedProgramIdl] = useState<any>(null);
  const [loadingTxs, setLoadingTxs] = useState(true);
  const [programTransactions, setProgramTransactions] = useState<any>();
  const [upgradeAuthority, setUpgradeAuthority] = useState<string | null>(null);

  const noIdlInfo = "The program IDL is not initialized. To load the IDL info please run `anchor idl init` with the required parameters from your program workspace.";

  const multisigAddressPK = useMemo(() => new PublicKey(appConfig.getConfig().multisigProgramAddress), []);

  // When back button is clicked, goes to Safe Info
  const hideProgramDetailsHandler = () => {
    // Sends the value to the parent component "SafeView"
    onDataToProgramView();
  };

  /////////////////
  //  Init code  //
  /////////////////

  const connection = useMemo(() => new Connection(connectionConfig.endpoint, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true
  }), [
    connectionConfig.endpoint
  ]);

  const multisigClient = useMemo(() => {
    if (!connection || !publicKey || !connectionConfig.endpoint) { return null; }
    return new MeanMultisig(
      connectionConfig.endpoint,
      publicKey,
      "confirmed",
      multisigAddressPK
    );
  }, [
    publicKey,
    connection,
    multisigAddressPK,
    connectionConfig.endpoint,
  ]);

  const isTxInProgress = useCallback((): boolean => {
    return isBusy || fetchTxInfoStatus === "fetching" ? true : false;
  }, [
    isBusy,
    fetchTxInfoStatus,
  ]);

  // Upgrade program modal
  const [isUpgradeProgramModalVisible, setIsUpgradeProgramModalVisible] = useState(false);
  const showUpgradeProgramModal = useCallback(() => {
    setIsUpgradeProgramModalVisible(true);
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.000010,
      mspPercentFee: 0
    };
    setTransactionFees(fees);
  }, []);

  const resetTransactionStatus = useCallback(() => {
    setIsBusy(false);
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });

  }, [
    setTransactionStatus
  ]);

  const onAcceptUpgradeProgram = (params: any) => {
    consoleOut('params', params, 'blue');
    onExecuteUpgradeProgramsTx(params);
  };

  const onProgramUpgraded = useCallback(() => {
    setIsUpgradeProgramModalVisible(false);
  }, []);

  const onExecuteUpgradeProgramsTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTxConfirmationContext();
    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const upgradeProgram = async (data: any) => {

      if (!multisigClient || !selectedMultisig || !publicKey) { return null; }

      const dataBuffer = Buffer.from([3, 0, 0, 0]);
      const spill = publicKey;
      const ixAccounts = [
        {
          pubkey: new PublicKey(data.programDataAddress),
          isWritable: true,
          isSigner: false,
        },
        { pubkey: new PublicKey(data.programAddress), isWritable: true, isSigner: false },
        { pubkey: new PublicKey(data.bufferAddress), isWritable: true, isSigner: false },
        { pubkey: spill, isWritable: true, isSigner: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isWritable: false, isSigner: false },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isWritable: false, isSigner: false },
        { pubkey: selectedMultisig.authority, isWritable: false, isSigner: false },
      ];

      const BPF_LOADER_UPGRADEABLE_PID = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
        publicKey,
        "Upgrade Program",
        "", // description
        new Date(expirationTime * 1_000),
        OperationType.UpgradeProgram,
        selectedMultisig.id,
        BPF_LOADER_UPGRADEABLE_PID,
        ixAccounts,
        dataBuffer
      );

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
          programAddress: data.programAddress,
          programDataAddress: data.programDataAddress,
          bufferAddress: data.bufferAddress
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

        // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
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
            result: `Not enough balance (${getAmountWithSymbol(nativeBalance, NATIVE_SOL_MINT.toBase58())
              }) to pay for network fees (${getAmountWithSymbol(
                transactionFees.blockchainFee + transactionFees.mspFlatFee,
                NATIVE_SOL_MINT.toBase58()
              )
              })`
          });
          customLogger.logWarning('Upgrade Program transaction failed', { transcript: transactionLog });
          return false;
        }

        return upgradeProgram(data)
          .then(value => {
            if (!value) { return false; }
            consoleOut('upgradeProgram returned transaction:', value);
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
            console.error('upgradeProgram error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`
            });
            customLogger.logError('Upgrade Program transaction failed', { transcript: transactionLog });
            return false;
          });

      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Upgrade Program transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      if (connection && wallet && wallet.publicKey && transaction) {
        const {
          context: { slot: minContextSlot },
          value: { blockhash },
        } = await connection.getLatestBlockhashAndContext();

        transaction.feePayer = wallet.publicKey;
        transaction.recentBlockhash = blockhash;

        return wallet.sendTransaction(transaction, connection, { minContextSlot })
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
            customLogger.logError('Upgrade Program transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Upgrade Program transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet) {
      const create = await createTx();
      consoleOut('created:', create);
      if (create && !transactionCancelled) {
        const sent = await sendTx();
        consoleOut('sent:', sent);
        if (sent && !transactionCancelled) {
          consoleOut('Send Tx to confirmation queue:', signature);
          startFetchTxSignatureInfo(signature, "confirmed", OperationType.UpgradeProgram);
          setIsBusy(false);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionFinished
          });
          onProgramUpgraded();
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    wallet,
    publicKey,
    connection,
    nativeBalance,
    multisigClient,
    selectedMultisig,
    transactionCancelled,
    transactionFees.mspFlatFee,
    transactionFees.blockchainFee,
    transactionStatus.currentOperation,
    clearTxConfirmationContext,
    startFetchTxSignatureInfo,
    resetTransactionStatus,
    setTransactionStatus,
    onProgramUpgraded,
  ]);

  // Set program authority modal
  const [isSetProgramAuthModalVisible, setIsSetProgramAuthModalVisible] = useState(false);
  const showSetProgramAuthModal = useCallback(() => {
    setIsSetProgramAuthModalVisible(true);
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.000010,
      mspPercentFee: 0
    };
    setTransactionFees(fees);
  }, []);

  const setInmutableProgram = (programId: string) => {
    const programAddress = new PublicKey(programId);
    const BPF_LOADER_UPGRADEABLE_PID = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
    PublicKey.findProgramAddress(
      [programAddress.toBuffer()],
      BPF_LOADER_UPGRADEABLE_PID
    )
      .then((result: any) => {
        const programDataAddress = result[0];
        const fees = {
          blockchainFee: 0.000005,
          mspFlatFee: 0.000010,
          mspPercentFee: 0
        };
        setTransactionFees(fees);
        const params: SetProgramAuthPayload = {
          programAddress: programId,
          programDataAddress: programDataAddress.toBase58(),
          newAuthAddress: '', // Empty to make program non-upgradable (inmutable)
        };
        onAcceptSetProgramAuth(params);
      })
      .catch(err => console.error(err));
  }

  const onAcceptSetProgramAuth = (params: SetProgramAuthPayload) => {
    consoleOut('params', params, 'blue');
    onExecuteSetProgramAuthTx(params);
  };

  const onProgramAuthSet = useCallback(() => {
    setIsSetProgramAuthModalVisible(false);
  }, []);

  const onExecuteSetProgramAuthTx = useCallback(async (params: SetProgramAuthPayload) => {

    let transaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTxConfirmationContext();
    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const setProgramAuth = async (data: SetProgramAuthPayload) => {

      if (!multisigClient || !selectedMultisig || !publicKey) { return null; }

      const [multisigSigner] = await PublicKey.findProgramAddress(
        [selectedMultisig.id.toBuffer()],
        multisigAddressPK
      );

      const ixData = Buffer.from([4, 0, 0, 0]);
      const ixAccounts = [
        {
          pubkey: new PublicKey(data.programDataAddress),
          isWritable: true,
          isSigner: false,
        },
        { pubkey: multisigSigner, isWritable: false, isSigner: true },
      ];

      // If it is an authority change, add the account of the new authority otherwise the program will be inmutable
      if (data.newAuthAddress) {
        ixAccounts.push({ pubkey: new PublicKey(data.newAuthAddress), isWritable: false, isSigner: false });
      }

      const BPF_LOADER_UPGRADEABLE_PID = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
        publicKey,
        "Set Program Authority",
        "", // description
        new Date(expirationTime * 1_000),
        OperationType.SetMultisigAuthority,
        selectedMultisig.id,
        BPF_LOADER_UPGRADEABLE_PID,
        ixAccounts,
        ixData
      );

      return tx;
    };

    const createTx = async (): Promise<boolean> => {

      if (publicKey && params) {
        consoleOut("Start transaction for create multisig", '', 'blue');
        consoleOut('Wallet address:', publicKey.toBase58());

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        consoleOut('data:', params);

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: params
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: ''
        });

        // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
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
            result: `Not enough balance (${getAmountWithSymbol(nativeBalance, NATIVE_SOL_MINT.toBase58())
              }) to pay for network fees (${getAmountWithSymbol(
                transactionFees.blockchainFee + transactionFees.mspFlatFee,
                NATIVE_SOL_MINT.toBase58()
              )
              })`
          });
          customLogger.logWarning('Set program authority transaction failed', { transcript: transactionLog });
          return false;
        }

        return setProgramAuth(params)
          .then(value => {
            if (!value) { return false; }
            consoleOut('setProgramAuth returned transaction:', value);
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
            console.error('setProgramAuth error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`
            });
            customLogger.logError('Set program authority transaction failed', { transcript: transactionLog });
            return false;
          });

      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Set program authority transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      if (connection && wallet && wallet.publicKey && transaction) {
        const {
          context: { slot: minContextSlot },
          value: { blockhash },
        } = await connection.getLatestBlockhashAndContext();

        transaction.feePayer = wallet.publicKey;
        transaction.recentBlockhash = blockhash;

        return wallet.sendTransaction(transaction, connection, { minContextSlot })
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
            customLogger.logError('Set program authority transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Set program authority transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet) {
      const create = await createTx();
      consoleOut('created:', create);
      if (create && !transactionCancelled) {
        const sent = await sendTx();
        consoleOut('sent:', sent);
        if (sent && !transactionCancelled) {
          consoleOut('Send Tx to confirmation queue:', signature);
          startFetchTxSignatureInfo(signature, "confirmed", OperationType.SetMultisigAuthority);
          setIsBusy(false);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionFinished
          });
          onProgramAuthSet();
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    wallet,
    publicKey,
    connection,
    nativeBalance,
    multisigClient,
    selectedMultisig,
    multisigAddressPK,
    transactionCancelled,
    transactionFees.mspFlatFee,
    transactionFees.blockchainFee,
    transactionStatus.currentOperation,
    clearTxConfirmationContext,
    startFetchTxSignatureInfo,
    resetTransactionStatus,
    setTransactionStatus,
    onProgramAuthSet,
  ]);

  // Keep account balance updated
  useEffect(() => {
    if (account?.lamports !== previousBalance || !nativeBalance) {
      refreshTokenBalance();
      setNativeBalance(getAmountFromLamports(account?.lamports));
      setPreviousBalance(account?.lamports);
    }
  }, [
    account,
    nativeBalance,
    previousBalance,
    refreshTokenBalance
  ]);

  const renderProgramLabel = useCallback(() => {
    if (!selectedProgramIdl) {
      return '--';
    }
    return selectedProgramIdl.name;
  }, [selectedProgramIdl]);

  // Program Address
  const renderProgramAddress = () => {
    if (!programSelected) {
      return '--';
    }
    return (
      <CopyExtLinkGroup
        content={programSelected.pubkey.toBase58()}
        number={4}
        externalLink={true}
      />
    );
  }

  // Get the upgrade authority of a program
  useEffect(() => {
    if (!programSelected) { return; }

    const programData = programSelected.executable.toBase58() as string;
    resolveParsedAccountInfo(connection, programData)
      .then(accountInfo => {
        const authority = accountInfo.data.parsed.info.authority as
          | string
          | null;
        setUpgradeAuthority(authority);
      })
      .catch(error => setUpgradeAuthority(null));

  }, [connection, programSelected]);

  // Upgrade Authority
  const renderUpgradeAuthority = () => {
    if (!upgradeAuthority) {
      return '--';
    }

    return (
      <CopyExtLinkGroup
        content={upgradeAuthority}
        number={4}
        externalLink={true}
      />
    );
  }

  // // Executable
  // const [isExecutable, setIsExecutable] = useState<boolean>();
  // useEffect(() => {
  //   programSelected && programSelected.executable.toBase58() ? (
  //     setIsExecutable(true)
  //   ) : (
  //     setIsExecutable(false)
  //   )
  // }, [programSelected]);

  // Balance SOL
  const [balanceSol, setBalanceSol] = useState<any>();

  useEffect(() => {

    if (!connection || !programSelected || !programSelected.pubkey) { return; }

    connection
      .getBalance(programSelected.pubkey)
      .then(balance => {
        setBalanceSol(
          formatThousands(
            balance / LAMPORTS_PER_SOL,
            NATIVE_SOL.decimals,
            NATIVE_SOL.decimals
          )
        );
      })
      .catch(error => console.error(error));

  }, [
    connection,
    programSelected
  ]);

  const infoProgramData = [
    {
      name: "Address label",
      value: renderProgramLabel()
    },
    {
      name: "Program address",
      value: renderProgramAddress()
    },
    {
      name: "Upgradeable",
      value: upgradeAuthority ? "Yes" : "No"
    },
    {
      name: "Upgrade authority",
      value: renderUpgradeAuthority()
    },
    // {
    //   name: "Executable",
    //   value: isExecutable ? "Yes" : "no"
    // },
    {
      name: "Balance (SOL)",
      value: balanceSol ? balanceSol : "--"
    },
  ];

  // Get transactions
  const getProgramTxs = useCallback(async () => {

    if (!connection || !programSelected) { return null; }

    const signaturesInfo = await connection.getConfirmedSignaturesForAddress2(
      programSelected.pubkey, { limit: 50 } // TODO: Implement pagination
    );

    if (signaturesInfo.length === 0) { return null; }

    const signatures = signaturesInfo.map((data) => data.signature);
    const txs = await connection.getParsedTransactions(signatures);

    if (txs.length === 0) { return null; }

    return txs.filter(tx => tx !== null);

  }, [
    connection,
    programSelected
  ]);

  useEffect(() => {

    if (!connection || !programSelected || !loadingTxs) { return; }

    const timeout = setTimeout(() => {
      getProgramTxs()
        .then(txs => setProgramTransactions(txs))
        .catch((err: any) => console.error(err))
        .finally(() => setLoadingTxs(false));
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connection,
    programSelected,
    loadingTxs,
    getProgramTxs
  ]);

  const renderTransactions = (
    <>
      <div className="item-list-header compact mt-2 mr-1">
        <Row gutter={[8, 8]} className="d-flex header-row pb-2">
          <Col span={14} className="std-table-cell pr-1">Signatures</Col>
          <Col span={5} className="std-table-cell pl-3 pr-1">Slots</Col>
          <Col span={5} className="std-table-cell pl-3 pr-1">Time</Col>
        </Row>
      </div>
      {!loadingTxs ? (
        (programTransactions && programTransactions.length > 0) ? (
          programTransactions.map((tx: ParsedTransactionWithMeta) => (
            <Row gutter={[8, 8]} className="item-list-body compact hover-list w-100 pt-1" key={tx.blockTime}>
              <Col span={14} className="std-table-cell pr-1 simplelink signature">
                <CopyExtLinkGroup
                  content={tx.transaction.signatures.slice(0, 1).shift() || ""}
                  externalLink={true}
                  className="text-truncate"
                  message="Signature"
                  isTx={true}
                />
              </Col>
              <Col span={5} className="std-table-cell pr-1 simplelink">
                <CopyExtLinkGroup
                  content={formatThousands(tx.slot)}
                  externalLink={false}
                  className="text-truncate"
                  message="Slot"
                />
              </Col>
              <Col span={5} className="std-table-cell pr-1">
                {moment.unix(tx.blockTime as number).fromNow()}
              </Col>
            </Row>
          ))
        ) : (
          <span>This program has no transactions</span>
        )
      ) : (
        <span>Loading transactions ...</span>
      )}
    </>
  );

  const getProgramIDL = useCallback(async () => {

    if (!connection || !publicKey || !programSelected) { return null; }

    const createAnchorProvider = (): AnchorProvider => {

      const opts: ConfirmOptions = {
        commitment: "confirmed",
        preflightCommitment: "confirmed",
        maxRetries: 3,
        skipPreflight: false
      };

      const anchorWallet = {
        publicKey: publicKey,
        signAllTransactions: async (txs: any) => txs,
        signTransaction: async (tx: any) => tx,
      };

      const provider = new AnchorProvider(connection, anchorWallet, opts);

      return provider
    };

    const provider = createAnchorProvider();

    return Program.fetchIdl(programSelected.pubkey, provider);

  }, [
    connection,
    programSelected,
    publicKey
  ]);

  // Get Anchor IDL
  useEffect(() => {

    if (!connection || !publicKey || !programSelected) { return; }

    const timeout = setTimeout(() => {
      getProgramIDL()
        .then((idl: any) => {
          if (!idl) { return; }
          console.log('IDL', idl);
          setSelectedProgramIdl(idl);
        })
        .catch((err: any) => {
          setSelectedProgramIdl(null);
          console.error(err);
        });
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connection,
    getProgramIDL,
    programSelected,
    publicKey
  ]);

  const renderIdlTree = () => {
    return !selectedProgramIdl ? <div className={"no-idl-info"}>{noIdlInfo}</div> : (
      <ReactJson theme={"ocean"} enableClipboard={false} src={selectedProgramIdl} />
    );
  };

  // Tabs
  const tabs = [
    {
      id: "transactions",
      name: "Transactions",
      render: renderTransactions
    },
    {
      id: "anchor-idl",
      name: "Anchor IDL",
      render: renderIdlTree()
    }
  ];

  return (
    <>
      <div className="program-details-container">
        <Row gutter={[8, 8]} className="program-details-resume mb-1 mr-0 ml-0">
          <div onClick={hideProgramDetailsHandler} className="back-button icon-button-container">
            <IconArrowBack className="mean-svg-icons" />
            <span className="ml-1">Back</span>
          </div>
        </Row>

        <Row gutter={[8, 8]} className="safe-info-container mr-0 ml-0">
          {infoProgramData.map((info, index) => (
            <Col xs={12} sm={12} md={12} lg={12} key={index}>
              <div className="info-safe-group">
                <span className="info-label">
                  {info.name}
                </span>
                <span className="info-data">
                  {info.value}
                </span>
              </div>
            </Col>
          ))}
        </Row>

        <Row gutter={[8, 8]} className="programs-btns safe-btns-container mt-2 mb-1 mr-0 ml-0">
          <Col xs={24} sm={24} md={24} lg={24} className="btn-group">
            <Tooltip title={upgradeAuthority ? 'Update the executable data of this program' : 'This program is non-upgradeable'}>
              <Button
                type="default"
                shape="round"
                size="small"
                className="thin-stroke"
                disabled={isTxInProgress() || !upgradeAuthority}
                onClick={showUpgradeProgramModal}>
                <div className="btn-content">
                  Upgrade / Deployment
                </div>
              </Button>
            </Tooltip>
            <Tooltip title={upgradeAuthority ? 'This changes the authority of this program' : 'This program is non-upgradeable'}>
              <Button
                type="default"
                shape="round"
                size="small"
                className="thin-stroke"
                disabled={isTxInProgress() || !upgradeAuthority}
                onClick={showSetProgramAuthModal}>
                <div className="btn-content">
                  Set authority
                </div>
              </Button>
            </Tooltip>
            {programSelected && (
              <Tooltip title={upgradeAuthority ? 'This makes the program non-upgradable' : 'This program is non-upgradeable'}>
                <Button
                  type="default"
                  shape="round"
                  size="small"
                  className="thin-stroke"
                  disabled={isTxInProgress() || !upgradeAuthority}
                  onClick={() => setInmutableProgram(programSelected.pubkey.toBase58())}>
                  <div className="btn-content">
                    Make immutable
                  </div>
                </Button>
              </Tooltip>
            )}
          </Col>
        </Row>

        <TabsMean
          tabs={tabs}
          defaultTab="transactions"
        />
      </div>

      {isUpgradeProgramModalVisible && (
        <MultisigUpgradeProgramModal
          isVisible={isUpgradeProgramModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          handleOk={onAcceptUpgradeProgram}
          handleClose={() => setIsUpgradeProgramModalVisible(false)}
          programId={programSelected?.pubkey.toBase58()}
          isBusy={isBusy}
          programAddress={programSelected.pubkey.toBase58()}
        />
      )}

      {isSetProgramAuthModalVisible && (
        <MultisigSetProgramAuthModal
          isVisible={isSetProgramAuthModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          handleOk={(params: SetProgramAuthPayload) => onAcceptSetProgramAuth(params)}
          handleClose={() => setIsSetProgramAuthModalVisible(false)}
          programId={programSelected?.pubkey.toBase58()}
          isBusy={isBusy}
        />
      )}
    </>
  )
};