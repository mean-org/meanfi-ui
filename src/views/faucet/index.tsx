import { useCallback } from "react";
import { useConnection } from "../../contexts/connection";
import { useWallet } from "../../contexts/wallet";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { notify } from "../../utils/notifications";
import { LABELS } from "../../constants";
import { Button } from "antd";

export const FaucetView = () => {
  const connection = useConnection();
  const { publicKey } = useWallet();

  const airdrop = useCallback(() => {
    if (!publicKey) {
      return;
    }

    connection.requestAirdrop(publicKey, 2 * LAMPORTS_PER_SOL).then(() => {
      notify({
        message: LABELS.ACCOUNT_FUNDED,
        type: "success",
      });
    });
  }, [publicKey, connection]);

  return (
    <div className="container">
      <div className="interaction-area">
        <div className="deposit-input-title" style={{ margin: 10 }}>
          {LABELS.FAUCET_INFO}
        </div>
        <Button type="primary" shape="round" size="large" onClick={airdrop}>
          {LABELS.GIVE_SOL}
        </Button>
      </div>
    </div>
  );
};
