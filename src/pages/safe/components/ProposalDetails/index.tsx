import './style.scss';
import { Button, Col, Row, Tooltip } from "antd"
import { IconArrowBack, IconUser, IconThumbsUp, IconExternalLink, IconLightning, IconUserClock, IconApprove, IconCross, IconCreated, IconMinus, IconThumbsDown } from "../../../../Icons"
import { shortenAddress } from '../../../../utils/utils';
import { TabsMean } from '../../../../components/TabsMean';
import { useTranslation } from 'react-i18next';
import { openNotification } from '../../../../components/Notifications';
import { useCallback, useContext, useEffect, useState } from 'react';
import { consoleOut, copyText } from '../../../../utils/ui';
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS, SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from '../../../../constants';
import { getSolanaExplorerClusterParam } from '../../../../contexts/connection';
import { MeanMultisig, MultisigParticipant, MultisigTransaction, MultisigTransactionActivityItem, MultisigTransactionStatus } from '@mean-dao/mean-multisig-sdk';
import { useWallet } from '../../../../contexts/wallet';
import { createAnchorProgram, InstructionAccountInfo, InstructionDataInfo, MultisigTransactionInstructionInfo, parseMultisigProposalIx, parseMultisigSystemProposalIx } from '../../../../models/multisig';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { Idl } from '@project-serum/anchor';
import { App, AppConfig } from '@mean-dao/mean-multisig-apps';
import { OperationType, TransactionStatus } from '../../../../models/enums';
import moment from "moment";
import { ResumeItem } from '../../../../components/ResumeItem';
import { RejectCancelModal } from '../../../../components/RejectCancelModal';
import { AppStateContext } from '../../../../contexts/appstate';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { IDL as SplTokenIdl } from '@project-serum/anchor/dist/cjs/spl/token';
import { TxConfirmationContext } from '../../../../contexts/transaction-status';
import { appConfig } from '../../../..';

