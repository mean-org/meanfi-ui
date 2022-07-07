import React, { useCallback, useContext, useEffect, useState } from 'react';
import { TokenInfo } from '@solana/spl-token-registry';
import { AppStateContext } from '../../../../contexts/appstate';
import { Treasury, TreasuryType } from '@mean-dao/msp';
import { FALLBACK_COIN_IMAGE, SOLANA_EXPLORER_URI_INSPECT_ADDRESS, WRAPPED_SOL_MINT_ADDRESS } from '../../../../constants';
import { getAmountWithSymbol, makeDecimal, shortenAddress } from '../../../../utils/utils';
import { Identicon } from '../../../../components/Identicon';
import { AddressDisplay } from '../../../../components/AddressDisplay';
import { getSolanaExplorerClusterParam } from '../../../../contexts/connection';
import { VestingFlowRateInfo } from '../../../../models/vesting';
import BN from 'bn.js';
import { IconLoading } from '../../../../Icons';
import { getIntervalFromSeconds } from '../../../../utils/ui';

export const VestingContractDetails = (props: {
    isXsDevice: boolean;
    loadingVestingContractFlowRate: boolean;
    vestingContract: Treasury | undefined;
    vestingContractFlowRate: VestingFlowRateInfo | undefined;
}) => {
    const {
        isXsDevice,
        loadingVestingContractFlowRate,
        vestingContract,
        vestingContractFlowRate,
    } = props;
    const {
        theme,
        splTokenList,
        getTokenByMintAddress,
    } = useContext(AppStateContext);

    const [selectedToken, setSelectedToken] = useState<TokenInfo | undefined>(undefined);

    const getAvailableStreamingBalance = useCallback((item: Treasury, token: TokenInfo | undefined) => {
        if (item) {
            const decimals = token ? token.decimals : 6;
            const unallocated = item.balance - item.allocationAssigned;
            const ub = makeDecimal(new BN(unallocated), decimals);
            return ub;
        }
        return 0;
    }, []);

    // Set a working token based on the Vesting Contract's Associated Token
    useEffect(() => {
        if (vestingContract) {
            let token = getTokenByMintAddress(vestingContract.associatedToken as string);
            if (token && token.address === WRAPPED_SOL_MINT_ADDRESS) {
                token = Object.assign({}, token, {
                    symbol: 'SOL'
                }) as TokenInfo;
            }
            setSelectedToken(token);
        }

        return () => { }
    }, [getTokenByMintAddress, vestingContract])

    const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
        event.currentTarget.src = FALLBACK_COIN_IMAGE;
        event.currentTarget.className = "error";
    };

    const renderStreamingAccount = (item: Treasury) => {
        const vcType = item.treasuryType;

        return (
            <div className="transaction-list-row h-auto no-pointer">
                <div className="icon-cell">
                    <div className="token-icon">
                        {selectedToken && selectedToken.logoURI ? (
                            <img alt={`${selectedToken.name}`} width={36} height={36} src={selectedToken.logoURI} onError={imageOnErrorHandler} />
                        ) : (
                            <Identicon address={item.associatedToken} style={{ width: "36", height: "36", display: "inline-flex" }} />
                        )}
                    </div>
                </div>
                <div className="description-cell">
                    {item.name ? (
                        <div className="title text-truncate">
                            {item.name}
                            <span className={`badge small ml-1 ${theme === 'light' ? 'golden fg-dark' : 'darken'}`}>
                                {vcType === TreasuryType.Open ? 'Open' : 'Locked'}
                            </span>
                        </div>
                    ) : (
                        <div className="title text-truncate">{shortenAddress(item.id as string, 8)}</div>
                    )}
                    <div className="subtitle">
                        {loadingVestingContractFlowRate ? (
                            <span className="mr-1"><IconLoading className="mean-svg-icons" style={{ height: "15px", lineHeight: "15px" }}/></span>
                        ) : vestingContractFlowRate && vestingContract && selectedToken ? (
                            <>
                                {vestingContractFlowRate.amount > 0 && (
                                    <span className="mr-1">Sending {getAmountWithSymbol(
                                        vestingContractFlowRate.amount,
                                        vestingContract.associatedToken as string,
                                        false, splTokenList
                                    )} {getIntervalFromSeconds(vestingContractFlowRate.durationUnit)}</span>
                                )}
                            </>
                        ) : null}
                        <AddressDisplay
                            address={item.id as string}
                            prefix="("
                            suffix=")"
                            maxChars={5}
                            iconStyles={{ width: "15", height: "15" }}
                            newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${item.id}${getSolanaExplorerClusterParam()}`}
                        />
                    </div>
                </div>
            </div>
        );
    };

    return (
        <>
            {vestingContract && (
                <div className="details-panel-meta mb-2">
                    <div className="two-column-form-layout col60x40">
                        <div className="left mb-2">
                            {renderStreamingAccount(vestingContract)}
                        </div>
                        <div className={`right mb-2 ${isXsDevice ? 'text-left' : 'text-right'}`}>
                            <div className="info-label text-truncate line-height-110">
                                Available for new streams
                            </div>
                            <div className="transaction-detail-row">
                                <span className="info-data line-height-110">
                                    {
                                        getAmountWithSymbol(
                                            getAvailableStreamingBalance(vestingContract, selectedToken),
                                            selectedToken ? selectedToken.address : ''
                                        )
                                    }
                                </span>
                            </div>

                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
