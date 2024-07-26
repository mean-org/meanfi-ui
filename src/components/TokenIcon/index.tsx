import type { PublicKey } from '@solana/web3.js';
import type React from 'react';
import { useContext } from 'react';
import { AppStateContext } from '../../contexts/appstate';
import { Identicon } from '../Identicon';

export const TokenIcon = (props: {
  mintAddress?: string | PublicKey;
  style?: React.CSSProperties;
  size?: number;
  className?: string;
}) => {
  const { mintAddress, style, size, className } = props;
  const { getTokenByMintAddress } = useContext(AppStateContext);
  const address = typeof mintAddress === 'string' ? mintAddress : mintAddress?.toBase58();

  if (!address) {
    return null;
  }

  const token = getTokenByMintAddress(address);
  const defaultSize = size || 20;

  if (token?.logoURI) {
    return (
      <img
        alt='Token icon'
        className={className}
        key={token.address}
        width={style?.width || defaultSize.toString()}
        height={style?.height || defaultSize.toString()}
        src={token.logoURI}
        style={{
          margin: '0',
          borderRadius: '50%',
          backgroundColor: 'transparent',
          backgroundClip: 'padding-box',
          ...style,
        }}
      />
    );
  }

  return (
    <Identicon
      address={mintAddress}
      style={{
        marginRight: '0.5rem',
        width: defaultSize,
        height: defaultSize,
        marginTop: 2,
        ...style,
      }}
    />
  );
};

export const PoolIcon = (props: { mintA: string; mintB: string; style?: React.CSSProperties; className?: string }) => {
  const { mintA, mintB, style, className } = props;
  return (
    <div className={className} style={{ display: 'flex' }}>
      <TokenIcon mintAddress={mintA} style={{ marginRight: '-0.5rem', ...style }} />
      <TokenIcon mintAddress={mintB} />
    </div>
  );
};
