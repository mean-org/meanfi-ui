import { MultisigInfo } from "@mean-dao/mean-multisig-sdk";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Alert, Button, Col, Dropdown, Menu, Row, Tabs, Tooltip } from "antd";
import { useCallback, useContext, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CopyExtLinkGroup } from "../../../../../components/CopyExtLinkGroup";
import { MultisigOwnersView } from "../../../../../components/MultisigOwnersView";
import { RightInfoDetails } from "../../../../../components/RightInfoDetails";
import { SolBalanceModal } from "../../../../../components/SolBalanceModal";
import { MIN_SOL_BALANCE_REQUIRED } from "../../../../../constants";
import { useNativeAccount } from "../../../../../contexts/accounts";
import { AppStateContext } from "../../../../../contexts/appstate";
import { IconEllipsisVertical, IconLoading } from "../../../../../Icons";
import { NATIVE_SOL } from "../../../../../constants/tokens";
import { consoleOut, isDev, isLocal, toUsCurrency } from "../../../../../middleware/ui";
import { getAmountFromLamports, shortenAddress } from "../../../../../middleware/utils";
import { ACCOUNTS_ROUTE_BASE_PATH } from "../../../../accounts";
import { VESTING_ROUTE_BASE_PATH } from "../../../../vesting";

const { TabPane } = Tabs;

