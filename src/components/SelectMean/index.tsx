import { Select } from 'antd';

export const SelectMean = (props: {
  className?: string;
  defaultValue?: string;
  placeholder?: string;
  onChange?: any;
  value?: any;
  values?: any;
  labelInValue?: boolean;
}) => {
  const {
    className,
    placeholder,
    defaultValue,
    onChange,
    value,
    values,
    labelInValue,
  } = props;

  const { Option } = Select;

  return (
    <>
      <div className={`well ${className}`} style={{ height: 50 }}>
        <Select
          defaultValue={defaultValue}
          placeholder={placeholder}
          placement="bottomRight"
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
          bordered={false}
          value={value}
          labelInValue={labelInValue}
          onChange={onChange}
        >
          {values.map((item: any) => (
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
