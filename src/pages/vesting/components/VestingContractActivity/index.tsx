import React, { useContext } from 'react';
import { Treasury, VestingTreasuryActivity, VestingTreasuryActivityAction } from '@mean-dao/msp';
import { Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import { SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from '../../../../constants';
import { getSolanaExplorerClusterParam } from '../../../../contexts/connection';
import { IconExternalLink } from '../../../../Icons';
import { getShortDate } from '../../../../middleware/ui';
import { displayAmountWithSymbol, makeDecimal, shortenAddress } from '../../../../middleware/utils';
import { TokenInfo } from 'models/SolanaTokenInfo';
import { BN } from 'bn.js';
import { AppStateContext } from '../../../../contexts/appstate';

export const VestingContractActivity = (props: {
    contractActivity: VestingTreasuryActivity[];
    hasMoreStreamActivity: boolean;
    loadingStreamActivity: boolean;
    onLoadMoreActivities: any;
    selectedToken: TokenInfo | undefined;
    vestingContract: Treasury | undefined;
  }) => {
    const {
        contractActivity,
        hasMoreStreamActivity,
        loadingStreamActivity,
        onLoadMoreActivities,
        selectedToken,
        vestingContract,
    } = props;
    const {
        splTokenList,
    } = useContext(AppStateContext);
    const { t } = useTranslation('common');

    const getActivityDescription = (item: VestingTreasuryActivity) => {
        if (!vestingContract) {
            return '--';
        }

        let message = '';
        switch (item.action) {
            case VestingTreasuryActivityAction.TreasuryCreate:
                message += `Vesting contract created - ${vestingContract.name}`;
                break;
            case VestingTreasuryActivityAction.TreasuryModify:
                message += `Vesting contract modified - ${vestingContract.name}`;
                break;
            case VestingTreasuryActivityAction.TreasuryAddFunds:
                message += `Vesting contract funds added - ${vestingContract.name}`;
                break;
            case VestingTreasuryActivityAction.TreasuryWithdraw:
                message += `Vesting contract funds withdrawn - ${vestingContract.name}`;
                break;
            case VestingTreasuryActivityAction.TreasuryRefresh:
                message += `Vesting contract refresh data - ${vestingContract.name}`;
                break;
            case VestingTreasuryActivityAction.StreamCreate:
                message += `Vesting stream created for ${item.beneficiary ? shortenAddress(item.beneficiary) : '--'}`;
                break;
            case VestingTreasuryActivityAction.StreamAllocateFunds:
                message += `Vesting stream allocate funds for ${item.beneficiary ? shortenAddress(item.beneficiary) : '--'}`;
                break;
            case VestingTreasuryActivityAction.StreamWithdraw:
                message += `Vesting stream withdraw by ${item.beneficiary ? shortenAddress(item.beneficiary) : '--'}`;
                break;
            case VestingTreasuryActivityAction.StreamClose:
                message += `Vesting stream closed for ${item.beneficiary ? shortenAddress(item.beneficiary) : '--'}`;
                break;
            case VestingTreasuryActivityAction.StreamPause:
                message += `Vesting stream paused for ${item.beneficiary ? shortenAddress(item.beneficiary) : '--'}`;
                break;
            case VestingTreasuryActivityAction.StreamResume:
                message += `Vesting stream resumed for ${item.beneficiary ? shortenAddress(item.beneficiary) : '--'}`;
                break;
            default:
                message += '--';
                break;
        }
        return message;
    }

    const getActivitySubtitle = (item: VestingTreasuryActivity) => {
        if (!vestingContract) {
            return '--';
        }

        let message = '';
        switch (item.action) {
            case VestingTreasuryActivityAction.TreasuryCreate:
            case VestingTreasuryActivityAction.TreasuryModify:
            case VestingTreasuryActivityAction.TreasuryAddFunds:
            case VestingTreasuryActivityAction.TreasuryWithdraw:
            case VestingTreasuryActivityAction.TreasuryRefresh:
                message += shortenAddress(vestingContract.id);
                break;
            case VestingTreasuryActivityAction.StreamCreate:
            case VestingTreasuryActivityAction.StreamAllocateFunds:
            case VestingTreasuryActivityAction.StreamWithdraw:
            case VestingTreasuryActivityAction.StreamClose:
            case VestingTreasuryActivityAction.StreamPause:
            case VestingTreasuryActivityAction.StreamResume:
                message += item.stream ? shortenAddress(item.stream) : '--';
                break;
            default:
                message += '--';
                break;
        }
        return message;
    }

    const getActivityAssociatedToken = (item: VestingTreasuryActivity) => {
        if (!vestingContract || !selectedToken) {
            return '--';
        }

        const decimals = selectedToken.decimals;
        let amount = '';

        if (typeof item.amount === "string") {
            if (!item.amount) {
                amount = '0';
            } else {
                amount = displayAmountWithSymbol(
                    item.amount,
                    selectedToken.address,
                    selectedToken.decimals,
                    splTokenList,
                    true,
                    false
                );
            }
        } else {
            const value = item.amount ? makeDecimal(new BN(item.amount), decimals) : 0;
            amount = item.amount
                ? displayAmountWithSymbol(
                        item.amount,
                        selectedToken.address,
                        selectedToken.decimals,
                        splTokenList,
                        true,
                        false
                    )
                : `${value}`;
        }

        let message = '';
        switch (item.action) {
            case VestingTreasuryActivityAction.TreasuryAddFunds:
            case VestingTreasuryActivityAction.TreasuryWithdraw:
                message += `${amount} ${selectedToken?.symbol}`;
                break;
            case VestingTreasuryActivityAction.StreamCreate:
            case VestingTreasuryActivityAction.StreamAllocateFunds:
            case VestingTreasuryActivityAction.StreamWithdraw:
                message += `${amount} ${selectedToken?.symbol}`;
                break;
            default:
                message = '--';
                break;
        }
        return message;
    }

    const renderActivities = () => {
        if (!vestingContract) { return null; }
        return (
            <div className="stream-activity-list">
                <Spin spinning={loadingStreamActivity}>
                    {(contractActivity && contractActivity.length > 0) ? (
                        contractActivity.map((item, index) => {
                            return (
                                <a key={`${index + 50}`} target="_blank" rel="noopener noreferrer"
                                    className="transaction-list-row stripped-rows"
                                    href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${item.signature}${getSolanaExplorerClusterParam()}`}>
                                    {/* <div className="icon-cell">
                                        <IconLiveHelp className="mean-svg-icons" />
                                    </div> */}
                                    <div className="description-cell">
                                        <div className="title text-truncate">
                                            {getActivityDescription(item)}
                                        </div>
                                        <div className="subtitle text-truncate">
                                            {getActivitySubtitle(item)}
                                        </div>
                                    </div>
                                    <div className="rate-cell">
                                        <div className="rate-amount">
                                            {getActivityAssociatedToken(item)}
                                        </div>
                                        <div className="interval">{getShortDate(item.utcDate as string, true)}</div>
                                    </div>
                                    <div className="actions-cell">
                                        <IconExternalLink className="mean-svg-icons" style={{ width: "15", height: "15" }} />
                                    </div>
                                </a>
                            );
                        })
                    ) : (
                        <>
                            {loadingStreamActivity ? (
                                <p>{t('streams.stream-activity.loading-activity')}</p>
                            ) : (
                                <>
                                    <p>{t('streams.stream-activity.no-activity')}</p>
                                </>
                            )}
                        </>
                    )}
                </Spin>
                {contractActivity.length > 0 && hasMoreStreamActivity && (
                    <div className="mt-1 text-center">
                        <span className={loadingStreamActivity ? 'no-pointer' : 'secondary-link underline-on-hover'}
                            role="link"
                            onClick={onLoadMoreActivities}>
                            {t('general.cta-load-more')}
                        </span>
                    </div>
                )}
            </div>
        );
    }


    return (
        <div className="tab-inner-content-wrapper vertical-scroll">
            <div className="stream-detail-component">
                {renderActivities()}
            </div>
        </div>
    );
};
