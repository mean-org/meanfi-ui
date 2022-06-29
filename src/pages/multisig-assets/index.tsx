import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSolanaExplorerClusterParam, useConnectionConfig } from '../../contexts/connection';
import { TxConfirmationContext } from '../../contexts/transaction-status';
import { useWallet } from '../../contexts/wallet';
import { AppStateContext, TransactionStatusInfo } from '../../contexts/appstate';
import { Button, Col, Divider, Empty, Row, Space, Spin, Tooltip } from 'antd';
import { ArrowLeftOutlined, LoadingOutlined, ReloadOutlined } from '@ant-design/icons';
import { IconExternalLink, IconSafe, IconShieldOutline, IconTrash } from '../../Icons';
import { PreFooter } from '../../components/PreFooter';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Signer, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { MEAN_MULTISIG, NATIVE_SOL_MINT } from '../../utils/ids';
import { AccountLayout, ASSOCIATED_TOKEN_PROGRAM_ID, MintLayout, Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { useLocation, useNavigate } from 'react-router-dom';
import { consoleOut, copyText, delay, getShortDate, getTransactionStatusForLogs, isLocal } from '../../utils/ui';
import { Identicon } from '../../components/Identicon';
import { formatThousands, getTokenAmountAndSymbolByTokenAddress, getTxIxResume, makeDecimal, shortenAddress } from '../../utils/utils';
import { TransactionFees } from '@mean-dao/msp';
// import { MultisigCreateAssetModal } from '../../components/MultisigCreateAssetModal';
import { useNativeAccount } from '../../contexts/accounts';
import { OperationType, TransactionStatus } from '../../models/enums';
import { ACCOUNT_LAYOUT } from '../../utils/layouts';
import { BN } from 'bn.js';
import { MultisigTransferTokensModal } from '../../components/MultisigTransferTokensModal';
import { CUSTOM_TOKEN_NAME, FALLBACK_COIN_IMAGE, NO_FEES, SOLANA_EXPLORER_URI_INSPECT_ADDRESS, SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from '../../constants';
import { MultisigVaultTransferAuthorityModal } from '../../components/MultisigVaultTransferAuthorityModal';
import { customLogger } from '../..';
import useWindowSize from '../../hooks/useWindowResize';
import { MultisigVaultDeleteModal } from '../../components/MultisigVaultDeleteModal';
import { getOperationName } from '../../utils/multisig-helpers';
import { ProposalSummaryModal } from '../../components/ProposalSummaryModal';
import { openNotification } from '../../components/Notifications';
import { MultisigVault } from '../../models/multisig';
import {
  DEFAULT_EXPIRATION_TIME_SECONDS,
  getMultisigTransactionSummary,
  MeanMultisig,
  MEAN_MULTISIG_PROGRAM,
  MultisigInfo, 
  MultisigTransaction,
  MultisigTransactionStatus, 
  MultisigTransactionSummary
} from "@mean-dao/mean-multisig-sdk";

export const MultisigAssetsView = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { account } = useNativeAccount();
  const connectionConfig = useConnectionConfig();
  const { publicKey, wallet, connected } = useWallet();
  const {
    tokenList,
    detailsPanelOpen,
    transactionStatus,
    previousWalletConnectState,
    setHighLightableMultisigId,
    getTokenByMintAddress,
    setTransactionStatus,
    refreshTokenBalance,
    setDtailsPanelOpen,
  } = useContext(AppStateContext);
  const {
    fetchTxInfoStatus,
    lastSentTxSignature,
    lastSentTxOperationType,
    startFetchTxSignatureInfo,
    clearTxConfirmationContext,
  } = useContext(TxConfirmationContext);
  const { t } = useTranslation('common');
  const { width } = useWindowSize();
  const [nativeBalance, setNativeBalance] = useState(0);
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [multisigAddress, setMultisigAddress] = useState('');
  const [multisigAccounts, setMultisigAccounts] = useState<(MultisigInfo)[]>([]);
  const [multisigVaults, setMultisigVaults] = useState<MultisigVault[]>([]);
  const [selectedVault, setSelectedVault] = useState<MultisigVault | undefined>(undefined);
  const [loadingMultisigAccounts, setLoadingMultisigAccounts] = useState(true);
  const [loadingMultisigTxs, setLoadingMultisigTxs] = useState(true);
  const [loadingVaults, setLoadingVaults] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [transactionFees, setTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [selectedMultisig, setSelectedMultisig] = useState<MultisigInfo | undefined>(undefined);
  const [multisigPendingTxs, setMultisigPendingTxs] = useState<MultisigTransaction[]>([]);
  const [highlightedMultisigTx, sethHighlightedMultisigTx] = useState<MultisigTransaction | undefined>();
  const [multisigTransactionSummary, setMultisigTransactionSummary] = useState<MultisigTransactionSummary | undefined>(undefined);
  const [/*ongoingOperation*/, setOngoingOperation] = useState<OperationType | undefined>(undefined);
  const [/*retryOperationPayload*/, setRetryOperationPayload] = useState<any>(undefined);
  const [minRequiredBalance, /*setMinRequiredBalance*/] = useState(0);

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

  /////////////////
  //   Getters   //
  /////////////////

  const isCanvasTight = useCallback(() => {
    return width < 576 || (width >= 768 && width < 960);
  }, [width]);

  // const getTxInitiator = useCallback((mtx: MultisigTransaction): MultisigParticipant | undefined => {
  //   if (!selectedMultisig) { return undefined; }

  //   const owners: MultisigParticipant[] = (selectedMultisig as MultisigInfo).owners;
  //   const initiator = owners && owners.length > 0
  //     ? owners.find(o => o.address === mtx.proposer?.toBase58())
  //     : undefined;

  //   return initiator;
  // }, [selectedMultisig]);

  // const isUserTxInitiator = useCallback(() => {
  //   if (!highlightedMultisigTx || !publicKey) { return false; }
  //   const initiator = getTxInitiator(highlightedMultisigTx);
  //   return initiator && publicKey.toBase58() === initiator.address ? true : false;
  // }, [
  //   publicKey,
  //   highlightedMultisigTx,
  //   getTxInitiator,
  // ]);

  // const getTxSignedCount = useCallback((mtx: MultisigTransaction) => {
  //   if (mtx && mtx.signers) {
  //     return mtx.signers.filter((s: boolean) => s === true).length;
  //   }
  //   return 0;
  // }, []);

  // const isTxVoided = useCallback(() => {
  //   if (highlightedMultisigTx) {
  //     if (highlightedMultisigTx.status === MultisigTransactionStatus.Voided) {
  //       return true;
  //     }
  //   }
  //   return false;
  // }, [highlightedMultisigTx]);

  // const isTxPendingApproval = useCallback(() => {
  //   if (highlightedMultisigTx) {
  //     if (highlightedMultisigTx.status === MultisigTransactionStatus.Active) {
  //       return true;
  //     }
  //   }
  //   return false;
  // }, [highlightedMultisigTx]);

  // const isTxPendingExecution = useCallback(() => {
  //   if (highlightedMultisigTx) {
  //     if (highlightedMultisigTx.status === MultisigTransactionStatus.Passed) {
  //       return true;
  //     }
  //   }
  //   return false;
  // }, [highlightedMultisigTx]);

  // const isTxRejected = useCallback(() => {
  //   if (highlightedMultisigTx) {
  //     if (highlightedMultisigTx.status === MultisigTransactionStatus.Rejected) {
  //       return true;
  //     }
  //   }
  //   return false;
  // }, [highlightedMultisigTx]);

  // const isTxPendingApprovalOrExecution = useCallback(() => {
  //   if (highlightedMultisigTx) {
  //     if (highlightedMultisigTx.status === MultisigTransactionStatus.Active ||
  //         highlightedMultisigTx.status === MultisigTransactionStatus.Passed) {
  //       return true;
  //     }
  //   }
  //   return false;
  // }, [highlightedMultisigTx]);

  // const isUserInputNeeded = useCallback(() => {
  //   if (highlightedMultisigTx) {
  //     if (highlightedMultisigTx.executedOn) { // Executed
  //       return false;
  //     } else if (highlightedMultisigTx.didSigned === undefined) { // Rejected
  //       return false;
  //     } else if (highlightedMultisigTx.didSigned === false) { // Not yet signed
  //       return true;
  //     } else {
  //       return isTxPendingExecution() // Signed but
  //         ? true    // Tx still needs signing or execution
  //         : false;  // Tx completed, nothing to do
  //     }
  //   }

  //   return false;

  // }, [highlightedMultisigTx, isTxPendingExecution]);

  // const getTxUserStatusClass = useCallback((mtx: MultisigTransaction) => {

  //   if (mtx.executedOn) {
  //     return "";
  //   } else if (mtx.didSigned === undefined) {
  //     return "fg-red";
  //   } else if (mtx.didSigned === false) {
  //     return theme === 'light' ? "fg-light-orange" : "fg-warning";
  //   } else {
  //     return theme === 'light' ? "fg-green" : "fg-success"
  //   }

  // },[theme]);

  // const getTxApproveMainCtaLabel = useCallback(() => {

  //   const busyLabel = isTxPendingExecution()
  //     ? 'Executing transaction'
  //     : isTxPendingApproval()
  //       ? 'Approving transaction'
  //       : isTxVoided() 
  //         ? 'Cancelling Transaction' 
  //         : '';

  //   const iddleLabel = isTxPendingExecution()
  //     ? 'Execute transaction'
  //     : isTxPendingApproval()
  //       ? 'Approve transaction'
  //       : isTxVoided() 
  //         ? 'Cancel Transaction' 
  //         : '';

  //   return isBusy
  //     ? busyLabel
  //     : transactionStatus.currentOperation === TransactionStatus.Iddle
  //       ? iddleLabel
  //       : transactionStatus.currentOperation === TransactionStatus.TransactionFinished
  //         ? t('general.cta-finish')
  //         : t('general.refresh');
  // }, [
  //   isBusy,
  //   transactionStatus.currentOperation,
  //   isTxPendingExecution,
  //   isTxPendingApproval,
  //   isTxVoided,
  //   t,
  // ]);

  const getTransactionStatusAction = useCallback((mtx: MultisigTransaction) => {

    if (mtx.status === MultisigTransactionStatus.Active) {
      return t("multisig.multisig-transactions.tx-pending-approval");
    } 
    
    if (mtx.status === MultisigTransactionStatus.Passed) {
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
        : mtx.status === MultisigTransactionStatus.Passed
          ? t("multisig.multisig-transactions.not-sign-tx")
          : t("multisig.multisig-transactions.not-signed-tx");
    } else {
      return longStatus ? "You have signed this transaction" : t("multisig.multisig-transactions.signed");
    }

  },[t]);

  const getTransactionStatusClass = useCallback((mtx: MultisigTransaction) => {
    
    if(
      mtx.status === MultisigTransactionStatus.Active || 
      mtx.status === MultisigTransactionStatus.Passed || 
      mtx.status === MultisigTransactionStatus.Voided ||
      mtx.status === MultisigTransactionStatus.Expired
    ) {
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

  const canDeleteVault = useCallback((): boolean => {
    
    const isTxPendingApproval = (tx: MultisigTransaction) => {
      if (tx) {
        if (tx.status === MultisigTransactionStatus.Active) {
          return true;
        }
      }
      return false;
    };

    const isTxPendingExecution = (tx: MultisigTransaction) => {
      if (tx) {
        if (tx.status === MultisigTransactionStatus.Passed) {
          return true;
        }
      }
      return false;
    };

    if (selectedVault && (!multisigPendingTxs || multisigPendingTxs.length === 0)) {
      return true;
    }
    const found = multisigPendingTxs.find(tx => tx.operation === OperationType.DeleteAsset && (isTxPendingApproval(tx) || isTxPendingExecution(tx)));

    return found ? false : true;

  }, [selectedVault, multisigPendingTxs]);

  // const isSuccess = (): boolean => {
  //   return transactionStatus.currentOperation === TransactionStatus.TransactionFinished;
  // }

  const isCreatingVault = useCallback((): boolean => {

    return ( 
      fetchTxInfoStatus === "fetching" && 
      lastSentTxOperationType === OperationType.CreateAsset
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

  const isSettingVaultAuthority = useCallback((): boolean => {

    return ( 
      fetchTxInfoStatus === "fetching" && 
      lastSentTxOperationType === OperationType.SetAssetAuthority
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

  // const isUserTheProposer = useCallback((): boolean => {
  //   if (!highlightedMultisigTx || !publicKey) { return false; }

  //   return  publicKey &&
  //           highlightedMultisigTx.proposer &&
  //           publicKey.equals(highlightedMultisigTx.proposer)
  //       ? true
  //       : false;

  // }, [
  //   publicKey,
  //   highlightedMultisigTx
  // ]);

  // const isTreasuryOperation = useCallback(() => {

  //   if (!highlightedMultisigTx) { return false; }

  //   return  highlightedMultisigTx.operation === OperationType.TreasuryCreate ||
  //           highlightedMultisigTx.operation === OperationType.TreasuryClose ||
  //           highlightedMultisigTx.operation === OperationType.TreasuryAddFunds ||
  //           highlightedMultisigTx.operation === OperationType.TreasuryStreamCreate ||
  //           highlightedMultisigTx.operation === OperationType.StreamCreate ||
  //           highlightedMultisigTx.operation === OperationType.StreamClose ||
  //           highlightedMultisigTx.operation === OperationType.StreamAddFunds
  //     ? true
  //     : false;

  // },[highlightedMultisigTx])

  // const canShowApproveButton = useCallback(() => {

  //   if (!highlightedMultisigTx) { return false; }

  //   let result = (
  //     highlightedMultisigTx.status === MultisigTransactionStatus.Active &&
  //     !highlightedMultisigTx.didSigned
  //   );

  //   return result;

  // },[highlightedMultisigTx])

  // const canShowExecuteButton = useCallback(() => {

  //   if (!highlightedMultisigTx) { return false; }

  //   const isPendingForExecution = () => {
  //     return  highlightedMultisigTx.status === MultisigTransactionStatus.Passed &&
  //             !highlightedMultisigTx.executedOn
  //       ? true
  //       : false;
  //   }

  //   if (isPendingForExecution()) {
  //     if (!isTreasuryOperation() || (isUserTheProposer() && isTreasuryOperation)) {
  //       return true;
  //     } else {
  //       return false;
  //     }
  //   } else {
  //     return false;
  //   }

  // },[
  //   highlightedMultisigTx,
  //   isTreasuryOperation,
  //   isUserTheProposer,
  // ])

  // const canShowCancelButton = useCallback(() => {

  //   if (!highlightedMultisigTx || !highlightedMultisigTx.proposer || !publicKey) { return false; }

  //   let result = (
  //     highlightedMultisigTx.proposer.toBase58() === publicKey.toBase58() &&
  //     highlightedMultisigTx.status === MultisigTransactionStatus.Voided
  //   );

  //   return result;

  // },[
  //   publicKey, 
  //   highlightedMultisigTx
  // ])

  ////////////////////////////////////////
  // Business logic & Data management   //
  ////////////////////////////////////////

  // Get multisig assets on demmand
  const getMultisigVaults = useCallback(async (
    connection: Connection,
    multisig: PublicKey

  ) => {

    const [multisigSigner] = await PublicKey.findProgramAddress(
      [multisig.toBuffer()],
      MEAN_MULTISIG
    );

    const accountInfoContext = await connection.getTokenAccountsByOwner(
      multisigSigner,
      { programId: TOKEN_PROGRAM_ID }
    );

    if (!accountInfoContext.value || !accountInfoContext.value.length) { return []; }

    const results = accountInfoContext.value.map((t: any) => {
      const tokenAccount = ACCOUNT_LAYOUT.decode(t.account.data);
      tokenAccount.address = t.pubkey;
      return tokenAccount;
    });

    // Set asset decimals to the mint decimals for easiness in UI.
    for (let v = 0; v < results.length; v++) {
      if (v % 3 === 0) { await delay(200); }
      const mintInfo = await connection.getAccountInfo(results[v].mint);
      if (mintInfo) {
        const mint = MintLayout.decode(mintInfo.data);
        results[v].decimals = mint.decimals;
      } else {
        results[v].decimals = 0;
      }
    }

    consoleOut('multisig assets:', results, 'blue');
    return results;

  },[]);

  const refreshVaults = useCallback(() => {

    setLoadingVaults(true);
    getMultisigVaults(connection, new PublicKey(multisigAddress))
    .then((result: MultisigVault[]) => {
      setMultisigVaults(result);
      let item: MultisigVault | undefined = undefined;
      if (result.length > 0 && !selectedVault) {
        item = Object.assign({}, result[0]);
      } else if (result.length > 0 && selectedVault) {
        const newItem = result.find(i => i.address === selectedVault.address);
        if (newItem) {
          item = Object.assign({}, newItem);
        } else {
          item = Object.assign({}, result[0]);
        }
      }
      setSelectedVault(item);
      consoleOut('selectedVault:', item, 'blue');
  })
    .catch(err => console.error(err))
    .finally(() => setLoadingVaults(false));

  }, [
    connection,
    selectedVault,
    multisigAddress,
    getMultisigVaults,
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

      multisigClient
        .getMultisigs(publicKey)
        .then((allInfo: MultisigInfo[]) => {
          allInfo.sort((a: any, b: any) => b.createdOnUtc.getTime() - a.createdOnUtc.getTime());
          setMultisigAccounts(allInfo);
          consoleOut('multisigs:', allInfo, 'blue');
          setLoadingMultisigAccounts(false);
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

  // Get Multisig Vaults
  useEffect(() => {

    if (!connection || !multisigClient || !publicKey) {
      return;
    }

    // Verify query param
    const params = new URLSearchParams(location.search);
    if (params.has('multisig') && !multisigAddress) {
      consoleOut('Wait for multisigAddress on next render...', '', 'blue');
      return;
    }

    const timeout = setTimeout(() => {
      setLoadingVaults(true);
      getMultisigVaults(connection, new PublicKey(multisigAddress))
      .then((result: MultisigVault[]) => {
        setMultisigVaults(result);
        let item: MultisigVault | undefined = undefined;
        if (result.length > 0 && !selectedVault) {
          item = Object.assign({}, result[0]);
        } else if (result.length > 0 && selectedVault) {
          const newItem = result.find(i => i.address === selectedVault.address);
          if (newItem) {
            item = Object.assign({}, newItem);
          } else {
            item = Object.assign({}, result[0]);
          }
        }
        setSelectedVault(item);
        consoleOut('selectedVault:', item, 'blue');
      })
      .catch(err => console.error(err))
      .finally(() => setLoadingVaults(false));
    });

    return () => {
      clearTimeout(timeout);
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[
    publicKey,
    connection,
    multisigClient,
    multisigAddress,
    location.search,
    getMultisigVaults
  ]);

  // Update list of txs
  useEffect(() => {

    if (
      !connection || 
      !publicKey || 
      !multisigClient || 
      !selectedMultisig || 
      !selectedMultisig.id ||
      !selectedVault ||
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
            if (tx.accounts.some(a => a.pubkey.equals(selectedVault.address))) {
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
    selectedVault
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
        refreshVaults();
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
    refreshVaults,
    lastSentTxOperationType
  ]);

  ////////////////////////////////
  //   Operations and Actions   //
  ////////////////////////////////

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

  },[t])

  // const isUnderDevelopment = () => {
  //   return isLocal() || (isDev() && isWhitelisted) ? true : false;
  // }

  // const refreshPage = useCallback(() => {
  //   window.location.reload();
  // },[])

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

  // Create asset modal
  const [isCreateAssetModalVisible, setIsCreateAssetModalVisible] = useState(false);
  const onShowCreateAssetModal = useCallback(() => {
    setIsCreateAssetModalVisible(true);
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.000010,
      mspPercentFee: 0
    };
    resetTransactionStatus();
    setTransactionFees(fees);
  },[resetTransactionStatus]);

  const onAssetCreated = useCallback(() => {

    resetTransactionStatus();
    openNotification({
      description: t('multisig.create-asset.success-message'),
      type: "success"
    });

  },[
    t,
    resetTransactionStatus
  ]);

  const onExecuteCreateAssetTx = useCallback(async (data: any) => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTxConfirmationContext();
    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createAsset = async (data: any) => {

      if (!connection || !multisigAddress || !publicKey || !data || !data.token) { return null; }

      const selectedMultisig = new PublicKey(multisigAddress);
      const [multisigSigner] = await PublicKey.findProgramAddress(
        [selectedMultisig.toBuffer()],
        MEAN_MULTISIG_PROGRAM
      );

      const mintAddress = new PublicKey(data.token.address);

      const signers: Signer[] = [];
      const ixs: TransactionInstruction[] = [];
      let tokenAccount = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        mintAddress,
        multisigSigner,
        true
      );

      const tokenAccountInfo = await connection.getAccountInfo(tokenAccount);

      if (!tokenAccountInfo) {
        ixs.push(
          Token.createAssociatedTokenAccountInstruction(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            mintAddress,
            tokenAccount,
            multisigSigner,
            publicKey
          )
        );
      } else {

        const tokenKeypair = Keypair.generate();
        tokenAccount = tokenKeypair.publicKey;

        ixs.push(
          SystemProgram.createAccount({
            fromPubkey: publicKey,
            newAccountPubkey: tokenAccount,
            programId: TOKEN_PROGRAM_ID,
            lamports: await Token.getMinBalanceRentForExemptAccount(connection),
            space: AccountLayout.span
          }),
          Token.createInitAccountInstruction(
            TOKEN_PROGRAM_ID,
            mintAddress,
            tokenAccount,
            multisigSigner
          )
        );

        signers.push(tokenKeypair);
      }

      const tx = new Transaction().add(...ixs);
      tx.feePayer = publicKey;
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;

      if (signers.length) {
        tx.partialSign(...signers);
      }

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
          customLogger.logWarning('Multisig Create Vault transaction failed', { transcript: transactionLog });
          return false;
        }

        return await createAsset(data)
          .then(value => {
            if (!value) { return false; }
            consoleOut('createVault returned transaction:', value);
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
            console.error('createVault error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`
            });
            customLogger.logError('Multisig Create Vault transaction failed', { transcript: transactionLog });
            return false;
          });

      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Multisig Create Vault transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet && publicKey) {
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
              result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logError('Multisig Create Vault transaction failed', { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: publicKey.toBase58()}
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
            result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logError('Multisig Create Vault transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Multisig Create Vault transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Multisig Create Vault transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Multisig Create Vault transaction failed', { transcript: transactionLog });
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
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.CreateAsset);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            onAssetCreated();
            setIsCreateAssetModalVisible(false);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    clearTxConfirmationContext,
    resetTransactionStatus,
    connection,
    nativeBalance,
    onAssetCreated,
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
    onExecuteCreateAssetTx(params);
  },[
    onExecuteCreateAssetTx
  ]);

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
      if (wallet && publicKey) {
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
              result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
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
            result: {signer: publicKey.toBase58()}
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
            result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logError('Transfer tokens transaction failed', { transcript: transactionLog });
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

      if (!publicKey || !selectedVault || !selectedMultisig || !multisigClient) { 
        return null;
      }

      const setAuthIx = Token.createSetAuthorityInstruction(
        TOKEN_PROGRAM_ID,
        selectedVault.address,
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
      if (wallet && publicKey) {
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
              result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
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
            result: {signer: publicKey.toBase58()}
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
            result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logError('Transfer Vault Authority transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Transfer Vault Authority transaction failed', { transcript: transactionLog });
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
    selectedVault, 
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

      if (!publicKey || !selectedVault || !selectedMultisig || !selectedMultisig.id || !multisigClient) { 
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

      if (!publicKey || !selectedVault) {
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
        asset: selectedVault.address.toBase58(),
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

      const result =  await closeAssetTx(selectedVault)
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
      if (wallet && publicKey) {
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
              result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
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
            result: {signer: publicKey.toBase58()}
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
            result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logError('Delete Vault transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Delete Vault transaction failed', { transcript: transactionLog });
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
    selectedVault,
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
      if (wallet && publicKey) {
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
              result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
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
            result: {signer: publicKey.toBase58()}
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
            result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
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
      if (wallet && publicKey) {
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
              result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
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
            result: {signer: publicKey.toBase58()}
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
            result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
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
      if (wallet && publicKey) {
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
              result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
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
            result: {signer: publicKey.toBase58()}
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
            result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logError('Finish Cancel transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Finish Cancel transaction failed', { transcript: transactionLog });
        return false;
      }
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
    if (item.status === MultisigTransactionStatus.Active) {
      onExecuteApproveTx({ transaction: item });
    } else if (item.status === MultisigTransactionStatus.Passed) {
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


  ///////////////
  // Rendering //
  ///////////////

  const getTokenIconAndAmount = (tokenAddress: string, amount: any, decimals: number) => {
    const token = tokenList.find(t => t.address === tokenAddress);
    if (!token) {
      return (
        <>
          <span className="info-icon token-icon">
            <Identicon address={tokenAddress} style={{ width: "30", height: "30", display: "inline-flex" }} />
          </span>
          <span className="info-data">
            {formatThousands(makeDecimal(amount, decimals), decimals)}
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
            {t('multisig.multisig-assets.cta-transfer')}
          </Button>
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            disabled={isTxInProgress() || loadingVaults}
            onClick={showTransferVaultAuthorityModal}>
            {t('multisig.multisig-assets.cta-change-multisig-authority')}
          </Button>

          {/* Operation indication */}
          {isCreatingVault() ? (
            <div className="flex-row flex-center">
              <LoadingOutlined />
              <span className="ml-1">{t('multisig.multisig-assets.cta-create-asset-busy')}</span>
            </div>
          ) : isSendingTokens() ? (
            <div className="flex-row flex-center">
              <LoadingOutlined />
              <span className="ml-1">{t('multisig.multisig-assets.cta-transfer-busy')}</span>
            </div>
          ) : isSettingVaultAuthority() ? (
            <div className="flex-row flex-center">
              <LoadingOutlined />
              <span className="ml-1">{t('multisig.multisig-assets.cta-change-multisig-authority-busy')}</span>
            </div>
          ) : null}
        </Space>
      </>
    );
  }

  // const txPendingSigners = (mtx: MultisigTransaction) => {
  //   if (!selectedMultisig || !selectedMultisig.owners || selectedMultisig.owners.length === 0) {
  //     return null;
  //   }

  //   const participants = selectedMultisig.owners as MultisigParticipant[]
  //   return (
  //     <>
  //       {participants.map((item, index) => {
  //         if (mtx.signers[index]) { return null; }
  //         return (
  //           <div key={`${index}`} className="well-group mb-1">
  //             <div className="flex-fixed-right align-items-center">
  //               <div className="left text-truncate m-0">
  //                 <div><span>{item.name || `Owner ${index + 1}`}</span></div>
  //                 <div className="font-size-75 text-monospace">{item.address}</div>
  //               </div>
  //               <div className="right pl-2">
  //                 <div><span className={theme === 'light' ? "fg-light-orange font-bold" : "fg-warning font-bold"}>{t("multisig.multisig-transactions.not-signed")}</span></div>
  //               </div>
  //             </div>
  //           </div>
  //         );
  //       })}
  //     </>
  //   );
  // };

  // const getParticipantsThatApprovedTx = useCallback((mtx: MultisigTransaction) => {

  //   if (!selectedMultisig || !selectedMultisig.owners || selectedMultisig.owners.length === 0) {
  //     return [];
  //   }
  
  //   let addressess: MultisigParticipant[] = [];
  //   const participants = selectedMultisig.owners as MultisigParticipant[];
  //   participants.forEach((participant: MultisigParticipant, index: number) => {
  //     if (mtx.signers[index]) {
  //       addressess.push(participant);
  //     }
  //   });
  
  //   return addressess;
  
  // }, [selectedMultisig]);

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
                    Balance
                  </span>
                </div>
                <div className="transaction-detail-row">
                  {
                    getTokenIconAndAmount(
                      selectedVault.mint.toBase58(),
                      selectedVault.amount,
                      selectedVault.decimals || 6
                    )
                  }
                </div>
              </Col>
              <Col span={12}>
                <div className="transaction-detail-row">
                  <span className="info-label">
                    {t('multisig.multisig-account-detail.address')}
                  </span>
                </div>

                {/* <div className="transaction-detail-row">
                  <span className="info-icon">
                    <IconShieldOutline className="mean-svg-icons" />
                  </span>
                  <div onClick={() => copyAddressToClipboard(selectedMultisig.authority)} 
                       className="info-data flex-row wrap align-items-center simplelink underline-on-hover"
                       style={{cursor: 'pointer', fontSize: '1.1rem'}}>
                    {shortenAddress(selectedMultisig.authority.toBase58(), 8)}
                  </div>
                </div> */}

                <div className="transaction-detail-row">
                  <span className="info-icon">
                    <IconShieldOutline className="mean-svg-icons" />
                  </span>
                  <div onClick={() => copyAddressToClipboard(selectedVault.owner.toBase58())} className="info-data flex-row wrap align-items-center simplelink underline-on-hover" style={{cursor: 'pointer', fontSize: '1.1rem'}}>
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
        const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
          event.currentTarget.src = FALLBACK_COIN_IMAGE;
          event.currentTarget.className = "error";
        };
        const onVaultSelected = (ev: any) => {
          setSelectedVault(item);
          setDtailsPanelOpen(true);
          consoleOut('selected asset:', item, 'blue');
          consoleOut('selected asset readable:', {
            address: item.address.toBase58(),
            owner: item.owner.toBase58(),
            mint: item.mint.toBase58(),
            mintDecimals: item.decimals,
            closeAuthority: item.closeAuthority.toBase58(),
            amount: item.amount.toNumber(),
            uiAmount: makeDecimal(item.amount, item.decimals),
          }, 'blue');
          setLoadingMultisigTxs(true);
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
              <div className="token-icon">
                {token && token.logoURI ? (
                  <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} onError={imageOnErrorHandler} />
                ) : (
                  <Identicon address={item.mint.toBase58()} style={{
                    width: "30",
                    display: "inline-flex",
                    height: "30",
                    overflow: "hidden",
                    borderRadius: "50%"
                  }} />
                )}
              </div>
            </div>
            <div className="description-cell">
              <div className="title text-truncate">{token ? token.symbol : `${CUSTOM_TOKEN_NAME} [${shortenAddress(item.mint.toBase58(), 6)}]`}</div>
              <div className="subtitle text-truncate">{shortenAddress(item.address.toBase58(), 8)}</div>
            </div>
            <div className="rate-cell">
              <div className="rate-amount text-uppercase">
                {formatThousands(makeDecimal(item.amount, item.decimals), item.decimals)}
              </div>
            </div>
          </div>
        );
      })
    ) : (
      <>
        <div className="h-100 flex-center">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{publicKey
            ? t('multisig.multisig-assets.no-assets')
            : t('multisig.multisig-assets.not-connected')}</p>} />
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
                    <Tooltip placement="bottom" title={t('multisig.multisig-assets.back-to-multisig-accounts-cta')}>
                      <Button
                        type="default"
                        shape="circle"
                        size="middle"
                        icon={<ArrowLeftOutlined />}
                        onClick={() => {
                          if (selectedMultisig) {
                            setHighLightableMultisigId(selectedMultisig.id.toBase58());
                          }
                          navigate('/multisig/');
                        }}
                      />
                    </Tooltip>
                  </span>
                </div>
                <IconSafe className="mean-svg-icons mr-1" />
                <span className="title">
                  {multisigVaults && selectedMultisig
                    ? t('multisig.multisig-assets.screen-title', {
                        multisigName: selectedMultisig.label,
                        itemCount: multisigVaults ? multisigVaults.length : 0
                      })
                    : t('multisig.multisig-assets.screen-title-no-assets')
                  }
                </span>
                <Tooltip placement="bottom" title={t('multisig.multisig-assets.refresh-tooltip')}>
                  <div className={`transaction-stats ${loadingVaults ? 'click-disabled' : 'simplelink'}`} onClick={refreshVaults}>
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
                      disabled={!publicKey || !selectedMultisig}
                      onClick={onShowCreateAssetModal}>
                      {publicKey
                        ? t('multisig.multisig-account-detail.cta-create-asset')
                        : t('transactions.validation.not-connected')
                      }
                    </Button>
                  </div>
                </div>
              </div>

            </div>

            <div className="meanfi-two-panel-right">
              <div className="meanfi-panel-heading">
                <span className="title">{t('multisig.multisig-assets.asset-detail-heading')}</span>
              </div>

              <div className="inner-container">
                {publicKey ? (
                  <>
                    {selectedVault && (
                      <div className="float-top-right">
                        <span className="icon-button-container secondary-button">
                          <Tooltip placement="bottom" title={t('multisig.multisig-assets.cta-close')}>
                            <Button
                              type="default"
                              shape="circle"
                              size="middle"
                              icon={<IconTrash className="mean-svg-icons" />}
                              onClick={showDeleteVaultModal}
                              disabled={isTxInProgress() || !canDeleteVault()}
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
                            <Divider className="activity-divider" plain></Divider>
                            {renderMultisigPendingTxs()}
                          </>
                        )}
                      </Spin>
                      {!loadingVaults && (
                        <>
                        {(!multisigVaults || multisigVaults.length === 0) && !selectedVault && (
                          <div className="h-100 flex-center">
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{t('multisig.multisig-assets.no-asset-loaded')}</p>} />
                          </div>
                        )}
                        </>
                      )}
                    </div>
                    {selectedVault && (
                      <div className="stream-share-ctas">
                        <span className="copy-cta" onClick={() => copyAddressToClipboard(selectedVault.address.toBase58())}>ASSET ADDRESS: {selectedVault.address.toBase58()}</span>
                        <a className="explorer-cta" target="_blank" rel="noopener noreferrer"
                          href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${selectedVault.address.toBase58()}${getSolanaExplorerClusterParam()}`}>
                          <IconExternalLink className="mean-svg-icons" />
                        </a>
                      </div>
                    )}
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

      {/* <MultisigCreateAssetModal
        handleOk={onAcceptCreateVault}
        handleClose={() => setIsCreateAssetModalVisible(false)}
        isVisible={isCreateAssetModalVisible}
        nativeBalance={nativeBalance}
        transactionFees={transactionFees}
        isBusy={isBusy}
      /> */}

      {/* {isTransferTokenModalVisible && (
        <MultisigTransferTokensModal
          isVisible={isTransferTokenModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          handleOk={onAcceptTransferToken}
          handleClose={() => {
            onAfterEveryModalClose();
            setIsTransferTokenModalVisible(false);
          }}
          selectedVault={selectedVault}
          isBusy={isBusy}
          assets={multisigVaults}
        />
      )} */}

      {/* {isTransferVaultAuthorityModalVisible && (
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
          selectedVault={selectedVault}
          assets={multisigVaults}
        />
      )} */}

      {/* {isDeleteVaultModalVisible && (
        <MultisigVaultDeleteModal
          isVisible={isDeleteVaultModalVisible}
          handleOk={onAcceptDeleteVault}
          handleAfterClose={onAfterEveryModalClose}
          handleClose={() => {
            onAfterEveryModalClose();
            setIsDeleteVaultModalVisible(false);
          }}
          isBusy={isBusy}
          selectedVault={selectedVault}
        />
      )} */}

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

      <PreFooter />
    </>
  );

};
