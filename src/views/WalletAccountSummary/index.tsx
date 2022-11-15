import { Col, Row } from 'antd';
import { AddressDisplay } from 'components/AddressDisplay';
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from 'constants/common';
import { AppStateContext } from 'contexts/appstate';
import { getSolanaExplorerClusterParam } from 'contexts/connection';
import { consoleOut, toUsCurrency } from 'middleware/ui';
import { getAmountWithSymbol } from 'middleware/utils';
import { UserTokenAccount } from 'models/accounts';
import { useContext, useEffect, useState } from 'react';

const WalletAccountSummary = (props: {
  accountBalance?: number;
  onCtaClicked?: any;
}) => {
  const { accountBalance, onCtaClicked } = props;

  const {
    splTokenList,
    selectedAccount,
    userTokensResponse,
    getTokenPriceByAddress,
    getTokenPriceBySymbol,
  } = useContext(AppStateContext);

  const [selectedAsset, setSelectedAsset] = useState<
    UserTokenAccount | undefined
  >(undefined);

  const renderNetworth = () => {
    if (accountBalance) {
      return toUsCurrency(accountBalance);
    } else {
      return '$0.00';
    }
  };

  const renderBalance = () => {
    if (!selectedAsset) {
      return '$0.00';
    }

    const priceByAddress = getTokenPriceByAddress(selectedAsset.address);
    const tokenPrice =
      priceByAddress || getTokenPriceBySymbol(selectedAsset.symbol);

    if (tokenPrice > 0) {
      return selectedAsset.balance
        ? toUsCurrency((selectedAsset.balance || 0) * tokenPrice)
        : '$0.00';
    } else {
      return '$0.00';
    }
  };

  // Process userTokensResponse from AppState to get a renderable list of tokens
  useEffect(() => {
    if (userTokensResponse) {
      const nativeAsset = userTokensResponse.accountTokens.find(
        t => t.publicAddress === selectedAccount.address,
      );
      consoleOut('WalletAccountSummary nativeAsset:', nativeAsset, 'blue');
      setSelectedAsset(nativeAsset);
    }
  }, [selectedAccount.address, userTokensResponse]);

  return (
    <>
      <div className="accounts-category-meta">
        {selectedAsset ? (
          <>
            <Row className="mb-2">
              <Col span={14}>
                <div className="info-label">Account address</div>
                <div className="transaction-detail-row">
                  <div className="info-data">
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
                <div className="info-label">Total account value</div>
                <div className="transaction-detail-row">
                  <span className="info-data">{renderNetworth()}</span>
                </div>
              </Col>
            </Row>

            <Row className="mb-2">
              <Col span={14}>
                <div className="info-label">Native balance</div>
                <div className="transaction-detail-row">
                  <div className="info-data">
                    {getAmountWithSymbol(
                      selectedAsset.balance || 0,
                      selectedAsset.address,
                      false,
                      splTokenList,
                      selectedAsset.decimals,
                    )}
                  </div>
                </div>
                {/* <div className="info-extra font-size-85">
                                    <AddressDisplay
                                        address={selectedAsset.publicAddress as string}
                                        iconStyles={{ width: "16", height: "16" }}
                                        newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${selectedAsset.publicAddress}${getSolanaExplorerClusterParam()}`}
                                    />
                                </div> */}
              </Col>
              <Col span={10}>
                <div className="info-label">Asset value</div>
                <div className="transaction-detail-row">
                  <span className="info-data">{renderBalance()}</span>
                </div>
              </Col>
            </Row>
          </>
        ) : null}
      </div>
    </>
  );
};

export default WalletAccountSummary;
