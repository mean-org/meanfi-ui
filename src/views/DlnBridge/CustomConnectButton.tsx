import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Button } from 'antd';
import { IconCaretDown, IconWallet } from 'src/Icons'

const CustomConnectButton = () => {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const connected = mounted && account && chain;
        return (
          <div
            {...(!mounted && {
              'aria-hidden': true,
              style: {
                opacity: 0,
                pointerEvents: 'none',
                userSelect: 'none',
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <Button block type='primary' shape='round' size='large' onClick={openConnectModal}>
                    Connect Wallet
                  </Button>
                );
              }
              if (chain.unsupported) {
                return (
                  <Button block type='primary' shape='round' size='large' onClick={openChainModal}>
                    Wrong network
                  </Button>
                );
              }

              return (
                <button className='flat-button evm-connect-button' onClick={openAccountModal} type='button'>
                  <span className='account-name'>{account.displayName}</span>
                  <span className='account-balance'>
                    {account.displayBalance ? ` (${account.displayBalance})` : ''}
                  </span>
                  <IconCaretDown className='mean-svg-icons caret-down' />
                  <IconWallet className='mean-svg-icons wallet-icon' />
                </button>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
};

export default CustomConnectButton;
