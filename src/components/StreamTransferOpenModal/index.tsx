import React from 'react';
import { useState } from 'react';
import { Modal, Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { isValidAddress } from '../../utils/ui';
import { useWallet } from '../../contexts/wallet';

export const StreamTransferOpenModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
}) => {
  const [address, setAddress] = useState('');
  const { publicKey } = useWallet();
  const { t } = useTranslation('common');

  const handleAddressChange = (e: any) => {
    setAddress(e.target.value);
  }

  const isAddressOwnAccount = (): boolean => {
    return address && publicKey && address === publicKey.toBase58()
      ? true : false;
  }

  const onAcceptNewAddress = () => {
    props.handleOk(address);
    setTimeout(() => {
      setAddress('');
    }, 50);
  }

  return (
    <Modal
      className="mean-modal"
      title={<div className="modal-title">{t('transfer-stream.modal-title')}</div>}
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptNewAddress}
      onCancel={props.handleClose}
      width={480}>

      <div className="form-label">{t('transfer-stream.label-streamid-input')}</div>
      <div className="well">
        <div className="flex-fixed-right">
          <div className="left position-relative">
            <span className="recipient-field-wrapper">
              <input id="stream-transfer-input"
                className="general-text-input"
                autoComplete="on"
                autoCorrect="off"
                type="text"
                onChange={handleAddressChange}
                placeholder={t('transfer-stream.streamid-placeholder')}
                required={true}
                spellCheck="false"
                value={address}/>
            </span>
          </div>
          <div className="right">&nbsp;</div>
        </div>
        {
          address && !isValidAddress(address) ? (
            <span className="form-field-error">
              {t('transactions.validation.address-validation')}
            </span>
          ) : isAddressOwnAccount() ? (
            <span className="form-field-error">
              {t('transactions.recipient.recipient-is-own-account')}
            </span>
          ) : (null)
        }

      </div>

      <Button
        className="main-cta"
        block
        type="primary"
        shape="round"
        size="large"
        disabled={!address}
        onClick={onAcceptNewAddress}>
        {!address ? t('transfer-stream.streamid-empty') : t('transfer-stream.streamid-open-cta')}
      </Button>
    </Modal>
  );
};
