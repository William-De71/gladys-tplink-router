// -----------------------------------------------------------------------------
// Entry point of the TP-Link / Mercusys Router external integration.
//
// Brings a TP-Link (Archer…) or Mercusys router into Gladys, over the web
// interface of the router on the LAN:
//   - devices: the router (CPU, memory, internet link, WAN address, time
//     connected, clients, firmware), its Wi-Fi networks (main, guest, IoT;
//     switches) and the clients of the network (presence), offered on the
//     Discovery screen (see src/device.js);
//   - scene triggers: internet down or back, public IP address changed,
//     device arrived or left, new device on the network;
//   - scene actions: read the status, turn Wi-Fi networks on or off, reboot;
//   - dashboard widgets: overview, internet, Wi-Fi, network devices.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the TP-Link / Mercusys Router integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
