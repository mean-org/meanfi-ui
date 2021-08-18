import React, { useEffect, useState } from "react";
import { Button, Divider, Modal, Radio, Space } from "antd";
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

  const onChange = (e: any) => {
    setLanguage(e.target.value);
  };

  useEffect(() => {
    if (!language && selectedLanguage) {
      setLanguage(getLanguageCode(selectedLanguage));
    }
  }, [language, selectedLanguage]);

  const onAcceptLanguageSelection = () => {
    props.handleOk(language);
  };

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
        <Radio.Group onChange={onChange} value={language}>
          <Space direction="vertical">
            {LANGUAGES && LANGUAGES.map(item => {
                return (
                    <Radio key={item.code} value={item.code}>
                      <span className="flag-wrapper">
                        <img src={item.flag} alt={getLanguageCode(item.code)} />
                      </span>
                      {t(`ui-language.${getLanguageCode(item.code)}`)}
                    </Radio>
                );
            })}
          </Space>
        </Radio.Group>
        <Divider plain></Divider>
        <div className="text-center mt-3">
            <Button
            type="primary"
            shape="round"
            size="large"
            onClick={onAcceptLanguageSelection}>
            {t("language-selector.primary-action")}
            </Button>
        </div>
      </div>
    </Modal>
  );
};
