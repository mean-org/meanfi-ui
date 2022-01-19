import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConnectionConfig } from '../../contexts/connection';
import { TransactionStatusContext } from '../../contexts/transaction-status';
import { useWallet } from '../../contexts/wallet';
import { AppStateContext } from '../../contexts/appstate';
import { Button, Col, Divider, Empty, Row, Space, Spin, Tooltip } from 'antd';
import { ArrowLeftOutlined, LoadingOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { IconExternalLink, IconInfoCircle, IconRefresh, IconShieldOutline, IconTrash } from '../../Icons';
import { PreFooter } from '../../components/PreFooter';
import { Account, ConfirmOptions, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction, TransactionInstruction } from '@solana/web3.js';
import { Program, Provider } from '@project-serum/anchor';
import MultisigIdl from "../../models/mean-multisig-idl";
import { MEAN_MULTISIG, NATIVE_SOL_MINT } from '../../utils/ids';
import { AccountLayout, ASSOCIATED_TOKEN_PROGRAM_ID, MintLayout, Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { useLocation, useNavigate } from 'react-router-dom';
import { consoleOut, copyText, delay, getTransactionStatusForLogs } from '../../utils/ui';
import { Identicon } from '../../components/Identicon';
import { getTokenAmountAndSymbolByTokenAddress, getTokenByMintAddress, getTxIxResume, shortenAddress, toUiAmount } from '../../utils/utils';
import { MultisigVault } from '../../models/multisig';
import { TransactionFees } from '@mean-dao/msp';
import { MultisigCreateVaultModal } from '../../components/MultisigCreateVaultModal';
import { useNativeAccount } from '../../contexts/accounts';
import { OperationType, TransactionStatus } from '../../models/enums';
import { customLogger } from '../..';
import { ACCOUNT_LAYOUT } from '../../utils/layouts';
import { BN } from 'bn.js';
import { notify } from '../../utils/notifications';
import { MultisigTransferTokensModal } from '../../components/MultisigTransferTokensModal';

export const MultisigVaultsView = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { account } = useNativeAccount();
  const connectionConfig = useConnectionConfig();
  const { publicKey, wallet } = useWallet();
  const {
      theme,
      tokenList,
      tokenBalance,
      selectedToken,
      treasuryOption,
      detailsPanelOpen,
      transactionStatus,
      streamProgramAddress,
      streamV2ProgramAddress,
      previousWalletConnectState,
      setSelectedToken,
      setEffectiveRate,
      refreshStreamList,
      setTreasuryOption,
      setDtailsPanelOpen,
      resetContractValues,
      refreshTokenBalance,
      setTransactionStatus,
      setHighLightableStreamId,
  } = useContext(AppStateContext);
  const {
      fetchTxInfoStatus,
      lastSentTxSignature,
      lastSentTxOperationType,
      startFetchTxSignatureInfo,
      clearTransactionStatusContext,
  } = useContext(TransactionStatusContext);
  const { t } = useTranslation('common');
  const [nativeBalance, setNativeBalance] = useState(0);
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [multisigAddress, setMultisigAddress] = useState('');
  const [multisigVaults, setMultisigVaults] = useState<MultisigVault[]>([]);
  const [selectedVault, setSelectedVault] = useState<MultisigVault | undefined>(undefined);
  const [loadingVaults, setLoadingVaults] = useState(false);
  const [isCreateVaultModalVisible, setCreateVaultModalVisible] = useState(false);
  const [isTransferTokenModalVisible, setIsTransferTokenModalVisible] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [ongoingOperation, setOngoingOperation] = useState<OperationType | undefined>(undefined);
  const [retryOperationPayload, setRetryOperationPayload] = useState<any>(undefined);
  const [transactionFees, setTransactionFees] = useState<TransactionFees>({
    blockchainFee: 0, mspFlatFee: 0, mspPercentFee: 0
  });

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
    if (params.has('ms')) {
      const multisigAddress = params.get('ms');
      setMultisigAddress(multisigAddress || '');
      consoleOut('multisigAddress:', multisigAddress, 'blue');
    }
  }, [location]);

  const getMultisigVaults = useCallback(async (
    connection: Connection,
    multisig: PublicKey
  ) => {

    const [multisigSigner] = await PublicKey.findProgramAddress(
      [multisig.toBuffer()],
      MEAN_MULTISIG
    );

    console.log('multisigSigner:', multisigSigner.toBase58());

    const accountInfos = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
      filters: [
        {
          memcmp: { offset: 32, bytes: multisigSigner.toBase58() },
        }, 
        {
          dataSize: AccountLayout.span
        }
      ],
    });

    console.log('accountInfos:', accountInfos);

    const results = accountInfos.map((t: any) => {

      // let tokenAccount = AccountLayout.decode(t.account.data);
      let tokenAccount = ACCOUNT_LAYOUT.decode(t.account.data);
      tokenAccount.address = t.pubkey;
      return tokenAccount;
    });

    return results;

  },[]);

  // Get Multisig Vaults
  useEffect(() => {

    if (!connection || !multisigClient || !publicKey || !multisigAddress) {
      return;
    }

    const timeout = setTimeout(() => {
      setLoadingVaults(true);
      getMultisigVaults(connection, new PublicKey(multisigAddress))
      .then((result: MultisigVault[]) => {
        consoleOut('multisig vaults:', result, 'blue');
        setMultisigVaults(result);
        if (result.length > 0) {
          setSelectedVault(result[0]);
        }
      })
      .catch(err => console.error(err))
      .finally(() => setLoadingVaults(false));
    });

    return () => {
      clearTimeout(timeout);
    }

  },[
    publicKey,
    connection,
    multisigClient,
    multisigAddress,
    getMultisigVaults
  ]);

  const onRefreshVaults = useCallback(() => {
    setLoadingVaults(true);
    getMultisigVaults(connection, new PublicKey(multisigAddress))
    .then((result: MultisigVault[]) => {
      consoleOut('multisig vaults:', result, 'blue');
      setMultisigVaults(result);
      if (result.length > 0 && !selectedVault) {
        setSelectedVault(result[0]);
      }
    })
    .catch(err => console.error(err))
    .finally(() => setLoadingVaults(false));
  }, [
    connection,
    selectedVault,
    multisigAddress,
    getMultisigVaults,
  ]);

  // Copy address to clipboard
  const copyAddressToClipboard = useCallback((address: any) => {

    if (copyText(address.toString())) {
      notify({
        description: t('notifications.account-address-copied-message'),
        type: "info"
      });
    } else {
      notify({
        description: t('notifications.account-address-not-copied-message'),
        type: "error"
      });
    }

  },[t])

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

  const resetTransactionStatus = useCallback(() => {

    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });

  }, [
    setTransactionStatus
  ]);

  const onAfterEveryModalClose = useCallback(() => resetTransactionStatus(),[resetTransactionStatus]);

  // Shows create vault modal
  const onShowCreateVaultModal = useCallback(() => {
    setCreateVaultModalVisible(true);
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.000010,
      mspPercentFee: 0
    };
    setTransactionFees(fees);
  },[]);

  const onVaultCreated = useCallback(() => {

    onRefreshVaults();
    resetTransactionStatus();

  },[
    onRefreshVaults,
    resetTransactionStatus
  ]);

  const onExecuteCreateVaultTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.CreateVault);
    setRetryOperationPayload(data);
    setIsBusy(true);

    const createVault = async (data: any) => {

      if (!multisigAddress || !publicKey || !data || !data.token) { return null; }

      const selectedMultisig = new PublicKey(multisigAddress);

      const [multisigSigner] = await PublicKey.findProgramAddress(
        [selectedMultisig.toBuffer()],
        multisigClient.programId
      );

      const mintAddress = new PublicKey(data.token.address);
      const tokenAccount = Keypair.generate();
      const ixs: TransactionInstruction[] = [
        SystemProgram.createAccount({
          fromPubkey: publicKey,
          newAccountPubkey: tokenAccount.publicKey,
          programId: TOKEN_PROGRAM_ID,
          lamports: await Token.getMinBalanceRentForExemptAccount(multisigClient.provider.connection),
          space: AccountLayout.span
        }),
        Token.createInitAccountInstruction(
          TOKEN_PROGRAM_ID,
          mintAddress,
          tokenAccount.publicKey,
          multisigSigner
        )
      ];

      let tx = new Transaction().add(...ixs);
      tx.feePayer = publicKey;
      const { blockhash } = await multisigClient.provider.connection.getRecentBlockhash("recent");
      tx.recentBlockhash = blockhash;
      tx.partialSign(...[tokenAccount]);

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
        const payload = { token: data.token }; 
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
          customLogger.logError('Add funds transaction failed', { transcript: transactionLog });
          return false;
        }

        return await createVault(data)
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
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.CreateVault);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            await delay(1000);
            onVaultCreated();
            setOngoingOperation(undefined);
            setCreateVaultModalVisible(false);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    clearTransactionStatusContext,
    connection,
    multisigClient.programId,
    multisigClient.provider.connection,
    nativeBalance,
    onVaultCreated,
    publicKey,
    multisigAddress,
    setTransactionStatus,
    startFetchTxSignatureInfo,
    transactionCancelled,
    transactionFees.blockchainFee,
    transactionFees.mspFlatFee,
    transactionStatus.currentOperation,
    wallet
  ]);

  const onAcceptCreateVault = useCallback((params: any) => {
    onExecuteCreateVaultTx(params);
  },[
    onExecuteCreateVaultTx
  ]);

  // Transfer token modal
  const showTransferTokenModal = useCallback(() => {
    setIsTransferTokenModalVisible(true);
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.000010,
      mspPercentFee: 0
    };
    setTransactionFees(fees);
  }, []);

  const onAcceptTransferToken = (params: any) => {
    consoleOut('params', params, 'blue');
    onExecuteTransferTokensTx(params);
  };

  const onTokensTransfered = useCallback(() => {

    onRefreshVaults();
    resetTransactionStatus();

  },[
    onRefreshVaults,
    resetTransactionStatus
  ]);

  const onExecuteTransferTokensTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.TransferTokens);
    setRetryOperationPayload(data);
    setIsBusy(true);

    const transferTokens = async (data: any) => {

      if (!publicKey || !multisigAddress) { 
        throw Error("Invalid transaction data");
      }

      const selectedMultisig = new PublicKey(multisigAddress);

      const [multisigSigner] = await PublicKey.findProgramAddress(
        [selectedMultisig.toBuffer()],
        multisigClient.programId
      );

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
      let toAccountInfo = await connection.getAccountInfo(toAddress);

      if (!toAccountInfo) { 
        throw Error("Invalid to token account");
      }

      let ixs: TransactionInstruction[] = [];

      if (!toAccountInfo.owner.equals(TOKEN_PROGRAM_ID)) {

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

      if(toAccountInfo.owner.equals(TOKEN_PROGRAM_ID) && toAccountInfo.data.length === AccountLayout.span) {
        const toAccount = AccountLayout.decode(Buffer.from(toAccountInfo.data));
        const mintAddress = new PublicKey(Buffer.from(toAccount.mint));

        if (!mintAddress.equals(fromMintAddress)) {
          throw Error("Invalid to token account mint");
        }
      }

      const transaction = new Account();
      const txSize = 1000;

      ixs.push(
        await multisigClient.account.transaction.createInstruction(
          transaction,
          txSize
        )
      );

      const transferIx = Token.createTransferInstruction(
        TOKEN_PROGRAM_ID,
        fromAddress,
        toAddress,
        multisigSigner,
        [],
        new BN(data.amount * 10 ** mint.decimals).toNumber()
      );

      let tx = multisigClient.transaction.createTransaction(
        TOKEN_PROGRAM_ID,
        OperationType.TransferTokens,
        transferIx.keys,
        Buffer.from(transferIx.data),
        {
          accounts: {
            multisig: selectedMultisig,
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
          customLogger.logError('Add funds transaction failed', { transcript: transactionLog });
          return false;
        }

        return await transferTokens(data)
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
          customLogger.logWarning('Transfer tokens transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Transfer tokens transaction failed', { transcript: transactionLog });
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
            await delay(1000);
            onTokensTransfered();
            setOngoingOperation(undefined);
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
    multisigAddress,
    transactionCancelled,
    multisigClient.programId,
    multisigClient.transaction,
    multisigClient.account.transaction,
    transactionFees.mspFlatFee,
    transactionFees.blockchainFee,
    transactionStatus.currentOperation,
    onTokensTransfered,
    setTransactionStatus,
    startFetchTxSignatureInfo,
    clearTransactionStatusContext,
  ]);

  const getTokenIconAndAmount = (tokenAddress: string, amount: any) => {
    const token = tokenList.find(t => t.address === tokenAddress);
    if (!token) {
      return (
        <>
          <span className="info-icon token-icon">
            <Identicon address={tokenAddress} style={{ width: "30", display: "inline-flex" }} />
          </span>
          <span className="info-data ml-1">
          {
            getTokenAmountAndSymbolByTokenAddress(
              toUiAmount(new BN(amount), 6),
              tokenAddress
            )
          }
          </span>
        </>
      );
    }
    return (
      <>
        <span className="info-icon token-icon">
          {token.logoURI ? (
            <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} />
          ) : (
            <Identicon address={tokenAddress} style={{ width: "30", display: "inline-flex" }} />
          )}
        </span>
        <span className="info-data ml-1">
          {
            getTokenAmountAndSymbolByTokenAddress(
              toUiAmount(new BN(amount), token.decimals || 6),
              token.address
            )
          }
        </span>
      </>
    );
  }

  ///////////////
  // Rendering //
  ///////////////

  const renderCtaRow = () => {
    return (
      <>
        <Space size="middle">
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            disabled={isTxInProgress() || loadingVaults}
            onClick={showTransferTokenModal}>
            {isTxInProgress() && (<LoadingOutlined />)}
            {t('multisig.multisig-vaults.cta-transfer')}
          </Button>
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            disabled={true}
            onClick={() => {}}>
            Set Vault Auth
          </Button>
        </Space>
      </>
    );
  }

  const renderVaultMeta = () => {
    return (
      <>
      {selectedVault && (
        <div className="stream-fields-container">

          {/* Row 1 */}
          <div className="mb-3">
            <Row>
              <Col span={12}>
                <div className="transaction-detail-row">
                  <span className="info-label">
                    Mint
                  </span>
                </div>
                <div className="transaction-detail-row">
                  {
                    getTokenIconAndAmount(
                      selectedVault.mint.toBase58(),
                      selectedVault.amount
                    )
                  }
                </div>
              </Col>
              <Col span={12}>
                <div className="transaction-detail-row">
                  <span className="info-label">
                    Authority
                  </span>
                </div>
                <div className="transaction-detail-row">
                  <span className="info-icon">
                    <IconShieldOutline className="mean-svg-icons" />
                  </span>
                  <div onClick={() => copyAddressToClipboard(selectedVault.owner.toBase58())}
                       className="info-data flex-row wrap align-items-center simplelink underline-on-hover"
                       style={{cursor: 'pointer', fontSize: '1.1rem'}}>
                    {shortenAddress(selectedVault.owner.toBase58(), 8)}
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

  const renderMultisigVaults = (
    <>
    {multisigVaults && multisigVaults.length ? (
      multisigVaults.map((item, index) => {
        const token = getTokenByMintAddress(item.mint.toBase58());
        const onVaultSelected = (ev: any) => {
          setSelectedVault(item);
          setDtailsPanelOpen(true);
          const resume = `\naddress: ${item.address.toBase58()}\nmint: ${token ? token.address : item.mint.toBase58()}`;
          consoleOut('resume:', resume, 'blue');
          consoleOut('selected vault:', item, 'blue');
        };
        return (
          <div 
            key={`${index + 50}`} 
            onClick={onVaultSelected}
            className={
              `transaction-list-row ${
                selectedVault && selectedVault.address && selectedVault.address.equals(item.address)
                  ? 'selected' 
                  : ''
              }`
            }>
            <div className="icon-cell">
              <Identicon address={item.address.toBase58()} style={{ width: "30", display: "inline-flex" }} />
            </div>
            <div className="description-cell">
              <div className="title text-truncate">{token ? token.symbol : `Unknown token [${shortenAddress(item.mint.toBase58(), 6)}]`}</div>
              <div className="subtitle text-truncate">{shortenAddress(item.address.toBase58(), 8)}</div>
            </div>
            <div className="rate-cell">
              <div className="rate-amount text-uppercase">
                {getTokenAmountAndSymbolByTokenAddress(
                  toUiAmount(new BN(item.amount), token?.decimals || 6),
                  token ? token.address as string : '',
                  true
                )}
              </div>
            </div>
          </div>
        );
      })
    ) : (
      <>
        <div className="h-100 flex-center">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{publicKey
            ? t('multisig.multisig-vaults.no-vaults')
            : t('multisig.multisig-vaults.not-connected')}</p>} />
        </div>
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
                <div className="back-button">
                  <span className="icon-button-container">
                    <Tooltip placement="bottom" title={t('multisig.multisig-vaults.back-to-multisig-accounts-cta')}>
                      <Button
                        type="default"
                        shape="circle"
                        size="middle"
                        icon={<ArrowLeftOutlined />}
                        onClick={() => {
                          navigate('/multisig');
                        }}
                      />
                    </Tooltip>
                  </span>
                </div>
                <span className="title">{t('multisig.multisig-vaults.screen-title')}</span>
                <Tooltip placement="bottom" title={t('multisig.multisig-vaults.refresh-tooltip')}>
                  <div className={`transaction-stats ${loadingVaults ? 'click-disabled' : 'simplelink'}`} onClick={onRefreshVaults}>
                    <Spin size="small" />
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
                  <Spin spinning={loadingVaults}>
                    {renderMultisigVaults}
                  </Spin>
                </div>
                <div className="bottom-ctas">
                  <div className="create-stream">
                    <Button
                      block
                      type="primary"
                      shape="round"
                      disabled={!publicKey}
                      onClick={onShowCreateVaultModal}>
                      {publicKey
                        ? t('multisig.multisig-account-detail.cta-create-vault')
                        : t('transactions.validation.not-connected')
                      }
                    </Button>
                  </div>
                </div>
              </div>

            </div>

            <div className="meanfi-two-panel-right">
              <div className="meanfi-panel-heading">
                <span className="title">{t('multisig.multisig-vaults.vault-detail-heading')}</span>
              </div>

              <div className="inner-container">
                {publicKey ? (
                  <>
                    {selectedVault && (
                      <div className="float-top-right">
                        <span className="icon-button-container secondary-button">
                          <Tooltip placement="bottom" title={t('multisig.multisig-vaults.cta-close')}>
                            <Button
                              type="default"
                              shape="circle"
                              size="middle"
                              icon={<IconTrash className="mean-svg-icons" />}
                              onClick={() => {}}
                              disabled={isTxInProgress()}
                            />
                          </Tooltip>
                        </span>
                      </div>
                    )}
                    <div className={`stream-details-data-wrapper vertical-scroll ${(loadingVaults || !selectedVault) ? 'h-100 flex-center' : ''}`}>
                      <Spin spinning={loadingVaults}>
                        {selectedVault && (
                          <>
                            {renderVaultMeta()}
                            <Divider className="activity-divider" plain></Divider>
                            {renderCtaRow()}
                          </>
                        )}
                      </Spin>
                      {!loadingVaults && (
                        <>
                        {(!multisigVaults || multisigVaults.length === 0) && !selectedVault && (
                          <div className="h-100 flex-center">
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{t('multisig.multisig-vaults.no-vault-loaded')}</p>} />
                          </div>
                        )}
                        </>
                      )}
                    </div>
                    {/* {selectedVault && (
                      <div className="stream-share-ctas">
                        <span className="copy-cta" onClick={() => onCopyTreasuryAddress(treasuryDetails.id)}>TREASURY ID: {treasuryDetails.id}</span>
                        <a className="explorer-cta" target="_blank" rel="noopener noreferrer"
                          href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${treasuryDetails.id}${getSolanaExplorerClusterParam()}`}>
                          <IconExternalLink className="mean-svg-icons" />
                        </a>
                      </div>
                    )} */}
                  </>
                ) : (
                  <div className="h-100 flex-center">
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{t('treasuries.treasury-list.not-connected')}</p>} />
                  </div>
                )}
              </div>

            </div>

          </div>

        </div>

      </div>

      {isTransferTokenModalVisible && (
        <MultisigTransferTokensModal
          isVisible={isTransferTokenModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          handleOk={onAcceptTransferToken}
          handleAfterClose={onAfterEveryModalClose}
          handleClose={() => setIsTransferTokenModalVisible(false)}
          isBusy={isBusy}
          vaults={multisigVaults}
        />
      )}

      <MultisigCreateVaultModal
        handleOk={onAcceptCreateVault}
        handleClose={() => setCreateVaultModalVisible(false)}
        isVisible={isCreateVaultModalVisible}
        nativeBalance={nativeBalance}
        transactionFees={transactionFees}
        isBusy={isBusy}
      />

      <PreFooter />
    </>
  );

};
