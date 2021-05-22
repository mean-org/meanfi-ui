import { useConnectionConfig } from "../../contexts/connection";
import { Popover } from "antd";
import { Settings } from "../Settings";

export const CurrentNetwork = (props: {}) => {

  const connection = useConnectionConfig();

  let chainLogoUrl: string;
  let chainName: string;


  if (connection) {
    const mainToken = connection.tokens.filter(t => t.name === 'Wrapped SOL');
    chainName = mainToken && mainToken.length ? mainToken[0].extensions?.coingeckoId || 'Unknown' : 'Unknown';
    chainLogoUrl = mainToken && mainToken.length ? mainToken[0].logoURI || 'solana-logo.png' : 'solana-logo.png';
    return (
      <Popover
        placement="bottom"
        title="Network selection"
        content={<Settings />}
        trigger="click">
        <div className="connected-network simplelink">
          <span className="chain-logo">
            <img src={chainLogoUrl} alt={chainName} />
          </span>
          <span className="chain-name">{chainName}</span>
        </div>
      </Popover>
    );
  } else {
    return null;
  }
};
