import { useCallback, useEffect, useState } from "react";
import './style.scss';
import { useNavigate } from "react-router-dom";

import { Button, Col, Dropdown, Menu, Row } from "antd"
import { IconAdd, IconArrowForward, IconEdit, IconEllipsisVertical, IconLink, IconShowAll, IconTrash } from "../../../../Icons"
import { shortenAddress } from "../../../../utils/utils";
import { ProposalResumeItem } from '../ProposalResumeItem';
import { useTranslation } from "react-i18next";
import { openNotification } from "../../../../components/Notifications";
import { copyText } from "../../../../utils/ui";
import { getSolanaExplorerClusterParam } from "../../../../contexts/connection";
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from "../../../../constants";
import { MultisigOwnersView } from "../../../../components/MultisigOwnersView";

export const SafeInfoView = (props: {
  isSafeDetails: boolean;
  onDataToSafeView: any;
  proposals: any[];
  selectedMultisig?: any;
  onEditMultisigClick: any;
  onNewProposalMultisigClick: any;
  multisigVaults: any;
}) => {
  const { isSafeDetails, proposals, selectedMultisig, onEditMultisigClick, onNewProposalMultisigClick, multisigVaults } = props;
  
  const navigate = useNavigate();
  const { t } = useTranslation('common');

  // Copy address to clipboard
  const copyAddressToClipboard = useCallback((address: any) => {
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

  // Security
  const renderSecurity = (
    <>
      <span>Security</span>
      <MultisigOwnersView label="view" className="ml-1" participants={selectedMultisig.owners || []} />
    </>
  );
  
  // Deposit Address
  const renderDepositAddress = (
    <div className="d-flex align-items-start">
      <div onClick={() => copyAddressToClipboard(selectedMultisig.authority)} className="simplelink underline-on-hover">{shortenAddress(selectedMultisig.authority.toBase58(), 4)}</div>
      <span className="icon-button-container">
        <a
          target="_blank"
          rel="noopener noreferrer"
          href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${selectedMultisig.authority.toBase58()}${getSolanaExplorerClusterParam()}`}>
          <IconLink className="mean-svg-icons" />
        </a>
      </span>
    </div>
  );

  // Safe Balance (show amount of assets)
  const [assetsAmout, setAssetsAmount] = useState<string>();

  useEffect(() => {
    (selectedMultisig) && (
      multisigVaults.length > 1 ? (
        setAssetsAmount(`(${multisigVaults.length} assets)`)
      ) : (
        setAssetsAmount(`(${multisigVaults.length} asset)`)
      )
    )
  }, [multisigVaults, selectedMultisig]);  

  const infoSafeData = [
    {
      name: "Safe Name",
      value: selectedMultisig.label ? selectedMultisig.label : "--"
    },
    {
      name: renderSecurity,
      value: `${selectedMultisig.threshold}/${selectedMultisig.owners.length} signatures`
    },
    {
      name: `Safe Balance ${assetsAmout}`,
      value: "$124,558.26"
    },
    {
      name: "Deposit address",
      value: renderDepositAddress ? renderDepositAddress : "--"
    }
  ];

  // View assets
  const onGoToAccounts = () => {
    // navigate(`/accounts?cat=account&address=${selectedMultisig.authority.toBase58()}`);
    navigate(`/accounts?address=${selectedMultisig.authority.toBase58()}&cat=user-assets`);
  }

  /**
   * URL scheme to redirect to /accounts page
   * 
   * /accounts?address={address}&cat={catId}&asset={assetId}
   * 
   *   Navigate to /accounts with Net Worth selected
   *   /accounts?address=GFefRR6EASXvnphnJApp2PRH1wF1B5pJijKBZGFzq1x1&cat=networth
   *   Navigate to /accounts with my USDC asset selected
   *   /accounts?address=GFefRR6EASXvnphnJApp2PRH1wF1B5pJijKBZGFzq1x1&cat=user-assets&asset=USDC
   *   Navigate to /accounts with Treasuries summary selected
   *   /accounts?address=GFefRR6EASXvnphnJApp2PRH1wF1B5pJijKBZGFzq1x1&cat=other-assets&asset=msp-treasuries
   * 
   *  cat [networth | user-assets | other-assets]
   *  asset (when cat=user-assets)  = [any token symbol]
   *  asset (when cat=other-assets) = [msp-streams | msp-treasuries | orca | solend | friktion]
   */

  /**
   * URL scheme to redirect to /accounts page
   * /accounts?cat=networth&address=Ss1dd5HsdsdSx2P
   * /accounts?cat=account&address=Ss1dd5HsdsdSx2P
   * /accounts?cat=other-assets&project=msp&address=Ss1dd5HsdsdSx2P
   */

  // Dropdown (three dots button)
  const menu = (
    <Menu>
      <Menu.Item key="0" onClick={onEditMultisigClick}>
        <IconEdit className="mean-svg-icons" />
        <span className="menu-item-text">Edit Safe</span>
      </Menu.Item>
      <Menu.Item key="1" onClick={() => {}}>
        <IconTrash className="mean-svg-icons" />
        <span className="menu-item-text">Delete Safe</span>
      </Menu.Item>
    </Menu>
  );

  // Tabs
  const tabs = ["Proposals", "Settings", "Activity", "Programs"];

  const [activeTab, setActiveTab] = useState(tabs[0]);

  const onClickHandler = (event: any) => {
    if (event.target.innerHTML !== activeTab) {
      setActiveTab(event.target.innerHTML);
    }
  };

  // Proposals list
  const renderListOfProposals = (
    <>
      {proposals && proposals.length && (
        proposals.map((proposal) => {
          const onSelectProposal = () => {
            // Sends isSafeDetails value to the parent component "SafeView"
            props.onDataToSafeView(proposal);
          };

          return (
            <div 
              key={proposal.id}
              onClick={onSelectProposal}
              className={`d-flex w-100 align-items-center simplelink ${proposal.id % 2 === 0 ? '' : 'background-gray'}`}
              >
                <ProposalResumeItem
                  id={proposal.id}
                  logo={proposal.logo}
                  title={proposal.title}
                  expires={proposal.expires}
                  approved={proposal.approved}
                  rejected={proposal.rejected}
                  status={proposal.status}
                  isSafeDetails={isSafeDetails}
                />
            </div>
          )
        })
      )}
    </>
  );

  // Settings
  const renderSettings = (
    <>
      <Row gutter={[8, 8]}>
        <Col xs={12} sm={12} md={12} lg={12} className="text-right pr-1">Minimum cool-off period:</Col>
        <Col xs={12} sm={12} md={12} lg={12} className="text-left pl-1">24 hours</Col>
      </Row>
      <Row gutter={[8, 8]}>
        <Col xs={12} sm={12} md={12} lg={12} className="text-right pr-1">Single signer balance threshold:</Col>
        <Col xs={12} sm={12} md={12} lg={12} className="text-left pl-1">$100.00</Col>
      </Row>
    </>
  );

  return (
    <>
      <Row gutter={[8, 8]} className="safe-info-container">
        {infoSafeData.map((info, index) => (
          <Col xs={12} sm={12} md={12} lg={12} key={index}>
            <div className="info-safe-group">
              <span className="info-label">
                {info.name}
              </span>
              <span className="info-data">
                {info.value ? info.value : ""}
              </span>
            </div>
          </Col>
        ))}
      </Row>

      <Row gutter={[8, 8]} className="safe-btns-container">
        <Col xs={20} sm={18} md={20} lg={18}>
          <Button
            type="ghost"
            size="small"
            className="thin-stroke"
            onClick={onGoToAccounts}>
              <div className="btn-content">
                <IconShowAll className="mean-svg-icons" />
                View Assets
              </div>
          </Button>
          <Button
            type="ghost"
            size="small"
            className="thin-stroke"
            onClick={onNewProposalMultisigClick}>
              <div className="btn-content">
                <IconAdd className="mean-svg-icons" />
                New Proposal
              </div>
          </Button>
        </Col>
        <Col xs={4} sm={6} md={4} lg={6}>
          <Dropdown trigger={["click"]} overlay={menu} placement="bottomRight">
            <div onClick={e => e.stopPropagation()} className="ellipsis-icon icon-button-container">
              <IconEllipsisVertical className="mean-svg-icons" />
            </div>
          </Dropdown>
        </Col>
      </Row>

      <div className="safe-tabs-container">
        <Row gutter={[8, 8]} className="safe-tabs-header-container">
          <ul className="tabs ant-menu-overflow ant-menu-horizontal">
            {tabs.map((tab, index) => (
              <li 
                key={index} 
                className={`ant-menu-item ${activeTab === tab ? "active ant-menu-item-selected" : ""}`} 
                tabIndex={0} 
                onClick={onClickHandler}
              >
                <span className="ant-menu-title-content">{tab}</span>
              </li>
            ))}
          </ul>
        </Row>
        <Row gutter={[8, 8]} className="safe-tabs-content-container">
          {activeTab === "Proposals" && renderListOfProposals}
          {activeTab === "Settings" && renderSettings}
          {activeTab === "Activity" && "Activity"}
          {activeTab === "Programs" && "Programs"}
        </Row>
      </div>
    </>
  )
}