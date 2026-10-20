<script setup lang="ts">
import logoUrl from '../Miki.png'

withDefaults(defineProps<{ size?: number }>(), { size: 56 })
</script>

<template>
  <img
    class="MikiLogo"
    :src="logoUrl"
    :width="size"
    :height="size"
    alt="Miki"
  />
</template>

<style scoped>
.MikiLogo {
  display: block;
  object-fit: contain;
}
</style>
