import React from 'react';
import { useContext, useEffect } from "react";
import { Modal } from "antd";
import { AppStateContext } from "../../contexts/appstate";
import { useTranslation } from "react-i18next";

export const QrScannerModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
}) => {
  const { recipientAddress, setRecipientAddress } = useContext(AppStateContext);
  const { t } = useTranslation('common');

  useEffect(() => {
    let tempString = '';
    let html5QrcodeScanner: any;

    const kickoffScanner = () => {
      const element = document.getElementById('qr-reader');
      const scanner = (window as any).Html5QrcodeScanner;
      if (props.isVisible && scanner && element) {
        html5QrcodeScanner = new (window as any).Html5QrcodeScanner("qr-reader", {
          fps: 10,
          qrbox: 250,
        });

        const onScanSuccess = (qrCodeMessage: any) => {
          if (qrCodeMessage !== recipientAddress) {
            tempString = qrCodeMessage;
            // Optional: To close the QR code scannign after the result is found
            html5QrcodeScanner.clear();
            setRecipientAddress(tempString);
            props.handleOk();
          }
        };

        // Optional callback for error, can be ignored.
        const onScanError = () => {
          // This callback would be called in case of qr code scan error or setup error.
          // You can avoid this callback completely, as it can be very verbose in nature.
        };

        html5QrcodeScanner.render(onScanSuccess, onScanError);
      }
    };

    // Call it a first time
    kickoffScanner();

    // clean up function
    return () => {
      if (html5QrcodeScanner) {
        html5QrcodeScanner.clear();
      }
    };
  }, [recipientAddress, setRecipientAddress, props]);

  return (
    <Modal
      className="mean-modal"
      title={<div className="modal-title">{t('transactions.recipient.qr-scan-title')}</div>}
      footer={null}
      visible={props.isVisible}
      onOk={props.handleOk}
      onCancel={props.handleClose}
      width={480}>
      <div id="qr-reader"></div>
    </Modal>
  );
};
