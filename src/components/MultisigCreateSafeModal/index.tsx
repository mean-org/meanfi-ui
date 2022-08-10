import { Button, Col, DatePicker, Divider, Dropdown, Menu, Modal, Row, Spin, Switch, TimePicker, Tooltip } from "antd";
import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppStateContext } from "../../contexts/appstate";
import { useWallet } from "../../contexts/wallet";
import { PaymentRateType, TransactionStatus } from "../../models/enums";
import { StepSelector } from "../StepSelector";
import "./style.scss";
import { IconCaretDown, IconInfoCircle, IconKey, IconLock } from "../../Icons";
import { MultisigInfo, MultisigParticipant, MultisigTransactionFees } from "@mean-dao/mean-multisig-sdk";
import { DATEPICKER_FORMAT, MAX_MULTISIG_PARTICIPANTS } from "../../constants";
import { MultisigSafeOwners } from "../MultisigSafeOwners";
import { CopyExtLinkGroup } from "../CopyExtLinkGroup";
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from "@ant-design/icons";
import { addDays, getTokenAmountAndSymbolByTokenAddress, shortenAddress } from "../../utils/utils";
import { NATIVE_SOL_MINT } from "../../utils/ids";
import { getCoolOffPeriodOptionLabel, getTransactionOperationDescription, isValidAddress, PaymentRateTypeOption } from "../../utils/ui";
import { isError } from "../../utils/transactions";
import { CreateNewSafeParams } from "../../models/multisig";
import moment from 'moment';
import { isMobile } from "react-device-detect";
import useWindowSize from "../../hooks/useWindowResize";

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

const timeFormat="hh:mm A"

