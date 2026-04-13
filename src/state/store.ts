import { BehaviorSubject, type Observable, type Subscription } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import type { AdelfaStateData, AdelfaAction } from './types';
import { adelfaReducer } from './reducer';
import { createInitialState } from './initial-state';

export type StateListener = (state: AdelfaStateData) => void;

export class AdelfaStore {
  private state: BehaviorSubject<AdelfaStateData>;

  constructor(initialState: AdelfaStateData = createInitialState()) {
    this.state = new BehaviorSubject<AdelfaStateData>(initialState);
  }

  getState(): AdelfaStateData {
    return this.state.getValue();
  }

  dispatch(action: AdelfaAction): void {
    const currentState = this.state.getValue();
    const newState = adelfaReducer(currentState, action);
    this.state.next(newState);
  }

  subscribe(listener: StateListener): Subscription {
    return this.state.subscribe(listener);
  }

  select<T>(selector: (state: AdelfaStateData) => T): Observable<T> {
    return this.state.pipe(map(selector), distinctUntilChanged());
  }

  get state$(): Observable<AdelfaStateData> {
    return this.state.asObservable();
  }

  dispose(): void {
    this.state.complete();
  }
}
