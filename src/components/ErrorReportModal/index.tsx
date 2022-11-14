import { CopyOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { Button, Modal } from "antd";
import { useCallback, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { AppStateContext } from '../../contexts/appstate';
import { copyText, getTransactionOperationDescription } from '../../middleware/ui';
import { shortenAddress } from '../../middleware/utils';
import { openNotification } from '../Notifications';

export const ErrorReportModal = (props: {
  handleClose: any;
  heading?: string;
  isVisible: boolean;
  title: string;
}) => {
  const {
    handleClose,
    heading,
    isVisible,
    title,
  } = props;
  const {
    transactionStatus,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');

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

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{title}</div>}
      footer={null}
      open={isVisible}
      onCancel={handleClose}
      width={360}>
      <div className="transaction-progress p-0 shift-up-1">
        <InfoCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />

        {heading && (
          <h4 className="font-bold mb-1 mt-2">{heading}:</h4>
        )}

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
      </div>
    </Modal>
  );
};
