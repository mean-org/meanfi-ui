import { type AssetCta, MetaInfoCtaAction } from 'models/accounts';

export const getCloseAccountCta = (
  isMultisigContext: boolean,
  isWalletAccount: boolean,
  isAnyTxPendingConfirmation: boolean,
  canDeleteAsset: boolean,
  callBack: any,
) => {
  const actions: AssetCta[] = [];
  if (isMultisigContext) {
    actions.push({
      action: MetaInfoCtaAction.Close,
      caption: 'Close account',
      isVisible: true,
      uiComponentType: 'menuitem',
      disabled: isAnyTxPendingConfirmation || !canDeleteAsset,
      uiComponentId: `menuitem-${MetaInfoCtaAction.Close}`,
      tooltip: '',
      callBack,
    });
  } else if (isWalletAccount) {
    actions.push({
      action: MetaInfoCtaAction.CloseAccount,
      caption: 'Close account',
      isVisible: true,
      uiComponentType: 'menuitem',
      disabled: isAnyTxPendingConfirmation,
      uiComponentId: `menuitem-${MetaInfoCtaAction.CloseAccount}`,
      tooltip: '',
      callBack,
    });
  }
  return actions;
};
