import React, { useCallback, useContext, useMemo } from 'react';
import { useEffect, useState } from 'react';
import { PreFooter } from '../../components/PreFooter';
import { AppStateContext } from '../../contexts/appstate';
import { useTranslation } from 'react-i18next';
import { isDesktop } from "react-device-detect";
import useWindowSize from '../../hooks/useWindowResize';
import { useWallet } from '../../contexts/wallet';
import { getSolanaExplorerClusterParam, useConnection, useConnectionConfig } from '../../contexts/connection';
import { consoleOut, copyText } from '../../utils/ui';
import { StreamActivity } from '@mean-dao/money-streaming';
import { Button, Col, Divider, Dropdown, Empty, Menu, Row, Spin } from 'antd';
import { MEAN_TOKEN_LIST } from '../../constants/token-list';
import { Identicon } from '../../components/Identicon';
import "./style.less";
import { getTokenAmountAndSymbolByTokenAddress, useLocalStorageState } from '../../utils/utils';
import dateFormat from 'dateformat';
import { SIMPLE_DATE_FORMAT, SIMPLE_DATE_TIME_FORMAT, SOLANA_EXPLORER_URI_INSPECT_ADDRESS, SOLANA_EXPLORER_URI_INSPECT_TRANSACTION, VERBOSE_DATE_FORMAT, VERBOSE_DATE_TIME_FORMAT } from '../../constants';
import { IconClock, IconDownload, IconExchange, IconExternalLink, IconUpload } from '../../Icons';
import { ArrowDownOutlined, ArrowUpOutlined, EllipsisOutlined } from '@ant-design/icons';
import { notify } from '../../utils/notifications';
import { DdcaAccount, DdcaClient, DdcaDetails } from '@mean-dao/ddca';
import { Connection, PublicKey } from '@solana/web3.js';
import { getLiveRpc, RpcConfig } from '../../models/connections-hq';
import { Redirect } from 'react-router-dom';

