<script lang="ts">
  let { onchoose, onforget, suspended = false }: { onchoose: (pill: 'red' | 'blue') => void; onforget: () => void; suspended?: boolean } = $props();
</script>

<div class="commands" aria-label="Choose how this session ends">
  <button disabled={suspended} onclick={onforget}>Forget me</button>
  <button class="pill-red" disabled={suspended} onclick={() => onchoose('red')}>Red pill</button>
  <button class="pill-blue" disabled={suspended} onclick={() => onchoose('blue')}>Blue pill</button>
</div>
