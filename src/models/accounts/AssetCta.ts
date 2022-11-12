import { MetaInfoCtaAction } from 'models/enums';

export interface AssetCta {
  action: MetaInfoCtaAction;
  isVisible: boolean;
  disabled: boolean;
  caption: string;
  uiComponentType: 'button' | 'menuitem';
  uiComponentId: string;
  tooltip: string;
  callBack?: any;
}
