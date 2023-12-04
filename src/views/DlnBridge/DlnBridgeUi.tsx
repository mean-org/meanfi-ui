import { useEffect } from 'react';
import { useDlnBridge } from './DlnBridgeProvider';

const DlnBridgeUi = () => {
  const { supportedChains, sourceChain, destinationChain, tokens } = useDlnBridge();

  useEffect(() => {
    console.log('supportedChains:', supportedChains);
  }, [supportedChains]);

  useEffect(() => {
    console.log('tokens:', tokens);
  }, [tokens]);

  return (
    <div>
      <div>Source chain ID: {sourceChain}</div>
      <div>Destination chain ID: {destinationChain}</div>
      <div>Source chain tokens: {tokens ? tokens.size : '-'}</div>
    </div>
  );
};

export default DlnBridgeUi;
