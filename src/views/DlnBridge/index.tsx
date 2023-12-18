import { DlnBridgeProvider } from './DlnBridgeProvider';
import DlnBridgeUi from './DlnBridgeUi';
import { Web3Container } from './Web3Container';

interface DlnBridgeProps {
  fromAssetSymbol?: string;
}

const DlnBridge = ({ fromAssetSymbol }: DlnBridgeProps) => {
  return (
    <Web3Container>
      <DlnBridgeProvider>
        <DlnBridgeUi fromAssetSymbol={fromAssetSymbol} />
      </DlnBridgeProvider>
    </Web3Container>
  );
};

export default DlnBridge;
