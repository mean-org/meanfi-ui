import { Button, Collapse, Divider, Form, InputNumber, Select } from "antd";
import React, { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PreFooter } from "../../components/PreFooter";
import { AppStateContext } from "../../contexts/appstate";
import { TransactionStatus } from "../../models/enums";
import { UserTokenAccount } from "../../models/transactions";
import { getAmountWithTokenSymbol, getTransactionStatusForLogs } from "../../utils/ui";
import { getTokenAmountAndSymbolByTokenAddress } from "../../utils/utils";

const { Panel } = Collapse;
const { Option } = Select;

const CRYPTO_VALUES: number[] = [
  0.0004,
  0.0000003,
  0.000000001,
  0.00000012345678,
  1200.5,
  1500.000009,
  100500.000009226,
];

interface TxStatusConfig {
  step: number;
  header: string;
  timeDelay: number;
  statusReturn: TransactionStatus;
}

interface SelectOption {
  key: number;
  value: number;
  label: string;
}

const TX_TEST_RUN_VALUES: TxStatusConfig[] = [
  {
    step: 1,
    header: 'Init transaction',
    timeDelay: 1,
    statusReturn: TransactionStatus.TransactionStart
  },
  {
    step: 2,
    header: 'Create transaction',
    timeDelay: 1,
    statusReturn: TransactionStatus.InitTransactionSuccess
  },
  {
    step: 3,
    header: 'Sign transaction',
    timeDelay: 1,
    statusReturn: TransactionStatus.SignTransactionSuccess
  },
  {
    step: 4,
    header: 'Send transaction',
    timeDelay: 3,
    statusReturn: TransactionStatus.SendTransactionSuccess
  },
  {
    step: 5,
    header: 'Confirm transaction',
    timeDelay: 5,
    statusReturn: TransactionStatus.ConfirmTransactionSuccess
  },
];

