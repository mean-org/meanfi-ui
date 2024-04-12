import type { PaymentStreaming, PaymentStreamingAccount, StreamTemplate } from '@mean-dao/payment-streaming';
import { BN } from '@project-serum/anchor';
import { IconLoading, IconNoItems } from 'Icons';
import { Progress } from 'antd';
import { Identicon } from 'components/Identicon';
import { FALLBACK_COIN_IMAGE } from 'constants/common';
import { AppStateContext } from 'contexts/appstate';
import { delay, getReadableDate, getTodayPercentualBetweenTwoDates, isProd } from 'middleware/ui';
import { formatThousands, getSdkValue, makeDecimal } from 'middleware/utils';
import type React from 'react';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LooseObject } from 'types/LooseObject';

export const VestingContractList = (props: {
  loadingVestingAccounts: boolean;
  msp: PaymentStreaming | undefined;
  onAccountSelected: any;
  selectedAccount: PaymentStreamingAccount | undefined;
  streamingAccounts: PaymentStreamingAccount[] | undefined;
}) => {
  const { loadingVestingAccounts, msp, onAccountSelected, selectedAccount, streamingAccounts } = props;
  const { t } = useTranslation('common');
  const { theme, getTokenByMintAddress } = useContext(AppStateContext);
  const [today, setToday] = useState(new Date());
  const [vcTemplates, setVcTemplates] = useState<any>({});
  const [vcCompleteness, setVcCompleteness] = useState<any>({});
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const isStartDateFuture = useCallback(
    (date: string): boolean => {
      const now = today.toUTCString();
      const nowUtc = new Date(now);
      const comparedDate = new Date(date);
      if (comparedDate > nowUtc) {
        return true;
      }
      return false;
    },
    [today],
  );

  const getContractFinishDate = useCallback((templateValues: StreamTemplate) => {
    // Total length of vesting period in seconds
    const lockPeriod = templateValues.rateIntervalInSeconds * templateValues.durationNumberOfUnits;
    // Final date = Start date + lockPeriod
    const ts = new Date(templateValues.startUtc).getTime();
    const finishDate = new Date(lockPeriod * 1000 + ts);
    return finishDate;
  }, []);

  // Set template data map
  useEffect(() => {
    if (!msp || loadingVestingAccounts || !streamingAccounts || loadingTemplates) {
      return;
    }

    setLoadingTemplates(true);

    (async () => {
      if (streamingAccounts) {
        const compiledTemplates: LooseObject = {};
        // consoleOut('loading of streamTemplates: ', 'STARTS', 'darkred');
        for (const contract of streamingAccounts) {
          if (loadingVestingAccounts) {
            break;
          }
          // Delay before each call to avoid too many requests (devnet ONLY)
          if (!isProd()) {
            if (streamingAccounts.length < 20) {
              await delay(150);
            } else if (streamingAccounts.length < 40) {
              await delay(200);
            } else if (streamingAccounts.length < 60) {
              await delay(250);
            } else if (streamingAccounts.length < 80) {
              await delay(300);
            } else if (streamingAccounts.length < 100) {
              await delay(350);
            } else {
              await delay(380);
            }
          }
          try {
            const templateData = await msp.getStreamTemplate(contract.id);
            compiledTemplates[contract.id.toBase58()] = templateData;
          } catch (error) {
            console.error('Error fetching template data:', error);
          }
        }
        setVcTemplates(compiledTemplates);
      }
      setLoadingTemplates(false);
    })();
  }, [msp, streamingAccounts, loadingTemplates, loadingVestingAccounts]);

  // Create a tick every second
  useEffect(() => {
    const timeout = setTimeout(() => {
      setToday(new Date());
    }, 1000);

    return () => {
      clearTimeout(timeout);
    };
  });

  // Set chart completed percentages
  useEffect(() => {
    if (loadingVestingAccounts || loadingTemplates || !streamingAccounts || !vcTemplates) {
      return;
    }

    const completedPercentages: any = {};
    for (const contract of streamingAccounts) {
      let streamTemplate: StreamTemplate | undefined = undefined;
      let startDate: string | undefined = undefined;

      // get the contract template from the map if the item exists
      const id = contract.id.toBase58();
      if (vcTemplates && vcTemplates[id] && vcTemplates[id].startUtc) {
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
    loadingVestingAccounts,
    streamingAccounts,
    vcTemplates,
  ]);

  const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    event.currentTarget.src = FALLBACK_COIN_IMAGE;
    event.currentTarget.className = 'error';
  };

  return (
    <div
      className={`vesting-contract-list ${
        !loadingVestingAccounts && (!streamingAccounts || streamingAccounts.length === 0) ? 'h-75' : ''
      }`}
    >
      {streamingAccounts && streamingAccounts.length > 0 ? (
        streamingAccounts.map((item, index) => {
          const associatedToken = item.mint.toBase58();
          const token = associatedToken ? getTokenByMintAddress(associatedToken as string) : undefined;
          const onTreasuryClick = () => {
            onAccountSelected(item);
          };
          return (
            <div
              key={`${index + 50}`}
              onClick={onTreasuryClick}
              className={`transaction-list-row ${selectedAccount && selectedAccount.id === item.id ? 'selected' : ''}`}
            >
              <div className='icon-cell'>
                <div className='token-icon'>
                  <>
                    {token && token.logoURI ? (
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
