import { Select } from 'antd';
import type { SelectOption } from 'models/common-types';

interface Props {
  onChange?: (value: string) => void;
  className?: string;
  defaultValue?: string;
  placeholder?: string;
  value?: string | SelectOption;
  values?: SelectOption[];
  labelInValue?: boolean;
}

export const SelectMean = ({ onChange, className, placeholder, defaultValue, value, values, labelInValue }: Props) => {
  const { Option } = Select;

  return (
    <>
      <div className={`well ${className}`} style={{ height: 50 }}>
        <Select
          defaultValue={defaultValue}
          placeholder={placeholder}
          placement='bottomRight'
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
          variant='borderless'
          suffixIcon={null}
          value={typeof value === 'string' ? value : value?.value}
          labelInValue={labelInValue}
          onChange={onChange}
        >
          {values?.map(item => (
            <Option
              value={typeof item === 'string' ? item : item.value}
              key={typeof item === 'string' ? item : item.key}
            >
              {typeof item === 'string' ? item : item.label}
            </Option>
          ))}
        </Select>
      </div>
    </>
  );
};
