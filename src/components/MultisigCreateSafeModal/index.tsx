import { Button, Col, Divider, Modal, Row, Spin } from "antd";
import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppStateContext } from "../../contexts/appstate";
import { useWallet } from "../../contexts/wallet";
import { TransactionStatus } from "../../models/enums";
import { StepSelector } from "../StepSelector";
import "./style.scss";
import { IconKey, IconLock } from "../../Icons";
import { MultisigInfo, MultisigParticipant, MultisigTransactionFees } from "@mean-dao/mean-multisig-sdk";
import { MAX_MULTISIG_PARTICIPANTS } from "../../constants";
import { MultisigSafeOwners } from "../MultisigSafeOwners";
import { CopyExtLinkGroup } from "../CopyExtLinkGroup";
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from "@ant-design/icons";
import { getTokenAmountAndSymbolByTokenAddress } from "../../utils/utils";
import { NATIVE_SOL_MINT } from "../../utils/ids";
import { getTransactionOperationDescription, isValidAddress } from "../../utils/ui";
import { isError } from "../../utils/transactions";

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

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
  const {
    transactionStatus,
    setTransactionStatus,
  } = useContext(AppStateContext);

  const { handleClose, handleOk, isVisible, isBusy, nativeBalance, transactionFees, multisigAccounts } = props;

  const [currentStep, setCurrentStep] = useState(0);
  const [safeName, setSafeName] = useState('');
  const [multisigThreshold, setMultisigThreshold] = useState(0);
  const [multisigOwners, setMultisigOwners] = useState<MultisigParticipant[]>([]);
  const [multisigAddresses, setMultisigAddresses] = useState<string[]>([]);

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

  const onSafeNameInputValueChange = (e: any) => {
    setSafeName(e.target.value);
  }

  const onAcceptModal = () => {
    handleOk({
      label: safeName,
      threshold: currentPosition,
      owners: multisigOwners
    });
  }

  const onCloseModal = () => {
    handleClose();
  }

  const onAfterClose = () => {

    setTimeout(() => {
      setSafeName('');
      setCurrentPosition(0);
      setMultisigOwners([]);

    }, 50);

    setTransactionStatus({
        lastOperation: TransactionStatus.Iddle,
        currentOperation: TransactionStatus.Iddle
    });
  }

  const refreshPage = () => {
    handleClose();
    window.location.reload();
  }

  const noDuplicateExists = (arr: MultisigParticipant[]): boolean => {
    const items = arr.map(i => i.address);
    return new Set(items).size === items.length ? true : false;
  }

  const isOwnersListValid = () => {
    return multisigOwners.every(o => o.address.length > 0 && isValidAddress(o.address));
  }

  const isFormValid = () => {
    return  currentPosition &&
            currentPosition >= 1 &&
            currentPosition <= MAX_MULTISIG_PARTICIPANTS &&
            safeName &&
            multisigOwners.length >= currentPosition &&
            multisigOwners.length <= MAX_MULTISIG_PARTICIPANTS &&
            isOwnersListValid() &&
            noDuplicateExists(multisigOwners)
      ? true
      : false;
  }

  // When modal goes visible, add current wallet address as first participant
  useEffect(() => {
    if (publicKey && isVisible) {
      setMultisigThreshold(1);
      const items: MultisigParticipant[] = [];
      items.push({
          name: `Owner 1`,
          address: publicKey.toBase58()
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

  const [currentPosition, setCurrentPosition] = useState(0);

  return (
    <Modal
      className="mean-modal simple-modal multisig-create-safe-modal"
      title={<div className="modal-title">{currentStep === 1 ? "Create multisig safe" : "Add safe"}</div>}
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
              <StepSelector step={currentStep} steps={3} onValueSelected={onStepperChange} />

              <div className={currentStep === 0 ? "contract-wrapper panel1 show" : "contract-wrapper panel1 hide"}>
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
                  </div>

                  <Divider plain />

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
                  </div>
                </>
              </div>

              <div className={currentStep === 1 ? "contract-wrapper panel2 show" : "contract-wrapper panel2 hide"}>
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
                  />

                  {/* Minimum required signatures for proposal approval */}
                  <div className="form-label">Minimum required signatures for proposal approval</div>
                  <div className="required-signatures-icons">
                    {multisigOwners.map((icon, index) => {
                      const onSelectIcon = () => {
                        setCurrentPosition(index + 1);
                      }

                      return (
                        <div className="icon-container simplelink" key={index} onClick={onSelectIcon}>
                          {(currentPosition >= (index + 1)) ? (
                            <IconKey className="mean-svg-icons key-icon"/>
                          ) : (
                            <IconLock className="mean-svg-icons lock-icon"/>
                          )}
                          <span className="signatures-number">{index + 1}</span>
                        </div>
                      )
                    })}
                  </div>
                </>
              </div>

              <div className={currentStep === 2 ? "contract-wrapper panel3 show" : "contract-wrapper panel3 hide"}>
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
                      {safeName && (
                        <>
                          <Col span={8} className="text-right pr-1">
                            <span className="info-label">Created by:</span>
                          </Col>
                          <Col span={16} className="text-left pl-1">
                            <span>{safeName}</span>
                          </Col>
                        </>
                      )}
                    </Row>

                    {/* Signatures */}
                    <Row className="mb-1">
                      {(currentPosition && multisigOwners) && (
                        <>
                          <Col span={8} className="text-right pr-1">
                            <span className="info-label">Signatures:</span>
                          </Col>
                          <Col span={16} className="text-left pl-1">
                            <span>{`${currentPosition}/${multisigOwners.length} ${currentPosition > 1 ? "signatures" : "signature"} to pass a proposal`}</span>
                          </Col>
                        </>
                      )}
                    </Row>

                    <Divider plain />

                    <div className="well mt-2 mb-1 proposal-summary-container vertical-scroll">
                      <div className="mb-1">
                        {multisigOwners.map((owner, index) => (
                          <div key={index}>
                            <span className="info-label">{owner.name}:</span><br />
                            <span className="info-data simplelink underline-on-hover" onClick={() => <CopyExtLinkGroup content={owner.address} externalLink={false} />}>{owner.address}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        The creation will cost approximately 0.02583248 SOL. The exact amount will be determined by your wallet.
                      </div>
                    </div>
                  </div>
                </>
              </div>
            </div>

            <Divider plain />

            <div className={currentStep === 1 ? "contract-wrapper panel2 show" : "contract-wrapper panel2 hide"}>
              <Row>
                <Col span={12} className="d-flex justify-content-center">
                  <Button
                    block
                    shape="round"
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
                    block
                    type="primary"
                    shape="round"
                    size="middle"
                    className="col-6"
                    onClick={onContinueStepTwoButtonClick}
                    // disabled={
                    //   !publicKey ||
                    //   !safeName ||
                    //   multisigOwners.length === 0 ||
                    //   currentPosition === 0
                    // }
                    disabled={!publicKey || !isFormValid()}
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
                    block
                    shape="round"
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
                    block
                    type="primary"
                    shape="round"
                    size="middle"
                    className="col-6"
                    onClick={() => onAcceptModal()}
                    disabled={
                      !publicKey ||
                      !safeName ||
                      multisigOwners.length === 0 ||
                      currentPosition === 0
                    }
                  >
                    {getStepTwoContinueButtonLabel()}
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