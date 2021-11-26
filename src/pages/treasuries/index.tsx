import React, { useCallback, useContext, useMemo } from 'react';
import {
  LoadingOutlined,
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
import { Empty, Spin, Tooltip } from 'antd';
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
import { IconExternalLink } from '../../Icons';

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
    fetchTxInfoStatus,
    lastSentTxSignature,
    lastSentTxOperationType,
  } = useContext(TransactionStatusContext);
  const { t } = useTranslation('common');
  const { width } = useWindowSize();
  const [isSmallUpScreen, setIsSmallUpScreen] = useState(isDesktop);

  const [treasuryList, setTreasuryList] = useState<TreasuryInfo[]>([]);
  const [selectedTreasury, setSelectedTreasury] = useState<TreasuryInfo | undefined>(undefined);
  const [loadingTreasuries, setLoadingTreasuries] = useState(false);
  const [treasuriesLoaded, setTreasuriesLoaded] = useState(false);

  // const [accountAddressInput, setAccountAddressInput] = useState<string>('');

  // const triggerWindowResize = () => {
  //   window.dispatchEvent(new Event('resize'));
  // }

  const connection = useMemo(() => new Connection(connectionConfig.endpoint, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true
  }), [
    connectionConfig.endpoint
  ]);

  const refreshTreasuries = useCallback(async (reset = false) => {
    if (!publicKey || loadingTreasuries) { return; }

    setLoadingTreasuries(true);

    const tsryList: TreasuryInfo[] = [
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

    await delay(500);
    setTreasuryList(tsryList);
    setLoadingTreasuries(false);
  }, [
    publicKey,
    loadingTreasuries
  ]);

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
      }
    }
  }, [
    connected,
    previousWalletConnectState,
    publicKey,
  ]);

  // Window resize listener
  // Use only if this component handles address input
  // useEffect(() => {
  //   const resizeListener = () => {
  //     const NUM_CHARS = 4;
  //     const ellipsisElements = document.querySelectorAll(".overflow-ellipsis-middle");
  //     if (isValidAddress(accountAddressInput)) {
  //       for (let i = 0; i < ellipsisElements.length; ++i){
  //         const e = ellipsisElements[i] as HTMLElement;
  //         if (e.offsetWidth < e.scrollWidth){
  //           const text = e.textContent;
  //           e.dataset.tail = text?.slice(text.length - NUM_CHARS);
  //         }
  //       }
  //     } else {
  //       if (ellipsisElements?.length) {
  //         const e = ellipsisElements[0] as HTMLElement;
  //         e.dataset.tail = '';
  //       }
  //     }
  //   };
  //   resizeListener();
  //   window.addEventListener('resize', resizeListener);
  //   return () => {
  //     window.removeEventListener('resize', resizeListener);
  //   }
  // }, [accountAddressInput]);

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

  // Streams refresh timeout
  useEffect(() => {
    let timer: any;

    if (publicKey && treasuriesLoaded) {
      timer = setInterval(() => {
        consoleOut(`Refreshing treasuries past ${STREAMS_REFRESH_TIMEOUT / 60 / 1000}min...`);
        refreshTreasuries(false);
      }, STREAMS_REFRESH_TIMEOUT);
    }

    return () => clearInterval(timer);
  }, [
    publicKey,
    treasuriesLoaded,
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

  const onRefreshTreasuriesClick = () => {
    refreshTreasuries(false);
  };

  const onCopyTreasuryAddress = (data: any) => {
    if (copyText(data.toString())) {
      notify({
        description: t('notifications.streamid-copied-message'),
        type: "info"
      });
    } else {
      notify({
        description: t('notifications.streamid-not-copied-message'),
        type: "error"
      });
    }
  }

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
            className={`transaction-list-row`}>
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
          ? t('streams.stream-list.no-streams')
          : t('streams.stream-list.not-connected')}</p>} />
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
                <span className="title">{t('assets.screen-title')}</span>
                <Tooltip placement="bottom" title={t('account-area.streams-tooltip')}>
                  <div className={`transaction-stats ${loadingTreasuries ? 'click-disabled' : 'simplelink'}`} onClick={onRefreshTreasuriesClick}>
                    <Spin size="small" />
                    <span className="transaction-legend">
                      <span className="incoming-transactions-amout">{formatThousands(treasuryList.length)}</span>
                      <span className="ml-1">Treasuries</span>
                    </span>
                  </div>
                </Tooltip>
              </div>
              <div className="inner-container">
                <div className="item-block vertical-scroll">
                  <Spin spinning={loadingTreasuries}>
                    {renderTreasuryList}
                  </Spin>
                </div>
              </div>
            </div>

            <div className="meanfi-two-panel-right">
              <div className="meanfi-panel-heading"><span className="title">{t('assets.history-panel-title')}</span></div>

              <div className="inner-container">
                {connected && selectedTreasury ? (
                  <>
                    {renderTreasuryMeta}
                    <div className="stream-share-ctas">
                      <span className="copy-cta overflow-ellipsis-middle" onClick={() => onCopyTreasuryAddress(selectedTreasury.id)}>TREASURY ID: {selectedTreasury.id}</span>
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
                        ? t('streams.stream-detail.no-stream')
                        : t('streams.stream-list.not-connected')}</p>} />
                    </div>
                  )}
                  </>
                )}
              </div>


            </div>

          </div>

        </div>

      </div>

      <PreFooter />
    </>
  );

};
