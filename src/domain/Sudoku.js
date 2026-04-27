const SIZE = 9;
const BOX_SIZE = 3;

function cloneGrid(grid) {
  return grid.map(row => row.slice());
}

function cloneGivens(givens) {
  return givens.map(row => row.slice());
}

function normalizeCellValue(value) {
  if (value === null || value === 0) {
    return 0;
  }

  if (!Number.isInteger(value) || value < 1 || value > SIZE) {
    throw new RangeError('Sudoku cell value must be 1-9, 0, or null');
  }

  return value;
}

function validateIndex(index, label) {
  if (!Number.isInteger(index) || index < 0 || index >= SIZE) {
    throw new RangeError(`Sudoku ${label} must be an integer from 0 to 8`);
  }
}

function validateGrid(initialGrid) {
  if (!Array.isArray(initialGrid) || initialGrid.length !== SIZE) {
    throw new TypeError('Sudoku grid must be a 9x9 array');
  }

  return initialGrid.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== SIZE) {
      throw new TypeError('Sudoku grid must be a 9x9 array');
    }

    return row.map((cell, colIndex) => {
      try {
        return normalizeCellValue(cell);
      } catch (error) {
        throw new TypeError(`Invalid Sudoku value at row ${rowIndex}, col ${colIndex}`);
      }
    });
  });
}

function validateGivens(givens) {
  if (!Array.isArray(givens) || givens.length !== SIZE) {
    throw new TypeError('Sudoku givens must be a 9x9 boolean array');
  }

  return givens.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== SIZE) {
      throw new TypeError('Sudoku givens must be a 9x9 boolean array');
    }

    return row.map((cell, colIndex) => {
      if (typeof cell !== 'boolean') {
        throw new TypeError(`Invalid givens value at row ${rowIndex}, col ${colIndex}`);
      }
      return cell;
    });
  });
}

function createEmptyConflicts() {
  return new Map();
}

function markConflict(conflicts, row, col, value, reasons) {
  const key = `${row},${col}`;
  if (!conflicts.has(key)) {
    conflicts.set(key, {
      row,
      col,
      value,
      reasons: new Set(),
    });
  }

  const conflict = conflicts.get(key);
  for (const reason of reasons) {
    conflict.reasons.add(reason);
  }
}

export class Sudoku {
  constructor(initialGrid, options = {}) {
    const normalizedGrid = validateGrid(initialGrid);
    const givens = options.givens
      ? validateGivens(options.givens)
      : normalizedGrid.map(row => row.map(cell => cell !== 0));

    this.grid = cloneGrid(normalizedGrid);
    this.givens = cloneGivens(givens);
  }

  getGrid() {
    return JSON.parse(JSON.stringify(this.grid));
  }

  guess({ row, col, value }) {
    validateIndex(row, 'row');
    validateIndex(col, 'col');

    if (value === undefined) {
      throw new TypeError('Sudoku guess value must be provided');
    }

    if (this.givens[row][col]) {
      throw new Error('Cannot change a fixed Sudoku cell');
    }

    const nextValue = normalizeCellValue(value);
    if (this.grid[row][col] === nextValue) {
      return false;
    }

    this.grid[row][col] = nextValue;
    return true;
  }

  clone() {
    return new Sudoku(this.grid, { givens: this.givens });
  }

  getCandidates(row, col) {
    validateIndex(row, 'row');
    validateIndex(col, 'col');

    if (this.grid[row][col] !== 0) {
      return [];
    }

    const usedValues = new Set();

    for (let i = 0; i < SIZE; i++) {
      const rowValue = this.grid[row][i];
      const colValue = this.grid[i][col];
      if (rowValue !== 0) {
        usedValues.add(rowValue);
      }
      if (colValue !== 0) {
        usedValues.add(colValue);
      }
    }

    const boxStartRow = Math.floor(row / BOX_SIZE) * BOX_SIZE;
    const boxStartCol = Math.floor(col / BOX_SIZE) * BOX_SIZE;
    for (let rowOffset = 0; rowOffset < BOX_SIZE; rowOffset++) {
      for (let colOffset = 0; colOffset < BOX_SIZE; colOffset++) {
        const boxValue = this.grid[boxStartRow + rowOffset][boxStartCol + colOffset];
        if (boxValue !== 0) {
          usedValues.add(boxValue);
        }
      }
    }

    const candidates = [];
    for (let value = 1; value <= SIZE; value++) {
      if (!usedValues.has(value)) {
        candidates.push(value);
      }
    }

    return candidates;
  }

