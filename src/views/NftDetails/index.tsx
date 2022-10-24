import { InfoCircleOutlined } from "@ant-design/icons";
import { Nft, NftWithToken, Sft, SftWithToken } from "@metaplex-foundation/js";
import { Image, Space, Tabs, Tooltip } from "antd";
import { AddressDisplay } from "components/AddressDisplay";
import { InfoIcon } from "components/InfoIcon";
import { fallbackImgSrc, SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from "constants/common";
import { useMint } from "contexts/accounts";
import { AppStateContext } from "contexts/appstate";
import { getSolanaExplorerClusterParam } from "contexts/connection";
import useWindowSize from "hooks/useWindowResize";
import React, { useCallback, useContext, useMemo } from "react";
import { NftCreators } from "./NftCreators";

export const NftDetails = (props: {
    selectedNft: Nft | Sft | SftWithToken | NftWithToken;
}) => {

    const {
        selectedNft,
    } = props;

    const {
        selectedAccount,
    } = useContext(AppStateContext);

    const collectionAddress = selectedNft.collection?.address;
    const collectionMintInfo = useMint(collectionAddress);
    const { width } = useWindowSize();

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

    const renderCreatorsAndRoyalties = useCallback(() => {
        return (
            <>
                <h3 className="nft-details-heading mb-2">Creators and Royalties</h3>
                {infoRow(
                    (
                        <>
                            <span className="align-text-bottom">Royalty</span>
                            <InfoIcon
                                placement="top"
                                content={
                                    <span>Royalties are shared to Creators at this rate if the asset is sold using Metaplex Auction program.</span>
                                }>
                                <InfoCircleOutlined />
                            </InfoIcon>
                        </>
                    ),
                    `${selectedNft.sellerFeeBasisPoints / 100}%`
                )}
                <NftCreators creators={selectedNft.creators} />
            </>
        );
    }, [selectedNft.creators, selectedNft.sellerFeeBasisPoints]);

    const renderAttributes = useCallback(() => {
        if (!selectedNft || !selectedNft.json) { return null; }

        return (
            <>
                <h3 className="nft-details-heading mb-2">Attributes</h3>
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
    }, [selectedNft]);

    const infoRow = (label: React.ReactNode, content: React.ReactNode) => {
        return <div className="two-column-form-layout col30x70 mb-1">
            <div className="left fg-secondary-60">{label}</div>
            <div className="right fg-secondary-60">{content}</div>
        </div>;
    }

    const renderProfile = () => {
        if (!selectedNft || !selectedNft.mint) { return null; }

        return (
            <>
                <h3 className="nft-details-heading mb-2">NFT Token Profile</h3>
                {infoRow(
                    (<span className="align-text-bottom">Token address</span>),
                    <AddressDisplay
                        address={selectedNft.address.toBase58()}
                        maxChars={width < 400 ? 12 : undefined}
                        showFullAddress={width >= 400 ? true : false}
                        iconStyles={{ width: "15", height: "15" }}
                        newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${selectedNft.address.toBase58()}${getSolanaExplorerClusterParam()}`}
                    />
                )}
                {selectedNft.mint.mintAuthorityAddress ? infoRow(
                    (
                        <>
                            <span className="align-text-bottom">Mint Authority</span>
                            <InfoIcon
                                placement="top"
                                content={
                                    <span>Account permitted to mint this token.</span>
                                }>
                                <InfoCircleOutlined />
                            </InfoIcon>
                        </>
                    ),
                    <AddressDisplay
                        address={selectedNft.mint.mintAuthorityAddress.toBase58()}
                        maxChars={width < 400 ? 12 : undefined}
                        showFullAddress={width >= 400 ? true : false}
                        iconStyles={{ width: "15", height: "15" }}
                        newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${selectedNft.mint.mintAuthorityAddress.toBase58()}${getSolanaExplorerClusterParam()}`}
                    />
                ) : null}
                {selectedNft.updateAuthorityAddress ? infoRow(
                    (
                        <>
                            <span className="align-text-bottom">Update Authority</span>
                            <InfoIcon
                                placement="top"
                                content={
                                    <span>Account permitted to issue update requests for this token's information.</span>
                                }>
                                <InfoCircleOutlined />
                            </InfoIcon>
                        </>
                    ),
                    <AddressDisplay
                        address={selectedNft.updateAuthorityAddress.toBase58()}
                        maxChars={width < 400 ? 12 : undefined}
                        showFullAddress={width >= 400 ? true : false}
                        iconStyles={{ width: "15", height: "15" }}
                        newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${selectedNft.updateAuthorityAddress.toBase58()}${getSolanaExplorerClusterParam()}`}
                    />
                ) : null}
                {selectedAccount ? infoRow(
                    (
                        <>
                            <span className="align-text-bottom">Current Owner</span>
                            <InfoIcon
                                placement="top"
                                content={
                                    <span>The owner of this token!</span>
                                }>
                                <InfoCircleOutlined />
                            </InfoIcon>
                        </>
                    ),
                    <AddressDisplay
                        address={selectedAccount.address}
                        maxChars={width < 400 ? 12 : undefined}
                        showFullAddress={width >= 400 ? true : false}
                        iconStyles={{ width: "15", height: "15" }}
                        newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${selectedAccount.address}${getSolanaExplorerClusterParam()}`}
                    />
                ) : null}
            </>
        );
    }

    const renderTabset = useCallback(() => {
        const items = [];
        items.push({
            key: "profile",
            label: "Profile",
            children: renderProfile()
        });
        items.push({
            key: "creators",
            label: "Creators",
            children: renderCreatorsAndRoyalties()
        });
        items.push({
            key: "attributes",
            label: "Attributes",
            children: renderAttributes()
        });

        return (
            <Tabs
                items={items}
                className="neutral"
            />
        );
    }, [renderAttributes, renderCreatorsAndRoyalties]);

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
                                <h3 className="nft-details-heading">NFT Overview</h3>
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
                            {/* CTAs row */}
                            {/* Tabset */}
                            {renderTabset()}
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
