import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { AppConfigService } from "./environments/environment";
import { I18nextProvider } from "react-i18next";
import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import common_es from "./translations/es/common.json";
import common_en from "./translations/en/common.json";
import common_fa from "./translations/fa/common.json";
import common_fr from "./translations/fr/common.json";
import common_pt from "./translations/pt/common.json";
import common_tr from "./translations/tr/common.json";
import common_zh from "./translations/zh/common.json";
import common_vi from "./translations/vi/common.json";
import common_ko from "./translations/ko/common.json";
import { CustomLoggerService } from "./middleware/logger";
import GitInfo from 'react-git-info/macro';

export const gitInfo = GitInfo();
export const appConfig = new AppConfigService(process.env.REACT_APP_ENV);
const appBuildInfo = `Branch: ${gitInfo.branch || '-'}. Commit: ${gitInfo.commit.shortHash || '-'}`;
console.log(`%cApp version:`, 'color:brown', process.env.REACT_APP_VERSION);
console.log(`%cBuild details:`, 'color:brown', appBuildInfo);
console.log(`%cBuild date:`, 'color:brown', new Date(Date.parse(gitInfo.commit.date)).toLocaleString());
console.log(`%cEnvironment:`, 'color:brown', process.env.REACT_APP_ENV);
console.log(`%cProgramId:`, 'color:brown', appConfig.getConfig().streamProgramAddress);
export const customLogger = new CustomLoggerService();

i18next.use(LanguageDetector).init({
  fallbackLng: 'en',
  interpolation: { escapeValue: false },  // React already does escaping
  resources: {
    en: {
      common: common_en               // 'common' is our custom namespace
    },
    es: {
      common: common_es
    },
    fa: {
      common: common_fa
    },
    fr: {
      common: common_fr
    },
    pt: {
      common: common_pt
    },
    tr: {
      common: common_tr
    },
    zh: {
      common: common_zh
    },
    vi: {
      common: common_vi
    },
    ko: {
      common: common_ko
    },
  },
});

ReactDOM.render(
  <React.StrictMode>
    <I18nextProvider i18n={i18next}>
      <App/>
    </I18nextProvider>
  </React.StrictMode>,
  document.getElementById("root")
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
