import { CheckOutlined, ExclamationCircleOutlined, InfoCircleOutlined, LoadingOutlined } from "@ant-design/icons";
import { Button, Col, Modal, Row, Spin } from "antd";
import { useCallback, useContext } from "react";
import { useTranslation } from "react-i18next";
import { AppStateContext } from "../../contexts/appstate";
import { TransactionStatus } from "../../models/enums";
import { isError } from "../../utils/transactions";
import { getTransactionOperationDescription } from "../../utils/ui";
import "./style.scss";

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const RejectCancelModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  isBusy: boolean;
}) => {
  const { t } = useTranslation('common');
  const {
    transactionStatus,
  } = useContext(AppStateContext);

  const {
    handleOk,
    handleClose,
    isVisible,
    isBusy
  } = props;

  const onAcceptModal = () => {
    handleOk();
  }

  const onCloseModal = () => {
    handleClose();
  }

  return (
    <Modal
      className="mean-modal simple-modal reject-cancel-modal"
      title={<div className="modal-title">Cancel proposal</div>}
      maskClosable={false}
      footer={null}
      visible={isVisible}
      onOk={handleOk}
      onCancel={handleClose}
      width={380}>

      <div className={!props.isBusy ? "panel1 show" : "panel1 hide"}>
        {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
          <>
            <div className="mb-3 text-center">
              <ExclamationCircleOutlined style={{ fontSize: 48 }} className="icon mt-3 mb-3" />
              <div>This proposal will be removed from the Multisig list of proposals. If you wish to re-submit the same proposal then you will need to start over again. Confirm you wish to cancel.</div>
            </div>

            <Row className="mt-3 mb-1">
              <Col span={12} className="d-flex justify-content-center">
                <Button
                  type="ghost"
                  size="middle"
                  className="thin-stroke col-6"
                  onClick={onCloseModal}
                >
                  Cancel
                </Button>
              </Col>
              <Col span={12} className="d-flex justify-content-center">
                <Button
                  type="primary"
                  shape="round"
                  size="middle"
                  className="col-6"
                  onClick={onAcceptModal}
                >
                  Confirm
                </Button>
              </Col>
            </Row>
          </>
        ) : transactionStatus.currentOperation === TransactionStatus.TransactionFinished ? (
          <>
            <div className="transaction-progress">
              <CheckOutlined style={{ fontSize: 48 }} className="icon mt-0" />
              <h4 className="font-bold">{t('treasuries.create-treasury.success-message')}</h4>
            </div>
          </>
        ) : (
          <>
            <div className="transaction-progress p-2">
              <InfoCircleOutlined style={{ fontSize: 48 }} className="icon mt-1" />
              {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                <h4 className="mb-4">
                  {/* {t('transactions.status.tx-start-failure', {
                    accountBalance: getTokenAmountAndSymbolByTokenAddress(
                      props.nativeBalance,
                      NATIVE_SOL_MINT.toBase58()
                    ),
                    feeAmount: getTokenAmountAndSymbolByTokenAddress(
                      props.transactionFees.blockchainFee + props.transactionFees.mspFlatFee,
                      NATIVE_SOL_MINT.toBase58()
                    )})
                  } */}
                </h4>
              ) : (
                <h4 className="font-bold mb-3">
                  {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
                </h4>
              )}
              {!(isBusy && transactionStatus !== TransactionStatus.Iddle) && (
                <div className="row two-col-ctas mt-3 transaction-progress p-2">
                  <div className="col-12">
                    <Button
                      block
                      type="text"
                      shape="round"
                      size="middle"
                      className={isBusy ? 'inactive' : ''}
                      onClick={() => (isError(transactionStatus.currentOperation) && transactionStatus.currentOperation !== TransactionStatus.TransactionStartFailure)
                        ? onAcceptModal()
                        : onCloseModal()}>
                      {(isError(transactionStatus.currentOperation) && transactionStatus.currentOperation !== TransactionStatus.TransactionStartFailure)
                        ? t('general.retry')
                        : t('general.cta-close')
                      }
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div 
        className={isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle ? "panel2 show" : "panel2 hide"}>
        {isBusy && transactionStatus !== TransactionStatus.Iddle && (
        <div className="transaction-progress p-4 mb-2">
          <Spin indicator={bigLoadingIcon} className="icon mb-4 mt-1" />
          <h4 className="font-bold">
            {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
          </h4>
          {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
            <div className="indication">{t('transactions.status.instructions')}</div>
          )}
        </div>
        )}
      </div>
    </Modal>
  );
};