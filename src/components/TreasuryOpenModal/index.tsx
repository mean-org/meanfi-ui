import React, { useCallback, useEffect } from 'react';
import { useState } from 'react';
import { Modal, Button } from 'antd';
import { isValidAddress } from '../../middleware/ui';
import { useTranslation } from 'react-i18next';
import { useWallet } from '../../contexts/wallet';

export const TreasuryOpenModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
}) => {
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const [treasuryId, setTreasuryId] = useState('');

  const isAddressOwnAccount = useCallback((): boolean => {
    return treasuryId && publicKey && treasuryId === publicKey.toBase58()
           ? true : false;
  }, [
    publicKey,
    treasuryId
  ]);

  const triggerWindowResize = () => {
    window.dispatchEvent(new Event('resize'));
  }

  const onAcceptTreasuryId = () => {
    props.handleOk(treasuryId);
    setTimeout(() => {
      setTreasuryId('');
    }, 50);
  }

  const onTreasuryIdChange = (e: any) => {
    const inputValue = e.target.value as string;
    const trimmedValue = inputValue.trim();
    setTreasuryId(trimmedValue);
  }

  const onTreasuryIdFocusIn = () => {
    setTimeout(() => {
      triggerWindowResize();
    }, 10);
  }

  const onTreasuryIdFocusOut = () => {
    setTimeout(() => {
      triggerWindowResize();
    }, 10);
  }

  // Window resize listener
  useEffect(() => {
    const resizeListener = () => {
      const NUM_CHARS = 4;
      const ellipsisElements = document.querySelectorAll(".overflow-ellipsis-middle");
      if (isValidAddress(treasuryId)) {
        for (const element of ellipsisElements) {
          const e = element as HTMLElement;
          if (e.offsetWidth < e.scrollWidth){
            const text = e.textContent;
            e.dataset.tail = text?.slice(text.length - NUM_CHARS);
          }
        }
        } else {
        if (ellipsisElements && ellipsisElements.length > 0) {
          const e = ellipsisElements[0] as HTMLElement;
          e.dataset.tail = '';
        }
      }
    };
    resizeListener();
    window.addEventListener('resize', resizeListener);
    return () => {
      window.removeEventListener('resize', resizeListener);
    }
  }, [treasuryId]);

  return (
    <Modal
      className="mean-modal"
      title={<div className="modal-title">{t('treasuries.open-treasury.modal-title')}</div>}
      footer={null}
      open={props.isVisible}
      onOk={onAcceptTreasuryId}
      onCancel={props.handleClose}
      width={480}>

      <div className="form-label">{t('treasuries.open-treasury.treasuryid-input-label')}</div>
      <div className="well">
        <div className="flex-fixed-right">
          <div className="left position-relative">
            <span className="recipient-field-wrapper">
              <input id="payment-recipient-field"
                className="general-text-input"
                autoComplete="on"
                autoCorrect="off"
                type="text"
                onFocus={onTreasuryIdFocusIn}
                onChange={onTreasuryIdChange}
                onBlur={onTreasuryIdFocusOut}
                placeholder={t('treasuries.open-treasury.treasuryid-placeholder')}
                required={true}
                spellCheck="false"
                value={treasuryId}/>
              <span id="payment-recipient-static-field"
                    className={`${treasuryId ? 'overflow-ellipsis-middle' : 'placeholder-text'}`}>
                {treasuryId || t('treasuries.open-treasury.treasuryid-placeholder')}
              </span>
            </span>
          </div>
          <div className="right">&nbsp;</div>
        </div>
        {
          treasuryId && !isValidAddress(treasuryId) ? (
            <span className="form-field-error">
              {t('transactions.validation.address-validation')}
            </span>
          ) : isAddressOwnAccount() ? (
            <span className="form-field-error">
              {t('transactions.validation.cannot-use-own-account-as-treasury')}
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
        disabled={!treasuryId || !isValidAddress(treasuryId) || isAddressOwnAccount()}
        onClick={onAcceptTreasuryId}>
        {!treasuryId
          ? t('treasuries.open-treasury.treasuryid-input-empty')
          : !isValidAddress(treasuryId)
          ? t('transactions.validation.invalid-solana-address')
          : t('treasuries.open-treasury.main-cta')
        }
      </Button>
    </Modal>
  );
};
