import { Empty } from 'antd';
import { useTranslation } from 'react-i18next';

function WalletNotConnectedMessage() {
  const { t } = useTranslation('common');

  return (
    <div className='flex-center h-50'>
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{t('general.not-connected')}</p>} />
    </div>
  );
}

export default WalletNotConnectedMessage;
