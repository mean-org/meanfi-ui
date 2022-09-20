import React, { useCallback, useContext, useEffect, useState } from 'react';
import { environment } from '../../environments/environment';
import { Button, Drawer, Modal } from "antd";
import { useTranslation } from "react-i18next";
import { getNetworkIdByEnvironment, useConnection } from '../../contexts/connection';
import { useWallet } from '../../contexts/wallet';
import { AppStateContext } from '../../contexts/appstate';
import { useNativeAccount, useUserAccounts } from '../../contexts/accounts';
import { CUSTOM_TOKEN_NAME, MAX_TOKEN_LIST_ITEMS } from '../../constants';
import { AccountInfo, Connection, LAMPORTS_PER_SOL, ParsedAccountData, PublicKey } from '@solana/web3.js';
import { consoleOut, isProd, isValidAddress } from '../../middleware/ui';
import { LoadingOutlined } from '@ant-design/icons';
import { AccountTokenParsedInfo } from "../../models/accounts";
import { TokenInfo } from '@solana/spl-token-registry';
import { NATIVE_SOL } from '../../constants/tokens';
import { TokenListItem } from '../TokenListItem';
import { TextInput } from '../TextInput';
import { TokenDisplay } from '../TokenDisplay';
import { TransactionFees } from '@mean-dao/msp';
import { getAmountFromLamports, shortenAddress } from '../../middleware/utils';
import { MultisigInfo } from '@mean-dao/mean-multisig-sdk';

