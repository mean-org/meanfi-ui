import { MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Alert, Button, Col, Row, Space, Tabs, Tooltip } from 'antd';
import { CopyExtLinkGroup } from 'components/CopyExtLinkGroup';
import { MultisigOwnersView } from 'components/MultisigOwnersView';
import { RightInfoDetails } from 'components/RightInfoDetails';
import { SolBalanceModal } from 'components/SolBalanceModal';
import { MIN_SOL_BALANCE_REQUIRED } from 'constants/common';
import { NATIVE_SOL } from 'constants/tokens';
import { useNativeAccount } from 'contexts/accounts';
import { AppStateContext } from 'contexts/appstate';
import { IconLoading } from 'Icons';
import { consoleOut, toUsCurrency } from 'middleware/ui';
import { getAmountFromLamports, shortenAddress } from 'middleware/utils';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

export const SafeInfo = (props: {
  onEditMultisigClick?: any;
  onNewProposalClicked?: any;
  programsTabContent?: any;
  proposalsTabContent?: any;
  totalSafeBalance?: number;
  safeNameImg?: string;
  safeNameImgAlt?: string;
  selectedMultisig?: MultisigInfo;
  selectedTab?: any;
  tabs?: Array<any>;
}) => {
  const {
    onEditMultisigClick,
    onNewProposalClicked,
    programsTabContent,
    proposalsTabContent,
    totalSafeBalance,
    safeNameImg,
    safeNameImgAlt,
    selectedMultisig,
    selectedTab,
    tabs,
  } = props;
  const {
    multisigVaults,
    selectedAccount,
    multisigSolBalance,
    refreshTokenBalance,
    setActiveTab,
  } = useContext(AppStateContext);
  const { address } = useParams();
  const { account } = useNativeAccount();
  const [, setSearchParams] = useSearchParams();
  const [selectedLabelName, setSelectedLabelName] = useState('');
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);

  ////////////////
  ///  MODALS  ///
  ////////////////

  // SOL Balance Modal
  const [isSolBalanceModalOpen, setIsSolBalanceModalOpen] = useState(false);
  const hideSolBalanceModal = useCallback(
    () => setIsSolBalanceModalOpen(false),
    [],
  );
  const showSolBalanceModal = useCallback(
    () => setIsSolBalanceModalOpen(true),
    [],
  );

  // Keep account balance updated
  useEffect(() => {
    if (account?.lamports !== previousBalance || !nativeBalance) {
      // Refresh token balance
      refreshTokenBalance();
      setNativeBalance(getAmountFromLamports(account?.lamports));
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [account, nativeBalance, previousBalance, refreshTokenBalance]);

  // Safe Name
  useEffect(() => {
    if (selectedMultisig) {
      if (selectedMultisig.label) {
        setSelectedLabelName(selectedMultisig.label);
      } else {
        setSelectedLabelName(shortenAddress(selectedMultisig.id, 4));
      }
    }
  }, [selectedMultisig]);

  const renderSafeName = (
    <Row className="d-flex align-items-center">
      {safeNameImg && safeNameImgAlt && (
        <Tooltip placement="rightTop" title="Serum Multisig">
          <img
            src={safeNameImg}
            alt={safeNameImgAlt}
            width={16}
            height={16}
            className="simplelink mr-1"
          />
        </Tooltip>
      )}
      <div>{selectedLabelName}</div>
    </Row>
  );

  // Security
  const renderSecurity = (
    <>
      <span>Security</span>
      <MultisigOwnersView
        label="view"
        className="ml-1"
        participants={selectedMultisig ? selectedMultisig.owners : []}
      />
    </>
  );

  // Safe Balance
  const [assetsAmout, setAssetsAmount] = useState<string>();

  // Show amount of assets
  useEffect(() => {
    selectedMultisig &&
      (multisigVaults && multisigVaults.length > 0
        ? multisigVaults.length > 1
          ? setAssetsAmount(`(${multisigVaults.length} assets)`)
          : setAssetsAmount(`(${multisigVaults.length} asset)`)
        : setAssetsAmount('(0 assets)'));
  }, [multisigVaults, selectedMultisig]);

  const renderSafeBalance =
    totalSafeBalance === undefined ? (
      <>
        <IconLoading
          className="mean-svg-icons"
          style={{ height: '15px', lineHeight: '15px' }}
        />
      </>
    ) : totalSafeBalance === 0 ? (
      <>$0.00</>
    ) : (
      <>{toUsCurrency(totalSafeBalance)}</>
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
      name: 'Safe name',
      value: renderSafeName ? renderSafeName : '--',
    },
    {
      name: renderSecurity,
      value: selectedMultisig
        ? `${selectedMultisig.threshold}/${selectedMultisig.owners.length} signatures`
        : '--',
    },
    {
      name: `Safe balance ${assetsAmout}`,
      value: renderSafeBalance,
    },
    {
      name: 'Deposit address',
      value: renderDepositAddress ? renderDepositAddress : '--',
    },
  ];

  const onTabChanged = useCallback(
    (tab: string) => {
      consoleOut('Setting tab to:', tab, 'blue');
      setActiveTab(tab);
      setSearchParams({ v: tab as string });
    },
    [setActiveTab, setSearchParams],
  );

  const getSafeTabs = useCallback(() => {
    const items = [];
    if (proposalsTabContent) {
      items.push({
        key: proposalsTabContent.id,
        label: proposalsTabContent.name,
        children: proposalsTabContent.render,
      });
    } else {
      items.push({
        key: 'proposals',
        label: 'Proposals',
        children: 'Loading...',
      });
    }
    if (programsTabContent) {
      items.push({
        key: programsTabContent.id,
        label: programsTabContent.name,
        children: programsTabContent.render,
      });
    } else {
      items.push({
        key: 'programs',
        label: 'Programs',
        children: 'Loading...',
      });
    }

    return (
      <Tabs
        items={items}
        activeKey={selectedTab}
        onChange={onTabChanged}
        className="neutral"
      />
    );
  }, [onTabChanged, programsTabContent, proposalsTabContent, selectedTab]);

  const renderTabset = () => {
    if (tabs && tabs.length > 0) {
      return (
        <Tabs
          items={tabs}
          activeKey={selectedTab}
          onChange={onTabChanged}
          className="neutral"
        />
      );
    } else {
      return getSafeTabs();
    }
  };

  return (
    <>
      <RightInfoDetails infoData={infoSafeData} />

      <div className="flex-fixed-right cta-row mb-2">
        <Space className="left" size="middle" wrap>
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            onClick={onNewProposalClicked}
          >
            New proposal
          </Button>
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            onClick={() => onEditMultisigClick()}
          >
            Edit safe
          </Button>
        </Space>
      </div>

      {multisigSolBalance !== undefined &&
        (multisigSolBalance / LAMPORTS_PER_SOL <= MIN_SOL_BALANCE_REQUIRED ? (
          <Row gutter={[8, 8]} className="mr-0 ml-0">
            <Col
              span={24}
              className="alert-info-message pr-6 simplelink"
              onClick={showSolBalanceModal}
            >
              <Alert
                message="SOL account balance is very low in the safe. Click here to add more SOL."
                type="info"
                showIcon
              />
            </Col>
          </Row>
        ) : null)}

      {renderTabset()}

      {isSolBalanceModalOpen && (
        <SolBalanceModal
          address={NATIVE_SOL.address || ''}
          accountAddress={selectedAccount.address}
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
  );
};
