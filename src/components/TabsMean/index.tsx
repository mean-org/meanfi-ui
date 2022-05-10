import { useState } from "react";

export const TabsMean = (props: {
  headerClassName?: string;
  bodyClassName?: string;
  tabs?: any;
}) => {
  const { headerClassName, bodyClassName, tabs } = props;

  const [activeTab, setActiveTab] = useState(tabs[0].name);

  const onClickHandler = (event: any) => {
    if (event.target.innerHTML !== activeTab) {
      setActiveTab(event.target.innerHTML);
    }
  };

  return (
    <>
      <div className={headerClassName}>
        <ul className="tabs ant-menu-overflow ant-menu-horizontal">
          {tabs.map((tab: any) => (
            <li 
              key={tab.name}
              className={`ant-menu-item ${activeTab === tab.name ? "active ant-menu-item-selected" : ""}`}
              tabIndex={0}
              onClick={onClickHandler}
            >
              <span className="ant-menu-title-content">{tab.name}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={bodyClassName}>
        {tabs.map((tab: any) => (
          <div key={tab.name}>
            {activeTab === tab.name && tab.render}
          </div>
        ))}
      </div>
    </>
  )
}