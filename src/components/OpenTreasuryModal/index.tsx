import React from 'react';
import { useState } from 'react';
import { Modal, Button } from 'antd';
import { isValidAddress } from '../../utils/ui';

export const OpenTreasuryModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
}) => {
  const [treasuryId, setTreasuryId] = useState('');

  const handleTreasuryIdChange = (e: any) => {
    setTreasuryId(e.target.value);
  }

  const onAcceptTreasuryId = () => {
    props.handleOk(treasuryId);
    setTimeout(() => {
      setTreasuryId('');
    }, 50);
  }

  return (
    <Modal
      className="mean-modal"
      title={<div className="modal-title">Open treasury</div>}
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptTreasuryId}
      onCancel={props.handleClose}
      width={480}>
      <div className="transaction-field">
        <div className="transaction-field-row">
          <span className="field-label-left">Treasury id to open</span>
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
            onChange={handleTreasuryIdChange}
            placeholder="Treasury ID created by Mean Finance"
            required={true}
            minLength={1}
            maxLength={79}
            spellCheck="false"
            value={treasuryId} />
          </span>
        </div>
      </div>
      <Button
        className="main-cta"
        block
        type="primary"
        shape="round"
        size="large"
        disabled={!treasuryId || !isValidAddress(treasuryId)}
        onClick={onAcceptTreasuryId}>
        {!treasuryId
          ? "Enter Treasury ID"
          : !isValidAddress(treasuryId)
          ? "Invalid address"
          : "Open"
        }
      </Button>
    </Modal>
  );
};
