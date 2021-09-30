import React from 'react';
import { Modal } from "antd";
import { CheckOutlined } from "@ant-design/icons";
import { useContext } from "react";
import { AppStateContext } from "../../contexts/appstate";
import { useTranslation } from "react-i18next";
import { DDCA_FREQUENCY_OPTIONS } from '../../constants/ddca-frequency-options';
import { DdcaFrequencyOption } from '../../models/ddca-models';
import { getOrdinalDay } from '../../utils/ui';

export const DdcaFrequencySelectorModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
}) => {
  const { ddcaOption, setDdcaOption } = useContext(AppStateContext);
  const { t } = useTranslation('common');

  const handleSelection = (option: DdcaFrequencyOption) => {
    setDdcaOption(option.name);
    props.handleOk();
  }

  const contractsList = (
    <div className="items-card-list vertical-scroll">
      {DDCA_FREQUENCY_OPTIONS.map(option => {
        return (
          <div key={`${option.value}`} className={`item-card ${option.name === ddcaOption?.name
            ? "selected"
            : option.disabled
            ? "disabled"
            : ""
          }`}
          onClick={() => {
            if (!option.disabled) {
              handleSelection(option);
            }
          }}>
            <div className="checkmark">
              <CheckOutlined />
            </div>
            <div className="item-meta">
              <div className="item-name">{t(`ddca-selector.${option.translationId}.name`)}</div>
              <div className="item-description">{t(`ddca-selector.${option.translationId}.description`, { ordinalDay: getOrdinalDay() })}</div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <Modal
      className="mean-modal"
      title={<div className="modal-title">{t('ddca-selector.modal-title')}</div>}
      footer={null}
      visible={props.isVisible}
      onOk={props.handleOk}
      onCancel={props.handleClose}
      width={480}>
      {contractsList}
    </Modal>
  );
};
