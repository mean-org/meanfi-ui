import React, { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MEAN_FINANCE_DISCORD_URL, MEAN_FINANCE_TWITTER_URL } from "../../constants";
import { AppStateContext } from '../../contexts/appstate';
import { PreFooter } from "../../components/PreFooter";
import "./style.less";

export const IdoBlockedView = () => {
  const {
    theme,
    setTheme,
  } = useContext(AppStateContext);
  const [currentTheme] = useState(theme);

  // Force dark theme
  useEffect(() => {

    if (theme !== 'dark') {
      setTheme('dark');
    }

    return () => setTheme(currentTheme || 'dark');
  }, [
    theme,
    setTheme,
    currentTheme
  ]);

  return (
    <div className="ido-coming-soon-page-container ido-coming-soon-bg">

      <div className="content-area max-width-medium">
        <div className="text-center mb-4">
          <Link to="/">
            <img className="ido-app-logo" src={theme === 'dark' ? '/assets/mean-pay-logo-color-light.svg' : '/assets/mean-pay-logo-color-dark.svg'} alt="Mean Finance" />
          </Link>
        </div>

        <div className="heading-section text-uppercase mb-4">
          <h1 className="heading ido-heading text-center mb-0">The Mean IDO can only be accessed from select countries</h1>
        </div>

        <div className="w-100 text-center mb-4">
          <p className="font-size-120">Afghanistan, Ivory Coast, Cuba, Iraq, Iran, Liberia, North Korea, Syria, Sudan, South Sudan, Zimbabwe, Antigua, United States, American Samoa, Guam, Northern Mariana Islands, Puerto Rico, United States Minor Outlying Islands, US Virgin Islands, Ukraine, Belarus, Albania, Burma, Central African Republic, Democratic Republic of Congo, Lybia, Somalia, Yemen, United Kingdom, Thailand.</p>
        </div>

        <div className="w-100 text-center mb-4">
          <p>
            <span className="mr-1">If you have any questions, please contact us via</span>
            <a className="simplelink underline" href={MEAN_FINANCE_TWITTER_URL} target="_blank" rel="noopener noreferrer">Twitter</a>
            <span className="mr-1">, or</span>
            <a className="simplelink underline" href={MEAN_FINANCE_DISCORD_URL} target="_blank" rel="noopener noreferrer">Discord</a>
          </p>
          <p>
            <Link to="/" className="simplelink underline">
              <span>Go to App</span>
            </Link>
          </p>
        </div>
      </div>

      <div className="w-100">
        <PreFooter />
      </div>
    </div>
  );

};
