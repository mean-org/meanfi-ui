import { Button, Col, Modal, Row } from "antd";
import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MEAN_FINANCE_APP_ALLBRIDGE_URL, MEAN_FINANCE_APP_RENBRIDGE_URL } from "../../constants";
import { AppStateContext } from "../../contexts/appstate";
import { useWallet } from "../../contexts/wallet";
import { IconCopy, IconSolana } from "../../Icons";
import { notify } from "../../utils/notifications";
import { copyText } from "../../utils/ui";
import "./style.less";

var QRCode = require('qrcode.react');

export const DepositOptions = (props: {
  handleClose: any;
  isVisible: boolean;
}) => {
  const { t } = useTranslation("common");
  const { publicKey, connected } = useWallet();
  const { theme } = useContext(AppStateContext);
  const [isSharingAddress, setIsSharingAddress] = useState(false);

  const enableAddressSharing = () => {
    setIsSharingAddress(true);
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 250);
  }

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

  const handleBridgeFromRenButtonClick = () => {
    window.open(MEAN_FINANCE_APP_RENBRIDGE_URL, '_blank','noreferrer');
    props.handleClose();
  }

  const onCopyAddress = () => {
    if (publicKey && copyText(publicKey)) {
      notify({
        description: t('notifications.account-address-copied-message'),
        type: "info"
      });
    } else {
      notify({
        description: t('notifications.account-address-not-copied-message'),
        type: "error"
      });
    }
  }

  useEffect(() => {
    const resizeListener = () => {
      var NUM_CHARS = 4;
      var ellipsisElements = document.querySelectorAll(".overflow-ellipsis-middle");
      for (var i = 0; i < ellipsisElements.length; ++i){
        var e = ellipsisElements[i] as HTMLElement;
        if (e.offsetWidth < e.scrollWidth){
          var text = e.textContent;
          e.dataset.tail = text?.slice(text.length - NUM_CHARS);
        }
      }
    };
    // Call it a first time
    resizeListener();

    // set resize listener
    window.addEventListener('resize', resizeListener);

    // clean up function
    return () => {
      // remove resize listener
      window.removeEventListener('resize', resizeListener);
    }
  }, []);

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
      afterClose={() => setIsSharingAddress(false)}
      width={320}>
      <div className="deposit-selector">
        <div className={isSharingAddress ? "options-list hide" : "options-list show"} id="options-list">
          <p>{t("deposits.heading")}:</p>
          {!connected && (
            <p className="fg-error">{t('deposits.not-connected')}!</p>
          )}
          <Row gutter={[24, 24]}>
            <Col span={24}>
              <Button
                block
                className="deposit-option"
                type="default"
                shape="round"
                size="middle"
                disabled={!connected}
                onClick={handleFtxPayButtonClick}>
                <img src="assets/deposit-partners/ftx.ico" className="deposit-partner-icon" alt={t("deposits.ftx-cta-label-enabled")} />
                {t("deposits.ftx-cta-label-enabled")}
              </Button>
            </Col>
            <Col span={24}>
              <Button
                block
                className="deposit-option"
                type="default"
                shape="round"
                size="middle"
                disabled={!connected}
                onClick={enableAddressSharing}>
                <IconSolana className="deposit-partner-icon"/>
                {t("deposits.send-from-wallet-cta-label")}
              </Button>
            </Col>
            <Col span={24}>
              <Button
                block
                className="deposit-option"
                type="default"
                shape="round"
                size="middle"
                onClick={handleBridgeFromEthereumButtonClick}>
                <img src="assets/deposit-partners/eth.png" className="deposit-partner-icon" alt={t("deposits.move-from-ethereum-cta-label")} />
                {t("deposits.move-from-ethereum-cta-label")}
              </Button>
            </Col>
            <Col span={24}>
              <Button
                block
                className="deposit-option"
                type="default"
                shape="round"
                size="middle"
                onClick={handleBridgeFromPolygonButtonClick}>
                <img src="assets/deposit-partners/polygon.png" className="deposit-partner-icon" alt={t("deposits.move-from-polygon-cta-label")} />
                {t("deposits.move-from-polygon-cta-label")}
              </Button>
            </Col>
            <Col span={24}>
              <Button
                block
                className="deposit-option"
                type="default"
                shape="round"
                size="middle"
                onClick={handleBridgeFromRenButtonClick}>
                <img src="assets/deposit-partners/btc.png" className="deposit-partner-icon" alt={t("deposits.move-from-renbridge-cta-label")} />
                {t("deposits.move-from-renbridge-cta-label")}
              </Button>
            </Col>
          </Row>
        </div>
        <div className={isSharingAddress ? "address-share show" : "address-share hide"} id="address-share">
          <div className="text-center">
            <h3 className="font-bold mb-3">{t("deposits.send-from-wallet-cta-label")}</h3>
            <div className={theme === 'light' ? 'qr-container bg-white' : 'qr-container bg-black'}>
              {publicKey && (
                <QRCode
                  value={publicKey.toBase58()}
                  size={200}
                  renderAs="svg"/>
              )}
            </div>

            <div className="transaction-field medium">
              <div className="transaction-field-row main-row">
                <span className="input-left recipient-field-wrapper">
                  {publicKey && (
                    <span id="address-static-field" className="overflow-ellipsis-middle">
                      {publicKey.toBase58()}
                    </span>
                  )}
                </span>
                <div className="addon-right simplelink" onClick={onCopyAddress}>
                  <IconCopy className="mean-svg-icons link" />
                </div>
              </div>
            </div>

            <p className="font-light font-size-75 px-4 mb-3">{t('deposits.address-share-disclaimer')}</p>

            <Button
              className="deposit-option"
              type="default"
              shape="round"
              size="middle"
              onClick={() => setIsSharingAddress(false)}>
              {t('general.cta-finish')}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
