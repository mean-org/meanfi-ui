import { EllipsisOutlined } from "@ant-design/icons";
import { Button, Dropdown, Menu, Modal } from "antd";
import { ItemType } from 'antd/lib/menu/hooks/useItems';
import { LanguageSelector } from "components/LanguageSelector";
import { openNotification } from 'components/Notifications';
import { ReferFriendModal } from 'components/ReferFriendModal';
import { LANGUAGES, MEANFI_SUPPORT_URL, MEAN_DAO_GITBOOKS_URL, MEAN_DAO_GITHUB_ORG_URL, MEAN_FINANCE_DISCORD_URL } from "constants/common";
import { AppStateContext } from "contexts/appstate";
import { useWallet } from "contexts/wallet";
import {
  IconBookOpen,
  IconChat,
  IconCodeBlock,
  IconCopy,
  IconLiveHelp,
  IconMoon,
  IconPulse,
  IconSettings,
  IconShareBox
} from "Icons";
import { copyText } from "middleware/ui";
import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from 'react-router-dom';

export const AppContextMenu = () => {

  const { connected } = useWallet();
  const {
    theme,
    diagnosisInfo,
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

  // Diagnosis info modal
  const [isDiagnosisInfoModalVisible, setIsDiagnosisInfoModalVisible] = useState(false);
  const showDiagnosisInfoModal = useCallback(() => setIsDiagnosisInfoModalVisible(true), []);
  const closeDiagnosisInfoModal = useCallback(() => setIsDiagnosisInfoModalVisible(false), []);

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
      return (<IconSettings className="mean-svg-icons" />);
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

  const renderDebugInfo = (
    <div>
      {diagnosisInfo && (
        <>
          {diagnosisInfo.dateTime && (
            <div className="diagnosis-info-item">{diagnosisInfo.dateTime}</div>
          )}
          {diagnosisInfo.clientInfo && (
            <div className="diagnosis-info-item">{diagnosisInfo.clientInfo}</div>
          )}
          {diagnosisInfo.networkInfo && (
            <div className="diagnosis-info-item">{diagnosisInfo.networkInfo}</div>
          )}
          {diagnosisInfo.accountInfo && (
            <div className="diagnosis-info-item">{diagnosisInfo.accountInfo}</div>
          )}
          {diagnosisInfo.appBuildInfo && (
            <div className="diagnosis-info-item">{diagnosisInfo.appBuildInfo}</div>
          )}
        </>
      )}
    </div>
  );

  const onCopyDiagnosisInfo = () => {
    if (!diagnosisInfo) {
      openNotification({
        description: t('account-area.diagnosis-info-not-copied'),
        type: "error"
      });
      return;
    }
    const debugInfo = `${diagnosisInfo.dateTime}\n${diagnosisInfo.clientInfo}\n${diagnosisInfo.networkInfo}\n${diagnosisInfo.accountInfo}\n${diagnosisInfo.appBuildInfo}`;
    if (copyText(debugInfo)) {
      openNotification({
        description: t('account-area.diagnosis-info-copied'),
        type: "info"
      });
    } else {
      openNotification({
        description: t('account-area.diagnosis-info-not-copied'),
        type: "error"
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
      key: '04-diagnosis-info',
      label: (
        <div onClick={showDiagnosisInfoModal}>
          <IconPulse className="mean-svg-icons" />
          <span className="menu-item-text ml-1">{t('account-area.diagnosis-info')}</span>
        </div>
      )
    });
    items.push({
      key: '05-docs',
      label: (
        <a href={MEAN_DAO_GITBOOKS_URL} target="_blank" rel="noopener noreferrer">
          <IconBookOpen className="mean-svg-icons" />
          <span className="menu-item-text">{t('ui-menus.app-context-menu.how-to-use')}</span>
        </a>
      )
    });
    items.push({
      key: '06-code',
      label: (
        <a href={MEAN_DAO_GITHUB_ORG_URL} target="_blank" rel="noopener noreferrer">
          <IconCodeBlock className="mean-svg-icons" />
          <span className="menu-item-text">{t('ui-menus.app-context-menu.code')}</span>
        </a>
      )
    });
    items.push({
      key: '07-discord',
      label: (
        <a href={MEAN_FINANCE_DISCORD_URL} target="_blank" rel="noopener noreferrer">
          <IconChat className="mean-svg-icons" />
          <span className="menu-item-text">{t('ui-menus.app-context-menu.discord')}</span>
        </a>
      )
    });
    items.push({
      key: '08-help',
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
      <Modal
        className="mean-modal simple-modal"
        open={isDiagnosisInfoModalVisible}
        title={<div className="modal-title">{t('account-area.diagnosis-info')}</div>}
        onCancel={closeDiagnosisInfoModal}
        width={450}
        footer={null}>
        <div className="px-4 pb-4">
          {diagnosisInfo && (
            <>
              <div className="mb-3">
                {renderDebugInfo}
              </div>
              <div className="flex-center">
                <Button
                  type="default"
                  shape="round"
                  size="middle"
                  className="thin-stroke"
                  onClick={onCopyDiagnosisInfo}>
                  <IconCopy className="mean-svg-icons" />
                  <span className="icon-button-text">{t('general.cta-copy')}</span>
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
};
