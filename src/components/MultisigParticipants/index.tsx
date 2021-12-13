import { PlusOutlined } from "@ant-design/icons";
import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { isValidAddress } from "../../utils/ui";
import { TextInput } from "../TextInput";

export const MultisigParticipants = (props: {
  participants: string[];
  onParticipantsChanged: any;
}) => {
    const { t } = useTranslation('common');

    const setSingleItem = useCallback((participant: string, index: number) => {
        const items = JSON.parse(JSON.stringify(props.participants));
        items[index] = participant;
        props.onParticipantsChanged(items);
    }, [props]);

    const onRemoveSingleItem = useCallback((index: number) => {
        const items = JSON.parse(JSON.stringify(props.participants)) as string[];
        items.splice(index, 1);
        props.onParticipantsChanged(items);
    }, [props]);

    const addParticipant = useCallback(() => {
        const items = JSON.parse(JSON.stringify(props.participants)) as string[];
        items.push('');
        props.onParticipantsChanged(items);
    }, [props]);

    const checkIfDuplicateExists = (arr: string[]): boolean => {
        return new Set(arr).size !== arr.length ? true : false;
    }

    return (
        <>
        {props.participants && props.participants.length > 0 ? (
            <div className="mb-3">
                {props.participants.map((participant: string, index: number) => {
                    return (
                        <TextInput
                            placeholder="Type or paste the address of multisig participant"
                            extraClass="small"
                            id={`participant-${index + 1}`}
                            value={participant}
                            allowClear={true}
                            alwaysShowClear={true}
                            key={`${index}`}
                            error={isValidAddress(participant) ? '' : t("transactions.validation.valid-address-required")}
                            onInputClear={() => onRemoveSingleItem(index)}
                            onInputChange={(e: any) => {
                                const value = e.target.value;
                                setSingleItem(value, index);
                            }}
                        />
                    );
                })}
                {checkIfDuplicateExists(props.participants) && (
                    <span className="form-field-error pl-2">{t('multisig.create-multisig.multisig-duplicate-participants')}</span>
                )}
            </div>
        ) : (
            <div className="inner-label pl-1">{t('multisig.create-multisig.multisig-no-participants')}</div>
        )}
        <div className="text-right mt-3">
            <span className="flat-button change-button" onClick={() => addParticipant()}>
                <PlusOutlined />
                <span className="ml-1">{t('multisig.add-participant-cta')}</span>
            </span>
        </div>
        </>
    );
}
