import { type ReactNode, useContext } from 'react';
import type { TokenInfo } from 'src/models/SolanaTokenInfo';
import { IconCaretDown } from '../../Icons';
import { AppStateContext } from '../../contexts/appstate';
import { shortenAddress } from '../../middleware/utils';
import { Identicon } from '../Identicon';

interface TokenDisplayProps {
  fullTokenInfo?: TokenInfo | undefined;
  name?: string;
  icon?: ReactNode;
  iconSize?: 'small' | 'medium' | 'large';
  className?: string;
  mintAddress: string;
  showName?: boolean;
  symbol?: string;
  showCaretDown?: boolean;
  noTokenLabel?: string;
  onClick?: () => void;
  nameInfoLabel?: boolean;
}

export const TokenDisplay = ({
  name,
  icon,
  iconSize = 'small',
  className,
  mintAddress,
  showName,
  symbol,
  showCaretDown,
  noTokenLabel,
  fullTokenInfo,
  nameInfoLabel,
  onClick,
}: TokenDisplayProps) => {
  const { getTokenByMintAddress } = useContext(AppStateContext);

  const token = getTokenByMintAddress(mintAddress);
  const size = iconSize === 'large' ? 30 : iconSize === 'medium' ? 24 : 20;

  return (
    <div className='d-flex flex-column'>
      <div
        title={mintAddress}
        key={mintAddress}
        className={`token-selector ${className || ''}`}
        onKeyDown={() => {}}
        onClick={onClick}
      >
        {mintAddress ? (
          <>
            <div className={`token-icon ${iconSize} mr-1`}>
              {fullTokenInfo ? (
                <>
                  {fullTokenInfo?.logoURI ? (
                    <img alt={`${fullTokenInfo.name}`} width={size} height={size} src={fullTokenInfo.logoURI} />
                  ) : (
                    <Identicon address={mintAddress} style={{ width: size, display: 'inline-flex' }} />
                  )}
                </>
              ) : icon ? (
                icon
              ) : (
                <>
                  {token?.logoURI ? (
                    <img alt={`${token.name}`} width={size} height={size} src={token.logoURI} />
                  ) : (
                    <Identicon address={mintAddress} style={{ width: size, display: 'inline-flex' }} />
                  )}
                </>
              )}
            </div>
            {showName && (
              <div className='token-name mr-1'>
                {fullTokenInfo ? fullTokenInfo.name : name ? `(${name})` : token ? `(${token.name})` : ''}
              </div>
            )}
            {fullTokenInfo ? (
              <div className='token-symbol mr-1'>{fullTokenInfo.symbol}</div>
            ) : symbol ? (
              <div className='token-symbol mr-1'>{symbol}</div>
            ) : token?.symbol ? (
              <div className='token-symbol mr-1'>{token.symbol}</div>
            ) : (
              <div className='token-symbol mr-1'>{shortenAddress(mintAddress)}</div>
            )}
            {showCaretDown && (
              <span className='flex-center dropdown-arrow'>
                <IconCaretDown className='mean-svg-icons' />
              </span>
            )}
          </>
        ) : (
          <>
            <span className='notoken-label'>{noTokenLabel}</span>
            {showCaretDown && (
              <span className='flex-center dropdown-arrow'>
                <IconCaretDown className='mean-svg-icons' />
              </span>
            )}
          </>
        )}
      </div>
      {nameInfoLabel && (
        <span className='info-label ml-3 mb-0 pl-1'>
          {fullTokenInfo ? fullTokenInfo.name : name ? `(${name})` : token ? `(${token.name})` : ''}
        </span>
      )}
    </div>
  );
};
