import React from 'react';
import { Modal } from "antd";
import { InfoCircleOutlined } from '@ant-design/icons';

export const ModalTemplate = (props: {
  content?: JSX.Element;
  handleClose: any;
  heading?: string;
  isVisible: boolean;
  title: string;
}) => {
  const {
    content,
    handleClose,
    heading,
    isVisible,
    title,
  } = props;

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{title}</div>}
      footer={null}
      visible={isVisible}
      onCancel={handleClose}
      width={360}>
      <div className="transaction-progress p-0 shift-up-1">
        <InfoCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />

        {heading && (
          <h4 className="mb-0">{heading}:</h4>
        )}

        {content && (
          <div>{content}</div>
        )}

      </div>
    </Modal>
  );
};
