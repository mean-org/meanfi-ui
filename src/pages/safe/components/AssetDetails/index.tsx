import './style.scss';
import { DEFAULT_EXPIRATION_TIME_SECONDS, getMultisigTransactionSummary, MeanMultisig, MultisigInfo, MultisigTransaction, MultisigTransactionStatus, MultisigTransactionSummary } from "@mean-dao/mean-multisig-sdk";
import { TransactionFees } from "@mean-dao/msp";
import { Connection, LAMPORTS_PER_SOL, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { Button, Col, Divider, Dropdown, Menu, Row } from "antd";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { NO_FEES, SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from "../../../../constants";
import { useNativeAccount } from "../../../../contexts/accounts";
import { AppStateContext, TransactionStatusInfo } from "../../../../contexts/appstate";
import { getSolanaExplorerClusterParam, useConnectionConfig } from "../../../../contexts/connection";
import { TxConfirmationContext } from "../../../../contexts/transaction-status";
import { useWallet } from "../../../../contexts/wallet";
import { IconArrowBack, IconEllipsisVertical, IconTrash } from "../../../../Icons";
import { OperationType, TransactionStatus } from "../../../../models/enums";
import { NATIVE_SOL_MINT } from "../../../../utils/ids";
import { consoleOut, getShortDate, getTransactionStatusForLogs } from "../../../../utils/ui";
import { formatThousands, getTokenAmountAndSymbolByTokenAddress, getTxIxResume, makeDecimal, shortenAddress } from "../../../../utils/utils";
import { customLogger } from "../../../..";
import { CopyExtLinkGroup } from '../../../../components/CopyExtLinkGroup';
import { openNotification } from '../../../../components/Notifications';
import { useLocation, useNavigate } from 'react-router-dom';
import { AccountLayout, ASSOCIATED_TOKEN_PROGRAM_ID, MintLayout, Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { MultisigVaultDeleteModal } from '../../../../components/MultisigVaultDeleteModal';
import { MultisigVault } from '../../../../models/multisig';
import { ProposalSummaryModal } from '../../../../components/ProposalSummaryModal';
import { MultisigVaultTransferAuthorityModal } from '../../../../components/MultisigVaultTransferAuthorityModal';
import { BN } from 'bn.js';
import { MultisigTransferTokensModal } from '../../../../components/MultisigTransferTokensModal';
import { Identicon } from '../../../../components/Identicon';
import { getOperationName } from '../../../../utils/multisig-helpers';
import useWindowSize from '../../../../hooks/useWindowResize';

export const AssetDetailsView = (props: {
  isAssetDetails: boolean;
  onDataToAssetView: any;
  assetSelected: any;
  selectedMultisig?: any;
  multisigVaults?: any;
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { width } = useWindowSize();
  const { account } = useNativeAccount();
  const { t } = useTranslation('common');
  const connectionConfig = useConnectionConfig();
  const { publicKey, wallet, connected } = useWallet();
  const {
    tokenList,
    transactionStatus,
    refreshTokenBalance,
    setTransactionStatus,
    previousWalletConnectState,
  } = useContext(AppStateContext);
  const {
    fetchTxInfoStatus,
    lastSentTxSignature,
    lastSentTxOperationType,
    startFetchTxSignatureInfo,
    clearTxConfirmationContext,
  } = useContext(TxConfirmationContext);

  const { isAssetDetails, onDataToAssetView, assetSelected, selectedMultisig, multisigVaults } = props;

  const [transactionFees, setTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [/*ongoingOperation*/, setOngoingOperation] = useState<OperationType | undefined>(undefined);
  const [/*retryOperationPayload*/, setRetryOperationPayload] = useState<any>(undefined);
  const [multisigTransactionSummary, setMultisigTransactionSummary] = useState<MultisigTransactionSummary | undefined>(undefined);
  const [highlightedMultisigTx, sethHighlightedMultisigTx] = useState<MultisigTransaction | undefined>();
  const [nativeBalance, setNativeBalance] = useState(0);
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [minRequiredBalance, /*setMinRequiredBalance*/] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [multisigAccounts, setMultisigAccounts] = useState<(MultisigInfo)[]>([]);
  const [multisigPendingTxs, setMultisigPendingTxs] = useState<MultisigTransaction[]>([]);
  const [loadingMultisigTxs, setLoadingMultisigTxs] = useState(true);
  const [multisigAddress, setMultisigAddress] = useState('');
  const [loadingMultisigAccounts, setLoadingMultisigAccounts] = useState(true);

  // When back button is clicked, goes to Safe Info
  const hideAssetDetailsHandler = () => {
    // Sends the value to the parent component "SafeView"
    onDataToAssetView();
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

  // Parse query params
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('multisig')) {
      const msAddress = params.get('multisig');
      setMultisigAddress(msAddress || '');
      consoleOut('multisigAddress:', msAddress, 'blue');
    }
  }, [location]);

  const resetTransactionStatus = useCallback(() => {

    setIsBusy(false);
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });

  }, [
    setTransactionStatus
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

  const isTxInProgress = useCallback((): boolean => {
    return isBusy || fetchTxInfoStatus === "fetching" ? true : false;
  }, [
    isBusy,
    fetchTxInfoStatus,
  ]);

  const isUiBusy = useCallback((): boolean => {
    return isBusy || fetchTxInfoStatus === "fetching" || loadingMultisigTxs
            ? true
            : false;
  }, [
    isBusy,
    fetchTxInfoStatus,
    loadingMultisigTxs
  ]);

  const getOperationProgram = useCallback((op: OperationType) => {

    if (
      op === OperationType.CreateMint ||
      op === OperationType.MintTokens || 
      op === OperationType.TransferTokens || 
      op === OperationType.SetAssetAuthority
    ) {
      return "SPL Token";
    } else if (op === OperationType.UpgradeProgram || op === OperationType.SetMultisigAuthority) {
      return "BPF Upgradable Loader";
    } else if (op === OperationType.UpgradeIDL) {
      return "Serum IDL";
    } else if (
      op === OperationType.TreasuryCreate || 
      op === OperationType.TreasuryClose || 
      op === OperationType.TreasuryAddFunds ||
      op === OperationType.TreasuryRefreshBalance || 
      op === OperationType.StreamCreate ||
      op === OperationType.StreamPause ||
      op === OperationType.StreamResume ||
      op === OperationType.StreamClose ||
      op === OperationType.StreamAddFunds
    ) {
      return "Mean MSP";
    } else {
      return "Mean Multisig";
    }

  },[]);

  const isCanvasTight = useCallback(() => {
    return width < 576 || (width >= 768 && width < 960);
  }, [width]);

  const getTransactionStatusAction = useCallback((mtx: MultisigTransaction) => {

    if (mtx.status === MultisigTransactionStatus.Pending) {
      return t("multisig.multisig-transactions.tx-pending-approval");
    } 
    
    if (mtx.status === MultisigTransactionStatus.Approved) {
      return t("multisig.multisig-transactions.tx-pending-execution");
    }

    if (mtx.status === MultisigTransactionStatus.Executed) {
      return t("multisig.multisig-transactions.tx-completed");
    }
    
    if (mtx.status === MultisigTransactionStatus.Voided) {
      return t("multisig.multisig-transactions.tx-voided");
    }

    if (mtx.status === MultisigTransactionStatus.Expired) {
      return "Expired";
    }

    return t("multisig.multisig-transactions.tx-rejected");

  },[t]);

  const getTransactionUserStatusAction = useCallback((mtx: MultisigTransaction, longStatus = false) => {

    if (mtx.executedOn) {
      if (mtx.didSigned === true) {
        return t("multisig.multisig-transactions.signed");
      } else {
        return t("multisig.multisig-transactions.not-signed");
      }
    } else if (mtx.didSigned === undefined) {
      return longStatus ? t("multisig.multisig-transactions.rejected-tx") : t("multisig.multisig-transactions.rejected");
    } else if (mtx.didSigned === false) {
      return !longStatus
        ? t("multisig.multisig-transactions.not-signed")
        : mtx.status === MultisigTransactionStatus.Approved
          ? t("multisig.multisig-transactions.not-sign-tx")
          : t("multisig.multisig-transactions.not-signed-tx");
    } else {
      return longStatus ? "You have signed this transaction" : t("multisig.multisig-transactions.signed");
    }

  },[t]);

  const getTransactionStatusClass = useCallback((mtx: MultisigTransaction) => {
    
    if(
      mtx.status === MultisigTransactionStatus.Pending || 
      mtx.status === MultisigTransactionStatus.Approved || 
      mtx.status === MultisigTransactionStatus.Voided ||
      mtx.status === MultisigTransactionStatus.Expired
    ) {
      return "error";
    }

    return "darken";

  },[]);

  //////////////////
  //    MODALS    //
  //////////////////

  const onAfterEveryModalClose = useCallback(() => {
    consoleOut('onAfterEveryModalClose called!', '', 'crimson');
    resetTransactionStatus();
  },[resetTransactionStatus]);

  // Transfer token modal
  const [isTransferTokenModalVisible, setIsTransferTokenModalVisible] = useState(false);
  const showTransferTokenModal = useCallback(() => {
    setIsTransferTokenModalVisible(true);
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.000010,
      mspPercentFee: 0
    };
    resetTransactionStatus();
    setTransactionFees(fees);
  }, [resetTransactionStatus]);

  const onAcceptTransferToken = (params: any) => {
    consoleOut('params', params, 'blue');
    onExecuteTransferTokensTx(params);
  };

  const onTokensTransfered = useCallback(() => {
    resetTransactionStatus();
  },[
    resetTransactionStatus
  ]);

  const onExecuteTransferTokensTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTxConfirmationContext();
    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const transferTokens = async (data: any) => {

      if (!publicKey || !selectedMultisig || !multisigClient) { 
        throw Error("Invalid transaction data");
      }

      const fromAddress = new PublicKey(data.from);
      const fromAccountInfo = await connection.getAccountInfo(fromAddress);
      
      if (!fromAccountInfo) { 
        throw Error("Invalid from token account");
      }

      const fromAccount = AccountLayout.decode(Buffer.from(fromAccountInfo.data));
      const fromMintAddress = new PublicKey(fromAccount.mint);
      const mintInfo = await connection.getAccountInfo(fromMintAddress);

      if (!mintInfo) { 
        throw Error("Invalid token mint account");
      }

      const mint = MintLayout.decode(Buffer.from(mintInfo.data));
      let toAddress = new PublicKey(data.to);
      const toAccountInfo = await connection.getAccountInfo(toAddress);
      const ixs: TransactionInstruction[] = [];

      if (!toAccountInfo || !toAccountInfo.owner.equals(TOKEN_PROGRAM_ID)) {

        const toAccountATA = await Token.getAssociatedTokenAddress(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          fromMintAddress,
          toAddress,
          true
        );

        const toAccountATAInfo = await connection.getAccountInfo(toAccountATA);

        if (!toAccountATAInfo) {
          ixs.push(
            Token.createAssociatedTokenAccountInstruction(
              ASSOCIATED_TOKEN_PROGRAM_ID,
              TOKEN_PROGRAM_ID,
              fromMintAddress,
              toAccountATA,
              toAddress,
              publicKey
            )
          );
        }

        toAddress = toAccountATA;
      }

      const transferIx = Token.createTransferInstruction(
        TOKEN_PROGRAM_ID,
        fromAddress,
        toAddress,
        selectedMultisig.authority,
        [],
        new BN(data.amount * 10 ** mint.decimals).toNumber()
      );

      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
        publicKey,
        "Transfer Asset Funds",
        "", // description
        new Date(expirationTime * 1_000),
        OperationType.TransferTokens,
        selectedMultisig.id,
        transferIx.programId,
        transferIx.keys,
        transferIx.data,
        ixs
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
          from: data.from,
          to: data.to,
          amount: data.amount
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
          customLogger.logWarning('Transfer tokens transaction failed', { transcript: transactionLog });
          return false;
        }

        return await transferTokens(data)
          .then(value => {
            if (!value) { return false; }
            consoleOut('transferTokens returned transaction:', value);
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
            console.error('transferTokens error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`
            });
            customLogger.logError('Transfer tokens transaction failed', { transcript: transactionLog });
            return false;
          });
          
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Transfer tokens transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Transfer tokens transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Transfer tokens transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Transfer tokens transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Transfer tokens transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Transfer tokens transaction failed', { transcript: transactionLog });
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
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.TransferTokens);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            onTokensTransfered();
            setIsTransferTokenModalVisible(false);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    wallet,
    publicKey,
    connection,
    nativeBalance,
    selectedMultisig,
    transactionCancelled,
    multisigClient,
    transactionFees.mspFlatFee,
    transactionFees.blockchainFee,
    transactionStatus.currentOperation,
    onTokensTransfered,
    setTransactionStatus,
    startFetchTxSignatureInfo,
    resetTransactionStatus,
    clearTxConfirmationContext,
  ]);

  // Transfer asset authority modal
  const [isTransferVaultAuthorityModalVisible, setIsTransferVaultAuthorityModalVisible] = useState(false);
  const showTransferVaultAuthorityModal = useCallback(() => {
    setIsTransferVaultAuthorityModalVisible(true);
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.000010,
      mspPercentFee: 0
    };
    setTransactionFees(fees);
  }, []);

  const onAcceptTransferVaultAuthority = (selectedAuthority: string) => {
    consoleOut('selectedAuthority', selectedAuthority, 'blue');
    onExecuteTransferOwnershipTx (selectedAuthority);
  };

  const onVaultAuthorityTransfered = useCallback(() => {
    // refreshVaults();
    resetTransactionStatus();
  },[
    resetTransactionStatus
  ]);

  const onExecuteTransferOwnershipTx  = useCallback(async (selectedAuthority: string) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTxConfirmationContext();
    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createTransferOwnershipTx = async (selectedAuthority: string) => {

      if (!publicKey || !assetSelected || !selectedMultisig || !multisigClient) { 
        return null;
      }

      const setAuthIx = Token.createSetAuthorityInstruction(
        TOKEN_PROGRAM_ID,
        assetSelected.address,
        new PublicKey(selectedAuthority),
        'AccountOwner',
        selectedMultisig.authority,
        []
      );

      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
        publicKey,
        "Change Asset Authority",
        "", // description
        new Date(expirationTime * 1_000),
        OperationType.SetAssetAuthority,
        selectedMultisig.id,
        setAuthIx.programId,
        setAuthIx.keys,
        setAuthIx.data
      );

      return tx;
    }

    const createTx = async (): Promise<boolean> => {

      if (!publicKey || !selectedAuthority) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Transfer Vault Authority transaction failed', { transcript: transactionLog });
        return false;
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      // Create transaction payload for debugging
      const payload = {
        selectedAuthority: selectedAuthority,
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
        customLogger.logWarning('Transfer tokens transaction failed', { transcript: transactionLog });
        return false;
      }

      const result =  await createTransferOwnershipTx(selectedAuthority)
        .then(value => {
          if (!value) { return false; }
          consoleOut('createTransferVaultAuthorityTx returned transaction:', value);
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
          console.error('createTransferVaultAuthorityTx error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Transfer Vault Authority transaction failed', { transcript: transactionLog });
          return false;
        });

      return result;
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
        customLogger.logError('Transfer Vault Authority transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Transfer Vault Authority transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Transfer Vault Authority transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Transfer Vault Authority transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Transfer Vault Authority transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet) {
      const created = await createTx();
      consoleOut('created:', created);
      if (created && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('signed:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.SetAssetAuthority);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            onVaultAuthorityTransfered();
            setIsTransferVaultAuthorityModalVisible(false);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    clearTxConfirmationContext,
    resetTransactionStatus, 
    wallet, 
    publicKey, 
    assetSelected, 
    selectedMultisig, 
    multisigClient, 
    connection, 
    setTransactionStatus, 
    transactionFees.blockchainFee, 
    transactionFees.mspFlatFee, 
    nativeBalance, 
    transactionStatus.currentOperation, 
    transactionCancelled, 
    startFetchTxSignatureInfo, 
    onVaultAuthorityTransfered
  ]);

  // Delete asset modal
  const canDeleteVault = useCallback((): boolean => {
    
    const isTxPendingApproval = (tx: MultisigTransaction) => {
      if (tx) {
        if (tx.status === MultisigTransactionStatus.Pending) {
          return true;
        }
      }
      return false;
    };

    const isTxPendingExecution = (tx: MultisigTransaction) => {
      if (tx) {
        if (tx.status === MultisigTransactionStatus.Approved) {
          return true;
        }
      }
      return false;
    };

    if (assetSelected && (!multisigPendingTxs || multisigPendingTxs.length === 0)) {
      return true;
    }
    const found = multisigPendingTxs.find(tx => tx.operation === OperationType.DeleteAsset && (isTxPendingApproval(tx) || isTxPendingExecution(tx)));

    return found ? false : true;

  }, [assetSelected, multisigPendingTxs]);

  const [isDeleteVaultModalVisible, setIsDeleteVaultModalVisible] = useState(false);
  const showDeleteVaultModal = useCallback(() => {
    setIsDeleteVaultModalVisible(true);
  }, []);

  const onAcceptDeleteVault = () => {
    onExecuteCloseAssetTx();
  };

  const onVaultDeleted = useCallback(() => {
    setIsDeleteVaultModalVisible(false);
    resetTransactionStatus();
  },[resetTransactionStatus]);

  const onExecuteCloseAssetTx = useCallback(async () => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTxConfirmationContext();
    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const closeAssetTx = async (asset: MultisigVault) => {

      if (!publicKey || !assetSelected || !selectedMultisig || !selectedMultisig.id || !multisigClient) { 
        return null;
      }

      if (!selectedMultisig.authority.equals(asset.owner)) {
        throw Error("Invalid asset owner");
      }

      const closeIx = Token.createCloseAccountInstruction(
        TOKEN_PROGRAM_ID,
        asset.address,
        publicKey,
        asset.owner,
        []
      );

      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
        publicKey,
        "Close Asset",
        "", // description
        new Date(expirationTime * 1_000),
        OperationType.DeleteAsset,
        selectedMultisig.id,
        closeIx.programId,
        closeIx.keys,
        closeIx.data
      );

      return tx;
    }

    const createTx = async (): Promise<boolean> => {

      if (!publicKey || !assetSelected) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Delete Vault transaction failed', { transcript: transactionLog });
        return false;
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      // Create transaction payload for debugging
      const payload = {
        asset: assetSelected.address.toBase58(),
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
        customLogger.logWarning('Transfer tokens transaction failed', { transcript: transactionLog });
        return false;
      }

      const result =  await closeAssetTx(assetSelected)
        .then((value: any) => {
          if (!value) { return false; }
          consoleOut('deleteVaultTx returned transaction:', value);
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
          console.error('deleteVaultTx error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Delete Vault transaction failed', { transcript: transactionLog });
          return false;
        });

      return result;
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
        customLogger.logError('Delete Vault transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Delete Vault transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Delete Vault transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Delete Vault transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Delete Vault transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet) {
      const created = await createTx();
      consoleOut('created:', created);
      if (created && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('signed:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.DeleteAsset);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            onVaultDeleted();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    wallet,
    publicKey,
    connection,
    assetSelected,
    nativeBalance,
    selectedMultisig,
    transactionCancelled,
    multisigClient,
    transactionFees.mspFlatFee,
    transactionFees.blockchainFee,
    transactionStatus.currentOperation,
    clearTxConfirmationContext,
    startFetchTxSignatureInfo,
    resetTransactionStatus,
    setTransactionStatus,
    onVaultDeleted
  ]);

  // Update list of txs
  useEffect(() => {

    if (
      !connection || 
      !publicKey || 
      !multisigClient || 
      !selectedMultisig || 
      !selectedMultisig.id ||
      !assetSelected ||
      !loadingMultisigTxs
    ) { 
      return;
    }

    const timeout = setTimeout(() => {

      consoleOut('Triggering loadMultisigPendingTxs using setNeedRefreshTxs...', '', 'blue');

      multisigClient
        .getMultisigTransactions(selectedMultisig.id, publicKey)
        .then((txs: MultisigTransaction[]) => {
          consoleOut('selected multisig txs', txs, 'blue');
          const transactions: MultisigTransaction[] = [];
          for (const tx of txs) {
            if (tx.accounts.some((a: any) => a.pubkey.equals(assetSelected.address))) {
              transactions.push(tx);
            }
          }
          setMultisigPendingTxs(transactions);
        })
        .catch((err: any) => {
          console.error("Error fetching all transactions", err);
          setMultisigPendingTxs([]);
          consoleOut('multisig txs:', [], 'blue');
        })
        .finally(() => setLoadingMultisigTxs(false));
          
    });

    return () => {
      clearTimeout(timeout);
    }   

  }, [
    publicKey, 
    selectedMultisig, 
    connection, 
    multisigClient, 
    loadingMultisigTxs, 
    assetSelected
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
        // setSelectedMultisig(undefined);
        sethHighlightedMultisigTx(undefined);
        setMultisigTransactionSummary(undefined);
        setLoadingMultisigAccounts(false);
        navigate('/multisig');
      }
    }
  }, [
    connected,
    publicKey,
    previousWalletConnectState,
    navigate,
  ]);

  // Handle what to do when pending Tx confirmation reaches finality or on error
  useEffect(() => {
    if (!publicKey || fetchTxInfoStatus === "fetching") { return; }

    if (multisigAddress && lastSentTxOperationType) {
      if (fetchTxInfoStatus === "fetched") {
        clearTxConfirmationContext();
        sethHighlightedMultisigTx(undefined);
        setMultisigTransactionSummary(undefined);
        // refreshVaults();
        setLoadingMultisigTxs(true);
      } else if (fetchTxInfoStatus === "error") {
        clearTxConfirmationContext();
        openNotification({
          type: "info",
          duration: 5,
          description: (
            <>
              <span className="mr-1">
                {t('notifications.tx-not-confirmed')}
              </span>
              <div>
                <span className="mr-1">{t('notifications.check-transaction-in-explorer')}</span>
                <a className="secondary-link"
                    href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${lastSentTxSignature}${getSolanaExplorerClusterParam()}`}
                    target="_blank"
                    rel="noopener noreferrer">
                    {shortenAddress(lastSentTxSignature, 8)}
                </a>
              </div>
            </>
          )
        });
      }
    }
  }, [
    t,
    publicKey,
    multisigAddress,
    fetchTxInfoStatus,
    lastSentTxSignature,
    clearTxConfirmationContext,
    // refreshVaults,
    lastSentTxOperationType
  ]);

  // Common Multisig Approve / Execute logic
  const onTxExecuted = useCallback(() => {

  },[]);

  const onExecuteApproveTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTxConfirmationContext();
    resetTransactionStatus();
    setTransactionCancelled(false);
    setRetryOperationPayload(data);
    setIsBusy(true);

    const approveTx = async (data: any) => {

      if (!selectedMultisig || !multisigClient || !publicKey) { return null; }

      const tx = await multisigClient.approveTransaction(publicKey, data.transaction.id);
  
      return tx;
    };

    const createTx = async (): Promise<boolean> => {

      if (publicKey && data) {

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
          customLogger.logWarning('Multisig Approve transaction failed', { transcript: transactionLog });
          return false;
        }

        return await approveTx(payload)
          .then(value => {
            if (!value) { return false; }
            consoleOut('approveTx returned transaction:', value);
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
            customLogger.logError('Multisig Approve transaction failed', { transcript: transactionLog });
            return false;
          });

      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Multisig Approve transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Multisig Approve transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Multisig Approve transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Multisig Approve transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Multisig Approve transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Multisig Approve transaction failed', { transcript: transactionLog });
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
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.ApproveTransaction);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            // TODO: Translate
            openNotification({
              description: 'Your signature for the Multisig transaction was successfully recorded.',
              type: "success"
            });
            setOngoingOperation(undefined);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    wallet,
    publicKey,
    connection,
    nativeBalance,
    selectedMultisig,
    transactionCancelled,
    multisigClient,
    transactionFees.mspFlatFee,
    transactionFees.blockchainFee,
    transactionStatus.currentOperation,
    clearTxConfirmationContext,
    startFetchTxSignatureInfo,
    resetTransactionStatus,
    setTransactionStatus
  ]);

  const onExecuteFinishTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTxConfirmationContext();
    resetTransactionStatus();
    setTransactionCancelled(false);
    setRetryOperationPayload(data);
    setIsBusy(true);

    const finishTx = async (data: any) => {

      if (!data.transaction || !publicKey || !multisigClient) { return null; }

      const tx = await multisigClient.executeTransaction(publicKey, data.transaction.id);
  
      return tx;
    };

    const createTx = async (): Promise<boolean> => {

      if (publicKey && data) {
        consoleOut("Start transaction for create stream", '', 'blue');
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
          customLogger.logWarning('Finish Approoved transaction failed', { transcript: transactionLog });
          return false;
        }

        return await finishTx(payload)
          .then(value => {
            if (!value) { return false; }
            consoleOut('multisig returned transaction:', value);
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
            console.error('create stream error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`
            });
            customLogger.logError('Finish Approoved transaction failed', { transcript: transactionLog });
            return false;
          });

      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Finish Approoved transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Finish Approoved transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Finish Approoved transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Finish Approoved transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Finish Approoved transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Finish Approoved transaction failed', { transcript: transactionLog });
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
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.ExecuteTransaction);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            onTxExecuted();
            setOngoingOperation(undefined);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    wallet,
    publicKey,
    connection,
    nativeBalance,
    transactionCancelled,
    multisigClient,
    transactionFees.mspFlatFee,
    transactionFees.blockchainFee,
    transactionStatus.currentOperation,
    clearTxConfirmationContext,
    resetTransactionStatus,
    startFetchTxSignatureInfo,
    setTransactionStatus,
    onTxExecuted,
  ]);

  const onExecuteCancelTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTxConfirmationContext();
    resetTransactionStatus();
    setTransactionCancelled(false);
    setRetryOperationPayload(data);
    setIsBusy(true);

    const cancelTx = async (data: any) => {

      if (
        !publicKey || 
        !multisigClient ||
        !selectedMultisig || 
        !selectedMultisig.id || 
        selectedMultisig.id.toBase58() !== data.transaction.multisig.toBase58() || 
        data.transaction.proposer.toBase58() !== publicKey.toBase58() ||
        data.transaction.ownerSetSeqno === selectedMultisig.ownerSetSeqno ||
        data.transaction.executedOn
      ) {
        return null;
      }

      const tx = await multisigClient.cancelTransaction(publicKey, data.transaction.id);

      return tx;
    };

    const createTx = async (): Promise<boolean> => {

      if (publicKey && data) {
        consoleOut("Start transaction for create stream", '', 'blue');
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
          customLogger.logWarning('Finish Cancel transaction failed', { transcript: transactionLog });
          return false;
        }

        return await cancelTx(payload)
          .then(value => {
            if (!value) { return false; }
            consoleOut('Returned transaction:', value);
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
            console.error('cancel tx error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`
            });
            customLogger.logError('Finish Cancel transaction failed', { transcript: transactionLog });
            return false;
          });

      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Finish Cancel transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Finish Cancel transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Finish Cancel transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Finish Cancel transaction failed', { transcript: transactionLog });
          return false;
        });
    }

    const sendTx = async (): Promise<boolean> => {

      if (!wallet) {
        console.error('Cannot send transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot send transaction! Wallet not found!'
        });
        customLogger.logError('Finish Cancel transaction failed', { transcript: transactionLog });
        return false;
      }

      const result = await connection
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
        .catch((error: any) => {
          console.error(error);
          const txStatus = {
            customError: undefined,
            lastOperation: TransactionStatus.SendTransaction,
            currentOperation: TransactionStatus.SendTransactionFailure
          } as TransactionStatusInfo;
          if (error.toString().indexOf('0x1794') !== -1) {
            const treasury = data.transaction.operation === OperationType.StreamClose
              ? data.transaction.accounts[5].pubkey.toBase58()
              : data.transaction.accounts[3].pubkey.toBase58();
            txStatus.customError = {
              message: 'Your transaction failed to submit due to there not being enough SOL to cover the fees. Please fund the treasury with at least 0.00002 SOL and then retry this operation.\n\nTreasury ID: ',
              data: treasury
            };
          }
          setTransactionStatus(txStatus);
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
            result: { error, encodedTx }
          });
          customLogger.logError('Finish Cancel transaction failed', { transcript: transactionLog });
          return false;
        });

      return result;
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
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.CancelTransaction);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            onTxExecuted();
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
    onTxExecuted, 
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
  
  // Transaction confirm and execution modal launched from each Tx row
  const [isMultisigActionTransactionModalVisible, setMultisigActionTransactionModalVisible] = useState(false);
  const showMultisigActionTransactionModal = useCallback((tx: MultisigTransaction) => {
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.000010,
      mspPercentFee: 0
    };
    setTransactionFees(fees);
    sethHighlightedMultisigTx(tx);
    const summary = getMultisigTransactionSummary(tx);
    consoleOut('summary', summary, 'blue');
    setMultisigTransactionSummary(summary);
    setMultisigActionTransactionModalVisible(true);
  }, []);

  const onAcceptMultisigActionModal = (item: MultisigTransaction) => {
    consoleOut('onAcceptMultisigActionModal:', item, 'blue');
    if (item.status === MultisigTransactionStatus.Pending) {
      onExecuteApproveTx({ transaction: item });
    } else if (item.status === MultisigTransactionStatus.Approved) {
      onExecuteFinishTx({ transaction: item })
    } else if (item.status === MultisigTransactionStatus.Voided) {
      onExecuteCancelTx({ transaction: item })
    }
  };

  const onCloseMultisigActionModal = () => {
    setMultisigActionTransactionModalVisible(false);
    sethHighlightedMultisigTx(undefined);
    resetTransactionStatus();
  };

  // Asset Txs
  const renderMultisigPendingTxs = () => {
    if (!selectedMultisig) {
      return null;
    } else if (selectedMultisig && loadingMultisigTxs) {
      return (
        <div className="mb-2">{t('multisig.multisig-transactions.loading-transactions')}</div>
      );
    } else if (selectedMultisig && !loadingMultisigTxs && multisigPendingTxs.length === 0) {
      return (
        <div className="mb-2">{t('multisig.multisig-transactions.no-transactions-multisig-asset')}</div>
      );
    }

    return (
      <>
        <div className="item-list-header compact">
          <div className="header-row" style={{ paddingBottom: 5 }}>
            <div className="std-table-cell responsive-cell">{t('multisig.multisig-transactions.column-operation')}</div>
            <div className="std-table-cell responsive-cell">{t('multisig.multisig-transactions.column-program-id')}</div>
            <div className="std-table-cell fixed-width-110">{t('multisig.multisig-transactions.column-created-on')}</div>
            <div className="std-table-cell fixed-width-90">{t('multisig.multisig-transactions.column-my-status')}</div>
            <div className="std-table-cell fixed-width-34">{t('multisig.multisig-transactions.column-current-signatures')}</div>
            <div className="std-table-cell text-center fixed-width-120">{t('multisig.multisig-transactions.column-pending-signatures')}</div>
          </div>
        </div>
        <div className="activity-list-data-wrapper vertical-scroll">
          <div className="activity-list h-100">
            <div className="item-list-body compact">
              {multisigPendingTxs.map(item => {
                return (
                  <div
                    key={item.id.toBase58()}
                    style={{padding: '3px 0px'}}
                    className={`item-list-row ${
                      highlightedMultisigTx && highlightedMultisigTx.id.equals(item.id)
                        ? isUiBusy() ? 'selected no-pointer click-disabled' : 'selected'
                        : isUiBusy() ? 'no-pointer click-disabled' : 'simplelink'}`
                    }
                    onClick={() => showMultisigActionTransactionModal(item)}>
                    <div className="std-table-cell responsive-cell">
                      <span className="align-middle">{getOperationName(item.operation)}</span>
                    </div>
                    <div className="std-table-cell responsive-cell">
                      <span className="align-middle">{getOperationProgram(item.operation)}</span>
                    </div>
                    <div className="std-table-cell fixed-width-110">
                      <span className="align-middle">{getShortDate(item.createdOn.toString(), isCanvasTight() ? false : true)}</span>
                    </div>
                    <div className="std-table-cell fixed-width-90">
                      <span className="align-middle">{getTransactionUserStatusAction(item)}</span>
                    </div>
                    <div className="std-table-cell fixed-width-34">
                      <span className="align-middle">{`${item.signers.filter(s => s === true).length}/${selectedMultisig.threshold}`}</span>
                    </div>
                    <div className="std-table-cell text-center fixed-width-120">
                      <span className={`badge small status-badge ${getTransactionStatusClass(item)}`} style={{padding: '3px 5px'}}>{getTransactionStatusAction(item)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </>
    );
  }

  // Asset balance
  const getTokenIconAndAmount = (tokenAddress: string, amount: any, decimals: number) => {
    const token = tokenList.find(t => t.address === tokenAddress);

    const isSol = assetSelected.mint.toBase58() === NATIVE_SOL_MINT.toBase58() ? true : false;

    if (!token) {
      return (
        isSol ?  (
          <>
            <span className="info-icon token-icon mr-1">
              <img alt="Sol" width={30} height={30} src="https://www.gate.io/images/coin_icon/64/sol.png" style={{backgroundColor: "#000", borderRadius: "1em"}} />
            </span>
            <span className="info-data">
              {formatThousands(makeDecimal(amount, decimals), decimals)}
            </span>
          </>
        ) : (
          <>
          <span className="info-icon token-icon mr-1">
            <Identicon address={tokenAddress} style={{
              width: "35",
              height: "30",
              marginRight: "5",
              display: "inline-flex"
            }} />
          </span>
          <span className="info-data">
            {formatThousands(makeDecimal(amount, decimals), decimals)}
          </span>
        </>
        )
      )
    }

    return (
      <>
        <span className="info-icon token-icon mr-1">
          <img alt={`${token.name}`} width={26} height={26} src={token.logoURI} />
        </span>
        <span className="info-data">
          {
            formatThousands(
              makeDecimal(amount, token.decimals || decimals),
              token.decimals || decimals,
              token.decimals || decimals
            )
          }
          {' '}
          {token.symbol}
        </span>
      </>
    );
  }

  const renderAssetBalance = (
    <div className="d-flex align-items-center">
      {getTokenIconAndAmount(
        assetSelected.mint.toBase58(),
        assetSelected.amount,
        assetSelected.decimals || 6
      )}
    </div>
  );

  // Deposit Address
  const renderDepositAddress = (
    <CopyExtLinkGroup
      content={assetSelected.address.toBase58()}
      number={4}
      externalLink={true}
    />
  );

  const infoAssetData = [
    {
      name: "Balance",
      value: renderAssetBalance ? renderAssetBalance : "--"
    },
    {
      name: "Deposit address",
      value: renderDepositAddress ? renderDepositAddress : "--"
    }
  ];

  // Dropdown (three dots button)
  const menu = (
    <Menu>
      <Menu.Item key="0" onClick={showDeleteVaultModal} disabled={isTxInProgress() || !canDeleteVault()}>
        <IconTrash className="mean-svg-icons" />
        <span className="menu-item-text">Close asset</span>
      </Menu.Item>
    </Menu>
  );

  return (
    <>
      <div className="asset-details-container">
        <Row gutter={[8, 8]} className="asset-details-resume">
          <div onClick={hideAssetDetailsHandler} className="back-button icon-button-container">
            <IconArrowBack className="mean-svg-icons" />
            <span>Back</span>
          </div>
        </Row>
        <Row gutter={[8, 8]} className="safe-info-container">
          {infoAssetData.map((info, index) => (
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
              onClick={showTransferTokenModal}>
                <div className="btn-content">
                  Propose send funds
                </div>
            </Button>
            <Button
              type="ghost"
              size="small"
              className="thin-stroke"
              disabled={isTxInProgress()}
              onClick={showTransferVaultAuthorityModal}>
                <div className="btn-content">
                  Transfer ownership
                </div>
            </Button>
          </Col>
          
          <Col xs={4} sm={6} md={4} lg={6}>
            <Dropdown
              overlay={menu}
              placement="bottomRight"
              trigger={["click"]}>
              <span className="ellipsis-icon icon-button-container mr-1">
                <Button
                  type="default"
                  shape="circle"
                  size="middle"
                  icon={<IconEllipsisVertical className="mean-svg-icons"/>}
                  onClick={(e) => e.preventDefault()}
                />
              </span>
            </Dropdown>
          </Col>
        </Row>
        <Divider className="activity-divider" plain />
        <Row>
          {renderMultisigPendingTxs()}
        </Row>
      </div>

      {isTransferTokenModalVisible && (
        <MultisigTransferTokensModal
          isVisible={isTransferTokenModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          handleOk={onAcceptTransferToken}
          handleClose={() => {
            onAfterEveryModalClose();
            setIsTransferTokenModalVisible(false);
          }}
          selectedVault={assetSelected}
          isBusy={isBusy}
          assets={multisigVaults}
        />
      )}

      {isTransferVaultAuthorityModalVisible && (
        <MultisigVaultTransferAuthorityModal
          isVisible={isTransferVaultAuthorityModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          handleOk={onAcceptTransferVaultAuthority}
          handleAfterClose={onAfterEveryModalClose}
          handleClose={() => {
            onAfterEveryModalClose();
            setIsTransferVaultAuthorityModalVisible(false);
          }}
          isBusy={isBusy}
          selectedMultisig={selectedMultisig}
          multisigAccounts={multisigAccounts}
          selectedVault={assetSelected}
          assets={multisigVaults}
        />
      )}

      {isDeleteVaultModalVisible && (
        <MultisigVaultDeleteModal
          isVisible={isDeleteVaultModalVisible}
          handleOk={onAcceptDeleteVault}
          handleAfterClose={onAfterEveryModalClose}
          handleClose={() => {
            onAfterEveryModalClose();
            setIsDeleteVaultModalVisible(false);
          }}
          isBusy={isBusy}
          selectedVault={assetSelected}
        />
      )}

      {/* Transaction confirm and execution modal launched from each Tx row */}
      {(isMultisigActionTransactionModalVisible && highlightedMultisigTx && selectedMultisig) && (
        <ProposalSummaryModal
          isVisible={isMultisigActionTransactionModalVisible}
          handleOk={onAcceptMultisigActionModal}
          handleClose={onCloseMultisigActionModal}
          isBusy={isBusy}
          nativeBalance={nativeBalance}
          highlightedMultisigTx={highlightedMultisigTx}
          multisigTransactionSummary={multisigTransactionSummary}
          selectedMultisig={selectedMultisig}
          minRequiredBalance={minRequiredBalance}
        />
      )}
    </>
  )
};