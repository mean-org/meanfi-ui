import { Button, Col, Modal, Row } from "antd";
import { useTranslation } from "react-i18next";
import { MEAN_FINANCE_APP_ALLBRIDGE_URL } from "../../constants";
import { useWallet } from "../../contexts/wallet";

export const DepositOptions = (props: {
  handleClose: any;
  isVisible: boolean;
}) => {
  const { t } = useTranslation("common");
  const { publicKey, connected } = useWallet();

  const getFtxPayLink = (): string => {
    return `https://ftx.us/pay/request?address=${publicKey?.toBase58()}&tag=&wallet=sol&memoIsRequired=false&memo=&allowTip=false`;
  }

  const handleFtxPayButtonClick = () => {
    window.open(getFtxPayLink(), 'newwindow','noreferrer,resizable,width=360,height=600');
    props.handleClose();
  }

  const handleBridgeFromEthereumButtonClick = () => {
    window.open(
      MEAN_FINANCE_APP_ALLBRIDGE_URL + '/bridge?from=ETH&to=SOL&asset=USDT',
      '_blank','noreferrer'
    );
    props.handleClose();
  }

  const handleBridgeFromPolygonButtonClick = () => {
    window.open(
      MEAN_FINANCE_APP_ALLBRIDGE_URL + '/bridge?from=POL&to=SOL&asset=USDT',
      '_blank','noreferrer'
    );
    props.handleClose();
  }

  return (
    <Modal
      className="mean-modal simple-modal"
      title={
        <div className="modal-title">{t("deposits.modal-title")}</div>
      }
      footer={null}
      visible={props.isVisible}
      onOk={props.handleClose}
      onCancel={props.handleClose}
      width={320}>
      <div className="deposit-selector">
        <p>{t("deposits.heading")}:</p>
        <Row gutter={[24, 24]}>
          <Col span={24}>
            <Button
              block
              className="deposit-option"
              type="text"
              shape="round"
              size="middle"
              disabled={!connected}
              onClick={handleFtxPayButtonClick}>
              {connected ? t("deposits.ftx-cta-label-enabled") : t("deposits.ftx-cta-label-disabled")}
            </Button>
          </Col>
          <Col span={24}>
            <Button
              block
              className="deposit-option"
              type="text"
              shape="round"
              size="middle"
              onClick={handleBridgeFromEthereumButtonClick}>
              {t("deposits.move-from-ethereum-cta-label")}
            </Button>
          </Col>
          <Col span={24}>
            <Button
              block
              className="deposit-option"
              type="text"
              shape="round"
              size="middle"
              onClick={handleBridgeFromPolygonButtonClick}>
              {t("deposits.move-from-polygon-cta-label")}
            </Button>
          </Col>
        </Row>
      </div>
    </Modal>
  );
};
