import { Creator } from "@metaplex-foundation/js";
import { Popover, Tooltip } from "antd";
import { AddressDisplay } from "components/AddressDisplay";
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from "constants/common";
import { getSolanaExplorerClusterParam } from "contexts/connection";
import { IconCaretDown, IconCheck, IconInfoCircle } from "Icons";

export const NftCreatorsPopover = (props: {
    creators: Creator[];
    dropdownLabel: string;
}) => {

    const {
        creators,
        dropdownLabel,
    } = props;

    const bodyContent = (
        <div className="creators-table-wrapper">
            <div className="item-list-header compact dark">
                <div className="header-row">
                    <div className="std-table-cell responsive-cell px-2 text-left">
                        <span>Creator address</span>
                    </div>
                    <div className="std-table-cell fixed-width-90 px-2 text-right border-left">
                        <span>% Royalty</span>
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
                                        {item.verified ? (
                                            <IconCheck className="mean-svg-icons success align-middle mr-1" />
                                        ) : (
                                            <IconInfoCircle className="mean-svg-icons info align-middle mr-1" style={{width:24, height:20}} />
                                        )}
                                        <AddressDisplay
                                            address={item.address.toBase58()}
                                            maxChars={12}
                                            className="align-middle simplelink underline-on-hover"
                                            iconStyles={{ width: "15", height: "15" }}
                                            newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${item.address.toBase58()}${getSolanaExplorerClusterParam()}`}
                                        />
                                    </div>
                                    <div className="std-table-cell fixed-width-90 px-2 text-right border-left">
                                        {item.share}
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

    return (
        <>
            <Popover
                placement="bottom"
                content={bodyContent}
                trigger="click">
                <span className="flat-button tiny stroked">
                    <span className="mr-1">{dropdownLabel || 'Creators'}</span>
                    <IconCaretDown className="mean-svg-icons" />
                </span>
            </Popover>
        </>
    );
};
