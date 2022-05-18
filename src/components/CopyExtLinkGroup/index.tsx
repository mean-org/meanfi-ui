import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS, SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from "../../constants";
import { getSolanaExplorerClusterParam } from "../../contexts/connection";
import { IconExternalLink } from "../../Icons";
import { copyText } from "../../utils/ui";
import { shortenAddress } from "../../utils/utils";
import { openNotification } from "../Notifications";

export const CopyExtLinkGroup = (props: {
  content: string;
  number?: number;
  externalLink?: boolean;
  message?: string;
  className?: string;
  isTx?: boolean;
}) => {
  const { content, number, externalLink, message, className, isTx } = props;

  const { t } = useTranslation('common');

  // Copy address to clipboard
  const copyAddressToClipboard = useCallback((toCopy: any) => {
    if (copyText(toCopy.toString())) {
      if (!message) {
        openNotification({
          description: t('notifications.account-address-copied-message'),
          type: "info"
        });
      } else {
        openNotification({
          description: `${message} successfully copied`,
          type: "info"
        });
      }
    } else {
      openNotification({
        description: t('notifications.account-address-not-copied-message'),
        type: "error"
      });
    }
  },[message, t]);

  return (
    <>
    <div className="d-flex align-items-center copy-ext-link-group">
      <div onClick={() => copyAddressToClipboard(content)} className={`simplelink underline-on-hover ${className}`}>
        {!number ? content : shortenAddress(content, number)}
        </div>
      <span className="icon-button-container">
        <a
          target="_blank"
          rel="noopener noreferrer"
          href={`${!isTx ? `${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${content}${getSolanaExplorerClusterParam()}` : `${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${content}${getSolanaExplorerClusterParam()}`}`}>
          {externalLink && (
            <IconExternalLink className="mean-svg-icons external-icon ml-1" />
          )}
        </a>
      </span>
    </div>
    </>
  )
}