# TP-Link / Mercusys Router

## Presentación

Esta integración trae un **router TP-Link o Mercusys** a Gladys: los routers Archer con la página web actual (Archer C6, AX, BE, GX…) y los routers Mercusys construidos sobre ella. Lee el router a través de su propia página web, en su red local, cada minuto:

- el **router**: uso de CPU y memoria, estado de Internet, dirección WAN, tiempo conectado, clientes conectados (Wi-Fi, por cable, invitados), firmware;
- sus **redes Wi-Fi** (principal, invitados e IoT, por banda), como interruptores;
- los **dispositivos de su red**, como sensores de presencia: saber quién está en casa gracias a los teléfonos conectados al Wi-Fi.

También aporta disparadores de escena (Internet caído o restablecido, IP pública cambiada, dispositivo llegó o se fue, nuevo dispositivo en la red), acciones de escena (leer el estado, activar o apagar redes Wi-Fi, reiniciar) y cuatro widgets de panel.

![Los cuatro widgets de la integración: vista general del router TP-Link, enlace a Internet, redes Wi-Fi y dispositivos de red (ilustración generada, no una captura de pantalla)](https://raw.githubusercontent.com/William-De71/gladys-tplink-router/main/docs/assets/widgets.es.png)

La imagen de arriba es una ilustración generada, no una captura de pantalla.

## Requisitos previos

- Gladys Assistant 5.3.0 o posterior.
- Un router TP-Link o Mercusys cuya página web muestre `/webpages/index.html` en la barra de direcciones. Se admiten cuatro variantes de inicio de sesión de esta página (la integración encuentra la buena). Los sistemas Deco (solo aplicación), los modelos 4G/5G con otra página web (Archer MR, TL-MR, EX, VR) y los routers antiguos (TL-WR841N, Archer C50) aún no se admiten.
- La **contraseña local** del router, la de su página web, no la contraseña de un TP-Link ID.
- Gladys debe llegar al router: su dirección en la red local (`192.168.0.1`, `192.168.1.1`, `tplinkwifi.net`). `https://` solo funciona si la **Gestión local vía HTTPS** está activada en el router.
- Conviene saberlo: la página web del router admite **un solo administrador a la vez**. Cada lectura inicia y cierra sesión, y le cierra la sesión de la página web si está abierta. Use la **pausa** (ver más abajo) antes de abrirla.

## Configuración

| Campo                         | Descripción                                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Dirección del router          | `192.168.0.1` (se añade http://), o `https://192.168.0.1` con HTTPS.                                                    |
| Contraseña local              | La contraseña de la página web. Tras varios intentos fallidos el router bloquea el inicio de sesión un rato.            |
| Nombre de usuario             | Déjelo vacío para `admin`. Algunos modelos EX esperan `user`.                                                           |
| Verificar el certificado      | Solo HTTPS. Déjelo sin marcar con el certificado autofirmado del router.                                                |
| Intervalo de lectura (s)      | De 30 a 600 segundos, 60 por defecto.                                                                                   |
| Duración de la pausa (min)    | Cuánto tiempo la pausa detiene las lecturas. 20 por defecto.                                                            |
| Dispositivos de red ofrecidos | Los que tienen nombre (por defecto), todos o ninguno.                                                                   |
| Retardo de ausencia (min)     | Un dispositivo está ausente tras este tiempo sin conexión. 5 por defecto: un teléfono en reposo sale del Wi-Fi un rato. |
| Idioma de los textos          | Nombres, estados y resúmenes de escenas. Automático: el idioma de su panel, en cuanto se haya mostrado un widget.       |

Haga clic en **Probar la conexión**: aparecen el modelo y el firmware del router. **Pausar las lecturas** y **Reanudar las lecturas** liberan la página web del router y luego retoman el control. **Olvidar dispositivos conocidos** convierte los dispositivos presentes en la referencia del disparador «nuevo dispositivo».

## Uso

### Dispositivos

Abra **Descubrir** en la integración y añada los dispositivos que quiera:

| Dispositivo        | Funciones                                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router TP-Link     | Uso de CPU y memoria (%), Internet, IP WAN, Internet conectado desde (h), clientes, clientes Wi-Fi, clientes por cable, clientes invitados, firmware |
| Red Wi-Fi          | Un interruptor: activa o apaga una red (principal, invitados o IoT) en una banda                                                                     |
| Dispositivo de red | Presencia: 1 mientras está conectado, 0 cuando lleva ausente el retardo de ausencia                                                                  |

La CPU, la memoria y el tiempo conectado solo aparecen si el router los indica: no todos los firmwares lo hacen.

### Presencia de los dispositivos

Un dispositivo está presente en cuanto el router lo lista, y ausente cuando lleva fuera el retardo de ausencia. Mientras está presente, su presencia se envía de nuevo cada minuto, como la presencia Bluetooth de Gladys: la acción «comprobar presencia» de una escena funciona con ella. Ponga nombre a los teléfonos en el router (**Mapa de red > Clientes**, o en la app Tether) para encontrarlos fácilmente: por defecto solo se ofrecen los dispositivos con nombre.

### Redes Wi-Fi

Cada red Wi-Fi que indica el router se convierte en un interruptor: el Wi-Fi principal, el de invitados y el IoT, uno por banda (2,4, 5 y 6 GHz). Una red cambiada desde el router o la app Tether aparece en Gladys en la siguiente lectura. Apagar el Wi-Fi principal desde Gladys desconecta los dispositivos que lo usan: mejor tener Gladys por cable.

### Pausar las lecturas

Como el router admite un solo administrador a la vez, su página web le cierra la sesión en cada lectura. Antes de abrirla, pulse **Pausa** en el widget Router TP-Link (o **Pausar las lecturas** en la configuración): Gladys deja de leer durante la duración de la pausa y luego retoma sola. La presencia queda congelada mientras tanto: nadie se marca ausente por la pausa.

### Widgets del panel

- **Router TP-Link**: indicadores de CPU y memoria, clientes conectados, invitados, Internet, tiempo conectado, firmware, lecturas y dos botones: **Pausa** (o **Reanudar**) y **Reiniciar** (con confirmación).
- **Enlace a Internet**: tiempo conectado, estado, dirección WAN, puerta de enlace, servidores DNS, dirección IPv6.
- **Redes Wi-Fi**: cada red y su estado, y un botón que activa o apaga el Wi-Fi de invitados en todas las bandas (y lo mismo para el Wi-Fi IoT).
- **Dispositivos de red**: los dispositivos conectados ahora, los que se fueron o todos, con su conexión (cable, banda Wi-Fi, invitado). Ajuste: qué mostrar.

### Escenas

Disparadores:

- **Internet caído o restablecido**: filtro por estado. Variables: estado, IP WAN, resumen.
- **IP pública cambiada**: el proveedor dio una nueva dirección al router. Variables: dirección nueva y anterior, resumen.
- **Dispositivo llegó o se fue**: un dispositivo añadido en Gladys, o cualquiera. Variables: nombre, evento, MAC, IP, conexión, resumen.
- **Nuevo dispositivo en la red**: una dirección MAC nunca vista, una sola vez (recordada entre reinicios). Filtros: Wi-Fi o cable, red principal, de invitados o IoT.

Acciones:

- **Leer el estado**: CPU, memoria, Internet, IP WAN, tiempo conectado, dispositivos presentes, invitados, modelo, firmware y un resumen para un mensaje.
- **Activar o apagar el Wi-Fi**: el Wi-Fi principal, de invitados o IoT, en una banda o en todas.
- **Reiniciar el router**: la red e Internet se cortan unos minutos.

Ejemplos: cuando llega una visita (un botón, un evento de calendario), activar el Wi-Fi de invitados y apagarlo a medianoche; cuando cambia la IP pública, enviarla por mensaje; cuando llega el teléfono de un niño, encender la luz de la entrada.

### Transporte

Solo local: la integración habla con la página web del router en su red, nada pasa por una nube.

## Solución de problemas

- **«El router rechaza la contraseña»**: vuelva a escribir la contraseña local (no la del TP-Link ID); la integración espera 15 minutos antes de un nuevo intento, para que el router no bloquee el inicio de sesión. Guardar la configuración lo intenta enseguida.
- **«El router bloqueó el inicio de sesión»**: demasiados intentos fallidos (desde Gladys o un navegador). Espere el tiempo indicado.
- **«no responde como la página web de un router TP-Link o Mercusys»**: compruebe la dirección; quizá el modelo usa otra página web (Deco, modelos 4G/5G).
- **«usa un inicio de sesión que la integración aún no conoce»**: abra una issue con el modelo, la versión de hardware y el firmware.
- **Sesión cerrada en la página web del router**: es la lectura de Gladys; pause primero las lecturas.
- **Un teléfono aparece ausente estando en casa**: aumente el retardo de ausencia; algunos teléfonos ponen su Wi-Fi en reposo mucho tiempo.
- **Registros**: abra los registros de la integración en Gladys y luego una issue en [GitHub](https://github.com/William-De71/gladys-tplink-router/issues) con las versiones de Gladys y de la integración, el modelo y el firmware del router, y los registros (la contraseña nunca aparece en ellos).
