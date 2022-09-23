import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { PlusOutlined } from "@ant-design/icons";
import { MultisigParticipant } from "@mean-dao/mean-multisig-sdk";
import { isValidAddress, scrollToBottom } from "../../middleware/ui";
import { TextInput } from "../TextInput";

export const MultisigParticipants = (props: {
    participants: MultisigParticipant[];
    onParticipantsChanged: any;
    label: string;
    disabled?: boolean;
    multisigAddresses: string[];
}) => {
    const { t } = useTranslation('common');

    const setSingleItemName = useCallback((name: string, index: number) => {
        const items = JSON.parse(JSON.stringify(props.participants)) as MultisigParticipant[];
        items[index].name = name;
        props.onParticipantsChanged(items);
    }, [props]);

    const setSingleItemAddress = useCallback((address: string, index: number) => {
        const items = JSON.parse(JSON.stringify(props.participants)) as MultisigParticipant[];
        items[index].address = address;
        props.onParticipantsChanged(items);
    }, [props]);

    const onRemoveSingleItem = useCallback((index: number) => {
        const items = JSON.parse(JSON.stringify(props.participants)) as MultisigParticipant[];
        items.splice(index, 1);
        props.onParticipantsChanged(items);
    }, [props]);

    const addParticipant = useCallback(() => {
        const items = JSON.parse(JSON.stringify(props.participants)) as MultisigParticipant[];
        items.push({
            name: `Owner ${items.length + 1}`,
            address: ''
        });
        if (!checkIfDuplicateExists(items)) {
            props.onParticipantsChanged(items);
            setTimeout(() => {
                scrollToBottom('multisig-participants-max-height');
            }, 100);
        }
    }, [props]);

    const checkIfDuplicateExists = (arr: MultisigParticipant[]): boolean => {
        const items = arr.map(i => i.address);
        return new Set(items).size !== items.length ? true : false;
    }

    const isInputMultisigAddress = (address: string) => {
        return props.multisigAddresses.includes(address);
    }

    return (
        <>
        <div className={`flex-fixed-right ${props.disabled ? 'click-disabled' : ''}`}>
            <div className="left">
                {props.label ? (
                    <div className="form-label">{props.label}</div>
                ) : (<div className="form-label">&nbsp;</div>)}
            </div>
            <div className="right">
                <span className={`flat-button change-button ${props.participants.length === 10 ? 'disabled' : ''}`} onClick={() => addParticipant()}>
                    <PlusOutlined />
                    <span className="ml-1">{t('multisig.add-participant-cta')}</span>
                </span>
            </div>
        </div>
        {props.participants && props.participants.length > 0 ? (
            <div id="multisig-participants-max-height" className={`mb-3 ${props.participants.length > 2 ? 'vertical-scroll pr-2' : ''}`}>
                {props.participants.map((participant: MultisigParticipant, index: number) => {
                    return (
                        <div className={`well-group ${props.disabled ? 'disabled' : ''}`} key={`${index}`}>
                            <TextInput
                                placeholder="Enter participant name or description"
                                extraClass="mb-1 small"
                                id={`participant-name-${index + 1}`}
                                value={participant.name}
                                allowClear={false}
                                onInputChange={(e: any) => {
                                    const value = e.target.value;
                                    setSingleItemName(value, index);
                                }}
                            />
                            <TextInput
                                placeholder="Type or paste the address of multisig participant"
                                extraClass="mb-0 small"
                                id={`participant-address-${index + 1}`}
                                value={participant.address}
                                allowClear={true}
                                alwaysShowClear={true}
                                error={
                                    isValidAddress(participant.address)
                                        ? isInputMultisigAddress(participant.address)
                                            ? t('multisig.create-multisig.multisig-address-used-as-participant')
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
                    );
                })}
                {checkIfDuplicateExists(props.participants) ? (
                    <span className="form-field-error pl-2">{t('multisig.create-multisig.multisig-duplicate-participants')}</span>
                ) : props.participants.length === 10 ? (
                    <span className="form-field-hint pl-1">{t('multisig.create-multisig.multisig-threshold-input-max-warn')}</span>
                ) : null}
            </div>
        ) : (
            <div className="inner-label pl-1">{t('multisig.create-multisig.multisig-no-participants')}</div>
        )}
        </>
    );
}
