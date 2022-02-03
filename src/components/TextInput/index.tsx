import { CloseCircleOutlined } from '@ant-design/icons';
import React from 'react';

export const TextInput = (props: {
    id?: string;
    label?: string;
    hint?: string;
    value: string;
    extraClass?: string;
    placeholder: string;
    onInputChange: any;
    allowClear?: boolean;
    alwaysShowClear?: boolean;
    error?: string;
    onInputClear?: any;
}) => {

    return (
        <>
        {props.label && (
            <div className="form-label">{props.label}</div>
        )}
        <div className={`well ${props.extraClass || ''}`}>
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
                {(props.alwaysShowClear || (props.allowClear && props.value)) && (
                    <div className="rigth">
                        <div className="add-on h-100 simplelink" onClick={props.onInputClear}>
                            <CloseCircleOutlined />
                        </div>
                    </div>
                )}
            </div>
            {props.hint && (
                <div className="form-field-hint">{props.hint}</div>
            )}
            {props.error && (
                <span className="form-field-error">{props.error}</span>
            )}
        </div>
        </>
    );

};
