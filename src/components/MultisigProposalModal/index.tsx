import { useContext, useEffect, useState } from 'react';
import { CheckOutlined, ExclamationCircleOutlined, InfoCircleOutlined, LoadingOutlined } from "@ant-design/icons";
import "./style.scss";
import { getTransactionOperationDescription } from '../../utils/ui';
import { useTranslation } from 'react-i18next';
import { TransactionFees } from '@mean-dao/money-streaming/lib/types';
import { isError } from '../../utils/transactions';
import { TransactionStatus } from '../../models/enums';
import { getTokenAmountAndSymbolByTokenAddress } from '../../utils/utils';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { AppStateContext } from '../../contexts/appstate';
import { useWallet } from '../../contexts/wallet';
import { Modal, Button, Spin, Divider, Checkbox, DatePicker, Row, Col, TimePicker, Switch, Dropdown, Menu, Input, Select } from 'antd';
import { StepSelector } from "../StepSelector";
import moment from 'moment';
import { IconCaretDown, IconEdit, IconHelpCircle, IconUser } from "../../Icons";
import { InfoIcon } from "../InfoIcon";
import { DATEPICKER_FORMAT } from "../../constants";
import { MultisigVault } from '../../models/multisig';
import { InputMean } from '../InputMean';
import { SelectMean } from '../SelectMean';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

const solanaApps = [
  {
    logo: "",
    name: "BPF Loader Program"
  },
  {
    logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwh7gt29278eysxa7rb5sl8%3Ftype%3DLOGO&w=3840&q=75",
    name: "Friktion"
  },
  {
    logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwiiri37677eysxluqnog8e%3Ftype%3DLOGO&w=3840&q=75",
    name: "Raydium"
  },
  {
    logo: "",
    name: "Money Streaming"
  },
  {
    logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwh6nj28403eysxj7hduqbo%3Ftype%3DLOGO&w=3840&q=75",
    name: "Saber"
  },
  {
    logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwip3w40063eysxbk0kx2lc%3Ftype%3DLOGO&w=3840&q=75",
    name: "Wormhole"
  },
  {
    logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwh67t27981eysx2yzq2dq6%3Ftype%3DLOGO&w=3840&q=75",
    name: "Socean Streams"
  },
  {
    logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwilfd38506eysxniku8quh%3Ftype%3DLOGO&w=3840&q=75",
    name: "Mango Markets"
  },
  {
    logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwh6su28617eysxuaubvt93%3Ftype%3DLOGO&w=3840&q=75",
    name: "Marinade Finance"
  },
  {
    logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwilfj38513eysxcwypxovh%3Ftype%3DLOGO&w=3840&q=75",
    name: "Lido Finance"
  },
  {
    logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwh8w830938eysxhy5e8syg%3Ftype%3DLOGO&w=3840&q=75",
    name: "Solend"
  },
];

const expires = [
  "No expires", "24 hours", "48 hours", "72 hours", "7 days"
];

const instructions = [
  "Close asset",
  "Send funds to other asset",
  "Transfer asset ownership",
  "Create treasury",
  "Close treasury",
  "Add a money stream",
  "Withdraw funds from a stream",
  "Upgrade program",
  "Upgrade IDL program",
  "Upgrade authority program"
];

const types = [
  "Open",
  "Locked"
];

