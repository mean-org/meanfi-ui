import { DlnBridgeProvider } from './DlnBridgeProvider';
import DlnBridgeUi from './DlnBridgeUi';

const DlnBridge = () => {
  return (
    <DlnBridgeProvider>
      <DlnBridgeUi />
    </DlnBridgeProvider>
  );
};

export default DlnBridge;
