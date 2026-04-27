import { describe, expect, it } from 'vitest'
import { loadDomainApi, makePuzzle } from '../hw1/helpers/domain-api.js'

function makeAlmostSolvedPuzzle() {
  const solved = [
    [5, 3, 4, 6, 7, 8, 9, 1, 2],
    [6, 7, 2, 1, 9, 5, 3, 4, 8],
    [1, 9, 8, 3, 4, 2, 5, 6, 7],
    [8, 5, 9, 7, 6, 1, 4, 2, 3],
    [4, 2, 6, 8, 5, 3, 7, 9, 1],
    [7, 1, 3, 9, 2, 4, 8, 5, 6],
    [9, 6, 1, 5, 3, 7, 2, 8, 4],
    [2, 8, 7, 4, 1, 9, 6, 3, 5],
    [3, 4, 5, 2, 8, 6, 1, 7, 9],
  ]

  solved[0][2] = 0
  return solved
}

function makeNoSinglePuzzle() {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 0))
}

describe('HW2 hint and explore mode', () => {
  it('provides candidates and deterministic next-step hint from domain objects', async () => {
    const { createSudoku } = await loadDomainApi()
    const sudoku = createSudoku(makeAlmostSolvedPuzzle())

    expect(sudoku.getCandidates(0, 2)).toEqual([4])
    expect(sudoku.getNextDeterministicMove()).toEqual({ row: 0, col: 2, value: 4 })
  })

  it('supports position-only hint and answer hint, and can apply the answer', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makeAlmostSolvedPuzzle()) })

    expect(game.getNextHintPosition()).toEqual({
      row: 0,
      col: 2,
      candidates: [4],
      type: 'position',
    })

    expect(game.getNextHintAnswer()).toEqual({
      row: 0,
      col: 2,
      value: 4,
      type: 'answer',
    })

    expect(game.applyHint()).toBe(true)
    expect(game.getSudoku().getGrid()[0][2]).toBe(4)
  })

  it('allows entering explore mode only when no deterministic move is available', async () => {
    const { createGame, createSudoku } = await loadDomainApi()

    const gameWithSingle = createGame({ sudoku: createSudoku(makeAlmostSolvedPuzzle()) })
    expect(gameWithSingle.canEnterExplore()).toBe(false)
    expect(gameWithSingle.startExplore().started).toBe(false)

    const gameWithoutSingle = createGame({ sudoku: createSudoku(makeNoSinglePuzzle()) })
    expect(gameWithoutSingle.canEnterExplore()).toBe(true)
    expect(gameWithoutSingle.startExplore()).toEqual({ started: true, knownFailed: false })
    expect(gameWithoutSingle.getMode()).toBe('explore')
  })

  it('detects explore conflicts and supports rollback to explore start', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makeNoSinglePuzzle()) })

    game.startExplore()
    expect(game.guess({ row: 0, col: 0, value: 1 })).toBe(true)
    expect(game.guess({ row: 0, col: 1, value: 1 })).toBe(true)

    const statusAfterConflict = game.getExploreStatus()
    expect(statusAfterConflict.active).toBe(true)
    expect(statusAfterConflict.failed).toBe(true)
    expect(statusAfterConflict.contradiction).toBe(true)

    expect(game.rollbackExplore()).toBe(true)
    expect(game.getSudoku().getGrid()[0][0]).toBe(0)
    expect(game.getSudoku().getGrid()[0][1]).toBe(0)
  })

  it('remembers known failed explore boards across multiple paths in one explore session', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makeNoSinglePuzzle()) })

    game.startExplore()
    game.guess({ row: 0, col: 0, value: 1 })
    game.guess({ row: 0, col: 1, value: 1 })

    const firstFailed = game.getExploreStatus()
    expect(firstFailed.failed).toBe(true)
    expect(firstFailed.knownFailed).toBe(false)

    game.rollbackExplore()
    game.guess({ row: 0, col: 0, value: 1 })
    game.guess({ row: 0, col: 1, value: 1 })

    const revisited = game.getExploreStatus()
    expect(revisited.failed).toBe(true)
    expect(revisited.knownFailed).toBe(true)
  })

  it('can commit or discard explore result and keeps main history contract', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makeNoSinglePuzzle()) })

    game.startExplore()
    game.guess({ row: 0, col: 0, value: 9 })
    expect(game.commitExplore()).toBe(true)

    expect(game.getMode()).toBe('main')
    expect(game.getSudoku().getGrid()[0][0]).toBe(9)
    expect(game.canUndo()).toBe(true)

    game.undo()
    expect(game.getSudoku().getGrid()[0][0]).toBe(0)

    game.startExplore()
    game.guess({ row: 1, col: 1, value: 5 })
    expect(game.discardExplore()).toBe(true)
    expect(game.getSudoku().getGrid()[1][1]).toBe(0)
  })

  it('keeps givens constraint after serialization round-trip', async () => {
    const { createGame, createGameFromJSON, createSudoku } = await loadDomainApi()
    const puzzle = makePuzzle()
    const game = createGame({ sudoku: createSudoku(puzzle) })

    game.guess({ row: 0, col: 2, value: 4 })
    const restored = createGameFromJSON(JSON.parse(JSON.stringify(game.toJSON())))

    expect(() => restored.guess({ row: 0, col: 0, value: 1 })).toThrow()
    expect(restored.guess({ row: 0, col: 2, value: 4 })).toBe(false)
    expect(restored.guess({ row: 0, col: 2, value: 3 })).toBe(true)
  })
})
