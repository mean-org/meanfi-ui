import React, { useContext, useState } from 'react';
import { Modal, Button, Spin, Dropdown, Menu } from 'antd';
import { useTranslation } from 'react-i18next';
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { AppStateContext } from '../../contexts/appstate';
import { TransactionStatus } from '../../models/enums';
import { getTransactionOperationDescription } from '../../utils/ui';
import { isError } from '../../utils/transactions';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { TransactionFees } from '@mean-dao/money-streaming';
import { getTokenAmountAndSymbolByTokenAddress } from '../../utils/utils';
import { IconCaretDown } from '../../Icons';
import { CreateMintPayload } from '../../models/multisig';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const MultisigCreateMintModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  isBusy: boolean;
  nativeBalance: number;
  transactionFees: TransactionFees;
}) => {
  const { t } = useTranslation('common');
  const {
    transactionStatus,
  } = useContext(AppStateContext);
  const [decimals, setDecimals] = useState<number | null>(6);

  const onAcceptModal = () => {
    props.handleOk({
      decimals: decimals,
    } as CreateMintPayload);
  }

  const onCloseModal = () => {
    props.handleClose();
  }

  const refreshPage = () => {
    props.handleClose();
    window.location.reload();
  }

  const isValidForm = () => {
    return decimals &&
           decimals > 4 &&
           decimals <= 12
      ? true
      : false;
  }

  const getMainCtaButtonLabel = () => {
    return !decimals
      ? 'Decimals is required'
      : t('multisig.multisig-mints.cta-create-mint');
  }

  const decimalOptionsMenu = (
    <Menu activeKey={`decimals-${decimals}`}>
      {[...Array(8)].map((item, index) => {
        const itemValue = index + 5;
        return (
          <Menu.Item
            key={`decimals-${itemValue}`}
            onClick={() => setDecimals(itemValue)}>
            {itemValue}
          </Menu.Item>
        );
      })}
    </Menu>
  );

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{t('multisig.multisig-mints.create-mint-modal-title')}</div>}
      maskClosable={false}
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptModal}
      onCancel={onCloseModal}
      width={400}>

      <div className={!props.isBusy ? "panel1 show" : "panel1 hide"}>

        {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
          <>
            {/* Mint amount */}
            <div className="form-label">{t('multisig.multisig-mints.mint-amount-label')}</div>
            <div className="well">
              <Dropdown overlay={decimalOptionsMenu} trigger={["click"]}>
                <span className="dropdown-trigger no-decoration flex-fixed-right align-items-center">
                  <div className="left">
                    <span className="capitalize-first-letter">{decimals}{" "}</span>
                  </div>
                  <div className="right">
                    <IconCaretDown className="mean-svg-icons" />
                  </div>
                </span>
              </Dropdown>
            </div>
          </>
        ) : transactionStatus.currentOperation === TransactionStatus.TransactionFinished ? (
          <>
            <div className="transaction-progress">
              <CheckOutlined style={{ fontSize: 48 }} className="icon mt-0" />
              <h4 className="font-bold">{t('multisig.multisig-mints.success-message')}</h4>
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

      <div 
        className={
          props.isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle 
            ? "panel2 show" 
            : "panel2 hide"
          }>          
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

      {!(props.isBusy && transactionStatus !== TransactionStatus.Iddle) && (
        <div className="row two-col-ctas mt-3 transaction-progress p-0">
          <div className={!isError(transactionStatus.currentOperation) ? "col-6" : "col-12"}>
            <Button
              block
              type="text"
              shape="round"
              size="middle"
              className={props.isBusy ? 'inactive' : ''}
              onClick={() => isError(transactionStatus.currentOperation)
                ? onAcceptModal()
                : onCloseModal()}>
              {isError(transactionStatus.currentOperation)
                ? t('general.retry')
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
                size="middle"
                disabled={!isValidForm()}
                onClick={() => {
                  if (transactionStatus.currentOperation === TransactionStatus.Iddle) {
                    onAcceptModal();
                  } else if (transactionStatus.currentOperation === TransactionStatus.TransactionFinished) {
                    onCloseModal();
                  } else {
                    refreshPage();
                  }
                }}>
                {props.isBusy
                  ? t('multisig.multisig-mints.cta-create-mint-busy')
                  : transactionStatus.currentOperation === TransactionStatus.Iddle
                    ? getMainCtaButtonLabel()
                    : transactionStatus.currentOperation === TransactionStatus.TransactionFinished
                      ? t('general.cta-finish')
                      : t('general.refresh')
                }
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
