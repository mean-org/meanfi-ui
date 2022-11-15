export const InputTextAreaMean = (props: {
  id: string;
  className?: string;
  autoComplete?: string;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  onChange?: any;
  value?: any;
  onPaste?: any;
}) => {
  const {
    id,
    className,
    autoComplete,
    rows,
    maxLength,
    placeholder,
    onChange,
    value,
    onPaste,
  } = props;

  return (
    <>
      <div className={`well mb-0 ${className}`}>
        <textarea
          id={id}
          className="w-100 general-text-input"
          autoComplete={autoComplete || 'off'}
          rows={rows || 5}
          maxLength={maxLength}
          onChange={onChange}
          placeholder={placeholder}
          value={value}
          onPaste={onPaste}
        ></textarea>
      </div>
    </>
  );
};
