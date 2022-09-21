import { EllipsisOutlined } from "@ant-design/icons";
import { Button, Dropdown, Menu } from "antd";
import { ItemType } from 'antd/lib/menu/hooks/useItems';
import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from 'react-router-dom';
import { LANGUAGES, MEANFI_SUPPORT_URL, MEAN_DAO_GITBOOKS_URL, MEAN_DAO_GITHUB_ORG_URL, MEAN_FINANCE_DISCORD_URL } from "../../constants";
import { AppStateContext } from "../../contexts/appstate";
import { useWallet } from "../../contexts/wallet";
import {
  IconBookOpen,
  IconChat,
  IconCodeBlock,
  IconLiveHelp,
  IconMoon,
  IconSettings,
  IconShareBox
} from "../../Icons";
import { LanguageSelector } from "../LanguageSelector";
import { openNotification } from '../Notifications';
import { ReferFriendModal } from '../ReferFriendModal';

export const AppContextMenu = () => {

  const { connected } = useWallet();
  const {
    theme,
    isWhitelisted,
    setTheme,
  } = useContext(AppStateContext);

  const { t, i18n } = useTranslation("common");
  const [selectedLanguage] = useState<string>(i18n.language);
  const [language, setLanguage] = useState<string>("");
  const [menuItems, setMenuItems] = useState<ItemType[] | undefined>(undefined);

  useEffect(() => {
    if (!language) {
      setLanguage(getLanguageCode(selectedLanguage));
    }
  }, [language, selectedLanguage]);

  const getLanguageCode = (fullCode: string): string => {
    if (!fullCode) {
      return "en";
    }
    const splitted = fullCode.split("-");
    if (splitted.length > 1) {
      return splitted[0];
    }
    return fullCode;
  };

  // Language switcher modal
  const [isLanguageModalVisible, setIsLanguageModalVisibility] = useState(false);
  const showLanguageModal = useCallback(() => setIsLanguageModalVisibility(true), []);
  const hideLanguageModal = useCallback(() => setIsLanguageModalVisibility(false), []);
  const onAcceptLanguage = (e: any) => {
    hideLanguageModal();
    i18n.changeLanguage(e);
    setLanguage(e);
  };

  // Friend Referral modal
  const [isFriendReferralModalVisible, setIsFriendReferralModalVisibility] = useState(false);
  const showFriendReferralModal = useCallback(() => setIsFriendReferralModalVisibility(true), []);
  const hideFriendReferralModal = useCallback(() => setIsFriendReferralModalVisibility(false), []);

  const onSwitchTheme = useCallback(() => {
    if (theme === 'light') {
      setTheme('dark');
    } else {
      setTheme('light');
    }
  }, [setTheme, theme]);

  const getLanguageFlag = () => {
    const lang = LANGUAGES.filter(l => l.code === language || l.locale === language);
    if (lang && lang.length) {
      return (<img src={lang[0].flag} alt={getLanguageCode(lang[0].code)} className="mean-svg-icons" />);
    } else {
      <IconSettings className="mean-svg-icons" />
    }
  }

  const openFriendReferralModal = () => {
    if (connected) {
      showFriendReferralModal();
    } else {
      // Welcome to MeanFi
      // Please connect your wallet to get started.
      openNotification({
        title: t('notifications.friend-referral-completed'),
        description: t('referrals.connect-to-refer-friend'),
        type: 'error'
      });
    }
  }

  useEffect(() => {
    const items: ItemType[] = [];
    items.push({
      key: '01-theme',
      label: (
        <div onClick={onSwitchTheme}>
          <IconMoon className="mean-svg-icons" />
          <span className="menu-item-text">
            {t(`ui-menus.app-context-menu.switch-theme`)} {theme === 'light'
              ? t(`ui-menus.app-context-menu.theme-dark`)
              : t(`ui-menus.app-context-menu.theme-light`)}
          </span>
        </div>
      ),
    });
    items.push({
      key: '02-language',
      label: (
        <div onClick={showLanguageModal}>
          {getLanguageFlag()}
          <span className="menu-item-text">{t('ui-menus.app-context-menu.switch-language')}: {t(`ui-language.${getLanguageCode(language)}`)}</span>
        </div>
      )
    });
    items.push({type: "divider"});
    items.push({
      key: '03-referrals',
      label: (
        <div onClick={() => openFriendReferralModal()}>
          <IconShareBox className="mean-svg-icons" />
          <span className="menu-item-text">
            {t('ui-menus.app-context-menu.refer-a-friend', { referrals: '' })}
          </span>
        </div>
      )
    });
    items.push({type: "divider"});
    items.push({
      key: '04-docs',
      label: (
        <a href={MEAN_DAO_GITBOOKS_URL} target="_blank" rel="noopener noreferrer">
          <IconBookOpen className="mean-svg-icons" />
          <span className="menu-item-text">{t('ui-menus.app-context-menu.how-to-use')}</span>
        </a>
      )
    });
    items.push({
      key: '05-code',
      label: (
        <a href={MEAN_DAO_GITHUB_ORG_URL} target="_blank" rel="noopener noreferrer">
          <IconCodeBlock className="mean-svg-icons" />
          <span className="menu-item-text">{t('ui-menus.app-context-menu.code')}</span>
        </a>
      )
    });
    items.push({
      key: '06-discord',
      label: (
        <a href={MEAN_FINANCE_DISCORD_URL} target="_blank" rel="noopener noreferrer">
          <IconChat className="mean-svg-icons" />
          <span className="menu-item-text">{t('ui-menus.app-context-menu.discord')}</span>
        </a>
      )
    });
    items.push({
      key: '07-help',
      label: (
        <a href={MEANFI_SUPPORT_URL} target="_blank" rel="noopener noreferrer">
          <IconLiveHelp className="mean-svg-icons" />
          <span className="menu-item-text">{t('ui-menus.app-context-menu.help-support')}</span>
        </a>
      )
    });
    if (isWhitelisted) {
      items.push({type: "divider"});
      items.push({
        key: '/staking-rewards',
        label: (
          <div>
            <IconCodeBlock className="mean-svg-icons" />
            <Link className="fg-inherit" to="/staking-rewards">Staking rewards</Link>
          </div>
        )
      });
      items.push({
        key: '/playground',
        label: (
          <div>
            <IconCodeBlock className="mean-svg-icons" />
            <Link className="fg-inherit" to="/playground">Playground</Link>
          </div>
        )
      });
    }

    setMenuItems(items);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, language, isWhitelisted, t]);

  const menu = (<Menu items={menuItems} />);

  return (
    <>
      <Dropdown overlay={menu} placement="bottomRight" trigger={["click"]}>
        <Button
          shape="round"
          type="text"
          size="middle"
          className="ant-btn-shaded"
          onClick={(e) => e.preventDefault()}
          icon={<EllipsisOutlined />}/>
      </Dropdown>
      <LanguageSelector
        isVisible={isLanguageModalVisible}
        handleOk={onAcceptLanguage}
        handleClose={hideLanguageModal}
      />
      <ReferFriendModal
        isVisible={isFriendReferralModalVisible}
        handleClose={hideFriendReferralModal}
      />
    </>
  );
};
