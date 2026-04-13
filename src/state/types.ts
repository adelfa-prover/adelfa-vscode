import type { ParsedPath } from 'path';
import type { Position, Range } from 'vscode';
import type { CommandWithOutput, ErrorInfo } from '../models/types';

export interface AdelfaStateData {
  readonly commands: ReadonlyArray<CommandWithOutput>;
  readonly filePath: ParsedPath | undefined;
  readonly fileContent: string | undefined;
  readonly errorInfo: ErrorInfo | undefined;
  readonly loading: boolean;
  readonly lastSuccessfulPosition: Position;
}

export type AdelfaAction =
  | { type: 'ADD_COMMAND'; payload: CommandWithOutput }
  | { type: 'REMOVE_LAST_COMMAND' }
  | { type: 'CLEAR_COMMANDS' }
  | { type: 'SET_FILE_PATH'; payload: ParsedPath | undefined }
  | { type: 'SET_FILE_CONTENT'; payload: string | undefined }
  | { type: 'SET_ERROR_INFO'; payload: ErrorInfo | undefined }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'RESET' };

export type LineProcessingStatus = 'fully-processed' | 'partially-processed' | 'error';

export interface SelectorContext {
  fileContent: string | undefined;
  commands: ReadonlyArray<CommandWithOutput>;
  errorInfo: ErrorInfo | undefined;
  evaluatedRange: Range;
}
