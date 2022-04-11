import React, { useContext } from 'react';
import { useEffect, useState } from 'react';
import { Modal, Button, Spin } from 'antd';
import { CheckOutlined, ExclamationCircleOutlined, InfoCircleOutlined, LoadingOutlined } from "@ant-design/icons";
import { getTransactionOperationDescription } from '../../utils/ui';
import { useTranslation } from 'react-i18next';
import { TransactionFees, TreasuryInfo } from '@mean-dao/money-streaming/lib/types';
import { isError } from '../../utils/transactions';
import { TransactionStatus } from '../../models/enums';
import { getTokenAmountAndSymbolByTokenAddress } from '../../utils/utils';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { Treasury } from '@mean-dao/msp';
import { AppStateContext } from '../../contexts/appstate';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const TreasuryCloseModal = (props: {
  handleClose: any;
  handleOk: any;
  tokenBalance: number;
  nativeBalance: number;
  content: JSX.Element;
  isVisible: boolean;
  treasuryDetails: TreasuryInfo | Treasury | undefined
  transactionFees: TransactionFees;
  transactionStatus: TransactionStatus | undefined;
  isBusy: boolean;
}) => {
  const { t } = useTranslation('common');
  const {
    transactionStatus
  } = useContext(AppStateContext);
  // const { publicKey } = useWallet();
  const [feeAmount, setFeeAmount] = useState<number | null>(null);

  // const isUserTreasurer = (): boolean => {
  //   if (publicKey && props.treasuryDetails) {
  //     const me = publicKey.toBase58();
  //     const treasurer = props.treasuryDetails.treasurerAddress as string;
  //     return treasurer === me ? true : false;
  //   }
  //   return false;
  // }

  const onAcceptModal = () => {
    props.handleOk();
  }

  const onCloseModal = () => {
    props.handleClose();
  }

  // Preset fee amount
  useEffect(() => {
    if (!feeAmount && props.transactionFees) {
      setFeeAmount(props.transactionFees.mspFlatFee);
    }
  }, [
    feeAmount,
    props.transactionFees
  ]);

  // const isError = (): boolean => {
  //   return  props.transactionStatus === TransactionStatus.TransactionStartFailure ||
  //           props.transactionStatus === TransactionStatus.InitTransactionFailure ||
  //           props.transactionStatus === TransactionStatus.SignTransactionFailure ||
  //           props.transactionStatus === TransactionStatus.SendTransactionFailure
  //           ? true
  //           : false;
  // }

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">Close treasury</div>}
      maskClosable={false}
      footer={null}
      visible={props.isVisible}
      onOk={props.handleOk}
      onCancel={props.handleClose}
      width={props.isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}>

      <div className={!props.isBusy ? "panel1 show" : "panel1 hide"}>
        {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
          <>
            <div className="mb-3 text-center">
              <ExclamationCircleOutlined style={{ fontSize: 48 }} className="icon mt-0 mb-3" />
              <h4 className="mb-4">{props.content}</h4>
            </div>
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
            <div className="transaction-progress p-0">
              <InfoCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
              {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                <h4 className="mb-4">
                  {t('transactions.status.tx-start-failure', {
                    accountBalance: getTokenAmountAndSymbolByTokenAddress(
                      props.nativeBalance,
                      NATIVE_SOL_MINT.toBase58()
                    ),
                    feeAmount: getTokenAmountAndSymbolByTokenAddress(
                      props.transactionFees.blockchainFee + props.transactionFees.mspFlatFee,
                      NATIVE_SOL_MINT.toBase58()
                    )})
                  }
                </h4>
              ) : (
                <h4 className="font-bold mb-3">
                  {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
                </h4>
              )}
            </div>
          </>
        )}
      </div>

      <div className={props.isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle ? "panel2 show" : "panel2 hide"}>
        {props.isBusy && transactionStatus !== TransactionStatus.Iddle && (
        <div className="transaction-progress">
          <Spin indicator={bigLoadingIcon} className="icon mt-0" />
          <h4 className="font-bold mb-1">
            {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
          </h4>
          {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
            <div className="indication">{t('transactions.status.instructions')}</div>
          )}
        </div>
        )}
      </div>

      {/**
       * NOTE: CTAs block may be required or not when Tx status is Finished!
       * I choose to set transactionStatus.currentOperation to TransactionStatus.TransactionFinished
       * and auto-close the modal after 1s. If we chose to NOT auto-close the modal
       * Uncommenting the commented lines below will do it!
       */}
        {!(props.isBusy && transactionStatus !== TransactionStatus.Iddle) && (
          <div className="row two-col-ctas mt-3 transaction-progress p-0">
            <div className={!isError(transactionStatus.currentOperation) ?  "col-6" : "col-12"}>
              <Button
                block
                type="text"
                shape="round"
                size="middle"
                className={props.isBusy ? 'inactive' : ''}
                onClick={() => isError(transactionStatus.currentOperation)
                  ? transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure
                    ? onCloseModal()
                    : onAcceptModal()
                  : onCloseModal()}>
                {isError(transactionStatus.currentOperation)
                  ? transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure
                    ? t('general.cta-close')
                    : t('general.retry')
                  : t('general.cta-close')
                }
              </Button>
            </div>
            {!isError(transactionStatus.currentOperation) && (
              <div className="col-6">
                <Button
                  className={props.isBusy ? 'inactive' : ''}
                  block
                  type="primary"
                  shape="round"
                  onClick={props.handleOk}>
                  {props.isBusy && (
                    <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
                  )}
                  {props.isBusy
                    ? 'Closing treasury'
                    : isError(transactionStatus.currentOperation)
                      ? 'Retry'
                      : 'Close treasury'
                  }
                </Button>
              </div>
            )}
          </div>
        )}
    </Modal>
  );
};
