import { Position, Range } from 'vscode';
import type { CommandWithOutput } from '../models/types';
import type { AdelfaStateData, LineProcessingStatus } from './types';

export function selectEvaluatedRange(state: AdelfaStateData): Range {
  if (state.commands.length === 0) {
    return new Range(new Position(0, 0), new Position(0, 0));
  }
  const firstCommand = state.commands[0];
  const lastCommand = state.commands[state.commands.length - 1];
  if (!firstCommand || !lastCommand) {
    return new Range(new Position(0, 0), new Position(0, 0));
  }
  return new Range(firstCommand.range.start, lastCommand.range.end);
}

export function selectCommandsAfterPosition(
  state: AdelfaStateData,
  position: Position,
): CommandWithOutput[] {
  return state.commands.filter(c => c.range.start.isAfterOrEqual(position));
}

export function selectCommandsAfterPositionInclusive(
  state: AdelfaStateData,
  position: Position,
): CommandWithOutput[] {
  return state.commands.filter(c => c.range.end.isAfter(position));
}

export function selectLastCommandBeforePosition(
  state: AdelfaStateData,
  position: Position,
): CommandWithOutput | undefined {
  const commands = state.commands.filter(c => c.range.end.isBeforeOrEqual(position));
  return commands.length > 0 ? commands[commands.length - 1] : undefined;
}

export function selectLineProcessingStatuses(
  state: AdelfaStateData,
): Map<number, LineProcessingStatus> {
  const lineStatuses = new Map<number, LineProcessingStatus>();

  if (state.errorInfo) {
    const { line } = state.errorInfo.range.start;
    for (let errLine = line; errLine <= state.errorInfo.range.end.line; errLine++) {
      lineStatuses.set(errLine, 'error');
    }
  }

  if (state.commands.length === 0) return lineStatuses;

  const evaluatedRange = selectEvaluatedRange(state);
  const {
    end: { line: endLine, character: endChar },
  } = evaluatedRange;

  const lines = state.fileContent?.split('\n');
  const maxLine = lines ? Math.min(endLine, lines.length - 1) : endLine;

  for (let line = 0; line <= maxLine; line++) {
    if (lineStatuses.get(line) === 'error') continue;
    if (line === endLine) {
      const finalColumn = lines?.at(line)?.trimEnd().length;
      if (finalColumn && endChar < finalColumn) {
        lineStatuses.set(line, 'partially-processed');
      } else {
        lineStatuses.set(line, 'fully-processed');
      }
    } else if (!lineStatuses.has(line)) {
      lineStatuses.set(line, 'fully-processed');
    }
  }
  return lineStatuses;
}
