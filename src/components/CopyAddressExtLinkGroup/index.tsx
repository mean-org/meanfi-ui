import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from "../../constants";
import { getSolanaExplorerClusterParam } from "../../contexts/connection";
import { IconLink } from "../../Icons";
import { copyText } from "../../utils/ui";
import { shortenAddress } from "../../utils/utils";
import { openNotification } from "../Notifications";

export const CopyAddressExtLinkGroup = (props: {
  address: string;
  number: number;
}) => {
  const { address, number } = props;

  const { t } = useTranslation('common');

  // Copy address to clipboard
  const copyAddressToClipboard = useCallback((address: any) => {
    if (copyText(address.toString())) {
      openNotification({
        description: t('notifications.account-address-copied-message'),
        type: "info"
      });
    } else {
      openNotification({
        description: t('notifications.account-address-not-copied-message'),
        type: "error"
      });
    }
  },[t]);

  return (
    <>
    <div className="d-flex align-items-start">
      <div onClick={() => copyAddressToClipboard(address)} className="simplelink underline-on-hover">{shortenAddress(address, number)}</div>
      <span className="icon-button-container">
        <a
          target="_blank"
          rel="noopener noreferrer"
          href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${address}${getSolanaExplorerClusterParam()}`}>
          <IconLink className="mean-svg-icons" />
        </a>
      </span>
    </div>
    </>
  )
}