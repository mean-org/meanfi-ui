import React from 'react';
import { VestingTreasuryActivity } from '@mean-dao/msp';
import { Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import { SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from '../../../../constants';
import { getSolanaExplorerClusterParam } from '../../../../contexts/connection';
import { IconExternalLink, IconLiveHelp } from '../../../../Icons';
import { getShortDate } from '../../../../utils/ui';

export const VestingContractActivity = (props: {
    contractActivity: VestingTreasuryActivity[];
    hasMoreStreamActivity: boolean;
    loadingStreamActivity: boolean;
    onLoadMoreActivities: any;
  }) => {
    const { contractActivity, hasMoreStreamActivity, loadingStreamActivity, onLoadMoreActivities } = props;
    const { t } = useTranslation('common');

    const renderActivities = () => {
        return (
            <div className="stream-activity-list">
                <Spin spinning={loadingStreamActivity}>
                    {(contractActivity && contractActivity.length > 0) ? (
                        contractActivity.map((item, index) => {
                            return (
                                <a key={`${index + 50}`} target="_blank" rel="noopener noreferrer"
                                    className="transaction-list-row stripped-rows"
                                    href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${item.signature}${getSolanaExplorerClusterParam()}`}>
                                    <div className="icon-cell">
                                        {/* {getActivityIcon(item)} */}
                                        <IconLiveHelp className="mean-svg-icons" />
                                    </div>
                                    <div className="description-cell no-padding">
                                        <div className="title text-truncate">
                                            {/* {getActivityAction(item)} */}
                                            Activity title here
                                        </div>
                                        <div className="subtitle text-truncate">
                                            {/* {shortenAddress(item.initializer)} */}
                                            Subtitle here
                                        </div>
                                    </div>
                                    <div className="rate-cell">
                                        <div className="rate-amount">
                                            {/* {
                                                getAmountWithSymbol(
                                                    getActivityAmount(item),
                                                    item.mint,
                                                    false,
                                                    splTokenList
                                                )
                                            } */}
                                            Right info
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
