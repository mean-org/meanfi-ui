import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Modal } from "antd";
import { TokenInfo } from '@solana/spl-token-registry';
import { MSP, Stream, STREAM_STATUS } from '@mean-dao/msp';
import { AppStateContext } from '../../../../contexts/appstate';
import { consoleOut } from '../../../../utils/ui';
import { shortenAddress } from '../../../../utils/utils';
import { MoneyStreamDetails } from '../MoneyStreamDetails';

export const VestingContractStreamDetailModal = (props: {
  accountAddress: string;
  handleClose: any;
  highlightedStream: Stream | undefined;
  isVisible: boolean;
  msp: MSP | undefined;
}) => {
  const {
    accountAddress,
    handleClose,
    highlightedStream,
    isVisible,
    msp,
  } = props;
  const {
    getTokenByMintAddress,
    setEffectiveRate,
  } = useContext(AppStateContext);

  const [selectedToken, setSelectedToken] = useState<TokenInfo | undefined>(undefined);
  const [streamDetail, setStreamDetail] = useState<Stream | undefined>();

  const isInboundStream = useCallback((): boolean => {
    return streamDetail && accountAddress && streamDetail.beneficiary === accountAddress ? true : false;
  }, [accountAddress, streamDetail]);

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

  // Live data calculation - Refresh Stream detail
  useEffect(() => {

    const timeout = setTimeout(() => {
      if (msp && streamDetail && streamDetail.status === STREAM_STATUS.Running) {
        msp.refreshStream(streamDetail as Stream).then(detail => {
          setStreamDetail(detail as Stream);
        });
      }
    }, 1000);

    return () => {
      clearTimeout(timeout);
    }

  }, [msp, streamDetail]);

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">View vesting stream</div>}
      footer={null}
      visible={isVisible}
      onCancel={handleClose}
      width={480}>
      <MoneyStreamDetails
        stream={streamDetail}
        highlightedStream={highlightedStream}
        isInboundStream={isInboundStream()}
        selectedToken={selectedToken}
      />
    </Modal>
  );
};
