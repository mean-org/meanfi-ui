import { useCallback, useContext, useEffect, useState } from 'react';
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from "@ant-design/icons";
import "./style.scss";
import { consoleOut, getTransactionOperationDescription } from '../../utils/ui';
import { useTranslation } from 'react-i18next';
import { isError } from '../../utils/transactions';
import { TransactionStatus } from '../../models/enums';
import { AppStateContext } from '../../contexts/appstate';
import { useWallet } from '../../contexts/wallet';
import { Modal, Button, Spin, Divider, Row, Col, Radio } from 'antd';
import { StepSelector } from "../StepSelector";
import { IconHelpCircle, IconUser } from "../../Icons";
import { InputMean } from '../InputMean';
import { SelectMean } from '../SelectMean';
import { InfoIcon } from '../InfoIcon';
import { FormLabelWithIconInfo } from '../FormLabelWithIconInfo';
import { InputTextAreaMean } from '../InputTextAreaMean';
import { App, AppConfig, AppsProvider, UiInstruction, MEAN_MULTISIG_PROGRAM } from '@mean-dao/mean-multisig-apps';
import BN from 'bn.js';
import { PublicKey } from '@solana/web3.js';
import { Identicon } from '../../components/Identicon';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

const expires = [
  "No expires", "24 hours", "48 hours", "72 hours", "7 days"
];

