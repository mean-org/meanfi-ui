import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Button } from 'antd';
import { ExclamationCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { TreasuryInfo, StreamInfo } from '@mean-dao/money-streaming/lib/types';
import { Stream, PaymentStreamingAccount, PaymentStreaming, AccountType } from '@mean-dao/payment-streaming';
import { StreamTreasuryType } from 'models/treasuries';
import { useConnection } from 'contexts/connection';
import { useWallet } from 'contexts/wallet';
import { consoleOut } from 'middleware/ui';
import { MoneyStreaming } from '@mean-dao/money-streaming';
import { PublicKey } from '@solana/web3.js';
import { getStreamingAccountType } from 'middleware/getStreamingAccountType';

export const StreamLockedModal = (props: {
  handleClose: any;
  isVisible: boolean;
  streamDetail: Stream | StreamInfo | undefined;
  mspClient: MoneyStreaming | PaymentStreaming | undefined;
}) => {
  const {
    handleClose,
    isVisible,
    streamDetail,
    mspClient,
  } = props;
  const { t } = useTranslation('common');
  const connection = useConnection();
  const { publicKey } = useWallet();
  const [localStreamDetail, setLocalStreamDetail] = useState<
    Stream | StreamInfo | undefined
  >(undefined);
  const [loadingTreasuryDetails, setLoadingTreasuryDetails] = useState(true);

  const getTreasuryTypeByTreasuryId = useCallback(async (
    treasuryId: string,
    streamVersion: number,
  ): Promise<StreamTreasuryType | undefined> => {
    if (!connection || !publicKey || !mspClient) {
      return undefined;
    }

    const treasuryPk = new PublicKey(treasuryId);

    try {
      let details: PaymentStreamingAccount | TreasuryInfo | undefined = undefined;
      if (streamVersion < 2) {
        details = await (mspClient as MoneyStreaming).getTreasury(treasuryPk);
      } else {
        details = await (mspClient as PaymentStreaming).getAccount(treasuryPk);
      }
      if (details) {
        const type = getStreamingAccountType(details);
        if (type === AccountType.Lock) {
          return 'locked';
        } else {
          return 'open';
        }
      } else {
        return 'unknown';
      }
    } catch (error) {
      console.error(error);
      return 'unknown';
    } finally {
      setLoadingTreasuryDetails(false);
    }
  },
    [publicKey, connection, mspClient],
  );

  // Set treasury type
  useEffect(() => {
    if (isVisible && localStreamDetail) {
      const v1 = localStreamDetail as StreamInfo;
      const v2 = localStreamDetail as Stream;
      consoleOut('fetching treasury details...', '', 'blue');
      getTreasuryTypeByTreasuryId(
        localStreamDetail.version < 2
          ? (v1.treasuryAddress as string)
          : v2.psAccount.toBase58(),
        localStreamDetail.version,
      ).then(value => {
        consoleOut('streamTreasuryType:', value, 'crimson');
      });
    }
  }, [isVisible, localStreamDetail, getTreasuryTypeByTreasuryId]);

  // Read and keep the input copy of the stream
  useEffect(() => {
    if (isVisible && !localStreamDetail && streamDetail) {
      setLocalStreamDetail(streamDetail);
    }
  }, [isVisible, localStreamDetail, streamDetail]);

  return (
    <Modal
      className="mean-modal simple-modal"
      title={
        <div className="modal-title">
          {t('streams.locked-stream-modal-title')}
        </div>
      }
      footer={null}
      open={isVisible}
      onCancel={handleClose}
      width={400}
    >
      {loadingTreasuryDetails ? (
        // The loading part
        <div className="transaction-progress">
          <LoadingOutlined
            style={{ fontSize: 48 }}
            className="icon mt-0"
            spin
          />
          <h4 className="operation">
            {t('close-stream.loading-treasury-message')}
          </h4>
        </div>
      ) : (
        // The user can't top-up the stream from a locked treasury
        <div className="transaction-progress">
          <ExclamationCircleOutlined
            style={{ fontSize: 48 }}
            className="icon mt-0"
          />
          <h4 className="operation">{t('streams.locked-stream-message')}</h4>
          <div className="mt-3">
            <Button
              type="primary"
              shape="round"
              size="large"
              onClick={handleClose}
            >
              {t('general.cta-close')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
