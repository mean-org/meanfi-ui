import React from "react";

export const StepSelector = (props: {
    steps: number;
    step: number;
    onValueSelected: any;
}) => {
    // const { t } = useTranslation("common");

    // const onChangeValue = (value: number) => {
    //     props.onValueSelected(value);
    // };

    return (
        <>
        <div className="flexible-left">
            <div className="left">
                <span>Letf</span>
            </div>
            <div className="right">
                <span>Right</span>
            </div>
        </div>
        </>
    );
};
