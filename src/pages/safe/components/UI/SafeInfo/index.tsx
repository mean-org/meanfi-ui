import { MultisigInfo } from "@mean-dao/mean-multisig-sdk";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Alert, Button, Col, Dropdown, Menu, Row, Tooltip } from "antd";
import { useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CopyExtLinkGroup } from "../../../../../components/CopyExtLinkGroup";
import { MultisigOwnersView } from "../../../../../components/MultisigOwnersView";
import { RightInfoDetails } from "../../../../../components/RightInfoDetails";
import { TabsMean } from "../../../../../components/TabsMean";
import { AppStateContext } from "../../../../../contexts/appstate";
import { IconEllipsisVertical, IconLoading } from "../../../../../Icons";
import { UserTokenAccount } from "../../../../../models/transactions";
import { NATIVE_SOL } from "../../../../../utils/tokens";
import { isDev, isLocal, toUsCurrency } from "../../../../../utils/ui";
import { shortenAddress } from "../../../../../utils/utils";
import { ACCOUNTS_ROUTE_BASE_PATH } from "../../../../accounts";
import { VESTING_ROUTE_BASE_PATH } from "../../../../vesting";

export const SafeInfo = (props: {
  isTxInProgress?: any;
  onEditMultisigClick?: any;
  onNewProposalMultisigClick?: any;
  onRefreshTabsInfo?: any;
  safeNameImg?: string;
  safeNameImgAlt?: string;
  selectedMultisig?: MultisigInfo;
  selectedTab?: any;
  tabs?: Array<any>;
  vestingAccountsCount: number;
}) => {
  const {
    coinPrices,
    splTokenList,
    isWhitelisted,
    multisigVaults,
    totalSafeBalance,
    multisigSolBalance,
    setTotalSafeBalance,
    getTokenByMintAddress,
  } = useContext(AppStateContext);

  const {
    isTxInProgress,
    onEditMultisigClick,
    onNewProposalMultisigClick,
    onRefreshTabsInfo,
    safeNameImg,
    safeNameImgAlt,
    selectedMultisig,
    selectedTab,
    tabs,
    vestingAccountsCount,
  } = props;

  // const { t } = useTranslation('common');
  const navigate = useNavigate();

  const [selectedLabelName, setSelectedLabelName] = useState("");
  // const [totalSafeBalance, setTotalSafeBalance] = useState<number>(0);

  const isUnderDevelopment = () => {
    return isLocal() || (isDev() && isWhitelisted) ? true : false;
  }

  // Safe Name
  useEffect(() => {
    if (selectedMultisig) {
      if (selectedMultisig.label) {
        setSelectedLabelName(selectedMultisig.label)
      } else {
        setSelectedLabelName(shortenAddress(selectedMultisig.id.toBase58(), 4))
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

    if (!selectedMultisig || !multisigVaults || !multisigVaults.length || multisigSolBalance === undefined) { return; }
    
    const timeout = setTimeout(() => {
      let usdValue = 0;

      usdValue = (multisigSolBalance / LAMPORTS_PER_SOL) * getPricePerToken(NATIVE_SOL);
      const cumulative = new Array<any>();

      multisigVaults.forEach((item: any) => {
        const token = getTokenByMintAddress(item.mint.toBase58());

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
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    getPricePerToken,
    selectedMultisig,
    splTokenList,
    multisigVaults,
    multisigSolBalance,
    setTotalSafeBalance,
    getTokenByMintAddress
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
      value: renderSafeBalance ? renderSafeBalance : "--"
    },
    {
      name: "Deposit address",
      value: renderDepositAddress ? renderDepositAddress : "--"
    }
  ];

  // View assets
  const onGoToAccounts = () => {
    if (selectedMultisig) {
      navigate(`${ACCOUNTS_ROUTE_BASE_PATH}/${selectedMultisig.authority.toBase58()}/assets?account-type=multisig`);
    }
  }

  // Go to vesting
  const goToVesting = () => {
    if (selectedMultisig) {
      navigate(`${VESTING_ROUTE_BASE_PATH}/${selectedMultisig.authority.toBase58()}/contracts?account-type=multisig`);
    }
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

  return (
    <>
      <RightInfoDetails
        infoData={infoSafeData}
      /> 

      <Row gutter={[8, 8]} className="safe-btns-container mb-1">
        <Col xs={20} sm={18} md={20} lg={18} className="btn-group">
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            disabled={isTxInProgress()}
            onClick={onNewProposalMultisigClick}>
              <div className="btn-content">
                New proposal
              </div>
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
        (multisigSolBalance / LAMPORTS_PER_SOL) <= 0.005 ? (
          <Row gutter={[8, 8]}>
            <Col span={24} className="alert-info-message pr-6">
              <Alert message="SOL balance is very low in this safe. You'll need some if you want to make proposals." type="info" showIcon closable />
            </Col>
          </Row>
        ) : null
      )}

      <TabsMean
        tabs={tabs}
        selectedTab={selectedTab}
        defaultTab="proposals"
      />
    </>
  )
}