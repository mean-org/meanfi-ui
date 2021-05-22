import { notification } from "antd";
import { IconExternalLink } from "../Icons";

export function notify({
  message = "",
  description = undefined as any,
  txid = "",
  type = "info",
  placement = "bottomLeft",
}) {
  if (txid) {
    description = (
      <a className="secondary-link" href={`https://explorer.solana.com/tx/${txid}`}
          target="_blank" rel="noopener noreferrer">
        <IconExternalLink className="mean-svg-icons link" />
        <span className="link-text">View transaction {txid.slice(0, 8)}...{txid.slice(txid.length - 8)}</span>
      </a>
    );
  }
  (notification as any)[type]({
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
