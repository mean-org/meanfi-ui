import { Col, Row } from 'antd';
import { useContext, useEffect, useState } from 'react';
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from 'src/app-constants/common';
import { AddressDisplay } from 'src/components/AddressDisplay';
import { AppStateContext } from 'src/contexts/appstate';
import { getSolanaExplorerClusterParam } from 'src/contexts/connection';
import { toUsCurrency } from 'src/middleware/ui';
import { getAmountWithSymbol } from 'src/middleware/utils';
import type { UserTokenAccount } from 'src/models/accounts';

const WalletAccountSummary = (props: { accountBalance?: number }) => {
  const { accountBalance } = props;

  const { splTokenList, selectedAccount, accountTokens, getTokenPriceByAddress } = useContext(AppStateContext);

  const [selectedAsset, setSelectedAsset] = useState<UserTokenAccount | undefined>(undefined);

  const renderNetworth = () => {
    if (accountBalance) {
      return toUsCurrency(accountBalance);
    }

    return '$0.00';
  };

  const renderBalance = () => {
    if (!selectedAsset) {
      return '$0.00';
    }

    const tokenPrice = getTokenPriceByAddress(selectedAsset.address, selectedAsset.symbol);

    if (tokenPrice > 0) {
      return selectedAsset.balance ? toUsCurrency((selectedAsset.balance || 0) * tokenPrice) : '$0.00';
    }

    return '$0.00';
  };

  // Process accountTokens from AppState to get a renderable list of tokens
  useEffect(() => {
    if (!accountTokens) {
      return;
    }

    const nativeAsset = accountTokens.find(t => t.publicAddress === selectedAccount.address);
    setSelectedAsset(nativeAsset);
  }, [selectedAccount.address, accountTokens]);

  return (
    <div className='accounts-category-meta'>
      {selectedAsset ? (
        <>
          <Row className='mb-2'>
            <Col span={14}>
              <div className='info-label'>Account address</div>
              <div className='transaction-detail-row'>
                <div className='info-data'>
                  <AddressDisplay
                    address={selectedAsset.publicAddress as string}
                    iconStyles={{ width: '16', height: '16' }}
                    newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${
                      selectedAsset.publicAddress
                    }${getSolanaExplorerClusterParam()}`}
                  />
                </div>
              </div>
            </Col>
            <Col span={10}>
              <div className='info-label'>Total account value</div>
              <div className='transaction-detail-row'>
                <span className='info-data'>{renderNetworth()}</span>
              </div>
            </Col>
          </Row>

          <Row className='mb-2'>
            <Col span={14}>
              <div className='info-label'>Native balance</div>
              <div className='transaction-detail-row'>
                <div className='info-data'>
                  {getAmountWithSymbol(
                    selectedAsset.balance ?? 0,
                    selectedAsset.address,
                    false,
                    splTokenList,
                    selectedAsset.decimals,
                  )}
                </div>
              </div>
            </Col>
            <Col span={10}>
              <div className='info-label'>Asset value</div>
              <div className='transaction-detail-row'>
                <span className='info-data'>{renderBalance()}</span>
              </div>
            </Col>
          </Row>
        </>
      ) : null}
    </div>
  );
};

export default WalletAccountSummary;
