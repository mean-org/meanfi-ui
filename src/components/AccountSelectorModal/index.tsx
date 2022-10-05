import React from 'react';
import { Button, Modal, Tooltip } from "antd";
import { AccountSelector } from '../AccountSelector';
import { ArrowLeftOutlined } from '@ant-design/icons';

export const AccountSelectorModal = (props: {
  isFullWorkflowEnabled?: boolean;
  isVisible: boolean;
  onAccountSelected?: any;
  onGotoSelectWallet?: any;
  onHandleClose?: any;
}) => {
  const {
    isFullWorkflowEnabled,
    isVisible,
    onAccountSelected,
    onGotoSelectWallet,
    onHandleClose
  } = props;

  return (
    <Modal
      centered
      className="mean-modal simple-modal unpadded-content multi-step"
      title={
        <>
          {isFullWorkflowEnabled && (
            <div className="back-button ant-modal-close">
              <Tooltip placement="bottom" title="Back to wallet selection">
                <Button
                  type="default"
                  shape="circle"
                  icon={<ArrowLeftOutlined />}
                  onClick={onGotoSelectWallet}
                />
              </Tooltip>
            </div>
          )}
          <div className="modal-title">Select account</div>
        </>
      }
      footer={null}
      open={isVisible}
      maskClosable={isFullWorkflowEnabled ? false : true}
      closable={isFullWorkflowEnabled ? false : true}
      onCancel={onHandleClose}
      width={450}>
      <div className="account-selector-modal-content vertical-scroll">
        <AccountSelector onAccountSelected={onAccountSelected} isFullWorkflowEnabled={isFullWorkflowEnabled} />
      </div>
    </Modal>
  );
};
