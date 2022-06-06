import { Treasury, TreasuryType } from '@mean-dao/msp';
import { Empty } from 'antd';
import React, { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { AddressDisplay } from '../../../../components/AddressDisplay';
import { Identicon } from '../../../../components/Identicon';
import { FALLBACK_COIN_IMAGE, SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from '../../../../constants';
import { AppStateContext } from '../../../../contexts/appstate';
import { getSolanaExplorerClusterParam } from '../../../../contexts/connection';
import { formatThousands } from '../../../../utils/utils';

export const VestingLockAccountList = (props: {
    streamingAccounts: Treasury[] | undefined;
    selectedAccount: Treasury | undefined;
    onAccountSelected: any;
}) => {
    const { streamingAccounts, selectedAccount, onAccountSelected } = props;
    const { t } = useTranslation('common');
    const {
        theme,
        getTokenByMintAddress,
    } = useContext(AppStateContext);

    // const getAvailableStreamingBalance = useCallback((item: Treasury, token: TokenInfo | undefined) => {
    //     if (item) {
    //         const decimals = token ? token.decimals : 6;
    //         const unallocated = item.balance - item.allocationAssigned;
    //         const ub = makeDecimal(new BN(unallocated), decimals);
    //         return ub;
    //     }
    //     return 0;
    // }, []);

    const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
        event.currentTarget.src = FALLBACK_COIN_IMAGE;
        event.currentTarget.className = "error";
    };

    return (
        <>
            {streamingAccounts && streamingAccounts.length > 0 ? (
                streamingAccounts.map((item, index) => {
                    const associatedToken = item.associatedToken;
                    const token = associatedToken
                        ? getTokenByMintAddress(associatedToken as string)
                        : undefined;
                    const vcType = item.treasuryType;
                    const onTreasuryClick = () => {
                        // consoleOut('Selected streaming account:', item, 'blue');
                        onAccountSelected(item);
                    };
                    return (
                        <div key={`${index + 50}`} onClick={onTreasuryClick}
                            className={`transaction-list-row ${selectedAccount && selectedAccount.id === item.id ? 'selected' : ''}`}>
                            <div className="icon-cell">
                                <div className="token-icon">
                                    <>
                                        {token ? (
                                            <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} onError={imageOnErrorHandler} />
                                        ) : (
                                            <Identicon address={associatedToken} style={{ width: 30, height: 30, display: "inline-flex" }} />
                                        )}
                                    </>
                                </div>
                            </div>
                            <div className="description-cell">
                                <div className="title text-truncate">
                                    {item.name}
                                    <span className={`badge small ml-1 ${theme === 'light' ? 'golden fg-dark' : 'darken'}`}>
                                        {vcType === TreasuryType.Open ? 'Open' : 'Locked'}
                                    </span>
                                </div>
                                <div className="subtitle text-truncate">
                                    <span className="mr-1">Sending #,###.00 {token?.symbol} per ###</span>
                                    <AddressDisplay
                                        address={item.id as string}
                                        prefix="("
                                        suffix=")"
                                        maxChars={5}
                                        iconStyles={{ width: "15", height: "15" }}
                                        newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${item.id}${getSolanaExplorerClusterParam()}`}
                                    />
                                    {/* {
                                        !item.totalStreams
                                            ? 'No streams'
                                            : `${formatThousands(item.totalStreams)} ${
                                                    token
                                                        ? token.symbol
                                                        : associatedToken
                                                            ? '[' + shortenAddress(associatedToken as string) + ']'
                                                            : ''
                                                } ${
                                                    item.totalStreams > 1
                                                        ? 'streams'
                                                        : 'stream'
                                                }`
                                    } */}
                                </div>
                            </div>
                            <div className="rate-cell">
                                <div className="rate-amount">
                                    {formatThousands(item.totalStreams)}
                                </div>
                                <div className="interval">streams</div>
                            </div>
                        </div>
                    );
                })
            ) : (
                <div className="flex-center h-100">
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={
                        <p>{t('treasuries.treasury-list.no-treasuries')}</p>
                    }/>
                </div>
            )}
        </>
    );
};
