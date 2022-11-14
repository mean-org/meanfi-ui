import React from 'react';
import { Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';

export const BackButton = (props: { handleClose: any }) => {

  return (
    <Button
      id="back-button"
      type="default"
      shape="circle"
      icon={<ArrowLeftOutlined />}
      onClick={props.handleClose}/>
  );
};