export const MultisigAddAssetModal = (props: {
  connection: Connection;
  handleOk: any;
  handleClose: any;
  isVisible: boolean;
  ownedTokenAccounts: AccountTokenParsedInfo[] | undefined;
  isBusy: boolean;
  selectedMultisig: MultisigInfo | undefined;
}) => {
  const { isVisible, handleClose, handleOk, ownedTokenAccounts, isBusy, selectedMultisig } = props;
  const { t } = useTranslation("common");
  const connection = useConnection();
  const { publicKey } = useWallet();
  const {
    tokenList,
    splTokenList,
  } = useContext(AppStateContext);

  const { account } = useNativeAccount();
  const { tokenAccounts } = useUserAccounts();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [tokenFilter, setTokenFilter] = useState("");
  const [filteredTokenList, setFilteredTokenList] = useState<TokenInfo[]>([]);
  const [selectedList, setSelectedList] = useState<TokenInfo[]>([]);
  const [transactionFees] = useState<TransactionFees>({
    blockchainFee: 5000 / LAMPORTS_PER_SOL,
    mspFlatFee: 0.00001,
    mspPercentFee: 0
  });
  const [feeAmount] = useState<number>(transactionFees.blockchainFee + transactionFees.mspFlatFee);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | undefined>(undefined);
  const [isTokenSelectorVisible, setIsTokenSelectorVisible] = useState(false);

  // Callbacks

  // Updates the token list everytime is filtered
  const updateTokenListByFilter = useCallback((searchString: string) => {

    if (!selectedList) {
      return;
    }

    const timeout = setTimeout(() => {

      const filter = (t: any) => {
        return (
          t.symbol.toLowerCase().includes(searchString.toLowerCase()) ||
          t.name.toLowerCase().includes(searchString.toLowerCase()) ||
          t.address.toLowerCase().includes(searchString.toLowerCase())
        );
      };

      const showFromList = !searchString 
        ? selectedList
        : selectedList.filter((t: any) => filter(t));

      setFilteredTokenList(showFromList);

    });

    return () => { 
      clearTimeout(timeout);
    }

  }, [selectedList]);

  // Effects

  // Build the token list when the modal becomes visible
  useEffect(() => {
    if (isVisible && ownedTokenAccounts) {
      const finalList = new Array<TokenInfo>();

      // Make a copy of the MeanFi favorite tokens
      const meanTokensCopy = JSON.parse(JSON.stringify(tokenList)) as TokenInfo[];

      // Add all other items but excluding those in meanTokensCopy (only in mainnet)
      if (isProd()) {
        splTokenList.forEach(item => {
          if (!meanTokensCopy.some(t => t.address === item.address)) {
            meanTokensCopy.push(item);
          }
        });
      }

      // Build a token list excluding already owned token accounts
      meanTokensCopy.forEach(item => {
        if (!ownedTokenAccounts.some(t => t.parsedInfo.mint === item.address)) {
          finalList.push(item);
        }
      });

      setSelectedList(finalList);
      consoleOut('token list:', finalList, 'blue');
    }
  }, [isVisible, ownedTokenAccounts, splTokenList, tokenList, tokenAccounts]);

  // Keep account balance updated
  useEffect(() => {
    if (account?.lamports !== previousBalance || !nativeBalance) {
      setNativeBalance(getAmountFromLamports(account?.lamports));
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [
    account,
    nativeBalance,
    previousBalance,
  ]);

  // First time token list
  useEffect(() => {
    if (selectedList.length > 0 && !tokenFilter && filteredTokenList.length === 0) {
      consoleOut('Initializing filtered list...', '', 'blue');
      updateTokenListByFilter('');
    }
  }, [filteredTokenList.length, selectedList.length, tokenFilter, updateTokenListByFilter]);

  // Events and actions

  const setModalBodyMinHeight = useCallback((addMinHeight: boolean) => {
    const modalBody = document.querySelector(".exchange-modal .ant-modal-content");
    if (modalBody) {
      if (addMinHeight) {
        modalBody.classList.add('drawer-open');
      } else {
        modalBody.classList.remove('drawer-open');
      }
    }
  }, []);

  const autoFocusInput = useCallback(() => {
    const input = document.getElementById("token-search-otp");
    if (input) {
      setTimeout(() => {
        input.focus();
      }, 100);
    }
  }, []);

  const showTokenSelector = useCallback(() => {
    setIsTokenSelectorVisible(true);
    setModalBodyMinHeight(true);
    autoFocusInput();
  }, [autoFocusInput, setModalBodyMinHeight]);

  const onCloseTokenSelector = useCallback(() => {
    setIsTokenSelectorVisible(false);
    setModalBodyMinHeight(false);
    if (tokenFilter && !isValidAddress(tokenFilter)) {
      setTokenFilter('');
    }
  }, [setModalBodyMinHeight, tokenFilter]);

  const onInputCleared = useCallback(() => {
    setTokenFilter('');
    updateTokenListByFilter('');
    setSelectedToken(undefined);
  },[
    updateTokenListByFilter
  ]);

  const onTokenSearchInputChange = useCallback((e: any) => {

    const newValue = e.target.value;
    setTokenFilter(newValue);
    updateTokenListByFilter(newValue);

  },[
    updateTokenListByFilter
  ]);

  const onAcceptModal = () => {
    handleOk({ token: selectedToken });
  }

  const isTokenAlreadyOwned = useCallback(() => {

    if (!selectedToken || !ownedTokenAccounts) { return false; }

    return ownedTokenAccounts.some(ta => selectedToken.address === ta.parsedInfo.mint);

  },[ownedTokenAccounts, selectedToken]);

  // Validation

  const isOperationValid = (): boolean => {
    return publicKey &&
           selectedMultisig &&
           nativeBalance &&
           nativeBalance > feeAmount &&
           selectedToken &&
           selectedToken.decimals >= 0 &&
           !isTokenAlreadyOwned()
      ? true
      : false;
  };

  const getCtaLabel = () => {
    return !publicKey
      ? t('transactions.validation.not-connected')
      : nativeBalance === 0
        ? t('transactions.validation.amount-sol-low')
        : nativeBalance < feeAmount
          ? t('transactions.validation.amount-sol-low')
          : !selectedToken
            ? 'No asset selected'
            : isTokenAlreadyOwned() || selectedToken.decimals < 0
              ? 'Invalid selection'
              : t('multisig.create-asset.main-cta');
  }

  const renderTokenList = (
    <>
      {(filteredTokenList.length > 0) && (
        filteredTokenList.map((t, index) => {

          if (t.address === NATIVE_SOL.address) {
            return null;
          }

          const onClick = function () {
            setSelectedToken(t);
            consoleOut("token selected:", t.symbol, 'blue');
            onCloseTokenSelector();
          };

          if (index < MAX_TOKEN_LIST_ITEMS) {
            return (
              <TokenListItem
                key={t.address}
                name={t.name || CUSTOM_TOKEN_NAME}
                mintAddress={t.address}
                token={t}
                className={selectedToken && selectedToken.address === t.address ? "selected" : "simplelink"}
                onClick={onClick}
                balance={0}
              />
            );
          } else {
            return null;
          }
        })
      )}
    </>
  );

  const renderTokenSelectorInner = (
    <div className="token-selector-wrapper">
      <div className="token-search-wrapper">
        <TextInput
          id="token-search-otp"
          value={tokenFilter}
          allowClear={true}
          extraClass="mb-2"
          onInputClear={onInputCleared}
          placeholder={t('token-selector.lookup-add-asset-input-placeholder')}
          onInputChange={onTokenSearchInputChange}
          error={
            tokenFilter && selectedToken && selectedToken.decimals === -1
              ? 'Account not found'
              : tokenFilter && selectedToken && selectedToken.decimals === -2
                ? 'Account is not a token mint'
                : ''
          }
        />
      </div>
      <div className="token-list">
        {filteredTokenList.length > 0 && renderTokenList}
        {(tokenFilter && isValidAddress(tokenFilter) && filteredTokenList.length === 0) && (
          <TokenListItem
            key={tokenFilter}
            name={CUSTOM_TOKEN_NAME}
            mintAddress={tokenFilter}
            className={selectedToken && selectedToken.address === tokenFilter ? "selected" : "simplelink"}
            onClick={async () => {
              const address = tokenFilter;
              let decimals = -1;
              let accountInfo: AccountInfo<Buffer | ParsedAccountData> | null = null;
              try {
                accountInfo = (await connection.getParsedAccountInfo(new PublicKey(address))).value;
                consoleOut('accountInfo:', accountInfo, 'blue');
              } catch (error) {
                console.error(error);
              }
              if (accountInfo) {
                if ((accountInfo as any).data["program"] &&
                    (accountInfo as any).data["program"] === "spl-token" &&
                    (accountInfo as any).data["parsed"] &&
                    (accountInfo as any).data["parsed"]["type"] &&
                    (accountInfo as any).data["parsed"]["type"] === "mint") {
                  decimals = (accountInfo as any).data["parsed"]["info"]["decimals"];
                } else {
                  decimals = -2;
                }
              }
              const uknwnToken: TokenInfo = {
                address,
                name: CUSTOM_TOKEN_NAME,
                chainId: getNetworkIdByEnvironment(environment),
                decimals,
                symbol: shortenAddress(address),
              };
              setSelectedToken(uknwnToken);
              consoleOut("token selected:", uknwnToken, 'blue');
              // Do not close on errors (-1 or -2)
              if (decimals >= 0) {
                onCloseTokenSelector();
              }
            }}
            balance={0}
          />
        )}
      </div>
    </div>
  );

  return (
    <Modal
      className="mean-modal simple-modal unpadded-content exchange-modal"
      title={<div className="modal-title">Create a multisig asset</div>}
      footer={null}
      maskClosable={false}
      visible={isVisible}
      onOk={handleOk}
      onCancel={handleClose}
      width={370}>

      <div className="px-4 pb-3">
        {/* Asset picker */}
        <div className="form-label">Select token</div>
        <div className={`well ${(!selectedMultisig || isBusy) ? "disabled" : ""}`}>
          <div className="flex-fixed-left">
            <div className="left">
              <span className="add-on simplelink">
                {selectedToken ? (
                  <TokenDisplay
                    onClick={showTokenSelector}
                    mintAddress={selectedToken.address}
                    name={selectedToken.name}
                    showCaretDown={true}
                    showName={selectedToken.name === CUSTOM_TOKEN_NAME ? true : false}
                    fullTokenInfo={selectedToken}
                  />
                ) : (
                  <TokenDisplay
                    onClick={showTokenSelector}
                    mintAddress=""
                    noTokenLabel={t('swap.token-select-destination')}
                    showCaretDown={true}
                  />
                )}
              </span>
            </div>
            <div className="right">&nbsp;</div>
          </div>
          {isTokenAlreadyOwned() ? (
            <span className="form-field-error">You already own this asset</span>
          ) : selectedToken && selectedToken.decimals === -1 ? (
            <span className="form-field-error">Account not found</span>
          ) : selectedToken && selectedToken.decimals === -2 ? (
            <span className="form-field-error">Account is not a token mint</span>
          ) : null}
        </div>

        <Button
          className={`main-cta ${isBusy ? 'inactive' : ''}`}
          block
          type="primary"
          shape="round"
          size="large"
          disabled={!isOperationValid() || isBusy || !selectedMultisig}
          onClick={onAcceptModal}>
          {(isBusy || !selectedMultisig) && (
              <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
          )}
          {!selectedMultisig 
            ? "Initializing..."
            : isBusy
              ? "Creating asset..."
              : getCtaLabel()
          }
        </Button>

      </div>

      <Drawer
        title="Select an asset"
        placement="bottom"
        closable={true}
        onClose={onCloseTokenSelector}
        open={isTokenSelectorVisible}
        getContainer={false}
        style={{ position: 'absolute' }}>
        {renderTokenSelectorInner}
      </Drawer>

    </Modal>
  );
};
