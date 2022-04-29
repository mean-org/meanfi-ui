import './style.scss';
import { Col, Divider, Row } from 'antd';
import { useTranslation } from 'react-i18next';

export const StepThree = (props: {

}) => {
  const { t } = useTranslation('common');

  return (
    <>
      {/* Title */}
      <Row className="mb-1">
        {/* {multisigTransactionSummary.title && ( */}
          <>
            <Col span={8} className="text-right pr-1">
              <span className="info-label">{t('multisig.proposal-modal.title-label')}:</span>
            </Col>
            <Col span={16} className="text-left pl-1">
              <span>My awesome proposal</span>
            </Col>
          </>
        {/* )} */}
      </Row>

      {/* Expiry date */}
      {/* {!highlightedMultisigTx.executedOn && ( */}
        <Row className="mb-1">
          <Col span={8} className="text-right pr-1">
            <span className="info-label">{t('multisig.proposal-modal.expires-label')}:</span>
          </Col>
          <Col span={16} className="text-left pl-1">
            {/* {multisigTransactionSummary.expirationDate ? (
              <>
                {(isTxPendingApproval() || isTxPendingExecution()) ? (
                  <Countdown className="align-middle" date={multisigTransactionSummary.expirationDate} renderer={renderer} />
                ) : (
                  <span>Expired on {new Date(multisigTransactionSummary.expirationDate).toDateString()}</span>
                )}
              </>
            ) : (
              <span>{t('multisig.proposal-modal.does-not-expire')}</span>
            )} */}
            <span>Expired on 01:01:55:01</span>
          </Col>
        </Row>
      {/* )} */}

      {/* Proposer */}
      <Row className="mb-1">
        <Col span={8} className="text-right pr-1">
          <span className="info-label">{t('multisig.multisig-transactions.proposed-by')}</span>
        </Col>
        <Col span={16} className="text-left pl-1">
          {/* <span>{getTxInitiator(highlightedMultisigTx)?.name} ({shortenAddress(multisigTransactionSummary.proposer as string, 4)})</span> */}
          <span>Yansel (HvPJ1...1BUDa)</span>
        </Col>
      </Row>

      {/* Submitted on */}
      <Row className="mb-1">
        <Col span={8} className="text-right pr-1">
          <span className="info-label">{t('multisig.multisig-transactions.submitted-on')}</span>
        </Col>
        <Col span={16} className="text-left pl-1">
          {/* <span>{getReadableDate(multisigTransactionSummary.createdOn, true)}</span> */}
          <span>April 25th, 11:23am EST</span>
        </Col>
      </Row>

      {/* Status */}
      <Row className="mb-1">
        <Col span={8} className="text-right pr-1">
          <span className="info-label">{t('multisig.multisig-transactions.column-pending-signatures')}:</span>
        </Col>
        <Col span={16} className="text-left pl-1 mb-1 d-flex align-items-start justify-content-start">
          {/* <span>{getTxSignedCount(highlightedMultisigTx)} {t('multisig.multisig-transactions.tx-signed')}, {selectedMultisig.threshold - getTxSignedCount(highlightedMultisigTx)} {t('multisig.multisig-transactions.tx-pending')}</span>
          <MultisigOwnersSigned className="ml-1" participants={getParticipantsThatApprovedTx(highlightedMultisigTx) || []} /> */}
          <span>2 signed, 3 pending</span>
        </Col>
      </Row>

      <Row>
        <Col span={24}>
          {/* {isTxPendingExecution() ? (
            <div className="text-center proposal-resume">{t('multisig.multisig-transactions.proposal-ready-to-be-executed')}</div>
          ) : isTxPendingApproval() ? (
            <div className="text-center proposal-resume">{(selectedMultisig.threshold - getTxSignedCount(highlightedMultisigTx)) > 1 ? t('multisig.multisig-transactions.missing-signatures', {missingSignature: selectedMultisig.threshold - getTxSignedCount(highlightedMultisigTx)}) : t('multisig.multisig-transactions.missing-signature', {missingSignature: selectedMultisig.threshold - getTxSignedCount(highlightedMultisigTx)})}</div>
          ) : isTxVoided() ? (
            <div className="text-center proposal-resume">{t('multisig.multisig-transactions.tx-operation-voided')}</div>
          ) : isTxExpired() ? (
            <div className="text-center proposal-resume">{t('multisig.multisig-transactions.tx-operation-expired')}</div>
          ) : (
            <div className="text-center proposal-resume">{t('multisig.multisig-transactions.proposal-completed')}</div>
          )} */}
          <div className="text-center proposal-resume">To execute this proposal, 1 more signature is needed.</div>
        </Col>
      </Row>

      <Divider className="mt-1" />

      <Row className="mb-1">
        <Col span={12} className="text-right pr-1">
          <div className="text-uppercase">{t('multisig.proposal-modal.instruction')}:</div>
        </Col>
        <Col span={12} className="text-left pl-1">
          {/* <div>{getOperationName(highlightedMultisigTx.operation)}</div> */}
          <div>Create Money Stream</div>
        </Col>
      </Row>

      <div className="well mb-1 proposal-summary-container vertical-scroll">
      </div>
    </>
  )
}