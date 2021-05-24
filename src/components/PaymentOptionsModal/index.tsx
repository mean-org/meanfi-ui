import { Modal } from "antd";

export const PaymentOptionsModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  children: any;
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
      {props.children}
    </Modal>
  );
};
