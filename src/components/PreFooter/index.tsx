import { useTranslation } from "react-i18next";

export const PreFooter = () => {
  const { t } = useTranslation('common');

  return (
    <div className="pre-footer-notice">
      <div className="footer-left">
        {t(`general.app-background-disclaimer`)}
      </div>
      <div className="footer-right">
        Powered by the Solana Network
      </div>
    </div>
  );
};
