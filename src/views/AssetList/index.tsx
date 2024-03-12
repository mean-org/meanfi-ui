import { Identicon } from 'components/Identicon';
import { ACCOUNTS_LOW_BALANCE_LIMIT, FALLBACK_COIN_IMAGE, WRAPPED_SOL_MINT_ADDRESS } from 'constants/common';
import { AppStateContext } from 'contexts/appstate';
import { toUsCurrency } from 'middleware/ui';
import { formatThousands } from 'middleware/utils';
import { AccountsPageCategory, UserTokenAccount } from 'models/accounts';
import { useCallback, useContext } from 'react';

export const AssetList = (props: {
  accountTokens: UserTokenAccount[];
  hideLowBalances: boolean;
  onTokenAccountClick: any;
  selectedAsset: UserTokenAccount | undefined;
  selectedCategory: AccountsPageCategory;
}) => {
  const { accountTokens, hideLowBalances, onTokenAccountClick, selectedAsset, selectedCategory } = props;
  const { theme, getTokenPriceByAddress } = useContext(AppStateContext);

  const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    event.currentTarget.src = FALLBACK_COIN_IMAGE;
    event.currentTarget.className = 'error';
  };

  const isSelectedToken = (asset: UserTokenAccount): boolean => {
    return !!(selectedAsset && asset && selectedAsset.displayIndex === asset.displayIndex);
  };

  const shouldHideAsset = useCallback(
    (asset: UserTokenAccount) => {
      const tokenPrice = getTokenPriceByAddress(asset.address, asset.symbol);
      return !!(tokenPrice > 0 && (!asset.valueInUsd || asset.valueInUsd < ACCOUNTS_LOW_BALANCE_LIMIT));
    },
    [getTokenPriceByAddress],
  );

  const getRowSelectionClass = (asset: UserTokenAccount): string => {
    if (isSelectedToken(asset) && selectedCategory === 'assets') {
      return 'selected';
    } else if (hideLowBalances && (shouldHideAsset(asset) || !asset.balance)) {
      return 'hidden';
    }

    return '';
  };

  const getRateAmountDisplay = (tokenPrice: number, asset: UserTokenAccount): string => {
    if (tokenPrice > 0) {
      if (!asset.balance) {
        return '$0.00';
      }

      return toUsCurrency(asset.balance * tokenPrice);
    }
    return '—';
  };

  const renderAsset = (asset: UserTokenAccount) => {
    const tokenPrice = getTokenPriceByAddress(asset.address, asset.symbol);

    return (
      <div
        key={`${asset.publicAddress}`}
        onClick={() => onTokenAccountClick(asset)}
        id={asset.publicAddress}
        className={`transaction-list-row ${getRowSelectionClass(asset)}`}
      >
        <div className="icon-cell">
          <div className="token-icon">
            {asset.logoURI ? (
              <img alt={`${asset.name}`} width={30} height={30} src={asset.logoURI} onError={imageOnErrorHandler} />
            ) : (
              <Identicon address={asset.address} style={{ width: '30', display: 'inline-flex' }} />
            )}
          </div>
        </div>
        <div className="description-cell">
          <div className="title">
            {asset.symbol}
            {tokenPrice > 0 ? (
              <span className={`badge small ml-1 ${theme === 'light' ? 'golden fg-dark' : 'darken'}`}>
                {toUsCurrency(tokenPrice)}
              </span>
            ) : null}
          </div>
          <div className="subtitle text-truncate">
            {asset.address === WRAPPED_SOL_MINT_ADDRESS ? 'Wrapped SOL' : asset.name}
          </div>
        </div>
        <div className="rate-cell">
          <div className="rate-amount">{getRateAmountDisplay(tokenPrice, asset)}</div>
          <div className="interval">
            {(asset.balance || 0) > 0 ? formatThousands(asset.balance ?? 0, asset.decimals, asset.decimals) : '0'}
          </div>
        </div>
      </div>
    );
  };

  return <>{accountTokens.map(asset => renderAsset(asset))}</>;
};

export default AssetList;
