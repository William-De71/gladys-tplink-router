# TP-Link / Mercusys Router

## Überblick

Diese Integration bringt einen **TP-Link- oder Mercusys-Router** in Gladys: die Archer-Router mit der aktuellen Weboberfläche (Archer C6, AX, BE, GX…) und die darauf aufbauenden Mercusys-Router. Sie liest den Router über seine eigene Weboberfläche, in Ihrem lokalen Netzwerk, jede Minute:

- den **Router**: CPU- und Speicherauslastung, Internetstatus, WAN-Adresse, Verbindungsdauer, verbundene Clients (WLAN, Kabel, Gäste), Firmware;
- seine **WLAN-Netze** (Haupt-, Gast- und IoT-WLAN, je Band) als Schalter;
- die **Geräte Ihres Netzwerks** als Anwesenheitssensoren: wissen, wer zu Hause ist, über die mit dem WLAN verbundenen Telefone.

Dazu kommen Szenen-Auslöser (Internet weg oder zurück, öffentliche IP-Adresse geändert, Gerät gekommen oder gegangen, neues Gerät im Netzwerk), Szenen-Aktionen (Status lesen, WLAN-Netze ein- oder ausschalten, neu starten) und vier Dashboard-Widgets.

![Die vier Widgets der Integration: Übersicht des TP-Link-Routers, Internetverbindung, WLAN-Netze und Netzwerkgeräte (generierte Illustration, kein Screenshot)](https://raw.githubusercontent.com/William-De71/gladys-tplink-router/main/docs/assets/widgets.de.png)

Das Bild oben ist eine generierte Illustration, kein Screenshot.

## Voraussetzungen

- Gladys Assistant 5.3.0 oder neuer.
- Ein TP-Link- oder Mercusys-Router, dessen Weboberfläche `/webpages/index.html` in der Adressleiste zeigt. Vier Anmeldevarianten dieser Oberfläche werden unterstützt (die Integration findet die richtige). Deco-Systeme (nur App), die 4G/5G-Modelle mit einer anderen Weboberfläche (Archer MR, TL-MR, EX, VR) und ältere Router (TL-WR841N, Archer C50) werden noch nicht unterstützt.
- Das **lokale Passwort** des Routers, das seiner Weboberfläche, nicht das Passwort einer TP-Link-ID.
- Gladys muss den Router erreichen: seine LAN-Adresse (`192.168.0.1`, `192.168.1.1`, `tplinkwifi.net`). `https://` funktioniert nur, wenn **Lokale Verwaltung über HTTPS** im Router aktiviert ist.
- Gut zu wissen: Die Weboberfläche des Routers lässt **nur einen Administrator gleichzeitig** zu. Jede Abfrage meldet sich an und ab und meldet Sie von der Weboberfläche ab, falls sie offen ist. Nutzen Sie vor dem Öffnen die **Pause** (siehe unten).

## Konfiguration

| Feld                      | Beschreibung                                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Adresse des Routers       | `192.168.0.1` (http:// wird ergänzt) oder `https://192.168.0.1` mit HTTPS.                                                  |
| Lokales Passwort          | Das Passwort der Weboberfläche. Nach mehreren Fehlversuchen sperrt der Router die Anmeldung eine Weile.                     |
| Benutzername              | Leer lassen für `admin`. Einige EX-Modelle erwarten `user`.                                                                 |
| Zertifikat prüfen         | Nur HTTPS. Mit dem selbstsignierten Zertifikat des Routers nicht ankreuzen.                                                 |
| Leseintervall (s)         | 30 bis 600 Sekunden, standardmäßig 60.                                                                                      |
| Pausendauer (Min.)        | Wie lange die Pause die Abfragen anhält. Standardmäßig 20.                                                                  |
| Angebotene Netzwerkgeräte | Die mit einem Namen (Standard), alle oder keine.                                                                            |
| Abwesenheitsverzögerung   | Ein Gerät gilt nach dieser Zeit ohne Verbindung als abwesend. Standardmäßig 5: Ein schlafendes Telefon verlässt das WLAN.   |
| Sprache der Texte         | Namen, Zustände und Szenen-Zusammenfassungen. Automatisch: die Sprache Ihres Dashboards, sobald ein Widget angezeigt wurde. |

Klicken Sie auf **Verbindung testen**: Modell und Firmware des Routers werden angezeigt. **Abfragen pausieren** und **Abfragen fortsetzen** geben die Weboberfläche des Routers frei und übernehmen danach wieder. **Bekannte Geräte vergessen** macht die jetzt vorhandenen Geräte zur Referenz des Auslösers „neues Gerät“.

## Verwendung

### Geräte

Öffnen Sie **Erkennen** in der Integration und fügen Sie die gewünschten Geräte hinzu:

| Gerät          | Funktionen                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| TP-Link-Router | CPU- und Speicherauslastung (%), Internet, WAN-IP, Internet verbunden seit (Std.), Clients, WLAN-Clients, Kabel-Clients, Gast-Clients, Firmware |
| WLAN-Netz      | Ein Schalter: schaltet ein Netz (Haupt-, Gast- oder IoT-WLAN) auf einem Band ein oder aus                                                       |
| Netzwerkgerät  | Anwesenheit: 1, solange es verbunden ist, 0, sobald es seit der Abwesenheitsverzögerung weg ist                                                 |

CPU, Speicher und Verbindungsdauer erscheinen nur, wenn der Router sie meldet: Nicht jede Firmware tut das.

### Anwesenheit der Geräte

Ein Gerät ist anwesend, sobald der Router es auflistet, und abwesend, sobald es seit der Abwesenheitsverzögerung weg ist. Solange es anwesend ist, wird seine Anwesenheit jede Minute erneut gesendet, wie die Bluetooth-Anwesenheit von Gladys: Die Szenen-Aktion „Anwesenheit prüfen“ funktioniert damit. Geben Sie den Telefonen im Router einen Namen (**Netzwerkübersicht > Clients** oder in der Tether-App), um sie leicht zu finden: Standardmäßig werden nur Geräte mit Namen angeboten.

### WLAN-Netze

Jedes WLAN-Netz, das der Router meldet, wird zu einem Schalter: das Haupt-, das Gast- und das IoT-WLAN, eines je Band (2,4, 5 und 6 GHz). Ein im Router oder in der Tether-App geschaltetes Netz erscheint bei der nächsten Abfrage in Gladys. Das Haupt-WLAN aus Gladys auszuschalten trennt die Geräte, die es nutzen: Gladys hängt besser am Kabel.

### Abfragen pausieren

Da der Router nur einen Administrator gleichzeitig zulässt, meldet Sie seine Weboberfläche bei jeder Abfrage ab. Drücken Sie vor dem Öffnen **Pause** im Widget TP-Link-Router (oder **Abfragen pausieren** in der Konfiguration): Gladys hört für die Pausendauer auf zu lesen und macht danach von selbst weiter. Die Anwesenheit bleibt währenddessen eingefroren: Niemand wird wegen der Pause als abwesend markiert.

### Dashboard-Widgets

- **TP-Link-Router**: CPU- und Speicheranzeige, verbundene Clients, Gäste, Internet, Verbindungsdauer, Firmware, Abfragen und zwei Schaltflächen: **Pause** (oder **Fortsetzen**) und **Neu starten** (mit Bestätigung).
- **Internetverbindung**: Verbindungsdauer, Status, WAN-Adresse, Gateway, DNS-Server, IPv6-Adresse.
- **WLAN-Netze**: jedes Netz und sein Zustand sowie eine Schaltfläche, die das Gast-WLAN auf allen Bändern ein- oder ausschaltet (ebenso für das IoT-WLAN).
- **Netzwerkgeräte**: die jetzt verbundenen Geräte, die gegangenen oder alle, mit ihrer Verbindung (Kabel, WLAN-Band, Gast). Einstellung: was angezeigt wird.

### Szenen

Auslöser:

- **Internet weg oder zurück**: Filter auf den Status. Variablen: Status, WAN-IP, Zusammenfassung.
- **Öffentliche IP-Adresse geändert**: Der Anbieter hat dem Router eine neue Adresse gegeben. Variablen: neue und vorherige Adresse, Zusammenfassung.
- **Gerät gekommen oder gegangen**: ein in Gladys hinzugefügtes Gerät oder jedes. Variablen: Name, Ereignis, MAC, IP, Verbindung, Zusammenfassung.
- **Neues Gerät im Netzwerk**: eine nie gesehene MAC-Adresse, einmal (über Neustarts hinweg gespeichert). Filter: WLAN oder Kabel, Haupt-, Gast- oder IoT-Netz.

Aktionen:

- **Status lesen**: CPU, Speicher, Internet, WAN-IP, Verbindungsdauer, anwesende Geräte, Gäste, Modell, Firmware und eine Zusammenfassung für eine Nachricht.
- **WLAN ein- oder ausschalten**: das Haupt-, Gast- oder IoT-WLAN, auf einem oder allen Bändern.
- **Router neu starten**: Netzwerk und Internet sind einige Minuten unterbrochen.

Beispiele: Wenn Besuch kommt (eine Taste, ein Kalendereintrag), das Gast-WLAN einschalten und um Mitternacht wieder aus; wenn sich die öffentliche IP-Adresse ändert, sie per Nachricht senden; wenn das Telefon eines Kindes ankommt, das Flurlicht einschalten.

### Übertragung

Nur lokal: Die Integration spricht mit der Weboberfläche des Routers in Ihrem Netzwerk, nichts läuft über eine Cloud.

## Fehlerbehebung

- **„Der Router lehnt das Passwort ab“**: Geben Sie das lokale Passwort erneut ein (nicht das der TP-Link-ID); die Integration wartet 15 Minuten vor einem neuen Versuch, damit der Router die Anmeldung nicht sperrt. Das Speichern der Konfiguration versucht es sofort.
- **„Der Router hat die Anmeldung gesperrt“**: zu viele Fehlversuche (aus Gladys oder einem Browser). Warten Sie die angezeigte Zeit ab.
- **„antwortet nicht wie die Weboberfläche eines TP-Link- oder Mercusys-Routers“**: Prüfen Sie die Adresse; das Modell nutzt vielleicht eine andere Weboberfläche (Deco, 4G/5G-Modelle).
- **„nutzt eine Anmeldung, die die Integration noch nicht kennt“**: Eröffnen Sie ein Issue mit Modell, Hardwareversion und Firmware.
- **Von der Weboberfläche des Routers abgemeldet**: Das ist die Abfrage von Gladys; pausieren Sie die Abfragen zuerst.
- **Ein Telefon erscheint abwesend, obwohl es da ist**: Erhöhen Sie die Abwesenheitsverzögerung; manche Telefone schicken ihr WLAN lange schlafen.
- **Protokolle**: Öffnen Sie die Protokolle der Integration in Gladys, dann ein Issue auf [GitHub](https://github.com/William-De71/gladys-tplink-router/issues) mit den Versionen von Gladys und der Integration, Modell und Firmware des Routers und den Protokollen (das Passwort erscheint darin nie).
