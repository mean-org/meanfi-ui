import { Button, Modal } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface StreamOpenModalProps {
  handleClose: () => void;
  handleOk: (streamId: string) => void;
  isVisible: boolean;
}

export const StreamOpenModal = ({ handleClose, handleOk, isVisible }: StreamOpenModalProps) => {
  const [streamId, setStreamId] = useState('');
  const { t } = useTranslation('common');

  const handleSreamIdChange = (value: string) => {
    setStreamId(value);
  };

  const onAcceptStreamId = () => {
    handleOk(streamId);
    setTimeout(() => {
      setStreamId('');
    }, 50);
  };

  return (
    <Modal
      className='mean-modal'
      title={<div className='modal-title'>{t('open-stream.modal-title')}</div>}
      footer={null}
      open={isVisible}
      onOk={onAcceptStreamId}
      onCancel={handleClose}
      width={480}
    >
      <div className='transaction-field'>
        <div className='transaction-field-row'>
          <span className='field-label-left'>{t('open-stream.label-streamid-input')}</span>
          <span className='field-label-right'>&nbsp;</span>
        </div>
        <div className='transaction-field-row main-row'>
          <span className='input-left'>
            <input
              id='stream-id-input'
              className='w-100 general-text-input'
              autoComplete='on'
              autoCorrect='off'
              type='text'
              onChange={e => handleSreamIdChange(e.target.value)}
              placeholder={t('open-stream.streamid-placeholder')}
              required={true}
              minLength={1}
              maxLength={79}
              spellCheck='false'
              value={streamId}
            />
          </span>
        </div>
      </div>
      <Button
        className='main-cta center-text-in-btn'
        block
        type='primary'
        shape='round'
        size='large'
        disabled={!streamId}
        onClick={onAcceptStreamId}
      >
        {!streamId ? t('open-stream.streamid-empty') : t('open-stream.streamid-open-cta')}
      </Button>
    </Modal>
  );
};
