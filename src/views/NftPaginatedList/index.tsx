import { CheckOutlined, LoadingOutlined } from '@ant-design/icons';
import {
  FindNftsByOwnerOutput,
  Metaplex,
} from '@metaplex-foundation/js';
import { Connection } from '@solana/web3.js';
import { Button, Spin } from 'antd';
import { fallbackImgSrc } from 'constants/common';
import { IconArrowBack, IconArrowForward, IconExternalLink, IconNoItems } from 'Icons';
import { openLinkInNewTab } from 'middleware/utils';
import { MeanNft } from 'models/accounts/NftTypes';
import { useCallback, useEffect, useMemo, useState } from 'react';

const loadIndicator = <LoadingOutlined style={{ fontSize: 48 }} spin />;
const pageSize = 4;

export const NftPaginatedList = (props: {
  connection: Connection;
  loadingTokenAccounts: boolean;
  nftList: FindNftsByOwnerOutput | undefined;
  onNftItemClick?: any;
  presetNftMint: string | undefined;
  selectedNft: MeanNft | undefined;
  tokensLoaded: boolean;
}) => {
  const {
    connection,
    loadingTokenAccounts,
    nftList,
    onNftItemClick,
    presetNftMint,
    selectedNft,
    tokensLoaded,
  } = props;

  const [loading, setLoading] = useState(false);
  const [shouldPresetItem, setShouldPresetItem] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number | undefined>(undefined);
  const [currentView, setCurrentView] = useState<
    (MeanNft)[] | null
  >(null);

  const mx = useMemo(() => new Metaplex(connection), [connection]);

  const loadData = useCallback(
    async (startIndex: number, endIndex: number) => {
      if (!nftList) {
        return null;
      }

      const nftsToLoad = nftList.filter(
        (_, index) => index >= startIndex && index < endIndex,
      );

      const promises = nftsToLoad.map((metadata: any) =>
        mx.nfts().load({ metadata }),
      );
      return Promise.all(promises);
    },
    [mx, nftList],
  );

  const calculatePageNumber = (pageSize: number, itemIndex: number) => {
    return Math.ceil(++itemIndex / pageSize);
  };

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
        const item = nfts
          ? nfts.find(i => i.address.toBase58() === presetNftMint)
          : undefined;
        if (item) {
          onNftItemClick(item);
        }
      }
      setCurrentView(nfts);
      setLoading(false);
    };

    setLoading(true);
    execute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, nftList, presetNftMint, shouldPresetItem]);

  useEffect(() => {
    if (!presetNftMint || !shouldPresetItem) {
      if (!currentPage && nftList && nftList.length > 0) {
        setCurrentPage(1);
      }
      return;
    }

    // Find nft given by presetNftMint in nftList
    // Calculate and set page number
    const itemIndex = nftList
      ? nftList.findIndex((n: any) => n.mintAddress.toBase58() === presetNftMint)
      : -1;
    if (itemIndex !== -1) {
      const pageNumber = calculatePageNumber(pageSize, itemIndex);
      setCurrentPage(pageNumber);
    } else {
      setCurrentPage(1);
    }
  }, [currentPage, nftList, presetNftMint, shouldPresetItem]);

  const changeCurrentPage = (operation: string) => {
    setLoading(true);
    if (operation === 'next') {
      setCurrentPage(prevValue => (prevValue || 1) + 1);
    } else {
      setCurrentPage(prevValue =>
        (prevValue || 1) > 1 ? (prevValue || 1) - 1 : 1,
      );
    }
  };

  const imageOnErrorHandler = (
    event: React.SyntheticEvent<HTMLImageElement, Event>,
  ) => (event.currentTarget.src = fallbackImgSrc);

  const renderLoadingOrNoNftsMessage = () => {
    if (loadingTokenAccounts) {
      return (
        <div className="flex flex-center">
          <Spin indicator={loadIndicator} />
        </div>
      );
    } else if (tokensLoaded) {
      return (
        <div className="flex-column flex-center justify-content-center h-100">
          <IconNoItems
            className="mean-svg-icons fg-secondary-50"
            style={{ width: 50, height: 50 }}
          />
          <div className="font-size-120 font-bold fg-secondary-75 mt-2 mb-2">
            No NFTs
          </div>
          <div className="font-size-110 fg-secondary-50 mb-3">
            Get started with your first NFT
          </div>
          <div className="text-center">
            <Button
              type="default"
              shape="round"
              size="small"
              className="thin-stroke"
              onClick={() => openLinkInNewTab('https://magiceden.io/')}
            >
              <span className="mr-1">Browse Magic Eden</span>
              <IconExternalLink
                className="mean-svg-icons fg-secondary-70"
                style={{ width: 22, height: 22 }}
              />
            </Button>
          </div>
        </div>
      );
    } else {
      return null;
    }
  };

  if (!nftList || nftList.length === 0) {
    return (
      <div
        key="asset-category-nft-items"
        className="asset-category flex-column h-75"
      >
        {renderLoadingOrNoNftsMessage()}
      </div>
    );
  }

  return (
    <>
      <div
        key="asset-category-nft-items"
        className={`asset-category flex-column${loading ? ' h-75' : ''}`}
      >
        <Spin spinning={loading}>
          {currentView && (
            <div className="nft-pagination">
              <span
                className={`flat-button tiny${currentPage === 1 ? ' disabled' : ''
                  }`}
                onClick={() => changeCurrentPage('prev')}
              >
                <IconArrowBack className="mean-svg-icons" />
                <span className="ml-1">Prev Page</span>
              </span>
              <span
                className={`flat-button tiny${nftList && nftList.length / pageSize <= (currentPage || 1)
                    ? ' disabled'
                    : ''
                  }`}
                onClick={() => changeCurrentPage('next')}
              >
                <span className="mr-1">Next Page</span>
                <IconArrowForward className="mean-svg-icons" />
              </span>
            </div>
          )}
          {currentView && (
            <div className="nft-grid">
              {currentView.map((nft, index) => {
                const isSelected =
                  selectedNft && selectedNft.address.equals(nft.address);
                return (
                  <div
                    key={`nft-${index}`}
                    className={`nft-grid-item${isSelected ? ' selected' : ''}`}
                  >
                    {isSelected ? (
                      <span className="checkmark">
                        <CheckOutlined />
                      </span>
                    ) : null}
                    <div className="nft-title text-shadow">{nft.name}</div>
                    <img
                      className="nft-image"
                      src={nft.json?.image || fallbackImgSrc}
                      onError={imageOnErrorHandler}
                      alt={nft.json?.name}
                      onClick={() => onNftItemClick(nft)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </Spin>
      </div>
    </>
  );
};
