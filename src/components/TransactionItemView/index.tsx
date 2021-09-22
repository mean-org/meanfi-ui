import React, { useEffect, useState } from "react";
import { ArrowDownOutlined, ArrowUpOutlined } from "@ant-design/icons";
import { LAMPORTS_PER_SOL, TokenBalance } from "@solana/web3.js";
import { SIMPLE_DATE_FORMAT, SIMPLE_DATE_TIME_FORMAT, SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from "../../constants";
import { getSolanaExplorerClusterParam } from "../../contexts/connection";
import { formatAmount, getTokenAmountAndSymbolByTokenAddress, shortenAddress } from "../../utils/utils";
import { Timestamp, UserTokenAccount } from "../../models/transactions";
import { NATIVE_SOL } from "../../utils/tokens";
import { displayTimestamp } from "../../utils/ui";
import { Tooltip } from "antd";
import Moment from "react-moment";
import { MappedTransaction } from "../../utils/history";

const dateFormat = require("dateformat");

export const TransactionItemView = (props: {
  accountAddress: string;
  selectedAsset: UserTokenAccount | undefined;
  transaction: MappedTransaction;
}) => {

  const [isInboundTx, setIsInboundTx] = useState(false);
  const [preBalance, setPreBalance] = useState(0);
  const [postBalance, setPostBalance] = useState(0);
  const [amountChange, setAmountChange] = useState(0);
  const [postTokenBalance, setPostTokenBalance] = useState<TokenBalance | null>(null);

  // Prepare some data
  useEffect(() => {
    if (props.transaction) {

      // Define some local vars
      let isInbound = true;
      let accountIndex = 0;
      let preBalance = 0;
      let postBalance = 0;
      let amount = 0;
      let preTkBalance: TokenBalance | null = null;
      let postTkBalance: TokenBalance | null = null;
      const meta = props.transaction.parsedTransaction.meta;
      const accounts = props.transaction.parsedTransaction.transaction.message.accountKeys;
      const tokensUsed = meta &&
        ((meta.preTokenBalances && meta.preTokenBalances.length) || (meta.postTokenBalances && meta.postTokenBalances.length))
        ? true
        : false;

      // Set inbound/outbound flag
      if (props.accountAddress === accounts[0].pubkey.toBase58()) {
        isInbound = false;
      } else {
        isInbound = true;
      }
      setIsInboundTx(isInbound);

      // Select token account to use
      if (tokensUsed) {
        if (isInbound) {
          accountIndex = 1;
        } else {
          accountIndex = 2;
        }
        if (props.accountAddress !== props.selectedAsset?.ataAddress) {
          const index = accounts.findIndex(a => a.pubkey.toBase58() === props.selectedAsset?.ataAddress);
          if (index !== -1) {
            accountIndex = accounts.findIndex(a => a.pubkey.toBase58() === props.selectedAsset?.ataAddress);
          }
        } else {
          const ptb = meta?.postTokenBalances && meta.postTokenBalances.length
            ? meta.postTokenBalances[0]
            : null;
          if (ptb) {
            accountIndex = ptb.accountIndex;
          }
        }
      }

      if (meta) {
        preTkBalance = meta.preTokenBalances && meta.preTokenBalances.length
          ? meta.preTokenBalances.filter(b => b.accountIndex === accountIndex)[0] || null
          : null;
        const pre = preTkBalance ? preTkBalance.uiTokenAmount.uiAmount || 0 : 0;

        postTkBalance = meta.postTokenBalances && meta.postTokenBalances.length
          ? meta.postTokenBalances.filter(b => b.accountIndex === accountIndex)[0] || null
          : null;
        const post = postTkBalance ? postTkBalance.uiTokenAmount.uiAmount || 0 : 0;

        amount = tokensUsed
                  ? isInbound
                    ? post - pre
                    : pre - post
                  : isInbound
                    ? meta.postBalances[1] - meta.preBalances[1]
                    : meta.preBalances[0] - meta.postBalances[0];

        preBalance = tokensUsed
                        ? pre
                        : isInbound
                          ? meta.preBalances[1]
                          : meta.preBalances[0];

        postBalance = tokensUsed
                        ? post
                        : isInbound
                          ? meta.postBalances[1]
                          : meta.postBalances[0];
      }

      setPostTokenBalance(postTkBalance);
      setPreBalance(preBalance);
      setPostBalance(postBalance);
      setAmountChange(amount);

      // if (!isInbound) {
      //   const accountsTable: any[] = [];
      //   accounts.forEach(item => {
      //     accountsTable.push({
      //       address: item.pubkey ? shortenAddress(item.pubkey.toBase58(), 5) : '',
      //       signer: item.signer,
      //       writable: item.writable
      //     });
      //   });
      //   console.table(accountsTable);
      // }
    }
  }, [props]);

  const getTxIcon = () => {
    if (isInboundTx) {
      return (
        <ArrowDownOutlined className="mean-svg-icons incoming" />
      );
    } else {
      return (
        <ArrowUpOutlined className="mean-svg-icons outgoing" />
      );
    }
  }

  const isAmountNegative = (): boolean => {
    return postBalance < preBalance ? true : false;
  }

  const getTxDescription = (shorten = true): string => {
    const trans = props.transaction.parsedTransaction.transaction.message;
    const faucetAddress = '9B5XszUGdMaxCZ7uSQhPzdks5ZQSmWxrmzCSvtJ6Ns6g';
    const sender = trans.accountKeys[0].pubkey.toBase58();
    const receiver = trans.accountKeys[1].pubkey.toBase58();
    const wallet = (trans.instructions[0] as any)?.parsed?.info?.wallet as string || '';
    if (isInboundTx) {
      if (sender === faucetAddress) {
        return 'Account airdrop';
      }
      return shorten ? shortenAddress(sender, 6) : sender;
    } else {
      return shorten ? shortenAddress(wallet || receiver, 6) : receiver;
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
    const blockTime = props.transaction.parsedTransaction.blockTime;

    // Display these ones
    const getDisplayAmount = (abbreviated = true): string => {
      const displayAmount = postTokenBalance
        ? getTokenAmountAndSymbolByTokenAddress(Math.abs(amountChange), postTokenBalance.mint)
        : abbreviated
          ? formatAmount(getAmountFromLamports(Math.abs(amountChange)), 6, true) + ' SOL'
          : formatAmount(getAmountFromLamports(Math.abs(amountChange)), 9) + ' SOL';
      return isAmountNegative() ? '-' + displayAmount : displayAmount;
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
            <span>{getTxDescription()}</span>
          </Tooltip>
        </div>
        <div className="std-table-cell responsive-cell pr-2 text-right">
          <Tooltip placement="bottom" title={getDisplayAmount(false)}>
            <span>{getDisplayAmount()}</span>
          </Tooltip>
        </div>
        <div className="std-table-cell responsive-cell pr-2 text-right">
          <Tooltip placement="bottom" title={getDisplayPostBalance(false)}>
            <span>{getDisplayPostBalance()}</span>
          </Tooltip>
        </div>
        <div className="std-table-cell fixed-width-100">
          {
            blockTime ? (
              <Tooltip placement="bottom" title={displayTimestamp(blockTime * 1000)}>
                {/* <span>{getShortDate(blockTime * 1000)}</span> */}
                <Moment date={blockTime * 1000} fromNow />
              </Tooltip>
            ) : (
              <span>'unavailable'</span>
            )
          }
        </div>
      </a>
    );
  };

  return getTransactionItems();
};
