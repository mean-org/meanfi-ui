import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import App from "./App";
import * as serviceWorker from "./serviceWorker";
import { AppConfigService } from "./environments/environment";
import { I18nextProvider } from "react-i18next";
import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import common_es from "./translations/es/common.json";
import common_en from "./translations/en/common.json";
import common_fr from "./translations/fr/common.json";
import common_pt from "./translations/pt/common.json";

export const AppConfig = new AppConfigService(process.env.REACT_APP_ENV);
console.log(`%cApp version:`, 'color:brown', process.env.REACT_APP_VERSION);
console.log(`%cEnvironment:`, 'color:brown', process.env.REACT_APP_ENV);
console.log(`%cProgramId:`, 'color:brown', AppConfig.getConfig().streamProgramAddress);

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
    fr: {
      common: common_fr
    },
    pt: {
      common: common_pt
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

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
