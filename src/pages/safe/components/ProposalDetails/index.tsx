import './style.scss';
import { Button, Col, Row, Tooltip } from "antd"
import { IconArrowBack, IconUser, IconThumbsUp, IconExternalLink, IconLightning, IconUserClock, IconApprove, IconCross, IconCreated, IconMinus } from "../../../../Icons"

import { shortenAddress } from '../../../../utils/utils';
import { TabsMean } from '../../../../components/TabsMean';
import { useTranslation } from 'react-i18next';
import { openNotification } from '../../../../components/Notifications';
import { useCallback, useEffect, useState } from 'react';
import { consoleOut, copyText } from '../../../../utils/ui';
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from '../../../../constants';
import { getSolanaExplorerClusterParam } from '../../../../contexts/connection';
import { ResumeItem } from '../UI/ResumeItem';
import { MeanMultisig, MEAN_MULTISIG_PROGRAM, MultisigTransaction, MultisigTransactionActivityItem, MultisigTransactionStatus } from '@mean-dao/mean-multisig-sdk';
// import { AppStateContext } from '../../../../contexts/appstate';
import { useWallet } from '../../../../contexts/wallet';
import { createAnchorProgram, InstructionAccountInfo, InstructionDataInfo, MultisigTransactionInstructionInfo, parseMultisigProposalIx } from '../../../../models/multisig';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { Idl } from '@project-serum/anchor';
import { App, AppConfig } from '@mean-dao/mean-multisig-apps';
import { OperationType } from '../../../../models/enums';
// import { InfoIcon } from '../../../../components/InfoIcon';