export const PlaygroundView = () => {
    const { t } = useTranslation("common");
    const {
      userTokens,
      transactionStatus,
      setTransactionStatus,
    } = useContext(AppStateContext);
    const [selectedMint, setSelectedMint] = useState<UserTokenAccount | undefined>(undefined);
    const [isBusy, setIsBusy] = useState(false);
    const [isSwapTransactionModalVisible, setSwapTransactionModalVisibility] = useState(false);
    const showSwapTransactionModal = useCallback(() => setSwapTransactionModalVisibility(true), []);
    const hideSwapTransactionModal = useCallback(() => setSwapTransactionModalVisibility(false), []);

    const [currentPanel, setCurrentPanel] = useState<number | undefined>(undefined);
    const [txTestRunConfig, setTxTestRunConfig] = useState<TxStatusConfig[]>(TX_TEST_RUN_VALUES);
    const [currentPanelItem, setCurrentPanelItem] = useState<TxStatusConfig>();
  
    useEffect(() => {
      if (!selectedMint) {
        setSelectedMint(userTokens[0]);
      }
    }, [selectedMint, userTokens]);

    const saveItem = () => {
      if (currentPanel === undefined || currentPanelItem === undefined) { return; }

      const newList = JSON.parse(JSON.stringify(txTestRunConfig)) as TxStatusConfig[];
      newList[currentPanel - 1].timeDelay = currentPanelItem.timeDelay;
      newList[currentPanel - 1].statusReturn = currentPanelItem.statusReturn;
      setTxTestRunConfig(newList);
    }

    const renderTable = () => {
      return CRYPTO_VALUES.map((value: number, index: number) => {
        return (
          <div className="item-list-row" key={index}>
            <div className="std-table-cell responsive-cell pr-2 text-right">
              {selectedMint
                ? `${value.toFixed(selectedMint.decimals)} ${selectedMint.symbol}`
                : ""}
            </div>
            <div className="std-table-cell responsive-cell pr-2 text-right">
              {selectedMint
                ? getTokenAmountAndSymbolByTokenAddress(
                    value,
                    selectedMint.address
                  )
                : ""}
            </div>
            <div className="std-table-cell responsive-cell text-right">
              {selectedMint
                ? getAmountWithTokenSymbol(
                    value,
                    selectedMint,
                    selectedMint.decimals
                  )
                : ""}
            </div>
          </div>
        );
      });
    };

    const getOptionsFromEnum = (value: any, labelCallback: any): SelectOption[] => {
      let index = 0;
      const options: SelectOption[] = [];
      for (const enumMember in value) {
        const mappedValue = parseInt(enumMember, 10);
        if (!isNaN(mappedValue)) {
          const label = (labelCallback)(mappedValue);
          if (label) {
            const item: SelectOption = {
              key: index,
              value: mappedValue,
              label: label
            };
            options.push(item);
          }
        }
        index++;
      }
      return options;
    }

    function handlePanelChange(value: any) {
      console.log(`panel changed:${value}`);
      setCurrentPanel(value);
      const loadedItem = value ? txTestRunConfig[value - 1] : undefined;
      console.log('loadedItem:', loadedItem);
      setCurrentPanelItem(loadedItem);
    }

  return (
    <>
      <div className="solid-bg">
        <section className="content">
          <div className="container mt-4 flex-column flex-center">
            <div className="boxed-area">
                <div className="text-left">
                  <Button
                    type="primary"
                    shape="round"
                    size="middle"
                    onClick={hideSwapTransactionModal}>
                    Test Tx - Dry run
                  </Button>
                </div>
                <Collapse accordion onChange={handlePanelChange}>
                  {txTestRunConfig.map(config => {
                    const onStatusReturnChange = (value: any) => {
                      setCurrentPanelItem(Object.assign({}, config, {
                        statusReturn: value,
                        timeDelay: currentPanelItem?.timeDelay
                      }));
                    }
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
                      setCurrentPanelItem(Object.assign({}, config, {
                        statusReturn: currentPanelItem?.statusReturn,
                        timeDelay: value
                      }));
                    }
                    return (
                      <Panel header={config.header} key={`${config.step}`} >
                        {currentPanelItem && (
                          <Form labelCol={{ span: 5 }} wrapperCol={{ span: 14 }} layout="horizontal">
                            <Form.Item label="Select">
                              <Select value={currentPanelItem.statusReturn} onChange={onStatusReturnChange}>
                                {getOptionsFromEnum(TransactionStatus, getTransactionStatusForLogs).map((option) => {
                                  return (
                                    <Option key={option.key} value={option.value}>{option.label}</Option>
                                  );
                                })}
                              </Select>
                            </Form.Item>
                            <Form.Item label="InputNumber">
                              <InputNumber
                                style={{ width: 100 }}
                                min={1}
                                max={5}
                                step={1}
                                value={currentPanelItem.timeDelay}
                                formatter={value => `${value}s`}
                                parser={value => parseFloat(value ? value.replace('s', '') : '0.1')}
                                onChange={onTimeDelayChange}
                              />
                            </Form.Item>
                            <Form.Item wrapperCol={{ span: 14, offset: 5 }}>
                              <Button type="primary" onClick={saveItem}>Submit</Button>
                            </Form.Item>
                          </Form>
                        )}
                      </Panel>
                    );
                  })}
                </Collapse>
                <div className="item-list-header">
                    <div className="header-row">
                        <div className="std-table-cell responsive-cell pr-2 text-right">
                            Format1
                        </div>
                        <div className="std-table-cell responsive-cell pr-2 text-right">
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
                  Format1: <code>value.toFixed(decimals)</code><br />
                  Format2:{" "}<code>getTokenAmountAndSymbolByTokenAddress(value, mintAddress)</code><br />
                  Format3: <code>formatAmount(value, decimals)</code>
                </div>
            </div>
          </div>
        </section>
      </div>

      {/* <Modal
        className="mean-modal"
        maskClosable={false}
        visible={isSwapTransactionModalVisible}
        title={getTransactionModalTitle(transactionStatus, isBusy, t)}
        onCancel={hideSwapTransactionModal}
        afterClose={onAfterTransactionModalClosed}
        width={330}
        footer={null}>
        <div className="transaction-progress">
          {isBusy ? (
            <>
              <Spin indicator={bigLoadingIcon} className="icon" />
              <h4 className="font-bold mb-1 text-uppercase">
                {getTransactionOperationDescription(transactionStatus, t)}
              </h4>
              <p className="operation">
                {fromMint &&
                  toMint &&
                  fromAmount &&
                  exchangeInfo &&
                  exchangeInfo.amountOut &&
                  t("transactions.status.tx-swap-operation", {
                    fromAmount: `${fromAmount} ${mintList[fromMint].symbol}`,
                    toAmount: `${exchangeInfo.amountOut.toFixed(
                      mintList[toMint].decimals
                    )} ${mintList[toMint].symbol}`,
                  })}
              </p>
              <div className="indication">
                {t("transactions.status.instructions")}
              </div>
            </>
          ) : isSuccess() ? (
            <>
              <CheckOutlined style={{ fontSize: 48 }} className="icon" />
              <h4 className="font-bold mb-1 text-uppercase">
                {getTransactionOperationDescription(transactionStatus, t)}
              </h4>
              <p className="operation">
                {t("transactions.status.tx-swap-operation-success")}.
              </p>
              <Button
                block
                type="primary"
                shape="round"
                size="middle"
                onClick={hideSwapTransactionModal}
              >
                {t("general.cta-close")}
              </Button>
            </>
          ) : isError() ? (
            <>
              <WarningOutlined style={{ fontSize: 48 }} className="icon" />
              {txFees &&
              transactionStatus.currentOperation ===
                TransactionStatus.TransactionStartFailure ? (
                <h4 className="mb-4">
                  {t("transactions.status.tx-start-failure", {
                    accountBalance: getTokenAmountAndSymbolByTokenAddress(
                      parseFloat(fromBalance),
                      NATIVE_SOL_MINT.toBase58()
                    ),
                    feeAmount: getTokenAmountAndSymbolByTokenAddress(
                      getComputedFees(txFees),
                      NATIVE_SOL_MINT.toBase58()
                    ),
                  })}
                </h4>
              ) : (
                <>
                  <h4 className="font-bold mb-1 text-uppercase">
                    {getTransactionOperationDescription(transactionStatus, t)}
                  </h4>
                  {txFees &&
                    transactionStatus.currentOperation ===
                      TransactionStatus.ConfirmTransactionFailure && (
                      <>
                        <p className="operation">
                          {t("transactions.status.tx-confirm-failure-check")}
                        </p>
                        <a
                          className="primary-link"
                          style={{ marginBottom: 20 }}
                          href={`https://explorer.solana.com/tx/${currentTxSignature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {shortenAddress(currentTxSignature, 8)}
                        </a>
                      </>
                    )}
                </>
              )}
              <Button
                block
                type="primary"
                shape="round"
                size="middle"
                onClick={hideSwapTransactionModal}
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
 */}
      <PreFooter />
    </>
  );
};
