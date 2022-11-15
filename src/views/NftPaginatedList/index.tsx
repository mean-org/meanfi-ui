import { CheckOutlined } from '@ant-design/icons';
import {
  FindNftsByOwnerOutput,
  Metaplex,
  Nft,
  NftWithToken,
  Sft,
  SftWithToken,
} from '@metaplex-foundation/js';
import { Connection } from '@solana/web3.js';
import { Spin } from 'antd';
import { fallbackImgSrc } from 'constants/common';
import { IconArrowBack, IconArrowForward } from 'Icons';
import { useCallback, useEffect, useMemo, useState } from 'react';

const pageSize = 4;

export const NftPaginatedList = (props: {
  presetNftMint: string | undefined;
  connection: Connection;
  nftList: FindNftsByOwnerOutput;
  onNftItemClick?: any;
  selectedNft: Nft | Sft | SftWithToken | NftWithToken | undefined;
}) => {
  const { presetNftMint, connection, nftList, onNftItemClick, selectedNft } =
    props;

  const [loading, setLoading] = useState(false);
  const [shouldPresetItem, setShouldPresetItem] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number | undefined>(undefined);
  const [currentView, setCurrentView] = useState<
    (Nft | Sft | SftWithToken | NftWithToken)[] | null
  >(null);

  const mx = useMemo(() => new Metaplex(connection), [connection]);

  const loadData = useCallback(
    async (startIndex: number, endIndex: number) => {
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
        const item = nfts.find(i => i.address.toBase58() === presetNftMint);
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
      if (!currentPage && nftList.length > 0) {
        setCurrentPage(1);
      }
      return;
    }

    // Find nft given by presetNftMint in nftList
    // Calculate and set page number
    const itemIndex = nftList.findIndex(
      (n: any) => n.mintAddress.toBase58() === presetNftMint,
    );
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
                className={`flat-button tiny${
                  currentPage === 1 ? ' disabled' : ''
                }`}
                onClick={() => changeCurrentPage('prev')}
              >
                <IconArrowBack className="mean-svg-icons" />
                <span className="ml-1">Prev Page</span>
              </span>
              <span
                className={`flat-button tiny${
                  nftList && nftList.length / pageSize <= (currentPage || 1)
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
