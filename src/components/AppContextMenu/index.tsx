import { Link } from "react-router-dom";
import { Button, Dropdown, Menu } from "antd";
import { EllipsisOutlined } from "@ant-design/icons";
import {
  IconBookOpen,
  IconChat,
  IconCodeBlock,
  IconInfoCircle,
  IconLogout,
  IconMoon,
  IconSettings,
  IconUniversity,
} from "../../Icons";
import { useWallet } from "../../contexts/wallet";
import { useCallback, useContext, useEffect, useState } from "react";
import { AppStateContext } from "../../contexts/appstate";
import { MEAN_FINANCE_DISCORD_URL, MEAN_FINANCE_WEBSITE_URL } from "../../constants";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "../LanguageSelector";

export const AppContextMenu = () => {

  const { connected, disconnect, resetWalletProvider } = useWallet();
  const {
    theme,
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

  // Close stream modal
  const [isLanguageModalVisible, setIsLanguageModalVisibility] = useState(false);
  const showLanguageModal = useCallback(() => setIsLanguageModalVisibility(true), []);
  const hideLanguageModal = useCallback(() => setIsLanguageModalVisibility(false), []);
  const onAcceptLanguage = (e: any) => {
    hideLanguageModal();
    i18n.changeLanguage(e);
    setLanguage(e);
  };

  const onDisconnectWallet = () => {
    disconnect();
    resetWalletProvider();
    setSelectedStream(undefined);
    setStreamList(undefined);
  }

  const onSwitchTheme = () => {
    if (theme === 'light') {
      setTheme('dark');
    } else {
      setTheme('light');
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
          <IconSettings className="mean-svg-icons" />
          <span className="menu-item-text">{t('ui-menus.app-context-menu.switch-language')}: {t(`ui-language.${getLanguageCode(language)}`)}</span>
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item key="3">
        <a href={MEAN_FINANCE_WEBSITE_URL} target="_blank" rel="noopener noreferrer">
          <IconInfoCircle className="mean-svg-icons" />
          <span className="menu-item-text">{t('ui-menus.app-context-menu.about')}</span>
        </a>
      </Menu.Item>
      <Menu.Item key="4">
        <a href="https://www.someplace.com">
          <IconUniversity className="mean-svg-icons" />
          <span className="menu-item-text">{t('ui-menus.app-context-menu.how-to-use')}</span>
        </a>
      </Menu.Item>
      <Menu.Item key="5">
        <a href="https://www.someplace.com">
          <IconBookOpen className="mean-svg-icons" />
          <span className="menu-item-text">{t('ui-menus.app-context-menu.developers')}</span>
        </a>
      </Menu.Item>
      <Menu.Item key="6">
        <a href="https://www.someplace.com">
          <IconCodeBlock className="mean-svg-icons" />
          <span className="menu-item-text">{t('ui-menus.app-context-menu.code')}</span>
        </a>
      </Menu.Item>
      <Menu.Item key="7">
        <a href={MEAN_FINANCE_DISCORD_URL} target="_blank" rel="noopener noreferrer">
          <IconChat className="mean-svg-icons" />
          <span className="menu-item-text">{t('ui-menus.app-context-menu.discord')}</span>
        </a>
      </Menu.Item>
      {connected && (
        <Menu.Item key="9" onClick={onDisconnectWallet}>
          <IconLogout className="mean-svg-icons" />
          <span className="menu-item-text">{t('ui-menus.app-context-menu.disconnect')}</span>
        </Menu.Item>
      )}
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
    </>
  );
};
