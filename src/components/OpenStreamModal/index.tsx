import { useState } from 'react';
import { Modal, Button } from 'antd';

export const OpenStreamModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
}) => {
  const [streamId, setStreamId] = useState('');

  const handleSreamIdChange = (e: any) => {
    setStreamId(e.target.value);
  }

  const onAcceptStreamId = () => {
    props.handleOk(streamId);
    setTimeout(() => {
      setStreamId('');
    }, 100);
  }

  return (
    <Modal
      className="mean-modal"
      title={<div className="modal-title">Open money stream</div>}
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptStreamId}
      onCancel={props.handleClose}
      width={480}>
      <div className="transaction-field">
        <div className="transaction-field-row">
          <span className="field-label-left">Stream id to open</span>
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
            placeholder="Stream ID created by Mean Finance"
            required={true}
            minLength={1}
            maxLength={79}
            spellCheck="false"
            value={streamId} />
          </span>
        </div>
      </div>
      <Button
        className="main-cta"
        block
        type="primary"
        shape="round"
        size="large"
        disabled={!streamId}
        onClick={onAcceptStreamId}>
        {!streamId ? 'Missing stream id' : 'Open stream'}
      </Button>
    </Modal>
  );
};
