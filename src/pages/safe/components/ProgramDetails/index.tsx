import './style.scss';
import { DEFAULT_EXPIRATION_TIME_SECONDS, MeanMultisig, MEAN_MULTISIG_PROGRAM } from "@mean-dao/mean-multisig-sdk";
import { TransactionFees } from "@mean-dao/msp";
import { ConfirmOptions, Connection, LAMPORTS_PER_SOL, ParsedTransactionWithMeta, PublicKey, SYSVAR_CLOCK_PUBKEY, SYSVAR_RENT_PUBKEY, Transaction } from "@solana/web3.js";
import { Button, Col, Row } from "antd";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
// import { useTranslation } from "react-i18next";
import { MultisigSetProgramAuthModal } from "../../../../components/MultisigSetProgramAuthModal";
import { MultisigUpgradeProgramModal } from "../../../../components/MultisigUpgradeProgramModal";
import { NO_FEES } from "../../../../constants";
import { useNativeAccount } from "../../../../contexts/accounts";
import { AppStateContext } from "../../../../contexts/appstate";
import { useConnectionConfig } from "../../../../contexts/connection";
import { TxConfirmationContext } from "../../../../contexts/transaction-status";
import { useWallet } from "../../../../contexts/wallet";
import { IconArrowBack } from "../../../../Icons";
import { OperationType, TransactionStatus } from "../../../../models/enums";
import { NATIVE_SOL_MINT } from "../../../../utils/ids";
import { consoleOut, getTransactionStatusForLogs } from "../../../../utils/ui";
import { formatThousands, getTokenAmountAndSymbolByTokenAddress, getTxIxResume } from "../../../../utils/utils";
import { ProgramAccounts } from "../../../../utils/accounts";
import { customLogger } from "../../../..";
import { TabsMean } from '../../../../components/TabsMean';
import { AnchorProvider, Program } from '@project-serum/anchor';
import { NATIVE_SOL } from '../../../../utils/tokens';
// import { CopyOutlined } from '@ant-design/icons';
import { CopyExtLinkGroup } from '../../../../components/CopyExtLinkGroup';
import moment from 'moment';
import ReactJson from 'react-json-view'

