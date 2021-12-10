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
        <>
        {props.label && (
            <div className="form-label">{props.label}</div>
        )}
        <div className="well">
            <div className="flex-fixed-right">
                <div className="left">
                    <input
                        id={props.id || 'token-search-input'}
                        className="w-100 general-text-input"
                        autoComplete="on"
                        autoCorrect="off"
                        type="text"
                        onChange={props.onInputChange}
                        placeholder={props.placeholder}
                        spellCheck="false"
                        value={props.value}
                    />
                </div>
            </div>
            {props.hint && (
                <div className="form-field-hint">{props.hint}</div>
            )}
        </div>
        </>
    );

};
