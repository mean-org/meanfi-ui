import { useCallback, useContext, useEffect } from "react";
import "./style.scss";
import { AppStateContext } from "../../contexts/appstate";
import { tabNameFormat } from "../../utils/utils";
import { useSearchParams } from "react-router-dom";

export const TabsMean = (props: {
  containerClassName?: string;
  headerClassName?: string;
  bodyClassName?: string;
  tabs: any;
  selectedTab?: any;
  defaultTab: string;
}) => {
  const {
    activeTab,
    setActiveTab,
  } = useContext(AppStateContext);
  const { containerClassName, headerClassName, bodyClassName, tabs, defaultTab } = props;

  const [searchParams, setSearchParams] = useSearchParams();

  const navigateToTab = useCallback((tab: string) => {
    setSearchParams({v: tab as string});
  }, [setSearchParams]);

  // useEffect(() => {
  //   if (activeTab === '') {
  //     setActiveTab((selectedTab && tabNameFormat(tabs[selectedTab].id)) || tabNameFormat(tabs[0].id));
  //   }
  // }, [activeTab, selectedTab, setActiveTab, tabs]);

  useEffect(() => {
    let optionInQuery: string | null = null;
    // Get the option if passed-in
    if (searchParams) {
      optionInQuery = searchParams.get('v');
    }
    // Pre-select an option
    switch (optionInQuery) {
      case "proposals":
        setActiveTab("proposals");
        break;
      case "programs":
        setActiveTab("programs");
        break;
      case "instruction":
        setActiveTab("instruction");
        break;
      case "activity":
        setActiveTab("activity");
        break;
      case "transactions":
        setActiveTab("transactions");
        break;
      case "anchor-idl":
        setActiveTab("anchor-idl");
        break;
      // case "summary":
      //   setActiveTab("summary");
      //   break;
      // case "accounts":
      //   setActiveTab("accounts");
      //   break;
      default:
        setActiveTab(defaultTab);
        setSearchParams({v: defaultTab}, { replace: true });
        break;
    }
  }, [defaultTab, searchParams, setActiveTab, setSearchParams]);

  return (
    <div className={`tabs-container ${containerClassName}`}>
      <div className={headerClassName}>
        <ul className="tabs ant-menu-overflow ant-menu-horizontal">
          {tabs.map((tab: any) => {
            const onSelectTab = () => {
              setActiveTab(tabNameFormat(tab.id));
              navigateToTab(tabNameFormat(tab.id));
            };

            return (
              <li 
                key={tab.id}
                className={`ant-menu-item ${activeTab === tabNameFormat(tab.id) ? "active ant-menu-item-selected" : ""}`}
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
            {activeTab === tabNameFormat(tab.id) && tab.render}
          </div>
        ))}
      </div>
    </div>
  )
}