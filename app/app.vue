<script setup lang="ts">
const config = useRuntimeConfig()
const count = ref<string | null>(null)
const busy = ref(false)
const error = ref('')

async function requestCounter(increment = false) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const result = await $fetch<{ value: string }>('/api/counter', {
      method: increment ? 'POST' : 'GET',
      retry: 0,
      timeout: 10_000,
    })
    count.value = result.value
  } catch {
    error.value = increment
      ? 'Не удалось получить ответ. Изменение могло сохраниться — обнови значение перед повторным кликом.'
      : 'Счётчик недоступен. Возможно, учебная база данных остановлена.'
  } finally {
    busy.value = false
  }
}

onMounted(() => requestCounter())
</script>

<template>
  <main>
    <section class="card" aria-labelledby="title">
      <p class="eyebrow">UNICORN GLADE / CLOUD PLAYGROUND</p>
      <h1 id="title">Одна кнопка.<br>Общий счётчик.</h1>
      <p class="description">Значение хранится в PostgreSQL и общее для всех посетителей.</p>
      <output class="counter" aria-live="polite" aria-label="Значение глобального счётчика">
        {{ count ?? '—' }}
      </output>
      <div class="actions">
        <button :disabled="busy || count === null" @click="requestCounter(true)">
          {{ busy ? 'Подожди…' : 'Увеличить на 1' }}
        </button>
        <button class="secondary" :disabled="busy" @click="requestCounter()">Обновить значение</button>
      </div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p class="hint">Другие вкладки увидят изменения после обновления значения.</p>
      <a v-if="config.public.downloadUrl" :href="config.public.downloadUrl" rel="noopener noreferrer">
        Скачать тестовый архив ↗
      </a>
      <p v-else class="hint">Ссылка на архив появится после настройки облачного хранилища.</p>
      <footer>Nuxt + Nitro · версия {{ config.public.appVersion }}</footer>
    </section>
  </main>
</template>

<style>
:root { color-scheme: dark; font-family: ui-sans-serif, system-ui, sans-serif; background: #111220; color: #f4f1ff; }
* { box-sizing: border-box; }
body { margin: 0; }
main { min-height: 100dvh; display: grid; place-items: center; padding: 24px; background: radial-gradient(ellipse at top, #302347, transparent 70%); }
.card { width: min(100%, 620px); border: 1px solid #544366; border-radius: 24px; background: #191827; padding: clamp(24px, 5vw, 48px); }
.eyebrow { color: #d7b9ff; font-size: 11px; font-weight: 700; letter-spacing: 2px; }
h1 { font-size: clamp(32px, 6vw, 48px); line-height: 1.1; margin: 24px 0; }
.description, .hint, footer { color: #bbb5c9; line-height: 1.6; }
.counter { display: block; font-size: clamp(40px, 9vw, 80px); font-weight: 700; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; margin: 32px 0; }
.actions { display: flex; gap: 12px; flex-wrap: wrap; }
button { background: #d9bcff; color: #211531; border: 1px solid #d9bcff; border-radius: 10px; padding: 14px 18px; font: inherit; font-weight: 600; cursor: pointer; }
button.secondary { background: transparent; color: #eee2ff; border-color: #766183; }
button:disabled { opacity: .5; cursor: wait; }
button:focus-visible, a:focus-visible { outline: 3px solid #a5f3d0; outline-offset: 4px; }
a { color: #d9bcff; }
.error { color: #ffb3bb; line-height: 1.6; }
.hint { font-size: 13px; }
footer { border-top: 1px solid #41364d; padding-top: 20px; margin-top: 32px; font-size: 12px; }
</style>
