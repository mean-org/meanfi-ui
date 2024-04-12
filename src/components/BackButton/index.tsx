import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import React from 'react';

export const BackButton = (props: { handleClose: any }) => {
  return (
    <Button id='back-button' type='default' shape='circle' icon={<ArrowLeftOutlined />} onClick={props.handleClose} />
  );
};
