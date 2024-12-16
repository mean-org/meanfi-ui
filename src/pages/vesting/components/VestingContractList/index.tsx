import type { PaymentStreamingAccount, StreamTemplate } from '@mean-dao/payment-streaming';
import { PublicKey } from '@solana/web3.js';
import { Progress } from 'antd';
import BN from 'bn.js';
import type React from 'react';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconLoading, IconNoItems } from 'src/Icons';
import { FALLBACK_COIN_IMAGE } from 'src/app-constants/common';
import { Identicon } from 'src/components/Identicon';
import { AppStateContext } from 'src/contexts/appstate';
import { useWalletAccount } from 'src/contexts/walletAccount';
import { getReadableDate, getTodayPercentualBetweenTwoDates } from 'src/middleware/ui';
import { formatThousands, getSdkValue, makeDecimal } from 'src/middleware/utils';
import useStreamingClient from 'src/query-hooks/streamingClient';
import { useGetVestingContracts } from 'src/query-hooks/vestingContract';
import { useGetStreamTemplates } from 'src/query-hooks/vestingContractTemplates';
import type { LooseObject } from 'src/types/LooseObject';

interface VestingContractListProps {
  onAccountSelected: (item: PaymentStreamingAccount) => void;
  selectedVestingContract: PaymentStreamingAccount | undefined;
}

