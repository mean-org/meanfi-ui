import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button, type ButtonProps } from 'antd';

interface IProps {
  handleClose: ButtonProps['onClick'];
}

export const BackButton = ({ handleClose }: IProps) => {
  return (
    <Button id='back-button' type='default' shape='circle' icon={<ArrowLeftOutlined />} onClick={handleClose} />
  );
};
