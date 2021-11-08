import React from 'react';
import { Button, Dropdown, Menu } from "antd";
import { EllipsisOutlined } from "@ant-design/icons";
import {
  IconBookOpen,
  IconChat,
  IconCodeBlock,
  IconLiveHelp,
  IconLogout,
  IconMoon,
  IconSettings,
  IconShareBox,
} from "../../Icons";
import { useWallet } from "../../contexts/wallet";
import { useCallback, useContext, useEffect, useState } from "react";
import { AppStateContext } from "../../contexts/appstate";
import { MEAN_FINANCE_DISCORD_URL, MEAN_DAO_GITHUB_ORG_URL, MEAN_DAO_GITBOOKS_URL, LANGUAGES, MEANFI_SUPPORT_URL } from "../../constants";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "../LanguageSelector";
import { ReferFriendModal } from '../ReferFriendModal';
import { notify } from '../../utils/notifications';

export const AppContextMenu = () => {

  const { connected, disconnect, resetWalletProvider } = useWallet();
  const {
    theme,
    referrals,
    setTheme,
    setSelectedStream,
    setStreamList
  } = useContext(AppStateContext);

  const { t, i18n } = useTranslation("common");
  const [selectedLanguage] = useState<string>(i18n.language);
  const [language, setLanguage] = useState<string>("");

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

  const onDisconnectWallet = () => {
    setSelectedStream(undefined);
    setStreamList(undefined);
    disconnect();
    resetWalletProvider();
  }

  const onSwitchTheme = () => {
    if (theme === 'light') {
      setTheme('dark');
    } else {
      setTheme('light');
    }
  }

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
      notify({
        description: t('referrals.connect-to-refer-friend'),
        type: 'error'
      });
    }
  }

  const menu = (
    <Menu>
      <Menu.Item key="1" onClick={onSwitchTheme}>
        <IconMoon className="mean-svg-icons" />
        <span className="menu-item-text">
          {t(`ui-menus.app-context-menu.switch-theme`)} {theme === 'light'
            ? t(`ui-menus.app-context-menu.theme-dark`)
            : t(`ui-menus.app-context-menu.theme-light`)}
        </span>
      </Menu.Item>
      <Menu.Item key="2" onClick={showLanguageModal}>
          {getLanguageFlag()}
          <span className="menu-item-text">{t('ui-menus.app-context-menu.switch-language')}: {t(`ui-language.${getLanguageCode(language)}`)}</span>
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item key="3" onClick={() => openFriendReferralModal()}>
          <IconShareBox className="mean-svg-icons" />
          <span className="menu-item-text">
            {t('ui-menus.app-context-menu.refer-a-friend', { referrals: connected && referrals ? `(${referrals})` : '' })}
          </span>
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item key="4">
        <a href={MEAN_DAO_GITBOOKS_URL} target="_blank" rel="noopener noreferrer">
          <IconBookOpen className="mean-svg-icons" />
          <span className="menu-item-text">{t('ui-menus.app-context-menu.how-to-use')}</span>
        </a>
      </Menu.Item>
      <Menu.Item key="5">
        <a href={MEAN_DAO_GITHUB_ORG_URL} target="_blank" rel="noopener noreferrer">
          <IconCodeBlock className="mean-svg-icons" />
          <span className="menu-item-text">{t('ui-menus.app-context-menu.code')}</span>
        </a>
      </Menu.Item>
      <Menu.Item key="6">
        <a href={MEAN_FINANCE_DISCORD_URL} target="_blank" rel="noopener noreferrer">
          <IconChat className="mean-svg-icons" />
          <span className="menu-item-text">{t('ui-menus.app-context-menu.discord')}</span>
        </a>
      </Menu.Item>
      <Menu.Item key="7">
        <a href={MEANFI_SUPPORT_URL} target="_blank" rel="noopener noreferrer">
          <IconLiveHelp className="mean-svg-icons" />
          <span className="menu-item-text">{t('ui-menus.app-context-menu.help-support')}</span>
        </a>
      </Menu.Item>
    </Menu>
  );

  return (
    <>
      <Dropdown overlay={menu} trigger={["click"]}>
        <Button
          shape="round"
          type="text"
          size="middle"
          className="ant-btn-shaded"
          onClick={(e) => e.preventDefault()}
          icon={<EllipsisOutlined />}
        ></Button>
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