export const ExchangeDcasView = () => {
  const {
    recurringBuys,
    detailsPanelOpen,
    loadingRecurringBuys,
    setRecurringBuys,
    setDtailsPanelOpen,
    setLoadingRecurringBuys,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const { publicKey, wallet } = useWallet();
  const connectionConfig = useConnectionConfig();
  const [redirect, setRedirect] = useState<string | null>(null);

  // Connection management
  const [cachedRpcJson] = useLocalStorageState("cachedRpc");
  const [mainnetRpc, setMainnetRpc] = useState<RpcConfig | null>(null);
  const cachedRpc = (cachedRpcJson as RpcConfig);

  const { width } = useWindowSize();
  const [isSmallUpScreen, setIsSmallUpScreen] = useState(isDesktop);
  const [selectedDdca, setSelectedDdca] = useState<DdcaAccount | undefined>();
  const [ddcaDetails, setDdcaDetails] = useState<DdcaDetails | undefined>();
  const [loadingDdcaDetails, setLoadingDdcaDetails] = useState<boolean>(false);

  const [loadingActivity, setLoadingActivity] = useState(true);
  const [activity, setActivity] = useState<StreamActivity[]>([]);

  useEffect(() => {
    (async () => {
      if (cachedRpc.networkId !== 101) {
        const mainnetRpc = await getLiveRpc(101);
        if (!mainnetRpc) {
          setRedirect('/service-unavailable');
        }
        setMainnetRpc(mainnetRpc);
      } else {
        setMainnetRpc(null);
      }
    })();
    return () => { }
  }, [cachedRpc.networkId]);

  // Set and cache connection
  const connection = useMemo(() => new Connection(mainnetRpc ? mainnetRpc.httpProvider : cachedRpc.httpProvider, "confirmed"),
    [cachedRpc.httpProvider, mainnetRpc]);

  // Set and cache the DDCA client
  const ddcaClient = useMemo(() => new DdcaClient(connectionConfig.endpoint, wallet, { commitment: connection.commitment }), [
    wallet,
    connection.commitment,
    connectionConfig.endpoint,
  ]);

  //////////////////////
  //   Data Related   //
  //////////////////////

  const selectDdcaItem = useCallback((item: DdcaAccount) => {
    setDtailsPanelOpen(true);
    setSelectedDdca(item);
    setLoadingDdcaDetails(true);
    const ddcaAddress = new PublicKey(item.id as string);
    ddcaClient.GetDdca(ddcaAddress)
      .then(ddca => {
        if (ddca) {
          setDdcaDetails(ddca);
          consoleOut('ddcaDetails:', ddca, 'blue');
        }
      })
      .catch(error => console.error(error))
      .finally(() => setLoadingDdcaDetails(false));
  }, [
    ddcaClient,
    setDtailsPanelOpen
  ]);

  // Gets the recurring buys on demmand
  const reloadRecurringBuys = useCallback((reset = false) => {
    if (!publicKey) {
      return [];
    }

    if (!loadingRecurringBuys) {
      setLoadingRecurringBuys(true);

      ddcaClient.ListDdcas()
        .then(dcas => {
          consoleOut('Recurring buys:', dcas, 'blue');
          let item: DdcaAccount | undefined;
          if (dcas.length) {
            if (reset) {
              item = JSON.parse(JSON.stringify(dcas[0]));
            } else {
              // Try to get current item by its id
              if (selectedDdca) {
                const itemFromServer = dcas.find(i => i.id === selectedDdca.id);
                item = itemFromServer || selectedDdca;
              } else {
                item = JSON.parse(JSON.stringify(dcas[0]));
              }
            }
            consoleOut('selectedBuy:', item, 'blue');
            if (item) {
              setSelectedDdca(item);
              setLoadingDdcaDetails(true);
              const ddcaAddress = new PublicKey(item.id as string);
              ddcaClient.GetDdca(ddcaAddress)
                .then(ddca => {
                  if (ddca) {
                    setDdcaDetails(ddca);
                    consoleOut('ddcaDetails:', ddca, 'blue');
                  }
                })
                .catch(error => console.error(error))
                .finally(() => setLoadingDdcaDetails(false));
            }
          } else {
            setSelectedDdca(undefined);
            setDdcaDetails(undefined);
          }
          setRecurringBuys(dcas);
        }).catch(err => {
          console.error(err);
        }).finally(() => setLoadingRecurringBuys(false));
    }
  }, [
    publicKey,
    ddcaClient,
    selectedDdca,
    loadingRecurringBuys,
    setLoadingRecurringBuys,
    setRecurringBuys
  ]);

  // Load recurring buys if the list is empty
  useEffect(() => {

    if (!recurringBuys || recurringBuys.length === 0) {
      reloadRecurringBuys();
    }

    return () => {};
  }, [
    ddcaClient,
    selectedDdca,
    recurringBuys,
    loadingDdcaDetails,
    reloadRecurringBuys
  ]);

  // Load DDCA activity by ddcaAddress
  // useEffect(() => {

  //   if (!ddcaDetails) { return; }

  //   if (!loadingActivity) {
  //     setLoadingActivity(true);
  //     const ddcaAddress = new PublicKey(item.id as string);
  //     ddcaClient.GetDdcaActivity(ddcaAddress)
  //       .then(activity => {
  //         if (activity) {
  //           setActivity(activity);
  //           consoleOut('Ddca activity:', activity, 'blue');
  //         }
  //       })
  //       .catch(error => console.error(error))
  //       .finally(() => setLoadingActivity(false));
  //   }

  // }, [
  //   ddcaClient,
  //   ddcaDetails,
  //   loadingActivity
  // ]);

  ////////////////////
  //   UI Related   //
  ////////////////////

  // Window resize listeners
  useEffect(() => {
    const resizeListener = () => {
      const NUM_CHARS = 4;
      const ellipsisElements = document.querySelectorAll(".overflow-ellipsis-middle");
      for (let i = 0; i < ellipsisElements.length; ++i){
        const e = ellipsisElements[i] as HTMLElement;
        if (e.offsetWidth < e.scrollWidth){
          const text = e.textContent;
          e.dataset.tail = text?.slice(text.length - NUM_CHARS);
        }
      }
    };
    // Call it a first time
    resizeListener();

    // set resize listener
    window.addEventListener('resize', resizeListener);

    // clean up function
    return () => {
      // remove resize listener
      window.removeEventListener('resize', resizeListener);
    }
  }, []);

  // Keep flag for small screens
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

  ////////////////
  //   Events   //
  ////////////////

  const onCopyRecurringBuyAddress = (data: any) => {
    if (copyText(data.toString())) {
      notify({
        description: t('notifications.account-address-copied-message'),
        type: "info"
      });
    } else {
      notify({
        description: t('notifications.account-address-not-copied-message'),
        type: "error"
      });
    }
  }

  ///////////////////
  //   Rendering   //
  ///////////////////

  const getShortDate = (date: string, includeTime = false): string => {
    if (!date) { return ''; }
    const localDate = new Date(date);
    return dateFormat(
      localDate,
      includeTime ? SIMPLE_DATE_TIME_FORMAT : SIMPLE_DATE_FORMAT
    );
  }

  const getRecurringBuyTitle = (item: DdcaAccount) => {
    const toToken = MEAN_TOKEN_LIST.find(t => t.address === item.toMint);
    return `Buy ${getTokenAmountAndSymbolByTokenAddress(item.amountPerSwap, item.fromMint)} worth of ${toToken?.symbol}`;
  }

  const getRecurringBuySubTitle = (item: DdcaAccount) => {
    return `Last purchased ${getShortDate(item.startUtc as string)}`;
  }

  const getRecurrencePeriod = (item: DdcaAccount | undefined): string => {
    if (!item) { return ''; }
    switch (item.intervalInSeconds) {
      case 86400:
        return 'Day';
      case 604800:
        return 'Week';
      case 1209600:
        return '2 Weeks';
      case 2629750:
        return 'Month';
      default:
        return '';
    }
  }

  const getBuyIconPair = (item: DdcaAccount) => {
    const fromToken = MEAN_TOKEN_LIST.find(t => t.address === item.fromMint);
    const toToken = MEAN_TOKEN_LIST.find(t => t.address === item.toMint);
    return (
      <>
        <div className="overlapped-tokens">
          <div className="token-icon from">
            {fromToken && fromToken.logoURI ? (
              <img alt={`${fromToken.name}`} width={30} height={30} src={fromToken.logoURI} />
            ) : (
              <Identicon address={item.fromMint} style={{ width: "30", display: "inline-flex" }} />
            )}
          </div>
          <div className="token-icon to">
            {toToken && toToken.logoURI ? (
              <img alt={`${toToken.name}`} width={30} height={30} src={toToken.logoURI} />
            ) : (
              <Identicon address={item.toMint} style={{ width: "30", display: "inline-flex" }} />
            )}
          </div>
        </div>
      </>
    );
  }

  const getReadableDate = (date: string, includeTime = false): string => {
    if (!date) { return ''; }
    const localDate = new Date(date);
    return dateFormat(
      localDate,
      includeTime ? VERBOSE_DATE_TIME_FORMAT : VERBOSE_DATE_FORMAT
    );
  }

  const getToken = (tokenAddress: string) => {
    return MEAN_TOKEN_LIST.find(t => t.address === tokenAddress);
  }

  const getTokenIcon = (tokenAddress: string) => {
    const token = MEAN_TOKEN_LIST.find(t => t.address === tokenAddress);
    if (!token || !ddcaDetails) {
      return null;
    }
    return (
      <span className="info-icon token-icon">
        {token.logoURI ? (
          <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} />
        ) : (
          <Identicon address={ddcaDetails.fromMint} style={{ width: "30", display: "inline-flex" }} />
        )}
      </span>
    );
  }

  const getTokenIconAndAmount = (tokenAddress: string, amount: number) => {
    const token = MEAN_TOKEN_LIST.find(t => t.address === tokenAddress);
    if (!token || !ddcaDetails) {
      return null;
    }
    return (
      <>
        <span className="info-icon token-icon">
          {token.logoURI ? (
            <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} />
          ) : (
            <Identicon address={ddcaDetails.fromMint} style={{ width: "30", display: "inline-flex" }} />
          )}
        </span>
        <span className="info-data">{getTokenAmountAndSymbolByTokenAddress(amount, token.address)}</span>
      </>
    );
  }

  const getDetailsPanelTitle = (item: DdcaDetails) => {
    const recurrencePeriod = getRecurrencePeriod(item);
    const toToken = MEAN_TOKEN_LIST.find(t => t.address === item.toMint);

    return (
      <span>Buying <strong>{getTokenAmountAndSymbolByTokenAddress(
          item.amountPerSwap,
          item.fromMint)}</strong> worth of <strong>{toToken?.symbol}</strong> every <span className="text-lowercase">{recurrencePeriod}</span>
      </span>
    );
  }

  const getActivityIcon = (item: StreamActivity) => {
    if (item.action === 'withdrew') {
      return (
        <ArrowUpOutlined className="mean-svg-icons outgoing" />
      );
      } else {
      return (
        <IconExchange className="mean-svg-icons incoming" />
      );
    }
  }

  const isAddressMyAccount = (addr: string): boolean => {
    return publicKey && addr && addr === publicKey.toBase58()
           ? true
           : false;
  }

  const menu = (
    <Menu>
      <Menu.Item key="1" onClick={() => {}}>
        <span className="menu-item-text">Cancel recurring buy</span>
      </Menu.Item>
    </Menu>
  );

  const renderRecurringBuy = (
    <>
      <div className="transaction-list-data-wrapper vertical-scroll">
        <Spin spinning={loadingRecurringBuys}>
          <div className="stream-fields-container">
            {ddcaDetails && (
              <h2>{getDetailsPanelTitle(ddcaDetails)}</h2>
            )}

            {/* Start date */}
            {ddcaDetails && (
              <div className="mb-3">
                <div className="info-label">
                  {t("streams.stream-detail.label-start-date-started")}
                </div>
                <div className="transaction-detail-row">
                  <span className="info-icon">
                    <IconClock className="mean-svg-icons" />
                  </span>
                  <span className="info-data">
                    {getReadableDate(ddcaDetails.startUtc as string)}
                  </span>
                </div>
              </div>
            )}

            {ddcaDetails && (
              <Row className="mb-3">
                <Col span={11}>
                  <div className="info-label">Total deposits</div>
                  <div className="transaction-detail-row">
                    {getTokenIconAndAmount(
                      ddcaDetails.fromMint,
                      ddcaDetails.totalDepositsAmount
                    )}
                  </div>
                </Col>
                <Col span={13} className="pl-4">
                  <div className="info-label">
                    Total left (will run out by {getShortDate(ddcaDetails.fromBalanceWillRunOutByUtc)})
                  </div>
                  <div className="transaction-detail-row">
                    {getTokenIconAndAmount(ddcaDetails.fromMint, ddcaDetails.fromBalance)}
                  </div>
                </Col>
              </Row>
            )}

            {ddcaDetails && (
              <div className="mb-3">
                <div className="info-label">
                  Exchanged for (avg rate 1 {getToken(ddcaDetails.fromMint)?.symbol} ≈ {getTokenAmountAndSymbolByTokenAddress(
                      ddcaDetails.exchangedRateAverage,
                      ddcaDetails.toMint
                    )})
                </div>
                <div className="transaction-detail-row">
                  {getTokenIcon(ddcaDetails.toMint)}
                  <span className="info-data large">
                    {getTokenAmountAndSymbolByTokenAddress(
                      ddcaDetails.exchangedForAmount,
                      ddcaDetails.toMint
                    )}
                  </span>
                </div>
              </div>
            )}

            {/* Next schaduled exchange */}
            {ddcaDetails && (
              <div className="mb-3">
                <div className="info-label">Next schaduled exchange</div>
                <div className="transaction-detail-row">
                  <span className="info-icon">
                    <IconClock className="mean-svg-icons" />
                  </span>
                  <span className="info-data">
                    {getReadableDate(ddcaDetails.nextScheduledSwapUtc as string)}
                  </span>
                </div>
              </div>
            )}

            {/* Top up (add funds) button */}
            <div className="mt-3 mb-3 withdraw-container">
              <Button
                block
                className="withdraw-cta"
                type="text"
                shape="round"
                size="small"
                onClick={() => {}}
              >
                {t("streams.stream-detail.add-funds-cta")}
              </Button>
              <Dropdown overlay={menu} trigger={["click"]}>
                <Button
                  shape="round"
                  type="text"
                  size="small"
                  className="ant-btn-shaded"
                  onClick={(e) => e.preventDefault()}
                  icon={<EllipsisOutlined />}
                ></Button>
              </Dropdown>
            </div>
          </div>
        </Spin>

        <Divider className="activity-divider" plain></Divider>
        <div className="activity-title">
          {t("streams.stream-activity.heading")}
        </div>
        <div className="activity-list">
          <>
            <div className="item-list-header compact">
              <div className="header-row">
                <div className="std-table-cell first-cell">&nbsp;</div>
                <div className="std-table-cell responsive-cell">&nbsp;</div>
                <div className="std-table-cell fixed-width-150">
                  {t("streams.stream-activity.label-date")}
                </div>
              </div>
            </div>
            <div className="item-list-body compact">
              {(ddcaDetails?.id as string) === '4zKTVctw52NLD7zKtwHoYkePeYjNo8cPFyiokXrnBMbz' ? (
                <>
                <span className="item-list-row simplelink">
                  <div className="std-table-cell first-cell">
                    <IconExchange className="mean-svg-icons"/>
                  </div>
                  <div className="std-table-cell responsive-cell">
                    <span className="align-middle">Exchanged 1 wSOL for 0.0413 ETH</span>
                  </div>
                  <div className="std-table-cell fixed-width-150">
                    <span className="align-middle">10/12/2021 14:53 PM</span>
                  </div>
                </span>
                <span className="item-list-row simplelink">
                  <div className="std-table-cell first-cell">
                    <ArrowDownOutlined className="incoming"/>
                  </div>
                  <div className="std-table-cell responsive-cell">
                    <span className="align-middle">Deposited 5 wSOL</span>
                  </div>
                  <div className="std-table-cell fixed-width-150">
                    <span className="align-middle">10/12/2021 14:53 PM</span>
                  </div>
                </span>
                </>
              ) : (
                <>
                <span className="item-list-row simplelink">
                  <div className="std-table-cell first-cell">
                    <IconExchange className="mean-svg-icons"/>
                  </div>
                  <div className="std-table-cell responsive-cell">
                    <span className="align-middle">Exchanged 50 USDC for 0.3118 SOL</span>
                  </div>
                  <div className="std-table-cell fixed-width-150">
                    <span className="align-middle">10/15/2021 14:53 PM</span>
                  </div>
                </span>
                <span className="item-list-row simplelink">
                  <div className="std-table-cell first-cell">
                    <ArrowDownOutlined className="incoming"/>
                  </div>
                  <div className="std-table-cell responsive-cell">
                    <span className="align-middle">Deposited 200 USDC</span>
                  </div>
                  <div className="std-table-cell fixed-width-150">
                    <span className="align-middle">10/15/2021 14:53 PM</span>
                  </div>
                </span>
                </>
              )}

              {activity.map((item, index) => {
                return (
                  <a key={`${index}`} className="item-list-row" target="_blank" rel="noopener noreferrer"
                      href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${item.signature}${getSolanaExplorerClusterParam()}`}>
                    <div className="std-table-cell first-cell">{getActivityIcon(item)}</div>
                    <div className="std-table-cell responsive-cell">
                      <span className={isAddressMyAccount(item.initializer) ? 'text-capitalize align-middle' : 'align-middle'}>action + #.## SYMBOL for #.## SYMBOL</span>
                    </div>
                    <div className="std-table-cell fixed-width-120" >
                      <span className="align-middle">{getShortDate(item.utcDate as string, true)}</span>
                    </div>
                  </a>
                );
              })}
            </div>
          </>
        </div>
      </div>
      {/* {recurringBuyDetails && (
        <div className="stream-share-ctas">
          <span
            className="copy-cta overflow-ellipsis-middle"
            onClick={() => onCopyRecurringBuyAddress(recurringBuyDetails.id)}
          >
            {recurringBuyDetails.id}
          </span>
          <a
            className="explorer-cta"
            target="_blank"
            rel="noopener noreferrer"
            href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${
              recurringBuyDetails.id
            }${getSolanaExplorerClusterParam()}`}
          >
            <IconExternalLink className="mean-svg-icons" />
          </a>
        </div>
      )} */}
    </>
  );

  const renderRecurringBuys = (
    <>
    {recurringBuys && recurringBuys.length ? (
      recurringBuys.map((item, index) => {
        const onBuyClick = () => {
          consoleOut('select buy:', item, 'blue');
          selectDdcaItem(item);
        };
        return (
          <div key={`${index + 50}`} onClick={onBuyClick}
               className={`transaction-list-row ${ddcaDetails && ddcaDetails.id === item.id ? 'selected' : ''}`}>
            <div className="icon-cell">
              {getBuyIconPair(item)}
            </div>
            <div className="description-cell">
              <div className="title">
                {getRecurringBuyTitle(item)}
              </div>
              <div className="subtitle text-truncate">
              {getRecurringBuySubTitle(item)}
              </div>
            </div>
            <div className="rate-cell">
              <div className="rate-amount">Every</div>
              <div className="interval">{getRecurrencePeriod(item)}</div>
            </div>
          </div>
        );
      })
    ) : (
      <div className="h-75 flex-center">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    )}
    </>
  );

  return (
    <>
      {redirect && <Redirect to={redirect} />}
      <div className="container main-container">

        {/* {window.location.hostname === 'localhost' && (
          <div className="debug-bar">
            <span className="ml-1">solAccountItems:</span><span className="ml-1 font-bold fg-dark-active">{solAccountItems}</span>
            <span className="ml-1">shallWeDraw:</span><span className="ml-1 font-bold fg-dark-active">{shallWeDraw() ? 'true' : 'false'}</span>
          </div>
        )} */}

        <div className="interaction-area">

          <div className={`transactions-layout ${detailsPanelOpen ? 'details-open' : ''}`}>

            {/* Left / top panel*/}
            <div className="tokens-container">
              <div className="transactions-heading">
                <span className="title">{t('ddcas.screen-title')}</span>
              </div>
              <div className="inner-container">
                <div className="item-block vertical-scroll">
                  <Spin spinning={loadingRecurringBuys}>
                    {renderRecurringBuys}
                  </Spin>
                </div>
              </div>
            </div>

            {/* Right / down panel */}
            <div className="transaction-list-container">
              <div className="transactions-heading"><span className="title">Exchange details</span></div>
              <div className="inner-container">
                {ddcaDetails ? renderRecurringBuy : (
                  <div className="h-75 flex-center">
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  </div>
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
