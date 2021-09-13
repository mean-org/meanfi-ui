import React from "react";
import { ArrowDownOutlined, ArrowUpOutlined } from "@ant-design/icons";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { SIMPLE_DATE_FORMAT, SIMPLE_DATE_TIME_FORMAT, SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from "../../constants";
import { getSolanaExplorerClusterParam } from "../../contexts/connection";
import { formatAmount, getTokenAmountAndSymbolByTokenAddress, shortenAddress } from "../../utils/utils";
import { Timestamp } from "../../models/transactions";
import { NATIVE_SOL } from "../../utils/tokens";
import { displayTimestamp } from "../../utils/ui";
import { Tooltip } from "antd";
import { MappedTransaction } from "../../utils/history";

const dateFormat = require("dateformat");

export const TransactionItemView = (props: {
  accountAddress: string;
  transaction: MappedTransaction;
}) => {
  // const { streamProgramAddress } = useContext(AppStateContext);

  const isInbound = (): boolean => {
    const trans = props.transaction.parsedTransaction.transaction.message;
    return trans.accountKeys[1].pubkey.toBase58() === props?.accountAddress ? true : false;
  }

  const getTxIcon = () => {
    if (isInbound()) {
      return (
        <ArrowDownOutlined className="mean-svg-icons incoming" />
      );
    } else {
      return (
        <ArrowUpOutlined className="mean-svg-icons outgoing" />
      );
    }
  }

  const getTxDescription = (shorten = true): string => {
    const trans = props.transaction.parsedTransaction.transaction.message;
    const faucetAddress = '9B5XszUGdMaxCZ7uSQhPzdks5ZQSmWxrmzCSvtJ6Ns6g';
    const sender = trans.accountKeys[0].pubkey.toBase58();
    const receiver = trans.accountKeys[1].pubkey.toBase58();
    if (isInbound()) {
      if (sender === faucetAddress) {
        return 'Account airdrop';
      }
      return shorten ? shortenAddress(sender, 6) : sender;
    } else {
      return shorten ? shortenAddress(receiver, 6) : receiver;
    }
  }

  const getShortDate = (timestamp: Timestamp, includeTime = false): string => {
    if (!timestamp || timestamp === "unavailable") { return 'unavailable'; }
    const localDate = new Date(timestamp);
    return dateFormat(
      localDate,
      includeTime ? SIMPLE_DATE_TIME_FORMAT : SIMPLE_DATE_FORMAT
    );
  }

  const getAmountFromLamports = (amount: number): number => {
    return (amount || 0) / LAMPORTS_PER_SOL;
  }

  const getTransactionItems = () => {
    const signature = props.transaction.signature?.toString();
    const meta = props.transaction.parsedTransaction.meta;
    let amount = 0;
    let postBalance = 0;
    const preTokenBalance = meta && meta.preTokenBalances && meta.preTokenBalances.length
          ? meta.preTokenBalances[isInbound() ? 1 : 0]
          : null;
    const postTokenBalance = meta && meta.postTokenBalances && meta.postTokenBalances.length
          ? meta.postTokenBalances[isInbound() ? 1 : 0]
          : null;
    if (meta) {
      amount = preTokenBalance && postTokenBalance
                ? (postTokenBalance.uiTokenAmount.uiAmount || 0) - (preTokenBalance.uiTokenAmount.uiAmount || 0)
                : meta.postBalances[isInbound() ? 1 : 0] - meta.preBalances[isInbound() ? 1 : 0];
      postBalance = meta.postBalances[isInbound() ? 1 : 0];
    }

    // Display these ones
    const getDisplayAmount = (abbreviated = true): string => {
      return postTokenBalance
        ? getTokenAmountAndSymbolByTokenAddress(amount, postTokenBalance.mint)
        : abbreviated
          ? formatAmount(getAmountFromLamports(amount), 6, true) + ' SOL'
          : formatAmount(getAmountFromLamports(amount), 9) + ' SOL';
    }

    const getDisplayPostBalance = (abbreviated = true): string => {
      return postTokenBalance
        ? getTokenAmountAndSymbolByTokenAddress(
            postTokenBalance ? postTokenBalance.uiTokenAmount.uiAmount || postBalance : postBalance,
            postTokenBalance ? postTokenBalance.mint || NATIVE_SOL.address : NATIVE_SOL.address
          )
        : abbreviated
          ? formatAmount(getAmountFromLamports(postBalance), 6, true) + ' SOL'
          : formatAmount(getAmountFromLamports(postBalance), 9) + ' SOL';
    }

    return (
      <a key={signature} className="item-list-row" target="_blank" rel="noopener noreferrer"
          href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${signature}${getSolanaExplorerClusterParam()}`}>
        <div className="std-table-cell first-cell">
          {getTxIcon()}
        </div>
        <div className="std-table-cell responsive-cell">
          <Tooltip placement="bottom" title={getTxDescription(false)}>
            <span className="text-monospace">
              {getTxDescription()}
            </span>
          </Tooltip>
        </div>
        <div className="std-table-cell fixed-width-140">
          <Tooltip placement="bottom" title={getDisplayAmount(false)}>
            <span className="text-monospace">
              {getDisplayAmount()}
            </span>
          </Tooltip>
        </div>
        <div className="std-table-cell fixed-width-140">
          <Tooltip placement="bottom" title={getDisplayPostBalance(false)}>
            <span className="text-monospace">
              {getDisplayPostBalance()}
            </span>
          </Tooltip>
        </div>
        <div className="std-table-cell fixed-width-80" >
          {
            props.transaction.parsedTransaction.blockTime ? (
              <Tooltip placement="bottom" title={displayTimestamp(props.transaction.parsedTransaction.blockTime * 1000)}>
                <span className="text-monospace">{getShortDate(props.transaction.parsedTransaction.blockTime * 1000)}</span>
              </Tooltip>
            ) : (
              <span className="text-monospace">'unavailable'</span>
            )
          }
        </div>
      </a>
    );
  };

  return getTransactionItems();
};
