import { notification } from "antd";
import { SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from "../constants";
import { IconExternalLink } from "../Icons";

export function notify({
  message = "",
  description = undefined as any,
  txid = "",
  type = "info",
  placement = "bottomLeft"
}) {
  const key = `open${Date.now()}`;
  if (txid) {
    description = (
      <a className="secondary-link" href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${txid}`}
          target="_blank" rel="noopener noreferrer">
        <IconExternalLink className="mean-svg-icons link" />
        <span className="link-text">View transaction {txid.slice(0, 8)}...{txid.slice(txid.length - 8)}</span>
      </a>
    );
  }
  (notification as any)[type]({
    key,
    message: <span style={{ color: "black" }}>{message}</span>,
    description: (
      <span style={{ color: "black", opacity: 0.5 }}>{description}</span>
    ),
    placement,
    style: {
      backgroundColor: "white",
    },
  });
}
