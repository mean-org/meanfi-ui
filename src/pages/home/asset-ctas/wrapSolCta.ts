import { type AssetCta, MetaInfoCtaAction } from 'src/models/accounts';

export const getWrapSolCta = (
  caption: string,
  ctaItems: number,
  numMaxCtas: number,
  isWalletAccount: boolean,
  isNativeAccount: boolean,
  isWhitelisted: boolean,
  callBack: any,
) => {
  const actions: AssetCta[] = [];
  if (isWalletAccount && isNativeAccount && isWhitelisted) {
    actions.push({
      action: MetaInfoCtaAction.WrapSol,
      caption,
      isVisible: true,
      uiComponentType: ctaItems < numMaxCtas ? 'button' : 'menuitem',
      disabled: false,
      uiComponentId: `${ctaItems < numMaxCtas ? 'button' : 'menuitem'}-${MetaInfoCtaAction.WrapSol}`,
      tooltip: '',
      callBack,
    });
  }
  return actions;
};
