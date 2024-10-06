import { Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { useWallet } from 'src/contexts/wallet';
import { segmentAnalytics } from '../../App';
import { AppUsageEvent } from '../../middleware/segment-service';

export const ConnectButton = () => {
  const { connected, connect } = useWallet();
  const { t } = useTranslation('common');

  const onConnectButtonClick = () => {
    // Record user event in Segment Analytics
    segmentAnalytics.recordEvent(AppUsageEvent.WalletConnect);
    connect();
  };

  if (!connected) {
    return (
      <Button type='primary' shape='round' size='middle' onClick={onConnectButtonClick}>
        {t('account-area.connect-button')}
      </Button>
    );
  }

  return null;
};
