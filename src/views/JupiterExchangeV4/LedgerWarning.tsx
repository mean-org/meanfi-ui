import { WarningFilled } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

export const LedgerWarning = () => {
  const { t } = useTranslation('common');

  return (
    <div className="mt-3">
      <div data-show="true" className="ant-alert ant-alert-warning align-items-start" role="alert">
        <span
          role="img"
          aria-label="exclamation-circle"
          className="anticon anticon-exclamation-circle ant-alert-icon mt-1 mr-2"
        >
          <WarningFilled style={{ fontSize: '1.25rem' }} />
        </span>
        <div className="ant-alert-content">
          <div className="ant-alert-message">{t('swap.ledger-upgrade-warning')}</div>
          <div className="ant-alert-description"></div>
        </div>
      </div>
    </div>
  );
};
