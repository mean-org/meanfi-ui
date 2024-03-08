import { useMemo, useState } from 'react';

import { CloseOutlined } from '@ant-design/icons';
import { IconGasStation } from 'Icons';
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
      case 'disabled':
        return t('priority-fees.priority-disabled-description');
      case 'normal':
        return t('priority-fees.priority-normal-description');
      case 'fast':
        return t('priority-fees.priority-fast-description');
      case 'turbo':
        return t('priority-fees.priority-turbo-description');
      case 'ultra':
        return t('priority-fees.priority-ultra-description');
      default:
        return '';
    }
  }, [transactionPriorityOptions.priorityOption, t]);

  return (
    <div className="container-max-width-450">
      <p>{t('priority-fees.prioritization-overview')}</p>
      <div className="inner-label">{t('priority-fees.selector-label')}</div>
      <Segmented
        block
        options={[
          { label: t('priority-fees.priority-disabled-label'), value: 'disabled' },
          { label: t('priority-fees.priority-normal-label'), value: 'normal' },
          { label: t('priority-fees.priority-fast-label'), value: 'fast' },
          { label: t('priority-fees.priority-turbo-label'), value: 'turbo' },
          { label: t('priority-fees.priority-ultra-label'), value: 'ultra' },
        ]}
        value={transactionPriorityOptions.priorityOption}
        onChange={onOptionChanged}
      />
      <p className="mt-3">{priorityDescription}</p>
      <p>{t('priority-fees.priority-disclaimer')}</p>
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

  return (
    <Popover
      placement={isSmScreen() ? 'bottomRight' : 'bottom'}
      title={
        <div className="flexible-left container-max-width-450">
          <div className="left">{t('priority-fees.priority-settings-title')}</div>
          <div className="right">
            <Button
              type="default"
              shape="circle"
              icon={<CloseOutlined />}
              onClick={() => handlePopoverVisibleChange(false)}
            />
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
