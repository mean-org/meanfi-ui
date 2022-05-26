import './style.scss';
// import { IconApprove, IconArrowForward, IconCheckCircle, IconCreated, IconCross, IconMinus } from "../../../../Icons"
import { formatThousands, getTokenAmountAndSymbolByTokenAddress, getTokenByMintAddress, getTxIxResume, makeDecimal, shortenAddress } from "../../../../utils/utils";
// import { Button, Col, Row, Spin } from "antd"
import { SafeInfo } from "../UI/SafeInfo";
import { DEFAULT_EXPIRATION_TIME_SECONDS, getMultisigTransactionSummary, MeanMultisig, MultisigInfo, MultisigTransaction, MultisigTransactionStatus, MultisigTransactionSummary } from '@mean-dao/mean-multisig-sdk';
import { ProgramAccounts } from '../../../../utils/accounts';
import { useCallback, useContext, useEffect, useState } from 'react';
import { Connection, LAMPORTS_PER_SOL, MemcmpFilter, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
// import { useConnectionConfig } from '../../../../contexts/connection';
import { consoleOut, getTransactionStatusForLogs } from '../../../../utils/ui';
// import { useWallet } from '../../../../contexts/wallet';
import { ResumeItem } from '../UI/ResumeItem';
// import { program } from '@project-serum/anchor/dist/cjs/spl/token';
import { FALLBACK_COIN_IMAGE, NO_FEES, SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from '../../../../constants';
// import { MultisigVault } from '../../../../models/multisig';
import { Identicon } from '../../../../components/Identicon';
// import { BN } from 'bn.js';
// import { u64 } from '@solana/spl-token';
import { MEAN_MULTISIG, NATIVE_SOL_MINT } from '../../../../utils/ids';
import { ACCOUNT_LAYOUT } from '../../../../utils/layouts';
import { AccountLayout, ASSOCIATED_TOKEN_PROGRAM_ID, MintLayout, Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { AppStateContext, TransactionStatusInfo } from '../../../../contexts/appstate';
import { BN } from 'bn.js';
import { TxConfirmationContext } from '../../../../contexts/transaction-status';
import { CopyExtLinkGroup } from '../../../../components/CopyExtLinkGroup';
import { IconArrowForward, IconEllipsisVertical, IconVerticalEllipsis } from '../../../../Icons';
import { Menu } from 'antd';
import { MultisigVaultDeleteModal } from '../../../../components/MultisigVaultDeleteModal';
import { MultisigVaultTransferAuthorityModal } from '../../../../components/MultisigVaultTransferAuthorityModal';
import { MultisigTransferTokensModal } from '../../../../components/MultisigTransferTokensModal';
import { OperationType, TransactionStatus } from '../../../../models/enums';
import { TransactionFees } from '@mean-dao/msp';
import { customLogger } from '../../../..';
import { useWallet } from '../../../../contexts/wallet';
import { MultisigVault } from '../../../../models/multisig';
import { useLocation, useNavigate } from 'react-router-dom';
import { openNotification } from '../../../../components/Notifications';
import { getSolanaExplorerClusterParam } from '../../../../contexts/connection';
import { useTranslation } from 'react-i18next';
import { useNativeAccount } from '../../../../contexts/accounts';

export const SafeMeanInfo = (props: {
  connection: Connection;
  publicKey: PublicKey | null | undefined;
  isProposalDetails: boolean;
  isProgramDetails: boolean;
  isAssetDetails: boolean;
  onDataToSafeView: any;
  onDataToProgramView: any;
  onDataToAssetView: any;
  selectedMultisig?: any;
  onEditMultisigClick: any;
  onNewCreateAssetClick: any;
  onNewProposalMultisigClick: any;
  multisigClient: MeanMultisig | null;
  selectedTab?: any;
  proposalSelected?: any;
  assetSelected?: any;
}) => {

  const { 
    tokenList,
    programs,
    setPrograms,
    multisigVaults,
    setMultisigVaults,
    transactionStatus,
    refreshTokenBalance,
    setTransactionStatus,
    previousWalletConnectState
  } = useContext(AppStateContext);
  const {
    fetchTxInfoStatus,
    lastSentTxSignature,
    lastSentTxOperationType,
    startFetchTxSignatureInfo,
    clearTxConfirmationContext,
  } = useContext(TxConfirmationContext);
  const {
    connection,
    publicKey,
    isProposalDetails, 
    isProgramDetails, 
    selectedMultisig, 
    onEditMultisigClick, 
    onNewProposalMultisigClick, 
    onNewCreateAssetClick,
    selectedTab,
    multisigClient,
    isAssetDetails,
    proposalSelected,
    onDataToSafeView,
    assetSelected
  } = props;
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('common');
  const { account } = useNativeAccount();
  const { wallet, connected } = useWallet();
  const [multisig, setMultisig] = useState<any>(selectedMultisig);
  const [solBalance, setSolBalance] = useState<number>(0);
  const [multisigTxs, setMultisigTxs] = useState<MultisigTransaction[]>([]);
  const [loadingProposals, setLoadingProposals] = useState(true);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<MultisigTransaction | undefined>();
  const [isBusy, setIsBusy] = useState(false);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [transactionFees, setTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [multisigPendingTxs, setMultisigPendingTxs] = useState<MultisigTransaction[]>([]);
  const [multisigAccounts, setMultisigAccounts] = useState<(MultisigInfo)[]>([]);
  const [loadingMultisigTxs, setLoadingMultisigTxs] = useState(true);
  const [loadingMultisigAccounts, setLoadingMultisigAccounts] = useState(true);
  const [multisigAddress, setMultisigAddress] = useState('');
  const [multisigTransactionSummary, setMultisigTransactionSummary] = useState<MultisigTransactionSummary | undefined>(undefined);
  const [highlightedMultisigTx, sethHighlightedMultisigTx] = useState<MultisigTransaction | undefined>();
  const [/*retryOperationPayload*/, setRetryOperationPayload] = useState<any>(undefined);
  const [/*ongoingOperation*/, setOngoingOperation] = useState<OperationType | undefined>(undefined);
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [assetsWithoutSol, setAssetsWithoutSol] = useState<MultisigVault[]>([]);

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

  // Parse query params
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('multisig')) {
      const msAddress = params.get('multisig');
      setMultisigAddress(msAddress || '');
      consoleOut('multisigAddress:', msAddress, 'blue');
    }
  }, [location]);

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

    //////////////////
  //    MODALS    //
  //////////////////

  const onAfterEveryModalClose = useCallback(() => {
    consoleOut('onAfterEveryModalClose called!', '', 'crimson');
    resetTransactionStatus();
  },[resetTransactionStatus]);

  useEffect(() => {

    if (!connection || !selectedMultisig) { return; }

    // TODO: Check with Yansel (change balance of the selectedMultisig.id for selectedMultisig.authority)
    const timeout = setTimeout(() => {
      setMultisig(selectedMultisig);
      connection
        .getBalance(selectedMultisig.authority)
        .then(balance => setSolBalance(balance))
        .catch(err => console.error(err));
    });

    return () => clearTimeout(timeout);

  }, [
    connection,
    selectedMultisig
  ]);

  useEffect(() => {

    if (!proposalSelected) { return; }
    const timeout = setTimeout(() => setSelectedProposal(proposalSelected));
    return () => clearTimeout(timeout);

  }, [
    proposalSelected
  ]);

  const isTxInProgress = useCallback((): boolean => {
    return isBusy || fetchTxInfoStatus === "fetching" ? true : false;
  }, [
    isBusy,
    fetchTxInfoStatus,
  ]);

  const getProgramsByUpgradeAuthority = useCallback(async (): Promise<ProgramAccounts[]> => {

    if (!connection || !multisig || !multisig.authority) { return []; }

    const BPFLoaderUpgradeab1e = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
    const execDataAccountsFilter: MemcmpFilter = { 
      memcmp: { offset: 13, bytes: multisig.authority.toBase58() } 
    };

    const execDataAccounts = await connection.getProgramAccounts(
      BPFLoaderUpgradeab1e, {
        filters: [execDataAccountsFilter]
      }
    );

    const programs: ProgramAccounts[] = [];
    const group = (size: number, data: any) => {
      const result = [];
      for (let i = 0; i < data.length; i += size) {
        result.push(data.slice(i, i + size));
      }
      return result;
    };

    const sleep = (ms: number, log = true) => {
      if (log) { consoleOut("Sleeping for", ms / 1000, "seconds"); }
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    const getProgramAccountsPromise = async (execDataAccount: any) => {

      const execAccountsFilter: MemcmpFilter = { 
        memcmp: { offset: 4, bytes: execDataAccount.pubkey.toBase58() } 
      };

      const execAccounts = await connection.getProgramAccounts(
        BPFLoaderUpgradeab1e, {
          dataSlice: { offset: 0, length: 0 },
          filters: [execAccountsFilter]
        }
      );

      if (execAccounts.length === 0) { return; }

      if (execAccounts.length > 1) {
        throw new Error(`More than one program was found for program data account '${execDataAccount.pubkey.toBase58()}'`);
      }

      programs.push({
          pubkey: execAccounts[0].pubkey,
          owner: execAccounts[0].account.owner,
          executable: execDataAccount.pubkey,
          upgradeAuthority: multisig.authority,
          size: execDataAccount.account.data.byteLength
        } as ProgramAccounts
      );
    }

    const execDataAccountsGroups = group(8, execDataAccounts);

    for (const groupItem of execDataAccountsGroups) {
      const promises: Promise<any>[] = [];
      for (const dataAcc of groupItem) {
        promises.push(
          getProgramAccountsPromise(dataAcc)
        );
      }
      await Promise.all(promises);
      sleep(1_000, false);
    }

    return programs;

  },[
    connection, 
    multisig
  ]);

  // Get Programs
  useEffect(() => {
    if (!connection || !multisig || !loadingPrograms) {
      return;
    }

    const timeout = setTimeout(() => {
      getProgramsByUpgradeAuthority()
        .then(progs => {
          if (multisig) {
            setLoadingPrograms(true);
          }
          setPrograms(progs);
          consoleOut('programs:', progs);
        })
        .catch(error => console.error(error))
        .finally(() => setLoadingPrograms(false));
    });

    return () => {
      clearTimeout(timeout);
    }
  }, [
    connection,
    multisig,
    loadingPrograms,
    getProgramsByUpgradeAuthority,
    setPrograms
  ]);

  const getMultisigVaults = useCallback(async (
    connection: Connection,
    multisig: PublicKey

  ) => {

    const [multisigSigner] = await PublicKey.findProgramAddress(
      [multisig.toBuffer()],
      MEAN_MULTISIG
    );

    const accountInfos = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 32, bytes: multisigSigner.toBase58() } }, 
        { dataSize: ACCOUNT_LAYOUT.span }
      ],
    });

    if (!accountInfos || !accountInfos.length) { return []; }

    const results = accountInfos.map((t: any) => {
      const tokenAccount = ACCOUNT_LAYOUT.decode(t.account.data);
      tokenAccount.address = t.pubkey;
      return tokenAccount;
    });

    return results;

  },[]);

  const getSolToken = useCallback(() => {

    if (!multisig) { return null; }

    return {
      mint: NATIVE_SOL_MINT,
      owner: multisig.authority,
      amount: new BN(solBalance),
      delegateOption: 0,
      delegate: undefined,
      state: 1,
      isNativeOption: 0,
      isNative: true,
      delegatedAmount: 0,
      closeAuthorityOption: 0,
      closeAuthority: undefined,
      address: multisig.id,
      decimals: 9

    } as any;

  }, [
    multisig, 
    solBalance
  ]);
  
  // Get Multisig Vaults
  useEffect(() => {

    if (!multisigClient || !multisig || !loadingAssets) { return; }
  
    const timeout = setTimeout(() => {

      const program = multisigClient.getProgram();
      const solToken = getSolToken();

      getMultisigVaults(program.provider.connection, multisig.id)
        .then(result => {
          const modifiedResults = new Array<any>();
          modifiedResults.push(solToken);  
          result.forEach(item => {
            modifiedResults.push(item);
          });  
          setAssetsWithoutSol(result);
          setMultisigVaults(modifiedResults);  
          consoleOut("Multisig assets", modifiedResults, "blue");
        })
        .catch(err => {
          console.error(err);
          setMultisigVaults([solToken]);
        })
        .finally(() => setLoadingAssets(false));
    });
  
    return () => {
      clearTimeout(timeout);
    }

  },[
    multisig, 
    connection, 
    loadingAssets,
    multisigClient, 
    getMultisigVaults, 
    setMultisigVaults,
    getSolToken, 
  ]);

  useEffect(() => {
    const loading = selectedMultisig ? true : false;
    const timeout = setTimeout(() => {
      setLoadingProposals(loading);
      setLoadingAssets(loading);
      setLoadingPrograms(loading);
    });

    return () => {
      clearTimeout(timeout);
    }

  },[
    selectedMultisig
  ]);

  // consoleOut("========================================")
  // consoleOut("multisig", multisig.label, 'blue');
  // consoleOut("loading programs", loadingPrograms, 'blue');
  // consoleOut("programs", programs, 'blue');
  // consoleOut("========================================")

  // Get Txs for the selected multisig
  useEffect(() => {

    if (
      !connection || 
      !publicKey || 
      !multisigClient || 
      !multisig ||
      !loadingProposals
    ) { 
      return;
    }

    const timeout = setTimeout(() => {

      consoleOut('Triggering loadMultisigPendingTxs ...', '', 'blue');

      multisigClient
        .getMultisigTransactions(multisig.id, publicKey)
        .then((txs: MultisigTransaction[]) => setMultisigTxs(txs))
        .catch((err: any) => {
          console.error("Error fetching all transactions", err);
          setMultisigTxs([]);
          consoleOut('multisig txs:', [], 'blue');
        })
        .finally(() => setLoadingProposals(false));
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    publicKey, 
    multisig, 
    connection, 
    multisigClient, 
    loadingProposals, 
    proposalSelected
  ]);

  // Proposals list
  const renderListOfProposals = (
    <>
      {!loadingProposals ? (
        (multisigTxs && multisigTxs.length > 0) ? (
          multisigTxs.map((proposal, index) => {
            const onSelectProposal = () => {
              // Sends isProposalDetails value to the parent component "SafeView"
              onDataToSafeView(proposal);
            };

            // Number of participants who have already approved the Tx
            const approvedSigners = proposal.signers.filter((s: any) => s === true).length;
            const expirationDate = proposal.details.expirationDate ? proposal.details.expirationDate : "";
            const executedOnDate = proposal.executedOn ? proposal.executedOn.toDateString() : "";

            return (
              <div 
                key={index}
                onClick={onSelectProposal}
                className={`d-flex w-100 align-items-center simplelink ${(index + 1) % 2 === 0 ? '' : 'background-gray'}`}
                >
                  <ResumeItem
                    id={proposal.id.toBase58()}
                    // logo={proposal.logo}
                    title={proposal.details.title}
                    expires={expirationDate}
                    executedOn={executedOnDate}
                    approved={approvedSigners}
                    // rejected={proposal.rejected}
                    status={proposal.status}
                    isProposalDetails={isProposalDetails}
                    rightIcon={<IconArrowForward className="mean-svg-icons" />}
                  />
              </div>
            )
          })
        ) : (
          <span>This multisig has no proposals</span>
        )
      ) : (
        <span>Loading proposals ...</span>
      )}
    </>
  );

  // Assets list
  const renderListOfAssets = (
    <>
      {!loadingAssets ? (
        (multisigVaults && multisigVaults.length > 0) ? (
          multisigVaults.map((asset, index) => {
            const onSelectAsset = () => {
              // Sends isProgramDetails value to the parent component "SafeView"
              props.onDataToAssetView(asset);
              consoleOut('selected asset:', asset, 'blue');
            };

            const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
              event.currentTarget.src = FALLBACK_COIN_IMAGE;
              event.currentTarget.className = "error";
            };

            const token = getTokenByMintAddress(asset.mint.toBase58(), tokenList);

            const isSol = asset.mint.toBase58() === NATIVE_SOL_MINT.toBase58() ? true : false;

            const assetIcon = (
              isSol ? (
                <img alt="Sol" width={30} height={30} src="https://www.gate.io/images/coin_icon/64/sol.png" onError={imageOnErrorHandler} style={{backgroundColor: "#000", borderRadius: "1em"}} />
              ) : (token && token.logoURI) ? (
                <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} onError={imageOnErrorHandler} style={{backgroundColor: "#000", borderRadius: "1em"}} />
              ) : (
                <Identicon address={new PublicKey(asset.mint).toBase58()} style={{
                  width: "26",
                  display: "inline-flex",
                  height: "26",
                  overflow: "hidden",
                  borderRadius: "50%"
                }} />
              )
            );

            const assetName = isSol ? "SOL" : (token ? token.symbol : "Unknown");
            const assetAddress = (
              <CopyExtLinkGroup
                content={asset.address.toBase58()}
                number={8}
                externalLink={false}
              />
            );
            const assetAmount = token 
              ? formatThousands(makeDecimal(asset.amount, token.decimals), token.decimals) 
              : formatThousands(makeDecimal(asset.amount, asset.decimals || 6), asset.decimals || 6);

            // Dropdown (three dots button)
            const menu = (
              <Menu>
                <Menu.Item key="0" onClick={showTransferTokenModal} disabled={isTxInProgress()}>
                  <span className="menu-item-text">Propose send funds</span>
                </Menu.Item>
                <Menu.Item key="1" onClick={showTransferVaultAuthorityModal} disabled={isTxInProgress()}>
                  <span className="menu-item-text">Transfer ownership</span>
                </Menu.Item>
                <Menu.Item key="2" onClick={showDeleteVaultModal} disabled={isTxInProgress() || !canDeleteVault()}>
                  <span className="menu-item-text">Close asset</span>
                </Menu.Item>
              </Menu>
            );

            return (
              <div 
                key={`${asset.address.toBase58() + 60}`}
                onClick={onSelectAsset}
                className={`d-flex w-100 align-items-center ${(index + 1) % 2 === 0 ? '' : 'background-gray'}`}
                >
                  <ResumeItem
                    id={`${index + 61}`}
                    img={assetIcon}
                    title={assetName}
                    subtitle={assetAddress}
                    isAsset={true}
                    rightContent={assetAmount}
                    isProposalDetails={isProposalDetails}
                    isAssetDetails={isAssetDetails}
                    rightIcon={!isSol ? <IconVerticalEllipsis className="mean-svg-icons" /> : ""}
                    rightIconHasDropdown={true}
                    dropdownMenu={!isSol ? menu : ""}
                  />
              </div>
            );
          })
        ) : (
          <span>This multisig has no assets</span>
        )
      ) : (
        <span>Loading assets ...</span>
      )}
    </>
  );

  // Settings
  // const renderSettings = (
  //   <>
  //     <Row gutter={[8, 8]}>
  //       <Col xs={12} sm={12} md={12} lg={12} className="text-right pr-1">Minimum cool-off period:</Col>
  //       <Col xs={12} sm={12} md={12} lg={12} className="text-left pl-1">24 hours</Col>
  //     </Row>
  //     <Row gutter={[8, 8]}>
  //       <Col xs={12} sm={12} md={12} lg={12} className="text-right pr-1">Single signer balance threshold:</Col>
  //       <Col xs={12} sm={12} md={12} lg={12} className="text-left pl-1">$100.00</Col>
  //     </Row>
  //   </>
  // );

  // // Activities list 
  // const renderActivities= (
  //   <>
  //     {/* {proposals && proposals.length && (
  //       proposals.map((proposal) => (
  //         proposal.activities.map((activity: any) => {

  //           let icon = null;

  //           switch (activity.description) {
  //             case 'approved':
  //               icon = <IconApprove className="mean-svg-icons fg-green" />;
  //               break;
  //             case 'rejected':
  //               icon = <IconCross className="mean-svg-icons fg-red" />;
  //               break;
  //             case 'passed':
  //               icon = <IconCheckCircle className="mean-svg-icons fg-green" />;
  //               break;
  //             case 'created':
  //               icon = <IconCreated className="mean-svg-icons fg-purple" />;
  //               break;
  //             case 'deleted':
  //               icon = <IconMinus className="mean-svg-icons fg-purple" />;
  //               break;
  //             default:
  //               icon = "";
  //               break;
  //           }

  //           return (
  //             <div 
  //               key={activity.id}
  //               className={`d-flex w-100 align-items-center activities-list ${activity.id % 2 === 0 ? '' : 'background-gray'}`}
  //               >
  //                 <div className="list-item">
  //                   <span className="mr-2">
  //                       {activity.date}
  //                   </span>
  //                   {icon}
  //                   <span>
  //                     {`Proposal ${activity.description} by ${activity.proposedBy} [${shortenAddress(activity.address, 4)}]`}
  //                   </span>
  //                 </div>
  //             </div>
  //           )
  //         })
  //       ))
  //     )} */}
  //   </>
  // );

  // Settings
  // const renderSettings = (
  //   <>
  //     <Row gutter={[8, 8]}>
  //       <Col xs={12} sm={12} md={12} lg={12} className="text-right pr-1">Minimum cool-off period:</Col>
  //       <Col xs={12} sm={12} md={12} lg={12} className="text-left pl-1">24 hours</Col>
  //     </Row>
  //     <Row gutter={[8, 8]}>
  //       <Col xs={12} sm={12} md={12} lg={12} className="text-right pr-1">Single signer balance threshold:</Col>
  //       <Col xs={12} sm={12} md={12} lg={12} className="text-left pl-1">$100.00</Col>
  //     </Row>
  //   </>
  // );

  // // Activities list 
  // const renderActivities= (
  //   <>
  //     {/* {proposals && proposals.length && (
  //       proposals.map((proposal) => (
  //         proposal.activities.map((activity: any) => {

  //           let icon = null;

  //           switch (activity.description) {
  //             case 'approved':
  //               icon = <IconApprove className="mean-svg-icons fg-green" />;
  //               break;
  //             case 'rejected':
  //               icon = <IconCross className="mean-svg-icons fg-red" />;
  //               break;
  //             case 'passed':
  //               icon = <IconCheckCircle className="mean-svg-icons fg-green" />;
  //               break;
  //             case 'created':
  //               icon = <IconCreated className="mean-svg-icons fg-purple" />;
  //               break;
  //             case 'deleted':
  //               icon = <IconMinus className="mean-svg-icons fg-purple" />;
  //               break;
  //             default:
  //               icon = "";
  //               break;
  //           }

  //           return (
  //             <div 
  //               key={activity.id}
  //               className={`d-flex w-100 align-items-center activities-list ${activity.id % 2 === 0 ? '' : 'background-gray'}`}
  //               >
  //                 <div className="list-item">
  //                   <span className="mr-2">
  //                       {activity.date}
  //                   </span>
  //                   {icon}
  //                   <span>
  //                     {`Proposal ${activity.description} by ${activity.proposedBy} [${shortenAddress(activity.address, 4)}]`}
  //                   </span>
  //                 </div>
  //             </div>
  //           )
  //         })
  //       ))
  //     )} */}
  //   </>
  // );

  useEffect(() => {
    const timeout = setTimeout(() => {

      if (programs && programs.length >= 0) {
        setLoadingPrograms(false);
      } else {
        setLoadingPrograms(true);
      }
    });

    return () => {
      clearTimeout(timeout);
    }
  }, [programs]);


  const renderListOfPrograms = (
    <>
      {!loadingPrograms ? (
        (programs && programs.length >= 0) && (
          (programs.length > 0) ? (
            programs.map((program, index) => {
              const onSelectProgram = () => {
                // Sends isProgramDetails value to the parent component "SafeView"
                props.onDataToProgramView(program);
              }
    
              const programTitle = shortenAddress(program.pubkey.toBase58(), 4);
              const programSubtitle = shortenAddress(program.pubkey.toBase58(), 8);
    
              return (
                <div 
                  key={`${index + 1}`}
                  onClick={onSelectProgram}
                  className={`d-flex w-100 align-items-center simplelink ${(index + 1) % 2 === 0 ? '' : 'background-gray'}`}
                >
                    <ResumeItem
                      id={program.pubkey.toBase58()}
                      title={programTitle}
                      subtitle={programSubtitle}
                      isProposalDetails={isProposalDetails}
                      isProgram={true}
                      programSize={program.size}
                      isProgramDetails={isProgramDetails}
                      rightIcon={<IconArrowForward className="mean-svg-icons" />}
                    />
                </div>
              )
            })
          ) : (
            <span>This multisig has no programs</span>
          )
        )
      ) : (
        <span>Loading programs ...</span>
      )}
    </>
  );

  // Tabs
  const tabs = [
    {
      name: "Proposals",
      render: renderListOfProposals
    }, 
    {
      name: "Assets",
      render: renderListOfAssets
    }, 
    // {
    //   name: "Settings",
    //   render: renderSettings
    // }, 
    // {
    //   name: "Activity",
    //   render: renderActivities
    // }, 
    {
      name: "Programs",
      render: renderListOfPrograms
    }
  ];

  return (
    <>
      <SafeInfo
        solBalance={solBalance}
        selectedMultisig={multisig}
        multisigVaults={multisigVaults}
        onNewProposalMultisigClick={onNewProposalMultisigClick}
        onEditMultisigClick={onEditMultisigClick}
        onNewCreateAssetClick={onNewCreateAssetClick}
        tabs={tabs}
        selectedTab={selectedTab}
        isTxInProgress={isTxInProgress}
      />

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
          assets={assetsWithoutSol}
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
    </>
  )
}