import React from "react";
import { ArrowDownOutlined, ArrowUpOutlined } from "@ant-design/icons";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { SIMPLE_DATE_FORMAT, SIMPLE_DATE_TIME_FORMAT, SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from "../../constants";
import { getSolanaExplorerClusterParam } from "../../contexts/connection";
import { getTokenAmountAndSymbolByTokenAddress, shortenAddress } from "../../utils/utils";
import { Timestamp, TransactionWithSignature } from "../../models/transactions";
import { NATIVE_SOL } from "../../utils/tokens";
import { displayTimestamp } from "../../utils/ui";
import { Tooltip } from "antd";

const dateFormat = require("dateformat");

export const TransactionItemView = (props: {
  publicKey: PublicKey | undefined;
  transaction: TransactionWithSignature;
}) => {

  const isInbound = (): boolean => {
    const trans = props.transaction.confirmedTransaction.transaction;
    return trans.instructions[0].keys[1].pubkey.toBase58() === props?.publicKey?.toBase58() ? true : false;
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
    const trans = props.transaction.confirmedTransaction.transaction;
    const faucetAddress = '9B5XszUGdMaxCZ7uSQhPzdks5ZQSmWxrmzCSvtJ6Ns6g';
    const sender = trans.instructions[0].keys[0].pubkey.toBase58();
    const receiver = trans.instructions[0].keys[1].pubkey.toBase58();
    if (isInbound()) {
      return sender === faucetAddress
              ? 'Faucet account'
              : shorten ? shortenAddress(sender, 6) : sender;
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
    const meta = props.transaction.confirmedTransaction.meta;
    // const trans = props.transaction.confirmedTransaction.transaction;
    // const slot = props.transaction.confirmedTransaction.slot;
    let amount = 0;
    let postBalance = 0;
    const preTokenBalance = meta && meta.preTokenBalances && meta.preTokenBalances.length
          ? meta.preTokenBalances[0]
          : null;
    const postTokenBalance = meta && meta.postTokenBalances && meta.postTokenBalances.length
          ? meta.postTokenBalances[0]
          : null;
    if (meta) {
      amount = preTokenBalance && postTokenBalance
                ? (postTokenBalance.uiTokenAmount.uiAmount || 0) - (preTokenBalance.uiTokenAmount.uiAmount || 0)
                : meta.preBalances[0] - meta.postBalances[0];
      postBalance = meta.postBalances[0];
    }

    // Display these ones
    const amountDisplay = postTokenBalance
      ? getTokenAmountAndSymbolByTokenAddress(amount, postTokenBalance.mint)
      : getAmountFromLamports(amount) + ' SOL';
    const postBalanceDisplay = postTokenBalance
      ? getTokenAmountAndSymbolByTokenAddress(
          postTokenBalance ? postTokenBalance.uiTokenAmount.uiAmount || postBalance : postBalance,
          postTokenBalance ? postTokenBalance.mint || NATIVE_SOL.address : NATIVE_SOL.address
        )
      : getAmountFromLamports(postBalance) + ' SOL'

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
        <div className="std-table-cell fixed-width-120">
          <Tooltip placement="bottom" title={amountDisplay}>
            <span className="text-monospace">
              {amountDisplay}
            </span>
          </Tooltip>
        </div>
        <div className="std-table-cell fixed-width-150">
          <Tooltip placement="bottom" title={postBalanceDisplay}>
            <span className="text-monospace">
              {postBalanceDisplay}
            </span>
          </Tooltip>
        </div>
        <div className="std-table-cell fixed-width-80" >
          {
            props.transaction.timestamp !== "unavailable" ? (
              <Tooltip placement="bottom" title={displayTimestamp(props.transaction.timestamp * 1000)}>
                <span className="text-monospace">{getShortDate(props.transaction.timestamp * 1000)}</span>
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
