# TP-Link / Mercusys Router

## Présentation

Cette intégration amène un **routeur TP-Link ou Mercusys** dans Gladys : les routeurs Archer dotés de la page web actuelle (Archer C6, AX, BE, GX…) et les routeurs Mercusys construits dessus. Elle lit le routeur par sa propre page web, sur votre réseau local, toutes les minutes :

- le **routeur** : utilisation du CPU et de la mémoire, état d’Internet, adresse WAN, durée de connexion, clients connectés (Wi-Fi, filaires, invités), micrologiciel ;
- ses **réseaux Wi-Fi** (principal, invité et IoT, par bande), en interrupteurs ;
- les **appareils de votre réseau**, en capteurs de présence : savoir qui est à la maison grâce aux téléphones connectés au Wi-Fi.

Elle apporte aussi des déclencheurs de scène (Internet coupé ou rétabli, adresse IP publique changée, appareil arrivé ou parti, nouvel appareil sur le réseau), des actions de scène (lire l’état, activer ou couper des réseaux Wi-Fi, redémarrer) et quatre widgets de tableau de bord.

![Les quatre widgets de l’intégration : vue d’ensemble du routeur TP-Link, lien Internet, réseaux Wi-Fi et appareils du réseau (illustration générée, pas une capture d’écran)](https://raw.githubusercontent.com/William-De71/gladys-tplink-router/main/docs/assets/widgets.fr.png)

L’image ci-dessus est une illustration générée, pas une capture d’écran.

## Prérequis

- Gladys Assistant 5.1.0 ou plus récent.
- Un routeur TP-Link ou Mercusys dont la page web affiche `/webpages/index.html` dans la barre d’adresse. Quatre variantes de connexion de cette page sont prises en charge (l’intégration trouve la bonne). Les systèmes Deco (application seulement), les modèles 4G/5G dotés d’une autre page web (Archer MR, TL-MR, EX, VR) et les anciens routeurs (TL-WR841N, Archer C50) ne sont pas encore pris en charge.
- Le **mot de passe local** du routeur, celui de sa page web, pas le mot de passe d’un TP-Link ID.
- Gladys doit joindre le routeur : son adresse sur le réseau local (`192.168.0.1`, `192.168.1.1`, `tplinkwifi.net`). `https://` ne fonctionne que si la **gestion locale via HTTPS** est activée dans le routeur.
- Bon à savoir : la page web du routeur n’admet **qu’un administrateur à la fois**. Chaque lecture se connecte puis se déconnecte, et vous déconnecte de la page web si elle est ouverte. Utilisez la **pause** (voir plus bas) avant de l’ouvrir.

## Configuration

| Champ                        | Description                                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Adresse du routeur           | `192.168.0.1` (http:// est ajouté), ou `https://192.168.0.1` avec le HTTPS.                                            |
| Mot de passe local           | Le mot de passe de la page web. Après plusieurs essais erronés, le routeur bloque la connexion un moment.              |
| Nom d’utilisateur            | Laissez vide pour `admin`. Certains modèles EX attendent `user`.                                                       |
| Vérifier le certificat       | HTTPS seulement. Laissez décoché avec le certificat auto-signé du routeur.                                             |
| Intervalle de lecture (s)    | De 30 à 600 secondes, 60 par défaut.                                                                                   |
| Durée de la pause (min)      | Combien de temps la pause arrête les lectures. 20 par défaut.                                                          |
| Appareils du réseau proposés | Ceux qui ont un nom (par défaut), tous, ou aucun.                                                                      |
| Délai d’absence (min)        | Un appareil est absent après ce délai sans connexion. 5 par défaut : un téléphone en veille quitte le Wi-Fi un moment. |
| Langue des textes            | Noms, états et résumés des scènes. Automatique : la langue de votre tableau de bord, dès qu’un widget a été affiché.   |

Cliquez sur **Tester la connexion** : le modèle et le micrologiciel du routeur s’affichent. **Mettre les lectures en pause** et **Reprendre les lectures** libèrent la page web du routeur, puis reprennent la main. **Oublier les appareils connus** fait des appareils présents la référence du déclencheur « nouvel appareil ».

## Utilisation

### Appareils

Ouvrez **Découvrir** dans l’intégration et ajoutez les appareils voulus :

| Appareil           | Fonctionnalités                                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routeur TP-Link    | Utilisation CPU et mémoire (%), Internet, IP WAN, Internet connecté depuis (h), clients, clients Wi-Fi, clients filaires, clients invités, micrologiciel |
| Réseau Wi-Fi       | Un interrupteur : active ou coupe un réseau (principal, invité ou IoT) sur une bande                                                                     |
| Appareil du réseau | Présence : 1 tant qu’il est connecté, 0 une fois absent depuis le délai d’absence                                                                        |

Le CPU, la mémoire et la durée de connexion n’apparaissent que si le routeur les indique : tous les micrologiciels ne le font pas.

### Présence des appareils

Un appareil est présent dès que le routeur le liste, et absent une fois parti depuis le délai d’absence. Tant qu’il est présent, sa présence est renvoyée toutes les minutes, comme la présence Bluetooth de Gladys : l’action « vérifier la présence » d’une scène fonctionne avec. Donnez un nom aux téléphones dans le routeur (**Carte réseau > Clients**, ou dans l’application Tether) pour les retrouver facilement : par défaut, seuls les appareils qui ont un nom sont proposés.

### Réseaux Wi-Fi

Chaque réseau Wi-Fi indiqué par le routeur devient un interrupteur : le Wi-Fi principal, le Wi-Fi invité et le Wi-Fi IoT, un par bande (2,4, 5 et 6 GHz). Un réseau modifié depuis le routeur ou l’application Tether apparaît dans Gladys à la lecture suivante. Couper le Wi-Fi principal depuis Gladys coupe les appareils qui l’utilisent : mieux vaut que Gladys soit en filaire.

### Mettre les lectures en pause

Comme le routeur n’admet qu’un administrateur à la fois, sa page web vous déconnecte à chaque lecture. Avant de l’ouvrir, appuyez sur **Pause** dans le widget Routeur TP-Link (ou **Mettre les lectures en pause** dans la configuration) : Gladys arrête de lire pendant la durée de la pause, puis reprend toute seule. La présence est figée pendant ce temps : personne n’est marqué absent à cause de la pause.

### Widgets du tableau de bord

- **Routeur TP-Link** : jauges CPU et mémoire, clients connectés, invités, Internet, durée de connexion, micrologiciel, lectures, et deux boutons : **Pause** (ou **Reprendre**) et **Redémarrer** (avec confirmation).
- **Lien Internet** : durée de connexion, état, adresse WAN, passerelle, serveurs DNS, adresse IPv6.
- **Réseaux Wi-Fi** : chaque réseau et son état, et un bouton qui active ou coupe le Wi-Fi invité sur toutes les bandes (et de même pour le Wi-Fi IoT).
- **Appareils du réseau** : les appareils connectés en ce moment, ceux partis, ou tous, avec leur connexion (filaire, bande Wi-Fi, invité). Réglage : ce qu’il faut afficher.

### Scènes

Déclencheurs :

- **Internet coupé ou rétabli** : filtre sur l’état. Variables : état, IP WAN, résumé.
- **Adresse IP publique changée** : le fournisseur a donné une nouvelle adresse au routeur. Variables : nouvelle et ancienne adresse, résumé.
- **Appareil arrivé ou parti** : un appareil ajouté dans Gladys, ou n’importe lequel. Variables : nom, événement, MAC, IP, connexion, résumé.
- **Nouvel appareil sur le réseau** : une adresse MAC jamais vue, une seule fois (mémorisée entre les redémarrages). Filtres : Wi-Fi ou filaire, réseau principal, invité ou IoT.

Actions :

- **Lire l’état** : CPU, mémoire, Internet, IP WAN, durée de connexion, appareils présents, invités, modèle, micrologiciel, et un résumé pour un message.
- **Activer ou couper le Wi-Fi** : le Wi-Fi principal, invité ou IoT, sur une bande ou toutes.
- **Redémarrer le routeur** : le réseau et Internet sont coupés quelques minutes.

Exemples : quand un visiteur arrive (un bouton, un événement d’agenda), activer le Wi-Fi invité, et le couper à minuit ; quand l’adresse IP publique change, l’envoyer par message ; quand le téléphone d’un enfant arrive, allumer la lumière de l’entrée.

### Transport

Local uniquement : l’intégration parle à la page web du routeur sur votre réseau, rien ne passe par un cloud.

## Dépannage

- **« Le routeur refuse le mot de passe »** : saisissez à nouveau le mot de passe local (pas celui du TP-Link ID) ; l’intégration attend 15 minutes avant un nouvel essai, pour que le routeur ne bloque pas la connexion. Enregistrer la configuration réessaie tout de suite.
- **« Le routeur a bloqué la connexion »** : trop d’essais erronés (depuis Gladys ou un navigateur). Attendez le délai indiqué.
- **« ne répond pas comme la page web d’un routeur TP-Link ou Mercusys »** : vérifiez l’adresse ; le modèle utilise peut-être une autre page web (Deco, modèles 4G/5G).
- **« utilise une connexion que l’intégration ne connaît pas encore »** : ouvrez une issue avec le modèle, la version matérielle et le micrologiciel.
- **Déconnecté de la page web du routeur** : c’est la lecture de Gladys ; mettez d’abord les lectures en pause.
- **Un téléphone apparaît absent alors qu’il est là** : augmentez le délai d’absence ; certains téléphones mettent leur Wi-Fi en veille longtemps.
- **Journaux** : ouvrez les journaux de l’intégration dans Gladys, puis une issue sur [GitHub](https://github.com/William-De71/gladys-tplink-router/issues) avec les versions de Gladys et de l’intégration, le modèle et le micrologiciel du routeur, et les journaux (le mot de passe n’y apparaît jamais).
