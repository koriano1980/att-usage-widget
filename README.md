# Widget de consumo AT&T (Estados Unidos) para iPhone

Widget de [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) que muestra tus datos de **AT&T en Estados Unidos** (prepago o pospago): GB disponibles, porcentaje usado, total del plan y días de vigencia.

Estilo inspirado en los widgets del post de Facebook (tarjeta oscura, GB grandes y barra de puntos). **Este repositorio es para AT&T US**, no para BAIT ni AT&T México.

## Lo importante, sin rodeos

No puedo instalar el widget en tu iPhone desde aquí: Apple no deja que un agente instale apps ni widgets en un iPhone de forma remota. El camino más corto está abajo (un copiar y pegar después de instalar Scriptable).

**AT&T de Estados Unidos no tiene una API pública de consumidor** para consultar el consumo de datos en vivo (lo confirmé en la documentación de soporte y en el programa de desarrolladores). Por eso el widget del post de México sí puede consultar BAIT/AT&T México solo, y este de AT&T US no puede hacer lo mismo en segundo plano.

Los datos del widget **no son un dibujo fijo**. Salen de una consulta real, por uno de estos caminos oficiales:

1. **El más fiable:** marca `*777#` si eres **prepago**, o `*3282#` (`*DATA#`) si eres **pospago**. AT&T te manda un SMS con el consumo. Pégalo en el script (o mándalo con un Atajo). Fuentes oficiales:
   - Prepago: [Check your AT&T Prepaid usage](https://www.att.com/support/article/wireless/KM1048283/)
   - Pospago: [Star Services](https://www.att.com/support/article/my-account/KM1051617/) (`*3282#` / `*3286#` en español)
2. **myAT&T en el navegador oficial:** el script abre [att.com/signin](https://www.att.com/signin). Entras tú (con 2FA si te lo pide). Si la página muestra el consumo, el script intenta leerlo. Si AT&T no deja verlo en esa sesión, te pide el SMS. No se evaden captchas ni protecciones.
3. La app oficial [AT&T](https://apps.apple.com/us/app/at-t/id309172177) también muestra el consumo en vivo, pero no encontré un widget oficial de pantalla de inicio para esos mismos números.

El recuadro de la pantalla de inicio guarda la **última consulta real**. iOS no permite iniciar sesión de AT&T en segundo plano, así que para refrescar tocas el widget.

## Instalación en el iPhone (lo más corto)

### 1. Instala Scriptable (gratis)

[Scriptable en el App Store](https://apps.apple.com/app/scriptable/id1405459188)

### 2. Importa el widget (un copiar y pegar)

1. En el **iPhone**, abre el código crudo:
   **[att-usage-widget.js](https://raw.githubusercontent.com/koriano1980/att-usage-widget/main/att-usage-widget.js)**
2. Toca el texto, **Seleccionar todo** y **Copiar**.
3. Abre **Scriptable**, pulsa **+**, borra lo que haya, **pega** el código.
4. Toca el título (*Untitled Script*) y nómbralo exactamente **`ATT Usage`**.
5. Pulsa **Done**.
6. Abre el script y pulsa **Play (▶)**. Elige Prepago o Pospago y actualiza con el SMS o con myAT&T.

Si prefieres un instalador corto: crea un script vacío llamado `Instalar ATT Usage`, pega el contenido de [`instalar-att-usage.js`](https://raw.githubusercontent.com/koriano1980/att-usage-widget/main/instalar-att-usage.js) y pulsa Play. Ese script descarga este repositorio y crea `ATT Usage` por ti.

### 3. Ponlo en la pantalla de inicio

1. Mantén pulsada un área vacía de la pantalla de inicio.
2. Pulsa **+**, busca **Scriptable**, elige tamaño **pequeño** o **mediano** y agrégalo.
3. En **Script**, elige **ATT Usage**.
4. En **When Interacting / Al interactuar**, elige **Run Script**.

## Atajos de iOS (actualizar sin reescribir el script)

Puedes crear un Atajo que pase el SMS o los números al widget:

```
scriptable:///run/ATT%20Usage?sms=AQUI_EL_TEXTO_DEL_SMS
```

O con números ya leídos:

```
scriptable:///run/ATT%20Usage?remaining=1.58&total=15&used=13.42&days=11
```

Esos valores también se consideran datos reales si los sacas del SMS o de myAT&T, no inventados.

## El repositorio del post de BAIT / AT&T México

El post del grupo *Claude Code en Español* (autor “Juanda”) **no tiene un repositorio público a su nombre** que yo haya podido encontrar. En los comentarios preguntaban “tienes github?”, lo que encaja con que aún no lo hubiera publicado.

El repositorio público más cercano, verificado, es:

- [amaynez/telcel-widget-agy](https://github.com/amaynez/telcel-widget-agy) — widgets Scriptable / WidgetKit de consumo en vivo para **Telcel, BAIT, Movistar y AT&T México** (no Estados Unidos). BAIT consulta por número; AT&T México usa el portal `miattweb.att.com.mx`. Licencia no declarada en GitHub al momento de esta nota. No es el repo de Juanda, pero es el que más se parece y sí funciona en línea para esas operadoras de México.

Otros proyectos de AT&T US (viejos o de otro tema, no son un widget de iPhone listo):

- [alexisv/att-data-usage-scraper](https://github.com/alexisv/att-data-usage-scraper) — scraper de 2014, probablemente roto.
- [michaelkinison/ATT-hotspot-data-usage](https://github.com/michaelkinison/ATT-hotspot-data-usage) — scraper de 2022 para un hotspot prepago.
- [edwork/Parse-ATT-Data-SMS](https://github.com/edwork/Parse-ATT-Data-SMS) — parsea el SMS de consumo de AT&T (la misma idea oficial que usa este widget).

## Limitaciones

- No instalo el widget por ti en el iPhone: hay que dar los pasos de arriba en el aparato.
- No hay un método desatendido y estable para que el widget de AT&T US se actualice solo cada pocos minutos, porque no existe esa API pública y el login de myAT&T usa 2FA.
- El WebView de myAT&T puede no devolver el consumo si AT&T muestra un captcha, una pasarela de 2FA o una página sin cifras. En ese caso usa el SMS oficial.
