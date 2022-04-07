import React, { useEffect, useState } from "react";
import { ArrowDownOutlined, ArrowUpOutlined } from "@ant-design/icons";
import { TokenBalance } from "@solana/web3.js";
import { NATIVE_SOL_MINT } from "../../utils/ids";
import { SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from "../../constants";
import { getSolanaExplorerClusterParam } from "../../contexts/connection";
import { getAmountFromLamports, getTokenAmountAndSymbolByTokenAddress, shortenAddress } from "../../utils/utils";
import { UserTokenAccount } from "../../models/transactions";
import { NATIVE_SOL } from "../../utils/tokens";
import { Tooltip } from "antd";
import Moment from "react-moment";
import { MappedTransaction } from "../../utils/history";
import { isLocal } from "../../utils/ui";

export const TransactionItemView = (props: {
  accountAddress: string;
  selectedAsset: UserTokenAccount | undefined;
  transaction: MappedTransaction;
  tokenAccounts: UserTokenAccount[];
}) => {

  const [isOutboundTx, setIsOutboundTx] = useState(false);
  const [isNativeAccountSelected, setIsNativeAccountSelected] = useState(false);
  // const [isFeeOnlyTx, setIsFeeOnlyTx] = useState(false);
  const [outDstAccountIndex, setOutDstAccountIndex] = useState(1);
  const [postBalance, setPostBalance] = useState(0);
  const [balanceChange, setBalanceChange] = useState(0);
  const [postTokenBalance, setPostTokenBalance] = useState<TokenBalance | null>(null);
  const [isTxRenderable, setIsTxRenderable] = useState(true);

  useEffect(() => {

    if (props.transaction) {
      const meta = props.transaction.parsedTransaction && props.transaction.parsedTransaction.meta
        ? props.transaction.parsedTransaction.meta
        : null;
  
      if (!meta) {
        setIsTxRenderable(false);
        return;
      }

      // Define some local vars
      let postBalance = 0;
      let balanceChange = 0;
      const accounts = props.transaction.parsedTransaction.transaction.message.accountKeys;

      // Are we scanning a user token account or the user wallet?
      const isNativeAccountSelected = props.accountAddress === props.selectedAsset?.publicAddress ? true : false;
      setIsNativeAccountSelected(isNativeAccountSelected);

      if (isNativeAccountSelected) {
        const myAccounIndex = accounts.findIndex(acc => acc.pubkey.toBase58() === props.accountAddress);
        postBalance = meta.postBalances[myAccounIndex]
        balanceChange = postBalance - meta.preBalances[myAccounIndex];
        setPostBalance(postBalance);
      } else {
        const selectedTokenAccountIndex = accounts.findIndex(acc => acc.pubkey.toBase58() === props.selectedAsset?.publicAddress);
        if (selectedTokenAccountIndex === -1) {
          setIsTxRenderable(false);
          return;
        }
        const preTokenBalanceAmount = meta.preTokenBalances && meta.preTokenBalances.length
          ? meta.preTokenBalances.find(tk => tk.accountIndex === selectedTokenAccountIndex)?.uiTokenAmount?.uiAmount || 0
          : 0;
        const postTokenBalance = meta.postTokenBalances && meta.postTokenBalances.length
          ? meta.postTokenBalances.find(tk => tk.accountIndex === selectedTokenAccountIndex)
          : null;
        balanceChange = (postTokenBalance?.uiTokenAmount.uiAmount || 0) - preTokenBalanceAmount;
        if (balanceChange === 0) {
          setIsTxRenderable(false);
          return;
        }
        setPostTokenBalance(postTokenBalance ?? null);
      }

      setBalanceChange(balanceChange);

      // Set isOutboundTx flag
      if (balanceChange > 0) {
        setIsOutboundTx(false);
      } else {
        setIsOutboundTx(true);
      }

    }
  }, [props]);

  const getTxIcon = () => {
    if (isOutboundTx) {
      return (
        <ArrowUpOutlined className="mean-svg-icons outgoing upright" />
      );
    } else {
      return (
        <ArrowDownOutlined className="mean-svg-icons incoming downright" />
      );
      //   return (
      //     <IconGasStation className="mean-svg-icons gas-station warning" />
      //   );
    }
  }

  const getTxDescription = (shorten = true): string => {
    const accounts = props.transaction.parsedTransaction.transaction.message.accountKeys;
    const faucetAddress = '9B5XszUGdMaxCZ7uSQhPzdks5ZQSmWxrmzCSvtJ6Ns6g';
    // Sender is always account 0 = Fee payer
    const sender = accounts[0].pubkey.toBase58();
    // Receiver could be any account TODO: Polish this logic
    const receiver = accounts[outDstAccountIndex]
          ? accounts[outDstAccountIndex].pubkey.toBase58()
          : accounts[1].pubkey.toBase58();

    if (isOutboundTx) {
      return shorten ? shortenAddress(receiver, 6) : receiver;
    } else {
      if (sender === faucetAddress) {
        return 'Account airdrop';
      }
      return shorten ? shortenAddress(sender, 6) : sender;
    }
  }

  const getDisplayAmount = (): string => {
    const displayAmount = postTokenBalance
        ? isNativeAccountSelected
          ? getTokenAmountAndSymbolByTokenAddress(
              getAmountFromLamports(balanceChange),
              NATIVE_SOL.address,
              !isLocal()
            )
          : getTokenAmountAndSymbolByTokenAddress(
              balanceChange,
              postTokenBalance.mint,
              !isLocal()
            )
        : getTokenAmountAndSymbolByTokenAddress(
            getAmountFromLamports(balanceChange),
            NATIVE_SOL_MINT.toBase58(),
            !isLocal()
          );
    return displayAmount;
  }

  const getDisplayPostBalance = (): string => {
    return postTokenBalance
      ? isNativeAccountSelected
        ? getTokenAmountAndSymbolByTokenAddress(
            getAmountFromLamports(postBalance),
            NATIVE_SOL_MINT.toBase58(),
            !isLocal()
          )
        : getTokenAmountAndSymbolByTokenAddress(
            postTokenBalance ? postTokenBalance.uiTokenAmount.uiAmount || postBalance : postBalance,
            postTokenBalance ? postTokenBalance.mint || NATIVE_SOL.address : NATIVE_SOL.address,
            !isLocal()
          )
      : getTokenAmountAndSymbolByTokenAddress(
          getAmountFromLamports(postBalance),
          NATIVE_SOL.address,
          !isLocal()
        );
  }

  const doRelativeDate = (timestamp: number) => {
    return (
      <Moment date={timestamp} fromNow /> as JSX.Element
    );
  };

  const getTransactionItem = () => {
    const signature = props.transaction.signature?.toString();
    const blockTime = props.transaction.parsedTransaction.blockTime;

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
          <span>{getDisplayAmount()}</span>
        </div>
        <div className="std-table-cell responsive-cell pr-2 text-right">
          <span>{getDisplayPostBalance()}</span>
        </div>
        <div className="std-table-cell responsive-cell pl-2">
          {
            blockTime ? doRelativeDate(blockTime * 1000) : (
              <span>'unavailable'</span>
            )
          }
        </div>
      </a>
    );

  };

  return isTxRenderable ? getTransactionItem() : null;
};
