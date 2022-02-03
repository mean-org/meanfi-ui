import React, { useEffect, useState } from 'react';
import { Layout } from "antd";
import { AppRoutes } from "./routes";
import "./App.less";
import { useLocalStorageState } from './utils/utils';
import { refreshCachedRpc } from './models/connections-hq';
import { useTranslation } from 'react-i18next';

const { Content } = Layout;

function App() {

  const { t } = useTranslation('common');
  const [theme, updateTheme] = useLocalStorageState("theme");
  const [loadingStatus, setLoadingStatus] = useState<string>('loading');

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

  // Fire only once
  useEffect(() => {
    refreshCachedRpc()
      .then(() => setLoadingStatus('finished'));
    return () => { }
  }, []);

  const loader = (
    <>
      <Layout>
        <Content className="flex-center">
          <div className="loading-screen-container flex-center">
            <div className="flex-column flex-center">
              <div className="loader-container">
                <div className="app-loading">
                  <div className="logo" style={{display: 'none'}}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 245 238" fillRule="evenodd" clipRule="evenodd" strokeLinejoin="round" strokeMiterlimit="2">
                      <path d="M238.324 75l-115.818 30.654L6.689 75 0 128.402l47.946 122.08L122.515 313l74.55-62.518L245 128.402 238.324 75zm-21.414 29.042l3.168 25.313-42.121 107.268-26.849 22.511 37.922-120.286-48.471 12.465-8.881 107.524-9.176 24.128-9.174-24.128-8.885-107.524-48.468-12.465 37.922 120.286-26.85-22.511-42.118-107.268 3.167-25.313 94.406 24.998 94.408-24.998z" fill="url(#_Linear1)" transform="translate(0 -64)"/>
                      <defs>
                        <linearGradient id="_Linear1" x1="0" y1="0" x2="1" y2="0" gradientUnits="userSpaceOnUse" gradientTransform="matrix(0 238 -238 0 122.5 75)">
                          <stop offset="0" stopColor="#ff0017"/><stop offset="1" stopColor="#b7001c"/>
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                  <svg className="spinner" viewBox="25 25 50 50">
                    <circle className="path" cx="50" cy="50" r="20" fill="none" strokeWidth="2" strokeMiterlimit="10"/>
                  </svg>
                </div>
              </div>
              <p className="loader-message">{t('general.loading')}</p>
            </div>
          </div>
        </Content>
      </Layout>
    </>
  );

  if (loadingStatus === 'loading') {
    return loader;
  } else {
    return <AppRoutes />;
  }
}

export default App;
