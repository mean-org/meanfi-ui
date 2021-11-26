import React, { useCallback, useContext, useMemo } from 'react';
import {
  LoadingOutlined, SearchOutlined,
} from '@ant-design/icons';
import { Connection } from '@solana/web3.js';
import { useEffect, useState } from 'react';
import { PreFooter } from '../../components/PreFooter';
import { getSolanaExplorerClusterParam, useConnectionConfig } from '../../contexts/connection';
import { useWallet } from '../../contexts/wallet';
import { AppStateContext } from '../../contexts/appstate';
import { useTranslation } from 'react-i18next';
import { Identicon } from '../../components/Identicon';
import {
  formatThousands,
  shortenAddress
} from '../../utils/utils';
import { Button, Empty, Spin, Tooltip } from 'antd';
import { consoleOut, copyText, delay } from '../../utils/ui';
import {
  SOLANA_EXPLORER_URI_INSPECT_ADDRESS,
  STREAMS_REFRESH_TIMEOUT
} from '../../constants';
import { isDesktop } from "react-device-detect";
import useWindowSize from '../../hooks/useWindowResize';
import { OperationType } from '../../models/enums';
import { TransactionStatusContext } from '../../contexts/transaction-status';
import { notify } from '../../utils/notifications';
import { IconExternalLink, IconRefresh } from '../../Icons';
import { OpenTreasuryModal } from '../../components/OpenTreasuryModal';
import { StreamInfo } from '@mean-dao/money-streaming/lib/types';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

interface TreasuryInfo {
  associatedToken: string;
  createdUtc: string;
  fundsLeft: number;
  id: string;
  name: string;
  numStreams: number;
  transactionSignature: string;
}

