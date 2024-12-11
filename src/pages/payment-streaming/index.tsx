import type { StreamInfo, TreasuryInfo } from '@mean-dao/money-streaming';
import type { PaymentStreamingAccount, Stream } from '@mean-dao/payment-streaming';
import { PublicKey } from '@solana/web3.js';
import { Button, notification } from 'antd';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { segmentAnalytics } from 'src/App';
import { MULTISIG_ROUTE_BASE_PATH } from 'src/app-constants/common';
import { openNotification } from 'src/components/Notifications';
import { AppStateContext } from 'src/contexts/appstate';
import { type TxConfirmationInfo, confirmationEvents } from 'src/contexts/transaction-status';
import { useWallet } from 'src/contexts/wallet';
import { useWalletAccount } from 'src/contexts/walletAccount';
import { getStreamingAccountId } from 'src/middleware/getStreamingAccountId';
import { AppUsageEvent } from 'src/middleware/segment-service';
import { getStreamId } from 'src/middleware/streamHelpers';
import { consoleOut } from 'src/middleware/ui';
import { RegisteredAppPaths } from 'src/models/accounts';
import { EventType, OperationType } from 'src/models/enums';
import { useGetStreamList } from 'src/query-hooks/streamList';
import useStreamingClient from 'src/query-hooks/streamingClient';
import { MoneyStreamsIncomingView } from 'src/views/MoneyStreamsIncoming';
import { MoneyStreamsInfoView } from 'src/views/MoneyStreamsInfo';
import { MoneyStreamsOutgoingView } from 'src/views/MoneyStreamsOutgoing';
import { StreamingAccountView } from 'src/views/StreamingAccount';

let isWorkflowLocked = false;

interface PaymentStreamingViewProps {
  treasuryList: (TreasuryInfo | PaymentStreamingAccount)[];
  loadingTreasuries: boolean;
  onBackButtonClicked?: () => void;
}

