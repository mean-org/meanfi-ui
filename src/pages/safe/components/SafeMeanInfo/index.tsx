import './style.scss';
import { formatThousands, shortenAddress } from "../../../../middleware/utils";
import { SafeInfo } from "../UI/SafeInfo";
import { MeanMultisig, MultisigTransaction, MultisigTransactionSummary } from '@mean-dao/mean-multisig-sdk';
import { useCallback, useContext, useEffect, useState } from 'react';
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { consoleOut } from '../../../../middleware/ui';
import { AppStateContext } from '../../../../contexts/appstate';
import { TxConfirmationContext } from '../../../../contexts/transaction-status';
import { useWallet } from '../../../../contexts/wallet';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { openNotification } from '../../../../components/Notifications';
import { getSolanaExplorerClusterParam } from '../../../../contexts/connection';
import { useTranslation } from 'react-i18next';
import { useNativeAccount } from '../../../../contexts/accounts';
import { SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from '../../../../constants';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { NATIVE_SOL_MINT } from '../../../../middleware/ids';
import { ACCOUNT_LAYOUT } from '../../../../middleware/layouts';
import BN from 'bn.js';
import { IconArrowForward } from '../../../../Icons';
import { ResumeItem } from '../../../../components/ResumeItem';
import { appConfig } from '../../../..';

export const SafeMeanInfo = (props: {
  assetSelected?: any;
  connection: Connection;
  isAssetDetails: boolean;
  isProgramDetails: boolean;
  isProposalDetails: boolean;
  loadingPrograms: boolean;
  loadingProposals: boolean;
  multisigClient: MeanMultisig | null;
  onDataToProgramView: any;
  onDataToSafeView: any;
  onEditMultisigClick: any;
  onNavigateAway: any;
  onNewProposalMultisigClick: any;
  onRefreshRequested: any;
  proposalSelected?: any;
  publicKey: PublicKey | null | undefined;
  selectedMultisig?: any;
  selectedTab?: any;
  vestingAccountsCount: number;
}) => {
  const {
    connection,
    loadingPrograms,
    loadingProposals,
    multisigClient,
    onDataToProgramView,
    onDataToSafeView,
    onEditMultisigClick,
    onNavigateAway,
    onNewProposalMultisigClick,
    onRefreshRequested,
    proposalSelected,
    publicKey,
    selectedMultisig,
    selectedTab,
    vestingAccountsCount,
  } = props;
  const { 
    programs,
    multisigTxs,
    multisigSolBalance,
    previousWalletConnectState,
    setMultisigSolBalance,
    refreshTokenBalance,
    setMultisigVaults,
  } = useContext(AppStateContext);
  const {
    fetchTxInfoStatus,
    lastSentTxSignature,
    lastSentTxOperationType,
    clearTxConfirmationContext,
  } = useContext(TxConfirmationContext);
  const navigate = useNavigate();
  const location = useLocation();
  const { address } = useParams();
  const { t } = useTranslation('common');
  const { account } = useNativeAccount();
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [multisigAddress, setMultisigAddress] = useState('');
  const [multisigTransactionSummary, setMultisigTransactionSummary] = useState<MultisigTransactionSummary | undefined>(undefined);
  const [highlightedMultisigTx, sethHighlightedMultisigTx] = useState<MultisigTransaction | undefined>();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  // const [assetsWithoutSol, setAssetsWithoutSol] = useState<MultisigVault[]>([]);

  // Tabs
  const [amountOfProposals, setAmountOfProposals] = useState<string>("");
  const [amountOfPrograms, setAmountOfPrograms] = useState<string>("");
  const multisigAddressPK = new PublicKey(appConfig.getConfig().multisigProgramAddress);
  
  const getMultisigVaults = useCallback(async (
    connection: Connection,
    multisig: PublicKey

  ) => {

    const [multisigSigner] = await PublicKey.findProgramAddress(
      [multisig.toBuffer()],
      multisigAddressPK
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

  const isTxInProgress = useCallback((): boolean => {
    return isBusy || fetchTxInfoStatus === "fetching" ? true : false;
  }, [
    isBusy,
    fetchTxInfoStatus,
  ]);

  // Get Multisig Vaults
  useEffect(() => {

    if (!connection || !multisigClient || !address || !selectedMultisig || !loadingAssets) { return; }

    const timeout = setTimeout(() => {
      if (address === selectedMultisig.authority.toBase58()) {
        const solToken = getSolToken();

        getMultisigVaults(connection, selectedMultisig.id)
          .then(result => {
            const modifiedResults = new Array<any>();
            modifiedResults.push(solToken);  
            result.forEach(item => {
              modifiedResults.push(item);
            });
            // setAssetsWithoutSol(result);
            setMultisigVaults(modifiedResults);  
            consoleOut("Multisig assets", modifiedResults, "blue");
          })
          .catch(err => {
            console.error(err);
            setMultisigVaults([solToken]);
          })
          .finally(() => setLoadingAssets(false));
      }
    });

    return () => {
      clearTimeout(timeout);
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[
    address,
    connection,
    loadingAssets,
    multisigClient,
    selectedMultisig,
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

  // Handle what to do when pending Tx confirmation reaches finality or on error
  useEffect(() => {
    if (!publicKey || fetchTxInfoStatus === "fetching") { return; }

    if (multisigAddress && lastSentTxOperationType) {
      if (fetchTxInfoStatus === "fetched") {
        clearTxConfirmationContext();
        sethHighlightedMultisigTx(undefined);
        setMultisigTransactionSummary(undefined);
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

  // Get multisig SOL balance
  useEffect(() => {

    if (!connection || !address || !selectedMultisig) { return; }

      const timeout = setTimeout(() => {
        if (address === selectedMultisig.authority.toBase58()) {
          connection.getBalance(selectedMultisig.authority)
          .then(balance => {
            consoleOut('multisigSolBalance', balance, 'orange');
            setMultisigSolBalance(balance);
          })
          .catch(err => console.error(err));
      }
    });

    return () => clearTimeout(timeout);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    address,
    connection,
    selectedMultisig,
  ]);

  useEffect(() => {
    if (multisigTxs && multisigTxs.length > 0) {
      setAmountOfProposals(`(${multisigTxs.length})`)
    } else {
      setAmountOfProposals("")
    }
  }, [multisigTxs]);

  useEffect(() => {
    if (programs && programs.length > 0) {
      setAmountOfPrograms(`(${programs.length})`)
    } else {
      setAmountOfPrograms("")
    }
  }, [programs]);

  useEffect(() => {
    const loading = selectedMultisig ? true : false;
    const timeout = setTimeout(() => {
      setLoadingAssets(loading);
    });

    return () => {
      clearTimeout(timeout);
    }
  },[
    selectedMultisig
  ]);

  // Proposals list
  const renderListOfProposals = useCallback(() => {
    if (loadingProposals) {
      return (<span className="pl-1">Loading proposals ...</span>);
    }

    return (
      <>
        {
          multisigTxs && multisigTxs.length > 0 ? (
            multisigTxs.map((proposal, index) => {
              const onSelectProposal = () => {
                // Sends proposal value to the parent component "SafeView"
                onDataToSafeView(proposal);
              };
              const title = proposal.details.title ? proposal.details.title : "Unknown proposal";
              // Number of participants who have already approved the Tx
              const approvedSigners = proposal.signers.filter((s: any) => s === true).length;
              const rejectedSigners = proposal.signers.filter((s: any) => s === false).length;
              const expirationDate = proposal.details.expirationDate ? proposal.details.expirationDate : "";
              const executedOnDate = proposal.executedOn ? proposal.executedOn.toDateString() : "";
              return (
                <div 
                  key={index}
                  onClick={onSelectProposal}
                  className={`w-100 simplelink hover-list ${(index + 1) % 2 === 0 ? '' : 'background-gray'}`}>
                    <ResumeItem
                      id={proposal.id.toBase58()}
                      title={title}
                      expires={expirationDate}
                      executedOn={executedOnDate}
                      approved={approvedSigners}
                      rejected={rejectedSigners}
                      userSigned={proposal.didSigned}
                      status={proposal.status}
                      hasRightIcon={true}
                      rightIcon={<IconArrowForward className="mean-svg-icons" />}
                      isLink={true}
                      classNameRightContent="resume-stream-row"
                      classNameIcon="icon-proposal-row"
                    />
                </div>
              )
            })
          ) : (
            <span className="pl-1">This multisig has no proposals</span>
          )
        }
      </>
    );
  }, [loadingProposals, multisigTxs, onDataToSafeView]);

  const renderListOfPrograms = useCallback(() => {
    if (loadingPrograms) {
      return (<span className="pl-1">Loading programs ...</span>);
    }

    return (
      <>
        {
          programs && programs.length > 0 ? (
            programs.map((program, index) => {
              const onSelectProgram = () => {
                // Sends program value to the parent component "SafeView"
                onDataToProgramView(program);
              }
              const programTitle = program.pubkey ? shortenAddress(program.pubkey, 4) : "Unknown program";
              const programSubtitle = shortenAddress(program.pubkey, 8);
              return (
                <div 
                  key={`${index + 1}`}
                  onClick={onSelectProgram}
                  className={`w-100 simplelink hover-list ${(index + 1) % 2 === 0 ? '' : 'background-gray'}`}>
                    <ResumeItem
                      id={program.pubkey.toBase58()}
                      title={programTitle}
                      subtitle={programSubtitle}
                      amount={formatThousands(program.size)}
                      resume="bytes"
                      hasRightIcon={true}
                      rightIcon={<IconArrowForward className="mean-svg-icons" />}
                      isLink={true}
                    />
                </div>
              )
            })
          ) : (
            <span className="pl-1">This multisig has no programs</span>
          )
        }
      </>
    );
  }, [loadingPrograms, onDataToProgramView, programs]);

  // Tabs
  const proposalsTabContent = useCallback(() => {
    return {
        id: "proposals",
        name: `Proposals ${amountOfProposals}`,
        render: renderListOfProposals()
      };
  }, [amountOfProposals, renderListOfProposals]);

  const programsTabContent = useCallback(() => {
    return {
        id: "programs",
        name: `Programs ${amountOfPrograms}`,
        render: renderListOfPrograms()
      };
  }, [amountOfPrograms, renderListOfPrograms]);

  return (
    <>
      <SafeInfo
        isTxInProgress={isTxInProgress}
        onEditMultisigClick={onEditMultisigClick}
        onNavigateAway={onNavigateAway}
        onNewProposalMultisigClick={onNewProposalMultisigClick}
        onRefreshTabsInfo={onRefreshRequested}
        selectedMultisig={selectedMultisig}
        selectedTab={selectedTab}
        programsTabContent={programsTabContent()}
        proposalsTabContent={proposalsTabContent()}
        vestingAccountsCount={vestingAccountsCount}
      />
    </>
  )
}
