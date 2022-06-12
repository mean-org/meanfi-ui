import { Stream } from '@mean-dao/msp';
import React from 'react';

export const VestingContractStreamList = (props: {
    treasuryStreams: Stream[];
    loadingTreasuryStreams: boolean;
}) => {
    const { treasuryStreams, loadingTreasuryStreams } = props;

    return (
        <>
            <p>Tab 2</p>
        </>
    );
};
