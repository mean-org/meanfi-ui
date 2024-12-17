import type { MultisigInfo, MultisigTransaction } from '@mean-dao/mean-multisig-sdk';
import type { Connection } from '@solana/web3.js';
import { useCallback, useContext, useEffect, useState } from 'react';
import { IconArrowForward } from 'src/Icons';
import { ResumeItem } from 'src/components/ResumeItem';
import { AppStateContext } from 'src/contexts/appstate';
import { consoleOut } from 'src/middleware/ui';
import type { ProgramAccounts } from 'src/models/accounts';
import { SafeInfo } from '../SafeInfo';

export const SafeMeanInfo = (props: {
  connection: Connection;
  loadingProposals: boolean;
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
    onProposalSelected,
    onEditMultisigClick,
    onNewProposalClicked,
    safeBalanceInUsd,
    selectedMultisig,
    selectedTab,
  } = props;
  const { multisigTxs, setMultisigSolBalance } = useContext(AppStateContext);

  // Tabs
  const [amountOfProposals, setAmountOfProposals] = useState<string>('');

  // Get multisig SOL balance
  // biome-ignore lint/correctness/useExhaustiveDependencies: Deps managed manually
  useEffect(() => {
    if (!connection || !selectedMultisig) {
      return;
    }

    connection
      .getBalance(selectedMultisig.authority)
      .then(balance => {
        consoleOut('multisigSolBalance', balance, 'orange');
        setMultisigSolBalance(balance);
      })
      .catch(err => console.error(err));
  }, [connection, selectedMultisig]);

  useEffect(() => {
    if (multisigTxs && multisigTxs.length > 0) {
      setAmountOfProposals(`(${multisigTxs.length})`);
    } else {
      setAmountOfProposals('');
    }
  }, [multisigTxs]);

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
