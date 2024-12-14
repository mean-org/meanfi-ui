import { Component } from 'react';
import { customLogger } from 'src/main';

interface Props {
  children: React.ReactNode;
  onError?: (error: Error) => void;
}

class ErrorBoundary extends Component<Props> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: unknown) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown) {
    if (!error) return;
    const { onError } = this.props;
    if (onError) onError(error as Error);
    // Log the error to an error reporting service
    customLogger.logError('ErrorBoundary', error);
  }

  render() {
    return this.props.children;
  }
}

export default ErrorBoundary;
