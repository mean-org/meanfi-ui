import { Button, Col, Divider, Modal, Row } from "antd";
import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppStateContext } from "../../contexts/appstate";
import { useWallet } from "../../contexts/wallet";
import { TransactionStatus } from "../../models/enums";
import { StepSelector } from "../StepSelector";
import "./style.scss";
import { IconKey, IconLock } from "../../Icons";
import { MultisigInfo, MultisigParticipant } from "@mean-dao/mean-multisig-sdk";
import { MAX_MULTISIG_PARTICIPANTS } from "../../constants";
import { MultisigSafeOwners } from "../MultisigSafeOwners";
import { CopyExtLinkGroup } from "../CopyExtLinkGroup";

export const MultisigCreateSafeModal = (props: {
  handleClose: any;
  // handleOk: any;
  isVisible: boolean;
  isBusy: boolean;
  nativeBalance: number;
  multisigAccounts: MultisigInfo[];
}) => {
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const {
    transactionStatus,
    setTransactionStatus,
  } = useContext(AppStateContext);

  const { handleClose, isVisible, isBusy, nativeBalance, multisigAccounts } = props;

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
      // onOk={onAcceptModal}
      onCancel={handleClose}
      // afterClose={onAfterClose}
      width={isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}>

      {/* <Divider plain /> */}

      <div className={!isBusy ? "panel1 show" : "panel1 hide"}>
        {transactionStatus.currentOperation === TransactionStatus.Iddle && (
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
                    <div className={`well ${props.isBusy ? 'disabled' : ''}`}>
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
                      {safeName && (
                        <>
                          <Col span={8} className="text-right pr-1">
                            <span className="info-label">Signatures:</span>
                          </Col>
                          <Col span={16} className="text-left pl-1">
                            <span>{safeName}</span>
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
                    disabled={
                      !publicKey ||
                      !safeName ||
                      multisigOwners.length === 0
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
                    onClick={() => {}}
                    disabled={
                      !publicKey ||
                      !safeName
                    }
                  >
                    {getStepTwoContinueButtonLabel()}
                  </Button>
                </Col>
              </Row>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};