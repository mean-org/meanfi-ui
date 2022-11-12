import { PlusOutlined } from '@ant-design/icons';
import { MultisigParticipant } from '@mean-dao/mean-multisig-sdk';
import { Modal } from 'antd';
import { ModalTemplate } from 'components/ModalTemplate';
import { TextInput } from 'components/TextInput';
import { isValidAddress, scrollToBottom } from 'middleware/ui';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

export const MultisigParticipants = (props: {
  participants: MultisigParticipant[];
  onParticipantsChanged: any;
  label: string;
  disabled?: boolean;
  multisigAddresses: string[];
}) => {
  const {
    participants,
    onParticipantsChanged,
    label,
    disabled,
    multisigAddresses,
  } = props;
  const { t } = useTranslation('common');
  const [accumulator, setAccumulator] = useState(1);
  // Max signers info modal
  const [isMaxSignersInfoModalVisible, setIsMaxSignersInfoModalVisibility] =
    useState(false);
  const showMaxSignersInfoModal = useCallback(
    () => setIsMaxSignersInfoModalVisibility(true),
    [],
  );
  const closeMaxSignersInfoModal = useCallback(
    () => setIsMaxSignersInfoModalVisibility(false),
    [],
  );

  const setSingleItemName = useCallback(
    (name: string, index: number) => {
      const items = JSON.parse(
        JSON.stringify(participants),
      ) as MultisigParticipant[];
      items[index].name = name;
      onParticipantsChanged(items);
    },
    [onParticipantsChanged, participants],
  );

  const setSingleItemAddress = useCallback(
    (address: string, index: number) => {
      const items = JSON.parse(
        JSON.stringify(participants),
      ) as MultisigParticipant[];
      items[index].address = address;
      onParticipantsChanged(items);
    },
    [onParticipantsChanged, participants],
  );

  const onRemoveSingleItem = useCallback(
    (index: number) => {
      const items = JSON.parse(
        JSON.stringify(participants),
      ) as MultisigParticipant[];
      items.splice(index, 1);
      onParticipantsChanged(items);
    },
    [onParticipantsChanged, participants],
  );

  const addParticipant = useCallback(() => {
    if (participants.length === 10) {
      showMaxSignersInfoModal();
      return;
    }
    const items = JSON.parse(
      JSON.stringify(participants),
    ) as MultisigParticipant[];
    const newAccumulator = accumulator + 1;
    setAccumulator(newAccumulator);
    items.push({
      name: `Signer ${newAccumulator}`,
      address: '',
    });
    if (!checkIfDuplicateExists(items)) {
      onParticipantsChanged(items);
      setTimeout(() => {
        scrollToBottom('multisig-participants-max-height');
      }, 100);
    }
  }, [
    accumulator,
    onParticipantsChanged,
    participants,
    showMaxSignersInfoModal,
  ]);

  const checkIfDuplicateExists = (arr: MultisigParticipant[]): boolean => {
    const items = arr.map(i => i.address);
    return new Set(items).size !== items.length ? true : false;
  };

  const isInputMultisigAddress = (address: string) => {
    return multisigAddresses.includes(address);
  };

  return (
    <>
      <div
        className={`flex-fixed-right mb-1${disabled ? ' click-disabled' : ''}`}
      >
        <div className="left">
          {label ? (
            <div className="form-label">{label}</div>
          ) : (
            <div className="form-label">&nbsp;</div>
          )}
        </div>
        <div className="right">
          <span className="flat-button tiny" onClick={() => addParticipant()}>
            <PlusOutlined />
            <span className="ml-1 text-uppercase">
              {t('multisig.add-participant-cta')}
            </span>
          </span>
        </div>
      </div>
      {participants && participants.length > 0 && (
        <div id="multisig-participants-max-height">
          {participants.map(
            (participant: MultisigParticipant, index: number) => {
              return (
                <div
                  key={`participant-${index}`}
                  className="two-column-layout address-fixed"
                >
                  <div className="left">
                    <TextInput
                      placeholder="Enter signer name or description"
                      extraClass="small"
                      id={`participant-name-${index + 1}`}
                      value={participant.name}
                      allowClear={false}
                      maxLength={32}
                      onInputChange={(e: any) => {
                        const value = e.target.value;
                        setSingleItemName(value, index);
                      }}
                    />
                  </div>
                  <div className="right">
                    <TextInput
                      placeholder="Type or paste the address of multisig signer"
                      extraClass="small"
                      id={`participant-address-${index + 1}`}
                      value={participant.address}
                      allowClear={participants.length > 1}
                      alwaysShowClear={participants.length > 1}
                      error={
                        isValidAddress(participant.address)
                          ? isInputMultisigAddress(participant.address)
                            ? t(
                                'multisig.create-multisig.multisig-address-used-as-participant',
                              )
                            : ''
                          : t('transactions.validation.valid-address-required')
                      }
                      onInputClear={() => onRemoveSingleItem(index)}
                      onInputChange={(e: any) => {
                        const value = e.target.value;
                        setSingleItemAddress(value, index);
                      }}
                    />
                  </div>
                </div>
              );
            },
          )}
        </div>
      )}

      <ModalTemplate
        handleClose={closeMaxSignersInfoModal}
        isVisible={isMaxSignersInfoModalVisible}
        title={'Max signers reached'}
        centered={true}
        content={<p>The maximum allowed signers are 10.</p>}
      />
    </>
  );
};
