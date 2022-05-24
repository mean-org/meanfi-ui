import './style.scss';
import { Button, Col, Row } from "antd"
import { IconArrowBack, IconUser, IconThumbsUp, IconThumbsDown, IconExternalLink } from "../../../../Icons"

import { shortenAddress } from '../../../../utils/utils';
import { TabsMean } from '../../../../components/TabsMean';
import { useTranslation } from 'react-i18next';
import { openNotification } from '../../../../components/Notifications';
import { useCallback, useContext, useEffect, useState } from 'react';
import { copyText, isDev, isLocal } from '../../../../utils/ui';
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from '../../../../constants';
import { getSolanaExplorerClusterParam } from '../../../../contexts/connection';
import { ResumeItem } from '../UI/ResumeItem';
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

  const { isWhitelisted } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const { isSafeDetails, onDataToSafeView, proposalSelected, selectedMultisig, onProposalApprove, onProposalExecute } = props;
  const [selectedProposal, setSelectedProposal] = useState<any>(proposalSelected);

  useEffect(() => {

    if (!selectedMultisig || !proposalSelected) { return; }
    const timeout = setTimeout(() => setSelectedProposal(proposalSelected));
    return () => clearTimeout(timeout);

  }, [
    selectedMultisig,
    proposalSelected
  ]);

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
      <Row gutter={[8, 8]} className="mb-2 mt-2">
        <Col xs={6} sm={6} md={4} lg={4} className="pr-1">
          <span className="info-label">{t('multisig.proposal-modal.instruction-program')}:</span>
        </Col>
        <Col xs={18} sm={18} md={20} lg={20} className="pl-1 text-truncate">
          <span onClick={() => copyAddressToClipboard(selectedProposal.programId.toBase58())}  className="info-data simplelink underline-on-hover" style={{cursor: 'pointer'}}>
            {selectedProposal.programId.toBase58()}
          </span>
          <a
            target="_blank"
            rel="noopener noreferrer"
            href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${selectedProposal.programId.toBase58()}${getSolanaExplorerClusterParam()}`}>
            <IconExternalLink className="mean-svg-icons external-icon" />
          </a>
        </Col>
      </Row>

      {selectedProposal && (
        selectedProposal.accounts.map((account: any) => (
          <Row gutter={[8, 8]} className="mb-2" key={account.index}>
            <Col xs={6} sm={6} md={4} lg={4} className="pr-1">
              <span className="info-label">{t('multisig.proposal-modal.instruction-account')} {account.index}:</span>
            </Col>
              <Col xs={17} sm={17} md={19} lg={19} className="pl-1">
                <span onClick={() => copyAddressToClipboard(account.pubkey.toBase58())} className="d-block info-data simplelink underline-on-hover text-truncate" style={{cursor: 'pointer'}}>
                  {account.pubkey.toBase58()}
              </span>
            </Col>
            <Col xs={1} sm={1} md={1} lg={1}>
              <a
                target="_blank"
                rel="noopener noreferrer"
                href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${account.pubkey}${getSolanaExplorerClusterParam()}`}>
                <IconExternalLink className="mean-svg-icons external-icon" />
              </a>
            </Col>
          </Row>
        ))
      )}

      <Row gutter={[8, 8]} className="mb-2">
        <Col xs={6} sm={6} md={4} lg={4} className="pr-1">
          <span className="info-label">{t('multisig.proposal-modal.instruction-data')}:</span>
        </Col>
        <Col xs={18} sm={18} md={20} lg={20} className="pl-1 text-truncate">
          <span onClick={() => copyAddressToClipboard(selectedProposal.data)}  className="info-data simplelink underline-on-hover" style={{cursor: 'pointer'}}>
            {selectedProposal.data}
          </span>
        </Col>
      </Row>
    </div>
  );

  // Display the activities in the "Activity" tab, on safe details page
  // const renderActivities = (
  //   <Row>
  //     {/* {selectedProposal.activities.map((activity: any) => {
  //       let icon = null;

  //       switch (activity.description) {
  //         case 'approved':
  //           icon = <IconApprove className="mean-svg-icons fg-green" />;
  //           break;
  //         case 'rejected':
  //           icon = <IconCross className="mean-svg-icons fg-red" />;
  //           break;
  //         case 'passed':
  //           icon = <IconCheckCircle className="mean-svg-icons fg-green" />;
  //           break;
  //         case 'created':
  //           icon = <IconCreated className="mean-svg-icons fg-purple" />;
  //           break;
  //         case 'deleted':
  //           icon = <IconMinus className="mean-svg-icons fg-purple" />;
  //           break;
  //         default:
  //           icon = "";
  //           break;
  //       }

  //       return (
  //         <div 
  //           key={activity.id}
  //           className={`d-flex w-100 align-items-center activities-list ${activity.id % 2 === 0 ? '' : 'background-gray'}`}
  //           >
  //             <div className="list-item">
  //               <span className="mr-2">
  //                   {activity.date}
  //               </span>
  //               {icon}
  //               <span>
  //                 {`Proposal ${activity.description} by ${activity.proposedBy} [${shortenAddress(activity.address, 4)}]`}
  //               </span>
  //             </div>
  //         </div>
  //       )
  //     })} */}
  //   </Row>
  // )

  // Tabs
  const tabs = [
    {
      name: "Instruction",
      render: renderInstructions
    }, 
    // {
    //   name: "Activity",
    //   render: renderActivities
    // }
  ];

  if (!selectedProposal.proposer) { return (<></>); }

  // Number of participants who have already approved the Tx
  const approvedSigners = selectedProposal.signers.filter((s: any) => s === true).length;
  const neededSigners = approvedSigners && (selectedMultisig.threshold - approvedSigners);
  const expirationDate = selectedProposal.details.expirationDate ? new Date(selectedProposal.details.expirationDate).toDateString() : "";
  const executedOnDate = selectedProposal.executedOn ? new Date(selectedProposal.executedOn).toDateString() : "";
  
  return (
    <div className="safe-details-container">
      <Row gutter={[8, 8]} className="safe-details-resume">
        <div onClick={hideSafeDetailsHandler} className="back-button icon-button-container">
          <IconArrowBack className="mean-svg-icons" />
          <span>Back</span>
        </div>
      </Row>
      <ResumeItem
        id={selectedProposal.id}
        // src={selectedProposal.src}
        title={selectedProposal.details.title}
        expires={expirationDate}
        executedOn={executedOnDate}
        approved={approvedSigners}
        // rejected={selectedProposal.rejected}
        status={selectedProposal.status}
        needs={neededSigners}
        isSafeDetails={isSafeDetails}
      />
      {selectedProposal.details.description && (
        <Row className="safe-details-description">
          {selectedProposal.details.description}
        </Row>
      )}
      <Row gutter={[8, 8]} className="safe-details-proposal">
        <Col className="safe-details-left-container">
          <IconUser className="user-image mean-svg-icons" />
          <div className="proposal-resume-left-text">
            <div className="info-label">Proposed by</div>
            <span>{shortenAddress(selectedProposal.proposer?.toBase58(), 4)}</span>
          </div>
        </Col>
        <Col className="safe-details-right-container btn-group">
          {(selectedProposal.status === MultisigTransactionStatus.Approved || selectedProposal.status === MultisigTransactionStatus.Executed) ? (
            <Button
              type="default"
              shape="round"
              size="small"
              className="thin-stroke d-flex justify-content-center align-items-center"
              disabled={selectedProposal.status === MultisigTransactionStatus.Executed}
              onClick={() => onProposalExecute({ 
                transaction: { 
                  id: selectedProposal.id,
                  operation: selectedProposal.operation
                }
              })}>
                <div className="btn-content">
                  Execute
                </div>
            </Button>
          ) : (
            <>
              <Button
                type="default"
                shape="round"
                size="small"
                className="thin-stroke"
                disabled={selectedProposal.didSigned || selectedProposal.status !== MultisigTransactionStatus.Pending}
                onClick={() => onProposalApprove({ transaction: { id: selectedProposal.id } })}>
                  <div className="btn-content">
                    <IconThumbsUp className="mean-svg-icons" />
                    Approve
                  </div>
              </Button>
              {isUnderDevelopment() && (
                <Button
                  type="default"
                  shape="round"
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