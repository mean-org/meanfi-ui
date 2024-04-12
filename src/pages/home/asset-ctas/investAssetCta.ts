import { type AssetCta, MetaInfoCtaAction, type UserTokenAccount } from 'models/accounts';

export const getInvestAssetCta = (
  ctaItems: number,
  numMaxCtas: number,
  isInvestmentEnabled: boolean,
  selectedAsset: UserTokenAccount,
  callBack: any,
) => {
  const actions: AssetCta[] = [];
  if (isInvestmentEnabled) {
    actions.push({
      action: MetaInfoCtaAction.Invest,
      caption: selectedAsset.symbol === 'sMEAN' ? 'Unstake' : 'Stake',
      isVisible: true,
      uiComponentType: ctaItems < numMaxCtas ? 'button' : 'menuitem',
      disabled: false,
      uiComponentId: `${ctaItems < numMaxCtas ? 'button' : 'menuitem'}-${MetaInfoCtaAction.Invest}`,
      tooltip: '',
      callBack,
    });
  }
  return actions;
};
