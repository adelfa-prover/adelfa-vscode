import { Subject, merge, type Subscription, from, EMPTY, BehaviorSubject } from 'rxjs';
import { debounceTime, concatMap, map, withLatestFrom, tap, catchError } from 'rxjs/operators';
import type { Position, TextDocumentChangeEvent, TextEditorSelectionChangeEvent } from 'vscode';

export interface CursorEvent {
  type: 'cursor';
  event: TextEditorSelectionChangeEvent;
}

export interface TextChangeEvent {
  type: 'textChange';
  event: TextDocumentChangeEvent;
  earliestChangePosition: Position;
}

export type CoordinatedEvent = CursorEvent | TextChangeEvent;

export interface EventHandlers {
  onCursor: (event: TextEditorSelectionChangeEvent) => Promise<void>;
  onTextChange: (event: TextDocumentChangeEvent, position: Position) => Promise<void>;
}

export class EventCoordinator {
  private cursorEvents = new Subject<CursorEvent>();
  private textChangeEvents = new Subject<TextChangeEvent>();
  private subscription: Subscription;
  private _isProcessing = false;

  // Track the earliest change position across all events in the debounce window
  private earliestPositionInWindow = new BehaviorSubject<Position | undefined>(undefined);

  constructor(handlers: EventHandlers) {
    const debouncedCursor = this.cursorEvents.pipe(
      debounceTime(50),
      map((event): CoordinatedEvent => event),
    );

    const debouncedTextChange = this.textChangeEvents.pipe(
      debounceTime(300),
      withLatestFrom(this.earliestPositionInWindow),
      map(([event, earliestPosition]): CoordinatedEvent => {
        // Use the earliest position seen during the debounce window
        const effectivePosition = earliestPosition ?? event.earliestChangePosition;
        return {
          ...event,
          earliestChangePosition: effectivePosition,
        };
      }),
      // Reset the tracker after emitting
      tap(() => {
        this.earliestPositionInWindow.next(undefined);
      }),
    );

    this.subscription = merge(debouncedCursor, debouncedTextChange)
      .pipe(
        concatMap(event => {
          this._isProcessing = true;
          const work =
            event.type === 'cursor'
              ? handlers.onCursor(event.event)
              : handlers.onTextChange(event.event, event.earliestChangePosition);

          return from(
            work.finally(() => {
              this._isProcessing = false;
            }),
          ).pipe(catchError(() => EMPTY));
        }),
      )
      .subscribe();
  }

  emitCursorChange(event: TextEditorSelectionChangeEvent): void {
    this.cursorEvents.next({ type: 'cursor', event });
  }

  emitTextChange(event: TextDocumentChangeEvent, earliestChangePosition: Position): void {
    // Track the earliest position across all events in the debounce window
    const currentEarliest = this.earliestPositionInWindow.getValue();
    if (currentEarliest === undefined || earliestChangePosition.isBefore(currentEarliest)) {
      this.earliestPositionInWindow.next(earliestChangePosition);
    }

    this.textChangeEvents.next({ type: 'textChange', event, earliestChangePosition });
  }

  isProcessing(): boolean {
    return this._isProcessing;
  }

  dispose(): void {
    this.subscription.unsubscribe();
    this.cursorEvents.complete();
    this.textChangeEvents.complete();
    this.earliestPositionInWindow.complete();
  }
}
