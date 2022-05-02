import { Select } from "antd";

export const SelectMean = (props: {
  className?: string;
  defaultValue?: string;
  onChange?: any;
  values?: any;
}) => {
  const { className, defaultValue, onChange, values } = props;

  const { Option } = Select;

  return (
    <>
      <div className={`well ${className}`} style={{ height: 50 }}>
        <Select 
          defaultValue={defaultValue}
          placement="bottomRight"
          style={{ width: "100%", height: "100%", display: "flex", justifyContent: "space-between", alignItems: "center"}}
          bordered={false}
          onChange={onChange}>
            {values.map((value: string) => (
              <Option value={value} key={value}>{value}</Option>
            ))}
        </Select>
      </div>
    </>
  )
}