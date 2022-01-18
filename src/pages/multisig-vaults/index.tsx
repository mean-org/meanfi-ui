import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConnectionConfig } from '../../contexts/connection';
import { TransactionStatusContext } from '../../contexts/transaction-status';
import { useWallet } from '../../contexts/wallet';
import { AppStateContext } from '../../contexts/appstate';
import { Button, Divider, Empty, Spin, Tooltip } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { IconExternalLink, IconRefresh, IconTrash } from '../../Icons';
import { PreFooter } from '../../components/PreFooter';
import { ConfirmOptions, Connection, PublicKey } from '@solana/web3.js';
import { Program, Provider } from '@project-serum/anchor';
import MultisigIdl from "../../models/mean-multisig-idl";
import { MEAN_MULTISIG } from '../../utils/ids';
import { AccountLayout, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { useLocation } from 'react-router-dom';
import { consoleOut } from '../../utils/ui';
import { Identicon } from '../../components/Identicon';
import { shortenAddress } from '../../utils/utils';
import { MultisigVault } from '../../models/multisig';

export const MultisigVaultsView = () => {
  const location = useLocation();
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
  const [multisigAddress, setMultisigAddress] = useState('');
  const [multisigVaults, setMultisigVaults] = useState<MultisigVault[]>([]);
  const [selectedVault, setSelectedVault] = useState<MultisigVault | undefined>(undefined);

  const connection = useMemo(() => new Connection(connectionConfig.endpoint, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true
  }), [
    connectionConfig.endpoint
  ]);

  const multisigClient = useMemo(() => {

    const opts: ConfirmOptions = {
      preflightCommitment: "recent",
      commitment: "recent",
    };

    const provider = new Provider(connection, wallet as any, opts);

    return new Program(
      MultisigIdl,
      MEAN_MULTISIG,
      provider
    );

  }, [
    connection, 
    wallet
  ]);

  // Parse query params
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('ms')) {
      const multisigAddress = params.get('ms');
      setMultisigAddress(multisigAddress || '');
      consoleOut('multisigAddress:', multisigAddress, 'blue');
    }
  }, [location]);

  const getMultisigVaults = useCallback(async (
    connection: Connection,
    multisig: PublicKey
  ) => {

    const [multisigSigner] = await PublicKey.findProgramAddress(
      [multisig.toBuffer()],
      MEAN_MULTISIG
    );

    console.log('multisigSigner:', multisigSigner.toBase58());

    const accountInfos = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
      filters: [
        {
          memcmp: { offset: 32, bytes: multisigSigner.toBase58() },
        }, 
        {
          dataSize: AccountLayout.span
        }
      ],
    });

    console.log('accountInfos:', accountInfos);

    const results = accountInfos.map((t: any) => {
      let tokenAccount = AccountLayout.decode(t.account.data);
      tokenAccount.address = t.pubkey;
      return tokenAccount;
    });

    return results;

  },[]);

  // Get Multisig Vaults
  useEffect(() => {

    if (!connection || !multisigClient || !publicKey || !multisigAddress) {
      return;
    }

    const timeout = setTimeout(() => {
      getMultisigVaults(connection, new PublicKey(multisigAddress))
      .then((result: MultisigVault[]) => {
        consoleOut('multisig vaults:', result, 'blue');
        setMultisigVaults(result);
        if (result.length > 0) {
          setSelectedVault(result[0]);
        }
      })
      .catch(err => console.error(err));
    });

    return () => {
      clearTimeout(timeout);
    }

  },[
    publicKey,
    connection,
    multisigClient,
    multisigAddress,
    getMultisigVaults
  ]);

  ///////////////
  // Rendering //
  ///////////////

  const renderMultisigVaults = (
    <>
    {multisigVaults && multisigVaults.length ? (
      multisigVaults.map((item, index) => {
        const onVaultSelected = (ev: any) => {
          consoleOut('selected vault:', item, 'blue');
          setSelectedVault(item);
        };
        return (
          <div 
            key={`${index + 50}`} 
            onClick={onVaultSelected}
            className={
              `transaction-list-row ${
                selectedVault && selectedVault.address && selectedVault.address.equals(item.address)
                  ? 'selected' 
                  : ''
              }`
            }>
            <div className="icon-cell">
              <Identicon address={item.address.toBase58()} style={{ width: "30", display: "inline-flex" }} />
            </div>
            <div className="description-cell">
              <div className="title text-truncate">{shortenAddress(item.mint.toBase58(), 8)}</div>
              <div className="subtitle text-truncate">{shortenAddress(item.address.toBase58(), 8)}</div>
            </div>
            <div className="rate-cell">
              <div className="rate-amount text-uppercase">{+item.amount}</div>
            </div>
          </div>
        );
      })
    ) : (
      <>
        <div className="h-100 flex-center">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{connected
            ? t('multisig.multisig-vaults.no-vaults')
            : t('multisig.multisig-vaults.not-connected')}</p>} />
        </div>
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
