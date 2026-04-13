import { Position } from 'vscode';
import type { AdelfaStateData } from './types';

export function createInitialState(): AdelfaStateData {
  return {
    commands: [],
    filePath: undefined,
    fileContent: undefined,
    errorInfo: undefined,
    loading: false,
    lastSuccessfulPosition: new Position(0, 0),
  };
}
