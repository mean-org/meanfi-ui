import React from 'react';

export const TextInput = (props: {
    id?: string;
    label?: string;
    hint?: string;
    value: string;
    placeholder: string;
    onInputChange: any;
}) => {

    return (
        <div className="transaction-field">
            {props.label && (
                <div className="transaction-field-row">
                    <span className="field-label-left">{props.label}</span>
                    <span className="field-label-right">&nbsp;</span>
                </div>
            )}
            <div className="transaction-field-row main-row">
                <input
                    id={props.id || 'token-search-input'}
                    className="general-text-input"
                    inputMode="decimal"
                    autoComplete="off"
                    autoCorrect="off"
                    type="text"
                    onChange={props.onInputChange}
                    placeholder={props.placeholder}
                    spellCheck="false"
                    value={props.value} />
            </div>
            {props.hint && (
                <div className="transaction-field-row">
                    <span className="field-label-left">{props.hint}</span>
                    <span className="field-label-right">&nbsp;</span>
                </div>
            )}
        </div>
    );

};
