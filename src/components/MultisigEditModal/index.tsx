import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import type { MultisigInfo, MultisigParticipant, MultisigTransactionFees } from '@mean-dao/mean-multisig-sdk';
import { Button, Modal, Spin } from 'antd';
import type { EditMultisigParams } from 'models/multisig';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_MULTISIG_PARTICIPANTS } from '../../constants';
import { AppStateContext } from '../../contexts/appstate';
import { SOL_MINT } from '../../middleware/ids';
import { isError } from '../../middleware/transactions';
import { getTransactionOperationDescription, isValidAddress } from '../../middleware/ui';
import { getAmountWithSymbol, isValidNumber } from '../../middleware/utils';
import { TransactionStatus } from '../../models/enums';
import { InputMean } from '../InputMean';
import { MultisigParticipants } from '../MultisigParticipants';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

interface Props {
  handleClose: () => void;
  handleOk: (options: EditMultisigParams) => void;
  isVisible: boolean;
  isBusy: boolean;
  nativeBalance: number;
  transactionFees: MultisigTransactionFees;
  multisigName?: string;
  multisigAccounts: MultisigInfo[];
  inputMultisigThreshold?: number;
  multisigParticipants?: MultisigParticipant[];
  multisigPendingTxsAmount: number;
}

export const MultisigEditModal = ({
  handleClose,
  handleOk,
  isVisible,
  isBusy,
  nativeBalance,
  transactionFees,
  multisigName,
  multisigAccounts,
  inputMultisigThreshold,
  multisigParticipants,
  multisigPendingTxsAmount,
}: Props) => {
  const { t } = useTranslation('common');
  const { selectedToken, transactionStatus, setTransactionStatus } = useContext(AppStateContext);

  const [multisigTitle, setMultisigTitle] = useState('');
  const [multisigLabel, setMultisigLabel] = useState('');
  const [localMultisigThreshold, setLocalMultisigThreshold] = useState(0);
  const [inputOwners, setInputOwners] = useState<MultisigParticipant[] | undefined>(undefined);
  const [multisigOwners, setMultisigOwners] = useState<MultisigParticipant[]>([]);
  const [multisigAddresses, setMultisigAddresses] = useState<string[]>([]);

  // When modal goes visible, get passed-in owners to populate participants component
  // Also get threshold and label (name)
  useEffect(() => {
    if (isVisible) {
      if (multisigName) {
        setMultisigLabel(multisigName);
      }
      if (inputMultisigThreshold) {
        setLocalMultisigThreshold(inputMultisigThreshold);
      }
      if (multisigParticipants && multisigParticipants.length > 0) {
        setMultisigOwners(multisigParticipants);
      }
      if (inputOwners === undefined) {
        setInputOwners(multisigParticipants);
      }
      if (multisigAccounts && multisigAccounts.length > 0) {
        const msAddresses = multisigAccounts.map(ms => ms.id.toBase58());
        setMultisigAddresses(msAddresses);
      }
    }
  }, [inputOwners, isVisible, multisigName, multisigAccounts, inputMultisigThreshold, multisigParticipants]);

  const hasOwnersChanges = useCallback(() => {
    if (inputOwners && multisigOwners) {
      if (JSON.stringify(inputOwners) !== JSON.stringify(multisigOwners)) {
        return true;
      }
    }

    return false;
  }, [inputOwners, multisigOwners]);

  const isFormDirty = useCallback(() => {
    return multisigLabel !== multisigName || localMultisigThreshold !== inputMultisigThreshold || hasOwnersChanges();
  }, [multisigLabel, localMultisigThreshold, multisigName, inputMultisigThreshold, hasOwnersChanges]);

  const onAcceptModal = () => {
    const options: EditMultisigParams = {
      title: multisigTitle,
      label: multisigLabel,
      threshold: localMultisigThreshold,
      owners: multisigOwners,
    };
    handleOk(options);
  };

  const onCloseModal = () => {
    handleClose();
  };

  const onAfterClose = () => {
    setTimeout(() => {
      setMultisigTitle('');
      setMultisigLabel('');
      setLocalMultisigThreshold(0);
      setMultisigOwners([]);
    }, 50);

    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle,
    });
  };

  const refreshPage = () => {
    handleClose();
    window.location.reload();
  };

  const onTitleInputValueChange = (value: string) => {
    setMultisigTitle(value);
  };

  const onLabelInputValueChange = (value: string) => {
    setMultisigLabel(value);
  };

  const noDuplicateExists = (arr: MultisigParticipant[]): boolean => {
    const items = arr.map(i => i.address);
    return new Set(items).size === items.length ? true : false;
  };

  const isFormValid = () => {
    return multisigTitle &&
      localMultisigThreshold <= MAX_MULTISIG_PARTICIPANTS &&
      multisigLabel &&
      multisigOwners.length >= localMultisigThreshold &&
      multisigOwners.length <= MAX_MULTISIG_PARTICIPANTS &&
      isOwnersListValid() &&
      isFormDirty() &&
      noDuplicateExists(multisigOwners)
      ? true
      : false;
  };

  const getTransactionStartButtonLabel = () => {
    return !multisigTitle ? 'Add a proposal title' : !isFormDirty() ? 'Edit safe' : 'Sign proposal';
  };

  const isOwnersListValid = () => {
    return multisigOwners.every(o => o.address.length > 0 && isValidAddress(o.address));
  };

  const onThresholdInputValueChange = (value: string) => {
    let newValue = value.trim();

    const decimals = selectedToken ? selectedToken.decimals : 0;
    const splitted = newValue.toString().split('.');
    const left = splitted[0];

    if (decimals && splitted[1]) {
      if (splitted[1].length > decimals) {
        splitted[1] = splitted[1].slice(0, -1);
        newValue = splitted.join('.');
      }
    } else if (left.length > 1) {
      const number = +splitted[0] - 0;
      splitted[0] = `${number}`;
      newValue = splitted.join('.');
    }

    if (newValue === null || newValue === undefined || newValue === '') {
      setLocalMultisigThreshold(0);
    } else if (isValidNumber(newValue)) {
      setLocalMultisigThreshold(+newValue);
    }
  };

  return (
    <Modal
      className='mean-modal simple-modal'
      title={<div className='modal-title'>Propose edit safe</div>}
      maskClosable={false}
      footer={null}
      open={isVisible}
      onOk={onAcceptModal}
      onCancel={onCloseModal}
      afterClose={onAfterClose}
      width={isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}
    >
      <div className={!isBusy ? 'panel1 show' : 'panel1 hide'}>
        {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
          <>
            {/* Proposal title */}
            <div className='mb-3'>
              <div className='form-label'>{t('multisig.proposal-modal.title')}</div>
              <InputMean
                id='proposal-title-field'
                name='Title'
                className='w-100 general-text-input'
                onChange={onTitleInputValueChange}
                placeholder='Add a proposal title (required)'
                value={multisigTitle}
              />
            </div>

            {/* Multisig label */}
            <div className='mb-3'>
              <div className='form-label'>{t('multisig.create-multisig.multisig-label-input-label')}</div>
              <div className={`well ${isBusy ? 'disabled' : ''}`}>
                <div className='flex-fixed-right'>
                  <div className='left'>
                    <input
                      id='multisig-label-field'
                      className='w-100 general-text-input'
                      autoComplete='off'
                      autoCorrect='off'
                      type='text'
                      maxLength={32}
                      onChange={e => onLabelInputValueChange(e.target.value)}
                      placeholder={t('multisig.create-multisig.multisig-label-placeholder')}
                      value={multisigLabel}
                    />
                  </div>
                </div>
                <div className='form-field-hint'>I.e. "My company payroll", "Seed round vesting", etc.</div>
              </div>
            </div>

            {/* Multisig threshold */}
            <div className='mb-3'>
              <div className='form-label'>{t('multisig.create-multisig.multisig-threshold-input-label')}</div>
              <div className={`well ${isBusy ? 'disabled' : ''}`}>
                <div className='flex-fixed-right'>
                  <div className='left'>
                    <input
                      id='multisig-threshold-field'
                      className='w-100 general-text-input'
                      autoComplete='off'
                      autoCorrect='off'
                      type='text'
                      pattern='^[0-9]*$'
                      onChange={e => onThresholdInputValueChange(e.target.value)}
                      placeholder={t('multisig.create-multisig.multisig-threshold-placeholder')}
                      value={localMultisigThreshold}
                    />
                  </div>
                </div>
                {!localMultisigThreshold || localMultisigThreshold < 1 ? (
                  <span className='form-field-error'>
                    {t('multisig.create-multisig.multisig-threshold-input-empty')}
                  </span>
                ) : localMultisigThreshold > MAX_MULTISIG_PARTICIPANTS ? (
                  <span className='form-field-error'>{t('multisig.create-multisig.multisig-threshold-input-max')}</span>
                ) : null}
              </div>
            </div>

            {/* Multisig Owners selector */}
            <MultisigParticipants
              participants={multisigOwners}
              label={t('multisig.create-multisig.multisig-participants', {
                numParticipants: multisigOwners.length,
                maxParticipants: MAX_MULTISIG_PARTICIPANTS,
              })}
              multisigAddresses={multisigAddresses}
              disabled={isBusy}
              onParticipantsChanged={(e: MultisigParticipant[]) => setMultisigOwners(e)}
            />

            {isFormDirty() && multisigPendingTxsAmount > 0 && (
              <div className='font-size-100 fg-orange-red pl-1'>
                {t('multisig.update-multisig.edit-not-allowed-message')}
              </div>
            )}

            {!isError(transactionStatus.currentOperation) && (
              <div className='col-12 p-0 mt-3'>
                <Button
                  className={`center-text-in-btn ${isBusy ? 'inactive' : ''}`}
                  block
                  type='primary'
                  shape='round'
                  size='large'
                  disabled={!isFormValid()}
                  onClick={() => {
                    if (transactionStatus.currentOperation === TransactionStatus.Iddle) {
                      onAcceptModal();
                    } else if (transactionStatus.currentOperation === TransactionStatus.TransactionFinished) {
                      onCloseModal();
                    } else {
                      refreshPage();
                    }
                  }}
                >
                  {isBusy
                    ? t('multisig.update-multisig.main-cta-busy')
                    : transactionStatus.currentOperation === TransactionStatus.Iddle
                      ? getTransactionStartButtonLabel()
                      : transactionStatus.currentOperation === TransactionStatus.TransactionFinished
                        ? t('general.cta-finish')
                        : t('general.refresh')}
                </Button>
              </div>
            )}
          </>
        ) : transactionStatus.currentOperation === TransactionStatus.TransactionFinished ? (
          <>
            <div className='transaction-progress'>
              <CheckOutlined style={{ fontSize: 48 }} className='icon mt-0' />
              <h4 className='font-bold'>{t('multisig.update-multisig.success-message')}</h4>
            </div>
          </>
        ) : (
          <>
            <div className='transaction-progress p-0'>
              <InfoCircleOutlined style={{ fontSize: 48 }} className='icon mt-0' />
              {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                <h4 className='mb-4'>
                  {t('transactions.status.tx-start-failure', {
                    accountBalance: getAmountWithSymbol(nativeBalance, SOL_MINT.toBase58()),
                    feeAmount: getAmountWithSymbol(
                      transactionFees.networkFee + transactionFees.multisigFee + transactionFees.rentExempt,
                      SOL_MINT.toBase58(),
                    ),
                  })}
                </h4>
              ) : (
                <h4 className='font-bold mb-3'>
                  {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
                </h4>
              )}
              {!isBusy && (
                <div className='row two-col-ctas mt-3 transaction-progress p-2'>
                  <div className='col-12'>
                    <Button
                      block
                      type='text'
                      shape='round'
                      size='middle'
                      className={isBusy ? 'inactive' : ''}
                      onClick={() => (isError(transactionStatus.currentOperation) ? onAcceptModal() : onCloseModal())}
                    >
                      {isError(transactionStatus.currentOperation) &&
                      transactionStatus.currentOperation !== TransactionStatus.TransactionStartFailure
                        ? t('general.retry')
                        : t('general.cta-close')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div
        className={
          isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle ? 'panel2 show' : 'panel2 hide'
        }
      >
        {isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle && (
          <div className='transaction-progress'>
            <Spin indicator={bigLoadingIcon} className='icon mt-0' />
            <h4 className='font-bold mb-1'>
              {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
            </h4>
            {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
              <div className='indication'>{t('transactions.status.instructions')}</div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
