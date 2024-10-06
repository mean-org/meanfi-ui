import { Button, Modal } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWallet } from 'src/contexts/wallet';
import { isValidAddress } from 'src/middleware/ui';

interface Props {
  handleClose: () => void;
  handleOk: (value: string) => void;
  isVisible: boolean;
}

export const TreasuryOpenModal = ({ isVisible, handleOk, handleClose }: Props) => {
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const [treasuryId, setTreasuryId] = useState('');

  const isAddressOwnAccount = useCallback((): boolean => {
    return !!(treasuryId && publicKey && treasuryId === publicKey.toBase58() );
  }, [publicKey, treasuryId]);

  const triggerWindowResize = () => {
    window.dispatchEvent(new Event('resize'));
  };

  const onAcceptTreasuryId = () => {
    handleOk(treasuryId);
    setTimeout(() => {
      setTreasuryId('');
    }, 50);
  };

  const onTreasuryIdChange = (value: string) => {
    const trimmedValue = value.trim();
    setTreasuryId(trimmedValue);
  };

  const onTreasuryIdFocusInOut = () => {
    setTimeout(() => {
      triggerWindowResize();
    }, 10);
  };

  // Window resize listener
  useEffect(() => {
    const resizeListener = () => {
      const NUM_CHARS = 4;
      const ellipsisElements = document.querySelectorAll('.overflow-ellipsis-middle');
      if (isValidAddress(treasuryId)) {
        for (const element of ellipsisElements) {
          const e = element as HTMLElement;
          if (e.offsetWidth < e.scrollWidth) {
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
    };
  }, [treasuryId]);

  const getMainCtaLabel = () => {
    if (!treasuryId) {
      return t('treasuries.open-treasury.treasuryid-input-empty');
    }
    if (!isValidAddress(treasuryId)) {
      return t('transactions.validation.invalid-solana-address');
    }

    return t('treasuries.open-treasury.main-cta');
  };

  return (
    <Modal
      className='mean-modal'
      title={<div className='modal-title'>{t('treasuries.open-treasury.modal-title')}</div>}
      footer={null}
      open={isVisible}
      onOk={onAcceptTreasuryId}
      onCancel={handleClose}
      width={480}
    >
      <div className='form-label'>{t('treasuries.open-treasury.treasuryid-input-label')}</div>
      <div className='well'>
        <div className='flex-fixed-right'>
          <div className='left position-relative'>
            <span className='recipient-field-wrapper'>
              <input
                id='payment-recipient-field'
                className='general-text-input'
                autoComplete='on'
                autoCorrect='off'
                type='text'
                onFocus={onTreasuryIdFocusInOut}
                onChange={e => onTreasuryIdChange(e.target.value)}
                onBlur={onTreasuryIdFocusInOut}
                placeholder={t('treasuries.open-treasury.treasuryid-placeholder')}
                required={true}
                spellCheck='false'
                value={treasuryId}
              />
              <span
                id='payment-recipient-static-field'
                className={`${treasuryId ? 'overflow-ellipsis-middle' : 'placeholder-text'}`}
              >
                {treasuryId || t('treasuries.open-treasury.treasuryid-placeholder')}
              </span>
            </span>
          </div>
          <div className='right'>&nbsp;</div>
        </div>
        {treasuryId && !isValidAddress(treasuryId) && (
          <span className='form-field-error'>{t('transactions.validation.address-validation')}</span>
        )}
        {isAddressOwnAccount() && (
          <span className='form-field-error'>{t('transactions.validation.cannot-use-own-account-as-treasury')}</span>
        )}
      </div>

      <Button
        className='main-cta'
        block
        type='primary'
        shape='round'
        size='large'
        disabled={!treasuryId || !isValidAddress(treasuryId) || isAddressOwnAccount()}
        onClick={onAcceptTreasuryId}
      >
        {getMainCtaLabel()}
      </Button>
    </Modal>
  );
};
