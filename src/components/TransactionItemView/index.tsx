import React, { useEffect, useState } from "react";
import { ArrowDownOutlined, ArrowUpOutlined, SwapOutlined } from "@ant-design/icons";
import { LAMPORTS_PER_SOL, ParsedMessageAccount, TokenBalance } from "@solana/web3.js";
import { NATIVE_SOL_MINT } from "../../utils/ids";
import { SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from "../../constants";
import { getSolanaExplorerClusterParam } from "../../contexts/connection";
import { getTokenAmountAndSymbolByTokenAddress, shortenAddress } from "../../utils/utils";
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

  const [isInboundTx, setIsInboundTx] = useState(false);
  const [isToMyAccounts, setIsToMyAccounts] = useState(false);
  const [hasTokenBalances, setHasTokenBalances] = useState(false);
  const [isScanningUserWallet, setIsScanningUserWallet] = useState(false);
  const [outDstAccountIndex, setOutDstAccountIndex] = useState(1);
  const [preBalance, setPreBalance] = useState(0);
  const [postBalance, setPostBalance] = useState(0);
  const [amountChange, setAmountChange] = useState(0);
  const [postTokenBalance, setPostTokenBalance] = useState<TokenBalance | null>(null);

  const isLocal = (): boolean => {
    return environment === 'local' ? true : false;
  }

  // Prepare some data
  useEffect(() => {

    const isToOneOfMyAccounts = (accounts: ParsedMessageAccount[]): boolean => {
      const filtered = props.tokenAccounts.filter(ta => ta.ataAddress !== props.accountAddress);
      const index = accounts.findIndex(a => filtered.some(t => t.ataAddress === a.pubkey.toBase58()));
      return index !== -1 ? true : false;
    }

    const getDestAccountIndex = (accounts: ParsedMessageAccount[]): number => {
      const filtered = props.tokenAccounts.filter(ta => ta.ataAddress !== props.accountAddress);
      const index = accounts.findIndex(a => filtered.some(t => t.ataAddress === a.pubkey.toBase58()));
      return index !== -1 ? index : 1;
    }

    if (props.transaction) {

      // Define some local vars
      let isInbound = true;
      let accountIndex = 0;
      let outDestAccountIndex = 1;
      let preBalance = 0;
      let postBalance = 0;
      let amount = 0;
      let preTkBalance: TokenBalance | null = null;
      let postTkBalance: TokenBalance | null = null;
      const meta = props.transaction.parsedTransaction.meta;
      const accounts = props.transaction.parsedTransaction.transaction.message.accountKeys;

      // Are we scanning a user token account or the user wallet?
      const isScanningWallet = props.accountAddress === props.selectedAsset?.ataAddress ? true : false;
      setIsScanningUserWallet(isScanningWallet);

      const tokensUsed = meta &&
        ((meta.preTokenBalances && meta.preTokenBalances.length) || (meta.postTokenBalances && meta.postTokenBalances.length))
        ? true
        : false;
      setHasTokenBalances(tokensUsed);

      // Set inbound/outbound flag
      if (props.accountAddress === accounts[0].pubkey.toBase58()) {
        isInbound = false;
      } else {
        isInbound = true;
      }
      setIsInboundTx(isInbound);

      if (!isInbound && isScanningWallet && tokensUsed) {
        const toMyOwnAccounts = isToOneOfMyAccounts(accounts);
        setIsToMyAccounts(toMyOwnAccounts);
        if (toMyOwnAccounts) {
          outDestAccountIndex = getDestAccountIndex(accounts);
          setOutDstAccountIndex(outDestAccountIndex);
        }
      } else {
        setIsToMyAccounts(false);
      }

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
          if (!isInbound) {
            accountIndex = outDestAccountIndex;
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
                  ? isInbound
                    ? post - pre
                    : isScanningWallet
                      ? meta.preBalances[0] - meta.postBalances[0]
                      : pre - post
                  : isInbound
                    ? meta.postBalances[1] - meta.preBalances[1]
                    : meta.preBalances[0] - meta.postBalances[0];

        preBalance = tokensUsed
                        ? isScanningWallet
                          ? isInbound
                            ? meta.postBalances[1]
                            : meta.postBalances[0]
                          : pre
                        : isInbound
                          ? meta.preBalances[1]
                          : meta.preBalances[0];

        postBalance = tokensUsed
                        ? isScanningWallet
                          ? isInbound
                            ? meta.postBalances[1]
                            : meta.postBalances[0]
                          : post
                        : isInbound
                          ? meta.postBalances[1]
                          : meta.postBalances[0];
      }

      setPostTokenBalance(postTkBalance);
      setPreBalance(preBalance);
      setPostBalance(postBalance);
      setAmountChange(amount);
    }
  }, [props]);

  const getTxIcon = () => {
    if (isInboundTx) {
      return (
        <ArrowDownOutlined className="mean-svg-icons incoming downright" />
      );
    } else {
      if (isScanningUserWallet) {
        if (hasTokenBalances) {
          if (isToMyAccounts) {
            return (
              <ArrowUpOutlined className="mean-svg-icons upright" />
            );
          } else {
            return (
              <IconGasStation className="mean-svg-icons gas-station warning" />
            );
          }
        } else {
          return (
            <ArrowUpOutlined className="mean-svg-icons outgoing upright" />
          );
        }
      } else {
        return (
          <ArrowUpOutlined className="mean-svg-icons outgoing upright" />
        );
      }
    }
  }

  const isAmountNegative = (): boolean => {
    return postBalance < preBalance ? true : false;
  }

  const getTxDescription = (shorten = true): string => {
    const trans = props.transaction.parsedTransaction.transaction.message;
    const faucetAddress = '9B5XszUGdMaxCZ7uSQhPzdks5ZQSmWxrmzCSvtJ6Ns6g';
    const sender = trans.accountKeys[0].pubkey.toBase58();
    const receiver = isScanningUserWallet &&
                     !isInboundTx &&
                     hasTokenBalances &&
                     isToMyAccounts
                      ? trans.accountKeys[outDstAccountIndex].pubkey.toBase58()
                      : trans.accountKeys[1].pubkey.toBase58();
    const wallet = (trans.instructions[0] as any)?.parsed?.info?.wallet as string || '';

    // Log what we have
    // if (!isInboundTx) {
    //   console.log(`isScanningUserWallet: ${isScanningUserWallet}\nisInboundTx: ${isInboundTx}\nhasTokenBalances: ${hasTokenBalances}\nisToMyAccounts: ${isToMyAccounts}\noutDstAccountIndex: ${outDstAccountIndex}\ntokenAccount: ${trans.accountKeys[outDstAccountIndex].pubkey.toBase58()}`);
    // }

    if (isInboundTx) {
      if (sender === faucetAddress) {
        return 'Account airdrop';
      }
      return shorten ? shortenAddress(sender, 6) : sender;
    } else {
      return shorten ? shortenAddress(wallet || receiver, 6) : receiver;
    }
  }

  const getAmountFromLamports = (amount: number): number => {
    return (amount || 0) / LAMPORTS_PER_SOL;
  }

  const getTransactionItems = () => {
    const signature = props.transaction.signature?.toString();
    const blockTime = props.transaction.parsedTransaction.blockTime;

    const getDisplayAmount = (): string => {
      const displayAmount =
        postTokenBalance
          ? isScanningUserWallet
            ? getTokenAmountAndSymbolByTokenAddress(
                getAmountFromLamports(Math.abs(amountChange)),
                NATIVE_SOL.address,
                !isLocal()
              )
            : getTokenAmountAndSymbolByTokenAddress(
                Math.abs(amountChange),
                postTokenBalance.mint,
                !isLocal()
              )
          : getTokenAmountAndSymbolByTokenAddress(
              getAmountFromLamports(Math.abs(amountChange)),
              NATIVE_SOL_MINT.toBase58(),
              !isLocal()
            );
      return isAmountNegative() ? '-' + displayAmount : displayAmount;
    }

    const getDisplayPostBalance = (): string => {
      return postTokenBalance
        ? isScanningUserWallet
          ? getTokenAmountAndSymbolByTokenAddress(
              getAmountFromLamports(Math.abs(postBalance)),
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

    if (isScanningUserWallet && isInboundTx && hasTokenBalances) {
      return null;
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
