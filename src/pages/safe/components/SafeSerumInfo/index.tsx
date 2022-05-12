import './style.scss';

import { Button, Col, Row } from "antd"
import { IconApprove, IconArrowForward, IconCheckCircle, IconCreated, IconCross, IconMinus } from "../../../../Icons"
import { shortenAddress } from "../../../../utils/utils";
import { SafeInfo } from "../UI/SafeInfo";
import { ResumeItem } from '../UI/ResumeItem';

export const SafeSerumInfoView = (props: {
  isSafeDetails: boolean;
  isProgramDetails: boolean;
  onDataToSafeView: any;
  onDataToProgramView: any;
  proposals: any[];
  selectedMultisig?: any;
  onEditMultisigClick: any;
  onNewProposalMultisigClick: any;
  multisigVaults: any;
}) => {
  const { isSafeDetails, proposals, selectedMultisig, onEditMultisigClick, onNewProposalMultisigClick, multisigVaults } = props;

  const safeSerumNameImg = "https://assets.website-files.com/6163b94b432ce93a0408c6d2/61ff1e9b7e39c27603439ad2_serum%20NOF.png";
  const safeSerumNameImgAlt = "Serum";

  // Proposals list
  const renderListOfProposals = (
    <>
      {proposals && proposals.length && (
        proposals.map((proposal, index) => {
          const onSelectProposal = () => {
            // Sends isSafeDetails value to the parent component "SafeView"
            props.onDataToSafeView(proposal);
          };

          return (
            <div 
              key={proposal.id}
              onClick={onSelectProposal}
              className={`d-flex w-100 align-items-center simplelink ${(index + 1) % 2 === 0 ? '' : 'background-gray'}`}
              >
                <ResumeItem
                  id={proposal.id}
                  version={selectedMultisig.version}
                  logo={proposal.logo}
                  title={proposal.title}
                  expires={proposal.expires}
                  approved={proposal.approved}
                  rejected={proposal.rejected}
                  status={proposal.status}
                  isSafeDetails={isSafeDetails}
                />
            </div>
          )
        })
      )}
    </>
  );

  // Activities list 
  const renderActivities= (
    <>
      {proposals && proposals.length && (
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
      )}
    </>
  );

  // Programs list 
  const renderPrograms = (
    <>
      {proposals && proposals.length && (
        proposals.map((proposal) => (
          proposal.programs.map((program: any) => {
            const onSelectProgram = () => {
              // Sends isProgramDetails value to the parent component "SafeView"
              props.onDataToProgramView(program);
            }
    
            return (
              <div 
                key={program.id}
                onClick={onSelectProgram}
                className={`d-flex w-100 align-items-center simplelink ${program.id % 2 === 0 ? '' : 'background-gray'}`}
                >
                  <Row className="list-item hover-list">
                    <Col>
                      {program.name}
                    </Col>
                    {!isSafeDetails && (
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
        ))
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
        safeNameImg={safeSerumNameImg}
        safeNameImgAlt={safeSerumNameImgAlt}
        onNewProposalMultisigClick={onNewProposalMultisigClick}
        onEditMultisigClick={onEditMultisigClick}
        tabs={tabs}
       />
    </>
  )
}