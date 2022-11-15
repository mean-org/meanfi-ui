import React, { useContext } from 'react';
import { TokenInfo } from 'models/SolanaTokenInfo';
import { IconCaretDown } from '../../Icons';
import { shortenAddress } from '../../middleware/utils';
import { Identicon } from '../Identicon';
import { AppStateContext } from '../../contexts/appstate';

export const TokenDisplay = (props: {
  fullTokenInfo?: TokenInfo | undefined;
  name?: string;
  icon?: JSX.Element;
  className?: string;
  mintAddress: string;
  showName?: boolean;
  symbol?: string;
  showCaretDown?: boolean;
  noTokenLabel?: string;
  onClick: any;
  nameInfoLabel?: boolean;
}) => {
  const {
    name,
    icon,
    className,
    mintAddress,
    showName,
    showCaretDown,
    noTokenLabel,
    fullTokenInfo,
    nameInfoLabel,
  } = props;
  const { getTokenByMintAddress } = useContext(AppStateContext);

  const token = getTokenByMintAddress(mintAddress);

  return (
    <div className="d-flex flex-column">
      <div
        title={mintAddress}
        key={mintAddress}
        className={`token-selector ${className || ''}`}
        onClick={props.onClick}
      >
        {mintAddress ? (
          <>
            <div className="token-icon mr-1">
              {fullTokenInfo ? (
                <>
                  {fullTokenInfo && fullTokenInfo.logoURI ? (
                    <img
                      alt={`${fullTokenInfo.name}`}
                      width={20}
                      height={20}
                      src={fullTokenInfo.logoURI}
                    />
                  ) : (
                    <Identicon
                      address={mintAddress}
                      style={{ width: '24', display: 'inline-flex' }}
                    />
                  )}
                </>
              ) : icon ? (
                icon
              ) : (
                <>
                  {token && token.logoURI ? (
                    <img
                      alt={`${token.name}`}
                      width={20}
                      height={20}
                      src={token.logoURI}
                    />
                  ) : (
                    <Identicon
                      address={mintAddress}
                      style={{ width: '24', display: 'inline-flex' }}
                    />
                  )}
                </>
              )}
            </div>
            {showName && (
              <div className="token-name mr-1">
                {fullTokenInfo
                  ? fullTokenInfo.name
                  : name
                  ? `(${name})`
                  : token
                  ? `(${token.name})`
                  : ''}
              </div>
            )}
            {fullTokenInfo ? (
              <div className="token-symbol mr-1">{fullTokenInfo.symbol}</div>
            ) : props.symbol ? (
              <div className="token-symbol mr-1">{props.symbol}</div>
            ) : token && token.symbol ? (
              <div className="token-symbol mr-1">{token.symbol}</div>
            ) : (
              <div className="token-symbol mr-1">
                {shortenAddress(mintAddress)}
              </div>
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
      {nameInfoLabel && (
        <span className="info-label ml-3 mb-0 pl-1">
          {fullTokenInfo
            ? fullTokenInfo.name
            : name
            ? `(${name})`
            : token
            ? `(${token.name})`
            : ''}
        </span>
      )}
    </div>
  );
};
