import React from "react";
import { Button, InputNumber, Popover } from "antd";
import { useTranslation } from "react-i18next";
import { SettingOutlined } from "@ant-design/icons";
import useWindowSize from "../../hooks/useWindowResize";
import { MAX_SLIPPAGE_VALUE, MIN_SLIPPAGE_VALUE } from "../../constants";

export const SwapSettings = (props: {
  currentValue: number;
  onValueSelected: any;
}) => {
  const { t } = useTranslation("common");
  const { width } = useWindowSize();

  const isSmScreen = ():boolean => {
    return width < 768 ? true : false;
  }

  const onChangeValue = (value: number) => {
    props.onValueSelected(value);
  }

  const onChange = (value: number) => {
    if (!value || value < 0.1) {
      props.onValueSelected(0.1);
    } else if (value > 20) {
      props.onValueSelected(20);
    } else {
      props.onValueSelected(value);
    }
  }

  const text = <span>{t('swap.transaction-settings')}</span>;
  const content = (
    <div className="flexible-left">
      <div className="left token-group">
        <div key="preset-01" className="token-max simplelink" onClick={() => onChangeValue(0.25)}>0.25%</div>
        <div key="preset-02" className="token-max simplelink" onClick={() => onChangeValue(0.5)}>0.5%</div>
        <div key="preset-03" className="token-max simplelink" onClick={() => onChangeValue(1)}>1%</div>
        <div key="preset-04" className="token-max simplelink" onClick={() => onChangeValue(2)}>2%</div>
      </div>
      <div className="right">
        <InputNumber
          style={{ width: 100 }}
          min={MIN_SLIPPAGE_VALUE}
          max={MAX_SLIPPAGE_VALUE}
          step={0.1}
          value={props.currentValue}
          onChange={onChange}
        />
      </div>
    </div>
  );

  return (
    <>
      <Popover placement={isSmScreen() ? "bottomRight" : 'bottom'} title={text} content={content} trigger="click">
        <Button
          shape="round"
          type="text"
          size="large"
          className="settings-button"
          icon={<SettingOutlined />}
        ></Button>
      </Popover>
    </>
  );
};
