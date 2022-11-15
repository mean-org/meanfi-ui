import { CloseCircleOutlined } from '@ant-design/icons';

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
  maxLength?: number;
  onInputClear?: any;
}) => {
  const {
    id,
    label,
    hint,
    value,
    extraClass,
    placeholder,
    onInputChange,
    allowClear,
    alwaysShowClear,
    error,
    maxLength,
    onInputClear,
  } = props;

  return (
    <>
      {label && <div className="form-label">{label}</div>}
      <div className={`well ${extraClass || ''}`}>
        <div className="flex-fixed-right">
          <div className="left">
            <input
              id={id}
              className="w-100 general-text-input"
              autoComplete="on"
              autoCorrect="off"
              type="text"
              maxLength={maxLength}
              onChange={onInputChange}
              placeholder={placeholder}
              spellCheck="false"
              value={value}
            />
          </div>
          {(alwaysShowClear || (allowClear && value)) && (
            <div className="rigth">
              <div className="add-on h-100 simplelink" onClick={onInputClear}>
                <CloseCircleOutlined />
              </div>
            </div>
          )}
        </div>
        {hint && <div className="form-field-hint">{hint}</div>}
        {error && <span className="form-field-error">{error}</span>}
      </div>
    </>
  );
};
