import React from 'react';
import { useCallback, useContext, useEffect, useState } from "react";
import { useConnection } from "../../contexts/connection";
import { useWallet } from "../../contexts/wallet";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { WRAPPED_SOL_MINT_ADDRESS } from "../../constants";
import { Button } from "antd";
import { environment } from "../../environments/environment";
import { getAmountFromLamports, getAmountWithSymbol } from "../../middleware/utils";
import { useNativeAccount } from "../../contexts/accounts";
import { AppStateContext } from "../../contexts/appstate";
import { TokenInfo } from "@solana/spl-token-registry";
import { useTranslation } from "react-i18next";
import { openNotification } from '../../components/Notifications';

export const FaucetView = () => {
  const connection = useConnection();
  const { publicKey } = useWallet();
  const {
    tokenList,
    selectedToken,
    setSelectedToken,
    refreshTokenBalance
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');

  const { account } = useNativeAccount();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);

  useEffect(() => {

    if (tokenList && selectedToken) {
      const myToken = tokenList.filter(t => t.address === WRAPPED_SOL_MINT_ADDRESS)[0];
      if (selectedToken.address === WRAPPED_SOL_MINT_ADDRESS) {
        refreshTokenBalance();
      } else {
        setSelectedToken(myToken as TokenInfo);
      }
    }
  }, [
    tokenList,
    selectedToken,
    setSelectedToken,
    refreshTokenBalance
  ]);

  useEffect(() => {
    if (account?.lamports !== previousBalance || !nativeBalance) {
      // Refresh token balance
      refreshTokenBalance();
      setNativeBalance(getAmountFromLamports(account?.lamports));
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [
    account,
    nativeBalance,
    previousBalance,
    refreshTokenBalance
  ]);

  const getFaucetAmount = (): number => {
    return 1 * LAMPORTS_PER_SOL;
  }

  const airdrop = useCallback(() => {
    if (!publicKey) {
      return;
    }

    if (environment === 'production') {
      openNotification({
        title: t('notifications.error-title'),
        description: t('notifications.error-cannot-faucet-mainnet-message'),
        type: "error"
      });
      return;
    }

    try {
      connection.requestAirdrop(publicKey, getFaucetAmount()).then(() => {
        openNotification({
          description: t('notifications.success-account-funded-message') + '.',
          type: "success"
        });
      });
    } catch (error) {
      console.error(error);
      openNotification({
        title: t('notifications.error-title'),
        description: t('notifications.error-cannot-fund-account-message'),
        type: "error"
      });
    }
  }, [publicKey, connection, t]);

  const disconnectedBlock = (
    <p>{t('general.not-connected')}.</p>
  );

  const connectedBlock = (
    <>
      <div className="deposit-input-title" style={{ margin: 10 }}>
        <p>{t('faucet.current-sol-balance')}: {getAmountWithSymbol(nativeBalance, WRAPPED_SOL_MINT_ADDRESS, true)} SOL</p>
        {environment === 'local' && (
          <p className="localdev-label">lamports: {account?.lamports || 0}</p>
        )}
        <p>{t('faucet.funding-amount')} {getAmountWithSymbol(getFaucetAmount() / LAMPORTS_PER_SOL, WRAPPED_SOL_MINT_ADDRESS, true)} SOL</p>
      </div>
      <Button type="primary" shape="round" size="large" onClick={airdrop}>{t('faucet.fund-cta')}</Button>
    </>
  );

  return (
    <div className="container">
      <div className="interaction-area">
        {publicKey ? connectedBlock : disconnectedBlock}
      </div>
    </div>
  );
};
