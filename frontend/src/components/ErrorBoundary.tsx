import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="center-screen">
          <div className="big">HOMENET / NOC</div>
          <div>アプリケーションエラーが発生しました</div>
          <div style={{ color: "var(--err)", margin: "10px 0" }}>
            {this.state.error?.message || "Unknown Error"}
          </div>
          <button className="f-btn" onClick={() => window.location.reload()}>
            再読み込み
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
