import React, { useEffect, useState } from 'react';
import { useNativeAccount } from '../../contexts/accounts';
import { useWallet } from '../../contexts/wallet';
import { getTokenAmountAndSymbolByTokenAddress } from '../../utils/utils';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { NATIVE_SOL } from '../../utils/tokens';
import { Tooltip } from 'antd';
import { getAmountWithTokenSymbol } from '../../utils/ui';
import { TokenInfo } from '@solana/spl-token-registry';

export const CurrentBalance = () => {

  const { publicKey } = useWallet();
  const { account } = useNativeAccount();
  const [nativeBalance, setNativeBalance] = useState(0);

  useEffect(() => {

    const getAccountBalance = (): number => {
      return (account?.lamports || 0) / LAMPORTS_PER_SOL;
    }

    if (!account || !account.lamports) {
      setNativeBalance(0);
    } else {
      setNativeBalance(getAccountBalance());
    }
  }, [account]);

  const renderSolanaIcon = (
    <img className="token-icon" src="solana-logo.png" alt="Solana logo" />
  )

  if (publicKey) {
    return (
      <div className="connected-network">
        <span className="chain-logo">
          {renderSolanaIcon}
        </span>
        <span className="account-balance">
        <Tooltip placement="bottom" title={getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL.address)}>
          <span>{getAmountWithTokenSymbol(nativeBalance, NATIVE_SOL as TokenInfo, 4)}</span>
        </Tooltip>
        </span>
      </div>
    );
  } else {
    return null;
  }
};
