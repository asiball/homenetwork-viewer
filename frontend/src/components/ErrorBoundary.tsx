import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /**
   * When this value changes, a caught error is cleared and the children are
   * re-rendered. Pass the current route (e.g. location.pathname) so navigating
   * away from a broken view recovers without a full page reload (#166).
   */
  resetKey?: string | number;
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

  public componentDidUpdate(prevProps: Props) {
    // Recover automatically when the caller signals a context change (a route
    // navigation), so one broken view doesn't wedge the whole app behind a
    // reload.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.reset();
    }
  }

  private reset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="center-screen">
          <div className="big">HOMENET / NOC</div>
          <div>アプリケーションエラーが発生しました</div>
          <div style={{ color: "var(--err)", margin: "10px 0" }}>
            {this.state.error?.message || "Unknown Error"}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="f-btn" onClick={this.reset}>
              再試行
            </button>
            <button className="f-btn ghost" onClick={() => window.location.reload()}>
              再読み込み
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
