import React, { useState, useEffect, useContext } from "react";

const PING_RESOURCE = "/ping.txt";
const TIMEOUT_TIME_MS = 3000;
const onlinePollingInterval = 30000;

const timeout = (time: number, promise: Promise<any>) => {
  return new Promise(function(resolve, reject) {
    setTimeout(() => {
      reject(new Error("Request timed out."));
    }, time);
    promise.then(resolve, reject);
  });
};

const checkOnlineStatus = async () => {
  const controller = new AbortController();
  const { signal } = controller;

  // If the browser has no network connection return offline
  if (!navigator.onLine) return navigator.onLine;

  try {
    await timeout(
      TIMEOUT_TIME_MS,
      fetch(PING_RESOURCE, {
        method: "GET",
        signal
      })
    );
    return true;
  } catch (error) {
    // Error Log
    console.error(error);

    // This can be because of request timed out
    // so we abort the request for any case
    controller.abort();
  }
  return false;
};

interface OnlineStatusConfig {
  isOnline: boolean;
  responseTime: number;
}

const defaultValues: OnlineStatusConfig = {
  isOnline: false,
  responseTime: 0,
};

const OnlineStatusContext = React.createContext<OnlineStatusConfig>(defaultValues);

export const OnlineStatusProvider: React.FC = ({ children }) => {
  const [onlineStatus, setOnlineStatus] = useState<boolean>(true);
  const [responseTime, setResponseTime] = useState(0);
  const [contextStarted, setContextStarted] = useState(false);

  const checkStatus = async () => {
    const tsStart = new Date().getTime();
    const online = await checkOnlineStatus();
    const tsEnd = new Date().getTime();
    setResponseTime(tsEnd - tsStart);
    setOnlineStatus(online);
  };

  useEffect(() => {
    window.addEventListener("offline", () => {
      setOnlineStatus(false);
    });

    if (!contextStarted) {
      setContextStarted(true);
      checkStatus();
    }

    // Add polling incase of slow connection
    const id = setInterval(() => {
      checkStatus();
    }, onlinePollingInterval);

    return () => {
      window.removeEventListener("offline", () => {
        setOnlineStatus(false);
      });

      clearInterval(id);
    };
  }, [contextStarted]);

  return (
    <OnlineStatusContext.Provider
      value={{
        isOnline: onlineStatus,
        responseTime
      }}>
      {children}
    </OnlineStatusContext.Provider>
  );
};

export const useOnlineStatus = () => {
  const store = useContext(OnlineStatusContext);
  return store;
};

export default useOnlineStatus;
