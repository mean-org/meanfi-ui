import { readFromCache } from "cache/persistentCache";
import { fallbackImgSrc } from "constants/common";
import { AppStateContext } from "contexts/appstate";
import { IconNoItems } from "Icons";
import { toUsCurrency } from "middleware/ui";
import { KnownAppMetadata, KNOWN_APPS, RegisteredAppPaths } from "models/accounts";
import { useCallback, useContext } from "react";
import { useTranslation } from "react-i18next";

export const AppsList = (props: {
    isMultisigContext: boolean;
    onAppClick?: any;
    selectedApp: KnownAppMetadata | undefined;
}) => {

    const {
        isMultisigContext,
        onAppClick,
        selectedApp,
    } = props;

    const {
        selectedAccount,
        paymentStreamingStats,
    } = useContext(AppStateContext);

    const { t } = useTranslation('common');

    const getCachedTvlByApp = useCallback((slug: string) => {
        const cacheEntryKey = `${slug}Tvl`;
        const result = readFromCache(cacheEntryKey);
        if (result === null) {
            return '--';
        }
        return toUsCurrency(+result.data[selectedAccount.address]);
    },[selectedAccount.address]);

    const getSelectedClass = (app: KnownAppMetadata) => {
        if (!app.enabled ||
            (!isMultisigContext && app.slug === RegisteredAppPaths.SuperSafe) ||
            (isMultisigContext && app.slug === RegisteredAppPaths.Staking)) {
            return 'disabled';
        }
        if (selectedApp && selectedApp.slug === app.slug) {
            return 'selected';
        }
        return '';
    }

    const getAppSubtitle = (app: KnownAppMetadata) => {
        if (app.slug !== RegisteredAppPaths.PaymentStreaming) {
            return app.subTitle;
        }

        if (
            paymentStreamingStats.totalStreamingAccounts === 0 &&
            paymentStreamingStats.incomingAmount === 0 &&
            paymentStreamingStats.outgoingAmount === 0
        ) {
            return app.subTitle;
        }

        let subtitle = '';
        if (paymentStreamingStats.totalStreamingAccounts > 0) {
            subtitle += paymentStreamingStats.totalStreamingAccounts === 1
                ? '1 account'
                : `${paymentStreamingStats.totalStreamingAccounts} accounts`;
        }

        const streams = `${paymentStreamingStats.incomingAmount} incoming streams, ${paymentStreamingStats.outgoingAmount} outgoing streams`;
        if (paymentStreamingStats.totalStreamingAccounts > 0) {
            subtitle += '. ' + streams;
        } else {
            subtitle += streams;
        }

        return subtitle;
    }

    return (
        <>
            <div key="asset-category-apps-items" className="asset-category flex-column">
                {KNOWN_APPS.map(app => {
                    if (!app.visible) { return null; }  // Skip non visible apps
                    return (
                        <div key={`${app.slug}`}
                            onClick={() => onAppClick(app)}
                            id={app.slug}
                            className={`transaction-list-row ${getSelectedClass(app)}`
                            }>
                            <div className="icon-cell">
                                <div className="token-icon">
                                    {app.logoURI ? (
                                        <img src={app.logoURI} alt={`${app.title}`} width={30} height={30} />
                                    ) : (
                                        <IconNoItems className="mean-svg-icons fg-secondary-50" style={{ width: 20, height: 20 }} />
                                    )}
                                </div>
                            </div>
                            <div className="description-cell">
                                <div className="title">
                                    {app.title}
                                </div>
                                <div className="subtitle text-truncate">{getAppSubtitle(app)}</div>
                            </div>
                            <div className="rate-cell">
                                <div className="rate-amount">
                                    {getCachedTvlByApp(app.slug)}
                                </div>
                                <div className="interval">TVL</div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </>
    );
}
