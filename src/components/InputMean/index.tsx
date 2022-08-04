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
}) => {
  const { id, name, className, autoComplete, autoCorrect, type, maxLength, placeholder, onChange, value, pattern, min } = props;

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
            />
          </div>
        </div>
      </div>
    </>
  )
}