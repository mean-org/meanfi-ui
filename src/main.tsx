import '@rainbow-me/rainbowkit/styles.css';
import './index.css';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppConfigService } from 'environments/environment';
import getRuntimeEnv from 'environments/getRuntimeEnv';
import i18next from 'i18next';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { WagmiProvider } from 'wagmi';
import App from './App';
import { CustomLoggerService } from './services/logger';
import common_en from './translations/en/common.json';
import common_es from './translations/es/common.json';
import common_fa from './translations/fa/common.json';
import common_fr from './translations/fr/common.json';
import common_ko from './translations/ko/common.json';
import common_pt from './translations/pt/common.json';
import common_tr from './translations/tr/common.json';
import common_vi from './translations/vi/common.json';
import common_zh from './translations/zh/common.json';
import { wagmiConfig } from './wagmiConfig';

export const appConfig = new AppConfigService(getRuntimeEnv().MODE);
console.log('%cApp version:', 'color:brown', getRuntimeEnv().VITE_VERSION);
console.log('%cEnvironment:', 'color:brown', getRuntimeEnv().MODE ?? getRuntimeEnv().NODE_ENV);
console.log('%cProgramId:', 'color:brown', appConfig.getConfig().streamProgramAddress);

export const customLogger = new CustomLoggerService();

i18next.init({
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already does escaping
  resources: {
    en: {
      common: common_en, // 'common' is our custom namespace
    },
    es: {
      common: common_es,
    },
    fa: {
      common: common_fa,
    },
    fr: {
      common: common_fr,
    },
    pt: {
      common: common_pt,
    },
    tr: {
      common: common_tr,
    },
    zh: {
      common: common_zh,
    },
    vi: {
      common: common_vi,
    },
    ko: {
      common: common_ko,
    },
  },
});

const queryClient = new QueryClient();

// biome-ignore lint/style/noNonNullAssertion: Its needed here!
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18next}>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider>
            <App />
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </I18nextProvider>
  </React.StrictMode>,
);
