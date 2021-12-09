import React, { useContext, useEffect, useMemo, useState } from 'react';
import { PreFooter } from "../../components/PreFooter";
import { IDO_START_DATE, MEANFI_DOCS_URL, UTC_FULL_DATE_TIME_FORMAT } from "../../constants";
import "./style.less";
import Countdown from 'react-countdown';
import dateFormat from "dateformat";
import { AppStateContext } from '../../contexts/appstate';
import { Link } from 'react-router-dom';

export const IdoView = () => {
  const {
    theme,
    setTheme,
  } = useContext(AppStateContext);
  const [currentTheme] = useState(theme);
  const [currentDateDisplay, setCurrentDateDisplay] = useState('');

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

  // Date related
  const idoStartUtc = useMemo(() => new Date(Date.UTC(
    IDO_START_DATE.year,
    IDO_START_DATE.month,
    IDO_START_DATE.day,
    IDO_START_DATE.hour,
    IDO_START_DATE.minute,
    IDO_START_DATE.second
  )), []);

  useEffect(() => {

    if (!currentDateDisplay) {
      setCurrentDateDisplay(dateFormat(idoStartUtc, UTC_FULL_DATE_TIME_FORMAT));
    }

  }, [
    idoStartUtc,
    currentDateDisplay
  ]);

  return (
    <div className="ido-coming-soon-page-container ido-coming-soon-bg">

      <div className="content-area">
        <div className="text-center mb-4">
          <Link to="/">
            <img className="ido-app-logo" src={theme === 'dark' ? '/assets/mean-pay-logo-color-light.svg' : '/assets/mean-pay-logo-color-dark.svg'} alt="Mean Finance" />
          </Link>
        </div>

        <div className="heading-section text-uppercase mb-4">
          <h1 className="heading ido-heading text-center mb-0">THE MEAN LAUNCH EVENT IS AROUND THE CORNER<br/>MARK YOUR CALENDARS!<br/>{currentDateDisplay}</h1>
        </div>

        <div className="countdown-wrapper">
          <Countdown date={idoStartUtc} daysInHours={false} />
        </div>

        <div className="w-100 text-center mb-4">
          <p>Read more <a className="simplelink underline" href={MEANFI_DOCS_URL} target="_blank" rel="noopener noreferrer">
          <span>here</span>
          </a>
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
