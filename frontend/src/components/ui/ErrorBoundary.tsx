import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** スコープ限定エラー時のコンパクトな表示。例: マップタブだけ落ちても全体は維持 */
  scope?: 'inline' | 'page';
  /** カスタム fallback を渡すと優先 */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  reset = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      if (this.props.scope === 'inline') {
        return (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center gap-3">
            <p className="text-gray-700 text-sm font-medium">読み込みに失敗しました</p>
            <button
              onClick={this.reset}
              className="bg-orange-500 text-white text-sm px-5 py-2 rounded-full font-medium hover:bg-orange-600 transition-colors"
            >
              もう一度試す
            </button>
          </div>
        );
      }
      return (
        <div className="min-h-svh flex flex-col items-center justify-center bg-gray-50 px-4 text-center gap-4">
          <p className="text-gray-700 text-base font-medium">
            エラーが発生しました。再読み込みしてください。
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-orange-500 text-white text-sm px-6 py-2.5 rounded-xl font-medium hover:bg-orange-600 transition-colors"
          >
            再読み込み
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
