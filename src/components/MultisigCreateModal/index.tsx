import React, { useContext, useEffect } from 'react';
import { useState } from 'react';
import { Modal, Button, Spin, Tooltip, Row, Col } from 'antd';
import { useTranslation } from 'react-i18next';
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { AppStateContext } from '../../contexts/appstate';
import { TransactionStatus } from '../../models/enums';
import { getTransactionOperationDescription, isValidAddress } from '../../utils/ui';
import { isError } from '../../utils/transactions';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { TransactionFees } from '@mean-dao/money-streaming';
import { formatThousands, getTokenAmountAndSymbolByTokenAddress, isValidNumber } from '../../utils/utils';
import { MultisigParticipants } from '../MultisigParticipants';
import { MultisigParticipant, MultisigV2 } from '../../models/multisig';
import { useWallet } from '../../contexts/wallet';
import { MAX_MULTISIG_PARTICIPANTS } from '../../constants';
import { IconHelpCircle, IconWarning } from '../../Icons';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const MultisigCreateModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  isBusy: boolean;
  nativeBalance: number;
  transactionFees: TransactionFees;
  multisigAccounts: MultisigV2[];
}) => {
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const {
    transactionStatus,
    setTransactionStatus,
  } = useContext(AppStateContext);

  const [multisigLabel, setMultisigLabel] = useState('');
  const [multisigThreshold, setMultisigThreshold] = useState(0);
  const [multisigOwners, setMultisigOwners] = useState<MultisigParticipant[]>([]);
  const [multisigAddresses, setMultisigAddresses] = useState<string[]>([]);

  // When modal goes visible, add current wallet address as first participant
  useEffect(() => {
    if (publicKey && props.isVisible) {
      setMultisigThreshold(2);
      const items: MultisigParticipant[] = [];
      items.push({
          name: `Owner 1`,
          address: publicKey.toBase58()
      });
      setMultisigOwners(items);
      if (props.multisigAccounts && props.multisigAccounts.length > 0) {
        const msAddresses = props.multisigAccounts.map(ms => ms.id.toBase58());
        setMultisigAddresses(msAddresses);
      }
    }
  }, [
    publicKey,
    props.isVisible,
    props.multisigAccounts
  ]);

  const onAcceptModal = () => {
    props.handleOk({
      label: multisigLabel,
      threshold: multisigThreshold,
      owners: multisigOwners
    });
  }

  const onCloseModal = () => {
    props.handleClose();
  }

  const onAfterClose = () => {

    setTimeout(() => {
      setMultisigLabel('');
      setMultisigThreshold(0);
      setMultisigOwners([]);

    }, 50);

    setTransactionStatus({
        lastOperation: TransactionStatus.Iddle,
        currentOperation: TransactionStatus.Iddle
    });
  }

  const refreshPage = () => {
    props.handleClose();
    window.location.reload();
  }

  const onLabelInputValueChange = (e: any) => {
    setMultisigLabel(e.target.value);
  }

  const noDuplicateExists = (arr: MultisigParticipant[]): boolean => {
    const items = arr.map(i => i.address);
    return new Set(items).size === items.length ? true : false;
  }

  const isFormValid = () => {
    return  multisigThreshold &&
            multisigThreshold >= 2 &&
            multisigThreshold <= MAX_MULTISIG_PARTICIPANTS &&
            multisigLabel &&
            multisigOwners.length >= multisigThreshold &&
            multisigOwners.length <= MAX_MULTISIG_PARTICIPANTS &&
            isOwnersListValid() &&
            noDuplicateExists(multisigOwners)
      ? true
      : false;
  }

  const isOwnersListValid = () => {
    return multisigOwners.every(o => o.address.length > 0 && isValidAddress(o.address));
  }

  const onThresholdInputValueChange = (e: any) => {
    let newValue = e.target.value;
    const splitted = newValue.toString().split('.');
    const left = splitted[0];
    if (left.length > 1) {
      const number = splitted[0] - 0;
      splitted[0] = `${number}`;
      newValue = splitted.join('.');
    }
    if (newValue === null || newValue === undefined || newValue === "") {
      setMultisigThreshold(0);
    } else if (isValidNumber(newValue)) {
      setMultisigThreshold(+newValue);
    }
  }  

  const infoRow = (caption: string, value: string) => {
    return (
      <Row>
        <Col span={14} className="text-right pr-1">{caption}</Col>
        <Col span={10} className="text-left pl-1 fg-secondary-70">{value}</Col>
      </Row>
    );
  }

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{t('multisig.create-multisig.modal-title')}</div>}
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptModal}
      onCancel={onCloseModal}
      afterClose={onAfterClose}
      width={props.isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}>

      <div className={!props.isBusy ? "panel1 show" : "panel1 hide"}>

        {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
          <>
            {/* Multisig label */}
            <div className="mb-3">
              <div className="form-label">{t('multisig.create-multisig.multisig-label-input-label')}</div>
              <div className={`well ${props.isBusy ? 'disabled' : ''}`}>
                <div className="flex-fixed-right">
                  <div className="left">
                    <input
                      id="multisig-label-field"
                      className="w-100 general-text-input"
                      autoComplete="off"
                      autoCorrect="off"
                      type="text"
                      maxLength={32}
                      onChange={onLabelInputValueChange}
                      placeholder={t('multisig.create-multisig.multisig-label-placeholder')}
                      value={multisigLabel}
                    />
                  </div>
                </div>
                <div className="form-field-hint">I.e. "My company payroll", "Seed round vesting", etc.</div>
              </div>
            </div>

            {/* Multisig threshold */}
            <div className="mb-3">
              <div className="form-label icon-label">
                {t('multisig.create-multisig.multisig-threshold-input-label')}
                <Tooltip placement="top" title={t("multisig.create-multisig.multisig-threshold-question-mark-tooltip")}>
                  <span>
                    <IconHelpCircle className="mean-svg-icons" />
                  </span>
                </Tooltip>
              </div>
              <div className={`well ${props.isBusy ? 'disabled' : ''}`}>
                <div className="flex-fixed-right">
                  <div className="left">
                    <input
                      id="multisig-threshold-field"
                      className="w-100 general-text-input"
                      autoComplete="off"
                      autoCorrect="off"
                      type="text"
                      pattern="^[0-9]*$"
                      onChange={onThresholdInputValueChange}
                      placeholder={t('multisig.create-multisig.multisig-threshold-placeholder')}
                      value={multisigThreshold}
                    />
                  </div>
                </div>
                {!multisigThreshold || +multisigThreshold < 2 ? (
                  <span className="form-field-error">
                    {t('multisig.create-multisig.multisig-threshold-input-empty')}
                  </span>
                ) : multisigThreshold > MAX_MULTISIG_PARTICIPANTS ? (
                  <span className="form-field-error">
                    {t('multisig.create-multisig.multisig-threshold-input-max')}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Multisig Owners selector */}
            <MultisigParticipants
              participants={multisigOwners}
              label={
                t('multisig.create-multisig.multisig-participants', {
                  numParticipants: multisigOwners.length,
                  maxParticipants: MAX_MULTISIG_PARTICIPANTS
                })
              }
              multisigAddresses={multisigAddresses}
              onParticipantsChanged={(e: MultisigParticipant[]) => setMultisigOwners(e)}
            />
            {(multisigOwners.length >= 2 && multisigOwners.length === +multisigThreshold && multisigOwners[+multisigThreshold - 1].address !== '') && (
              <span className="warning-message icon-label">
                <IconWarning className="mean-svg-icons" />
                {t('multisig.create-multisig.multisig-participants-warning-message')}
              </span>
            )}
            {/* Fee info */}
            {props.transactionFees && props.transactionFees.mspFlatFee && (
              <div className="p-2 mt-2">
                {infoRow(
                  t('multisig.create-multisig.fee-info-label') + ':',
                  `${formatThousands(props.transactionFees.mspFlatFee, 9)} SOL`
                )}
              </div>
            )}
          </>
        ) : transactionStatus.currentOperation === TransactionStatus.TransactionFinished ? (
          <>
            <div className="transaction-progress">
              <CheckOutlined style={{ fontSize: 48 }} className="icon mt-0" />
              <h4 className="font-bold">{t('multisig.create-multisig.success-message')}</h4>
            </div>
          </>
        ) : (
          <>
            <div className="transaction-progress">
              <InfoCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
              {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                <h4 className="mb-4">
                  {t('transactions.status.tx-start-failure', {
                    accountBalance: getTokenAmountAndSymbolByTokenAddress(
                      props.nativeBalance,
                      NATIVE_SOL_MINT.toBase58()
                    ),
                    feeAmount: getTokenAmountAndSymbolByTokenAddress(
                      props.transactionFees.blockchainFee + props.transactionFees.mspFlatFee,
                      NATIVE_SOL_MINT.toBase58()
                    )})
                  }
                </h4>
              ) : (
                <h4 className="font-bold mb-3">
                  {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
                </h4>
              )}
            </div>
          </>
        )}

      </div>

      <div className={
          props.isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle 
            ? "panel2 show" 
            : "panel2 hide"
          }>          
        {props.isBusy && transactionStatus !== TransactionStatus.Iddle && (
          <div className="transaction-progress">
            <Spin indicator={bigLoadingIcon} className="icon mt-0" />
            <h4 className="font-bold mb-1">
              {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
            </h4>
            {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
              <div className="indication">{t('transactions.status.instructions')}</div>
            )}
          </div>
        )}
      </div>

      <div className="row two-col-ctas mt-3 transaction-progress p-0">
        <div className="col-6">
          <Button
            block
            type="text"
            shape="round"
            size="middle"
            className={props.isBusy ? 'inactive' : ''}
            onClick={() => isError(transactionStatus.currentOperation)
              ? onAcceptModal()
              : onCloseModal()}>
            {isError(transactionStatus.currentOperation)
              ? t('general.retry')
              : t('general.cta-close')
            }
          </Button>
        </div>
        <div className="col-6">
          <Button
            className={props.isBusy ? 'inactive' : ''}
            block
            type="primary"
            shape="round"
            size="middle"
            disabled={!isFormValid()}
            onClick={() => {
              if (transactionStatus.currentOperation === TransactionStatus.Iddle) {
                onAcceptModal();
              } else if (transactionStatus.currentOperation === TransactionStatus.TransactionFinished) {
                onCloseModal();
              } else {
                refreshPage();
              }
            }}>
            {props.isBusy
              ? t('multisig.create-multisig.main-cta-busy')
              : transactionStatus.currentOperation === TransactionStatus.Iddle
                ? t('multisig.create-multisig.main-cta')
                : transactionStatus.currentOperation === TransactionStatus.TransactionFinished
                  ? t('general.cta-finish')
                  : t('general.refresh')
            }
          </Button>
        </div>
      </div>

    </Modal>
  );
};
