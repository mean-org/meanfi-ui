import { Button } from "antd";
import { useWallet } from "../../contexts/wallet";

export const ConnectButton = () => {
  const { connected, select } = useWallet();

  if (!connected) {
    return (
      <Button type="primary" shape="round" size="large" onClick={select}>
        Connect wallet account
      </Button>
    );
  }

  return null;

};
