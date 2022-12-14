import { StreamInfo, TreasuryInfo } from "@mean-dao/money-streaming";
import { Stream, PaymentStreamingAccount } from "@mean-dao/payment-streaming";
import { PublicKey } from "@solana/web3.js";
import { Button, notification } from "antd";
import { segmentAnalytics } from "App";
import { openNotification } from "components/Notifications";
import { MULTISIG_ROUTE_BASE_PATH } from "constants/common";
import { useAccountsContext } from "contexts/accounts";
import { AppStateContext } from "contexts/appstate";
import { confirmationEvents, TxConfirmationInfo } from "contexts/transaction-status";
import { useWallet } from "contexts/wallet";
import { AppUsageEvent } from "middleware/segment-service";
import { consoleOut } from "middleware/ui";
import { RegisteredAppPaths } from "models/accounts";
import { EventType, OperationType } from "models/enums";
import { useCallback, useContext, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { MoneyStreamsIncomingView, MoneyStreamsInfoView, MoneyStreamsOutgoingView, StreamingAccountView } from "views";

let isWorkflowLocked = false;

const PaymentStreamingView = (props: {
  treasuryList: (TreasuryInfo | PaymentStreamingAccount)[];
  loadingTreasuries: boolean;
  onBackButtonClicked?: any;
}) => {
  const {
    treasuryList,
    loadingTreasuries,
    onBackButtonClicked,
  } = props;
  const location = useLocation();
  const navigate = useNavigate();
  const { streamingTab, streamingItemId } = useParams();
  const {
    streamList,
    streamDetail,
    loadingStreams,
    selectedMultisig,
    multisigAccounts,
    refreshMultisigs,
    setPreviousRoute,
    setActiveStream,
    setStreamDetail,
  } = useContext(AppStateContext);
  const { publicKey } = useWallet();
  const { refreshAccount } = useAccountsContext();
  // Local state
  const [pathParamStreamId, setPathParamStreamId] = useState('');
  const [pathParamTreasuryId, setPathParamTreasuryId] = useState('');
  const [pathParamStreamingTab, setPathParamStreamingTab] = useState('');
  // Streaming account
  const [treasuryDetail, setTreasuryDetail] = useState<PaymentStreamingAccount | TreasuryInfo | undefined>();
  const [canSubscribe, setCanSubscribe] = useState(true);


  ///////////////
  // Callbacks //
  ///////////////

  const clearStateData = useCallback(() => {
    setPathParamStreamId('');
    setPathParamTreasuryId('');
    setPathParamStreamingTab('');
  }, []);

  const recordTxConfirmation = useCallback(
    (item: TxConfirmationInfo, success = true) => {
      let event: any = undefined;

      if (item) {
        switch (item.operationType) {
          case OperationType.StreamAddFunds:
            event = success
              ? AppUsageEvent.StreamTopupCompleted
              : AppUsageEvent.StreamTopupFailed;
            break;
          case OperationType.StreamPause:
            event = success
              ? AppUsageEvent.StreamPauseCompleted
              : AppUsageEvent.StreamPauseFailed;
            break;
          case OperationType.StreamResume:
            event = success
              ? AppUsageEvent.StreamResumeCompleted
              : AppUsageEvent.StreamResumeFailed;
            break;
          case OperationType.StreamCreate:
            event = success
              ? AppUsageEvent.StreamCreateCompleted
              : AppUsageEvent.StreamCreateFailed;
            break;
          case OperationType.StreamClose:
            event = success
              ? AppUsageEvent.StreamCloseCompleted
              : AppUsageEvent.StreamCloseFailed;
            break;
          case OperationType.StreamWithdraw:
            event = success
              ? AppUsageEvent.StreamWithdrawalCompleted
              : AppUsageEvent.StreamWithdrawalFailed;
            break;
          case OperationType.StreamTransferBeneficiary:
            event = success
              ? AppUsageEvent.StreamTransferCompleted
              : AppUsageEvent.StreamTransferFailed;
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
            event = success
              ? AppUsageEvent.CreateStreamingAccountCompleted
              : AppUsageEvent.CreateStreamingAccountFailed;
            break;
          case OperationType.TreasuryClose:
            event = success
              ? AppUsageEvent.CloseStreamingAccountCompleted
              : AppUsageEvent.CloseStreamingAccountFailed;
            break;
          case OperationType.TreasuryRefreshBalance:
            event = success
              ? AppUsageEvent.RefreshAccountBalanceCompleted
              : AppUsageEvent.RefreshAccountBalanceFailed;
            break;
          default:
            break;
        }
        if (event) {
          segmentAnalytics.recordEvent(event, { signature: item.signature });
        }
      }
    },
    [],
  );

  const logEventHandling = useCallback((item: TxConfirmationInfo) => {
    consoleOut(
      `PaymentStreamingView -> onTxConfirmed event handled for operation ${OperationType[item.operationType]}`,
      item,
      'crimson',
    );
  }, []);

  const onTxConfirmed = useCallback((item: TxConfirmationInfo) => {
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
            <div className="mb-2">
              The proposal's status can be reviewed in the Safe's proposal list.
            </div>
            <Button
              type="primary"
              shape="round"
              size="small"
              className="extra-small d-flex align-items-center pb-1"
              onClick={() => {
                const url = `${MULTISIG_ROUTE_BASE_PATH}?v=proposals`;
                navigate(url);
                notification.close(myNotifyKey);
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
      if (item.extras && item.extras.multisigAuthority) {
        isWorkflowLocked = true;
      }

      recordTxConfirmation(item, true);
      switch (item.operationType) {
        case OperationType.StreamCreate:
          logEventHandling(item);
          setTimeout(() => {
            accountRefresh();
            hardReloadStreams();
          }, 20);
          break;
        case OperationType.StreamPause:
        case OperationType.StreamResume:
        case OperationType.StreamAddFunds:
        case OperationType.TreasuryStreamCreate:
        case OperationType.TreasuryRefreshBalance:
        case OperationType.TreasuryAddFunds:
        case OperationType.TreasuryWithdraw:
          logEventHandling(item);
          if (item.extras && item.extras.multisigAuthority) {
            refreshMultisigs();
            notifyMultisigActionFollowup(item);
          } else {
            softReloadStreams();
          }
          break;
        case OperationType.TreasuryCreate:
        case OperationType.StreamWithdraw:
          logEventHandling(item);
          if (item.extras && item.extras.multisigAuthority) {
            refreshMultisigs();
            notifyMultisigActionFollowup(item);
          } else {
            accountRefresh();
            softReloadStreams();
          }
          break;
        case OperationType.StreamClose:
          logEventHandling(item);
          if (item.extras && item.extras.multisigAuthority) {
            refreshMultisigs();
            notifyMultisigActionFollowup(item);
          } else {
            onBackButtonClicked();
            hardReloadStreams();
          }
          break;
        case OperationType.TreasuryClose:
          logEventHandling(item);
          if (item.extras && item.extras.multisigAuthority) {
            refreshMultisigs();
            notifyMultisigActionFollowup(item);
          } else {
            const url = `/${RegisteredAppPaths.PaymentStreaming}/streaming-accounts`;
            navigate(url);
            hardReloadStreams();
          }
          break;
        case OperationType.StreamTransferBeneficiary:
          logEventHandling(item);
          if (item.extras && item.extras.multisigAuthority) {
            refreshMultisigs();
            notifyMultisigActionFollowup(item);
          } else {
            const url = `/${RegisteredAppPaths.PaymentStreaming}/incoming`;
            navigate(url);
            hardReloadStreams();
          }
          break;
        default:
          break;
      }
    }
  }, [logEventHandling, navigate, onBackButtonClicked, recordTxConfirmation, refreshMultisigs]);


  /////////////////////
  // Data management //
  /////////////////////

  // Refresh native account upon entering view
  useEffect(() => {
    if (!publicKey) {
      return;
    }
    consoleOut('Refreshing native account...', '', 'blue');
    refreshAccount();
  }, [publicKey, refreshAccount]);

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
            consoleOut(
              'Route param streamingItemId:',
              streamingItemId,
              'crimson',
            );
            setPathParamTreasuryId(streamingItemId);
          } else {
            setPathParamTreasuryId('');
          }
          break;
        case 'incoming':
        case 'outgoing':
          if (streamingItemId) {
            consoleOut(
              'Route param streamingItemId:',
              streamingItemId,
              'crimson',
            );
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
  }, [
    publicKey,
    streamingTab,
    streamingItemId,
    location.pathname,
  ]);

  // Preset the selected streaming account from the list if provided in path param (streamingItemId)
  useEffect(() => {
    if (!publicKey || !treasuryList || treasuryList.length === 0) {
      setTreasuryDetail(undefined);
    }

    if (
      pathParamTreasuryId &&
      streamingItemId &&
      pathParamTreasuryId === streamingItemId
    ) {
      const item = treasuryList.find(
        s => (s.id as string) === pathParamTreasuryId,
      );
      consoleOut('treasuryDetail:', item, 'darkgreen');
      if (item) {
        setTreasuryDetail(item);
      }
    }
  }, [pathParamTreasuryId, publicKey, streamingItemId, treasuryList]);

  // Preset the selected stream from the list if provided in path param (streamId)
  useEffect(() => {
    const inPath = (item: Stream | StreamInfo, param: string) => {
      if (!item.id) {
        return false;
      }
      const isNew = item.version >= 2 ? true : false;
      if (isNew) {
        return (item as Stream).id.toBase58() === param;
      } else {
        return ((item as StreamInfo).id as string) === param;
      }
    };

    if (
      publicKey &&
      streamList &&
      streamList.length > 0 &&
      pathParamStreamId &&
      (!streamDetail || !inPath(streamDetail, pathParamStreamId))
    ) {
      const item = streamList.find(
        s => s.id && (s.id as PublicKey).toString() === pathParamStreamId,
      );
      if (item) {
        setStreamDetail(item);
        setActiveStream(item);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathParamStreamId, publicKey, streamDetail, streamList]);

  // Setup event listeners
  useEffect(() => {
    if (canSubscribe) {
      setCanSubscribe(false);
      consoleOut('Setup event subscriptions -> PaymentStreamingView', '', 'brown');
      confirmationEvents.on(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut(
        'Subscribed to event txConfirmed with:',
        'onTxConfirmed',
        'brown',
      );
    }
  }, [canSubscribe, onTxConfirmed]);

  // Unsubscribe from events
  useEffect(() => {
    return () => {
      consoleOut('Unsubscribe from events -> PaymentStreamingView', '', 'brown');
      confirmationEvents.off(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut('Unsubscribed from event txConfirmed!', '', 'brown');
      consoleOut('Clearing local component state...', '', 'purple');
      clearStateData();
      setCanSubscribe(true);
      isWorkflowLocked = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  ////////////////////
  // Event handlers //
  ////////////////////

  const accountRefresh = () => {
    const fullRefreshCta = document.getElementById('account-refresh-cta');
    if (fullRefreshCta) {
      fullRefreshCta.click();
    }
  };

  const softReloadStreams = () => {
    const streamsRefreshCta = document.getElementById(
      'streams-refresh-noreset-cta',
    );
    if (streamsRefreshCta) {
      streamsRefreshCta.click();
    }
  };

  const hardReloadStreams = () => {
    const streamsRefreshCta = document.getElementById(
      'streams-refresh-reset-cta',
    );
    if (streamsRefreshCta) {
      streamsRefreshCta.click();
    }
  };

  const goToStreamIncomingDetailsHandler = (stream: Stream | StreamInfo) => {
    const id = stream.version >= 2 ? (stream as Stream).id.toBase58() : (stream as StreamInfo).id as string;
    const url = `/${RegisteredAppPaths.PaymentStreaming}/incoming/${id}`;
    navigate(url);
  };

  const goToStreamOutgoingDetailsHandler = (stream: Stream | StreamInfo) => {
    const id = stream.version >= 2 ? (stream as Stream).id.toBase58() : (stream as StreamInfo).id as string;
    const url = `/${RegisteredAppPaths.PaymentStreaming}/outgoing/${id}`;
    navigate(url);
  };

  const goToStreamingAccountDetailsHandler = (
    streamingTreasury: PaymentStreamingAccount | TreasuryInfo | undefined,
  ) => {
    if (streamingTreasury) {
      const url = `/${RegisteredAppPaths.PaymentStreaming}/streaming-accounts/${streamingTreasury.id as string
        }`;
      navigate(url);
    }
  };

  const goToListOfIncomingStreams = () => {
    const url = `/${RegisteredAppPaths.PaymentStreaming}/incoming`;

    setTimeout(() => {
      setStreamDetail(undefined);
    }, 100);
    setTimeout(() => {
      setStreamDetail(undefined);
    }, 100);
    navigate(url);
  };

  const goToListOfStreamingAccounts = () => {
    const url = `/${RegisteredAppPaths.PaymentStreaming}/streaming-accounts`;
    navigate(url);
  };

  const goToStreamingAccountStreamDetailsHandler = (stream: Stream | StreamInfo) => {
    const id = stream.version >= 2 ? (stream as Stream).id.toBase58() : (stream as StreamInfo).id as string;
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
    } else if (pathParamStreamId && pathParamStreamingTab === 'incoming') {
      return (
        <MoneyStreamsIncomingView
          loadingStreams={loadingStreams}
          streamSelected={streamDetail}
          multisigAccounts={multisigAccounts}
          onSendFromIncomingStreamDetails={goToListOfIncomingStreams}
        />
      );
    } else if (pathParamStreamId && pathParamStreamingTab === 'outgoing') {
      return (
        <MoneyStreamsOutgoingView
          loadingStreams={loadingStreams}
          streamSelected={streamDetail}
          streamList={streamList}
          multisigAccounts={multisigAccounts}
          onSendFromOutgoingStreamDetails={onBackButtonClicked}
        />
      );
    } else if (
      streamingItemId &&
      pathParamStreamingTab === 'streaming-accounts' &&
      treasuryDetail &&
      treasuryDetail.id === pathParamTreasuryId
    ) {
      return (
        <StreamingAccountView
          treasuryList={treasuryList}
          multisigAccounts={multisigAccounts}
          selectedMultisig={selectedMultisig}
          streamingAccountSelected={treasuryDetail}
          onSendFromStreamingAccountDetails={
            goToListOfStreamingAccounts
          }
          onSendFromStreamingAccountStreamInfo={
            goToStreamingAccountStreamDetailsHandler
          }
        />
      );
    } else {
      return null;
    }
  };


  return (
    <>
      <div className="scroll-wrapper vertical-scroll">
        {renderPaymentStreamsContent()}
      </div>
    </>
  );
};

export default PaymentStreamingView;
