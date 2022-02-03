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

interface SolanaStatusConfig {
  isOnline: boolean;
  responseTime: number;
}

const defaultValues: SolanaStatusConfig = {
  isOnline: false,
  responseTime: 0,
};

const SolanaStatusContext = React.createContext<SolanaStatusConfig>(defaultValues);

export const SolanaStatusProvider: React.FC = ({ children }) => {
  const [onlineStatus, setOnlineStatus] = useState<boolean>(true);
  const [responseTime, setResponseTime] = useState(0);
  const [contextStarted, setContextStarted] = useState(false);

  const checkStatus = async () => {
    const tsStart = new Date().getTime();
    const online = await checkOnlineStatus();
    const tsEnd = new Date().getTime();
    setResponseTime(online ? tsEnd - tsStart : 0);
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
    <SolanaStatusContext.Provider
      value={{
        isOnline: onlineStatus,
        responseTime
      }}>
      {children}
    </SolanaStatusContext.Provider>
  );
};

export const useSolanaStatus = () => {
  const context = useContext(SolanaStatusContext);
  return context;
};

export default useSolanaStatus;
