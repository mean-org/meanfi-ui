import React from "react";
import { TxConfirmationInfo } from "../../contexts/transaction-status";
import { CheckCircleOutlined, ExclamationCircleOutlined, LoadingOutlined } from "@ant-design/icons";
import { getRelativeDate } from "../../utils/ui";
import { SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from "../../constants";
import { getSolanaExplorerClusterParam } from "../../contexts/connection";
import { shortenAddress } from "../../utils/utils";

export const TransactionConfirmationHistory = (props: {
    confirmationHistory: TxConfirmationInfo[];
}) => {

    const { confirmationHistory } = props;

    const getEventIcon = (item: TxConfirmationInfo) => {
        switch (item.txInfoFetchStatus) {
            case "fetching":
                return <LoadingOutlined className="fg-orange" />;
            case "fetched":
                return <CheckCircleOutlined className="fg-success" />;
            case "error":
                return <ExclamationCircleOutlined className="fg-info" />;
            default:
                return null;
        }
    }

    return (
        <>
            <div className="events-heading">Transaction Confirmation History</div>
            <div className="event-cards">
                {confirmationHistory.map((item: TxConfirmationInfo, index: number) => {
                    return (
                        <div key={item.signature} className="event-card">
                            <div className="flex-fixed-left">
                                <div className="left">
                                    <div className="event-icon">
                                        {getEventIcon(item)}
                                    </div>
                                </div>
                                <div className="right ml-1 flex-column">
                                    <div className="event-description">
                                        {
                                            item.txInfoFetchStatus === "fetched"
                                                ? item.completedMessage
                                                : item.loadingMessage
                                        }
                                    </div>
                                    <div className="flex-fixed-right">
                                        <div className="left event-signature">
                                            <a className="secondary-link"
                                                href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${item.signature}${getSolanaExplorerClusterParam()}`}
                                                target="_blank"
                                                rel="noopener noreferrer">
                                                {shortenAddress(item.signature, 8)}
                                            </a>
                                        </div>
                                        <div className="right event-timestamp">
                                            {
                                                item.txInfoFetchStatus === "fetching"
                                                    ? getRelativeDate(item.timestamp || 0)
                                                    : getRelativeDate(item.timestampCompleted || 0)
                                            }
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </>
    );
};
