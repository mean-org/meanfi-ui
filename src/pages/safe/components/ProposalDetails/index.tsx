import { App, AppConfig } from '@mean-dao/mean-multisig-apps';
import {
  MeanMultisig,
  MultisigParticipant,
  MultisigTransaction,
  MultisigTransactionActivityItem,
  MultisigTransactionInstructionInfo,
  MultisigTransactionStatus,
  createAnchorProgram,
  parseMultisigProposalIx,
} from '@mean-dao/mean-multisig-sdk';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { Button, Col, Row } from 'antd';
import { openNotification } from 'components/Notifications';
import { RejectCancelModal } from 'components/RejectCancelModal';
import { ResumeItem } from 'components/ResumeItem';
import { TabsMean } from 'components/TabsMean';
import { AppStateContext } from 'contexts/appstate';
import { TxConfirmationContext } from 'contexts/transaction-status';
import { useWallet } from 'contexts/wallet';
import {
  IconApprove,
  IconArrowBack,
  IconLightning,
  IconThumbsDown,
  IconThumbsUp,
  IconUser,
  IconUserClock,
} from 'Icons';
import { consoleOut, copyText } from 'middleware/ui';
import { shortenAddress } from 'middleware/utils';
import { OperationType, TransactionStatus } from 'models/enums';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RenderInstructions } from './RenderInstructions';
import './style.scss';
import ActivityRow from './ActivityRow';

