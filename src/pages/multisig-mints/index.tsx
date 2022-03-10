import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSolanaExplorerClusterParam, useConnectionConfig } from '../../contexts/connection';
import { TransactionStatusContext } from '../../contexts/transaction-status';
import { useWallet } from '../../contexts/wallet';
import { AppStateContext } from '../../contexts/appstate';
import { Button, Col, Divider, Empty, Modal, Row, Space, Spin, Tooltip } from 'antd';
import { ArrowLeftOutlined, CheckOutlined, CopyOutlined, InfoCircleOutlined, LoadingOutlined, ReloadOutlined } from '@ant-design/icons';
import { IconCoin, IconExternalLink, IconShieldOutline } from '../../Icons';
import { PreFooter } from '../../components/PreFooter';
import { ConfirmOptions, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { Program, Provider } from '@project-serum/anchor';
import MultisigIdl from "../../models/mean-multisig-idl";
import { MEAN_MULTISIG, NATIVE_SOL_MINT } from '../../utils/ids';
import { MintLayout, Token, TOKEN_PROGRAM_ID, u64 } from '@solana/spl-token';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { consoleOut, copyText, delay, getReadableDate, getShortDate, getTransactionOperationDescription, getTransactionStatusForLogs, isDev, isLocal } from '../../utils/ui';
import { Identicon } from '../../components/Identicon';
import { formatThousands, getTokenAmountAndSymbolByTokenAddress, getTxIxResume, shortenAddress, toUiAmount } from '../../utils/utils';
import { MultisigV2, MultisigParticipant, MultisigTransaction, MultisigTransactionStatus, Multisig, CreateMintPayload, MultisigMint, SetMintAuthPayload } from '../../models/multisig';
import { TransactionFees } from '@mean-dao/msp';
import { useNativeAccount } from '../../contexts/accounts';
import { OperationType, TransactionStatus } from '../../models/enums';
import { BN } from 'bn.js';
import { notify } from '../../utils/notifications';
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from '../../constants';
import { customLogger } from '../..';
import useWindowSize from '../../hooks/useWindowResize';
import { isError } from '../../utils/transactions';
import { MultisigMintTokenModal } from '../../components/MultisigMintTokenModal';
import { MultisigCreateMintModal } from '../../components/MultisigCreateMintModal';
import { MultisigTransferMintAuthorityModal } from '../../components/MultisigTransferMintAuthorityModal';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const MultisigMintsView = () => {
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
    setDtailsPanelOpen,
    refreshTokenBalance,
    setTransactionStatus,
    setHighLightableMultisigId,
    previousWalletConnectState,
  } = useContext(AppStateContext);
  const {
    fetchTxInfoStatus,
    lastSentTxSignature,
    lastSentTxOperationType,
    startFetchTxSignatureInfo,
    clearTransactionStatusContext,
  } = useContext(TransactionStatusContext);
  const { t } = useTranslation('common');
  // Misc hooks
  const { width } = useWindowSize();
  // Balance and fees
  const [nativeBalance, setNativeBalance] = useState(0);
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [transactionFees, setTransactionFees] = useState<TransactionFees>({
    blockchainFee: 0, mspFlatFee: 0, mspPercentFee: 0
  });
  // Multisig accounts
  const [loadingMultisigAccounts, setLoadingMultisigAccounts] = useState(true);
  const [multisigAccounts, setMultisigAccounts] = useState<(MultisigV2 | Multisig)[]>([]);
  // Mints
  const [loadingMints, setLoadingMints] = useState(true);
  const [multisigMints, setMultisigMints] = useState<MultisigMint[]>([]);
  const [selectedMint, setSelectedMint] = useState<MultisigMint | undefined>(undefined);
  // Active/Selected multisig
  const [multisigAddress, setMultisigAddress] = useState('');
  const [selectedMultisig, setSelectedMultisig] = useState<MultisigV2 | Multisig | undefined>(undefined);
  // Pending Txs
  const [loadingMultisigTxs, setLoadingMultisigTxs] = useState(true);
  const [multisigPendingTxs, setMultisigPendingTxs] = useState<MultisigTransaction[]>([]);
  const [highlightedMultisigTx, sethHighlightedMultisigTx] = useState<MultisigTransaction | undefined>();
  // Tx control
  const [isBusy, setIsBusy] = useState(false);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
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

  const isCreatingMint = useCallback((): boolean => {

    return ( 
      fetchTxInfoStatus === "fetching" && 
      lastSentTxOperationType === OperationType.CreateMint
    );

  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  const isSettingMintAuthority = useCallback((): boolean => {

    return ( 
      fetchTxInfoStatus === "fetching" && 
      lastSentTxOperationType === OperationType.SetMintAuthority
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

  const isMintingToken = useCallback((): boolean => {

    return ( 
      fetchTxInfoStatus === "fetching" && 
      lastSentTxOperationType === OperationType.MintTokens
    );

  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  const isUiBusy = useCallback((): boolean => {
    return isBusy || fetchTxInfoStatus === "fetching" || loadingMultisigAccounts || loadingMultisigTxs
            ? true
            : false;
  }, [
    isBusy,
    fetchTxInfoStatus,
    loadingMultisigTxs,
    loadingMultisigAccounts,
  ]);

  const getOperationName = useCallback((op: OperationType) => {

    switch (op) {
      case OperationType.CreateMint:
        return "Create Mint";
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
      case OperationType.DeleteVault:
        return "Close Vault";
      case OperationType.CreateVault:
        return "Create Vault";
      case OperationType.SetVaultAuthority:
        return "Change Vault Authority";
      case OperationType.StreamCreate:
        return "Create Stream";
      case OperationType.StreamClose:
        return "Close Stream";
      case OperationType.StreamAddFunds:
        return "Top Up Stream";
      case OperationType.StreamPause:
        return "Pause Stream";
      case OperationType.StreamResume:
        return "Resume Stream";
      default:
        return '';
    }

  },[]);

  const getOperationProgram = useCallback((op: OperationType) => {

    if (op === OperationType.CreateMint ||
        op === OperationType.MintTokens ||
        op === OperationType.TransferTokens ||
        op === OperationType.SetMintAuthority) {
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

  const isUserTheProposer = useCallback((): boolean => {
    if (!highlightedMultisigTx || !publicKey) { return false; }

    return  publicKey &&
            highlightedMultisigTx.proposer &&
            publicKey.equals(highlightedMultisigTx.proposer)
        ? true
        : false;

  }, [
    publicKey,
    highlightedMultisigTx
  ]);

  const isTreasuryOperation = useCallback(() => {

    if (!highlightedMultisigTx) { return false; }

    return  highlightedMultisigTx.operation === OperationType.TreasuryCreate ||
            highlightedMultisigTx.operation === OperationType.TreasuryClose ||
            highlightedMultisigTx.operation === OperationType.TreasuryAddFunds ||
            highlightedMultisigTx.operation === OperationType.TreasuryStreamCreate ||
            highlightedMultisigTx.operation === OperationType.StreamCreate ||
            highlightedMultisigTx.operation === OperationType.StreamClose ||
            highlightedMultisigTx.operation === OperationType.StreamAddFunds
      ? true
      : false;

  },[highlightedMultisigTx])

  const canShowApproveButton = useCallback(() => {

    if (!highlightedMultisigTx) { return false; }

    let result = (
      highlightedMultisigTx.status === MultisigTransactionStatus.Pending &&
      !highlightedMultisigTx.didSigned
    );

    return result;

  },[highlightedMultisigTx])

  const canShowExecuteButton = useCallback(() => {

    if (!highlightedMultisigTx) { return false; }

    const isPendingForExecution = () => {
      return  highlightedMultisigTx.status === MultisigTransactionStatus.Approved &&
              !highlightedMultisigTx.executedOn
        ? true
        : false;
    }

    if (isPendingForExecution()) {
      if (!isTreasuryOperation() || (isUserTheProposer() && isTreasuryOperation)) {
        return true;
      } else {
        return false;
      }
    } else {
      return false;
    }

  },[
    highlightedMultisigTx,
    isTreasuryOperation,
    isUserTheProposer,
  ])


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
          authority: address,
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
          authority: address,
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

  // Get multisig mint accounts on demmand
  const getMultisigMints = useCallback(async (
    connection: Connection,
    multisig: PublicKey

  ) => {

    const [multisigSigner] = await PublicKey.findProgramAddress(
      [multisig.toBuffer()],
      MEAN_MULTISIG
    );

    const mintInfos = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
      filters: [
        {
          memcmp: { offset: 4, bytes: multisigSigner.toBase58() },
        }, 
        {
          dataSize: MintLayout.span
        }
      ],
    });

    if (!mintInfos || !mintInfos.length) { return []; }

    const results = mintInfos.map((t: any) => {
      let mintAccount = MintLayout.decode(Buffer.from(t.account.data));
      mintAccount.address = t.pubkey;
      const supply = mintAccount.supply as Uint8Array;
      return {
        address: mintAccount.address,
        isInitialized: mintAccount.isInitialized === 1 ? true : false,
        decimals: mintAccount.decimals,
        supply: new BN(supply, 10, 'le').toNumber(),
        mintAuthority: mintAccount.freezeAuthority ? new PublicKey(mintAccount.freezeAuthority) : null,
        freezeAuthority: mintAccount.freezeAuthority ? new PublicKey(mintAccount.freezeAuthority) : null
        
      } as MultisigMint;
    });

    consoleOut('multisig mints:', results, 'blue');
    return results;

  },[]);

  const refreshMints = useCallback(() => {

    setLoadingMints(true);
    getMultisigMints(connection, new PublicKey(multisigAddress))
    .then((result: MultisigMint[]) => {
      setMultisigMints(result);
      if (result.length > 0 && !selectedMint) {
        setSelectedMint(result[0]);
      }
    })
    .catch(err => console.error(err))
    .finally(() => setLoadingMints(false));

  }, [
    connection,
    selectedMint,
    multisigAddress,
    getMultisigMints,
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

  // Get Multisig Mint accounts
  useEffect(() => {

    if (!connection || !multisigClient || !publicKey || !loadingMints) {
      return;
    }

    const params = new URLSearchParams(location.search);

    if (params.has('multisig') && !multisigAddress) {
      consoleOut('Wait for multisigAddress on next render...', '', 'blue');
      return;
    }

    const timeout = setTimeout(() => {
      getMultisigMints(connection, new PublicKey(multisigAddress))
      .then((result: MultisigMint[]) => {
        setMultisigMints(result);
        if (result.length > 0) {
          setSelectedMint(result[0]);
          consoleOut('selectedMint:', result[0], 'blue');
        }
      })
      .catch(err => console.error(err))
      .finally(() => setLoadingMints(false));
    });

    return () => {
      clearTimeout(timeout);
    }

  },[
    publicKey,
    connection,
    loadingMints,
    multisigClient,
    multisigAddress,
    location.search,
    getMultisigMints
  ]);

  // Update list of txs
  useEffect(() => {

    if (!connection || !publicKey || !multisigAddress || !selectedMint || !selectedMultisig || !loadingMultisigTxs) {
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

            if (txInfo.accounts.some(a => a.pubkey.equals(selectedMint.address))) {
              transactions.push(txInfo);
            }
          }
          transactions.sort((a, b) => b.createdOn.getTime() - a.createdOn.getTime());
          consoleOut('multisigPendingTxs:', transactions, 'blue');
          setMultisigPendingTxs(transactions);
        })
        .catch(err => {
          console.error(err);
          setMultisigPendingTxs([]);
          consoleOut('multisigPendingTxs:', [], 'blue');
        })
        .finally(() => setLoadingMultisigTxs(false));
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    publicKey,
    connection,
    selectedMint,
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
      refreshMints();
      setLoadingMultisigTxs(true);
    }
  }, [
    publicKey,
    multisigAddress,
    fetchTxInfoStatus,
    lastSentTxSignature,
    // lastSentTxOperationType,
    clearTransactionStatusContext,
    refreshMints,
  ]);

  ////////////////////////////////
  //   Operations and Actions   //
  ////////////////////////////////

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

  const isUnderDevelopment = () => {
    return isLocal() || (isDev() && isWhitelisted) ? true : false;
  }

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


  // Transfer Mint authority modal
  const [isTransferMintAuthorityModalVisible, setIsTransferMintAuthorityModalVisible] = useState(false);
  const showTransferMintAuthorityModal = useCallback(() => {
    setIsTransferMintAuthorityModalVisible(true);
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.000010,
      mspPercentFee: 0
    };
    setTransactionFees(fees);
  }, []);

  const onAcceptTransferMintAuthority = (selectedAuthority: string) => {
    consoleOut('selectedAuthority', selectedAuthority, 'blue');
    onExecuteSetMintAuthTx(selectedAuthority);
  };

  const onMintAuthorityTransfered = useCallback(() => {

    resetTransactionStatus();

  },[
    resetTransactionStatus
  ]);

  const onExecuteSetMintAuthTx = useCallback(async (authority: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.SetMintAuthority);
    setRetryOperationPayload(authority);
    setIsBusy(true);

    const setMintAuth = async (data: SetMintAuthPayload) => {

      if (!selectedMultisig || !publicKey) { return null; }
  
      const [multisigAuthority] = await PublicKey.findProgramAddress(
        [new PublicKey(data.multisig).toBuffer()],
        multisigClient.programId
      );

      const setAuthIx = Token.createSetAuthorityInstruction(
        TOKEN_PROGRAM_ID,
        new PublicKey(data.mint),
        new PublicKey(data.newAuthority),
        "MintTokens",
        multisigAuthority,
        []
      );

      const ixAccounts = setAuthIx.keys;
      const ixData = Buffer.from(setAuthIx.data);
      const txSize = 1000;
      const transaction = Keypair.generate();
      const createIx = await multisigClient.account.transaction.createInstruction(
        transaction,
        txSize
      );

      const tx = multisigClient.transaction.createTransaction(
        TOKEN_PROGRAM_ID,
        OperationType.SetMultisigAuthority,
        ixAccounts,
        ixData,
        {
          accounts: {
            multisig: new PublicKey(data.multisig),
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
  
      return tx;
    };

    const createTx = async (): Promise<boolean> => {

      if (!publicKey || !authority || !selectedMultisig || !selectedMint) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Set mint authority transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut("Start transaction for create multisig", '', 'blue');
      consoleOut('Wallet address:', publicKey.toBase58());

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      // Create a transaction
      const payload = {
        multisig: selectedMultisig.authority.toBase58(),
        mint: selectedMint.address.toBase58(),
        newAuthority: authority
      } as SetMintAuthPayload;

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
        customLogger.logWarning('Mint tokens transaction failed', { transcript: transactionLog });
        return false;
      }

      let result = await setMintAuth(payload)
        .then(value => {
          if (!value) { return false; }
          consoleOut('set mint authority returned transaction:', value);
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
          console.error('set mint authority error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Set mint authority transaction failed', { transcript: transactionLog });
          return false;
        });

      return result;
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
            customLogger.logError('Set mint authority transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Set mint authority transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Set mint authority transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Set mint authority transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Set mint authority transaction failed', { transcript: transactionLog });
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
            startFetchTxSignatureInfo(signature, "finalized", OperationType.SetMintAuthority);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            await delay(1000);
            onMintAuthorityTransfered();
            setOngoingOperation(undefined);
            setIsMintTokenModalVisible(false);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    wallet,
    publicKey,
    connection, 
    selectedMint,
    nativeBalance,
    selectedMultisig,
    transactionCancelled,
    multisigClient.programId, 
    multisigClient.transaction,
    multisigClient.account.transaction, 
    transactionFees.blockchainFee,
    transactionFees.mspFlatFee,
    transactionStatus.currentOperation,
    clearTransactionStatusContext,
    startFetchTxSignatureInfo,
    onMintAuthorityTransfered,
    setTransactionStatus,
  ]);



  // Create Mint modal
  const [isCreateMintModalVisible, setIsCreateMintModalVisible] = useState(false);
  const showCreateMintModal = useCallback(() => {
    setIsCreateMintModalVisible(true);
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.000010,
      mspPercentFee: 0
    };
    setTransactionFees(fees);
  }, []);

  const onAcceptCreateMint = (createMintPayload: CreateMintPayload) => {
    consoleOut('createMintPayload', createMintPayload, 'blue');
    onExecuteCreateMintTx(createMintPayload);
  };

  const onMintCreated = useCallback(() => {

    setIsCreateMintModalVisible(false);
    resetTransactionStatus();

  },[
    resetTransactionStatus
  ]);

  const onExecuteCreateMintTx = useCallback(async (data: CreateMintPayload) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.CreateMint);
    setRetryOperationPayload(data);
    setIsBusy(true);

    const createMint = async (data: any) => {

      if (!selectedMultisig || !publicKey) { return null; }

      const [multisigAuthority] = await PublicKey.findProgramAddress(
        [selectedMultisig.id.toBuffer()],
        multisigClient.programId
      );

      const mintKeypair = Keypair.generate();

      let tx = new Transaction().add(...[
        SystemProgram.createAccount({
          fromPubkey: publicKey,
          newAccountPubkey: mintKeypair.publicKey,
          lamports: await Token.getMinBalanceRentForExemptMint(multisigClient.provider.connection),
          space: MintLayout.span,
          programId: TOKEN_PROGRAM_ID
        }),
        Token.createInitMintInstruction(
          TOKEN_PROGRAM_ID,
          mintKeypair.publicKey,
          data.decimals,
          multisigAuthority,
          multisigAuthority
        )
      ]);
  
      tx.feePayer = publicKey;
      const { blockhash } = await connection.getRecentBlockhash("finalized");
      tx.recentBlockhash = blockhash;
      tx.partialSign(...[mintKeypair]);
  
      return tx;
    };

    const createTx = async (): Promise<boolean> => {

      if (!publicKey || !data) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Create mint transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut("Start transaction for create mint", '', 'blue');
      consoleOut('Wallet address:', publicKey.toBase58());

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      // Create a transaction
      const payload = {
        decimals: data.decimals
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
        customLogger.logWarning('Create mint transaction failed', { transcript: transactionLog });
        return false;
      }

      let result = await createMint(payload)
        .then(value => {
          if (!value) { return false; }
          consoleOut('Create mint returned transaction:', value);
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
          console.error('Create mint error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Create mint transaction failed', { transcript: transactionLog });
          return false;
        });

      return result;
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
            customLogger.logError('Create mint transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Create mint transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Create mint transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Create mint transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Create mint transaction failed', { transcript: transactionLog });
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
            startFetchTxSignatureInfo(signature, "finalized", OperationType.CreateMint);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            await delay(1000);
            onMintCreated();
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
    multisigClient.programId,
    transactionFees.mspFlatFee,
    transactionFees.blockchainFee,
    multisigClient.provider.connection,
    transactionStatus.currentOperation,
    clearTransactionStatusContext,
    startFetchTxSignatureInfo,
    setTransactionStatus,
    onMintCreated,
  ]);



  // Mint tokens modal
  const [isMintTokenModalVisible, setIsMintTokenModalVisible] = useState(false);
  const showMintTokenModal = useCallback(() => {
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.000010,
      mspPercentFee: 0
    };
    setTransactionFees(fees);
    setIsMintTokenModalVisible(true);
  }, []);

  const onAcceptMintToken = (params: any) => {
    consoleOut('params', params, 'blue');
    onExecuteMintTokensTx(params);
  };

  const onTokensMinted = useCallback(() => {

    setIsMintTokenModalVisible(false);
    resetTransactionStatus();

  },[
    resetTransactionStatus
  ]);

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
      let ixs: TransactionInstruction[] = [];

      const mintIx = Token.createMintToInstruction(
        TOKEN_PROGRAM_ID,
        data.tokenAddress,
        data.mintTo,
        multisigAuthority,
        [],
        new BN(data.amount * 10 ** mint.decimals).toNumber()
      );

      const ixAccounts = mintIx.keys;
      const ixData = Buffer.from(mintIx.data);
      const transaction = Keypair.generate();
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
        ixAccounts,
        ixData,
        {
          accounts: {
            multisig: selectedMultisig.id,
            transaction: transaction.publicKey,
            proposer: publicKey
          },
          instructions: ixs,
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
          customLogger.logWarning('Mint tokens transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Mint tokens transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Mint tokens transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Mint tokens transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Mint tokens transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Mint tokens transaction failed', { transcript: transactionLog });
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
            startFetchTxSignatureInfo(signature, "finalized", OperationType.MintTokens);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            await delay(1000);
            onTokensMinted();
            setOngoingOperation(undefined);
            setIsMintTokenModalVisible(false);
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
            customLogger.logError('Finish Approoved transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Finish Approoved transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Finish Approoved transaction failed', { transcript: transactionLog });
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

  ///////////////
  // Rendering //
  ///////////////

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

  const renderCtaRow = () => {
    return (
      <>
        <Space size="middle">
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            disabled={isTxInProgress() || loadingMints}
            onClick={showMintTokenModal}>
            {t('multisig.multisig-mints.cta-mint-token')}
          </Button>
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            disabled={isTxInProgress() || loadingMints}
            onClick={showTransferMintAuthorityModal}>
            {t('multisig.multisig-mints.cta-change-mint-authority')}
          </Button>

          {/* Operation indication */}
          {isCreatingMint() ? (
            <div className="flex-row flex-center">
              <LoadingOutlined />
              <span className="ml-1">{t('multisig.multisig-mints.cta-create-mint-busy')}</span>
            </div>
          ) : isMintingToken() ? (
            <div className="flex-row flex-center">
              <LoadingOutlined />
              <span className="ml-1">{t('multisig.multisig-mints.cta-mint-token-busy')}</span>
            </div>
          ) : isSettingMintAuthority() ? (
            <div className="flex-row flex-center">
              <LoadingOutlined />
              <span className="ml-1">{t('multisig.multisig-mints.cta-change-mint-authority-busy')}</span>
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
                  <div><span className={theme === 'light' ? "fg-light-orange font-bold" : "fg-yellow font-bold"}>{t('multisig.multisig-transactions.not-signed')}</span></div>
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

  const renderMintMeta = () => {
    return (
      <>
      {selectedMint && (
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
                  <span className="info-icon token-icon">
                    <Identicon address={selectedMint.address} style={{ width: "30", display: "inline-flex" }} />
                  </span>
                  <span className="info-data">
                    {shortenAddress(selectedMint.address.toBase58(), 8)}
                  </span>
                </div>
              </Col>
              <Col span={12}>
                <div className="transaction-detail-row">
                  <span className="info-label">
                    {t('multisig.multisig-mints.multisig-authority')}
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
                      setHighLightableMultisigId(selectedMint.mintAuthority.toBase58());
                      navigate('/multisig');
                    }}>
                    {shortenAddress(selectedMint.mintAuthority.toBase58(), 6)}
                  </Link>
                  <div className="icon-button-container">
                    <Button
                      type="default"
                      shape="circle"
                      size="middle"
                      icon={<CopyOutlined />}
                      onClick={() => copyAddressToClipboard(selectedMint.mintAuthority.toBase58())}
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

  const renderMultisigMints = (
    <>
    {multisigMints && multisigMints.length ? (
      multisigMints.map((item, index) => {
        const onMintSelected = (ev: any) => {
          setSelectedMint(item);
          setDtailsPanelOpen(true);
          consoleOut('selected mint:', item, 'blue');
          setLoadingMultisigTxs(true);
        };
        return (
          <div
            key={`${index + 50}`}
            onClick={onMintSelected}
            className={
              `transaction-list-row ${
                selectedMint && selectedMint.address && selectedMint.address.equals(item.address)
                  ? 'selected'
                  : ''
              }`
            }>
            <div className="icon-cell">
              <div className="token-icon">
                <Identicon address={item.address.toBase58()} style={{
                  width: "28px",
                  display: "inline-flex",
                  height: "26px",
                  overflow: "hidden",
                  borderRadius: "50%"
                }} />
              </div>
            </div>
            <div className="description-cell">
              <div className="title text-truncate">{shortenAddress(item.address.toBase58(), 8)}</div>
              <div className="subtitle text-truncate">{t('multisig.multisig-mints.decimals')} {item.decimals}</div>
            </div>
            <div className="rate-cell">
              <div className="rate-amount text-uppercase">{formatThousands(item.supply, item.decimals)}</div>
              <div className="interval">{t('multisig.multisig-mints.supply')}</div>
            </div>
          </div>
        );
      })
    ) : (
      <>
        <div className="h-100 flex-center">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{publicKey
            ? t('multisig.multisig-mints.no-mints')
            : t('multisig.multisig-mints.not-connected')}</p>} />
        </div>
      </>
    )}

    </>
  );

  return (
    <>
      {/* {isLocal() && (
        <div className="debug-bar">
          <span className="ml-1">isBusy:</span><span className="ml-1 font-bold fg-dark-active">{isBusy ? 'true' : 'false'}</span>
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
      )} */}

      <div className="container main-container">

        <div className="interaction-area">

          <div className={`meanfi-two-panel-layout ${detailsPanelOpen ? 'details-open' : ''}`}>

            <div className="meanfi-two-panel-left">

              <div className="meanfi-panel-heading">
                <div className="back-button">
                  <span className="icon-button-container">
                    <Tooltip placement="bottom" title={t('multisig.multisig-mints.back-to-multisig-accounts-cta')}>
                      <Button
                        type="default"
                        shape="circle"
                        size="middle"
                        icon={<ArrowLeftOutlined />}
                        onClick={() => {
                          if (selectedMultisig) {
                            setHighLightableMultisigId(selectedMultisig.id.toBase58());
                          }
                          navigate('/multisig');
                        }}
                      />
                    </Tooltip>
                  </span>
                </div>
                <IconCoin className="mean-svg-icons mr-1" />
                <span className="title">
                  {multisigMints && selectedMultisig
                    ? t('multisig.multisig-mints.screen-title', {
                        multisigName: selectedMultisig.label,
                        itemCount: multisigMints ? multisigMints.length : 0
                      })
                    : t('multisig.multisig-mints.screen-title-no-mints')
                  }
                </span>
                <Tooltip placement="bottom" title={t('multisig.multisig-mints.refresh-tooltip')}>
                  <div className={`transaction-stats ${loadingMints ? 'click-disabled' : 'simplelink'}`} onClick={refreshMints}>
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
                  <Spin spinning={loadingMints}>
                    {renderMultisigMints}
                  </Spin>
                </div>
                <div className="bottom-ctas">
                  <div className="create-stream">
                    <Button
                      block
                      type="primary"
                      shape="round"
                      disabled={!publicKey || !selectedMultisig}
                      onClick={showCreateMintModal}>
                      {publicKey
                        ? t('multisig.multisig-mints.cta-create-mint')
                        : t('transactions.validation.not-connected')
                      }
                    </Button>
                  </div>
                </div>
              </div>

            </div>

            <div className="meanfi-two-panel-right">
              <div className="meanfi-panel-heading">
                <span className="title">{t('multisig.multisig-mints.mint-detail-heading')}</span>
              </div>

              <div className="inner-container">
                {publicKey ? (
                  <>
                    <div className={`stream-details-data-wrapper vertical-scroll ${(loadingMints || !selectedMint) ? 'h-100 flex-center' : ''}`}>
                      <Spin spinning={loadingMints}>
                        {selectedMint && (
                          <>
                            {renderMintMeta()}
                            <Divider className="activity-divider" plain></Divider>
                            {renderCtaRow()}
                            <Divider className="activity-divider" plain></Divider>
                            {renderMultisigPendingTxs()}
                          </>
                        )}
                      </Spin>
                      {!loadingMints && (
                        <>
                        {(!multisigMints || multisigMints.length === 0) && !selectedMint && (
                          <div className="h-100 flex-center">
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{t('multisig.multisig-mints.no-mint')}</p>} />
                          </div>
                        )}
                        </>
                      )}
                    </div>
                    {selectedMint && (
                      <div className="stream-share-ctas">
                        <span className="copy-cta" onClick={() => copyAddressToClipboard(selectedMint.address.toBase58())}>{t('multisig.multisig-mints.mint-address')} {selectedMint.address.toBase58()}</span>
                        <a className="explorer-cta" target="_blank" rel="noopener noreferrer"
                          href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${selectedMint.address.toBase58()}${getSolanaExplorerClusterParam()}`}>
                          <IconExternalLink className="mean-svg-icons" />
                        </a>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="h-100 flex-center">
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{t('multisig.multisig-mints.not-connected')}</p>} />
                  </div>
                )}
              </div>

            </div>

          </div>

        </div>

      </div>

      <MultisigCreateMintModal
        handleOk={onAcceptCreateMint}
        handleClose={() => setIsCreateMintModalVisible(false)}
        isVisible={isCreateMintModalVisible}
        nativeBalance={nativeBalance}
        transactionFees={transactionFees}
        isBusy={isBusy}
      />

      {isTransferMintAuthorityModalVisible && (
        <MultisigTransferMintAuthorityModal
          isVisible={isTransferMintAuthorityModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          handleOk={onAcceptTransferMintAuthority}
          handleClose={() => {
            onAfterEveryModalClose();
            setIsTransferMintAuthorityModalVisible(false);
          }}
          isBusy={isBusy}
          selectedMultisig={selectedMultisig}
          multisigAccounts={multisigAccounts}
          selectedMint={selectedMint}
        />
      )}

      <MultisigMintTokenModal
        isVisible={isMintTokenModalVisible}
        nativeBalance={nativeBalance}
        transactionFees={transactionFees}
        handleOk={onAcceptMintToken}
        handleAfterClose={onAfterEveryModalClose}
        handleClose={() => setIsMintTokenModalVisible(false)}
        isBusy={isBusy}
        selectedMint={selectedMint}
      />

      {/* Transaction confirm and execution modal launched from each Tx row */}
      {(isMultisigActionTransactionModalVisible && highlightedMultisigTx && selectedMultisig) && (
        <Modal
          className="mean-modal simple-modal"
          title={<div className="modal-title">{t('multisig.multisig-transactions.modal-title')}</div>}
          maskClosable={false}
          visible={isMultisigActionTransactionModalVisible}
          closable={true}
          onOk={onCloseMultisigActionModal}
          onCancel={onCloseMultisigActionModal}
          width={isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 400 : 480}
          footer={null}>

          {/* A Cross-fading panel shown when NOT busy */}
          <div className={!isBusy ? "panel1 show" : "panel1 hide"}>

            {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
              <>
                {/* Normal stuff - YOUR USER INPUTS / INFO AND ACTIONS */}
                {isTxPendingExecution() ? (
                  <>
                    {/* Custom execution-ready message */}
                    {isTreasuryOperation() && !isUserTheProposer() ? (
                      <h3 className="text-center">{t('multisig.multisig-transactions.tx-operation-pending-one')}</h3>
                    ) : (
                      <h3 className="text-center">{t('multisig.multisig-transactions.tx-operation-pending-two')} {isUserTheProposer() ? 'your execution' : 'execution'}.</h3>
                    )}
                    <Divider className="mt-2" />
                    <div className="mb-2">{t('multisig.multisig-transactions.proposed-action')} {getOperationName(highlightedMultisigTx.operation)}</div>
                    <div className="mb-2">{t('multisig.multisig-transactions.submitted-on')} {getReadableDate(highlightedMultisigTx.createdOn.toString(), true)}</div>
                    <div className="mb-2">{t('multisig.multisig-transactions.initiator')} {t('multisig.multisig-transactions.initiator-transaction')} {getTxInitiator(highlightedMultisigTx)?.name}<br/>{t('multisig.multisig-transactions.address')} <code>{getTxInitiator(highlightedMultisigTx)?.address}</code></div>
                    <div className="mb-2">{t('multisig.multisig-transactions.transaction-requires')} {selectedMultisig.threshold}/{selectedMultisig.owners.length} {t('multisig.multisig-transactions.signers-to-approve')} {getTxSignedCount(highlightedMultisigTx)} {t('multisig.multisig-transactions.signed')}</div>
                    <div className="mb-2">
                      <span className="mr-1">{t('multisig.multisig-transactions.your-status')}</span>
                      <span className={`font-bold ${getTxUserStatusClass(highlightedMultisigTx)}`}>{getTransactionUserStatusAction(highlightedMultisigTx, true)}</span>
                    </div>
                  </>
                ) : isTxPendingApproval() ? (
                  <>
                    <h3 className="text-center">{t('multisig.multisig-transactions.transaction-awaiting')} {getTransactionUserStatusAction(highlightedMultisigTx) === "Signed" ? 'for' : 'your'} {t('multisig.multisig-transactions.approval')}</h3>
                    <Divider className="mt-2" />
                    <div className="mb-2">{t('multisig.multisig-transactions.proposed-action')} {getOperationName(highlightedMultisigTx.operation)}</div>
                    <div className="mb-2">{t('multisig.multisig-transactions.submitted-on')} {getReadableDate(highlightedMultisigTx.createdOn.toString(), true)}</div>
                    <div className="mb-2">{t('multisig.multisig-transactions.initiator')} {t('multisig.multisig-transactions.initiator-transaction')} {getTxInitiator(highlightedMultisigTx)?.name}<br/>{t('multisig.multisig-transactions.address')} <code>{getTxInitiator(highlightedMultisigTx)?.address}</code></div>
                    <div className="mb-2">{t('multisig.multisig-transactions.transaction-requires')} {selectedMultisig.threshold}/{selectedMultisig.owners.length} {t('multisig.multisig-transactions.signers-to-approve')} {getTxSignedCount(highlightedMultisigTx)} {t('multisig.multisig-transactions.signed-so-far')}</div>
                    <div className="mb-2">
                      <span className="mr-1">{t('multisig.multisig-transactions.your-status')}</span>
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
                    <h3 className="text-center">{t('multisig.multisig-transactions.transaction-has')} {isTxRejected() ? 'been rejected' : 'already been executed'}.</h3>
                    <Divider className="mt-2" />
                    <div className="mb-2">{t('multisig.multisig-transactions.proposed-action')} {getOperationName(highlightedMultisigTx.operation)}</div>
                    <div className="mb-2">{t('multisig.multisig-transactions.submitted-on')} {getReadableDate(highlightedMultisigTx.createdOn.toString(), true)}</div>
                    <div className="mb-2">{t('multisig.multisig-transactions.initiator')} {t('multisig.multisig-transactions.initiator-transaction')} {getTxInitiator(highlightedMultisigTx)?.name}<br/>{t('multisig.multisig-transactions.address')} <code>{getTxInitiator(highlightedMultisigTx)?.address}</code></div>
                    <div className="mb-2">{t('multisig.multisig-transactions.transaction-requires')} {selectedMultisig.threshold}/{selectedMultisig.owners.length} {t('multisig.multisig-transactions.signers-to-approve')} {getTxSignedCount(highlightedMultisigTx)} {t('multisig.multisig-transactions.signed')}</div>
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
                    <h3 className="text-center mt-3">{t('multisig.multisig-transactions.ready-for-execution')}</h3>
                    <Divider className="mt-2" />
                    <div className="mb-2">{t('multisig.multisig-transactions.initiator')} {getTxInitiator(highlightedMultisigTx)?.name}<br/>{t('multisig.multisig-transactions.address')} <code>{getTxInitiator(highlightedMultisigTx)?.address}</code></div>
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
                      <h4 className="mb-3">{t('multisig.multisig-transactions.explain-failure')}</h4>
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
                (canShowExecuteButton() || canShowApproveButton())
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
