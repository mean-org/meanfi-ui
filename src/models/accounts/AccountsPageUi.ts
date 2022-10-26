export type AccountsPageCategory = "account-summary" | "assets" | "apps" | "other-assets" | undefined;

export enum MetaInfoCtaAction {
    Send = 0,
    Buy = 1,
    Exchange = 2,
    Invest = 3,
    Deposit = 4,
    UnwrapSol = 5,
    WrapSol = 6,
    MergeAccounts = 7,
    Divider = 10,
    Refresh = 11,
    CloseAccount = 12,
    Share = 13,
    Close = 14,
    CopyAssetMintAddress = 15,
    VestingContractCreateStreamOnce = 20,
    VestingContractCreateStreamBulk = 21,
    VestingContractAddFunds = 21,
    VestingContractViewSolBalance = 22,
    VestingContractWithdrawFunds = 23,
    VestingContractRefreshAccount = 24,
    VestingContractClose = 25,
    VestingContractEditSettings = 26,
}

export enum AssetGroups {
    Tokens = "tokens",
    Nfts = "nfts",
    Apps = "apps",
    OtherAssets = "other-assets",
}

export enum RegisteredAppPaths {
    Staking = "staking",
    PaymentStreaming = "streaming",
    Vesting = "vesting",
    SuperSafe = "super-safe",
    Credix = "credix",
    Raydium = "raydium",
    Orca = "orca",
}

export interface AssetCta {
    action: MetaInfoCtaAction;
    isVisible: boolean;
    disabled: boolean;
    caption: string;
    uiComponentType: "button" | "menuitem";
    uiComponentId: string;
    tooltip: string;
    callBack?: any;
}

export interface CategoryDisplayItem {
    id: string;
    title: string;
    subtitle: string;
    mainValue: string;
    secondaryValue: string;
}

export interface SelectedCategoryItem {
    id: string;                         // The way to know which item is selected
    path: string;
    mainCategory: AccountsPageCategory;
    subCategory: AssetGroups;
}

export interface KnownAppMetadata {
    appId: string;
    title: string;
    subTitle: string;
    defaultPath: string;
    slug: RegisteredAppPaths;
    enabled: boolean;
    logoURI?: string;
}

export const KNOWN_APPS: KnownAppMetadata[] = [
    {
        appId: '',
        title: 'Mean Staking',
        subTitle: 'aaa',
        defaultPath: '/staking?option=stake',
        slug: RegisteredAppPaths.Staking,
        enabled: true,
    },
    {
        appId: '',
        title: 'Mean Token Vesting',
        subTitle: 'bbb',
        defaultPath: '/vesting',
        slug: RegisteredAppPaths.Vesting,
        enabled: true,
    },
    {
        appId: '',
        title: 'Payment Streaming',
        subTitle: 'ccc',
        defaultPath: '/streaming/summary',
        slug: RegisteredAppPaths.PaymentStreaming,
        enabled: true,
    },
    {
        appId: '',
        title: 'SuperSafe',
        subTitle: 'ddd',
        defaultPath: '/super-safe',
        slug: RegisteredAppPaths.SuperSafe,
        enabled: true,
    },
    {
        appId: '',
        title: 'Credix',
        subTitle: 'eee',
        defaultPath: '/credix',
        slug: RegisteredAppPaths.Credix,
        enabled: false,
    },
    {
        appId: '',
        title: 'Raydium',
        subTitle: 'fff',
        defaultPath: '/raydium',
        slug: RegisteredAppPaths.Raydium,
        enabled: false,
    },
    {
        appId: '',
        title: 'Orca',
        subTitle: 'ggg',
        defaultPath: '/orca',
        slug: RegisteredAppPaths.Orca,
        enabled: false,
    },
];

export const getKnownAppById = (appId: string) => {
    return KNOWN_APPS.find(a => a.appId === appId);
}

export const getKnownAppBySlug = (slug: string) => {
    return KNOWN_APPS.find(a => a.slug === slug);
}
