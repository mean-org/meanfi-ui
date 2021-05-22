import React from "react";
import { Button } from "antd";
import { ButtonProps } from "antd/lib/button";
import { LABELS } from "../../constants";
import { useWallet } from "../../contexts/wallet";

export interface ConnectButtonProps
  extends ButtonProps,
    React.RefAttributes<HTMLElement> {
  allowWalletChange?: boolean;
}

export const ConnectButton = (props: ConnectButtonProps) => {
  const { connected, connect, provider } = useWallet();
  const { onClick, children, disabled, allowWalletChange, ...rest } = props;

  if (!provider || !connected) {
    return (
      <Button
        {...rest}
        type="primary"
        shape="round"
        size="large"
        onClick={connected ? onClick : connect}
        disabled={connected && disabled}
      >
        {connected ? props.children : LABELS.CONNECT_LABEL}
      </Button>
    );
  }

  return null;
};
