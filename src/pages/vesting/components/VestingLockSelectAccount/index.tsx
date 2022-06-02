import React from 'react';

export const VestingLockSelectAccount = (props: {
    items: any[];
}) => {
    const { items } = props;

    return (
        <>
            <ul>
                {items.map((item, index) => {
                    return (
                        <li key={`vla-${index}`}>{item}</li>
                    );
                })}
            </ul>
        </>
    );
};
