import React, { useEffect, useState, useContext, useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from "react-i18next";
import { AppStateContext } from "../../contexts/appstate";
import { IconExternalLink, IconMoneyTransfer, IconVerticalEllipsis } from "../../Icons";
import { PreFooter } from "../../components/PreFooter";
import { Button, Dropdown, Menu, Space, Tabs, Tooltip } from 'antd';
import { consoleOut, copyText } from '../../utils/ui';
import { useWallet } from '../../contexts/wallet';
import { getSolanaExplorerClusterParam, useConnectionConfig } from '../../contexts/connection';
import { Connection, PublicKey } from '@solana/web3.js';
import { MSP, Stream, Treasury } from '@mean-dao/msp';
import "./style.scss";
import { ArrowLeftOutlined, WarningFilled } from '@ant-design/icons';
import { openLinkInNewTab, shortenAddress } from '../../utils/utils';
import { openNotification } from '../../components/Notifications';
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from '../../constants';
import { VestingLockAccountList } from './components/VestingLockAccountList';
import { VestingContractDetails } from './components/VestingContractDetails';
import useWindowSize from '../../hooks/useWindowResize';
import { isMobile } from 'react-device-detect';
import { MetaInfoCta } from '../../models/common-types';
import { MetaInfoCtaAction, PaymentRateType } from '../../models/enums';
import { VestingLockCreateAccount } from './components/VestingLockCreateAccount';
import { TokenInfo } from '@solana/spl-token-registry';
import { VestingContractCreateModal } from '../../components/VestingContractCreateModal';
import { VestingContractOverview } from './components/VestingContractOverview';
import { VESTING_CATEGORIES } from '../../models/vesting';
import { VestingContractStreamList } from './components/VestingContractStreamList';

const { TabPane } = Tabs;
export const VESTING_ROUTE_BASE_PATH = '/vesting';
export type VestingAccountDetailTab = "overview" | "streams" | "activity" | undefined;
let ds: string[] = [];

export const VestingView = () => {
  const {
    selectedToken,
    deletedStreams,
    detailsPanelOpen,
    streamV2ProgramAddress,
    setDtailsPanelOpen,
    setSelectedToken,
  } = useContext(AppStateContext);
  const location = useLocation();
  const navigate = useNavigate();
  const connectionConfig = useConnectionConfig();
  const { address, vestingContract, activeTab } = useParams();
  const { t } = useTranslation('common');
  const { width } = useWindowSize();
  const { publicKey } = useWallet();
  const [isPageLoaded, setIsPageLoaded] = useState<boolean>(false);
  const [loadingTreasuries, setLoadingTreasuries] = useState(true);
  const [treasuriesLoaded, setTreasuriesLoaded] = useState(false);
  const [treasuryList, setTreasuryList] = useState<Treasury[]>([]);
  const [loadingTreasuryStreams, setLoadingTreasuryStreams] = useState(false);
  const [signalRefreshTreasuryStreams, setSignalRefreshTreasuryStreams] = useState(false);
  const [treasuryStreams, setTreasuryStreams] = useState<(Stream)[]>([]);
  // Path params values
  const [accountAddress, setAccountAddress] = useState('');
  const [vestingContractAddress, setVestingContractAddress] = useState<string>('');
  const [accountDetailTab, setAccountDetailTab] = useState<VestingAccountDetailTab>(undefined);
  // Selected vesting contract
  const [selectedVestingContract, setSelectedVestingContract] = useState<Treasury | undefined>(undefined);
  // const [loadingTreasuryDetails, setLoadingTreasuryDetails] = useState(false);
  const [autoOpenDetailsPanel, setAutoOpenDetailsPanel] = useState(true);
  const [isXsDevice, setIsXsDevice] = useState<boolean>(isMobile);
  const [assetCtas, setAssetCtas] = useState<MetaInfoCta[]>([]);


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

    if (activeTab) {
      consoleOut('Route param activeTab:', activeTab, 'crimson');
      setAccountDetailTab(activeTab as VestingAccountDetailTab);
    }

  }, [accountAddress, activeTab, address, isPageLoaded, publicKey, vestingContract]);

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

  const isInspectedAccountTheConnectedWallet = useCallback(() => {
    return accountAddress && publicKey && publicKey.toBase58() === accountAddress
      ? true
      : false
  }, [accountAddress, publicKey]);

  // const setCustomToken = useCallback((address: string) => {

  //   if (address && isValidAddress(address)) {
  //     const unkToken: TokenInfo = {
  //       address: address,
  //       name: 'Unknown',
  //       chainId: 101,
  //       decimals: 6,
  //       symbol: shortenAddress(address),
  //     };
  //     setSelectedToken(unkToken);
  //     consoleOut("token selected:", unkToken, 'blue');
  //     setEffectiveRate(0);
  //   }
  // }, [
  //   setEffectiveRate,
  //   setSelectedToken,
  // ]);

  // const openVestingContractById = useCallback((treasuryId: string, msp: MSP) => {

  //   setLoadingTreasuryDetails(true);
  //   const treasuryPk = new PublicKey(treasuryId);

  //   return msp.getTreasury(treasuryPk)
  //     .then((details: Treasury | undefined) => {
  //       if (details) {
  //         consoleOut('VestingContract details:', details, 'blue');
  //         // const ata = details.associatedToken as string;
  //         // const type = details.treasuryType;
  //         // const token = getTokenByMintAddress(ata);
  //         // consoleOut("treasury token:", token ? token.symbol : 'Custom', 'blue');
  //         // if (token) {
  //         //   if (!selectedToken || selectedToken.address !== token.address) {
  //         //     setSelectedToken(token);
  //         //   }
  //         // } else if (!token && (!selectedToken || selectedToken.address !== ata)) {
  //         //   setCustomToken(ata);
  //         // }
  //         // const tOption = TREASURY_TYPE_OPTIONS.find(t => t.type === type);
  //         // if (tOption) {
  //         //   setTreasuryOption(tOption);
  //         // }
  //         return details;
  //       } else {
  //         // setTreasuryDetails(undefined);
  //         return undefined;
  //       }
  //     })
  //     .catch((error: any) => {
  //       console.error(error);
  //       // setTreasuryDetails(undefined);
  //       return undefined;
  //     })
  //     .finally(() => {
  //       setLoadingTreasuryDetails(false);
  //     });

  // }, []);

  const getAllUserV2Accounts = useCallback(async () => {

    if (!connection || !publicKey || !msp) { return []; }

    setTimeout(() => {
      setLoadingTreasuries(true);
    });

    const treasuries = await msp.listTreasuries(publicKey);

    return treasuries.filter((t: any) => !t.autoClose);

  }, [connection, msp, publicKey]);

  const refreshVestingContracts = useCallback((reset = false) => {

    if (!connection || !publicKey || !msp) { return; }

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

  }, [connection, getAllUserV2Accounts, msp, publicKey]);

  const onSelectVestingContract = useCallback((item: Treasury | undefined) => {
    if (accountAddress && item) {
      // /vesting/:address/contracts/:vestingContract
      const contractId = item.id.toString();
      const url = `${VESTING_ROUTE_BASE_PATH}/${accountAddress}/contracts/${contractId}`;
      navigate(url);
      setAutoOpenDetailsPanel(true);
    }
  }, [accountAddress, navigate]);

  const getTreasuryStreams = useCallback((treasuryPk: PublicKey) => {
    if (!publicKey || !msp || loadingTreasuryStreams) { return; }

    setTimeout(() => {
      setLoadingTreasuryStreams(true);
    });

    consoleOut('Executing getTreasuryStreams...', '', 'blue');

    msp.listStreams({treasury: treasuryPk })
      .then((streams: any) => {
        consoleOut('treasuryStreams:', streams, 'blue');
        setTreasuryStreams(streams);
      })
      .catch((err: any) => {
        console.error(err);
        setTreasuryStreams([]);
      })
      .finally(() => {
        setLoadingTreasuryStreams(false);
      });

  }, [
    msp,
    publicKey,
    loadingTreasuryStreams,
  ]);

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

  const [isVestingContractCreateModalVisible, setIsVestingContractCreateModalVisibility] = useState(false);
  const showVestingContractCreateModal = useCallback(() => setIsVestingContractCreateModalVisibility(true), []);
  const closeVestingContractCreateModal = useCallback(() => setIsVestingContractCreateModalVisibility(false), []);

  /////////////////////
  // Data management //
  /////////////////////

  // Detect XS screen
  useEffect(() => {
    if (width < 576) {
      setIsXsDevice(true);
    } else {
      setIsXsDevice(false);
    }
  }, [width]);

  // Build CTAs
  useEffect(() => {

    const numMaxCtas = isXsDevice ? 2 : 5;
    const actions: MetaInfoCta[] = [];
    let ctaItems = 0;

    // Create Stream
    actions.push({
      action: MetaInfoCtaAction.VestingContractCreateStreamOnce,
      isVisible: true,
      caption: 'Create stream',
      disabled: !isInspectedAccountTheConnectedWallet(),
      uiComponentType: 'button',
      uiComponentId: `button-${MetaInfoCtaAction.VestingContractCreateStreamOnce}`,
      tooltip: '',
      callBack: () => { }
    });
    ctaItems++;

    // Bulk create
    actions.push({
      action: MetaInfoCtaAction.VestingContractCreateStreamBulk,
      isVisible: true,
      caption: 'Bulk create',
      disabled: !isInspectedAccountTheConnectedWallet(),
      uiComponentType: 'button',
      uiComponentId: `button-${MetaInfoCtaAction.VestingContractCreateStreamBulk}`,
      tooltip: '',
      callBack: () => { }
    });
    ctaItems++;

    // Add funds
    actions.push({
      action: MetaInfoCtaAction.VestingContractAddFunds,
      caption: 'Add funds',
      isVisible: true,
      uiComponentType: ctaItems < numMaxCtas ? 'button' : 'menuitem',
      disabled: false,
      uiComponentId: `${ctaItems < numMaxCtas ? 'button' : 'menuitem'}-${MetaInfoCtaAction.VestingContractAddFunds}`,
      tooltip: '',
      callBack: () => { }
    });
    ctaItems++;   // Last increment. It seems all other items will go inside the vellipsis menu anyways

    // View SOL Balance
    actions.push({
      action: MetaInfoCtaAction.VestingContractViewSolBalance,
      caption: 'View SOL Balance',
      isVisible: true,
      uiComponentType: 'menuitem',
      disabled: !isInspectedAccountTheConnectedWallet(),
      uiComponentId: `menuitem-${ctaItems}-${MetaInfoCtaAction.VestingContractViewSolBalance}`,
      tooltip: '',
      callBack: () => { }
    });
    ctaItems++;

    // Refresh Account Data
    actions.push({
      action: MetaInfoCtaAction.VestingContractRefreshAccount,
      caption: 'Refresh account data',
      isVisible: true,
      uiComponentType: 'menuitem',
      disabled: !isInspectedAccountTheConnectedWallet(),
      uiComponentId: `menuitem-${ctaItems}-${MetaInfoCtaAction.VestingContractRefreshAccount}`,
      tooltip: '',
      callBack: () => { }
    });
    ctaItems++;

    // Withdraw funds
    actions.push({
      action: MetaInfoCtaAction.VestingContractWithdrawFunds,
      caption: 'Withdraw funds',
      isVisible: true,
      uiComponentType: 'menuitem',
      disabled: !isInspectedAccountTheConnectedWallet(),
      uiComponentId: `menuitem-${ctaItems}-${MetaInfoCtaAction.VestingContractWithdrawFunds}`,
      tooltip: '',
      callBack: () => { }
    });
    ctaItems++;

    // Close Contract
    actions.push({
      action: MetaInfoCtaAction.VestingContractClose,
      caption: 'Close Contract',
      isVisible: true,
      uiComponentType: 'menuitem',
      disabled: !isInspectedAccountTheConnectedWallet(),
      uiComponentId: `menuitem-${ctaItems}-${MetaInfoCtaAction.VestingContractClose}`,
      tooltip: '',
      callBack: () => { }
    });
    ctaItems++;

    consoleOut('Asset actions:', actions, 'crimson');
    setAssetCtas(actions);

  }, [
    isXsDevice,
    isInspectedAccountTheConnectedWallet,
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
    const hasNoVestingAccounts = () => treasuriesLoaded && treasuryList && treasuryList.length === 0 ? true : false;

    if (publicKey && accountAddress) {
      if (treasuryList && treasuryList.length > 0) {
        let item: Treasury | undefined = undefined;
        if (vestingContractAddress) {
          item = treasuryList.find(i => i.id === vestingContractAddress);
        }
        if (item) {
          setSelectedVestingContract(item);
          setSignalRefreshTreasuryStreams(true);
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
      } else if (vestingContractAddress && hasNoVestingAccounts()) {
        const url = `${VESTING_ROUTE_BASE_PATH}/${accountAddress}/contracts`;
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

  // Set a tab if none already set
  useEffect(() => {
    if (publicKey && accountAddress && vestingContractAddress && !accountDetailTab) {
      // /vesting/:address/contracts/:vestingContract/:activeTab
      const url = `${VESTING_ROUTE_BASE_PATH}/${accountAddress}/contracts/${vestingContractAddress}/overview`;
      navigate(url);
    }
  }, [accountAddress, accountDetailTab, navigate, publicKey, vestingContractAddress]);

  // Reload streams whenever the selected vesting contract changes
  useEffect(() => {
    if (!publicKey) { return; }

    if (vestingContractAddress && selectedVestingContract &&
        vestingContractAddress === selectedVestingContract.id &&
        !loadingTreasuryStreams && signalRefreshTreasuryStreams &&
        accountDetailTab === "streams") {
      setSignalRefreshTreasuryStreams(false);
      consoleOut('calling getTreasuryStreams...', '', 'blue');
      const treasuryPk = new PublicKey(selectedVestingContract.id as string);
      getTreasuryStreams(treasuryPk);
    }
  }, [
    publicKey,
    accountDetailTab,
    loadingTreasuryStreams,
    vestingContractAddress,
    selectedVestingContract,
    signalRefreshTreasuryStreams,
    getTreasuryStreams,
  ]);

  // Log the list of deleted streams
  useEffect(() => {
    ds = deletedStreams;
    consoleOut('ds:', ds, 'blue');
  }, [deletedStreams]);

  ////////////////////////////
  //   Events and actions   //
  ////////////////////////////

  const onBackButtonClicked = () => {
    setDtailsPanelOpen(false);
    setAutoOpenDetailsPanel(false);
  }

  const onTabChange = useCallback((activeKey: string) => {
    consoleOut('Selected tab option:', activeKey, 'blue');
    // /vesting/:address/contracts/:vestingContract/:activeTab
    const url = `${VESTING_ROUTE_BASE_PATH}/${accountAddress}/contracts/${vestingContractAddress}/${activeKey}`;
    navigate(url);
  }, [accountAddress, navigate, vestingContractAddress]);


  ///////////////
  // Rendering //
  ///////////////

  const renderMetaInfoMenuItems = () => {
    const items = assetCtas.filter(m => m.isVisible && m.uiComponentType === 'menuitem');
    return (
      <Menu>
        {items.map((item: MetaInfoCta, index: number) => {
          return (
            <Menu.Item
              key={`${index + 44}-${item.uiComponentId}`}
              disabled={item.disabled}
              onClick={item.callBack}>
              <span className="menu-item-text">{item.caption}</span>
            </Menu.Item>
          );
        })}
      </Menu>
    );
  }

  const renderMetaInfoCtaRow = () => {
    const items = assetCtas.filter(m => m.isVisible && m.uiComponentType === 'button');

    return (
      <div className="flex-fixed-right cta-row mb-2">
        <Space className="left" size="middle" wrap>
          {items && items.length > 0 &&
            items.map((item: MetaInfoCta, index: number) => {
              if (item.tooltip) {
                return (
                  <Tooltip placement="bottom" title={item.tooltip} key={`${index + 11}-${item.uiComponentId}`}>
                    <Button
                      type="default"
                      shape="round"
                      size="small"
                      className="thin-stroke"
                      disabled={item.disabled}
                      onClick={item.callBack}>
                      <span>{item.caption}</span>
                    </Button>
                  </Tooltip>
                );
              } else {
                return (
                  <Button
                    type="default"
                    shape="round"
                    size="small"
                    key={`${index + 22}-${item.uiComponentId}`}
                    className="thin-stroke"
                    disabled={item.disabled}
                    onClick={item.callBack}>
                    <span>{item.caption}</span>
                  </Button>
                );
              }
            })
          }
        </Space>
        <Dropdown
          overlay={renderMetaInfoMenuItems()}
          placement="bottomRight"
          trigger={["click"]}>
          <span className="icon-button-container">
            <Button
              type="default"
              shape="circle"
              size="middle"
              icon={<IconVerticalEllipsis className="mean-svg-icons" />}
              onClick={(e) => e.preventDefault()}
            />
          </span>
        </Dropdown>
      </div>
    );
  };

  const renderTabset = () => {
    return (
      <Tabs activeKey={accountDetailTab} onChange={onTabChange} className="neutral">
        <TabPane tab="Overview" key={"overview"}>
          <VestingContractOverview
            vestingContract={selectedVestingContract}
            cliffRelease={10}
            lockPeriodAmount={4}
            lockPeriodFrequency={PaymentRateType.PerMonth}
            vestingCategory={VESTING_CATEGORIES[6]}
            streamsStartDate={'13 Jun 2022 23:30:00 GMT'}
          />
        </TabPane>
        <TabPane tab="Streams" key={"streams"}>
          <VestingContractStreamList
            vestingContract={selectedVestingContract}
            accountAddress={accountAddress}
            loadingTreasuryStreams={loadingTreasuryStreams}
            treasuryStreams={treasuryStreams}
          />
        </TabPane>
        <TabPane tab="Activity" key={"activity"}>
          <p>Tab 3</p>
        </TabPane>
      </Tabs>
    );
  }

  const loader = (
    <>
      <div className="container main-container">
        <div className="loading-screen-container flex-center">
          <div className="flex-column flex-center">
            <div className="loader-container">
              <div className="app-loading">
                <div className="logo" style={{display: 'none'}}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 245 238" fillRule="evenodd" clipRule="evenodd" strokeLinejoin="round" strokeMiterlimit="2">
                    <path d="M238.324 75l-115.818 30.654L6.689 75 0 128.402l47.946 122.08L122.515 313l74.55-62.518L245 128.402 238.324 75zm-21.414 29.042l3.168 25.313-42.121 107.268-26.849 22.511 37.922-120.286-48.471 12.465-8.881 107.524-9.176 24.128-9.174-24.128-8.885-107.524-48.468-12.465 37.922 120.286-26.85-22.511-42.118-107.268 3.167-25.313 94.406 24.998 94.408-24.998z" fill="url(#_Linear1)" transform="translate(0 -64)"/>
                    <defs>
                      <linearGradient id="_Linear1" x1="0" y1="0" x2="1" y2="0" gradientUnits="userSpaceOnUse" gradientTransform="matrix(0 238 -238 0 122.5 75)">
                        <stop offset="0" stopColor="#ff0017"/><stop offset="1" stopColor="#b7001c"/>
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
                <svg className="spinner" viewBox="25 25 50 50">
                  <circle className="path" cx="50" cy="50" r="20" fill="none" strokeWidth="2" strokeMiterlimit="10"/>
                </svg>
              </div>
            </div>
            <p className="loader-message">{t('general.loading')}</p>
          </div>
        </div>
      </div>
    </>
  );

  const renderCreateFirstVestingAccount = useCallback(() => {
    return (
      <>
      <div className="container main-container">
        <div className="interaction-area">
          <div className="title-and-subtitle mb-2">
            <div className="title">
              <IconMoneyTransfer className="mean-svg-icons" />
              <div>{t('vesting.screen-title')}</div>
            </div>
            <div className="subtitle mb-3">
              {t('vesting.screen-subtitle')}
            </div>
            <div className="subtitle">
              {t('vesting.screen-subtitle2')}
            </div>
            <h3 className="user-instruction-headline">{t('vesting.user-instruction-headline')}</h3>
          </div>
          <div className="place-transaction-box flat mb-0">
            <VestingLockCreateAccount
              inModal={false}
              token={selectedToken}
              vestingAccountCreated={() => {}}
              tokenChanged={(token: TokenInfo | undefined) => setSelectedToken(token)}
            />
          </div>
        </div>
      </div>
      <PreFooter />
      </>
    );
  }, [selectedToken, setSelectedToken, t]);

  // TODO: Add multisig to the condition when the moment comes
  if (!publicKey || (publicKey && accountAddress && publicKey.toBase58() !== accountAddress)) {
    return (
      <>
        <div className="container main-container">
          <div className="interaction-area">
            <div className="title-and-subtitle w-75 h-75">
              <div className="title">
                <IconMoneyTransfer className="mean-svg-icons" />
                <div>{t('vesting.screen-title')}</div>
              </div>
              <div className="subtitle mb-3">
                {t('vesting.screen-subtitle')}
              </div>
              <div className="subtitle">
                {t('vesting.screen-subtitle2')}
              </div>
              <div className="w-50 h-100 p-5 text-center flex-column flex-center">
                <div className="text-center mb-2">
                  <WarningFilled style={{ fontSize: 48 }} className="icon fg-warning" />
                </div>
                {!publicKey ? (
                  <h3>Please connect your wallet to see your vesting contracts</h3>
                ) : (
                  <h3>The content you are accessing is not available at this time or you don't have access permission</h3>
                )}
              </div>
            </div>
          </div>
        </div>
        <PreFooter />
      </>
    );
  }

  // Render the On-boarding to Mean Vesting by helping the user on creating
  // the first Vesting Contract if the user has none
  if (treasuriesLoaded && treasuryList && treasuryList.length > 0 && !loadingTreasuries ) {
    // Render normal UI
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
                          <span className="simplelink underline-on-hover" onClick={() => copyAddressToClipboard(accountAddress)}>
                            {shortenAddress(accountAddress, 5)}
                          </span>
                        </Tooltip>)
                      </span>
                      <span className="icon-button-container">
                        <Button
                          type="default"
                          shape="circle"
                          size="middle"
                          icon={<IconExternalLink className="mean-svg-icons" style={{width: "18", height: "18"}} />}
                          onClick={() => openLinkInNewTab(`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${accountAddress}${getSolanaExplorerClusterParam()}`)}
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
                          onClick={showVestingContractCreateModal}>
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
                        <VestingContractDetails vestingContract={selectedVestingContract} />
                        {/* Render CTAs row here */}
                        {renderMetaInfoCtaRow()}
                      </div>
                      <div className="bottom">
                        {renderTabset()}
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

        {isVestingContractCreateModalVisible && (
          <VestingContractCreateModal
            isVisible={isVestingContractCreateModalVisible}
            handleClose={closeVestingContractCreateModal}
            selectedToken={selectedToken}
          />
        )}
      </>
    );
  } else if (treasuriesLoaded && treasuryList.length === 0 && !loadingTreasuries) {
    return renderCreateFirstVestingAccount();
  } else {
    return loader;
  }

};
