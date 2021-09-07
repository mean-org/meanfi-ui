import React from 'react';
import { Button, Col, Modal, Row } from "antd";
import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MEAN_FINANCE_APP_ALLBRIDGE_URL, MEAN_FINANCE_APP_RENBRIDGE_URL } from "../../constants";
import { AppStateContext } from "../../contexts/appstate";
import { useWallet } from "../../contexts/wallet";
import { IconCopy, IconSolana } from "../../Icons";
import { notify } from "../../utils/notifications";
import { copyText } from "../../utils/ui";
// import transakSDK from '@transak/transak-sdk';
import "./style.less";
import { AppConfig, AppConfigService, environment } from '../../environments/environment';

const QRCode = require('qrcode.react');

export const DepositOptions = (props: {
  handleClose: any;
  isVisible: boolean;
}) => {
  const { t } = useTranslation("common");
  const { publicKey, connected } = useWallet();
  const { theme } = useContext(AppStateContext);
  const [isSharingAddress, setIsSharingAddress] = useState(false);
  const [isTransakActive, setIsTransakActive] = useState(false);

  // Get App config
  const [currentConfig, setCurrentConfig] = useState<AppConfig | null>(null);
  if (!currentConfig) {
    const config = new AppConfigService();
    setCurrentConfig(config.getConfig());
  }

  const enableAddressSharing = () => {
    setIsSharingAddress(true);
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 250);
  }

  const enableTransak = () => {
    setIsTransakActive(true);
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 250);
  }

  const closePanels = () => {
    setIsSharingAddress(false);
    setIsTransakActive(false);
  }

  const getFtxPayLink = (): string => {
    return `https://ftx.us/pay/request?address=${publicKey?.toBase58()}&tag=&wallet=sol&memoIsRequired=false&memo=&allowTip=false`;
  }

  const handleFtxPayButtonClick = () => {
    setTimeout(() => {
      window.open(getFtxPayLink(), 'newwindow','noreferrer,resizable,width=360,height=600');
    }, 500);
    props.handleClose();
  }

  const handleBridgeFromEthereumButtonClick = () => {
    setTimeout(() => {
      window.open(
        MEAN_FINANCE_APP_ALLBRIDGE_URL + '/bridge?from=ETH&to=SOL&asset=USDT',
        '_blank','noreferrer'
      );
    }, 500);
    props.handleClose();
  }

  const handleBridgeFromPolygonButtonClick = () => {
    setTimeout(() => {
      window.open(
        MEAN_FINANCE_APP_ALLBRIDGE_URL + '/bridge?from=POL&to=SOL&asset=USDT',
        '_blank','noreferrer'
      );
    }, 500);
    props.handleClose();
  }

  const handleBridgeFromRenButtonClick = () => {
    setTimeout(() => {
      window.open(MEAN_FINANCE_APP_RENBRIDGE_URL, '_blank','noreferrer');
    }, 500);
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

  // const renderTransak = () => {
  //   if (publicKey && currentConfig) {
  //     const transak = new transakSDK({
  //       apiKey: currentConfig.transakApiKey,  // Your API Key
  //       environment: environment === 'production' ? 'PRODUCTION' : 'STAGING', // STAGING/PRODUCTION
  //       defaultCryptoCurrency: 'SOL',
  //       walletAddress: publicKey.toBase58(), // Your customer's wallet address
  //       themeColor: theme === 'light' ? '000000' : 'ffffff', // App theme color
  //       fiatCurrency: 'EUR',
  //       email: '', // Your customer's email address
  //       redirectURL: '',
  //       hostURL: window.location.origin,
  //       widgetHeight: '550px',
  //       widgetWidth: '270px'
  //     });
  //     transak.init();
  //   }
  // };

  useEffect(() => {
    const resizeListener = () => {
      const NUM_CHARS = 4;
      const ellipsisElements = document.querySelectorAll(".overflow-ellipsis-middle");
      for (let i = 0; i < ellipsisElements.length; ++i){
        const e = ellipsisElements[i] as HTMLElement;
        if (e.offsetWidth < e.scrollWidth){
          const text = e.textContent;
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
      afterClose={closePanels}
      width={400}>
      <div className="deposit-selector">
        <div className={isSharingAddress || isTransakActive ? "options-list hide" : "options-list show"} id="options-list">
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
                disabled={!connected}
                onClick={enableTransak}>
                <img src="assets/deposit-partners/transak.png" className="deposit-partner-icon" alt={t("deposits.transak-cta-label")} />
                transak
                {t("deposits.transak-cta-label")}
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
        <div className={isSharingAddress ? "option-detail-panel show" : "option-detail-panel hide"}>
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
        <div className={isTransakActive ? "option-detail-panel show" : "option-detail-panel hide"}>
          <div className="mb-3">
            {/* {renderTransak()} */}
            Transak options will display here
          </div>
          <div className="text-center">
            <Button
              className="deposit-option"
              type="default"
              shape="round"
              size="middle"
              onClick={() => setIsTransakActive(false)}>
              {t('general.cta-finish')}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
