import { AssetCta, MetaInfoCtaAction } from 'models/accounts';

export const getDepositOptionsCta = (caption: string, ctaItems: number, numMaxCtas: number, callBack: any) => {
  return {
    action: MetaInfoCtaAction.Deposit,
    caption,
    isVisible: true,
    uiComponentType: ctaItems < numMaxCtas ? 'button' : 'menuitem',
    disabled: false,
    uiComponentId: `${ctaItems < numMaxCtas ? 'button' : 'menuitem'}-${MetaInfoCtaAction.Deposit}`,
    tooltip: '',
    callBack,
  } as AssetCta;
};
