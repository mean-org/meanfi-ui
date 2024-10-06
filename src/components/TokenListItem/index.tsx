import { type ReactNode, useContext, useMemo } from 'react';
import { Identicon } from 'src/components/Identicon';
import { AppStateContext } from 'src/contexts/appstate';
import { toUsCurrency } from 'src/middleware/ui';
import { getAmountWithSymbol, shortenAddress } from 'src/middleware/utils';
import type { TokenInfo } from 'src/models/SolanaTokenInfo';

export const TokenListItem = (props: {
  mintAddress: string;
  name?: string;
  icon?: ReactNode;
  className?: string;
  balance: number;
  onClick: () => void;
  token?: TokenInfo;
  showUsdValues?: boolean;
  showZeroBalances?: boolean;
}) => {
  const { name, icon, className, mintAddress, balance, token, showUsdValues, showZeroBalances } = props;
  const { theme, getTokenByMintAddress, getTokenPriceByAddress } = useContext(AppStateContext);

  const displayToken = token ?? getTokenByMintAddress(mintAddress);

  const tokenPrice = useMemo(() => {
    const tokenAddress = displayToken?.address ?? mintAddress;
    return getTokenPriceByAddress(tokenAddress, displayToken?.symbol ?? '');
  }, [displayToken?.address, displayToken?.symbol, getTokenPriceByAddress, mintAddress]);

  const getDisplayTokenName = () => {
    if (name) {
      return name;
    }

    return displayToken?.name ?? shortenAddress(mintAddress);
  };

  const getDisplayBalance = () => {
    const tokenAddress = displayToken ? displayToken.address : mintAddress;
    return balance ? getAmountWithSymbol(balance, tokenAddress, true) : '0';
  };

  const getDisplayPrice = () => {
    if (tokenPrice > 0) {
      return (
        <span className={`badge small ml-1 ${theme === 'light' ? 'golden fg-dark' : 'darken'}`}>
          {toUsCurrency(tokenPrice)}
        </span>
      );
    }
    return null;
  };

  const getDisplayUsdValue = () => {
    if (tokenPrice > 0 && balance > 0) {
      const value = balance * tokenPrice || 0;
      return <div className='text-right font-size-90 font-bold fg-secondary-80'>{toUsCurrency(value)}</div>;
    }
    return null;
  };

  return (
    <div
      title={mintAddress}
      key={mintAddress}
      className={`token-selector token-item ${className ?? ''}`}
      onKeyDown={() => {}}
      onClick={props.onClick}
    >
      <div className='token-icon'>
        {icon ?? null}
        {!icon && displayToken?.logoURI ? (
          <img alt={`${displayToken.name}`} width={24} height={24} src={displayToken.logoURI} />
        ) : null}
        {!icon && !displayToken?.logoURI ? (
          <Identicon address={displayToken?.address ?? mintAddress} style={{ width: '24', display: 'inline-flex' }} />
        ) : null}
      </div>
      <div className='token-description'>
        <div className='token-symbol'>
          <span className='align-middle'>{displayToken?.symbol ?? shortenAddress(mintAddress)}</span>
          {showUsdValues && getDisplayPrice()}
        </div>
        <div className='token-name m-0'>{getDisplayTokenName()}</div>
      </div>
      {(balance > 0 || showZeroBalances) && (
        <div className='token-balance'>
          {showUsdValues && getDisplayUsdValue()}
          <div className='text-right font-size-70'>{getDisplayBalance()}</div>
        </div>
      )}
    </div>
  );
};
