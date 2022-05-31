import { useState } from "react";
import "./style.scss";

export const TabsMean = (props: {
  headerClassName?: string;
  bodyClassName?: string;
  tabs: any;
  selectedTab?: any;
}) => {
  const { headerClassName, bodyClassName, tabs, selectedTab } = props;

  const [activeTab, setActiveTab] = useState((selectedTab && tabs[selectedTab].id) || tabs[0].id);

  return (
    <div className="tabs-container">
      <div className={headerClassName}>
        <ul className="tabs ant-menu-overflow ant-menu-horizontal">
          {tabs.map((tab: any) => {
            const onSelectTab = () => {
              setActiveTab(tab.id);
            };

            return (
              <li 
                key={tab.id}
                className={`ant-menu-item ${activeTab === tab.id ? "active ant-menu-item-selected" : ""}`}
                tabIndex={0}
                onClick={onSelectTab}
              >
                <span className="ant-menu-title-content">{tab.name}</span>
              </li>
            )
            })}
        </ul>
      </div>
      <div className={bodyClassName}>
        {tabs.map((tab: any) => (
          <div key={tab.id}>
            {activeTab === tab.id && tab.render}
          </div>
        ))}
      </div>
    </div>
  )
}