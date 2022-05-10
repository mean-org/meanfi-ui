import { Connection } from "@solana/web3.js";
import { Button, Col, Dropdown, Menu, Row, Tooltip } from "antd";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { MultisigOwnersView } from "../../../../../components/MultisigOwnersView";
import { openNotification } from "../../../../../components/Notifications";
import { TabsMean } from "../../../../../components/TabsMean";
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from "../../../../../constants";
import { AppStateContext } from "../../../../../contexts/appstate";
import { getSolanaExplorerClusterParam, useConnectionConfig } from "../../../../../contexts/connection";
import { IconAdd, IconEdit, IconEllipsisVertical, IconLink, IconShowAll, IconTrash } from "../../../../../Icons";

import { consoleOut, copyText, toUsCurrency } from "../../../../../utils/ui";
import { fetchAccountTokens, getTokenByMintAddress, shortenAddress } from "../../../../../utils/utils";

export const SafeInfo = (props: {
  selectedMultisig?: any;
  multisigVaults?: any;
  safeNameImg?: string;
  safeNameImgAlt?: string;
  onNewProposalMultisigClick?: any;
  onEditMultisigClick?: any;
  tabs?: Array<any>;
}) => {
  const {
    coinPrices,
    splTokenList
  } = useContext(AppStateContext);
  const connectionConfig = useConnectionConfig();

  const { selectedMultisig, multisigVaults, safeNameImg, safeNameImgAlt, onNewProposalMultisigClick, onEditMultisigClick, tabs } = props;

  const { t } = useTranslation('common');
  const navigate = useNavigate();

  const [selectedLabelName, setSelectedLabelName] = useState("");
  const [totalSafeBalance, setTotalSafeBalance] = useState(0);

  // Create and cache the connection
  const connection = useMemo(() => new Connection(connectionConfig.endpoint, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true
  }), [
    connectionConfig.endpoint
  ]);

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
  
  // Safe Balance (show amount of assets)
  const [assetsAmout, setAssetsAmount] = useState<string>();

  const getPricePerTokenAddress = useCallback((address: string): number => {
    if (!address || !coinPrices) { return 0; }

    return coinPrices && coinPrices[address]
      ? coinPrices[address]
      : 0;
  }, [coinPrices]);

  useEffect(() => {
    (selectedMultisig) && (
      multisigVaults.length > 1 ? (
        setAssetsAmount(`(${multisigVaults.length} assets)`)
      ) : (
        setAssetsAmount(`(${multisigVaults.length} asset)`)
      )
    )
  }, [multisigVaults, selectedMultisig]);

  useEffect(() => {
    if (!connection || !selectedMultisig) { return; }

    fetchAccountTokens(connection, selectedMultisig.authority)
      .then(accTks => {

        if (accTks) {
          let usdValue = 0;
          const cumulative = new Array<any>();

          accTks.forEach(item => {
            const token = getTokenByMintAddress(item.parsedInfo.mint, splTokenList);

            if (token) {
              const rate = getPricePerTokenAddress(token.address);
              const balance = item.parsedInfo.tokenAmount.uiAmount || 0;

              usdValue += balance * rate;
              cumulative.push({
                symbol: token.symbol,
                address: item.parsedInfo.mint,
                balance: balance,
                usdValue: balance * rate
              })
            } 
          });

          setTotalSafeBalance(usdValue);

          console.table(cumulative);
        } else {
          consoleOut("No tokens founds", "", "");
        }

      }).catch(error => {
        console.error(error);
      });

      
  }, [
    getPricePerTokenAddress,
    selectedMultisig,
    splTokenList,
    connection
  ]);

  console.log(selectedMultisig);
  
    
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

  const infoSafeData = [
    {
      name: "Safe Name",
      value: renderSafeName ? renderSafeName : "--"
    },
    {
      name: renderSecurity,
      value: selectedMultisig ? `${selectedMultisig.threshold}/${selectedMultisig.owners.length} signatures` : "--"
    },
    {
      name: `Safe Balance ${assetsAmout}`,
      value: totalSafeBalance ? toUsCurrency(totalSafeBalance) : toUsCurrency(0)
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
        <TabsMean
          tabs={tabs}
          headerClassName="safe-tabs-header-container"
          bodyClassName="safe-tabs-content-container"
        />
      </div>
    </>
  )
}