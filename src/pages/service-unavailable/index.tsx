import { Button } from 'antd';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CountdownTimer } from '../../components/CountdownTimer';
import { IconDiscord, IconSolana } from '../../Icons';
import { RELOAD_TIMER } from '../../models/connections-hq';
import { useLocalStorageState } from '../../utils/utils';

export const ServiceUnavailableView = () => {
  const { t } = useTranslation("common");
  const [theme, updateTheme] = useLocalStorageState("theme");
  const [reloadDisabled, setReloadDisabled] = useState(true);
 
  const enableReload = () => {
    setReloadDisabled(false);
  }

  const reloadPage = () => {
    window.location.reload();
  }

  // Use the preferred theme or dark as a default
  useEffect(() => {
    const applyTheme = (name?: string) => {
      const theme = name || 'dark';
      document.documentElement.setAttribute('data-theme', theme);
      updateTheme(theme);
    }

    applyTheme(theme);
    return () => {};
  }, [theme, updateTheme]);
 
  return (
    <>
      <div className="loading-screen-container flex-center">
        <div className="flex-column flex-center">
          <h3 className="network-down-message">{t('connection-hq.init-status-network-down')}</h3>
          <div className="text-center">
            <Button
              type="primary"
              size="large"
              shape="round"
              disabled={reloadDisabled}
              onClick={() => reloadPage()}>
              {reloadDisabled
                ? <>
                  {t('general.reload-cta-disabled')}
                  <CountdownTimer val={RELOAD_TIMER} onFinished={enableReload}/>
                  </>
                : t('general.reload-cta')
              }
            </Button>
          </div>
          <div className="bottom-links">
            <div className="link">
              <a className="simplelink underline-on-hover" target="_blank" rel="noopener noreferrer" href="https://status.solana.com/">
                <IconSolana className="mean-svg-icons"/><span>Check network status</span>
              </a>
            </div>
            <div className="link">
              <a className="simplelink underline-on-hover" target="_blank" rel="noopener noreferrer" href="https://discord.meanfi.com/">
                <IconDiscord className="mean-svg-icons"/><span>Report a problem</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
