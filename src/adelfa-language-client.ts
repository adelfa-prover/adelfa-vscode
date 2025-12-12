import { parse } from 'path';
import {
  Position,
  window,
  workspace,
  type TextEditorSelectionChangeEvent,
  type TextDocumentChangeEvent,
  type Disposable,
  type TextEditor,
  type OutputChannel,
} from 'vscode';
import { AdelfaState } from './models/adelfa-state';
import { AdelfaProcessManager } from './services/adelfa-process-manager';
import { CommandParser } from './services/command-parser';
import { CommandExecutor } from './services/command-executor';
import { DecorationManager } from './services/decoration-manager';
import { InfoWebviewProvider } from './ui/info-webview-provider';
import { AdelfaConfig } from './config/adelfa-config';
import { maxPosition } from './util/position';
import { Debouncer } from './util/debounce';
import './util/array';
import type { Command } from './models/types';

export class AdelfaLanguageClient {
  private state: AdelfaState;
  private processManager: AdelfaProcessManager;
  private commandParser: CommandParser;
  private commandExecutor: CommandExecutor;
  private decorationManager: DecorationManager;
  private infoProvider: InfoWebviewProvider;
  private cursorDebouncer: Debouncer;
  private textChangeDebouncer: Debouncer;
  private disposables: Disposable[] = [];
  private isProcessingUpdate = false;
  private activeTextEditor: TextEditor | undefined;
  private outputChannel: OutputChannel;

  constructor(grammar: string) {
    this.state = new AdelfaState();
    this.outputChannel = window.createOutputChannel('Adelfa');
    this.processManager = new AdelfaProcessManager(AdelfaConfig.adelfaPath, this.outputChannel);
    this.commandParser = new CommandParser();
    this.commandExecutor = new CommandExecutor(this.processManager, this.state);
    this.decorationManager = new DecorationManager();
    this.infoProvider = new InfoWebviewProvider(grammar, AdelfaConfig.shikiTheme);

    this.cursorDebouncer = new Debouncer(100); // 100ms delay for cursor movements
    this.textChangeDebouncer = new Debouncer(300); // 300ms delay for text changes

    this.disposables.push(workspace.onDidChangeTextDocument(this.handleTextChange.bind(this)));

    if (window.activeTextEditor?.document.languageId === 'adelfa') {
      this.loadNewFile();
    }
  }

  async dispose(): Promise<void> {
    this.cursorDebouncer.cancel();
    this.textChangeDebouncer.cancel();
    this.commandExecutor.clearQueue();
    await this.processManager.stop();
    this.decorationManager.dispose();
    this.infoProvider.dispose();
    this.state.reset();
    this.outputChannel.dispose();
    this.disposables.forEach(d => {
      d.dispose();
    });
  }

  async loadNewFile(): Promise<void> {
    const editor = window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'adelfa') {
      return;
    }
    if (this.activeTextEditor === editor) {
      return;
    }

    this.state.reset();
    await this.processManager.stop();

    this.decorationManager.clearOverviewDecorations(editor);

    this.infoProvider.update({ message: 'Loading file' });

    const filePath = parse(editor.document.fileName);
    this.state.setFilePath(filePath);

