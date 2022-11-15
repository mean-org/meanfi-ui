import { CloseOutlined, SettingOutlined } from '@ant-design/icons';
import { Button, InputNumber, Popover } from 'antd';
import { MAX_SLIPPAGE_VALUE, MIN_SLIPPAGE_VALUE } from 'constants/common';
import useWindowSize from 'hooks/useWindowResize';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export const SwapSettings = (props: {
  currentValue: number;
  onValueSelected: any;
}) => {
  const { t } = useTranslation('common');
  const { width } = useWindowSize();
  const [popoverVisible, setPopoverVisible] = useState(false);

  const isSmScreen = (): boolean => {
    return width < 768 ? true : false;
  };

  const onChangeValue = (value: number) => {
    props.onValueSelected(value);
  };

  const onChange = (value: number | null) => {
    if (!value || value < 0.1) {
      props.onValueSelected(0.1);
    } else if (value > 20) {
      props.onValueSelected(20);
    } else {
      props.onValueSelected(value);
    }
  };

  const handlePopoverVisibleChange = (visibleChange: boolean) => {
    setPopoverVisible(visibleChange);
  };

  const titleContent = (
    <div className="flexible-left">
      <div className="left">{t('swap.transaction-settings')}</div>
      <div className="right">
        <Button
          type="default"
          shape="circle"
          icon={<CloseOutlined />}
          onClick={() => handlePopoverVisibleChange(false)}
        />
      </div>
    </div>
  );

  const bodyContent = (
    <>
      <div className="inner-label">{t('swap.slippage-tolerance')}</div>
      <div className="flexible-left">
        <div className="left token-group">
          <div
            key="preset-02"
            className="token-max simplelink"
            onClick={() => onChangeValue(0.5)}
          >
            0.5%
          </div>
          <div
            key="preset-03"
            className="token-max simplelink"
            onClick={() => onChangeValue(1)}
          >
            1%
          </div>
          <div
            key="preset-04"
            className="token-max simplelink"
            onClick={() => onChangeValue(2)}
          >
            2%
          </div>
        </div>
        <div className="right position-relative">
          <InputNumber
            style={{ width: '4.6rem' }}
            min={MIN_SLIPPAGE_VALUE}
            max={MAX_SLIPPAGE_VALUE}
            step={0.1}
            value={props.currentValue}
            onChange={onChange}
          />
          <span className="leading-percent">%</span>
        </div>
      </div>
    </>
  );

  return (
    <>
      <Popover
        placement={isSmScreen() ? 'bottomRight' : 'bottom'}
        title={titleContent}
        content={bodyContent}
        open={popoverVisible}
        onOpenChange={handlePopoverVisibleChange}
        trigger="click"
      >
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
