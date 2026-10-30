<template>
  <svg class="anime-sigil" viewBox="0 0 400 400" fill="none" aria-hidden="true" focusable="false">
    <circle cx="200" cy="200" r="178" />
    <circle cx="200" cy="200" r="164" stroke-dasharray="2 12" />
    <circle cx="200" cy="200" r="126" />
    <path d="M75 75 325 325M325 75 75 325" stroke-dasharray="40 12 4 12" />
    <path d="M243 89a118 118 0 1 0 0 222 134 134 0 0 1 0-222Z" fill="currentColor" fill-opacity=".18" />
    <path d="m275 92 7 18 18 7-18 7-7 18-7-18-18-7 18-7Z" />
    <circle cx="200" cy="200" r="103" stroke-dasharray="4 9" />
    <path d="M200 0v43m200 157h-43M200 400v-43M0 200h43" />
    <g v-for="angle in [0, 60, 120, 180, 240, 300]" :key="angle" :transform="'rotate(' + angle + ' 200 200)'">
      <path d="m200 12 5 10-5 10-5-10Z" fill="currentColor" stroke="none" />
      <circle cx="200" cy="74" r="4" fill="currentColor" stroke="none" />
    </g>
  </svg>
</template>
<style scoped>
.anime-sigil { display: block; width: 100%; height: auto; stroke: currentColor; stroke-width: .8; pointer-events: none; }
</style>
