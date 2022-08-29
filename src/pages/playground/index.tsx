import React, { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PreFooter } from "../../components/PreFooter";
import { AppStateContext } from "../../contexts/appstate";
import "./style.scss";
import {
  ArrowRightOutlined,
} from "@ant-design/icons";
import {
  Button,
  Divider,
  Modal,
  Space,
  Tooltip,
} from "antd";
import {
  delay,
  consoleOut,
  kFormatter,
  intToString,
  isValidAddress,
  friendlyDisplayDecimalPlaces,
} from "../../middleware/ui";
import {
  fetchAccountTokens,
  formatAmount,
  formatThousands,
  getTokenAmountAndSymbolByTokenAddress,
  makeDecimal,
  shortenAddress,
} from "../../middleware/utils";
import { IconCoin, IconCopy, IconExternalLink, IconTrash, IconWallet } from "../../Icons";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { openNotification } from "../../components/Notifications";
import { IconType } from "antd/lib/notification";
import { AccountInfo, LAMPORTS_PER_SOL, ParsedAccountData, PublicKey } from "@solana/web3.js";
import { useConnection } from "../../contexts/connection";
import { SYSTEM_PROGRAM_ID } from "../../middleware/ids";
import { AddressDisplay } from "../../components/AddressDisplay";
import { BN } from "bn.js";
import { TokenDisplay } from "../../components/TokenDisplay";
import { useWallet } from "../../contexts/wallet";
import { TokenInfo } from "@solana/spl-token-registry";
import { CUSTOM_TOKEN_NAME, MAX_TOKEN_LIST_ITEMS } from "../../constants";
import { TokenListItem } from "../../components/TokenListItem";
import { TextInput } from "../../components/TextInput";
import { useNativeAccount } from "../../contexts/accounts";
import { NATIVE_SOL } from "../../middleware/tokens";

type TabOption = "first-tab" | "test-stream" | "second-tab" | "demo-notifications" | "misc-tab" | undefined;

const CRYPTO_VALUES: number[] = [
  0.0004, 0.000003, 0.00000012345678, 1200.5, 1500.000009, 100500.000009226,
  7131060.641513,
];

const NUMBER_OF_ITEMS: number[] = [
  0, 1, 99, 157, 679, 1000, 1300, 1550, 99600, 154350, 600000, 1200000
];

const sampleMultisig = 'H2r15H4hFn7xV5PQtnatqJaHo6ybM8qd1i5WnaadE1aX';