export const MultisigCreateSafeModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  isBusy: boolean;
  nativeBalance: number;
  transactionFees: MultisigTransactionFees;
  multisigAccounts: MultisigInfo[];
}) => {
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const { width } = useWindowSize();
  const {
    transactionStatus,
    coolOffPeriodFrequency,
    setCoolOffPeriodFrequency,
    setTransactionStatus,
  } = useContext(AppStateContext);

  const date = addDays(new Date(), 1).toLocaleDateString("en-US");
  const time = moment().format(timeFormat);

  const { handleClose, handleOk, isVisible, isBusy, nativeBalance, transactionFees, multisigAccounts } = props;

  const [currentStep, setCurrentStep] = useState(0);
  const [safeName, setSafeName] = useState('');
  const [multisigThreshold, setMultisigThreshold] = useState(0);
  const [multisigOwners, setMultisigOwners] = useState<MultisigParticipant[]>([]);
  const [multisigAddresses, setMultisigAddresses] = useState<string[]>([]);
  const [isAllowToRejectProposal, setAllowToRejectProposal] = useState<boolean>(true);
  const [feeAmount] = useState<number>(transactionFees.multisigFee + transactionFees.rentExempt);
  const [coolOffDate, setCoolOffDate] = useState<string | undefined>(date);
  const [coolOffTime, setCoolOffTime] = useState<string | undefined>(time);
  const [isXsDevice, setIsXsDevice] = useState<boolean>(isMobile);
  const [isCoolOffPeriodEnable, setIsCoolOffPeriodEnable] = useState<boolean>(true);
  const [createdByName, setCreatedByName] = useState<string>("");
  const [coolOfPeriodAmount, setCoolOfPeriodAmount] = useState<string>("");

  // Detect XS screen
  useEffect(() => {
    if (width < 576) {
      setIsXsDevice(true);
    } else {
      setIsXsDevice(false);
    }
  }, [width]);

  const onStepperChange = (value: number) => {
    setCurrentStep(value);
  }

  const onContinueStepOneButtonClick = () => {
    setCurrentStep(1);  // Go to step 2
  }

  const onContinueStepTwoButtonClick = () => {
    setCurrentStep(2);  // Go to step 3
  }

  const getStepTwoContinueButtonLabel = (): string => {
    return !publicKey
      ? t('transactions.validation.not-connected')
      : t('Continue')
  };

  const getStepThreeContinueButtonLabel = (): string => {
    return !publicKey
      ? t('transactions.validation.not-connected')
      : t('Create')
  };

  const onSafeNameInputValueChange = (e: any) => {
    setSafeName(e.target.value);
  }

  const onTimePickerChange = (time: moment.Moment | null, timeString: string) => {
    if (time) {
      const shortTime = time.format(timeFormat);
      setCoolOffTime(shortTime);
    }
  };

  const handleDateChange = (date: string) => {
    setCoolOffDate(date);
  }

  const todayAndPriorDatesDisabled = (current: any) => {
    // Can not select neither today nor days before today
    return current && current < moment().add(1, 'day').startOf('day');
  }

  const onResetDate = () => {
    setCoolOffDate(date);
  }

  const renderDatePickerExtraPanel = () => {
    return (
      <span className="flat-button tiny stroked primary" onClick={onResetDate}>
        <span className="mx-1">Reset</span>
      </span>
    );
  }

  const onAcceptModal = () => {
    const options: CreateNewSafeParams = {
      label: safeName,
      threshold: multisigThreshold,
      owners: multisigOwners,
      isAllowToRejectProposal: isAllowToRejectProposal,
      isCoolOffPeriodEnable: isCoolOffPeriodEnable,
      coolOffDate: coolOffDate,
      coolOffTime: coolOffTime
    }
    handleOk(options);
  }

  const onCloseModal = () => {
    handleClose();
  }

  const onAfterClose = () => {
    setTimeout(() => {
      setSafeName('');
      setMultisigThreshold(0);
      setMultisigOwners([]);
    }, 50);

    setTransactionStatus({
        lastOperation: TransactionStatus.Iddle,
        currentOperation: TransactionStatus.Iddle
    });
  }

  const noDuplicateExists = (arr: MultisigParticipant[]): boolean => {
    const items = arr.map(i => i.address);
    return new Set(items).size === items.length ? true : false;
  }

  const isOwnersListValid = () => {
    return multisigOwners.every(o => o.address.length > 0 && isValidAddress(o.address));
  }

  const isFormValid = () => {
    return  multisigThreshold &&
            multisigThreshold >= 1 &&
            multisigThreshold <= MAX_MULTISIG_PARTICIPANTS &&
            safeName &&
            multisigOwners.length >= multisigThreshold &&
            multisigOwners.length <= MAX_MULTISIG_PARTICIPANTS &&
            isOwnersListValid() &&
            noDuplicateExists(multisigOwners)
      ? true
      : false;
  }

  const onChangeRejectProposalRejectProposalSwitch = (value: boolean) => {
    setAllowToRejectProposal(value);
  };

  const onChangeCoolOffPeriodSwitch = (value: boolean) => {
    setIsCoolOffPeriodEnable(value);
  };

  const handleCoolOffPeriodAmountChange = (e: any) => {
    setCoolOfPeriodAmount(e.target.value);
  }

  const handleCoolOffPeriodOptionChange = (val: PaymentRateType) => {
    setCoolOffPeriodFrequency(val);
  }

  const getCoolOffPeriodOptionsFromEnum = (value: any): PaymentRateTypeOption[] => {
    let index = 0;
    const options: PaymentRateTypeOption[] = [];
    for (const enumMember in value) {
        const mappedValue = parseInt(enumMember, 10);
        if (!isNaN(mappedValue)) {
            const item = new PaymentRateTypeOption(
                index,
                mappedValue,
                getCoolOffPeriodOptionLabel(mappedValue, t)
            );
            options.push(item);
        }
        index++;
    }
    return options;
  }

  const coolOffPeriodOptionsMenu = (
    <Menu>
      {getCoolOffPeriodOptionsFromEnum(PaymentRateType).map((item) => {
        return (
          <Menu.Item
            key={item.key}
            onClick={() => handleCoolOffPeriodOptionChange(item.value)}>
            {item.text}
          </Menu.Item>
        );
      })}
    </Menu>
  );

  // When modal goes visible, add current wallet address as first participant
  useEffect(() => {
    if (publicKey && isVisible) {
      setMultisigThreshold(1);
      const items: MultisigParticipant[] = [];
      items.push({
        name: `Owner 1`,
        address: publicKey.toBase58()
      }, {
        name: `Owner 2`,
        address: '' 
      });
      setMultisigOwners(items);
      if (multisigAccounts && multisigAccounts.length > 0) {
        const msAddresses = multisigAccounts.map(ms => ms.id.toBase58());
        setMultisigAddresses(msAddresses);
      }
    }
  }, [
    publicKey,
    isVisible,
    multisigAccounts
  ]);

  useEffect(() => {
    const owner = multisigOwners.filter((owner) => owner.address === publicKey?.toBase58());
    const ownerName = Object.assign({}, ...owner);

    setCreatedByName(ownerName.name);
  }, [multisigOwners, publicKey]);

  return (
    <Modal
      className="mean-modal simple-modal multisig-create-safe-modal"
      title={<div className="modal-title">{currentStep === 0 ? "Create multisig safe" : "Add safe"}</div>}
      maskClosable={false}
      footer={null}
      visible={isVisible}
      onCancel={onCloseModal}
      afterClose={onAfterClose}
      width={isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}>

      <div className={!isBusy ? "panel1 show" : "panel1 hide"}>
        {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
          <>
            <div className="scrollable-content">
              <StepSelector step={currentStep} steps={2} onValueSelected={onStepperChange} />

              {/* <div className={currentStep === 0 ? "contract-wrapper panel1 show" : "contract-wrapper panel1 hide"}>
                <>
                  <h3 className="left-title">Getting started</h3>
                  <Divider plain />

                  <div className="two-column-form-layout">
                    <div className="left">
                      <h3>Create safe</h3>
                      <div>You can create your own multisig safe with multiple owners</div>
                    </div>
                    <div className="right">
                      <Button
                        block
                        type="primary"
                        shape="round"
                        size="middle"
                        className="thin-stroke"
                        onClick={onContinueStepOneButtonClick}>
                          Create safe
                      </Button>
                    </div>
                  </div> */}

                  {/* <Divider plain />

                  <div className="two-column-form-layout">
                    <div className="left">
                      <h3>Import safe</h3>
                      <div>You can import your own multisig safe with multiple owners.</div>
                    </div>
                    <div className="right">
                      <Button
                        block
                        type="primary"
                        shape="round"
                        size="middle"
                        className="thin-stroke"
                        onClick={onContinueStepOneButtonClick}>
                          Import safe
                      </Button>
                    </div>
                  </div> */}
                {/* </>
              </div> */}

              {/* <div className={currentStep === 1 ? "contract-wrapper panel2 show" : "contract-wrapper panel2 hide"}> */}
              <div className={currentStep === 0 ? "contract-wrapper panel1 show" : "contract-wrapper panel1 hide"}>
                <>
                  <h3 className="left-title">Safe details</h3>
                  <Divider plain />

                  {/* Safe name */}
                  <div className="mb-3 mt-2">
                    <div className="form-label">{t('multisig.create-multisig.multisig-label-input-label')}</div>
                    <div className={`well ${isBusy ? 'disabled' : ''}`}>
                      <div className="flex-fixed-right">
                        <div className="left">
                          <input
                            id="multisig-name-input"
                            className="w-100 general-text-input"
                            autoComplete="off"
                            autoCorrect="off"
                            type="text"
                            maxLength={32}
                            onChange={onSafeNameInputValueChange}
                            placeholder={t('multisig.create-multisig.multisig-label-placeholder')}
                            value={safeName}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Owners's name and address */}
                  <MultisigSafeOwners
                    participants={multisigOwners}
                    label={"Valid owners"}
                    multisigAddresses={multisigAddresses}
                    onParticipantsChanged={(e: MultisigParticipant[]) => setMultisigOwners(e)}
                    isOwnersListValid={isOwnersListValid()}
                  />

                  {/* Minimum required signatures for proposal approval */}
                  {/* <div className="form-label">Minimum required signatures for proposal approval</div> */}
                  <div className="form-label icon-label">
                    Minimum required signatures for proposal approval
                    <Tooltip placement="bottom" title="">
                      <span className="icon-info-circle simplelink">
                        <IconInfoCircle className="mean-svg-icons" />
                      </span>
                    </Tooltip>
                  </div>

                  <div className="required-signatures-box">
                    <div className="info-label">A proposal will pass with:</div>
                    <div className="required-signatures-icons">
                      {multisigOwners.map((icon, index) => {
                        const onSelectIcon = () => {
                          setMultisigThreshold(index + 1);
                        }

                        return (
                          <div className={`icon-container simplelink ${(multisigThreshold >= (index + 1)) ? "bg-green" : "bg-gray-light"}`} key={index} onClick={onSelectIcon}>
                            {(multisigThreshold >= (index + 1)) ? (
                              <IconKey className="mean-svg-icons key-icon"/>
                            ) : (
                              <IconLock className="mean-svg-icons lock-icon"/>
                            )}
                            <span className="signatures-number">{index + 1}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Allow owners to Reject a Proposal */}
                  {/* {/* <div className="d-flex align-items-center mt-3">
                    <div className="form-label icon-label">
                      Allow owners to Reject a Proposal
                      <Tooltip placement="bottom" title="Owners can reject a proposal before it has enough signatures and move to Passed status or failed. Otherwise only the proposal originator is able to Reject it.">
                        <span className="icon-info-circle simplelink">
                          <IconInfoCircle className="mean-svg-icons" />
                        </span>
                      </Tooltip>
                    </div>
                    <Switch 
                      size="small"
                      defaultChecked
                      onChange={onChangeRejectProposalSwitch} />
                  </div> */}

                  {/* Enable cool-off period */}
                  <div className="d-flex align-items-center mt-3">
                    <div className="form-label icon-label">
                      Enable cool-off period
                      <Tooltip placement="bottom" title="Cool-off period is a time where no actions take place on a proposal that is passed already, and before it gets executed.">
                        <span className="icon-info-circle simplelink">
                          <IconInfoCircle className="mean-svg-icons" />
                        </span>
                      </Tooltip>
                    </div>
                    <Switch 
                      size="small"
                      defaultChecked
                      onChange={onChangeCoolOffPeriodSwitch} />
                  </div>

                  {isCoolOffPeriodEnable && (
                    <>
                      <div className="mb-0 mt-1">
                        <div className="form-label">Cool-off period</div>
                      </div>
                      <div className="two-column-layout">
                        <div className="left">
                          <div className="well">
                            <div className="flex-fixed-left">
                              <div className="left">
                                <input
                                  className="general-text-input"
                                  inputMode="decimal"
                                  autoComplete="off"
                                  autoCorrect="off"
                                  type="number"
                                  onChange={handleCoolOffPeriodAmountChange}
                                  pattern="^[0-9]*[.,]?[0-9]*$"
                                  placeholder={`Number of ${getCoolOffPeriodOptionLabel(coolOffPeriodFrequency, t)}`}
                                  minLength={1}
                                  maxLength={79}
                                  spellCheck="false"
                                  value={coolOfPeriodAmount}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="right">
                          <div className="well mb-0">
                            <div className="flex-fixed-left">
                              <div className="left">
                                <Dropdown
                                  overlay={coolOffPeriodOptionsMenu}
                                  trigger={["click"]}>
                                  <span className="dropdown-trigger no-decoration flex-fixed-right large-dropdown-area ">
                                    <div className="left">
                                      <span className="capitalize-first-letter">{getCoolOffPeriodOptionLabel(coolOffPeriodFrequency, t)}{" "}</span>
                                    </div>
                                    <div className="right">
                                      <IconCaretDown className="mean-svg-icons" />
                                    </div>
                                  </span>
                                </Dropdown>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      {/* {!isXsDevice ? (
                        <div className="two-column-form-layout mb-0 mt-1">
                          <div className="form-label">Date</div>
                          <div className="form-label ml-3">Time</div>
                        </div>
                      ) : (
                        <div className="mb-0 mt-1">
                          <div className="form-label">Date and time</div>
                        </div>
                      )}
                      <div className="two-column-layout">
                        <div className="left">
                          <div className="well">
                            <div className="flex-fixed-right">
                              <div className="left static-data-field">{coolOffDate}</div>
                              <div className="right">
                                <div className="add-on simplelink">
                                  <>
                                    {
                                      <DatePicker
                                        size="middle"
                                        bordered={false}
                                        className="addon-date-picker"
                                        aria-required={true}
                                        allowClear={false}
                                        disabledDate={todayAndPriorDatesDisabled}
                                        placeholder="Pick a date"
                                        onChange={(value: any, date: string) => handleDateChange(date)}
                                        value={moment(
                                          coolOffDate,
                                          DATEPICKER_FORMAT
                                        ) as any}
                                        format={DATEPICKER_FORMAT}
                                        showNow={false}
                                        showToday={false}
                                        renderExtraFooter={renderDatePickerExtraPanel}
                                      />
                                    }
                                  </>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="right">
                          <div className="well time-picker">
                            <TimePicker
                              defaultValue={moment()}
                              bordered={false}
                              allowClear={false}
                              size="middle"
                              use12Hours
                              format={timeFormat}
                              onChange={onTimePickerChange} 
                            />
                          </div>
                        </div>
                      </div> */}
                    </>
                  )}
                </>
              </div>

              {/* <div className={currentStep === 2 ? "contract-wrapper panel3 show" : "contract-wrapper panel3 hide"}> */}
              <div className={currentStep === 1 ? "contract-wrapper panel2 show" : "contract-wrapper panel2 hide"}> 
                <>
                  <h3 className="left-title">Summary</h3>
                  <Divider plain />

                  <div className="mt-2 mb-1">
                    {/* Safe name */}
                    <Row className="mb-1">
                      {safeName && (
                        <>
                          <Col span={8} className="text-right pr-1">
                            <span className="info-label">Safe name:</span>
                          </Col>
                          <Col span={16} className="text-left pl-1">
                            <span>{safeName}</span>
                          </Col>
                        </>
                      )}
                    </Row>

                    {/* Created by */}
                    <Row className="mb-1">
                      {publicKey && (
                        <>
                          <Col span={8} className="text-right pr-1">
                            <span className="info-label">Created by:</span>
                          </Col>
                          <Col span={16} className="text-left pl-1">
                            {createdByName ? (
                              <span>{`${createdByName} (${shortenAddress(publicKey.toBase58(), 4)})`}</span>
                            ) : (
                              <span>{shortenAddress(publicKey.toBase58(), 4)}</span>
                            )}
                          </Col>
                        </>
                      )}
                    </Row>

                    {/* Signatures */}
                    <Row className="mb-1">
                      {(multisigThreshold && multisigOwners) && (
                        <>
                          <Col span={8} className="text-right pr-1">
                            <span className="info-label">Signatures:</span>
                          </Col>
                          <Col span={16} className="text-left pl-1">
                            <span>{`${multisigThreshold}/${multisigOwners.length} ${multisigThreshold > 1 ? "signatures" : "signature"} to pass a proposal`}</span>
                          </Col>
                        </>
                      )}
                    </Row>

                    {/* Cool-off period */}
                    <Row className="mb-1">
                      <>
                        <Col span={8} className="text-right pr-1">
                          <span className="info-label">Cool-off period:</span>
                        </Col>
                        <Col span={16} className="text-left pl-1">
                        {(isCoolOffPeriodEnable && coolOfPeriodAmount && coolOffPeriodFrequency) ? (
                          <span>{`${coolOfPeriodAmount} ${getCoolOffPeriodOptionLabel(coolOffPeriodFrequency, t)}`}</span>
                        ) : (
                          <span>disabled</span>
                        )}
                        </Col>
                      </>
                    </Row>

                    <Divider plain />

                    <div className="well mt-2 mb-1 proposal-summary-container vertical-scroll">
                      <div className="mb-1">
                        {multisigOwners.map((owner, index) => (
                          owner.name && owner.address && (
                            <div key={index}>
                              <span className="info-label">{owner.name}:</span><br />
                              <span className="info-data simplelink underline-on-hover" onClick={() => <CopyExtLinkGroup content={owner.address} externalLink={false} />}>{owner.address}</span>
                            </div>
                          )
                        ))}
                      </div>
                      <div>
                        {`The creation will cost approximately ${feeAmount} SOL. The exact amount will be determined by your wallet.`}
                      </div>
                    </div>
                  </div>
                </>
              </div>
            </div>

            <Divider plain />

            {/* <div className={currentStep === 1 ? "contract-wrapper panel2 show" : "contract-wrapper panel2 hide"}> */}
            <div className={currentStep === 0 ? "contract-wrapper panel1 show" : "contract-wrapper panel1 hide"}>
              <Row>
                {/* <Col span={12} className="d-flex justify-content-center">
                  <Button
                    block
                    shape="round"
                    type="ghost"
                    size="middle"
                    className="thin-stroke"
                    onClick={() => onStepperChange(0)}
                    disabled={
                      !publicKey
                    }
                  >
                    Back
                  </Button>
                </Col> */}
                <Col span={24} className="d-flex justify-content-center">
                  <Button
                    block
                    type="primary"
                    shape="round"
                    size="middle"
                    className="thin-stroke col-6"
                    // onClick={onContinueStepTwoButtonClick}
                    onClick={onContinueStepOneButtonClick}
                    disabled={!publicKey || !isFormValid()}
                  >
                    {getStepTwoContinueButtonLabel()}
                  </Button>
                </Col>
              </Row>
            </div>

            {/* <div className={currentStep === 2 ? "contract-wrapper panel3 show" : "contract-wrapper panel3 hide"}> */}
            <div className={currentStep === 1 ? "contract-wrapper panel2 show" : "contract-wrapper panel2 hide"}>
              <Row>
                <Col span={12} className="d-flex justify-content-center">
                  <Button
                    block
                    type="ghost"
                    shape="round"
                    size="middle"
                    className="thin-stroke mr-1"
                    // onClick={() => onStepperChange(1)}
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
                    block
                    type="primary"
                    shape="round"
                    size="middle"
                    className="thin-stroke ml-1"
                    onClick={() => onAcceptModal()}
                    disabled={
                      !publicKey ||
                      !safeName ||
                      multisigOwners.length === 0 ||
                      multisigThreshold === 0
                    }
                  >
                    {getStepThreeContinueButtonLabel()}
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
                    className={isBusy ? 'inactive' : ''}
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
              <InfoCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
              {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                <h4 className="mb-4">
                  {t('transactions.status.tx-start-failure', {
                    accountBalance: getTokenAmountAndSymbolByTokenAddress(
                      nativeBalance,
                      NATIVE_SOL_MINT.toBase58()
                    ),
                    feeAmount: getTokenAmountAndSymbolByTokenAddress(
                      transactionFees.networkFee + transactionFees.multisigFee + transactionFees.rentExempt,
                      NATIVE_SOL_MINT.toBase58()
                    )})
                  }
                </h4>
              ) : (
                <h4 className="font-bold mb-3">
                  {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
                </h4>
              )}
              {!(isBusy && transactionStatus !== TransactionStatus.Iddle) && (
                <div className="row two-col-ctas mt-3 transaction-progress p-2">
                  <div className="col-12">
                    <Button
                      block
                      type="text"
                      shape="round"
                      size="middle"
                      className={isBusy ? 'inactive' : ''}
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

      <div className={
          isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle 
            ? "panel2 show" 
            : "panel2 hide"
          }>
        {isBusy && transactionStatus !== TransactionStatus.Iddle && (
          <div className="transaction-progress">
            <Spin indicator={bigLoadingIcon} className="icon m-2" />
            <h4 className="font-bold mb-1">
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