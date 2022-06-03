import { Treasury } from '@mean-dao/msp';
import { TokenInfo } from '@solana/spl-token-registry';
import { Button, Empty } from 'antd';
import BN from 'bn.js';
import React, { useCallback, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { VESTING_ROUTE_BASE_PATH } from '../..';
import { Identicon } from '../../../../components/Identicon';
import { FALLBACK_COIN_IMAGE } from '../../../../constants';
import { AppStateContext } from '../../../../contexts/appstate';
import { consoleOut } from '../../../../utils/ui';
import { formatThousands, getAmountWithSymbol, makeDecimal, shortenAddress } from '../../../../utils/utils';

export const VestingLockSelectAccount = (props: {
    streamingAccounts: Treasury[] | undefined;
    selectedAccount: Treasury | undefined;
    onAccountSelected: any;
}) => {
    const { streamingAccounts, selectedAccount, onAccountSelected } = props;
    const navigate = useNavigate();
    const { t } = useTranslation('common');
    const {
        getTokenByMintAddress,
    } = useContext(AppStateContext);

    const getAvailableStreamingBalance = useCallback((item: Treasury, token: TokenInfo | undefined) => {
        if (item) {
            const decimals = token ? token.decimals : 6;
            const unallocated = item.balance - item.allocationAssigned;
            const ub = makeDecimal(new BN(unallocated), decimals);
            return ub;
        }
        return 0;
    }, []);

    return (
        <>
            <div className="accounts-list-wrapper vertical-scroll">
                <div className="accounts-heading">
                    <div className="title">Streaming Accounts ({streamingAccounts?.length || 0})</div>
                </div>

                {streamingAccounts && streamingAccounts.length > 0 ? (
                    streamingAccounts.map((item, index) => {
                        const associatedToken = item.associatedToken;
                        const token = associatedToken
                            ? getTokenByMintAddress(associatedToken as string)
                            : undefined;
                        const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
                            event.currentTarget.src = FALLBACK_COIN_IMAGE;
                            event.currentTarget.className = "error";
                        };
                        const onTreasuryClick = () => {
                            consoleOut('Selected streaming account:', item, 'blue');
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
                                    <div className="title text-truncate">{item.name}</div>
                                    <div className="subtitle text-truncate">
                                        {
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
                                        }
                                    </div>
                                </div>
                                <div className="rate-cell text-center">
                                    <div className="rate-amount">
                                        {
                                            getAmountWithSymbol(
                                                getAvailableStreamingBalance(item, token),
                                                token ? token.address : ''
                                            )
                                        }
                                    </div>
                                    <div className="interval">Available streaming balance</div>
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
            </div>
            <div className="cta-container">
                <Button
                    type="primary"
                    shape="round"
                    size="small"
                    className="thin-stroke" onClick={() => {
                        const url = `${VESTING_ROUTE_BASE_PATH}/stream-create/general`;
                        navigate(url);
                    }}>
                    Continue
                </Button>
            </div>
        </>
    );
};
