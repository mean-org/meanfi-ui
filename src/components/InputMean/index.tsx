import type { FocusEvent } from 'react';
import { IconCheckCircle, IconWarningCover } from '../../Icons';

interface Props {
  onChange: (value: string) => void;
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
  id: string;
  name?: string;
  className?: string;
  autoComplete?: string;
  autoCorrect?: string;
  type?: string;
  maxLength?: number;
  placeholder?: string;
  value?: string | number;
  pattern?: string;
  min?: number;
  validationIcons?: boolean;
  isValid?: boolean;
  isTouched?: boolean;
}

export const InputMean = ({
  id,
  name,
  className,
  autoComplete,
  autoCorrect,
  type,
  maxLength,
  placeholder,
  onChange,
  value,
  pattern,
  min,
  validationIcons,
  isTouched,
  isValid,
  onBlur,
}: Props) => {
  const renderValidity = () => {
    if (isTouched) {
      if (isValid) {
        return <IconCheckCircle className='mean-svg-icons simplelink form-check-icon fg-green' />;
      }

      return <IconWarningCover className='mean-svg-icons simplelink form-warning-icon fg-warning' />;
    }
    if (isValid) {
      return <IconCheckCircle className='mean-svg-icons simplelink form-check-icon fg-green' />;
    }

    return null;
  };

  return (
    <>
      <div className={`well ${className}`}>
        <div className='flex-fixed-right'>
          <div className='left'>
            <input
              id={id}
              name={name}
              className='w-100 general-text-input'
              autoComplete={autoComplete || 'off'}
              autoCorrect={autoCorrect || 'off'}
              type={type || 'text'}
              maxLength={maxLength || 32}
              onChange={e => onChange(e.target.value)}
              placeholder={placeholder}
              value={value}
              pattern={pattern}
              min={min}
              onBlur={onBlur}
            />
          </div>
          {validationIcons && (
            <div className='right'>
              <div className='add-on h-100'>{renderValidity()}</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
