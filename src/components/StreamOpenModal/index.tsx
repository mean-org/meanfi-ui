import React from 'react';
import { useState } from 'react';
import { Modal, Button } from 'antd';
import { useTranslation } from 'react-i18next';

export const StreamOpenModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
}) => {
  const [streamId, setStreamId] = useState('');
  const { t } = useTranslation('common');

  const handleSreamIdChange = (e: any) => {
    setStreamId(e.target.value);
  }

  const onAcceptStreamId = () => {
    props.handleOk(streamId);
    setTimeout(() => {
      setStreamId('');
    }, 50);
  }

  return (
    <Modal
      className="mean-modal"
      title={<div className="modal-title">{t('open-stream.modal-title')}</div>}
      footer={null}
      open={props.isVisible}
      onOk={onAcceptStreamId}
      onCancel={props.handleClose}
      width={480}>
      <div className="transaction-field">
        <div className="transaction-field-row">
          <span className="field-label-left">{t('open-stream.label-streamid-input')}</span>
          <span className="field-label-right">&nbsp;</span>
        </div>
        <div className="transaction-field-row main-row">
          <span className="input-left">
          <input
            id="stream-id-input"
            className="w-100 general-text-input"
            autoComplete="on"
            autoCorrect="off"
            type="text"
            onChange={handleSreamIdChange}
            placeholder={t('open-stream.streamid-placeholder')}
            required={true}
            minLength={1}
            maxLength={79}
            spellCheck="false"
            value={streamId} />
          </span>
        </div>
      </div>
      <Button
        className="main-cta center-text-in-btn"
        block
        type="primary"
        shape="round"
        size="large"
        disabled={!streamId}
        onClick={onAcceptStreamId}>
        {!streamId ? t('open-stream.streamid-empty') : t('open-stream.streamid-open-cta')}
      </Button>
    </Modal>
  );
};
