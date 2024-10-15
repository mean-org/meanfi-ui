import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import type { App, AppConfig, AppsProvider, UiElement, UiInstruction } from '@mean-dao/mean-multisig-apps';
import type { MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import { BN } from '@project-serum/anchor';
import type { TransactionInstruction } from '@solana/web3.js';
import { Alert, Button, Col, Divider, Modal, Row, Spin } from 'antd';
import { Fragment, useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { IconExternalLink } from 'src/Icons'
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS, VESTING_ROUTE_BASE_PATH } from 'src/app-constants/common';
import { InputMean } from 'src/components/InputMean';
import { InputTextAreaMean } from 'src/components/InputTextAreaMean';
import { openNotification } from 'src/components/Notifications';
import { SelectMean } from 'src/components/SelectMean';
import { StepSelector } from 'src/components/StepSelector';
import { AppStateContext } from 'src/contexts/appstate';
import { getSolanaExplorerClusterParam, useConnection } from 'src/contexts/connection';
import { useWallet } from 'src/contexts/wallet';
import { isError } from 'src/middleware/transactions';
import { consoleOut, copyText, getTransactionOperationDescription } from 'src/middleware/ui';
import { RegisteredAppPaths } from 'src/models/accounts';
import type { LabelOption, SelectOption } from 'src/models/common-types';
import { TransactionStatus } from 'src/models/enums';
import {
  type CreateNewProposalParams,
  NATIVE_LOADER,
  getMultisigInstructionSummary,
  isCredixFinance,
  parseSerializedTx,
} from 'src/models/multisig';
import type { LooseObject } from 'src/types/LooseObject';
import RenderUiElement from './RenderUiElement';
import './style.scss';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

const expires: LabelOption[] = [
  { label: 'No expiry', value: 0 },
  { label: '24 hours', value: 86_400 },
  { label: '48 hours', value: 172_800 },
  { label: '72 hours', value: 259_200 },
  { label: '7 days', value: 604_800 },
];

export const MultisigProposalModal = (props: {
  handleClose: () => void;
  isVisible: boolean;
  isBusy: boolean;
  proposer: string;
  appsProvider: AppsProvider | undefined;
  solanaApps: App[];
  handleOk: (options: CreateNewProposalParams) => void;
  selectedMultisig?: MultisigInfo;
}) => {
  const navigate = useNavigate();
  const { publicKey } = useWallet();
  const { t } = useTranslation('common');
  const connection = useConnection();
  const { theme, transactionStatus, setTransactionStatus } = useContext(AppStateContext);

  const { handleClose, isVisible, isBusy, proposer, appsProvider, solanaApps, handleOk, selectedMultisig } = props;

  const [currentStep, setCurrentStep] = useState(0);
  const [proposalTitleValue, setProposalTitleValue] = useState('');
  const [proposalExpiresValue, setProposalExpiresValue] = useState<LabelOption>(expires[0]);

  const [proposalDescriptionValue, setProposalDescriptionValue] = useState('');
  const [countWords, setCountWords] = useState(0);
  const [lettersLeft, setLettersLeft] = useState(256);

  const [selectedApp, setSelectedApp] = useState<App>();
  const [selectedAppConfig, setSelectedAppConfig] = useState<AppConfig>();
  const [selectedUiIx, setSelectedUiIx] = useState<UiInstruction | undefined>();
  const [credixValue, setCredixValue] = useState<number | undefined>();
  const [inputState, setInputState] = useState<LooseObject>({});

  // Copy address to clipboard
  const copyAddressToClipboard = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
    (address: any) => {
      if (copyText(address.toString())) {
        openNotification({
          description: t('notifications.account-address-copied-message'),
          type: 'info',
        });
      } else {
        openNotification({
          description: t('notifications.account-address-not-copied-message'),
          type: 'error',
        });
      }
    },
    [t],
  );

  const onStepperChange = useCallback((value: number) => {
    setCurrentStep(value);
  }, []);

  const onContinueStepOneButtonClick = useCallback(() => {
    if (selectedApp?.name === 'Payment Streaming') {
      handleClose();
      const url = `/${RegisteredAppPaths.PaymentStreaming}/summary`;
      navigate(url);
    } else if (selectedApp?.name === 'Token Vesting') {
      handleClose();
      navigate(VESTING_ROUTE_BASE_PATH);
    } else {
      setCurrentStep(1); // Go to step 2
    }
  }, [handleClose, navigate, selectedApp?.name]);

  const onContinueStepTwoButtonClick = useCallback(() => {
    setCurrentStep(2); // Go to step 3
  }, []);

  const updateSelectedIx = useCallback(
    (state: LooseObject) => {
      if (!selectedMultisig || !selectedApp || !selectedUiIx) {
        return;
      }

      consoleOut('state:', state, 'blue');
      const currentUiIx = Object.assign({}, selectedUiIx);

      for (const uiElem of currentUiIx.uiElements) {
        if (uiElem.type !== 'knownValue') {
          if (uiElem.type === 'multisig') {
            uiElem.value = selectedMultisig.authority.toBase58();
          } else if (typeof uiElem.type === 'object' && 'from' in uiElem.type && state[uiElem.name]) {
            uiElem.value = state[uiElem.name];
          } else {
            if (!state[uiElem.name] || !uiElem.dataElement) {
              continue;
            }
            uiElem.value = state[uiElem.name];
            if ('dataType' in uiElem.dataElement) {
              if (uiElem.dataElement.dataType === 'u64') {
                if (uiElem.type === 'datePicker') {
                  const date = new Date(state[uiElem.name]);
                  uiElem.dataElement.dataValue = new BN(date.getTime() / 1_000);
                } else {
                  uiElem.dataElement.dataValue = new BN(state[uiElem.name]);
                }
              } else if (uiElem.dataElement.dataType === 'u8') {
                uiElem.dataElement.dataValue = Number.parseInt(state[uiElem.name]);
              } else if (uiElem.dataElement.dataType === 'string') {
                uiElem.dataElement.dataValue = state[uiElem.name];
              }
            } else {
              uiElem.dataElement.dataValue = state[uiElem.name]; // new PublicKey(state[uiElem.name]);
            }
          }
        }
      }

      setSelectedUiIx(currentUiIx);
    },
    [selectedApp, selectedMultisig, selectedUiIx],
  );

  const onAcceptModal = useCallback(() => {
    if (!selectedApp || !selectedMultisig || !selectedAppConfig || !selectedUiIx) {
      return;
    }
    updateSelectedIx(inputState);
    const options: CreateNewProposalParams = {
      appId: selectedApp.id,
      multisigId: selectedMultisig.id.toBase58(),
      title: proposalTitleValue,
      description: proposalDescriptionValue,
      expires: proposalExpiresValue.value,
      config: selectedAppConfig,
      instruction: selectedUiIx,
    };
    handleOk(options);
  }, [
    handleOk,
    inputState,
    proposalDescriptionValue,
    proposalExpiresValue.value,
    proposalTitleValue,
    selectedApp,
    selectedAppConfig,
    selectedMultisig,
    selectedUiIx,
    updateSelectedIx,
  ]);

  const onAfterClose = useCallback(() => {
    setTimeout(() => {
      setSelectedApp(undefined);
      setProposalTitleValue('');
      setProposalExpiresValue(expires[0]);
      setProposalDescriptionValue('');
    });
    setTransactionStatus({
      lastOperation: TransactionStatus.Idle,
      currentOperation: TransactionStatus.Idle,
    });
  }, [setTransactionStatus]);

  const onCloseModal = useCallback(() => {
    handleClose();
    onAfterClose();
  }, [handleClose, onAfterClose]);

  const getStepOneContinueButtonLabel = useCallback((): string => {
    return !publicKey ? t('transactions.validation.not-connected') : t('Next');
  }, [publicKey, t]);

  const getStepTwoContinueButtonLabel = useCallback((): string => {
    return !publicKey ? t('transactions.validation.not-connected') : t('Next');
  }, [publicKey, t]);

  const getTransactionStartButtonLabel = useCallback((): string => {
    return !publicKey ? t('transactions.validation.not-connected') : t('Create');
  }, [publicKey, t]);

  const onProposalTitleValueChange = useCallback((value: string) => {
    setProposalTitleValue(value);
  }, []);

  const onProposalExpiresValueChange = useCallback((value: string) => {
    const expireOption = expires.find(v => v.value === +value);
    if (expireOption) {
      setProposalExpiresValue(expireOption);
    }
  }, []);

  const onProposalDescriptionValueChange = useCallback((value: string | undefined) => {
    setProposalDescriptionValue(value ?? '');
    setCountWords(value?.length ?? 0);
  }, []);

  const onProposalInstructionValueChange = useCallback(
    (value: string) => {
      if (!value || !selectedAppConfig) {
        return;
      }

      if (!selectedAppConfig.ui.length) {
        return;
      }
      setInputState({});

      const uiIx = selectedAppConfig.ui.filter(ix => ix.id === value)[0];

      console.log('uiIx', uiIx);
      setSelectedUiIx(uiIx);
    },
    [selectedAppConfig],
  );

  const handleChangeInput = useCallback(
    (e: LooseObject) => {
      setInputState({
        ...inputState,
        [e.id]: e.value,
      });
    },
    [inputState],
  );

  const handleChangeYesOrNot = useCallback(
    (e: LooseObject) => {
      setInputState({
        ...inputState,
        [e.id]: e.value,
      });
    },
    [inputState],
  );

  const [selectOptionState, setSelectOptionState] = useState<LooseObject>({});

  const handleChangeOption = useCallback(
    (e: LooseObject) => {
      setSelectOptionState({ [e.key]: e.value });
      setInputState({
        ...inputState,
        [e.key]: e.value,
      });
    },
    [inputState],
  );

  useEffect(() => {
    if (!appsProvider || !selectedApp) {
      return;
    }

    appsProvider
      .getAppConfig(selectedApp.id, selectedApp.uiUrl, selectedApp.defUrl)
      .then(config => {
        console.log('selected app config', config);
        setSelectedAppConfig(config ?? undefined);
      })
      .catch(err => {
        consoleOut('Error: ', err, 'red');
      });
  }, [appsProvider, selectedApp]);

  useEffect(() => {
    setLettersLeft(256 - countWords);
  }, [countWords]);

  useEffect(() => {
    if (selectedApp) {
      if (selectedApp.folder === 'custom') {
        selectedAppConfig?.ui.map((ix: UiInstruction) => {
          return setSelectedUiIx(ix);
        });
      } else {
        return setSelectedUiIx(undefined);
      }
    }
  }, [selectedApp, selectedAppConfig]);

  // Display solana apps in proposal modal (Step 1)
  const renderSolanaApps = useCallback(() => {
    return (
      <>
        {solanaApps.length > 0 &&
          solanaApps.map(app => {
            const onSelectApp = () => {
              console.log('selected app', app);
              setSelectedApp(app);
              setProposalTitleValue('');
              setProposalExpiresValue(expires[0]);
              setProposalDescriptionValue('');
            };

            const renderAppLogo = () => {
              if (app.id === NATIVE_LOADER.toBase58()) {
                return <img src={app.logoUri} width={65} height={65} alt={app.name} />;
              }
              if (app.folder === 'credix' && theme === 'light') {
                return (
                  <img
                    src={app.logoUri}
                    width={62}
                    height={62}
                    alt={app.name}
                    style={{ background: 'grey', borderRadius: '0.75em' }}
                  />
                );
              }

              return <img src={app.logoUri} width={65} height={65} alt={app.name} />;
            };
            return (
              <Col xs={8} sm={6} md={6} lg={6} className='select-app' key={`app-${app.folder}-${app.id}`}>
                <div
                  className={`select-app-item simplelink ${
                    selectedApp && selectedApp.name === app.name ? 'selected-app' : 'no-selected-app'
                  }`}
                  onKeyDown={() => {}}
                  onClick={onSelectApp}
                >
                  {renderAppLogo()}
                  <span className='info-label'>{app.name}</span>
                </div>
              </Col>
            );
          })}
      </>
    );
  }, [selectedApp, solanaApps, theme]);

  const [isSerializedTxValid, setIsSerializedTxValid] = useState<boolean>();

  // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
  const [serializedTx, setSerializedTx] = useState<any>();

  // Handler paste clipboard serialized transaction
  // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
  const pasteHandler = useCallback((e: any) => {
    const base64regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
    const getInputData = e.clipboardData.getData('Text');
    const isValid = base64regex.test(getInputData);
    const serializedValidation = isValid ? getInputData : 'Invalid serialized transaction';
    setIsSerializedTxValid(isValid);
    setSerializedTx(serializedValidation);
  }, []);

  // Deserialize transaction
  // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
  const [deserializedTx, setDeserializedTx] = useState<any>();

  useEffect(() => {
    serializedTx &&
      parseSerializedTx(connection, serializedTx).then(tx => {
        if (tx) {
          const ix = {
            programId: tx.instructions[0].programId,
            keys: tx.instructions[0].keys,
            data: tx.instructions[0].data,
          } as TransactionInstruction;

          const summary = getMultisigInstructionSummary(ix);
          consoleOut('Deserialized Tx', summary);

          setDeserializedTx(summary);
        }
      });
  }, [connection, serializedTx]);

  const renderIdleState = useCallback(() => {
    return (
      <>
        <div className='scrollable-content'>
          <StepSelector step={currentStep} steps={3} onValueSelected={onStepperChange} />

          <div className={currentStep === 0 ? 'contract-wrapper panel1 show' : 'contract-wrapper panel1 hide'}>
            <>
              <h3 className='left-title'>Select app</h3>
              <Row gutter={[8, 8]} className='step-one-select-app'>
                {renderSolanaApps()}
              </Row>
            </>
          </div>

          <div className={currentStep === 1 ? 'contract-wrapper panel2 show' : 'contract-wrapper panel2 hide'}>
            <>
              <h3 className='left-title'>Proposal setup</h3>
              <div className='step-two-select-app'>
                <Row gutter={[8, 8]}>
                  <Col span={24} className='step-two-selected-app'>
                    {selectedApp &&
                      (!selectedApp.logoUri ? (
                        // !selectedApp.logoUri || selectedApp.id === SystemProgram.programId.toBase58() ? (
                        <img
                          style={{ borderRadius: '50%', padding: '0.2em' }}
                          src={'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png'}
                          width={40}
                          height={40}
                          alt={selectedApp.name}
                        />
                      ) : (
                        <img className='mr-1' src={selectedApp.logoUri} alt={selectedApp.name} width={40} height={40} />
                      ))}
                    <div className='selected-app'>
                      <div className='info-label'>Selected App</div>
                      <span>{selectedApp?.name}</span>
                    </div>
                  </Col>

                  {selectedApp && isCredixFinance(selectedApp.id) ? (
                    <Col span={24} className='alert-info-message mb-1'>
                      <Alert
                        message='This multisig authority needs to have credix and civic pass accounts activated.'
                        type='info'
                        showIcon
                        closable
                      />
                    </Col>
                  ) : null}

                  {/* Proposal title */}
                  <Col xs={24} sm={24} md={16} lg={16}>
                    <div className='mb-2'>
                      <div className='form-label'>{t('multisig.proposal-modal.title')}</div>
                      <InputMean
                        id='proposal-title-field'
                        name='Title'
                        className={`mb-0 ${isBusy ? 'disabled' : ''}`}
                        onChange={onProposalTitleValueChange}
                        placeholder='Add a title (required)'
                        value={proposalTitleValue}
                      />
                    </div>
                  </Col>

                  {/* Expiry date */}
                  <Col xs={24} sm={24} md={8} lg={8}>
                    <div className='mb-2'>
                      <div className='form-label'>Expires in</div>
                      <SelectMean
                        className={`mb-0 ${isBusy ? 'disabled' : ''}`}
                        onChange={onProposalExpiresValueChange}
                        values={expires.map(e => {
                          return {
                            key: `${e.value}`,
                            label: e.label,
                            value: `${e.value}`,
                          } as SelectOption;
                        })}
                        value={{
                          key: `${proposalExpiresValue.value}`,
                          value: `${proposalExpiresValue.value}`,
                          label: `${proposalExpiresValue.label}`,
                        }}
                      />
                    </div>
                  </Col>
                </Row>

                {/* Proposal description */}
                <Row gutter={[8, 8]}>
                  <Col xs={24} sm={24} md={24} lg={24}>
                    <div className='mb-1'>
                      <div className='form-label'>{t('multisig.proposal-modal.description')}</div>
                      <InputTextAreaMean
                        id='proposal-description-field'
                        maxLength={256}
                        className={`mb-0 ${isBusy ? 'disabled' : ''}`}
                        onChange={e => onProposalDescriptionValueChange(e?.target.value)}
                        placeholder='Add a description (optional)'
                        value={proposalDescriptionValue}
                      />
                      <div className='form-field-hint pr-3 text-right'>
                        {t('multisig.proposal-modal.hint-message', {
                          lettersLeft: lettersLeft,
                        })}
                      </div>
                    </div>
                  </Col>
                </Row>

                <div className='step-two-select-instruction'>
                  <Row gutter={[8, 8]} className='mb-1'>
                    {selectedApp && selectedApp.folder !== 'custom' && (
                      <>
                        {/* Instruction */}
                        <Col xs={24} sm={24} md={24} lg={24} className='text-left pr-1'>
                          <div className='form-label'>Instruction:</div>
                          <SelectMean
                            className={isBusy ? 'disabled' : ''}
                            onChange={onProposalInstructionValueChange}
                            placeholder='Select an instruction'
                            values={
                              selectedAppConfig
                                ? selectedAppConfig.ui.map(ix => {
                                    return {
                                      key: ix.id,
                                      label: ix.label,
                                      value: ix.id,
                                    } as SelectOption;
                                  })
                                : []
                            }
                            value={
                              selectedUiIx
                                ? {
                                    key: selectedUiIx.id,
                                    value: selectedUiIx.id,
                                    label: selectedUiIx.label,
                                  }
                                : undefined
                            }
                          />
                        </Col>
                      </>
                    )}
                  </Row>

                  {selectedAppConfig?.ui.map(
                    (ix: UiInstruction) =>
                      selectedUiIx &&
                      selectedUiIx.id === ix.id &&
                      ix.uiElements.map((element: UiElement) => (
                        <div key={`${ix.id}-${element.name}`}>
                          {element.visibility === 'show' ? (
                            <>
                              <RenderUiElement
                                element={element}
                                isBusy={isBusy}
                                proposer={proposer}
                                inputState={inputState}
                                selectedApp={selectedApp}
                                serializedTx={serializedTx}
                                selectOptionState={selectOptionState}
                                multisigAuthority={selectedMultisig?.authority.toBase58()}
                                onSelectOptionChange={value => handleChangeOption(value)}
                                onRadioOptionChange={value => handleChangeYesOrNot(value)}
                                onChangeCredixValue={value => setCredixValue(value)}
                                onInputChange={e => handleChangeInput(e)}
                                onPasteValue={pasteHandler}
                              />
                            </>
                          ) : null}
                        </div>
                      )),
                  )}
                </div>
              </div>
            </>
          </div>

          <div className={currentStep === 2 ? 'contract-wrapper panel3 show' : 'contract-wrapper panel3 hide'}>
            <>
              <h3 className='left-title'>Review proposal</h3>
              <div className='step-three-select-app'>
                {/* Title */}
                <Row className='mb-1'>
                  {proposalTitleValue && (
                    <>
                      <Col span={8} className='text-right pr-1'>
                        <span className='info-label'>{t('multisig.proposal-modal.title-label')}:</span>
                      </Col>
                      <Col span={16} className='text-left pl-1'>
                        <span>{proposalTitleValue}</span>
                      </Col>
                    </>
                  )}
                </Row>

                {/* Expiry date */}
                <Row className='mb-1'>
                  <Col span={8} className='text-right pr-1'>
                    <span className='info-label'>{t('multisig.proposal-modal.expires-label')}:</span>
                  </Col>
                  <Col span={16} className='text-left pl-1'>
                    <span>{proposalExpiresValue.label}</span>
                  </Col>
                </Row>

                {/* Description */}
                <Row className='mb-1'>
                  {proposalDescriptionValue && (
                    <>
                      <Col span={8} className='text-right pr-1'>
                        <span className='info-label'>Description:</span>
                      </Col>
                      <Col span={16} className='text-left pl-1'>
                        <span>{proposalDescriptionValue}</span>
                      </Col>
                    </>
                  )}
                </Row>

                {/* Instruction */}
                <Row className='mb-1'>
                  {selectedUiIx && (
                    <>
                      <Col span={8} className='text-right pr-1'>
                        <span className='info-label'>Instruction:</span>
                      </Col>
                      <Col span={16} className='text-left pl-1'>
                        <span>{selectedUiIx.label}</span>
                      </Col>
                    </>
                  )}
                </Row>

                {/* Data from selected instruction */}
                {selectedApp && selectedApp.id === NATIVE_LOADER.toBase58() ? (
                  <>
                    {isSerializedTxValid &&
                      Object.keys(inputState).map(key => (
                        <>
                          <Fragment key={key}>
                            <div className='info-label text-center mt-2'>
                              {selectedAppConfig?.ui.map((ix: UiInstruction, idx: number) =>
                                ix.uiElements.map(element => (
                                  <span key={`instruction-${idx}-${element.dataElement?.index}`}>{element.label}</span>
                                )),
                              )}
                            </div>
                            <div className='well mb-1 proposal-summary-container vertical-scroll'>
                              <div className='mb-1'>
                                <span>{t('multisig.proposal-modal.instruction-program')}:</span>
                                <br />
                                <div>
                                  <span
                                    onKeyDown={() => {}}
                                    onClick={() => copyAddressToClipboard(deserializedTx?.programId)}
                                    className='info-data simplelink underline-on-hover'
                                    style={{ cursor: 'pointer' }}
                                  >
                                    {deserializedTx?.programId}
                                  </span>
                                  <a
                                    target='_blank'
                                    rel='noopener noreferrer'
                                    href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${
                                      deserializedTx?.programId
                                    }${getSolanaExplorerClusterParam()}`}
                                  >
                                    <IconExternalLink className='mean-svg-icons external-icon' />
                                  </a>
                                </div>
                              </div>
                              {/* biome-ignore lint/suspicious/noExplicitAny: Anything can go here */}
                              {deserializedTx?.accounts.map((account: any) => (
                                <div className='mb-1' key={`account-${account.index}`}>
                                  <span>
                                    {t('multisig.proposal-modal.instruction-account')} {account.index + 1}:
                                  </span>
                                  <br />
                                  <div>
                                    <span
                                      onKeyDown={() => {}}
                                      onClick={() => copyAddressToClipboard(account.value)}
                                      className='info-data simplelink underline-on-hover'
                                      style={{ cursor: 'pointer' }}
                                    >
                                      {account.value}
                                    </span>
                                    <a
                                      target='_blank'
                                      rel='noopener noreferrer'
                                      href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${
                                        account.value
                                      }${getSolanaExplorerClusterParam()}`}
                                    >
                                      <IconExternalLink className='mean-svg-icons external-icon' />
                                    </a>
                                  </div>
                                </div>
                              ))}
                              <div className='mb-1'>
                                <span>{t('multisig.proposal-modal.instruction-data')}:</span>
                                <br />
                                {/* biome-ignore lint/suspicious/noExplicitAny: Anything can go here */}
                                {deserializedTx?.data.map((data: any, idx3: number) => (
                                  <span
                                    key={`txdata-item-${idx3}`}
                                    onKeyDown={() => {}}
                                    onClick={() => copyAddressToClipboard(data.value)}
                                    className='info-data simplelink underline-on-hover'
                                    style={{ cursor: 'pointer' }}
                                  >
                                    {data.value}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </Fragment>
                        </>
                      ))}
                  </>
                ) : (
                  Object.keys(inputState).map((key, index) => {
                    const getYesOrNo = () => {
                      if (inputState[key] === true) {
                        return 'Yes';
                      }
                      if (inputState[key] === false) {
                        return 'No';
                      }
                      return inputState[key];
                    };
                    return (
                      <Row className='mb-1' key={`uielement-${index}`}>
                        {key && (
                          <>
                            <Col span={8} className='text-right pr-1'>
                              <span className='info-label'>
                                {selectedUiIx?.uiElements.filter(e => e.name === key)[0].label}:
                              </span>
                            </Col>
                            <Col span={16} className='text-left pl-1'>
                              <span>{getYesOrNo()}</span>
                            </Col>
                          </>
                        )}
                      </Row>
                    );
                  })
                )}
              </div>
            </>
          </div>
        </div>

        <Divider plain />

        <div className={currentStep === 0 ? 'contract-wrapper panel1 show' : 'contract-wrapper panel1 hide'}>
          <Row>
            <Col span={12} className='d-flex justify-content-center'>
              <Button
                type='default'
                size='middle'
                className='thin-stroke col-6'
                onClick={onCloseModal}
                disabled={!publicKey}
              >
                Cancel
              </Button>
            </Col>
            <Col span={12} className='d-flex justify-content-center'>
              <Button
                type='primary'
                shape='round'
                size='middle'
                className='col-6'
                onClick={onContinueStepOneButtonClick}
                disabled={!publicKey || !selectedApp}
              >
                {getStepOneContinueButtonLabel()}
              </Button>
            </Col>
          </Row>
        </div>

        <div className={currentStep === 1 ? 'contract-wrapper panel2 show' : 'contract-wrapper panel2 hide'}>
          <Row>
            <Col span={12} className='d-flex justify-content-center'>
              <Button
                type='default'
                size='middle'
                className='thin-stroke col-6'
                onClick={() => onStepperChange(0)}
                disabled={!publicKey}
              >
                Back
              </Button>
            </Col>
            <Col span={12} className='d-flex justify-content-center'>
              <Button
                type='primary'
                shape='round'
                size='middle'
                className='col-6'
                onClick={onContinueStepTwoButtonClick}
                disabled={
                  !publicKey ||
                  !selectedApp ||
                  !proposalTitleValue ||
                  !selectedUiIx ||
                  (selectedApp.folder === 'custom' && !isSerializedTxValid) ||
                  (selectedApp.folder === 'credix' && !credixValue)
                }
              >
                {getStepTwoContinueButtonLabel()}
              </Button>
            </Col>
          </Row>
        </div>

        <div className={currentStep === 2 ? 'contract-wrapper panel3 show' : 'contract-wrapper panel3 hide'}>
          <Row>
            <Col span={12} className='d-flex justify-content-center'>
              <Button
                type='default'
                size='middle'
                className='thin-stroke col-6'
                onClick={() => onStepperChange(1)}
                disabled={!publicKey}
              >
                Back
              </Button>
            </Col>
            <Col span={12} className='d-flex justify-content-center'>
              <Button
                type='primary'
                shape='round'
                size='middle'
                className='col-6'
                onClick={() => onAcceptModal()}
                disabled={
                  !publicKey ||
                  !selectedApp ||
                  !proposalTitleValue ||
                  !selectedUiIx ||
                  (selectedApp.folder === 'custom' && !isSerializedTxValid) ||
                  (selectedApp.folder === 'credix' && !credixValue) ||
                  !selectedAppConfig
                }
              >
                {getTransactionStartButtonLabel()}
              </Button>
            </Col>
          </Row>
        </div>
      </>
    );
  }, [
    isBusy,
    proposer,
    publicKey,
    inputState,
    lettersLeft,
    credixValue,
    currentStep,
    selectedApp,
    selectedUiIx,
    serializedTx,
    selectOptionState,
    selectedAppConfig,
    proposalTitleValue,
    isSerializedTxValid,
    deserializedTx?.data,
    proposalDescriptionValue,
    deserializedTx?.accounts,
    deserializedTx?.programId,
    proposalExpiresValue.label,
    proposalExpiresValue.value,
    selectedMultisig?.authority,
    getStepOneContinueButtonLabel,
    getStepTwoContinueButtonLabel,
    getTransactionStartButtonLabel,
    onProposalInstructionValueChange,
    onProposalDescriptionValueChange,
    onContinueStepOneButtonClick,
    onContinueStepTwoButtonClick,
    onProposalExpiresValueChange,
    onProposalTitleValueChange,
    copyAddressToClipboard,
    handleChangeYesOrNot,
    handleChangeOption,
    handleChangeInput,
    renderSolanaApps,
    onStepperChange,
    onAcceptModal,
    pasteHandler,
    onCloseModal,
    t,
  ]);

  const renderFinishedState = useCallback(() => {
    return (
      <div className='transaction-progress p-2'>
        <CheckOutlined style={{ fontSize: 48 }} className='icon mt-0' />
        <h4 className='font-bold'>{t('multisig.update-multisig.success-message')}</h4>
        <div className='row two-col-ctas mt-3 transaction-progress p-2'>
          <div className='col-12'>
            <Button
              block
              type='text'
              shape='round'
              size='middle'
              className={isBusy ? 'inactive' : ''}
              onClick={() => onCloseModal()}
            >
              {t('general.cta-close')}
            </Button>
          </div>
        </div>
      </div>
    );
  }, [isBusy, onCloseModal, t]);

  const renderFailureState = useCallback(() => {
    return (
      <div className='transaction-progress p-2'>
        <InfoCircleOutlined style={{ fontSize: 48 }} className='icon mt-1' />
        {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
          <h4 className='mb-4'>{transactionStatus.customError}</h4>
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
                onClick={() =>
                  isError(transactionStatus.currentOperation) &&
                  transactionStatus.currentOperation !== TransactionStatus.TransactionStartFailure
                    ? onAcceptModal()
                    : onCloseModal()
                }
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
    );
  }, [isBusy, onAcceptModal, onCloseModal, t, transactionStatus.currentOperation, transactionStatus.customError]);

  const renderNewProposalModalContent = useCallback(() => {
    if (transactionStatus.currentOperation === TransactionStatus.Idle) {
      return renderIdleState();
    }
    if (transactionStatus.currentOperation === TransactionStatus.TransactionFinished) {
      return renderFinishedState();
    }

    return renderFailureState();
  }, [renderFailureState, renderFinishedState, renderIdleState, transactionStatus.currentOperation]);

  return (
    <Modal
      className='mean-modal simple-modal multisig-proposal-modal'
      title={<div className='modal-title'>New proposal</div>}
      maskClosable={false}
      footer={null}
      open={isVisible}
      onCancel={onCloseModal}
      width={isBusy || transactionStatus.currentOperation !== TransactionStatus.Idle ? 380 : 480}
    >
      <Divider plain />

      <div className={!isBusy ? 'panel1 show' : 'panel1 hide'}>{renderNewProposalModalContent()}</div>

      <div
        className={
          isBusy && transactionStatus.currentOperation !== TransactionStatus.Idle ? 'panel2 show' : 'panel2 hide'
        }
      >
        {isBusy && transactionStatus.currentOperation !== TransactionStatus.Idle && (
          <div className='transaction-progress p-4'>
            <Spin indicator={bigLoadingIcon} className='icon mb-1 mt-1' />
            <h4 className='font-bold'>{getTransactionOperationDescription(transactionStatus.currentOperation, t)}</h4>
            {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
              <div className='indication'>{t('transactions.status.instructions')}</div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
