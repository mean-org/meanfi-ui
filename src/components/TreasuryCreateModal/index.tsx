import React, { useContext } from 'react';
import { useState } from 'react';
import { Modal, Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { CheckOutlined, LoadingOutlined } from '@ant-design/icons';
import { TREASURY_TYPE_OPTIONS } from '../../constants/treasury-type-options';
import { AppStateContext } from '../../contexts/appstate';
import { TreasuryTypeOption } from '../../models/treasury-definition';

export const TreasuryCreateModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  isBusy: boolean;
}) => {
  const { t } = useTranslation('common');
  const [treasuryName, setTreasuryName] = useState('');
  const { treasuryOption, setTreasuryOption } = useContext(AppStateContext);

  const onAcceptModal = () => {
    props.handleOk(treasuryName);
    setTimeout(() => {
      setTreasuryName('');
    }, 50);
  }

  const onInputValueChange = (e: any) => {
    setTreasuryName(e.target.value);
  }

  const handleSelection = (option: TreasuryTypeOption) => {
    setTreasuryOption(option);
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
      <div className="mb-3">
        <div className="form-label">{t('treasuries.create-treasury.treasury-name-input-label')}</div>
        <div className={`well ${props.isBusy && 'disabled'}`}>
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
                value={treasuryName}
              />
            </div>
          </div>
          <div className="form-field-hint">I.e. "My company payroll", "Seed round vesting", etc.</div>
        </div>
      </div>

      <div className="items-card-list vertical-scroll">
        {TREASURY_TYPE_OPTIONS.map(option => {
          return (
            <div key={`${option.translationId}`} className={`item-card ${option.type === treasuryOption?.type
              ? "selected"
              : option.disabled
                ? "disabled"
                : ""
            }`}
            onClick={() => {
              if (!option.disabled) {
                handleSelection(option);
              }
            }}>
              <div className="checkmark"><CheckOutlined /></div>
              <div className="item-meta">
                <div className="item-name">{t(`treasuries.create-treasury.treasury-type-options.${option.translationId}-name`)}</div>
                <div className="item-description">{t(`treasuries.create-treasury.treasury-type-options.${option.translationId}-description`)}</div>
              </div>
            </div>
          );
        })}
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
