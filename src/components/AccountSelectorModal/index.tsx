import React from 'react';
import { Button, Modal, Tooltip } from 'antd';
import { AccountSelector } from '../AccountSelector';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { isInXnftWallet } from 'integrations/xnft/xnft-wallet-adapter';

export const AccountSelectorModal = (props: {
  isFullWorkflowEnabled?: boolean;
  isVisible: boolean;
  onAccountSelected?: any;
  onCreateSafe: any;
  onGotoSelectWallet?: any;
  onHandleClose?: any;
}) => {
  const {
    isFullWorkflowEnabled,
    isVisible,
    onAccountSelected,
    onCreateSafe,
    onGotoSelectWallet,
    onHandleClose,
  } = props;

  return (
    <Modal
      centered
      className="mean-modal simple-modal unpadded-content multi-step"
      title={
        <>
          {!isInXnftWallet() && isFullWorkflowEnabled && (
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
      width={450}
    >
      <div className="account-selector-modal-content vertical-scroll">
        <AccountSelector
          onAccountSelected={onAccountSelected}
          onCreateSafeClick={onCreateSafe}
          isFullWorkflowEnabled={isFullWorkflowEnabled}
        />
      </div>
    </Modal>
  );
};
