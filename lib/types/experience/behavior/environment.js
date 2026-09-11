/**
 * The emulated profiles, expressed the way the browser's own emulation wants
 * them: bytes per second, not the kilobits per second the names suggest.
 */
export const NETWORK_PROFILES = {
    offline: { downloadBytesPerSecond: 0, uploadBytesPerSecond: 0, latencyMs: 0 },
    slow3g: { downloadBytesPerSecond: 400 * 1024 / 8, uploadBytesPerSecond: 400 * 1024 / 8, latencyMs: 400 },
    fast3g: { downloadBytesPerSecond: 1_600 * 1024 / 8, uploadBytesPerSecond: 750 * 1024 / 8, latencyMs: 150 },
    slow4g: { downloadBytesPerSecond: 4_000 * 1024 / 8, uploadBytesPerSecond: 3_000 * 1024 / 8, latencyMs: 100 },
};
/**
 * Apply a persona's environment to one page.
 *
 * CPU throttling is applied after the network profile so a page that is both slow
 * and CPU-bound is measured under both, and both are lifted together.
 * @param page - the page to condition.
 * @param environment - the policy to apply.
 * @returns what was applied and how to remove it.
 */
export async function applyEnvironment(page, environment) {
    const profileName = environment.network;
    const cpuThrottle = environment.cpuThrottle;
    if (profileName === undefined && cpuThrottle === undefined) {
        return { applied: [], restore: async () => undefined };
    }
    const cdp = await page.context().newCDPSession(page);
    const applied = [];
    if (profileName !== undefined) {
        const profile = NETWORK_PROFILES[profileName];
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions', {
            offline: profileName === 'offline',
            downloadThroughput: profile.downloadBytesPerSecond,
            uploadThroughput: profile.uploadBytesPerSecond,
            latency: profile.latencyMs,
        });
        applied.push(profileName);
    }
    if (cpuThrottle !== undefined) {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
        applied.push('cpu×' + String(cpuThrottle));
    }
    return {
        applied,
        async restore() {
            if (cpuThrottle !== undefined)
                await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
            if (profileName !== undefined) {
                await cdp.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: -1, uploadThroughput: -1, latency: 0 });
            }
        },
    };
}
