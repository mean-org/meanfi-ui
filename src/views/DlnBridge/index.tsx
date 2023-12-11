import { DlnBridgeProvider } from './DlnBridgeProvider';
import DlnBridgeUi from './DlnBridgeUi';
import { Web3Container } from './Web3Container';

const DlnBridge = () => {
  return (
    <Web3Container>
      <DlnBridgeProvider>
        <DlnBridgeUi />
      </DlnBridgeProvider>
    </Web3Container>
  );
};

export default DlnBridge;