export const VestingContractList = ({ onAccountSelected, selectedVestingContract }: VestingContractListProps) => {
  const { t } = useTranslation('common');
  const { selectedAccount } = useWalletAccount();
  const { theme, getTokenByMintAddress } = useContext(AppStateContext);
  const [vcCompleteness, setVcCompleteness] = useState<LooseObject>({});
  const { tokenStreamingV2 } = useStreamingClient();
  const { vestingContracts, loadingVestingContracts } = useGetVestingContracts({
    srcAccountPk: new PublicKey(selectedAccount.address),
    tokenStreamingV2,
  });

  const isStartDateFuture = useCallback((date: string): boolean => {
    const now = new Date().toUTCString();
    const nowUtc = new Date(now);
    const comparedDate = new Date(date);
    if (comparedDate > nowUtc) {
      return true;
    }
    return false;
  }, []);

  const getContractFinishDate = useCallback((templateValues: StreamTemplate) => {
    // Total length of vesting period in seconds
    const lockPeriod = templateValues.rateIntervalInSeconds * templateValues.durationNumberOfUnits;
    // Final date = Start date + lockPeriod
    const ts = new Date(templateValues.startUtc).getTime();
    return new Date(lockPeriod * 1000 + ts);
  }, []);

  const { vcTemplates, loadingTemplates } = useGetStreamTemplates({
    srcAccountPk: selectedAccount ? new PublicKey(selectedAccount.address) : undefined,
    vestingContracts,
    tokenStreamingV2,
  });

  // Set chart completed percentages
  useEffect(() => {
    if (loadingVestingContracts || loadingTemplates || !vestingContracts || !vcTemplates) {
      return;
    }

    const completedPercentages: LooseObject = {};
    for (const contract of vestingContracts) {
      let streamTemplate: StreamTemplate | undefined = undefined;
      let startDate: string | undefined = undefined;

      // get the contract template from the map if the item exists
      const id = contract.id.toBase58();
      if (vcTemplates?.[id]?.startUtc) {
        streamTemplate = vcTemplates[id];
        // Set a start date for the contract
        const localDate = new Date(vcTemplates[id].startUtc);
        startDate = localDate.toUTCString();
      }

      let completedVestingPercentage = 0;
      if (contract && streamTemplate && startDate) {
        if (contract.totalStreams === 0) {
          completedVestingPercentage = 0;
        } else if (isStartDateFuture(startDate)) {
          completedVestingPercentage = 0;
        } else {
          let todayPct = 0;
          const finishDate = getContractFinishDate(streamTemplate).toUTCString();
          todayPct = getTodayPercentualBetweenTwoDates(startDate, finishDate);
          const cliffPercent = makeDecimal(new BN(streamTemplate.cliffVestPercent), 4);
          if (cliffPercent > 0) {
            // visualCompletionPct = ((100 - cliffPercent) * completionPct) + cliffPercent
            const completionWithOutCliifReminder = (100 - cliffPercent) * todayPct;
            const visualCompletionPct = completionWithOutCliifReminder / 100 + cliffPercent;
            completedVestingPercentage = visualCompletionPct > 100 ? 100 : visualCompletionPct;
          } else {
            completedVestingPercentage = todayPct > 100 ? 100 : todayPct;
          }
        }
      } else {
        completedVestingPercentage = 0;
      }
      completedPercentages[id] = completedVestingPercentage;
    }
    setVcCompleteness(completedPercentages);
  }, [
    getContractFinishDate,
    isStartDateFuture,
    loadingTemplates,
    loadingVestingContracts,
    vestingContracts,
    vcTemplates,
  ]);

  const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    event.currentTarget.src = FALLBACK_COIN_IMAGE;
    event.currentTarget.className = 'error';
  };

  return (
    <div
      className={`vesting-contract-list ${
        !loadingVestingContracts && (!vestingContracts || vestingContracts.length === 0) ? 'h-75' : ''
      }`}
    >
      {vestingContracts && vestingContracts.length > 0 ? (
        vestingContracts.map((item, index) => {
          const associatedToken = item.mint.toBase58();
          const token = associatedToken ? getTokenByMintAddress(associatedToken as string) : undefined;
          const onTreasuryClick = () => {
            onAccountSelected(item);
          };
          return (
            <div
              key={`${index + 50}`}
              onKeyDown={() => {}}
              onClick={onTreasuryClick}
              className={`transaction-list-row ${selectedVestingContract && selectedVestingContract.id === item.id ? 'selected' : ''}`}
            >
              <div className='icon-cell'>
                <div className='token-icon'>
                  <>
                    {token?.logoURI ? (
                      <img
                        alt={`${token.name}`}
                        width={30}
                        height={30}
                        src={token.logoURI}
                        onError={imageOnErrorHandler}
                      />
                    ) : (
                      <Identicon
                        address={associatedToken}
                        style={{
                          width: 30,
                          height: 30,
                          display: 'inline-flex',
                        }}
                      />
                    )}
                  </>
                </div>
              </div>
              <div className='description-cell'>
                <div className='title text-truncate'>{item.name}</div>
                <div className='subtitle text-truncate'>
                  {item &&
                  vcTemplates &&
                  vcTemplates[item.id.toBase58()] &&
                  vcTemplates[item.id.toBase58()].startUtc &&
                  !loadingTemplates ? (
                    <span className='mr-1'>
                      {isStartDateFuture(vcTemplates[item.id.toBase58()].startUtc) ? (
                        `Contract starts on ${getReadableDate(vcTemplates[item.id.toBase58()].startUtc, true)}`
                      ) : (
                        <Progress
                          percent={vcCompleteness[item.id.toBase58()] || 0}
                          showInfo={false}
                          status={
                            vcCompleteness[item.id.toBase58()] === 0
                              ? 'normal'
                              : vcCompleteness[item.id.toBase58()] < 100
                                ? 'active'
                                : 'success'
                          }
                          size='small'
                          type='line'
                          className='vesting-list-progress-bar small'
                          trailColor={theme === 'light' ? '#f5f5f5' : '#303030'}
                          style={{ width: 200 }}
                        />
                      )}
                    </span>
                  ) : (
                    <span className='mr-1'>
                      <IconLoading
                        className='mean-svg-icons'
                        style={{
                          height: 14,
                          width: 14,
                          marginTop: -2,
                          marginBottom: -2,
                        }}
                      />
                    </span>
                  )}
                </div>
              </div>
              <div className='rate-cell'>
                <div className='rate-amount'>{formatThousands(+getSdkValue(item.totalStreams))}</div>
                <div className='interval'>{item.totalStreams === 1 ? 'stream' : 'streams'}</div>
              </div>
            </div>
          );
        })
      ) : (
        <div className='flex-column flex-center justify-content-center h-100'>
          <IconNoItems className='mean-svg-icons fg-secondary-50' style={{ width: 42, height: 42 }} />
          <div className='font-size-120 font-bold fg-secondary-75 mt-2 mb-2'>{t('vesting.no-contracts')}</div>
          <div className='font-size-110 fg-secondary-50 mb-3'>{t('vesting.user-instruction-headline')}</div>
        </div>
      )}
    </div>
  );
};
