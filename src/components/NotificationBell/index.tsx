import React, { useCallback } from 'react';
import { IconNotification } from '../../Icons';
import { useWallet } from '../../contexts/wallet';
import useWindowSize from '../../hooks/useWindowResize';

export const NotificationBell = (props: { onOpenDrawer: any }) => {
  const { publicKey } = useWallet();
  const { width } = useWindowSize();

  const isLargeScreen = useCallback(() => {
    return width >= 1200;
  }, [width]);

  if (publicKey) {
    return (
      <>
        {!isLargeScreen() && (
          <div className='events-drawer-trigger lower' onClick={props.onOpenDrawer}>
            <IconNotification className='mean-svg-icons' />
          </div>
        )}
        {isLargeScreen() && (
          <div className='events-drawer-trigger upper' onClick={props.onOpenDrawer}>
            <IconNotification className='mean-svg-icons' />
          </div>
        )}
      </>
    );
  } else {
    return null;
  }
};
