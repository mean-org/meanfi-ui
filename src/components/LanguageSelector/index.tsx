import React, { useEffect, useState } from "react";
import { Modal } from "antd";
import { useTranslation } from "react-i18next";
import { LANGUAGES } from "../../constants";
import "./style.less";

export const LanguageSelector = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
}) => {
  const { t, i18n } = useTranslation("common");
  const [selectedLanguage] = useState<string>(i18n.language);
  const [language, setLanguage] = useState<string>("");

  const changeLanguageByCode = (code: string) => {
    if (language === code) {
      props.handleClose();
    } else {
      setLanguage(code);
      props.handleOk(code);
    }
  }

  useEffect(() => {
    if (!language && selectedLanguage) {
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

  return (
    <Modal
      className="mean-modal simple-modal"
      title={
        <div className="modal-title">{t("language-selector.modal-title")}</div>
      }
      footer={null}
      visible={props.isVisible}
      onOk={props.handleOk}
      onCancel={props.handleClose}
      width={300}>
      <div className="language-select">
        <div className="item-list-body medium">
          {LANGUAGES && LANGUAGES.map(item => {
            return (
              <div
                key={item.code}
                className={item.code === language ? 'item-list-row selected' : 'item-list-row simplelink'}
                onClick={() => changeLanguageByCode(item.code)}>
                <div className="std-table-cell first-cell">
                  <span className="flag-wrapper">
                    <img src={item.flag} alt={getLanguageCode(item.code)} />
                  </span>
                </div>
                <div className="std-table-cell responsive-cell">{item.name}</div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
};
