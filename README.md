# 🃏 České Žolíky Online (Multiplayer pro Mobil, iPad i PC)

Moderní webová multiplayerová verze tradiční české karetní hry **Žolíky**, optimalizovaná pro dotykové telefony, tablety (iPad/Android) i počítače.

---

## 🏫 Hraní ve škole na Eduroam nebo přes mobilní data

Školní síť **Eduroam má z bezpečnostních důvodů zapnutou tzv. AP izolaci (Client Isolation)** — to znamená, že zařízení připojená na Eduroam se navzájem nevidí na lokální IP adrese (např. mobil se nemůže připojit na IP notebooku).

Pro hraní na Eduroamu máte **2 jednoduchá řešení**:

### Možnost A: 🌐 Příkaz `npm run online` (Doporučeno pro Eduroam)
Spustí server i bezplatný zabezpečený Cloudflare tunel přímo v projektu:
```bash
npm run online
```
V terminálu se vám hned zobrazí veřejný zabezpečený odkaz (např. `https://random-slovo.trycloudflare.com`).
👉 **Tento odkaz pošlete spolužákům přes Messenger / WhatsApp / AirDrop, nebo si ho otevřou na mobilu a iPadu.** Projde přes jakýkoliv školní firewall a Eduroam!

### Možnost B: 📱 Osobní hotspot z mobilu (Bez internetu / bez tunelu)
1. Kdokoliv z vás zapne na iPhonu / Androidu **Osobní hotspot**.
2. Notebook, mobily i iPady se připojí k tomuto hotspotu.
3. Spusťte `npm start` a zadejte lokální IP adresu zobrazenou v terminálu.
4. Na hotspotu žádná Eduroam izolace není — vše funguje okamžitě a spotřeba mobilních dat je zanedbatelná (karty přenášejí jen pár kilobajtů textu).

---

## 🚀 Jak hru spustit doma na Wi-Fi

### 1. Spuštění serveru

V kořenové složce projektu stačí spustit:

```bash
npm install
npm run build
npm start
```

Server se spustí a v terminálu uvidíte:
- **Na počítači / notebooku:** `http://localhost:3000`
- **Na mobilu / iPadu (na stejné Wi-Fi):** `http://<Vase-Lokalni-IP>:3000` (např. `http://192.168.1.15:3000`)

---

## 📱 Jak se připojit z mobilu nebo iPadu

1. Otevřete hru na libovolném zařízení (např. notebooku) a klikněte na **"Vytvořit novou hru"**.
2. V lobby uvidíte:
   - **4místný kód místnosti** (např. `A8FZ`), který stačí na telefonu zadat v poli "Kód místnosti".
   - **Tlačítko "Kopírovat odkaz"** – pošle přímý odkaz kamarádům přes WhatsApp, Messenger nebo SMS.
   - **Tlačítko "QR kód"** – zobrazí velký QR kód. Stačí na něj namířit fotoaparát iPhonu / iPadu / Androidu a okamžitě se připojíte do stejné místnosti!

---

## 🌟 Hlavní funkce hry

- **Kompletní česká pravidla Žolíků**:
  - Hraje se se dvěma balíčky kanastových karet (celkem 108 karet včetně 4 žolíků).
  - První vyložení vyžaduje minimálně **42 bodů** a alespoň jednu **čistou postupku** (bez žolíka).
  - Možnost volby v nastavení lobby: Standardní pravidla (42 bodů), zrychlená hra (30 bodů), nebo bez minima.
  - Výměna žolíka na stole za příslušnou kartu z ruky (*"vyfouknutí žolíka"*).
  - Přikládání ke kterýmkoliv kombinacím na stole po prvním vyložení.
  - Zavření z ruky (*Žolík z ruky*) – dvojnásobné trestné body pro soupeře!
  - Započítávání bodů po každém kole a průběžná tabulka turnaje.
- **Inteligentní AI Boti**:
  - Můžete trénovat sólo nebo doplnit chybějící hráče do místnosti jedním kliknutím na tlačítko *"Přidat bota"*.
- **Optimalizováno pro dotyk**:
  - Zvýraznění karet při klepnutí, okamžitý výpočet bodů vybraných karet v reálném čase.
  - Automatické řazení karet v ruce: **Podle barev** (♥, ♦, ♣, ♠) nebo **Podle hodnot** (2, 3 ... K, A, Žolíky).
- **Vestavěný herní chat & rychlé reakce**:
  - Posílání reakčních emoji (🃏, 🔥, 👏, 😂, 😭) i textových zpráv.
- **Syntetizované zvukové efekty**:
  - Šustění karet, položení na stůl, cinknutí při vyložení a fanfára vítěze (funguje i offline bez externích souborů).

---

## 🌐 Hraní přes internet (mimo domácí Wi-Fi)

Pokud chcete hrát s kamarády, kteří nejsou u vás na stejné Wi-Fi, můžete hru snadno vystavit na internet jedním z těchto způsobů:

1. **ngrok nebo Cloudflare Tunnel (zdarma za 1 minutu):**
   ```bash
   npx ngrok http 3000
   ```
   Ngrok vám vygeneruje veřejný odkaz (např. `https://abc-123.ngrok-free.app`), který pošlete komukoliv na světě.

2. **Bezplatný hosting (Render.com / Railway / Fly.io):**
   - Nahrajte repozitář na GitHub.
   - Na [Render.com](https://render.com) vytvořte novou Web Service.
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Získáte trvalý odkaz `https://moje-zoliky.onrender.com`.

