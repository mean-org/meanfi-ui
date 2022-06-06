import './style.scss';
import { shortenAddress } from "../../../../utils/utils";
import { SafeInfo } from "../UI/SafeInfo";
import { MeanMultisig, MEAN_MULTISIG_PROGRAM, MultisigInfo, MultisigTransaction, MultisigTransactionSummary } from '@mean-dao/mean-multisig-sdk';
import { ProgramAccounts } from '../../../../utils/accounts';
import { useCallback, useContext, useEffect, useState } from 'react';
import { Connection, LAMPORTS_PER_SOL, MemcmpFilter, PublicKey } from '@solana/web3.js';
import { consoleOut } from '../../../../utils/ui';
import { ResumeItem } from '../UI/ResumeItem';
import { AppStateContext } from '../../../../contexts/appstate';
import { TxConfirmationContext } from '../../../../contexts/transaction-status';
import { IconArrowForward } from '../../../../Icons';
import { useWallet } from '../../../../contexts/wallet';
import { useLocation, useNavigate } from 'react-router-dom';
import { openNotification } from '../../../../components/Notifications';
import { getSolanaExplorerClusterParam } from '../../../../contexts/connection';
import { useTranslation } from 'react-i18next';
import { useNativeAccount } from '../../../../contexts/accounts';
import { SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from '../../../../constants';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { NATIVE_SOL_MINT } from '../../../../utils/ids';
import BN from 'bn.js';
import { MultisigVault } from '../../../../models/multisig';
import { ACCOUNT_LAYOUT } from '../../../../utils/layouts';

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
    programs,
    multisigTxs,
    multisigVaults,
    multisigSolBalance,
    refreshTokenBalance,
    previousWalletConnectState,
    setMultisigSolBalance,
    setMultisigVaults,
    setMultisigTxs,
    setPrograms,
  } = useContext(AppStateContext);
  const {
    fetchTxInfoStatus,
    lastSentTxSignature,
    lastSentTxOperationType,
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
    // onNewCreateAssetClick,
    selectedTab,
    multisigClient,
    proposalSelected,
    onDataToSafeView,
    assetSelected

  } = props;
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('common');
  const { account } = useNativeAccount();
  const { connected } = useWallet();
  // const [multisig, setMultisig] = useState<any>(selectedMultisig);
  // const [multisigSolBalance, setMultisigSolBalance] = useState<number>(0);
  // const [multisigTxs, setMultisigTxs] = useState<MultisigTransaction[] | undefined>();
  const [loadingProposals, setLoadingProposals] = useState(true);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [loadingPrograms, setLoadingPrograms] = useState(true);
  const [selectedProposal, setSelectedProposal] = useState<MultisigTransaction | undefined>();
  const [isBusy, setIsBusy] = useState(false);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [multisigPendingTxs, setMultisigPendingTxs] = useState<MultisigTransaction[]>([]);
  const [multisigAccounts, setMultisigAccounts] = useState<(MultisigInfo)[]>([]);
  const [loadingMultisigTxs, setLoadingMultisigTxs] = useState(true);
  const [loadingMultisigAccounts, setLoadingMultisigAccounts] = useState(true);
  const [multisigAddress, setMultisigAddress] = useState('');
  const [multisigTransactionSummary, setMultisigTransactionSummary] = useState<MultisigTransactionSummary | undefined>(undefined);
  const [highlightedMultisigTx, sethHighlightedMultisigTx] = useState<MultisigTransaction | undefined>();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [assetsWithoutSol, setAssetsWithoutSol] = useState<MultisigVault[]>([]);
  // const [multisigVaults, setMultisigVaults] = useState<MultisigVault[]>([]);

  // Tabs
  const [amountOfProposals, setAmountOfProposals] = useState<string>("");
  // const [amountOfAssets, setAmountOfAssets] = useState<string>("");
  const [amountOfPrograms, setAmountOfPrograms] = useState<string>("");

  const onRefreshTabsInfo = () => {
    setLoadingProposals(true);
    setLoadingAssets(true);
    setLoadingPrograms(true);
  }

  const getMultisigVaults = useCallback(async (
    connection: Connection,
    multisig: PublicKey

  ) => {

    const [multisigSigner] = await PublicKey.findProgramAddress(
      [multisig.toBuffer()],
      MEAN_MULTISIG_PROGRAM
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

    if (!selectedMultisig) { return null; }

    return {
      mint: NATIVE_SOL_MINT,
      owner: selectedMultisig.authority,
      amount: multisigSolBalance && new BN(multisigSolBalance),
      delegateOption: 0,
      delegate: undefined,
      state: 1,
      isNativeOption: 0,
      isNative: true,
      delegatedAmount: 0,
      closeAuthorityOption: 0,
      closeAuthority: undefined,
      address: selectedMultisig.id,
      decimals: 9

    } as any;

  }, [
    selectedMultisig, 
    multisigSolBalance
  ]);
  
  // Get Multisig Vaults
  useEffect(() => {

    if (!connection || !multisigClient || !selectedMultisig || !loadingAssets) { return; }
  
    const timeout = setTimeout(() => {

      const solToken = getSolToken();

      getMultisigVaults(connection, selectedMultisig.id)
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
    selectedMultisig, 
    connection, 
    loadingAssets,
    multisigClient, 
    getMultisigVaults,
    setMultisigVaults,
    getSolToken, 
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

  useEffect(() => {

    if (!connection || !selectedMultisig) { return; }

    // TODO: Check with Yansel (change balance of the selectedMultisig.id for selectedMultisig.authority)
    const timeout = setTimeout(() => {
      connection
        .getBalance(selectedMultisig.authority)
        .then(balance => setMultisigSolBalance(balance))
        .catch(err => console.error(err));
    });

    return () => clearTimeout(timeout);

  }, [
    connection,
    selectedMultisig,
    setMultisigSolBalance
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

    if (!connection || !selectedMultisig || !selectedMultisig.authority) { return []; }

    const BPFLoaderUpgradeab1e = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
    const execDataAccountsFilter: MemcmpFilter = { 
      memcmp: { offset: 13, bytes: selectedMultisig.authority.toBase58() } 
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
          upgradeAuthority: selectedMultisig.authority,
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
    selectedMultisig
  ]);

  // Get Programs
  useEffect(() => {
    if (!connection || !selectedMultisig || !loadingPrograms) {
      return;
    }

    const timeout = setTimeout(() => {
      getProgramsByUpgradeAuthority()
        .then(progs => {
          setPrograms(progs.length > 0 ? progs : undefined);
          setAmountOfPrograms(progs.length > 0 ? progs.length.toString() : "");
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
    selectedMultisig,
    loadingPrograms,
    getProgramsByUpgradeAuthority,
    setAmountOfPrograms,
    setPrograms
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

  // Get Txs for the selected multisig
  useEffect(() => {

    if (
      !connection || 
      !publicKey || 
      !multisigClient || 
      !selectedMultisig ||
      !loadingProposals
    ) { 
      return;
    }

    const timeout = setTimeout(() => {

      consoleOut('Triggering loadMultisigPendingTxs ...', '', 'blue');

      multisigClient
        .getMultisigTransactions(selectedMultisig.id, publicKey)
        .then((txs: MultisigTransaction[]) => {
          setMultisigTxs(txs.length > 0 ? txs : undefined)
        })
        .catch((err: any) => {
          console.error("Error fetching all transactions", err);
        })
        .finally(() => setLoadingProposals(false));
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    publicKey, 
    selectedMultisig, 
    connection, 
    multisigClient, 
    loadingProposals, 
    proposalSelected,
    setMultisigTxs
  ]);

  // useEffect(() => {
  //   const timeout = setTimeout(() => {

  //     if (multisigTxs) {
  //       setLoadingProposals(false);
  //     } else {
  //       setLoadingProposals(true);
  //     }
  //   }, 2500);

  //   return () => {
  //     clearTimeout(timeout);
  //   }
  // }, [multisigTxs]);

  // Proposals list
  const renderListOfProposals = (
    <>
      {!loadingProposals ? (
        (multisigTxs !== undefined) ? (
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
                    hasRightIcon={true}
                    rightIcon={<IconArrowForward className="mean-svg-icons" />}
                  />
              </div>
            )
          })
        ) : (
          <span className="pl-1">This multisig has no proposals</span>
        )
      ) : (
        <span className="pl-1">Loading proposals ...</span>
      )}
    </>
  );

  useEffect(() => {
    const timeout = setTimeout(() => {

      if (programs) {
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
        (programs !== undefined) ? (
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
                    hasRightIcon={true}
                    rightIcon={<IconArrowForward className="mean-svg-icons" />}
                  />
              </div>
            )
          })
        ) : (
          <span className="pl-1">This multisig has no programs</span>
        )
      ) : (
        <span className="pl-1">Loading programs ...</span>
      )}
    </>
  );


  useEffect(() => {
    if (selectedMultisig) {
      !loadingProposals ? (
        multisigTxs && multisigTxs.length > 0 && (
          setAmountOfProposals(`(${multisigTxs.length})`)
        )
      ) : (
        setAmountOfProposals("")
      )
    }
  }, [loadingProposals, multisigTxs, selectedMultisig]);

  useEffect(() => {
    if (selectedMultisig) {
      !loadingPrograms ? (
        programs && programs.length > 0 ? (
          setAmountOfPrograms(`(${programs.length})`)
        ) : (
          setAmountOfPrograms("")
        )
      ) : (
        setAmountOfPrograms("")
      )
    }
  }, [loadingPrograms, programs, selectedMultisig]);

  // Tabs
  const tabs = [
    {
      id: "safe01",
      name: `Proposals ${amountOfProposals}`,
      render: renderListOfProposals
    },
    {
      id: "safe03",
      name: `Programs ${amountOfPrograms}`,
      render: renderListOfPrograms
    }
  ];

  return (
    <>
      <SafeInfo
        selectedMultisig={selectedMultisig}
        onNewProposalMultisigClick={onNewProposalMultisigClick}
        onEditMultisigClick={onEditMultisigClick}
        onRefreshTabsInfo={onRefreshTabsInfo}
        tabs={tabs}
        selectedTab={selectedTab}
        isTxInProgress={isTxInProgress}
      />
    </>
  )
}