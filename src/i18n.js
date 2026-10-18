// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, states, widget contents, scene
// summaries, messages of the Configuration screen. Vocabulary of the Gladys
// interface: appareil / Gerät / dispositivo, scène / Szene / escena; and of
// the TP-Link interface: réseau invité / Gastnetzwerk / red de invitados,
// micrologiciel / Firmware / firmware.
//
// Widget limits: a button label holds 24 characters, a status row 40
// (label and value together).
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // devices
  routerDeviceName: {
    en: 'TP-Link {model}',
    fr: 'TP-Link {model}',
    de: 'TP-Link {model}',
    es: 'TP-Link {model}',
  },
  routerDeviceNameUnknown: {
    en: 'TP-Link router',
    fr: 'Routeur TP-Link',
    de: 'TP-Link-Router',
    es: 'Router TP-Link',
  },
  wifiDeviceName_host: {
    en: 'Wi-Fi {band}',
    fr: 'Wi-Fi {band}',
    de: 'WLAN {band}',
    es: 'Wi-Fi {band}',
  },
  wifiDeviceName_guest: {
    en: 'Guest Wi-Fi {band}',
    fr: 'Wi-Fi invité {band}',
    de: 'Gast-WLAN {band}',
    es: 'Wi-Fi invitados {band}',
  },
  wifiDeviceName_iot: {
    en: 'IoT Wi-Fi {band}',
    fr: 'Wi-Fi IoT {band}',
    de: 'IoT-WLAN {band}',
    es: 'Wi-Fi IoT {band}',
  },
  band_2g: { en: '2.4 GHz', fr: '2,4 GHz', de: '2,4 GHz', es: '2,4 GHz' },
  band_5g: { en: '5 GHz', fr: '5 GHz', de: '5 GHz', es: '5 GHz' },
  band_6g: { en: '6 GHz', fr: '6 GHz', de: '6 GHz', es: '6 GHz' },
  band_mlo: { en: 'MLO', fr: 'MLO', de: 'MLO', es: 'MLO' },
  featureCpu: { en: 'CPU usage', fr: 'Utilisation CPU', de: 'CPU-Auslastung', es: 'Uso de CPU' },
  featureMemory: {
    en: 'Memory usage',
    fr: 'Utilisation mémoire',
    de: 'Speicherauslastung',
    es: 'Uso de memoria',
  },
  featureInternet: { en: 'Internet', fr: 'Internet', de: 'Internet', es: 'Internet' },
  featureWanIp: {
    en: 'WAN IP address',
    fr: 'Adresse IP WAN',
    de: 'WAN-IP-Adresse',
    es: 'Dirección IP WAN',
  },
  featureInternetUptime: {
    en: 'Internet connected for',
    fr: 'Internet connecté depuis',
    de: 'Internet verbunden seit',
    es: 'Internet conectado desde',
  },
  featureClients: {
    en: 'Connected clients',
    fr: 'Clients connectés',
    de: 'Verbundene Clients',
    es: 'Clientes conectados',
  },
  featureClientsWifi: {
    en: 'Wi-Fi clients',
    fr: 'Clients Wi-Fi',
    de: 'WLAN-Clients',
    es: 'Clientes Wi-Fi',
  },
  featureClientsWired: {
    en: 'Wired clients',
    fr: 'Clients filaires',
    de: 'Kabel-Clients',
    es: 'Clientes por cable',
  },
  featureClientsGuest: {
    en: 'Guest clients',
    fr: 'Clients invités',
    de: 'Gast-Clients',
    es: 'Clientes invitados',
  },
  featureFirmware: { en: 'Firmware', fr: 'Micrologiciel', de: 'Firmware', es: 'Firmware' },
  featureWifi: { en: 'Wi-Fi network', fr: 'Réseau Wi-Fi', de: 'WLAN-Netz', es: 'Red Wi-Fi' },
  featurePresence: { en: 'Presence', fr: 'Présence', de: 'Anwesenheit', es: 'Presencia' },

  // states
  internet_connected: { en: 'Connected', fr: 'Connecté', de: 'Verbunden', es: 'Conectado' },
  internet_disconnected: {
    en: 'Disconnected',
    fr: 'Déconnecté',
    de: 'Getrennt',
    es: 'Desconectado',
  },
  internet_unknown: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },
  connectionWired: { en: 'Wired', fr: 'Filaire', de: 'Kabel', es: 'Por cable' },
  connectionNetwork_guest: {
    en: 'Guest Wi-Fi',
    fr: 'Wi-Fi invité',
    de: 'Gast-WLAN',
    es: 'Wi-Fi invitados',
  },
  connectionNetwork_iot: { en: 'IoT Wi-Fi', fr: 'Wi-Fi IoT', de: 'IoT-WLAN', es: 'Wi-Fi IoT' },
  connType_dhcp: { en: 'Dynamic IP', fr: 'IP dynamique', de: 'Dynamische IP', es: 'IP dinámica' },
  connType_static: { en: 'Static IP', fr: 'IP statique', de: 'Statische IP', es: 'IP estática' },
  connType_pppoe: { en: 'PPPoE', fr: 'PPPoE', de: 'PPPoE', es: 'PPPoE' },
  connType_l2tp: { en: 'L2TP', fr: 'L2TP', de: 'L2TP', es: 'L2TP' },
  connType_pptp: { en: 'PPTP', fr: 'PPTP', de: 'PPTP', es: 'PPTP' },
  stateOn: { en: 'On', fr: 'Activé', de: 'Ein', es: 'Activada' },
  stateOff: { en: 'Off', fr: 'Désactivé', de: 'Aus', es: 'Desactivada' },

  // scene summaries
  summaryInternet_connected: {
    en: 'The internet connection is back (IP {ip}).',
    fr: 'La connexion Internet est rétablie (IP {ip}).',
    de: 'Die Internetverbindung ist wieder da (IP {ip}).',
    es: 'La conexión a Internet se ha restablecido (IP {ip}).',
  },
  summaryInternet_disconnected: {
    en: 'The internet connection of the router is down.',
    fr: 'La connexion Internet du routeur est coupée.',
    de: 'Die Internetverbindung des Routers ist unterbrochen.',
    es: 'La conexión a Internet del router está caída.',
  },
  summaryWanIp: {
    en: 'The public IP address changed: {ip} (was {previous}).',
    fr: 'L’adresse IP publique a changé : {ip} (avant : {previous}).',
    de: 'Die öffentliche IP-Adresse hat sich geändert: {ip} (vorher {previous}).',
    es: 'La dirección IP pública ha cambiado: {ip} (antes {previous}).',
  },
  summaryPresence_arrived: {
    en: '{name} is connected to the network.',
    fr: '{name} est connecté au réseau.',
    de: '{name} ist mit dem Netzwerk verbunden.',
    es: '{name} está conectado a la red.',
  },
  summaryPresence_left: {
    en: '{name} left the network.',
    fr: '{name} a quitté le réseau.',
    de: '{name} hat das Netzwerk verlassen.',
    es: '{name} ha salido de la red.',
  },
  summaryNewClient: {
    en: 'New device on the network: {name} ({ip}, {connection}).',
    fr: 'Nouvel appareil sur le réseau : {name} ({ip}, {connection}).',
    de: 'Neues Gerät im Netzwerk: {name} ({ip}, {connection}).',
    es: 'Nuevo dispositivo en la red: {name} ({ip}, {connection}).',
  },
  summaryStatus: {
    en: 'Router: CPU {cpu} %, memory {memory} %.',
    fr: 'Routeur : CPU {cpu} %, mémoire {memory} %.',
    de: 'Router: CPU {cpu} %, Speicher {memory} %.',
    es: 'Router: CPU {cpu} %, memoria {memory} %.',
  },
  summaryStatusInternet_connected: {
    en: 'Internet connected ({ip}).',
    fr: 'Internet connecté ({ip}).',
    de: 'Internet verbunden ({ip}).',
    es: 'Internet conectado ({ip}).',
  },
  summaryStatusInternet_disconnected: {
    en: 'Internet disconnected.',
    fr: 'Internet déconnecté.',
    de: 'Internet getrennt.',
    es: 'Internet desconectado.',
  },
  summaryStatusInternet_unknown: {
    en: 'Internet status unknown.',
    fr: 'État d’Internet inconnu.',
    de: 'Internetstatus unbekannt.',
    es: 'Estado de Internet desconocido.',
  },
  summaryStatusClients: {
    en: '{count} device(s) on the network, {guests} on the guest Wi-Fi.',
    fr: '{count} appareil(s) sur le réseau, {guests} sur le Wi-Fi invité.',
    de: '{count} Gerät(e) im Netzwerk, {guests} im Gast-WLAN.',
    es: '{count} dispositivo(s) en la red, {guests} en el Wi-Fi de invitados.',
  },
  summaryWifiOn: {
    en: '{count} Wi-Fi network(s) turned on.',
    fr: '{count} réseau(x) Wi-Fi activé(s).',
    de: '{count} WLAN-Netz(e) eingeschaltet.',
    es: '{count} red(es) Wi-Fi activada(s).',
  },
  summaryWifiOff: {
    en: '{count} Wi-Fi network(s) turned off.',
    fr: '{count} réseau(x) Wi-Fi désactivé(s).',
    de: '{count} WLAN-Netz(e) ausgeschaltet.',
    es: '{count} red(es) Wi-Fi desactivada(s).',
  },

  // widgets
  overviewCaption: {
    en: '{model} · {ip} · {ago}',
    fr: '{model} · {ip} · {ago}',
    de: '{model} · {ip} · {ago}',
    es: '{model} · {ip} · {ago}',
  },
  durationHours: {
    en: '{hours} h {minutes} min',
    fr: '{hours} h {minutes} min',
    de: '{hours} Std. {minutes} Min.',
    es: '{hours} h {minutes} min',
  },
  durationDays: {
    en: '{days} d {hours} h',
    fr: '{days} j {hours} h',
    de: '{days} T. {hours} Std.',
    es: '{days} d {hours} h',
  },
  tileCpu: { en: 'CPU', fr: 'CPU', de: 'CPU', es: 'CPU' },
  tileMemory: { en: 'Memory', fr: 'Mémoire', de: 'Speicher', es: 'Memoria' },
  tileClients: { en: 'Clients', fr: 'Clients', de: 'Clients', es: 'Clientes' },
  tileGuests: { en: 'Guests', fr: 'Invités', de: 'Gäste', es: 'Invitados' },
  tileConnectedFor: {
    en: 'Connected for',
    fr: 'Connecté depuis',
    de: 'Verbunden seit',
    es: 'Conectado desde',
  },
  rowInternet: { en: 'Internet', fr: 'Internet', de: 'Internet', es: 'Internet' },
  rowConnectedFor: {
    en: 'Connected for',
    fr: 'Connecté depuis',
    de: 'Verbunden seit',
    es: 'Conectado desde',
  },
  rowFirmware: { en: 'Firmware', fr: 'Micrologiciel', de: 'Firmware', es: 'Firmware' },
  rowReadings: { en: 'Readings', fr: 'Lectures', de: 'Abfragen', es: 'Lecturas' },
  readingsActive: {
    en: 'every {seconds} s',
    fr: 'toutes les {seconds} s',
    de: 'alle {seconds} s',
    es: 'cada {seconds} s',
  },
  readingsPaused: {
    en: 'paused ({minutes} min left)',
    fr: 'en pause (encore {minutes} min)',
    de: 'pausiert (noch {minutes} Min.)',
    es: 'en pausa (quedan {minutes} min)',
  },
  rowWanIp: { en: 'WAN IP', fr: 'IP WAN', de: 'WAN-IP', es: 'IP WAN' },
  rowGateway: { en: 'Gateway', fr: 'Passerelle', de: 'Gateway', es: 'Puerta de enlace' },
  rowDns1: { en: 'Primary DNS', fr: 'DNS primaire', de: 'Primärer DNS', es: 'DNS primario' },
  rowDns2: {
    en: 'Secondary DNS',
    fr: 'DNS secondaire',
    de: 'Sekundärer DNS',
    es: 'DNS secundario',
  },
  rowIpv6: { en: 'IPv6', fr: 'IPv6', de: 'IPv6', es: 'IPv6' },
  buttonPause: {
    en: 'Pause for {minutes} min',
    fr: 'Pause de {minutes} min',
    de: '{minutes} Min. pausieren',
    es: 'Pausa de {minutes} min',
  },
  buttonResume: {
    en: 'Resume readings',
    fr: 'Reprendre les lectures',
    de: 'Abfragen fortsetzen',
    es: 'Reanudar lecturas',
  },
  buttonReboot: { en: 'Reboot', fr: 'Redémarrer', de: 'Neu starten', es: 'Reiniciar' },
  button_guest_on: {
    en: 'Turn guest Wi-Fi on',
    fr: 'Activer le Wi-Fi invité',
    de: 'Gast-WLAN einschalten',
    es: 'Activar Wi-Fi invitados',
  },
  button_guest_off: {
    en: 'Turn guest Wi-Fi off',
    fr: 'Couper le Wi-Fi invité',
    de: 'Gast-WLAN ausschalten',
    es: 'Apagar Wi-Fi invitados',
  },
  button_iot_on: {
    en: 'Turn IoT Wi-Fi on',
    fr: 'Activer le Wi-Fi IoT',
    de: 'IoT-WLAN einschalten',
    es: 'Activar Wi-Fi IoT',
  },
  button_iot_off: {
    en: 'Turn IoT Wi-Fi off',
    fr: 'Couper le Wi-Fi IoT',
    de: 'IoT-WLAN ausschalten',
    es: 'Apagar Wi-Fi IoT',
  },
  internetCaption: {
    en: 'Internet · {type}',
    fr: 'Internet · {type}',
    de: 'Internet · {type}',
    es: 'Internet · {type}',
  },
  noWan: {
    en: 'The router reports no internet link (access point mode?).',
    fr: 'Le routeur n’indique aucun lien Internet (mode point d’accès ?).',
    de: 'Der Router meldet keine Internetverbindung (Access-Point-Modus?).',
    es: 'El router no indica ningún enlace a Internet (¿modo punto de acceso?).',
  },
  noWifi: {
    en: 'The router reports no Wi-Fi network.',
    fr: 'Le routeur n’indique aucun réseau Wi-Fi.',
    de: 'Der Router meldet kein WLAN-Netz.',
    es: 'El router no indica ninguna red Wi-Fi.',
  },
  wifiCaption: {
    en: '{on} of {total} Wi-Fi networks on',
    fr: '{on} réseau(x) Wi-Fi activé(s) sur {total}',
    de: '{on} von {total} WLAN-Netzen eingeschaltet',
    es: '{on} de {total} redes Wi-Fi activadas',
  },
  networkCaption: {
    en: '{present} connected of {total} known',
    fr: '{present} connecté(s) sur {total} connu(s)',
    de: '{present} verbunden von {total} bekannten',
    es: '{present} conectado(s) de {total} conocido(s)',
  },
  networkMore: {
    en: '{count} more',
    fr: '{count} de plus',
    de: '{count} weitere',
    es: '{count} más',
  },
  networkEmpty_present: {
    en: 'No device is connected to the router right now.',
    fr: 'Aucun appareil n’est connecté au routeur en ce moment.',
    de: 'Derzeit ist kein Gerät mit dem Router verbunden.',
    es: 'Ningún dispositivo está conectado al router en este momento.',
  },
  networkEmpty_absent: {
    en: 'No device left the network since the integration started.',
    fr: 'Aucun appareil n’a quitté le réseau depuis le démarrage de l’intégration.',
    de: 'Seit dem Start der Integration hat kein Gerät das Netzwerk verlassen.',
    es: 'Ningún dispositivo ha salido de la red desde que se inició la integración.',
  },
  networkEmpty_all: {
    en: 'The router knows no device on the network yet.',
    fr: 'Le routeur ne connaît encore aucun appareil sur le réseau.',
    de: 'Der Router kennt noch kein Gerät im Netzwerk.',
    es: 'El router todavía no conoce ningún dispositivo en la red.',
  },
  badgeHere: { en: 'Here', fr: 'Présent', de: 'Da', es: 'Presente' },
  badgeWired: { en: 'Wired', fr: 'Filaire', de: 'Kabel', es: 'Cable' },
  badge_guest: { en: 'Guest', fr: 'Invité', de: 'Gast', es: 'Invitado' },
  badge_iot: { en: 'IoT', fr: 'IoT', de: 'IoT', es: 'IoT' },
  badgeGone: { en: 'Gone', fr: 'Parti', de: 'Weg', es: 'Ausente' },
  ago_now: { en: 'just now', fr: 'à l’instant', de: 'gerade eben', es: 'ahora mismo' },
  ago_minutes: {
    en: '{n} min ago',
    fr: 'il y a {n} min',
    de: 'vor {n} Min.',
    es: 'hace {n} min',
  },
  ago_hours: { en: '{n} h ago', fr: 'il y a {n} h', de: 'vor {n} Std.', es: 'hace {n} h' },
  ago_days: {
    en: '{n} days ago',
    fr: 'il y a {n} jours',
    de: 'vor {n} Tagen',
    es: 'hace {n} días',
  },

  // connection status, actions, messages
  noCredentials: {
    en: 'Enter the address of the router and its password in the configuration.',
    fr: 'Saisissez l’adresse du routeur et son mot de passe dans la configuration.',
    de: 'Geben Sie die Adresse des Routers und sein Passwort in der Konfiguration ein.',
    es: 'Introduzca la dirección del router y su contraseña en la configuración.',
  },
  notReadYet: {
    en: 'The router has not been read yet: come back in a few seconds.',
    fr: 'Le routeur n’a pas encore été lu : revenez dans quelques secondes.',
    de: 'Der Router wurde noch nicht gelesen: Schauen Sie in ein paar Sekunden wieder vorbei.',
    es: 'El router aún no se ha leído: vuelva en unos segundos.',
  },
  statusConnected: {
    en: '{model}: internet {internet}, {clients} device(s) on the network.',
    fr: '{model} : Internet {internet}, {clients} appareil(s) sur le réseau.',
    de: '{model}: Internet {internet}, {clients} Gerät(e) im Netzwerk.',
    es: '{model}: Internet {internet}, {clients} dispositivo(s) en la red.',
  },
  statusAuth: {
    en: 'The router refuses the password: check it (no new attempt for 15 minutes, to avoid a lockout).',
    fr: 'Le routeur refuse le mot de passe : vérifiez-le (pas de nouvel essai pendant 15 minutes, pour éviter un blocage).',
    de: 'Der Router lehnt das Passwort ab: Prüfen Sie es (15 Minuten kein neuer Versuch, um eine Sperre zu vermeiden).',
    es: 'El router rechaza la contraseña: compruébela (sin nuevo intento durante 15 minutos, para evitar un bloqueo).',
  },
  statusLocked: {
    en: 'The router locked the login after failed attempts: new attempt in {minutes} min.',
    fr: 'Le routeur a bloqué la connexion après des échecs : nouvel essai dans {minutes} min.',
    de: 'Der Router hat die Anmeldung nach Fehlversuchen gesperrt: neuer Versuch in {minutes} Min.',
    es: 'El router bloqueó el inicio de sesión tras varios fallos: nuevo intento en {minutes} min.',
  },
  statusUnsupported: {
    en: 'This TP-Link router uses a login the integration does not know yet: open an issue with its model and firmware.',
    fr: 'Ce routeur TP-Link utilise une connexion que l’intégration ne connaît pas encore : ouvrez une issue avec son modèle et son micrologiciel.',
    de: 'Dieser TP-Link-Router nutzt eine Anmeldung, die die Integration noch nicht kennt: Eröffnen Sie ein Issue mit Modell und Firmware.',
    es: 'Este router TP-Link usa un inicio de sesión que la integración aún no conoce: abra una issue con su modelo y firmware.',
  },
  statusTls: {
    en: 'The HTTPS certificate of the router is refused: untick “Verify the certificate” or use http://.',
    fr: 'Le certificat HTTPS du routeur est refusé : décochez « Vérifier le certificat » ou utilisez http://.',
    de: 'Das HTTPS-Zertifikat des Routers wird abgelehnt: Deaktivieren Sie „Zertifikat prüfen“ oder nutzen Sie http://.',
    es: 'El certificado HTTPS del router es rechazado: desmarque «Verificar el certificado» o use http://.',
  },
  statusNotFound: {
    en: 'This address does not answer like a TP-Link or Mercusys router web page: check the address.',
    fr: 'Cette adresse ne répond pas comme la page web d’un routeur TP-Link ou Mercusys : vérifiez l’adresse.',
    de: 'Diese Adresse antwortet nicht wie die Weboberfläche eines TP-Link- oder Mercusys-Routers: Prüfen Sie die Adresse.',
    es: 'Esta dirección no responde como la página web de un router TP-Link o Mercusys: compruebe la dirección.',
  },
  statusUnreachable: {
    en: 'The router does not answer at {url}: check the address and the network.',
    fr: 'Le routeur ne répond pas à {url} : vérifiez l’adresse et le réseau.',
    de: 'Der Router antwortet nicht unter {url}: Prüfen Sie Adresse und Netzwerk.',
    es: 'El router no responde en {url}: compruebe la dirección y la red.',
  },
  statusError: {
    en: 'The router answered something unexpected: see the logs of the integration.',
    fr: 'Le routeur a répondu quelque chose d’inattendu : voir les journaux de l’intégration.',
    de: 'Der Router hat unerwartet geantwortet: siehe Protokolle der Integration.',
    es: 'El router respondió algo inesperado: consulte los registros de la integración.',
  },
  testOk: {
    en: 'Connected to {model} (firmware {firmware}).',
    fr: 'Connecté à {model} (micrologiciel {firmware}).',
    de: 'Verbunden mit {model} (Firmware {firmware}).',
    es: 'Conectado a {model} (firmware {firmware}).',
  },
  forgotten: {
    en: 'Known devices forgotten: the next reading is the new reference, without alert.',
    fr: 'Appareils connus oubliés : la prochaine lecture sert de nouvelle référence, sans alerte.',
    de: 'Bekannte Geräte vergessen: Das nächste Lesen ist die neue Referenz, ohne Alarm.',
    es: 'Dispositivos conocidos olvidados: la próxima lectura es la nueva referencia, sin alerta.',
  },
  paused: {
    en: 'Readings paused for {minutes} min: you can open the web page of the router.',
    fr: 'Lectures en pause pour {minutes} min : vous pouvez ouvrir la page web du routeur.',
    de: 'Abfragen für {minutes} Min. pausiert: Sie können die Weboberfläche des Routers öffnen.',
    es: 'Lecturas en pausa durante {minutes} min: puede abrir la página web del router.',
  },
  resumed: {
    en: 'Readings resumed.',
    fr: 'Lectures reprises.',
    de: 'Abfragen fortgesetzt.',
    es: 'Lecturas reanudadas.',
  },
  rebooting: {
    en: 'The router is rebooting: the network is cut for a few minutes.',
    fr: 'Le routeur redémarre : le réseau est coupé quelques minutes.',
    de: 'Der Router startet neu: Das Netzwerk ist einige Minuten unterbrochen.',
    es: 'El router se está reiniciando: la red se corta unos minutos.',
  },
  noSuchWifi: {
    en: 'The router has no such Wi-Fi network.',
    fr: 'Le routeur n’a pas ce réseau Wi-Fi.',
    de: 'Der Router hat dieses WLAN-Netz nicht.',
    es: 'El router no tiene esa red Wi-Fi.',
  },
  unknownAction: {
    en: 'Unknown action.',
    fr: 'Action inconnue.',
    de: 'Unbekannte Aktion.',
    es: 'Acción desconocida.',
  },
};