export const ProposalDetailsView = (props: {
  appsProvider?: any;
  connection: Connection;
  hasMultisigPendingProposal?: boolean;
  isBusy: boolean;
  loadingData: boolean;
  multisigClient?: MeanMultisig;
  onDataToSafeView: any;
  onProposalApprove?: any;
  onProposalCancel?: any;
  onProposalExecute?: any;
  onProposalReject?: any;
  proposalSelected?: any;
  selectedMultisig?: any;
  solanaApps?: any;
  isCancelRejectModalVisible: boolean;
  setIsCancelRejectModalVisible: (value: boolean) => void;
}) => {
  const { setTransactionStatus } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const {
    appsProvider,
    connection,
    hasMultisigPendingProposal,
    isBusy,
    loadingData,
    multisigClient,
    onDataToSafeView,
    onProposalApprove,
    onProposalCancel,
    onProposalExecute,
    onProposalReject,
    proposalSelected,
    selectedMultisig,
    solanaApps,
    isCancelRejectModalVisible,
    setIsCancelRejectModalVisible,
  } = props;
  const { confirmationHistory } = useContext(TxConfirmationContext);

  const [selectedProposal, setSelectedProposal] = useState<MultisigTransaction>(proposalSelected);
  const [proposalIxInfo, setProposalIxInfo] = useState<MultisigTransactionInstructionInfo | null>(null);
  const [proposalActivity, setProposalActivity] = useState<MultisigTransactionActivityItem[]>([]);
  const [needReloadActivity, setNeedReloadActivity] = useState<boolean>(false);
  const [loadingActivity, setLoadingActivity] = useState<boolean>(false);

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle,
    });
  }, [setTransactionStatus]);

  const onAcceptCancelRejectProposalModal = () => {
    consoleOut('cancel reject proposal');
    const operation = { transaction: selectedProposal };
    onProposalCancel(operation);
  };

  // Determine if the ExecuteTransaction operation is in progress by searching
  // into the confirmation history
  const isExecuteTxPendingConfirmation = useCallback(
    (id?: PublicKey) => {
      if (confirmationHistory && confirmationHistory.length > 0) {
        if (id) {
          return confirmationHistory.some(
            h =>
              h.operationType === OperationType.ExecuteTransaction &&
              h.extras &&
              h.extras.transactionId &&
              (h.extras.transactionId as PublicKey).equals(id) &&
              h.txInfoFetchStatus === 'fetching',
          );
        }
        return confirmationHistory.some(
          h => h.operationType === OperationType.ExecuteTransaction && h.txInfoFetchStatus === 'fetching',
        );
      }
      return false;
    },
    [confirmationHistory],
  );

  // Determine if the ApproveTransaction operation is in progress by searching
  // into the confirmation history
  const isApproveTxPendingConfirmation = useCallback(
    (id?: PublicKey) => {
      if (confirmationHistory && confirmationHistory.length > 0) {
        if (id) {
          return confirmationHistory.some(
            h =>
              h.operationType === OperationType.ApproveTransaction &&
              h.extras &&
              h.extras.transactionId &&
              (h.extras.transactionId as PublicKey).equals(id) &&
              h.txInfoFetchStatus === 'fetching',
          );
        }
        return confirmationHistory.some(
          h => h.operationType === OperationType.ApproveTransaction && h.txInfoFetchStatus === 'fetching',
        );
      }
      return false;
    },
    [confirmationHistory],
  );

  // Determine if the RejectTransaction operation is in progress by searching
  // into the confirmation history
  const isRejectTxPendingConfirmation = useCallback(
    (id?: PublicKey) => {
      if (confirmationHistory && confirmationHistory.length > 0) {
        if (id) {
          return confirmationHistory.some(
            h =>
              h.operationType === OperationType.RejectTransaction &&
              h.extras &&
              h.extras.transactionId &&
              (h.extras.transactionId as PublicKey).equals(id) &&
              h.txInfoFetchStatus === 'fetching',
          );
        }
        return confirmationHistory.some(
          h => h.operationType === OperationType.RejectTransaction && h.txInfoFetchStatus === 'fetching',
        );
      }
      return false;
    },
    [confirmationHistory],
  );

  // Determine if the CancelTransaction operation is in progress by searching
  // into the confirmation history
  const isCancelTxPendingConfirmation = useCallback(
    (id?: PublicKey) => {
      if (confirmationHistory && confirmationHistory.length > 0) {
        if (id) {
          return confirmationHistory.some(
            h =>
              h.operationType === OperationType.CancelTransaction &&
              h.extras &&
              h.extras.transactionId &&
              (h.extras.transactionId as PublicKey).equals(id) &&
              h.txInfoFetchStatus === 'fetching',
          );
        }
        return confirmationHistory.some(
          h => h.operationType === OperationType.CancelTransaction && h.txInfoFetchStatus === 'fetching',
        );
      }
      return false;
    },
    [confirmationHistory],
  );

  const getAppFromProposal = useCallback(
    () => solanaApps.find((app: App) => app.id === selectedProposal.programId.toBase58()) as App,
    [selectedProposal.programId, solanaApps],
  );

  const settleProposalIxInfo = useCallback(
    (config: AppConfig, proposalApp: App) => {
      if (!multisigClient) {
        return null;
      }
      const idl = config ? config.definition : undefined;
      const program = idl ? createAnchorProgram(connection, new PublicKey(proposalApp.id), idl) : undefined;
      const ixInfo = parseMultisigProposalIx(proposalSelected, multisigClient.program.programId, program);
      setProposalIxInfo(ixInfo);
    },
    [connection, multisigClient, proposalSelected],
  );

  useEffect(() => {
    if (!selectedMultisig || !proposalSelected) {
      return;
    }
    const timeout = setTimeout(() => setSelectedProposal(proposalSelected));
    return () => clearTimeout(timeout);
  }, [selectedMultisig, proposalSelected]);

  useEffect(() => {
    if (!multisigClient || !appsProvider || !proposalSelected) {
      return;
    }

    const timeout = setTimeout(() => {
      if (
        proposalSelected.programId.equals(SystemProgram.programId) ||
        proposalSelected.programId.equals(TOKEN_PROGRAM_ID)
      ) {
        const ixInfo = multisigClient.decodeProposalInstruction(proposalSelected);
        setProposalIxInfo(ixInfo);
      } else {
        const proposalApp = getAppFromProposal();
        if (proposalApp) {
          appsProvider
            .getAppConfig(proposalApp.id, proposalApp.uiUrl, proposalApp.defUrl)
            .then((config: AppConfig) => settleProposalIxInfo(config, proposalApp));
        } else {
          const ixInfo = parseMultisigProposalIx(proposalSelected, multisigClient.program.programId);
          setProposalIxInfo(ixInfo);
        }
      }
    });

    return () => clearTimeout(timeout);
  }, [appsProvider, getAppFromProposal, multisigClient, proposalSelected, settleProposalIxInfo]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (selectedProposal) {
        setNeedReloadActivity(true);
      }
    });

    return () => {
      clearTimeout(timeout);
    };
  }, [selectedProposal]);

  // Get transaction proposal activity
  useEffect(() => {
    if (!multisigClient || !selectedProposal || !needReloadActivity) {
      return;
    }

    const timeout = setTimeout(() => {
      setNeedReloadActivity(false);
      setLoadingActivity(true);
      multisigClient
        .getMultisigTransactionActivity(selectedProposal.id)
        .then((activity: MultisigTransactionActivityItem[]) => {
          consoleOut('activity', activity, 'blue');
          setProposalActivity(activity);
        })
        .catch((err: any) => console.error(err))
        .finally(() => setLoadingActivity(false));
    });

    return () => {
      clearTimeout(timeout);
    };
  }, [multisigClient, selectedProposal, needReloadActivity]);

  // When back button is clicked, goes to Safe Info
  const hideProposalDetailsHandler = () => {
    onDataToSafeView();
  };

  // Copy address to clipboard
  const copyAddressToClipboard = useCallback(
    (address: any) => {
      if (copyText(address.toString())) {
        openNotification({
          description: t('notifications.account-address-copied-message'),
          type: 'info',
        });
      } else {
        openNotification({
          description: t('notifications.account-address-not-copied-message'),
          type: 'error',
        });
      }
    },
    [t],
  );

  // Display the activities in the "Activity" tab, on safe details page
  const renderActivities = () => {
    if (loadingActivity) {
      return <span className="pl-1">Loading activities...</span>;
    }
    if (proposalActivity.length === 0) {
      return <span className="pl-1">This proposal has no activities</span>;
    }

    return (
      <Row>
        {proposalActivity.map(activity => (
          <ActivityRow
            key={`${activity.action}-${activity.index}-${activity.address}`}
            activity={activity}
            onCopyAddress={address => copyAddressToClipboard(address)}
          />
        ))}
      </Row>
    );
  };

  // Tabs
  const tabs = [
    {
      id: 'instruction',
      name: 'Instruction',
      render: <RenderInstructions connection={connection} proposalIxInfo={proposalIxInfo} />,
    },
    {
      id: 'activity',
      name: 'Activity',
      render: renderActivities(),
    },
  ];

  const isProposer = !!(selectedProposal?.proposer && selectedProposal.proposer.toBase58() === publicKey?.toBase58());

  if (!selectedProposal?.proposer) {
    return <></>;
  }

  const title = selectedProposal.details.title ? selectedProposal.details.title : 'Unknown proposal';

  // Number of participants who have already approved the Tx
  const approvedSigners = selectedProposal.signers.filter((s: any) => s === true).length;
  const rejectedSigners = selectedProposal.signers.filter((s: any) => s === false).length;
  const expirationDate = selectedProposal.details.expirationDate
    ? new Date(selectedProposal.details.expirationDate)
    : '';
  const executedOnDate = selectedProposal.executedOn ? new Date(selectedProposal.executedOn).toDateString() : '';
  const proposedBy = (selectedMultisig.owners as MultisigParticipant[]).find(
    (owner: MultisigParticipant) => owner.address === selectedProposal.proposer?.toBase58(),
  );
  const neededSigners = () => {
    return selectedMultisig.threshold - approvedSigners;
  };
  const resume =
    selectedProposal.status === 0 &&
    neededSigners() > 0 &&
    `Needs ${neededSigners()} ${neededSigners() > 1 ? 'approvals' : 'approval'} to pass`;

  const renderProposedBy = () => {
    if (selectedProposal.status === MultisigTransactionStatus.Passed) {
      return (
        <Col className="safe-details-left-container">
          <IconUserClock className="user-image mean-svg-icons bg-yellow" />
          <div className="proposal-resume-left-text">
            <div className="info-label">Pending execution</div>
            <span>Proposed by {proposedBy?.name ?? shortenAddress(selectedProposal?.proposer ?? '', 4)}</span>
          </div>
        </Col>
      );
    } else if (selectedProposal.status === MultisigTransactionStatus.Executed) {
      return (
        <Col className="safe-details-left-container">
          <IconLightning className="user-image mean-svg-icons bg-green" />
          <div className="proposal-resume-left-text">
            <div className="info-label">Proposed by</div>
            <span>{proposedBy?.name ?? shortenAddress(selectedProposal?.proposer ?? '', 4)}</span>
          </div>
        </Col>
      );
    } else {
      return (
        <Col className="safe-details-left-container">
          <IconUser className="user-image mean-svg-icons" />
          <div className="proposal-resume-left-text">
            <div className="info-label">Proposed by</div>
            <span>{proposedBy?.name ?? shortenAddress(selectedProposal?.proposer ?? '', 4)}</span>
          </div>
        </Col>
      );
    }
  };

  return (
    <>
      <div className="safe-details-container">
        <Row gutter={[8, 8]} className="safe-details-resume mr-0 ml-0">
          <div onClick={hideProposalDetailsHandler} className="back-button icon-button-container">
            <IconArrowBack className="mean-svg-icons" />
            <span className="ml-1">Back</span>
          </div>
        </Row>

        <ResumeItem
          id={selectedProposal.id}
          // src={selectedProposal.src}
          title={title}
          expires={expirationDate}
          executedOn={executedOnDate}
          approved={approvedSigners}
          rejected={rejectedSigners}
          userSigned={selectedProposal.didSigned}
          status={selectedProposal.status}
          resume={resume}
          isDetailsPanel={true}
          isLink={false}
          classNameRightContent="resume-right-content"
        />
        {selectedProposal.details.description && (
          <Row className="safe-details-description pl-1">{selectedProposal.details.description}</Row>
        )}

        <div className="safe-details-proposal">
          <div className="safe-details-proposal-left">{renderProposedBy()}</div>
          <div>
            <div className="safe-details-right-container btn-group mr-1">
              {(selectedProposal.status === MultisigTransactionStatus.Voided ||
                selectedProposal.status === MultisigTransactionStatus.Failed ||
                selectedProposal.status === MultisigTransactionStatus.Expired) &&
                isProposer && (
                  <Button
                    type="default"
                    shape="round"
                    size="small"
                    className="thin-stroke d-flex justify-content-center align-items-center"
                    disabled={
                      !!hasMultisigPendingProposal ||
                      isBusy ||
                      isCancelTxPendingConfirmation(selectedProposal.id) ||
                      isExecuteTxPendingConfirmation(selectedProposal.id) ||
                      loadingData
                    }
                    onClick={() => setIsCancelRejectModalVisible(true)}
                  >
                    <div className="btn-content">Cancel</div>
                  </Button>
                )}
              {selectedProposal.status === MultisigTransactionStatus.Active && (
                <>
                  <Button
                    type="default"
                    shape="round"
                    size="small"
                    className="thin-stroke"
                    disabled={
                      selectedProposal.didSigned === true ||
                      !!hasMultisigPendingProposal ||
                      isBusy ||
                      isApproveTxPendingConfirmation(selectedProposal.id) ||
                      isRejectTxPendingConfirmation(selectedProposal.id) ||
                      isExecuteTxPendingConfirmation(selectedProposal.id) ||
                      isCancelTxPendingConfirmation(selectedProposal.id) ||
                      loadingData
                    }
                    onClick={() => {
                      const operation = { transaction: selectedProposal };
                      onProposalApprove(operation);
                    }}
                  >
                    {selectedProposal.didSigned !== true ? (
                      <div className="btn-content">
                        <IconThumbsUp className="mean-svg-icons" />
                        Approve
                      </div>
                    ) : (
                      <div className="btn-content">
                        <IconApprove className="mean-svg-icons" />
                        Approved
                      </div>
                    )}
                  </Button>
                  <Button
                    type="default"
                    shape="round"
                    size="small"
                    className="thin-stroke"
                    disabled={
                      selectedProposal.didSigned === false ||
                      !!hasMultisigPendingProposal ||
                      isBusy ||
                      isApproveTxPendingConfirmation(selectedProposal.id) ||
                      isRejectTxPendingConfirmation(selectedProposal.id) ||
                      isExecuteTxPendingConfirmation(selectedProposal.id) ||
                      isCancelTxPendingConfirmation(selectedProposal.id) ||
                      loadingData
                    }
                    onClick={() => {
                      const operation = { transaction: selectedProposal };
                      onProposalReject(operation);
                    }}
                  >
                    {selectedProposal.didSigned !== false ? (
                      <div className="btn-content">
                        <IconThumbsDown className="mean-svg-icons" />
                        Reject
                      </div>
                    ) : (
                      <div className="btn-content">
                        <IconApprove className="mean-svg-icons" />
                        Rejected
                      </div>
                    )}
                  </Button>
                  {isProposer && (
                    <Button
                      type="default"
                      shape="round"
                      size="small"
                      className="thin-stroke d-flex justify-content-center align-items-center"
                      disabled={
                        !!hasMultisigPendingProposal ||
                        isBusy ||
                        isExecuteTxPendingConfirmation(selectedProposal.id) ||
                        isCancelTxPendingConfirmation(selectedProposal.id) ||
                        loadingData
                      }
                      onClick={() => setIsCancelRejectModalVisible(true)}
                    >
                      <div className="btn-content">Cancel</div>
                    </Button>
                  )}
                </>
              )}
              {selectedProposal.status === MultisigTransactionStatus.Passed && (
                <>
                  <Button
                    type="default"
                    shape="round"
                    size="small"
                    className="thin-stroke d-flex justify-content-center align-items-center"
                    disabled={
                      !!hasMultisigPendingProposal ||
                      isBusy ||
                      isExecuteTxPendingConfirmation(selectedProposal.id) ||
                      isApproveTxPendingConfirmation(selectedProposal.id) ||
                      isRejectTxPendingConfirmation(selectedProposal.id) ||
                      isCancelTxPendingConfirmation(selectedProposal.id) ||
                      loadingData
                    }
                    onClick={() => {
                      const operation = { transaction: selectedProposal };
                      onProposalExecute(operation);
                    }}
                  >
                    <div className="btn-content">Execute</div>
                  </Button>
                  {isProposer && (
                    <Button
                      type="default"
                      shape="round"
                      size="small"
                      className="thin-stroke d-flex justify-content-center align-items-center"
                      disabled={
                        !!hasMultisigPendingProposal ||
                        isBusy ||
                        isExecuteTxPendingConfirmation(selectedProposal.id) ||
                        isCancelTxPendingConfirmation(selectedProposal.id) ||
                        loadingData
                      }
                      onClick={() => setIsCancelRejectModalVisible(true)}
                    >
                      <div className="btn-content">Cancel</div>
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <TabsMean tabs={tabs} defaultTab="instruction" />
      </div>

      {isCancelRejectModalVisible && (
        <RejectCancelModal
          handleClose={() => {
            setIsCancelRejectModalVisible(false);
            resetTransactionStatus();
          }}
          handleOk={onAcceptCancelRejectProposalModal}
          isVisible={isCancelRejectModalVisible}
          isBusy={isBusy}
        />
      )}
    </>
  );
};
