import { MSP, Stream, StreamActivity, STREAM_STATUS } from '@mean-dao/msp';
import { TokenInfo } from '@solana/spl-token-registry';
import { PublicKey } from '@solana/web3.js';
import { Modal, Switch } from "antd";
import { useCallback, useContext, useEffect, useState } from 'react';
import { AppStateContext } from '../../../../contexts/appstate';
import { consoleOut } from '../../../../middleware/ui';
import { MoneyStreamDetails } from '../MoneyStreamDetails';

export const VestingContractStreamDetailModal = (props: {
  accountAddress: string;
  handleClose: any;
  highlightedStream: Stream | undefined;
  isDebugging?: boolean;
  isVisible: boolean;
  msp: MSP | undefined;
  selectedToken: TokenInfo | undefined;
}) => {
  const {
    accountAddress,
    handleClose,
    highlightedStream,
    isDebugging,
    isVisible,
    msp,
    selectedToken,
  } = props;

  const {
    isWhitelisted,
  } = useContext(AppStateContext);

  const [streamDetail, setStreamDetail] = useState<Stream | undefined>();
  const [loadingStreamActivity, setLoadingStreamActivity] = useState(false);
  const [streamActivity, setStreamActivity] = useState<StreamActivity[]>([]);
  const [hasMoreStreamActivity, setHasMoreStreamActivity] = useState<boolean>(true);
  const [isToggledShowLastReadData, setIsToggledShowLastReadData] = useState<boolean>(false);

  const isInboundStream = useCallback((): boolean => {
    return streamDetail && accountAddress && (streamDetail.beneficiary as PublicKey).toBase58() === accountAddress ? true : false;
  }, [accountAddress, streamDetail]);

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

  // Live data calculation - Refresh Stream detail
  useEffect(() => {

    if (isToggledShowLastReadData) {
      return;
    }

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

  }, [isToggledShowLastReadData, msp, streamDetail]);

  const onToggleShowLastReadData = (value: boolean) => {
    setIsToggledShowLastReadData(value);
  };

  const loadMoreActivity = () => {
    if (!highlightedStream) { return; }
    getStreamActivity(highlightedStream.id.toBase58());
  }

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">View vesting stream</div>}
      footer={null}
      open={isVisible}
      onCancel={handleClose}
      width={480}>

      {isDebugging && isWhitelisted && (
        <div className="flex-fixed-right shift-up-2 mb-3">
          <div className="left">Show last read data</div>
          <div className="right">
            <Switch 
              size="small"
              checked={isToggledShowLastReadData}
              onChange={onToggleShowLastReadData}
            />
          </div>
        </div>
      )}

      <MoneyStreamDetails
        hasMoreStreamActivity={hasMoreStreamActivity}
        highlightedStream={highlightedStream}
        isInboundStream={isInboundStream()}
        loadingStreamActivity={loadingStreamActivity}
        onLoadMoreActivities={loadMoreActivity}
        selectedToken={selectedToken}
        stream={isToggledShowLastReadData ? highlightedStream : streamDetail}
        streamActivity={streamActivity}
      />
    </Modal>
  );
};
