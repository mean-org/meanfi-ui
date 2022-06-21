import React from 'react';

export const VestingContractActivity = (props: {
    param1: any;
    param2: any;
}) => {
    const { param1, param2 } = props;

    return (
        <div className="tab-inner-content-wrapper vertical-scroll">
            <p>Passed-in param1: {param1}</p>
            <p>Passed-in param2: {param2}</p>
        </div>
    );
};
