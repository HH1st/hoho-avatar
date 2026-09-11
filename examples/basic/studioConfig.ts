const configuredVoiceAgentUrl = import.meta.env.VITE_VOICE_AGENT_URL?.trim();
const localVoiceAgentAvailable = import.meta.env.DEV;
const gateway = new URL('/voice-agent', window.location.href);
gateway.protocol = gateway.protocol === 'https:' ? 'wss:' : 'ws:';

export const voiceAgentConfig = {
  available: localVoiceAgentAvailable || Boolean(configuredVoiceAgentUrl),
  gatewayUrl: configuredVoiceAgentUrl || gateway.href,
  healthUrl: localVoiceAgentAvailable && !configuredVoiceAgentUrl ? '/voice-agent/healthz' : undefined,
};

const hasLocalLive2D = import.meta.env.DEV && import.meta.env.HOHO_LIVE2D_SAMPLE === true;
const hasPagesLive2D = import.meta.env.HOHO_LIVE2D_PAGES === true;
const sampleBase = hasPagesLive2D ? import.meta.env.BASE_URL + 'live2d/' : hasLocalLive2D ? '/__live2d/' : '';
const configuredModelUrl = import.meta.env.VITE_LIVE2D_MODEL_URL?.trim();

export const live2dConfig = {
  modelUrl: configuredModelUrl || (sampleBase ? sampleBase + 'Wanko/Wanko.model3.json' : ''),
  coreUrl: import.meta.env.VITE_LIVE2D_CORE_URL?.trim() || (sampleBase ? sampleBase + 'live2dcubismcore.min.js' : ''),
  name: import.meta.env.VITE_LIVE2D_NAME?.trim() || (sampleBase ? 'Wankoromochi' : 'Live2D'),
  usesSample: Boolean(sampleBase) && !configuredModelUrl,
};
