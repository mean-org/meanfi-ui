import { InfoCircleOutlined } from "@ant-design/icons";
import { Nft, NftWithToken, Sft, SftWithToken } from "@metaplex-foundation/js";
import { Image, Space, Tooltip } from "antd";
import { InfoIcon } from "components/InfoIcon";
import { fallbackImgSrc } from "constants/common";
import { useMint } from "contexts/accounts";
import React, { useMemo } from "react";
import { NftCreatorsPopover } from "./NftCreatorsPopover";

export const NftDetails = (props: {
    selectedNft: Nft | Sft | SftWithToken | NftWithToken;
}) => {

    const {
        selectedNft,
    } = props;

    const collectionAddress = selectedNft.collection?.address;
    const collectionMintInfo = useMint(collectionAddress);

    const isVerifiedCollection = useMemo(() => {
        if (!selectedNft) { return false; }

        return selectedNft.collection != null &&
        selectedNft.collection.verified &&
        collectionMintInfo !== undefined;
    }, [collectionMintInfo, selectedNft]);

    const isMasterEdition = () => {
        if (!selectedNft) {
            return false;
        }
        const edition = (selectedNft as Nft).edition;
        return edition.isOriginal;
    }

    const getEditionNumber = () => {
        if (!selectedNft) {
            return '--';
        }

        const edition = (selectedNft as Nft).edition;
        if (!edition.isOriginal) {
            return edition.number.toNumber();
        }
        return '--';
    }

    const getEditionPill = () => {
        if (isMasterEdition()) {
            return (<span className="badge medium font-bold text-uppercase fg-white bg-purple">Master Edition</span>);
        }

        const editionNumber = getEditionNumber();

        return (
            <span className="badge medium font-bold text-uppercase fg-white bg-purple">Edition {editionNumber}</span>
        );
    }

    const getVerifiedCollectionPill = () => {
        const onchainVerifiedToolTip =
            "This NFT has been verified as a member of an on-chain collection. This tag guarantees authenticity.";
        return (
            <Tooltip title={onchainVerifiedToolTip}>
                <span className="badge medium font-bold text-uppercase fg-white bg-purple">Verified Collection</span>
            </Tooltip>
        );
    }

    const getIsMutablePill = (isMutable: boolean) => {
        return (
            <span className="badge medium font-bold text-uppercase fg-white bg-purple">{isMutable ? 'Mutable' : 'Immutable'}</span>
        );
    }

    const getSaleTypePill = (hasPrimarySaleHappened: boolean) => {
        const primaryMarketTooltip =
            "Creator(s) split 100% of the proceeds when this NFT is sold.";

        const secondaryMarketTooltip =
            "Creator(s) split the Seller Fee when this NFT is sold. The owner receives the remaining proceeds.";

        return (
            <>
                <Tooltip title={hasPrimarySaleHappened ? secondaryMarketTooltip : primaryMarketTooltip}>
                    <span className="badge medium font-bold text-uppercase fg-white bg-purple">
                        {hasPrimarySaleHappened ? 'Secondary Market' : 'Primary Market'}
                    </span>
                </Tooltip>
            </>
        );
    }

    const renderAttributes = () => {
        if (!selectedNft || !selectedNft.json) { return null; }

        return (
            <>
                {selectedNft.json.attributes ? (
                    <div className="nft-attributes-grid mb-2">
                        {selectedNft.json.attributes.map((attr, index) => {
                            if (!attr.trait_type || !attr.value) { return null; }
                            return (
                                <div key={`${index}`} className="nft-attribute">
                                    <div className="nft-attribute-name">{attr.trait_type}</div>
                                    <div className="nft-attribute-value">{attr.value}</div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <span>No attributes found</span>
                )}
            </>
        );
    }

    const infoRow = (label: React.ReactNode, content: React.ReactNode) => {
        return <div className="two-column-form-layout col30x70 mb-1">
            <div className="left fg-secondary-60">
                <span className="flex-row align-items-center">{label}</span>
            </div>
            <div className="right">
                <span className="fg-secondary-60">{content}</span>
            </div>
        </div>;
    }

    return (
        <div className="nft-details">
            <div className="flexible-column-bottom vertical-scroll">
                <div className="top">
                    <div className="nft-header-layout">
                        <div className="left">
                            <div className="nft-item">
                                {selectedNft.json ? (
                                    <Image
                                        className="nft-image"
                                        src={selectedNft.json.image || fallbackImgSrc}
                                        fallback={fallbackImgSrc}
                                        alt={selectedNft.json.name}
                                    />
                                ) : (
                                    <Image
                                        className="nft-image"
                                        src={fallbackImgSrc}
                                        alt="No image description. Metadata not loaded"
                                    />
                                )}
                            </div>
                        </div>
                        <div className="right">
                        {selectedNft.json ? (
                            <>
                                {/* <h3 className="nft-details-heading">NFT Overview</h3> */}
                                <div className="font-size-100 font-bold mb-1">
                                    <span>{selectedNft.name || 'No NFT name found'}</span>
                                    {selectedNft.json.symbol ? (
                                        <span className="ml-1">({selectedNft.json.symbol})</span>
                                    ) : null}
                                </div>

                                <div className="font-size-100 mb-2">
                                    <Space size="small" align="center" wrap>
                                        {getEditionPill()}
                                        {isVerifiedCollection ? getVerifiedCollectionPill() : null}
                                        {getIsMutablePill(selectedNft.isMutable)}
                                        {getSaleTypePill(selectedNft.primarySaleHappened)}
                                    </Space>
                                </div>

                                <h3 className="nft-details-heading">Description</h3>
                                <p>{selectedNft.json.description || 'No description in metadata'}</p>
                            </>
                        ) : (
                            <span>No metadata found</span>
                        )}
                        </div>
                    </div>
                </div>
                <div className="bottom">
                    {selectedNft.json ? (
                        <div className="transaction-list-data-wrapper">
                            {infoRow(
                                (
                                    <>
                                        <span className="shift-up-3px">Royalty</span>
                                        <InfoIcon
                                            placement="top"
                                            content={<span>Royalties are shared to Creators at this rate if the asset is sold using Metaplex Auction program.</span>}
                                            >
                                            <InfoCircleOutlined />
                                        </InfoIcon>
                                    </>
                                ),
                                `${selectedNft.sellerFeeBasisPoints / 100}%`
                            )}

                            <NftCreatorsPopover
                                creators={selectedNft.creators}
                                dropdownLabel="Creators"
                            />

                            <h3 className="nft-details-heading">Attributes</h3>
                            {renderAttributes()}
                        </div>
                    ) : (
                        <div className="transaction-list-data-wrapper h-100 flex-column">
                            <span>No metadata found</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
