import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Modal } from "antd";
import { TokenInfo } from '@solana/spl-token-registry';
import { Stream } from '@mean-dao/msp';
import { AppStateContext } from '../../../../contexts/appstate';
import { consoleOut } from '../../../../utils/ui';
import { shortenAddress } from '../../../../utils/utils';

export const VestingContractStreamDetail = (props: {
  handleClose: any;
  isVisible: boolean;
  highlightedStream: Stream | undefined;
}) => {
  const {
    handleClose,
    isVisible,
    highlightedStream,
  } = props;
  const {
    getTokenByMintAddress,
    setEffectiveRate,
  } = useContext(AppStateContext);

  const [selectedToken, setSelectedToken] = useState<TokenInfo | undefined>(undefined);
  const [streamDetail, setStreamDetail] = useState<Stream | undefined>();

  const setCustomToken = useCallback((address: string) => {

    const unkToken: TokenInfo = {
      address: address,
      name: 'Unknown',
      chainId: 101,
      decimals: 6,
      symbol: shortenAddress(address),
    };

    setSelectedToken(unkToken);
    consoleOut("Selected stream token:", unkToken, 'darkgreen');
    setEffectiveRate(0);

  }, [setEffectiveRate]);

  // Get a copy of the stream to work with
  useEffect(() => {
    if (isVisible && highlightedStream && !streamDetail) {
      setStreamDetail(highlightedStream);
      consoleOut('highlightedStream:', highlightedStream, 'darkgreen');
    }
  }, [highlightedStream, isVisible, streamDetail]);

  // Set token from the stream
  useEffect(() => {
    if (isVisible && highlightedStream && !selectedToken) {

      const token = getTokenByMintAddress(highlightedStream.associatedToken as string);
      if (token) {
        consoleOut("Selected stream token:", token.symbol, 'darkgreen');
        setSelectedToken(token);
      } else {
        setCustomToken(highlightedStream.associatedToken as string);
      }

    }
  }, [getTokenByMintAddress, isVisible, selectedToken, setCustomToken, highlightedStream]);

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">View vesting stream</div>}
      footer={null}
      visible={isVisible}
      onCancel={handleClose}
      width={480}>
      <p>Here it goes</p>
    </Modal>
  );
};
