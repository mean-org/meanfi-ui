import React from "react";
import { Button, Popover, Radio, RadioChangeEvent } from "antd";
import { useTranslation } from "react-i18next";
import { SettingOutlined } from "@ant-design/icons";

export const SwapSettings = (props: {
  currentValue: number;
  onValueSelected: any;
}) => {
  const { t } = useTranslation("common");

  const onChangeValue = (e: RadioChangeEvent) => {
    props.onValueSelected(e.target.value);
  }

  const text = <span>{t('swap.transaction-settings')}</span>;
  const content = (
    <div>
      <Radio.Group defaultValue={props.currentValue} onChange={onChangeValue}>
        <Radio.Button value={0.25}>0.1%</Radio.Button>
        <Radio.Button value={0.5}>0.5%</Radio.Button>
        <Radio.Button value={1}>1%</Radio.Button>
        <Radio.Button value={2}>3%</Radio.Button>
      </Radio.Group>
    </div>
  );

  return (
    <>
      <Popover placement="bottom" title={text} content={content} trigger="click">
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
