import { AnalyticsBrowser } from "@segment/analytics-next";
import { Layout } from "antd";
import { useEffect, useState } from "react";
import { PageLoadingView } from "views";
import { appConfig } from ".";
import "./App.scss";
import { SegmentAnalyticsService } from "./middleware/segment-service";
import { isLocal } from "./middleware/ui";
import { useLocalStorageState } from "./middleware/utils";
import { AppRoutes } from "./routes";
import { refreshCachedRpc } from "./services/connections-hq";

const { Content } = Layout;
export const segmentAnalytics = new SegmentAnalyticsService();

function App() {
  const [theme, updateTheme] = useLocalStorageState("theme");
  const [loadingStatus, setLoadingStatus] = useState<string>("loading");
  const [writeKey, setWriteKey] = useState("");

  useEffect(() => {
    if (!writeKey) {
      setWriteKey(appConfig.getConfig().segmentAnalyticsKey);
      return;
    }
    const loadAnalytics = async () => {
      const [response] = await AnalyticsBrowser.load({ writeKey });
      segmentAnalytics.analytics = response;
    };

    // Load Segment Analytics only for PROD and DEV
    if (!isLocal()) {
      loadAnalytics();
    }

    // loadAnalytics();
  }, [writeKey]);

  // Use the preferred theme or dark as a default
  useEffect(() => {
    const applyTheme = (name?: string) => {
      const theme = name || "dark";
      document.documentElement.setAttribute("data-theme", theme);
      updateTheme(theme);
    };

    applyTheme(theme);
    return () => { };
  }, [theme, updateTheme]);

  // Fire only once
  useEffect(() => {
    refreshCachedRpc().then(() => setLoadingStatus("finished"));
    return () => { };
  }, []);

  const loader = (
    <>
      <Layout>
        <Content className="flex-center">
          <PageLoadingView addWrapper={false} />
        </Content>
      </Layout>
    </>
  );

  if (loadingStatus === "loading") {
    return loader;
  } else {
    return <AppRoutes />;
  }
}

export default App;
