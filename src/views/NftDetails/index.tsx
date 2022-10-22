import { FindNftsByOwnerOutput, Nft, NftWithToken, Sft, SftWithToken } from "@metaplex-foundation/js";
import { Image } from "antd";
import { fallbackImgSrc } from "constants/common";
import { UserTokenAccount } from "models/accounts";

export const NftDetails = (props: {
    accountTokens: UserTokenAccount[];
    nftList: FindNftsByOwnerOutput | undefined;
    selectedNft: Nft | Sft | SftWithToken | NftWithToken;
}) => {

    const {
        accountTokens,
        nftList,
        selectedNft,
    } = props;

    return (
        <>
            <div className="flexible-column-bottom">
                <div className="top">
                    <div className="nft-header-layout">
                        <div className="left">
                            <div className="nft-item">
                                {selectedNft.json ? (
                                    <>
                                        <div className="nft-title text-shadow">{selectedNft.name}</div>
                                        <Image
                                            className="nft-image"
                                            src={selectedNft.json.image || fallbackImgSrc}
                                            fallback={fallbackImgSrc}
                                            alt={selectedNft.json.name}
                                        />
                                    </>
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
                            <h3>Description here</h3>
                            <p>Lorem, ipsum dolor sit amet consectetur adipisicing elit. Cumque, similique minus. Repudiandae odio quae minima iste adipisci, dignissimos dicta fugit beatae non exercitationem incidunt expedita earum mollitia natus nulla, consequuntur minus, illum vero? Voluptatem nam doloremque modi dicta est nemo, vitae minima magni nostrum recusandae atque eos esse illo minus quas expedita, eligendi ipsam voluptate iusto fugit.</p>
                        </div>
                    </div>
                </div>
                <div className="bottom">
                    <p>More NFT data here</p>
                </div>
            </div>
        </>
    );
}
