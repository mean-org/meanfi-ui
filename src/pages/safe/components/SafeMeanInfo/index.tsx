import type { MeanMultisig, MultisigInfo, MultisigTransaction } from '@mean-dao/mean-multisig-sdk';
import { BN } from '@project-serum/anchor';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { type Connection, PublicKey } from '@solana/web3.js';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { IconArrowForward } from 'src/Icons';
import { ResumeItem } from 'src/components/ResumeItem';
import { useNativeAccount } from 'src/contexts/accounts';
import { AppStateContext } from 'src/contexts/appstate';
import { appConfig } from 'src/main';
import { SOL_MINT } from 'src/middleware/ids';
import { ACCOUNT_LAYOUT } from 'src/middleware/layouts';
import { consoleOut } from 'src/middleware/ui';
import { getAmountFromLamports } from 'src/middleware/utils';
import type { ProgramAccounts } from 'src/models/accounts';
import type { MultisigVault } from 'src/models/multisig';
import { SafeInfo } from '../SafeInfo';

export const SafeMeanInfo = (props: {
  connection: Connection;
  loadingProposals: boolean;
  multisigClient: MeanMultisig | undefined;
  onDataToProgramView: (program: ProgramAccounts) => void;
  onProposalSelected: (proposal: MultisigTransaction) => void;
  onEditMultisigClick: () => void;
  onNewProposalClicked?: () => void;
  safeBalanceInUsd: number | undefined;
  selectedMultisig?: MultisigInfo;
  selectedTab?: string;
}) => {
  const {
    connection,
    loadingProposals,
    multisigClient,
    onProposalSelected,
    onEditMultisigClick,
    onNewProposalClicked,
    safeBalanceInUsd,
    selectedMultisig,
    selectedTab,
  } = props;
  const { multisigTxs, multisigSolBalance, setMultisigSolBalance, refreshTokenBalance, setMultisigVaults } =
    useContext(AppStateContext);
  const { address } = useParams();
  const { account } = useNativeAccount();
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);

  // Tabs
  const [amountOfProposals, setAmountOfProposals] = useState<string>('');
  const multisigAddressPK = useMemo(() => new PublicKey(appConfig.getConfig().multisigProgramAddress), []);

  // TODO: Do this better, this kills us
  const getMultisigVaults = useCallback(
    async (connection: Connection, multisig: PublicKey) => {
      const [multisigSigner] = PublicKey.findProgramAddressSync([multisig.toBuffer()], multisigAddressPK);

      const accountInfos = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
        filters: [{ memcmp: { offset: 32, bytes: multisigSigner.toBase58() } }, { dataSize: ACCOUNT_LAYOUT.span }],
      });

      if (!accountInfos?.length) {
        return [];
      }

      return accountInfos.map(t => {
        const tokenAccount = ACCOUNT_LAYOUT.decode(t.account.data);
        tokenAccount.address = t.pubkey;
        return tokenAccount;
      });
    },
    [multisigAddressPK],
  );

  const getSolToken = useCallback(() => {
    if (!selectedMultisig) {
      return null;
    }

    return {
      mint: SOL_MINT,
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
      decimals: 9,
    } as unknown as MultisigVault;
  }, [selectedMultisig, multisigSolBalance]);

  // Get Multisig Vaults
  // biome-ignore lint/correctness/useExhaustiveDependencies: Deps managed manually
  useEffect(() => {
    if (!connection || !multisigClient || !address || !selectedMultisig || !loadingAssets) {
      return;
    }

    if (address === selectedMultisig.authority.toBase58()) {
      const solToken = getSolToken();

      getMultisigVaults(connection, selectedMultisig.id)
        .then(result => {
          const modifiedResults = new Array<MultisigVault>();
          if (solToken) {
            modifiedResults.push(solToken);
          }
          for (const item of result) {
            modifiedResults.push(item);
          }
          setMultisigVaults(modifiedResults);
          consoleOut('Multisig assets', modifiedResults, 'blue');
        })
        .catch(err => {
          console.error(err);
          if (solToken) {
            setMultisigVaults([solToken]);
          }
        })
        .finally(() => setLoadingAssets(false));
    }
  }, [address, connection, loadingAssets, multisigClient, selectedMultisig]);

  // Keep account balance updated
  useEffect(() => {
    if (!(account?.lamports !== previousBalance || !nativeBalance)) {
      return;
    }
    refreshTokenBalance();
    setNativeBalance(getAmountFromLamports(account?.lamports));
    setPreviousBalance(account?.lamports);
  }, [account, nativeBalance, previousBalance, refreshTokenBalance]);

  // Get multisig SOL balance
  // biome-ignore lint/correctness/useExhaustiveDependencies: Deps managed manually
  useEffect(() => {
    if (!connection || !address || !selectedMultisig) {
      return;
    }

    if (address === selectedMultisig.authority.toBase58()) {
      connection
        .getBalance(selectedMultisig.authority)
        .then(balance => {
          consoleOut('multisigSolBalance', balance, 'orange');
          setMultisigSolBalance(balance);
        })
        .catch(err => console.error(err));
    }
  }, [address, connection, selectedMultisig]);

  useEffect(() => {
    if (multisigTxs && multisigTxs.length > 0) {
      setAmountOfProposals(`(${multisigTxs.length})`);
    } else {
      setAmountOfProposals('');
    }
  }, [multisigTxs]);

  useEffect(() => {
    const loading = !!selectedMultisig;
    const timeout = setTimeout(() => {
      setLoadingAssets(loading);
    });

    return () => {
      clearTimeout(timeout);
    };
  }, [selectedMultisig]);

  // Proposals list
  const renderListOfProposals = useCallback(() => {
    if (loadingProposals) {
      return <span className='pl-1'>Loading proposals ...</span>;
    }

    return (
      <>
        {multisigTxs && multisigTxs.length > 0 ? (
          multisigTxs.map((proposal, index) => {
            const onSelectProposal = () => {
              onProposalSelected(proposal);
            };
            const title = proposal.details.title ? proposal.details.title : 'Unknown proposal';
            // Number of participants who have already approved the Tx
            const approvedSigners = proposal.signers.filter(s => s === true).length;
            const rejectedSigners = proposal.signers.filter(s => s === false).length;
            const expirationDate = proposal.details.expirationDate ? proposal.details.expirationDate : '';
            const executedOnDate = proposal.executedOn ? proposal.executedOn.toDateString() : '';
            return (
              <div
                key={proposal.id.toBase58()}
                onClick={onSelectProposal}
                onKeyDown={() => {}}
                className={`w-100 simplelink hover-list ${(index + 1) % 2 === 0 ? '' : 'bg-secondary-02'}`}
              >
                <ResumeItem
                  id={proposal.id.toBase58()}
                  title={title}
                  expires={expirationDate}
                  executedOn={executedOnDate}
                  approved={approvedSigners}
                  rejected={rejectedSigners}
                  userSigned={proposal.didSigned ?? false}
                  status={proposal.status}
                  hasRightIcon={true}
                  rightIcon={<IconArrowForward className='mean-svg-icons' />}
                  isLink={true}
                  classNameRightContent='resume-stream-row'
                  classNameIcon='icon-proposal-row'
                />
              </div>
            );
          })
        ) : (
          <span className='pl-1'>This multisig has no proposals</span>
        )}
      </>
    );
  }, [loadingProposals, multisigTxs, onProposalSelected]);

  // Tabs
  const proposalsTabContent = useCallback(() => {
    return {
      id: 'proposals',
      name: `Proposals ${amountOfProposals}`,
      render: renderListOfProposals(),
    };
  }, [amountOfProposals, renderListOfProposals]);

  return (
    <SafeInfo
      onEditMultisigClick={onEditMultisigClick}
      onNewProposalClicked={onNewProposalClicked}
      selectedMultisig={selectedMultisig}
      selectedTab={selectedTab}
      totalSafeBalance={safeBalanceInUsd}
      proposalsTabContent={proposalsTabContent()}
    />
  );
};
