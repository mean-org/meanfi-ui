import React, { useCallback, useContext, useEffect } from 'react';
import { Modal, Button, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import {
  CopyOutlined,
  InfoCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { AppStateContext } from '../../contexts/appstate';
import { TransactionStatus } from '../../models/enums';
import {
  consoleOut,
  copyText,
  getTransactionOperationDescription,
} from '../../middleware/ui';
import { isError } from '../../middleware/transactions';
import { shortenAddress } from '../../middleware/utils';
import { openNotification } from '../Notifications';
import { MultisigTransaction } from '@mean-dao/mean-multisig-sdk';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const MultisigTxResultModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  isBusy: boolean;
  highlightedMultisigTx: MultisigTransaction | undefined;
}) => {
  const { t } = useTranslation('common');
  const { transactionStatus } = useContext(AppStateContext);
  const { isBusy, isVisible, handleClose, handleOk, highlightedMultisigTx } =
    props;

  useEffect(() => {
    if (isVisible) {
      consoleOut('highlightedMultisigTx:', highlightedMultisigTx, 'blue');
    }
  }, [highlightedMultisigTx, isVisible]);

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

  const refreshPage = () => {
    handleClose();
    window.location.reload();
  };

  return (
    <>
      <Modal
        className="mean-modal simple-modal"
        title={
          <div className="modal-title">
            {t('multisig.multisig-transactions.modal-title')}
          </div>
        }
        maskClosable={false}
        open={isVisible}
        closable={true}
        onOk={() => handleOk(highlightedMultisigTx)}
        onCancel={handleClose}
        width={400}
        footer={null}
      >
        <div className={!isBusy ? 'panel1 show' : 'panel1 hide'}>
          <div className="transaction-progress p-0">
            <InfoCircleOutlined
              style={{ fontSize: 48 }}
              className="icon mt-0"
            />
            <h4 className="mb-0">
              {!transactionStatus.customError ? (
                getTransactionOperationDescription(
                  transactionStatus.currentOperation,
                  t,
                )
              ) : (
                <>
                  <span>{transactionStatus.customError.message}</span>
                  {transactionStatus.customError.data && (
                    <>
                      <span className="ml-1">
                        [{shortenAddress(transactionStatus.customError.data, 8)}
                        ]
                      </span>
                      <div className="icon-button-container">
                        <Button
                          type="default"
                          shape="circle"
                          size="middle"
                          icon={<CopyOutlined />}
                          onClick={() =>
                            copyAddressToClipboard(
                              transactionStatus.customError.data,
                            )
                          }
                        />
                      </div>
                    </>
                  )}
                </>
              )}
            </h4>
          </div>
        </div>

        {/* A Cross-fading panel shown when busy */}
        <div className={isBusy ? 'panel2 show' : 'panel2 hide'}>
          {transactionStatus.currentOperation !== TransactionStatus.Iddle && (
            <div className="transaction-progress p-1">
              <Spin indicator={bigLoadingIcon} className="icon mt-2 mb-4" />
              <h4 className="font-bold mb-1">
                {getTransactionOperationDescription(
                  transactionStatus.currentOperation,
                  t,
                )}
              </h4>
              {transactionStatus.currentOperation ===
                TransactionStatus.SignTransaction && (
                <div className="indication">
                  {t('transactions.status.instructions')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* {!(isBusy && transactionStatus !== TransactionStatus.Iddle) && (
          <div className="row two-col-ctas mt-3 transaction-progress p-0">
            {isError(transactionStatus.currentOperation) ? (
              <div className="col-12">
                <Button
                  block
                  type="text"
                  shape="round"
                  size="middle"
                  className={isBusy ? 'inactive' : ''}
                  onClick={handleOk}>
                  {t('general.retry')}
                </Button>
              </div>
            ) : (
              <div className="col-12">
                <Button
                  className={isBusy ? 'inactive' : ''}
                  block
                  type="primary"
                  shape="round"
                  size="middle"
                  onClick={() => refreshPage()}>
                  {t('general.refresh')}
                </Button>
              </div>
            )}
          </div>
        )} */}
      </Modal>
    </>
  );
};
