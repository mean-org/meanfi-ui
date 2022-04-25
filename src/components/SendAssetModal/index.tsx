import React from 'react';
import { Modal } from "antd";
import { useTranslation } from "react-i18next";

export const SendAssetModal = (props: {
  handleClose: any;
  isVisible: boolean;
  tokenSymbol: string;
}) => {
  const { t } = useTranslation("common");
  const { tokenSymbol, isVisible, handleClose } = props;

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">Send {tokenSymbol || 'Funds'}</div>}
      footer={null}
      visible={isVisible}
      onOk={handleClose}
      onCancel={handleClose}
      width={360}>
        <div>Here!</div>
    </Modal>
  );
};
