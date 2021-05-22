import React from "react";
import { useWallet } from "../../contexts/wallet";
import { CurrentUserBadge } from "../CurrentUserBadge";
import { ConnectButton } from "../ConnectButton";
import { AppContextMenu } from "../AppContextMenu";
import { CurrentNetwork } from "../CurrentNetwork";

export const AppBar = (props: { left?: JSX.Element; right?: JSX.Element }) => {
  const { connected } = useWallet();

  const TopBar = (
    <div className="App-Bar-right">
      {connected ? (
        <div className="connection-and-account-bar">
          <CurrentNetwork />
          <CurrentUserBadge />
        </div>
      ) : (
        <ConnectButton
          type="text"
          size="large"
          allowWalletChange={true}
        />
      )}
      <AppContextMenu />
      {props.right}
    </div>
  );

  return TopBar;
};
