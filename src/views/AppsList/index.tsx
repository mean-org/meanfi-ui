import { useCallback, useContext } from 'react';
import { IconMoneyTransfer, IconNoItems, IconSafe, IconStats } from 'src/Icons'
import { IconPaymentStreaming } from 'src/Icons/IconPaymentStreaming';
import { readFromCache } from 'src/cache/persistentCache';
import { AppStateContext } from 'src/contexts/appstate';
import { toUsCurrency } from 'src/middleware/ui';
import { KNOWN_APPS, type KnownAppMetadata, RegisteredAppPaths } from 'src/models/accounts';
import './style.scss';

export const AppsList = (props: {
  isMultisigContext: boolean;
  onAppClick?: (app: KnownAppMetadata) => void;
  selectedApp: KnownAppMetadata | undefined;
}) => {
  const { isMultisigContext, onAppClick, selectedApp } = props;

  const { selectedAccount, paymentStreamingStats } = useContext(AppStateContext);

  const getCachedTvlByApp = useCallback(
    (slug: string) => {
      const cacheEntryKey = `${slug}Tvl`;
      const result = readFromCache(cacheEntryKey);
      if (result === null) {
        return '--';
      }
      return toUsCurrency(+result.data[selectedAccount.address]);
    },
    [selectedAccount.address],
  );

  const getAppIcon = (app: KnownAppMetadata) => {
    if (app.logoURI) {
      return <img src={app.logoURI} alt={`${app.title}`} width={30} height={30} />;
    }

    const classes = 'mean-svg-icons fg-secondary-50';
    const styles = { width: 18, height: 18 };
    let appIcon: React.ReactNode;

    switch (app.slug) {
      case RegisteredAppPaths.Staking:
        appIcon = <IconStats className={classes} style={styles} />;
        break;
      case RegisteredAppPaths.SuperSafe:
        appIcon = <IconSafe className={classes} style={styles} />;
        break;
      case RegisteredAppPaths.Vesting:
        appIcon = <IconMoneyTransfer className={classes} style={styles} />;
        break;
      case RegisteredAppPaths.PaymentStreaming:
        appIcon = <IconPaymentStreaming className={classes} style={styles} />;
        break;
      default:
        appIcon = <IconNoItems className={classes} style={styles} />;
        break;
    }

    return <div className='circle-flex-center bg-whitesmoke'>{appIcon}</div>;
  };

  const getSelectedClass = (app: KnownAppMetadata) => {
    if (
      !app.enabled ||
      (!isMultisigContext && app.slug === RegisteredAppPaths.SuperSafe) ||
      (isMultisigContext && app.slug === RegisteredAppPaths.Staking)
    ) {
      return 'disabled';
    }
    if (selectedApp && selectedApp.slug === app.slug) {
      return 'selected';
    }
    return '';
  };

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
      subtitle +=
        paymentStreamingStats.totalStreamingAccounts === 1
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
  };

  return (
    <>
      <div key='asset-category-apps-items' className='asset-category flex-column apps-list'>
        {KNOWN_APPS.map(app => {
          if (!app.visible) {
            return null;
          } // Skip non visible apps
          return (
            <div
              key={`${app.slug}`}
              onKeyDown={() => {}}
              onClick={() => onAppClick?.(app)}
              id={app.slug}
              className={`transaction-list-row ${getSelectedClass(app)}`}
            >
              <div className='icon-cell'>
                <div className='token-icon'>{getAppIcon(app)}</div>
              </div>
              <div className='description-cell'>
                <div className='title'>{app.title}</div>
                <div className='subtitle text-truncate'>{getAppSubtitle(app)}</div>
              </div>
              <div className='rate-cell'>
                <div className='rate-amount'>{getCachedTvlByApp(app.slug)}</div>
                <div className='interval'>TVL</div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};
