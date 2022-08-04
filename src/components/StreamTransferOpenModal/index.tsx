import React, { useCallback, useEffect, useMemo } from 'react';
import { useState } from 'react';
import { Modal, Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { isValidAddress } from '../../utils/ui';
import { useWallet } from '../../contexts/wallet';
import { Stream } from '@mean-dao/msp';
import { StreamInfo } from '@mean-dao/money-streaming';
import Checkbox from 'antd/lib/checkbox/Checkbox';
import { useSearchParams } from 'react-router-dom';
import { InputMean } from '../InputMean';

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
  const [proposalTitle, setProposalTitle] = useState('');

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

  const onTitleInputValueChange = (e: any) => {
    setProposalTitle(e.target.value);
  }

  const handleAddressChange = (e: any) => {
    setAddress(e.target.value);
  }

  const isAddressOwnAccount = (): boolean => {
    return address && publicKey && address === publicKey.toBase58()
      ? true : false;
  }

  // Validation
  const isValidForm = (): boolean => {
    return address &&
      isValidAddress(address) &&
      !isAddressOwnAccount() &&
      !isAddressTreasurer(address) &&
      isVerifiedRecipient
      ? true
      : false;
  }

  // Validation if multisig
  const isValidFormMultisig = (): boolean => {
    return proposalTitle &&
      address &&
      isValidAddress(address) &&
      !isAddressOwnAccount() &&
      !isAddressTreasurer(address) &&
      isVerifiedRecipient
      ? true
      : false;
  }

  const getTransactionStartButtonLabel = () => {
    return !address
        ? t('transfer-stream.streamid-empty')
        : (!isValidAddress(address) || isAddressOwnAccount() || isAddressTreasurer(address))
          ? 'Invalid address'
          : !isVerifiedRecipient
            ? t('transactions.validation.verified-recipient-unchecked')
            : t('transfer-stream.streamid-open-cta')
  }

  const getTransactionStartButtonLabelMultisig = () => {
    return !proposalTitle
      ? "Add a proposal title"
      : !address
        ? t('transfer-stream.streamid-empty')
        : (!isValidAddress(address) || isAddressOwnAccount() || isAddressTreasurer(address))
          ? 'Invalid address'
          : !isVerifiedRecipient
            ? t('transactions.validation.verified-recipient-unchecked')
            : 'Sign proposal'
  }

  const onAcceptModal = () => {
    handleOk({
      title: proposalTitle,
      address: address
    });
  }

  const onCloseModal = () => {
    setAddress('');
    setProposalTitle("");
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

  const param = useMemo(() => getQueryAccountType(), [getQueryAccountType]);

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
      onCancel={onCloseModal}
      width={480}>

      {/* Proposal title */}
      {queryAccountType === "multisig" && (
        <div className="mb-3">
          <div className="form-label">{t('multisig.proposal-modal.title')}</div>
          <InputMean
            id="proposal-title-field"
            name="Title"
            className="w-100 general-text-input"
            onChange={onTitleInputValueChange}
            placeholder="Add a proposal title (required)"
            value={proposalTitle}
          />
        </div>
      )}

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
        disabled={param === "multisig" ? !isValidFormMultisig() : !isValidForm()}
        onClick={onAcceptModal}>
        {param === "multisig" ? getTransactionStartButtonLabelMultisig() : getTransactionStartButtonLabel()}
      </Button>
    </Modal>
  );
};
