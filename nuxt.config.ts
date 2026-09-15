const downloadUrl = process.env.NUXT_PUBLIC_DOWNLOAD_URL || ''
if (downloadUrl && new URL(downloadUrl).protocol !== 'https:') {
  throw new Error('NUXT_PUBLIC_DOWNLOAD_URL must be an HTTPS URL')
}

export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  devtools: { enabled: false },
  ssr: false,
  app: {
    head: {
      htmlAttrs: { lang: 'ru' },
      title: 'Unicorn Glade · Облачный счётчик',
      meta: [{ name: 'description', content: 'Учебный проект: Nuxt, Nitro и Yandex Cloud.' }],
    },
  },
  runtimeConfig: {
    public: {
      appVersion: process.env.APP_VERSION || 'development',
      downloadUrl,
    },
  },
  nitro: {
    preset: 'aws_lambda',
    awsLambda: { streaming: false },
    prerender: { routes: ['/'], crawlLinks: false },
  },
  typescript: { strict: true },
})
