import React from 'react';
import { useTranslation } from 'react-i18next';
import { MEAN_DAO_GITBOOKS_URL, MEAN_DAO_MEDIUM_BLOG_URL, MEAN_FINANCE_DISCORD_URL, MEAN_FINANCE_TWITTER_URL } from '../../constants';

export const PreFooter = () => {
  const { t } = useTranslation('common');

  return (
    <div className="pre-footer">
      <div className="pre-footer-menu">
        <div className="wrapper">
          <div className="flexible-left">
            <div className="left">
              <ul className="standard-menu">
                <li>
                  <a className="standard-menu-item" href={MEAN_FINANCE_DISCORD_URL} target="_blank" rel="noopener noreferrer">
                    <span className="menu-item-text">{t('ui-menus.app-context-menu.discord')}</span>
                  </a>
                </li>
                <li>
                  <a className="standard-menu-item" href={MEAN_FINANCE_TWITTER_URL} target="_blank" rel="noopener noreferrer">
                    <span className="menu-item-text">{t('ui-menus.app-context-menu.twitter')}</span>
                  </a>
                </li>
                <li>
                  <a className="standard-menu-item" href={MEAN_DAO_MEDIUM_BLOG_URL} target="_blank" rel="noopener noreferrer">
                    <span className="menu-item-text">{t('ui-menus.app-context-menu.blog')}</span>
                  </a>
                </li>
                <li>
                  <a className="standard-menu-item" href={MEAN_DAO_GITBOOKS_URL} target="_blank" rel="noopener noreferrer">
                    <span className="menu-item-text">{t('ui-menus.app-context-menu.how-to-use')}</span>
                  </a>
                </li>
              </ul>
            </div>
            <div className="right">
              <span >
              {t('pre-footer.made-with')} <span className="emoji fg-red" aria-label="love" role="img">❤️</span> {t('pre-footer.on-solana')} <img className="small-solana-icon" src="/solana-logo.png" alt="Solana logo" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
