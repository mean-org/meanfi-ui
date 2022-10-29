import { readFromCache } from "cache/persistentCache";
import { fallbackImgSrc } from "constants/common";
import { AppStateContext } from "contexts/appstate";
import { toUsCurrency } from "middleware/ui";
import { KnownAppMetadata, KNOWN_APPS, RegisteredAppPaths } from "models/accounts";
import { useCallback, useContext } from "react";

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
    } = useContext(AppStateContext);

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
                                        <img src={fallbackImgSrc} alt={`${app.title}`} width={30} height={30} />
                                    )}
                                </div>
                            </div>
                            <div className="description-cell">
                                <div className="title">
                                    {app.title}
                                </div>
                                <div className="subtitle text-truncate">{app.subTitle}</div>
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
