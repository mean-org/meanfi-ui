import React, { useCallback, useContext } from 'react';
import {
  CheckOutlined,
  CopyOutlined,
  InfoCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { useWallet } from '../../contexts/wallet';
import { AppStateContext } from '../../contexts/appstate';
import { useTranslation } from 'react-i18next';
import {
  getTokenAmountAndSymbolByTokenAddress,
  shortenAddress
} from '../../utils/utils';
import "./style.scss";
import { Button, Col, Divider, Modal, Row, Spin } from 'antd';
import {
  copyText,
  getTransactionOperationDescription,
  getReadableDate,
} from '../../utils/ui';
import { OperationType, TransactionStatus } from '../../models/enums';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import {
  Multisig,
  MultisigV2,
  MultisigParticipant,
  MultisigTransaction,
  MultisigTransactionStatus,
} from '../../models/multisig';
import Countdown from 'react-countdown';

// MULTISIG
import { MultisigOwnersSigned } from '../../components/MultisigOwnersSigned';
import { isError } from '../../utils/transactions';
import { getOperationName } from '../../utils/multisig-helpers';
import { openNotification } from '../../components/Notifications';
import { IconExternalLink } from '../../Icons';
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from '../../constants';
import { getSolanaExplorerClusterParam } from '../../contexts/connection';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const ProposalSummaryModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  isBusy: boolean;
  nativeBalance: number;
  highlightedMultisigTx: MultisigTransaction;
  multisigTransactionSummary: any;
  selectedMultisig: MultisigV2 | Multisig;
  minRequiredBalance: number;
}) => {
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const {
    transactionStatus,
    setTransactionStatus
  } = useContext(AppStateContext);

  // // Transaction confirm and execution modal launched from each Tx row
  // const [isMultisigActionTransactionModalVisible, setMultisigActionTransactionModalVisible] = useState(false);

  const { highlightedMultisigTx, multisigTransactionSummary, selectedMultisig, isBusy, nativeBalance, minRequiredBalance, isVisible } = props;  

  const resetTransactionStatus = useCallback(() => {

    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });

  }, [
    setTransactionStatus
  ]);

  const onAcceptModal = () => {
    props.handleOk(highlightedMultisigTx);
  };

  const onCloseModal = () => {
    props.handleClose();
    resetTransactionStatus();
  }

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

  },[t])

  const getTxInitiator = useCallback((mtx: MultisigTransaction): MultisigParticipant | undefined => {
    if (!selectedMultisig) { return undefined; }

    const owners: MultisigParticipant[] = (selectedMultisig as MultisigV2).owners;
    const initiator = owners && owners.length > 0
      ? owners.find(o => o.address === mtx.proposer?.toBase58())
      : undefined;

    return initiator;
  }, [selectedMultisig]);

  const getTxSignedCount = useCallback((mtx: MultisigTransaction) => {
    if (mtx && mtx.signers) {
      return mtx.signers.filter((s: boolean) => s === true).length;
    }
    return 0;
  }, []);

  const isTxVoided = useCallback(() => {
    if (highlightedMultisigTx) {
      if (highlightedMultisigTx.status === MultisigTransactionStatus.Voided) {
        return true;
      }
    }
    return false;
  }, [highlightedMultisigTx]);

  const isTxExpired = useCallback(() => {
    if (highlightedMultisigTx) {
      if (highlightedMultisigTx.status === MultisigTransactionStatus.Expired) {
        return true;
      }
    }
    return false;
  }, [highlightedMultisigTx]);

  const isTxPendingApproval = useCallback(() => {
    if (highlightedMultisigTx) {
      if (highlightedMultisigTx.status === MultisigTransactionStatus.Pending) {
        return true;
      }
    }
    return false;
  }, [highlightedMultisigTx]);

  const isTxPendingExecution = useCallback(() => {
    if (highlightedMultisigTx) {
      if (highlightedMultisigTx.status === MultisigTransactionStatus.Approved) {
        return true;
      }
    }
    return false;
  }, [highlightedMultisigTx]);

  const isTxRejected = useCallback(() => {
    if (highlightedMultisigTx) {
      if (highlightedMultisigTx.status === MultisigTransactionStatus.Rejected) {
        return true;
      }
    }
    return false;
  }, [highlightedMultisigTx]);

  const isUserTheProposer = useCallback((): boolean => {
    if (!highlightedMultisigTx || !publicKey) { return false; }

    return  publicKey &&
            highlightedMultisigTx.proposer &&
            publicKey.equals(highlightedMultisigTx.proposer)
        ? true
        : false;

  }, [
    publicKey,
    highlightedMultisigTx
  ]);

  const isTreasuryOperation = useCallback(() => {

    if (!highlightedMultisigTx) { return false; }

    return  highlightedMultisigTx.operation === OperationType.TreasuryCreate ||
            highlightedMultisigTx.operation === OperationType.TreasuryClose ||
            highlightedMultisigTx.operation === OperationType.TreasuryAddFunds ||
            highlightedMultisigTx.operation === OperationType.TreasuryStreamCreate ||
            highlightedMultisigTx.operation === OperationType.TreasuryWithdraw ||
            highlightedMultisigTx.operation === OperationType.StreamCreate ||
            highlightedMultisigTx.operation === OperationType.StreamClose ||
            highlightedMultisigTx.operation === OperationType.StreamAddFunds
      ? true
      : false;

  },[highlightedMultisigTx])

  const canShowApproveButton = useCallback(() => {

    if (!highlightedMultisigTx) { return false; }

    let result = (
      highlightedMultisigTx.status === MultisigTransactionStatus.Pending &&
      !highlightedMultisigTx.didSigned
    );

    return result;

  },[highlightedMultisigTx])

  const canShowExecuteButton = useCallback(() => {

    if (!highlightedMultisigTx) { return false; }

    const isPendingForExecution = () => {
      return  highlightedMultisigTx.status === MultisigTransactionStatus.Approved &&
              !highlightedMultisigTx.executedOn
        ? true
        : false;
    }

    if (isPendingForExecution()) {
      if (!isTreasuryOperation() || (isUserTheProposer() && isTreasuryOperation)) {
        return true;
      } else {
        return false;
      }
    } else {
      return false;
    }

  },[
    highlightedMultisigTx,
    isTreasuryOperation,
    isUserTheProposer,
  ]);

  const canShowCancelButton = useCallback(() => {

    if (!highlightedMultisigTx || !highlightedMultisigTx.proposer || !publicKey) { return false; }

    let result = (
      highlightedMultisigTx.proposer.toBase58() === publicKey.toBase58() &&
      highlightedMultisigTx.status === MultisigTransactionStatus.Voided
    );

    return result;

  },[
    publicKey, 
    highlightedMultisigTx
  ]);

  const getParticipantsThatApprovedTx = useCallback((mtx: MultisigTransaction) => {

    if (!selectedMultisig || !selectedMultisig.owners || selectedMultisig.owners.length === 0) {
      return [];
    }
  
    let addressess: MultisigParticipant[] = [];
    const participants = selectedMultisig.owners as MultisigParticipant[];
    participants.forEach((participant: MultisigParticipant, index: number) => {
      if (mtx.signers[index]) {
        addressess.push(participant);
      }
    });
  
    return addressess;
  
  }, [selectedMultisig]);

  const getTxApproveMainCtaLabel = useCallback(() => {

    const busyLabel = isTxPendingExecution()
      ? 'Executing transaction'
      : isTxPendingApproval()
        ? 'Approving transaction'
        : isTxVoided() 
          ? 'Cancelling Transaction' 
          : '';

    const iddleLabel = isTxPendingExecution()
      ? 'Execute transaction'
      : isTxPendingApproval()
        ? 'Approve transaction'
        : isTxVoided() 
          ? 'Cancel Transaction' 
          : '';

    return isBusy
      ? busyLabel
      : transactionStatus.currentOperation === TransactionStatus.Iddle
        ? iddleLabel
        : transactionStatus.currentOperation === TransactionStatus.TransactionFinished
          ? t('general.cta-finish')
          : t('general.refresh');
  }, [
    isBusy,
    transactionStatus.currentOperation,
    isTxPendingExecution,
    isTxPendingApproval,
    isTxVoided,
    t,
  ]);

  const refreshPage = useCallback(() => {
    window.location.reload();
  },[]);

  // Random component
  const Completionist = () => <span>00:00:00:00</span>;

  // Renderer callback with condition
  const renderer = ({ days, hours, minutes, seconds, completed }: any) => {
    if (completed) {
      // Render a completed state
      return <Completionist />;
    } else {
      // Render a countdown
      const daysSpace = (days < 10) ? '0' : '';
      const hoursSpace = (hours < 10) ? '0' : '';
      const minutesSpace = (minutes < 10) ? '0' : '';
      const secondsSpace = (seconds < 10) ? '0' : '';

      return <span>{`${daysSpace}${days}`}:{`${hoursSpace}${hours}`}:{`${minutesSpace}${minutes}`}:{`${secondsSpace}${seconds}`}</span>;
    }
  };

  const renderGeneralSummaryModal = (
    <>
      {
        highlightedMultisigTx && multisigTransactionSummary && (
        <>
          {/* Title */}
          <Row className="mb-1">
            {multisigTransactionSummary.title && (
              <>
                <Col span={8} className="text-right pr-1">
                  <span className="info-label">{t('multisig.proposal-modal.title-label')}:</span>
                </Col>
                <Col span={16} className="text-left pl-1">
                  <span>{multisigTransactionSummary.title}</span>
                </Col>
              </>
            )}
          </Row>
          {/* Expiry date */}
          <Row className="mb-1">
            <Col span={8} className="text-right pr-1">
              <span className="info-label">{t('multisig.proposal-modal.expires-label')}:</span>
            </Col>
            <Col span={16} className="text-left pl-1">
              {multisigTransactionSummary.expirationDate ? (
                <>
                  {(isTxPendingApproval() || isTxPendingExecution()) ? (
                    <Countdown className="align-middle" date={multisigTransactionSummary.expirationDate} renderer={renderer} />
                  ) : (
                    <span>00:00:00:00</span>
                  )}
                </>
              ) : (
                <span>{t('multisig.proposal-modal.does-not-expire')}</span>
              )}
            </Col>
          </Row>
          {/* Proposer */}
          <Row className="mb-1">
            <Col span={8} className="text-right pr-1">
              <span className="info-label">{t('multisig.multisig-transactions.proposed-by')}</span>
            </Col>
            <Col span={16} className="text-left pl-1">
              <span>{getTxInitiator(highlightedMultisigTx)?.name} ({shortenAddress(multisigTransactionSummary.proposer as string, 4)})</span>
            </Col>
          </Row>
          {/* Submitted on */}
          <Row className="mb-1">
            <Col span={8} className="text-right pr-1">
              <span className="info-label">{t('multisig.multisig-transactions.submitted-on')}</span>
            </Col>
            <Col span={16} className="text-left pl-1">
              <span>{getReadableDate(multisigTransactionSummary.createdOn, true)}</span>
            </Col>
          </Row>
          {/* Status */}
          <Row className="mb-1">
            <Col span={8} className="text-right pr-1">
              <span className="info-label">{t('multisig.multisig-transactions.column-pending-signatures')}:</span>
            </Col>
            <Col span={16} className="text-left pl-1 mb-1 d-flex align-items-start justify-content-start">
              <span>{getTxSignedCount(highlightedMultisigTx)} {t('multisig.multisig-transactions.tx-signed')}, {selectedMultisig.threshold - getTxSignedCount(highlightedMultisigTx)} {t('multisig.multisig-transactions.tx-pending')}</span>
              <MultisigOwnersSigned className="ml-1" participants={getParticipantsThatApprovedTx(highlightedMultisigTx) || []} />
            </Col>
          </Row>
        </>)
      }
      <Row>
        <Col span={24}>
          {isTxPendingExecution() ? (
            <div className="text-center proposal-resume">{t('multisig.multisig-transactions.proposal-ready-to-be-executed')}</div>
          ) : isTxPendingApproval() ? (
            <div className="text-center proposal-resume">{(selectedMultisig.threshold - getTxSignedCount(highlightedMultisigTx)) > 1 ? t('multisig.multisig-transactions.missing-signatures', {missingSignature: selectedMultisig.threshold - getTxSignedCount(highlightedMultisigTx)}) : t('multisig.multisig-transactions.missing-signature', {missingSignature: selectedMultisig.threshold - getTxSignedCount(highlightedMultisigTx)})}</div>
          ) : isTxVoided() ? (
            <div className="text-center proposal-resume">{t('multisig.multisig-transactions.tx-operation-voided')}</div>
          ) : isTxExpired() ? (
            <div className="text-center proposal-resume">{t('multisig.multisig-transactions.tx-operation-expired')}</div>
          ) : (
            <div className="text-center proposal-resume">{t('multisig.multisig-transactions.proposal-completed')}</div>
          )}
        </Col>
      </Row>

      <Divider className="mt-1" />

      <Row className="mb-1">
        <Col span={12} className="text-right pr-1">
          <div className="text-uppercase">{t('multisig.proposal-modal.instruction')}:</div>
        </Col>
        <Col span={12} className="text-left pl-1">
          <div>{getOperationName(highlightedMultisigTx.operation)}</div>
        </Col>
      </Row>

      <div className="well mb-1 proposal-summary-container vertical-scroll">
        <div className="mb-1">
          <span>{t('multisig.proposal-modal.instruction-program')}:</span><br />
          <div>
            <span onClick={() => copyAddressToClipboard(multisigTransactionSummary?.instruction.programId)}  className="info-data simplelink underline-on-hover" style={{cursor: 'pointer'}}>
              {multisigTransactionSummary?.instruction.programId}
            </span>
            <a
              target="_blank"
              rel="noopener noreferrer"
              href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${multisigTransactionSummary?.instruction.programId}${getSolanaExplorerClusterParam()}`}>
              <IconExternalLink className="mean-svg-icons external-icon" />
            </a>
          </div>
        </div>
        {multisigTransactionSummary?.instruction.accounts.map((account: any) => (
          <div className="mb-1">
            <span>{t('multisig.proposal-modal.instruction-account')} {account.index + 1}:</span><br />
            <div>
              <span onClick={() => copyAddressToClipboard(account.value)}  className="info-data simplelink underline-on-hover" style={{cursor: 'pointer'}}>
                {account.value}
              </span>
              <a
                target="_blank"
                rel="noopener noreferrer"
                href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${account.value}${getSolanaExplorerClusterParam()}`}>
                <IconExternalLink className="mean-svg-icons external-icon" />
              </a>
            </div>
          </div>
        ))}
        <div className="mb-1">
          <span>{t('multisig.proposal-modal.instruction-data')}:</span><br />
          {multisigTransactionSummary?.instruction.data.map((data: any) => (
            <span onClick={() => copyAddressToClipboard(data.value)}  className="info-data simplelink underline-on-hover" style={{cursor: 'pointer'}}>
              {data.value}
            </span>
          ))}
        </div>
      </div>
    </>
  );

  return (
    <Modal
      className="mean-modal simple-modal proposal-summary-modal"
      title={<div className="modal-title">{t('multisig.multisig-transactions.modal-title')}</div>}
      maskClosable={false}
      visible={isVisible}
      closable={true}
      onOk={onAcceptModal}
      onCancel={onCloseModal}
      width={isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 400 : 480}
      footer={null}>

      {/* A Cross-fading panel shown when NOT busy */}
      <div className={!isBusy ? "panel1 show" : "panel1 hide"}>

        {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
          <>
            {/* Normal stuff - YOUR USER INPUTS / INFO AND ACTIONS */}
            {isTxPendingExecution() ? (
              <>
                <Divider className="mt-0" />
                {renderGeneralSummaryModal}
              </>
            ) : isTxPendingApproval() ? (
              <>
                <Divider className="mt-0" />
                {renderGeneralSummaryModal}
              </>
            ) : isTxVoided() ? (
              <>
                <Divider className="mt-0" />
                {renderGeneralSummaryModal}
              </>
            ) : (
              <>
                <Divider className="mt-0" />
                {(!isTxVoided() && !isTxRejected()) && (
                  renderGeneralSummaryModal
                )}
              </>
            )}
          </>
        ) : transactionStatus.currentOperation === TransactionStatus.TransactionFinished ? (
          <>
            {/* When succeeded - BEWARE OF THE SUCCESS MESSAGE */}
            <div className="transaction-progress">
              <CheckOutlined style={{ fontSize: 48 }} className="icon mt-0" />
              <h4 className="font-bold">
                {
                  t('multisig.multisig-transactions.tx-operation-success', {
                    operation: getOperationName(highlightedMultisigTx.operation)
                  })
                }
              </h4>
            </div>
            {/* If I am the last approval needed to reach threshold show instructions for exec */}
            {/* {getTxSignedCount(highlightedMultisigTx) === selectedMultisig.threshold - 1 && (
              <>
                <Divider className="mt-0" />
                {renderGeneralSummaryModal}
              </>
            )} */}
          </>
        ) : (
          <>
            <div className="transaction-progress p-0">
              <InfoCircleOutlined style={{ fontSize: 48 }} className="icon mt-2" />
              {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                <>
                  {/* Pre Tx execution failures here */}
                  <h4 className="mb-4">
                    {t('transactions.status.tx-start-failure', {
                      accountBalance: getTokenAmountAndSymbolByTokenAddress(
                        nativeBalance,
                        NATIVE_SOL_MINT.toBase58()
                      ),
                      feeAmount: getTokenAmountAndSymbolByTokenAddress(
                        minRequiredBalance,
                        NATIVE_SOL_MINT.toBase58()
                      )})
                    }
                  </h4>
                </>
              ) : (
                <>
                  {/* All other error conditions then - A getter could offer a basic explanation of what happened */}
                  <h4 className="font-bold mb-1 mt-2">{t('multisig.multisig-transactions.tx-operation-failure', {
                    operation: getOperationName(highlightedMultisigTx.operation)
                  })}</h4>
                  <h4 className="mb-0">
                  {!transactionStatus.customError
                    ? getTransactionOperationDescription(transactionStatus.currentOperation, t)
                    : (
                      <>
                        <span>{transactionStatus.customError.message}</span>
                        <span className="ml-1">[{shortenAddress(transactionStatus.customError.data, 8)}]</span>
                        <div className="icon-button-container">
                          <Button
                            type="default"
                            shape="circle"
                            size="middle"
                            icon={<CopyOutlined />}
                            onClick={() => copyAddressToClipboard(transactionStatus.customError.data)}
                          />
                        </div>
                      </>
                    )}
                  </h4>
                </>
              )}
            </div>
          </>
        )}

      </div>

      {/* A Cross-fading panel shown when busy */}
      <div className={isBusy ? "panel2 show"  : "panel2 hide"}>
        {transactionStatus.currentOperation !== TransactionStatus.Iddle && (
          <div className="transaction-progress p-1">
            <Spin indicator={bigLoadingIcon} className="icon mt-2 mb-4" />
            <h4 className="font-bold mb-1">
              {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
            </h4>
            {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
              <div className="indication">{t('transactions.status.instructions')}</div>
            )}
          </div>
        )}
      </div>

      {/* CTAs shown always - IF DIFFERENT CTAS ARE BEST FOR EACH STAGE, MOVE THEM INSIDE THE PANELS */}
      {!(isBusy && transactionStatus !== TransactionStatus.Iddle) && (
        <>
          <Divider plain />
          <div className="row two-col-ctas transaction-progress p-0 no-margin-right-left">
            <div className={((canShowExecuteButton() || canShowApproveButton() || canShowCancelButton()) && !isError(transactionStatus.currentOperation)) ? "col-6 no-padding-left" : "col-12 no-padding-left no-padding-right"}>
              <Button
                block
                type="text"
                shape="round"
                size="middle"
                className={isBusy ? 'inactive' : ''}
                onClick={() => (isError(transactionStatus.currentOperation) && transactionStatus.currentOperation === TransactionStatus.SignTransactionFailure)
                  ? onAcceptModal()
                  : onCloseModal()}>
                {(isError(transactionStatus.currentOperation)  && transactionStatus.currentOperation === TransactionStatus.SignTransactionFailure)
                  ? t('general.retry')
                  : t('general.cta-close')
                }
              </Button>
            </div>
            {
              ((canShowExecuteButton() || canShowApproveButton() || canShowCancelButton()) && !isError(transactionStatus.currentOperation))
              &&
              (
                <div className="col-6 no-padding-right">
                  <Button
                    className={isBusy ? 'inactive' : ''}
                    block
                    type="primary"
                    shape="round"
                    size="middle"
                    onClick={() => {
                      if (transactionStatus.currentOperation === TransactionStatus.Iddle) {
                        onAcceptModal();
                      } else if (transactionStatus.currentOperation === TransactionStatus.TransactionFinished) {
                        onCloseModal();
                      } else {
                        refreshPage();
                      }
                    }}>
                    {getTxApproveMainCtaLabel()}
                  </Button>
                </div>
              )
            }
          </div>
        </>
      )}
    </Modal>
  );
};