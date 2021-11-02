import React from "react";
import { useTranslation } from "react-i18next";

export const StepSelector = (props: {
    steps: number;
    step: number;
    onValueSelected: any;
}) => {
    const { t } = useTranslation("common");

    const onChangeValue = (value: number) => {
        props.onValueSelected(value);
    };

    return (
        <div className="stepper-wrapper">
            <div className="flexible-left">
                <div className="left">
                    <span className="stepper-label">{t('general.stepper-label', { step: props.step, steps: props.steps })}</span>
                </div>
                <div className="right">
                    <span className="stepper-handles">
                    {
                        [...Array(props.steps)].map(step => {
                            return <span key={`step-${step}`} className={step === props.step ? 'step-handle active' : 'step-handle'} onClick={() => onChangeValue(step)}>{step}</span>
                        })
                    }
                    </span>
                </div>
            </div>
        </div>
    );
};
