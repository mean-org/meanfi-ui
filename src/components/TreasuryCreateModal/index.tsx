import React from 'react';
import { useState } from 'react';
import { Modal, Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { LoadingOutlined } from '@ant-design/icons';

export const TreasuryCreateModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  isBusy: boolean;
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
    setTreasuryName(e.target.value);
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
              autoComplete="off"
              autoCorrect="off"
              type="text"
              onChange={onInputValueChange}
              placeholder={t('treasuries.create-treasury.treasury-name-placeholder')}
              disabled={props.isBusy}
              value={treasuryName}
            />
          </div>
        </div>
        <div className="form-field-hint">I.e. "My company payroll", "Seed round vesting", etc.</div>
      </div>

      <Button
        className={`main-cta ${props.isBusy ? 'inactive' : ''}`}
        block
        type="primary"
        shape="round"
        size="large"
        disabled={!treasuryName}
        onClick={onAcceptModal}>
        {props.isBusy && (
          <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
        )}
        {props.isBusy
          ? t('treasuries.create-treasury.main-cta-busy')
          : t('treasuries.create-treasury.main-cta')}
      </Button>
    </Modal>
  );
};