  getAllCandidates() {
    const all = [];
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        if (this.grid[row][col] !== 0) {
          continue;
        }

        all.push({
          row,
          col,
          candidates: this.getCandidates(row, col),
        });
      }
    }

    return all;
  }

  getDeterministicMoves() {
    return this.getAllCandidates()
      .filter(cell => cell.candidates.length === 1)
      .map(cell => ({
        row: cell.row,
        col: cell.col,
        value: cell.candidates[0],
      }));
  }

  getNextDeterministicMove() {
    const singles = this.getDeterministicMoves();
    return singles.length > 0 ? singles[0] : null;
  }

  hasContradiction() {
    if (this.checkConflicts().length > 0) {
      return true;
    }

    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        if (this.grid[row][col] !== 0) {
          continue;
        }

        if (this.getCandidates(row, col).length === 0) {
          return true;
        }
      }
    }

    return false;
  }

  getStateFingerprint() {
    return this.grid.map(row => row.join('')).join('|');
  }

  toJSON() {
    return {
      grid: this.getGrid(),
      givens: cloneGivens(this.givens),
    };
  }

  static fromJSON(json) {
    const obj = typeof json === 'string' ? JSON.parse(json) : json;
    if (!obj || typeof obj !== 'object' || !('grid' in obj)) {
      throw new TypeError('Invalid Sudoku JSON payload');
    }

    return new Sudoku(obj.grid, {
      givens: 'givens' in obj ? obj.givens : undefined,
    });
  }

  toString() {
    return this.grid.map(r => r.map(c => c === 0 ? '.' : c).join(' ')).join('\n');
  }

  isSolved() {
    for (let i = 0; i < SIZE; i++) {
      const rowSet = new Set();
      const colSet = new Set();
      for (let j = 0; j < SIZE; j++) {
        const rowVal = this.grid[i][j];
        const colVal = this.grid[j][i];
        if (!rowVal || rowSet.has(rowVal)) return false;
        if (!colVal || colSet.has(colVal)) return false;
        rowSet.add(rowVal);
        colSet.add(colVal);
      }
    }

    for (let boxRow = 0; boxRow < BOX_SIZE; boxRow++) {
      for (let boxCol = 0; boxCol < BOX_SIZE; boxCol++) {
        const boxSet = new Set();
        for (let i = 0; i < BOX_SIZE; i++) {
          for (let j = 0; j < BOX_SIZE; j++) {
            const val = this.grid[boxRow * 3 + i][boxCol * 3 + j];
            if (!val || boxSet.has(val)) return false;
            boxSet.add(val);
          }
        }
      }
    }

    return true;
  }

  checkConflicts() {
    const conflicts = createEmptyConflicts();

    for (let row = 0; row < SIZE; row++) {
      const seenInRow = new Map();
      for (let col = 0; col < SIZE; col++) {
        const value = this.grid[row][col];
        if (!value) {
          continue;
        }

        if (seenInRow.has(value)) {
          markConflict(conflicts, row, col, value, ['row']);
          markConflict(conflicts, row, seenInRow.get(value), value, ['row']);
        } else {
          seenInRow.set(value, col);
        }
      }
    }

    for (let col = 0; col < SIZE; col++) {
      const seenInCol = new Map();
      for (let row = 0; row < SIZE; row++) {
        const value = this.grid[row][col];
        if (!value) {
          continue;
        }

        if (seenInCol.has(value)) {
          markConflict(conflicts, row, col, value, ['col']);
          markConflict(conflicts, seenInCol.get(value), col, value, ['col']);
        } else {
          seenInCol.set(value, row);
        }
      }
    }

    for (let boxRow = 0; boxRow < BOX_SIZE; boxRow++) {
      for (let boxCol = 0; boxCol < BOX_SIZE; boxCol++) {
        const seenInBox = new Map();
        for (let rowOffset = 0; rowOffset < BOX_SIZE; rowOffset++) {
          for (let colOffset = 0; colOffset < BOX_SIZE; colOffset++) {
            const row = boxRow * BOX_SIZE + rowOffset;
            const col = boxCol * BOX_SIZE + colOffset;
            const value = this.grid[row][col];
            if (!value) {
              continue;
            }

            if (seenInBox.has(value)) {
              markConflict(conflicts, row, col, value, ['box']);
              const [seenRow, seenCol] = seenInBox.get(value);
              markConflict(conflicts, seenRow, seenCol, value, ['box']);
            } else {
              seenInBox.set(value, [row, col]);
            }
          }
        }
      }
    }

    return [...conflicts.values()].map(conflict => ({
      row: conflict.row,
      col: conflict.col,
      value: conflict.value,
      reasons: [...conflict.reasons],
    }));
  }

  isGiven(row, col) {
    validateIndex(row, 'row');
    validateIndex(col, 'col');
    return this.givens[row][col];
  }
}
