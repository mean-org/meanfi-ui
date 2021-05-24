import { Link } from "react-router-dom";
import { Button, Dropdown, Menu } from "antd";
import { EllipsisOutlined } from "@ant-design/icons";
import {
  IconAdd,
  IconBookOpen,
  IconChat,
  IconCodeBlock,
  IconInfoCircle,
  IconMoon,
  IconSettings,
  IconUniversity,
} from "../../Icons";
import { useConnectionConfig } from "../../contexts/connection";

export const AppContextMenu = () => {
  const connection = useConnectionConfig();

  const menu = (
    <Menu>
      <Menu.Item key="1">
        <a href="https://www.someplace.com">
          <IconMoon className="mean-svg-icons" />
          <span className="menu-item-text">Switch to Dark Mode</span>
        </a>
      </Menu.Item>
      <Menu.Item key="2">
        <a href="https://www.someplace.com">
          <IconSettings className="mean-svg-icons" />
          <span className="menu-item-text">Language: English</span>
        </a>
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item key="3">
        <a href="https://www.someplace.com">
          <IconInfoCircle className="mean-svg-icons" />
          <span className="menu-item-text">About</span>
        </a>
      </Menu.Item>
      <Menu.Item key="4">
        <a href="https://www.someplace.com">
          <IconUniversity className="mean-svg-icons" />
          <span className="menu-item-text">How to use</span>
        </a>
      </Menu.Item>
      <Menu.Item key="5">
        <a href="https://www.someplace.com">
          <IconBookOpen className="mean-svg-icons" />
          <span className="menu-item-text">Developers</span>
        </a>
      </Menu.Item>
      <Menu.Item key="6">
        <a href="https://www.someplace.com">
          <IconCodeBlock className="mean-svg-icons" />
          <span className="menu-item-text">Code</span>
        </a>
      </Menu.Item>
      <Menu.Item key="7">
        <a href="https://www.someplace.com">
          <IconChat className="mean-svg-icons" />
          <span className="menu-item-text">Discord</span>
        </a>
      </Menu.Item>
      {(connection.env === 'devnet' || connection.env === 'testnet') && (
        <Menu.Item key="8">
          <Link to="/faucet">
            <IconAdd className="mean-svg-icons" />
            <span className="menu-item-text">Faucet</span>
          </Link>
        </Menu.Item>
      )}
    </Menu>
  );

  return (
    <Dropdown overlay={menu} trigger={["click"]}>
      <Button
        shape="round"
        type="text"
        size="middle"
        className="ant-btn-shaded"
        onClick={(e) => e.preventDefault()}
        icon={<EllipsisOutlined />}
      ></Button>
    </Dropdown>
  );
};
