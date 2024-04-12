import { type AssetCta, MetaInfoCtaAction } from 'models/accounts';

export const getExchangeAssetCta = (
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
      action: MetaInfoCtaAction.Exchange,
      caption,
      isVisible: true,
      uiComponentType: ctaItems < numMaxCtas ? 'button' : 'menuitem',
      disabled: false,
      uiComponentId: `${ctaItems < numMaxCtas ? 'button' : 'menuitem'}-${MetaInfoCtaAction.Exchange}`,
      tooltip: '',
      callBack,
    });
  }
  return actions;
};
