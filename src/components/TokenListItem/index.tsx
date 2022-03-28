import React from "react";
import { getTokenByMintAddress } from "../../utils/tokens";
import { getTokenAmountAndSymbolByTokenAddress, shortenAddress } from "../../utils/utils";
import { Identicon } from "../Identicon";

export const TokenListItem = (props: {
  mintAddress: string;
  name?: string;
  icon?: JSX.Element;
  className?: string;
  balance: number;
  onClick: any;
}) => {
  const { name, icon, className, mintAddress, balance } = props;
  const token = getTokenByMintAddress(mintAddress);

  return (
    <div title={mintAddress} key={mintAddress} className={`token-selector token-item ${className || ''}`} onClick={props.onClick}>
      <div className="token-icon">
        {icon ? icon : (
          <>
            {token && token.logoURI ? (
              <img alt={`${token.name}`} width={24} height={24} src={token.logoURI} />
            ) : (
              <Identicon address={token ? token.address : mintAddress} style={{ width: "24", display: "inline-flex" }} />
            )}
          </>
        )}
      </div>
      <div className="token-description">
        <div className="token-symbol">{token && token.symbol ? token.symbol : shortenAddress(mintAddress)}</div>
        <div className="token-name m-0">{name ? name : token && token.name ? token.name : shortenAddress(mintAddress)}</div>
      </div>
      {balance > 0 && (
        <div className="token-balance">
          {getTokenAmountAndSymbolByTokenAddress(balance, token ? token.address : mintAddress, true)}
        </div>
      )}
    </div>
  );
};
