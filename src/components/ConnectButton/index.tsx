import React from 'react';
import { Button } from "antd";
import { useTranslation } from "react-i18next";
import { useWallet } from "../../contexts/wallet";
import { segmentAnalytics } from '../../App';
import { AppUsageEvent } from '../../utils/segment-service';

export const ConnectButton = () => {
  const { connected, select } = useWallet();
  const { t } = useTranslation("common");

  const onConnectButtonClick = () => {
    // Record user event in Segment Analytics
    segmentAnalytics.recordEvent(AppUsageEvent.WalletConnect);
    select();
  }

  if (!connected) {
    return (
      <Button type="primary" shape="round" size="middle" onClick={onConnectButtonClick}>
        {t('account-area.connect-button')}
      </Button>
    );
  }

  return null;

};
