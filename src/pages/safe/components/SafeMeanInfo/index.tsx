import './style.scss';

import { Button, Col, Row } from "antd"
import { IconApprove, IconArrowForward, IconCheckCircle, IconCreated, IconCross, IconMinus } from "../../../../Icons"
import { shortenAddress } from "../../../../utils/utils";
import { SafeInfo } from "../UI/SafeInfo";
import { MultisigTransaction } from '@mean-dao/mean-multisig-sdk';
import { ProgramAccounts } from '../../../../utils/accounts';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Connection, MemcmpFilter, PublicKey } from '@solana/web3.js';
import { useConnectionConfig } from '../../../../contexts/connection';
import { consoleOut } from '../../../../utils/ui';
import { useWallet } from '../../../../contexts/wallet';
import { ResumeItem } from '../UI/ResumeItem';

export const SafeMeanInfo = (props: {
  isSafeDetails: boolean;
  isProgramDetails: boolean;
  onDataToSafeView: any;
  onDataToProgramView: any;
  proposals: any[];
  selectedMultisig?: any;
  onEditMultisigClick: any;
  onNewProposalMultisigClick: any;
  multisigVaults: any;
  multisigTxs: MultisigTransaction[];
}) => {

  const { isSafeDetails, isProgramDetails, multisigTxs, selectedMultisig, onEditMultisigClick, onNewProposalMultisigClick, multisigVaults } = props;

  const { publicKey } = useWallet();
  const connectionConfig = useConnectionConfig();

  const [programs, setPrograms] = useState<ProgramAccounts[] | undefined>(undefined);
  const [selectedProgram, setSelectedProgram] = useState<ProgramAccounts | undefined>(undefined);
  const [loadingPrograms, setLoadingPrograms] = useState(true);

  const connection = useMemo(() => new Connection(connectionConfig.endpoint, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true
  }), [
    connectionConfig.endpoint
  ]);

  // Proposals list
  const renderListOfProposals = (
    <>
      {multisigTxs && multisigTxs.length ? (
        multisigTxs.map((proposal, index) => {
          const onSelectProposal = () => {
            // Sends isSafeDetails value to the parent component "SafeView"
            props.onDataToSafeView(proposal);
          };

          // Number of participants who have already approved the Tx
          const approvedSigners = proposal.signers.filter((s: any) => s === true).length;

          const expirationDate = proposal.details.expirationDate ? new Date(proposal.details.expirationDate).toDateString() : "";

          const executedOnDate = proposal.executedOn ? new Date(proposal.executedOn).toDateString() : "";

          return (
            <div 
              key={proposal.id.toBase58()}
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
                  isSafeDetails={isSafeDetails}
                />
            </div>
          )
        })
      ) : (
        <span>This multisig has no proposals</span>
      )}
    </>
  );

  // Settings
  const renderSettings = (
    <>
      <Row gutter={[8, 8]}>
        <Col xs={12} sm={12} md={12} lg={12} className="text-right pr-1">Minimum cool-off period:</Col>
        <Col xs={12} sm={12} md={12} lg={12} className="text-left pl-1">24 hours</Col>
      </Row>
      <Row gutter={[8, 8]}>
        <Col xs={12} sm={12} md={12} lg={12} className="text-right pr-1">Single signer balance threshold:</Col>
        <Col xs={12} sm={12} md={12} lg={12} className="text-left pl-1">$100.00</Col>
      </Row>
    </>
  );

  // Activities list 
  const renderActivities= (
    <>
      {/* {proposals && proposals.length && (
        proposals.map((proposal) => (
          proposal.activities.map((activity: any) => {

            let icon = null;

            switch (activity.description) {
              case 'approved':
                icon = <IconApprove className="mean-svg-icons fg-green" />;
                break;
              case 'rejected':
                icon = <IconCross className="mean-svg-icons fg-red" />;
                break;
              case 'passed':
                icon = <IconCheckCircle className="mean-svg-icons fg-green" />;
                break;
              case 'created':
                icon = <IconCreated className="mean-svg-icons fg-purple" />;
                break;
              case 'deleted':
                icon = <IconMinus className="mean-svg-icons fg-purple" />;
                break;
              default:
                icon = "";
                break;
            }

            return (
              <div 
                key={activity.id}
                className={`d-flex w-100 align-items-center activities-list ${activity.id % 2 === 0 ? '' : 'background-gray'}`}
                >
                  <div className="list-item">
                    <span className="mr-2">
                        {activity.date}
                    </span>
                    {icon}
                    <span>
                      {`Proposal ${activity.description} by ${activity.proposedBy} [${shortenAddress(activity.address, 4)}]`}
                    </span>
                  </div>
              </div>
            )
          })
        ))
      )} */}
    </>
  );

  // Programs list
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
    const programs: ProgramAccounts[] = [];
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

      consoleOut(`Upgrade Authority: ${upgradeAuthority} --> Executable Data: ${executableData} --> Program: ${foundProgram}`);

      programs.push(foundProgram);

    }

    consoleOut(`${programs.length} programs found!`);

    return programs;

  }, [connection]);

  // Refresh programs
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

  // Get Programs
  useEffect(() => {
    if (!connection || !publicKey || !selectedMultisig || !selectedMultisig.authority || !loadingPrograms) {
      return;
    }

    const timeout = setTimeout(() => {
      getProgramsByUpgradeAuthority(selectedMultisig.authority)
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

  const renderPrograms = (
    <>
      {programs && programs.length ? (
        programs.map((program, index) => {
          const onSelectProgram = () => {
            // Sends isProgramDetails value to the parent component "SafeView"
            props.onDataToProgramView(program);
          }

          const programTitle = shortenAddress(program.pubkey.toBase58(), 4);

          return (
            <div 
              key={`${index + 1}`}
              onClick={onSelectProgram}
              className={`d-flex w-100 align-items-center simplelink ${(index + 1) % 2 === 0 ? '' : 'background-gray'}`}
            >
                <ResumeItem
                  id={program.pubkey.toBase58()}
                  title={programTitle}
                  isSafeDetails={isSafeDetails}
                  isProgram={true}
                  programSize={program.size}
                  isProgramDetails={isProgramDetails}
                />
            </div>
          )
        })
      ) : (
        <span>This multisig has no programs</span>
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
      name: "Settings",
      render: renderSettings
    }, 
    {
      name: "Activity",
      render: renderActivities
    }, 
    {
      name: "Programs",
      render: renderPrograms
    }
  ];

  return (
    <>
      <SafeInfo
        selectedMultisig={selectedMultisig}
        multisigVaults={multisigVaults}
        onNewProposalMultisigClick={onNewProposalMultisigClick}
        onEditMultisigClick={onEditMultisigClick}
        tabs={tabs}
      />
    </>
  )
}