export const MultisigProposalModal = (props: {
  handleClose: any;
  isVisible: boolean;
  isBusy: boolean;
}) => {
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const {
    transactionStatus,
    isVerifiedRecipient,
    setTransactionStatus,
    setIsVerifiedRecipient
  } = useContext(AppStateContext);

  const tomorrow = moment().add(1, 'days').format('L');
  const timeDate = moment().format('hh:mm A');

  const [currentStep, setCurrentStep] = useState(0);

  const [proposalTitleValue, setProposalTitleValue] = useState('');
  const [proposalExpiresValue, setProposalExpiresValue] = useState<any>(expires[0]);
  const [proposalDescriptionValue, setProposalDescriptionValue] = useState('');
  const [proposalInstructionValue, setProposalInstructionValue] = useState<any>();
  const [proposalTypeValue, setProposalTypeValue] = useState<any>(types[0]);
  const [proposalMemoValue, setProposalMemoValue] = useState('');
  const [proposalRecipientValue, setProposalRecipientValue] = useState('');
  const [proposalAmountValue, setProposalAmountValue] = useState('');

  const [feeAmount, setFeeAmount] = useState<number | null>(null);

  const [countWords, setCountWords] = useState(0);
  const [lettersLeft, setLettersLeft] = useState(256);

  const [switchValue, setSwitchValue] = useState(true);

  // Switch to show expiry date 
  // const switchHandler = () => {
  //   setSwitchValue(!switchValue);
  // }

  const onStepperChange = (value: number) => {
    setCurrentStep(value);
  }

  const onContinueStepOneButtonClick = () => {
    setCurrentStep(1);  // Go to step 2
  }

  const onContinueStepTwoButtonClick = () => {
    setCurrentStep(2);  // Go to step 3
  }

  const onAcceptModal = () => {
    // props.handleOk({
    //   title: proposalTitleValue,
    //   description: proposalDescriptionValue
    // });
  }

  const onCloseModal = () => {
    props.handleClose();
    onAfterClose();
  }

  const onAfterClose = () => {
    setTimeout(() => {
      setSelectedAppName("");
      setSelectedAppImg("");
      setProposalTitleValue("");
      setProposalExpiresValue(expires[0]);
      setProposalDescriptionValue("");

      setIsVerifiedRecipient(false);
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

  const onProposalInstructionValueChange = (value: any) => {
    setProposalInstructionValue(value);
  }

  const onProposalTypeValueChange = (value: any) => {
    setProposalTypeValue(value);
  }

  const onProposalMemoValueChange = (e: any) => {
    setProposalMemoValue(e.target.value);
  }

  const onProposalRecipientValueChange = (e: any) => {
    setProposalRecipientValue(e.target.value);
  }

  const onProposalDescriptionValueChange = (e: any) => {
    setProposalDescriptionValue(e.target.value);
    setCountWords(e.target.value.length);
  }

  // const handleDateChange = (date: string) => {
  //   setProposalEndDate(date);
  // }

  // const handleTimeChange = (time: string) => {
  //   setProposalEndTime(time);
  // }

  const onIsVerifiedRecipientChange = (e: any) => {
    setIsVerifiedRecipient(e.target.checked);
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

  const [selectedAppName, setSelectedAppName] = useState<string>();
  const [selectedAppImg, setSelectedAppImg] = useState<string>();

  const onSelectApp = (e: any) => {
    setSelectedAppName(e.target.getAttribute("alt"));
    setSelectedAppImg(e.target.getAttribute("src"));
  }

  useEffect(() => {
    setLettersLeft(256 - countWords);
  }, [countWords]);

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
                    {solanaApps.map((app, index) => (
                      <Col xs={8} sm={6} md={6} lg={6} className="select-app" key={index}>
                        <div className="select-app-item simplelink" onClick={onSelectApp}>
                          {app.logo === "" ? (
                            <img src="https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png" className="empty-background" alt="Select an app" />
                          ) : (
                            <img src={app.logo} alt={app.name} width={65} height={65} />
                          )}
                          <span className="info-label">{app.name}</span>
                        </div>
                      </Col>
                    ))}
                  </Row>
                </>
              </div>

              <div className={currentStep === 1 ? "contract-wrapper panel2 show" : "contract-wrapper panel2 hide"}>
                <>
                  <h3>Proposal setup</h3>
                  <div className="step-two-select-app">
                    <Row gutter={[8, 8]}>
                      <Col span={24} className="step-two-selected-app">
                        {!selectedAppImg ? (
                          <IconUser className="mean-svg-icons" />
                        ) : (
                          <img className="mr-1" src={selectedAppImg} alt={selectedAppName} width={40} height={40} />
                        )}
                        <div className="selected-app">
                          <div className="info-label">Selected App</div>
                          <span>{selectedAppName}</span>
                        </div>
                      </Col>

                      {/* Proposal title */}
                      <Col xs={24} sm={24} md={16} lg={16}>
                        <div className="mb-1">
                          <div className="form-label">{t('multisig.proposal-modal.title')}</div>
                          <InputMean
                            id="proposal-title-field"
                            className={props.isBusy ? 'disabled' : ''}
                            onChange={onProposalTitleValueChange}
                            placeholder="Add a title"
                            value={proposalTitleValue}
                          />
                        </div>
                      </Col>

                      {/* Expiry date */}
                      <Col xs={24} sm={24} md={8} lg={8}>
                        <div className="mb-1">
                          <div className="form-label">Expires in</div>
                          <SelectMean
                            className={props.isBusy ? 'disabled' : ''}
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
                        <div className="mb-3">
                          <div className="form-label">{t('multisig.proposal-modal.description')}</div>
                          <div className={`well mb-0 ${props.isBusy ? 'disabled' : ''}`}>
                            <textarea
                              id="proposal-description-field"
                              className="w-100 general-text-input"
                              autoComplete="off"
                              rows={5}
                              maxLength={256}
                              onChange={onProposalDescriptionValueChange}
                              placeholder={t('multisig.proposal-modal.description-placeholder')}
                              value={proposalDescriptionValue}
                            >
                            </textarea>
                          </div>
                          <div className="form-field-hint pr-3 text-right">{t('multisig.proposal-modal.hint-message', {lettersLeft: lettersLeft})}</div>
                        </div>
                      </Col>
                    </Row>

                    <div className="step-two-select-instruction">
                      {/* Instruction */}
                      <Row gutter={[8, 8]} className="mb-1">
                        <Col xs={24} sm={6} md={6} lg={6} className="text-right pr-1">
                          <div className="form-label">Instruction</div>
                        </Col>
                        <Col xs={24} sm={18} md={18} lg={18}>
                          <SelectMean
                            className={props.isBusy ? 'disabled' : ''}
                            onChange={onProposalInstructionValueChange}
                            placeholder={"Select an instruction"}
                            values={instructions}
                            value={proposalInstructionValue}
                          />
                        </Col>
                      </Row>

                      {/* Type */}
                      {(proposalInstructionValue && (
                        proposalInstructionValue === "Add a money stream" ||
                        proposalInstructionValue === "Create treasury"
                      )) && (
                        <Row gutter={[8, 8]} className="mb-1">
                          <Col xs={24} sm={6} md={6} lg={6} className="text-right pr-1">
                            <div className="form-label">Type</div>
                          </Col>
                          <Col xs={24} sm={18} md={18} lg={18}>
                            <SelectMean
                              className={props.isBusy ? 'disabled' : ''}
                              onChange={onProposalTypeValueChange}
                              placeholder={"Select a type"}
                              values={types}
                              value={proposalTypeValue}
                            />
                          </Col>
                        </Row>
                      )}

                      {/* Memo */}
                      {(proposalInstructionValue && (
                        proposalInstructionValue === "Add a money stream"
                      )) && (
                        <Row gutter={[8, 8]} className="mb-1">
                          <Col xs={24} sm={6} md={6} lg={6} className="text-right pr-1">
                            <div className="form-label">Memo</div>
                          </Col>
                          <Col xs={24} sm={18} md={18} lg={18}>
                            <InputMean 
                              id="proposal-memo-field"
                              className={`${props.isBusy ? 'disabled' : ''}`}
                              onChange={onProposalMemoValueChange}
                              placeholder="Add a memo"
                              value={proposalMemoValue}
                            />
                          </Col>
                        </Row>
                      )}

                      {/* Recipient */}
                      {(proposalInstructionValue && (
                        proposalInstructionValue === "Transfer asset ownership" ||
                        proposalInstructionValue === "Send funds to other asset" ||
                        proposalInstructionValue === "Add a money stream" ||
                        proposalInstructionValue === "Withdraw funds from a stream" ||
                        proposalInstructionValue === "Upgrade program" ||
                        proposalInstructionValue === "Upgrade IDL program" ||
                        proposalInstructionValue === "Upgrade authority program"
                      )) && (
                        <Row gutter={[8, 8]} className="mb-1">
                          <Col xs={24} sm={6} md={6} lg={6} className="text-right pr-1">
                            <div className="form-label">Recipient</div>
                          </Col>
                          <Col xs={24} sm={18} md={18} lg={18}>
                            <InputMean 
                              id="proposal-recipient-field"
                              className={`${props.isBusy ? 'disabled' : ''}`}
                              onChange={onProposalRecipientValueChange}
                              placeholder="Add a recipient"
                              value={proposalRecipientValue}
                            />
                          </Col>
                        </Row>
                      )}

                      {/* Amount */}
                      {(proposalInstructionValue && (
                        proposalInstructionValue === "Send funds to other asset" ||
                        proposalInstructionValue === "Add a money stream" ||
                        proposalInstructionValue === "Withdraw funds from a stream"
                      )) && (
                        <Row gutter={[8, 8]} className="mb-1">
                          <Col xs={24} sm={6} md={6} lg={6} className="text-right pr-1">
                            <div className="form-label">Amount</div>
                          </Col>
                          <Col xs={24} sm={18} md={18} lg={18}>
                            <div className={`well ${props.isBusy ? 'disabled' : ''}`}>
                              <div className="flex-fixed-right">
                                <div className="left">
                                  <input
                                    id="proposal-title-field"
                                    className="w-100 general-text-input"
                                    autoComplete="off"
                                    autoCorrect="off"
                                    type="text"
                                    maxLength={52}
                                    onChange={() => {}}
                                    placeholder="Add an amount"
                                    value=""
                                  />
                                </div>
                              </div>
                            </div>
                          </Col>
                        </Row>
                      )}

                      {/* Confirm that the recipient address doesn't belong to an exchange */}
                      {(proposalInstructionValue && (
                        proposalInstructionValue === "Transfer asset ownership" ||
                        proposalInstructionValue === "Send funds to other asset" ||
                        proposalInstructionValue === "Add a money stream" ||
                        proposalInstructionValue === "Withdraw funds from a stream" ||
                        proposalInstructionValue === "Upgrade program" ||
                        proposalInstructionValue === "Upgrade IDL program" ||
                        proposalInstructionValue === "Upgrade authority program"
                      )) && (
                        <div className="mt-2 mb-3 confirm-terms">
                          <Checkbox checked={isVerifiedRecipient} onChange={onIsVerifiedRecipientChange}>
                            {t("withdraw-funds.modal.verified-label")}
                          </Checkbox>
                        </div>
                      )}

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
                      {/* {multisigTransactionSummary.title && ( */}
                        <>
                          <Col span={8} className="text-right pr-1">
                            <span className="info-label">{t('multisig.proposal-modal.title-label')}:</span>
                          </Col>
                          <Col span={16} className="text-left pl-1">
                            <span>{proposalTitleValue}</span>
                          </Col>
                        </>
                      {/* )} */}
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

                    {/* Instruction */}
                    <Row className="mb-1">
                      {/* {multisigTransactionSummary.instruction && ( */}
                        <>
                          <Col span={8} className="text-right pr-1">
                            <span className="info-label">Instruction:</span>
                          </Col>
                          <Col span={16} className="text-left pl-1">
                            <span>{proposalInstructionValue}</span>
                          </Col>
                        </>
                      {/* )} */}
                    </Row>

                    {/* Type */}
                    <Row className="mb-1">
                      {/* {multisigTransactionSummary.type && ( */}
                        <>
                          <Col span={8} className="text-right pr-1">
                            <span className="info-label">Type:</span>
                          </Col>
                          <Col span={16} className="text-left pl-1">
                            <span>{proposalTypeValue}</span>
                          </Col>
                        </>
                      {/* )} */}
                    </Row>

                    {/* Memo */}
                    <Row className="mb-1">
                      {/* {multisigTransactionSummary.memo && ( */}
                        <>
                          <Col span={8} className="text-right pr-1">
                            <span className="info-label">Memo:</span>
                          </Col>
                          <Col span={16} className="text-left pl-1">
                            <span>{proposalMemoValue}</span>
                          </Col>
                        </>
                      {/* )} */}
                    </Row>

                    {/* Recipient */}
                    <Row className="mb-1">
                      {/* {multisigTransactionSummary.memo && ( */}
                        <>
                          <Col span={8} className="text-right pr-1">
                            <span className="info-label">Recipient:</span>
                          </Col>
                          <Col span={16} className="text-left pl-1">
                            <span>{proposalRecipientValue}</span>
                          </Col>
                        </>
                      {/* )} */}
                    </Row>

                    {/* Proposer */}
                    <Row className="mb-1">
                      <Col span={8} className="text-right pr-1">
                        <span className="info-label">{t('multisig.multisig-transactions.proposed-by')}</span>
                      </Col>
                      <Col span={16} className="text-left pl-1">
                        {/* <span>{getTxInitiator(highlightedMultisigTx)?.name} ({shortenAddress(multisigTransactionSummary.proposer as string, 4)})</span> */}
                        <span>Yansel (HvPJ1...1BUDa)</span>
                      </Col>
                    </Row>

                    {/* Submitted on */}
                    {/* <Row className="mb-1">
                      <Col span={8} className="text-right pr-1">
                        <span className="info-label">{t('multisig.multisig-transactions.submitted-on')}</span>
                      </Col>
                      <Col span={16} className="text-left pl-1"> */}
                        {/* <span>{getReadableDate(multisigTransactionSummary.createdOn, true)}</span> */}
                        {/* <span>{proposalExpiresValue}</span>
                      </Col>
                    </Row> */}

                    {/* Status */}
                    {/* <Row className="mb-1">
                      <Col span={8} className="text-right pr-1">
                        <span className="info-label">{t('multisig.multisig-transactions.column-pending-signatures')}:</span>
                      </Col>
                      <Col span={16} className="text-left pl-1 mb-1 d-flex align-items-start justify-content-start"> */}
                        {/* <span>{getTxSignedCount(highlightedMultisigTx)} {t('multisig.multisig-transactions.tx-signed')}, {selectedMultisig.threshold - getTxSignedCount(highlightedMultisigTx)} {t('multisig.multisig-transactions.tx-pending')}</span>
                        <MultisigOwnersSigned className="ml-1" participants={getParticipantsThatApprovedTx(highlightedMultisigTx) || []} /> */}
                        {/* <span>2 signed, 3 pending</span> */}
                      {/* </Col>
                    </Row> */}

                    {/* <Row>
                      <Col span={24}> */}
                        {/* {isTxPendingExecution() ? (
                          <div className="text-center proposal-resume">{t('multisig.multisig-transactions.proposal-ready-to-be-executed')}</div>
                        ) : isTxPendingApproval() ? (
                          <div className="text-center proposal-resume">{(selectedMultisig.threshold - getTxSignedCount(highlightedMultisigTx)) > 1 ? t('multisig.multisig-transactions.missing-signatures', {missingSignature: selectedMultisig.threshold - getTxSignedCount(highlightedMultisigTx)}) : t('multisig.multisig-transactions.missing-signature', {missingSignature: selectedMultisig.threshold - getTxSignedCount(highlightedMultisigTx)})}</div>
                        ) : isTxVoided() ? (
                          <div className="text-center proposal-resume">{t('multisig.multisig-transactions.tx-operation-voided')}</div>
                        ) : isTxExpired() ? (
                          <div className="text-center proposal-resume">{t('multisig.multisig-transactions.tx-operation-expired')}</div>
                        ) : (
                          <div className="text-center proposal-resume">{t('multisig.multisig-transactions.proposal-completed')}</div>
                        )} */}
                        {/* <div className="text-center proposal-resume">To execute this proposal, 1 more signature is needed.</div> */}
                      {/* </Col>
                    </Row> */}

                    {/* <Divider className="mt-1" /> */}

                    {/* <Row className="mb-1">
                      <Col span={12} className="text-right pr-1">
                        <div className="text-uppercase">{t('multisig.proposal-modal.instruction')}:</div>
                      </Col>
                      <Col span={12} className="text-left pl-1">
                        <div>{getOperationName(highlightedMultisigTx.operation)}</div>
                        <div>Create Money Stream</div>
                      </Col>
                    </Row> */}

                    {/* <div className="well mb-1 proposal-summary-container vertical-scroll">
                    </div> */}
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
                      !selectedAppName
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
                      !selectedAppName ||
                      !proposalTitleValue ||
                      !isVerifiedRecipient
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
                      !selectedAppName ||
                      !proposalTitleValue ||
                      !isVerifiedRecipient
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