import { useEffect, useMemo, useState } from 'react';

import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { consoleOut } from 'src/middleware/ui';
import {
  type AccountContext,
  type AccountsPageCategory,
  AssetGroups,
  KNOWN_APPS,
  RegisteredAppPaths,
} from 'src/models/accounts';

// Utils
// ---------------------------------------------------------------------------

interface CategoryToAssetsGroupArgs {
  selectedCategory: AccountsPageCategory;
  pathname: string;
}

const categoryToAssetsGroup = ({ selectedCategory, pathname }: CategoryToAssetsGroupArgs) => {
  switch (selectedCategory) {
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
      pathname.startsWith('/my-account') ||
      isKnownApp
    ) {
      return;
    }

    // Go to account if route is root

    if (pathname === '/') {
      const url = selectedAccount.isMultisig ? `/${RegisteredAppPaths.SuperSafe}?v=proposals` : '/my-account';

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
