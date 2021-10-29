import React from 'react';
import { useWallet } from "../../contexts/wallet";
import { CurrentUserBadge } from "../CurrentUserBadge";
import { ConnectButton } from "../ConnectButton";
import { AppContextMenu } from '../AppContextMenu';
import { CurrentBalance } from '../CurrentBalance';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import { isDev } from '../../utils/ui';

export const FooterBar = () => {
  const { t } = useTranslation('common');
  const { connected } = useWallet();
  const isOnline = useOnlineStatus();

  return (
    <div className="app-footer">
      <div className="container">
        <div className="footer-bar">
          {connected ? (
            <div className="footer-account-bar">
              <CurrentUserBadge />
              <CurrentBalance />
            </div>
          ) : (
            <ConnectButton />
          )}
          {isDev() && (
            <div className="flex">
              <Tooltip placement="bottom" destroyTooltipOnHide={true} title={isOnline
                  ? t('notifications.network-connection-good')
                  : t('notifications.network-connection-poor')}>
                <span className={`online-status ${isOnline ? 'success' : 'error'} ml-1`}></span>
              </Tooltip>
            </div>
          )}
          <div className="app-context-menu">
            <AppContextMenu />
          </div>
        </div>
      </div>
    </div>
  );
};
