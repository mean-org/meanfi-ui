import { Modal, Button } from 'antd';
import { ExclamationCircleOutlined } from "@ant-design/icons";
export const CloseStreamModal = (props: {
  handleClose: any;
  handleOk: any;
  content: JSX.Element;
  isVisible: boolean;
}) => {

  return (
    <Modal
      className="mean-modal"
      title={<div className="modal-title">Close stream</div>}
      footer={null}
      visible={props.isVisible}
      onOk={props.handleOk}
      onCancel={props.handleClose}
      width={400}>
      <div className="transaction-progress">
        <ExclamationCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
        <h4 className="operation">{props.content}</h4>
        <div className="text-center mt-3">
            <Button
                className="mr-3"
                type="default"
                shape="round"
                size="large"
                onClick={props.handleClose}>
                Cancel
            </Button>
            <Button
                type="primary"
                shape="round"
                size="large"
                onClick={props.handleOk}>
                Close stream
            </Button>
        </div>
      </div>
    </Modal>
  );
};
