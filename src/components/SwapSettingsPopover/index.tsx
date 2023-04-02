import { CloseOutlined, InfoCircleOutlined, SettingOutlined } from '@ant-design/icons';
import { Button, InputNumber, Popover, Switch } from 'antd';
import { InfoIcon } from 'components/InfoIcon';
import { MAX_SLIPPAGE_VALUE, MIN_SLIPPAGE_VALUE } from 'constants/common';
import useWindowSize from 'hooks/useWindowResize';
import { SwapSettings } from 'models/ExchangeSettings';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  currentValue: SwapSettings;
  onSettingsChanged: (value: SwapSettings) => void;
}

export const SwapSettingsPopover = ({ currentValue, onSettingsChanged }: Props) => {
  const { t } = useTranslation('common');
  const { width } = useWindowSize();
  const [popoverVisible, setPopoverVisible] = useState(false);
  const [settings, setSettings] = useState<SwapSettings>();

  const isSmScreen = (): boolean => {
    return width < 768 ? true : false;
  };

  const onSlippageChange = useCallback(
    (value: number | null) => {
      let adjustedValue = 0;

      if (!value || value < 0.1) {
        adjustedValue = 0.1;
      } else if (value > 20) {
        adjustedValue = 20;
      } else {
        adjustedValue = value;
      }

      const updatedSettings = Object.assign({}, settings, { slippage: adjustedValue });
      setSettings(updatedSettings);
      onSettingsChanged(updatedSettings);
    },
    [onSettingsChanged, settings],
  );

  const onDirectRoutesChanged = useCallback(
    (value: boolean) => {
      const updatedSettings = Object.assign({}, settings, { onlyDirectRoutes: value });
      setSettings(updatedSettings);
      onSettingsChanged(updatedSettings);
    },
    [onSettingsChanged, settings],
  );

  const onVersionedTxsChanged = useCallback(
    (value: boolean) => {
      const updatedSettings = Object.assign({}, settings, { versionedTxs: value });
      setSettings(updatedSettings);
      onSettingsChanged(updatedSettings);
    },
    [onSettingsChanged, settings],
  );

  const handlePopoverVisibleChange = (visibleChange: boolean) => {
    setPopoverVisible(visibleChange);
  };

  // Get value from parent component everytime the popover is opened
  useEffect(() => {
    if (popoverVisible && currentValue) {
      setSettings(currentValue);
    }
  }, [currentValue, popoverVisible]);

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

  const bodyContent = () => {
    if (!settings) {
      return <div className="inner-label">Loading...</div>;
    }

    return (
      <div className="exchange-settings-popover-container">
        <div className="inner-label">{t('swap.slippage-tolerance')}</div>
        <div className="flexible-left mb-2">
          <div className="left token-group">
            <div key="preset-02" className="token-max simplelink" onClick={() => onSlippageChange(0.5)}>
              0.5%
            </div>
            <div key="preset-03" className="token-max simplelink" onClick={() => onSlippageChange(1)}>
              1%
            </div>
            <div key="preset-04" className="token-max simplelink" onClick={() => onSlippageChange(2)}>
              2%
            </div>
          </div>
          <div className="right position-relative">
            <InputNumber
              style={{ width: '4.6rem' }}
              min={MIN_SLIPPAGE_VALUE}
              max={MAX_SLIPPAGE_VALUE}
              step={0.1}
              value={settings.slippage}
              onChange={onSlippageChange}
            />
            <span className="leading-percent">%</span>
          </div>
        </div>
        <div className="flexible-left mb-2">
          <div className="left flex-row justify-content-start align-items-center">
            <div className="inner-label w-auto my-0">{t('swap.settings-direct-route')}</div>
            <InfoIcon content={<span>{t('swap.settings-direct-route-help')}</span>} placement="bottom">
              <InfoCircleOutlined style={{ lineHeight: 0 }} />
            </InfoIcon>
          </div>
          <div className="right flex-row align-items-center">
            <Switch size="small" checked={settings.onlyDirectRoutes} onChange={onDirectRoutesChanged} />
          </div>
        </div>
        <div className="flexible-left mb-2">
          <div className="left flex-row justify-content-start align-items-center">
            <div className="inner-label w-auto my-0">{t('swap.settings-versioned-tx')}</div>
            <InfoIcon content={<span>{t('swap.settings-versioned-tx-help')}</span>} placement="bottom">
              <InfoCircleOutlined style={{ lineHeight: 0 }} />
            </InfoIcon>
          </div>
          <div className="right flex-row align-items-center">
            <Switch size="small" checked={settings.versionedTxs} onChange={onVersionedTxsChanged} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <Popover
        placement={isSmScreen() ? 'bottomRight' : 'bottom'}
        title={titleContent}
        content={bodyContent()}
        open={popoverVisible}
        onOpenChange={handlePopoverVisibleChange}
        trigger="click"
      >
        <Button shape="round" type="text" size="large" className="settings-button" icon={<SettingOutlined />}></Button>
      </Popover>
    </>
  );
};
