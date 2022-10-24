import { Creator } from "@metaplex-foundation/js";
import { Tooltip } from "antd";
import { AddressDisplay } from "components/AddressDisplay";
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from "constants/common";
import { getSolanaExplorerClusterParam } from "contexts/connection";
import useWindowSize from "hooks/useWindowResize";
import { IconCheck, IconInfoCircle } from "Icons";

export const NftCreators = (props: {
    creators: Creator[];
}) => {

    const { creators } = props;
    const { width } = useWindowSize();

    return (
        <div className="creators-table-wrapper">
            <div className="item-list-header compact dark">
                <div className="header-row">
                    <div className="std-table-cell responsive-cell px-2 text-left">
                        <span>Creator address</span>
                    </div>
                    <div className="std-table-cell fixed-width-80 px-2 text-right border-left">
                        <span>Royalty</span>
                    </div>
                </div>
            </div>

            {creators && creators.length > 0 ? (
                <>
                    <div className="item-list-body compact dark pt-1">
                        {creators.map((item, index) => {
                            return (
                                <div key={`${index}-${item.address.toBase58()}`} className="item-list-row">
                                    <div className="std-table-cell responsive-cell px-2 text-left">
                                        <Tooltip title={item.verified ? 'Verified' : 'Unverified'}>
                                            {item.verified ? (
                                                <span>
                                                    <IconCheck className="mean-svg-icons success align-middle" />
                                                </span>
                                            ) : (
                                                <span>
                                                    <IconInfoCircle className="mean-svg-icons info align-middle" style={{width:24, height:20}} />
                                                </span>
                                            )}
                                        </Tooltip>
                                        <AddressDisplay
                                            address={item.address.toBase58()}
                                            maxChars={width < 400 ? 12 : undefined}
                                            showFullAddress={width >= 400 ? true : false}
                                            className="align-middle simplelink underline-on-hover ml-1"
                                            iconStyles={{ width: "15", height: "15" }}
                                            newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${item.address.toBase58()}${getSolanaExplorerClusterParam()}`}
                                        />
                                    </div>
                                    <div className="std-table-cell fixed-width-80 px-2 text-right border-left">
                                        {item.share}%
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            ) : (
                <div className="pl-1">No creators found</div>
            )}
        </div>
    );
};
