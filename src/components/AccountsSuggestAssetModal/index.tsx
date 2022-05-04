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

      <div className="mb-2">
        <h3>How to suggest an asset</h3>

        <p>Lorem ipsum dolor sit amet consectetur adipisicing elit. Optio eveniet enim est possimus harum iure, porro maiores totam quia consequatur, <a className="simplelink underline"
          href='https://next.meanfi.com/b/meanfi'
          title="Suggest an Asset"
          target="_blank"
          rel="noopener noreferrer"
          onClick={
            () => handleClose()
          }>click here</a>
        </p>
      </div>

    </Modal>
  );
};
