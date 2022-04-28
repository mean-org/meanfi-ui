import { useState } from "react";
import './style.scss';
import { useNavigate } from "react-router-dom";

import { Button, Col, Dropdown, Empty, Menu, Row, Tooltip } from "antd"
import { IconAdd, IconArrowForward, IconEdit, IconEllipsisVertical, IconShowAll, IconTrash } from "../../../../Icons"
import { shortenAddress } from "../../../../utils/utils";
import { ProposalResumeItem } from '../ProposalResumeItem';
import { useWallet } from "../../../../contexts/wallet";
import { useTranslation } from "react-i18next";

export const SafeInfoView = (props: {
  isSafeDetails: boolean;
  onDataToSafeView: any;
  proposals: any[];
}) => {
  const { proposals } = props;
  
  const navigate = useNavigate();
  const { connected } = useWallet();
  const { t } = useTranslation('common');

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
      value: shortenAddress("7kjcW2QHa9pN5e9Fx7LBM3kVwxCi3KteBtM7BMVzrMX4", 6)
    }
  ];

   // Tabs
   const tabs = ["Proposals", "Settings", "Activity"];

   const [activeTab, setActiveTab] = useState(tabs[0]);
 
   const onClickHandler = (event: any) => {
     if (event.target.innerHTML !== activeTab) {
       setActiveTab(event.target.innerHTML);
     }
   };

     // Dropdown
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

  const onGoToAccounts = () => {
    navigate('/accounts');
  }

  // When any detail button is clicked, goes to Safe Details
  const showDetailsHandler = () => {
    // Sends the value to the parent component "SafeView"
    props.onDataToSafeView();
  };
  
  const [selectedProposal, setSelectedProposal] = useState<any>(proposals[0]);

  // const onSelectProposal = ({e, proposal}: any) => {
  //   setSelectedProposal(proposal);

  //   console.log("e.target", e.target);
  // }

  // console.log("selected proposal", selectedProposal);
  

  const renderListOfProposals = (
    <>
      {proposals && proposals.length ? (
        proposals.map((proposal, index) => {
          const onSelectProposal = () => {
            setSelectedProposal(proposal);

            // Sends isSafeDetails value to the parent component "SafeView"
            props.onDataToSafeView(selectedProposal);
          };

          return (
            <div 
              key={proposal.id}
              onClick={onSelectProposal}
              // className={`transaction-list-row ${selectedProposal.id === proposal.id ? "selected" : ''}`}
              className="d-flex w-100"
              >
                <ProposalResumeItem
                  id={proposal.id}
                  title={proposal.title}
                  expires={proposal.expires}
                  approved={proposal.approved}
                  rejected={proposal.rejected}
                  status={proposal.status}
                />
              <span className="icon-button-container">
                {/* <Tooltip placement="topRight" title={"See details"}> */}
                  <Button
                    type="default"
                    shape="circle"
                    size="middle"
                    icon={<IconArrowForward className="mean-svg-icons" />}
                    onClick={onSelectProposal}
                  />
                {/* </Tooltip> */}
              </span>
            </div>
          )
        })
      ) : (
        <div className="h-100 flex-center">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{!connected
          ? t('invest.panel-left.no-invest-options')
          : t('invest.panel-left.not-connected')}</p>} />
        </div>
      )}
    </>
  )

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
                {info.value}
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

      <Row gutter={[8, 8]} className="safe-tabs-container">
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
    </>
  )
}