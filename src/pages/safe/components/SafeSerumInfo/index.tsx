import { MultisigTransaction } from '@mean-dao/mean-multisig-sdk';
import { Idl, Program } from '@project-serum/anchor';
import { Connection, MemcmpFilter, PublicKey } from '@solana/web3.js';
import { Button, Col, Row } from "antd";
import { ResumeItem } from 'components/ResumeItem';
import { IconArrowForward } from "Icons";
import { consoleOut } from 'middleware/ui';
import { ProgramAccounts } from "models/accounts";
import { useCallback, useEffect, useState } from 'react';
import { SafeInfo } from "../SafeInfo";

export const SafeSerumInfoView = (props: {
  connection: Connection;
  isProgramDetails: boolean;
  isProposalDetails: boolean;
  multisigClient: Program<Idl>;
  multisigTxs: MultisigTransaction[];
  onDataToProgramView: any;
  onDataToSafeView: any;
  onEditMultisigClick: any;
  onNewProposalClicked?: any;
  selectedMultisig?: any;
}) => {
  const {
    connection,
    isProposalDetails,
    multisigTxs,
    onEditMultisigClick,
    onNewProposalClicked,
    selectedMultisig,
  } = props;

  const [programs, setPrograms] = useState<ProgramAccounts[]>([]);
  const safeSerumNameImg = "https://assets.website-files.com/6163b94b432ce93a0408c6d2/61ff1e9b7e39c27603439ad2_serum%20NOF.png";
  const safeSerumNameImgAlt = "Serum";

  // Proposals list
  const renderListOfProposals = (
    <>
      {multisigTxs && multisigTxs.length && (
        multisigTxs.map((tx, index) => {
          const onSelectProposal = () => {
            // Sends isProposalDetails value to the parent component "SafeView"
            props.onDataToSafeView(tx);
          };

          const title = tx.details.title ? tx.details.title : "Unknown proposal";

          const approvedSigners = tx.signers.filter((s: any) => s === true).length;
          const expirationDate = tx.details.expirationDate ? tx.details.expirationDate.toDateString() : "";
          const executedOnDate = tx.executedOn ? tx.executedOn.toDateString() : "";

          return (
            <div 
              key={tx.id.toBase58()}
              onClick={onSelectProposal}
              className={`w-100 simplelink hover-list ${(index + 1) % 2 === 0 ? '' : 'bg-secondary-02'}`}
              >
                <ResumeItem
                  id={tx.id.toBase58()}
                  // src={proposal.src}
                  title={title}
                  expires={expirationDate}
                  executedOn={executedOnDate}
                  approved={approvedSigners}
                  status={tx.status}
                  rightIcon={<IconArrowForward className="mean-svg-icons" />}
                  isLink={true}
                />
            </div>
          )
        })
      )}
    </>
  );

  // // Activities list 
  // const renderActivities= (
  //   <>
  //     {proposals && proposals.length && (
  //       proposals.map((proposal) => (
  //         proposal.activities.map((activity: any) => {

  //           let icon = null;

  //           switch (activity.description) {
  //             case 'approved':
  //               icon = <IconApprove className="mean-svg-icons fg-green" />;
  //               break;
  //             case 'rejected':
  //               icon = <IconCross className="mean-svg-icons fg-red" />;
  //               break;
  //             case 'passed':
  //               icon = <IconCheckCircle className="mean-svg-icons fg-green" />;
  //               break;
  //             case 'created':
  //               icon = <IconCreated className="mean-svg-icons fg-purple" />;
  //               break;
  //             case 'deleted':
  //               icon = <IconMinus className="mean-svg-icons fg-purple" />;
  //               break;
  //             default:
  //               icon = "";
  //               break;
  //           }

  //           return (
  //             <div 
  //               key={activity.id}
  //               className={`d-flex w-100 align-items-center activities-list ${activity.id % 2 === 0 ? '' : 'bg-secondary-02'}`}
  //               >
  //                 <div className="list-item">
  //                   <span className="mr-2">
  //                       {activity.date}
  //                   </span>
  //                   {icon}
  //                   <span>
  //                     {`Proposal ${activity.description} by ${activity.proposedBy} [${shortenAddress(activity.address, 4)}]`}
  //                   </span>
  //                 </div>
  //             </div>
  //           )
  //         })
  //       ))
  //     )}
  //   </>
  // );

  // Programs list
  const getProgramsByUpgradeAuthority = useCallback(async (upgradeAuthority: PublicKey): Promise<ProgramAccounts[] | undefined> => {

    if (!connection || !upgradeAuthority) { return undefined; }

    consoleOut(`Searching for programs with upgrade authority: ${upgradeAuthority}`);

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

  // Get Programs
  useEffect(() => {

    if (!connection || !selectedMultisig || !selectedMultisig.authority) { return; }

    const timeout = setTimeout(() => {
      getProgramsByUpgradeAuthority(selectedMultisig.authority)
      .then(progs => {
        consoleOut('programs:', progs, 'blue');
        setPrograms(progs || []);
      })
      .catch(error => console.error(error));
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connection,
    selectedMultisig,
    getProgramsByUpgradeAuthority,
  ]);

  // Programs list 
  const renderPrograms = (
    <>
      {programs && programs.length && (
        programs.map((program: any) => {
          const onSelectProgram = () => {
            // Sends isProgramDetails value to the parent component "SafeView"
            props.onDataToProgramView(program);
          }
  
          return (
            <div 
              key={program.id}
              onClick={onSelectProgram}
              className={`d-flex w-100 align-items-center simplelink ${program.id % 2 === 0 ? '' : 'bg-secondary-02'}`}
              >
                <Row className="list-item hover-list">
                  <Col>
                    {program.name}
                  </Col>
                  {!isProposalDetails && (
                    <span className="icon-button-container">
                      <Button
                        type="default"
                        shape="circle"
                        size="middle"
                        icon={<IconArrowForward className="mean-svg-icons" />}
                      />
                    </span>
                  )}
                </Row>
            </div>
          )
        })
      )}
    </>
  );

  // Tabs
  const tabs = [
    {
      key: "serum01",
      label: "Proposals",
      children: renderListOfProposals
    },
    {
      key: "serum02",
      label: "Activity",
      children: '' //renderActivities
    },
    {
      key: "serum03",
      label: "Programs",
      children: renderPrograms
    }
  ];

  return (
    <>
      <SafeInfo
        onEditMultisigClick={onEditMultisigClick}
        onNewProposalClicked={onNewProposalClicked}
        safeNameImg={safeSerumNameImg}
        safeNameImgAlt={safeSerumNameImgAlt}
        selectedMultisig={selectedMultisig}
        tabs={tabs}
       />
    </>
  )
}
