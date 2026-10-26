<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import TypingTask from './components/TypingTask.svelte';
  import ReturnNotice from './components/ReturnNotice.svelte';
  import ChoiceTask from './components/ChoiceTask.svelte';
  import RenderedText from './components/RenderedText.svelte';
  import { profile, type Interactions } from './profile.ts';
  import { createObservations } from './collectors.ts';
  import { story, blueEnding, redEnding } from './story.ts';
  import { characters } from './typewriter.ts';
  import { segments, datum, plainText, sliceSegments, joinSentences } from './text.ts';
  import type { Sentences, StoryContext, TaskResults, TextPart, TranscriptEntry } from './types.ts';

  let { historyRestored = false }: { historyRestored?: boolean } = $props();
  const session = new AbortController();
  const observations = untrack(() => createObservations(session.signal, historyRestored));
  const resolvedScenes = new Map<number, Promise<TranscriptEntry>>();
  const transcript = new Map<number, TranscriptEntry>();
  let reviewEntries = $state<TranscriptEntry[]>([]);
  let active = $state(true);
  let skipPlayback = $state(false);
  let paused = $state(false);
  let hidden = $state(false);
  let reduced = $state(false);
  let instantSentence = $state(false);
  let sceneIndex = $state(-1);
  let phase = $state<'waiting' | 'loading' | 'typing' | 'reading' | 'interaction' | 'preparing' | 'review' | 'finished'>('waiting');
  const scene = $derived(story[sceneIndex]);
  let bodyParts = $state<TextPart[]>([]);
  let sceneSentences = $state<Sentences>([]);
  let sentenceIndex = $state(0);
  let noticeCount = $state(0);
  let returnNotice = $state<{ advance: () => void }>();
  let returnFocus: HTMLElement | undefined;
  let returnScroll = 0;
  const text = $derived(plainText(bodyParts));
  const textLength = $derived(characters(text).length);
  let following = true;
  let shown = $state(0);
  let announced = $state('');
  let tasks = $state<TaskResults>({});
  let panelTitle = $state('');
  let panelParts = $state<TextPart[]>([]);
  const panelOpen = $derived(!!panelTitle);
  const frozen = $derived(paused || hidden || panelOpen || noticeCount > 0 || !active);
  const interaction = $derived(phase === 'interaction' ? scene?.interaction : undefined);
  let area: HTMLDivElement;
  let stage: HTMLElement;
  let backFocus: HTMLElement | undefined;
  let backScroll = 0;
  let frame = 0;
  let previousFrame = 0;
  let work = 0;
  let readingLeft = 2000;
  let attempt = 0;
  let mounted = $state(false);
  let layoutFrame = 0;
  let reviewIndex = $state(0);
  let reviewLoading = $state(false);
  const visibleParts = $derived(sliceSegments(bodyParts, 0, shown));

  let savedVisits = $state<number | null>(null);
  let firstSeen = $state<number | null>(null);
  let previousVisit = $state<number | null>(null);
  const behavior = { advances: 0, hidden: 0 };
  const startedAt = Date.now();
  let blueChosen = $state(false);
  let visitLoaded = false;
  let memoryStatus = $state('');
  const visitKey = 'invisible-system:visits:v1';
  const legacyKey = 'invisible-system:marker:v1';
  let profileParts = $state<TextPart[]>([]);
  const interactions: Interactions = { pointer: null, hoverSamples: 0, hoverTotalMs: 0 };

  function context(): StoryContext {
    return { visits: savedVisits, previousVisit, startedAt, behavior: { ...behavior, meanHoverMs: interactions.hoverSamples ? Math.round(interactions.hoverTotalMs / interactions.hoverSamples) : null, pointer: interactions.pointer }, tasks, blueChosen };
  }
  function followOutput() {
    if (following && !panelOpen && !noticeCount && active) area.scrollTop = area.scrollHeight;
  }
  function trackScroll() {
    if (!panelOpen && !noticeCount) following = area.scrollHeight - area.scrollTop - area.clientHeight < 48;
  }
  function appendSentence(parts: TextPart[], newScene = false) {
    const separator = bodyParts.length ? segments(newScene ? '\n\n' : '\n') : [];
    shown = characters(plainText(bodyParts)).length;
    bodyParts = [...bodyParts, ...separator, ...parts];
    startSentence();
  }
  function schedule() {
    if (!frame && !frozen && (phase === 'typing' || phase === 'reading')) frame = requestAnimationFrame(animate);
  }
  function completeSentence() {
    shown = textLength;
    announced = plainText(sceneSentences[sentenceIndex] ?? []);
    phase = 'reading'; readingLeft = 3500; work = 0;
  }
  function startSentence() {
    work = 0; previousFrame = 0;
    phase = 'typing';
    if (instantSentence || reduced) completeSentence();
    schedule();
  }
  function animate(now: number) {
    frame = 0;
    if (frozen) { previousFrame = 0; return; }
    const elapsed = previousFrame ? Math.min(now - previousFrame, 100) : 0;
    previousFrame = now;
    if (phase === 'typing') {
      work += elapsed / 140;
      const count = Math.floor(work);
      if (count) { shown = Math.min(shown + count, textLength); work -= count; }
      if (shown === textLength) completeSentence();
    } else if (phase === 'reading') {
      readingLeft -= elapsed;
      if (readingLeft <= 0) {
        advanceAfterReading();
      }
    }
    schedule();
  }
  function advanceAfterReading() {
    if (sentenceIndex + 1 < sceneSentences.length) {
      sentenceIndex++; instantSentence = false;
      appendSentence(sceneSentences[sentenceIndex]);
    }
    else if (scene?.interaction === 'receipt') prepareReview();
    else if (scene?.interaction) { phase = 'interaction'; }
    else phase = 'waiting';
  }
  function resolveScene(index: number): Promise<TranscriptEntry> {
    if (!resolvedScenes.has(index)) resolvedScenes.set(index, readScene(index).then(entry => {
      if (active) transcript.set(index, entry);
      return entry;
    }));
    return resolvedScenes.get(index)!;
  }
  async function readScene(index: number): Promise<TranscriptEntry> {
    const item = story[index];
    const facts = await observations.read(item.reads ?? []);
    if (!active) return { sceneId: index, parts: [], sentences: [], how: [], status: 'unavailable' };
    if (item.special === 'profile') profileParts = profile(facts, context(), interactions);
    const sentences = item.special === 'snapshot' ? await makeCode() : item.render ? item.render(facts, context()) : (item.lines ?? []).map(line => segments(line));
    return { sceneId: index, parts: joinSentences(sentences), sentences, how: segments(item.how), status: sentences.length ? 'ready' : 'unavailable' };
  }
  async function loadNext() {
    if (frozen || phase !== 'waiting') return;
    const token = ++attempt;
    sceneIndex++; instantSentence = false;
    if (!scene) { prepareReview(); return; }
    phase = 'loading'; announced = '';
    const entry = await resolveScene(sceneIndex);
    if (!active || token !== attempt) return;
    if (entry.status === 'unavailable') { phase = 'waiting'; return; }
    if (skipPlayback) {
      reviewEntries = buildReview();
      if (scene.interaction === 'receipt') { await showReview(true); return; }
      phase = scene.interaction ? 'interaction' : 'waiting';
      return;
    }
    sceneSentences = entry.sentences; sentenceIndex = 0;
    appendSentence(sceneSentences[0], true);
  }
  $effect(() => {
    if (!mounted) return;
    if (frozen) { cancelAnimationFrame(frame); frame = 0; previousFrame = 0; return; }
    if (phase === 'waiting') void loadNext();
    else if (phase === 'preparing' && !reviewLoading) void collectReview();
    else {
      if (phase === 'typing' && (instantSentence || reduced)) completeSentence();
      schedule();
    }
  });
  $effect(() => {
    shown; phase; reviewEntries.length;
    if (!mounted) return;
    untrack(() => { void tick().then(followOutput); });
  });
  function skipToInteraction() {
    if (!active || phase === 'interaction' || phase === 'preparing') return;
    skipPlayback = true;
    attempt++; cancelAnimationFrame(frame); frame = 0; previousFrame = 0;
    paused = false;
    // Reuse the current reading; never resolve scenes beyond an unfinished task.
    if (phase !== 'waiting') sceneIndex = Math.max(-1, sceneIndex - 1);
    phase = 'waiting';
    stage.focus({ preventScroll: true });
  }
  function prepareReview() {
    if (!active || phase === 'preparing' || phase === 'review') return;
    attempt++; cancelAnimationFrame(frame); frame = 0; previousFrame = 0;
    paused = false; noticeCount = 0; returnFocus = undefined;
    phase = 'preparing'; reviewIndex = 0; reviewLoading = false;
    announced = 'Preparing the complete review. Waiting for remaining readings.';
    stage.focus({ preventScroll: true });
  }
  async function collectReview() {
    const token = attempt;
    reviewLoading = true;
    if (reviewIndex < story.length) {
      await resolveScene(reviewIndex);
      if (!active || token !== attempt) return;
      reviewIndex++; reviewLoading = false;
    } else await showReview(true);
  }
  function buildReview(): TranscriptEntry[] {
    const output: TranscriptEntry[] = [];
    for (let index = 0; index <= Math.min(sceneIndex, story.length - 1); index++) {
      const entry = transcript.get(index);
      if (!entry || entry.status === 'unavailable') continue;
      const item = story[index];
      const content = [...(item.special === 'receipt' && blueChosen ? joinSentences(blueEnding(savedVisits !== null)) : entry.parts)];

      output.push({ ...entry, parts: content, how: [...entry.how, ...(item.special === 'memory' ? memoryParts() : [])] });
    }
    return output;
  }
  async function showReview(preservePosition = false) {
    const previous = preservePosition ? area.scrollTop : 0;
    reviewEntries = buildReview(); phase = 'review'; reviewLoading = false;
    bodyParts = []; shown = 0;
    announced = 'The complete story is ready to review.';
    await tick();
    if (!active || phase !== 'review') return;
    area.scrollTop = previous;
    if (!preservePosition) area.focus({ preventScroll: true });
  }
  function memoryParts(): TextPart[] {
    const parts = savedVisits === null ? segments('\nNo visit record is currently saved by this session.') : segments('\nSaved visit count: ', datum(savedVisits), '.');
    if (firstSeen) parts.push(...segments('\nFirst saved: ', datum(new Date(firstSeen).toLocaleString())));
    if (previousVisit) parts.push(...segments('\nPreviously saved: ', datum(new Date(previousVisit).toLocaleString())));
    if (memoryStatus) parts.push(...segments('\n', memoryStatus));
    return parts;
  }
  function continueStory() {
    if (phase !== 'interaction' || !active || panelOpen) return;
    phase = 'waiting'; stage.focus({ preventScroll: true });
  }
  async function openPanel(title: string, content: TextPart[]) {
    backFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    backScroll = area.scrollTop;
    panelTitle = title; panelParts = content;
    await tick();
    area.scrollTop = 0;
    area.focus({ preventScroll: true });
  }
  async function closePanel() {
    panelTitle = ''; panelParts = [];
    await tick();
    area.scrollTop = backScroll;
    if (backFocus?.isConnected) backFocus.focus({ preventScroll: true });
  }
  function explain() {
    const entry = transcript.get(sceneIndex);
    void openPanel('how?', [...(entry?.how ?? segments(scene?.how ?? 'This session has ended.')), ...(scene?.special === 'memory' ? memoryParts() : [])]);
  }
  async function makeCode(): Promise<Sentences> {
    if (!globalThis.crypto?.subtle) return [];
    try {
      const source = JSON.stringify({ version: 2, readings: observations.fingerprint(), exercises: tasks });
      const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
      if (!active) return [];
      const code = [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      return [segments('These details, folded into one code: ', datum(code.slice(0, 6)), '…'), segments('No cookie.'), segments('No login.'), segments('No name.'), segments('And you still gave me enough to compare.')];
    } catch { return []; }
  }
  function loadVisit() {
    if (visitLoaded) return;
    visitLoaded = true;
    try {
      const now = Date.now();
      let count = 0;
      let first: number | null = now;
      let prior: number | null = null;
      const saved = localStorage.getItem(visitKey);
      if (saved && saved.length <= 400) {
        let value;
        try { value = JSON.parse(saved); } catch { /* Invalid records start a fresh count. */ }
        if (value && Number.isSafeInteger(value.visits) && value.visits >= 1 && value.visits <= 1_000_000) {
          if (value.version === 1) { count = value.visits; first = null; }
          else if (value.version === 2 && (value.firstSeen === null || (Number.isSafeInteger(value.firstSeen) && value.firstSeen > 0 && value.firstSeen <= value.lastSeen)) && Number.isSafeInteger(value.lastSeen) && value.lastSeen > 0 && value.lastSeen <= now) {
            count = value.visits; first = value.firstSeen; prior = value.lastSeen;
          }
        }
      }
      const visits = Math.min(count + 1, 1_000_000);
      localStorage.setItem(visitKey, JSON.stringify({ version: 2, visits, firstSeen: first, lastSeen: now }));
      savedVisits = visits; firstSeen = first; previousVisit = prior;
      memoryStatus = 'Visit count and dates saved only in this browser; no backup.';
    } catch { memoryStatus = 'Local memory is unavailable; no visit was saved by this session.'; }
  }
  async function forget(pill = true) {
    let removed = true;
    for (const key of [visitKey, legacyKey]) {
      try { localStorage.removeItem(key); if (localStorage.getItem(key) !== null) removed = false; }
      catch { removed = false; }
    }
    savedVisits = firstSeen = previousVisit = null;
    memoryStatus = removed ? 'Local visit memory erased.' : 'Local memory could not be fully erased. Clear this site’s data in browser settings.';
    stop();
    bodyParts = joinSentences(redEnding(removed, pill), '\n');
    await tick();
    area.scrollTop = 0; announced = text; area.focus({ preventScroll: true });
  }
  function choose(pill: 'red' | 'blue') {
    if (pill === 'red') { void forget(); return; }
    blueChosen = true;
    if (phase === 'review') void showReview(true);
    else continueStory();
  }
  function stop() {
    active = false; attempt++; session.abort();
    behavior.advances = behavior.hidden = 0; blueChosen = false;
    cancelAnimationFrame(frame); cancelAnimationFrame(layoutFrame); frame = 0;
    observations.clear(); tasks = {};
    profileParts = []; interactions.pointer = null; interactions.hoverSamples = interactions.hoverTotalMs = 0;
    transcript.clear(); resolvedScenes.clear(); reviewEntries = [];
    bodyParts = []; sceneSentences = []; shown = 0; announced = ''; panelTitle = ''; panelParts = [];
    noticeCount = 0; returnFocus = undefined;
    backFocus = undefined; phase = 'finished';
  }
  async function endSession() {
    stop();
    bodyParts = segments('Done.\nThis page’s readings are cleared.\nSaved visit history, browser permissions and host records are unchanged.');
    await tick();
    area.scrollTop = 0;
    announced = text;
    stage.focus({ preventScroll: true });
  }
  async function finishReturnNotice() {
    noticeCount = 0;
    await tick();
    if (!active) return;
    area.scrollTop = returnScroll;
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    else (panelOpen || phase === 'review' ? area : stage).focus({ preventScroll: true });
    returnFocus = undefined;
  }
  onMount(() => {
    loadVisit();
    let hovered: Element | null = null;
    let hoverStarted = 0;
    const control = (target: EventTarget | null) => target instanceof Element ? target.closest('button, a[href], summary') : null;
    document.addEventListener('pointerover', event => {
      const next = control(event.target);
      if (event.pointerType !== 'mouse' || next === hovered) return;
      hovered = next; hoverStarted = performance.now();
    }, { signal: session.signal });
    document.addEventListener('pointerout', event => {
      if (control(event.relatedTarget) !== hovered) { hovered = null; hoverStarted = 0; }
    }, { signal: session.signal });
    document.addEventListener('pointerdown', event => {
      if (!event.isTrusted || hidden) return;
      interactions.pointer = event.pointerType === 'mouse' ? 'mouse/trackpad' : event.pointerType === 'touch' || event.pointerType === 'pen' ? event.pointerType : null;
      if (event.pointerType === 'mouse' && hovered && control(event.target) === hovered && hoverStarted && interactions.hoverSamples < 100) {
        const duration = performance.now() - hoverStarted;
        if (duration <= 60000) { interactions.hoverSamples++; interactions.hoverTotalMs += duration; }
      }
      hovered = null; hoverStarted = 0;
    }, { signal: session.signal });
    document.addEventListener('visibilitychange', () => { hovered = null; hoverStarted = 0; }, { signal: session.signal });
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    reduced = media.matches;
    media.addEventListener('change', () => { reduced = media.matches; }, { signal: session.signal });
    hidden = document.hidden;
    document.addEventListener('visibilitychange', () => {
      const wasHidden = hidden;
      hidden = document.hidden;
      if (hidden) behavior.hidden++;
      else if (wasHidden && active && behavior.hidden > 0) {
        if (!noticeCount) {
          returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
          returnScroll = area.scrollTop;
        }
        noticeCount = behavior.hidden;
      }
    }, { signal: session.signal });
    window.addEventListener('keydown', event => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.isComposing || event.repeat) return;
      if (event.key === 'Escape') { if (panelOpen) closePanel(); else paused = true; return; }
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (noticeCount && !(event.target instanceof Element && event.target.closest('button, a[href]'))) { event.preventDefault(); returnNotice?.advance(); return; }
      if (event.target instanceof Element && event.target.closest('button, a[href], summary, input, textarea, select, [contenteditable]')) return;
      if (panelOpen || !['loading', 'typing', 'reading'].includes(phase)) return;
      event.preventDefault();
      behavior.advances++;
      if (phase === 'reading') { advanceAfterReading(); return; }
      instantSentence = true;
      if (phase === 'typing') completeSentence();
    }, { signal: session.signal });
    const resize = new ResizeObserver(() => {
      cancelAnimationFrame(layoutFrame);
      layoutFrame = requestAnimationFrame(followOutput);
    });
    resize.observe(area);
    session.signal.addEventListener('abort', () => resize.disconnect(), { once: true });
    void document.fonts.ready.then(() => { if (active) followOutput(); });
    mounted = true;
    void loadNext();
    return () => { mounted = false; resize.disconnect(); stop(); };
  });