export const ProgramDetailsView = (props: {
  isProgramDetails: boolean;
  onDataToProgramView: any;
  programSelected: any;
  selectedMultisig?: any;
}) => {
  // const { t } = useTranslation('common');
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

  const { isProgramDetails, onDataToProgramView, programSelected, selectedMultisig } = props;

  const [transactionFees, setTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [isBusy, setIsBusy] = useState(false);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [/*ongoingOperation*/, setOngoingOperation] = useState<OperationType | undefined>(undefined);
  const [/*retryOperationPayload*/, setRetryOperationPayload] = useState<any>(undefined);
  const [selectedProgram, setSelectedProgram] = useState<ProgramAccounts | undefined>(undefined);
  const [selectedProgramIdl, setSelectedProgramIdl] = useState<any>(null);
  const [loadingTxs, setLoadingTxs] = useState(true);
  const noIdlInfo = "The program IDL is not initialized. To load the IDL info please run `anchor idl init` with the required parameters from your program workspace.";

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
      "confirmed"
    );
  }, [
    connection,
    publicKey,
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
  },[]);

  const onExecuteUpgradeProgramsTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTxConfirmationContext();
    resetTransactionStatus();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.UpgradeProgram);
    setRetryOperationPayload(data);
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
            result: `Not enough balance (${
              getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getTokenAmountAndSymbolByTokenAddress(
                transactionFees.blockchainFee + transactionFees.mspFlatFee, 
                NATIVE_SOL_MINT.toBase58()
              )
            })`
          });
          customLogger.logWarning('Upgrade Program transaction failed', { transcript: transactionLog });
          return false;
        }

        return await upgradeProgram(data)
          .then(value => {
            if (!value) { return false; }
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

    const signTx = async (): Promise<boolean> => {
      if (!wallet || !wallet.publicKey) {
        console.error('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot sign transaction! Wallet not found!'
        });
        customLogger.logError('Upgrade Program transaction failed', { transcript: transactionLog });
        return false;
      }
      const signedPublicKey = wallet.publicKey;
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
              result: {signer: `${signedPublicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logError('Upgrade Program transaction failed', { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: signedPublicKey.toBase58()}
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
            result: {signer: `${signedPublicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logError('Upgrade Program transaction failed', { transcript: transactionLog });
          return false;
        });
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
        const sign = await signTx();
        consoleOut('signed:', sign);
        if (sign && !transactionCancelled) {
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
            setOngoingOperation(undefined);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    clearTxConfirmationContext,
    resetTransactionStatus,
    connection, 
    multisigClient, 
    nativeBalance, 
    onProgramUpgraded, 
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

  const onAcceptSetProgramAuth = (params: any) => {
    consoleOut('params', params, 'blue');
    onExecuteSetProgramAuthTx(params);
  };

  const onProgramAuthSet = useCallback(() => {
    setIsSetProgramAuthModalVisible(false);
  },[]);

  const onExecuteSetProgramAuthTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTxConfirmationContext();
    resetTransactionStatus();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.SetMultisigAuthority);
    setRetryOperationPayload(data);
    setIsBusy(true);

    const setProgramAuth = async (data: any) => {

      if (!multisigClient || !selectedMultisig || !publicKey) { return null; }

      const [multisigSigner] = await PublicKey.findProgramAddress(
        [selectedMultisig.id.toBuffer()],
        MEAN_MULTISIG_PROGRAM
      );

      const ixData = Buffer.from([4, 0, 0, 0]);
      const ixAccounts = [
        {
          pubkey: new PublicKey(data.programDataAddress),
          isWritable: true,
          isSigner: false,
        },
        { pubkey: multisigSigner, isWritable: false, isSigner: true },
        { pubkey: new PublicKey(data.newAuthAddress), isWritable: false, isSigner: false },
      ];

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
          newAuthAddress: data.newAuthAddress
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
            result: `Not enough balance (${
              getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getTokenAmountAndSymbolByTokenAddress(
                transactionFees.blockchainFee + transactionFees.mspFlatFee, 
                NATIVE_SOL_MINT.toBase58()
              )
            })`
          });
          customLogger.logWarning('Set program authority transaction failed', { transcript: transactionLog });
          return false;
        }

        return await setProgramAuth(data)
          .then(value => {
            if (!value) { return false; }
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

    const signTx = async (): Promise<boolean> => {
      if (!wallet || !wallet.publicKey) {
        console.error('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot sign transaction! Wallet not found!'
        });
        customLogger.logError('Set program authority transaction failed', { transcript: transactionLog });
        return false;
      }
      const signedPublicKey = wallet.publicKey;
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
              result: {signer: `${signedPublicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logError('Set program authority transaction failed', { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: signedPublicKey.toBase58()}
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
            result: {signer: `${signedPublicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logError('Set program authority transaction failed', { transcript: transactionLog });
          return false;
        });
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
        const sign = await signTx();
        consoleOut('signed:', sign);
        if (sign && !transactionCancelled) {
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
            setOngoingOperation(undefined);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    clearTxConfirmationContext,
    resetTransactionStatus,
    connection,
    multisigClient,
    nativeBalance,
    onProgramAuthSet,
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

  // Program Address
  const renderProgramAddress = (
    <CopyExtLinkGroup
      content={programSelected.pubkey.toBase58()}
      number={4}
      externalLink={true}
    />
  );

  // Upgradeable
  const [isUpgradeable, setIsUpgradeable] = useState<boolean>();
  useEffect(() => {
    programSelected && programSelected.upgradeAuthority.toBase58() ? (
      setIsUpgradeable(true)
    ) : (
      setIsUpgradeable(false)
    )
  }, [programSelected]);

  // Upgrade Authority
  const renderUpgradeAuthority = (
    <CopyExtLinkGroup
      content={programSelected.upgradeAuthority.toBase58()}
      number={4}
      externalLink={true}
    />
  );

  // Executable
  const [isExecutable, setIsExecutable] = useState<boolean>();
  useEffect(() => {
    programSelected && programSelected.executable.toBase58() ? (
      setIsExecutable(true)
    ) : (
      setIsExecutable(false)
    )
  }, [programSelected]);

  // Balance SOL
  const [balanceSol, setBalanceSol] = useState<any>();
  useEffect(() => {
    if (!connection) { return; }

    connection.getBalance(programSelected.pubkey)
        .then(balance => {
          setBalanceSol(formatThousands(balance / LAMPORTS_PER_SOL, NATIVE_SOL.decimals, NATIVE_SOL.decimals));
        })
        .catch(error => {
          console.error(error);
        })
  }, [connection, programSelected.pubkey]);

  const infoProgramData = [
    {
      name: "Address label",
      value: "--"
    },
    {
      name: "Program address",
      value: renderProgramAddress ? renderProgramAddress : "--"
    },
    {
      name: "Upgradeable",
      value: isUpgradeable ? "Yes" : "no"
    },
    {
      name: "Upgrade authority",
      value: renderUpgradeAuthority ? renderUpgradeAuthority : "--"
    },
    {
      name: "Executable",
      value: isExecutable ? "Yes" : "no"
    },
    {
      name: "Balance (SOL)",
      value: balanceSol ? balanceSol : "--"
    },
  ];

  // Get transactions
  const [programSignatures, setProgramSignatures] = useState<any>();
  const [programTransactions, setProgramTransactions] = useState<any>();

  useEffect(() => {
    if (!connection) { return; }

    connection.getConfirmedSignaturesForAddress2(programSelected.pubkey)
        .then(signaturesData => {
          const signatures = signaturesData.map((data) => data.signature)
          setProgramSignatures(signatures);
        })
        .catch(error => {
          console.error(error);
        })
  }, [connection, programSelected.pubkey]);

  useEffect(() => {
    if (!connection || !programSignatures) { return; }

    connection.getParsedTransactions(programSignatures)
        .then(transactions => {
          setProgramTransactions(transactions);
          consoleOut("program transactions", transactions, 'blue');
        })
        .catch(error => console.error(error))
        .finally(() => setLoadingTxs(false));
  }, [connection, programSignatures]);

  const renderTransactions = (
    <>
      <div className="item-list-header compact mt-2 mr-1">
        <Row gutter={[8, 8]} className="d-flex header-row pb-2">
          <Col span={14}  className="std-table-cell pr-1">Signatures</Col>
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
        publicKey: publicKey as PublicKey,
        signAllTransactions: async (txs: any) => txs,
        signTransaction: async (tx: any) => tx,
      };

      const provider = new AnchorProvider(connection, anchorWallet, opts);

      return provider
    };

    const provider = createAnchorProvider();

    return await Program.fetchIdl(programSelected.pubkey, provider);

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
      name: "Transactions",
      render: renderTransactions
    }, 
    {
      name: "Anchor IDL",
      render: renderIdlTree()
    }
  ];

  return (
    <>
      <div className="program-details-container">
        <Row gutter={[8, 8]} className="program-details-resume">
          <div onClick={hideProgramDetailsHandler} className="back-button icon-button-container">
            <IconArrowBack className="mean-svg-icons" />
            <span>Back</span>
          </div>
        </Row>
        <Row gutter={[8, 8]} className="safe-info-container">
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
        <Row gutter={[8, 8]} className="safe-btns-container mt-2 mb-1">
          <Col xs={20} sm={18} md={20} lg={18} className="btn-group">
            <Button
              type="ghost"
              size="small"
              className="thin-stroke"
              disabled={isTxInProgress()}
              onClick={showUpgradeProgramModal}>
                <div className="btn-content">
                  Upgrade / Deployment
                </div>
            </Button>
            <Button
              type="ghost"
              size="small"
              className="thin-stroke"
              disabled={isTxInProgress()}
              onClick={showSetProgramAuthModal}>
                <div className="btn-content">
                  Set Authority
                </div>
            </Button>
          </Col>
        </Row>
        <div className="safe-tabs-container">
          <TabsMean
            tabs={tabs}
            headerClassName="safe-tabs-header-container"
            bodyClassName="safe-tabs-content-container"
          />
        </div>
      </div>

      {isUpgradeProgramModalVisible && (
        <MultisigUpgradeProgramModal
          isVisible={isUpgradeProgramModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          handleOk={onAcceptUpgradeProgram}
          handleClose={() => setIsUpgradeProgramModalVisible(false)}
          programId={selectedProgram?.pubkey.toBase58()}
          isBusy={isBusy}
        />
      )}

      {isSetProgramAuthModalVisible && (
        <MultisigSetProgramAuthModal
          isVisible={isSetProgramAuthModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          handleOk={onAcceptSetProgramAuth}
          handleClose={() => setIsSetProgramAuthModalVisible(false)}
          programId={selectedProgram?.pubkey.toBase58()}
          isBusy={isBusy}
        />
      )}
    </>
  )
};