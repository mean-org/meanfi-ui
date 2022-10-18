export type AccountsPageCategory = "account-summary" | "favorites" | "assets" | undefined;

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
    title: string;
    subtitle: string;
    mainValue: string;
    secondaryValue: string;
}
