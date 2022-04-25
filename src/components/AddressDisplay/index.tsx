import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { IconExternalLink } from '../../Icons';
import { copyText } from '../../utils/ui';
import { shortenAddress } from '../../utils/utils';
import { openNotification } from '../Notifications';

export const AddressDisplay = (props: {
    address: string;
    linkText?: string;
    newTabLink?: string;
    newTabIcon?: JSX.Element;
    className?: string;
    style?: React.CSSProperties;
    iconStyles?: React.CSSProperties;
}) => {
    const { address, linkText, newTabIcon, newTabLink, className, style, iconStyles } = props;
    const { t } = useTranslation('common');

    // Copy address to clipboard
    const copyAddressToClipboard = useCallback((address: any) => {

        if (!address) { return; }

        if (copyText(address.toString())) {
            openNotification({
                description: t('notifications.account-address-copied-message'),
                type: "info"
            });
        } else {
            openNotification({
                description: t('notifications.account-address-not-copied-message'),
                type: "error"
            });
        }

    }, [t])

    if (!address) { return null; }

    return (
        <div className="address-display flex-fixed-left align-items-center">
            <div onClick={() => copyAddressToClipboard(linkText || address)}
                className={`left ${className || 'simplelink underline-on-hover'}`}
                style={style}>
                {linkText ? linkText : shortenAddress(address, 8)}
            </div>
            {newTabLink && (
                <div className="right" style={{ marginLeft: "4px" }}>
                    <a className="simplelink" target="_blank" rel="noopener noreferrer" href={newTabLink}>
                        {newTabIcon ? newTabIcon : <IconExternalLink className="mean-svg-icons" style={iconStyles} />}
                    </a>
                </div>
            )}
        </div>
    );
}