const PaymentStreamingView = ({ treasuryList, loadingTreasuries, onBackButtonClicked }: PaymentStreamingViewProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { streamingTab, streamingItemId } = useParams();
  const { streamDetail, selectedMultisig, multisigAccounts, refreshMultisigs, setPreviousRoute, setStreamDetail } =
    useContext(AppStateContext);
  const { publicKey } = useWallet();
  const { selectedAccount } = useWalletAccount();
  // Local state
  const [pathParamStreamId, setPathParamStreamId] = useState('');
  const [pathParamTreasuryId, setPathParamTreasuryId] = useState('');
  const [pathParamStreamingTab, setPathParamStreamingTab] = useState('');
  // Streaming account
  const [treasuryDetail, setTreasuryDetail] = useState<PaymentStreamingAccount | TreasuryInfo | undefined>();
  const [canSubscribe, setCanSubscribe] = useState(true);

  const { tokenStreamingV1, tokenStreamingV2 } = useStreamingClient();
  const { data, isFetching: loadingStreams } = useGetStreamList({
    srcAccountPk: new PublicKey(selectedAccount.address),
    tokenStreamingV1,
    tokenStreamingV2,
  });

  const streamList = useMemo(() => data || [], [data]);

  ///////////////
  // Callbacks //
  ///////////////

  const recordTxConfirmation = useCallback((item: TxConfirmationInfo, success = true) => {
    let event: AppUsageEvent | undefined = undefined;

    if (item) {
      switch (item.operationType) {
        case OperationType.StreamAddFunds:
          event = success ? AppUsageEvent.StreamTopupCompleted : AppUsageEvent.StreamTopupFailed;
          break;
        case OperationType.StreamPause:
          event = success ? AppUsageEvent.StreamPauseCompleted : AppUsageEvent.StreamPauseFailed;
          break;
        case OperationType.StreamResume:
          event = success ? AppUsageEvent.StreamResumeCompleted : AppUsageEvent.StreamResumeFailed;
          break;
        case OperationType.StreamClose:
          event = success ? AppUsageEvent.StreamCloseCompleted : AppUsageEvent.StreamCloseFailed;
          break;
        case OperationType.StreamWithdraw:
          event = success ? AppUsageEvent.StreamWithdrawalCompleted : AppUsageEvent.StreamWithdrawalFailed;
          break;
        case OperationType.StreamTransferBeneficiary:
          event = success ? AppUsageEvent.StreamTransferCompleted : AppUsageEvent.StreamTransferFailed;
          break;
        case OperationType.TreasuryAddFunds:
          event = success
            ? AppUsageEvent.AddFundsStreamingAccountCompleted
            : AppUsageEvent.AddFundsStreamingAccountFailed;
          break;
        case OperationType.TreasuryWithdraw:
          event = success
            ? AppUsageEvent.WithdrawFundsStreamingAccountCompleted
            : AppUsageEvent.WithdrawFundsStreamingAccountFailed;
          break;
        case OperationType.TreasuryStreamCreate:
          event = success
            ? AppUsageEvent.CreateStreamStreamingAccountCompleted
            : AppUsageEvent.CreateStreamStreamingAccountFailed;
          break;
        case OperationType.TreasuryCreate:
          event = success ? AppUsageEvent.CreateStreamingAccountCompleted : AppUsageEvent.CreateStreamingAccountFailed;
          break;
        case OperationType.TreasuryClose:
          event = success ? AppUsageEvent.CloseStreamingAccountCompleted : AppUsageEvent.CloseStreamingAccountFailed;
          break;
        case OperationType.TreasuryRefreshBalance:
          event = success ? AppUsageEvent.RefreshAccountBalanceCompleted : AppUsageEvent.RefreshAccountBalanceFailed;
          break;
        default:
          break;
      }
      if (event) {
        segmentAnalytics.recordEvent(event, { signature: item.signature });
      }
    }
  }, []);

  const logEventHandling = useCallback((item: TxConfirmationInfo) => {
    consoleOut(
      `PaymentStreamingView -> onTxConfirmed event handled for operation ${OperationType[item.operationType]}`,
      item,
      'crimson',
    );
  }, []);

  const onTxConfirmed = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
    (param: any) => {
      const item = param as TxConfirmationInfo;
      const turnOffLockWorkflow = () => {
        isWorkflowLocked = false;
      };

      const notifyMultisigActionFollowup = (item: TxConfirmationInfo) => {
        if (!item || !item.extras || !item.extras.multisigAuthority) {
          turnOffLockWorkflow();
          return;
        }

        const myNotifyKey = `notify-${Date.now()}`;
        openNotification({
          type: 'info',
          key: myNotifyKey,
          title: 'Review proposal',
          duration: 20,
          description: (
            <>
              <div className='mb-2'>The proposal's status can be reviewed in the Safe's proposal list.</div>
              <Button
                type='primary'
                shape='round'
                size='small'
                className='extra-small d-flex align-items-center pb-1'
                onClick={() => {
                  const url = `${MULTISIG_ROUTE_BASE_PATH}?v=proposals`;
                  navigate(url);
                  notification.destroy(myNotifyKey);
                }}
              >
                Review proposal
              </Button>
            </>
          ),
          handleClose: turnOffLockWorkflow,
        });
      };

      if (item) {
        if (isWorkflowLocked) {
          return;
        }

        // Lock the workflow
        if (item.extras?.multisigAuthority) {
          isWorkflowLocked = true;
        }

        recordTxConfirmation(item, true);
        switch (item.operationType) {
          case OperationType.StreamPause:
          case OperationType.StreamResume:
          case OperationType.StreamAddFunds:
          case OperationType.TreasuryRefreshBalance:
          case OperationType.TreasuryAddFunds:
          case OperationType.TreasuryWithdraw:
            logEventHandling(item);
            if (item.extras?.multisigAuthority) {
              refreshMultisigs();
              notifyMultisigActionFollowup(item);
            } else {
              softReloadStreams();
            }
            break;
          case OperationType.TreasuryCreate:
          case OperationType.StreamWithdraw:
            logEventHandling(item);
            if (item.extras?.multisigAuthority) {
              refreshMultisigs();
              notifyMultisigActionFollowup(item);
            } else {
              accountRefresh();
            }
            break;
          case OperationType.StreamClose:
            logEventHandling(item);
            if (item.extras?.multisigAuthority) {
              refreshMultisigs();
              notifyMultisigActionFollowup(item);
            }
            setTimeout(() => {
              console.log('generating backButtonClick()...');
              backButtonClick();
              console.log('calling onBackButtonClicked()...');
              onBackButtonClicked?.();
              hardReloadStreams();
            }, 20);
            break;
          case OperationType.TreasuryClose:
            logEventHandling(item);
            if (item.extras?.multisigAuthority) {
              refreshMultisigs();
              notifyMultisigActionFollowup(item);
            }
            navigate(`/${RegisteredAppPaths.PaymentStreaming}/streaming-accounts`);
            hardReloadStreams();
            break;
          case OperationType.StreamTransferBeneficiary:
            logEventHandling(item);
            if (item.extras?.multisigAuthority) {
              refreshMultisigs();
              notifyMultisigActionFollowup(item);
            } else {
              navigate(`/${RegisteredAppPaths.PaymentStreaming}/incoming`);
              hardReloadStreams();
            }
            break;
          default:
            break;
        }
      }
    },
    [logEventHandling, navigate, onBackButtonClicked, recordTxConfirmation, refreshMultisigs],
  );

  /////////////////////
  // Data management //
  /////////////////////

  // Enable deep-linking - Parse and save query params as needed
  useEffect(() => {
    if (!publicKey) {
      return;
    }

    if (streamingTab) {
      consoleOut('Route param streamingTab:', streamingTab, 'crimson');
      setPathParamStreamingTab(streamingTab);
      switch (streamingTab) {
        case 'streaming-accounts':
          if (streamingItemId) {
            consoleOut('Route param streamingItemId:', streamingItemId, 'crimson');
            setPathParamTreasuryId(streamingItemId);
          } else {
            setPathParamTreasuryId('');
          }
          break;
        case 'incoming':
        case 'outgoing':
          if (streamingItemId) {
            consoleOut('Route param streamingItemId:', streamingItemId, 'crimson');
            setPathParamStreamId(streamingItemId);
          } else {
            setPathParamStreamId('');
          }
          break;
        default:
          if (!streamingItemId) {
            setPathParamTreasuryId('');
            setPathParamStreamId('');
          }
          break;
      }
    }

    // if (autoOpenDetailsPanel) {
    //   setDetailsPanelOpen(true);
    // }
  }, [publicKey, streamingTab, streamingItemId]);

  // Preset the selected streaming account from the list if provided in path param (streamingItemId)
  useEffect(() => {
    if (!publicKey || !treasuryList || treasuryList.length === 0 || !pathParamTreasuryId) {
      setTreasuryDetail(undefined);
    }

    if (pathParamTreasuryId === streamingItemId) {
      const item = treasuryList.find(s => getStreamingAccountId(s) === pathParamTreasuryId);
      if (item) {
        consoleOut('treasuryDetail:', item, 'darkgreen');
        setTreasuryDetail(item);
      } else {
        goToPaymentStreamingSummary();
      }
    }
  }, [pathParamTreasuryId, publicKey, streamingItemId, treasuryList]);

  // Preset the selected stream from the list if provided in path param (streamId)
  // biome-ignore lint/correctness/useExhaustiveDependencies: Deps managed manually
  useEffect(() => {
    if (!publicKey || !streamList || streamList.length === 0 || !pathParamStreamId) {
      return;
    }

    const item = streamList.find(s => pathParamStreamId === getStreamId(s));
    if (item) {
      setStreamDetail(item);
    } else {
      goToPaymentStreamingSummary();
    }
  }, [pathParamStreamId, publicKey, streamList]);

  // Setup event listeners
  useEffect(() => {
    if (!canSubscribe) {
      return;
    }
    setCanSubscribe(false);
    consoleOut('Setup event subscriptions -> PaymentStreamingView', '', 'brown');
    confirmationEvents.on(EventType.TxConfirmSuccess, onTxConfirmed);
    consoleOut('Subscribed to event txConfirmed with:', 'onTxConfirmed', 'brown');
  }, [canSubscribe, onTxConfirmed]);

  // Unsubscribe from events
  // biome-ignore lint/correctness/useExhaustiveDependencies: Deps managed manually
  useEffect(() => {
    return () => {
      consoleOut('Unsubscribe from events -> PaymentStreamingView', '', 'brown');
      confirmationEvents.off(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut('Unsubscribed from event txConfirmed!', '', 'brown');
      consoleOut('Clearing local component state...', '', 'purple');
      setCanSubscribe(true);
      isWorkflowLocked = false;
    };
  }, []);

  ////////////////////
  // Event handlers //
  ////////////////////

  const backButtonClick = () => {
    const fullRefreshCta = document.querySelector('.stream-fields-container .back-button') as HTMLElement;
    if (fullRefreshCta) {
      fullRefreshCta.click();
    }
  };

  const accountRefresh = () => {
    const fullRefreshCta = document.getElementById('account-refresh-cta');
    if (fullRefreshCta) {
      fullRefreshCta.click();
    }
  };

  const softReloadStreams = () => {
    const streamsRefreshCta = document.getElementById('streams-refresh-noreset-cta');
    if (streamsRefreshCta) {
      streamsRefreshCta.click();
    }
  };

  const hardReloadStreams = () => {
    const streamsRefreshCta = document.getElementById('streams-refresh-reset-cta');
    if (streamsRefreshCta) {
      streamsRefreshCta.click();
    }
  };

  const goToPaymentStreamingSummary = () => {
    const url = `/${RegisteredAppPaths.PaymentStreaming}/summary`;
    navigate(url);
  };

  const goToStreamIncomingDetailsHandler = (stream: Stream | StreamInfo) => {
    const id = stream.version >= 2 ? (stream as Stream).id.toBase58() : ((stream as StreamInfo).id as string);
    const url = `/${RegisteredAppPaths.PaymentStreaming}/incoming/${id}`;
    navigate(url);
  };

  const goToStreamOutgoingDetailsHandler = (stream: Stream | StreamInfo) => {
    const id = stream.version >= 2 ? (stream as Stream).id.toBase58() : ((stream as StreamInfo).id as string);
    const url = `/${RegisteredAppPaths.PaymentStreaming}/outgoing/${id}`;
    navigate(url);
  };

  const goToStreamingAccountDetailsHandler = (
    streamingTreasury: PaymentStreamingAccount | TreasuryInfo | undefined,
  ) => {
    if (!streamingTreasury) {
      return;
    }
    const accountId = getStreamingAccountId(streamingTreasury);
    const url = `/${RegisteredAppPaths.PaymentStreaming}/streaming-accounts/${accountId}`;
    navigate(url);
  };

  const goToListOfIncomingStreams = () => {
    const url = `/${RegisteredAppPaths.PaymentStreaming}/incoming`;
    navigate(url);
  };

  const goToListOfStreamingAccounts = () => {
    const url = `/${RegisteredAppPaths.PaymentStreaming}/streaming-accounts`;
    navigate(url);
  };

  const goToStreamingAccountStreamDetailsHandler = (stream: Stream | StreamInfo) => {
    const id = stream.version >= 2 ? (stream as Stream).id.toBase58() : ((stream as StreamInfo).id as string);
    setPreviousRoute(location.pathname);
    const url = `/${RegisteredAppPaths.PaymentStreaming}/outgoing/${id}`;
    navigate(url);
  };

  ///////////////
  // Rendering //
  ///////////////

  const renderPaymentStreamsContent = () => {
    if (!streamingItemId) {
      return (
        <MoneyStreamsInfoView
          loadingStreams={loadingStreams}
          loadingTreasuries={loadingTreasuries}
          multisigAccounts={multisigAccounts}
          onSendFromIncomingStreamInfo={goToStreamIncomingDetailsHandler}
          onSendFromOutgoingStreamInfo={goToStreamOutgoingDetailsHandler}
          onSendFromStreamingAccountInfo={goToStreamingAccountDetailsHandler}
          selectedMultisig={selectedMultisig}
          selectedTab={pathParamStreamingTab}
          streamList={streamList}
          treasuryList={treasuryList}
        />
      );
    }
    if (pathParamStreamId && pathParamStreamingTab === 'incoming') {
      return (
        <MoneyStreamsIncomingView
          loadingStreams={loadingStreams}
          streamSelected={streamDetail}
          multisigAccounts={multisigAccounts}
          onSendFromIncomingStreamDetails={goToListOfIncomingStreams}
        />
      );
    }
    if (pathParamStreamId && pathParamStreamingTab === 'outgoing') {
      return (
        <MoneyStreamsOutgoingView
          loadingStreams={loadingStreams}
          streamSelected={streamDetail}
          streamList={streamList}
          multisigAccounts={multisigAccounts}
          onSendFromOutgoingStreamDetails={onBackButtonClicked}
        />
      );
    }
    if (
      streamingItemId &&
      pathParamStreamingTab === 'streaming-accounts' &&
      treasuryDetail &&
      getStreamingAccountId(treasuryDetail) === pathParamTreasuryId
    ) {
      return (
        <StreamingAccountView
          treasuryList={treasuryList}
          multisigAccounts={multisigAccounts}
          selectedMultisig={selectedMultisig}
          streamingAccountSelected={treasuryDetail}
          onSendFromStreamingAccountDetails={goToListOfStreamingAccounts}
          onSendFromStreamingAccountStreamInfo={goToStreamingAccountStreamDetailsHandler}
        />
      );
    }

    return null;
  };

  return <div className='scroll-wrapper vertical-scroll'>{renderPaymentStreamsContent()}</div>;
};

export default PaymentStreamingView;
