import React, { useCallback, useContext, useEffect, useState } from 'react';
import { useNativeAccount } from '../../contexts/accounts';
import { useWallet } from '../../contexts/wallet';
import { getTokenAmountAndSymbolByTokenAddress } from '../../utils/utils';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { NATIVE_SOL } from '../../utils/tokens';
import { Tooltip } from 'antd';
import { getAmountWithTokenSymbol } from '../../utils/ui';
import { TokenInfo } from '@solana/spl-token-registry';
import { TxConfirmationContext } from '../../contexts/transaction-status';
import { IconNotification } from '../../Icons';
import useWindowSize from '../../hooks/useWindowResize';

export const CurrentBalance = (props: {
  onOpenDrawer: any;
}) => {

  const { publicKey } = useWallet();
  const { account } = useNativeAccount();
  const { width } = useWindowSize();
  const [nativeBalance, setNativeBalance] = useState(0);
  const { confirmationHistory } = useContext(TxConfirmationContext);

  const isLargeScreen = useCallback(() => {
    return width >= 1200;
  }, [width]);

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
    <img className="token-icon" src="/solana-logo.png" alt="Solana logo" />
  )

  if (publicKey) {
    return (
      <div className="connected-network">
        {!isLargeScreen() && confirmationHistory && confirmationHistory.length > 0 && (
          <div className="events-drawer-trigger lower simplelink" onClick={props.onOpenDrawer}>
            <div className="magictime tinRightIn">
              <IconNotification className="mean-svg-icons"/>
            </div>
          </div>
        )}
        <span className="chain-logo">
          {renderSolanaIcon}
        </span>
        <span className="account-balance">
          <Tooltip placement="bottom" title={getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL.address)}>
            <span>
              {nativeBalance ? getAmountWithTokenSymbol(
                  nativeBalance,
                  NATIVE_SOL as TokenInfo,
                  nativeBalance < 1 ? 4 : 3
                ) : '0.0'
              }
            </span>
          </Tooltip>
        </span>
        {isLargeScreen() && confirmationHistory && confirmationHistory.length > 0 && (
          <div className="events-drawer-trigger upper simplelink" onClick={props.onOpenDrawer}>
            <div className="magictime tinRightIn">
              <IconNotification className="mean-svg-icons"/>
            </div>
          </div>
        )}
      </div>
    );
  } else {
    return null;
  }
};
