import './style.scss';

import { Button, Col, Row } from "antd"
import { IconApprove, IconArrowForward, IconCheckCircle, IconCreated, IconCross, IconMinus } from "../../../../Icons"
import { shortenAddress } from "../../../../utils/utils";
import { ProposalResumeItem } from '../ProposalResumeItem';
import { SafeInfo } from "../UI/SafeInfo";

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
}) => {

  const { isSafeDetails, proposals, selectedMultisig, onEditMultisigClick, onNewProposalMultisigClick, multisigVaults } = props;

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
                <ProposalResumeItem
                  id={proposal.id}
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