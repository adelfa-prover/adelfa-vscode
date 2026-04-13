import { Position, Range, type TextDocument } from 'vscode';
import type { Command } from '../models/types';

export class CommandParser {
  parseCommands(document: TextDocument, range: Range): Command[] {
    const commands: Command[] = [];
    let currentCommand = '';
    let inString = false;
    const startLine = range.start.line;
    let commandStartLine = range.start.line;
    let commandStartChar = range.start.character;

    for (let lineNum = range.start.line; lineNum <= range.end.line; lineNum++) {
      const line = document.lineAt(lineNum);
      const lineText = line.text;
      const startCharForLine = lineNum === range.start.line ? range.start.character : 0;
      const endChar = lineNum === range.end.line ? range.end.character : lineText.length;

      // If we're starting a new line and have a command in progress, add newline
      if (lineNum > startLine && currentCommand.length > 0) {
        currentCommand += '\n';
      }

      for (let charNum = startCharForLine; charNum < endChar; charNum++) {
        const char = lineText[charNum];

        // Skip comments
        if (char === '%' && !inString) {
          break;
        }

        if (char === undefined) {
          continue;
        }

        // Track the start of a new command
        if (currentCommand.trim() === '') {
          commandStartLine = lineNum;
          commandStartChar = charNum;
        }

        currentCommand += char;

        if (char === '"' && (charNum === 0 || lineText[charNum - 1] !== '\\')) {
          inString = !inString;
        }

        // Check for command terminator
        if (!inString && char === '.') {
          const trimmedCommand = currentCommand.trim();
          commands.push({
            range: new Range(
              new Position(commandStartLine, commandStartChar),
              new Position(lineNum, charNum + 1), // Include the dot
            ),
            command: trimmedCommand,
          });

          currentCommand = '';
        }
      }
    }

    return commands;
  }

  getCommandsInRange(document: TextDocument, startPos: Position, endPos: Position): Command[] {
    return this.parseCommands(document, new Range(startPos, endPos));
  }
}
