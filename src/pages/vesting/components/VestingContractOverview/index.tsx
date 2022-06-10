import { Treasury } from '@mean-dao/msp';
import React from 'react';

export const VestingContractOverview = (props: {
    vestingContract: Treasury | undefined;
}) => {
    const { vestingContract } = props;

    return (
        <>
            {vestingContract && (
                <div>
                    <p>Here is where!</p>
                </div>
            )}
        </>
    );
};