    try {
      await this.processManager.start(filePath);

      this.state.setFileContent(editor.document.getText());

      if (AdelfaConfig.autoOpen) {
        this.infoProvider.openPanel();
        this.showInfoAtPosition(window.activeTextEditor!.selection.active);
      }

      await this.updateFile();
      this.showInfoAtPosition(editor.selection.active);
      this.activeTextEditor = editor;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.infoProvider.update({ message: `Error: ${errorMessage}` });
      window.showErrorMessage(`Failed to start Adelfa: ${errorMessage}`);
      this.activeTextEditor = editor;
    }
  }

  updateInfoView(event: TextEditorSelectionChangeEvent): void {
    // Only listen to changes in the adelfa editor
    if (event.textEditor.document.languageId !== 'adelfa') {
      return;
    }

    const debouncedUpdate = this.cursorDebouncer.debounce(async () => {
      if (!this.isProcessingUpdate) {
        this.isProcessingUpdate = true;
        try {
          await this.updateFile();
          const selection = event.selections[event.selections.length - 1];
          this.showInfoAtPosition(selection!.active);
        } finally {
          this.isProcessingUpdate = false;
        }
      }
    });

    debouncedUpdate();
  }

  private handleTextChange(event: TextDocumentChangeEvent): void {
    if (
      event.document.languageId !== 'adelfa' ||
      event.document !== window.activeTextEditor?.document
    ) {
      return;
    }

    const debouncedUpdate = this.textChangeDebouncer.debounce(async () => {
      if (!this.isProcessingUpdate) {
        this.isProcessingUpdate = true;
        try {
          // Find the earliest change position
          let earliestChangePosition = new Position(event.document.lineCount, 0);
          for (const change of event.contentChanges) {
            if (change.range.start.isBefore(earliestChangePosition)) {
              earliestChangePosition = change.range.start;
            }
          }

          await this.undoCommandsUntilPosition(earliestChangePosition);
          this.state.setFileContent(event.document.getText());

          await this.updateFile();
        } finally {
          this.isProcessingUpdate = false;
        }
      }
    });

    debouncedUpdate();
  }

  showOutput(): void {
    if (!this.processManager.isRunning()) {
      window.showErrorMessage('Adelfa is not running');
      return;
    }
    this.infoProvider.openPanel();
  }

  private async updateFile(): Promise<void> {
    const editor = window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'adelfa') {
      return;
    }

    const newCommands = this.commandParser.getCommandsInRange(
      editor.document,
      new Position(0, 0),
      this.getEndCursorPosition(),
    );

    const commandsToFill = newCommands.filter(c =>
      c.range.start.isAfterOrEqual(this.state.evaluatedRange.end),
    );

    await this.executeCommands(commandsToFill);
    this.decorationManager.updateEvaluatedRange(editor, this.state.evaluatedRange);

    const lineStatuses = this.state.getLineProcessingStatuses();
    this.decorationManager.updateGutterDecorations(editor, lineStatuses);
  }

  private async executeCommands(commands: Command[]): Promise<void> {
    const editor = window.activeTextEditor;

    if (this.state.errorInfo === undefined) {
      this.decorationManager.clearError(editor);
    }

    try {
      await this.commandExecutor.executeCommands(commands);
    } catch {
      if (this.state.errorInfo) {
        this.decorationManager.showError(editor, this.state.errorInfo.range);
      }
    }
  }

  private async undoCommandsUntilPosition(position: Position): Promise<void> {
    if (this.state.errorInfo?.range.end.isAfterOrEqual(position)) {
      this.state.setErrorInfo(undefined);
    }

    await this.commandExecutor.undoCommandsAfterPosition(position);

    const editor = window.activeTextEditor;
    if (editor) {
      const lineStatuses = this.state.getLineProcessingStatuses();
      this.decorationManager.updateGutterDecorations(editor, lineStatuses);
      this.decorationManager.updateEvaluatedRange(editor, this.state.evaluatedRange);
    }
  }

  private showInfoAtPosition(position: Position): void {
    // If there is some error before `position`, we show the error instead.
    if (this.state.errorInfo?.range.start.isBeforeOrEqual(position)) {
      const commandCount = this.state.commands.length;
      const code = [
        // If we have a command before the input, it's useful to include its
        // output before the error message so the user knows how to go about
        // fixing it with the last valid state.
        ...(commandCount > 0 ? [this.state.commands[commandCount - 1]?.output] : []),
        `>> ${this.state.errorInfo.command}`,
        this.state.errorInfo.message,
      ]
        .filter(Boolean)
        .join('\n\n');

      this.infoProvider.update({
        code,
      });
      return;
    }

    const command = this.state.getLastCommandBeforePosition(position);
    if (command) {
      this.infoProvider.update({
        code: `>> ${command.command}\n\n${command.output}`,
      });
    } else {
      this.infoProvider.update({ message: 'No command found' });
    }
  }

  private getEndCursorPosition(): Position {
    const editor = window.activeTextEditor!;
    return maxPosition(editor.selection.active, editor.selection.anchor);
  }

  /**
   * Get the current webview content, only for testing purposes
   */
  getWebviewContent(): string | null {
    return this.infoProvider.getCurrentContent();
  }

  /**
   * Check if the webview panel is currently open
   */
  isWebviewOpen(): boolean {
    return this.infoProvider.isPanelOpen();
  }

  /**
   * Check if the extension is currently processing commands
   */
  isProcessing(): boolean {
    return this.isProcessingUpdate || this.commandExecutor.isProcessing();
  }
}
