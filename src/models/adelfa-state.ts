import type { ParsedPath } from 'path';
import type { Position, Range } from 'vscode';
import type { CommandWithOutput, ErrorInfo } from './types';
import { AdelfaStore } from '../state/store';
import {
  selectEvaluatedRange,
  selectCommandsAfterPosition,
  selectCommandsAfterPositionInclusive,
  selectLastCommandBeforePosition,
  selectLineProcessingStatuses,
} from '../state/selectors';
import type { LineProcessingStatus } from '../state/types';

export class AdelfaState {
  private store: AdelfaStore;

  constructor() {
    this.store = new AdelfaStore();
  }

  get commands(): ReadonlyArray<CommandWithOutput> {
    return this.store.getState().commands;
  }

  get filePath(): ParsedPath | undefined {
    return this.store.getState().filePath;
  }

  get fileContent(): string | undefined {
    return this.store.getState().fileContent;
  }

  get errorInfo(): ErrorInfo | undefined {
    return this.store.getState().errorInfo;
  }

  get loading(): boolean {
    return this.store.getState().loading;
  }

  get evaluatedRange(): Range {
    return selectEvaluatedRange(this.store.getState());
  }

  get lastSuccessfulPosition(): Position {
    return this.store.getState().lastSuccessfulPosition;
  }

  getStore(): AdelfaStore {
    return this.store;
  }

  setFilePath(path: ParsedPath | undefined): void {
    this.store.dispatch({ type: 'SET_FILE_PATH', payload: path });
  }

  setFileContent(content: string | undefined): void {
    this.store.dispatch({ type: 'SET_FILE_CONTENT', payload: content });
  }

  setErrorInfo(error: ErrorInfo | undefined): void {
    this.store.dispatch({ type: 'SET_ERROR_INFO', payload: error });
  }

  setLoading(loading: boolean): void {
    this.store.dispatch({ type: 'SET_LOADING', payload: loading });
  }

  addCommand(command: CommandWithOutput): void {
    this.store.dispatch({ type: 'ADD_COMMAND', payload: command });
  }

  removeLastCommand(): CommandWithOutput | undefined {
    const state = this.store.getState();
    const lastCommand = state.commands[state.commands.length - 1];
    if (!lastCommand) {
      return undefined;
    }
    this.store.dispatch({ type: 'REMOVE_LAST_COMMAND' });
    return lastCommand;
  }

  clearCommands(): void {
    this.store.dispatch({ type: 'CLEAR_COMMANDS' });
  }

  getCommandsAfterPosition(position: Position): CommandWithOutput[] {
    return selectCommandsAfterPosition(this.store.getState(), position);
  }

  getCommandsAfterPositionInclusive(position: Position): CommandWithOutput[] {
    return selectCommandsAfterPositionInclusive(this.store.getState(), position);
  }

  getLastCommandBeforePosition(position: Position): CommandWithOutput | undefined {
    return selectLastCommandBeforePosition(this.store.getState(), position);
  }

  getLineProcessingStatuses(): Map<number, LineProcessingStatus> {
    return selectLineProcessingStatuses(this.store.getState());
  }

  reset(): void {
    this.store.dispatch({ type: 'RESET' });
  }

  dispose(): void {
    this.store.dispose();
  }
}
