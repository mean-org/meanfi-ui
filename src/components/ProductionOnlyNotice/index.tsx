import { appConfig } from 'main';
import { isProd } from 'middleware/ui';
import { useTranslation } from 'react-i18next';
import './style.scss';
import { Alert } from 'antd';

function ProductionOnlyNotice() {
  const { t } = useTranslation('common');

  if (isProd()) return null;

  return (
    <div className='production-only-notice-overlay'>
      <div className='notice'>
        <Alert
          message={
            <div>
              {t('swap.exchange-warning')}&nbsp;
              <a
                className='primary-link'
                href={`${appConfig.getConfig('production').appUrl}/exchange`}
                target='_blank'
                rel='noopener noreferrer'
              >
                MAINNET
              </a>
              <span className='ml-1'>
                (
                <a
                  className='simplelink underline-on-hover'
                  target='_blank'
                  rel='noopener noreferrer'
                  href='https://docs.meanfi.com/tutorials/faq#why-is-the-mean-exchange-not-available-to-test-in-devnet'
                >
                  Why?
                </a>
                )
              </span>
            </div>
          }
          type='warning'
          showIcon
        />
      </div>
    </div>
  );
}

export default ProductionOnlyNotice;
