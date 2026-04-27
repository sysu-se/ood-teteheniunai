import { Sudoku } from './Sudoku.js';

function hasMovePayload(move) {
  return Boolean(move && typeof move === 'object' && 'row' in move && 'col' in move && 'value' in move);
}

export class Game {
  constructor(sudoku) {
    this.present = sudoku.clone();
    this.past = [];
    this.future = [];
    this.initial = sudoku.clone();

    this.mode = 'main';
    this.exploreSession = null;
    this.failedExploreFingerprints = new Set();
  }

  isExploring() {
    return this.mode === 'explore' && this.exploreSession !== null;
  }

  _activeSession() {
    return this.isExploring() ? this.exploreSession : this;
  }

  _applyGuessToSession(session, move) {
    const next = session.present.clone();
    const changed = next.guess(move);
    if (!changed) {
      return false;
    }

    session.past.push(session.present.clone());
    session.present = next;
    session.future = [];
    return true;
  }

  _evaluateExploreFailure() {
    if (!this.isExploring()) {
      return {
        active: false,
        failed: false,
        contradiction: false,
        knownFailed: false,
        fingerprint: null,
      };
    }

    const fingerprint = this.exploreSession.present.getStateFingerprint();
    const contradiction = this.exploreSession.present.hasContradiction();
    const knownFailed = this.failedExploreFingerprints.has(fingerprint);

    if (contradiction) {
      this.failedExploreFingerprints.add(fingerprint);
    }

    return {
      active: true,
      failed: contradiction || knownFailed,
      contradiction,
      knownFailed,
      fingerprint,
    };
  }

  getMode() {
    return this.mode;
  }

  getSudoku() {
    return this._activeSession().present.clone();
  }

  guess(move) {
    const changed = this._applyGuessToSession(this._activeSession(), move);
    return changed;
  }

  getCandidates(row, col) {
    return this._activeSession().present.getCandidates(row, col);
  }

  getHintCandidates(row, col) {
    return this.getCandidates(row, col);
  }

  getNextHintPosition() {
    const next = this._activeSession().present.getNextDeterministicMove();
    if (!next) {
      return null;
    }

    return {
      row: next.row,
      col: next.col,
      candidates: [next.value],
      type: 'position',
    };
  }

  getNextHintAnswer() {
    const next = this._activeSession().present.getNextDeterministicMove();
    if (!next) {
      return null;
    }

    return {
      row: next.row,
      col: next.col,
      value: next.value,
      type: 'answer',
    };
  }

  applyHint(move) {
    let targetMove = move;

    if (!hasMovePayload(targetMove)) {
      const next = this.getNextHintAnswer();
      targetMove = next ? { row: next.row, col: next.col, value: next.value } : null;
    }

    if (!targetMove) {
      return false;
    }

    const session = this._activeSession();
    const changed = session.present.guess(targetMove);
    if (!changed) {
      return false;
    }

    session.future = [];

    return true;
  }

  undo() {
    const session = this._activeSession();
    if (session.past.length === 0) return;

    session.future.push(session.present.clone());
    session.present = session.past.pop();
  }

  redo() {
    const session = this._activeSession();
    if (session.future.length === 0) return;

    session.past.push(session.present.clone());
    session.present = session.future.pop();
  }

  canUndo() {
    return this._activeSession().past.length > 0;
  }

  canRedo() {
    return this._activeSession().future.length > 0;
  }

  canEnterExplore() {
    return !this.isExploring();
  }

  startExplore() {
    if (this.isExploring()) {
      return {
        started: false,
        reason: 'already-exploring',
      };
    }

    this.mode = 'explore';
    this.exploreSession = {
      base: this.present.clone(),
      present: this.present.clone(),
      past: [],
      future: [],
    };

    const status = this._evaluateExploreFailure();
    return {
      started: true,
      knownFailed: status.knownFailed,
    };
  }

