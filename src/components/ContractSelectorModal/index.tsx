import { Modal } from "antd";

export const ContractSelectorModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
}) => {
  return (
    <Modal
      className="mean-modal"
      title={<div className="modal-title">Schedule Payment</div>}
      footer={null}
      visible={props.isVisible}
      onOk={props.handleOk}
      onCancel={props.handleClose}
      width={480}>
      {/* A formarla */}
    </Modal>
  );
};
