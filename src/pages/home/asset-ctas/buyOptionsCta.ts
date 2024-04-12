import { type AssetCta, MetaInfoCtaAction } from 'models/accounts';

export const getBuyOptionsCta = (
  caption: string,
  ctaItems: number,
  numMaxCtas: number,
  isWalletAccount: boolean,
  isWsol: boolean,
  isCustomAsset: boolean,
  callBack: any,
) => {
  const actions: AssetCta[] = [];
  if (isWalletAccount && !isWsol && !isCustomAsset) {
    actions.push({
      action: MetaInfoCtaAction.Buy,
      caption,
      isVisible: true,
      uiComponentType: ctaItems < numMaxCtas ? 'button' : 'menuitem',
      disabled: false,
      uiComponentId: `${ctaItems < numMaxCtas ? 'button' : 'menuitem'}-${MetaInfoCtaAction.Buy}`,
      tooltip: '',
      callBack,
    });
  }
  return actions;
};