</script>

<svelte:head>
  <meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)" />
  <meta name="theme-color" content="#224fbc" media="(prefers-color-scheme: light)" />
</svelte:head>
<svelte:window onpagehide={stop} />

{#snippet taskContent()}
      {#if interaction === 'typing'}
        <TypingTask suspended={frozen} onskip={continueStory} onresult={result => { tasks.typing = result; if (result) continueStory(); }} />
      {:else if interaction === 'choice'}
        <ChoiceTask suspended={frozen} onchoose={choose} onforget={() => void forget(false)} />
      {/if}
{/snippet}

<div class="terminal-shell">
  <header aria-label="u r watched"><span aria-hidden="true">&gt;_ </span>{panelOpen ? panelTitle : phase === 'review' ? 'the complete story' : 'u r watched'}</header>
  <main bind:this={stage} tabindex="-1" aria-label="Privacy story">
    {#if noticeCount}{#key noticeCount}<ReturnNotice bind:this={returnNotice} count={noticeCount} {reduced} paused={paused || hidden} oncomplete={finishReturnNotice} />{/key}{/if}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (This scrollable region needs keyboard focus for Arrow and Page navigation.) -->
    <div bind:this={area} class="text-area scrollable" class:concealed={noticeCount > 0} inert={noticeCount > 0} tabindex="0" onscroll={trackScroll} role="region" aria-label={panelOpen ? panelTitle : phase === 'review' ? 'Complete story review' : 'Story so far and current interaction'}>
      {#if panelOpen}
        <p class="terminal-output"><RenderedText parts={panelParts} /></p>
        {#if plainText(panelParts).includes('Open-Meteo')}<p><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Weather data by Open-Meteo</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a></p>{/if}
        {#if plainText(panelParts).includes('IPWhois')}<p><a href="https://ipwhois.io/documentation" target="_blank" rel="noreferrer">IPWhois lookup documentation</a></p>{/if}
      {:else if phase === 'review' || (skipPlayback && active)}
        {#each reviewEntries as entry (entry.sceneId)}
          <div class="review-entry">
            <p class="terminal-output"><RenderedText parts={entry.parts} /></p>
            {#if story[entry.sceneId].special === 'profile'}<details><summary>See the profile</summary><pre class="terminal-output profile-output"><RenderedText parts={profileParts} /></pre></details>{/if}
            <button aria-label={`How: ${plainText(entry.parts).slice(0, 80)}`} onclick={() => void openPanel('how?', entry.how)}>how?</button>
          </div>
        {/each}
        {#if phase === 'review'}
          {#if !blueChosen}<ChoiceTask onchoose={choose} onforget={() => void forget(false)} />{/if}
        {:else if phase === 'loading'}
          <p role="status">Give me a second.</p>
        {/if}
      {:else if phase === 'finished'}
        <p class="terminal-output"><RenderedText parts={bodyParts} /></p>
      {:else}
        <p class="terminal-output"><RenderedText parts={visibleParts} />{#if phase === 'typing'}<span class="cursor" aria-hidden="true"></span>{/if}</p>
        {#if phase === 'loading' || phase === 'preparing'}<p class="loading-output" role="status">{phase === 'loading' ? scene?.pending ?? 'Give me a second.' : paused ? 'Paused.' : 'One second.'}<span class="cursor" aria-hidden="true"></span></p>{/if}
        <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{announced}</p>
      {/if}
      <div class="inline-interaction" hidden={panelOpen || !interaction || noticeCount > 0} inert={panelOpen || !interaction || noticeCount > 0}>
        {@render taskContent()}
      </div>
    </div>
  </main>
  <footer aria-label="Story controls">
    {#if noticeCount}
      <button aria-pressed={paused} onclick={() => { paused = !paused; }}>{paused ? 'Resume' : 'Pause'}</button>
      <button onclick={finishReturnNotice}>Continue</button>
    {:else if panelOpen}
      <button onclick={closePanel}>Back</button>
    {:else if phase === 'review'}
      <button onclick={endSession}>Clear session</button>
      <button onclick={() => location.reload()}>Begin again</button>
    {:else if active}
      <button aria-pressed={paused} onclick={() => { paused = !paused; }}>{paused ? 'Resume' : 'Pause'}</button>
      {#if phase === 'preparing'}<button onclick={endSession}>Clear session</button>{:else}{#if !skipPlayback && !interaction}<button aria-label="Skip typing and reveal text up to the next interaction" onclick={skipToInteraction}>Skip</button>{/if}<button onclick={explain}>how?</button>{#if scene?.special === 'profile'}<button onclick={() => void openPanel('local profile · JSON', profileParts)}>See the profile</button>{/if}{/if}

    {:else}
      <button onclick={() => location.reload()}>Begin again</button>
    {/if}
  </footer>
</div>
