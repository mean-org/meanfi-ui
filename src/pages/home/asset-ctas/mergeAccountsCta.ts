import { type AssetCta, MetaInfoCtaAction } from 'models/accounts';

export const getMergeAccountsCta = (
  caption: string,
  isWalletAccount: boolean,
  canActivateMergeTokenAccounts: boolean,
  callBack: any,
) => {
  const actions: AssetCta[] = [];
  if (isWalletAccount && canActivateMergeTokenAccounts) {
    actions.push({
      action: MetaInfoCtaAction.MergeAccounts,
      caption,
      isVisible: true,
      uiComponentType: 'menuitem',
      disabled: false,
      uiComponentId: `menuitem-${MetaInfoCtaAction.MergeAccounts}`,
      tooltip: '',
      callBack,
    });
  }
  return actions;
};
