import { SocialNetwork } from "models/enums";

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

export interface SocialMediaEntry {
    network: SocialNetwork;
    linkUrl: string;
}

export interface KnownAppMetadata {
    appId: string;
    title: string;
    subTitle: string;
    defaultPath: string;
    slug: RegisteredAppPaths;
    enabled: boolean;
    visible: boolean;
    logoURI?: string;
    socials?: SocialMediaEntry[];
}

export const KNOWN_APPS: KnownAppMetadata[] = [
    {
        appId: '',
        title: 'MEAN Staking',
        subTitle: '?????',
        defaultPath: '/staking?option=stake',
        slug: RegisteredAppPaths.Staking,
        enabled: true,
        visible: true,
    },
    {
        appId: '',
        title: 'Token Vesting',
        subTitle: 'Solana Token Vesting Contracts',
        defaultPath: '/vesting/summary',
        slug: RegisteredAppPaths.Vesting,
        enabled: true,
        visible: true,
        socials: [
            {
                network: SocialNetwork.Twitter,
                linkUrl: 'https://twitter.com/meanfinance/'
            },
            {
                network: SocialNetwork.Discord,
                linkUrl: 'https://discord.meanfi.com/'
            },
            {
                network: SocialNetwork.Medium,
                linkUrl: 'https://meandao.medium.com/'
            },
            {
                network: SocialNetwork.Github,
                linkUrl: 'https://github.com/mean-dao/'
            },
        ]
    },
    {
        appId: '',
        title: 'Payment Streaming',
        subTitle: '?????',
        defaultPath: '/streaming/summary',
        slug: RegisteredAppPaths.PaymentStreaming,
        enabled: true,
        visible: true,
    },
    {
        appId: '',
        title: 'SuperSafe',
        subTitle: '?????',
        defaultPath: '/super-safe',
        slug: RegisteredAppPaths.SuperSafe,
        enabled: true,
        visible: true,
    },
    {
        appId: '',
        title: 'Credix',
        subTitle: 'eee',
        defaultPath: '/credix',
        slug: RegisteredAppPaths.Credix,
        enabled: false,
        visible: false,
    },
    {
        appId: '',
        title: 'Raydium',
        subTitle: '?????',
        defaultPath: '/raydium',
        slug: RegisteredAppPaths.Raydium,
        enabled: false,
        visible: false,
    },
    {
        appId: '',
        title: 'Orca',
        subTitle: '?????',
        defaultPath: '/orca',
        slug: RegisteredAppPaths.Orca,
        enabled: false,
        visible: false,
    },
];

export const getKnownAppById = (appId: string) => {
    return KNOWN_APPS.find(a => a.appId === appId);
}

export const getKnownAppBySlug = (slug: string) => {
    return KNOWN_APPS.find(a => a.slug === slug);
}