export const ProposalDetailsView = (props: {
  appsProvider?: any;
  connection?: any;
  hasMultisigPendingProposal?: boolean;
  isBusy: boolean;
  loadingData: boolean;
  multisigClient?: MeanMultisig | undefined;
  onDataToSafeView: any;
  onOperationStarted: any;
  onProposalApprove?: any;
  onProposalCancel?: any;
  onProposalExecute?: any;
  onProposalReject?: any;
  proposalSelected?: any;
  selectedMultisig?: any;
  solanaApps?: any;
}) => {

  const {
    transactionStatus,
    setTransactionStatus,
  } = useContext(AppStateContext);
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
    onOperationStarted,
    onProposalApprove,
    onProposalCancel,
    onProposalExecute,
    onProposalReject,
    proposalSelected, 
    selectedMultisig, 
    solanaApps,
  } = props;
  const { confirmationHistory } = useContext(TxConfirmationContext);

  const [selectedProposal, setSelectedProposal] = useState<MultisigTransaction>(proposalSelected);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [selectedProposalIdl, setSelectedProposalIdl] = useState<Idl | undefined>();
  const [proposalIxInfo, setProposalIxInfo] = useState<MultisigTransactionInstructionInfo | null>(null);
  const [proposalActivity, setProposalActivity] = useState<MultisigTransactionActivityItem[]>([]);
  const [needReloadActivity, setNeedReloadActivity] = useState<boolean>(false);
  const [loadingActivity, setLoadingActivity] = useState<boolean>(false);

  const [isCancelRejectModalVisible, setIsCancelRejectModalVisible] = useState(false);
  
  const multisigAddressPK = new PublicKey(appConfig.getConfig().multisigProgramAddress);

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }, [
    setTransactionStatus
  ]);

  const onAcceptCancelRejectProposalModal = () => {
    consoleOut('cancel reject proposal');
    const operation = { transaction: selectedProposal }
    onOperationStarted(operation)
    onProposalCancel(operation);
  };

  // Determine if the ExecuteTransaction operation is in progress by searching
  // into the confirmation history
  const isExecuteTxPendingConfirmation = useCallback((id?: PublicKey) => {
    if (confirmationHistory && confirmationHistory.length > 0) {
      if (id) {
        return confirmationHistory.some(h => 
          h.operationType === OperationType.ExecuteTransaction &&
          h.extras && h.extras.transactionId && (h.extras.transactionId as PublicKey).equals(id) &&
          h.txInfoFetchStatus === "fetching"
        );
      }
      return confirmationHistory.some(h => h.operationType === OperationType.ExecuteTransaction && h.txInfoFetchStatus === "fetching");
    }
    return false;
  }, [confirmationHistory]);

  // Determine if the ApproveTransaction operation is in progress by searching
  // into the confirmation history
  const isApproveTxPendingConfirmation = useCallback((id?: PublicKey) => {
    if (confirmationHistory && confirmationHistory.length > 0) {
      if (id) {
        return confirmationHistory.some(h => 
          h.operationType === OperationType.ApproveTransaction &&
          h.extras && h.extras.transactionId && (h.extras.transactionId as PublicKey).equals(id) &&
          h.txInfoFetchStatus === "fetching"
        );
      }
      return confirmationHistory.some(h => h.operationType === OperationType.ApproveTransaction && h.txInfoFetchStatus === "fetching");
    }
    return false;
  }, [confirmationHistory]);

  // Determine if the RejectTransaction operation is in progress by searching
  // into the confirmation history
  const isRejectTxPendingConfirmation = useCallback((id?: PublicKey) => {
    if (confirmationHistory && confirmationHistory.length > 0) {
      if (id) {
        return confirmationHistory.some(h => 
          h.operationType === OperationType.RejectTransaction &&
          h.extras && h.extras.transactionId && (h.extras.transactionId as PublicKey).equals(id) &&
          h.txInfoFetchStatus === "fetching"
        );
      }
      return confirmationHistory.some(h => h.operationType === OperationType.RejectTransaction && h.txInfoFetchStatus === "fetching");
    }
    return false;
  }, [confirmationHistory]);

  // Determine if the CancelTransaction operation is in progress by searching
  // into the confirmation history
  const isCancelTxPendingConfirmation = useCallback((id?: PublicKey) => {
    if (confirmationHistory && confirmationHistory.length > 0) {
      if (id) {
        return confirmationHistory.some(h => 
          h.operationType === OperationType.CancelTransaction &&
          h.extras && h.extras.transactionId && (h.extras.transactionId as PublicKey).equals(id) &&
          h.txInfoFetchStatus === "fetching"
        );
      }
      return confirmationHistory.some(h => h.operationType === OperationType.CancelTransaction && h.txInfoFetchStatus === "fetching");
    }
    return false;
  }, [confirmationHistory]);

  useEffect(() => {
    if (transactionStatus.currentOperation === TransactionStatus.ConfirmTransaction) {
      setIsCancelRejectModalVisible(false);
    }
  }, [transactionStatus.currentOperation]);

  useEffect(() => {

    if (!selectedMultisig || !proposalSelected) { return; }
    const timeout = setTimeout(() => setSelectedProposal(proposalSelected));
    return () => clearTimeout(timeout);

  }, [
    selectedMultisig, 
    proposalSelected
  ]);

  useEffect(() => {

    if (!selectedMultisig || !solanaApps || !appsProvider || !proposalSelected || !selectedProposal) { return; }

    const timeout = setTimeout(() => {

      if (proposalSelected.programId.equals(SystemProgram.programId)) {
        const ixInfo = parseMultisigSystemProposalIx(proposalSelected);
        setProposalIxInfo(ixInfo);
        // console.log('ixInfo', ixInfo);
      } else if (proposalSelected.programId.equals(TOKEN_PROGRAM_ID)) {
        setSelectedProposalIdl(SplTokenIdl);
        const program = createAnchorProgram(connection, TOKEN_PROGRAM_ID, SplTokenIdl);
        const ixInfo = parseMultisigProposalIx(proposalSelected, program);
        setProposalIxInfo(ixInfo);
        // console.log('ixInfo', ixInfo);
      } else {
        const proposalApp = solanaApps.filter((app: App) => app.id === selectedProposal.programId.toBase58())[0];
        if (proposalApp) {
          appsProvider
          .getAppConfig(proposalApp.id, proposalApp.uiUrl, proposalApp.defUrl)
          .then((config: AppConfig) => {
            const idl = config ? config.definition : undefined;
            setSelectedProposalIdl(idl);
            const program = idl ? createAnchorProgram(connection, new PublicKey(proposalApp.id), idl) : undefined;
            const ixInfo = parseMultisigProposalIx(proposalSelected, program);
            setProposalIxInfo(ixInfo);
            // console.log('ixInfo', ixInfo);
          });
        } else {
          const ixInfo = parseMultisigProposalIx(proposalSelected);
          setProposalIxInfo(ixInfo);
          // console.log('ixInfo', ixInfo);
        }
      }
    });

    return () => clearTimeout(timeout);

  }, [
    appsProvider, 
    connection, 
    proposalSelected, 
    selectedMultisig, 
    selectedProposal, 
    solanaApps
  ]);

  useEffect(() => {

    const timeout = setTimeout(() => {
      if (selectedProposal) {
        setNeedReloadActivity(true);
      }
    });

    return () => {
      clearTimeout(timeout);
    }

  },[
    selectedProposal
  ]);

  // Get transaction proposal activity
  useEffect(() => {

    if (!multisigClient || !selectedProposal || !needReloadActivity) { return; }

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
    }

  }, [
    multisigClient,
    selectedProposal,
    needReloadActivity,
  ])

  // const isUnderDevelopment = () => {
  //   return isLocal() || (isDev() && isWhitelisted) ? true : false;
  // }

  // When back button is clicked, goes to Safe Info
  const hideProposalDetailsHandler = () => {
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
    proposalIxInfo ? (
      <div className="safe-details-collapse w-100 pl-1 pr-4">
        <Row gutter={[8, 8]} className="mb-2 mt-2" key="programs">
          <Col xs={6} sm={6} md={4} lg={4} className="pr-1">
            <span className="info-label">{t('multisig.proposal-modal.instruction-program')}</span>
          </Col>
          <Col xs={17} sm={17} md={19} lg={19} className="pl-1 pr-3">
            <span onClick={() => copyAddressToClipboard(proposalIxInfo.programId)}  className="d-block info-data simplelink underline-on-hover text-truncate" style={{cursor: 'pointer'}}>
              {(
                proposalIxInfo.programName 
                  ? `${proposalIxInfo.programName} (${proposalIxInfo.programId})` 
                  : proposalIxInfo.programId
              )}
            </span>
          </Col>
          <Col xs={1} sm={1} md={1} lg={1}>
            <a
              target="_blank"
              rel="noopener noreferrer"
              href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${proposalIxInfo.programId}${getSolanaExplorerClusterParam()}`}>
              <IconExternalLink className="mean-svg-icons external-icon" />
            </a>
          </Col>
        </Row>
        
        {
          proposalIxInfo.accounts.map((account: InstructionAccountInfo, index: number) => {
            return (
              <Row gutter={[8, 8]} className="mb-2" key={`item-${index}`}>
                <Col xs={6} sm={6} md={4} lg={4} className="pr-1">
                  <span className="info-label">{account.label || t('multisig.proposal-modal.instruction-account')}</span>
                </Col>
                <Col xs={17} sm={17} md={19} lg={19} className="pl-1 pr-3">
                  <span onClick={() => copyAddressToClipboard(account.value)} className="d-block info-data simplelink underline-on-hover text-truncate" style={{cursor: 'pointer'}}>
                    {account.value}
                  </span>
                </Col>
                <Col xs={1} sm={1} md={1} lg={1}>
                  <a
                    target="_blank"
                    rel="noopener noreferrer"
                    href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${account.value}${getSolanaExplorerClusterParam()}`}>
                    <IconExternalLink className="mean-svg-icons external-icon" />
                  </a>
                </Col>
              </Row>
            )
          })
        }

        {
          proposalIxInfo.programId === multisigAddressPK.toBase58() ? (
            proposalIxInfo.data.map((item: InstructionDataInfo, index: number) => {
              return (
                <Row gutter={[8, 8]} className="mb-2" key={`more-items-${index}`}>
                  { item.label && (
                    <Col xs={6} sm={6} md={4} lg={4} className="pr-1 text-truncate">
                      <Tooltip placement="right" title={item.label || ""}>
                        <span className="info-label">{item.label || t('multisig.proposal-modal.instruction-data')}</span>
                      </Tooltip>
                    </Col>
                  )}
                  {
                    item.label === "Owners" ? (
                      <>
                        {item.value.map((owner: any, idx: number) => {
                          return (
                            <Row key={`owners-${idx}`} className="pr-1">
                              <Col xs={6} sm={6} md={4} lg={4} className="pl-1 pr-1 text-truncate">
                                <Tooltip placement="right" title={owner.label || ""}>
                                  <span className="info-label">{owner.label || t('multisig.proposal-modal.instruction-data')}</span>
                                </Tooltip>
                              </Col>
                              <Col xs={17} sm={17} md={19} lg={19} className="pl-1 pr-3">
                                <span onClick={() => copyAddressToClipboard(owner.data)} className="d-block info-data simplelink underline-on-hover text-truncate" style={{cursor: 'pointer'}}>
                                  {owner.data}
                                </span>
                              </Col>
                              <Col xs={1} sm={1} md={1} lg={1}>
                                <a
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${owner.data}${getSolanaExplorerClusterParam()}`}>
                                  <IconExternalLink className="mean-svg-icons external-icon" />
                                </a>
                              </Col>
                            </Row>
                          )
                        })}
                      </>
                    ) : (
                      <>
                        <Col xs={17} sm={17} md={19} lg={19} className="pl-1 pr-3" key="loquejea">
                          <span className="d-block info-data text-truncate" style={{cursor: 'pointer'}}>
                            {item.value}
                          </span>
                        </Col>
                      </>
                    )
                  }
                </Row>
              )
            })
          ) : (
            proposalIxInfo.data.map((item: InstructionDataInfo, index: number) => {
              return item.label && item.value && (
                <Row gutter={[8, 8]} className="mb-2" key={`data-${index}`}>
                  <Col xs={6} sm={6} md={4} lg={4} className="pr-1 text-truncate">
                    <Tooltip placement="right" title={item.label || ""}>
                      <span className="info-label">{item.label || t('multisig.proposal-modal.instruction-data')}</span>
                    </Tooltip>
                  </Col>
                  <Col xs={17} sm={17} md={19} lg={19} className="pl-1 pr-3">
                    <span className="d-block info-data text-truncate" style={{cursor: 'pointer'}}>
                      {item.value}
                    </span>
                  </Col>
                </Row>
              )
            })
          )
        }
      </div>
    ) : (
      <span className="pl-1">Loading instruction...</span>
    )
  );

  // Display the activities in the "Activity" tab, on safe details page
  const renderActivities = (
    !loadingActivity ? (
      proposalActivity.length > 0 ? (
        <Row>
          {proposalActivity.map((activity: any) => {
            let icon = null;

            switch (activity.action) {
              case 'created':
                icon = <IconCreated className="mean-svg-icons fg-purple activity-icon" />;
                break;
              case 'approved':
                icon = <IconApprove className="mean-svg-icons fg-green activity-icon" />;
                break;
              case 'executed':
                icon = <IconApprove className="mean-svg-icons fg-green activity-icon" />;
                break;
              case 'rejected':
                icon = <IconCross className="mean-svg-icons fg-red activity-icon" />;
                break;
              case 'deleted':
                icon = <IconMinus className="mean-svg-icons fg-yellow activity-icon" />;
                break;
              default:
                icon = "";
                break;
            }

            const title = moment(activity.createdOn).format("LLL").toLocaleString();
            const resume = <div className="d-flex align-items-center activity-container">
              <div className="d-flex align-items-center">{icon} {`Proposal ${activity.action} by ${activity.owner.name} `}</div>
              <div onClick={() => copyAddressToClipboard(activity.address)} className="simplelink underline-on-hover activity-address ml-1">
                ({shortenAddress(activity.address, 4)})
              </div>
            </div>

            return (
              <div 
                key={`${activity.index + 1}`}
                className={`w-100 activities-list mr-1 pr-4 ${(activity.index + 1) % 2 === 0 ? '' : 'background-gray'}`}>
                  <div className="resume-item-container">
                    <div className="d-flex">
                      <span className="mr-1">{title}</span>
                      {resume}
                    </div>
                    <span className="icon-button-container icon-stream-row">
                      <a
                        target="_blank"
                        rel="noopener noreferrer"
                        href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${activity.address}${getSolanaExplorerClusterParam()}`}>
                        <IconExternalLink className="mean-svg-icons external-icon ml-1" />
                      </a>
                    </span>
                  </div>
              </div>
            )
          })}
        </Row>
      ) : (
        <span className="pl-1">This proposal has no activities</span>
      )
    ) : (
      <span className="pl-1">Loading activities...</span>
    )
  )

  const renderCoolOffPeriod = (
    <div className="safe-details-cool-off-period-container">
      <div className="info-label d-flex justify-content-center">Cool-off:</div>
      <div className="d-flex">
        <div className="center-cool-off-period-data">
          <div className="number-cool-off-period-background">00</div>
          <div className="form-label">day</div>
        </div>
        <div>:</div>
        <div className="center-cool-off-period-data">
          <span className="number-cool-off-period-background">00</span>
          <span className="form-label">hrs</span>
        </div>
        <div>:</div>
        <div className="center-cool-off-period-data">
          <div className="number-cool-off-period-background">00</div>
          <div className="form-label">min</div>
        </div>
        {/* <div>:</div>
        <div className="center-cool-off-period-data">
          <div className="number-cool-off-period-background">00</div>
          <div className="form-label">sec</div>
        </div> */}
      </div>
    </div>
  );

  // Tabs
  const tabs = [
    {
      id: "instruction",
      name: "Instruction",
      render: renderInstructions
    }, 
    {
      id: "activity",
      name: "Activity",
      render: renderActivities
    }
  ];

  const anyoneCanExecuteTx = () => {
    const allowedOperations = [
      OperationType.StreamWithdraw,
      OperationType.EditMultisig,
      OperationType.TransferTokens,
      OperationType.UpgradeProgram,
      OperationType.SetMultisigAuthority,
      OperationType.SetAssetAuthority,
      OperationType.DeleteAsset,
      OperationType.StreamTransferBeneficiary,
      OperationType.CredixDepositFunds,
      OperationType.CredixWithdrawFunds,
      OperationType.CredixDepositTranche,
      OperationType.CredixWithdrawTranche,
    ];
    return allowedOperations.includes(selectedProposal.operation);
  };

  const isProposer = (
    selectedProposal &&
    selectedProposal.proposer && 
    selectedProposal.proposer.toBase58() === publicKey?.toBase58()
  ) ? true : false;

  if (!selectedProposal || !selectedProposal.proposer) { return (<></>); }

  const title = selectedProposal.details.title ? selectedProposal.details.title : "Unknown proposal";

  // Number of participants who have already approved the Tx
  const approvedSigners = selectedProposal.signers.filter((s: any) => s === true).length;
  const rejectedSigners = selectedProposal.signers.filter((s: any) => s === false).length;
  const expirationDate = selectedProposal.details.expirationDate ? new Date(selectedProposal.details.expirationDate) : "";
  const executedOnDate = selectedProposal.executedOn ? new Date(selectedProposal.executedOn).toDateString() : "";
  const proposedBy = (selectedMultisig.owners as MultisigParticipant[]).find((owner: MultisigParticipant) => owner.address === selectedProposal.proposer?.toBase58());
  const neededSigners = () => { return selectedMultisig.threshold - approvedSigners; };
  const resume = (selectedProposal.status === 0 && neededSigners() > 0) && `Needs ${neededSigners()} ${neededSigners() > 1 ? "approvals" : "approval"} to pass`;

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
          <Row className="safe-details-description pl-1">
            {selectedProposal.details.description}
          </Row>
        )}

        <div className="safe-details-proposal">
          <div className="safe-details-proposal-left">
            {selectedProposal.status === MultisigTransactionStatus.Passed ? (
              anyoneCanExecuteTx() ? (
                <Col className="safe-details-left-container">
                  <IconUserClock className="user-image mean-svg-icons bg-yellow" />
                  <div className="proposal-resume-left-text">
                    <div className="info-label">Pending execution by</div>
                    {publicKey && (
                      <span>{proposedBy && proposedBy.name ? proposedBy.name : shortenAddress(publicKey.toBase58(), 4)}</span>
                    )}
                  </div>
                </Col>
              ) : (
                <Col className="safe-details-left-container">
                  <IconUserClock className="user-image mean-svg-icons bg-yellow" />
                  <div className="proposal-resume-left-text">
                    <div className="info-label">Pending execution by</div>
                    <span>{proposedBy && proposedBy.name ? proposedBy.name : shortenAddress(selectedProposal.proposer?.toBase58(), 4)}</span>
                  </div>
                </Col>
              )
            ) : selectedProposal.status === MultisigTransactionStatus.Executed ? (
              <Col className="safe-details-left-container">
                <IconLightning className="user-image mean-svg-icons bg-green" />
                <div className="proposal-resume-left-text">
                  <div className="info-label">Proposed by</div>
                  <span>{proposedBy && proposedBy.name ? proposedBy.name : shortenAddress(selectedProposal.proposer?.toBase58(), 4)}</span>
                </div>
              </Col>
            ) : (
              <Col className="safe-details-left-container">
                <IconUser className="user-image mean-svg-icons" />
                <div className="proposal-resume-left-text">
                  <div className="info-label">Proposed by</div>
                  <span>{proposedBy && proposedBy.name ? proposedBy.name : shortenAddress(selectedProposal.proposer?.toBase58(), 4)}</span>
                </div>
              </Col>
            )}
            {/* {renderCoolOffPeriod} */}
          </div>
          <div>
            <div className="safe-details-right-container btn-group mr-1">
            {
              (
                (
                  selectedProposal.status === MultisigTransactionStatus.Voided ||
                  selectedProposal.status === MultisigTransactionStatus.Failed ||
                  selectedProposal.status === MultisigTransactionStatus.Expired

                ) && isProposer

              ) && (
                <Button
                  type="default"
                  shape="round"
                  size="small"
                  className="thin-stroke d-flex justify-content-center align-items-center"
                  disabled={
                    hasMultisigPendingProposal ||
                    isBusy ||
                    isCancelTxPendingConfirmation(selectedProposal.id) ||
                    isExecuteTxPendingConfirmation(selectedProposal.id) ||
                    loadingData
                  }
                  onClick={() => setIsCancelRejectModalVisible(true)}>
                    <div className="btn-content">
                      Cancel
                    </div>
                </Button>
              )
            }
            {
              selectedProposal.status === MultisigTransactionStatus.Active && (
                <>
                  <Button
                    type="default"
                    shape="round"
                    size="small"
                    className="thin-stroke"
                    disabled={
                      selectedProposal.didSigned === true ||
                      hasMultisigPendingProposal ||
                      isBusy ||
                      isApproveTxPendingConfirmation(selectedProposal.id) ||
                      isRejectTxPendingConfirmation(selectedProposal.id) ||
                      isExecuteTxPendingConfirmation(selectedProposal.id) ||
                      loadingData
                    }
                    onClick={() => {
                      const operation = { transaction: selectedProposal };
                      onOperationStarted(operation)
                      onProposalApprove(operation);
                    }}>
                      {
                        selectedProposal.didSigned !== true ? (
                          <div className="btn-content">
                            <IconThumbsUp className="mean-svg-icons" />
                            Approve
                          </div>
                        ) : (
                          <div className="btn-content">
                            <IconApprove className="mean-svg-icons" />
                            Approved
                          </div>
                        )
                      }
                  </Button>
                  <Button
                    type="default"
                    shape="round"
                    size="small"
                    className="thin-stroke"
                    disabled={
                      selectedProposal.didSigned === false ||
                      hasMultisigPendingProposal ||
                      isBusy ||
                      isApproveTxPendingConfirmation(selectedProposal.id) ||
                      isRejectTxPendingConfirmation(selectedProposal.id) ||
                      isCancelTxPendingConfirmation(selectedProposal.id) ||
                      loadingData
                    }
                    onClick={() => {
                      const operation = { transaction: selectedProposal };
                      onOperationStarted(operation)
                      onProposalReject(operation);
                    }}>
                      {
                        selectedProposal.didSigned !== false ? (
                          <div className="btn-content">
                            <IconThumbsDown className="mean-svg-icons" />
                            Reject
                          </div>
                        ) : (
                          <div className="btn-content">
                            <IconApprove className="mean-svg-icons" />
                            Rejected
                          </div>
                        )
                      }
                  </Button>
                  {
                    isProposer && (
                      <Button
                        type="default"
                        shape="round"
                        size="small"
                        className="thin-stroke d-flex justify-content-center align-items-center"
                        disabled={
                          hasMultisigPendingProposal ||
                          isBusy ||
                          isExecuteTxPendingConfirmation(selectedProposal.id) ||
                          loadingData
                        }
                        onClick={() => setIsCancelRejectModalVisible(true)}>
                          <div className="btn-content">
                            Cancel
                          </div>
                      </Button>
                    )
                  }
                </>
              )
            }
            {
              selectedProposal.status === MultisigTransactionStatus.Passed && (
                <>
                  <Button
                    type="default"
                    shape="round"
                    size="small"
                    className="thin-stroke d-flex justify-content-center align-items-center"
                    disabled={
                      hasMultisigPendingProposal || 
                      (!isProposer && !anyoneCanExecuteTx()) ||
                      isBusy ||
                      isExecuteTxPendingConfirmation(selectedProposal.id) ||
                      loadingData
                    }
                    onClick={() => {
                      const operation = { transaction: selectedProposal }
                      onOperationStarted(operation)
                      onProposalExecute(operation);
                    }}>
                      <div className="btn-content">
                        Execute
                      </div>
                  </Button>
                  {
                    isProposer && (
                      <Button
                        type="default"
                        shape="round"
                        size="small"
                        className="thin-stroke d-flex justify-content-center align-items-center"
                        disabled={
                          hasMultisigPendingProposal ||
                          isBusy ||
                          isExecuteTxPendingConfirmation(selectedProposal.id) ||
                          isApproveTxPendingConfirmation(selectedProposal.id) ||
                          isRejectTxPendingConfirmation(selectedProposal.id) ||
                          isCancelTxPendingConfirmation(selectedProposal.id) ||
                          loadingData
                        }
                        onClick={() => setIsCancelRejectModalVisible(true)}>
                          <div className="btn-content">
                            Cancel
                          </div>
                      </Button>
                    )
                  }
                </>
              )
            }
            </div>
          </div>
        </div>

        {/* <Row>
          <h3 className="mt-1 proposal-instruction">Instruction</h3>
          {renderInstructions}
        </Row> */}

        <TabsMean
          tabs={tabs}
          defaultTab="instruction"
        />
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
  )
};