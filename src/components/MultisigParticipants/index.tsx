import { PlusOutlined } from "@ant-design/icons";
import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
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
                            key={`${index}`}
                            onInputClear={() => onRemoveSingleItem(index)}
                            onInputChange={(e: any) => {
                                const value = e.target.value;
                                setSingleItem(value, index);
                            }}
                        />
                    );
                })}
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
