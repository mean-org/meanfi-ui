import { Button } from 'antd';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { CountdownTimer } from '../../components/CountdownTimer';
import { IconDiscord, IconSolana } from '../../Icons';
import { RELOAD_TIMER } from '../../models/connections-hq';
import { useLocalStorageState } from '../../utils/utils';

export const ServiceUnavailableView = () => {
  const { t } = useTranslation("common");
  const [theme, updateTheme] = useLocalStorageState("theme");
  const [reloadDisabled, setReloadDisabled] = useState(true);
  const navigate = useNavigate();
 
  const enableReload = () => {
    setReloadDisabled(false);
  }

  const reloadApp = () => {
    navigate('/');
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
          <img className="app-logo" src={theme === 'dark' ? '/assets/mean-logo-color-light.svg' : '/assets/mean-logo-color-dark.svg'} alt="Mean Finance" />
          <h3 className="network-down-message">{t('error-screens.service-unavailable-message')}</h3>
          <div className="text-center">
            <Button
              type="primary"
              size="large"
              shape="round"
              disabled={reloadDisabled}
              onClick={() => reloadApp()}>
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
                <IconSolana className="mean-svg-icons"/><span>{t('error-screens.network-status')}</span>
              </a>
            </div>
            <div className="link">
              <a className="simplelink underline-on-hover" target="_blank" rel="noopener noreferrer" href="https://discord.meanfi.com/">
                <IconDiscord className="mean-svg-icons"/><span>{t('error-screens.report-problem')}</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
