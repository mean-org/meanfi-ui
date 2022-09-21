import React from 'react';
import { Modal } from "antd";
import { AccountSelector } from '../AccountSelector';

export const AccountSelectorModal = (props: {
  isVisible: boolean;
}) => {
  const {
    isVisible,
  } = props;

  return (
    <Modal
      centered
      className="mean-modal simple-modal unpadded-content"
      title={<div className="modal-title">Select account</div>}
      footer={null}
      open={isVisible}
      maskClosable={false}
      closable={false}
      width={450}>
      <div className="account-selector-modal-content vertical-scroll">
        <AccountSelector />
      </div>
    </Modal>
  );
};
