import React from "react";
import { Button, Dropdown, Menu } from "antd";
import { EllipsisOutlined } from "@ant-design/icons";
import { IconBookOpen, IconChat, IconCodeBlock, IconInfoCircle, IconMoon, IconSettings, IconUniversity } from "../../Icons";

export const AppContextMenu = () => {

  const menu = (
    <Menu>
      <Menu.Item key="10">
        <a href="https://www.someplace.com">
          <IconMoon className="mean-svg-icons" />
          <span className="menu-item-text">Switch to Dark Mode</span>
        </a>
      </Menu.Item>
      <Menu.Item key="11">
        <a href="https://www.someplace.com">
          <IconSettings className="mean-svg-icons" />
          <span className="menu-item-text">Language: English</span>
        </a>
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item key="12">
        <a href="https://www.someplace.com">
          <IconInfoCircle className="mean-svg-icons" />
          <span className="menu-item-text">About</span>
        </a>
      </Menu.Item>
      <Menu.Item key="13">
        <a href="https://www.someplace.com">
          <IconUniversity className="mean-svg-icons" />
          <span className="menu-item-text">How to use</span>
        </a>
      </Menu.Item>
      <Menu.Item key="14">
        <a href="https://www.someplace.com">
          <IconBookOpen className="mean-svg-icons" />
          <span className="menu-item-text">Developers</span>
        </a>
      </Menu.Item>
      <Menu.Item key="15">
        <a href="https://www.someplace.com">
          <IconCodeBlock className="mean-svg-icons" />
          <span className="menu-item-text">Code</span>
        </a>
      </Menu.Item>
      <Menu.Item key="16">
        <a href="https://www.someplace.com">
          <IconChat className="mean-svg-icons" />
          <span className="menu-item-text">Discord</span>
        </a>
      </Menu.Item>
    </Menu>
  );

  return (
    <Dropdown overlay={menu} trigger={['click']}>
    <Button
        shape="round"
        type="text"
        size="middle"
        className="ant-btn-shaded"
        onClick={e => e.preventDefault()}
        icon={<EllipsisOutlined/>}>
    </Button>
    </Dropdown>
  );
};
