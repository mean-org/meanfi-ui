import { IconCheckCircle, IconWarningCover } from "../../Icons";

export const InputMean = (props: {
  id: string;
  name?: string;
  className?: string;
  autoComplete?: string;
  autoCorrect?: string;
  type?: string;
  maxLength?: number;
  placeholder?: string;
  onChange?: any;
  value?: any;
  pattern?: string;
  min?: number;
  validationIcons?: boolean;
  isValid?: boolean;
  isTouched?: boolean;
  onBlur?: any;
}) => {
  const { id, name, className, autoComplete, autoCorrect, type, maxLength, placeholder, onChange, value, pattern, min, validationIcons, isTouched, isValid, onBlur } = props;

  const renderValidity = () => {
    if (isTouched) {
      if (isValid) {
        return (<IconCheckCircle className="mean-svg-icons simplelink form-check-icon fg-green"/>);
      } else {
        return (<IconWarningCover className="mean-svg-icons simplelink form-warning-icon fg-warning"/>);
      }
    } else if (isValid) {
      return (<IconCheckCircle className="mean-svg-icons simplelink form-check-icon fg-green"/>);
    } else {
      return  null;
    }
  }

  return (
    <>
      <div className={`well ${className}`}>
        <div className="flex-fixed-right">
          <div className="left">
            <input
              id={id}
              name={name}
              className="w-100 general-text-input"
              autoComplete={autoComplete || "off"}
              autoCorrect={autoCorrect || "off"}
              type={type || "text"}
              maxLength={maxLength || 32}
              onChange={onChange}
              placeholder={placeholder}
              value={value}
              pattern={pattern}
              min={min}
              onBlur={onBlur}
            />
          </div>
          {validationIcons && (
            <div className="right">
              <div className="add-on h-100">
                {renderValidity()}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
