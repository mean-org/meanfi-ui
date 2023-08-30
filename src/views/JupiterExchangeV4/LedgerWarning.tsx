import { InfoCircleOutlined } from '@ant-design/icons';
import { InfoIcon } from 'components/InfoIcon';
import { useTranslation } from 'react-i18next';

export const LedgerWarning = () => {
  const { t } = useTranslation('common');

  return (
    <div className="mt-3">
      <div className="left flex-row justify-content-end align-items-center">
        <div className="inner-label w-auto my-0">{t('swap.ledger-owner-notice')}</div>
        <InfoIcon content={<span>{t('swap.ledger-upgrade-warning')}</span>} placement="bottom">
          <InfoCircleOutlined style={{ lineHeight: 0 }} />
        </InfoIcon>
      </div>
    </div>
  );
};
