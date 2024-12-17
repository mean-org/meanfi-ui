import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Button } from 'antd';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWallet } from 'src/contexts/wallet';
import type { TokenInfo } from 'src/models/SolanaTokenInfo';
import { WRAPPED_SOL_MINT_ADDRESS } from '../../app-constants';
import { openNotification } from '../../components/Notifications';
import { useNativeAccount } from '../../contexts/accounts';
import { AppStateContext } from '../../contexts/appstate';
import { useConnection } from '../../contexts/connection';
import { environment } from '../../environments/environment';
import { getAmountFromLamports, getAmountWithSymbol } from '../../middleware/utils';

export const FaucetView = () => {
  const connection = useConnection();
  const { publicKey } = useWallet();
  const { splTokenList, selectedToken, setSelectedToken, refreshTokenBalance } = useContext(AppStateContext);
  const { t } = useTranslation('common');

  const { account } = useNativeAccount();
  const [nativeBalance, setNativeBalance] = useState(0);

  useEffect(() => {
    if (!(splTokenList && selectedToken)) {
      return;
    }

    const myToken = splTokenList.find(t => t.address === WRAPPED_SOL_MINT_ADDRESS);
    if (selectedToken.address === WRAPPED_SOL_MINT_ADDRESS) {
      refreshTokenBalance();
      return;
    }
    if (myToken) {
      setSelectedToken(myToken as TokenInfo);
    }
  }, [splTokenList, selectedToken, setSelectedToken, refreshTokenBalance]);

  // Keep account balance updated
  useEffect(() => {
    setNativeBalance(getAmountFromLamports(account?.lamports));
    // Refresh token balance
    refreshTokenBalance();
  }, [account, refreshTokenBalance]);

  const getFaucetAmount = useCallback((): number => {
    return 1 * LAMPORTS_PER_SOL;
  }, []);

  const airdrop = useCallback(() => {
    if (!publicKey) {
      return;
    }

    if (environment === 'production') {
      openNotification({
        title: t('notifications.error-title'),
        description: t('notifications.error-cannot-faucet-mainnet-message'),
        type: 'error',
      });
      return;
    }

    try {
      connection.requestAirdrop(publicKey, getFaucetAmount()).then(() => {
        openNotification({
          description: t('notifications.success-account-funded-message') + '.',
          type: 'success',
        });
      });
    } catch (error) {
      console.error(error);
      openNotification({
        title: t('notifications.error-title'),
        description: t('notifications.error-cannot-fund-account-message'),
        type: 'error',
      });
    }
  }, [publicKey, connection, getFaucetAmount, t]);

  const disconnectedBlock = <p>{t('general.not-connected')}.</p>;

  const connectedBlock = (
    <>
      <div className='deposit-input-title' style={{ margin: 10 }}>
        <p>
          {t('faucet.current-sol-balance')}: {getAmountWithSymbol(nativeBalance, WRAPPED_SOL_MINT_ADDRESS, true)} SOL
        </p>
        {environment === 'local' && <p className='localdev-label'>lamports: {account?.lamports || 0}</p>}
        <p>
          {t('faucet.funding-amount')}{' '}
          {getAmountWithSymbol(getFaucetAmount() / LAMPORTS_PER_SOL, WRAPPED_SOL_MINT_ADDRESS, true)} SOL
        </p>
      </div>
      <Button type='primary' shape='round' size='large' onClick={airdrop}>
        {t('faucet.fund-cta')}
      </Button>
    </>
  );

  return (
    <div className='container'>
      <div className='interaction-area'>{publicKey ? connectedBlock : disconnectedBlock}</div>
    </div>
  );
};
