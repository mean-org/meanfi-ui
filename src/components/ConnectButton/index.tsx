import { Button } from "antd";
import { useTranslation } from "react-i18next";
import { useWallet } from "../../contexts/wallet";

export const ConnectButton = () => {
  const { connected, select } = useWallet();
  const { t } = useTranslation("common");

  if (!connected) {
    return (
      <Button type="primary" shape="round" size="large" onClick={select}>
        {t('account-area.connect-button')}
      </Button>
    );
  }

  return null;

};
