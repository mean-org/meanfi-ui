import React from 'react';
import { useWallet } from "../../contexts/wallet";
import { AccountDetails } from "../AccountDetails";
import { ConnectButton } from "../ConnectButton";
import { AppContextMenu } from '../AppContextMenu';
// import { CurrentBalance } from '../CurrentBalance';
import { useOnlineStatus } from '../../contexts/online-status';
import { Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';

export const FooterBar = (props: {
  onOpenDrawer?: any;
}) => {
  const { t } = useTranslation('common');
  const { connected } = useWallet();
  const { isOnline, responseTime } = useOnlineStatus();

  return (
    <div className="app-footer">
      <div className="container">
        <div className="footer-bar">
          {connected ? (
            <div className="footer-account-bar">
              <AccountDetails />
              {/* <CurrentBalance onOpenDrawer={props.onOpenDrawer} /> */}
            </div>
          ) : (
            <ConnectButton />
          )}
          <div className="flex">
            <Tooltip
              placement="bottom"
              destroyTooltipOnHide={true}
              title={!isOnline
                ? t('notifications.network-connection-down')
                : responseTime < 1000
                  ? `${t('notifications.network-connection-good')} (${responseTime}ms)`
                  : `${t('notifications.network-connection-poor')} (${responseTime}ms)`}>
              <span className={`online-status ml-1 ${!isOnline
                ? 'error'
                : responseTime < 1000
                  ? 'success'
                  : 'warning'}`}></span>
            </Tooltip>
          </div>
          <div className="app-context-menu">
            <AppContextMenu />
          </div>
        </div>
      </div>
    </div>
  );
};
