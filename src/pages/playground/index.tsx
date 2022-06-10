import React, { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PreFooter } from "../../components/PreFooter";
import { AppStateContext } from "../../contexts/appstate";
import { UserTokenAccount } from "../../models/transactions";
import "./style.scss";
import {
  ArrowRightOutlined,
} from "@ant-design/icons";
import {
  Button,
  Divider,
  Space,
  Tooltip,
} from "antd";
import {
  delay,
  consoleOut,
  kFormatter,
  intToString,
  isValidAddress,
} from "../../utils/ui";
import {
  formatAmount,
  formatThousands,
  getAmountWithSymbol,
  getTokenAmountAndSymbolByTokenAddress,
  makeDecimal,
} from "../../utils/utils";
import { IconCopy, IconExternalLink, IconTrash, IconWallet } from "../../Icons";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { openNotification } from "../../components/Notifications";
import { IconType } from "antd/lib/notification";
import { AccountInfo, LAMPORTS_PER_SOL, ParsedAccountData, PublicKey } from "@solana/web3.js";
import { useConnection } from "../../contexts/connection";
import { SYSTEM_PROGRAM_ID } from "../../utils/ids";
import { AddressDisplay } from "../../components/AddressDisplay";
import { BN } from "bn.js";
import { TokenDisplay } from "../../components/TokenDisplay";
import { useWallet } from "../../contexts/wallet";

type TabOption = "first-tab" | "second-tab" | "demo-notifications" | "misc-tab" | undefined;

const CRYPTO_VALUES: number[] = [
  0.0004, 0.000003, 0.00000012345678, 1200.5, 1500.000009, 100500.000009226,
  7131060.641513,
];

const NUMBER_OF_ITEMS: number[] = [
  0, 1, 99, 157, 679, 1000, 1300, 1550, 99600, 154350, 600000, 1200000
];

