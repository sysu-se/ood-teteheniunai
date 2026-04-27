<script>
	import { candidates } from '@sudoku/stores/candidates';
	import { userGrid } from '@sudoku/stores/grid';
	import { cursor } from '@sudoku/stores/cursor';
	import { hints } from '@sudoku/stores/hints';
	import { notes } from '@sudoku/stores/notes';
	import { settings } from '@sudoku/stores/settings';
	import { keyboardDisabled } from '@sudoku/stores/keyboard';
	import { gamePaused } from '@sudoku/stores/game';

	export let gameStore;

	let canUndo = false;
	let canRedo = false;
	let canEnterExplore = false;
	let exploreMode = 'main';
	let exploreMessage = '';
	let exploreStatus = {
		active: false,
		failed: false,
		contradiction: false,
		knownFailed: false,
		fingerprint: null,
	};

	$: hintsAvailable = $hints > 0;
	$: cursorSelected = Number.isInteger($cursor.x) && Number.isInteger($cursor.y);
	$: selectedCellEmpty = cursorSelected && $userGrid[$cursor.y][$cursor.x] === 0;

	$: {
		$userGrid;
		if (gameStore) {
			canUndo = gameStore.canUndo();
			canRedo = gameStore.canRedo();
			if (typeof gameStore.canEnterExplore === 'function') {
				canEnterExplore = gameStore.canEnterExplore();
			}
			if (typeof gameStore.getMode === 'function') {
				exploreMode = gameStore.getMode();
			}
			if (typeof gameStore.getExploreStatus === 'function') {
				exploreStatus = gameStore.getExploreStatus();
			}
		}
	}

	function handleHintAnswer() {
		if (hintsAvailable) {
			if (gameStore && typeof gameStore.applyHintAnswer === 'function') {
				gameStore.applyHintAnswer({ x: $cursor.x, y: $cursor.y });
			} else if (gameStore && typeof gameStore.applyHint === 'function') {
				gameStore.applyHint({ x: $cursor.x, y: $cursor.y });
			}
		}
	}

	function handleHintCandidates() {
		if (!hintsAvailable || !selectedCellEmpty) {
			return;
		}

		if (gameStore && typeof gameStore.applyHintCandidates === 'function') {
			const hintedCandidates = gameStore.applyHintCandidates({ x: $cursor.x, y: $cursor.y });
			if (!Array.isArray(hintedCandidates) || hintedCandidates.length === 0) {
				return;
			}

			if ($candidates.hasOwnProperty($cursor.x + ',' + $cursor.y)) {
				candidates.clear($cursor);
			}

			for (const value of hintedCandidates) {
				candidates.add($cursor, value);
			}
		}
	}

	function handleUndoAction() {
		if (gameStore && gameStore.canUndo()) {
			gameStore.undo();
			canUndo = gameStore.canUndo();
			canRedo = gameStore.canRedo();
		}
	}

	function handleRedoAction() {
		if (gameStore && gameStore.canRedo()) {
			gameStore.redo();
			canUndo = gameStore.canUndo();
			canRedo = gameStore.canRedo();
		}
	}

	function handleStartExplore() {
		if (!gameStore || typeof gameStore.startExplore !== 'function') {
			return;
		}

		const result = gameStore.startExplore();
		if (result && result.started) {
			exploreMessage = '已进入探索模式';
			return;
		}

		if (result && result.reason === 'deterministic-hint-available') {
			exploreMessage = '仍有可直接确定的格子，暂不能进入探索';
		} else {
			exploreMessage = '进入探索模式失败';
		}
	}

	function handleRollbackExplore() {
		if (!gameStore || typeof gameStore.rollbackExplore !== 'function') {
			return;
		}

		if (gameStore.rollbackExplore()) {
			exploreMessage = '已回溯到探索起点';
		}
	}

	function handleCommitExplore() {
		if (!gameStore || typeof gameStore.commitExplore !== 'function') {
			return;
		}

		if (gameStore.commitExplore()) {
			exploreMessage = '已提交探索结果';
		} else {
			exploreMessage = '探索无变更，未提交';
		}
	}

	function handleDiscardExplore() {
		if (!gameStore || typeof gameStore.discardExplore !== 'function') {
			return;
		}

		if (gameStore.discardExplore()) {
			exploreMessage = '已放弃探索并返回主局面';
		}
	}
