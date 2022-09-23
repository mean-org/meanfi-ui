import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from "antd";
import { JupiterExchange } from '../../views';
import { getTokenBySymbol, useLocalStorageState } from '../../middleware/utils';
import { getLiveRpc, RpcConfig } from '../../services/connections-hq';
import { useNavigate } from 'react-router-dom';
import { Connection } from '@solana/web3.js';
import { consoleOut } from '../../middleware/ui';
import { TokenInfo } from '@solana/spl-token-registry';

export const ExchangeAssetModal = (props: {
  handleClose: any;
  isVisible: boolean;
  tokenSymbol: string;
}) => {
  const { tokenSymbol, isVisible, handleClose } = props;
  const navigate = useNavigate();

  // Connection management
  const [cachedRpcJson] = useLocalStorageState("cachedRpc");
  const [mainnetRpc, setMainnetRpc] = useState<RpcConfig | null>(null);
  const cachedRpc = (cachedRpcJson as RpcConfig);
  const [fromMint, setFromMint] = useState<string | null>(null);

  // Get RPC endpoint
  useEffect(() => {
    (async () => {
      if (cachedRpc && cachedRpc.networkId !== 101) {
        const mainnetRpc = await getLiveRpc(101);
        if (!mainnetRpc) {
          navigate('/service-unavailable');
        }
        setMainnetRpc(mainnetRpc);
      } else {
        setMainnetRpc(null);
      }
    })();
    return () => { }
  }, [
    cachedRpc,
    navigate,
  ]);

  const connection = useMemo(() => new Connection(mainnetRpc ? mainnetRpc.httpProvider : cachedRpc.httpProvider, "confirmed"),
    [cachedRpc.httpProvider, mainnetRpc]);

  useEffect(() => {
    if (connection && tokenSymbol && isVisible) {
      let from: TokenInfo | undefined = undefined;
      from = tokenSymbol
        ? tokenSymbol === 'SOL'
          ? getTokenBySymbol('wSOL')
          : getTokenBySymbol(tokenSymbol)
        : undefined;
      if (from) {
        setFromMint(from.address);
        consoleOut('from.address:', from.address, 'blue');
      }
    }
  }, [connection, isVisible, tokenSymbol]);

  return (
    <Modal
      className="mean-modal simple-modal exchange-modal"
      title={<div className="modal-title">Exchange Asset</div>}
      footer={null}
      open={isVisible}
      onOk={handleClose}
      onCancel={handleClose}
      width={480}>
        {fromMint && (
          <JupiterExchange
            connection={connection}
            queryFromMint={fromMint}
            queryToMint={null}
            inModal={true}
            swapExecuted={handleClose}
          />
        )}
    </Modal>
  );
};