export const PlaygroundView = () => {
  const { t } = useTranslation("common");
  const location = useLocation();
  const navigate = useNavigate();
  const connection = useConnection();
  const { publicKey } = useWallet();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    userTokens,
    splTokenList,
    recipientAddress,
    setRecipientAddress,
  } = useContext(AppStateContext);
  const [selectedMint, setSelectedMint] = useState<UserTokenAccount | undefined>(undefined);
  const [currentTab, setCurrentTab] = useState<TabOption>(undefined);
  const [parsedAccountInfo, setParsedAccountInfo] = useState<AccountInfo<ParsedAccountData> | null>(null);
  const [accountInfo, setAccountInfo] = useState<AccountInfo<Buffer> | null>(null);
  const [accountNotFound, setAccountNotFound] = useState<string>('');

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

  const renderTable = () => {
    return CRYPTO_VALUES.map((value: number, index: number) => {
      return (
        <div className="item-list-row" key={index}>
          <div className="std-table-cell responsive-cell text-monospace text-right pr-2">
            {selectedMint
              ? getAmountWithSymbol(
                value,
                selectedMint.address
              )
              : ""}
          </div>
          <div className="std-table-cell responsive-cell text-monospace text-right pr-2">
            {selectedMint
              ? getTokenAmountAndSymbolByTokenAddress(
                value,
                selectedMint.address
              )
              : ""}
          </div>
          <div className="std-table-cell responsive-cell text-monospace text-right">
            {selectedMint
              ? `${formatThousands(value, selectedMint.decimals)} ${selectedMint.symbol
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

  const showNotificationByType = (type: IconType) => {
    openNotification({
      type,
      title: 'Notification Title',
      duration: 0,
      description: <span>Lorem, ipsum dolor sit amet consectetur adipisicing elit. Natus, ullam perspiciatis accusamus, sunt ipsum asperiores similique cupiditate autem veniam explicabo earum voluptates!</span>
    });
  };

  const interestingCase = () => {
    openNotification({
      type: "info",
      description: t("treasuries.create-treasury.multisig-treasury-created-info"),
      duration: 0
    });
  };

  ///////////////
  // Callbacks //
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

  const onScanMyAddress = () => {
    if (publicKey) {
      setRecipientAddress(publicKey.toBase58());
      readAccountInfo(publicKey.toBase58());
    }
  }

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

  // Select a default mint
  useEffect(() => {
    if (!selectedMint) {
      setSelectedMint(userTokens.find((t) => t.symbol === "USDC"));
    }
  }, [selectedMint, userTokens]);

  ///////////////
  // Rendering //
  ///////////////

  const renderDemoNumberFormatting = (
    <>
      <div className="tabset-heading">Number Formatting</div>
      <div className="item-list-header">
        <div className="header-row">
          <div className="std-table-cell responsive-cell text-right pr-2">
            Format1
          </div>
          <div className="std-table-cell responsive-cell text-right pr-2">
            Format2
          </div>
          <div className="std-table-cell responsive-cell text-right">
            Format3
          </div>
        </div>
      </div>
      <div className="item-list-body">{renderTable()}</div>
      <div className="mb-2">
        Format1: <code>value.toFixed(decimals)</code>
        <br />
        Format2:{" "}
        <code>getTokenAmountAndSymbolByTokenAddress(value, mintAddress)</code>
        <br />
        Format4: <code>formatThousands(value, decimals)</code>
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
              <Tooltip title="Inspect my wallet address" trigger="hover">
                <span className="flat-button change-button" onClick={onScanMyAddress}>
                  <IconWallet className="mean-svg-icons" />
                </span>
              </Tooltip>
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
        <div className="form-label">Vew a multisig account</div>
        {renderRouteLink('With specific asset preset', '/accounts/D9w3w6CQZvmAaqvQ9BsHSfg8vCa58dh3mXLND5dyDT1z/assets?account-type=multisig')}
      </div>
    </>
  );

  const renderDemo3Tab = (
    <>
      <div className="tabset-heading">Notify and navigate</div>
      <div className="text-left mb-3">
        <Space>
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
        <Space>
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
        </Space>
      </div>

      {renderRoutingDemo}
    </>
  );

  const renderMiscTab = (
    <>
      <div className="tabset-heading">Miscelaneous features</div>

      <h3>Primary, Secondary and Terciary buttons</h3>
      <div className="row mb-2">
        <div className="col">
          <Button
            type="primary"
            shape="round"
            size="small"
            className="thin-stroke"
          >
            Primary
          </Button>
        </div>
        <div className="col">
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
          >
            Default
          </Button>
        </div>
        <div className="col">
          <Button
            type="ghost"
            shape="round"
            size="small"
            className="thin-stroke"
          >
            Ghost
          </Button>
        </div>
      </div>
      <h3>Primary, Secondary and Terciary buttons disabled</h3>
      <div className="row mb-2">
        <div className="col">
          <Button
            type="primary"
            shape="round"
            size="small"
            className="thin-stroke"
            disabled={true}
          >
            Primary disabled
          </Button>
        </div>
        <div className="col">
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            disabled={true}
          >
            Default disabled
          </Button>
        </div>
        <div className="col">
          <Button
            type="ghost"
            shape="round"
            size="small"
            className="thin-stroke"
            disabled={true}
          >
            Ghost disabled
          </Button>
        </div>
      </div>

      <h3>Animated buttons</h3>
      <div className="row mb-2">
        <div className="col">
          <button className="animated-button-red">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            Red
          </button>
        </div>
        <div className="col">
          <button className="animated-button-green">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            Green
          </button>
        </div>
        <div className="col">
          <button className="animated-button-blue">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            Blue
          </button>
        </div>
        <div className="col">
          <button className="animated-button-gold">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            Gold
          </button>
        </div>
      </div>

      <h3>Flat buttons</h3>
      <div className="mb-2">
        <Space>
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
        <Space>
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
    </>
  );
};
