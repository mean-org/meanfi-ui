import { useCallback, useContext, useEffect } from "react";
import { useConnection } from "../../contexts/connection";
import { useWallet } from "../../contexts/wallet";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { notify } from "../../utils/notifications";
import { WRAPPED_SOL_MINT_ADDRESS } from "../../constants";
import { Button } from "antd";
import { environment } from "../../environments/environment";
import { formatNumber } from "../../utils/utils";
import { useNativeAccount } from "../../contexts/accounts";
import { AppStateContext } from "../../contexts/appstate";
import { TokenInfo } from "@solana/spl-token-registry";
import { useTranslation } from "react-i18next";

export const FaucetView = () => {
  const connection = useConnection();
  const { publicKey } = useWallet();
  const { account } = useNativeAccount();
  const {
    tokenList,
    selectedToken,
    setSelectedToken,
    refreshTokenBalance
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');

  useEffect(() => {

    if (tokenList && selectedToken) {
      const myToken = tokenList.filter(t => t.address === WRAPPED_SOL_MINT_ADDRESS)[0];
      if (selectedToken.address === WRAPPED_SOL_MINT_ADDRESS) {
        refreshTokenBalance();
      } else {
        setSelectedToken(myToken as TokenInfo);
      }
    }

    return () => {};
  }, [
    tokenList,
    selectedToken,
    setSelectedToken,
    refreshTokenBalance
  ]);

  const getFaucetAmount = (): number => {
    if (environment === 'staging') {
      return 1 * LAMPORTS_PER_SOL;
    }
    return 4 * LAMPORTS_PER_SOL;
  }

  const getAccountBalance = (): number => {
    return (account?.lamports || 0) / LAMPORTS_PER_SOL;
  }

  const airdrop = useCallback(() => {
    if (!publicKey) {
      return;
    }

    if (environment === 'production') {
      notify({
        message: t('notifications.error-title'),
        description: t('notifications.error-cannot-faucet-mainnet-message'),
        type: "error"
      });
      return;
    }

    try {
      connection.requestAirdrop(publicKey, getFaucetAmount()).then(() => {
        notify({
          description: t('notifications.success-account-funded-message') + '.',
          type: "success"
        });
      });
    } catch (error) {
      console.log(error);
      notify({
        message: t('notifications.error-title'),
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
        <p>{t('faucet.current-sol-balance')}: {formatNumber.format(getAccountBalance())} SOL</p>
        {environment === 'local' && (
          <p className="localdev-label">lamports: {account?.lamports || 0}</p>
        )}
        <p>{t('faucet.funding-amount')} {formatNumber.format(getFaucetAmount() / LAMPORTS_PER_SOL)} SOL</p>
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
