import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSolanaExplorerClusterParam, useConnectionConfig } from '../../contexts/connection';
import { TransactionStatusContext } from '../../contexts/transaction-status';
import { useWallet } from '../../contexts/wallet';
import { AppStateContext } from '../../contexts/appstate';
import { Button, Col, Empty, Row, Space, Spin, Tooltip } from 'antd';
import { ArrowLeftOutlined, LoadingOutlined, ReloadOutlined } from '@ant-design/icons';
import { IconCodeBlock, IconExternalLink, IconShieldOutline } from '../../Icons';
import { PreFooter } from '../../components/PreFooter';
import { ConfirmOptions, Connection, LAMPORTS_PER_SOL, MemcmpFilter, PublicKey, Transaction } from '@solana/web3.js';
import { Program, Provider } from '@project-serum/anchor';
import MultisigIdl from "../../models/mean-multisig-idl";
import { MEAN_MULTISIG, NATIVE_SOL_MINT } from '../../utils/ids';
import { useLocation, useNavigate } from 'react-router-dom';
import { consoleOut, copyText, delay, getShortDate, getTransactionStatusForLogs, isLocal } from '../../utils/ui';
import { Identicon } from '../../components/Identicon';
import { getTokenAmountAndSymbolByTokenAddress, getTxIxResume, shortenAddress, toUiAmount } from '../../utils/utils';
import { MultisigV2, MultisigTransaction, MultisigTransactionStatus, MultisigParticipant } from '../../models/multisig';
import { TransactionFees } from '@mean-dao/msp';
import { useNativeAccount } from '../../contexts/accounts';
import { OperationType, TransactionStatus } from '../../models/enums';
import { customLogger } from '../..';
import { BN } from 'bn.js';
import { notify } from '../../utils/notifications';
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from '../../constants';
import { MultisigCreateProgramModal } from '../../components/MultisigCreateProgramModal';
import { ProgramAccounts } from '../../utils/accounts';

