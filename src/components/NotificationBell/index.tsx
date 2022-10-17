import React, { useCallback } from 'react';
import { useWallet } from '../../contexts/wallet';
import { IconNotification } from '../../Icons';
import useWindowSize from '../../hooks/useWindowResize';

export const NotificationBell = (props: {
  onOpenDrawer: any;
}) => {

  const { publicKey } = useWallet();
  const { width } = useWindowSize();
  // const { confirmationHistory } = useContext(TxConfirmationContext);

  const isLargeScreen = useCallback(() => {
    return width >= 1200;
  }, [width]);

  if (publicKey) {
    return (
      <div className="connected-network">
        {!isLargeScreen() && (
          <div className="events-drawer-trigger lower" onClick={props.onOpenDrawer}>
            <IconNotification className="mean-svg-icons"/>
            {/* <div className="magictime tinRightIn">
              <IconNotification className="mean-svg-icons"/>
            </div> */}
          </div>
        )}
        {/* <span className="chain-logo">
          {renderSolanaIcon}
        </span>
        <span className="account-balance">
          <Tooltip placement="bottom" title={getAmountWithSymbol(nativeBalance, NATIVE_SOL.address)}>
            <span>
              {nativeBalance ? getAmountWithTokenSymbol(
                  nativeBalance,
                  NATIVE_SOL as TokenInfo,
                  nativeBalance < 1 ? 4 : 3
                ) : '0.0'
              }
            </span>
          </Tooltip>
        </span> */}
        {isLargeScreen() && (
          <div className="events-drawer-trigger upper" onClick={props.onOpenDrawer}>
            {/* {confirmationHistory && confirmationHistory.length > 0} */}
            <IconNotification className="mean-svg-icons"/>
            {/* <div className="magictime tinRightIn">
              <IconNotification className="mean-svg-icons"/>
            </div> */}
          </div>
        )}
      </div>
    );
  } else {
    return null;
  }
};