export const TreasuriesView = () => {
  const connectionConfig = useConnectionConfig();
  const { publicKey, connected } = useWallet();
  const {
    detailsPanelOpen,
    previousWalletConnectState,
    setDtailsPanelOpen,
  } = useContext(AppStateContext);
  const {
    lastSentTxStatus,
    fetchTxInfoStatus,
    lastSentTxSignature,
    lastSentTxOperationType,
    clearTransactionStatusContext,
  } = useContext(TransactionStatusContext);
  const { t } = useTranslation('common');
  const { width } = useWindowSize();
  const [isSmallUpScreen, setIsSmallUpScreen] = useState(isDesktop);

  const [treasuryList, setTreasuryList] = useState<TreasuryInfo[]>([]);
  const [selectedTreasury, setSelectedTreasury] = useState<TreasuryInfo | undefined>(undefined);
  const [loadingTreasuries, setLoadingTreasuries] = useState(false);
  const [treasuriesLoaded, setTreasuriesLoaded] = useState(false);
  const [customStreamDocked, setCustomStreamDocked] = useState(false);
  const [loadingStreamActivity, setLoadingStreamActivity] = useState(false);
  const [treasuryStreams, setTreasuryStreams] = useState<StreamInfo[]>([]);

  const connection = useMemo(() => new Connection(connectionConfig.endpoint, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true
  }), [
    connectionConfig.endpoint
  ]);

  const getTreasuryStreams = useCallback((treasuryId: string) => {
    if (!connected || !treasuryId) {
      return [];
    }

    if (!loadingStreamActivity) {
      setLoadingStreamActivity(true);

      delay(800)
        .then(() => {
          consoleOut('treasuryStreams:', [], 'blue');
          setTreasuryStreams([]);
          setLoadingStreamActivity(false);
        })
        .catch(err => {
          console.error(err);
          setTreasuryStreams([]);
          setLoadingStreamActivity(false);
        });
    }
  }, [
    connected,
    loadingStreamActivity
  ]);

  const refreshTreasuries = useCallback((reset = false) => {
    if (!publicKey || loadingTreasuries) { return; }

    if (!loadingTreasuries && fetchTxInfoStatus !== "fetching") {
      setLoadingTreasuries(true);

      const signature = lastSentTxStatus || '';
      setTimeout(() => {
        clearTransactionStatusContext();
      });

      const treasuries: TreasuryInfo[] = [
        {
          id: '6pzcFzUyCXDLNtVESGsDipg9hPBHPpBMpkf3t7C3Fn5r',
          createdUtc: 'Sun, 21 Nov 2021 21:02:03 GMT',
          associatedToken: '42f2yFqXh8EDCRCiEBQSweWqpTzKGa9DC8e7UjUfFNrP',
          fundsLeft: 0,
          name: '1-Year part-time associate',
          numStreams: 0,
          transactionSignature: '5AWgszDDYWcyDqjuZHRnU8uuPzNbNZ23VA6fZj4VfUHXNujrg24z6w9qtjPuL5yGh1mvqKQuKG5Tnb782Gr67brx'
        },
        {
          id: '7DwEwuDLG2R388qJiS22cPCP24u7SMkpCqvkAbdASAq4',
          createdUtc: 'Thu, 25 Nov 2021 04:50:49 GMT',
          associatedToken: 'AbQBt9V212HpPVk64YWAApFJrRzdAdu66fwF9neYucpU',
          fundsLeft: 0,
          name: '1-Year full-time associate',
          numStreams: 0,
          transactionSignature: '5AWgszDDYWcyDqjuZHRnU8uuPzNbNZ23VA6fZj4VfUHXNujrg24z6w9qtjPuL5yGh1mvqKQuKG5Tnb782Gr67brx'
        },
      ];

      delay(500)
        .then(() => {
          consoleOut('treasuries:', treasuries, 'blue');
          let item: TreasuryInfo | undefined = undefined;
  
          if (treasuries.length) {
            if (reset) {
              if (signature) {
                item = treasuries.find(d => d.transactionSignature === signature);
              } else {
                item = treasuries[0];
              }
            } else {
              // Try to get current item by its original Tx signature then its id
              if (signature) {
                item = treasuries.find(d => d.transactionSignature === signature);
              } else if (selectedTreasury) {
                const itemFromServer = treasuries.find(i => i.id === selectedTreasury.id);
                item = itemFromServer || treasuries[0];
              } else {
                item = treasuries[0];
              }
            }
            if (!item) {
              item = JSON.parse(JSON.stringify(treasuries[0]));
            }
            consoleOut('selectedTreasury:', item, 'blue');
            if (item) {
              setSelectedTreasury(item);
              getTreasuryStreams(item.id);
            }
          } else {
            setSelectedTreasury(undefined);
          }
  
          setTreasuryList(treasuries);
          setLoadingTreasuries(false);
        });
    }

  }, [
    publicKey,
    lastSentTxStatus,
    selectedTreasury,
    loadingTreasuries,
    fetchTxInfoStatus,
    getTreasuryStreams,
    clearTransactionStatusContext,
  ]);

  /*
  const openTreasuryById = async (treasuryId: string) => {
    let treasuryPublicKey: PublicKey;
    try {
      treasuryPublicKey = new PublicKey(treasuryId);
      try {
        const detail = await ms.getStream(treasuryPublicKey);
        consoleOut('customStream', detail);
        if (detail) {
          setStreamDetail(detail);
          setStreamList([detail]);
          getStreamActivity(treasuryId);
          setCustomStreamDocked(true);
          notify({
            description: t('notifications.success-loading-stream-message', {treasuryId: shortenAddress(treasuryId, 10)}),
            type: "success"
          });
        } else {
          notify({
            message: t('notifications.error-title'),
            description: t('notifications.error-loading-streamid-message', {treasuryId: shortenAddress(treasuryId as string, 10)}),
            type: "error"
          });
        }
      } catch (error) {
        console.error('customStream', error);
        notify({
          message: t('notifications.error-title'),
          description: t('notifications.error-loading-streamid-message', {treasuryId: shortenAddress(treasuryId as string, 10)}),
          type: "error"
        });
      }
    } catch (error) {
      notify({
        message: t('notifications.error-title'),
        description: t('notifications.invalid-publickey-message'),
        type: "error"
      });
    }
  }
  */

  // Load treasuries once per page access
  useEffect(() => {
    if (!publicKey || !connection || treasuriesLoaded) {
      return;
    }

    setTreasuriesLoaded(true);
    consoleOut('Loading treasuries with wallet connection...', '', 'blue');
    refreshTreasuries(true);
  }, [
    publicKey,
    treasuriesLoaded,
    connection,
    refreshTreasuries
  ]);

  // Load/Unload treasuries on wallet connect/disconnect
  useEffect(() => {
    if (previousWalletConnectState !== connected) {
      if (!previousWalletConnectState && connected && publicKey) {
        consoleOut('User is connecting...', publicKey.toBase58(), 'green');
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'green');
        setTreasuryList([]);
        setCustomStreamDocked(false);
        setSelectedTreasury(undefined);
      }
    }
  }, [
    connected,
    previousWalletConnectState,
    publicKey,
  ]);

  // Detect when entering small screen mode
  useEffect(() => {
    if (isSmallUpScreen && width < 576) {
      setIsSmallUpScreen(false);
    }
  }, [
    width,
    isSmallUpScreen,
    detailsPanelOpen,
    setDtailsPanelOpen
  ]);

  // Treasury list refresh timeout
  useEffect(() => {
    let timer: any;

    if (publicKey && treasuriesLoaded && !customStreamDocked) {
      timer = setInterval(() => {
        consoleOut(`Refreshing treasuries past ${STREAMS_REFRESH_TIMEOUT / 60 / 1000}min...`);
        refreshTreasuries(false);
      }, STREAMS_REFRESH_TIMEOUT);
    }

    return () => clearInterval(timer);
  }, [
    publicKey,
    treasuriesLoaded,
    customStreamDocked,
    refreshTreasuries
  ]);

  // Handle what to do when pending Tx confirmation reaches finality or on error
  useEffect(() => {
    if (!publicKey) { return; }

    if (lastSentTxSignature && (fetchTxInfoStatus === "fetched" || fetchTxInfoStatus === "error")) {
      switch (lastSentTxOperationType) {
        case OperationType.Close:
        case OperationType.Create:
          refreshTreasuries(true);
          break;
        default:
          refreshTreasuries(false);
          break;
      }
    }
  }, [
    publicKey,
    fetchTxInfoStatus,
    lastSentTxSignature,
    lastSentTxOperationType,
    refreshTreasuries,
  ]);

  // Open treasury modal
  const [isOpenTreasuryModalVisible, setIsOpenTreasuryModalVisibility] = useState(false);
  const showOpenTreasuryModal = useCallback(() => setIsOpenTreasuryModalVisibility(true), []);
  const closeOpenTreasuryModal = useCallback(() => setIsOpenTreasuryModalVisibility(false), []);

  const onRefreshTreasuriesClick = () => {
    refreshTreasuries(false);
    setCustomStreamDocked(false);
  };

  const onAcceptOpenTreasury = (e: any) => {
    closeOpenTreasuryModal();
    consoleOut('treasury id:', e, 'blue');
    // TODO: Implement openTreasuryById
    // openTreasuryById(e);
  };

  const onCancelCustomTreasuryClick = () => {
    setCustomStreamDocked(false);
    refreshTreasuries(true);
  }

  const onCopyTreasuryAddress = (data: any) => {
    if (copyText(data.toString())) {
      notify({
        description: t('notifications.treasuryid-copied-message'),
        type: "info"
      });
    } else {
      notify({
        description: t('notifications.treasuryid-not-copied-message'),
        type: "error"
      });
    }
  }

  const onCreateTreasuryClick = () => {
    setCustomStreamDocked(false);
    // TODO: present treasury create form
  };

  const isCreating = (): boolean => {
    return fetchTxInfoStatus === "fetching" && lastSentTxOperationType === OperationType.Create
            ? true
            : false;
  }

  // const isClosing = (): boolean => {
  //   return fetchTxInfoStatus === "fetching" && lastSentTxOperationType === OperationType.Close
  //           ? true
  //           : false;
  // }

  const renderTreasuryMeta = (
    <>
      <p>Toavía nah!</p>
    </>
  );

  const renderTreasuryList = (
    <>
    {treasuryList && treasuryList.length ? (
      treasuryList.map((item, index) => {
        const onStreamClick = () => {
          consoleOut('selected treasury:', item, 'blue');
          setSelectedTreasury(item);
          setDtailsPanelOpen(true);
        };
        return (
          <div key={`${index + 50}`} onClick={onStreamClick}
            className={`transaction-list-row ${selectedTreasury && selectedTreasury.id === item.id ? 'selected' : ''}`}>
            <div className="icon-cell">
              <Identicon address={item.id} style={{ width: "30", display: "inline-flex" }} />
            </div>
            <div className="description-cell">
              <div className="title text-truncate">{item.name}</div>
              <div className="subtitle text-truncate">{shortenAddress(item.id, 12)}</div>
            </div>
            <div className="rate-cell text-center">
              <div className="rate-amount">{formatThousands(item.numStreams)}</div>
              <div className="interval">streams</div>
            </div>
          </div>
        );
      })
    ) : (
      <>
      {isCreating() ? (
        <div className="h-100 flex-center">
          <Spin indicator={bigLoadingIcon} />
        </div>
      ) : (
        <div className="h-100 flex-center">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{connected
          ? t('treasuries.treasury-list.no-treasuries')
          : t('treasuries.treasury-list.not-connected')}</p>} />
        </div>
      )}
      </>
    )}

    </>
  );

  return (
    <>
      <div className="container main-container">

        <div className="interaction-area">

          <div className={`meanfi-two-panel-layout ${detailsPanelOpen ? 'details-open' : ''}`}>

            <div className="meanfi-two-panel-left">
              <div className="meanfi-panel-heading">
                <span className="title">{t('treasuries.screen-title')}</span>
                <Tooltip placement="bottom" title={t('treasuries.refresh-tooltip')}>
                  <div className={`transaction-stats ${loadingTreasuries ? 'click-disabled' : 'simplelink'}`} onClick={onRefreshTreasuriesClick}>
                    <Spin size="small" />
                    {customStreamDocked ? (
                      <span className="transaction-legend neutral">
                        <IconRefresh className="mean-svg-icons"/>
                      </span>
                    ) : (
                      <span className="transaction-legend">
                        <span className="incoming-transactions-amout">({formatThousands(treasuryList.length)})</span>
                      </span>
                    )}
                  </div>
                </Tooltip>
              </div>
              <div className="inner-container">
                <div className="item-block vertical-scroll">
                  <Spin spinning={loadingTreasuries}>
                    {renderTreasuryList}
                  </Spin>
                </div>
                <div className="bottom-ctas">
                  {customStreamDocked ? (
                    <div className="create-stream">
                      <Button
                        block
                        type="primary"
                        shape="round"
                        size="small"
                        onClick={onCancelCustomTreasuryClick}>
                        {t('treasuries.back-to-treasuries-cta')}
                      </Button>
                    </div>
                  ) : (
                    <div className="create-stream">
                      <Button
                        block
                        type="primary"
                        shape="round"
                        size="small"
                        onClick={onCreateTreasuryClick}>
                        {t('treasuries.create-new-treasury-cta')}
                      </Button>
                    </div>
                  )}
                  {!customStreamDocked && (
                    <div className="open-stream">
                      <Tooltip title={t('treasuries.lookup-treasury-cta-tooltip')}>
                        <Button
                          shape="round"
                          type="text"
                          size="small"
                          className="ant-btn-shaded"
                          onClick={showOpenTreasuryModal}
                          icon={<SearchOutlined />}>
                        </Button>
                      </Tooltip>
                    </div>
                  )}
                </div>

              </div>
            </div>

            <div className="meanfi-two-panel-right">
              <div className="meanfi-panel-heading"><span className="title">{t('treasuries.treasury-detail-heading')}</span></div>

              <div className="inner-container">
                {connected && selectedTreasury ? (
                  <>
                    {renderTreasuryMeta}
                    <div className="stream-share-ctas">
                      <span className="copy-cta" onClick={() => onCopyTreasuryAddress(selectedTreasury.id)}>TREASURY ID: {selectedTreasury.id}</span>
                      <a className="explorer-cta" target="_blank" rel="noopener noreferrer"
                        href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${selectedTreasury.id}${getSolanaExplorerClusterParam()}`}>
                        <IconExternalLink className="mean-svg-icons" />
                      </a>
                    </div>
                  </>
                ) : (
                  <>
                  {isCreating() ? (
                    <div className="h-100 flex-center">
                      <Spin indicator={bigLoadingIcon} />
                    </div>
                  ) : (
                    <div className="h-100 flex-center">
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{connected
                        ? t('treasuries.treasury-detail.no-treasury-selected')
                        : t('treasuries.treasury-list.not-connected')}</p>} />
                    </div>
                  )}
                  </>
                )}
              </div>

            </div>

          </div>

        </div>

      </div>

      <OpenTreasuryModal
        isVisible={isOpenTreasuryModalVisible}
        handleOk={onAcceptOpenTreasury}
        handleClose={closeOpenTreasuryModal}
      />

      <PreFooter />
    </>
  );

};