  rollbackExplore() {
    if (!this.isExploring()) {
      return false;
    }

    this.exploreSession.present = this.exploreSession.base.clone();
    this.exploreSession.past = [];
    this.exploreSession.future = [];
    return true;
  }

  discardExplore() {
    if (!this.isExploring()) {
      return false;
    }

    this.mode = 'main';
    this.exploreSession = null;
    return true;
  }

  commitExplore() {
    if (!this.isExploring()) {
      return false;
    }

    const committed = this.exploreSession.present.clone();
    const changed = committed.getStateFingerprint() !== this.present.getStateFingerprint();

    this.mode = 'main';
    this.exploreSession = null;

    if (!changed) {
      return false;
    }

    this.past.push(this.present.clone());
    this.present = committed;
    this.future = [];
    return true;
  }

  markExploreFailed() {
    if (!this.isExploring()) {
      return false;
    }

    this.failedExploreFingerprints.add(this.exploreSession.present.getStateFingerprint());
    return true;
  }

  getExploreStatus() {
    return this._evaluateExploreFailure();
  }

  reset() {
    this.present = this.initial.clone();
    this.past = [];
    this.future = [];
    this.mode = 'main';
    this.exploreSession = null;
  }

  loadProgress(progressGrid) {
    const restored = this.initial.clone();

    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        const value = progressGrid[row][col];
        if (value !== 0 && !restored.isGiven(row, col)) {
          restored.guess({ row, col, value });
        }
      }
    }

    this.present = restored;
    this.past = [];
    this.future = [];
    this.mode = 'main';
    this.exploreSession = null;
  }

  isSolved() {
    return this._activeSession().present.isSolved();
  }

  checkConflicts() {
    return this._activeSession().present.checkConflicts();
  }

  toJSON() {
    return {
      present: this.present.toJSON(),
      past: this.past.map(s => s.toJSON()),
      future: this.future.map(s => s.toJSON()),
      initial: this.initial.toJSON(),
      mode: this.mode,
      exploreSession: this.exploreSession ? {
        base: this.exploreSession.base.toJSON(),
        present: this.exploreSession.present.toJSON(),
        past: this.exploreSession.past.map(s => s.toJSON()),
        future: this.exploreSession.future.map(s => s.toJSON()),
      } : null,
      failedExploreFingerprints: [...this.failedExploreFingerprints],
    };
  }

  static fromJSON(json) {
    const obj = typeof json === 'string' ? JSON.parse(json) : json;
    const game = new Game(Sudoku.fromJSON(obj.initial));
    game.present = Sudoku.fromJSON(obj.present);
    game.past = Array.isArray(obj.past) ? obj.past.map(payload => Sudoku.fromJSON(payload)) : [];
    game.future = Array.isArray(obj.future) ? obj.future.map(payload => Sudoku.fromJSON(payload)) : [];

    game.mode = obj.mode || 'main';
    if (
      obj.exploreSession
      && typeof obj.exploreSession === 'object'
      && obj.exploreSession.base
      && obj.exploreSession.present
    ) {
      game.exploreSession = {
        base: Sudoku.fromJSON(obj.exploreSession.base),
        present: Sudoku.fromJSON(obj.exploreSession.present),
        past: Array.isArray(obj.exploreSession.past)
          ? obj.exploreSession.past.map(payload => Sudoku.fromJSON(payload))
          : [],
        future: Array.isArray(obj.exploreSession.future)
          ? obj.exploreSession.future.map(payload => Sudoku.fromJSON(payload))
          : [],
      };
    }

    if (Array.isArray(obj.failedExploreFingerprints)) {
      game.failedExploreFingerprints = new Set(obj.failedExploreFingerprints);
    }

    if (game.mode === 'explore' && !game.exploreSession) {
      game.mode = 'main';
    }

    return game;
  }

  isGiven(row, col) {
    return this._activeSession().present.isGiven(row, col);
  }
}
