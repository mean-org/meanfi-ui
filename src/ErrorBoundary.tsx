import React, { Component, ErrorInfo, ReactNode } from "react";
import { customLogger } from ".";

interface Props {
  children: ReactNode;
}

interface State {
    hasError: boolean;
    error: any;
    errorInfo?: any;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    error: '',
    errorInfo: '',
    hasError: false,
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true, error: _ };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary:", error, errorInfo);
    customLogger.logError(`ErrorBoundary: ${error}`, errorInfo);
    this.setState({ errorInfo });
  }

  // public render() {
  //   if (this.state.hasError) {
  //     return <h1>Sorry.. there was an unhandled error</h1>;
  //   }

  //   return this.props.children;
  // }

  public render() {
    return this.props.children;
  }
}

export default ErrorBoundary;
