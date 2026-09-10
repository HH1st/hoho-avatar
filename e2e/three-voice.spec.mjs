import { test, expect } from '@playwright/test';

test('voice conversation keeps one session while switching between 2D and 3D', async ({ page }) => {
  let socket;
  let connections = 0;
  await page.route('**/voice-agent/healthz', (route) => route.fulfill({ json: { ok: true } }));
  await page.routeWebSocket(/\/voice-agent$/, (connection) => {
    connections++; socket = connection;
    connection.onMessage((data) => {
      if (JSON.parse(String(data)).type === 'session.configure') connection.send(JSON.stringify({ type: 'session.ready' }));
    });
    connection.send(JSON.stringify({ type: 'gateway.ready' }));
  });
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./?character=mochi');
  await expect(page.locator('.stage-wrap')).toHaveAttribute('data-loaded', 'true');
  await page.locator('#tab-agent').click();
  await page.locator('#agentConnectButton').click();
  await expect(page.locator('#agentStatus')).toHaveText('LISTENING');
  socket.send(JSON.stringify({ type: 'response.started' }));
  socket.send(JSON.stringify({ type: 'output.audio.delta', audio: Buffer.alloc(48_000 * 2, 20).toString('base64') }));
  await expect(page.locator('#agentStatus')).toHaveText('SPEAKING');
  await page.locator('[data-avatar="pixel-bot"]').click();
  await expect(page.locator('.stage-wrap')).toHaveAttribute('data-renderer', '2d');
  await expect(page.locator('[data-avatar="pixel-bot"]')).toBeEnabled();
  await page.locator('[data-avatar="mochi"]').click();
  await expect(page.locator('.stage-wrap')).toHaveAttribute('data-loaded', 'true');
  await page.locator('#agentInterruptButton').click();
  await page.locator('#agentDisconnectButton').click();
  await expect(page.locator('#agentStatus')).toHaveText('DISCONNECTED');
  await expect(page.locator('#mouthState')).toHaveText('CLOSED');
  expect(connections).toBe(1);
  expect(errors).toEqual([]);
});
