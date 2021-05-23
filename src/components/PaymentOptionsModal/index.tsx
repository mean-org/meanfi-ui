import { Modal } from "antd";

export const PaymentOptionsModal = (props: { handleClose: any, handleOk: any, isVisible: boolean, children: any }) => {

  return (
    <Modal
      className="mean-modal"
      title="Schedule Payment"
      okText="Next"
      visible={props.isVisible}
      onOk={props.handleOk}
      onCancel={props.handleClose}
      width={480}>
      {props.children}
    </Modal>
  );
};