/**
 * @description Whether a value is one of the languages of the integration.
 * @param {unknown} value - The value.
 * @returns {boolean} True for en, fr, de, es.
 */
function isLanguage(value) {
  return LANGUAGES.includes(value);
}

/**
 * @description Whether a text exists.
 * @param {string} key - The TEXTS key.
 * @returns {boolean} True when it does.
 */
const hasText = (key) => Object.hasOwn(TEXTS, key);

/**
 * @description A text in a language (English fallback), with its
 * substitutions.
 * @param {string} key - The TEXTS key.
 * @param {string} language - The language.
 * @param {object} [values] - The substitutions.
 * @returns {string} The text.
 * @example
 * t('wifiDeviceName_guest', 'de', { band: '5 GHz' }); // -> 'Gast-WLAN 5 GHz'
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[language] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

/**
 * @description The text in every language, for a multi-language message.
 * @param {string} key - The TEXTS key.
 * @param {object} [values] - The substitutions.
 * @returns {{ en: string, fr: string, de: string, es: string }} The message.
 * @example
 * all('testOk', { model: 'Archer AX55 v1.0', firmware: '1.1.3 Build 20230411' });
 */
function all(key, values = {}) {
  return Object.fromEntries(LANGUAGES.map((language) => [language, t(key, language, values)]));
}

/**
 * @description A number written the way a language does, with at most
 * `digits` decimals ("7,2" in French).
 * @param {number|null} value - The number.
 * @param {string} language - The language.
 * @param {number} digits - The decimals.
 * @returns {string} The text, "?" when unknown.
 * @example
 * formatNumber(7.25, 'fr', 1); // -> '7,3'
 */
function formatNumber(value, language, digits) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '?';
  }
  return new Intl.NumberFormat(isLanguage(language) ? language : 'en', {
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * @description "12 min ago" for an instant.
 * @param {number} instant - The instant, in ms.
 * @param {number} now - Now, in ms.
 * @param {string} language - The language.
 * @returns {string} The relative time.
 * @example
 * ago(Date.now() - 600000, Date.now(), 'en'); // -> '10 min ago'
 */
function ago(instant, now, language) {
  const minutes = Math.max(0, Math.floor((now - instant) / 60000));
  if (minutes < 1) {
    return t('ago_now', language);
  }
  if (minutes < 60) {
    return t('ago_minutes', language, { n: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return t('ago_hours', language, { n: hours });
  }
  return t('ago_days', language, { n: Math.floor(hours / 24) });
}

export { LANGUAGES, TEXTS, isLanguage, hasText, t, all, formatNumber, ago };
