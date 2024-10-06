import { InfoCircleOutlined } from '@ant-design/icons';
import { Image, Space, Tabs, Tooltip } from 'antd';
import type React from 'react';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { IconNoItems } from 'src/Icons'
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS, fallbackImgSrc } from 'src/app-constants/common';
import { AddressDisplay } from 'src/components/AddressDisplay';
import { InfoIcon } from 'src/components/InfoIcon';
import { useMintInfo } from 'src/contexts/accounts';
import { AppStateContext } from 'src/contexts/appstate';
import { getSolanaExplorerClusterParam } from 'src/contexts/connection';
import useWindowSize from 'src/hooks/useWindowResize';
import type { MeanNft } from 'src/models/accounts/NftTypes';
import { NftCreators } from './NftCreators';
import './style.scss';

export const NftDetails = (props: { selectedNft?: MeanNft }) => {
  const { selectedNft } = props;

  const { selectedAccount } = useContext(AppStateContext);

  const collectionAddress = selectedNft?.collection?.address;
  const collectionMintInfo = useMintInfo(collectionAddress);
  const { width: browserInnerWidth } = useWindowSize();
  const [shouldShortedAddresses, setShouldShortedAddresses] = useState<boolean>(false);

  const isVerifiedCollection = useMemo(() => {
    if (!selectedNft) {
      return false;
    }

    return selectedNft.collection?.verified && collectionMintInfo !== undefined;
  }, [collectionMintInfo, selectedNft]);

  const getEditionBody = (nft: MeanNft) => {
    if (!('edition' in nft)) return 'SFT';
    if (nft.edition.isOriginal) return 'Master Edition';
    return `Edition ${nft.edition.number.toNumber()}`;
  };

  const getEditionPill = () => {
    if (!selectedNft) {
      return null;
    }

    return (
      <span className='badge medium font-bold text-uppercase fg-white bg-purple'>{getEditionBody(selectedNft)}</span>
    );
  };

  const getVerifiedCollectionPill = () => {
    const onchainVerifiedToolTip =
      'This NFT has been verified as a member of an on-chain collection. This tag guarantees authenticity.';
    return (
      <Tooltip title={onchainVerifiedToolTip}>
        <span className='badge medium font-bold text-uppercase fg-white bg-purple'>Verified Collection</span>
      </Tooltip>
    );
  };

  const getIsMutablePill = (isMutable: boolean) => {
    return (
      <span className='badge medium font-bold text-uppercase fg-white bg-purple'>
        {isMutable ? 'Mutable' : 'Immutable'}
      </span>
    );
  };

  const getSaleTypePill = (hasPrimarySaleHappened: boolean) => {
    const primaryMarketTooltip = 'Creator(s) split 100% of the proceeds when this NFT is sold.';

    const secondaryMarketTooltip =
      'Creator(s) split the Seller Fee when this NFT is sold. The owner receives the remaining proceeds.';

    return (
      <Tooltip title={hasPrimarySaleHappened ? secondaryMarketTooltip : primaryMarketTooltip}>
        <span className='badge medium font-bold text-uppercase fg-white bg-purple'>
          {hasPrimarySaleHappened ? 'Secondary Market' : 'Primary Market'}
        </span>
      </Tooltip>
    );
  };

  const renderCreatorsAndRoyalties = useCallback(() => {
    if (!selectedNft) {
      return null;
    }

    return (
      <>
        <h3 className='nft-details-heading mb-2'>Creators and Royalties</h3>
        {infoRow(
          <>
            <span className='align-text-bottom'>Royalty</span>
            <InfoIcon
              placement='top'
              content={
                <span>
                  Royalties are shared to Creators at this rate if the asset is sold using Metaplex Auction program.
                </span>
              }
            >
              <InfoCircleOutlined />
            </InfoIcon>
          </>,
          `${selectedNft.sellerFeeBasisPoints / 100}%`,
        )}
        <NftCreators creators={selectedNft.creators} />
      </>
    );
  }, [selectedNft]);

  const renderAttributes = useCallback(() => {
    if (!selectedNft || !selectedNft.json) {
      return null;
    }

    return (
      <>
        <h3 className='nft-details-heading mb-2'>Attributes</h3>
        {selectedNft.json.attributes ? (
          <div className='nft-attributes-grid mb-2'>
            {selectedNft.json.attributes.map(attr => {
              if (!attr.trait_type || !attr.value) {
                return null;
              }
              return (
                <div key={`${attr.trait_type}${attr.value}`} className='nft-attribute'>
                  <div className='nft-attribute-name'>{attr.trait_type}</div>
                  <div className='nft-attribute-value'>{attr.value}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <span>No attributes found</span>
        )}
      </>
    );
  }, [selectedNft]);

  const infoRow = (label: React.ReactNode, content: React.ReactNode) => {
    return (
      <div className='info-row-layout mb-2'>
        <div className='left fg-secondary-60'>{label}</div>
        <div className='right fg-secondary-60'>{content}</div>
      </div>
    );
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: Deps managed manually
  const renderProfile = useCallback(() => {
    if (!selectedNft || !selectedNft.mint) {
      return null;
    }

    return (
      <>
        <h3 className='nft-details-heading mb-2'>NFT Token Profile</h3>
        {infoRow(
          <span className='align-text-bottom'>Token address</span>,
          <AddressDisplay
            address={selectedNft.address.toBase58()}
            maxChars={shouldShortedAddresses ? 12 : undefined}
            showFullAddress={shouldShortedAddresses}
            iconStyles={{ width: '15', height: '15' }}
            newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${selectedNft.address.toBase58()}${getSolanaExplorerClusterParam()}`}
          />,
        )}
        {selectedNft.mint.mintAuthorityAddress
          ? infoRow(
            <>
              <span className='align-text-bottom'>Mint Authority</span>
              <InfoIcon placement='top' content={<span>Account permitted to mint this token.</span>}>
                <InfoCircleOutlined />
              </InfoIcon>
            </>,
            <AddressDisplay
              address={selectedNft.mint.mintAuthorityAddress.toBase58()}
              maxChars={shouldShortedAddresses ? 12 : undefined}
              showFullAddress={shouldShortedAddresses}
              iconStyles={{ width: '15', height: '15' }}
              newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${selectedNft.mint.mintAuthorityAddress.toBase58()}${getSolanaExplorerClusterParam()}`}
            />,
          )
          : null}
        {selectedNft.updateAuthorityAddress
          ? infoRow(
            <>
              <span className='align-text-bottom'>Update Authority</span>
              <InfoIcon
                placement='top'
                content={<span>Account permitted to issue update requests for this token's information.</span>}
              >
                <InfoCircleOutlined />
              </InfoIcon>
            </>,
            <AddressDisplay
              address={selectedNft.updateAuthorityAddress.toBase58()}
              maxChars={shouldShortedAddresses ? 12 : undefined}
              showFullAddress={shouldShortedAddresses}
              iconStyles={{ width: '15', height: '15' }}
              newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${selectedNft.updateAuthorityAddress.toBase58()}${getSolanaExplorerClusterParam()}`}
            />,
          )
          : null}
        {selectedAccount
          ? infoRow(
            <>
              <span className='align-text-bottom'>Current Owner</span>
              <InfoIcon placement='top' content={<span>The owner of this token!</span>}>
                <InfoCircleOutlined />
              </InfoIcon>
            </>,
            <AddressDisplay
              address={selectedAccount.address}
              maxChars={shouldShortedAddresses ? 12 : undefined}
              showFullAddress={shouldShortedAddresses}
              iconStyles={{ width: '15', height: '15' }}
              newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${selectedAccount.address
                }${getSolanaExplorerClusterParam()}`}
            />,
          )
          : null}
      </>
    );
  }, [selectedAccount, selectedNft, shouldShortedAddresses]);

  const renderTabset = useCallback(() => {
    const items = [];
    items.push({
      key: 'profile',
      label: 'Profile',
      children: renderProfile(),
    });
    items.push({
      key: 'creators',
      label: 'Creators',
      children: renderCreatorsAndRoyalties(),
    });
    items.push({
      key: 'attributes',
      label: 'Attributes',
      children: renderAttributes(),
    });

    return <Tabs items={items} className='neutral' />;
  }, [renderAttributes, renderCreatorsAndRoyalties, renderProfile]);

  useEffect(() => {
    if (browserInnerWidth < 410) {
      setShouldShortedAddresses(true);
    } else {
      setShouldShortedAddresses(false);
    }
  }, [browserInnerWidth]);

  if (!selectedNft) {
    return null;
  }

  return (
    <div className='nft-details'>
      <div className='flexible-column-bottom vertical-scroll'>
        {selectedNft.json ? (
          <>
            <div className='top'>
              <div className='nft-header-layout'>
                <div className='left'>
                  <div className='nft-item'>
                    {selectedNft.json.image ? (
                      <Image
                        className='nft-image'
                        src={selectedNft.json.image || fallbackImgSrc}
                        fallback={fallbackImgSrc}
                        alt={selectedNft.json.name}
                      />
                    ) : (
                      <Image className='nft-image' src={fallbackImgSrc} alt='No image description. Metadata not loaded' />
                    )}
                  </div>
                </div>
                <div className='right'>
                  <h3 className='nft-details-heading'>NFT Overview</h3>
                  <div className='font-size-100 font-bold mb-1'>
                    <span>{selectedNft.name || 'No NFT name found'}</span>
                    {selectedNft.json.symbol ? <span className='ml-1'>({selectedNft.json.symbol})</span> : null}
                  </div>

                  <div className='font-size-100 mb-2'>
                    <Space size='small' align='center' wrap>
                      {getEditionPill()}
                      {isVerifiedCollection ? getVerifiedCollectionPill() : null}
                      {getIsMutablePill(selectedNft.isMutable)}
                      {getSaleTypePill(selectedNft.primarySaleHappened)}
                    </Space>
                  </div>

                  <h3 className='nft-details-heading'>Description</h3>
                  <p className='mr-2'>{selectedNft.json.description || 'No description in metadata'}</p>
                </div>
              </div>
            </div>
            <div className='bottom'>
              <div className='transaction-list-data-wrapper'>
                {/* CTAs row */}
                {/* Tabset */}
                {renderTabset()}
              </div>
            </div>
          </>
        ) : (
          <div className='flex-column flex-center justify-content-center h-100'>
            <IconNoItems className='mean-svg-icons fg-secondary-50' style={{ width: 50, height: 50 }} />
            <div className='font-size-120 font-bold fg-secondary-75 mt-2 mb-2'>No NFT metadata found</div>
            <div className='font-size-110 fg-secondary-50 mb-3'>There was a problem loading the metadata for this NFT.</div>
          </div>)}
      </div>
    </div>
  );
};
