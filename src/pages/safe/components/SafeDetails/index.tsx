import './style.scss';
import { Button, Col, Collapse, Row } from "antd"
import { IconArrowBack, IconUser, IconThumbsUp, IconThumbsDown, IconApprove, IconCross, IconCheckCircle, IconCreated, IconMinus, IconCaretDown, IconExternalLink, IconLink } from "../../../../Icons"

import { shortenAddress } from '../../../../utils/utils';
import { TabsMean } from '../../../../components/TabsMean';
import { getOperationName } from '../../../../utils/multisig-helpers';
import { useTranslation } from 'react-i18next';
import { openNotification } from '../../../../components/Notifications';
import { useCallback, useContext, useEffect } from 'react';
import { copyText, isDev, isLocal } from '../../../../utils/ui';
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from '../../../../constants';
import { getSolanaExplorerClusterParam } from '../../../../contexts/connection';
import { ResumeItem } from '../UI/ResumeItem';
import { PublicKey } from '@solana/web3.js';
import { MultisigTransactionStatus } from '@mean-dao/mean-multisig-sdk';
import { AppStateContext } from '../../../../contexts/appstate';

export const SafeDetailsView = (props: {
  isSafeDetails: boolean;
  onDataToSafeView: any;
  proposalSelected?: any;
  selectedMultisig?: any;
  onProposalApprove?: any;
  onProposalExecute?: any;
}) => {
  const {
    isWhitelisted,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const { Panel } = Collapse;
  const { isSafeDetails, onDataToSafeView, selectedMultisig, onProposalApprove, onProposalExecute } = props;
  const { id, signers, details, executedOn, status, proposer, operation, programId, accounts, data, didSigned } = props.proposalSelected;
  const collapseHandler = (key: any) => {}

  const isUnderDevelopment = () => {
    return isLocal() || (isDev() && isWhitelisted) ? true : false;
  }

  // When back button is clicked, goes to Safe Info
  const hideSafeDetailsHandler = () => {
    // Sends the value to the parent component "SafeView"
    onDataToSafeView();
  };

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

  },[t]);

  // Display the instructions in the "Instructions" tab, on safe details page
  const renderInstructions = (
    <div className="safe-details-collapse w-100">
      {/* <Collapse
        accordion={true}
        onChange={collapseHandler}> */}
        {/* {instructions.map((instruction: any) => {

          const header =  <Col className="instruction-header">
                            <div className="circle-background">{instruction.id}</div>
                            <div className="instruction-header-text">
                              <div className="">{instruction.title}</div>
                              <span className="info-label">{instruction.description}</span>
                            </div>
                          </Col>;

          const instructionsContent = [
            {
              label: "Name",
              content: instruction.name
            },
            {
              label: "Sender",
              content: instruction.sender
            },
            {
              label: "Recipient",
              content: instruction.recipient
            },
            {
              label: "Amount",
              content: instruction.amount
            },
          ];

          return (
            <Panel header={header} key={instruction.id} showArrow={false} extra={<span className="icon-button-container arrow-up-down">
              <Button
                type="default"
                shape="circle"
                size="middle"
                icon={<IconCaretDown className="mean-svg-icons" />}
              />
            </span>}>
              {instructionsContent.map((instContent, index) => (
                <Row gutter={[8, 8]} className="mb-1" key={index}>
                  {instContent.content && (
                    <>
                      <Col xs={6} sm={6} md={4} lg={4} className="pr-1">
                        <span className="info-label">{instContent.label}:</span>
                      </Col>
                      <Col xs={18} sm={18} md={20} lg={20} className="pl-1">
                        <span>{instContent.content}</span>
                      </Col>
                    </>
                  )}
                </Row>
              ))}
            </Panel>
          )
        })} */}

            {/* <Panel header={getOperationName(operation)} key="1" showArrow={false} extra={<span className="icon-button-container arrow-up-down">
              <Button
                type="default"
                shape="circle"
                size="middle"
                icon={<IconCaretDown className="mean-svg-icons" />}
              />
            </span>}> */}
              <Row gutter={[8, 8]} className="mb-1 mt-2">
                <Col xs={6} sm={6} md={4} lg={4} className="pr-1">
                  <span className="info-label">{t('multisig.proposal-modal.instruction-program')}:</span>
                </Col>
                <Col xs={18} sm={18} md={20} lg={20} className="pl-1 text-truncate">
                  <span onClick={() => copyAddressToClipboard(programId.toBase58())}  className="info-data simplelink underline-on-hover" style={{cursor: 'pointer'}}>
                    {programId.toBase58()}
                  </span>
                  <a
                    target="_blank"
                    rel="noopener noreferrer"
                    href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${programId.toBase58()}${getSolanaExplorerClusterParam()}`}>
                    <IconLink className="mean-svg-icons external-icon" />
                  </a>
                </Col>
              </Row>

              {/* {accounts && (
                accounts.map((account: any) => (
                  account.map((acc: any) => (
                    <Row gutter={[8, 8]} className="mb-1" key={acc.index}>
                      <Col xs={6} sm={6} md={4} lg={4} className="pr-1">
                        <span className="info-label">{t('multisig.proposal-modal.instruction-account')} {acc.index + 1}:</span>
                      </Col>
                      <Col xs={18} sm={18} md={20} lg={20} className="pl-1">
                        <span onClick={() => copyAddressToClipboard(acc.address.toBase58())}  className="info-data simplelink underline-on-hover" style={{cursor: 'pointer'}}>
                          {acc.address.toBase58()}
                        </span>
                        <a
                          target="_blank"
                          rel="noopener noreferrer"
                          href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${acc.address}${getSolanaExplorerClusterParam()}`}>
                          <IconLink className="mean-svg-icons external-icon" />
                        </a>
                      </Col>
                    </Row>
                  ))
                ))
              )} */}

                <Row gutter={[8, 8]} className="mb-1">
                  <Col xs={6} sm={6} md={4} lg={4} className="pr-1">
                    <span className="info-label">{t('multisig.proposal-modal.instruction-data')}:</span>
                  </Col>
                  <Col xs={18} sm={18} md={20} lg={20} className="pl-1 text-truncate">
                    <span onClick={() => copyAddressToClipboard(data)}  className="info-data simplelink underline-on-hover" style={{cursor: 'pointer'}}>
                      {data}
                    </span>
                  </Col>
                </Row>

            {/* </Panel>
      </Collapse> */}
    </div>
  );

  // Display the activities in the "Activity" tab, on safe details page
  const renderActivities = (
    <Row>
      {/* {proposalSelected.activities.map((activity: any) => {
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
      })} */}
    </Row>
  )

  // Tabs
  const tabs = [
    {
      name: "Instructions",
      render: renderInstructions
    }, 
    // {
    //   name: "Activity",
    //   render: renderActivities
    // }
  ];

  // Number of participants who have already approved the Tx
  const approvedSigners = signers.filter((s: any) => s === true).length;
  const neededSigners = approvedSigners && (selectedMultisig.threshold - approvedSigners);
  const expirationDate = details.expirationDate ? new Date(details.expirationDate).toDateString() : "";
  const executedOnDate = executedOn ? new Date(executedOn).toDateString() : "";
  
  return (
    <div className="safe-details-container">
      <Row gutter={[8, 8]} className="safe-details-resume">
        <div onClick={hideSafeDetailsHandler} className="back-button icon-button-container">
          <IconArrowBack className="mean-svg-icons" />
          <span>Back</span>
        </div>
      </Row>
      <ResumeItem
        id={id}
        // logo={proposalSelected.logo}
        title={details.title}
        expires={expirationDate}
        executedOn={executedOnDate}
        approved={approvedSigners}
        // rejected={proposalSelected.rejected}
        status={status}
        needs={neededSigners}
        isSafeDetails={isSafeDetails}
      />
      {details.description && (
        <Row className="safe-details-description">
          {details.description}
        </Row>
      )}
      <Row gutter={[8, 8]} className="safe-details-proposal">
        <Col className="safe-details-left-container">
          <IconUser className="user-image mean-svg-icons" />
          <div className="proposal-resume-left-text">
            <div className="info-label">Proposed by</div>
            <span>{shortenAddress(proposer.toBase58(), 4)}</span>
          </div>
        </Col>
        <Col className="safe-details-right-container btn-group">
          {(status === MultisigTransactionStatus.Approved || status === MultisigTransactionStatus.Executed) ? (
            <Button
              type="ghost"
              size="small"
              className="thin-stroke d-flex justify-content-center align-items-center"
              disabled={status === MultisigTransactionStatus.Executed}
              onClick={() => onProposalExecute({ 
                transaction: { 
                  id: new PublicKey(id),
                  operation: operation
                }
              })}>
              <div className="btn-content">
                Execute
              </div>
            </Button>
          ) : (
            <>
              <Button
                type="ghost"
                size="small"
                className="thin-stroke"
                disabled={didSigned || status !== MultisigTransactionStatus.Pending}
                onClick={() => onProposalApprove({ transaction: { id: new PublicKey(id) } })}>
                <div className="btn-content">
                  <IconThumbsUp className="mean-svg-icons" />
                  Approve
                </div>
              </Button>
              {isUnderDevelopment() && (
                <Button
                  type="ghost"
                  size="small"
                  className="thin-stroke"
                  onClick={() => { } }>
                    <div className="btn-content">
                      <IconThumbsDown className="mean-svg-icons" />
                      Reject
                    </div>
                </Button>
              )}
            </>
          )}
        </Col>
      </Row>
      <div className="safe-tabs-container">
        <TabsMean
          tabs={tabs}
          headerClassName="safe-tabs-header-container"
          bodyClassName="safe-tabs-content-container"
        />
      </div>
    </div>
  )
};