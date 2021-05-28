import { useContext } from 'react';
import { Modal, Input, Button } from 'antd';
import { AppStateContext } from '../../contexts/appstate';

export const RecipientSelectorModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
}) => {
  const { recipientAddress, recipientNote, setRecipientAddress, setRecipientNote } = useContext(AppStateContext);

  const handleRecipientAddressChange = (e: any) => {
    setRecipientAddress(e.target.value);
  }

  const handleRecipientNoteChange = (e: any) => {
    setRecipientNote(e.target.value);
  }

  return (
    <Modal
      className="mean-modal"
      title={
        <div className="modal-title">Select recepient</div>
      }
      footer={null}
      visible={props.isVisible}
      onOk={props.handleOk}
      onCancel={props.handleClose}
      width={480}>
      <div className="mb-3">
        <div className="top-input-label">To</div>
        <span className="ant-input-affix-wrapper w-100 gray-stroke">
          <Input
            className="w-100"
            autoComplete="on"
            autoCorrect="off"
            type="text"
            onChange={handleRecipientAddressChange}
            placeholder="Recepient wallet account address"
            required={true}
            minLength={1}
            maxLength={79}
            spellCheck="false"
            value={recipientAddress}
            defaultValue=""/>
        </span>
      </div>
      <div className="mb-4">
        <div className="top-input-label">Note</div>
        <span className="ant-input-affix-wrapper w-100 gray-stroke">
          <Input
            className="w-100"
            autoComplete="on"
            autoCorrect="off"
            type="text"
            onChange={handleRecipientNoteChange}
            placeholder="Add an optional note"
            required={true}
            minLength={1}
            maxLength={79}
            spellCheck="false"
            value={recipientNote}
            defaultValue=""/>
        </span>
      </div>
      <Button
        className="main-cta"
        block
        type="primary"
        shape="round"
        size="large"
        disabled={!recipientAddress}
        onClick={props.handleOk}>
        {!recipientAddress ? 'Missing recipient address' : 'Next'}
      </Button>
    </Modal>
  );
};
