import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Button } from 'antd';
import { ExclamationCircleOutlined, LoadingOutlined } from "@ant-design/icons";
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { TreasuryInfo, StreamInfo } from '@mean-dao/money-streaming/lib/types';
import { Stream, Treasury, MSP, TreasuryType } from '@mean-dao/msp';
import { StreamTreasuryType } from '../../models/treasuries';
import { useConnection } from '../../contexts/connection';
import { useWallet } from '../../contexts/wallet';
import { consoleOut } from '../../utils/ui';
import { MoneyStreaming } from '@mean-dao/money-streaming';
import { PublicKey } from '@solana/web3.js';
import { STREAMING_ACCOUNTS_ROUTE_BASE_PATH } from '../../pages/treasuries';
import { STREAMS_ROUTE_BASE_PATH } from '../../views/Streams';

export const StreamLockedModal = (props: {
  handleClose: any;
  isVisible: boolean;
  streamDetail: Stream | StreamInfo | undefined;
  mspClient: MoneyStreaming | MSP | undefined;
}) => {
  const { t } = useTranslation('common');
  const connection = useConnection();
  const navigate = useNavigate();
  const { publicKey } = useWallet();
  const location = useLocation();
  const [treasuryDetails, setTreasuryDetails] = useState<Treasury | TreasuryInfo | undefined>(undefined);
  const [localStreamDetail, setLocalStreamDetail] = useState<Stream | StreamInfo | undefined>(undefined);
  const [loadingTreasuryDetails, setLoadingTreasuryDetails] = useState(true);

  const getTreasuryTypeByTreasuryId = useCallback(async (treasuryId: string, streamVersion: number): Promise<StreamTreasuryType | undefined> => {
    if (!connection || !publicKey || !props.mspClient) { return undefined; }

    const mspInstance = streamVersion < 2 ? props.mspClient as MoneyStreaming : props.mspClient as MSP;
    const treasueyPk = new PublicKey(treasuryId);

    try {
      const details = await mspInstance.getTreasury(treasueyPk);
      if (details) {
        setTreasuryDetails(details);
        consoleOut('treasuryDetails:', details, 'blue');
        const v1 = details as TreasuryInfo;
        const v2 = details as Treasury;
        const isNewTreasury = v2.version && v2.version >= 2 ? true : false;
        const type = isNewTreasury ? v2.treasuryType : v1.type;
        if (type === TreasuryType.Lock) {
          return "locked";
        } else {
          return "open";
        }
      } else {
        setTreasuryDetails(undefined);
        return "unknown";
      }
    } catch (error) {
      console.error(error);
      return "unknown";
    } finally {
      setLoadingTreasuryDetails(false);
    }

  }, [
    publicKey,
    connection,
    props.mspClient,
  ]);

  const getTreasuryName = useCallback(() => {
    if (treasuryDetails) {
      const v1 = treasuryDetails as TreasuryInfo;
      const v2 = treasuryDetails as Treasury;
      const isNewTreasury = v2.version && v2.version >= 2 ? true : false;
      return isNewTreasury ? v2.name : v1.label;
    }
    return '-';
  }, [treasuryDetails]);

  // Set treasury type
  useEffect(() => {
    if (props.isVisible && localStreamDetail) {
      const v1 = localStreamDetail as StreamInfo;
      const v2 = localStreamDetail as Stream;
      consoleOut('fetching treasury details...', '', 'blue');
      getTreasuryTypeByTreasuryId(
        localStreamDetail.version < 2 ? v1.treasuryAddress as string : v2.treasury as string,
        localStreamDetail.version
      ).then(value => {
        consoleOut('streamTreasuryType:', value, 'crimson');
      });
    }
  }, [
    props.isVisible,
    localStreamDetail,
    getTreasuryTypeByTreasuryId
  ]);

  // Read and keep the input copy of the stream
  useEffect(() => {
    if (props.isVisible && !localStreamDetail && props.streamDetail) {
      setLocalStreamDetail(props.streamDetail);
    }
  }, [
    props.isVisible,
    localStreamDetail,
    props.streamDetail,
  ]);

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{t("streams.locked-stream-modal-title")}</div>}
      footer={null}
      visible={props.isVisible}
      onCancel={props.handleClose}
      width={400}>

      {loadingTreasuryDetails ? (
        // The loading part
        <div className="transaction-progress">
          <LoadingOutlined style={{ fontSize: 48 }} className="icon mt-0" spin />
          <h4 className="operation">{t('close-stream.loading-treasury-message')}</h4>
        </div>
      ) : (
        // The user can't top-up the stream from a locked treasury
        <div className="transaction-progress">
          <ExclamationCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
          <h4 className="operation">{t('streams.locked-stream-message')}</h4>

          {/* Only if the user is on streams offer navigating to the treasury */}
          {location.pathname === STREAMS_ROUTE_BASE_PATH && treasuryDetails && (
            <div className="mt-3">
              <span className="mr-1">{t('treasuries.treasury-detail.treasury-name-label')}:</span>
              <span className="mr-1 font-bold">{getTreasuryName()}</span>
              <span className="simplelink underline-on-hover" onClick={() => {
                props.handleClose();
                const url = `${STREAMING_ACCOUNTS_ROUTE_BASE_PATH}?treasury=${treasuryDetails.id}`;
                navigate(url);
              }}>{t('close-stream.see-details-cta')}</span>
            </div>
          )}

          <div className="mt-3">
            <Button
                type="primary"
                shape="round"
                size="large"
                onClick={props.handleClose}>
                {t('general.cta-close')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