export const SafeInfo = (props: {
  isTxInProgress?: any;
  onEditMultisigClick?: any;
  onNavigateAway: any;
  onNewProposalMultisigClick?: any;
  onRefreshTabsInfo?: any;
  programsTabContent?: any;
  proposalsTabContent?: any;
  totalSafeBalance?: number;
  safeNameImg?: string;
  safeNameImgAlt?: string;
  selectedMultisig?: MultisigInfo;
  selectedTab?: any;
  tabs?: Array<any>;
  vestingAccountsCount: number;
}) => {
  const {
    isTxInProgress,
    onEditMultisigClick,
    onNavigateAway,
    onNewProposalMultisigClick,
    onRefreshTabsInfo,
    programsTabContent,
    proposalsTabContent,
    totalSafeBalance,
    safeNameImg,
    safeNameImgAlt,
    selectedMultisig,
    selectedTab,
    tabs,
    vestingAccountsCount,
  } = props;
  const {
    isWhitelisted,
    multisigVaults,
    accountAddress,
    multisigSolBalance,
    refreshTokenBalance,
    setActiveTab,
  } = useContext(AppStateContext);
  const navigate = useNavigate();
  const { address } = useParams();
  const { account } = useNativeAccount();
  const [,setSearchParams] = useSearchParams();
  const [selectedLabelName, setSelectedLabelName] = useState("");
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);

  const isUnderDevelopment = () => {
    return isLocal() || (isDev() && isWhitelisted) ? true : false;
  }

  ////////////////
  ///  MODALS  ///
  ////////////////

  // SOL Balance Modal
  const [isSolBalanceModalOpen, setIsSolBalanceModalOpen] = useState(false);
  const hideSolBalanceModal = useCallback(() => setIsSolBalanceModalOpen(false), []);
  const showSolBalanceModal = useCallback(() => setIsSolBalanceModalOpen(true), []);

  // Keep account balance updated
  useEffect(() => {
    if (account?.lamports !== previousBalance || !nativeBalance) {
      // Refresh token balance
      refreshTokenBalance();
      setNativeBalance(getAmountFromLamports(account?.lamports));
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [
    account,
    nativeBalance,
    previousBalance,
    refreshTokenBalance
  ]);

  // Safe Name
  useEffect(() => {
    if (selectedMultisig) {
      if (selectedMultisig.label) {
        setSelectedLabelName(selectedMultisig.label)
      } else {
        setSelectedLabelName(shortenAddress(selectedMultisig.id, 4))
      }
    }
  }, [selectedMultisig]);

  const renderSafeName = (
    <Row className="d-flex align-items-center">
      {(safeNameImg && safeNameImgAlt) && (
        <Tooltip placement="rightTop" title="Serum Multisig">
          <img src={safeNameImg} alt={safeNameImgAlt} width={16} height={16} className="simplelink mr-1" />
        </Tooltip>
      )}
      <div>{selectedLabelName}</div>
    </Row>
  );

  // Security
  const renderSecurity = (
    <>
      <span>Security</span>
      <MultisigOwnersView label="view" className="ml-1" participants={selectedMultisig ? selectedMultisig.owners : []} />
    </>
  );

  // Safe Balance
  const [assetsAmout, setAssetsAmount] = useState<string>();

  // Show amount of assets
  useEffect(() => {
    (selectedMultisig) && (
      multisigVaults && multisigVaults.length > 0 ? (
        multisigVaults.length > 1 ? (
          setAssetsAmount(`(${multisigVaults.length} assets)`)
        ) : (
          setAssetsAmount(`(${multisigVaults.length} asset)`)
        )
      ) : (
        setAssetsAmount("(0 assets)")
      )
    )
  }, [
    multisigVaults, 
    selectedMultisig
  ]);

  const renderSafeBalance = (
    totalSafeBalance === undefined ? (
      <>
        <IconLoading className="mean-svg-icons" style={{ height: "15px", lineHeight: "15px" }}/>
      </>
    ) : totalSafeBalance === 0 ? (
      <>
        $0.00
      </>
    ) : (
      <>
        {toUsCurrency(totalSafeBalance)}
      </>
    )
  );

  // Deposit Address
  const renderDepositAddress = (
    <CopyExtLinkGroup
      content={selectedMultisig ? selectedMultisig.authority.toBase58() : ''}
      number={4}
      externalLink={true}
    />
  );

  const infoSafeData = [
    {
      name: "Safe name",
      value: renderSafeName ? renderSafeName : "--"
    },
    {
      name: renderSecurity,
      value: selectedMultisig ? `${selectedMultisig.threshold}/${selectedMultisig.owners.length} signatures` : "--"
    },
    {
      name: `Safe balance ${assetsAmout}`,
      value: renderSafeBalance
    },
    {
      name: "Deposit address",
      value: renderDepositAddress ? renderDepositAddress : "--"
    }
  ];

  // View account
  const onGoToAccounts = () => {
    if (selectedMultisig) {
      onNavigateAway();
      navigate(`${ACCOUNTS_ROUTE_BASE_PATH}/${selectedMultisig.authority.toBase58()}/streaming/summary?account-type=multisig`);
    }
  }

  // Go to vesting
  const goToVesting = () => {
    if (selectedMultisig) {
      onNavigateAway();
      navigate(`${VESTING_ROUTE_BASE_PATH}/${selectedMultisig.authority.toBase58()}/contracts?account-type=multisig`);
    }
  }

  const onTabChanged = (tab: string) => {
    consoleOut('Setting tab to:', tab, 'blue');
    setActiveTab(tab);
    setSearchParams({v: tab as string});
  }

  // Dropdown (three dots button)
  const menu = (
    <Menu>
      <Menu.Item key="ms-00" onClick={onEditMultisigClick}>
        <span className="menu-item-text">Edit safe</span>
      </Menu.Item>
      {isUnderDevelopment() && (
        <Menu.Item key="ms-01" onClick={() => {}}>
          <span className="menu-item-text">Delete safe</span>
        </Menu.Item>
      )}
      <Menu.Item key="ms-02" onClick={onRefreshTabsInfo}>
        <span className="menu-item-text">Refresh</span>
      </Menu.Item>
    </Menu>
  );

  const renderTabset = () => {
    if (tabs && tabs.length > 0) {
      return (
        <Tabs activeKey={selectedTab} onChange={onTabChanged} className="neutral">
          {tabs && tabs.map(item => {
            return (
              <TabPane tab={item.name} key={item.id} tabKey={item.id}>
                {item.render}
              </TabPane>
            );
          })}
        </Tabs>
      );
    } else {
      return (
        <Tabs activeKey={selectedTab} onChange={onTabChanged} className="neutral">
          {proposalsTabContent ? (
            <TabPane tab={proposalsTabContent.name} key={proposalsTabContent.id} tabKey={proposalsTabContent.id}>
              {proposalsTabContent.render}
            </TabPane>
          ) : (
            <TabPane tab="Proposals" key="proposals" tabKey="proposals">
              Loading...
            </TabPane>
          )}
          {programsTabContent ? (
            <TabPane tab={programsTabContent.name} key={programsTabContent.id} tabKey={programsTabContent.id}>
              {programsTabContent.render}
            </TabPane>
          ) : (
            <TabPane tab="Programs" key="programs" tabKey="programs">
              Loading...
            </TabPane>
          )}
        </Tabs>
      );
    }
  }

  return (
    <>
      <RightInfoDetails
        infoData={infoSafeData}
      /> 

      <Row gutter={[8, 8]} className="safe-btns-container mb-1 mr-0 ml-0">
        <Col xs={20} sm={18} md={20} lg={18} className="btn-group">
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            disabled={isTxInProgress()}
            onClick={onNewProposalMultisigClick}>
              New proposal
          </Button>
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            disabled={isTxInProgress()}
            onClick={onGoToAccounts}>
              <div className="btn-content">
                View account
              </div>
          </Button>

          {vestingAccountsCount > 0 && (
            <Button
              type="default"
              shape="round"
              size="small"
              className="thin-stroke"
              onClick={() => goToVesting()}>
                <div className="btn-content">
                  Vesting
                </div>
            </Button>
          )}

          {/* <div className="cool-off-period-label">
            <div className="icon-label">
              <div className="pl-1">
                <span className="info-label">Cool-off period: </span>
                <span className="info-value"> 24h</span>
              </div>
              <Tooltip placement="bottom" title="This is the period of time that applies to every proposal in this safe. To change it edit the safe.">
                <span className="icon-info-circle simplelink">
                  <IconInfoCircle className="mean-svg-icons" />
                </span>
              </Tooltip>
            </div>
          </div> */}
        </Col>
        
        <Col xs={4} sm={6} md={4} lg={6}>
          <Dropdown
            overlay={menu}
            placement="bottomRight"
            trigger={["click"]}>
            <span className="ellipsis-icon icon-button-container mr-1">
              <Button
                type="default"
                shape="circle"
                size="middle"
                icon={<IconEllipsisVertical className="mean-svg-icons"/>}
                disabled={isTxInProgress()}
                onClick={(e) => e.preventDefault()}
              />
            </span>
          </Dropdown>
        </Col>
      </Row>

      {multisigSolBalance !== undefined && (
        (multisigSolBalance / LAMPORTS_PER_SOL) <= MIN_SOL_BALANCE_REQUIRED ? (
          <Row gutter={[8, 8]} className="mr-0 ml-0">
            <Col span={24} className="alert-info-message pr-6 simplelink" onClick={showSolBalanceModal}>
              <Alert message="SOL account balance is very low in the safe. Click here to add more SOL." type="info" showIcon />
            </Col>
          </Row>
        ) : null
      )}

      {renderTabset()}

      {isSolBalanceModalOpen && (
        <SolBalanceModal
          address={NATIVE_SOL.address || ''}
          accountAddress={accountAddress}
          multisigAddress={address as string}
          isVisible={isSolBalanceModalOpen}
          handleClose={hideSolBalanceModal}
          tokenSymbol={NATIVE_SOL.symbol}
          nativeBalance={nativeBalance}
          selectedMultisig={selectedMultisig}
          isStreamingAccount={false}
        />
      )}
    </>
  )
}