export const ProposalDetailsView = (props: {
  isProposalDetails: boolean;
  onDataToSafeView: any;
  proposalSelected?: any;
  selectedMultisig?: any;
  onProposalApprove?: any;
  onProposalExecute?: any;
  connection?: any;
  solanaApps?: any;
  appsProvider?: any;
  onOperationStarted: any;
  multisigClient?: MeanMultisig | undefined;

}) => {

  // const { isWhitelisted } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const { 
    connection,
    solanaApps,
    appsProvider,
    multisigClient,
    isProposalDetails, 
    onDataToSafeView, 
    proposalSelected, 
    selectedMultisig, 
    onProposalApprove, 
    onProposalExecute,
    onOperationStarted

  } = props;

  const [selectedProposal, setSelectedProposal] = useState<MultisigTransaction>(proposalSelected);
  const [selectedProposalIdl, setSelectedProposalIdl] = useState<Idl | undefined>();
  const [proposalIxInfo, setProposalIxInfo] = useState<MultisigTransactionInstructionInfo | null>(null);
  const [proposalActivity, setProposalActivity] = useState<MultisigTransactionActivityItem[]>([]);
  const [loadingActivity, setLoadingActivity] = useState<boolean>(true);

  useEffect(() => {

    if (!selectedMultisig || !proposalSelected) { return; }
    const timeout = setTimeout(() => setSelectedProposal(proposalSelected));
    return () => clearTimeout(timeout);

  }, [
    selectedMultisig, 
    proposalSelected
  ]);

  useEffect(() => {

    if (!selectedMultisig || !solanaApps || !appsProvider || !selectedProposal) { return; }
    const timeout = setTimeout(() => {
      // console.log('solanaApps',solanaApps);
      const proposalApp = solanaApps.filter((app: App) => app.id === selectedProposal.programId.toBase58())[0];
      // console.log('proposalApp', proposalApp);
      if (proposalApp && proposalApp.id !== SystemProgram.programId.toBase58()) {
        appsProvider
          .getAppConfig(proposalApp.id, proposalApp.uiUrl, proposalApp.defUrl)
          .then((config: AppConfig) => {
            // console.log('definition', config.definition);
            setSelectedProposalIdl(config ? config.definition : undefined);
            const program = config ? createAnchorProgram(connection, new PublicKey(proposalApp.id), config.definition) : undefined;
            const ixInfo = parseMultisigProposalIx(proposalSelected, program);
            // console.log('ixInfo', ixInfo);
            setProposalIxInfo(ixInfo);
          });
      } else {
        const ixInfo = parseMultisigProposalIx(proposalSelected);
        setProposalIxInfo(ixInfo);
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

    const loading = selectedProposal ? true : false;
    const timeout = setTimeout(() => setLoadingActivity(loading));

    return () => {
      clearTimeout(timeout);
    }

  },[
    selectedProposal
  ]);

  // Get transaction proposal activity
  useEffect(() => {

    if (!multisigClient || !selectedProposal || !loadingActivity) { return; }

    const timeout = setTimeout(() => {
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
    loadingActivity, 
    multisigClient, 
    selectedProposal
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
      <div className="safe-details-collapse w-100 pl-1">
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
                    {/* <span className="info-label">{t('multisig.proposal-modal.instruction-account')} :</span> */}
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
          proposalIxInfo.programId === MEAN_MULTISIG_PROGRAM.toBase58() ? (
            proposalIxInfo.data.map((item: InstructionDataInfo, index: number) => {
              return (
                <Row gutter={[8, 8]} className="mb-2" key={`more-items-${index}`}>
                  <Col xs={6} sm={6} md={4} lg={4} className="pr-1 text-truncate">
                    <Tooltip placement="right" title={item.label || ""}>
                      <span className="info-label">{item.label || t('multisig.proposal-modal.instruction-data')}</span>
                    </Tooltip>
                  </Col>
                  {
                    item.label === "Owners" ? (
                      <>
                        {item.value.map((owner: any, idx: number) => {
                          return (
                            <Row key={`owners-${idx}`}>
                              <Col xs={6} sm={6} md={4} lg={4} className="pl-1 pr-1 text-truncate">
                                <Tooltip placement="right" title={owner.label || ""}>
                                  <span className="info-label">{owner.label || t('multisig.proposal-modal.instruction-data')}</span>
                                </Tooltip>
                              </Col>
                              <Col xs={17} sm={17} md={19} lg={19} className="pl-1 pr-3">
                                <span className="d-block info-data simplelink underline-on-hover text-truncate" style={{cursor: 'pointer'}}>
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
                          <span className="d-block info-data simplelink underline-on-hover text-truncate" style={{cursor: 'pointer'}}>
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
            proposalIxInfo.data.map((item: InstructionDataInfo) => {
              return (
                <Row gutter={[8, 8]} className="mb-2">
                  <Col xs={6} sm={6} md={4} lg={4} className="pr-1 text-truncate">
                    <Tooltip placement="right" title={item.label || ""}>
                      <span className="info-label">{item.label || t('multisig.proposal-modal.instruction-data')}</span>
                    </Tooltip>
                  </Col>
                  <Col xs={17} sm={17} md={19} lg={19} className="pl-1 pr-3">
                    <span className="d-block info-data simplelink underline-on-hover text-truncate" style={{cursor: 'pointer'}}>
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
      <span>Loading instruction...</span>
    )
  );

  // Display the activities in the "Activity" tab, on safe details page
  const renderActivities = (
    !loadingActivity ? (
      proposalActivity.length > 0 && (
        <Row>
          {proposalActivity.map((activity: any) => {
            let icon = null;

            switch (activity.action) {
              case 'created':
                icon = <IconCreated className="mean-svg-icons fg-purple" />;
                break;
              case 'approved':
                icon = <IconApprove className="mean-svg-icons fg-green" />;
                break;
              case 'executed':
                icon = <IconApprove className="mean-svg-icons fg-green" />;
                break;
              case 'rejected':
                icon = <IconCross className="mean-svg-icons fg-red" />;
                break;
              case 'deleted':
                icon = <IconMinus className="mean-svg-icons fg-yellow" />;
                break;
              default:
                icon = "";
                break;
            }

            return (
              <div 
                key={activity.address}
                className={`d-flex w-100 align-items-center activities-list ${activity.index % 2 === 0 ? '' : 'background-gray'}`}
                >
                  <div className="list-item">
                    <span className="mr-2">
                        {activity.date}
                    </span>
                    {icon}
                    <span>
                      {`Proposal ${activity.action} by ${activity.owner.name} [${shortenAddress(activity.address, 4)}]`}
                    </span>
                  </div>
              </div>
            )
          })}
        </Row>
      )
    ) : (
      <span>Loading acivity...</span>
    )
  )

  // Tabs
  const tabs = [
    {
      id: "proposal01",
      name: "Instruction",
      render: renderInstructions
    }, 
    {
      id: "proposal02",
      name: "Activity",
      render: renderActivities
    }
  ];

  const anyoneCanExecuteTx = () => {
    if (selectedProposal.operation !== OperationType.StreamWithdraw &&
        selectedProposal.operation !== OperationType.EditMultisig &&
        selectedProposal.operation !== OperationType.TransferTokens &&
        selectedProposal.operation !== OperationType.UpgradeProgram &&
        selectedProposal.operation !== OperationType.SetMultisigAuthority &&
        selectedProposal.operation !== OperationType.SetAssetAuthority &&
        selectedProposal.operation !== OperationType.DeleteAsset &&
        selectedProposal.operation !== OperationType.CredixDepositFunds &&
        selectedProposal.operation !== OperationType.CredixWithdrawFunds) {
      return false;
    } else {
      return true;
    }
  };

  const isProposer = (
    selectedProposal &&
    selectedProposal.proposer && 
    selectedProposal.proposer.toBase58() === publicKey?.toBase58()

  ) ? true : false;

  if (!selectedProposal.proposer) { return (<></>); }

  // Number of participants who have already approved the Tx
  const approvedSigners = selectedProposal.signers.filter((s: any) => s === true).length;
  const neededSigners = approvedSigners && (selectedMultisig.threshold - approvedSigners);
  const expirationDate = selectedProposal.details.expirationDate ? new Date(selectedProposal.details.expirationDate) : "";
  const executedOnDate = selectedProposal.executedOn ? new Date(selectedProposal.executedOn).toDateString() : "";

  const proposedBy = selectedMultisig.owners.find((owner: any) => owner.address === selectedProposal.proposer?.toBase58());
  
  return (
    <div className="safe-details-container">
      <Row gutter={[8, 8]} className="safe-details-resume">
        <div onClick={hideProposalDetailsHandler} className="back-button icon-button-container">
          <IconArrowBack className="mean-svg-icons" />
          <span className="ml-1">Back</span>
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
        isProposalDetails={isProposalDetails}
      />
      {selectedProposal.details.description && (
        <Row className="safe-details-description pl-1">
          {selectedProposal.details.description}
        </Row>
      )}

      <Row gutter={[8, 8]} className="safe-details-proposal">
        <>
          {selectedProposal.status === MultisigTransactionStatus.Approved ? (
            anyoneCanExecuteTx() ? (
              <Col className="safe-details-left-container">
                <IconUserClock className="user-image mean-svg-icons bg-yellow" />
                <div className="proposal-resume-left-text">
                  <div className="info-label">Pending execution by</div>
                  {publicKey && (
                    <span>{proposedBy.name ? proposedBy.name : shortenAddress(publicKey.toBase58(), 4)}</span>
                  )}
                </div>
              </Col>
            ) : (
              <Col className="safe-details-left-container">
                <IconUserClock className="user-image mean-svg-icons bg-yellow" />
                <div className="proposal-resume-left-text">
                  <div className="info-label">Pending execution by</div>
                  <span>{proposedBy.name ? proposedBy.name : shortenAddress(selectedProposal.proposer?.toBase58(), 4)}</span>
                </div>
              </Col>
            )
          ) : selectedProposal.status === MultisigTransactionStatus.Executed ? (
            <Col className="safe-details-left-container">
              <IconLightning className="user-image mean-svg-icons bg-green" />
              <div className="proposal-resume-left-text">
                <div className="info-label">Executed by</div>
                <span>{proposedBy.name ? proposedBy.name : shortenAddress(selectedProposal.proposer?.toBase58(), 4)}</span>
              </div>
            </Col>
          ) : (
            <Col className="safe-details-left-container">
              <IconUser className="user-image mean-svg-icons" />
              <div className="proposal-resume-left-text">
                <div className="info-label">Proposed by</div>
                <span>{proposedBy.name ? proposedBy.name : shortenAddress(selectedProposal.proposer?.toBase58(), 4)}</span>
              </div>
            </Col>
          )}
        </>
        <>
          <Col className="safe-details-right-container btn-group">
            {selectedProposal.status !== MultisigTransactionStatus.Approved && selectedProposal.status !== MultisigTransactionStatus.Executed ? (
              <Button
                type="default"
                shape="round"
                size="small"
                className="thin-stroke"
                disabled={selectedProposal.didSigned || selectedProposal.status !== MultisigTransactionStatus.Pending}
                onClick={() => {
                  const operation = { transaction: selectedProposal };
                  onOperationStarted(operation)
                  onProposalApprove(operation);
                }}>
                  <div className="btn-content">
                    <IconThumbsUp className="mean-svg-icons" />
                    Approve
                  </div>
              </Button>
            ) : selectedProposal.status === MultisigTransactionStatus.Approved || selectedProposal.status !== MultisigTransactionStatus.Executed ? (
              anyoneCanExecuteTx() || (!anyoneCanExecuteTx() && isProposer) ? (
                <Button
                  type="default"
                  shape="round"
                  size="small"
                  className="thin-stroke d-flex justify-content-center align-items-center"
                  onClick={() => {
                    const operation = { transaction: selectedProposal }
                    onOperationStarted(operation)
                    onProposalExecute(operation);
                  }}>
                    <div className="btn-content">
                      Execute
                    </div>
                </Button>
              ) : null
            ) : null}
          </Col>
        </>
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