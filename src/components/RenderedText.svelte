<script lang="ts">
  import type { TextPart } from '../types.ts';
  let { parts }: { parts: TextPart[] } = $props();
</script>

{#each parts as part}{#if part.data}<span class="data-value">{part.text}</span>{:else}{part.text}{/if}{/each}
