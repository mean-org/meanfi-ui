import { useCallback, useState } from "react";
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

export const SafeInfoView = (props: {
  isSafeDetails: boolean;
  onDataToSafeView: any;
  proposals: any[];
  selectedMultisig?: any;
}) => {
  const { proposals, selectedMultisig } = props;
  
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

  const renderDepositAddress = (
    <div className="d-flex align-items-start">
      <div onClick={() => copyAddressToClipboard(selectedMultisig.authority)} className="simplelink">{shortenAddress(selectedMultisig.authority.toBase58(), 6)}</div>
      <span className="icon-link icon-button-container">
        <a
          target="_blank"
          rel="noopener noreferrer"
          href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${selectedMultisig.authority.toBase58()}${getSolanaExplorerClusterParam()}`}>
          <IconLink className="mean-svg-icons" />
        </a>
      </span>
    </div>
  );

  const infoSafeData = [
    {
      name: "Safe Name",
      value: "My Safe XYZ",
    },
    {
      name: "Security",
      value: "3/5 signatures"
    },
    {
      name: "Safe Balance (13 assets)",
      value: "$124,558.26"
    },
    {
      name: "Deposit address",
      value: renderDepositAddress
    }
  ];

  // View assets
  const onGoToAccounts = () => {
    navigate('/accounts');
  }

  // Dropdown (three dots button)
  const menu = (
    <Menu>
      <Menu.Item key="0" onClick={() => {}}>
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
  const tabs = ["Proposals", "Settings", "Activity"];

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
              // onClick={onSelectProposal}
              // className={${selectedProposal.id === proposal.id ? "selected" : ''}
              className="d-flex w-100 align-items-center"
              >
                <ProposalResumeItem
                  id={proposal.id}
                  title={proposal.title}
                  expires={proposal.expires}
                  approved={proposal.approved}
                  rejected={proposal.rejected}
                  status={proposal.status}
                />
                <Col>
                  <span className="icon-button-container">
                    <Button
                      type="default"
                      shape="circle"
                      size="middle"
                      icon={<IconArrowForward className="mean-svg-icons" />}
                      onClick={onSelectProposal}
                    />
                  </span>
                </Col>
            </div>
          )
        })
      )}
    </>
  );

  return (
    <>
      <Row gutter={[8, 8]} className="safe-info-container">
        {infoSafeData.map((info) => (
          <Col xs={12} sm={12} md={12} lg={12}>
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
            onClick={() => {}}>
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
          {activeTab === "Settings" && "Settings"}
          {activeTab === "Activity" && "Activity"}
        </Row>
      </div>
    </>
  )
}