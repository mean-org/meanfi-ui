import type { MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { IconLoading, IconVerticalEllipsis } from 'Icons';
import { Alert, Button, Col, Dropdown, Row, Space, Tabs, type TabsProps, Tooltip } from 'antd';
import type { ItemType, MenuItemType } from 'antd/lib/menu/interface';
import { MIN_SOL_BALANCE_REQUIRED } from 'app-constants/common';
import { NATIVE_SOL } from 'app-constants/tokens';
import { CopyExtLinkGroup } from 'components/CopyExtLinkGroup';
import CopyMultisigIdModal from 'components/CopyMultisigIdModal';
import { MultisigOwnersView } from 'components/MultisigOwnersView';
import { RightInfoDetails } from 'components/RightInfoDetails';
import { SolBalanceModal } from 'components/SolBalanceModal';
import { useNativeAccount } from 'contexts/accounts';
import { AppStateContext } from 'contexts/appstate';
import { consoleOut, toUsCurrency } from 'middleware/ui';
import { getAmountFromLamports, shortenAddress } from 'middleware/utils';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';

export const SafeInfo = (props: {
  onEditMultisigClick?: () => void;
  onNewProposalClicked?: () => void;
  proposalsTabContent?: {
    id: string;
    name: string;
    render: JSX.Element;
  };
  totalSafeBalance?: number;
  safeNameImg?: string;
  safeNameImgAlt?: string;
  selectedMultisig?: MultisigInfo;
  selectedTab?: string;
  tabs?: TabsProps['items'];
}) => {
  const {
    onEditMultisigClick,
    onNewProposalClicked,
    proposalsTabContent,
    totalSafeBalance,
    safeNameImg,
    safeNameImgAlt,
    selectedMultisig,
    selectedTab,
    tabs,
  } = props;
  const { t } = useTranslation('common');
  const { multisigVaults, selectedAccount, multisigSolBalance, refreshTokenBalance, setActiveTab } =
    useContext(AppStateContext);
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
  const hideSolBalanceModal = useCallback(() => setIsSolBalanceModalOpen(false), []);
  const showSolBalanceModal = useCallback(() => setIsSolBalanceModalOpen(true), []);

  // Copy Multisig ID Modal
  const [isCopyMultisigIdModalOpen, setIsCopyMultisigIdModalOpen] = useState(false);
  const hideCopyMultisigIdModal = useCallback(() => setIsCopyMultisigIdModalOpen(false), []);
  const showCopyMultisigIdModal = useCallback(() => setIsCopyMultisigIdModalOpen(true), []);

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
    <Row className='d-flex align-items-center'>
      {safeNameImg && safeNameImgAlt && (
        <Tooltip placement='rightTop' title='Serum Multisig'>
          <img src={safeNameImg} alt={safeNameImgAlt} width={16} height={16} className='simplelink mr-1' />
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
        label='view'
        className='ml-1'
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
        <IconLoading className='mean-svg-icons' style={{ height: '15px', lineHeight: '15px' }} />
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
      value: selectedMultisig ? `${selectedMultisig.threshold}/${selectedMultisig.owners.length} signatures` : '--',
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
    const items: TabsProps['items'] = [];
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

    return <Tabs items={items} activeKey={selectedTab} onChange={onTabChanged} className='neutral' />;
  }, [onTabChanged, proposalsTabContent, selectedTab]);

  const renderTabset = () => {
    if (tabs && tabs.length > 0) {
      return <Tabs items={tabs} activeKey={selectedTab} onChange={onTabChanged} className='neutral' />;
    }

    return getSafeTabs();
  };

  const getCtaRowMenuItems = () => {
    const items: ItemType<MenuItemType>[] = [];
    items.push({
      key: 'cta-row-dropdown-item-01',
      label: (
        <span className='menu-item-text' onClick={showCopyMultisigIdModal} onKeyDown={() => {}}>
          {t('multisig.copy-multisig-id.cta-label')}
        </span>
      ),
    });

    return { items };
  };

  const renderCtaRow = () => {
    return (
      <div className='flex-fixed-right cta-row mb-3'>
        <Space className='left' size='middle' wrap>
          <Button type='primary' shape='round' size='small' className='thin-stroke' onClick={onNewProposalClicked}>
            New proposal
          </Button>
          <Button type='primary' shape='round' size='small' className='thin-stroke' onClick={onEditMultisigClick}>
            Edit safe
          </Button>
        </Space>
        <Dropdown menu={getCtaRowMenuItems()} placement='bottomRight' trigger={['click']}>
          <span className='icon-button-container'>
            <Button
              type='default'
              shape='circle'
              size='middle'
              icon={<IconVerticalEllipsis className='mean-svg-icons' />}
              onClick={e => e.preventDefault()}
            />
          </span>
        </Dropdown>
      </div>
    );
  };

  return (
    <>
      <RightInfoDetails infoData={infoSafeData} />

      {renderCtaRow()}

      {multisigSolBalance !== undefined &&
        (multisigSolBalance / LAMPORTS_PER_SOL <= MIN_SOL_BALANCE_REQUIRED ? (
          <Row gutter={[8, 8]} className='mr-0 ml-0'>
            <Col span={24} className='alert-info-message pr-6 simplelink' onClick={showSolBalanceModal}>
              <Alert
                message='SOL account balance is very low in the safe. Click here to add more SOL.'
                type='info'
                showIcon
              />
            </Col>
          </Row>
        ) : null)}

      {renderTabset()}

      {isSolBalanceModalOpen ? (
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
      ) : null}
      {isCopyMultisigIdModalOpen && selectedMultisig ? (
        <CopyMultisigIdModal
          isOpen={isCopyMultisigIdModalOpen}
          multisigAddress={selectedMultisig.id.toBase58()}
          handleClose={hideCopyMultisigIdModal}
        />
      ) : null}
    </>
  );
};
