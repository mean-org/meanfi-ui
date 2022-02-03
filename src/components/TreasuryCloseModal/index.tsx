import React from 'react';
import { useEffect, useState } from 'react';
import { Modal, Button } from 'antd';
import { ExclamationCircleOutlined, LoadingOutlined } from "@ant-design/icons";
import { getTransactionOperationDescription } from '../../utils/ui';
import { useTranslation } from 'react-i18next';
import { TransactionFees, TreasuryInfo } from '@mean-dao/money-streaming/lib/types';
import { TransactionStatus } from '../../models/enums';
import { getTokenAmountAndSymbolByTokenAddress } from '../../utils/utils';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { Treasury } from '@mean-dao/msp';

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

  // Preset fee amount
  useEffect(() => {
    if (!feeAmount && props.transactionFees) {
      setFeeAmount(props.transactionFees.mspFlatFee);
    }
  }, [
    feeAmount,
    props.transactionFees
  ]);

  const isError = (): boolean => {
    return  props.transactionStatus === TransactionStatus.TransactionStartFailure ||
            props.transactionStatus === TransactionStatus.InitTransactionFailure ||
            props.transactionStatus === TransactionStatus.SignTransactionFailure ||
            props.transactionStatus === TransactionStatus.SendTransactionFailure
            ? true
            : false;
  }

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">Close treasury</div>}
      footer={null}
      visible={props.isVisible}
      onOk={props.handleOk}
      onCancel={props.handleClose}
      width={360}>
      <div className="transaction-progress">
        <ExclamationCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
        {isError() ? (
          <>
            {props.transactionStatus === TransactionStatus.TransactionStartFailure ? (
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
              <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(props.transactionStatus)}</h4>
            )}
          </>
        ) : (
          <>
            <h4>{props.content}</h4>
          </>
        )}
        <div className="mt-3">
          <Button
              className="mr-3"
              type="text"
              shape="round"
              onClick={props.handleClose}>
              Cancel
          </Button>
          <Button
            className={props.isBusy ? 'inactive' : ''}
            type="primary"
            shape="round"
            onClick={props.handleOk}>
            {props.isBusy && (
              <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
            )}
            {props.isBusy
              ? 'Closing treasury'
              : isError()
                ? 'Retry'
                : 'Close treasury'
            }
          </Button>
        </div>
      </div>

    </Modal>
  );
};
