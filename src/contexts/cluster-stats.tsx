import React, { useCallback, useContext, useEffect, useReducer, useState } from "react";
import { Connection } from "@solana/web3.js";
import {
  PerformanceInfo,
  PerformanceInfoActionType,
  performanceInfoReducer,
} from '../utils/solanaPerformanceInfo';
import { useConnection, useConnectionConfig } from "../contexts/connection";

export const SAMPLE_HISTORY_HOURS = 1;
export const PERFORMANCE_SAMPLE_INTERVAL = 60000;
export const LOADING_TIMEOUT = 10000;

export enum ClusterStatsStatus {
  Loading,
  Ready,
  Error,
}

const initialPerformanceInfo: PerformanceInfo = {
  status: ClusterStatsStatus.Loading,
  avgTps: 0,
  historyMaxTps: 0,
  perfHistory: {
    short: [],
    medium: [],
    long: [],
  },
  transactionCount: 0,
};

type SetActive = React.Dispatch<React.SetStateAction<boolean>>;

const StatsProviderContext = React.createContext<
  {
    setActive: SetActive;
    setTimedOut: Function;
    retry: Function;
    active: boolean;
  } | undefined
>(undefined);

type PerformanceState = { info: PerformanceInfo };
const PerformanceContext = React.createContext<PerformanceState | undefined>(
  undefined
);

type Props = { children: React.ReactNode };

export function SolanaClusterStatsProvider({ children }: Props) {
  const connection = useConnection();
  const { endpoint } = useConnectionConfig();
  const [active, setActive] = useState(false);

  const [performanceInfo, dispatchPerformanceInfo] = useReducer(
    performanceInfoReducer,
    initialPerformanceInfo
  );

  useEffect(() => {
    if (!active || !endpoint) return;

    if (!connection) return;

    const getPerformanceSamples = async () => {
      try {
        const samples = await connection.getRecentPerformanceSamples(
          60 * SAMPLE_HISTORY_HOURS
        );

        if (samples.length < 1) {
          // no samples to work with (node has no history).
          return; // we will allow for a timeout instead of throwing an error
        }

        dispatchPerformanceInfo({
          type: PerformanceInfoActionType.SetPerfSamples,
          data: samples,
        });

      } catch (error) {
        console.error(error, { url: endpoint });
        if (error instanceof Error) {
          dispatchPerformanceInfo({
            type: PerformanceInfoActionType.SetError,
            data: error.toString(),
          });
        }
        setActive(false);
      }
    };

    const performanceInterval = setInterval(
      getPerformanceSamples,
      PERFORMANCE_SAMPLE_INTERVAL
    );

    getPerformanceSamples();

    return () => {
      clearInterval(performanceInterval);
    };
  }, [
    active,
    endpoint,
    connection
  ]);

  // Reset when cluster changes
  useEffect(() => {
    return () => {
      resetData();
    };
  }, [endpoint]);

  function resetData() {
    dispatchPerformanceInfo({
      type: PerformanceInfoActionType.Reset,
      data: initialPerformanceInfo,
    });
  }

  const setTimedOut = useCallback(() => {
    dispatchPerformanceInfo({
      type: PerformanceInfoActionType.SetError,
      data: "Cluster stats timed out",
    });
    console.error("Cluster stats timed out");
    setActive(false);
  }, []);

  const retry = useCallback(() => {
    resetData();
    setActive(true);
  }, []);

  return (
    <StatsProviderContext.Provider
      value={{ setActive, setTimedOut, retry, active }}>
      <PerformanceContext.Provider value={{ info: performanceInfo }}>
        {children}
      </PerformanceContext.Provider>
    </StatsProviderContext.Provider>
  );
}

export function useStatsProvider() {
  const context = useContext(StatsProviderContext);
  if (!context) {
    throw new Error(`useContext must be used within a StatsProvider`);
  }
  return context;
}

export function usePerformanceInfo() {
  const context = useContext(PerformanceContext);
  if (!context) {
    throw new Error(`usePerformanceInfo must be used within a StatsProvider`);
  }
  return context.info;
}
