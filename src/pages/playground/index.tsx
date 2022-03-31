import React, { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PreFooter } from "../../components/PreFooter";
import { SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from "../../constants";
import { AppStateContext } from "../../contexts/appstate";
import { SelectOption } from "../../models/common-types";
import { TransactionStatus } from "../../models/enums";
import { UserTokenAccount } from "../../models/transactions";
import "./style.less";
import {
  CheckOutlined,
  LoadingOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  Button,
  Collapse,
  Divider,
  Form,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
} from "antd";
import {
  delay,
  consoleOut,
  getAmountWithTokenSymbol,
  getTransactionModalTitle,
  getTransactionOperationDescription,
  getTransactionStatusForLogs,
} from "../../utils/ui";
import {
  formatThousands,
  getTokenAmountAndSymbolByTokenAddress,
  shortenAddress,
} from "../../utils/utils";
import { IconCopy, IconExternalLink, IconTrash } from "../../Icons";
import { useNavigate } from "react-router-dom";
import { openNotification } from "../../components/Notifications";
import { IconType } from "antd/lib/notification";

const { Panel } = Collapse;
const { Option } = Select;
type TabOption = "first-tab" | "second-tab" | "demo-notifications" | "misc-tab";
const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

interface TokenVolume {
  symbol: string;
  amount: number;
}
interface BasicTokenInfo {
  name: string;
  symbol: string;
  address: string;
  decimals: number;
}

const SAMPLE_SIGNATURE =
  "43n6nSvWLULwu3Gdpkc3P2NtxzKdncvBMdmQxaf2wkWkSLtq2j7QD31TRd499UqijXfeyLWRxJ6t9Z1epWXcixPq";

const CRYPTO_VALUES: number[] = [
  0.0004, 0.000003, 0.00000012345678, 1200.5, 1500.000009, 100500.000009226,
  7131060.641513,
];

interface TxStatusConfig {
  step: number;
  header: string;
  timeDelay: number;
  initialStatus: TransactionStatus;
  finalStatus: TransactionStatus;
}

const TX_TEST_RUN_VALUES: TxStatusConfig[] = [
  {
    step: 1,
    header: "Init transaction",
    timeDelay: 1,
    initialStatus: TransactionStatus.TransactionStart,
    finalStatus: TransactionStatus.TransactionStarted,
  },
  {
    step: 2,
    header: "Create transaction",
    timeDelay: 1,
    initialStatus: TransactionStatus.InitTransaction,
    finalStatus: TransactionStatus.InitTransactionSuccess,
  },
  {
    step: 3,
    header: "Sign transaction",
    timeDelay: 1,
    initialStatus: TransactionStatus.SignTransaction,
    finalStatus: TransactionStatus.SignTransactionSuccess,
  },
  {
    step: 4,
    header: "Send transaction",
    timeDelay: 2,
    initialStatus: TransactionStatus.SendTransaction,
    finalStatus: TransactionStatus.SendTransactionSuccess,
  },
  {
    step: 5,
    header: "Confirm transaction",
    timeDelay: 2,
    initialStatus: TransactionStatus.ConfirmTransaction,
    finalStatus: TransactionStatus.TransactionFinished,
  },
];

export const PlaygroundView = () => {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const {
    userTokens,
    transactionStatus,
    setTransactionStatus
  } = useContext(AppStateContext);
  const [selectedMint, setSelectedMint] = useState<UserTokenAccount | undefined>(undefined);
  const [isBusy, setIsBusy] = useState(false);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isTransactionModalVisible, setTransactionModalVisibility] =
    useState(false);
  const showTransactionModal = useCallback(
    () => setTransactionModalVisibility(true),
    []
  );
  const hideTransactionModal = useCallback(
    () => setTransactionModalVisibility(false),
    []
  );
  const [currentTab, setCurrentTab] = useState<TabOption>("first-tab");

  const [currentPanel, setCurrentPanel] = useState<number | undefined>(
    undefined
  );
  const [txTestRunConfig, setTxTestRunConfig] =
    useState<TxStatusConfig[]>(TX_TEST_RUN_VALUES);
  const [currentPanelItem, setCurrentPanelItem] = useState<TxStatusConfig>();

  useEffect(() => {
    if (!selectedMint) {
      setSelectedMint(userTokens.find((t) => t.symbol === "USDC"));
    }
  }, [selectedMint, userTokens]);

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
  //       const tokens = data.lastXTopTokens.filter((s: TokenVolume) => s.amount >= 1000) as TokenVolume[];
  //       const topTokens: BasicTokenInfo[] = [];
  //       if (tokens && tokens.length > 0) {
  //         tokens.forEach(element => {
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

  const resetTransactionStatus = () => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle,
    });
  };

  const isSuccess = (): boolean => {
    return transactionStatus.currentOperation ===
      TransactionStatus.TransactionFinished
      ? true
      : false;
  };

  const isError = (): boolean => {
    return transactionStatus.currentOperation ===
      TransactionStatus.TransactionStartFailure ||
      transactionStatus.currentOperation ===
      TransactionStatus.InitTransactionFailure ||
      transactionStatus.currentOperation ===
      TransactionStatus.SignTransactionFailure ||
      transactionStatus.currentOperation ===
      TransactionStatus.SendTransactionFailure ||
      transactionStatus.currentOperation ===
      TransactionStatus.ConfirmTransactionFailure
      ? true
      : false;
  };

  const onAfterTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      hideTransactionModal();
    }
    resetTransactionStatus();
  };

  const onTransactionStart = async () => {
    setTransactionCancelled(false);
    setIsBusy(true);

    showTransactionModal();

    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle,
    });

    for await (const txStep of txTestRunConfig) {
      if (transactionCancelled || isError()) {
        break;
      }
      setTransactionStatus({
        lastOperation: transactionStatus.currentOperation,
        currentOperation: txStep.initialStatus,
      });
      consoleOut(
        `initialStatus = ${txStep.initialStatus} ->`,
        getTransactionStatusForLogs(txStep.initialStatus),
        "blue"
      );
      consoleOut(`await for ${txStep.timeDelay} seconds`, "", "blue");
      await delay(txStep.timeDelay * 1000);
      setTransactionStatus({
        lastOperation: transactionStatus.currentOperation,
        currentOperation: txStep.finalStatus,
      });
      consoleOut(
        `finalStatus = ${txStep.finalStatus} ->`,
        getTransactionStatusForLogs(txStep.finalStatus),
        "blue"
      );
    }

    setIsBusy(false);
  };

  const saveItem = () => {
    if (currentPanel === undefined || currentPanelItem === undefined) {
      return;
    }

    const newList = JSON.parse(
      JSON.stringify(txTestRunConfig)
    ) as TxStatusConfig[];
    newList[currentPanel - 1].timeDelay = currentPanelItem.timeDelay;
    newList[currentPanel - 1].initialStatus = currentPanelItem.initialStatus;
    newList[currentPanel - 1].finalStatus = currentPanelItem.finalStatus;
    setTxTestRunConfig(newList);
  };

  const renderTable = () => {
    return CRYPTO_VALUES.map((value: number, index: number) => {
      return (
        <div className="item-list-row" key={index}>
          <div className="std-table-cell responsive-cell text-monospace text-right pr-2">
            {selectedMint
              ? getAmountWithTokenSymbol(
                value,
                selectedMint,
                selectedMint.decimals
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

  const getOptionsFromEnum = (
    value: any,
    labelCallback: any
  ): SelectOption[] => {
    let index = 0;
    const options: SelectOption[] = [];
    for (const enumMember in value) {
      const mappedValue = parseInt(enumMember, 10);
      if (!isNaN(mappedValue)) {
        const label = labelCallback(mappedValue);
        if (label) {
          const item: SelectOption = {
            key: index,
            value: mappedValue,
            label: label,
          };
          options.push(item);
        }
      }
      index++;
    }
    return options;
  };

  function handlePanelChange(value: any) {
    console.log(`panel changed:${value}`);
    setCurrentPanel(value);
    const loadedItem = value ? txTestRunConfig[value - 1] : undefined;
    console.log("loadedItem:", loadedItem);
    setCurrentPanelItem(loadedItem);
  }

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

  const renderDemoNumberFormatting = (
    <>
      <div className="tabset-heading">Number formatting</div>
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
      <Divider />
      <div>
        Format1: <code>value.toFixed(decimals)</code>
        <br />
        Format2:{" "}
        <code>getTokenAmountAndSymbolByTokenAddress(value, mintAddress)</code>
        <br />
        Format4: <code>formatThousands(value, decimals)</code>
      </div>
    </>
  );

  const renderDemoTxWorkflow = (
    <>
      <div className="tabset-heading">Transaction workflow</div>
      <div className="text-left mb-3">
        <Button
          type="primary"
          shape="round"
          size="middle"
          onClick={onTransactionStart}
        >
          Test Tx - Dry run
        </Button>
      </div>
      <Collapse accordion onChange={handlePanelChange}>
        {txTestRunConfig.map((config) => {
          const onInitialStatusChange = (value: any) => {
            setCurrentPanelItem(
              Object.assign({}, config, {
                initialStatus: value,
                timeDelay: currentPanelItem?.timeDelay,
                finalStatus: currentPanelItem?.finalStatus,
              })
            );
          };
          const onFinalStatusChange = (value: any) => {
            setCurrentPanelItem(
              Object.assign({}, config, {
                initialStatus: currentPanelItem?.initialStatus,
                timeDelay: currentPanelItem?.timeDelay,
                finalStatus: value,
              })
            );
          };
          const onTimeDelayChange = (value: number) => {
            let newValue: number;
            if (!value || value < 1) {
              newValue = 1;
            } else if (value > 5) {
              newValue = 5;
            } else {
              newValue = value;
            }
            console.log(`new value ${newValue}`);
            setCurrentPanelItem(
              Object.assign({}, config, {
                initialStatus: currentPanelItem?.initialStatus,
                timeDelay: value,
                finalStatus: currentPanelItem?.finalStatus,
              })
            );
          };
          return (
            <Panel header={config.header} key={`${config.step}`}>
              {currentPanelItem && (
                <Form
                  labelCol={{ span: 5 }}
                  wrapperCol={{ span: 18 }}
                  layout="horizontal"
                >
                  <Form.Item label="Initial status">
                    <Select
                      value={currentPanelItem.initialStatus}
                      onChange={onInitialStatusChange}
                    >
                      {getOptionsFromEnum(
                        TransactionStatus,
                        getTransactionStatusForLogs
                      ).map((option) => {
                        return (
                          <Option
                            key={option.key}
                            value={option.value}
                          >{`${option.value} - ${option.label}`}</Option>
                        );
                      })}
                    </Select>
                  </Form.Item>
                  <Form.Item label="Delay">
                    <InputNumber
                      style={{ width: 100 }}
                      min={1}
                      max={5}
                      step={1}
                      value={currentPanelItem.timeDelay}
                      formatter={(value) => `${value}s`}
                      parser={(value) =>
                        parseFloat(value ? value.replace("s", "") : "0.1")
                      }
                      onChange={onTimeDelayChange}
                    />
                  </Form.Item>
                  <Form.Item label="Final status">
                    <Select
                      value={currentPanelItem.finalStatus}
                      onChange={onFinalStatusChange}
                    >
                      {getOptionsFromEnum(
                        TransactionStatus,
                        getTransactionStatusForLogs
                      ).map((option) => {
                        return (
                          <Option
                            key={option.key}
                            value={option.value}
                          >{`${option.value} - ${option.label}`}</Option>
                        );
                      })}
                    </Select>
                  </Form.Item>
                  <Form.Item wrapperCol={{ span: 18, offset: 5 }}>
                    <Button type="primary" onClick={saveItem}>
                      Submit
                    </Button>
                  </Form.Item>
                </Form>
              )}
            </Panel>
          );
        })}
      </Collapse>
    </>
  );

  const renderDemoNotifications = (
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
        return renderDemoTxWorkflow;
      case "demo-notifications":
        return renderDemoNotifications;
      case "misc-tab":
        return renderMiscTab;
      default:
        return null;
    }
  };

  return (
    <>
      <section>
        <div className="container mt-4 flex-column flex-center">
          <div className="boxed-area container-max-width-720">
            <div className="button-tabset-container">
              <div
                className={`tab-button ${currentTab === "first-tab" ? "active" : ""}`}
                onClick={() => setCurrentTab("first-tab")}>
                Demo 1
              </div>
              <div
                className={`tab-button ${currentTab === "second-tab" ? "active" : ""}`}
                onClick={() => setCurrentTab("second-tab")}>
                Demo 2
              </div>
              <div
                className={`tab-button ${currentTab === "demo-notifications" ? "active" : ""}`}
                onClick={() => setCurrentTab("demo-notifications")}>
                Demo 3
              </div>
              <div
                className={`tab-button ${currentTab === "misc-tab" ? "active" : ""}`}
                onClick={() => setCurrentTab("misc-tab")}>
                Misc
              </div>
            </div>
            {renderTab()}
            {/* <span className="secondary-link" onClick={getTopJupiterTokensByVolume}>Read list of top Jupiter tokens in volume over 1,000 USD</span> */}
          </div>
        </div>
      </section>

      <Modal
        className="mean-modal"
        maskClosable={false}
        visible={isTransactionModalVisible}
        title={getTransactionModalTitle(transactionStatus, isBusy, t)}
        onCancel={hideTransactionModal}
        afterClose={onAfterTransactionModalClosed}
        width={330}
        footer={null}
      >
        <div className="transaction-progress">
          {isBusy ? (
            <>
              <Spin indicator={bigLoadingIcon} className="icon" />
              <h4 className="font-bold mb-1 text-uppercase">
                {getTransactionOperationDescription(
                  transactionStatus.currentOperation,
                  t
                )}
              </h4>
              <p className="operation">Whatever is about to happen...</p>
              {transactionStatus.currentOperation ===
                TransactionStatus.SignTransaction && (
                  <div className="indication">
                    {t("transactions.status.instructions")}
                  </div>
                )}
            </>
          ) : isSuccess() ? (
            <>
              <CheckOutlined style={{ fontSize: 48 }} className="icon" />
              <h4 className="font-bold mb-1 text-uppercase">
                {getTransactionOperationDescription(
                  transactionStatus.currentOperation,
                  t
                )}
              </h4>
              <p className="operation">
                {t("transactions.status.tx-generic-operation-success")}.
              </p>
              <Button
                block
                type="primary"
                shape="round"
                size="middle"
                onClick={hideTransactionModal}
              >
                {t("general.cta-close")}
              </Button>
            </>
          ) : isError() ? (
            <>
              <WarningOutlined style={{ fontSize: 48 }} className="icon" />
              {transactionStatus.currentOperation ===
                TransactionStatus.TransactionStartFailure ? (
                <h4 className="mb-4">Whatever special reason it failed for</h4>
              ) : (
                <>
                  <h4 className="font-bold mb-1 text-uppercase">
                    {getTransactionOperationDescription(
                      transactionStatus.currentOperation,
                      t
                    )}
                  </h4>
                  {transactionStatus.currentOperation ===
                    TransactionStatus.ConfirmTransactionFailure && (
                      <>
                        <p className="operation">
                          {t("transactions.status.tx-confirm-failure-check")}
                        </p>
                        <p className="operation">
                          <a
                            className="secondary-link"
                            href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${SAMPLE_SIGNATURE}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {shortenAddress(SAMPLE_SIGNATURE, 8)}
                          </a>
                        </p>
                      </>
                    )}
                </>
              )}
              <Button
                block
                type="primary"
                shape="round"
                size="middle"
                onClick={hideTransactionModal}
              >
                {t("general.cta-close")}
              </Button>
            </>
          ) : (
            <>
              <Spin indicator={bigLoadingIcon} className="icon" />
              <h4 className="font-bold mb-4 text-uppercase">
                {t("transactions.status.tx-wait")}...
              </h4>
            </>
          )}
        </div>
      </Modal>

      <PreFooter />
    </>
  );
};
