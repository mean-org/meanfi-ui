import { CheckOutlined, LoadingOutlined } from '@ant-design/icons';
import type { FindNftsByOwnerOutput, JsonMetadata, Metadata } from '@metaplex-foundation/js';
import { PublicKey } from '@solana/web3.js';
import { Button, Spin } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { IconArrowBack, IconArrowForward, IconExternalLink, IconNoItems } from 'src/Icons';
import { fallbackImgSrc } from 'src/app-constants/common';
import { openLinkInNewTab } from 'src/middleware/utils';
import type { MeanNft } from 'src/models/accounts/NftTypes';

const loadIndicator = <LoadingOutlined style={{ fontSize: 48 }} spin />;
const pageSize = 4;

interface Props {
  loadingUserAssets: boolean;
  nftList: FindNftsByOwnerOutput | undefined;
  onNftItemClick?: (item: MeanNft) => void;
  presetNftMint: string | undefined;
  selectedNft: MeanNft | undefined;
}

export const NftPaginatedList = ({ loadingUserAssets, nftList, onNftItemClick, presetNftMint, selectedNft }: Props) => {
  const [loading, setLoading] = useState(false);
  const [shouldPresetItem, setShouldPresetItem] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number | undefined>(undefined);
  const [currentView, setCurrentView] = useState<MeanNft[] | null>(null);

  const loadData = useCallback(
    async (startIndex: number, endIndex: number) => {
      if (!nftList) {
        return null;
      }

      const nftsToLoad = nftList.filter((_, index) => index >= startIndex && index < endIndex);

      return await Promise.all(
        nftsToLoad.map(async nft => {
          try {
            const fetchResult = await fetch(nft.uri);
            const metadata = (await fetchResult.json()) as JsonMetadata;
            const serialized = JSON.stringify(nft);
            const refueled = JSON.parse(serialized);
            refueled.json = metadata;
            refueled.address = new PublicKey((nft as Metadata).address);
            refueled.mint = new PublicKey((nft as Metadata).mintAddress);
            refueled.mintAddress = new PublicKey((nft as Metadata).mintAddress);
            refueled.updateAuthorityAddress = new PublicKey((nft as Metadata).updateAuthorityAddress);
            refueled.creators = nft.creators;
            return refueled as MeanNft;
          } catch (error) {
            console.error('Error fetching NFT metadata:', error);
            return nft as MeanNft;
          }
        }),
      );
    },
    [nftList],
  );

  const calculatePageNumber = useCallback((pageSize: number, itemIndex: number) => {
    const nextIndex = itemIndex + 1;
    return Math.ceil(nextIndex / pageSize);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Deps managed manually
  useEffect(() => {
    if (!nftList || currentPage === undefined) {
      return;
    }

    const execute = async () => {
      const startIndex = (currentPage - 1) * pageSize;
      const endIndex = currentPage * pageSize;
      const nfts = await loadData(startIndex, endIndex);
      console.log('nfts:', nfts);
      if (shouldPresetItem && presetNftMint) {
        setShouldPresetItem(false);
        const item = nfts ? nfts.find(i => i.address.toBase58() === presetNftMint) : undefined;
        if (item) {
          onNftItemClick?.(item);
        }
      }
      setCurrentView(nfts);
      console.log('nfts:', nfts);
      setLoading(false);
    };

    setLoading(true);
    execute();
  }, [currentPage, nftList, presetNftMint, shouldPresetItem]);

  useEffect(() => {
    if (!presetNftMint || !shouldPresetItem) {
      if (!currentPage && nftList && nftList.length > 0) {
        setCurrentPage(1);
      }
      return;
    }

    // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
    const itemIndex = nftList ? nftList.findIndex((n: any) => n.mintAddress.toBase58() === presetNftMint) : -1;
    if (itemIndex !== -1) {
      const pageNumber = calculatePageNumber(pageSize, itemIndex);
      setCurrentPage(pageNumber);
    } else {
      setCurrentPage(1);
    }
  }, [currentPage, nftList, presetNftMint, shouldPresetItem, calculatePageNumber]);

  const changeCurrentPage = (operation: string) => {
    setLoading(true);
    if (operation === 'next') {
      setCurrentPage(prevValue => (prevValue || 1) + 1);
    } else {
      setCurrentPage(prevValue => ((prevValue || 1) > 1 ? (prevValue || 1) - 1 : 1));
    }
  };

  const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    event.currentTarget.src = fallbackImgSrc;
  };

  const renderLoadingOrNoNftsMessage = () => {
    if (loadingUserAssets) {
      return (
        <div className='flex flex-center'>
          <Spin indicator={loadIndicator} />
        </div>
      );
    }

    return (
      <div className='flex-column flex-center justify-content-center h-100'>
        <IconNoItems className='mean-svg-icons fg-secondary-50' style={{ width: 50, height: 50 }} />
        <div className='font-size-120 font-bold fg-secondary-75 mt-2 mb-2'>No NFTs</div>
        <div className='font-size-110 fg-secondary-50 mb-3'>Get started with your first NFT</div>
        <div className='text-center'>
          <Button
            type='default'
            shape='round'
            size='small'
            className='thin-stroke'
            onClick={() => openLinkInNewTab('https://magiceden.io/')}
          >
            <span className='mr-1'>Browse Magic Eden</span>
            <IconExternalLink className='mean-svg-icons fg-secondary-70' style={{ width: 22, height: 22 }} />
          </Button>
        </div>
      </div>
    );
  };

  if (!nftList || nftList.length === 0) {
    return (
      <div key='asset-category-nft-items' className='asset-category flex-column h-75'>
        {renderLoadingOrNoNftsMessage()}
      </div>
    );
  }

  return (
    <div key='asset-category-nft-items' className={`asset-category flex-column${loading ? ' h-75' : ''}`}>
      <Spin spinning={loading}>
        {currentView ? (
          <div className='nft-pagination'>
            <span
              className={`flat-button tiny${currentPage === 1 ? ' disabled' : ''}`}
              onKeyDown={() => changeCurrentPage('prev')}
              onClick={() => changeCurrentPage('prev')}
            >
              <IconArrowBack className='mean-svg-icons' />
              <span className='ml-1'>Prev Page</span>
            </span>
            <span
              className={`flat-button tiny${
                nftList && nftList.length / pageSize <= (currentPage || 1) ? ' disabled' : ''
              }`}
              onKeyDown={() => changeCurrentPage('next')}
              onClick={() => changeCurrentPage('next')}
            >
              <span className='mr-1'>Next Page</span>
              <IconArrowForward className='mean-svg-icons' />
            </span>
          </div>
        ) : null}
        {currentView && (
          <div className='nft-grid'>
            {currentView.map((nft, index) => {
              const isSelected = selectedNft?.address.equals(nft.address);
              return (
                <div key={`nft-${index}`} className={`nft-grid-item${isSelected ? ' selected' : ''}`}>
                  {isSelected ? (
                    <span className='checkmark'>
                      <CheckOutlined />
                    </span>
                  ) : null}
                  <div className='nft-title text-shadow'>{nft.name}</div>
                  <img
                    className='nft-image'
                    src={nft.json?.image || fallbackImgSrc}
                    onError={imageOnErrorHandler}
                    alt={nft.json?.name}
                    onKeyDown={() => {}}
                    onClick={() => onNftItemClick?.(nft)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </Spin>
    </div>
  );
};
