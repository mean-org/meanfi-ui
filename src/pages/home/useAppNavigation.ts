import { useEffect, useMemo, useState } from 'react';

import { openNotification } from 'components/Notifications';
import { consoleOut } from 'middleware/ui';
import {
  type AccountContext,
  type AccountsPageCategory,
  AssetGroups,
  KNOWN_APPS,
  RegisteredAppPaths,
} from 'models/accounts';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

// Utils
// ---------------------------------------------------------------------------

interface CategoryToAssetsGroupArgs {
  selectedCategory: AccountsPageCategory;
  pathname: string;
}

const categoryToAssetsGroup = ({ selectedCategory, pathname }: CategoryToAssetsGroupArgs) => {
  switch (selectedCategory) {
    case 'nfts':
      return AssetGroups.Nfts;
    case 'apps': {
      if (pathname.startsWith(`/${RegisteredAppPaths.PaymentStreaming}`)) return AssetGroups.Tokens;
      return AssetGroups.Apps;
    }
    case 'other-assets':
      return AssetGroups.OtherAssets;
    default:
      return AssetGroups.Tokens;
  }
};

// Main
// ---------------------------------------------------------------------------
interface Args {
  selectedAccount: AccountContext;
}

const useAppNavigation = ({ selectedAccount }: Args) => {
  const location = useLocation();
  const { pathname } = location;

  const isAccountSummary =
    pathname.startsWith('/my-account') || pathname.startsWith(`/${RegisteredAppPaths.SuperSafe}`);

  const isKnownApp = KNOWN_APPS.some(a => pathname.startsWith(`/${a.slug}`));

  const selectedCategory: AccountsPageCategory = useMemo(() => {
    // The category is inferred from the route path
    if (pathname.startsWith('/programs/')) {
      return 'other-assets';
    }
    if (isAccountSummary) {
      // 1.- If the route starts with my-account or super-safe, set category to "account-summary"
      consoleOut('Setting category:', 'account-summary', 'crimson');
      return 'account-summary';
    }
    if (pathname.startsWith('/assets')) {
      // 2.- If the route starts with assets, set category to "assets"
      consoleOut('Setting category:', 'assets', 'crimson');
      return 'assets';
    }
    if (pathname.startsWith('/nfts')) {
      // 3.- If the route starts with nfts, set category to "nfts"
      consoleOut('Setting category:', 'nfts', 'crimson');
      return 'nfts';
    }
    if (isKnownApp && !isAccountSummary) {
      consoleOut('Setting category:', 'apps', 'crimson');
      return 'apps';
    }
  }, [pathname, isAccountSummary, isKnownApp]);

  // Details Panel
  // ---------------------------------------------------------------------------

  const [detailsPanelOpen, setDetailsPanelOpen] = useState(false);

  useEffect(() => {
    if (pathname === '/') {
      setDetailsPanelOpen(false);
      return;
    }
    if (isAccountSummary) return;
    setDetailsPanelOpen(true);
  }, [pathname, isAccountSummary]);

  const turnOffRightPanel = () => {
    setDetailsPanelOpen(false);
  };
  const turnOnRightPanel = () => {
    setDetailsPanelOpen(true);
  };

  // Tabs
  // ---------------------------------------------------------------------------

  const [selectedAssetsGroup, setSelectedAssetsGroup] = useState<AssetGroups>(
    categoryToAssetsGroup({ selectedCategory, pathname }),
  );

  // Handle route errors
  // ---------------------------------------------------------------------------

  const { streamingTab } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (!selectedAccount.address) return;

    consoleOut('pathname:', pathname, 'crimson');

    // if streaming tab is undefined go to summary
    if (!streamingTab && pathname.startsWith(`/${RegisteredAppPaths.PaymentStreaming}`)) {
      const url = `/${RegisteredAppPaths.PaymentStreaming}/summary`;
      navigate(url);
      return;
    }

    // if opening safe from personal account go to personal account, show error
    if (!selectedAccount.isMultisig && pathname.startsWith(`/${RegisteredAppPaths.SuperSafe}`)) {
      openNotification({
        title: 'Access forbidden',
        description:
          'You are trying to access the SuperSafe App from your personal account. To use the SuperSafe feature please connect with a signer account and try again.',
        type: 'warning',
      });
      navigate('/my-account');
      return;
    }

    // if opening personal account from safe go to safe
    if (selectedAccount.isMultisig && pathname.startsWith('/my-account')) {
      navigate(`/${RegisteredAppPaths.SuperSafe}?v=proposals`);
      return;
    }

    if (
      pathname.startsWith('/programs') ||
      pathname.startsWith('/assets') ||
      pathname.startsWith('/nfts') ||
      pathname.startsWith('/my-account') ||
      isKnownApp
    ) {
      return;
    }

    // Go to account if route is root

    if (pathname === '/') {
      let url = '';
      if (selectedAccount.isMultisig) {
        url = `/${RegisteredAppPaths.SuperSafe}?v=proposals`;
      } else {
        url = '/my-account';
      }

      consoleOut('Root route, redirecting to:', url, 'crimson');

      navigate(url, { replace: true });
      return;
    }

    // if route is not valid, redirect to root
    consoleOut(`Error route(${pathname}), redirecting to:`, '/', 'crimson');

    navigate('/', { replace: true });
  }, [streamingTab, pathname, selectedAccount.address, selectedAccount.isMultisig, isKnownApp, navigate]);

  return {
    selectedCategory,
    selectedAssetsGroup,
    setSelectedAssetsGroup,
    detailsPanelOpen,
    turnOffRightPanel,
    turnOnRightPanel,
  };
};

export default useAppNavigation;
