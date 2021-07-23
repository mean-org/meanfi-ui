import { useCallback } from "react";
import { useConnection } from "../../contexts/connection";
import { useWallet } from "../../contexts/wallet";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { notify } from "../../utils/notifications";
import { LABELS } from "../../constants";
import { Button } from "antd";
import { environment } from "../../environments/environment";
import { formatNumber } from "../../utils/utils";
import { useNativeAccount } from "../../contexts/accounts";

export const FaucetView = () => {
  const connection = useConnection();
  const { publicKey } = useWallet();
  const { account } = useNativeAccount();

  const getFaucetAmount = (): number => {
    if (environment === 'testnet') {
      return 1 * LAMPORTS_PER_SOL;
    }
    return 4 * LAMPORTS_PER_SOL;
  }

  const airdrop = useCallback(() => {
    if (!publicKey) {
      return;
    }

    if (environment === 'production') {
      notify({
        message: LABELS.CANNOT_FUND,
        type: "error",
      });
      return;
    }

    try {
      connection.requestAirdrop(publicKey, getFaucetAmount()).then(() => {
        notify({
          message: LABELS.ACCOUNT_FUNDED,
          type: "success",
        });
      });
    } catch (error) {
      console.log(error);
      notify({
        message: 'Could not fund your account, please try again later',
        type: "error",
      });
    }
  }, [publicKey, connection]);

  const disconnectedBlock = (
    <p>Your wallet is not connected, please connect your wallet.</p>
  );

  const connectedBlock = (
    <>
      <div className="deposit-input-title" style={{ margin: 10 }}>
        <p>{LABELS.FAUCET_INFO}</p>
        <p>Current SOL balance: {formatNumber.format((account?.lamports || 0) / LAMPORTS_PER_SOL)} SOL</p>
        <p>Your account will be funded with {formatNumber.format(getFaucetAmount() / LAMPORTS_PER_SOL)} SOL</p>
      </div>
      <Button type="primary" shape="round" size="large" onClick={airdrop}>
        {LABELS.GIVE_SOL}
      </Button>
    </>
  );

  return (
    <div className="container">
      <div className="interaction-area">
        {publicKey ? connectedBlock : disconnectedBlock}
      </div>
    </div>
  );
};
