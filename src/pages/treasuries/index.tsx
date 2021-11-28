import React, { useCallback, useContext, useMemo } from 'react';
import {
  LoadingOutlined, SearchOutlined,
} from '@ant-design/icons';
import { Connection, PublicKey } from '@solana/web3.js';
import { useEffect, useState } from 'react';
import { PreFooter } from '../../components/PreFooter';
import { getSolanaExplorerClusterParam, useConnectionConfig } from '../../contexts/connection';
import { useWallet } from '../../contexts/wallet';
import { AppStateContext } from '../../contexts/appstate';
import { useTranslation } from 'react-i18next';
import { Identicon } from '../../components/Identicon';
import {
  formatThousands,
  getAmountWithSymbol,
  shortenAddress
} from '../../utils/utils';
import { Button, Col, Divider, Empty, Row, Space, Spin, Tooltip } from 'antd';
import { consoleOut, copyText } from '../../utils/ui';
import {
  FALLBACK_COIN_IMAGE,
  SIMPLE_DATE_TIME_FORMAT,
  SOLANA_EXPLORER_URI_INSPECT_ADDRESS,
  STREAMS_REFRESH_TIMEOUT,
  VERBOSE_DATE_TIME_FORMAT
} from '../../constants';
import { isDesktop } from "react-device-detect";
import useWindowSize from '../../hooks/useWindowResize';
import { OperationType } from '../../models/enums';
import { TransactionStatusContext } from '../../contexts/transaction-status';
import { notify } from '../../utils/notifications';
import { IconBank, IconClock, IconExternalLink, IconRefresh, IconStream } from '../../Icons';
import { TreasuryOpenModal } from '../../components/TreasuryOpenModal';
import { StreamInfo, TreasuryInfo } from '@mean-dao/money-streaming/lib/types';
import { TreasuryCreateModal } from '../../components/TreasuryCreateModal';
import { MoneyStreaming } from '@mean-dao/money-streaming/lib/money-streaming';
import dateFormat from 'dateformat';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const TreasuriesView = () => {
  const connectionConfig = useConnectionConfig();
  const { publicKey, connected } = useWallet();
  const {
    tokenList,
    detailsPanelOpen,
    streamProgramAddress,
    previousWalletConnectState,
    setDtailsPanelOpen,
  } = useContext(AppStateContext);
  const {
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
  const [loadingTreasuryStreams, setLoadingTreasuryStreams] = useState(false);
  const [treasuryStreams, setTreasuryStreams] = useState<StreamInfo[]>([]);
  const [signalRefreshTreasuryStreams, setSignalRefreshTreasuryStreams] = useState(false);
  const [treasuryDetails, setTreasuryDetails] = useState<TreasuryInfo | undefined>(undefined);
  const [loadingTreasuryDetails, setLoadingTreasuryDetails] = useState(false);

  const connection = useMemo(() => new Connection(connectionConfig.endpoint, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true
  }), [
    connectionConfig.endpoint
  ]);

  // Create and cache Money Streaming Program instance
  const ms = useMemo(() => new MoneyStreaming(
    connectionConfig.endpoint, streamProgramAddress
  ), [
    connectionConfig.endpoint,
    streamProgramAddress
  ]);

  const getTreasuryStreams = useCallback((treasuryPk: PublicKey) => {
    if (!publicKey || !ms || loadingTreasuryStreams) {
      return;
    }

    setTimeout(() => {
      setLoadingTreasuryStreams(true);
    });

    consoleOut('Executing getTreasuryStreams...', '', 'blue');

    ms.listStreams({treasury: treasuryPk })
      .then((streams) => {
        consoleOut('treasuryStreams:', streams, 'blue');
        setTreasuryStreams(streams);
        setLoadingTreasuryStreams(false);
      })
      .catch(err => {
        console.error(err);
        setTreasuryStreams([]);
        setLoadingTreasuryStreams(false);
      });

  }, [
    ms,
    publicKey,
    loadingTreasuryStreams,
  ]);

  const openTreasureById = useCallback((treasuryId: string) => {
    if (!connection || !publicKey || !ms || loadingTreasuryDetails) { return; }

    setTimeout(() => {
      setLoadingTreasuryDetails(true);
    });

    const treasueyPk = new PublicKey(treasuryId);
    ms.getTreasury(treasueyPk)
      .then(details => {
        consoleOut('treasuryDetails:', details, 'blue');
        setTreasuryDetails(details);
        setSelectedTreasury(details);
        setSignalRefreshTreasuryStreams(true);
        setLoadingTreasuryDetails(false);
      })
      .catch(error => {
        console.error(error);
        setSelectedTreasury(undefined);
        setTreasuryDetails(undefined);
        setLoadingTreasuryDetails(false);
      });

  }, [
    ms,
    publicKey,
    connection,
    loadingTreasuryDetails,
  ]);

  const refreshTreasuries = useCallback((reset = false) => {
    if (!connection || !publicKey || !ms || loadingTreasuries) { return; }

    if (!loadingTreasuries && fetchTxInfoStatus !== "fetching") {

      // const signature = lastSentTxStatus || '';
      setTimeout(() => {
        setLoadingTreasuries(true);
        clearTransactionStatusContext();
      });

      ms.listTreasuries(publicKey)
        .then((treasuries) => {
          consoleOut('treasuries:', treasuries, 'blue');
          let item: TreasuryInfo | undefined = undefined;

          if (treasuries.length) {

            if (reset) {
              item = treasuries[0];
            } else {
              // Try to get current item by its original Tx signature then its id
              if (selectedTreasury) {
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
              openTreasureById(item.id as string);
            }
          } else {
            setSelectedTreasury(undefined);
            setTreasuryStreams([]);
          }

          setTreasuryList(treasuries);
          setLoadingTreasuries(false);
        })
        .catch(error => {
          console.error(error);
          setLoadingTreasuries(false);
        });
    }

  }, [
    ms,
    publicKey,
    connection,
    selectedTreasury,
    loadingTreasuries,
    fetchTxInfoStatus,
    clearTransactionStatusContext,
    openTreasureById,
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
        setTreasuriesLoaded(false);
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'green');
        setTreasuryList([]);
        setTreasuryStreams([]);
        setCustomStreamDocked(false);
        setSelectedTreasury(undefined);
        setTreasuryDetails(undefined);
      }
    }
  }, [
    connected,
    previousWalletConnectState,
    publicKey,
    refreshTreasuries
  ]);

  // Reload Treasury streams whenever the selected treasury changes
  useEffect(() => {
    if (!publicKey || !ms) { return; }

    if (treasuryDetails && !loadingTreasuryStreams && signalRefreshTreasuryStreams) {
      setSignalRefreshTreasuryStreams(false);
      consoleOut('calling getTreasuryStreams...', '', 'blue');
      const treasuryPk = new PublicKey(treasuryDetails.id as string);
      getTreasuryStreams(treasuryPk);
    }
  }, [
    ms,
    publicKey,
    treasuryStreams,
    treasuryDetails,
    loadingTreasuryStreams,
    signalRefreshTreasuryStreams,
    getTreasuryStreams,
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

  ////////////////
  //   Events   //
  ////////////////

  const onRefreshTreasuriesClick = () => {
    refreshTreasuries(false);
    setCustomStreamDocked(false);
  };

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

  // Open treasury modal
  const [isOpenTreasuryModalVisible, setIsOpenTreasuryModalVisibility] = useState(false);
  const showOpenTreasuryModal = useCallback(() => setIsOpenTreasuryModalVisibility(true), []);
  const closeOpenTreasuryModal = useCallback(() => setIsOpenTreasuryModalVisibility(false), []);

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

  const onCreateTreasuryClick = () => {
    setCustomStreamDocked(false);
    showCreateTreasuryModal();
  };

  // Create treasury modal
  const [isCreateTreasuryModalVisible, setIsCreateTreasuryModalVisibility] = useState(false);
  const showCreateTreasuryModal = useCallback(() => setIsCreateTreasuryModalVisibility(true), []);
  const closeCreateTreasuryModal = useCallback(() => setIsCreateTreasuryModalVisibility(false), []);

  const onAcceptCreateTreasury = (e: any) => {
    closeCreateTreasuryModal();
    consoleOut('treasury name:', e, 'blue');
    // TODO: Implement onExecuteCreateTreasuryTx
  };

  const isCreating = (): boolean => {
    return fetchTxInfoStatus === "fetching" && lastSentTxOperationType === OperationType.Create
            ? true
            : false;
  }

  ///////////////
  // Rendering //
  ///////////////

  const renderCtaRow = () => {
    return (
      <>
      <div className="mb-2">
        <Space size="middle">
          <Button type="default" shape="round" size="small" className="thin-stroke">Add funds</Button>
          <Button type="default" shape="round" size="small" className="thin-stroke">Close</Button>
        </Space>
      </div>
      </>
    );
  }

  const renderTreasuryMeta = () => {
    const token = tokenList.find(t => t.address === treasuryDetails?.associatedTokenAddress);
    const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
      event.currentTarget.src = FALLBACK_COIN_IMAGE;
      event.currentTarget.className = "error";
    };
    return (
      <>
      {treasuryDetails && (
        <Spin spinning={loadingTreasuries}>
          <div className="stream-fields-container">

            {/* Treasury name and Number of streams */}
            <div className="mb-3">
              <Row>
                <Col span={16}>
                  <div className="info-label">
                    {t('treasuries.treasury-detail.treasury-name-label')}
                  </div>
                  <div className="transaction-detail-row">
                    <span className="info-icon">
                      <Identicon address={treasuryDetails.id} style={{ width: "24", display: "inline-flex" }} />
                    </span>
                    <span className="info-data text-truncate">
                      {treasuryDetails.label ? (
                        <div className="title text-truncate">{treasuryDetails.label}</div>
                      ) : (
                        <div className="title text-truncate">{shortenAddress(treasuryDetails.id as string, 8)}</div>
                      )}
                    </span>
                  </div>
                </Col>
                <Col span={8}>
                  <div className="info-label text-truncate">
                    {t('treasuries.treasury-detail.number-of-streams')}
                  </div>
                  <div className="transaction-detail-row">
                    <span className="info-icon">
                      <IconStream className="mean-svg-icons" />
                    </span>
                    <span className="info-data flex-row align-items-center">
                      {/* TODO: How to get numStreams on new stream version */}
                      <span className="badge small error text-uppercase">missing</span>
                      {/* {formatThousands(treasuryDetails.numStreams)} */}
                    </span>
                  </div>
                </Col>
              </Row>
            </div>

            <div className="mb-3">
              <Row>
                {token && (
                  <Col span={treasuryDetails.createdUtc ? 16 : 24}>
                    <div className="info-label">
                      {t('treasuries.treasury-detail.associated-token')}
                    </div>
                    <div className="transaction-detail-row">
                      <span className="info-icon">
                        {token && token.logoURI ? (
                          <img alt={`${token.name}`} width={24} height={24} src={token.logoURI} onError={imageOnErrorHandler} />
                        ) : (
                          <Identicon address={treasuryDetails.associatedTokenAddress} style={{ width: "24", display: "inline-flex" }} />
                        )}
                      </span>
                      <span className="info-data text-truncate">
                        {token ? `${token.symbol} (${token.name})` : ''}
                      </span>
                    </div>
                  </Col>
                )}
                {treasuryDetails.createdUtc && (
                  <Col span={token ? 8 : 24}>
                    <div className="info-label">
                      {t('treasuries.treasury-detail.created-on')}
                    </div>
                    <div className="transaction-detail-row">
                      <span className="info-icon">
                        <IconClock className="mean-svg-icons" />
                      </span>
                      <span className="info-data">
                        {dateFormat(treasuryDetails.createdUtc, VERBOSE_DATE_TIME_FORMAT)}
                      </span>
                    </div>
                  </Col>
                )}
              </Row>
            </div>

            {/* Funds left in the treasury */}
            <div className="mb-2">
              <div className="info-label text-truncate">
                {t('treasuries.treasury-detail.funds-left-in-treasury')}
              </div>
              <div className="transaction-detail-row">
                <span className="info-icon">
                  <IconBank className="mean-svg-icons" />
                </span>
                <span className="info-data large">
                  {
                    getAmountWithSymbol(
                      treasuryDetails.balance,
                      treasuryDetails.associatedTokenAddress as string
                    )
                  }
                </span>
              </div>
            </div>

          </div>
        </Spin>
      )}
      </>
    );
  };

  const renderTreasuryList = (
    <>
    {treasuryList && treasuryList.length ? (
      treasuryList.map((item, index) => {
        const onStreamClick = () => {
          consoleOut('selected treasury:', item, 'blue');
          openTreasureById(item.id as string);
          setDtailsPanelOpen(true);
        };
        return (
          <div key={`${index + 50}`} onClick={onStreamClick}
            className={`transaction-list-row ${selectedTreasury && selectedTreasury.id === item.id ? 'selected' : ''}`}>
            <div className="icon-cell">
              <Identicon address={item.id} style={{ width: "30", display: "inline-flex" }} />
            </div>
            <div className="description-cell">
              {item.label ? (
                <div className="title text-truncate">{item.label}</div>
              ) : (
                <div className="title text-truncate">{shortenAddress(item.id as string, 8)}</div>
              )}
              {item.createdUtc && (
                <div className="subtitle text-truncate">{dateFormat(item.createdUtc, SIMPLE_DATE_TIME_FORMAT)}</div>
              )}
            </div>
            <div className="rate-cell text-center">
              {/* TODO: How to get numStreams on new stream version */}
              <div className="rate-amount">
                <span className="badge small error text-uppercase">missing</span>
                {/* {formatThousands(item.numStreams)} */}
              </div>
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
                        disabled={!connected}
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
                        disabled={!connected}
                        onClick={onCreateTreasuryClick}>
                        {connected
                          ? t('treasuries.create-new-treasury-cta')
                          : t('transactions.validation.not-connected')
                        }
                      </Button>
                    </div>
                  )}
                  {(!customStreamDocked && connected) && (
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
                {connected && treasuryDetails ? (
                  <>
                    <div className="stream-details-data-wrapper vertical-scroll">
                      {renderTreasuryMeta()}
                      <Divider className="activity-divider" plain></Divider>
                      {renderCtaRow()}
                    </div>
                    <div className="stream-share-ctas">
                      <span className="copy-cta" onClick={() => onCopyTreasuryAddress(treasuryDetails.id)}>TREASURY ID: {treasuryDetails.id}</span>
                      <a className="explorer-cta" target="_blank" rel="noopener noreferrer"
                        href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${treasuryDetails.id}${getSolanaExplorerClusterParam()}`}>
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

      <TreasuryOpenModal
        isVisible={isOpenTreasuryModalVisible}
        handleOk={onAcceptOpenTreasury}
        handleClose={closeOpenTreasuryModal}
      />

      <TreasuryCreateModal
        isVisible={isCreateTreasuryModalVisible}
        handleOk={onAcceptCreateTreasury}
        handleClose={closeCreateTreasuryModal}
      />

      <PreFooter />
    </>
  );

};
