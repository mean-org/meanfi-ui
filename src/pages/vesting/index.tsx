import React, { useEffect, useState, useContext, useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from "react-i18next";
import { AppStateContext } from "../../contexts/appstate";
import { IconExternalLink } from "../../Icons";
import { PreFooter } from "../../components/PreFooter";
import { Button, Tooltip } from 'antd';
import { consoleOut, copyText, isValidAddress } from '../../utils/ui';
import { useWallet } from '../../contexts/wallet';
import { getSolanaExplorerClusterParam, useConnectionConfig } from '../../contexts/connection';
import { Connection, PublicKey } from '@solana/web3.js';
import { MSP, Treasury } from '@mean-dao/msp';
import "./style.scss";
import { TokenInfo } from '@solana/spl-token-registry';
import { ArrowLeftOutlined, WarningFilled } from '@ant-design/icons';
import { makeDecimal, openLinkInNewTab, shortenAddress } from '../../utils/utils';
import { openNotification } from '../../components/Notifications';
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from '../../constants';
import { VestingLockCreateAccount } from './components/VestingLockCreateAccount';
import { VestingLockAccountList } from './components/VestingLockAccountList';
import { VestingContractDetails } from './components/VestingContractDetails';
import BN from 'bn.js';

export const VESTING_ROUTE_BASE_PATH = '/vesting';
export type VestingWorkflowStep = "account-select" | "stream-create" | undefined;
export type VestingAccountStep = "create-new" | "select-existing" | undefined;
export type StreamCreateStep = "general" | "locking-setting" | "vesting-summary" | undefined;

export const VestingView = () => {
  const {
    tokenList,
    selectedToken,
    detailsPanelOpen,
    streamV2ProgramAddress,
    getTokenByMintAddress,
    setDtailsPanelOpen,
    setEffectiveRate,
    setSelectedToken,
  } = useContext(AppStateContext);
  const location = useLocation();
  const navigate = useNavigate();
  const connectionConfig = useConnectionConfig();
  const { address, vestingContract } = useParams();
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const [isPageLoaded, setIsPageLoaded] = useState<boolean>(false);
  const [loadingTreasuries, setLoadingTreasuries] = useState(false);
  const [treasuriesLoaded, setTreasuriesLoaded] = useState(false);
  const [treasuryList, setTreasuryList] = useState<Treasury[]>([]);
  // Path params values
  const [accountAddress, setAccountAddress] = useState('');
  const [vestingContractAddress, setVestingContractAddress] = useState<string>('');
  // Selected vesting contract
  const [selectedVestingContract, setSelectedVestingContract] = useState<Treasury | undefined>(undefined);
  const [loadingTreasuryDetails, setLoadingTreasuryDetails] = useState(false);
  const [autoOpenDetailsPanel, setAutoOpenDetailsPanel] = useState(true);

  /////////////////////////
  //  Setup & Init code  //
  /////////////////////////

  // Perform premature redirects if no workflow was provided in path
  useEffect(() => {
    if (!publicKey) { return; }

    // /vesting/:address/contracts
    consoleOut('pathname:', location.pathname, 'crimson');
    if (!address) {
      const url = `${VESTING_ROUTE_BASE_PATH}/${publicKey.toBase58()}/contracts`;
      consoleOut('No address, redirecting to:', url, 'orange');
      navigate(url, { replace: true });
    }
    // In any case, set the flag isPageLoaded a bit later
    setTimeout(() => {
      setIsPageLoaded(true);
    }, 5);
  }, [address, location.pathname, navigate, publicKey]);

  // Enable deep-linking when isPageLoaded
  useEffect(() => {
    if (!isPageLoaded || !publicKey) { return; }

    if (address) {
      consoleOut('Route param address:', address, 'crimson');
      setAccountAddress(address);
    } else {
      if (accountAddress) {
        setAccountAddress(publicKey.toBase58());
      }
    }

    if (vestingContract) {
      consoleOut('Route param vestingContract:', vestingContract, 'crimson');
      setVestingContractAddress(vestingContract);
    }

  }, [accountAddress, address, isPageLoaded, publicKey, vestingContract]);

  // Create and cache the connection
  const connection = useMemo(() => new Connection(connectionConfig.endpoint, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true
  }), [
    connectionConfig.endpoint
  ]);

  // Create and cache Money Streaming Program V2 instance
  const msp = useMemo(() => {
    if (publicKey) {
      console.log('New MSP from treasuries');
      return new MSP(
        connectionConfig.endpoint,
        streamV2ProgramAddress,
        "confirmed"
      );
    }
    return undefined;
  }, [
    connectionConfig.endpoint,
    publicKey,
    streamV2ProgramAddress
  ]);

  /////////////////
  //  Callbacks  //
  /////////////////

  const setCustomToken = useCallback((address: string) => {

    if (address && isValidAddress(address)) {
      const unkToken: TokenInfo = {
        address: address,
        name: 'Unknown',
        chainId: 101,
        decimals: 6,
        symbol: shortenAddress(address),
      };
      setSelectedToken(unkToken);
      consoleOut("token selected:", unkToken, 'blue');
      setEffectiveRate(0);
    }
  }, [
    setEffectiveRate,
    setSelectedToken,
  ]);

  const openVestingContractById = useCallback((treasuryId: string, msp: MSP) => {

    setLoadingTreasuryDetails(true);
    const treasuryPk = new PublicKey(treasuryId);

    return msp.getTreasury(treasuryPk)
      .then((details: Treasury | undefined) => {
        if (details) {
          consoleOut('VestingContract details:', details, 'blue');
          // const ata = details.associatedToken as string;
          // const type = details.treasuryType;
          // const token = getTokenByMintAddress(ata);
          // consoleOut("treasury token:", token ? token.symbol : 'Custom', 'blue');
          // if (token) {
          //   if (!selectedToken || selectedToken.address !== token.address) {
          //     setSelectedToken(token);
          //   }
          // } else if (!token && (!selectedToken || selectedToken.address !== ata)) {
          //   setCustomToken(ata);
          // }
          // const tOption = TREASURY_TYPE_OPTIONS.find(t => t.type === type);
          // if (tOption) {
          //   setTreasuryOption(tOption);
          // }
          return details;
        } else {
          // setTreasuryDetails(undefined);
          return undefined;
        }
      })
      .catch((error: any) => {
        console.error(error);
        // setTreasuryDetails(undefined);
        return undefined;
      })
      .finally(() => {
        setLoadingTreasuryDetails(false);
      });

  }, []);

  const getAllUserV2Accounts = useCallback(async () => {

    if (!connection || !publicKey || loadingTreasuries || !msp) { return []; }

    setTimeout(() => {
      setLoadingTreasuries(true);
    });

    const treasuries = await msp.listTreasuries(publicKey);
    treasuries.filter((t: any) => !t.autoClose);

    return treasuries;

  }, [connection, loadingTreasuries, msp, publicKey]);

  const refreshVestingContracts = useCallback((reset = false) => {
    
    if (!connection || !publicKey || loadingTreasuries || !msp) { return; }

    setTimeout(() => {
      setLoadingTreasuries(true);
    });

    getAllUserV2Accounts()
      .then(treasuries => {
        consoleOut('Streaming accounts:', treasuries, 'blue');
        setTreasuryList(treasuries);
      })
      .catch(error => {
        console.error(error);
      })
      .finally(() => setLoadingTreasuries(false));

  }, [connection, getAllUserV2Accounts, loadingTreasuries, msp, publicKey]);

  const onSelectVestingContract = useCallback((item: Treasury | undefined) => {
    if (accountAddress && item) {
      // /vesting/:address/contracts/:vestingContract
      const contractId = item.id.toString();
      const url = `${VESTING_ROUTE_BASE_PATH}/${accountAddress}/contracts/${contractId}`;
      navigate(url);
      setAutoOpenDetailsPanel(true);
    }
  }, [accountAddress, navigate]);

  const copyAddressToClipboard = useCallback((address: any) => {

    if (!address) { return; }

    if (copyText(address.toString())) {
      openNotification({
        description: t('notifications.account-address-copied-message'),
        type: "info"
      });
    } else {
      openNotification({
        description: t('notifications.account-address-not-copied-message'),
        type: "error"
      });
    }

  },[t])

  /////////////////////
  // Data management //
  /////////////////////

  // Auto select a token
  useEffect(() => {

    if (tokenList && !selectedToken) {
      setSelectedToken(tokenList.find(t => t.symbol === 'MEAN'));
    }

    return () => { };
  }, [
    tokenList,
    selectedToken,
    setSelectedToken
  ]);

  // Load treasuries once per page access
  useEffect(() => {

    if (!publicKey || treasuriesLoaded) { return; }

    consoleOut('Calling refreshTreasuries...', '', 'blue');
    setTreasuriesLoaded(true);
    refreshVestingContracts(true);

  }, [publicKey, refreshVestingContracts, treasuriesLoaded]);

  // Set a vesting contract if passed-in via url if found in list of vesting contracts
  // If not found or not provided, will pick the first one available via redirect
  useEffect(() => {
    if (publicKey && accountAddress && treasuryList && treasuryList.length > 0) {
      let item: Treasury | undefined = undefined;
      if (vestingContractAddress) {
        item = treasuryList.find(i => i.id === vestingContractAddress);
      }
      if (item) {
        setSelectedVestingContract(item);
        consoleOut('selectedVestingContract:', item, 'blue');
        if (autoOpenDetailsPanel) {
          setDtailsPanelOpen(true);
        }
      } else {
        // /vesting/:address/contracts/:vestingContract
        const contractId = treasuryList[0].id.toString();
        const url = `${VESTING_ROUTE_BASE_PATH}/${accountAddress}/contracts/${contractId}`;
        navigate(url);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    publicKey,
    treasuryList,
    accountAddress,
    autoOpenDetailsPanel,
    vestingContractAddress,
  ]);

  ////////////////////////////
  //   Events and actions   //
  ////////////////////////////

  const onBackButtonClicked = () => {
    setDtailsPanelOpen(false);
    setAutoOpenDetailsPanel(false);
  }

  ///////////////
  // Rendering //
  ///////////////

  const renderCreateVestingAccount = useCallback(() => {
    return (
      <>
        <h3 className="user-instruction-headline">{t('vesting.user-instruction-headline')}</h3>
        <VestingLockCreateAccount
          inModal={false}
          token={selectedToken}
          tokenChanged={(token: TokenInfo | undefined) => setSelectedToken(token)}
        />
      </>
    );
  }, [selectedToken, setSelectedToken, t]);

  return (
    <>
      {detailsPanelOpen && (
        <Button
          id="back-button"
          type="default"
          shape="circle"
          icon={<ArrowLeftOutlined />}
          onClick={onBackButtonClicked}/>
      )}
      <div className="container main-container">
        {publicKey ? (
          <div className="interaction-area">

            <div className={`meanfi-two-panel-layout ${detailsPanelOpen ? 'details-open' : ''}`}>

              {/* Left / top panel */}
              <div className="meanfi-two-panel-left">

                <div className="meanfi-panel-heading">
                  <span className="title">{t('vesting.screen-title')} ({treasuryList.length})</span>
                  <div className="user-address">
                    <span className="fg-secondary">
                      (<Tooltip placement="bottom" title={t('assets.account-address-copy-cta')}>
                        <span className="simplelink underline-on-hover" onClick={() => copyAddressToClipboard(publicKey.toBase58())}>
                          {/* TODO: Use accountAddress from url */}
                          {shortenAddress(publicKey.toBase58(), 5)}
                        </span>
                      </Tooltip>)
                    </span>
                    <span className="icon-button-container">
                      <Button
                        type="default"
                        shape="circle"
                        size="middle"
                        icon={<IconExternalLink className="mean-svg-icons" style={{width: "18", height: "18"}} />}
                        onClick={() => openLinkInNewTab(`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${publicKey.toBase58()}${getSolanaExplorerClusterParam()}`)}
                      />
                    </span>
                  </div>
                </div>

                <div className="inner-container">
                  <div className="item-block vertical-scroll">

                    <div className="asset-category flex-column">
                      <VestingLockAccountList
                        streamingAccounts={treasuryList}
                        selectedAccount={selectedVestingContract}
                        onAccountSelected={(item: Treasury | undefined) => onSelectVestingContract(item)}
                      />
                    </div>

                  </div>

                  {/* Bottom CTA */}
                  <div className="bottom-ctas">
                    <div className="primary-action">
                      <Button
                        block
                        className="flex-center"
                        type="primary"
                        shape="round"
                        onClick={() => {
                          // sddfdf
                        }}>
                        <span className="ml-1">Create vesting contract</span>
                      </Button>
                    </div>
                  </div>
                </div>

              </div>

              {/* Right / down panel */}
              <div className="meanfi-two-panel-right">
                <div className="meanfi-panel-heading"><span className="title">{t('vesting.vesting-account-details.panel-title')}</span></div>
                <div className="inner-container">
                  <div className="flexible-column-bottom">
                    <div className="top">
                      <VestingContractDetails
                        vestingContract={selectedVestingContract}
                      />
                      {/* TODO: Render CTAs row here */}
                    </div>
                    <div className="bottom">
                      Tabs here
                    </div>
                  </div>
                </div>
              </div>

            </div>

          </div>
        ) : (
          <div className="interaction-area">
            <div className="w-75 h-100 p-5 text-center flex-column flex-center">
              <div className="text-center mb-2">
                <WarningFilled style={{ fontSize: 48 }} className="icon fg-warning" />
              </div>
              <h3>{t('wallet-selector.connect-to-begin')}</h3>
            </div>
          </div>
        )}
      </div>
      <PreFooter />
    </>
  );

};