export const MultisigProposalModal = (props: {
  handleClose: any;
  isVisible: boolean;
  isBusy: boolean;
  proposer: string;
  appsProvider: AppsProvider | undefined;
  solanaApps: App[],
  handleOk: any
}) => {
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const {
    transactionStatus,
    setTransactionStatus,
  } = useContext(AppStateContext);

  const [currentStep, setCurrentStep] = useState(0);
  const [proposalTitleValue, setProposalTitleValue] = useState('');
  const [proposalExpiresValue, setProposalExpiresValue] = useState<any>(expires[0]);
  const [proposalDescriptionValue, setProposalDescriptionValue] = useState('');
  // const [proposalInstructionValue, setProposalInstructionValue] = useState<any>();
  const [countWords, setCountWords] = useState(0);
  const [lettersLeft, setLettersLeft] = useState(256);

  const [selectedApp, setSelectedApp] = useState<App>();
  const [selectedAppConfig, setSelectedAppConfig] = useState<AppConfig>();
  const [selectedUiIx, setSelectedUiIx] = useState<UiInstruction | undefined>();

  const onStepperChange = (value: number) => {
    setCurrentStep(value);
  }

  const onContinueStepOneButtonClick = () => {
    setCurrentStep(1);  // Go to step 2
  }

  const onContinueStepTwoButtonClick = () => {
    setCurrentStep(2);  // Go to step 3
  }

  const updateSelectedIx = (state: any) => {
    if (!selectedUiIx) { return; }
    const currentUiIx = Object.assign({}, selectedUiIx);
    // const stateElements = Object.entries(state);
    for (const uiElem of currentUiIx.uiElements) {
      if (!state[uiElem.name]) { continue; }
      if (uiElem.type !== "knownValue") {
        if (uiElem.visibility === "show") {
          uiElem.value = state[uiElem.name];
          const dataElement = uiElem.dataElement as any;
          if (dataElement && dataElement.dataType) {
            if (dataElement.dataType === "u64") {
              if (uiElem.type === "datePicker") {
                const date = new Date(state[uiElem.name]);
                dataElement.dataValue = new BN(date.getTime() / 1_000);
              } else {
                dataElement.dataValue = new BN(state[uiElem.name]);
              }
            } else if (dataElement.dataType === "u8") {
              dataElement.dataValue = parseInt(state[uiElem.name]);
            } else if (dataElement.dataType === "string") {
              dataElement.dataValue = state[uiElem.name];
            }
          } else if (dataElement && !dataElement.dataType) {
            // console.log('public key', state[uiElem.name]);
            dataElement.dataValue = new PublicKey(state[uiElem.name]);
          }
        }
      }
    }
    setSelectedUiIx(currentUiIx);
  };

  const onAcceptModal = () => {
    if (!selectedApp || !selectedAppConfig || !selectedUiIx) { return; }
    updateSelectedIx(inputState);
    props.handleOk({
      appId: selectedApp.id,
      title: proposalTitleValue,
      description: proposalDescriptionValue,
      expires: proposalExpiresValue,
      config: selectedAppConfig,
      instruction: selectedUiIx
    });
  }

  const onCloseModal = () => {
    props.handleClose();
    onAfterClose();
  }

  const onAfterClose = () => {
    setTimeout(() => {
      setSelectedApp(undefined);
      setProposalTitleValue("");
      setProposalExpiresValue(expires[0]);
      setProposalDescriptionValue("");
    });
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }

  const getStepOneContinueButtonLabel = (): string => {
    return !publicKey
      ? t('transactions.validation.not-connected')
      : t('Next')
  };

  const getStepTwoContinueButtonLabel = (): string => {
    return !publicKey
      ? t('transactions.validation.not-connected')
      : t('Next')
  };

  const getTransactionStartButtonLabel = (): string => {
    return !publicKey
      ? t('transactions.validation.not-connected')
      : t('Execute')
  };

  const onProposalTitleValueChange = (e: any) => {
    setProposalTitleValue(e.target.value);
  }

  const onProposalExpiresValueChange = (value: any) => {
    setProposalExpiresValue(value);
  }

  const onProposalDescriptionValueChange = (e: any) => {
    setProposalDescriptionValue(e.target.value);
    setCountWords(e.target.value.length);
  }

  const [inputState, setInputState] = useState<any>({});

  const onProposalInstructionValueChange = (value: any) => {
    // setProposalInstructionValue(value);
    if (!value) { return; }
    
    const uiIx = selectedAppConfig && selectedAppConfig.ui.length 
      ? selectedAppConfig.ui.filter((ix: any) => ix.id === value.key)[0]
      : undefined;

    setSelectedUiIx(uiIx);
  }

  const handleChangeInput = (e: any) => {
    setInputState({
      ...inputState,
      [e.id]: e.value
    });
  }

  const handleChangeYesOrNot = (e: any) => {
    setInputState({
      ...inputState,
      [e.id]: e.value
    });
  }

  consoleOut("inputState", inputState);

  const [selectOptionState, setSelectOptionState] = useState<any>({});

  const handleChangeOption = (e: any) => {    
    setSelectOptionState({ [e.key]: e.value });
    setInputState({
      ...inputState,
      [e.key]: e.value
    });
  }

  // Preset fee amount
  // useEffect(() => {
  //   if (!feeAmount && props.transactionFees) {
  //     setFeeAmount(props.transactionFees.mspFlatFee);
  //   }
  // }, [
  //   feeAmount,
  //   props.transactionFees
  // ]);

  useEffect(() => {

    if (!props.appsProvider || !selectedApp) { return; }

    props.appsProvider.getAppConfig(
      selectedApp.id,
      selectedApp.uiUrl,
      selectedApp.defUrl
    )
    .then((config: any) => {
      setSelectedAppConfig(config);
    })
    .catch((err: any) => {
      consoleOut('Error: ', err, 'red');
    });
  },[
    props.appsProvider, 
    selectedApp
  ]);

  useEffect(() => {
    setLettersLeft(256 - countWords);
  }, [countWords]);

  // Display solana apps in proposal modal (Step 1)
  const renderSolanaApps = (
    <>
      {props.solanaApps.length > 0 && (
        props.solanaApps.map((app, index) => {
          const onSelectApp = () => {
            setSelectedUiIx(undefined);
            setSelectedApp(app);
          }

          return (
            <Col xs={8} sm={6} md={6} lg={6} className="select-app" key={index}>
              <div className={`select-app-item simplelink ${selectedApp && selectedApp.id === app.id ? "selected-app" : "no-selected-app"}`} onClick={onSelectApp}>
                {app.id === MEAN_MULTISIG_PROGRAM.toBase58() ? (
                  // <Identicon address={PublicKey.default} style={{ width:"65", height:"65", display: "inline-flex" }} />
                  <img style={{ borderRadius: "50%", padding: "0.2em" }} src={"https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png"} width={65} height={65} alt={app.name} />
                ) : (
                  <img src={app.logoUri} width={65} height={65} alt={app.name} />
                )}
                {/* <img src={app.logoUri ? app.logoUri : "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png"} width={65} height={65} alt={app.name} /> */}
                <span className="info-label">{app.name}</span>
              </div>
            </Col>
          )
        })
      )}
    </>
  );

  return (
    <Modal
      className="mean-modal simple-modal multisig-proposal-modal"
      title={<div className="modal-title">New proposal</div>}
      maskClosable={false}
      footer={null}
      visible={props.isVisible}
      // onOk={onAcceptModal}
      onCancel={onCloseModal}
      width={props.isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}>

      <Divider plain />

      <div className={!props.isBusy ? "panel1 show" : "panel1 hide"}>
        {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
          <>
            <div className="scrollable-content">
              <StepSelector step={currentStep} steps={3} onValueSelected={onStepperChange} />

              <div className={currentStep === 0 ? "contract-wrapper panel1 show" : "contract-wrapper panel1 hide"}>
                <>
                  <h3>Select app</h3>
                  <Row gutter={[8, 8]} className="step-one-select-app">
                    {renderSolanaApps}
                  </Row>
                </>
              </div>

              <div className={currentStep === 1 ? "contract-wrapper panel2 show" : "contract-wrapper panel2 hide"}>
                <>
                  <h3>Proposal setup</h3>
                  <div className="step-two-select-app">
                    <Row gutter={[8, 8]}>
                      <Col span={24} className="step-two-selected-app">
                        {selectedApp && (
                          !selectedApp.logoUri || selectedApp.id === MEAN_MULTISIG_PROGRAM.toBase58() ? (
                            <img style={{ borderRadius: "50%", padding: "0.2em" }} src={"https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png"} width={40} height={40} alt={selectedApp.name} />
                          ) : (
                            <img className="mr-1" src={selectedApp.logoUri} alt={selectedApp.name} width={40} height={40} />
                          )
                        )}
                        <div className="selected-app">
                          <div className="info-label">Selected App</div>
                          <span>{selectedApp && selectedApp.name}</span>
                        </div>
                      </Col>

                      {/* Proposal title */}
                      <Col xs={24} sm={24} md={16} lg={16}>
                        <div className="mb-2">
                          <div className="form-label">{t('multisig.proposal-modal.title')}</div>
                          <InputMean
                            id="proposal-title-field"
                            name="Title"
                            className={`mb-0 ${props.isBusy ? 'disabled' : ''}`}
                            onChange={onProposalTitleValueChange}
                            placeholder="Add a title"
                            value={proposalTitleValue}
                          />
                        </div>
                      </Col>

                      {/* Expiry date */}
                      <Col xs={24} sm={24} md={8} lg={8}>
                        <div className="mb-2">
                          <div className="form-label">Expires in</div>
                          <SelectMean
                            className={`mb-0 ${props.isBusy ? 'disabled' : ''}`}
                            onChange={onProposalExpiresValueChange}
                            defaultValue={expires[0]}
                            values={expires}
                            value={proposalExpiresValue}
                          />
                        </div>
                      </Col>
                    </Row>

                    {/* Proposal description */}
                    <Row gutter={[8, 8]}>
                      <Col xs={24} sm={24} md={24} lg={24}>
                        <div className="mb-1">
                          <div className="form-label">{t('multisig.proposal-modal.description')}</div>
                          <InputTextAreaMean 
                            id="proposal-description-field"
                            maxLength={256}
                            className={`mb-0 ${props.isBusy ? 'disabled' : ''}`}
                            onChange={onProposalDescriptionValueChange}
                            placeholder={t('multisig.proposal-modal.description-placeholder')}
                            value={proposalDescriptionValue}
                          />
                          <div className="form-field-hint pr-3 text-right">{t('multisig.proposal-modal.hint-message', {lettersLeft: lettersLeft})}</div>
                        </div>
                      </Col>
                    </Row>

                    <div className="step-two-select-instruction">
                      {selectedApp && (
                        <Row gutter={[8, 8]} className="mb-1">
                          {(selectedApp.name === "Custom Transaction Proposal") ? (
                            <>
                              {/* Serialized Tx */}
                              {selectedAppConfig?.ui.map((ix: any) => (
                                ix.uiElements.map((element: any) => (
                                  <Col xs={24} sm={24} md={24} lg={24} className="text-left pl-1" key={element.id}>
                                    <FormLabelWithIconInfo
                                      label={element.label}
                                      tooltip_text={element.help}
                                    />
                                    <InputTextAreaMean 
                                      id={element.label}
                                      rows={10}
                                      className={`vertical-scroll ${props.isBusy ? 'disabled' : ''}`}
                                      onChange={(e: any) => {
                                        console.log(e);
                                        handleChangeInput({
                                          id: element.name,
                                          value: e.target.value
                                        });
                                      }}
                                      placeholder={element.help}
                                      value={inputState[element.name]}
                                    />
                                  </Col>
                                ))
                              ))}
                            </>
                          ) : (
                            <>
                             {/* Instruction */}
                              <Col xs={24} sm={24} md={24} lg={24} className="text-left pr-1">
                                <div className="form-label">Instruction:</div>
                                <SelectMean
                                  className={props.isBusy ? 'disabled' : ''}
                                  onChange={onProposalInstructionValueChange}
                                  placeholder="Select an instruction"
                                  values={selectedAppConfig ? selectedAppConfig.ui.map((ix: any) => {
                                    return { key: ix.id, label: ix.label, value: ix.id }
                                  }) : []}
                                  labelInValue={true}
                                  value={{
                                    key: selectedUiIx?.id,
                                    value: selectedUiIx?.id,
                                    label: selectedUiIx?.label
                                  }}
                                />
                              </Col>
                            </>
                          )}
                        </Row>
                      )}

                      {selectedAppConfig?.ui.map((ix: any) => (
                        selectedUiIx && selectedUiIx.id === ix.id && ix.uiElements.map((element: any) => (
                          <>
                            {element.visibility === "show" && (
                              <Row gutter={[8, 8]} className="mb-1" key={element.id}>
                                {(element.type === "inputText") ? (
                                  <>
                                    <Col xs={24} sm={24} md={24} lg={24} className="text-left pl-1">
                                      <FormLabelWithIconInfo
                                        label={element.label}
                                        tooltip_text={element.help}
                                      />
                                      <InputMean
                                        id={element.name}
                                        maxLength={64}
                                        className={props.isBusy ? 'disabled' : ''}
                                        name={element.label}
                                        onChange={(e: any) => {
                                          console.log(e);
                                          handleChangeInput({
                                            id: element.name,
                                            value: e.target.value
                                          });
                                        }}
                                        placeholder={element.help}
                                        value={inputState[element.name]}
                                      />
                                    </Col>
                                  </>
                                ) : (element.type === "inputTextArea") ? (
                                  <>
                                    <Col xs={24} sm={24} md={24} lg={24} className="text-left pl-1">
                                      <FormLabelWithIconInfo
                                        label={element.label}
                                        tooltip_text={element.help}
                                      />
                                      <InputTextAreaMean 
                                        id={element.label}
                                        className={props.isBusy ? 'disabled' : ''}
                                        maxLength={256}
                                        onChange={(e: any) => {
                                          console.log(e);
                                          handleChangeInput({
                                            id: element.name,
                                            value: e.target.value
                                          });
                                        }}
                                        placeholder={element.help}
                                        value={inputState[element.name]}
                                      />
                                    </Col>
                                  </>
                                ) : (element.type === "option") ? (
                                  <>
                                    <Col xs={24} sm={24} md={24} lg={24} className="text-left pr-1">
                                      <FormLabelWithIconInfo
                                        label={element.label}
                                        tooltip_text={element.help}
                                      />
                                      <SelectMean
                                        key={element.name}
                                        className={props.isBusy ? 'disabled' : ''}
                                        onChange={(value: any) => {
                                          handleChangeOption({
                                            key: element.name,
                                            value: value
                                          });
                                        }}
                                        placeholder={element.help}
                                        values={element.value.map((elem: any) => elem.value)}
                                        value={selectOptionState[element.name]}
                                      />
                                    </Col>
                                  </>
                                ) : (element.type === "yesOrNo") ? (
                                  <>
                                    <Col xs={24} sm={6} md={6} lg={6} className="text-right pr-1">
                                      <FormLabelWithIconInfo
                                        label={element.label}
                                        tooltip_text={element.help}
                                      />
                                    </Col>
                                    <Col xs={24} sm={18} md={18} lg={18} className="pt-1">
                                      <Radio.Group className="ml-2" 
                                        id={element.name}
                                        onChange={(e: any) => {
                                          handleChangeYesOrNot({
                                            id: element.name,
                                            value: e.target.value
                                          })
                                        }}
                                        name={element.label}
                                        value={inputState[element.name]}
                                      >
                                        <Radio value={true}>{t('general.yes')}</Radio>
                                        <Radio value={false}>{t('general.no')}</Radio>
                                      </Radio.Group>
                                    </Col>
                                  </>
                                ) : (element.type === "knownValue") ? (
                                  <>
                                    <Row gutter={[8, 8]} className="mb-1" key={element.id}>
                                      <Col xs={24} sm={24} md={24} lg={24} className="text-right pr-1">
                                        <FormLabelWithIconInfo
                                          label={element.label}
                                          tooltip_text={element.help}
                                        />
                                        <code>{element.value}</code>
                                      </Col>
                                    </Row>
                                  </>
                                ) : (element.type === "slot") ? (
                                  <>
                                    <Row gutter={[8, 8]} className="mb-1" key={element.id}>
                                      <Col xs={24} sm={24} md={24} lg={24} className="text-right pr-1">
                                        <FormLabelWithIconInfo
                                          label={element.label}
                                          tooltip_text={element.help}
                                        />
                                        <code>{element.value}</code>
                                      </Col>
                                    </Row>
                                  </>
                                ) : (element.type === "txProposer") ? (
                                  <>
                                    <Row gutter={[8, 8]} className="mb-1" key={element.id}>
                                      <Col xs={24} sm={24} md={24} lg={24} className="text-right pr-1">
                                        <FormLabelWithIconInfo
                                          label={element.label}
                                          tooltip_text={element.help}
                                        />
                                        <code>{props.proposer}</code>
                                      </Col>
                                    </Row>
                                  </>
                                ) : (element.type === "treasuryAccount") ? (
                                  <></>
                                ) : null}
                              </Row>
                            )}
                          </>
                        ))
                      ))}
                    </div>
                  </div>
                </>
              </div>

              <div className={currentStep === 2 ? "contract-wrapper panel3 show" : "contract-wrapper panel3 hide"}>
                <>
                  <h3>Review proposal</h3>
                  <div className="step-three-select-app">

                    {/* Title */}
                    <Row className="mb-1">
                      {proposalTitleValue && (
                        <>
                          <Col span={8} className="text-right pr-1">
                            <span className="info-label">{t('multisig.proposal-modal.title-label')}:</span>
                          </Col>
                          <Col span={16} className="text-left pl-1">
                            <span>{proposalTitleValue}</span>
                          </Col>
                        </>
                      )}
                    </Row>

                    {/* Expiry date */}
                    {/* {!highlightedMultisigTx.executedOn && ( */}
                      <Row className="mb-1">
                        <Col span={8} className="text-right pr-1">
                          <span className="info-label">{t('multisig.proposal-modal.expires-label')}:</span>
                        </Col>
                        <Col span={16} className="text-left pl-1">
                          {/* {multisigTransactionSummary.expirationDate ? (
                            <>
                              {(isTxPendingApproval() || isTxPendingExecution()) ? (
                                <Countdown className="align-middle" date={multisigTransactionSummary.expirationDate} renderer={renderer} />
                              ) : (
                                <span>Expired on {new Date(multisigTransactionSummary.expirationDate).toDateString()}</span>
                              )}
                            </>
                          ) : (
                            <span>{t('multisig.proposal-modal.does-not-expire')}</span>
                          )} */}
                          <span>{proposalExpiresValue}</span>
                        </Col>
                      </Row>
                    {/* )} */}

                    {/* Description */}
                    <Row className="mb-1">
                      {proposalDescriptionValue && (
                        <>
                          <Col span={8} className="text-right pr-1">
                            <span className="info-label">Description:</span>
                          </Col>
                          <Col span={16} className="text-left pl-1">
                            <span>{proposalDescriptionValue}</span>
                          </Col>
                        </>
                      )}
                    </Row>

                    {/* Instruction */}
                    <Row className="mb-1">
                      {selectedUiIx && (
                        <>
                          <Col span={8} className="text-right pr-1">
                            <span className="info-label">Instruction:</span>
                          </Col>
                          <Col span={16} className="text-left pl-1">
                            <span>{selectedUiIx.label}</span>
                          </Col>
                        </>
                      )}
                    </Row>

                    {/* Data from selected instruction */}
                    {(selectedApp && (selectedApp.name === "Custom Transaction Proposal")) ? (
                      <>
                        {Object.keys(inputState).map((key, index) => (
                          <>
                            <div className="info-label text-center">
                              {selectedAppConfig?.ui.map((ix: any) => (
                                ix.uiElements.map((element: any) => (
                                  <span>{element.label}</span>
                                ))
                              ))}
                            </div>
                            <div className="well mb-1 proposal-summary-container vertical-scroll">
                              <div className="mb-1">
                                <span key={index}>{inputState.serializedTx}</span>
                              </div>
                            </div>
                          </>
                        ))}
                      </>
                    ) : (
                      Object.keys(inputState).map((key, index) => (
                        <Row className="mb-1" key={index}>
                          {key && (
                            <>
                              <Col span={8} className="text-right pr-1">
                                <span className="info-label">{selectedUiIx?.uiElements.filter((e: any) => e.name === key)[0].label}:</span>
                              </Col>
                              <Col span={16} className="text-left pl-1">
                                <span>{inputState[key] === true ? "Yes" : inputState[key] === false ? "No" : inputState[key]}</span>
                              </Col>
                            </>
                          )}
                        </Row>
                      ))
                    )}
                  </div>
                </>
              </div>
            </div>

            <Divider plain/>

            <div className={currentStep === 0 ? "contract-wrapper panel1 show" : "contract-wrapper panel1 hide"}>
              <Row>
                <Col span={12} className="d-flex justify-content-center">
                  <Button
                    type="ghost"
                    size="middle"
                    className="thin-stroke col-6"
                    onClick={onCloseModal}
                    disabled={
                      !publicKey
                    }
                  >
                    Cancel
                  </Button>
                </Col>
                <Col span={12} className="d-flex justify-content-center">
                  <Button
                    type="primary"
                    shape="round"
                    size="middle"
                    className="col-6"
                    onClick={onContinueStepOneButtonClick}
                    disabled={
                      !publicKey ||
                      !selectedApp
                    }
                  >
                    {getStepOneContinueButtonLabel()}
                  </Button>
                </Col>
              </Row>
            </div>

            <div className={currentStep === 1 ? "contract-wrapper panel2 show" : "contract-wrapper panel2 hide"}>
              <Row>
                <Col span={12} className="d-flex justify-content-center">
                  <Button
                    type="ghost"
                    size="middle"
                    className="thin-stroke col-6"
                    onClick={() => onStepperChange(0)}
                    disabled={
                      !publicKey
                    }
                  >
                    Back
                  </Button>
                </Col>
                <Col span={12} className="d-flex justify-content-center">
                  <Button
                    type="primary"
                    shape="round"
                    size="middle"
                    className="col-6"
                    onClick={onContinueStepTwoButtonClick}
                    disabled={
                      !publicKey ||
                      !selectedApp ||
                      !proposalTitleValue ||
                      !selectedUiIx
                    }
                  >
                    {getStepTwoContinueButtonLabel()}
                  </Button>
                </Col>
              </Row>
            </div>

            <div className={currentStep === 2 ? "contract-wrapper panel3 show" : "contract-wrapper panel3 hide"}>
              <Row>
                <Col span={12} className="d-flex justify-content-center">
                  <Button
                    type="ghost"
                    size="middle"
                    className="thin-stroke col-6"
                    onClick={() => onStepperChange(1)}
                    disabled={
                      !publicKey
                    }
                  >
                    Back
                  </Button>
                </Col>
                <Col span={12} className="d-flex justify-content-center">
                  <Button
                    type="primary"
                    shape="round"
                    size="middle"
                    className="col-6"
                    onClick={() => onAcceptModal()}
                    disabled={
                      !publicKey ||
                      !selectedApp ||
                      !proposalTitleValue ||
                      !selectedUiIx ||
                      !selectedAppConfig
                    }
                  >
                    {getTransactionStartButtonLabel()}
                  </Button>
                </Col>
              </Row>
            </div>
          </>
        ) : transactionStatus.currentOperation === TransactionStatus.TransactionFinished ? (
          <>
            <div className="transaction-progress p-2">
              <CheckOutlined style={{ fontSize: 48 }} className="icon mt-0" />
              <h4 className="font-bold">{t('multisig.update-multisig.success-message')}</h4>
              <div className="row two-col-ctas mt-3 transaction-progress p-2">
                <div className="col-12">
                  <Button
                    block
                    type="text"
                    shape="round"
                    size="middle"
                    className={props.isBusy ? 'inactive' : ''}
                    onClick={() => onCloseModal()}>
                    {t('general.cta-close')}
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="transaction-progress p-2">
              <InfoCircleOutlined style={{ fontSize: 48 }} className="icon mt-1" />
              {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                <h4 className="mb-4">
                  {/* {t('transactions.status.tx-start-failure', {
                    accountBalance: getTokenAmountAndSymbolByTokenAddress(
                      props.nativeBalance,
                      NATIVE_SOL_MINT.toBase58()
                    ),
                    feeAmount: getTokenAmountAndSymbolByTokenAddress(
                      props.transactionFees.blockchainFee + props.transactionFees.mspFlatFee,
                      NATIVE_SOL_MINT.toBase58()
                    )})
                  } */}
                </h4>
              ) : (
                <h4 className="font-bold mb-3">
                  {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
                </h4>
              )}
              {!(props.isBusy && transactionStatus !== TransactionStatus.Iddle) && (
                <div className="row two-col-ctas mt-3 transaction-progress p-2">
                  <div className="col-12">
                    <Button
                      block
                      type="text"
                      shape="round"
                      size="middle"
                      className={props.isBusy ? 'inactive' : ''}
                      onClick={() => (isError(transactionStatus.currentOperation) && transactionStatus.currentOperation !== TransactionStatus.TransactionStartFailure)
                        ? onAcceptModal()
                        : onCloseModal()}>
                      {(isError(transactionStatus.currentOperation) && transactionStatus.currentOperation !== TransactionStatus.TransactionStartFailure)
                        ? t('general.retry')
                        : t('general.cta-close')
                      }
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div 
        className={props.isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle ? "panel2 show" : "panel2 hide"}>
        {props.isBusy && transactionStatus !== TransactionStatus.Iddle && (
        <div className="transaction-progress p-4">
          <Spin indicator={bigLoadingIcon} className="icon mb-1 mt-1" />
          <h4 className="font-bold">
            {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
          </h4>
          {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
            <div className="indication">{t('transactions.status.instructions')}</div>
          )}
        </div>
        )}
      </div>
    </Modal>
  );
};