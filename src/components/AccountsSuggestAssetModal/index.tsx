import React from 'react';
import { Modal } from "antd";

export const AccountsSuggestAssetModal = (props: {
  handleOk: any;
  handleClose: any;
  isVisible: boolean;
}) => {
  const { isVisible, handleClose, handleOk } = props;

  // Callback methods

  // Effects

  // Events and actions

  // Rendering

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">Suggest an Asset</div>}
      footer={null}
      visible={isVisible}
      onOk={handleOk}
      onCancel={handleClose}
      width={320}>

      <div className="mb-2 shift-up-1">
        <p>Now you have the opportunity to suggest new Assets to be added to the MeanFi repertoire. As part of your suggestion include a brief description of the Asset, why is it important and the Asset address.</p>
        <p className="text-center"><a className="simplelink underline"
          href='https://next.meanfi.com/b/meanfi'
          title="Suggest an Asset"
          target="_blank"
          rel="noopener noreferrer"
          onClick={
            () => handleClose()
          }>Click on this link</a>
        </p>
      </div>

    </Modal>
  );
};