export const MultisigProgramsView = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { account } = useNativeAccount();
  const connectionConfig = useConnectionConfig();
  const { publicKey, wallet } = useWallet();
  const {
    tokenList,
    isWhitelisted,
    detailsPanelOpen,
    transactionStatus,
    refreshTokenBalance,
    setTransactionStatus,
    setHighLightableMultisigId,
  } = useContext(AppStateContext);
  const {
    fetchTxInfoStatus,
    clearTransactionStatusContext,
  } = useContext(TransactionStatusContext);
  const { t } = useTranslation('common');
  const [nativeBalance, setNativeBalance] = useState(0);
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [multisigAddress, setMultisigAddress] = useState('');

  const [programs, setPrograms] = useState<ProgramAccounts[] | undefined>(undefined);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<ProgramAccounts | undefined>(undefined);

  const [loadingMultisigTxs, setLoadingMultisigTxs] = useState(true);
  const [isCreateProgramModalVisible, setCreateProgramModalVisible] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [transactionFees, setTransactionFees] = useState<TransactionFees>({
    blockchainFee: 0, mspFlatFee: 0, mspPercentFee: 0
  });
  const [selectedMultisig, setSelectedMultisig] = useState<MultisigV2 | undefined>(undefined);
  const [multisigPendingTxs, setMultisigPendingTxs] = useState<MultisigTransaction[]>([]);

  // TODO: Remove when releasing to the public
  useEffect(() => {
    if (!isWhitelisted && !isLocal()) {
      navigate('/');
    }
  }, [
    isWhitelisted,
    navigate
  ]);

  const connection = useMemo(() => new Connection(connectionConfig.endpoint, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true
  }), [
    connectionConfig.endpoint
  ]);

  const multisigClient = useMemo(() => {

    const opts: ConfirmOptions = {
      preflightCommitment: "finalized",
      commitment: "finalized",
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
      const msAddress = params.get('ms');
      setMultisigAddress(msAddress || '');
      consoleOut('multisigAddress:', msAddress, 'blue');
    }
  }, [location]);

  // Set selectedMultisig based on the passed-in multisigAddress in query params
  useEffect(() => {

    if (!connection || !publicKey || !multisigClient || !multisigAddress || selectedMultisig) {
      return;
    }

    const timeout = setTimeout(() => {

      multisigClient.account.multisigV2
        .fetch(new PublicKey(multisigAddress), 'finalized')
        .then((info: any) => {

          let address: any;
          let labelBuffer = Buffer
            .alloc(info.label.length, info.label)
            .filter(function (elem, index) { return elem !== 0; }
          );
          
          let owners: MultisigParticipant[] = [];
          let filteredOwners = info.owners.filter((o: any) => !o.address.equals(PublicKey.default));

          for (let i = 0; i < filteredOwners.length; i ++) {
            owners.push({
              address: filteredOwners[i].address.toBase58(),
              name: filteredOwners[i].name.length > 0 
                ? new TextDecoder().decode(
                    Buffer.from(
                      Uint8Array.of(
                        ...filteredOwners[i].name.filter((b: any) => b !== 0)
                      )
                    )
                  )
                : ""
            } as MultisigParticipant);
          }

          PublicKey
            .findProgramAddress([new PublicKey(multisigAddress).toBuffer()], MEAN_MULTISIG)
            .then(k => {

              address = k[0];
              console.log('address', address.toBase58());

              let multisigInfo = {
                id: new PublicKey(multisigAddress),
                version: info.version,
                label: new TextDecoder().decode(labelBuffer),
                address,
                nounce: info.nonce,
                ownerSeqNumber: info.ownerSetSeqno,
                threshold: info.threshold.toNumber(),
                pendingTxsAmount: info.pendingTxs.toNumber(),
                createdOnUtc: new Date(info.createdOn.toNumber() * 1000),
                owners: owners

              } as MultisigV2;

              consoleOut('selectedMultisig:', multisigInfo, 'blue');
              setSelectedMultisig(multisigInfo);

            });
        })
        .catch(err => {
          console.error(err);
        });

    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    publicKey,
    connection,
    multisigClient,
    multisigAddress,
    selectedMultisig,
    setHighLightableMultisigId
  ]);

  const getProgramsByUpgradeAuthority = useCallback(async (upgradeAuthority: PublicKey): Promise<ProgramAccounts[] | undefined> => {

    if (!connection || !upgradeAuthority) { return undefined; }

    console.log(`Searching for programs with upgrade authority: ${upgradeAuthority}`);

    // 1. Fetch executable data account having upgradeAuthority as upgrade authority
    const BPFLoaderUpgradeab1e = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
    const executableDataAccountsFilter: MemcmpFilter = { memcmp: { offset: 13, bytes: upgradeAuthority.toBase58() } }
    const executableDataAccounts = await connection.getProgramAccounts(
      BPFLoaderUpgradeab1e,
      {
        encoding: "base64",
        dataSlice: {
          offset: 0,
          length: 0
        },
        filters: [
          executableDataAccountsFilter
        ]
      });

    // 2. For each executable data account found in the previous step, fetch the corresponding program
    let programs: ProgramAccounts[] = [];
    for (let i = 0; i < executableDataAccounts.length; i++) {
      const executableData = executableDataAccounts[i].pubkey;

      const executableAccountsFilter: MemcmpFilter = { memcmp: { offset: 4, bytes: executableData.toBase58() } }
      const executableAccounts = await connection.getProgramAccounts(
        BPFLoaderUpgradeab1e,
        {
          encoding: "base64",
          dataSlice: {
            offset: 0,
            length: 0
          },
          filters: [
            executableAccountsFilter
          ]
        });

      if (executableAccounts.length === 0) {
        continue;
      }

      if (executableAccounts.length > 1) {
        throw new Error(`More than one program was found for program data account '${executableData}'`);
      }

      const foundProgram = executableAccounts[0] as ProgramAccounts;
      console.log(`Upgrade Authority: ${upgradeAuthority} --> Executable Data: ${executableData} --> Program: ${foundProgram}`);

      programs.push(foundProgram);

    }

    console.log(`${programs.length} programs found!`);

    return programs;

  }, [connection]);

  // Get Programs
  useEffect(() => {

    if (!connection || !publicKey || !selectedMultisig || !selectedMultisig.address) {
      return;
    }

    const timeout = setTimeout(() => {

      getProgramsByUpgradeAuthority(selectedMultisig.address)
        .then(programs => {
          consoleOut('programs:', programs, 'blue');
          if (programs && programs.length > 0) {
            setPrograms(programs);
          } else {
            setPrograms([]);
          }
        });
    });

    return () => {
      clearTimeout(timeout);
    }

  },[
    connection, 
    getProgramsByUpgradeAuthority, 
    publicKey, 
    selectedMultisig
  ]);

  const getTransactionStatus = useCallback((account: any) => {

    if (account.executedOn > 0) {
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

  // Update list of txs
  useEffect(() => {

    if (!connection || !publicKey || !multisigAddress || !selectedProgram || !selectedMultisig || !loadingMultisigTxs) {
      return;
    }

    const timeout = setTimeout(() => {

      let transactions: MultisigTransaction[] = [];

      multisigClient.account.transaction
        .all(selectedMultisig.id.toBuffer())
        .then((txs) => {
          for (let tx of txs) {
            let currentOwnerIndex = selectedMultisig.owners
              .findIndex((o: MultisigParticipant) => o.address === publicKey.toBase58());

            let txInfo = Object.assign({}, {
              id: tx.publicKey,
              multisig: tx.account.multisig,
              programId: tx.account.programId,
              signers: tx.account.signers,
              createdOn: new Date(tx.account.createdOn.toNumber() * 1000),
              executedOn: tx.account.executedOn > 0
                ? new Date(tx.account.executedOn.toNumber() * 1000)
                : undefined,
              status: getTransactionStatus(tx.account),
              operation: parseInt(Object.keys(OperationType).filter(k => k === tx.account.operation.toString())[0]),
              accounts: tx.account.accounts,
              didSigned: tx.account.signers[currentOwnerIndex]

            } as MultisigTransaction);
            
            if (txInfo.accounts.some(a => a.pubkey.equals(selectedProgram.pubkey))) {
              transactions.push(txInfo);
            }
          }
          setMultisigPendingTxs(transactions.sort((a, b) => b.createdOn.getTime() - a.createdOn.getTime()));
        })
        .catch(err => {
          console.error(err);
          setMultisigPendingTxs([]);
        })
        .finally(() => setLoadingMultisigTxs(false));
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    publicKey,
    connection,
    selectedProgram,
    multisigAddress,
    selectedMultisig,
    loadingMultisigTxs,
    multisigClient.account.transaction,
    getTransactionStatus
  ]);

  const onRefreshPrograms = useCallback(() => {
    if (!selectedMultisig) { return; }

    setLoadingPrograms(true);
    getProgramsByUpgradeAuthority(selectedMultisig.id)
      .then(programs => {
        consoleOut('programs:', programs, 'blue');
        if (programs && programs.length > 0) {
          setPrograms(programs);
          if (!selectedProgram) {
            setSelectedProgram(programs[0]);
          }
        } else {
          setPrograms([]);
        }
      })
      .catch(err => console.error(err))
      .finally(() => setLoadingPrograms(false));

  }, [
    selectedProgram,
    selectedMultisig,
    getProgramsByUpgradeAuthority,
  ]);

  const getTransactionStatusClass = useCallback((mtx: MultisigTransaction) => {

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

  const getTransactionStatusAction = useCallback((mtx: MultisigTransaction) => {

    if (mtx.status === MultisigTransactionStatus.Pending) {
      return "Pending Approval";
    } 
    
    if (mtx.status === MultisigTransactionStatus.Approved) {
      return "Pending for Execution";
    }

    if (mtx.status === MultisigTransactionStatus.Executed) {
      return "Completed";
    }

    return "Rejected";

  },[]);

  const getTransactionUserStatusAction = useCallback((mtx: MultisigTransaction) => {

    if (mtx.didSigned === undefined) {
      return "Rejected";
    } else if (mtx.didSigned === false) {
      return "Not Signed";
    } else {
      return "Signed"
    }

  },[]);

  const getOperationName = useCallback((op: OperationType) => {

    if (op === OperationType.MintTokens) {
      return "Mint token";
    }
    
    if (op === OperationType.TransferTokens) {
      return "Transfer tokens";
    } 
    
    if (op === OperationType.UpgradeProgram) {
      return "Upgrade program";
    }

    if (op === OperationType.UpgradeIDL) {
      return "Upgrade IDL";
    }

    if (op === OperationType.SetMultisigAuthority) {
      return "Set Authority";
    }

    if (op === OperationType.EditMultisig) {
      return "Edit Multisig";
    }

  },[]);

  const getOperationProgram = useCallback((op: OperationType) => {

    if (op === OperationType.MintTokens || op === OperationType.TransferTokens) {
      return "SPL Token";
    } else if (op === OperationType.UpgradeProgram || op === OperationType.SetMultisigAuthority) {
      return "BPF Upgradable Loader";
    } else if (op === OperationType.UpgradeIDL) {
      return "Serum IDL";
    } else {
      return "Mean Multisig";
    }

  },[]);

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

  const resetTransactionStatus = useCallback(() => {

    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });

  }, [
    setTransactionStatus
  ]);

  const onAfterEveryModalClose = useCallback(() => resetTransactionStatus(),[resetTransactionStatus]);

  // Shows create program modal
  const showCreateProgramModal = useCallback(() => {
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.000010,
      mspPercentFee: 0
    };
    setTransactionFees(fees);
    setCreateProgramModalVisible(true);
  },[]);

  const getTokenIconAndAmount = (tokenAddress: string, amount: any) => {
    const token = tokenList.find(t => t.address === tokenAddress);
    if (!token) {
      return (
        <>
          <span className="info-icon token-icon">
            <Identicon address={tokenAddress} style={{ width: "30", display: "inline-flex" }} />
          </span>
          <span className="info-data">
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
          <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} />
        </span>
        <span className="info-data">
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

  const onTxApproved = useCallback(() => {

    onRefreshPrograms();
    resetTransactionStatus();
    setLoadingMultisigTxs(true);

  },[
    onRefreshPrograms,
    resetTransactionStatus
  ]);

  const onTxExecuted = useCallback(() => {
    
    onRefreshPrograms();
    resetTransactionStatus();
    setLoadingMultisigTxs(true);

  },[
    onRefreshPrograms,
    resetTransactionStatus
  ]);

  const onExecuteApproveTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
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
            customLogger.logError('Multisig Approve transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Multisig Approve transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Multisig Approve transaction failed', { transcript: transactionLog });
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
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            await delay(1000);
            onTxApproved();
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
          customLogger.logWarning('Multisig Finish Approoved transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Multisig Finish Approoved transaction failed', { transcript: transactionLog });
            return false;
          });

      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Multisig Finish Approoved transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Multisig Finish Approoved transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Multisig Finish Approoved transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Multisig Finish Approoved transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Multisig Finish Approoved transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Multisig Finish Approoved transaction failed', { transcript: transactionLog });
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
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            await delay(1000);
            onTxExecuted();
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
    transactionCancelled, 
    transactionFees.blockchainFee, 
    transactionFees.mspFlatFee, 
    transactionStatus.currentOperation, 
    wallet
  ]);

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
            disabled={isTxInProgress() || loadingPrograms}
            onClick={() => {}}>
            {isTxInProgress() && (<LoadingOutlined />)}
            Action 1
          </Button>
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            disabled={isTxInProgress() || loadingPrograms}
            onClick={() => {}}>
            {isTxInProgress() && (<LoadingOutlined />)}
            Action 2
          </Button>
        </Space>
      </>
    );
  }

  const renderTransactions = () => {

    if (!selectedProgram || !selectedMultisig) {
      return null;
    } else if (selectedProgram && selectedMultisig && loadingMultisigTxs) {
      return (
        <div className="mb-2">{t('multisig.multisig-transactions.loading-transactions')}</div>
      );
    } else if (selectedMultisig && !loadingMultisigTxs && multisigPendingTxs.length === 0) {
      return (
        <div className="mb-2">{t('multisig.multisig-vaults.no-transactions')}</div>
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
              {t('multisig.multisig-transactions.column-pending-signatures')}
            </div>
          </div>
        </div>
        {(multisigPendingTxs && multisigPendingTxs.length > 0) && (
          <div className="item-list-body compact">
            {multisigPendingTxs.map(item => {
              return (
                <div style={{padding: '3px 0px'}} className="item-list-row" key={item.id.toBase58()}>
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
                    { 
                      item.status === MultisigTransactionStatus.Pending && (
                        <span className="align-middle" style={{ marginRight:5 }} >
                        {`${item.signers.filter(s => s === true).length}/${selectedMultisig.threshold}`}
                        </span>
                      )
                    }
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

  const renderProgramMeta = () => {
    return (
      <>
      {selectedProgram && (
        <div className="stream-fields-container">

          {/* Row 1 */}
          <div className="mb-3">
            <Row>
              <Col span={12}>
                <div className="transaction-detail-row">
                  <span className="info-label">
                    XXxxXXxxXX
                  </span>
                </div>
                <div className="transaction-detail-row">
                  {/* {
                    getTokenIconAndAmount(
                      selectedProgram.mint.toBase58(),
                      selectedProgram.amount
                    )
                  } */}
                </div>
              </Col>
              <Col span={12}>
                <div className="transaction-detail-row">
                  <span className="info-label">
                    Multisig Authority
                  </span>
                </div>
                <div className="transaction-detail-row">
                  <span className="info-icon">
                    <IconShieldOutline className="mean-svg-icons" />
                  </span>
                  {/* <Link to="/multisig" className="info-data flex-row wrap align-items-center simplelink underline-on-hover"
                    onClick={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      setHighLightableMultisigId(selectedProgram.owner.toBase58());
                      navigate('/multisig');
                    }}>
                    {shortenAddress(selectedProgram.owner.toBase58(), 6)}
                    <div className="icon-button-container">
                      <Button
                        type="default"
                        shape="circle"
                        size="middle"
                        icon={<CopyOutlined />}
                        onClick={() => copyAddressToClipboard(selectedProgram.owner.toBase58())}
                      />
                    </div>
                  </Link> */}
                </div>
              </Col>
            </Row>
          </div>

        </div>
      )}
      </>
    );
  };

  const renderMultisigPrograms = (
    <>
    {programs && programs.length ? (
      programs.map((item, index) => {
        return (
          <p>Programita {index + 1}: {shortenAddress(item.pubkey.toBase58(), 8)}</p>
        );
        // const token = getTokenByMintAddress(item.mint.toBase58());
        // const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
        //   event.currentTarget.src = FALLBACK_COIN_IMAGE;
        //   event.currentTarget.className = "error";
        // };
        // const onVaultSelected = (ev: any) => {
        //   setSelectedProgram(item);
        //   setDtailsPanelOpen(true);
        //   const resume = `\naddress: ${item.address.toBase58()}\nmint: ${token ? token.address : item.mint.toBase58()}`;
        //   consoleOut('resume:', resume, 'blue');
        //   consoleOut('selected vault:', item, 'blue');
        //   setLoadingMultisigTxs(true);
        // };
        // return (
        //   <div 
        //     key={`${index + 50}`} 
        //     onClick={onVaultSelected}
        //     className={
        //       `transaction-list-row ${
        //         selectedProgram && selectedProgram.address && selectedProgram.address.equals(item.address)
        //           ? 'selected' 
        //           : ''
        //       }`
        //     }>
        //     <div className="icon-cell">
        //       <div className="token-icon">
        //         {token && token.logoURI ? (
        //           <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} onError={imageOnErrorHandler} />
        //         ) : (
        //           <Identicon address={item.mint.toBase58()} style={{
        //             width: "28px",
        //             display: "inline-flex",
        //             height: "26px",
        //             overflow: "hidden",
        //             borderRadius: "50%"
        //           }} />
        //         )}
        //       </div>
        //     </div>
        //     <div className="description-cell">
        //       <div className="title text-truncate">{token ? token.symbol : `Unknown token [${shortenAddress(item.mint.toBase58(), 6)}]`}</div>
        //       <div className="subtitle text-truncate">{shortenAddress(item.address.toBase58(), 8)}</div>
        //     </div>
        //     <div className="rate-cell">
        //       <div className="rate-amount text-uppercase">
        //         {getTokenAmountAndSymbolByTokenAddress(
        //           toUiAmount(new BN(item.amount), token?.decimals || 6),
        //           token ? token.address as string : '',
        //           true
        //         )}
        //       </div>
        //     </div>
        //   </div>
        // );
      })
    ) : (
      <>
        <div className="h-100 flex-center">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{publicKey
            ? t('multisig.multisig-programs.no-programs')
            : t('multisig.multisig-programs.not-connected')}</p>} />
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
                <IconCodeBlock className="mean-svg-icons mr-1" />
                <span className="title">
                  {programs && selectedMultisig
                    ? t('multisig.multisig-programs.screen-title', {
                        multisigName: selectedMultisig.label,
                        programCount: programs ? programs.length : 0
                      })
                    : t('multisig.multisig-programs.screen-title-no-programs')
                  }
                </span>
                <Tooltip placement="bottom" title={t('multisig.multisig-programs.refresh-tooltip')}>
                  <div className={`transaction-stats ${loadingPrograms ? 'click-disabled' : 'simplelink'}`} onClick={onRefreshPrograms}>
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
                  <Spin spinning={loadingPrograms}>
                    {renderMultisigPrograms}
                  </Spin>
                </div>
                <div className="bottom-ctas">
                  <div className="create-stream">
                    <Button
                      block
                      type="primary"
                      shape="round"
                      disabled={!publicKey || !selectedMultisig}
                      onClick={showCreateProgramModal}>
                      {publicKey
                        ? t('multisig.multisig-programs.cta-create-program')
                        : t('transactions.validation.not-connected')
                      }
                    </Button>
                  </div>
                </div>
              </div>

            </div>

            <div className="meanfi-two-panel-right">
              <div className="meanfi-panel-heading">
                <span className="title">{t('multisig.multisig-programs.program-detail-heading')}</span>
              </div>

              {/**
               * <div className={`stream-details-data-wrapper vertical-scroll ${(loadingPrograms || !selectedProgram) ? 'h-100 flex-center' : ''}`}>
               */}

              <div className="inner-container">
                {publicKey ? (
                  <>
                    <div className={`stream-details-data-wrapper vertical-scroll`}>
                      <Spin spinning={loadingPrograms}>

                        {/* TODO: Use this for now until the refactor is finished */}
                        {renderCtaRow()}
                        {/* But remove it when finished so the CTAs are inside of the below condition */}

                        {/* {selectedProgram && (
                          <>
                            {renderProgramMeta()}
                            <Divider className="activity-divider" plain></Divider>
                            {renderCtaRow()}
                            <Divider className="activity-divider" plain></Divider>
                            {renderTransactions()}
                          </>
                        )} */}
                      </Spin>

                      {/* {!loadingPrograms && (
                        <>
                        {(!programs || programs.length === 0) && !selectedProgram && (
                          <div className="h-100 flex-center">
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{t('multisig.multisig-programs.no-program-loaded')}</p>} />
                          </div>
                        )}
                        </>
                      )} */}

                    </div>
                    {selectedProgram && (
                      <div className="stream-share-ctas">
                        <span className="copy-cta" onClick={() => copyAddressToClipboard(selectedProgram.pubkey.toBase58())}>VAULT ADDRESS: {selectedProgram.pubkey.toBase58()}</span>
                        <a className="explorer-cta" target="_blank" rel="noopener noreferrer"
                          href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${selectedProgram.pubkey.toBase58()}${getSolanaExplorerClusterParam()}`}>
                          <IconExternalLink className="mean-svg-icons" />
                        </a>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <span>&nbsp;</span>
                    {/* <div className="h-100 flex-center">
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{t('treasuries.treasury-list.not-connected')}</p>} />
                    </div> */}
                  </>
                )}
              </div>

            </div>

          </div>

        </div>

      </div>

      {(isCreateProgramModalVisible && selectedMultisig) && (
        <MultisigCreateProgramModal
          isVisible={isCreateProgramModalVisible}
          handleOk={() => setCreateProgramModalVisible(false)}
          handleClose={() => setCreateProgramModalVisible(false)}
          handleAfterClose={() => onAfterEveryModalClose()}
          selectedMultisig={selectedMultisig}
        />
      )}

      <PreFooter />
    </>
  );

};
