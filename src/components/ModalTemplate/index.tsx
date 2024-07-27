import { InfoCircleOutlined } from '@ant-design/icons';
import { Modal } from 'antd';
import type { ReactNode } from 'react';

interface ModalTemplateProps {
  centered?: boolean;
  content?: ReactNode;
  handleClose: () => void;
  heading?: string;
  isVisible: boolean;
  title: string;
}

export const ModalTemplate = ({ centered, content, handleClose, heading, isVisible, title }: ModalTemplateProps) => {
  return (
    <Modal
      className='mean-modal simple-modal'
      title={<div className='modal-title'>{title}</div>}
      centered={centered}
      footer={null}
      open={isVisible}
      onCancel={handleClose}
      width={360}
    >
      <div className='transaction-progress p-0 shift-up-1'>
        <InfoCircleOutlined style={{ fontSize: 48 }} className='icon mt-0' />

        {heading && <h4 className='mb-0'>{heading}:</h4>}

        {content && <div>{content}</div>}
      </div>
    </Modal>
  );
};