export const PlaygroundView = () => {
  const { t } = useTranslation("common");
  const location = useLocation();
  const navigate = useNavigate();
  const connection = useConnection();
  const { publicKey, connected } = useWallet();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    tokenList,
    userTokens,
    splTokenList,
    recipientAddress,
    setHighLightableMultisigId,
    getTokenPriceBySymbol,
    setRecipientAddress,
    setEffectiveRate,
  } = useContext(AppStateContext);
  const { account } = useNativeAccount();
  const [userBalances, setUserBalances] = useState<any>();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [currentTab, setCurrentTab] = useState<TabOption>(undefined);
  const [parsedAccountInfo, setParsedAccountInfo] = useState<AccountInfo<ParsedAccountData> | null>(null);
  const [accountInfo, setAccountInfo] = useState<AccountInfo<Buffer> | null>(null);
  const [accountNotFound, setAccountNotFound] = useState<string>('');
  const [tokenFilter, setTokenFilter] = useState("");
  const [filteredTokenList, setFilteredTokenList] = useState<TokenInfo[]>([]);
  const [selectedList, setSelectedList] = useState<TokenInfo[]>([]);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | undefined>(undefined);
  const [canFetchTokenAccounts, setCanFetchTokenAccounts] = useState<boolean>(splTokenList ? true : false);
  const [streamId, setStreamId] = useState<string>("");


  ///////////////
  //  Actions  //
  ///////////////

  const navigateToTab = useCallback((tab: TabOption) => {
    setSearchParams({option: tab as string});
  }, [setSearchParams]);

  const getParsedAccountType = (acc: AccountInfo<ParsedAccountData>) => {
    if (acc.owner.equals(SYSTEM_PROGRAM_ID)) {
      return 'System Owned Account';
    } else if (acc.executable) {
      return 'Program';
    } else {
      if (acc.data.program === 'spl-token') {
        return acc.data.parsed.type === 'mint' ? 'Token Mint' : 'Token Account';
      } else {
        return 'PDA (Program Derived Address) account';
      }
    }
  }

  const readAccountInfo = useCallback(async (address?: string) => {
    if (!recipientAddress && !address) {
      return;
    }

    const scanAddress = address || recipientAddress;
    if (!isValidAddress(scanAddress)) {
      return;
    }

    let accInfo: AccountInfo<Buffer | ParsedAccountData> | null = null;
    try {
      accInfo = (await connection.getParsedAccountInfo(new PublicKey(scanAddress))).value;
    } catch (error) {
      console.error(error);
    }
    if (accInfo) {
      if (!(accInfo as any).data["parsed"]) {
        const info = Object.assign({}, accInfo, {
          owner: accInfo.owner.toString()
        }) as AccountInfo<Buffer>;
        consoleOut('Normal accountInfo', info, 'blue');
        setAccountInfo(accInfo as AccountInfo<Buffer>);
        setParsedAccountInfo(null);
      } else {
        const info = Object.assign({}, accInfo, {
          owner: accInfo.owner.toString()
        }) as AccountInfo<ParsedAccountData>;
        consoleOut('Parsed accountInfo:', info, 'blue');
        setAccountInfo(null);
        setParsedAccountInfo(accInfo as AccountInfo<ParsedAccountData>);
      }
      setAccountNotFound('');
    } else {
      setAccountNotFound('Account info not available for this address');
    }
  }, [connection, recipientAddress]);

  const triggerWindowResize = () => {
    window.dispatchEvent(new Event('resize'));
  }

  const handleRecipientAddressChange = (e: any) => {
    const inputValue = e.target.value as string;
    // Set the input value
    const trimmedValue = inputValue.trim();
    setRecipientAddress(trimmedValue);
  }

  const handleStreamIdChange = (e: any) => {
    const inputValue = e.target.value as string;
    // Set the input value
    const trimmedValue = inputValue.trim();
    setStreamId(trimmedValue);
  }

  const handleRecipientAddressFocusIn = () => {
    setTimeout(() => {
      triggerWindowResize();
    }, 10);
  }

  const handleRecipientAddressFocusOut = () => {
    setTimeout(() => {
      triggerWindowResize();
    }, 10);
  }

  const onClearResults = () => {
    setAccountInfo(null);
    setParsedAccountInfo(null);
    setRecipientAddress('');
  }

  const onClearStreamId = () => {
    setStreamId('');
  }

  const onScanMyAddress = () => {
    if (publicKey) {
      setRecipientAddress(publicKey.toBase58());
      readAccountInfo(publicKey.toBase58());
    }
  }

  const onScanAssetAddress = (asset: TokenInfo) => {
    if (asset) {
      setRecipientAddress(asset.address);
      readAccountInfo(asset.address);
    }
  }

  const autoFocusInput = useCallback(() => {
    const input = document.getElementById("token-search-otp");
    if (input) {
      setTimeout(() => {
        input.focus();
      }, 100);
    }
  }, []);

  // Token selection modal
  const [isTokenSelectorModalVisible, setTokenSelectorModalVisibility] = useState(false);

  const showTokenSelector = useCallback(() => {
    setTokenSelectorModalVisibility(true);
    autoFocusInput();
  }, [autoFocusInput]);

  const onCloseTokenSelector = useCallback(() => {
    setTokenSelectorModalVisibility(false);
    if (tokenFilter && !isValidAddress(tokenFilter)) {
      setTokenFilter('');
    }
  }, [tokenFilter]);

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

  const onInputCleared = useCallback(() => {
    setTokenFilter('');
    updateTokenListByFilter('');
  }, [
    updateTokenListByFilter
  ]);

  const onTokenSearchInputChange = useCallback((e: any) => {

    const newValue = e.target.value;
    setTokenFilter(newValue);
    updateTokenListByFilter(newValue);

  }, [
    updateTokenListByFilter
  ]);

  // const getTopJupiterTokensByVolume = useCallback(() => {
  //   fetch('https://cache.jup.ag/stats/month')
  //     .then(res => {
  //       if (res.status >= 400) {
  //         throw new Error("Bad response from server");
  //       }
  //       return res.json();
  //     })
  //     .then(data => {
  //       // Only get tokens with volume for more than 1000 USD a month
  //       const tokens = data.lastXTopTokens.filter((s: any) => s.amount >= 1000);
  //       const topTokens = Array<any>();
  //       if (tokens && tokens.length > 0) {
  //         tokens.forEach((element: any) => {
  //           const token = splTokenList.find(t => t.symbol === element.symbol);
  //           if (token) {
  //             topTokens.push({
  //               name: token.name,
  //               symbol: token.symbol,
  //               address: token.address,
  //               decimals: token.decimals
  //             });
  //           }
  //         });
  //         consoleOut('Tokens with volume over 1000 USD:', tokens.length, 'crimson');
  //         consoleOut('Added to list of top tokens:', topTokens.length, 'crimson');
  //         consoleOut('topTokens:', topTokens, 'crimson');
  //       }
  //     })
  //     .catch(err => {
  //       console.error(err);
  //     });
  // }, [splTokenList]);

  const notificationTwo = () => {
    consoleOut("Notification is closing...");
    openNotification({
      type: "info",
      description: t(
        "treasuries.create-treasury.multisig-treasury-created-instructions"
      ),
      duration: null,
    });
    navigate("/custody");
  };

  const sequentialMessagesAndNavigate = () => {
    openNotification({
      type: "info",
      description: t(
        "treasuries.create-treasury.multisig-treasury-created-info"
      ),
      handleClose: notificationTwo,
    });
  };

  const stackedMessagesAndNavigate = async () => {
    openNotification({
      type: "info",
      description: t(
        "treasuries.create-treasury.multisig-treasury-created-info"
      ),
      duration: 10,
    });
    await delay(1500);
    openNotification({
      type: "info",
      description: t(
        "treasuries.create-treasury.multisig-treasury-created-instructions"
      ),
      duration: null,
    });
    navigate("/custody");
  };

  const reuseNotification = (key?: string) => {
    openNotification({
      key,
      type: "info",
      title: 'Mission assigned',
      duration: 0,
      description: <span>Your objective is to wait for 5 seconds</span>
    });
    setTimeout(() => {
      openNotification({
        key,
        type: "success",
        title: 'Mission updated',
        duration: 3,
        description: <span>Objective completed!</span>,
      });
    }, 5000);
  };

  const showNotificationByType = (type: IconType, hasCta = false) => {
    if (!hasCta) {
      openNotification({
        type,
        title: 'Notification Title',
        duration: 0,
        description: <span>Lorem, ipsum dolor sit amet consectetur adipisicing elit. Natus, ullam perspiciatis accusamus, sunt ipsum asperiores similique cupiditate autem veniam explicabo earum voluptates!</span>
      });
      return;
    }
    openNotification({
      type,
      title: 'Notification Title',
      duration: 0,
      description: (
        <>
          <div className="mb-1">This notification is meant to have an additional CTA to perform another action!</div>
          <Button
            type="primary"
            size="small"
            shape="round"
            className="extra-small"
            onClick={() => {
              const url = `/multisig/${sampleMultisig}?v=proposals`;
              setHighLightableMultisigId(sampleMultisig);
              navigate(url);
            }}>
            See proposals
          </Button>
        </>
      ),
    });
  };

  const interestingCase = () => {
    openNotification({
      type: "info",
      description: t("treasuries.create-treasury.multisig-treasury-created-info"),
      duration: 0
    });
  };

  /////////////////////
  // Data management //
  /////////////////////

  // Process routes
  useEffect(() => {
    let optionInQuery: string | null = null;
    // Get the option if passed-in
    if (searchParams) {
      optionInQuery = searchParams.get('option');
      consoleOut('searchParams:', searchParams.toString(), 'crimson');
      consoleOut('option:', searchParams.get('option'), 'crimson');
    }
    // Pre-select an option
    switch (optionInQuery as TabOption) {
      case "first-tab":
        setCurrentTab("first-tab");
        break;
      case "test-stream":
        setCurrentTab("test-stream");
        break;
      case "second-tab":
        setCurrentTab("second-tab");
        break;
      case "demo-notifications":
        setCurrentTab("demo-notifications");
        break;
      case "misc-tab":
        setCurrentTab("misc-tab");
        break;
      default:
        setCurrentTab("first-tab");
        setSearchParams({option: "first-tab"}, { replace: true });
        break;
    }
  }, [location.search, searchParams, setSearchParams]);

  // Keep account balance updated
  useEffect(() => {

    const getAccountBalance = (): number => {
      return (account?.lamports || 0) / LAMPORTS_PER_SOL;
    }

    if (account?.lamports !== previousBalance || !nativeBalance) {
      setNativeBalance(getAccountBalance());
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [
    account,
    nativeBalance,
    previousBalance,
  ]);

  // Automatically update all token balances and rebuild token list
  useEffect(() => {

    if (!connection) {
      console.error('No connection');
      return;
    }

    if (!publicKey || !userTokens || !tokenList || !canFetchTokenAccounts) {
      return;
    }

    setTimeout(() => {
      setCanFetchTokenAccounts(false);
    });

    const balancesMap: any = {};

    fetchAccountTokens(connection, publicKey)
      .then(accTks => {
        if (accTks) {

          const meanTokensCopy = new Array<TokenInfo>();
          const intersectedList = new Array<TokenInfo>();
          const userTokensCopy = JSON.parse(JSON.stringify(userTokens)) as TokenInfo[];

          // Build meanTokensCopy including the MeanFi pinned tokens
          userTokensCopy.forEach(item => {
            meanTokensCopy.push(item);
          });

          // Now add all other items but excluding those in userTokens
          splTokenList.forEach(item => {
            if (!userTokens.includes(item)) {
              meanTokensCopy.push(item);
            }
          });

          // Create a list containing tokens for the user owned token accounts
          accTks.forEach(item => {
            balancesMap[item.parsedInfo.mint] = item.parsedInfo.tokenAmount.uiAmount || 0;
            const isTokenAccountInTheList = intersectedList.some(t => t.address === item.parsedInfo.mint);
            const tokenFromMeanTokensCopy = meanTokensCopy.find(t => t.address === item.parsedInfo.mint);
            if (tokenFromMeanTokensCopy && !isTokenAccountInTheList) {
              intersectedList.push(tokenFromMeanTokensCopy);
            }
          });

          // Finally add all owned token accounts as custom tokens
          accTks.forEach(item => {
            if (!intersectedList.some(t => t.address === item.parsedInfo.mint)) {
              const customToken: TokenInfo = {
                address: item.parsedInfo.mint,
                chainId: 0,
                decimals: item.parsedInfo.tokenAmount.decimals,
                name: 'Custom account',
                symbol: shortenAddress(item.parsedInfo.mint),
                tags: undefined,
                logoURI: undefined,
              };
              intersectedList.push(customToken);
            }
          });

          intersectedList.unshift(userTokensCopy[0]);
          balancesMap[userTokensCopy[0].address] = nativeBalance;
          intersectedList.sort((a, b) => {
            if ((balancesMap[a.address] || 0) < (balancesMap[b.address] || 0)) {
              return 1;
            } else if ((balancesMap[a.address] || 0) > (balancesMap[b.address] || 0)) {
              return -1;
            }
            return 0;
          });

          setSelectedList(intersectedList);
          if (!selectedToken) { setSelectedToken(intersectedList[0]); }

        } else {
          for (const t of tokenList) {
            balancesMap[t.address] = 0;
          }
          // set the list to the userTokens list
          setSelectedList(tokenList);
          if (!selectedToken) { setSelectedToken(tokenList[0]); }
        }
      })
      .catch(error => {
        console.error(error);
        for (const t of tokenList) {
          balancesMap[t.address] = 0;
        }
        setSelectedList(tokenList);
        if (!selectedToken) { setSelectedToken(tokenList[0]); }
      })
      .finally(() => setUserBalances(balancesMap));

  }, [
    publicKey,
    tokenList,
    userTokens,
    connection,
    splTokenList,
    nativeBalance,
    selectedToken,
    canFetchTokenAccounts,
  ]);

  // Reset results when the filter is cleared
  useEffect(() => {
    if (tokenList && tokenList.length && filteredTokenList.length === 0 && !tokenFilter) {
      updateTokenListByFilter(tokenFilter);
    }
  }, [
    tokenList,
    tokenFilter,
    filteredTokenList,
    updateTokenListByFilter
  ]);

  ///////////////
  // Rendering //
  ///////////////

  const renderTable = () => {
    return CRYPTO_VALUES.map((value: number, index: number) => {
      return (
        <div className="item-list-row" key={index}>
          <div className="std-table-cell responsive-cell text-monospace text-right pr-2">
            {selectedToken
              ? getTokenAmountAndSymbolByTokenAddress(
                value,
                selectedToken.address
              )
              : ""}
          </div>
          <div className="std-table-cell responsive-cell text-monospace text-right pr-2">
            {selectedToken
              ? `${formatThousands(value, selectedToken.decimals)} ${selectedToken.symbol
              }`
              : ""}
          </div>
          <div className="std-table-cell responsive-cell text-monospace text-right">
            {selectedToken
              ? `${formatThousands(
                  value,
                  friendlyDisplayDecimalPlaces(value, selectedToken.decimals)
                )} ${selectedToken.symbol
              }`
              : ""}
          </div>
        </div>
      );
    });
  };

  const renderKformatters = () => {
    return NUMBER_OF_ITEMS.map((value: number, index: number) => {
      return (
        <div className="item-list-row" key={`${index}`}>
          <div className="std-table-cell responsive-cell text-monospace">
            <span className="font-size-75 font-bold text-shadow">{formatThousands(value) || 0}</span>
          </div>
          <div className="std-table-cell responsive-cell text-monospace">
            <div className="table-cell-flex-content">
              <div className="icon-cell">
                <div className="token-icon">
                    <div className="streams-count">
                      <span className="font-size-75 font-bold text-shadow">{formatAmount(value, 0, true) || 0}</span>
                    </div>
                  </div>
              </div>
            </div>
          </div>
          <div className="std-table-cell responsive-cell text-monospace">
            <div className="table-cell-flex-content">
              <div className="icon-cell">
                <div className="token-icon">
                    <div className="streams-count">
                      <span className="font-size-75 font-bold text-shadow">{kFormatter(value) || 0}</span>
                    </div>
                  </div>
              </div>
            </div>
          </div>
          <div className="std-table-cell responsive-cell text-monospace">
            <div className="table-cell-flex-content">
              <div className="icon-cell">
                <div className="token-icon">
                    <div className="streams-count">
                      <span className="font-size-75 font-bold text-shadow">{intToString(value, 1) || 0}</span>
                    </div>
                  </div>
              </div>
            </div>
          </div>
        </div>
      );
    });
  };

  const renderDemoNumberFormatting = (
    <>
      <div className="tabset-heading">Number Formatting</div>
      <div className="item-list-header">
        <div className="header-row">
          <div className="std-table-cell responsive-cell text-right pr-2">
            Format 1
          </div>
          <div className="std-table-cell responsive-cell text-right pr-2">
            Format 2
          </div>
          <div className="std-table-cell responsive-cell text-right">
            Format 3
          </div>
        </div>
      </div>
      <div className="item-list-body">{renderTable()}</div>
      <div className="mb-2">
        Format 1:&nbsp;<code>getTokenAmountAndSymbolByTokenAddress(value, mintAddress)</code>
        <br />
        Format 2:&nbsp;<code>formatThousands(value, decimals)</code>
        <br />
        Format 3:&nbsp;<code>formatThousands(value, friendlyDisplayDecimalPlaces(value, decimals), minDecimals)</code>
      </div>

      <Divider />

      <div className="tabset-heading">Short Number Formatting</div>
      <div className="item-list-header">
        <div className="header-row">
          <div className="std-table-cell responsive-cell">
            raw value
          </div>
          <div className="std-table-cell responsive-cell">
            formatAmount Fn
          </div>
          <div className="std-table-cell responsive-cell">
            kFormatter
          </div>
          <div className="std-table-cell responsive-cell">
            intToString
          </div>
        </div>
      </div>
      <div className="item-list-body">{renderKformatters()}</div>
    </>
  );

  const infoRow = (caption: string, value: string) => {
    return (
      <div className="flex-fixed-right">
        <div className="left">
          <span className="font-size-75">{caption}</span>
        </div>
        <div className="right">
          {isValidAddress(value) ? (
            <code><AddressDisplay address={value} showFullAddress={true} /></code>
          ) : (
            <code>{value}</code>
          )}
        </div>
      </div>
    );
  }

  const renderTestStream = () => {
    return (
      <>
        <div className="flex-fixed-right mt-4">
          <div className="left">
            <div className="form-label">Inspect stream</div>
          </div>
        </div>

        <div className="two-column-form-layout col75x25">
          <div className="left">
            <div className="well">
              <div className="flex-fixed-right">
                <div className="left position-relative">
                  <span className="recipient-field-wrapper">
                    <input
                      id="stream-id-recipient-field"
                      className="general-text-input"
                      autoComplete="off"
                      autoCorrect="off"
                      type="text"
                      onChange={handleStreamIdChange}
                      placeholder="Introduce stream id (required)"
                      required={true}
                      spellCheck="false"
                      value={streamId}/>
                  </span>
                </div>
                <div className="right">
                  <span>&nbsp;</span>
                </div>
              </div>
              {
                streamId && !isValidAddress(streamId) ? (
                  <span className="form-field-error">
                    Not a valid stream id
                  </span>
                ) : streamId && accountNotFound ? (
                  <span className="form-field-error">
                    Account info is not available for this stream id
                  </span>
                ) : null
              }
            </div>
          </div>
          <div className="right">
            <div className="flex-fixed-right">
              {/* <div className="left">
                <Button
                  block
                  type="primary"
                  shape="round"
                  size="large"
                  disabled={streamId === ""}
                  onClick={() => readAccountInfo()}>
                  Get info
                </Button>
              </div> */}
              <div className="right">
                <Button
                  type="default"
                  shape="round"
                  size="large"
                  disabled={streamId === ""}
                  onClick={onClearStreamId}>
                  Clear
                </Button>
              </div>
            </div>
          </div>
        </div>

        {streamId && isValidAddress(streamId) &&(
          <div className="mb-3">
            <div className="two-column-layout">
              <div className="left">
                <div className="form-label">Data</div>
                <div className="well mb-1 proposal-summary-container vertical-scroll">
                  HERE SHOW DATA
                </div>
              </div>
              <div className="right">
                <div className="form-label">SDK supply value</div>
                <div className="well mb-1 proposal-summary-container vertical-scroll">
                  HERE SHOW DATA
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  const renderDemo2Tab = () => {
    const isProgram = parsedAccountInfo &&
                      parsedAccountInfo.data.program === 'bpf-upgradeable-loader' &&
                      parsedAccountInfo.data.parsed.type === 'program'
      ? true
      : false

    const isTokenMint = parsedAccountInfo &&
                        parsedAccountInfo.data.program === 'spl-token' &&
                        parsedAccountInfo.data.parsed.type === 'mint'
      ? true
      : false;

    const isTokenAccount = parsedAccountInfo &&
                           parsedAccountInfo.data.program === 'spl-token' &&
                           parsedAccountInfo.data.parsed.type === 'account'
      ? true
      : false;

    const decimals = parsedAccountInfo
      ? isTokenMint
        ? parsedAccountInfo.data.parsed.info.decimals
        : isTokenAccount
          ? parsedAccountInfo.data.parsed.info.tokenAmount.decimals
          : 0
      : 0
    return (
      <>
        <div className="tabset-heading">Get account info</div>
        <div className="flex-fixed-right">
          <div className="left">
            <div className="form-label">Inspect account</div>
          </div>
          <div className="right">
            {publicKey ? (
              <>
                <Tooltip title="Inspect my wallet address" trigger="hover">
                  <span className="flat-button change-button" onClick={onScanMyAddress}>
                    <IconWallet className="mean-svg-icons" />
                  </span>
                </Tooltip>
                <Tooltip title="Pick one of my assets" trigger="hover">
                  <span className="flat-button change-button" onClick={showTokenSelector}>
                    <IconCoin className="mean-svg-icons" />
                  </span>
                </Tooltip>
              </>
            ) : (
              <span>&nbsp;</span>
            )}
          </div>
        </div>

        <div className="two-column-form-layout col70x30 mb-2">
          <div className="left">
            <div className="well">
              <div className="flex-fixed-right">
                <div className="left position-relative">
                  <span className="recipient-field-wrapper">
                    <input id="payment-recipient-field"
                      className="general-text-input"
                      autoComplete="on"
                      autoCorrect="off"
                      type="text"
                      onFocus={handleRecipientAddressFocusIn}
                      onChange={handleRecipientAddressChange}
                      onBlur={handleRecipientAddressFocusOut}
                      placeholder={t('transactions.recipient.placeholder')}
                      required={true}
                      spellCheck="false"
                      value={recipientAddress}/>
                    <span id="payment-recipient-static-field"
                          className={`${recipientAddress ? 'overflow-ellipsis-middle' : 'placeholder-text'}`}>
                      {recipientAddress || t('transactions.recipient.placeholder')}
                    </span>
                  </span>
                </div>
                <div className="right">
                  <span>&nbsp;</span>
                </div>
              </div>
              {
                recipientAddress && !isValidAddress(recipientAddress) ? (
                  <span className="form-field-error">
                    {t('transactions.validation.address-validation')}
                  </span>
                ) : recipientAddress && accountNotFound ? (
                  <span className="form-field-error">
                    {accountNotFound}
                  </span>
                ) : null
              }
            </div>
          </div>
          <div className="right">
            <div className="flex-fixed-right">
              <div className="left">
                <Button
                  block
                  type="primary"
                  shape="round"
                  size="large"
                  onClick={() => readAccountInfo()}>
                  Get info
                </Button>
              </div>
              <div className="right">
                <Button
                  type="default"
                  shape="round"
                  size="large"
                  onClick={onClearResults}>
                  Clear
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-3">
          {recipientAddress && (accountInfo || parsedAccountInfo) && (
            <div className="well-group text-monospace">
              {accountInfo && (
                <>
                  {infoRow('Entity:', 'Account')}
                  {infoRow('Balance (SOL):', `◎${formatThousands(accountInfo.lamports / LAMPORTS_PER_SOL, 9, 9)}`)}
                  {infoRow('Executable:', accountInfo.executable ? 'Yes' : 'No')}
                  {infoRow('Allocated Data Size:', `${accountInfo.data.byteLength} byte(s)`)}
                  {infoRow('Owner:', accountInfo.owner.toBase58())}
                </>
              )}
              {parsedAccountInfo && (
                <>
                  {infoRow('Entity:', getParsedAccountType(parsedAccountInfo))}
                  {isProgram && infoRow('Balance (SOL):', `◎${formatThousands(parsedAccountInfo.lamports / LAMPORTS_PER_SOL, 9, 9)}`)}
                  {infoRow('Executable:', parsedAccountInfo.executable ? 'Yes' : 'No')}
                  {
                    isTokenAccount
                      ? infoRow('Token Balance', formatThousands(parsedAccountInfo.data.parsed.info.tokenAmount.uiAmount, decimals, decimals))
                      : isTokenMint
                        ? infoRow('Current Supply:', formatThousands(makeDecimal(new BN(parsedAccountInfo.data.parsed.info.supply), decimals), decimals, decimals))
                        : ''
                  }
                  {isTokenMint && infoRow('Mint Authority:', parsedAccountInfo.data.parsed.info.mintAuthority)}
                  {isTokenAccount && infoRow('Mint:', parsedAccountInfo.data.parsed.info.mint)}
                  {(isTokenMint || isTokenAccount) && infoRow('Decimals:', decimals)}
                  {infoRow('Allocated Data Size:', `${parsedAccountInfo.data.space} byte(s)`)}
                  {isProgram && infoRow('Owner:', parsedAccountInfo.owner.toBase58())}
                  {isTokenMint && infoRow('Owner:', parsedAccountInfo.owner.toBase58())}
                  {isTokenAccount && infoRow('Owner:', parsedAccountInfo.data.parsed.info.owner)}
                  {recipientAddress && (isTokenAccount || isTokenMint) && (
                    <>
                      <Divider orientation="left" className="mt-1 mb-1">Preview</Divider>
                      <TokenDisplay
                        className="px-2 pb-2"
                        mintAddress={isTokenMint ? recipientAddress : parsedAccountInfo.data.parsed.info.mint}
                        onClick={undefined}
                        showName={true}
                      />
                    </>
                  )}
                  {isProgram && infoRow('Program Data:', parsedAccountInfo.data.parsed.info.programData)}
                </>
              )}
            </div>
          )}
        </div>
      </>
    );
  }

  const renderRouteLink = (title: string, linkAddress: string) => {
    return (
      <>
        <div className="well small mb-2">
          <div className="flex-fixed-right">
            <div className="left position-relative">
              <span className="recipient-field-wrapper">
                <span className="referral-link font-size-75 text-monospace">{linkAddress}</span>
              </span>
            </div>
            <div className="right">
              <Link to={linkAddress} title={title}>
                <div className="add-on simplelink">
                  <ArrowRightOutlined />
                </div>
              </Link>
            </div>
          </div>
        </div>

      </>
    );
  }

  const renderRoutingDemo = (
    <>
      <div className="tabset-heading">Test routing</div>
      <div className="text-left mb-3">
        <div className="form-label">Go to my connected account</div>
        {renderRouteLink('With no params', '/accounts')}
        <div className="form-label">Go to a different account</div>
        {renderRouteLink('With only the address', '/accounts/DG6nJknzbAq8xitEjMEqUbc77PTzPDpzLjknEXn3vdXZ')}
        {renderRouteLink('With NO specific asset preset', '/accounts/DG6nJknzbAq8xitEjMEqUbc77PTzPDpzLjknEXn3vdXZ/assets')}
        <div className="form-label">Preset a specific asset</div>
        {renderRouteLink('With specific asset preset', '/accounts/DG6nJknzbAq8xitEjMEqUbc77PTzPDpzLjknEXn3vdXZ/assets/FQPAweWDZZbKjDQk3MCx285dUeZosLzF2FacqfyegrGC')}
        <div className="form-label">View multisig vesting contracts</div>
        {renderRouteLink('Send multisig to vesting', `/vesting/${sampleMultisig}/contracts?account-type=multisig`)}
        <div className="form-label">View a multisig account assets</div>
        {renderRouteLink('With specific asset preset', '/accounts/D9w3w6CQZvmAaqvQ9BsHSfg8vCa58dh3mXLND5dyDT1z/assets?account-type=multisig')}
        <div className="form-label">View multisig account streaming</div>
        {renderRouteLink('See multisig streaming accounts', `/accounts/${sampleMultisig}/streaming/summary?account-type=multisig`)}
        {renderRouteLink('See multisig streaming accounts', `/accounts/8FZVqSVZ4o6QzQEn5eL3nsF9tt1PJozmj2S5uSYWiMw/streaming/summary?account-type=multisig`)}
        {renderRouteLink('See multisig streaming accounts', `/accounts/JAPXPLLiMLrDdtEvovDGUt2umkP6G2aeaCikJWeFjyiB/streaming/summary?account-type=multisig`)}
      </div>
    </>
  );

  const renderDemo3Tab = (
    <>
      <div className="tabset-heading">Notify and navigate</div>
      <div className="text-left mb-3">
        <Space wrap={true}>
          <span
            className="flat-button stroked"
            onClick={() => sequentialMessagesAndNavigate()}>
            <span>Sequential messages → Navigate</span>
          </span>
          <span
            className="flat-button stroked"
            onClick={() => stackedMessagesAndNavigate()}>
            <span>Stacked messages → Navigate</span>
          </span>
          <span
            className="flat-button stroked"
            onClick={() => interestingCase()}>
            <span>Without title</span>
          </span>
        </Space>
      </div>

      <div className="tabset-heading">Test Updatable Notifications</div>
      <div className="text-left mb-3">
        <Space>
          <span
            className="flat-button stroked"
            onClick={() => reuseNotification('pepito')}>
            <span>See mission status</span>
          </span>
        </Space>
      </div>

      <div className="tabset-heading">Test Standalone Notifications</div>
      <div className="text-left mb-3">
        <Space wrap={true}>
          <span
            className="flat-button stroked"
            onClick={() => showNotificationByType("info")}>
            <span>Info</span>
          </span>
          <span
            className="flat-button stroked"
            onClick={() => showNotificationByType("success")}>
            <span>Success</span>
          </span>
          <span
            className="flat-button stroked"
            onClick={() => showNotificationByType("warning")}>
            <span>Warning</span>
          </span>
          <span
            className="flat-button stroked"
            onClick={() => showNotificationByType("error")}>
            <span>Error</span>
          </span>
          <span
            className="flat-button stroked"
            onClick={() => showNotificationByType("info", true)}>
            <span>With CTA</span>
          </span>
        </Space>
      </div>

      {renderRoutingDemo}
    </>
  );

  const renderMiscTab = (
    <>
      <div className="tabset-heading">Miscelaneous features</div>

      <h3>Primary, Secondary and Terciary buttons</h3>
      <div className="mb-2">
        <div className="mb-1">
          <Space wrap={true} size="middle">
            <Button
              type="primary"
              shape="round"
              size="small"
              className="extra-small">
              Primary
            </Button>
            <Button
              type="default"
              shape="round"
              size="small"
              className="extra-small">
              Default
            </Button>
            <Button
              type="ghost"
              shape="round"
              size="small"
              className="extra-small">
              Ghost
            </Button>
          </Space>
        </div>
        <div className="mb-1">
          <Space wrap={true} size="middle">
            <Button
              type="primary"
              shape="round"
              size="middle"
              className="thin-stroke">
              Primary
            </Button>
            <Button
              type="default"
              shape="round"
              size="middle"
              className="thin-stroke">
              Default
            </Button>
            <Button
              type="ghost"
              shape="round"
              size="middle"
              className="thin-stroke">
              Ghost
            </Button>
          </Space>
        </div>
      </div>
      <h3>Primary, Secondary and Terciary buttons disabled</h3>
      <div className="mb-2">
        <Space wrap={true} size="middle">
          <Button
            type="primary"
            shape="round"
            size="small"
            className="thin-stroke"
            disabled={true}>
            Primary disabled
          </Button>
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            disabled={true}>
            Default disabled
          </Button>
          <Button
            type="ghost"
            shape="round"
            size="small"
            className="thin-stroke"
            disabled={true}>
            Ghost disabled
          </Button>
        </Space>
      </div>

      <h3>Animated buttons</h3>
      <div className="mb-2">
        <Space wrap={true} size="middle">
          <button className="animated-button-red">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            Red
          </button>
          <button className="animated-button-green">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            Green
          </button>
          <button className="animated-button-blue">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            Blue
          </button>
          <button className="animated-button-gold">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            Gold
          </button>
        </Space>
      </div>

      <h3>Flat buttons</h3>
      <div className="mb-2">
        <Space wrap={true} size="middle">
          <span className="flat-button tiny">
            <IconCopy className="mean-svg-icons" />
            <span className="ml-1">copy item</span>
          </span>
          <span className="flat-button tiny">
            <IconTrash className="mean-svg-icons" />
            <span className="ml-1">delete item</span>
          </span>
          <span className="flat-button tiny">
            <IconExternalLink className="mean-svg-icons" />
            <span className="ml-1">view on blockchain</span>
          </span>
        </Space>
      </div>

      <h3>Flat stroked buttons</h3>
      <div className="mb-2">
        <Space wrap={true} size="middle">
          <span className="flat-button tiny stroked">
            <IconCopy className="mean-svg-icons" />
            <span className="mx-1">copy item</span>
          </span>
          <span className="flat-button tiny stroked">
            <IconTrash className="mean-svg-icons" />
            <span className="mx-1">delete item</span>
          </span>
          <span className="flat-button tiny stroked">
            <IconExternalLink className="mean-svg-icons" />
            <span className="mx-1">view on blockchain</span>
          </span>
        </Space>
      </div>
    </>
  );

  const renderTab = () => {
    switch (currentTab) {
      case "first-tab":
        return renderDemoNumberFormatting;
      case "test-stream":
        return renderTestStream();
      case "second-tab":
        return renderDemo2Tab();
      case "demo-notifications":
        return renderDemo3Tab;
      case "misc-tab":
        return renderMiscTab;
      default:
        return null;
    }
  };

  const renderTabset = (
    <>
      <div className="button-tabset-container">
        <div
          className={`tab-button ${currentTab === "first-tab" ? "active" : ""}`}
          onClick={() => navigateToTab("first-tab")}>
          Demo 1
        </div>
        <div
          className={`tab-button ${currentTab === "test-stream" ? "active" : ""}`}
          onClick={() => navigateToTab("test-stream")}>
          Test Stream
        </div>
        <div
          className={`tab-button ${currentTab === "second-tab" ? "active" : ""}`}
          onClick={() => navigateToTab("second-tab")}>
          Demo 2
        </div>
        <div
          className={`tab-button ${currentTab === "demo-notifications" ? "active" : ""}`}
          onClick={() => navigateToTab("demo-notifications")}>
          Demo 3
        </div>
        <div
          className={`tab-button ${currentTab === "misc-tab" ? "active" : ""}`}
          onClick={() => navigateToTab("misc-tab")}>
          Misc
        </div>
      </div>
      {renderTab()}
    </>
  );

  const renderTokenList = (
    <>
      {(filteredTokenList && filteredTokenList.length > 0) && (
        filteredTokenList.map((t, index) => {
          const onClick = function () {
            setSelectedToken(t);

            setTimeout(() => {
              onScanAssetAddress(t);
            }, 100);

            consoleOut("token selected:", t.symbol, 'blue');
            setEffectiveRate(getTokenPriceBySymbol(t.symbol));
            onCloseTokenSelector();
          };

          if (index < MAX_TOKEN_LIST_ITEMS) {
            if (t.address === NATIVE_SOL.address) {
              return null;
            }
            const balance = connected && userBalances && userBalances[t.address] > 0 ? userBalances[t.address] : 0;
            return (
              <TokenListItem
                key={t.address}
                name={t.name || CUSTOM_TOKEN_NAME}
                mintAddress={t.address}
                token={t}
                className={balance ? selectedToken && selectedToken.address === t.address ? "selected" : "simplelink" : "hidden"}
                onClick={onClick}
                balance={balance}
                showZeroBalances={true}
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
          placeholder={t('token-selector.search-input-placeholder')}
          onInputChange={onTokenSearchInputChange} />
      </div>
      <div className="token-list">
        {filteredTokenList.length > 0 && renderTokenList}
        {(tokenFilter && isValidAddress(tokenFilter) && filteredTokenList.length === 0) && (
          <TokenListItem
            key={tokenFilter}
            name={CUSTOM_TOKEN_NAME}
            mintAddress={tokenFilter}
            className={selectedToken && selectedToken.address === tokenFilter ? "selected" : "simplelink"}
            onClick={() => {
              const uknwnToken: TokenInfo = {
                address: tokenFilter,
                name: CUSTOM_TOKEN_NAME,
                chainId: 101,
                decimals: 6,
                symbol: '',
              };
              setSelectedToken(uknwnToken);
              consoleOut("token selected:", uknwnToken, 'blue');
              setEffectiveRate(0);
              onCloseTokenSelector();
            }}
            balance={connected && userBalances && userBalances[tokenFilter] > 0 ? userBalances[tokenFilter] : 0}
          />
        )}
      </div>
    </div>
  );

  return (
    <>

      <section>
        <div className="container mt-4 flex-column flex-center">
          <div className="boxed-area container-max-width-960">
            {renderTabset}
            {/* <span className="secondary-link" onClick={getTopJupiterTokensByVolume}>Read list of top Jupiter tokens in volume over 1,000 USD</span> */}
          </div>
        </div>
      </section>

      <PreFooter />

      {/* Token selection modal */}
      {isTokenSelectorModalVisible && (
        <Modal
          className="mean-modal unpadded-content"
          visible={isTokenSelectorModalVisible}
          title={<div className="modal-title">{t('token-selector.modal-title')}</div>}
          onCancel={onCloseTokenSelector}
          width={450}
          footer={null}>
          {renderTokenSelectorInner}
        </Modal>
      )}
    </>
  );
};