</script>

<div class="action-buttons space-x-3">

	<button class="btn btn-round" disabled={$gamePaused || !gameStore || !canUndo} title="Undo" on:click={handleUndoAction}>
		<svg class="icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
		</svg>
	</button>

	<button class="btn btn-round" disabled={$gamePaused || !gameStore || !canRedo} title="Redo" on:click={handleRedoAction}>
		<svg class="icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 10h-10a8 8 90 00-8 8v2M21 10l-6 6m6-6l-6-6" />
		</svg>
	</button>

	<button class="btn btn-round btn-badge" disabled={$keyboardDisabled || !hintsAvailable} on:click={handleHintAnswer} title="直接答案提示 ({$hints})">
		<svg class="icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
		</svg>

		{#if $settings.hintsLimited}
			<span class="badge" class:badge-primary={hintsAvailable}>{$hints}</span>
		{/if}
	</button>

	<button class="btn btn-round btn-badge" disabled={$keyboardDisabled || !hintsAvailable || !selectedCellEmpty} on:click={handleHintCandidates} title="候选数提示 ({$hints})">
		<svg class="icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
		</svg>

		{#if $settings.hintsLimited}
			<span class="badge" class:badge-primary={hintsAvailable}>{$hints}</span>
		{/if}
	</button>

	<button class="btn btn-round btn-badge" on:click={notes.toggle} title="Notes ({$notes ? 'ON' : 'OFF'})">
		<svg class="icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
		</svg>

		<span class="badge tracking-tighter" class:badge-primary={$notes}>{$notes ? 'ON' : 'OFF'}</span>
	</button>

	<button class="btn btn-round" disabled={$gamePaused || !gameStore || exploreMode === 'explore'} on:click={handleStartExplore} title="进入探索模式">
		E
	</button>

	<button class="btn btn-round" disabled={$gamePaused || !gameStore || exploreMode !== 'explore'} on:click={handleRollbackExplore} title="回溯到探索起点">
		R
	</button>

	<button class="btn btn-round" disabled={$gamePaused || !gameStore || exploreMode !== 'explore'} on:click={handleCommitExplore} title="提交探索结果">
		C
	</button>

	<button class="btn btn-round" disabled={$gamePaused || !gameStore || exploreMode !== 'explore'} on:click={handleDiscardExplore} title="放弃探索结果">
		X
	</button>

</div>

{#if exploreMode === 'explore'}
	<div class="explore-status" class:explore-failed={exploreStatus.failed}>
		{#if exploreStatus.knownFailed}
			已命中历史失败路径，请回溯后换候选值。
		{:else if exploreStatus.contradiction}
			检测到冲突，当前探索失败，请回溯后继续。
		{:else}
			探索模式进行中。
		{/if}
	</div>
{/if}

{#if exploreMessage}
	<div class="explore-message">{exploreMessage}</div>
{/if}


<style>
	.action-buttons {
		@apply flex flex-wrap justify-evenly self-end;
	}

	.btn-badge {
		@apply relative;
	}

	.badge {
		min-height: 20px;
		min-width:  20px;
		@apply p-1 rounded-full leading-none text-center text-xs text-white bg-gray-600 inline-block absolute top-0 left-0;
	}

	.badge-primary {
		@apply bg-primary;
	}

	.explore-status {
		@apply mt-2 px-3 py-2 text-sm rounded bg-blue-100 text-blue-800;
	}

	.explore-failed {
		@apply bg-red-100 text-red-800;
	}

	.explore-message {
		@apply mt-2 px-3 py-1 text-xs rounded bg-gray-100 text-gray-700;
	}
</style>