const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const OpenAI = require('openai').default;
const { validateEnvironment } = require('../dist/config/environment');
const { mapProviderError } = require('../dist/upd/provider-error');
const { OpenRouterTransport } = require('../dist/upd/openrouter-transport');

async function main() {
  const envFile = path.resolve(__dirname, '../.env');
  const fileEnv = fs.existsSync(envFile) ? parseEnv(fs.readFileSync(envFile, 'utf8')) : {};
  const settings = validateEnvironment({ ...fileEnv, ...process.env });
  console.log(JSON.stringify({ keyConfigured: true, proxyConfigured: Boolean(settings.AI_PROXY_URL),
    keyOverriddenByProcessEnvironment: Boolean(process.env.OPENROUTER_API_KEY && fileEnv.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim() !== fileEnv.OPENROUTER_API_KEY.trim()) }));
  const transport = new OpenRouterTransport({ ...settings, OPENROUTER_TIMEOUT_MS: 15000 });
  const client = transport.client;
  try {
    await client.get('/key', {});
    const catalog = await client.get('/models', {});
    const model = catalog.data?.find((entry) => entry.id === settings.OPENROUTER_MODEL);
    if (!model) throw new OpenAI.APIError(404, { code: 'model_not_found' }, 'Model unavailable', new Headers());
    const endpointData = await client.get(`/models/${settings.OPENROUTER_MODEL}/endpoints`, {});
    const strict = endpointData.data?.endpoints?.some((endpoint) => endpoint.supported_parameters?.includes('structured_outputs'));
    const vision = model.architecture?.input_modalities?.includes('image');
    const nativePdf = endpointData.data?.architecture?.input_modalities?.includes('file');
    console.log(JSON.stringify({ ok: Boolean(strict && vision && (settings.OPENROUTER_PDF_ENGINE !== 'native' || nativePdf)),
      keyAccepted: true, model: settings.OPENROUTER_MODEL, supportsImages: Boolean(vision), supportsStructuredOutputs: Boolean(strict), supportsNativePdf: Boolean(nativePdf),
      pdfEngine: settings.OPENROUTER_PDF_ENGINE,
      message: 'Проверены ключ и каталог. Баланс, доступ конкретного inference endpoint и качество распознавания проверяются реальной загрузкой.' }));
    if (!strict || !vision || (settings.OPENROUTER_PDF_ENGINE === 'native' && !nativePdf)) process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({ ok: false, upstreamStatus: error instanceof OpenAI.APIError ? error.status : null, ...mapProviderError(error).getResponse() }));
    process.exitCode = 1;
  } finally { await transport.onModuleDestroy(); }
}
main().catch(() => {
  console.error('Проверьте OPENROUTER_API_KEY и конфигурацию .env. OpenAI API-ключ не используется; секреты не выводятся.');
  process.exitCode = 1;
});
