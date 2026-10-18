# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - 2026-10-18

### Added

- A TP-Link or Mercusys router device (Archer and Mercusys routers with the current web page): CPU and memory usage, internet status, WAN IP address, time connected, connected clients (all, Wi-Fi, wired, guest) and firmware version.
- A switch per Wi-Fi network (main, guest and IoT Wi-Fi, per band): turn the guest Wi-Fi on from a dashboard or a scene.
- Devices of the network as presence sensors, from the client list of the router, with an absence delay.
- Scene triggers: internet down or back, public IP address changed, device arrived or left, new device on the network.
- Scene actions: read the status, turn the main, guest or IoT Wi-Fi on or off (one band or all), reboot.
- Dashboard widgets: router overview (with "pause" and "reboot" buttons), internet link, Wi-Fi networks (with a guest Wi-Fi button), network devices.
- The four login variants of the web page (classic, Archer AX72, "SG / CE RED" certified models, RSA-only firmware 1.11+), found and remembered automatically.
- A pause of the readings, to use the web page of the router, which admits one administrator at a time.
- Local transport only: one session per reading, and no new attempt for 15 minutes after a refused password so that the router does not lock the login.
- English, French, German and Spanish everywhere: settings, devices, widgets, scenes and documentation.

[0.1.0]: https://github.com/William-De71/gladys-tplink-router/releases/tag/v0.1.0
