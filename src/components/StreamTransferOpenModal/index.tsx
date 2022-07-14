import React, { useCallback, useEffect } from 'react';
import { useState } from 'react';
import { Modal, Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { isValidAddress } from '../../utils/ui';
import { useWallet } from '../../contexts/wallet';
import { Stream } from '@mean-dao/msp';
import { StreamInfo } from '@mean-dao/money-streaming';
import Checkbox from 'antd/lib/checkbox/Checkbox';
import { useSearchParams } from 'react-router-dom';

export const StreamTransferOpenModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  streamDetail: Stream | StreamInfo | undefined;
}) => {
  const {
    handleClose,
    handleOk,
    isVisible,
    streamDetail,
  } = props;
  const [address, setAddress] = useState('');
  const [searchParams] = useSearchParams();
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();

  const [isVerifiedRecipient, setIsVerifiedRecipient] = useState(false);
  const [queryAccountType, setQueryAccountType] = useState<string | undefined>(undefined);

  const isAddressTreasurer = useCallback((address: string): boolean => {
    if (streamDetail && address) {
      const v1 = streamDetail as StreamInfo;
      const v2 = streamDetail as Stream;
      if ((v1.version < 2 && v1.treasurerAddress === address) ||
          (v2.version >= 2 && v2.treasurer === address)) {
        return true;
      }
    }
    return false;
  }, [streamDetail]);

  const handleAddressChange = (e: any) => {
    setAddress(e.target.value);
  }

  const isAddressOwnAccount = (): boolean => {
    return address && publicKey && address === publicKey.toBase58()
      ? true : false;
  }

  const onAcceptNewAddress = () => {
    handleOk(address);
  }

  const onCloseModal = () => {
    setAddress('');
    setIsVerifiedRecipient(false);
    handleClose();
  }

  const onIsVerifiedRecipientChange = (e: any) => {
    setIsVerifiedRecipient(e.target.checked);
  }

  const getQueryAccountType = useCallback(() => {
    let accountTypeInQuery: string | null = null;
    if (searchParams) {
      accountTypeInQuery = searchParams.get('account-type');
      if (accountTypeInQuery) {
        return accountTypeInQuery;
      }
    }
    return undefined;
  }, [searchParams]);

  useEffect(() => {
    if (isVisible) {
      setQueryAccountType(getQueryAccountType());
    }
  }, [getQueryAccountType, isVisible]);

  return (
    <Modal
      className="mean-modal"
      title={<div className="modal-title">{queryAccountType === "multisig" ? "Propose transfer stream" : t('transfer-stream.modal-title')}</div>}
      footer={null}
      visible={isVisible}
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
        {queryAccountType === "multisig" ? "Submit proposal" : !address ? t('transfer-stream.streamid-empty') : t('transfer-stream.streamid-open-cta')}
      </Button>
    </Modal>
  );
};
