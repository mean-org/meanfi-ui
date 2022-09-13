import { TokenInfo } from "@solana/spl-token-registry";
import React, { useContext } from "react";
import { AppStateContext } from "../../contexts/appstate";
import { getTokenAmountAndSymbolByTokenAddress, shortenAddress } from "../../middleware/utils";
import { Identicon } from "../Identicon";

export const TokenListItem = (props: {
  mintAddress: string;
  name?: string;
  icon?: JSX.Element;
  className?: string;
  balance: number;
  onClick: any;
  token?: TokenInfo;
  showZeroBalances?: boolean;
}) => {
  const { name, icon, className, mintAddress, balance, token, showZeroBalances } = props;
  const { getTokenByMintAddress } = useContext(AppStateContext);

  const displayToken = token || getTokenByMintAddress(mintAddress);

  return (
    <div title={mintAddress} key={mintAddress} className={`token-selector token-item ${className || ''}`} onClick={props.onClick}>
      <div className="token-icon">
        {icon ? icon : (
          <>
            {displayToken && displayToken.logoURI ? (
              <img alt={`${displayToken.name}`} width={24} height={24} src={displayToken.logoURI} />
            ) : (
              <Identicon address={displayToken ? displayToken.address : mintAddress} style={{ width: "24", display: "inline-flex" }} />
            )}
          </>
        )}
      </div>
      <div className="token-description">
        <div className="token-symbol">{displayToken && displayToken.symbol ? displayToken.symbol : shortenAddress(mintAddress)}</div>
        <div className="token-name m-0">{name ? name : displayToken && displayToken.name ? displayToken.name : shortenAddress(mintAddress)}</div>
      </div>
      {(balance > 0 || showZeroBalances)  && (
        <div className="token-balance">
          {balance ? getTokenAmountAndSymbolByTokenAddress(balance, displayToken ? displayToken.address : mintAddress, true) : "0"}
        </div>
      )}
    </div>
  );
};
