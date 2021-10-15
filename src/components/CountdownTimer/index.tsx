import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export const CountdownTimer = (props: {
    val: number;
    onFinished?: any;
}) => {
    const { t } = useTranslation('common');
    const [timeLeft, setTimeLeft] = useState<number | null>(props.val);

    useEffect(() => {
        if (timeLeft === 0) {
            setTimeLeft(null);
            if (props.onFinished) {
                props.onFinished();
            }
        }

        // exit early when we reach 0
        if (!timeLeft) return;

        // save intervalId to clear the interval when the
        // component re-renders
        const intervalId = setInterval(() => {
            setTimeLeft(timeLeft - 1);
        }, 1000);

        // clear interval on re-render to avoid memory leaks
        return () => clearInterval(intervalId);
        // add timeLeft as a dependency to re-rerun the effect
        // when we update it
    }, [
        props,
        timeLeft
    ]);

    return <span style={{marginLeft: '0.2rem'}}>{timeLeft || 0} {t('general.seconds')}</span>
}
