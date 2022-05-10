export const InputMean = (props: {
  id: string;
  className?: string;
  autoComplete?: string;
  autoCorrect?: string;
  type?: string;
  maxLength?: number;
  placeholder?: string;
  onChange?: any;
  value?: any;
}) => {
  const { id, className, autoComplete, autoCorrect, type, maxLength, placeholder, onChange, value } = props;

  return (
    <>
      <div className={`well ${className}`}>
        <div className="flex-fixed-right">
          <div className="left">
            <input
              id={id}
              className="w-100 general-text-input"
              autoComplete={autoComplete || "off"}
              autoCorrect={autoCorrect || "off"}
              type={type || "text"}
              maxLength={maxLength || 32}
              onChange={onChange}
              placeholder={placeholder}
              value={value}
            />
          </div>
        </div>
      </div>
    </>
  )
}