import React from 'react';
import { Modal } from "antd";
import { IconLightBulb } from '../../Icons';

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
      title={
        <div className="flex-row flex-center">
          <IconLightBulb className="mean-svg-icons mr-1" style={{ width: "20", height: "20" }} />
          <div className="modal-title">Suggest an Asset</div>
        </div>
      }
      footer={null}
      visible={isVisible}
      onOk={handleOk}
      onCancel={handleClose}
      width={320}>

      <div className="mb-2 shift-up-1 text-center">
        <p>Now you have the opportunity to suggest new Assets to be added to the MeanFi repertoire. As part of your suggestion include a brief description of the Asset, why is it important and the Asset address.</p>
        <p><a className="simplelink underline"
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
