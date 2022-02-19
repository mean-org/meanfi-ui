import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSolanaExplorerClusterParam, useConnectionConfig } from '../../contexts/connection';
import { TransactionStatusContext } from '../../contexts/transaction-status';
import { useWallet } from '../../contexts/wallet';
import { AppStateContext } from '../../contexts/appstate';
import { Button, Col, Divider, Empty, Modal, Row, Space, Spin, Tooltip } from 'antd';
import { ArrowLeftOutlined, CheckOutlined, CopyOutlined, InfoCircleOutlined, LoadingOutlined, ReloadOutlined } from '@ant-design/icons';
import { IconCodeBlock, IconExternalLink, IconShieldOutline } from '../../Icons';
import { PreFooter } from '../../components/PreFooter';
import { ConfirmOptions, Connection, Keypair, LAMPORTS_PER_SOL, MemcmpFilter, PublicKey, SYSVAR_CLOCK_PUBKEY, SYSVAR_RENT_PUBKEY, Transaction } from '@solana/web3.js';
import { Program, Provider } from '@project-serum/anchor';
import MultisigIdl from "../../models/mean-multisig-idl";
import { MEAN_MULTISIG, NATIVE_SOL_MINT } from '../../utils/ids';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { consoleOut, copyText, delay, getReadableDate, getShortDate, getTransactionOperationDescription, getTransactionStatusForLogs, isDev, isLocal } from '../../utils/ui';
import { Identicon } from '../../components/Identicon';
import { formatThousands, getTokenAmountAndSymbolByTokenAddress, getTxIxResume, shortenAddress, toUiAmount } from '../../utils/utils';
import { MultisigV2, MultisigTransaction, MultisigTransactionStatus, MultisigParticipant, Multisig } from '../../models/multisig';
import { TransactionFees } from '@mean-dao/msp';
import { useNativeAccount } from '../../contexts/accounts';
import { OperationType, TransactionStatus } from '../../models/enums';
import { customLogger } from '../..';
import { BN } from 'bn.js';
import { notify } from '../../utils/notifications';
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from '../../constants';
import { MultisigCreateProgramModal } from '../../components/MultisigCreateProgramModal';
import { ProgramAccounts } from '../../utils/accounts';
import useWindowSize from '../../hooks/useWindowResize';
import { isError } from '../../utils/transactions';
import { encodeInstruction } from '../../models/idl';
import { MultisigUpgradeProgramModal } from '../../components/MultisigUpgradeProgramModal';
import { MultisigUpgradeIDLModal } from '../../components/MultisigUpgradeIDL';
import { MultisigSetProgramAuthModal } from '../../components/MultisigSetProgramAuthModal';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const MultisigProgramsView = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { account } = useNativeAccount();
  const connectionConfig = useConnectionConfig();
  const { publicKey, wallet, connected } = useWallet();
  const {
    theme,
    tokenList,
    isWhitelisted,
    detailsPanelOpen,
    transactionStatus,
    refreshTokenBalance,
    setTransactionStatus,
    setHighLightableMultisigId,
    previousWalletConnectState,
    setDtailsPanelOpen,
  } = useContext(AppStateContext);
  const {
    fetchTxInfoStatus,
    lastSentTxSignature,
    lastSentTxOperationType,
    startFetchTxSignatureInfo,
    clearTransactionStatusContext,
  } = useContext(TransactionStatusContext);
  const { t } = useTranslation('common');
  const { width } = useWindowSize();
  const [nativeBalance, setNativeBalance] = useState(0);
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [multisigAddress, setMultisigAddress] = useState('');

  const [programs, setPrograms] = useState<ProgramAccounts[] | undefined>(undefined);
  const [selectedProgram, setSelectedProgram] = useState<ProgramAccounts | undefined>(undefined);
  const [loadingPrograms, setLoadingPrograms] = useState(true);

  const [multisigAccounts, setMultisigAccounts] = useState<(MultisigV2 | Multisig)[]>([]);
  const [selectedMultisig, setSelectedMultisig] = useState<MultisigV2 | undefined>(undefined);
  const [loadingMultisigAccounts, setLoadingMultisigAccounts] = useState(true);

  const [multisigPendingTxs, setMultisigPendingTxs] = useState<MultisigTransaction[]>([]);
  const [highlightedMultisigTx, sethHighlightedMultisigTx] = useState<MultisigTransaction | undefined>();
  const [loadingMultisigTxs, setLoadingMultisigTxs] = useState(true);

  const [isBusy, setIsBusy] = useState(false);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [transactionFees, setTransactionFees] = useState<TransactionFees>({
    blockchainFee: 0, mspFlatFee: 0, mspPercentFee: 0
  });
  const [ongoingOperation, setOngoingOperation] = useState<OperationType | undefined>(undefined);
  const [retryOperationPayload, setRetryOperationPayload] = useState<any>(undefined);

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

  // Parse query params
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('multisig')) {
      const msAddress = params.get('multisig');
      setMultisigAddress(msAddress || '');
      consoleOut('multisigAddress:', msAddress, 'blue');
    }
  }, [location]);

  /////////////////
  //   Getters   //
  /////////////////

  const isCanvasTight = useCallback(() => {
    return width < 576 || (width >= 768 && width < 960);
  }, [width]);

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

  const getTxInitiator = useCallback((mtx: MultisigTransaction): MultisigParticipant | undefined => {
    if (!selectedMultisig) { return undefined; }

    const owners: MultisigParticipant[] = (selectedMultisig as MultisigV2).owners;
    const initiator = owners && owners.length > 0
      ? owners.find(o => o.address === mtx.proposer?.toBase58())
      : undefined;

    return initiator;
  }, [selectedMultisig]);

  const isUserTxInitiator = useCallback((mtx: MultisigTransaction): boolean => {
    if (!selectedMultisig || !publicKey) { return false; }

    const initiator = getTxInitiator(mtx);

    if (initiator && initiator.address === publicKey.toBase58()) {
      return true;
    }

    return false;

  }, [
    publicKey,
    selectedMultisig,
    getTxInitiator
  ]);

  const getTxSignedCount = useCallback((mtx: MultisigTransaction) => {
    if (mtx && mtx.signers) {
      return mtx.signers.filter((s: boolean) => s === true).length;
    }
    return 0;
  }, []);

  const isTxPendingApproval = useCallback(() => {
    if (highlightedMultisigTx) {
      if (highlightedMultisigTx.status === MultisigTransactionStatus.Pending) {
        return true;
      }
    }
    return false;
  }, [highlightedMultisigTx]);

  const isTxPendingExecution = useCallback(() => {
    if (highlightedMultisigTx) {
      if (highlightedMultisigTx.status === MultisigTransactionStatus.Approved) {
        return true;
      }
    }
    return false;
  }, [highlightedMultisigTx]);

  const isTxRejected = useCallback(() => {
    if (highlightedMultisigTx) {
      if (highlightedMultisigTx.status === MultisigTransactionStatus.Rejected) {
        return true;
      }
    }
    return false;
  }, [highlightedMultisigTx]);

  const isTxPendingApprovalOrExecution = useCallback(() => {
    if (highlightedMultisigTx) {
      if (highlightedMultisigTx.status === MultisigTransactionStatus.Pending ||
          highlightedMultisigTx.status === MultisigTransactionStatus.Approved) {
        return true;
      }
    }
    return false;
  }, [highlightedMultisigTx]);

  const isUserInputNeeded = useCallback(() => {
    if (highlightedMultisigTx) {
      if (highlightedMultisigTx.executedOn) { // Executed
        return false;
      } else if (highlightedMultisigTx.didSigned === undefined) { // Rejected
        return false;
      } else if (highlightedMultisigTx.didSigned === false) { // Not yet signed
        return true;
      } else {
        return isTxPendingExecution() // Signed but
          ? true    // Tx still needs signing or execution
          : false;  // Tx completed, nothing to do
      }
    }

    return false;

  }, [highlightedMultisigTx, isTxPendingExecution]);

  const getTxUserStatusClass = useCallback((mtx: MultisigTransaction) => {

    if (mtx.executedOn) {
      return "";
    } else if (mtx.didSigned === undefined) {
      return "fg-red";
    } else if (mtx.didSigned === false) {
      return theme === 'light' ? "fg-light-orange" : "fg-yellow";
    } else {
      return theme === 'light' ? "fg-green" : "fg-success"
    }

  },[theme]);

  const getTxApproveMainCtaLabel = useCallback(() => {

    const busyLabel = isTxPendingExecution()
      ? 'Executing transaction'
      : isTxPendingApproval()
        ? 'Approving transaction'
        : '';

    const iddleLabel = isTxPendingExecution()
      ? 'Execute transaction'
      : isTxPendingApproval()
        ? 'Approve transaction'
        : '';

    return isBusy
      ? busyLabel
      : transactionStatus.currentOperation === TransactionStatus.Iddle
        ? iddleLabel
        : transactionStatus.currentOperation === TransactionStatus.TransactionFinished
          ? t('general.cta-finish')
          : t('general.refresh');
  }, [
    isBusy,
    transactionStatus.currentOperation,
    isTxPendingExecution,
    isTxPendingApproval,
    t,
  ]);

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

  const getTransactionUserStatusAction = useCallback((mtx: MultisigTransaction, longStatus = false) => {

    if (mtx.executedOn) {
      return "";
    } else if (mtx.didSigned === undefined) {
      return longStatus ? "You have rejected this transaction" : "Rejected";
    } else if (mtx.didSigned === false) {
      return !longStatus
        ? "Not Signed"
        : mtx.status === MultisigTransactionStatus.Approved
          ? "You did NOT sign this transaction"
          : "You have NOT signed this transaction";
    } else {
      return longStatus ? "You have signed this transaction" : "Signed";
    }

  },[]);

  const getTransactionUserStatusActionClass = useCallback((mtx: MultisigTransaction) => {

    if (mtx.executedOn) {
      return "";
    } else if (mtx.didSigned === undefined) {
      return "fg-red";
    } else if (mtx.didSigned === false) {
      return theme === 'light' ? "fg-light-orange font-bold" : "fg-yellow font-bold";
    } else {
      return theme === 'light' ? "fg-green" : "fg-success"
    }

  },[theme]);

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

  const isTxInProgress = useCallback((): boolean => {
    return isBusy || fetchTxInfoStatus === "fetching" ? true : false;
  }, [
    isBusy,
    fetchTxInfoStatus,
  ]);

  const isSuccess = (): boolean => {
    return transactionStatus.currentOperation === TransactionStatus.TransactionFinished;
  }

  const isUpgradingProgram = useCallback((): boolean => {

    return ( 
      fetchTxInfoStatus === "fetching" && 
      lastSentTxOperationType === OperationType.UpgradeProgram
    );

  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  const isUpgradingIDL = useCallback((): boolean => {

    return ( 
      fetchTxInfoStatus === "fetching" && 
      lastSentTxOperationType === OperationType.UpgradeIDL
    );

  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  const isSettingAuthority = useCallback((): boolean => {

    return ( 
      fetchTxInfoStatus === "fetching" && 
      lastSentTxOperationType === OperationType.SetMultisigAuthority
    );

  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  const getOperationName = useCallback((op: OperationType) => {

    switch (op) {
      case OperationType.MintTokens:
        return "Mint token";
      case OperationType.TransferTokens:
        return "Transfer tokens";
      case OperationType.UpgradeProgram:
        return "Upgrade program";
      case OperationType.UpgradeIDL:
        return "Upgrade IDL";
      case OperationType.SetMultisigAuthority:
        return "Set Multisig Authority";
      case OperationType.EditMultisig:
        return "Edit Multisig";
      case OperationType.TreasuryCreate:
        return "Create Treasury";
      case OperationType.TreasuryClose:
        return "Close Treasury";
      case OperationType.TreasuryRefreshBalance:
        return "Refresh Treasury Data";
      case OperationType.CreateVault:
        return "Create Vault";
      case OperationType.SetVaultAuthority:
        return "Change Vault Authority";
      case OperationType.StreamCreate:
        return "Create Stream";
      default:
        return '';
    }

  },[]);

  const getOperationProgram = useCallback((op: OperationType) => {

    if (op === OperationType.MintTokens || op === OperationType.TransferTokens || op === OperationType.SetVaultAuthority) {
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
      op === OperationType.StreamCreate
    ) {
      return "Mean MSP";
    } else {
      return "Mean Multisig";
    }

  },[]);

  ////////////////////////////////////////
  // Business logic & Data management   //
  ////////////////////////////////////////

  const readAllMultisigAccounts = useCallback(async (wallet: PublicKey) => {

    let accounts: any[] = [];
    let multisigV2Accs = await multisigClient.account.multisigV2.all();
    let filteredAccs = multisigV2Accs.filter((a: any) => {
      if (a.account.owners.filter((o: any) => o.address.equals(wallet)).length) { return true; }
      return false;
    });

    accounts.push(...filteredAccs);
    let multisigAccs = await multisigClient.account.multisig.all();
    filteredAccs = multisigAccs.filter((a: any) => {
      if (a.account.owners.filter((o: PublicKey) => o.equals(wallet)).length) { return true; }
      return false;
    });

    accounts.push(...filteredAccs);

    return accounts;
    
  }, [
    multisigClient.account.multisig, 
    multisigClient.account.multisigV2
  ]);

  const parseMultisigV2Account = (info: any) => {
    return PublicKey
      .findProgramAddress([info.publicKey.toBuffer()], MEAN_MULTISIG)
      .then(k => {

        let address = k[0];
        let owners: MultisigParticipant[] = [];
        let labelBuffer = Buffer
          .alloc(info.account.label.length, info.account.label)
          .filter(function (elem, index) { return elem !== 0; }
        );

        let filteredOwners = info.account.owners.filter((o: any) => !o.address.equals(PublicKey.default));

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

        return {
          id: info.publicKey,
          version: info.account.version,
          label: new TextDecoder().decode(labelBuffer),
          address,
          nounce: info.account.nonce,
          ownerSeqNumber: info.account.ownerSetSeqno,
          threshold: info.account.threshold.toNumber(),
          pendingTxsAmount: info.account.pendingTxs.toNumber(),
          createdOnUtc: new Date(info.account.createdOn.toNumber() * 1000),
          owners: owners

        } as MultisigV2;
      })
      .catch(err => { 
        consoleOut('error', err, 'red');
        return undefined;
      });
  };

  const parseMultisiAccount = (info: any) => {
    return PublicKey
      .findProgramAddress([info.publicKey.toBuffer()], MEAN_MULTISIG)
      .then(k => {

        let address = k[0];
        let owners: MultisigParticipant[] = [];
        let labelBuffer = Buffer
          .alloc(info.account.label.length, info.account.label)
          .filter(function (elem, index) { return elem !== 0; }
        );

        for (let i = 0; i < info.account.owners.length; i ++) {
          owners.push({
            address: info.account.owners[i].toBase58(),
            name: info.account.ownersNames && info.account.ownersNames.length && info.account.ownersNames[i].length > 0 
              ? new TextDecoder().decode(
                  Buffer.from(
                    Uint8Array.of(
                      ...info.account.ownersNames[i].filter((b: any) => b !== 0)
                    )
                  )
                )
              : ""
          } as MultisigParticipant);
        }

        return {
          id: info.publicKey,
          version: 1,
          label: new TextDecoder().decode(labelBuffer),
          address,
          nounce: info.account.nonce,
          ownerSeqNumber: info.account.ownerSetSeqno,
          threshold: info.account.threshold.toNumber(),
          pendingTxsAmount: info.account.pendingTxs.toNumber(),
          createdOnUtc: new Date(info.account.createdOn.toNumber() * 1000),
          owners: owners

        } as Multisig;
      })
      .catch(err => { 
        consoleOut('error', err, 'red');
        return undefined;
      });
  };

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

      const foundProgram = {
        pubkey: executableAccounts[0].pubkey,
        owner: executableAccounts[0].account.owner,
        executable: executableData,
        upgradeAuthority: upgradeAuthority,
        size: executableDataAccounts[i].account.data.byteLength

      } as ProgramAccounts;

      console.log(`Upgrade Authority: ${upgradeAuthority} --> Executable Data: ${executableData} --> Program: ${foundProgram}`);

      programs.push(foundProgram);

    }

    console.log(`${programs.length} programs found!`);

    return programs;

  }, [connection]);

  const refreshPrograms = useCallback(() => {
    if (!selectedMultisig) { return; }

    consoleOut('Calling getProgramsByUpgradeAuthority from refreshPrograms...', '', 'blue');

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
          setSelectedProgram(undefined);
        }
      })
      .catch(err => console.error(err))
      .finally(() => setLoadingPrograms(false));

  }, [
    selectedProgram,
    selectedMultisig,
    getProgramsByUpgradeAuthority,
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

  // Refresh the multisig accounts list
  useEffect(() => {

    if (!connection || !publicKey || !multisigClient || !loadingMultisigAccounts) {
      setLoadingMultisigAccounts(false);
      return;
    }

    const timeout = setTimeout(() => {

      readAllMultisigAccounts(publicKey)
        .then((allInfo: any) => {
          let multisigInfoArray: (MultisigV2 | Multisig)[] = [];
          for (let info of allInfo) {
            let parsePromise: any;
            if (info.account.version && info.account.version === 2) {
              parsePromise = parseMultisigV2Account;
            } else {
              parsePromise = parseMultisiAccount;
            }
            if (parsePromise) {
              parsePromise(info)
                .then((multisig: any) =>{
                  if (multisig) {
                    multisigInfoArray.push(multisig);
                  }
                })
                .catch((err: any) => {
                  console.error(err);
                  setLoadingMultisigAccounts(false);
                });
            }
          }
          setTimeout(() => {
            multisigInfoArray.sort((a: any, b: any) => b.createdOnUtc.getTime() - a.createdOnUtc.getTime());
            setMultisigAccounts(multisigInfoArray);
            consoleOut('multisigs:', multisigInfoArray, 'blue');
            setLoadingMultisigAccounts(false);
          });
        })
        .catch(err => {
          console.error(err);
          setLoadingMultisigAccounts(false);
        });
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connection,
    loadingMultisigAccounts,
    multisigClient,
    publicKey,
    readAllMultisigAccounts,
  ]);

  // Set selectedMultisig based on the passed-in multisigAddress in query params
  useEffect(() => {

    if (!publicKey || !multisigAddress || !multisigAccounts || multisigAccounts.length === 0) {
      return;
    }

    const timeout = setTimeout(() => {
      consoleOut(`try to select multisig ${multisigAddress} from list`, multisigAccounts, 'blue');
      const selected = multisigAccounts.find(m => m.id.toBase58() === multisigAddress);
      if (selected) {
        consoleOut('selectedMultisig:', selected, 'blue');
        setSelectedMultisig(selected);
      }
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    publicKey,
    multisigAddress,
    multisigAccounts,
  ]);

  // Get Programs
  useEffect(() => {

    if (!connection || !publicKey || !selectedMultisig || !selectedMultisig.address || !loadingPrograms) {
      return;
    }

    const timeout = setTimeout(() => {

      consoleOut('Calling getProgramsByUpgradeAuthority from useEffect...', '', 'blue');

      getProgramsByUpgradeAuthority(selectedMultisig.address)
        .then(programs => {
          consoleOut('programs:', programs, 'blue');
          if (programs && programs.length > 0) {
            setPrograms(programs);
            if (!selectedProgram) {
              setSelectedProgram(programs[0]);
            }
          } else {
            setPrograms([]);
            setSelectedProgram(undefined);
          }
        })
        .catch(err => console.error(err))
        .finally(() => setLoadingPrograms(false));
    });

    return () => {
      clearTimeout(timeout);
    }

  },[
    publicKey,
    connection,
    loadingPrograms,
    selectedProgram,
    selectedMultisig,
    getProgramsByUpgradeAuthority,
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
              proposer: tx.account.proposer,
              didSigned: tx.account.signers[currentOwnerIndex],
              keypairs: tx.account.keypairs
                .map((k: any) => {
                  try {
                    return Keypair.fromSecretKey(Uint8Array.from(Buffer.from(k)));
                  } catch {
                    return undefined;
                  }
                })
                .filter((k: any) => k !== undefined)

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

  // Load/Unload multisig on wallet connect/disconnect
  useEffect(() => {
    if (previousWalletConnectState !== connected) {
      if (!previousWalletConnectState && connected && publicKey) {
        consoleOut('User is connecting...', publicKey.toBase58(), 'green');
        setLoadingMultisigAccounts(true);
        setLoadingPrograms(true);
        setLoadingMultisigTxs(true);
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'green');
        setMultisigAccounts([]);
        setSelectedMultisig(undefined);
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
    if (!publicKey) { return; }

    if (multisigAddress && lastSentTxSignature && (fetchTxInfoStatus === "fetched" || fetchTxInfoStatus === "error")) {
      clearTransactionStatusContext();
      setLoadingMultisigAccounts(true);
      setLoadingMultisigTxs(true);
      setLoadingPrograms(true);
      refreshPrograms();
    }
  }, [
    publicKey,
    multisigAddress,
    fetchTxInfoStatus,
    lastSentTxSignature,
    // lastSentTxOperationType,
    clearTransactionStatusContext,
    refreshPrograms,
  ]);

  ////////////////////////////////
  //   Operations and Actions   //
  ////////////////////////////////

  const isUnderDevelopment = () => {
    return isLocal() || (isDev() && isWhitelisted) ? true : false;
  }

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

  const refreshPage = useCallback(() => {
    window.location.reload();
  },[])

  const resetTransactionStatus = useCallback(() => {

    setIsBusy(false);
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });

  }, [
    setTransactionStatus
  ]);

  ////////////////
  //   Events   //
  ////////////////

  const onAfterEveryModalClose = useCallback(() => {
    consoleOut('onAfterEveryModalClose called!', '', 'crimson');
    resetTransactionStatus();
  },[resetTransactionStatus]);

  // Create program modal
  const [isCreateProgramModalVisible, setCreateProgramModalVisible] = useState(false);
  const showCreateProgramModal = useCallback(() => {
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.000010,
      mspPercentFee: 0
    };
    setTransactionFees(fees);
    setCreateProgramModalVisible(true);
  },[]);

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

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.UpgradeProgram);
    setRetryOperationPayload(data);
    setIsBusy(true);

    const upgradeProgram = async (data: any) => {

      if (!multisigClient || !selectedMultisig || !publicKey) { return null; }

      const [multisigSigner] = await PublicKey.findProgramAddress(
        [selectedMultisig.id.toBuffer()],
        multisigClient.programId
      );

      const dataBuffer = Buffer.from([3, 0, 0, 0]);
      const spill = multisigClient.provider.wallet.publicKey;
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
        { pubkey: multisigSigner, isWritable: false, isSigner: false },
      ];

      const BPF_LOADER_UPGRADEABLE_PID = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
      const txSize = 1000; // TODO: tighter bound.
      const transaction = Keypair.generate();
      const createIx = await multisigClient.account.transaction.createInstruction(
        transaction,
        txSize
      );

      const tx = multisigClient.transaction.createTransaction(
        BPF_LOADER_UPGRADEABLE_PID,
        OperationType.UpgradeProgram,
        [],
        ixAccounts,
        dataBuffer,
        {
          accounts: {
            multisig: selectedMultisig.id,
            transaction: transaction.publicKey,
            proposer: publicKey
          },
          preInstructions: [createIx],
          signers: [transaction],
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
            startFetchTxSignatureInfo(signature, "finalized", OperationType.UpgradeProgram);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            await delay(1000);
            onProgramUpgraded();
            setOngoingOperation(undefined);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    clearTransactionStatusContext, 
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

  // Showw upgrade IDL modal
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

  const onExecuteUpgradeIDLTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.UpgradeIDL);
    setRetryOperationPayload(data);
    setIsBusy(true);

    const upgradeIDL = async (data: any) => {

      if (!multisigClient || !selectedMultisig || !publicKey) { return null; }

      const [multisigSigner] = await PublicKey.findProgramAddress(
        [selectedMultisig.id.toBuffer()],
        multisigClient.programId
      );

      const programAddr = new PublicKey(data.programAddress);
      const bufferAddr = new PublicKey(data.idlBufferAddress);
      const idlAddr = new PublicKey(data.programIDLAddress);
      const dataBuffer = encodeInstruction({ setBuffer: {} })

      const ixAccounts = [
        {
          pubkey: bufferAddr,
          isWritable: true,
          isSigner: false,
        },
        { pubkey: idlAddr, isWritable: true, isSigner: false },
        { pubkey: multisigSigner, isWritable: true, isSigner: false },
      ];

      const txSize = 1000; // TODO: tighter bound.
      const transaction = Keypair.generate();
      const upgradeIdlTx = await multisigClient.account.transaction.createInstruction(
        transaction,
        txSize
      );

      const tx = multisigClient.transaction.createTransaction(
        programAddr,
        OperationType.UpgradeIDL,
        [],
        ixAccounts,
        dataBuffer,
        {
          accounts: {
            multisig: selectedMultisig.id,
            transaction: transaction.publicKey,
            proposer: publicKey
          },          
          preInstructions: [upgradeIdlTx],
          signers: [transaction],
        }
      );

      tx.feePayer = publicKey;
      const { blockhash } = await connection.getRecentBlockhash("finalized");
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
            startFetchTxSignatureInfo(signature, "finalized", OperationType.UpgradeIDL);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            await delay(1000);
            onIDLUpgraded();
            setOngoingOperation(undefined);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    clearTransactionStatusContext, 
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

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.SetMultisigAuthority);
    setRetryOperationPayload(data);
    setIsBusy(true);

    const setProgramAuth = async (data: any) => {

      if (!multisigClient || !selectedMultisig || !publicKey) { return null; }

      const [multisigSigner] = await PublicKey.findProgramAddress(
        [selectedMultisig.id.toBuffer()],
        multisigClient.programId
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
      const txSize = 1000;
      const transaction = Keypair.generate();
      const createIx = await multisigClient.account.transaction.createInstruction(
        transaction,
        txSize
      );

      const tx = multisigClient.transaction.createTransaction(
        BPF_LOADER_UPGRADEABLE_PID,
        OperationType.SetMultisigAuthority,
        [],
        ixAccounts,
        ixData,
        {
          accounts: {
            multisig: selectedMultisig.id,
            transaction: transaction.publicKey,
            proposer: publicKey
          },
          preInstructions: [createIx],
          signers: [transaction]
        }
      );

      tx.feePayer = publicKey;
      const { blockhash } = await connection.getRecentBlockhash("finalized");
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
            startFetchTxSignatureInfo(signature, "finalized", OperationType.SetMultisigAuthority);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            await delay(1000);
            onProgramAuthSet();
            setOngoingOperation(undefined);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    clearTransactionStatusContext, 
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


  // Common Multisig Approve / Execute logic

  const onTxExecuted = useCallback(() => {

  },[]);

  const onExecuteApproveTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
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
      const { blockhash } = await connection.getRecentBlockhash("finalized");
      tx.recentBlockhash = blockhash;
  
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
            console.error('approveTx error:', error);
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
            startFetchTxSignatureInfo(signature, "finalized", OperationType.ApproveTransaction);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            // TODO: Translate
            notify({
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
    multisigClient.transaction,
    transactionFees.mspFlatFee,
    transactionFees.blockchainFee,
    transactionStatus.currentOperation,
    clearTransactionStatusContext,
    startFetchTxSignatureInfo,
    setTransactionStatus,
  ]);

  const onExecuteFinishTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setRetryOperationPayload(data);
    setIsBusy(true);

    const finishTx = async (data: any) => {

      if (!data.transaction || !publicKey) { return null; }

      const [multisigSigner] = await PublicKey.findProgramAddress(
        [data.transaction.multisig.toBuffer()],
        multisigClient.programId
      );

      let remainingAccounts = data.transaction.accounts
        // Change the signer status on the vendor signer since it's signed by the program, not the client.
        .map((meta: any) =>
          meta.pubkey.equals(multisigSigner)
            ? { ...meta, isSigner: false }
            : meta
        )
        .concat({
          pubkey: data.transaction.programId,
          isWritable: false,
          isSigner: false,
        });

      const txSigners = data.transaction.keypairs;
        
      let tx = multisigClient.transaction.executeTransaction({
          accounts: {
            multisig: data.transaction.multisig,
            multisigSigner: multisigSigner,
            transaction: data.transaction.id,
          },
          remainingAccounts: remainingAccounts,
          signers: txSigners
        }
      );
  
      tx.feePayer = publicKey;
      const { blockhash } = await multisigClient.provider.connection.getRecentBlockhash("finalized");
      tx.recentBlockhash = blockhash;
      
      if (txSigners.length) {
        tx.partialSign(...txSigners);
      }
  
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
          customLogger.logWarning('Finish Approved transaction failed', { transcript: transactionLog });
          return false;
        }

        return await finishTx(payload)
          .then(value => {
            if (!value) { return false; }
            consoleOut('Multisig finishTx returned transaction:', value);
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
            console.error('Multisig finishTx error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`
            });
            customLogger.logError('Finish Approved transaction failed', { transcript: transactionLog });
            return false;
          });

      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Finish Approved transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Finish Approved transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Finish Approved transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Finish Approved transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Finish Approved transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Finish Approved transaction failed', { transcript: transactionLog });
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
            startFetchTxSignatureInfo(signature, "finalized", OperationType.ExecuteTransaction);
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
    wallet,
    publicKey,
    connection,
    nativeBalance,
    transactionCancelled,
    multisigClient.programId,
    multisigClient.transaction,
    transactionFees.mspFlatFee,
    transactionFees.blockchainFee,
    multisigClient.provider.connection,
    transactionStatus.currentOperation,
    clearTransactionStatusContext,
    startFetchTxSignatureInfo,
    setTransactionStatus,
    onTxExecuted,
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
    setMultisigActionTransactionModalVisible(true);
  }, []);

  const onAcceptMultisigActionModal = (item: MultisigTransaction) => {
    consoleOut('onAcceptMultisigActionModal:', item, 'blue');
    if (item.status === MultisigTransactionStatus.Pending) {
      onExecuteApproveTx({ transaction: item });
    } if (item.status === MultisigTransactionStatus.Approved) {
      onExecuteFinishTx({ transaction: item })
    }
  };

  const onCloseMultisigActionModal = () => {
    setMultisigActionTransactionModalVisible(false);
    sethHighlightedMultisigTx(undefined);
    resetTransactionStatus();
  };

  const onTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      setMultisigActionTransactionModalVisible(false);
    }
    sethHighlightedMultisigTx(undefined);
    resetTransactionStatus();
  }

  ///////////////
  // Rendering //
  ///////////////

  const renderCtaRow = () => {
    return (
      <>
        <Space size="middle">
          {/* Upgrade program */}
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            disabled={isTxInProgress() || loadingPrograms}
            onClick={showUpgradeProgramModal}>
            {t('multisig.multisig-account-detail.cta-upgrade-program')}
          </Button>
          {/* Upgrade IDL */}
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            disabled={isTxInProgress() || loadingPrograms}
            onClick={showUpgradeIDLModal}>
            Upgrade IDL
          </Button>
          {/* Kill Switch */}
          {isUnderDevelopment() && (
            <Button
              type="default"
              shape="round"
              size="small"
              className="thin-stroke"
              disabled={true}
              onClick={() => {}}>
              Kill Switch
            </Button>
          )}
          {/* Set Program Auth */}
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            disabled={isTxInProgress() || loadingPrograms}
            onClick={showSetProgramAuthModal}>
            Set Program Auth
          </Button>
          {/* Operation indication */}
          {isUpgradingProgram() ? (
            <div className="flex-row flex-center">
              <LoadingOutlined />
              <span className="ml-1">{t('multisig.multisig-account-detail.cta-upgrade-program-busy')}</span>
            </div>
          ) : isUpgradingIDL() ? (
            <div className="flex-row flex-center">
              <LoadingOutlined />
              <span className="ml-1">Upgrading IDL</span>
            </div>
          ) : isSettingAuthority() ? (
            <div className="flex-row flex-center">
              <LoadingOutlined />
              <span className="ml-1">Setting Authority</span>
            </div>
          ) : null}
        </Space>
      </>
    );
  }

  const txPendingSigners = (mtx: MultisigTransaction) => {
    if (!selectedMultisig || !selectedMultisig.owners || selectedMultisig.owners.length === 0) {
      return null;
    }

    const participants = selectedMultisig.owners as MultisigParticipant[]
    return (
      <>
        {participants.map((item, index) => {
          if (mtx.signers[index]) { return null; }
          return (
            <div key={`${index}`} className="well-group mb-1">
              <div className="flex-fixed-right align-items-center">
                <div className="left text-truncate m-0">
                  <div><span>{item.name || `Owner ${index + 1}`}</span></div>
                  <div className="font-size-75 text-monospace">{item.address}</div>
                </div>
                <div className="right pl-2">
                  <div><span className={theme === 'light' ? "fg-light-orange font-bold" : "fg-yellow font-bold"}>Not Signed</span></div>
                </div>
              </div>
            </div>
          );
        })}
      </>
    );
  };

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
            <div className="std-table-cell fixed-width-110">{t('multisig.multisig-transactions.column-created-on')}</div>
            <div className="std-table-cell fixed-width-90">{t('multisig.multisig-transactions.column-my-status')}</div>
            <div className="std-table-cell fixed-width-34">{t('multisig.multisig-transactions.column-current-signatures')}</div>
            <div className="std-table-cell text-center fixed-width-120">{t('multisig.multisig-transactions.column-pending-signatures')}</div>
          </div>
        </div>
        {multisigPendingTxs && multisigPendingTxs.length && (
          <div className="item-list-body compact">
            {multisigPendingTxs.map(item => {
              return (
                <div
                  key={item.id.toBase58()}
                  style={{padding: '3px 0px'}}
                  className={`item-list-row ${highlightedMultisigTx && highlightedMultisigTx.id.equals(item.id) ? 'selected' : 'simplelink'}`}
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
                    <span className={`align-middle ${getTransactionUserStatusActionClass(item)}`}>{getTransactionUserStatusAction(item)}</span>
                  </div>
                  <div className="std-table-cell fixed-width-34">
                    {
                      item.status !== MultisigTransactionStatus.Executed ? (
                        <span className="align-middle">{`${item.signers.filter(s => s === true).length}/${selectedMultisig.threshold}`}</span>
                      ) : (
                        <span className="align-middle">&nbsp;</span>
                      )
                    }
                  </div>
                  <div className="std-table-cell text-center fixed-width-120">
                    <span className={`badge small ${getTransactionStatusClass(item)}`} style={{padding: '3px 5px'}}>{getTransactionStatusAction(item)}</span>
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
                    Program address
                  </span>
                </div>
                <div className="transaction-detail-row">
                  <span className="info-icon token-icon">
                    <Identicon address={selectedProgram.pubkey} style={{ width: "30", display: "inline-flex" }} />
                  </span>
                  <span className="info-data">
                    {shortenAddress(selectedProgram.pubkey.toBase58(), 8)}
                  </span>
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
                  <Link to="/multisig" className="info-data flex-row wrap align-items-center simplelink underline-on-hover"
                    onClick={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      setHighLightableMultisigId(selectedProgram.upgradeAuthority.toBase58());
                      navigate('/multisig');
                    }}>
                    {shortenAddress(selectedProgram.upgradeAuthority.toBase58(), 8)}
                  </Link>
                  <div className="icon-button-container">
                    <Button
                      type="default"
                      shape="circle"
                      size="middle"
                      icon={<CopyOutlined />}
                      onClick={() => copyAddressToClipboard(selectedProgram.upgradeAuthority.toBase58())}
                    />
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

  const renderMultisigPrograms = (
    <>
    {programs && programs.length ? (
      programs.map((item, index) => {
        const onProgramSelected = (ev: any) => {
          setSelectedProgram(item);
          setDtailsPanelOpen(true);
          consoleOut('selected program:', item, 'blue');
          setLoadingMultisigTxs(true);
        };
        return (
          <div 
            key={`${index + 50}`} 
            onClick={onProgramSelected}
            className={`transaction-list-row ${selectedProgram && selectedProgram.pubkey.equals(item.pubkey) ? 'selected' : ''}`}>
            <div className="icon-cell">
              <div className="token-icon">
                <Identicon address={item.pubkey} style={{ width: "28", display: "inline-flex" }} />
              </div>
            </div>
            <div className="description-cell">
              <div className="title text-truncate">{shortenAddress(item.pubkey.toBase58(), 8)}</div>
              {/* <div className="subtitle text-truncate">subtitle</div> */}
            </div>
            <div className="rate-cell">
              <div className="rate-amount">
                {formatThousands(item.size)}
              </div>
              <div className="interval">bytes</div>
            </div>
          </div>
        );
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
      {isLocal() && (
        <div className="debug-bar">
          <span className="ml-1">isBusy:</span><span className="ml-1 font-bold fg-dark-active">{isBusy ? 'true' : 'false'}</span>
          <span className="ml-1">loadingPrograms:</span><span className="ml-1 font-bold fg-dark-active">{loadingPrograms ? 'true' : 'false'}</span>
          {(transactionStatus.lastOperation !== undefined) && (
            <>
            <span className="ml-1">lastOperation:</span><span className="ml-1 font-bold fg-dark-active">{TransactionStatus[transactionStatus.lastOperation]}</span>
            </>
          )}
          {(transactionStatus.currentOperation !== undefined) && (
            <>
            <span className="ml-1">currentOperation:</span><span className="ml-1 font-bold fg-dark-active">{TransactionStatus[transactionStatus.currentOperation]}</span>
            </>
          )}
        </div>
      )}

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
                          if (selectedMultisig) {
                            setHighLightableMultisigId(selectedMultisig.address.toBase58());
                          }
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
                  <div className={`transaction-stats ${loadingPrograms ? 'click-disabled' : 'simplelink'}`} onClick={() => {
                      setLoadingPrograms(true);
                      refreshPrograms();
                    }}>
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

              <div className="inner-container">
                {publicKey ? (
                  <>
                    <div className={`stream-details-data-wrapper vertical-scroll ${(loadingPrograms || !selectedProgram) ? 'h-100 flex-center' : ''}`}>
                      <Spin spinning={loadingPrograms}>
                        {selectedProgram && (
                          <>
                            {renderProgramMeta()}
                            <Divider className="activity-divider" plain></Divider>
                            {renderCtaRow()}
                            <Divider className="activity-divider" plain></Divider>
                            {renderMultisigPendingTxs()}
                          </>
                        )}
                      </Spin>
                      {!loadingPrograms && (
                        <>
                        {(!programs || programs.length === 0) && !selectedProgram && (
                          <div className="h-100 flex-center">
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{t('multisig.multisig-programs.no-program-loaded')}</p>} />
                          </div>
                        )}
                        </>
                      )}
                    </div>
                    {selectedProgram && (
                      <div className="stream-share-ctas">
                        <span className="copy-cta" onClick={() => copyAddressToClipboard(selectedProgram.pubkey.toBase58())}>PROGRAM ADDRESS: {selectedProgram.pubkey.toBase58()}</span>
                        <a className="explorer-cta" target="_blank" rel="noopener noreferrer"
                          href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${selectedProgram.pubkey.toBase58()}${getSolanaExplorerClusterParam()}`}>
                          <IconExternalLink className="mean-svg-icons" />
                        </a>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="h-100 flex-center">
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{t('treasuries.treasury-list.not-connected')}</p>} />
                    </div>
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

      {/* Transaction confirm and execution modal launched from each Tx row */}
      {(isMultisigActionTransactionModalVisible && highlightedMultisigTx && selectedMultisig) && (
        <Modal
          className="mean-modal simple-modal"
          title={<div className="modal-title">{t('multisig.multisig-transactions.modal-title')}</div>}
          maskClosable={false}
          visible={isMultisigActionTransactionModalVisible}
          onCancel={onTransactionModalClosed}
          width={isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 400 : 480}
          footer={null}>

          {/* A Cross-fading panel shown when NOT busy */}
          <div className={!isBusy ? "panel1 show" : "panel1 hide"}>

            {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
              <>
                {/* Normal stuff - YOUR USER INPUTS / INFO AND ACTIONS */}
                {isTxPendingExecution() ? (
                  <>
                    {/* Am I the Tx initiator */}
                    {getTxInitiator(highlightedMultisigTx)?.address === publicKey?.toBase58() ? (
                      <h3 className="text-center">A Transaction on this Multisig is ready for your execution.</h3>
                    ) : (
                      <h3 className="text-center">A transaction on this Multisig is now ready for execution. Please tell the person who initiated this transaction to execute it.</h3>
                    )}
                    <Divider className="mt-2" />
                    <div className="mb-2">Proposed Action: {getOperationName(highlightedMultisigTx.operation)}</div>
                    <div className="mb-2">Submitted on: {getReadableDate(highlightedMultisigTx.createdOn.toString(), true)}</div>
                    <div className="mb-2">Initiator: This transaction was submitted by {getTxInitiator(highlightedMultisigTx)?.name}<br/>Address: <code>{getTxInitiator(highlightedMultisigTx)?.address}</code></div>
                    <div className="mb-2">This transaction required {selectedMultisig.threshold}/{selectedMultisig.owners.length} signers to approve it in order to be executed. {getTxSignedCount(highlightedMultisigTx)} Signed.</div>
                    <div className="mb-2">
                      <span className="mr-1">Your Status:</span>
                      <span className={`font-bold ${getTxUserStatusClass(highlightedMultisigTx)}`}>{getTransactionUserStatusAction(highlightedMultisigTx, true)}</span>
                    </div>
                  </>
                ) : isTxPendingApproval() ? (
                  <>
                    <h3 className="text-center">A Transaction on this Multisig is awaiting {getTransactionUserStatusAction(highlightedMultisigTx) === "Signed" ? 'for' : 'your'} approval.</h3>
                    <Divider className="mt-2" />
                    <div className="mb-2">Proposed Action: {getOperationName(highlightedMultisigTx.operation)}</div>
                    <div className="mb-2">Submitted on: {getReadableDate(highlightedMultisigTx.createdOn.toString(), true)}</div>
                    <div className="mb-2">Initiator: This transaction was submitted by {getTxInitiator(highlightedMultisigTx)?.name}<br/>Address: <code>{getTxInitiator(highlightedMultisigTx)?.address}</code></div>
                    <div className="mb-2">This transaction requires {selectedMultisig.threshold}/{selectedMultisig.owners.length} signers to approve it in order to be executed. {getTxSignedCount(highlightedMultisigTx)} Signed so far.</div>
                    <div className="mb-2">
                      <span className="mr-1">Your Status:</span>
                      <span className={`font-bold ${getTxUserStatusClass(highlightedMultisigTx)}`}>{getTransactionUserStatusAction(highlightedMultisigTx, true)}</span>
                    </div>
                    {getTransactionUserStatusAction(highlightedMultisigTx) === "Signed" && (
                      <div className="mb1">
                        {txPendingSigners(highlightedMultisigTx)}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <h3 className="text-center">This transaction has {isTxRejected() ? 'been rejected' : 'already been executed'}.</h3>
                    <Divider className="mt-2" />
                    <div className="mb-2">Proposed Action: {getOperationName(highlightedMultisigTx.operation)}</div>
                    <div className="mb-2">Submitted on: {getReadableDate(highlightedMultisigTx.createdOn.toString(), true)}</div>
                    <div className="mb-2">Initiator: This transaction was submitted by {getTxInitiator(highlightedMultisigTx)?.name}<br/>Address: <code>{getTxInitiator(highlightedMultisigTx)?.address}</code></div>
                    <div className="mb-2">This transaction required {selectedMultisig.threshold}/{selectedMultisig.owners.length} signers to approve it in order to be executed. {getTxSignedCount(highlightedMultisigTx)} Signed.</div>
                  </>
                )}
              </>
            ) : transactionStatus.currentOperation === TransactionStatus.TransactionFinished ? (
              <>
                {/* When succeeded - BEWARE OF THE SUCCESS MESSAGE */}
                <div className="transaction-progress">
                  <CheckOutlined style={{ fontSize: 48 }} className="icon mt-0" />
                  <h4 className="font-bold">
                    {
                      t('multisig.multisig-transactions.tx-operation-success', {
                        operation: getOperationName(highlightedMultisigTx.operation)
                      })
                    }
                  </h4>
                </div>
                {/* If I am the last approval needed to reach threshold show instructions for exec */}
                {getTxSignedCount(highlightedMultisigTx) === selectedMultisig.threshold - 1 && (
                  <>
                    <h3 className="text-center mt-3">This transaction is now ready for execution. Please tell the person who initiated this transaction to execute it.</h3>
                    <Divider className="mt-2" />
                    <div className="mb-2">Initiator: {getTxInitiator(highlightedMultisigTx)?.name}<br/>Address: <code>{getTxInitiator(highlightedMultisigTx)?.address}</code></div>
                  </>
              )}
              </>
            ) : (
              <>
                <div className="transaction-progress">
                  <InfoCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
                  {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                    <>
                      {/* Pre Tx execution failures here */}
                      <h4 className="font-bold mb-3">{t('multisig.multisig-transactions.tx-operation-failure')}</h4>
                      <h4 className="mb-3">Explain failure condition if specific</h4>
                    </>
                  ) : (
                    <>
                      {/* All other error conditions then - A getter could offer a basic explanation of what happened */}
                      <h4 className="font-bold mb-3">{t('multisig.multisig-transactions.tx-operation-failure', {
                        operation: getOperationName(highlightedMultisigTx.operation)
                      })}</h4>
                      <h4 className="mb-3">{getTransactionOperationDescription(transactionStatus.currentOperation, t)}</h4>
                    </>
                  )}
                </div>
              </>
            )}

          </div>

          {/* A Crross-fading panel shown when busy */}
          <div className={isBusy ? "panel2 show"  : "panel2 hide"}>          
            {transactionStatus.currentOperation !== TransactionStatus.Iddle && (
              <div className="transaction-progress">
                <Spin indicator={bigLoadingIcon} className="icon mt-0" />
                <h4 className="font-bold mb-1">
                  {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
                </h4>
                {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
                  <div className="indication">{t('transactions.status.instructions')}</div>
                )}
              </div>
            )}
          </div>

          {/* CTAs shown always - IF DIFFERENT CTAS ARE BEST FOR EACH STAGE, MOVE THEM INSIDE THE PANELS */}
          <div className="transaction-progress mt-3">
            <Space size="middle">
              <Button
                type="text"
                shape="round"
                size="middle"
                className={isBusy ? 'inactive' : ''}
                onClick={() => isError(transactionStatus.currentOperation)
                  ? onAcceptMultisigActionModal(highlightedMultisigTx)
                  : onCloseMultisigActionModal()}>
                {isError(transactionStatus.currentOperation)
                  ? t('general.retry')
                  : t('general.cta-close')
                }
              </Button>
              {
                (
                  (
                    (
                      highlightedMultisigTx.operation === OperationType.TreasuryCreate ||
                      highlightedMultisigTx.operation === OperationType.TreasuryClose ||
                      highlightedMultisigTx.operation === OperationType.TreasuryAddFunds ||
                      highlightedMultisigTx.operation === OperationType.TreasuryStreamCreate
                    )
                    &&
                    (
                      (
                        highlightedMultisigTx.status === MultisigTransactionStatus.Pending &&
                        !highlightedMultisigTx.didSigned
                      ) 
                      ||
                      (
                        publicKey &&
                        highlightedMultisigTx.proposer &&
                        publicKey.equals(highlightedMultisigTx.proposer) &&
                        highlightedMultisigTx.status === MultisigTransactionStatus.Approved &&
                        !highlightedMultisigTx.executedOn
                      )
                    )
                  )
                  ||
                  (
                    (
                      highlightedMultisigTx.status === MultisigTransactionStatus.Pending &&
                      !highlightedMultisigTx.didSigned
                    ) 
                    ||
                    (
                      highlightedMultisigTx.status === MultisigTransactionStatus.Approved &&
                      !highlightedMultisigTx.executedOn
                    )
                  )
                )
                &&
                (
                  <Button
                    className={isBusy ? 'inactive' : ''}
                    type="primary"
                    shape="round"
                    size="middle"
                    onClick={() => {
                      if (transactionStatus.currentOperation === TransactionStatus.Iddle) {
                        onAcceptMultisigActionModal(highlightedMultisigTx);
                      } else if (transactionStatus.currentOperation === TransactionStatus.TransactionFinished) {
                        onCloseMultisigActionModal();
                      } else {
                        refreshPage();
                      }
                    }}>
                    {getTxApproveMainCtaLabel()}
                  </Button>
                )
              }
            </Space>
          </div>

        </Modal>
      )}

      <PreFooter />
    </>
  );

};
