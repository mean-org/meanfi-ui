import React from 'react';
import { useState } from 'react';
import { Modal, Button } from 'antd';
import { useTranslation } from 'react-i18next';

export const TreasuryCreateModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
}) => {
  const { t } = useTranslation('common');
  const [treasuryName, setTreasuryName] = useState('');

  const onAcceptModal = () => {
    props.handleOk(treasuryName);
    setTimeout(() => {
      setTreasuryName('');
    }, 50);
  }

  const onInputValueChange = (e: any) => {
    const inputValue = e.target.value as string;
    const trimmedValue = inputValue.trim();
    setTreasuryName(trimmedValue);
  }

  return (
    <Modal
      className="mean-modal"
      title={<div className="modal-title">{t('treasuries.create-treasury.modal-title')}</div>}
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptModal}
      onCancel={props.handleClose}
      width={480}>
      <div className="form-label">{t('treasuries.create-treasury.treasury-name-input-label')}</div>
      <div className="well">
        <div className="flex-fixed-right">
          <div className="left">
            <input
              id="treasury-name-field"
              className="w-100 general-text-input"
              autoComplete="on"
              autoCorrect="off"
              type="text"
              onChange={onInputValueChange}
              placeholder={t('treasuries.create-treasury.treasury-name-placeholder')}
              spellCheck="true"
              value={treasuryName}
            />
          </div>
        </div>
        <div className="form-field-hint">I.e. "My company payroll", "Seed round vesting", etc.</div>
      </div>

      <Button
        className="main-cta"
        block
        type="primary"
        shape="round"
        size="large"
        disabled={!treasuryName}
        onClick={onAcceptModal}>
        {t('treasuries.create-treasury.main-cta')}
      </Button>
    </Modal>
  );
};
