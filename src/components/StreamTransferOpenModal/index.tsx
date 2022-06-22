import React, { useCallback, useContext } from 'react';
import { useState } from 'react';
import { Modal, Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { isValidAddress } from '../../utils/ui';
import { useWallet } from '../../contexts/wallet';
import { Stream } from '@mean-dao/msp';
import { StreamInfo } from '@mean-dao/money-streaming';
import Checkbox from 'antd/lib/checkbox/Checkbox';

export const StreamTransferOpenModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  streamDetail: Stream | StreamInfo | undefined;
}) => {
  const [address, setAddress] = useState('');
  const { publicKey } = useWallet();
  const { t } = useTranslation('common');

  const [isVerifiedRecipient, setIsVerifiedRecipient] = useState(false);

  const isAddressTreasurer = useCallback((address: string): boolean => {
    if (props.streamDetail && address) {
      const v1 = props.streamDetail as StreamInfo;
      const v2 = props.streamDetail as Stream;
      if ((v1.version < 2 && v1.treasurerAddress === address) ||
          (v2.version >= 2 && v2.treasurer === address)) {
        return true;
      }
    }
    return false;
  }, [props.streamDetail]);

  const handleAddressChange = (e: any) => {
    setAddress(e.target.value);
  }

  const isAddressOwnAccount = (): boolean => {
    return address && publicKey && address === publicKey.toBase58()
      ? true : false;
  }

  const onAcceptNewAddress = () => {
    props.handleOk(address);
  }

  const onCloseModal = () => {
    setAddress('');
    setIsVerifiedRecipient(false);
    props.handleClose();
  }

  const onIsVerifiedRecipientChange = (e: any) => {
    setIsVerifiedRecipient(e.target.checked);
  }

  return (
    <Modal
      className="mean-modal"
      title={<div className="modal-title">{t('transfer-stream.modal-title')}</div>}
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptNewAddress}
      onCancel={onCloseModal}
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
        </div>
        {
          address && !isValidAddress(address) ? (
            <span className="form-field-error">
              {t('transactions.validation.address-validation')}
            </span>
          ) : isAddressOwnAccount() ? (
            <span className="form-field-error">
              {t('transfer-stream.destination-is-own-account')}
            </span>
          ) : isAddressTreasurer(address) ? (
            <span className="form-field-error">
              {t('transfer-stream.destination-address-is-sender')}
            </span>
          ) : (null)
        }
      </div>

      <div className="ml-1 mb-3">
        <Checkbox checked={isVerifiedRecipient} onChange={onIsVerifiedRecipientChange}>{t('transfer-stream.streamid-checkbox')}</Checkbox>
      </div>

      <Button
        className="main-cta"
        block
        type="primary"
        shape="round"
        size="large"
        disabled={!address || !isValidAddress(address) || isAddressOwnAccount() || isAddressTreasurer(address) || !isVerifiedRecipient}
        onClick={onAcceptNewAddress}>
        {!address ? t('transfer-stream.streamid-empty') : t('transfer-stream.streamid-open-cta')}
      </Button>
    </Modal>
  );
};
