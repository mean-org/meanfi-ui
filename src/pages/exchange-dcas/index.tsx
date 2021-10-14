import React, { useContext } from 'react';
import { useEffect, useState } from 'react';
import { PreFooter } from '../../components/PreFooter';
import { AppStateContext } from '../../contexts/appstate';
import { useTranslation } from 'react-i18next';
import { isDesktop } from "react-device-detect";
import useWindowSize from '../../hooks/useWindowResize';

export const ExchangeDcasView = () => {
  const {
    detailsPanelOpen,
    setDtailsPanelOpen,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const { width } = useWindowSize();
  const [isSmallUpScreen, setIsSmallUpScreen] = useState(isDesktop);

  // const triggerWindowResize = () => {
  //   window.dispatchEvent(new Event('resize'));
  // }

  // const onCopyAddress = () => {
  //   if (accountAddress && copyText(accountAddress)) {
  //     notify({
  //       description: t('notifications.account-address-copied-message'),
  //       type: "info"
  //     });
  //   } else {
  //     notify({
  //       description: t('notifications.account-address-not-copied-message'),
  //       type: "error"
  //     });
  //   }
  // }

  // Window resize listeners
  useEffect(() => {
    const resizeListener = () => {
      const NUM_CHARS = 4;
      const ellipsisElements = document.querySelectorAll(".overflow-ellipsis-middle");
      for (let i = 0; i < ellipsisElements.length; ++i){
        const e = ellipsisElements[i] as HTMLElement;
        if (e.offsetWidth < e.scrollWidth){
          const text = e.textContent;
          e.dataset.tail = text?.slice(text.length - NUM_CHARS);
        }
      }
    };
    // Call it a first time
    resizeListener();

    // set resize listener
    window.addEventListener('resize', resizeListener);

    // clean up function
    return () => {
      // remove resize listener
      window.removeEventListener('resize', resizeListener);
    }
  }, []);

  useEffect(() => {
    if (isSmallUpScreen && width < 576) {
      setIsSmallUpScreen(false);
    }
  }, [
    width,
    isSmallUpScreen,
    detailsPanelOpen,
    setDtailsPanelOpen
  ]);

  ///////////////
  // Rendering //
  ///////////////

  return (
    <>
      <div className="container main-container">

        {/* {window.location.hostname === 'localhost' && (
          <div className="debug-bar">
            <span className="ml-1">solAccountItems:</span><span className="ml-1 font-bold fg-dark-active">{solAccountItems}</span>
            <span className="ml-1">shallWeDraw:</span><span className="ml-1 font-bold fg-dark-active">{shallWeDraw() ? 'true' : 'false'}</span>
          </div>
        )} */}

        <div className="interaction-area">

          <div className={`transactions-layout ${detailsPanelOpen ? 'details-open' : ''}`}>

            {/* Left / top panel*/}
            <div className="tokens-container">
              <div className="transactions-heading">
                <span className="title">{t('ddcas.screen-title')}</span>
              </div>
              <div className="inner-container">
                <div className="item-block vertical-scroll">
                  <p>List of recurring buys</p>
                </div>
              </div>
            </div>

            {/* Right / down panel */}
            <div className="transaction-list-container">
              {/* <div className="streams-heading"><span className="title">{t('streams.stream-detail.heading')}</span></div> */}
              <div className="inner-container">
                {/* Activity list */}
                <div className="transaction-list-data-wrapper vertical-scroll">
                  <div className="activity-list h-100">
                    <p>Recurring buy details</p>
                  </div>
                </div>
              </div>
            </div>

          </div>

        </div>

      </div>
      <PreFooter />
    </>
  );

};
