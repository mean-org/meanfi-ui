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
import { Modal, Button, Spin, Divider, Checkbox, DatePicker, Row, Col, TimePicker, Switch, Dropdown, Menu } from 'antd';
import { StepSelector } from "../StepSelector";
import moment from 'moment';
import { IconCaretDown, IconEdit, IconHelpCircle } from "../../Icons";
import { InfoIcon } from "../InfoIcon";
import { DATEPICKER_FORMAT } from "../../constants";
import { MultisigVault } from '../../models/multisig';
import { StepOne } from './components/StepOne';
import { StepTwo } from './components/StepTwo';
import { StepThree } from './components/StepThree';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

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
  const [proposalDescriptionValue, setProposalDescriptionValue] = useState('');

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
      setProposalTitleValue("");
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

  // const onProposalDescriptionValueChange = (e: any) => {
  //   setProposalDescriptionValue(e.target.value);
  //   setCountWords(e.target.value.length);
  // }

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
                <StepOne />
              </div>

              <div className={currentStep === 1 ? "contract-wrapper panel12 show" : "contract-wrapper panel2 hide"}>
                <StepTwo
                  isBusy={props.isBusy}
                  onProposalTitleValueChange={onProposalTitleValueChange}
                  proposalTitleValue={proposalTitleValue}
                />
              </div>

              <div className={currentStep === 2 ? "contract-wrapper panel3 show" : "contract-wrapper panel3 hide"}>
                <StepThree />
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
                      !publicKey
                    }
                  >
                    {getStepOneContinueButtonLabel()}
                  </Button>
                </Col>
              </Row>
            </div>

            <div className={currentStep === 1 ? "contract-wrapper panel1 show" : "contract-wrapper panel1 hide"}>
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
                      !publicKey
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
                      !publicKey
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