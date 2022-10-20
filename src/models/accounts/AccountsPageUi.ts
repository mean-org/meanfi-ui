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
    path: RegisteredAppPaths;
}

export const KNOWN_APPS: KnownAppMetadata[] = [
    {
        appId: '',
        title: 'Mean Staking',
        path: RegisteredAppPaths.Staking,
    },
    {
        appId: '',
        title: 'Payment Streaming',
        path: RegisteredAppPaths.PaymentStreaming,
    },
    {
        appId: '',
        title: 'SuperSafe',
        path: RegisteredAppPaths.SuperSafe,
    },
    {
        appId: '',
        title: 'Credix',
        path: RegisteredAppPaths.Credix,
    },
    {
        appId: '',
        title: 'Raydium',
        path: RegisteredAppPaths.Raydium,
    },
    {
        appId: '',
        title: 'Orca',
        path: RegisteredAppPaths.Orca,
    },
];

export const getKnownAppById = (appId: string) => {
    return KNOWN_APPS.find(a => a.appId === appId);
}

export const getKnownAppByPath = (path: string) => {
    return KNOWN_APPS.find(a => a.path === path);
}
