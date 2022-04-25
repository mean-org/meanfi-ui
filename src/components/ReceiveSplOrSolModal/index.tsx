import React from 'react';
import { Modal } from "antd";
import { useContext, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AppStateContext } from "../../contexts/appstate";
import { IconCopy } from "../../Icons";
import { copyText } from "../../utils/ui";
import { openNotification } from '../Notifications';

const QRCode = require('qrcode.react');

export const ReceiveSplOrSolModal = (props: {
  handleClose: any;
  isVisible: boolean;
  address: string;
  tokenSymbol: string;
}) => {
  const { t } = useTranslation("common");
  const { theme } = useContext(AppStateContext);
  const { address, tokenSymbol, isVisible, handleClose } = props;

  const onCopyAddress = () => {
    if (address && copyText(address)) {
      openNotification({
        description: t('notifications.account-address-copied-message'),
        type: "info"
      });
    } else {
      openNotification({
        description: t('notifications.account-address-not-copied-message'),
        type: "error"
      });
    }
  }

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
      title={<div className="modal-title">Receive {tokenSymbol || 'Funds'}</div>}
      footer={null}
      visible={isVisible}
      onOk={handleClose}
      onCancel={handleClose}
      width={360}>
      <div className="buy-token-options">
        <div className="text-center mt-3">
          <h3 className="mb-3">Scan the QR code to receive funds</h3>
          {address && (
            <div className={theme === 'light' ? 'qr-container bg-white' : 'qr-container bg-black'}>
              <QRCode
                value={address}
                size={200}
                renderAs="svg"
              />
            </div>
          )}
          <div className="transaction-field medium">
            <div className="transaction-field-row main-row">
              <span className="input-left recipient-field-wrapper">
                <span id="address-static-field" className="overflow-ellipsis-middle">
                  {address}
                </span>
              </span>
              <div className="addon-right simplelink" onClick={onCopyAddress}>
                <IconCopy className="mean-svg-icons link" />
              </div>
            </div>
          </div>
          <div className="font-light font-size-75 px-4">{t('assets.no-balance.line4')}</div>
          <div className="font-light font-size-75 px-4">{t('assets.no-balance.line5')}</div>
        </div>
      </div>
    </Modal>
  );
};
