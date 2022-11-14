import React from 'react';
import { useTranslation } from 'react-i18next';

export const StepSelector = (props: {
  steps: number;
  step: number;
  onValueSelected: any;
}) => {
  const { t } = useTranslation('common');

  const onChangeValue = (value: number) => {
    props.onValueSelected(value);
  };

  return (
    <div className="stepper-wrapper">
      <div className="flexible-left">
        <div className="left">
          <span className="stepper-label">
            {t('general.stepper-label', {
              step: props.step + 1,
              steps: props.steps,
            })}
          </span>
        </div>
        <div className="right align-items-center">
          <span className="stepper-handles">
            {[...Array(props.steps)].map((step: any, index: number) => {
              return (
                <div
                  key={`${index + 1}`}
                  className="handle-wrapper"
                  onClick={() => onChangeValue(index)}
                >
                  <span
                    className={
                      index === props.step
                        ? 'step-handle active'
                        : 'step-handle'
                    }
                  ></span>
                </div>
              );
            })}
          </span>
        </div>
      </div>
    </div>
  );
};
