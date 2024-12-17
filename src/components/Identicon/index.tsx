import type { PublicKey } from '@solana/web3.js';
import type React from 'react';
import Jazzicon, { jsNumberForAddress } from 'react-jazzicon';
import { isValidAddress } from '../../middleware/ui';

interface IdenticonProps {
  address?: string | PublicKey;
  style?: React.CSSProperties;
  className?: string;
}

export const Identicon = ({ address, style, className }: IdenticonProps) => {
  const addrString = typeof address === 'string' ? address : address?.toBase58();

  if (addrString && isValidAddress(addrString)) {
    return (
      <div className={className} style={{ display: 'inline-flex' }}>
        <Jazzicon diameter={style?.width ? +style.width : 16} seed={jsNumberForAddress(addrString)} svgStyles={style} />
      </div>
    );
  }

  return null;
};
