// import { useEffect, useState } from "react";

export const InputTextAreaMean = (props: {
  id: string;
  className?: string;
  autoComplete?: string;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  onChange?: any;
  value?: any;
}) => {
  const { id, className, autoComplete, rows, maxLength, placeholder, onChange, value } = props;

  // const [lettersLeft, setLettersLeft] = useState(256);
  // const [countWords, setCountWords] = useState(0);

  // const onChange = (e: any) => {
  //   setValue(e.target.value);
  //   setCountWords(e.target.value.length);
  // }

  // useEffect(() => {
  //   setLettersLeft(256 - countWords);
  // }, [countWords]);

  return (
    <>
      <div className={`well mb-0 ${className}`}>
        <textarea
          id={id}
          className="w-100 general-text-input"
          autoComplete={autoComplete || "off"}
          rows={rows || 5}
          maxLength={maxLength || 256}
          onChange={onChange}
          placeholder={placeholder}
          value={value}
        >
        </textarea>
      </div>
    </>
  )
}