import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Modal } from "antd";
import { TokenInfo } from '@solana/spl-token-registry';
import { MSP, Stream, StreamActivity, STREAM_STATUS } from '@mean-dao/msp';
import { AppStateContext } from '../../../../contexts/appstate';
import { consoleOut } from '../../../../utils/ui';
import { shortenAddress } from '../../../../utils/utils';
import { MoneyStreamDetails } from '../MoneyStreamDetails';
import { PublicKey } from '@solana/web3.js';
import { CUSTOM_TOKEN_NAME } from '../../../../constants';

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
  const [loadingStreamActivity, setLoadingStreamActivity] = useState(false);
  const [streamActivity, setStreamActivity] = useState<StreamActivity[]>([]);
  const [hasMoreStreamActivity, setHasMoreStreamActivity] = useState<boolean>(true);

  const isInboundStream = useCallback((): boolean => {
    return streamDetail && accountAddress && streamDetail.beneficiary === accountAddress ? true : false;
  }, [accountAddress, streamDetail]);

  const setCustomToken = useCallback((address: string) => {

    const unkToken: TokenInfo = {
      address: address,
      name: CUSTOM_TOKEN_NAME,
      chainId: 101,
      decimals: 6,
      symbol: shortenAddress(address),
    };

    setSelectedToken(unkToken);
    consoleOut("Selected stream token:", unkToken, 'darkgreen');
    setEffectiveRate(0);

  }, [setEffectiveRate]);

  const getStreamActivity = useCallback((streamId: string, clearHistory = false) => {
    if (!streamId || !msp || loadingStreamActivity) {
      return;
    }

    consoleOut('Loading stream activity...', '', 'crimson');

    setLoadingStreamActivity(true);
    const streamPublicKey = new PublicKey(streamId);

    const before = clearHistory
      ? ''
      : streamActivity && streamActivity.length > 0
        ? streamActivity[streamActivity.length - 1].signature
        : '';
    consoleOut('before:', before, 'crimson');
    msp.listStreamActivity(streamPublicKey, before, 5)
      .then((value: StreamActivity[]) => {
        consoleOut('activity:', value);
        const activities = clearHistory
          ? []
          : streamActivity && streamActivity.length > 0
            ? JSON.parse(JSON.stringify(streamActivity)) // Object.assign({}, streamActivity)
            : [];

        if (value && value.length > 0) {
          activities.push(...value);
          setHasMoreStreamActivity(true);
        } else {
          setHasMoreStreamActivity(false);
        }
        setStreamActivity(activities);
      })
      .catch(err => {
        console.error(err);
        setStreamActivity([]);
        setHasMoreStreamActivity(false);
      })
      .finally(() => setLoadingStreamActivity(false));

  }, [loadingStreamActivity, msp, streamActivity]);

  // Get a copy of the stream to work with and reset activity data
  useEffect(() => {
    if (isVisible && highlightedStream && !streamDetail) {
      setStreamDetail(highlightedStream);
      consoleOut('highlightedStream:', highlightedStream, 'darkgreen');
      // Clear previous data related to stream activity
      setStreamActivity([]);
      setHasMoreStreamActivity(true);
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
        msp.refreshStream(streamDetail as Stream, undefined, false).then(detail => {
          setStreamDetail(detail as Stream);
        });
      }
    }, 1000);

    return () => {
      clearTimeout(timeout);
    }

  }, [msp, streamDetail]);

  const loadMoreActivity = () => {
    if (!highlightedStream) { return; }
    getStreamActivity(highlightedStream.id as string);
  }

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">View vesting stream</div>}
      footer={null}
      visible={isVisible}
      onCancel={handleClose}
      width={480}>
      <MoneyStreamDetails
        hasMoreStreamActivity={hasMoreStreamActivity}
        highlightedStream={highlightedStream}
        isInboundStream={isInboundStream()}
        loadingStreamActivity={loadingStreamActivity}
        onLoadMoreActivities={loadMoreActivity}
        selectedToken={selectedToken}
        stream={streamDetail}
        streamActivity={streamActivity}
      />
    </Modal>
  );
};
