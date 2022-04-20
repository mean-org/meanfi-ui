import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { PreFooter } from "../../components/PreFooter";
import { IDO_START_DATE, UTC_FULL_DATE_TIME_FORMAT } from "../../constants";
import "./style.scss";
import Countdown from 'react-countdown';
import dateFormat from "dateformat";
import { AppStateContext } from '../../contexts/appstate';
import { Link, useNavigate } from 'react-router-dom';
import { Alert } from 'antd';

export const IdoView = () => {
  const navigate = useNavigate();
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const today = new Date();

  const onCountdownCompleted = useCallback(() => {
    navigate('/ido-live');
  }, [navigate]);

  useEffect(() => {
    if (today >= idoStartUtc) {
      onCountdownCompleted();
    }
  },[
    today,
    idoStartUtc,
    onCountdownCompleted
  ]);

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
          <Countdown date={idoStartUtc} daysInHours={false} onComplete={onCountdownCompleted} />
        </div>

        <div className="container-max-width-450 text-left mb-4">
          <Alert
            message="NOTE"
            description={
              <div>
                <span className="mr-1">Due to network and market conditions, the Mean IDO was delayed a week, and will now take place on Dec. 22nd at 15:00 UTC. Read the details</span>
                <a className="simplelink underline" href="https://meandao.medium.com/mean-launch-delayed-7-days-505221f2e638" target="_blank" rel="noopener noreferrer">
                  <span>👉 HERE</span>
                </a>
              </div>
            }
            type="warning"
            showIcon
            className="translucent"
          />
        </div>

        <div className="w-100 text-center mb-4">
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
