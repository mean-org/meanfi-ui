import React, { useCallback, useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useConnectionConfig } from '../../contexts/connection';
import { TransactionStatusContext } from '../../contexts/transaction-status';
import { useWallet } from '../../contexts/wallet';
import { AppStateContext } from '../../contexts/appstate';
import { Button, Divider, Empty, Spin, Tooltip } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { IconExternalLink, IconRefresh, IconTrash } from '../../Icons';
import { PreFooter } from '../../components/PreFooter';

export const MultisigVaultsView = () => {
    const connectionConfig = useConnectionConfig();
    const { publicKey, connected, wallet } = useWallet();
    const {
        theme,
        tokenList,
        tokenBalance,
        selectedToken,
        treasuryOption,
        detailsPanelOpen,
        transactionStatus,
        streamProgramAddress,
        streamV2ProgramAddress,
        previousWalletConnectState,
        setSelectedToken,
        setEffectiveRate,
        refreshStreamList,
        setTreasuryOption,
        setDtailsPanelOpen,
        resetContractValues,
        refreshTokenBalance,
        setTransactionStatus,
        setHighLightableStreamId,
    } = useContext(AppStateContext);
    const {
        fetchTxInfoStatus,
        lastSentTxSignature,
        lastSentTxOperationType,
        startFetchTxSignatureInfo,
        clearTransactionStatusContext,
    } = useContext(TransactionStatusContext);
    const { t } = useTranslation('common');

    return (
        <>
          <div className="container main-container">

            <div className="interaction-area">

              <div className={`meanfi-two-panel-layout ${detailsPanelOpen ? 'details-open' : ''}`}>

                <div className="meanfi-two-panel-left">

                  {/* <div className="meanfi-panel-heading">
                    <span className="title">{t('treasuries.screen-title')}</span>
                    <Tooltip placement="bottom" title={t('treasuries.refresh-tooltip')}>
                      <div className={`transaction-stats user-address ${loadingTreasuries ? 'click-disabled' : 'simplelink'}`} onClick={onRefreshTreasuriesClick}>
                        <Spin size="small" />
                        {(!customStreamDocked && !loadingTreasuries) && (
                          <span className="incoming-transactions-amout">{formatThousands(treasuryList.length)}</span>
                        )}
                        <span className="transaction-legend">
                          <span className="icon-button-container">
                            <Button
                              type="default"
                              shape="circle"
                              size="small"
                              icon={<ReloadOutlined />}
                              onClick={() => {}}
                            />
                          </span>
                        </span>
                      </div>
                    </Tooltip>
                  </div> */}

                  {/* <div className="inner-container">
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
                  </div> */}

                </div>

                <div className="meanfi-two-panel-right">
                  <div className="meanfi-panel-heading"><span className="title">{t('treasuries.treasury-detail-heading')}</span></div>
    
                  {/* <div className="inner-container">
                    {connected ? (
                      <>
                        {treasuryDetails && (
                          <div className="float-top-right">
                            <span className="icon-button-container secondary-button">
                              <Tooltip placement="bottom" title={"Refresh balance"}>
                                <Button
                                  type="default"
                                  shape="circle"
                                  size="middle"
                                  icon={<IconRefresh className="mean-svg-icons" />}
                                  onClick={() => onExecuteRefreshTreasuryBalance()}
                                  disabled={
                                    isTxInProgress() ||
                                    !isTreasurer() ||
                                    isAnythingLoading()
                                  }
                                />
                              </Tooltip>
                              <Tooltip placement="bottom" title={t('treasuries.treasury-detail.cta-close')}>
                                <Button
                                  type="default"
                                  shape="circle"
                                  size="middle"
                                  icon={<IconTrash className="mean-svg-icons" />}
                                  onClick={showCloseTreasuryModal}
                                  disabled={
                                    isTxInProgress() ||
                                    (treasuryStreams && treasuryStreams.length > 0) ||
                                    !isTreasurer() ||
                                    isAnythingLoading()
                                  }
                                />
                              </Tooltip>
                            </span>
                          </div>
                        )}
                        <div className={`stream-details-data-wrapper vertical-scroll ${(loadingTreasuries || loadingTreasuryDetails || !treasuryDetails) ? 'h-100 flex-center' : ''}`}>
                          <Spin spinning={loadingTreasuries || loadingTreasuryDetails}>
                            {treasuryDetails && (
                              <>
                                {renderTreasuryMeta()}
                                <Divider className="activity-divider" plain></Divider>
                                {(!treasuryDetails.autoClose || (treasuryDetails.autoClose && getTreasuryTotalStreams(treasuryDetails) > 0 )) && (
                                  <>
                                    {renderCtaRow()}
                                    <Divider className="activity-divider" plain></Divider>
                                  </>
                                )}
                                {renderTreasuryStreams()}
                              </>
                            )}
                          </Spin>
                          {(!loadingTreasuries && !loadingTreasuryDetails && !loadingTreasuryStreams) && (
                            <>
                            {(!treasuryList || treasuryList.length === 0) && !treasuryDetails && (
                              <div className="h-100 flex-center">
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{t('treasuries.treasury-detail.no-treasury-loaded')}</p>} />
                              </div>
                            )}
                            </>
                          )}
                        </div>
                        {treasuryDetails && (
                          <div className="stream-share-ctas">
                            <span className="copy-cta" onClick={() => onCopyTreasuryAddress(treasuryDetails.id)}>TREASURY ID: {treasuryDetails.id}</span>
                            <a className="explorer-cta" target="_blank" rel="noopener noreferrer"
                              href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${treasuryDetails.id}${getSolanaExplorerClusterParam()}`}>
                              <IconExternalLink className="mean-svg-icons" />
                            </a>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="h-100 flex-center">
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{t('treasuries.treasury-list.not-connected')}</p>} />
                      </div>
                    )}
                  </div> */}

                </div>

              </div>

            </div>

          </div>

          <PreFooter />
        </>
      );

};
