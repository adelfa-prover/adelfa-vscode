import { commands, ViewColumn, window, type Disposable, type WebviewPanel } from 'vscode';
import { ReplaySubject, type Subscription } from 'rxjs';
import { WebviewContent } from './webview-content';

interface WebviewMessage {
  command: string;
}

interface InfoMessage {
  code?: string;
  message?: string;
}

export class InfoWebviewProvider implements Disposable {
  private panel: WebviewPanel | undefined;
  private webviewContent: WebviewContent;
  private message$ = new ReplaySubject<InfoMessage>(1);
  private messageSubscription: Subscription | undefined;

  constructor(grammar: string, theme: string) {
    this.webviewContent = new WebviewContent(grammar, theme);
  }

  openPanel(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = window.createWebviewPanel(
      'adelfa',
      'Adelfa',
      { viewColumn: ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    this.panel.webview.html = this.webviewContent.getHtml();

    this.panel.webview.onDidReceiveMessage((message: WebviewMessage) => {
      if (message.command === 'ready') {
        this.messageSubscription?.unsubscribe();
        this.messageSubscription = this.message$.subscribe(msg => {
          this.panel?.webview.postMessage(msg);
        });
      } else if (message.command === 'restart') {
        commands.executeCommand('adelfa.restart');
      }
    });

    this.panel.onDidDispose(() => {
      this.messageSubscription?.unsubscribe();
      this.messageSubscription = undefined;
      this.panel = undefined;
    });
  }

  update(message: InfoMessage): boolean {
    this.message$.next(message);
    return this.panel !== undefined;
  }

  getCurrentContent(): string | null {
    let result: string | null = null;
    const sub = this.message$.subscribe(msg => {
      if (msg.message) {
        result = msg.message;
      } else if (msg.code) {
        result = msg.code;
      }
    });
    sub.unsubscribe();
    return result;
  }

  isPanelOpen(): boolean {
    return this.panel !== undefined;
  }

  isOpen(): boolean {
    return this.panel?.visible ?? false;
  }

  dispose(): void {
    this.messageSubscription?.unsubscribe();
    this.message$.complete();
    this.panel?.dispose();
    this.panel = undefined;
  }
}
