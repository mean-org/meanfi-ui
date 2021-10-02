import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Redirect, useParams } from "react-router-dom";
import useLocalStorage from "../../hooks/useLocalStorage";
import { ReferralsParams } from "../../types/referrals-params";
import { notify } from "../../utils/notifications";
import { consoleOut, isValidAddress } from "../../utils/ui";

export const ProcessReferals = () => {
    const { t } = useTranslation("common");
    const { address } = useParams<ReferralsParams>();
    const [referralAddress, setReferralAddress] = useLocalStorage('referralAddress', '');
    const [redirect, setRedirect] = useState<string | null>(null);

    useEffect(() => {
        // If redirection is under way, get out
        if (redirect) { return; }

        if (address && isValidAddress(address)) {
            consoleOut('address:', address, 'green');
            setReferralAddress(address);
            notify({
                message: t('notifications.friend-referral-completed'),
                description: t('referrals.address-processed'),
                type: "info"
            });
            setRedirect('/');
        } else {
            consoleOut('Invalid address', '', 'red');
            notify({
                message: t('notifications.error-title'),
                description: t('referrals.address-invalid'),
                type: "error"
            });
            setRedirect('/');
        }
    }, [
        address,
        redirect,
        setReferralAddress,
        t
    ]);

    return <>{redirect && <Redirect to={redirect} />}</>;
};
