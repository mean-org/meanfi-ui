import { type AssetCta, MetaInfoCtaAction } from 'models/accounts';

export const getUnwrapSolCta = (
  caption: string,
  isWalletAccount: boolean,
  isWsol: boolean,
  wSolBalance: number,
  callBack: any,
) => {
  const actions: AssetCta[] = [];
  if (isWalletAccount && isWsol && wSolBalance > 0) {
    actions.push({
      action: MetaInfoCtaAction.UnwrapSol,
      caption,
      isVisible: true,
      uiComponentType: 'button',
      disabled: false,
      uiComponentId: `button-${MetaInfoCtaAction.UnwrapSol}`,
      tooltip: '',
      callBack,
    });
  }
  return actions;
};
