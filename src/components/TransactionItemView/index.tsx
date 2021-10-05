import React, { useEffect, useState } from "react";
import { ArrowDownOutlined, ArrowUpOutlined } from "@ant-design/icons";
import { ParsedConfirmedTransactionMeta, ParsedMessageAccount, PublicKey, TokenBalance } from "@solana/web3.js";
import { NATIVE_SOL_MINT } from "../../utils/ids";
import { SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from "../../constants";
import { getSolanaExplorerClusterParam } from "../../contexts/connection";
import { getAmountFromLamports, getTokenAmountAndSymbolByTokenAddress, shortenAddress } from "../../utils/utils";
import { UserTokenAccount } from "../../models/transactions";
import { NATIVE_SOL } from "../../utils/tokens";
import { Tooltip } from "antd";
import Moment from "react-moment";
import { MappedTransaction } from "../../utils/history";
import { IconGasStation } from "../../Icons";
import { environment } from "../../environments/environment";

export const TransactionItemView = (props: {
  accountAddress: string;
  selectedAsset: UserTokenAccount | undefined;
  transaction: MappedTransaction;
  tokenAccounts: UserTokenAccount[];
}) => {

  const [isOutboundTx, setIsOutbound] = useState(false);
  const [isFeeOnlyTx, setIsFeeOnlyTx] = useState(false);
  const [hasTokenBalances, setHasTokenBalances] = useState(false);
  const [isScanningUserWallet, setIsScanningUserWallet] = useState(false);
  const [outDstAccountIndex, setOutDstAccountIndex] = useState(1);
  const [postBalance, setPostBalance] = useState(0);
  const [amountChange, setAmountChange] = useState(0);
  const [postTokenBalance, setPostTokenBalance] = useState<TokenBalance | null>(null);

  // User account being scanned
  const [myAccountAmountChange, setMyAccountAmountChange] = useState(0);

  const isLocal = (): boolean => {
    return environment === 'local' ? true : false;
  }

  useEffect(() => {

    const isOneOfMyAccounts = (acc: PublicKey): boolean => {
      return props.tokenAccounts.some(ta => ta.ataAddress !== props.accountAddress && ta.ataAddress === acc.toBase58());
    }

    const getAmountChangeForAssocTokenAccount = (accountIndex: number, meta: ParsedConfirmedTransactionMeta | null): number => {
      let preTkBalance: TokenBalance | null = null;
      let postTkBalance: TokenBalance | null = null;
      let post = 0;
      let pre = 0;

      if (meta) {
        preTkBalance = meta.preTokenBalances && meta.preTokenBalances.length
          ? meta.preTokenBalances.filter(b => b.accountIndex === accountIndex)[0] || null
          : null;
        pre = preTkBalance ? preTkBalance.uiTokenAmount.uiAmount || 0 : 0;

        postTkBalance = meta.postTokenBalances && meta.postTokenBalances.length
          ? meta.postTokenBalances.filter(b => b.accountIndex === accountIndex)[0] || null
          : null;
        post = postTkBalance ? postTkBalance.uiTokenAmount.uiAmount || 0 : 0;
        return post - pre;
      }

      return 0;
    }

    if (props.transaction) {

      // Define some local vars
      let isOutbound = true;
      let accountIndex = 0;
      let postBalance = 0;
      let amount = 0;
      let preTkBalance: TokenBalance | null = null;
      let postTkBalance: TokenBalance | null = null;
      const meta = props.transaction.parsedTransaction.meta;
      const accounts = props.transaction.parsedTransaction.transaction.message.accountKeys;

      // Are we scanning a user token account or the user wallet?
      const isScanningWallet = props.accountAddress === props.selectedAsset?.ataAddress ? true : false;
      setIsScanningUserWallet(isScanningWallet);

      // Indicate that tokens were used if it matters
      const tokensUsed = meta &&
        ((meta.preTokenBalances && meta.preTokenBalances.length) || (meta.postTokenBalances && meta.postTokenBalances.length))
        ? true
        : false;
      setHasTokenBalances(tokensUsed);

      // Token accounts with balance change
      const tokenAccountsWithChanges = accounts.filter((a: ParsedMessageAccount, index: number) =>
        isOneOfMyAccounts(a.pubkey) &&
        getAmountChangeForAssocTokenAccount(index, meta) !== 0
      );
      const firstTokenAccountsWithChangesAccountIndex = accounts.findIndex((a: ParsedMessageAccount, index: number) =>
        isOneOfMyAccounts(a.pubkey) &&
        getAmountChangeForAssocTokenAccount(index, meta) !== 0
      );
      setOutDstAccountIndex(firstTokenAccountsWithChangesAccountIndex || 1);

      // Set flag if account address acted only as Tx fee payer
      const feeOnlyTx = isOutbound && tokenAccountsWithChanges.length >= 2;
      setIsFeeOnlyTx(feeOnlyTx);

      // Set outbound flag
      if (props.accountAddress === accounts[0].pubkey.toBase58()) {
        isOutbound = true;
      } else {
        isOutbound = false;
      }
      setIsOutbound(isOutbound);

      // Balances for user account being scanned
      accountIndex = accounts.findIndex(acc => acc.pubkey.toBase58() === props.accountAddress);
      if (meta && accountIndex !== -1) {
        const post = meta.postBalances[accountIndex] || 0;
        const pre = meta.preBalances[accountIndex] || 0;
        const change = post - pre;
        setMyAccountAmountChange(change);
      } else {
        setMyAccountAmountChange(0);
      }

      // Select token account to use
      if (tokensUsed) {
        if (props.accountAddress !== props.selectedAsset?.ataAddress) {
          const index = accounts.findIndex(a => a.pubkey.toBase58() === props.selectedAsset?.ataAddress);
          if (index !== -1) {
            accountIndex = accounts.findIndex(a => a.pubkey.toBase58() === props.selectedAsset?.ataAddress);
          }
        } else {
          if (isOutbound) {
            accountIndex = firstTokenAccountsWithChangesAccountIndex !== -1 ? firstTokenAccountsWithChangesAccountIndex : 1;
          } else {
            const ptb = meta?.postTokenBalances && meta.postTokenBalances.length
              ? meta.postTokenBalances[0]
              : null;
            if (ptb) {
              accountIndex = ptb.accountIndex;
            }
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
                  ? isOutbound
                    ? isScanningWallet
                      ? meta.preBalances[0] - meta.postBalances[0]
                      : pre - post
                    : post - pre
                  : isOutbound
                    ? meta.preBalances[0] - meta.postBalances[0]
                    : meta.postBalances[1] - meta.preBalances[1];

        postBalance = tokensUsed
                        ? isScanningWallet
                          ? isOutbound
                            ? meta.postBalances[0]
                            : meta.postBalances[1]
                          : post
                        : isOutbound
                          ? meta.postBalances[0]
                          : meta.postBalances[1];
      }

      setPostTokenBalance(postTkBalance);
      setPostBalance(postBalance);
      setAmountChange(amount);

    }
  }, [props]);

  const getTxIcon = () => {
    if (isFeeOnlyTx) {
      return (
        <IconGasStation className="mean-svg-icons gas-station warning" />
      );
    } else if (myAccountAmountChange > 0) {
      return (
        <ArrowDownOutlined className="mean-svg-icons incoming downright" />
      );
    } else {
      return (
        <ArrowUpOutlined className="mean-svg-icons outgoing upright" />
      );
    }
  }

  const getTxDescription = (shorten = true): string => {
    const accounts = props.transaction.parsedTransaction.transaction.message.accountKeys;
    const faucetAddress = '9B5XszUGdMaxCZ7uSQhPzdks5ZQSmWxrmzCSvtJ6Ns6g';
    // Sender is always account 0 = Fee payer
    const sender = accounts[0].pubkey.toBase58();
    // Receiver could be any account TODO: Polish this logic
    const receiver = isScanningUserWallet &&
                     isOutboundTx &&
                     hasTokenBalances
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
        ? isScanningUserWallet
          ? getTokenAmountAndSymbolByTokenAddress(
              getAmountFromLamports(amountChange),
              NATIVE_SOL.address,
              !isLocal()
            )
          : getTokenAmountAndSymbolByTokenAddress(
              amountChange,
              postTokenBalance.mint,
              !isLocal()
            )
        : getTokenAmountAndSymbolByTokenAddress(
            getAmountFromLamports(amountChange),
            NATIVE_SOL_MINT.toBase58(),
            !isLocal()
          );
    return displayAmount;
  }

  const getDisplayPostBalance = (): string => {
    return postTokenBalance
      ? isScanningUserWallet
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

  const getTransactionItems = () => {
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
            blockTime ? (
              <Moment date={blockTime * 1000} fromNow />
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
