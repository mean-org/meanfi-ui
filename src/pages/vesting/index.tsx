import React, { useEffect, useState, useContext, useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from "react-i18next";
import { AppStateContext } from "../../contexts/appstate";
import { IconMoneyTransfer } from "../../Icons";
import { PreFooter } from "../../components/PreFooter";
import { Button, Space, Tabs } from 'antd';
import { consoleOut } from '../../utils/ui';
import { useWallet } from '../../contexts/wallet';
import { VestingLockCreateAccount } from './components/VestingLockCreateAccount';
import { LockedStreamCreate } from './components/LockedStreamCreate';
import { VestingLockSelectAccount } from './components/VestingLockSelectAccount';
import { useConnectionConfig } from '../../contexts/connection';
import { Connection } from '@solana/web3.js';
import { MSP, Treasury } from '@mean-dao/msp';
import "./style.scss";

const { TabPane } = Tabs;
export const VESTING_ROUTE_BASE_PATH = '/vesting';
export type VestingWorkflowStep = "account-select" | "stream-create" | undefined;
export type VestingAccountStep = "create-new" | "select-existing" | undefined;
export type StreamCreateStep = "general" | "locking-setting" | "vesting-summary" | undefined;

export const VestingView = () => {
  const {
    tokenList,
    selectedToken,
    streamV2ProgramAddress,
    setSelectedToken,
  } = useContext(AppStateContext);
  const location = useLocation();
  const navigate = useNavigate();
  const connectionConfig = useConnectionConfig();
  const { workflow, step } = useParams();
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const [workflowStep, setWorkflowStep] = useState<VestingWorkflowStep>(undefined);
  const [vestingAccountStep, setVestingAccountStep] = useState<VestingAccountStep>(undefined);
  const [streamCreateStep, setStreamCreateStep] = useState<StreamCreateStep>(undefined);
  const [isPageLoaded, setIsPageLoaded] = useState<boolean>(false);
  const [loadingTreasuries, setLoadingTreasuries] = useState(false);
  const [treasuriesLoaded, setTreasuriesLoaded] = useState(false);
  const [treasuryList, setTreasuryList] = useState<Treasury[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Treasury | undefined>(undefined);

  // Perform premature redirects if no workflow was provided in path
  useEffect(() => {
    if (!publicKey) { return; }

    consoleOut('pathname:', location.pathname, 'crimson');
    if (!workflow) {
      const url = `${VESTING_ROUTE_BASE_PATH}/account-select/create-new`;
      consoleOut('No workflow, redirecting to:', url, 'orange');
      navigate(url, { replace: true });
    } else if (workflow && !step) {
      const url = `${VESTING_ROUTE_BASE_PATH}/${workflow}/create-new`;
      consoleOut('workflow found but no step, redirecting to:', url, 'orange');
      navigate(url, { replace: true });
    }
    // In any case, set the flag isPageLoaded a bit later
    setTimeout(() => {
      setIsPageLoaded(true);
    }, 5);
  }, [location.pathname, navigate, publicKey, step, workflow]);

  // Enable deep-linking when isPageLoaded
  useEffect(() => {
    if (!isPageLoaded || !publicKey) { return; }

    if (workflow) {
      consoleOut('Route param workflow:', workflow, 'crimson');
      setWorkflowStep(workflow as VestingWorkflowStep);
    }

    if (step) {
      consoleOut('Route param step:', step, 'crimson');
      if (workflow as VestingWorkflowStep === "account-select") {
        setVestingAccountStep(step as VestingAccountStep);
        setStreamCreateStep(undefined);
      } else {
        setStreamCreateStep(step as StreamCreateStep);
        setVestingAccountStep(undefined);
      }
    }
  }, [isPageLoaded, publicKey, step, workflow]);

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
  }, [
    connectionConfig.endpoint,
    publicKey,
    streamV2ProgramAddress
  ]);

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

  const getAllUserV2Treasuries = useCallback(async () => {

    if (!connection || !publicKey || loadingTreasuries || !msp) { return []; }

    setTimeout(() => {
      setLoadingTreasuries(true);
    });

    const treasuries = await msp.listTreasuries(publicKey);
    treasuries.filter((t: any) => !t.autoClose);

    return treasuries;

  }, [connection, loadingTreasuries, msp, publicKey]);

  const refreshTreasuries = useCallback((reset = false) => {
    
    if (!connection || !publicKey || loadingTreasuries || !msp) { return; }

    setTimeout(() => {
      setLoadingTreasuries(true);
    });

    getAllUserV2Treasuries()
      .then(treasuries => {
        consoleOut('Streaming accounts:', treasuries, 'blue');
        setTreasuryList(treasuries);
      })
      .catch(error => {
        console.error(error);
      })
      .finally(() => setLoadingTreasuries(false));

  }, [connection, getAllUserV2Treasuries, loadingTreasuries, msp, publicKey]);

  // Load treasuries once per page access
  useEffect(() => {

    if (!publicKey || treasuriesLoaded) { return; }

    consoleOut('Calling refreshTreasuries...', '', 'blue');
    setTreasuriesLoaded(true);
    refreshTreasuries(true);
  }, [publicKey, refreshTreasuries, treasuriesLoaded]);

  ////////////////////////////
  //   Events and actions   //
  ////////////////////////////

  const onTabChange = useCallback((activeKey: string) => {
    consoleOut('Selected tab option:', activeKey, 'blue');
    const url = `${VESTING_ROUTE_BASE_PATH}/${workflow}/${activeKey}`;
    navigate(url);
  }, [navigate, workflow]);

  const selectAccount = useCallback((account: Treasury | undefined) => {
    setSelectedAccount(account);
  }, []);

  ///////////////
  // Rendering //
  ///////////////

  const renderStreamCreation = (
    <>
      <p>Render the stream creation wizard screen.</p>
      <LockedStreamCreate
        param1="LockedStreamCreate -> Sample parameter 1 content"
        param2="LockedStreamCreate -> Another value for parameter 2"
      />
      <Space align="center" size="middle">
        <Button
          type="primary"
          shape="round"
          size="small"
          className="thin-stroke" onClick={() => {
            const url = `${VESTING_ROUTE_BASE_PATH}/account-select/select-existing`;
            navigate(url);
          }}>
          Change account
        </Button>
        <Button
          type="primary"
          shape="round"
          size="small"
          className="thin-stroke">
          Create stream
        </Button>
      </Space>
    </>
  );

  const renderAccountSelection = useCallback(() => {
    return (
      <>
        <h3 className="user-instruction-headline">{t('vesting.user-instruction-headline')}</h3>
        <Tabs centered activeKey={vestingAccountStep} onChange={onTabChange}>
          <TabPane tab={t('vesting.create-account.tab-label-create-account')} key={"create-new"}>
            <p>Render Create new tab content here</p>
            <p>Create Vesting account and go to create stream screen</p>
            <VestingLockCreateAccount
              param1="AccountCreateOrSelect -> Sample parameter 1 content"
              param2="AccountCreateOrSelect -> Another value for parameter 2"
            />
            <Button
              type="primary"
              shape="round"
              size="small"
              className="thin-stroke" onClick={() => {
                const url = `${VESTING_ROUTE_BASE_PATH}/stream-create/general`;
                navigate(url);
              }}>
              Continue
            </Button>
          </TabPane>
          <TabPane tab={t('vesting.create-account.tab-label-select-account')} key={"select-existing"}>
            <VestingLockSelectAccount
              streamingAccounts={treasuryList}
              selectedAccount={selectedAccount}
              onAccountSelected={(item: Treasury | undefined) => selectAccount(item)}
            />
            <Button
              type="primary"
              shape="round"
              size="small"
              className="thin-stroke" onClick={() => {
                const url = `${VESTING_ROUTE_BASE_PATH}/stream-create/general`;
                navigate(url);
              }}>
              Continue
            </Button>
          </TabPane>
        </Tabs>
      </>
    );
  }, [navigate, onTabChange, selectAccount, selectedAccount, t, treasuryList, vestingAccountStep]);

  return (
    <>
      <div className="container main-container">
        <div className="interaction-area">
          <div className="title-and-subtitle">
            <div className="title">
              <IconMoneyTransfer className="mean-svg-icons" />
              <div>{t('vesting.screen-title')}</div>
            </div>
            <div className="subtitle">
              {t('vesting.screen-subtitle')}
            </div>
          </div>
          <div className="container-max-width-640">
            {
              workflowStep === "account-select"
                ? renderAccountSelection()
                : renderStreamCreation
            }
          </div>
        </div>
      </div>
      <PreFooter />
    </>
  );

};
