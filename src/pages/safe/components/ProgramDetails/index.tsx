import './style.scss';
import { DEFAULT_EXPIRATION_TIME_SECONDS, MeanMultisig, MEAN_MULTISIG_PROGRAM } from "@mean-dao/mean-multisig-sdk";
import { TransactionFees } from "@mean-dao/msp";
import { Connection, LAMPORTS_PER_SOL, PublicKey, SYSVAR_CLOCK_PUBKEY, SYSVAR_RENT_PUBKEY, Transaction } from "@solana/web3.js";
import { Button, Col, Row } from "antd";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MultisigSetProgramAuthModal } from "../../../../components/MultisigSetProgramAuthModal";
import { MultisigUpgradeIDLModal } from "../../../../components/MultisigUpgradeIDL";
import { MultisigUpgradeProgramModal } from "../../../../components/MultisigUpgradeProgramModal";
import { openNotification } from "../../../../components/Notifications";
import { NO_FEES, SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from "../../../../constants";
import { useNativeAccount } from "../../../../contexts/accounts";
import { AppStateContext } from "../../../../contexts/appstate";
import { getSolanaExplorerClusterParam, useConnectionConfig } from "../../../../contexts/connection";
import { TxConfirmationContext } from "../../../../contexts/transaction-status";
import { useWallet } from "../../../../contexts/wallet";
import { IconArrowBack, IconLink } from "../../../../Icons";
import { OperationType, TransactionStatus } from "../../../../models/enums";
import { NATIVE_SOL_MINT } from "../../../../utils/ids";
import { consoleOut, copyText, getTransactionStatusForLogs } from "../../../../utils/ui";
import { getTokenAmountAndSymbolByTokenAddress, getTxIxResume, shortenAddress } from "../../../../utils/utils";
import { ProgramAccounts } from "../../../../utils/accounts";
import { customLogger } from "../../../..";
import { encodeInstruction } from "../../../../models/idl";

export const ProgramDetailsView = (props: {
  isProgramDetails: boolean;
  onDataToProgramView: any;
  programSelected: any;
  selectedMultisig?: any;
}) => {
  const { t } = useTranslation('common');
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

  // When back button is clicked, goes to Safe Info
  const hideProgramDetailsHandler = () => {
    // Sends the value to the parent component "SafeView"
    onDataToProgramView();
  };

  // Copy address to clipboard
  const copyAddressToClipboard = useCallback((address: any) => {
    if (copyText(address.toString())) {
      openNotification({
        description: t('notifications.account-address-copied-message'),
        type: "info"
      });
    } else {
      openNotification({
        description: t('notifications.account-address-not-copied-message'),
        type: "error"
      });
    }
  },[t]);

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
            customLogger.logError('Upgrade Program transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Upgrade Program transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Upgrade Program transaction failed', { transcript: transactionLog });
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

  // Show upgrade IDL modal
  const [isUpgradeIDLModalVisible, setIsUpgradeIDLModalVisible] = useState(false);
  const showUpgradeIDLModal = useCallback(() => {
    setIsUpgradeIDLModalVisible(true);
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.000010,
      mspPercentFee: 0
    };
    setTransactionFees(fees);
  }, []);

  const onAcceptUpgradeIDL = (params: any) => {
    consoleOut('params', params, 'blue');
    onExecuteUpgradeIDLTx(params);
  };

  const onIDLUpgraded = useCallback(() => {
    setIsUpgradeProgramModalVisible(false);
  },[]);

  const isTxInProgress = useCallback((): boolean => {
    return isBusy || fetchTxInfoStatus === "fetching" ? true : false;
  }, [
    isBusy,
    fetchTxInfoStatus,
  ]);

  const onExecuteUpgradeIDLTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTxConfirmationContext();
    resetTransactionStatus();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.UpgradeIDL);
    setRetryOperationPayload(data);
    setIsBusy(true);

    const upgradeIDL = async (data: any) => {

      if (!multisigClient || !selectedMultisig || !publicKey) { return null; }

      const [multisigSigner] = await PublicKey.findProgramAddress(
        [selectedMultisig.id.toBuffer()],
        MEAN_MULTISIG_PROGRAM
      );

      const programAddr = new PublicKey(data.programAddress);
      const bufferAddr = new PublicKey(data.idlBufferAddress);
      const idlAddr = new PublicKey(data.programIDLAddress);
      const dataBuffer = encodeInstruction({ setBuffer: {} });
      const ixAccounts = [
        {
          pubkey: bufferAddr,
          isWritable: true,
          isSigner: false,
        },
        { pubkey: idlAddr, isWritable: true, isSigner: false },
        { pubkey: multisigSigner, isWritable: true, isSigner: false },
      ];

      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
        publicKey,
        "Upgrade Program IDL",
        "", // description
        new Date(expirationTime * 1_000),
        OperationType.UpgradeIDL,
        selectedMultisig.id,
        programAddr,
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
          idlBufferAddress: data.idlBufferAddress
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
          customLogger.logWarning('Upgrade IDL transaction failed', { transcript: transactionLog });
          return false;
        }

        return await upgradeIDL(data)
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
            customLogger.logError('Upgrade IDL transaction failed', { transcript: transactionLog });
            return false;
          });

      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Upgrade IDL transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Upgrade IDL transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Upgrade IDL transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Upgrade IDL transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Upgrade IDL transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Upgrade IDL transaction failed', { transcript: transactionLog });
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
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.UpgradeIDL);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            onIDLUpgraded();
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
    onIDLUpgraded, 
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
            customLogger.logError('Set program authority transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Set program authority transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Set program authority transaction failed', { transcript: transactionLog });
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
  const programAddress = shortenAddress(programSelected.pubkey.toBase58(), 4);

  // Deposit Address
  const renderDepositAddress = (
    <div className="d-flex align-items-start">
      <div onClick={() => copyAddressToClipboard(selectedMultisig.authority)} className="simplelink underline-on-hover">{shortenAddress(selectedMultisig.authority.toBase58(), 4)}</div>
      <span className="icon-button-container">
        <a
          target="_blank"
          rel="noopener noreferrer"
          href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${selectedMultisig.authority.toBase58()}${getSolanaExplorerClusterParam()}`}>
          <IconLink className="mean-svg-icons" />
        </a>
      </span>
    </div>
  );

  const infoProgramData = [
    {
      name: "Program Address",
      value: programAddress ? programAddress : "--"
    },
    {
      name: "Deposit address",
      value: renderDepositAddress ? renderDepositAddress : "--"
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
        <Row gutter={[8, 8]} className="safe-btns-container mb-1">
          <Col xs={20} sm={18} md={20} lg={18} className="btn-group">
            <Button
              type="ghost"
              size="small"
              className="thin-stroke"
              disabled={isTxInProgress()}
              onClick={showUpgradeProgramModal}>
                <div className="btn-content">
                  {/* <IconShowAll className="mean-svg-icons" /> */}
                  Upgrade Program
                </div>
            </Button>
            <Button
              type="ghost"
              size="small"
              className="thin-stroke"
              disabled={isTxInProgress()}
              onClick={showUpgradeIDLModal}>
                <div className="btn-content">
                  {/* <IconAdd className="mean-svg-icons" /> */}
                  Upgrade IDL
                </div>
            </Button>
            <Button
              type="ghost"
              size="small"
              className="thin-stroke"
              disabled={isTxInProgress()}
              onClick={showSetProgramAuthModal}>
                <div className="btn-content">
                  {/* <IconAdd className="mean-svg-icons" /> */}
                  Set Program Auth
                </div>
            </Button>
          </Col>
        </Row>
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

      {isUpgradeIDLModalVisible && (
        <MultisigUpgradeIDLModal
          isVisible={isUpgradeIDLModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          handleOk={onAcceptUpgradeIDL}
          handleClose={() => setIsUpgradeIDLModalVisible(false)}
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