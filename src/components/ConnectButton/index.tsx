import { Button } from "antd";
import { LABELS } from "../../constants";
import { useWallet } from "../../contexts/wallet";

export const ConnectButton = () => {
  const { wallet, connected, provider, lastWalletProviderSuccess, select, connect } = useWallet();

  if (wallet && !connected && provider?.url === lastWalletProviderSuccess) {
    return (
      <Button type="primary" shape="round" size="large" onClick={connect}>
        {LABELS.CONNECT_LABEL}
      </Button>
    );
  }
  
  if (!provider || !connected) {
    return (
      <Button type="primary" shape="round" size="large" onClick={select}>
        {LABELS.CONNECT_LABEL}
      </Button>
    );
  }

  return null;
};
