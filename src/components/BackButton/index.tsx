import React from 'react';
import { Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useContext } from 'react';
import { AppStateContext } from '../../contexts/appstate';

export const BackButton = () => {
  const { detailsPanelOpen, setDtailsPanelOpen } = useContext(AppStateContext);

  if (detailsPanelOpen) {
    return (
      <Button
        id="back-button"
        type="default"
        shape="circle"
        icon={<ArrowLeftOutlined />}
        onClick={() => setDtailsPanelOpen(false)}/>
    );
  }

  return null;
};
