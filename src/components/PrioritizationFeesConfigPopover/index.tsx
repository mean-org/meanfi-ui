import { useEffect, useMemo, useState } from 'react';

import { IconCross, IconGasStation } from 'Icons';
import { Button, Popover, Segmented } from 'antd';
import { SegmentedValue } from 'antd/lib/segmented';
import useWindowSize from 'hooks/useWindowResize';
import {
  COMPUTE_UNIT_PRICE,
  ComputeBudgetConfig,
  DEFAULT_BUDGET_CONFIG,
  PriorityOption,
} from 'middleware/transactions';
import { useTranslation } from 'react-i18next';
import useLocalStorage from 'hooks/useLocalStorage';
import { consoleOut } from 'middleware/ui';
import { formatThousands } from 'middleware/utils';

interface PopoverContentProps {
  transactionPriorityOptions: ComputeBudgetConfig;
  onOptionChanged: (val: SegmentedValue) => void;
}

const PopoverContent = ({ transactionPriorityOptions, onOptionChanged }: PopoverContentProps) => {
  const { t } = useTranslation('common');

  const priorityDescription = useMemo(() => {
    switch (transactionPriorityOptions.priorityOption) {
      case 'basic':
        return t('priority-fees.priority-basic-description');
      case 'standard':
        return t('priority-fees.priority-standard-description');
      case 'fast':
        return t('priority-fees.priority-fast-description');
      default:
        return '';
    }
  }, [transactionPriorityOptions.priorityOption, t]);

  return (
    <div className="container-max-width-360">
      <p>{t('priority-fees.prioritization-overview')}</p>
      <div className="inner-label">{t('priority-fees.selector-label')}</div>
      <Segmented
        block
        options={[
          { label: t('priority-fees.priority-basic-label'), value: 'basic' },
          { label: t('priority-fees.priority-standard-label'), value: 'standard' },
          { label: t('priority-fees.priority-fast-label'), value: 'fast' },
        ]}
        value={transactionPriorityOptions.priorityOption}
        onChange={onOptionChanged}
      />
      <p className="mt-3">{priorityDescription}</p>
    </div>
  );
};

const PrioritizationFeesConfigPopover = () => {
  const { t } = useTranslation('common');
  const { width } = useWindowSize();

  const [transactionPriorityOptions, setTransactionPriorityOptions] = useLocalStorage<ComputeBudgetConfig>(
    'transactionPriority',
    DEFAULT_BUDGET_CONFIG,
  );
  const [popoverVisible, setPopoverVisible] = useState(false);

  const isSmScreen = (): boolean => {
    return width < 768;
  };

  const handlePopoverVisibleChange = (visibleChange: boolean) => {
    setPopoverVisible(visibleChange);
  };

  const handleOptionChamge = (val: SegmentedValue) => {
    consoleOut('Prioritization:', val, 'blue');
    const newOptions: ComputeBudgetConfig = {
      cap: transactionPriorityOptions.cap,
      priorityOption: val as PriorityOption,
    };
    consoleOut(
      'Compute Unit Price:',
      `${formatThousands(COMPUTE_UNIT_PRICE[newOptions.priorityOption])} microlamports`,
      'blue',
    );
    setTransactionPriorityOptions(newOptions);
  };

  useEffect(() => {
    if (popoverVisible) {
      let o = transactionPriorityOptions.priorityOption;
      const isOptionOk = o === 'basic' || o === 'standard' || o === 'fast';

      // Do nothing if value is in range
      if (isOptionOk) return;

      o = 'standard';

      consoleOut('Transaction Priority option:', o, 'darkorange');
      consoleOut('Compute Unit price:', `${formatThousands(COMPUTE_UNIT_PRICE[o])} microlamports`, 'darkorange');

      const newOptions: ComputeBudgetConfig = {
        cap: transactionPriorityOptions.cap,
        priorityOption: o as PriorityOption,
      };
      setTransactionPriorityOptions(newOptions);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popoverVisible]);

  return (
    <Popover
      placement={isSmScreen() ? 'bottomRight' : 'bottom'}
      title={
        <div className="flexible-left container-max-width-360">
          <div className="left">{t('priority-fees.priority-settings-title')}</div>
          <div className="right">
            <span className="icon-button-container">
              <Button
                type="default"
                shape="circle"
                size="middle"
                icon={<IconCross className="mean-svg-icons" />}
                onClick={() => handlePopoverVisibleChange(false)}
              />
            </span>
          </div>
        </div>
      }
      content={
        <PopoverContent transactionPriorityOptions={transactionPriorityOptions} onOptionChanged={handleOptionChamge} />
      }
      open={popoverVisible}
      onOpenChange={handlePopoverVisibleChange}
      trigger="click"
    >
      <Button shape="round" type="text" size="large" icon={<IconGasStation className="mean-svg-icons" />} />
    </Popover>
  );
};

export default PrioritizationFeesConfigPopover;
