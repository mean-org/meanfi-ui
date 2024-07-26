import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import './style.scss';

export const WizardStepSelector = (props: {
  steps: number;
  step: number;
  extraClass?: string;
  onValueSelected: (value: number) => void;
  showLabel?: boolean;
  position?: 'left' | 'right';
}) => {
  const { steps, step, extraClass, position, showLabel, onValueSelected } = props;
  const { t } = useTranslation('common');

  const onChangeValue = useCallback(
    (value: number) => {
      onValueSelected(value);
    },
    [onValueSelected],
  );

  const renderHandles = useCallback(() => {
    return (
      <span className='wizard-stepper-handles'>
        {[...Array(steps)].map((_current, index) => {
          return (
            <div
              key={`${index + 1}`}
              className='handle-wrapper'
              onKeyDown={() => {}}
              onClick={() => onChangeValue(index)}
            >
              <span className={`step-handle${index === step ? ' active' : ''}`} />
            </div>
          );
        })}
      </span>
    );
  }, [onChangeValue, step, steps]);

  return (
    <div className={`wizard-stepper-wrapper ${extraClass ? extraClass : ''}`}>
      {position && position === 'right' ? (
        <div className='flexible-right'>
          <div className='left'>
            {showLabel ? (
              <span className='wizard-stepper-label'>
                {t('general.stepper-label', { step: step + 1, steps: steps })}
              </span>
            ) : (
              <span className='wizard-stepper-label'>&nbsp;</span>
            )}
          </div>
          <div className='right align-items-center'>{renderHandles()}</div>
        </div>
      ) : (
        <div className='flexible-left'>
          <div className='left align-items-center'>{renderHandles()}</div>
          <div className='right'>
            {showLabel ? (
              <span className='wizard-stepper-label'>
                {t('general.stepper-label', { step: step + 1, steps: steps })}
              </span>
            ) : (
              <span className='wizard-stepper-label'>&nbsp;</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
