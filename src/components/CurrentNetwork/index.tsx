import { useTranslation } from "react-i18next";
import { useConnectionConfig } from "../../contexts/connection";

export const CurrentNetwork = (props: {}) => {

  const connection = useConnectionConfig();
  const { t } = useTranslation("common");

  let chainLogoUrl: string;
  let chainName: string;

  const getUiTranslation = (translationId: string) => {
    return t(`account-area.${translationId}`);
  }

  if (connection) {
    const mainToken = connection.tokens.filter(t => t.name === 'Wrapped SOL');
    chainName = mainToken && mainToken.length
      ? mainToken[0].extensions?.coingeckoId || getUiTranslation('network-unknown')
      : getUiTranslation('network-unknown');
    chainLogoUrl = mainToken && mainToken.length ? mainToken[0].logoURI || 'solana-logo.png' : 'solana-logo.png';
    return (
      <div className="connected-network">
        <span className="chain-logo">
          <img src={chainLogoUrl} alt={chainName} />
        </span>
        <span className="chain-name">{chainName}</span>
      </div>
    );
  } else {
    return null;
  }
};
