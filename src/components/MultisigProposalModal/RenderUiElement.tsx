import { useCallback } from 'react';

import type { App, UiElement } from '@mean-dao/mean-multisig-apps';
import { Col, Radio, Row } from 'antd';
import { FormLabelWithIconInfo } from 'components/FormLabelWithIconInfo';
import { InputMean } from 'components/InputMean';
import { InputTextAreaMean } from 'components/InputTextAreaMean';
import { SelectMean } from 'components/SelectMean';
import { useTranslation } from 'react-i18next';

interface Props {
  element: UiElement;
  isBusy: boolean;
  proposer: string;
  inputState: any;
  selectedApp: App | undefined;
  serializedTx: any;
  selectOptionState: any;
  multisigAuthority: string;
  onSelectOptionChange: (e: { key: any; value: any }) => void;
  onRadioOptionChange: (e: { id: any; value: any }) => void;
  onChangeCredixValue: (value: any) => void;
  onInputChange: (e: { id: any; value: any }) => void;
  onPasteValue: (value: any) => void;
}

const RenderUiElement = ({
  element,
  isBusy,
  proposer,
  inputState,
  selectedApp,
  serializedTx,
  selectOptionState,
  multisigAuthority,
  onSelectOptionChange,
  onRadioOptionChange,
  onChangeCredixValue,
  onInputChange,
  onPasteValue,
}: Props) => {
  const { t } = useTranslation('common');

  const isNumberInput = useCallback(() => {
    return !!(element.type === 'inputNumber' || (typeof element.type === 'object' && 'from' in element.type));
  }, [element.type]);

  const renderTextInput = useCallback(() => {
    return (
      <Col xs={24} sm={24} md={24} lg={24} className='text-left pl-1'>
        <FormLabelWithIconInfo label={element.label} tooltipText={element.help} />
        <InputMean
          id={element.name}
          maxLength={64}
          className={isBusy ? 'disabled' : ''}
          name={element.label}
          onChange={(e: any) => {
            console.log(e);
            onInputChange({
              id: element.name,
              value: e.target.value,
            });
          }}
          placeholder={element.help}
          value={inputState[element.name] || element.value}
        />
      </Col>
    );
  }, [element.help, element.label, element.name, element.value, onInputChange, inputState, isBusy]);

  const renderNumberInput = useCallback(() => {
    return (
      <Col xs={24} sm={24} md={24} lg={24} className='text-left pl-1'>
        <FormLabelWithIconInfo label={element.label} tooltipText={element.help} />
        <InputMean
          id={element.name}
          type='number'
          className={isBusy ? 'disabled' : ''}
          name={element.label}
          min={1}
          pattern='^[0-9]*[.,]?[0-9]*$'
          onChange={(e: any) => {
            console.log(e);
            if (selectedApp?.folder === 'credix') {
              onChangeCredixValue(e.target.value);
            }
            onInputChange({
              id: element.name,
              value: e.target.value,
            });
          }}
          placeholder={element.help}
          value={inputState[element.name]}
        />
      </Col>
    );
  }, [
    element.help,
    element.label,
    element.name,
    onInputChange,
    inputState,
    isBusy,
    onChangeCredixValue,
    selectedApp?.folder,
  ]);

  const renderTextArea = useCallback(() => {
    return (
      <Col xs={24} sm={24} md={24} lg={24} className='text-left pl-1'>
        <FormLabelWithIconInfo label={element.label} tooltipText={element.help} />
        {element.name === 'serializedTx' ? (
          <>
            <InputTextAreaMean
              id={element.name}
              rows={30}
              className={`well mb-1 proposal-summary-container vertical-scroll paste-input ${isBusy ? 'disabled' : ''}`}
              onChange={(e: any) => {
                console.log(e);
                onInputChange({
                  id: element.name,
                  value: serializedTx,
                });
              }}
              onPaste={onPasteValue}
              placeholder='Paste a serialized transaction in base64 string format (required)'
              value={inputState[element.name]}
            />
          </>
        ) : (
          <InputTextAreaMean
            id={element.name}
            className={isBusy ? 'disabled' : ''}
            maxLength={256}
            onChange={(e: any) => {
              console.log(e);
              onInputChange({
                id: element.name,
                value: e.target.value,
              });
            }}
            placeholder={element.help}
            value={inputState[element.name]}
          />
        )}
      </Col>
    );
  }, [element.help, element.label, element.name, onInputChange, inputState, isBusy, onPasteValue, serializedTx]);

  const renderSelectOptions = useCallback(() => {
    return (
      <Col xs={24} sm={24} md={24} lg={24} className='text-left pr-1'>
        <FormLabelWithIconInfo label={element.label} tooltipText={element.help} />
        <SelectMean
          key={element.name}
          className={isBusy ? 'disabled' : ''}
          onChange={(value: any) => {
            onSelectOptionChange({
              key: element.name,
              value: value,
            });
          }}
          placeholder={element.help}
          values={element.value.map((elem: any) => elem.value)}
          value={selectOptionState[element.name]}
        />
      </Col>
    );
  }, [element.help, element.label, element.name, element.value, isBusy, onSelectOptionChange, selectOptionState]);

  const renderRadioOptions = useCallback(() => {
    return (
      <>
        <Col xs={24} sm={6} md={6} lg={6} className='text-right pr-1'>
          <FormLabelWithIconInfo label={element.label} tooltipText={element.help} />
        </Col>
        <Col xs={24} sm={18} md={18} lg={18} className='pt-1'>
          <Radio.Group
            className='ml-2'
            id={element.name}
            onChange={(e: any) => {
              onRadioOptionChange({
                id: element.name,
                value: e.target.value,
              });
            }}
            name={element.label}
            value={inputState[element.name]}
          >
            <Radio value={true}>{t('general.yes')}</Radio>
            <Radio value={false}>{t('general.no')}</Radio>
          </Radio.Group>
        </Col>
      </>
    );
  }, [element.help, element.label, element.name, inputState, onRadioOptionChange, t]);

  const renderKnownValue = useCallback(() => {
    return (
      <Row gutter={[8, 8]} className='mb-1'>
        <Col xs={24} sm={24} md={24} lg={24} className='text-right pr-1'>
          <FormLabelWithIconInfo label={element.label} tooltipText={element.help} />
          <code>{element.value}</code>
        </Col>
      </Row>
    );
  }, [element.help, element.label, element.value]);

  const renderSlot = useCallback(() => {
    return (
      <Row gutter={[8, 8]} className='mb-1'>
        <Col xs={24} sm={24} md={24} lg={24} className='text-right pr-1'>
          <FormLabelWithIconInfo label={element.label} tooltipText={element.help} />
          <code>{element.value}</code>
        </Col>
      </Row>
    );
  }, [element.help, element.label, element.value]);

  const renderTxProposer = useCallback(() => {
    return (
      <Row gutter={[8, 8]} className='mb-1'>
        <Col xs={24} sm={24} md={24} lg={24} className='text-right pr-1'>
          <FormLabelWithIconInfo label={element.label} tooltipText={element.help} />
          <code>{proposer}</code>
        </Col>
      </Row>
    );
  }, [element.help, element.label, proposer]);

  const renderFrom = useCallback(() => {
    return (
      <Col xs={24} sm={24} md={24} lg={24} className='text-left pl-1'>
        <FormLabelWithIconInfo label={element.label} tooltipText={element.help} />
        <InputMean
          id={element.name}
          maxLength={64}
          className={isBusy ? 'disabled' : ''}
          name={element.label}
          onChange={(e: any) => {
            console.log(e);
            onInputChange({
              id: element.name,
              value: e.target.value,
            });
          }}
          placeholder={element.help}
          value={inputState[element.name]}
        />
      </Col>
    );
  }, [element.help, element.label, element.name, inputState, isBusy, onInputChange]);

  const renderMultisigAnth = useCallback(() => {
    return (
      <Row gutter={[8, 8]} className='mb-1'>
        <Col xs={24} sm={24} md={24} lg={24} className='text-right pr-1'>
          <FormLabelWithIconInfo label={element.label} tooltipText={element.help} />
          <code>{multisigAuthority}</code>
        </Col>
      </Row>
    );
  }, [element.help, element.label, multisigAuthority]);

  const renderUiElements = useCallback(() => {
    if (element.type === 'inputText') {
      return renderTextInput();
    } else if (isNumberInput()) {
      return renderNumberInput();
    } else if (element.type === 'inputTextArea') {
      return renderTextArea();
    } else if (element.type === 'option') {
      return renderSelectOptions();
    } else if (element.type === 'yesOrNo') {
      return renderRadioOptions();
    } else if (element.type === 'knownValue') {
      return renderKnownValue();
    } else if (element.type === 'slot') {
      return renderSlot();
    } else if (element.type === 'txProposer') {
      return renderTxProposer();
    } else if (element.type === 'treasuryAccount') {
      return null;
    } else if (typeof element.type === 'object' && 'from' in element.type) {
      return renderFrom();
    } else if (element.type === 'multisig') {
      return renderMultisigAnth();
    } else {
      return null;
    }
  }, [
    element.type,
    isNumberInput,
    renderFrom,
    renderKnownValue,
    renderMultisigAnth,
    renderNumberInput,
    renderRadioOptions,
    renderSelectOptions,
    renderSlot,
    renderTextArea,
    renderTextInput,
    renderTxProposer,
  ]);

  return (
    <Row gutter={[8, 8]} className='mb-1'>
      {renderUiElements()}
    </Row>
  );
};

export default RenderUiElement;
