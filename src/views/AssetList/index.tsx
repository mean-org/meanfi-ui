import { ACCOUNTS_LOW_BALANCE_LIMIT, FALLBACK_COIN_IMAGE, WRAPPED_SOL_MINT_ADDRESS } from 'app-constants/common';
import { Identicon } from 'components/Identicon';
import { AppStateContext } from 'contexts/appstate';
import { toUsCurrency } from 'middleware/ui';
import { formatThousands } from 'middleware/utils';
import type { AccountsPageCategory, UserTokenAccount } from 'models/accounts';
import { useCallback, useContext } from 'react';

interface AssetListProps {
  accountTokens: UserTokenAccount[];
  hideLowBalances: boolean;
  onTokenAccountClick: (value: UserTokenAccount) => void;
  selectedAsset: UserTokenAccount | undefined;
  selectedCategory: AccountsPageCategory;
}

export const AssetList = ({
  accountTokens,
  hideLowBalances,
  onTokenAccountClick,
  selectedAsset,
  selectedCategory,
}: AssetListProps) => {
  const { theme, selectedAccount, getTokenPriceByAddress } = useContext(AppStateContext);

  const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    event.currentTarget.src = FALLBACK_COIN_IMAGE;
    event.currentTarget.className = 'error';
  };

  const isAssetNativeAccount = useCallback(
    (asset?: UserTokenAccount) => {
      if (asset) {
        return selectedAccount.address === asset.publicAddress;
      }
      return !!(selectedAsset && selectedAccount.address === selectedAsset.publicAddress);
    },
    [selectedAsset, selectedAccount.address],
  );

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
    let assetClass = '';
    if (isSelectedToken(asset) && selectedCategory === 'assets') {
      assetClass = 'selected';
    } else if (hideLowBalances && (shouldHideAsset(asset) || !asset.balance)) {
      assetClass = 'hidden';
    }

    return assetClass;
  };

  const getNonAtaLabel = (asset: UserTokenAccount) => {
    if (isAssetNativeAccount(asset) || asset.isAta || asset.decimals === 0) {
      return null;
    }

    return ' •';
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
        onKeyDown={() => {}}
        id={asset.publicAddress}
        className={`transaction-list-row ${getRowSelectionClass(asset)}`}
      >
        <div className='icon-cell'>
          <div className='token-icon'>
            {asset.logoURI ? (
              <img alt={`${asset.name}`} width={30} height={30} src={asset.logoURI} onError={imageOnErrorHandler} />
            ) : (
              <Identicon address={asset.address} style={{ width: '30', display: 'inline-flex' }} />
            )}
          </div>
        </div>
        <div className='description-cell'>
          <div className='title'>
            {asset.symbol}
            {tokenPrice > 0 ? (
              <span className={`badge small ml-1 ${theme === 'light' ? 'golden fg-dark' : 'darken'}`}>
                {toUsCurrency(tokenPrice)}
              </span>
            ) : null}
          </div>
          <div className='subtitle text-truncate'>
            {asset.address === WRAPPED_SOL_MINT_ADDRESS ? 'Wrapped SOL' : asset.name}
            {getNonAtaLabel(asset)}
          </div>
        </div>
        <div className='rate-cell'>
          <div className='rate-amount'>{getRateAmountDisplay(tokenPrice, asset)}</div>
          <div className='interval'>
            {(asset.balance || 0) > 0 ? formatThousands(asset.balance ?? 0, asset.decimals, asset.decimals) : '0'}
          </div>
        </div>
      </div>
    );
  };

  return <>{accountTokens.map(asset => renderAsset(asset))}</>;
};

export default AssetList;
