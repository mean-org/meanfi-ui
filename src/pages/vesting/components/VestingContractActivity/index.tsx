import { PaymentStreamingAccount, VestingAccountActivity, ActivityActionCode } from '@mean-dao/payment-streaming';
import { Spin } from 'antd';
import { BN } from 'bn.js';
import { SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from 'constants/common';
import { AppStateContext } from 'contexts/appstate';
import { getSolanaExplorerClusterParam } from 'contexts/connection';
import { IconExternalLink } from 'Icons';
import { getShortDate } from 'middleware/ui';
import { displayAmountWithSymbol, makeDecimal, shortenAddress } from 'middleware/utils';
import { TokenInfo } from 'models/SolanaTokenInfo';
import { useContext } from 'react';
import { useTranslation } from 'react-i18next';

export const VestingContractActivity = (props: {
  contractActivity: VestingAccountActivity[];
  hasMoreStreamActivity: boolean;
  loadingStreamActivity: boolean;
  onLoadMoreActivities: any;
  selectedToken: TokenInfo | undefined;
  vestingContract: PaymentStreamingAccount | undefined;
}) => {
  const {
    contractActivity,
    hasMoreStreamActivity,
    loadingStreamActivity,
    onLoadMoreActivities,
    selectedToken,
    vestingContract,
  } = props;
  const { splTokenList } = useContext(AppStateContext);
  const { t } = useTranslation('common');

  const getActivityDescription = (item: VestingAccountActivity) => {
    if (!vestingContract) {
      return '--';
    }

    let message = '';
    switch (item.actionCode) {
      case ActivityActionCode.AccountCreated:
        message += `Vesting contract created - ${vestingContract.name}`;
        break;
      case ActivityActionCode.StreamTemplateUpdated:
        message += `Vesting contract modified - ${vestingContract.name}`;
        break;
      case ActivityActionCode.FundsAddedToAccount:
        message += `Vesting contract funds added - ${vestingContract.name}`;
        break;
      case ActivityActionCode.FundsWithdrawnFromAccount:
        message += `Vesting contract funds withdrawn - ${vestingContract.name}`;
        break;
      case ActivityActionCode.AccountDataRefreshed:
        message += `Vesting contract refresh data - ${vestingContract.name}`;
        break;
      case ActivityActionCode.StreamCreated:
        message += `Vesting stream created for ${item.beneficiary ? shortenAddress(item.beneficiary) : '--'}`;
        break;
      case ActivityActionCode.FundsAllocatedToStream:
        message += `Vesting stream allocate funds for ${item.beneficiary ? shortenAddress(item.beneficiary) : '--'}`;
        break;
      case ActivityActionCode.FundsWithdrawnFromStream:
        message += `Vesting stream withdraw by ${item.beneficiary ? shortenAddress(item.beneficiary) : '--'}`;
        break;
      case ActivityActionCode.StreamClosed:
        message += `Vesting stream closed for ${item.beneficiary ? shortenAddress(item.beneficiary) : '--'}`;
        break;
      case ActivityActionCode.StreamPaused:
        message += `Vesting stream paused for ${item.beneficiary ? shortenAddress(item.beneficiary) : '--'}`;
        break;
      case ActivityActionCode.StreamResumed:
        message += `Vesting stream resumed for ${item.beneficiary ? shortenAddress(item.beneficiary) : '--'}`;
        break;
      default:
        message += '--';
        break;
    }
    return message;
  };

  const getActivitySubtitle = (item: VestingAccountActivity) => {
    if (!vestingContract) {
      return '--';
    }

    let message = '';
    switch (item.actionCode) {
      case ActivityActionCode.StreamTemplateUpdated:
      case ActivityActionCode.AccountCreated:
      case ActivityActionCode.FundsAddedToAccount:
      case ActivityActionCode.FundsWithdrawnFromAccount:
      case ActivityActionCode.AccountDataRefreshed:
        message += shortenAddress(vestingContract.id);
        break;
      case ActivityActionCode.StreamCreated:
      case ActivityActionCode.FundsAllocatedToStream:
      case ActivityActionCode.FundsWithdrawnFromStream:
      case ActivityActionCode.StreamClosed:
      case ActivityActionCode.StreamPaused:
      case ActivityActionCode.StreamResumed:
        message += item.stream ? shortenAddress(item.stream) : '--';
        break;
      default:
        message += '--';
        break;
    }
    return message;
  };

  const getActivityAssociatedToken = (item: VestingAccountActivity) => {
    if (!vestingContract || !selectedToken) {
      return '--';
    }

    const decimals = selectedToken.decimals;
    let amount = '';

    if (typeof item.amount === 'string') {
      if (!item.amount) {
        amount = '0';
      } else {
        amount = displayAmountWithSymbol(
          item.amount,
          selectedToken.address,
          selectedToken.decimals,
          splTokenList,
          true,
          false,
        );
      }
    } else {
      const value = item.amount ? makeDecimal(new BN(item.amount), decimals) : 0;
      amount = item.amount
        ? displayAmountWithSymbol(item.amount, selectedToken.address, selectedToken.decimals, splTokenList, true, false)
        : `${value}`;
    }

    let message = '';
    switch (item.actionCode) {
      case ActivityActionCode.FundsAddedToAccount:
      case ActivityActionCode.FundsWithdrawnFromAccount:
        message += `${amount} ${selectedToken?.symbol}`;
        break;
      case ActivityActionCode.StreamCreated:
      case ActivityActionCode.FundsAllocatedToStream:
      case ActivityActionCode.FundsWithdrawnFromStream:
        message += `${amount} ${selectedToken?.symbol}`;
        break;
      default:
        message = '--';
        break;
    }
    return message;
  };

  const renderActivities = () => {
    if (!vestingContract) {
      return null;
    }
    return (
      <div className="stream-activity-list">
        <Spin spinning={loadingStreamActivity}>
          {contractActivity && contractActivity.length > 0 ? (
            contractActivity.map((item, index) => {
              return (
                <a
                  key={`${index + 50}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transaction-list-row stripped-rows"
                  href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${item.signature}${getSolanaExplorerClusterParam()}`}
                >
                  {/* <div className="icon-cell">
                                        <IconLiveHelp className="mean-svg-icons" />
                                    </div> */}
                  <div className="description-cell">
                    <div className="title text-truncate">{getActivityDescription(item)}</div>
                    <div className="subtitle text-truncate">{getActivitySubtitle(item)}</div>
                  </div>
                  <div className="rate-cell">
                    <div className="rate-amount">{getActivityAssociatedToken(item)}</div>
                    <div className="interval">{getShortDate(item.utcDate, true)}</div>
                  </div>
                  <div className="actions-cell">
                    <IconExternalLink className="mean-svg-icons" style={{ width: '15', height: '15' }} />
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
            <span
              className={loadingStreamActivity ? 'no-pointer' : 'secondary-link underline-on-hover'}
              role="link"
              onClick={onLoadMoreActivities}
            >
              {t('general.cta-load-more')}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="tab-inner-content-wrapper vertical-scroll">
      <div className="stream-detail-component">{renderActivities()}</div>
    </div>
  );
};
