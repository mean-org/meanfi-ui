import { Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { segmentAnalytics } from '../../App';
import { useWallet } from '../../contexts/wallet';
import { AppUsageEvent } from '../../middleware/segment-service';

export const ConnectButton = () => {
  const { connected, selectWalletProvider } = useWallet();
  const { t } = useTranslation('common');

  const onConnectButtonClick = () => {
    // Record user event in Segment Analytics
    segmentAnalytics.recordEvent(AppUsageEvent.WalletConnect);
    selectWalletProvider();
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
