import { Position } from 'vscode';
import type { AdelfaStateData, AdelfaAction } from './types';
import { createInitialState } from './initial-state';

export function adelfaReducer(state: AdelfaStateData, action: AdelfaAction): AdelfaStateData {
  switch (action.type) {
    case 'ADD_COMMAND': {
      const newCommands = [...state.commands, action.payload];
      return {
        ...state,
        commands: newCommands,
        lastSuccessfulPosition: action.payload.range.end,
      };
    }

    case 'REMOVE_LAST_COMMAND': {
      if (state.commands.length === 0) {
        return state;
      }
      const newCommands = state.commands.slice(0, -1);
      const lastRemainingCommand = newCommands[newCommands.length - 1];
      const newPosition = lastRemainingCommand
        ? lastRemainingCommand.range.end
        : new Position(0, 0);
      const shouldClearError = state.errorInfo?.range.start.isAfterOrEqual(newPosition);
      return {
        ...state,
        commands: newCommands,
        lastSuccessfulPosition: newPosition,
        errorInfo: shouldClearError ? undefined : state.errorInfo,
      };
    }

    case 'CLEAR_COMMANDS':
      return {
        ...state,
        commands: [],
        lastSuccessfulPosition: new Position(0, 0),
        errorInfo: undefined,
      };

    case 'SET_FILE_PATH':
      return {
        ...state,
        filePath: action.payload,
      };

    case 'SET_FILE_CONTENT':
      return {
        ...state,
        fileContent: action.payload,
      };

    case 'SET_ERROR_INFO':
      return {
        ...state,
        errorInfo: action.payload,
      };

    case 'SET_LOADING':
      return {
        ...state,
        loading: action.payload,
      };

    case 'RESET':
      return createInitialState();

    default:
      return state;
  }
}
