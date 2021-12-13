import React from "react";
import { IconCaretDown } from "../../Icons";
import { getTokenByMintAddress } from "../../utils/tokens";
import { shortenAddress } from "../../utils/utils";
import { Identicon } from "../Identicon";

export const TokenDisplay = (props: {
  name?: string;
  icon?: JSX.Element;
  className?: string;
  mintAddress: string;
  showName?: boolean;
  symbol?: string;
  showCaretDown?: boolean;
  noTokenLabel?: string;
  onClick: any;
}) => {
  const { name, icon, className, mintAddress, showName, showCaretDown, noTokenLabel } = props;
  const token = getTokenByMintAddress(mintAddress);

  return (
    <>
      <div title={mintAddress} key={mintAddress} className={`token-selector ${className || ''}`} onClick={props.onClick}>
        {mintAddress ? (
          <>
            <div className="token-icon">
              {icon ? icon : (
                <>
                  {token && token.logoURI ? (
                    <img alt={`${token.name}`} width={20} height={20} src={token.logoURI} />
                  ) : (
                    <Identicon address={mintAddress} style={{ width: "24", display: "inline-flex" }} />
                  )}
                </>
              )}
            </div>
            {props.symbol ? (
              <div className="token-symbol">{props.symbol}</div>
            ) : token && token.symbol ? (
              <div className="token-symbol">{token.symbol}</div>
            ) : (
              <div className="token-symbol">{shortenAddress(mintAddress)}</div>
            )}
            {showName && (
              <div className="token-name">{name ? `(${name})` : token ? `(${token.name})` : ''}</div>
            )}
            {showCaretDown && (
              <span className="flex-center dropdown-arrow">
                <IconCaretDown className="mean-svg-icons" />
              </span>
            )}
          </>
        ) : (
          <>
            <span className="notoken-label">{noTokenLabel}</span>
            {showCaretDown && (
              <span className="flex-center dropdown-arrow">
                <IconCaretDown className="mean-svg-icons" />
              </span>
            )}
          </>
        )}
      </div>
    </>
  );
};
