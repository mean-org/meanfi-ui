import { useTranslation } from 'react-i18next';

interface StepSelectorProps {
  steps: number;
  step: number;
  onValueSelected: (value: number) => void;
}

export const StepSelector = ({ steps, step, onValueSelected }: StepSelectorProps) => {
  const { t } = useTranslation('common');

  const onChangeValue = (value: number) => {
    onValueSelected(value);
  };

  return (
    <div className='stepper-wrapper'>
      <div className='flexible-left'>
        <div className='left'>
          <span className='stepper-label'>
            {t('general.stepper-label', {
              step: step + 1,
              steps: steps,
            })}
          </span>
        </div>
        <div className='right align-items-center'>
          <span className='stepper-handles'>
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
        </div>
      </div>
    </div>
  );
};
