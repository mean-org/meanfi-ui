// import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Button, Col, Dropdown, Menu, Row, Tooltip } from "antd";
import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { CopyExtLinkGroup } from "../../../../../components/CopyExtLinkGroup";
import { MultisigOwnersView } from "../../../../../components/MultisigOwnersView";
import { TabsMean } from "../../../../../components/TabsMean";
import { AppStateContext } from "../../../../../contexts/appstate";
// import { useConnectionConfig } from "../../../../../contexts/connection";
import { IconAdd, IconEdit, IconEllipsisVertical, IconShowAll, IconTrash } from "../../../../../Icons";
import { MultisigVault } from "../../../../../models/multisig";
import { UserTokenAccount } from "../../../../../models/transactions";
import { NATIVE_SOL } from "../../../../../utils/tokens";
// import { NATIVE_SOL } from "../../../../../utils/tokens";

import { isDev, isLocal, toUsCurrency } from "../../../../../utils/ui";
import { getTokenByMintAddress, shortenAddress } from "../../../../../utils/utils";

export const SafeInfo = (props: {
  // connection: Connection;
  selectedMultisig?: any;
  multisigVaults?: MultisigVault[];
  safeNameImg?: string;
  safeNameImgAlt?: string;
  onNewProposalMultisigClick?: any;
  onNewCreateAssetClick?: any;
  onEditMultisigClick?: any;
  tabs?: Array<any>;
  selectedTab?: any;
  solBalance?: any;
}) => {
  const {
    coinPrices,
    splTokenList,
    isWhitelisted
  } = useContext(AppStateContext);

  const { solBalance, selectedMultisig, multisigVaults, safeNameImg, safeNameImgAlt, onNewProposalMultisigClick, onNewCreateAssetClick, onEditMultisigClick, tabs, selectedTab } = props;

  // const { t } = useTranslation('common');
  const navigate = useNavigate();

  const [selectedLabelName, setSelectedLabelName] = useState("");
  const [totalSafeBalance, setTotalSafeBalance] = useState(0);

  const isUnderDevelopment = () => {
    return isLocal() || (isDev() && isWhitelisted) ? true : false;
  }
  
  // Safe Name
  useEffect(() => {
    (selectedMultisig.label) ? (
      setSelectedLabelName(selectedMultisig.label)
    ) : (
      setSelectedLabelName(shortenAddress(selectedMultisig.id.toBase58(), 4))
    )
  }, [selectedMultisig.id, selectedMultisig.label]);

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
      <MultisigOwnersView label="view" className="ml-1" participants={selectedMultisig.owners || []} />
    </>
  );
  
  // Safe Balance
  // const [safeAssetsAmount, setSafeAssetsAmount] = useState<any>();
  const [assetsAmout, setAssetsAmount] = useState<string>();

  const getPricePerToken = useCallback((token: UserTokenAccount): number => {
    if (!token || !coinPrices) { return 0; }

    return coinPrices && coinPrices[token.symbol]
      ? coinPrices[token.symbol]
      : 0;
  }, [coinPrices])

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

  // Fetch safe balance.
  useEffect(() => {

    if (!selectedMultisig) { return; }
    
    let usdValue = 0;

    (async () => {

      // const solBalance = await connection.getBalance(selectedMultisig.authority);  
      usdValue = (solBalance / LAMPORTS_PER_SOL) * getPricePerToken(NATIVE_SOL);
      const cumulative = new Array<any>();

      if (!multisigVaults) { return; }
  
      multisigVaults.forEach(item => {

        const token = getTokenByMintAddress(item.mint.toBase58(), splTokenList);

        if (token) {

          const rate = getPricePerToken(token);
          const balance = item.amount.toNumber() / 10 ** token.decimals;
          usdValue += balance * rate;

          cumulative.push({
            symbol: token.symbol,
            address: item.mint,
            balance: balance,
            usdValue: balance * rate
          })
        }
      });

      setTotalSafeBalance(usdValue);

    })();

  }, [
    getPricePerToken, 
    selectedMultisig, 
    splTokenList, 
    multisigVaults, 
    solBalance
  ]);  
    
  // Deposit Address
  const renderDepositAddress = (
    <CopyExtLinkGroup
      content={selectedMultisig.authority.toBase58()}
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
      value: totalSafeBalance ? toUsCurrency(totalSafeBalance) : toUsCurrency(0)
    },
    {
      name: "Deposit address",
      value: renderDepositAddress ? renderDepositAddress : "--"
    }
  ];

  // View assets
  const onGoToAccounts = () => {
    navigate(`/accounts?address=${selectedMultisig.authority.toBase58()}&cat=user-assets`);
  }

  // Dropdown (three dots button)
  const menu = (
    <Menu>
      <Menu.Item key="0" onClick={onEditMultisigClick}>
        <IconEdit className="mean-svg-icons" />
        <span className="menu-item-text">Edit safe</span>
      </Menu.Item>
      {isUnderDevelopment() && (
        <Menu.Item key="1" onClick={() => {}}>
          <IconTrash className="mean-svg-icons" />
          <span className="menu-item-text">Delete safe</span>
        </Menu.Item>
      )}
    </Menu>
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
                {info.value}
              </span>
            </div>
          </Col>
        ))}
      </Row>

      <Row gutter={[8, 8]} className="safe-btns-container mb-1">
        <Col xs={20} sm={18} md={20} lg={18} className="btn-group">
          <Button
            type="ghost"
            size="small"
            className="thin-stroke"
            onClick={onGoToAccounts}>
              <div className="btn-content">
                <IconShowAll className="mean-svg-icons" />
                View assets
              </div>
          </Button>
          <Button
            type="ghost"
            size="small"
            className="thin-stroke"
            onClick={onNewProposalMultisigClick}>
              <div className="btn-content">
                <IconAdd className="mean-svg-icons" />
                New proposal
              </div>
          </Button>
          <Button
            type="ghost"
            size="small"
            className="thin-stroke"
            onClick={onNewCreateAssetClick}>
              <div className="btn-content">
                <IconAdd className="mean-svg-icons" />
                Create asset
              </div>
          </Button>
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
                onClick={(e) => e.preventDefault()}
              />
            </span>
          </Dropdown>
        </Col>
      </Row>

      <div className="safe-tabs-container">
        <TabsMean
          tabs={tabs}
          headerClassName="safe-tabs-header-container"
          bodyClassName="safe-tabs-content-container"
          selectedTab={selectedTab}
        />
      </div>
    </>
  )
}