import { useState } from 'react';
import { Modal, Input, Button } from 'antd';

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
      <div className="mb-3">
        <div className="top-input-label">Existing stream id to open</div>
        <span className="ant-input-affix-wrapper w-100 gray-stroke">
          <Input
            className="w-100"
            autoComplete="on"
            autoCorrect="off"
            type="text"
            onChange={handleSreamIdChange}
            placeholder="Address of the money stream created by Mean Pay"
            required={true}
            minLength={1}
            maxLength={79}
            spellCheck="false"
            value={streamId}/>
        </span>
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
