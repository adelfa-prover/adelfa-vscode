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
import { EventCoordinator } from './state/event-coordinator';
import './util/array';
import type { Command } from './models/types';

export class AdelfaLanguageClient {
  private state: AdelfaState;
  private processManager: AdelfaProcessManager;
  private commandParser: CommandParser;
  private commandExecutor: CommandExecutor;
  private decorationManager: DecorationManager;
  private infoProvider: InfoWebviewProvider;
  private eventCoordinator: EventCoordinator;
  private disposables: Disposable[] = [];
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

    this.eventCoordinator = new EventCoordinator({
      onCursor: async (event: TextEditorSelectionChangeEvent) => {
        await this.updateFile();
        const selection = event.selections[event.selections.length - 1];
        this.showInfoAtPosition(selection!.active);
      },
      onTextChange: async (event: TextDocumentChangeEvent, earliestChangePosition: Position) => {
        await this.undoCommandsUntilPosition(earliestChangePosition);
        this.state.setFileContent(event.document.getText());
        await this.updateFile();
      },
    });

    this.disposables.push(workspace.onDidChangeTextDocument(this.handleTextChange.bind(this)));

    if (window.activeTextEditor?.document.languageId === 'adelfa') {
      this.loadNewFile();
    }
  }

  async dispose(): Promise<void> {
    this.commandExecutor.clearQueue();
    this.eventCoordinator.dispose();
    await this.processManager.stop();
    this.decorationManager.dispose();
    this.infoProvider.dispose();
    this.state.dispose();
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

    this.commandExecutor.clearQueue();
    this.state.reset();
    await this.processManager.stop();

    this.decorationManager.clearOverviewDecorations(editor);

    this.infoProvider.update({ message: 'Loading file' });

    const filePath = parse(editor.document.fileName);
    this.state.setFilePath(filePath);

    try {
      await this.processManager.start(filePath);

      this.state.setFileContent(editor.document.getText());

      if (AdelfaConfig.autoOpen && !this.infoProvider.isOpen()) {
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
    if (event.textEditor.document.languageId !== 'adelfa') {
      return;
    }

    const selection = event.selections[event.selections.length - 1];
    const cursorPos = selection!.active;

    // Immediately show info for the current cursor position (no debounce)
    this.showInfoAtPosition(cursorPos);

    // Only debounce evaluation when cursor moves past evaluated commands
    if (cursorPos.isAfterOrEqual(this.state.evaluatedRange.end)) {
      this.eventCoordinator.emitCursorChange(event);
    }
  }

  private handleTextChange(event: TextDocumentChangeEvent): void {
    if (
      event.document.languageId !== 'adelfa' ||
      event.document !== window.activeTextEditor?.document
    ) {
      return;
    }

    let earliestChangePosition = new Position(event.document.lineCount, 0);
    event.contentChanges.forEach(change => {
      if (change.range.start.isBefore(earliestChangePosition)) {
        earliestChangePosition = change.range.start;
      }
    });

    this.eventCoordinator.emitTextChange(event, earliestChangePosition);
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
    await this.commandExecutor.undoCommandsAfterPosition(position);

    if (this.state.errorInfo?.range.end.isAfterOrEqual(position)) {
      this.state.setErrorInfo(undefined);
    }

    const editor = window.activeTextEditor;
    if (editor) {
      const lineStatuses = this.state.getLineProcessingStatuses();
      this.decorationManager.updateGutterDecorations(editor, lineStatuses);
      this.decorationManager.updateEvaluatedRange(editor, this.state.evaluatedRange);
    }
  }

  private showInfoAtPosition(position: Position): void {
    if (this.state.errorInfo?.range.start.isBeforeOrEqual(position)) {
      const commandCount = this.state.commands.length;
      const code = [
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
    const editor = window.activeTextEditor;
    if (!editor) {
      return new Position(0, 0);
    }
    return maxPosition(editor.selection.active, editor.selection.anchor);
  }

  getWebviewContent(): string | null {
    return this.infoProvider.getCurrentContent();
  }

  isWebviewOpen(): boolean {
    return this.infoProvider.isPanelOpen();
  }

  isProcessing(): boolean {
    return this.eventCoordinator.isProcessing() || this.commandExecutor.isProcessing();
  }
}
